// Looking ahead: staffing demand against capacity, what to invoice and chase,
// when cash will land, revenue recognised by month, portfolios, and who is
// free with the right skills. Pure functions of state, unit tested.

import { sum, addDays, monthKey, monthStart, monthEnd, isWeekday, workingDays, daysBetween, groupBy } from './util.js';
import * as C from './calc.js';
import { costEstimate, stageEnd } from './estimate.js';

// Split `hours` across the months of [from, to] in proportion to working days.
export function spreadByMonth(hours, from, to, into) {
  const days = workingDays(from, to);
  if (!days || !hours) return into;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!isWeekday(d)) continue;
    const m = monthKey(d);
    into.set(m, (into.get(m) || 0) + hours / days);
  }
  return into;
}

// ── Staffing forecast ───────────────────────────────────────────────────────
// Demand by grade and month from (1) the hours left on live project stages,
// spread over each stage's remaining dates, and (2) open opportunities that
// have a fee estimate, weighted by probability, from their expected start.
// Capacity is contracted hours less approved leave, at the target utilisation.

export function staffingForecast(state, months, today, { ctx = C.makeCtx(state), utilisationTarget = state.settings.utilisationTarget ?? 0.8 } = {}) {
  const people = state.staff.filter((s) => s.billable && s.active !== false);
  const grades = [...new Set(people.map((p) => p.grade))];
  const order = Object.keys(state.rateCards?.[0]?.rates || {});
  grades.sort((a, b) => ((order.indexOf(a) + 1) || 99) - ((order.indexOf(b) + 1) || 99));
  const rows = new Map(grades.map((g) => [g, { grade: g, live: new Map(), pipeline: new Map(), capacity: new Map() }]));
  const add = (map, g, m, h) => { if (rows.has(g)) map(rows.get(g)).set(m, (map(rows.get(g)).get(m) || 0) + h); };
  const first = months[0]; const last = months[months.length - 1];
  const inWindow = (m) => m >= first && m <= last;

  const split = (byGrade, fallbackGrades) => {
    const entries = Object.entries(byGrade || {}).filter(([, h]) => h > 0);
    const tot = sum(entries, ([, h]) => h);
    if (tot > 0) return entries.map(([g, h]) => [g, h / tot]);
    return fallbackGrades.length ? fallbackGrades.map((g) => [g, 1 / fallbackGrades.length]) : [];
  };

  for (const p of state.projects) {
    if (p.internal || p.status !== 'Live') continue;
    const teamGrades = p.team.map((id) => ctx.staff.get(id)?.grade).filter((g) => rows.has(g));
    for (const st of p.stages) {
      if (!st.startDate) continue;
      const done = C.stageFinancials(p, st, ctx).hours;
      const remaining = Math.max(0, (st.budgetHours || 0) - done);
      if (!remaining || (st.feeType !== 'T&M' && st.percentComplete >= 100)) continue;
      let from = st.startDate > today ? st.startDate : today;
      let to = stageEnd(st);
      if (to < from) to = addDays(from, 27); // overdue work: assume it lands in the next four weeks
      for (const [g, share] of split(st.hoursByGrade, teamGrades)) {
        for (const [m, h] of spreadByMonth(remaining * share, from, to, new Map())) if (inWindow(m)) add((r) => r.live, g, m, h);
      }
    }
  }

  for (const o of state.opportunities) {
    if (!C.OPEN_STAGES.includes(o.stage) || !o.estimateId) continue;
    const est = (state.estimates || []).find((e) => e.id === o.estimateId);
    if (!est) continue;
    const start = o.expectedDate && o.expectedDate > today ? addDays(o.expectedDate, 14) : addDays(today, 14);
    const c = costEstimate(state, { ...est, startDate: start });
    for (const s of c.stages) {
      for (const [g, share] of split(s.hours, [])) {
        for (const [m, h] of spreadByMonth(s.totalHours * share * (o.probability / 100), s.start, s.end, new Map())) if (inWindow(m)) add((r) => r.pipeline, g, m, h);
      }
    }
  }

  for (const m of months) {
    for (const person of people) add((r) => r.capacity, person.grade, m, C.capacity(state, person, monthStart(m), monthEnd(m)) * utilisationTarget);
  }

  const out = [...rows.values()].map((r) => ({
    grade: r.grade,
    months: months.map((m) => {
      const live = r.live.get(m) || 0; const pipeline = r.pipeline.get(m) || 0; const cap = r.capacity.get(m) || 0;
      return { month: m, live, pipeline, demand: live + pipeline, capacity: cap, gap: cap - live - pipeline };
    }),
  }));
  const total = months.map((m, i) => {
    const live = sum(out, (r) => r.months[i].live); const pipeline = sum(out, (r) => r.months[i].pipeline); const cap = sum(out, (r) => r.months[i].capacity);
    return { month: m, live, pipeline, demand: live + pipeline, capacity: cap, gap: cap - live - pipeline };
  });
  return { rows: out, total, utilisationTarget };
}

// ── Getting paid ────────────────────────────────────────────────────────────

// How each client really pays: average days from invoice to payment and
// how late against terms, over paid invoices.
export function clientPayStats(state) {
  const projects = new Map(state.projects.map((p) => [p.id, p]));
  const out = new Map();
  for (const inv of state.invoices) {
    if (inv.status !== 'Paid' || !inv.paidDate) continue;
    const clientId = projects.get(inv.projectId)?.clientId;
    if (!clientId) continue;
    const r = out.get(clientId) || { count: 0, days: 0, late: 0 };
    r.count++;
    r.days += daysBetween(inv.date, inv.paidDate);
    r.late += daysBetween(inv.dueDate, inv.paidDate);
    out.set(clientId, r);
  }
  for (const r of out.values()) { r.avgDays = r.days / r.count; r.avgLate = r.late / r.count; }
  return out;
}

// Expected payment date: invoice date plus the client's usual days to pay,
// once there are at least two paid invoices to go on; otherwise the due date.
// Anything already past that date is expected within a week.
export function predictedPayDate(inv, clientId, stats, today) {
  const s = stats.get(clientId);
  let d = s && s.count >= 2 ? addDays(inv.date, Math.round(s.avgDays)) : inv.dueDate;
  if (d < today) d = addDays(today, 7);
  return d;
}

export function billingActions(state, today, ctx = C.makeCtx(state)) {
  const thisMonth = monthKey(today);
  const stats = clientPayStats(state);
  const raise = [];
  for (const p of state.projects) {
    if (p.internal || !C.BILLING_STATUSES.includes(p.status)) continue;
    const f = C.projectFinancials(p, ctx);
    const planned = sum((p.invoiceSchedule || []).filter((x) => x.month === thisMonth), (x) => x.amount);
    const invoicedThisMonth = sum(state.invoices.filter((i) => i.projectId === p.id && i.status !== 'Draft' && monthKey(i.date) === thisMonth), C.invoiceNet);
    const drafted = state.invoices.some((i) => i.projectId === p.id && i.status === 'Draft');
    if ((f.wip >= 500 || planned - invoicedThisMonth >= 500) && !drafted) {
      raise.push({ project: p, wip: f.wip, planned, invoicedThisMonth, suggested: Math.max(f.wip, planned - invoicedThisMonth) });
    }
  }
  const clientOf = (inv) => ctx.projects.get(inv.projectId)?.clientId;
  return {
    raise: raise.sort((a, b) => b.suggested - a.suggested),
    approve: state.invoices.filter((i) => i.status === 'Draft'),
    send: state.invoices.filter((i) => i.status === 'Approved'),
    chase: state.invoices.filter((i) => i.status === 'Sent' && i.dueDate < today)
      .map((inv) => ({ inv, daysLate: daysBetween(inv.dueDate, today), usual: stats.get(clientOf(inv)) || null }))
      .sort((a, b) => b.daysLate - a.daysLate),
  };
}

// Clients who habitually pay late, or have something long overdue now.
export function riskyPayers(state, today) {
  const stats = clientPayStats(state);
  const projects = new Map(state.projects.map((p) => [p.id, p]));
  const overdueBy = new Map();
  for (const inv of state.invoices) {
    if (inv.status !== 'Sent' || inv.dueDate >= today) continue;
    const c = projects.get(inv.projectId)?.clientId;
    const r = overdueBy.get(c) || { amount: 0, maxDays: 0 };
    r.amount += C.invoiceGross(inv);
    r.maxDays = Math.max(r.maxDays, daysBetween(inv.dueDate, today));
    overdueBy.set(c, r);
  }
  const ids = new Set([...stats.keys(), ...overdueBy.keys()]);
  return [...ids].map((clientId) => ({ clientId, stats: stats.get(clientId) || null, overdue: overdueBy.get(clientId) || null }))
    .filter((r) => (r.stats && r.stats.count >= 2 && r.stats.avgLate > 10) || (r.overdue && r.overdue.maxDays > 45))
    .sort((a, b) => (b.overdue?.amount || 0) - (a.overdue?.amount || 0));
}

// Cash expected in each month (gross of VAT): unpaid invoices at their
// predicted payment date, plus planned billing paid at the client's usual pace.
export function cashForecast(state, months, today) {
  const stats = clientPayStats(state);
  const projects = new Map(state.projects.map((p) => [p.id, p]));
  const vat = (state.settings.vatRate ?? 20) / 100;
  const rows = new Map(months.map((m) => [m, { month: m, invoices: 0, planned: 0 }]));
  for (const inv of state.invoices) {
    if (!['Sent', 'Approved'].includes(inv.status)) continue;
    const r = rows.get(monthKey(predictedPayDate(inv, projects.get(inv.projectId)?.clientId, stats, today)));
    if (r) r.invoices += C.invoiceGross(inv);
  }
  const thisMonth = monthKey(today);
  for (const p of state.projects) {
    if (!C.BILLING_STATUSES.includes(p.status)) continue;
    const s = stats.get(p.clientId);
    const lag = s && s.count >= 2 ? Math.round(s.avgDays) : state.settings.paymentTermsDays ?? 30;
    for (const x of p.invoiceSchedule || []) {
      if (x.month < thisMonth) continue;
      const r = rows.get(monthKey(addDays(monthEnd(x.month), lag)));
      if (r) r.planned += x.amount * (1 + vat);
    }
  }
  return [...rows.values()];
}

// ── Revenue recognised by month ─────────────────────────────────────────────
// Time-and-materials stages recognise the value of time booked in the month.
// Fixed-fee stages recognise their earned value (fee × % complete) in step
// with the hours booked each month. Rechargeable expenses count when incurred.

export function revenueByMonth(state, months, ctx = C.makeCtx(state)) {
  const set = new Set(months);
  const out = new Map(); // projectId -> Map(month -> amount)
  const addTo = (pid, m, v) => {
    if (!set.has(m) || !v) return;
    if (!out.has(pid)) out.set(pid, new Map());
    out.get(pid).set(m, (out.get(pid).get(m) || 0) + v);
  };
  const byStage = groupBy(state.timesheets, (e) => `${e.projectId}|${e.stageId}`);
  for (const p of state.projects) {
    if (p.internal) continue;
    for (const st of p.stages) {
      const entries = byStage.get(`${p.id}|${st.id}`) || [];
      if (st.feeType === 'T&M') {
        for (const e of entries) addTo(p.id, monthKey(e.date), e.hours * (ctx.staff.get(e.staffId)?.chargeRate || 0));
      } else {
        const earned = (st.fee * (st.percentComplete || 0)) / 100;
        const hours = sum(entries, (e) => e.hours);
        if (!hours) continue;
        for (const e of entries) addTo(p.id, monthKey(e.date), (earned * e.hours) / hours);
      }
    }
  }
  for (const x of state.expenses) {
    if (x.projectId && x.chargeable && ['Approved', 'Paid'].includes(x.status)) addTo(x.projectId, monthKey(x.date), x.amount);
  }
  return out;
}

// ── Portfolios ──────────────────────────────────────────────────────────────

export const PORTFOLIO_GROUPS = {
  sector: { label: 'Sector', key: (p) => p.sector || 'Not set' },
  office: { label: 'Office', key: (p, s) => s.offices.find((o) => o.id === p.officeId)?.name || 'Not set' },
  clientSector: { label: 'Client type', key: (p, s) => s.clients.find((c) => c.id === p.clientId)?.sector || 'Not set' },
  client: { label: 'Client', key: (p, s) => s.clients.find((c) => c.id === p.clientId)?.name || 'Not set' },
  manager: { label: 'Project manager', key: (p, s) => s.staff.find((x) => x.id === p.managerId)?.name || 'Not set' },
  status: { label: 'Status', key: (p) => p.status },
};

export function portfolio(state, groupKey, ctx = C.makeCtx(state), { statuses = null } = {}) {
  const g = PORTFOLIO_GROUPS[groupKey] || PORTFOLIO_GROUPS.sector;
  const projects = state.projects.filter((p) => !p.internal && (!statuses || statuses.includes(p.status)));
  const groups = groupBy(projects, (p) => g.key(p, state));
  return [...groups].map(([name, list]) => {
    const fins = list.map((p) => C.projectFinancials(p, ctx));
    const earned = sum(fins, (f) => f.earned);
    const cost = sum(fins, (f) => f.cost);
    return {
      name, projects: list, count: list.length, live: list.filter((p) => p.status === 'Live').length,
      fee: sum(fins, (f) => f.fee), earned, invoiced: sum(fins, (f) => f.invoiced), wip: sum(fins, (f) => f.wip), cost,
      margin: earned > 0 ? (earned - cost) / earned : null,
      hours: sum(fins, (f) => f.hours), budgetHours: sum(fins, (f) => f.budgetHours),
      flagged: fins.filter((f) => C.projectFlags(f).length).length,
    };
  }).sort((a, b) => b.fee - a.fee);
}

// ── Finding people ──────────────────────────────────────────────────────────
// Rank people for a role by skills matched, availability over the next weeks
// (capacity less planned hours) and cost. Score out of 100.

export function findPeople(state, { skills = [], grade = '', from, weeks = 4, excludeIds = [] }) {
  const ws = Array.from({ length: weeks }, (_, i) => addDays(from, i * 7));
  return state.staff.filter((p) => p.billable && p.active !== false && !excludeIds.includes(p.id) && (!grade || p.grade === grade))
    .map((p) => {
      const cap = sum(ws, (w) => C.weekCapacity(state, p, w));
      const planned = sum(ws, (w) => C.allocatedHours(state, p.id, w));
      const free = Math.max(0, cap - planned);
      const availability = cap > 0 ? free / cap : 0;
      const have = new Map((p.skills || []).map((x) => [x.skill, x.level]));
      const matched = skills.filter((s) => have.has(s));
      const skillScore = skills.length ? sum(matched, (s) => have.get(s)) / (skills.length * 3) : 1;
      const score = Math.round(100 * (0.6 * skillScore + 0.4 * availability));
      return { person: p, free, capacity: cap, availability, matched, missing: skills.filter((s) => !have.has(s)), score };
    })
    .sort((a, b) => b.score - a.score || a.person.costRate - b.person.costRate);
}
