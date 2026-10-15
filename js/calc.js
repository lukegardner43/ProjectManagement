// Business rules: how fees, WIP, forecasts and utilisation are worked out.
// Pure functions of the state object, so they can be unit tested in Node.
//
// Definitions used everywhere in the app:
//   Time value  = hours × the person's charge rate
//   Cost        = hours × the person's cost rate, plus approved project expenses
//   Earned      = fixed-fee stage: fee × % complete
//                 time-and-materials stage: time value
//                 plus approved chargeable expenses on the project
//   Invoiced    = net value of invoices that are not drafts
//   WIP         = earned − invoiced (negative means billed in advance)

import { sum, addMonths, monthKey, monthStart, monthEnd, workingDays, addDays, daysBetween } from './util.js';

export const OPEN_STAGES = ['Lead', 'Qualified', 'Proposal'];
export const OPP_STAGES = [...OPEN_STAGES, 'Won', 'Lost'];
export const PROJECT_STATUSES = ['Enquiry', 'Live', 'On hold', 'Complete', 'Lost'];
export const BILLING_STATUSES = ['Live', 'On hold'];

const key = (projectId, stageId) => `${projectId}|${stageId}`;

// Indexes built once per render and shared by every calculation in it.
export function makeCtx(state) {
  const staff = new Map(state.staff.map((s) => [s.id, s]));
  const projects = new Map(state.projects.map((p) => [p.id, p]));
  const time = new Map();
  for (const e of state.timesheets) {
    const s = staff.get(e.staffId);
    if (!s) continue;
    const k = key(e.projectId, e.stageId);
    const r = time.get(k) || { hours: 0, value: 0, cost: 0 };
    r.hours += e.hours;
    r.value += e.hours * s.chargeRate;
    r.cost += e.hours * s.costRate;
    time.set(k, r);
  }
  const invoiced = new Map();
  for (const inv of state.invoices) {
    if (inv.status === 'Draft') continue;
    for (const l of inv.lines) {
      const k = key(inv.projectId, l.stageId);
      invoiced.set(k, (invoiced.get(k) || 0) + l.amount);
    }
  }
  const expenses = new Map();
  for (const x of state.expenses) {
    if (!x.projectId || !['Approved', 'Paid'].includes(x.status)) continue;
    const r = expenses.get(x.projectId) || { total: 0, chargeable: 0 };
    r.total += x.amount;
    if (x.chargeable) r.chargeable += x.amount;
    expenses.set(x.projectId, r);
  }
  return { staff, projects, time, invoiced, expenses };
}

export function stageFinancials(project, stage, ctx) {
  const t = ctx.time.get(key(project.id, stage.id)) || { hours: 0, value: 0, cost: 0 };
  const invoiced = ctx.invoiced.get(key(project.id, stage.id)) || 0;
  const earned = stage.feeType === 'T&M' ? t.value : (stage.fee * (stage.percentComplete || 0)) / 100;
  return {
    hours: t.hours,
    timeValue: t.value,
    cost: t.cost,
    earned,
    invoiced,
    wip: earned - invoiced,
    hoursUsed: stage.budgetHours ? t.hours / stage.budgetHours : 0,
  };
}

export function projectFinancials(project, ctx) {
  const stages = project.stages.map((st) => ({ stage: st, ...stageFinancials(project, st, ctx) }));
  const exp = ctx.expenses.get(project.id) || { total: 0, chargeable: 0 };
  const expInvoiced = ctx.invoiced.get(key(project.id, 'expenses')) || 0;
  const fee = sum(project.stages, (s) => s.fee);
  const fixedFee = sum(project.stages.filter((s) => s.feeType !== 'T&M'), (s) => s.fee);
  const fixedEarned = sum(stages.filter((s) => s.stage.feeType !== 'T&M'), (s) => s.earned);
  const budgetHours = sum(project.stages, (s) => s.budgetHours);
  const hours = sum(stages, (s) => s.hours);
  const earned = sum(stages, (s) => s.earned) + exp.chargeable;
  const invoiced = sum(stages, (s) => s.invoiced) + expInvoiced;
  const cost = sum(stages, (s) => s.cost) + exp.total;
  return {
    stages,
    fee,
    budgetHours,
    hours,
    timeValue: sum(stages, (s) => s.timeValue),
    earned,
    invoiced,
    wip: earned - invoiced,
    cost,
    profit: earned - cost,
    margin: earned > 0 ? (earned - cost) / earned : null,
    // Progress is measured on fixed-fee work; T&M stages have no fixed end.
    percentComplete: fixedFee > 0 ? fixedEarned / fixedFee : null,
    hoursUsed: budgetHours > 0 ? hours / budgetHours : null,
    expenses: exp,
    expensesUninvoiced: exp.chargeable - expInvoiced,
    feeRemaining: fee - invoiced + expInvoiced,
  };
}

// A project is flagged when it has used noticeably more of its hours budget
// than it has earned of its fixed fee.
export function projectFlags(fin) {
  const flags = [];
  if (fin.hoursUsed !== null && fin.percentComplete !== null && fin.hoursUsed - fin.percentComplete > 0.1) {
    flags.push({ kind: 'serious', label: `Hours ${Math.round(fin.hoursUsed * 100)}% used vs ${Math.round(fin.percentComplete * 100)}% complete` });
  }
  if (fin.hoursUsed !== null && fin.hoursUsed > 1) flags.push({ kind: 'critical', label: 'Over hours budget' });
  if (fin.margin !== null && fin.margin < 0) flags.push({ kind: 'critical', label: 'Loss-making to date' });
  return flags;
}

// ── Invoices ────────────────────────────────────────────────────────────────

export const invoiceNet = (inv) => sum(inv.lines, (l) => l.amount);
export const invoiceVat = (inv) => (invoiceNet(inv) * (inv.vatRate ?? 20)) / 100;
export const invoiceGross = (inv) => invoiceNet(inv) + invoiceVat(inv);

// 'Overdue' is derived, never stored: a sent invoice past its due date.
export function invoiceDisplayStatus(inv, today) {
  if (inv.status === 'Sent' && inv.dueDate < today) return 'Overdue';
  return inv.status;
}

export function agedDebt(state, today) {
  const buckets = [
    { label: 'Not yet due', min: -Infinity, max: 0 },
    { label: '1–30 days', min: 1, max: 30 },
    { label: '31–60 days', min: 31, max: 60 },
    { label: '61–90 days', min: 61, max: 90 },
    { label: 'Over 90 days', min: 91, max: Infinity },
  ].map((b) => ({ ...b, total: 0, invoices: [] }));
  for (const inv of state.invoices) {
    if (inv.status !== 'Sent') continue;
    const late = daysBetween(inv.dueDate, today);
    const b = buckets.find((x) => late >= x.min && late <= x.max);
    b.total += invoiceGross(inv);
    b.invoices.push(inv);
  }
  return buckets;
}

// ── Sales ───────────────────────────────────────────────────────────────────

export const inRange = (d, range) => !!d && d >= range.start && d <= range.end;

export function salesWon(state, range, officeId) {
  return state.opportunities.filter(
    (o) => o.stage === 'Won' && inRange(o.wonDate, range) && (!officeId || o.officeId === officeId),
  );
}

export function pipelineTotals(opps) {
  const open = opps.filter((o) => OPEN_STAGES.includes(o.stage));
  return {
    count: open.length,
    value: sum(open, (o) => o.value),
    weighted: sum(open, (o) => (o.value * o.probability) / 100),
  };
}

// The combined invoice and forecast calendar, one row per month:
//   invoiced   non-draft invoices dated in the month
//   scheduled  planned billing on live and on-hold projects, this month onwards
//   pipeline   open opportunities × probability, spread evenly over their
//              expected duration from the expected decision month
export function forecastCalendar(state, months, today, officeId) {
  const thisMonth = monthKey(today);
  const projects = new Map(state.projects.map((p) => [p.id, p]));
  const inOffice = (p) => !officeId || p?.officeId === officeId;
  const rows = new Map(months.map((m) => [m, { month: m, invoiced: 0, scheduled: 0, pipeline: 0 }]));

  for (const inv of state.invoices) {
    if (inv.status === 'Draft' || !inOffice(projects.get(inv.projectId))) continue;
    const r = rows.get(monthKey(inv.date));
    if (r) r.invoiced += invoiceNet(inv);
  }
  for (const p of state.projects) {
    if (!BILLING_STATUSES.includes(p.status) || !inOffice(p)) continue;
    for (const s of p.invoiceSchedule || []) {
      const r = rows.get(s.month);
      if (r && s.month >= thisMonth) r.scheduled += s.amount;
    }
  }
  for (const o of state.opportunities) {
    if (!OPEN_STAGES.includes(o.stage) || (officeId && o.officeId !== officeId)) continue;
    const n = Math.max(1, o.durationMonths || 6);
    let first = monthKey(o.expectedDate || today);
    if (first < thisMonth) first = thisMonth;
    const perMonth = (o.value * o.probability) / 100 / n;
    for (let i = 0; i < n; i++) {
      const r = rows.get(addMonths(first, i));
      if (r) r.pipeline += perMonth;
    }
  }
  return [...rows.values()];
}

// ── Time, leave and capacity ────────────────────────────────────────────────

export function weekDates(weekStartISO) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStartISO, i));
}

export function weekSubmission(state, staffId, weekStartISO) {
  return state.timesheetWeeks.find((w) => w.staffId === staffId && w.weekStart === weekStartISO) || null;
}

export const weekStatus = (state, staffId, ws) => weekSubmission(state, staffId, ws)?.status || 'Draft';

// Working days of approved leave that fall between from and to (inclusive).
export function leaveDays(state, staffId, from, to) {
  let days = 0;
  for (const l of state.leave) {
    if (l.staffId !== staffId || l.status !== 'Approved') continue;
    const a = l.start > from ? l.start : from;
    const b = l.end < to ? l.end : to;
    if (a > b) continue;
    const d = workingDays(a, b);
    // A half day only makes sense on a one-day request.
    days += l.halfDay && l.start === l.end ? d * 0.5 : d;
  }
  return days;
}

export function capacity(state, person, from, to) {
  const perDay = (person.weeklyHours ?? 37.5) / 5;
  return Math.max(0, (workingDays(from, to) - leaveDays(state, person.id, from, to)) * perDay);
}

export function utilisation(state, people, from, to) {
  const internal = new Set(state.projects.filter((p) => p.internal).map((p) => p.id));
  const ids = new Set(people.map((p) => p.id));
  const by = new Map(people.map((p) => [p.id, { person: p, hours: 0, chargeable: 0, capacity: capacity(state, p, from, to) }]));
  for (const e of state.timesheets) {
    if (!ids.has(e.staffId) || e.date < from || e.date > to) continue;
    const r = by.get(e.staffId);
    r.hours += e.hours;
    if (!internal.has(e.projectId)) r.chargeable += e.hours;
  }
  return [...by.values()].map((r) => ({ ...r, utilisation: r.capacity > 0 ? r.chargeable / r.capacity : null }));
}

export function allocatedHours(state, staffId, weekStartISO, projectId) {
  return sum(
    state.allocations.filter((a) => a.staffId === staffId && a.weekStart === weekStartISO && (!projectId || a.projectId === projectId)),
    (a) => a.hours,
  );
}

export function weekCapacity(state, person, weekStartISO) {
  return capacity(state, person, weekStartISO, addDays(weekStartISO, 6));
}

// ── Leave allowance ─────────────────────────────────────────────────────────

export function leaveBalance(state, person, range) {
  const mine = state.leave.filter((l) => l.staffId === person.id && l.type === 'Annual leave');
  const days = (l) => {
    const a = l.start > range.start ? l.start : range.start;
    const b = l.end < range.end ? l.end : range.end;
    if (a > b) return 0;
    const d = workingDays(a, b);
    return l.halfDay && l.start === l.end ? d * 0.5 : d;
  };
  const approved = sum(mine.filter((l) => l.status === 'Approved'), days);
  const requested = sum(mine.filter((l) => l.status === 'Requested'), days);
  const allowance = person.leaveAllowance ?? 25;
  return { allowance, approved, requested, remaining: allowance - approved - requested };
}

export { monthStart, monthEnd };
