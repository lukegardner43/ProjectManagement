import { getState, find, clientName, staffName, officeName, activeStaff, clientProjects, stageName } from '../store.js';
import { html, money, money2, hrs, pct, fmtDate, todayISO, fyRange, addDays, weekStart, monthLabel, monthKey, sum, round2, toCSV, daysBetween, groupBy, addMonths, monthStart, monthEnd } from '../util.js';
import * as C from '../calc.js';
import { pageHead, table, pill, tile, options, download, meter, empty } from '../ui.js';
import { barList } from '../charts.js';

const REPORTS = {
  'sales-won': { title: 'Sales won', text: 'Fees won in a financial year, by owner and office.', build: salesWon },
  'project-list': { title: 'Project list', text: 'Every project with owner, manager, status and fee position.', build: projectList },
  forecast: { title: 'Invoice and forecast calendar', text: 'Invoiced, scheduled and weighted pipeline by project and month.', build: forecast },
  wip: { title: 'WIP and fees', text: 'Earned, invoiced, unbilled and margin on every live job.', build: wip },
  utilisation: { title: 'Utilisation', text: 'Chargeable hours against available hours, per person.', build: utilisation },
  budget: { title: 'Budget vs actual hours', text: 'Hours used against budget for each stage of live jobs.', build: budget },
  'aged-debt': { title: 'Aged debt', text: 'Unpaid invoices by how long they are overdue.', build: agedDebt },
  'time-expense': { title: 'Project time and expense', text: 'Every hour and expense booked to one project.', build: timeExpense },
};

export function index(root) {
  root.innerHTML = String(html`
    ${pageHead('Reports', { sub: 'Each report can be filtered and exported to CSV for Excel.' })}
    <div class="report-cards">${Object.entries(REPORTS).map(([k, r]) => html`<a class="card report-card" href="#/reports/${k}"><h3>${r.title}</h3><p>${r.text}</p></a>`)}</div>`);
}

export function report(root, { params: [key], query }) {
  const r = REPORTS[key];
  if (!r) { root.innerHTML = String(empty('Report not found', '', html`<a href="#/reports">All reports</a>`)); return; }
  const s = getState();
  const out = r.build(s, query, todayISO());
  document.title = `${r.title} · Perega Projects`;
  root.innerHTML = String(html`
    <div class="crumbs"><a href="#/reports">Reports</a> /</div>
    ${pageHead(r.title, { sub: out.sub || r.text, actions: out.csv ? html`<button type="button" class="btn" id="csv">Export CSV</button>` : '' })}
    ${out.filters ? html`<div class="toolbar">${out.filters}</div>` : ''}
    ${out.body}`);
  root.querySelectorAll('[data-q]').forEach((sel) => sel.addEventListener('change', () => {
    const u = new URLSearchParams(query);
    if (sel.value) u.set(sel.dataset.q, sel.value); else u.delete(sel.dataset.q);
    location.hash = `#/reports/${key}?${u}`;
  }));
  root.querySelector('#csv')?.addEventListener('click', () => download(`${key}-${todayISO()}.csv`, toCSV(out.csv)));
}

// ── Shared filters ──────────────────────────────────────────────────────────

function fyChoice(s, query, today) {
  const fy = fyRange(today, s.settings.fyStartMonth);
  const last = fyRange(addDays(fy.start, -1), s.settings.fyStartMonth);
  const range = query.get('fy') === 'last' ? last : fy;
  const ctl = html`<label>Year <select class="select" data-q="fy">${options([{ value: '', label: fy.label }, { value: 'last', label: last.label }], query.get('fy') || '')}</select></label>`;
  return { range, ctl };
}
function officeChoice(s, query) {
  const id = query.get('office') || '';
  return { id, ctl: html`<label>Office <select class="select" data-q="office">${options(s.offices.map((o) => ({ value: o.id, label: o.name })), id, { placeholder: 'All' })}</select></label>` };
}

// ── Reports ─────────────────────────────────────────────────────────────────

function salesWon(s, query, today) {
  const { range, ctl } = fyChoice(s, query, today);
  const office = officeChoice(s, query);
  const won = C.salesWon(s, range, office.id);
  const byOwner = [...groupBy(won, 'ownerId')].map(([id, list]) => ({ id, name: staffName(id), wins: list.length, value: sum(list, (o) => o.value) }));
  return {
    sub: `${range.label}: ${won.length} wins worth ${money(sum(won, (o) => o.value))}`,
    filters: html`${ctl}${office.ctl}`,
    body: html`<div class="grid-main">
      <section class="card"><div class="card-head"><h2>Wins</h2></div><div class="card-body">${table({
        id: 'rep-won', rows: won, defaultSort: { key: 'wonDate', dir: -1 }, empty: 'No wins in this period.',
        columns: [
          { key: 'title', label: 'Opportunity', render: (o) => html`<strong>${o.title}</strong>${o.projectId ? html`<span class="cell-sub"><a href="#/projects/${o.projectId}">${find('projects', o.projectId)?.jobNo}</a></span>` : ''}` },
          { key: 'client', label: 'Client', value: (o) => clientName(o.clientId) },
          { key: 'owner', label: 'Owner', value: (o) => staffName(o.ownerId) },
          { key: 'office', label: 'Office', value: (o) => officeName(o.officeId) },
          { key: 'wonDate', label: 'Won', render: (o) => fmtDate(o.wonDate) },
          { key: 'value', label: 'Fee', align: 'num', render: (o) => money(o.value) },
        ],
        footer: { title: 'Total', value: money(sum(won, (o) => o.value)) },
      })}</div></section>
      <section class="card"><div class="card-head"><h2>By owner</h2></div><div class="card-body">${barList(byOwner.sort((a, b) => b.value - a.value).map((o) => ({ label: o.name, value: o.value, tip: html`<strong>${o.name}</strong><div class="tip-row">Wins<b>${o.wins}</b></div><div class="tip-row">Fees<b>${money(o.value)}</b></div>` })), { empty: 'No wins.' })}</div></section>
    </div>`,
    csv: [['Opportunity', 'Job', 'Client', 'Owner', 'Office', 'Won', 'Fee'], ...won.map((o) => [o.title, find('projects', o.projectId)?.jobNo || '', clientName(o.clientId), staffName(o.ownerId), officeName(o.officeId), o.wonDate, o.value])],
  };
}

function projectList(s, query) {
  const ctx = C.makeCtx(s);
  const status = query.get('status') ?? 'Live';
  const office = officeChoice(s, query);
  const rows = clientProjects().filter((p) => (!status || p.status === status) && (!office.id || p.officeId === office.id)).map((p) => ({ p, f: C.projectFinancials(p, ctx) }));
  return {
    sub: `${rows.length} projects`,
    filters: html`<label>Status <select class="select" data-q="status">${options(C.PROJECT_STATUSES, status, { placeholder: 'All' })}</select></label>${office.ctl}`,
    body: html`<div class="card"><div class="card-body">${table({
      id: 'rep-projects', rows, defaultSort: { key: 'jobNo', dir: -1 }, rowHref: (r) => `#/projects/${r.p.id}`,
      columns: [
        { key: 'jobNo', label: 'Job', value: (r) => r.p.jobNo, render: (r) => html`<span class="job">${r.p.jobNo}</span>` },
        { key: 'name', label: 'Project', value: (r) => r.p.name },
        { key: 'client', label: 'Client', value: (r) => clientName(r.p.clientId) },
        { key: 'office', label: 'Office', value: (r) => officeName(r.p.officeId) },
        { key: 'owner', label: 'Owner', value: (r) => staffName(r.p.ownerId) },
        { key: 'pm', label: 'Manager', value: (r) => staffName(r.p.managerId) },
        { key: 'status', label: 'Status', value: (r) => r.p.status, render: (r) => pill(r.p.status) },
        { key: 'start', label: 'Started', value: (r) => r.p.startDate, render: (r) => fmtDate(r.p.startDate) },
        { key: 'fee', label: 'Fee', align: 'num', value: (r) => r.f.fee, render: (r) => money(r.f.fee) },
        { key: 'invoiced', label: 'Invoiced', align: 'num', value: (r) => r.f.invoiced, render: (r) => money(r.f.invoiced) },
      ],
      footer: { jobNo: 'Total', fee: money(sum(rows, (r) => r.f.fee)), invoiced: money(sum(rows, (r) => r.f.invoiced)) },
    })}</div></div>`,
    csv: [['Job', 'Project', 'Client', 'Office', 'Owner', 'Manager', 'Status', 'Started', 'Fee', 'Invoiced', 'WIP'],
      ...rows.map((r) => [r.p.jobNo, r.p.name, clientName(r.p.clientId), officeName(r.p.officeId), staffName(r.p.ownerId), staffName(r.p.managerId), r.p.status, r.p.startDate || '', round2(r.f.fee), round2(r.f.invoiced), round2(r.f.wip)])],
  };
}

function forecast(s, query, today) {
  const { range, ctl } = fyChoice(s, query, today);
  const office = officeChoice(s, query);
  const thisMonth = monthKey(today);
  const months = range.months;
  const projects = clientProjects().filter((p) => !office.id || p.officeId === office.id);
  const rows = projects.map((p) => {
    const cells = months.map((m) => {
      const invoiced = sum(s.invoices.filter((i) => i.projectId === p.id && i.status !== 'Draft' && monthKey(i.date) === m), C.invoiceNet);
      const scheduled = m >= thisMonth && C.BILLING_STATUSES.includes(p.status) ? sum((p.invoiceSchedule || []).filter((x) => x.month === m), (x) => x.amount) : 0;
      return { invoiced, scheduled, total: invoiced + scheduled };
    });
    return { p, cells, total: sum(cells, (c) => c.total) };
  }).filter((r) => r.total > 0);
  const cal = C.forecastCalendar(s, months, today, office.id);
  const col = (i) => ({ key: `m${i}`, label: monthLabel(months[i]), align: 'num', value: (r) => r.cells[i].total, render: (r) => (r.cells[i].total ? html`<span class="${months[i] >= thisMonth ? 'muted' : ''}">${money(r.cells[i].total)}</span>` : '') });
  return {
    sub: `${range.label}. Past months show invoices raised; this month on (in grey) shows planned billing.`,
    filters: html`${ctl}${office.ctl}`,
    body: html`<div class="card"><div class="card-body">${table({
      id: 'rep-forecast', rows, compact: true, defaultSort: { key: 'job', dir: 1 },
      columns: [
        { key: 'job', label: 'Job', value: (r) => r.p.jobNo, render: (r) => html`<a href="#/projects/${r.p.id}/billing"><span class="job">${r.p.jobNo}</span></a> ${r.p.name}` },
        ...months.map((_, i) => col(i)),
        { key: 'total', label: 'Total', align: 'num', render: (r) => html`<strong>${money(r.total)}</strong>` },
      ],
      footer: {
        job: html`Invoiced + scheduled<br><span class="muted" style="font-weight:400">Weighted pipeline</span><br>All`,
        ...Object.fromEntries(months.map((m, i) => [`m${i}`, html`${money(cal[i].invoiced + cal[i].scheduled)}<br><span class="muted" style="font-weight:400">${money(cal[i].pipeline)}</span><br>${money(cal[i].invoiced + cal[i].scheduled + cal[i].pipeline)}`])),
        total: html`${money(sum(cal, (c) => c.invoiced + c.scheduled))}<br><span class="muted" style="font-weight:400">${money(sum(cal, (c) => c.pipeline))}</span><br>${money(sum(cal, (c) => c.invoiced + c.scheduled + c.pipeline))}`,
      },
      empty: 'Nothing invoiced or planned in this year.',
    })}</div></div>`,
    csv: [['Job', 'Project', ...months.map((m) => monthLabel(m, true)), 'Total'],
      ...rows.map((r) => [r.p.jobNo, r.p.name, ...r.cells.map((c) => round2(c.total)), round2(r.total)]),
      ['', 'Weighted pipeline', ...cal.map((c) => round2(c.pipeline)), round2(sum(cal, (c) => c.pipeline))]],
  };
}

function wip(s, query) {
  const ctx = C.makeCtx(s);
  const office = officeChoice(s, query);
  const rows = clientProjects().filter((p) => C.BILLING_STATUSES.includes(p.status) && (!office.id || p.officeId === office.id)).map((p) => ({ p, f: C.projectFinancials(p, ctx) }));
  return {
    sub: `Live and on-hold jobs: ${money(sum(rows, (r) => r.f.wip))} unbilled`,
    filters: office.ctl,
    body: html`<div class="card"><div class="card-body">${table({
      id: 'rep-wip', rows, defaultSort: { key: 'wip', dir: -1 }, rowHref: (r) => `#/projects/${r.p.id}`,
      columns: [
        { key: 'job', label: 'Job', value: (r) => r.p.jobNo, render: (r) => html`<span class="job">${r.p.jobNo}</span> ${r.p.name}` },
        { key: 'pm', label: 'Manager', value: (r) => staffName(r.p.managerId) },
        { key: 'fee', label: 'Fee', align: 'num', value: (r) => r.f.fee, render: (r) => money(r.f.fee) },
        { key: 'earned', label: 'Earned', align: 'num', value: (r) => r.f.earned, render: (r) => money(r.f.earned) },
        { key: 'invoiced', label: 'Invoiced', align: 'num', value: (r) => r.f.invoiced, render: (r) => money(r.f.invoiced) },
        { key: 'wip', label: 'WIP', align: 'num', value: (r) => r.f.wip, render: (r) => html`<strong class="${r.f.wip < 0 ? 'neg' : ''}">${money(r.f.wip)}</strong>` },
        { key: 'cost', label: 'Cost', align: 'num', value: (r) => r.f.cost, render: (r) => money(r.f.cost) },
        { key: 'margin', label: 'Margin', align: 'num', value: (r) => r.f.margin, render: (r) => html`<span class="${r.f.margin < 0 ? 'neg' : ''}">${pct(r.f.margin)}</span>` },
      ],
      footer: { job: 'Total', fee: money(sum(rows, (r) => r.f.fee)), earned: money(sum(rows, (r) => r.f.earned)), invoiced: money(sum(rows, (r) => r.f.invoiced)), wip: money(sum(rows, (r) => r.f.wip)), cost: money(sum(rows, (r) => r.f.cost)), margin: pct(sum(rows, (r) => r.f.earned) ? (sum(rows, (r) => r.f.earned) - sum(rows, (r) => r.f.cost)) / sum(rows, (r) => r.f.earned) : null) },
    })}</div></div>`,
    csv: [['Job', 'Project', 'Manager', 'Fee', 'Earned', 'Invoiced', 'WIP', 'Cost', 'Margin %'],
      ...rows.map((r) => [r.p.jobNo, r.p.name, staffName(r.p.managerId), round2(r.f.fee), round2(r.f.earned), round2(r.f.invoiced), round2(r.f.wip), round2(r.f.cost), r.f.margin === null ? '' : Math.round(r.f.margin * 100)])],
  };
}

function utilisation(s, query, today) {
  const office = officeChoice(s, query);
  const period = query.get('period') || '4w';
  const ws = weekStart(today);
  const fy = fyRange(today, s.settings.fyStartMonth);
  const lastMonth = addMonths(monthKey(today), -1);
  const ranges = {
    '4w': { from: addDays(ws, -28), to: addDays(ws, -1), label: 'Last 4 full weeks' },
    lm: { from: monthStart(lastMonth), to: monthEnd(lastMonth), label: monthLabel(lastMonth, true) },
    fy: { from: fy.start, to: addDays(today, -1), label: `${fy.label} to date` },
  };
  const r = ranges[period] || ranges['4w'];
  const people = activeStaff().filter((p) => p.billable && (!office.id || p.officeId === office.id));
  const rows = C.utilisation(s, people, r.from, r.to);
  const total = { cap: sum(rows, (x) => x.capacity), ch: sum(rows, (x) => x.chargeable), h: sum(rows, (x) => x.hours) };
  return {
    sub: `${r.label} (${fmtDate(r.from)} – ${fmtDate(r.to)}): ${pct(total.cap ? total.ch / total.cap : null)} overall`,
    filters: html`<label>Period <select class="select" data-q="period">${options(Object.entries(ranges).map(([value, x]) => ({ value, label: x.label })), period)}</select></label>${office.ctl}`,
    body: html`<div class="grid-2">
      <section class="card"><div class="card-head"><h2>Chargeable share of available hours</h2></div><div class="card-body">${barList(
        [...rows].sort((a, b) => (b.utilisation ?? 0) - (a.utilisation ?? 0)).map((x) => ({
          label: x.person.name, value: x.utilisation ?? 0, over: (x.utilisation ?? 0) > 1,
          tip: html`<strong>${x.person.name}</strong><div class="tip-row">Chargeable<b>${hrs(x.chargeable)} h</b></div><div class="tip-row">All time booked<b>${hrs(x.hours)} h</b></div><div class="tip-row">Available<b>${hrs(x.capacity)} h</b></div>`,
        })), { format: pct, max: 1 })}</div></section>
      <section class="card"><div class="card-head"><h2>Detail</h2></div><div class="card-body">${table({
        id: 'rep-util', rows, defaultSort: { key: 'util', dir: -1 }, compact: true,
        columns: [
          { key: 'name', label: 'Person', value: (x) => x.person.name, render: (x) => html`${x.person.name}<span class="cell-sub">${x.person.grade}</span>` },
          { key: 'cap', label: 'Available', align: 'num', value: (x) => x.capacity, render: (x) => hrs(x.capacity) },
          { key: 'hours', label: 'Booked', align: 'num', render: (x) => hrs(x.hours) },
          { key: 'ch', label: 'Chargeable', align: 'num', value: (x) => x.chargeable, render: (x) => hrs(x.chargeable) },
          { key: 'util', label: 'Utilisation', align: 'num', value: (x) => x.utilisation, render: (x) => pct(x.utilisation) },
        ],
        footer: { name: 'Total', cap: hrs(total.cap), hours: hrs(total.h), ch: hrs(total.ch), util: pct(total.cap ? total.ch / total.cap : null) },
      })}</div></section>
    </div>`,
    csv: [['Person', 'Grade', 'Office', 'Available hours', 'Booked hours', 'Chargeable hours', 'Utilisation %'],
      ...rows.map((x) => [x.person.name, x.person.grade, officeName(x.person.officeId), x.capacity, x.hours, x.chargeable, x.utilisation === null ? '' : Math.round(x.utilisation * 100)])],
  };
}

function budget(s, query) {
  const ctx = C.makeCtx(s);
  const office = officeChoice(s, query);
  const rows = [];
  for (const p of clientProjects().filter((x) => x.status === 'Live' && (!office.id || x.officeId === office.id))) {
    for (const st of p.stages) {
      const f = C.stageFinancials(p, st, ctx);
      rows.push({ p, st, f, gap: st.feeType === 'T&M' ? null : f.hoursUsed - st.percentComplete / 100 });
    }
  }
  return {
    sub: 'Gap is hours used minus work complete on fixed-fee stages. A big positive gap means the stage is likely to overrun.',
    filters: office.ctl,
    body: html`<div class="card"><div class="card-body">${table({
      id: 'rep-budget', rows, defaultSort: { key: 'gap', dir: -1 },
      columns: [
        { key: 'job', label: 'Job', value: (r) => r.p.jobNo, render: (r) => html`<a href="#/projects/${r.p.id}/stages"><span class="job">${r.p.jobNo}</span></a> ${r.p.name}` },
        { key: 'stage', label: 'Stage', value: (r) => r.st.name },
        { key: 'budget', label: 'Budget h', align: 'num', value: (r) => r.st.budgetHours, render: (r) => hrs(r.st.budgetHours) },
        { key: 'actual', label: 'Actual h', align: 'num', value: (r) => r.f.hours, render: (r) => hrs(r.f.hours) },
        { key: 'used', label: 'Hours used', value: (r) => r.f.hoursUsed, render: (r) => meter(r.f.hours, r.st.budgetHours), width: '150px' },
        { key: 'pc', label: 'Complete', align: 'num', value: (r) => (r.st.feeType === 'T&M' ? null : r.st.percentComplete), render: (r) => (r.st.feeType === 'T&M' ? 'T&M' : `${r.st.percentComplete}%`) },
        { key: 'gap', label: 'Gap', align: 'num', value: (r) => r.gap, render: (r) => (r.gap === null ? '—' : html`<span class="${r.gap > 0.1 ? 'neg' : ''}">${r.gap > 0 ? '+' : ''}${Math.round(r.gap * 100)} pts</span>`) },
      ],
    })}</div></div>`,
    csv: [['Job', 'Project', 'Stage', 'Basis', 'Budget hours', 'Actual hours', '% complete'],
      ...rows.map((r) => [r.p.jobNo, r.p.name, r.st.name, r.st.feeType, r.st.budgetHours, r.f.hours, r.st.feeType === 'T&M' ? '' : r.st.percentComplete])],
  };
}

function agedDebt(s, query, today) {
  const buckets = C.agedDebt(s, today);
  const unpaid = buckets.flatMap((b) => b.invoices);
  const project = (i) => find('projects', i.projectId);
  return {
    sub: `${unpaid.length} unpaid invoices, ${money(sum(unpaid, C.invoiceGross))} gross`,
    body: html`<section class="tiles">${buckets.map((b) => tile({ label: b.label, value: money(b.total), sub: `${b.invoices.length} invoices`, tone: b.min > 30 && b.total > 0 ? 'critical' : '' }))}</section>
      <div class="card"><div class="card-body">${table({
        id: 'rep-debt', rows: unpaid, defaultSort: { key: 'late', dir: -1 }, empty: 'Nothing unpaid.',
        columns: [
          { key: 'number', label: 'Invoice' },
          { key: 'client', label: 'Client', value: (i) => clientName(project(i)?.clientId) },
          { key: 'job', label: 'Job', value: (i) => project(i)?.jobNo, render: (i) => html`<a href="#/projects/${i.projectId}/billing"><span class="job">${project(i)?.jobNo}</span></a>` },
          { key: 'date', label: 'Date', render: (i) => fmtDate(i.date) },
          { key: 'dueDate', label: 'Due', render: (i) => fmtDate(i.dueDate) },
          { key: 'late', label: 'Days overdue', align: 'num', value: (i) => daysBetween(i.dueDate, today), render: (i) => { const d = daysBetween(i.dueDate, today); return d > 0 ? html`<span class="${d > 30 ? 'neg' : ''}">${d}</span>` : html`<span class="muted">not due</span>`; } },
          { key: 'gross', label: 'Gross', align: 'num', value: C.invoiceGross, render: (i) => money2(C.invoiceGross(i)) },
        ],
        footer: { number: 'Total', gross: money2(sum(unpaid, C.invoiceGross)) },
      })}</div></div>`,
    csv: [['Invoice', 'Client', 'Job', 'Date', 'Due', 'Days overdue', 'Gross'],
      ...unpaid.map((i) => [i.number, clientName(project(i)?.clientId), project(i)?.jobNo, i.date, i.dueDate, Math.max(0, daysBetween(i.dueDate, today)), round2(C.invoiceGross(i))])],
  };
}

function timeExpense(s, query) {
  const projects = clientProjects();
  const id = query.get('project') || projects.find((p) => p.status === 'Live')?.id;
  const p = find('projects', id);
  const pick = html`<label>Project <select class="select" data-q="project">${options(projects.map((x) => ({ value: x.id, label: `${x.jobNo} ${x.name}` })), id)}</select></label>`;
  if (!p) return { filters: pick, body: empty('Choose a project', '') };
  const entries = s.timesheets.filter((e) => e.projectId === p.id).map((e) => {
    const person = find('staff', e.staffId);
    return { ...e, rate: person?.chargeRate || 0, value: e.hours * (person?.chargeRate || 0) };
  });
  const exps = s.expenses.filter((x) => x.projectId === p.id);
  return {
    sub: `${p.jobNo} ${p.name}: ${hrs(sum(entries, (e) => e.hours))} hours worth ${money(sum(entries, (e) => e.value))}, ${money2(sum(exps, (x) => x.amount))} expenses`,
    filters: pick,
    body: html`<div class="stack">
      <section class="card"><div class="card-head"><h2>Time</h2></div><div class="card-body">${table({
        id: 'rep-te-time', rows: entries, defaultSort: { key: 'date', dir: -1 }, compact: true, empty: 'No time booked.',
        columns: [
          { key: 'date', label: 'Date', render: (e) => fmtDate(e.date) },
          { key: 'who', label: 'Person', value: (e) => staffName(e.staffId) },
          { key: 'stage', label: 'Stage', value: (e) => stageName(e.projectId, e.stageId) },
          { key: 'hours', label: 'Hours', align: 'num', render: (e) => hrs(e.hours) },
          { key: 'rate', label: 'Rate', align: 'num', render: (e) => money(e.rate) },
          { key: 'value', label: 'Value', align: 'num', render: (e) => money2(e.value) },
        ],
        footer: { date: 'Total', hours: hrs(sum(entries, (e) => e.hours)), value: money2(sum(entries, (e) => e.value)) },
      })}</div></section>
      <section class="card"><div class="card-head"><h2>Expenses</h2></div><div class="card-body">${table({
        id: 'rep-te-exp', rows: exps, defaultSort: { key: 'date', dir: -1 }, compact: true, empty: 'No expenses.',
        columns: [
          { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
          { key: 'who', label: 'Person', value: (x) => staffName(x.staffId) },
          { key: 'category', label: 'Category' },
          { key: 'description', label: 'Description' },
          { key: 'status', label: 'Status', render: (x) => pill(x.status) },
          { key: 'amount', label: 'Amount', align: 'num', render: (x) => money2(x.amount) },
        ],
      })}</div></section>
    </div>`,
    csv: [['Type', 'Date', 'Person', 'Stage / category', 'Hours', 'Rate', 'Value'],
      ...entries.map((e) => ['Time', e.date, staffName(e.staffId), stageName(e.projectId, e.stageId), e.hours, e.rate, round2(e.value)]),
      ...exps.map((x) => ['Expense', x.date, staffName(x.staffId), x.category, '', '', x.amount])],
  };
}
