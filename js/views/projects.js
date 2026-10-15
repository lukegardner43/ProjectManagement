import { getState, update, find, clientName, staffName, officeName, activeStaff, clientProjects, stageName } from '../store.js';
import { html, money, hrs, pct, fmtDate, todayISO, sum, uid, weekStart, addDays, monthKey, addMonths, monthLabel, groupBy } from '../util.js';
import * as C from '../calc.js';
import { pageHead, table, pill, tile, tabs, meter, flag, options, formModal, openModal, toast, confirmDialog, empty, avatar } from '../ui.js';
import { invoiceForm, invoiceView } from './invoices.js';
import { expenseForm } from './expenses.js';
import { taskTable, taskBoard, bindTasks, taskForm, isOverdue } from './tasks.js';
import { poForm, poTable } from './purchasing.js';
import { newEstimateForm } from './estimates.js';
import { stageEnd } from '../estimate.js';
import { findPeople } from '../forecast.js';
import { daysBetween, monthStart, monthEnd } from '../util.js';

// ── List ────────────────────────────────────────────────────────────────────

export function list(root, { query }) {
  const s = getState();
  const ctx = C.makeCtx(s);
  const status = query.get('status') ?? 'Live';
  const officeId = query.get('office') || '';
  const managerId = query.get('pm') || '';
  const text = (query.get('q') || '').toLowerCase();
  const rows = clientProjects()
    .filter((p) => (!status || p.status === status) && (!officeId || p.officeId === officeId) && (!managerId || p.managerId === managerId))
    .filter((p) => !text || `${p.jobNo} ${p.name} ${clientName(p.clientId)}`.toLowerCase().includes(text))
    .map((p) => ({ p, f: C.projectFinancials(p, ctx) }));
  const q = (k, v) => { const u = new URLSearchParams(query); u.set(k, v); return `#/projects?${u}`; };

  root.innerHTML = String(html`
    ${pageHead('Projects', { sub: `${rows.length} shown`, actions: html`<button type="button" class="btn primary" id="new-project">New project</button>` })}
    <div class="toolbar">
      <label>Status <select class="select" data-q="status">${options(C.PROJECT_STATUSES, status, { placeholder: 'All' })}</select></label>
      <label>Office <select class="select" data-q="office">${options(s.offices.map((o) => ({ value: o.id, label: o.name })), officeId, { placeholder: 'All' })}</select></label>
      <label>Manager <select class="select" data-q="pm">${options(activeStaff().filter((x) => s.projects.some((p) => p.managerId === x.id)).map((x) => ({ value: x.id, label: x.name })), managerId, { placeholder: 'Anyone' })}</select></label>
      <label class="sr-only" for="proj-filter">Filter</label><input id="proj-filter" class="input" type="search" placeholder="Filter by job, name or client" value="${query.get('q') || ''}">
    </div>
    <div class="card"><div class="card-body">${table({
      id: 'projects', rows, defaultSort: { key: 'jobNo', dir: -1 }, rowHref: (r) => `#/projects/${r.p.id}`,
      empty: 'No projects match these filters.',
      columns: [
        { key: 'jobNo', label: 'Job', value: (r) => r.p.jobNo, render: (r) => html`<span class="job">${r.p.jobNo}</span>` },
        { key: 'name', label: 'Project', value: (r) => r.p.name, render: (r) => html`<a class="cell-main" href="#/projects/${r.p.id}">${r.p.name}</a><span class="cell-sub">${clientName(r.p.clientId)}</span>` },
        { key: 'office', label: 'Office', value: (r) => officeName(r.p.officeId) },
        { key: 'pm', label: 'Manager', value: (r) => staffName(r.p.managerId) },
        { key: 'status', label: 'Status', value: (r) => r.p.status, render: (r) => pill(r.p.status) },
        { key: 'fee', label: 'Fee', align: 'num', value: (r) => r.f.fee, render: (r) => money(r.f.fee) },
        { key: 'complete', label: 'Complete', align: 'num', value: (r) => r.f.percentComplete, render: (r) => pct(r.f.percentComplete) },
        { key: 'hours', label: 'Hours used', value: (r) => r.f.hoursUsed, render: (r) => meter(r.f.hours, r.f.budgetHours, { label: `${hrs(r.f.hours)} of ${hrs(r.f.budgetHours)} hours` }), width: '140px' },
        { key: 'invoiced', label: 'Invoiced', align: 'num', value: (r) => r.f.invoiced, render: (r) => money(r.f.invoiced) },
        { key: 'wip', label: 'WIP', align: 'num', value: (r) => r.f.wip, render: (r) => html`<span class="${r.f.wip < 0 ? 'neg' : ''}">${money(r.f.wip)}</span>` },
        { key: 'margin', label: 'Margin', align: 'num', value: (r) => r.f.margin, render: (r) => html`<span class="${r.f.margin < 0 ? 'neg' : ''}">${pct(r.f.margin)}</span>${C.projectFlags(r.f).length ? html` <span class="flag flag-serious" title="${C.projectFlags(r.f).map((x) => x.label).join('; ')}">!<span class="sr-only">${C.projectFlags(r.f).map((x) => x.label).join('; ')}</span></span>` : ''}` },
      ],
      footer: { name: `${rows.length} projects`, fee: money(sum(rows, (r) => r.f.fee)), invoiced: money(sum(rows, (r) => r.f.invoiced)), wip: money(sum(rows, (r) => r.f.wip)) },
    })}</div></div>`);

  root.querySelectorAll('[data-q]').forEach((sel) => sel.addEventListener('change', () => { location.hash = q(sel.dataset.q, sel.value); }));
  const f = root.querySelector('#proj-filter');
  f.addEventListener('change', () => { location.hash = q('q', f.value); });
  root.querySelector('#new-project').addEventListener('click', () => projectForm());
}

// ── Detail ──────────────────────────────────────────────────────────────────

const TABS = [['overview', 'Overview'], ['stages', 'Stages & fees'], ['tasks', 'Tasks'], ['programme', 'Programme'], ['time', 'Time'], ['billing', 'Billing'], ['costs', 'Costs'], ['team', 'Team & resourcing']];

export function detail(root, { params: [id, tab = 'overview'], query }) {
  if (tab === 'expenses') tab = 'costs'; // older links
  const s = getState();
  const p = find('projects', id);
  if (!p || p.internal) { root.innerHTML = String(empty('Project not found', 'It may have been deleted.', html`<a href="#/projects">All projects</a>`)); return; }
  const ctx = C.makeCtx(s);
  const f = C.projectFinancials(p, ctx);
  const body = { overview, stages, tasks, programme, time, billing, costs, team }[tab] || overview;
  document.title = `${p.jobNo} ${p.name} · Perega Projects`;

  root.innerHTML = String(html`
    <div class="crumbs"><a href="#/projects">Projects</a> / <a href="#/clients/${p.clientId}">${clientName(p.clientId)}</a></div>
    ${pageHead(html`<span class="job" style="font-size:20px">${p.jobNo}</span> ${p.name}`, {
      sub: html`${pill(p.status)} · ${officeName(p.officeId)} · Manager ${staffName(p.managerId)}${p.purchaseOrder ? ` · ${p.purchaseOrder}` : ''}`,
      actions: html`<button type="button" class="btn" id="edit-project">Edit details</button><button type="button" class="btn primary" id="raise-invoice">Raise invoice</button>`,
    })}
    ${tabs(TABS.map(([k, label]) => ({ key: k, label, href: `#/projects/${p.id}/${k}`, count: k === 'tasks' ? s.tasks.filter((t) => t.projectId === p.id && isOverdue(t)).length : 0 })), tab)}
    <div id="tab-body">${body(p, f, s, query)}</div>`);

  root.querySelector('#edit-project').addEventListener('click', () => projectForm(p));
  root.querySelector('#raise-invoice').addEventListener('click', () => invoiceForm({ projectId: p.id }));
  ({ stages: bindStages, billing: bindBilling, team: bindTeam, costs: bindCosts, tasks: bindTaskTab, programme: bindProgramme }[tab] || (() => {}))(root, p, f, query);
  root.querySelectorAll('[data-invoice]').forEach((b) => b.addEventListener('click', () => invoiceView(find('invoices', b.dataset.invoice))));
}

function overview(p, f) {
  const flags = C.projectFlags(f);
  return html`
    <section class="tiles">
      ${tile({ label: 'Fee', value: money(f.fee), sub: `${p.stages.length} stages` })}
      ${tile({ label: 'Earned to date', value: money(f.earned), sub: f.percentComplete === null ? 'time & materials' : `${pct(f.percentComplete)} of fixed fee` })}
      ${tile({ label: 'Invoiced', value: money(f.invoiced), sub: `${money(f.fee - f.invoiced)} left to bill` })}
      ${tile({ label: 'Unbilled WIP', value: money(f.wip), tone: f.wip < 0 ? 'critical' : '', sub: f.wip < 0 ? 'billed ahead of work' : 'earned, not yet invoiced' })}
      ${tile({ label: 'Cost to date', value: money(f.cost), sub: `${hrs(f.hours)} h + ${money(f.expenses.total)} expenses` })}
      ${tile({ label: 'Margin', value: pct(f.margin), tone: f.margin < 0 ? 'critical' : '', sub: `${money(f.profit)} on earned value` })}
    </section>
    <div class="grid-main">
      <section class="card"><div class="card-head"><h2>Progress by stage</h2>${flags.length ? html`<span>${flags.map((x) => flag(x.kind, x.label))}</span>` : ''}</div>
        <div class="card-body">${table({
          id: 'ov-stages', rows: f.stages, compact: true,
          columns: [
            { key: 'name', label: 'Stage', value: (r) => r.stage.name, render: (r) => html`<strong>${r.stage.name}</strong><span class="cell-sub">${r.stage.feeType === 'T&M' ? 'Time & materials' : 'Fixed fee'} · ${money(r.stage.fee)}</span>` },
            { key: 'complete', label: 'Complete', value: (r) => r.stage.percentComplete, render: (r) => (r.stage.feeType === 'T&M' ? html`<span class="muted">—</span>` : meter(r.stage.percentComplete, 100, { label: `${r.stage.percentComplete}% complete` })), width: '150px' },
            { key: 'hours', label: 'Hours used', value: (r) => r.hoursUsed, render: (r) => meter(r.hours, r.stage.budgetHours, { label: `${hrs(r.hours)} of ${hrs(r.stage.budgetHours)} hours` }), width: '150px' },
            { key: 'wip', label: 'WIP', align: 'num', value: (r) => r.wip, render: (r) => money(r.wip) },
          ],
        })}</div>
      </section>
      <section class="card"><div class="card-head"><h2>Details</h2></div><div class="card-body">
        <dl class="facts">
          <dt>Client</dt><dd><a href="#/clients/${p.clientId}">${clientName(p.clientId)}</a></dd>
          <dt>Office</dt><dd>${officeName(p.officeId)}</dd>
          <dt>Owner</dt><dd>${staffName(p.ownerId)}</dd>
          <dt>Manager</dt><dd>${staffName(p.managerId)}</dd>
          <dt>Sector</dt><dd>${p.sector || '—'}</dd>
          <dt>Started</dt><dd>${fmtDate(p.startDate)}</dd>
          ${p.endDate ? html`<dt>Finished</dt><dd>${fmtDate(p.endDate)}</dd>` : ''}
          <dt>Order no.</dt><dd>${p.purchaseOrder || '—'}</dd>
          <dt>Site</dt><dd>${p.address || '—'}</dd>
        </dl>
        ${p.description ? html`<p style="margin-top:12px">${p.description}</p>` : ''}
        <h3 style="margin:16px 0 8px">Team</h3>
        <div class="people">${p.team.map((id) => html`<span class="person">${avatar(staffName(id))}${staffName(id)}</span>`)}</div>
      </div></section>
    </div>`;
}

function stages(p, f) {
  const fixed = f.stages.filter((r) => r.stage.feeType !== 'T&M');
  return html`<div class="card"><div class="card-head"><h2>Stages & fees</h2><span class="page-actions">${p.estimateId ? html`<a class="btn small" href="#/estimates/${p.estimateId}">Original fee estimate</a>` : ''}<button type="button" class="btn small" id="extra-estimate">Estimate extra work</button><button type="button" class="btn small primary" id="add-stage">Add stage</button></span></div>
    <div class="card-body">
      <p class="muted">Set % complete on fixed-fee stages as work progresses; earned value and WIP follow from it. Time-and-materials stages earn the value of the time booked.</p>
      ${table({
        id: 'stages', rows: f.stages,
        columns: [
          { key: 'name', label: 'Stage', sortable: false, render: (r) => html`<strong>${r.stage.name}</strong>` },
          { key: 'type', label: 'Basis', sortable: false, render: (r) => (r.stage.feeType === 'T&M' ? 'Time & materials' : 'Fixed fee') },
          { key: 'dates', label: 'Dates', sortable: false, render: (r) => (r.stage.startDate ? html`<span class="nowrap muted">${fmtDate(r.stage.startDate).replace(/ \d{4}$/, '')} – ${fmtDate(stageEnd(r.stage))}</span>` : html`<span class="muted">—</span>`) },
          { key: 'fee', label: 'Fee', align: 'num', sortable: false, render: (r) => money(r.stage.fee) },
          { key: 'budget', label: 'Budget h', align: 'num', sortable: false, render: (r) => hrs(r.stage.budgetHours) },
          { key: 'hours', label: 'Actual h', align: 'num', sortable: false, render: (r) => html`<span class="${r.hoursUsed > 1 ? 'neg' : ''}">${hrs(r.hours)}</span>` },
          { key: 'pc', label: '% complete', align: 'num', sortable: false, render: (r) => (r.stage.feeType === 'T&M' ? '—' : html`<label class="sr-only" for="pc-${r.stage.id}">% complete, ${r.stage.name}</label><input id="pc-${r.stage.id}" class="input" style="width:72px;text-align:right" type="number" min="0" max="100" step="5" value="${r.stage.percentComplete}" data-pc="${r.stage.id}">`) },
          { key: 'earned', label: 'Earned', align: 'num', sortable: false, render: (r) => money(r.earned) },
          { key: 'invoiced', label: 'Invoiced', align: 'num', sortable: false, render: (r) => money(r.invoiced) },
          { key: 'wip', label: 'WIP', align: 'num', sortable: false, render: (r) => html`<span class="${r.wip < 0 ? 'neg' : ''}">${money(r.wip)}</span>` },
          { key: 'actions', label: '', sortable: false, render: (r) => html`<button type="button" class="btn small link" data-stage="${r.stage.id}">Edit</button>` },
        ],
        footer: {
          name: 'Total', fee: money(f.fee), budget: hrs(f.budgetHours), hours: hrs(f.hours),
          pc: fixed.length ? pct(f.percentComplete) : '', earned: money(sum(f.stages, (r) => r.earned)), invoiced: money(sum(f.stages, (r) => r.invoiced)), wip: money(sum(f.stages, (r) => r.wip)),
        },
        empty: 'No stages yet. Add the stages of your fee proposal.',
      })}
      ${f.expenses.chargeable ? html`<p class="muted" style="margin-top:10px">Plus rechargeable expenses: ${money(f.expenses.chargeable)} approved, ${money(f.expensesUninvoiced)} not yet invoiced.</p>` : ''}
    </div></div>`;
}

function bindStages(root, p) {
  root.querySelector('#add-stage').addEventListener('click', () => stageForm(p));
  root.querySelector('#extra-estimate').addEventListener('click', () => newEstimateForm({ projectId: p.id }));
  root.querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => stageForm(p, p.stages.find((x) => x.id === b.dataset.stage))));
  root.querySelectorAll('[data-pc]').forEach((inp) => inp.addEventListener('change', () => {
    const v = Math.max(0, Math.min(100, Number(inp.value) || 0));
    update(() => { p.stages.find((x) => x.id === inp.dataset.pc).percentComplete = v; });
  }));
}

function time(p, f, s) {
  const entries = s.timesheets.filter((e) => e.projectId === p.id);
  const byPerson = [...groupBy(entries, 'staffId')].map(([staffId, list]) => {
    const person = find('staff', staffId);
    const h = sum(list, (e) => e.hours);
    return { staffId, name: person?.name || '—', grade: person?.grade || '', hours: h, value: h * (person?.chargeRate || 0), cost: h * (person?.costRate || 0), last: list.reduce((m, e) => (e.date > m ? e.date : m), '') };
  });
  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
  return html`<div class="grid-2">
    <section class="card"><div class="card-head"><h2>Time by person</h2><span class="sub">${hrs(f.hours)} hours, ${money(f.timeValue)} at charge rates</span></div><div class="card-body">${table({
      id: 'time-people', rows: byPerson, defaultSort: { key: 'hours', dir: -1 }, empty: 'No time booked yet.',
      columns: [
        { key: 'name', label: 'Person', render: (r) => html`<strong>${r.name}</strong><span class="cell-sub">${r.grade}</span>` },
        { key: 'hours', label: 'Hours', align: 'num', render: (r) => hrs(r.hours) },
        { key: 'value', label: 'Value', align: 'num', render: (r) => money(r.value) },
        { key: 'cost', label: 'Cost', align: 'num', render: (r) => money(r.cost) },
        { key: 'last', label: 'Last booked', render: (r) => fmtDate(r.last) },
      ],
    })}</div></section>
    <section class="card"><div class="card-head"><h2>Recent entries</h2></div><div class="card-body">${table({
      id: 'time-recent', rows: recent, compact: true, empty: 'No time booked yet.',
      columns: [
        { key: 'date', label: 'Date', render: (e) => fmtDate(e.date) },
        { key: 'who', label: 'Person', value: (e) => staffName(e.staffId) },
        { key: 'stage', label: 'Stage', value: (e) => stageName(e.projectId, e.stageId) },
        { key: 'hours', label: 'Hours', align: 'num', render: (e) => hrs(e.hours) },
      ],
    })}</div></section>
  </div>`;
}

function billing(p, f, s) {
  const today = todayISO();
  const invoices = s.invoices.filter((i) => i.projectId === p.id);
  const thisMonth = monthKey(today);
  const sched = (p.invoiceSchedule || []).filter((x) => x.month >= thisMonth).sort((a, b) => a.month.localeCompare(b.month));
  const scheduled = sum(sched, (x) => x.amount);
  const left = f.fee - sum(f.stages, (r) => r.invoiced);
  return html`<div class="stack">
    <section class="card"><div class="card-head"><h2>Invoices</h2><span class="sub">${money(f.invoiced)} invoiced · ${money(f.wip)} WIP</span></div><div class="card-body">${table({
      id: 'proj-invoices', rows: invoices, defaultSort: { key: 'date', dir: -1 }, empty: 'Nothing invoiced yet.',
      columns: [
        { key: 'number', label: 'Number', render: (i) => html`<button type="button" class="btn link cell-main" data-invoice="${i.id}">${i.number}</button>` },
        { key: 'date', label: 'Date', render: (i) => fmtDate(i.date) },
        { key: 'lines', label: 'For', sortable: false, render: (i) => i.lines.map((l) => stageName(p.id, l.stageId)).join(', ') },
        { key: 'net', label: 'Net', align: 'num', value: C.invoiceNet, render: (i) => money(C.invoiceNet(i)) },
        { key: 'gross', label: 'Gross', align: 'num', value: C.invoiceGross, render: (i) => money(C.invoiceGross(i)) },
        { key: 'status', label: 'Status', value: (i) => C.invoiceDisplayStatus(i, today), render: (i) => pill(C.invoiceDisplayStatus(i, today)) },
      ],
    })}</div></section>
    <section class="card"><div class="card-head"><h2>Planned billing</h2>
      <span class="page-actions"><button type="button" class="btn small" id="spread">Spread remaining fee</button><button type="button" class="btn small primary" id="add-sched">Add month</button></span></div>
      <div class="card-body">
        <p class="muted">Feeds the invoice and forecast calendar. ${money(scheduled)} planned against ${money(left)} of fee still to invoice${Math.abs(scheduled - left) > 1 ? html` <strong class="${scheduled > left ? 'neg' : ''}">(${scheduled > left ? 'over' : 'under'} by ${money(Math.abs(scheduled - left))})</strong>` : ''}.</p>
        ${table({
          id: 'sched', rows: sched, empty: 'Nothing planned. Spread the remaining fee or add months one at a time.', compact: true,
          columns: [
            { key: 'month', label: 'Month', render: (x) => monthLabel(x.month, true) },
            { key: 'stage', label: 'Stage', value: (x) => stageName(p.id, x.stageId) },
            { key: 'amount', label: 'Amount', align: 'num', render: (x) => money(x.amount) },
            { key: 'a', label: '', sortable: false, render: (x) => html`<button type="button" class="btn small link" data-sched="${x.id}">Edit</button>` },
          ],
          footer: { month: 'Total', amount: money(scheduled) },
        })}
      </div></section>
  </div>`;
}

function bindBilling(root, p, f) {
  root.querySelector('#add-sched').addEventListener('click', () => scheduleForm(p));
  root.querySelectorAll('[data-sched]').forEach((b) => b.addEventListener('click', () => scheduleForm(p, p.invoiceSchedule.find((x) => x.id === b.dataset.sched))));
  root.querySelector('#spread').addEventListener('click', () => spreadForm(p, f));
}

function costs(p, f, s) {
  const list = s.expenses.filter((x) => x.projectId === p.id);
  const pos = s.purchaseOrders.filter((x) => x.projectId === p.id);
  return html`<section class="card"><div class="card-head"><h2>Subconsultants and suppliers</h2><span class="page-actions"><span class="sub">${money(f.supplier.actual)} invoiced · ${money(f.supplier.committed)} committed</span><button type="button" class="btn small primary" id="add-po">New purchase order</button></span></div>
    <div class="card-body">${poTable(pos, { id: 'proj-pos' })}</div></section>
    <section class="card"><div class="card-head"><h2>Expenses</h2><span class="page-actions"><span class="sub">${money(f.expenses.total)} approved · ${money(f.expenses.chargeable)} rechargeable</span><button type="button" class="btn small primary" id="add-expense">Add expense</button></span></div><div class="card-body">${table({
    id: 'proj-expenses', rows: list, defaultSort: { key: 'date', dir: -1 }, empty: 'No expenses on this project.',
    columns: [
      { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
      { key: 'who', label: 'Claimed by', value: (x) => staffName(x.staffId) },
      { key: 'category', label: 'Category' },
      { key: 'description', label: 'Description' },
      { key: 'chargeable', label: 'Rechargeable', render: (x) => (x.chargeable ? 'Yes' : 'No') },
      { key: 'amount', label: 'Amount', align: 'num', render: (x) => money(x.amount) },
      { key: 'status', label: 'Status', render: (x) => pill(x.status) },
    ],
  })}</div></section>`;
}

function bindCosts(root, p) {
  root.querySelector('#add-expense').addEventListener('click', () => expenseForm(null, { projectId: p.id }));
  root.querySelector('#add-po').addEventListener('click', () => poForm(null, { projectId: p.id }));
  root.querySelectorAll('[data-po]').forEach((b) => b.addEventListener('click', () => poForm(getState().purchaseOrders.find((x) => x.id === b.dataset.po))));
}

function tasks(p, f, s, query) {
  const view = query?.get('view') || 'list';
  const list = s.tasks.filter((t) => t.projectId === p.id);
  const open = list.filter((t) => t.status !== 'Completed').length;
  const href = (v) => `#/projects/${p.id}/tasks?view=${v}`;
  return html`<div class="toolbar">
      <div class="segmented" role="group" aria-label="View"><a href="${href('list')}" class="${view === 'list' ? 'on' : ''}">List</a><a href="${href('board')}" class="${view === 'board' ? 'on' : ''}">Board</a><a href="${href('people')}" class="${view === 'people' ? 'on' : ''}">By person</a></div>
      <span class="muted">${open} open · ${list.filter((t) => isOverdue(t)).length} overdue · ${list.length - open} done</span>
      <span class="spacer"></span><button type="button" class="btn primary" id="add-task">New task</button>
    </div>
    ${view === 'list' ? html`<div class="card"><div class="card-body">${taskTable(list, { id: 'proj-tasks' })}</div></div>`
    : taskBoard(list, { by: view === 'people' ? 'person' : 'status', team: p.team })}`;
}

function bindTaskTab(root, p) {
  root.querySelector('#add-task').addEventListener('click', () => taskForm(null, { projectId: p.id }));
  bindTasks(root);
}

// A Gantt view of stage dates and the tasks inside each stage.
function programme(p, f, s) {
  const today = todayISO();
  const items = p.stages.filter((st) => st.startDate).map((st) => ({
    st, start: st.startDate, end: stageEnd(st), fin: f.stages.find((x) => x.stage.id === st.id),
    tasks: s.tasks.filter((t) => t.projectId === p.id && t.stageId === st.id && t.start && t.due).sort((a, b) => a.start.localeCompare(b.start)),
  }));
  if (!items.length) return empty('No stage dates yet', 'Give each stage a start date and duration on the Stages & fees tab to see the programme.');
  const dates = items.flatMap((i) => [i.start, i.end, ...i.tasks.flatMap((t) => [t.start, t.due])]).concat(today);
  const from = weekStart(dates.reduce((a, b) => (a < b ? a : b)));
  const to = addDays(weekStart(dates.reduce((a, b) => (a > b ? a : b))), 6);
  const span = daysBetween(from, to) + 1;
  const x = (d) => `${((daysBetween(from, d) / span) * 100).toFixed(3)}%`;
  const w = (a, b) => `${(((daysBetween(a, b) + 1) / span) * 100).toFixed(3)}%`;
  const months = [];
  for (let m = monthKey(from); m <= monthKey(to); m = addMonths(m, 1)) months.push(m);
  const state = (i) => (i.st.feeType !== 'T&M' && i.st.percentComplete >= 100) || i.end < today ? 'done' : i.start <= today ? 'active' : 'next';
  const todayLine = html`<span class="g-today" style="left:${x(today)}" aria-hidden="true"></span>`;
  return html`<section class="card"><div class="card-head"><h2>Programme</h2>
      <ul class="legend"><li><span class="swatch" style="background:var(--heat-4)"></span>Complete</li><li><span class="swatch" style="background:var(--rubine)"></span>In progress</li><li><span class="swatch" style="background:var(--heat-2)"></span>Upcoming</li><li><span class="swatch" style="background:var(--golden)"></span>Today</li></ul></div>
    <div class="card-body"><div class="table-wrap"><div class="gantt" style="min-width:${Math.max(720, 280 + months.length * 40)}px">
      <div class="g-row g-head"><div class="g-label">Stage / task</div><div class="g-track">${months.map((m) => {
        const a = monthStart(m) < from ? from : monthStart(m); const b = monthEnd(m) > to ? to : monthEnd(m);
        return html`<span class="g-month" style="left:${x(a)};width:${w(a, b)}">${monthLabel(m)}</span>`;
      })}${todayLine}</div></div>
      ${items.map((i) => html`
        <div class="g-row g-stage"><div class="g-label"><button type="button" class="btn link cell-main" data-stage-dates="${i.st.id}">${i.st.name}</button><span class="cell-sub">${fmtDate(i.start).replace(/ \d{4}$/, '')} – ${fmtDate(i.end)} · ${i.st.weeks} wks${i.st.feeType === 'T&M' ? '' : ` · ${i.st.percentComplete}% done`}</span></div>
          <div class="g-track">${todayLine}<span class="g-bar g-${state(i)}" style="left:${x(i.start)};width:${w(i.start, i.end)}" data-tip="${`<strong>${i.st.name}</strong>${fmtDate(i.start)} – ${fmtDate(i.end)}`}" tabindex="0">${i.st.feeType !== 'T&M' ? html`<span class="g-progress" style="width:${Math.min(100, i.st.percentComplete)}%"></span>` : ''}</span></div></div>
        ${i.tasks.map((t) => html`<div class="g-row g-task"><div class="g-label"><button type="button" class="btn link" data-task="${t.id}">${t.title}</button><span class="cell-sub">${t.assignees.map(staffName).join(', ') || 'Unassigned'}</span></div>
          <div class="g-track">${todayLine}<span class="g-bar g-taskbar ${t.status === 'Completed' ? 'g-done' : ''} ${isOverdue(t) ? 'g-late' : ''}" style="left:${x(t.start)};width:${w(t.start, t.due)}" data-tip="${`<strong>${t.title}</strong>${t.status}, due ${fmtDate(t.due)}`}" tabindex="0"></span></div></div>`)}`)}
    </div></div>
    <p class="muted" style="margin-top:10px;font-size:12.5px">Click a stage to change its dates. Overdue tasks are outlined in red.</p></div></section>`;
}

function bindProgramme(root, p) {
  bindTasks(root);
  root.querySelectorAll('[data-stage-dates]').forEach((b) => b.addEventListener('click', () => {
    const st = p.stages.find((x) => x.id === b.dataset.stageDates);
    formModal({
      title: `Dates for ${st.name}`,
      fields: [
        { name: 'startDate', label: 'Start', type: 'date', value: st.startDate, required: true },
        { name: 'weeks', label: 'Duration (weeks)', type: 'number', min: 1, max: 260, value: st.weeks, required: true },
      ],
      onSubmit: (v) => update(() => { st.startDate = v.startDate; st.weeks = v.weeks; }),
    });
  }));
}

function team(p, f, s) {
  const ws0 = weekStart(todayISO());
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(ws0, i * 7));
  const members = p.team.map((id) => find('staff', id)).filter(Boolean);
  const alloc = (staffId, w) => sum(s.allocations.filter((a) => a.staffId === staffId && a.projectId === p.id && a.weekStart === w), (a) => a.hours);
  return html`<section class="card"><div class="card-head"><h2>Team and planned hours</h2>
      <span class="page-actions"><button type="button" class="btn small secondary" id="find-people">Find people</button><label class="sr-only" for="add-member">Add to team</label><select id="add-member" class="select">${options(activeStaff().filter((x) => !p.team.includes(x.id)).map((x) => ({ value: x.id, label: x.name })), '', { placeholder: 'Add someone…' })}</select></span></div>
    <div class="card-body">
      <p class="muted">Hours planned on this project each week. Changes show straight away on the resourcing screen.</p>
      <div class="table-wrap"><table class="grid ts-grid">
        <thead><tr><th>Person</th>${weeks.map((w) => html`<th>w/c<small>${fmtDate(w).replace(/ \d{4}$/, '')}</small></th>`)}<th>Total</th><th></th></tr></thead>
        <tbody>${members.length ? members.map((m) => html`<tr>
          <td><span class="person">${avatar(m.name)}<span><strong>${m.name}</strong><span class="cell-sub">${m.grade}${m.id === p.managerId ? ' · manager' : ''}</span></span></span></td>
          ${weeks.map((w) => html`<td><label class="sr-only" for="al-${m.id}-${w}">${m.name}, week of ${fmtDate(w)}</label><input id="al-${m.id}-${w}" type="number" min="0" max="80" step="0.5" value="${alloc(m.id, w) || ''}" data-alloc="${m.id}|${w}"></td>`)}
          <td class="ts-total" data-alloc-total="${m.id}">${hrs(sum(weeks, (w) => alloc(m.id, w)))}</td>
          <td>${m.id !== p.managerId ? html`<button type="button" class="btn small link" data-remove-member="${m.id}">Remove</button>` : ''}</td>
        </tr>`) : html`<tr><td class="empty" colspan="${weeks.length + 3}">Nobody on the team yet.</td></tr>`}</tbody>
      </table></div>
    </div></section>`;
}

function bindTeam(root, p) {
  root.querySelector('#find-people').addEventListener('click', () => findPeopleModal(p));
  root.querySelector('#add-member').addEventListener('change', (e) => {
    if (e.target.value) update(() => { p.team.push(e.target.value); });
  });
  root.querySelectorAll('[data-remove-member]').forEach((b) => b.addEventListener('click', () => update(() => { p.team = p.team.filter((x) => x !== b.dataset.removeMember); })));
  root.querySelectorAll('[data-alloc]').forEach((inp) => inp.addEventListener('change', () => {
    const [staffId, w] = inp.dataset.alloc.split('|');
    const hours = Math.max(0, Number(inp.value) || 0);
    setAllocation(staffId, p.id, w, hours);
    const row = inp.closest('tr');
    row.querySelector('[data-alloc-total]').textContent = hrs(sum([...row.querySelectorAll('[data-alloc]')], (x) => Number(x.value) || 0));
  }));
}

// Silent: the input keeps focus, so tabbing along the row isn't interrupted.
export function setAllocation(staffId, projectId, weekStartISO, hours) {
  update((s) => {
    s.allocations = s.allocations.filter((a) => !(a.staffId === staffId && a.projectId === projectId && a.weekStart === weekStartISO));
    if (hours > 0) s.allocations.push({ id: uid('al'), staffId, projectId, weekStart: weekStartISO, hours });
  }, { silent: true });
}

// ── Forms ───────────────────────────────────────────────────────────────────

export function projectForm(p = null) {
  const s = getState();
  formModal({
    title: p ? 'Edit project' : 'New project',
    size: 'wide',
    fields: [
      { name: 'jobNo', label: 'Job number', value: p?.jobNo ?? `${s.settings.jobPrefix}${s.settings.nextJobNo}`, required: true },
      { name: 'name', label: 'Project name', value: p?.name, required: true },
      { name: 'clientId', label: 'Client', type: 'select', value: p?.clientId, options: s.clients.map((c) => ({ value: c.id, label: c.name })), placeholder: 'Choose…', required: true },
      { name: 'status', label: 'Status', type: 'select', value: p?.status ?? 'Live', options: C.PROJECT_STATUSES },
      { name: 'officeId', label: 'Office', type: 'select', value: p?.officeId ?? s.offices[0]?.id, options: s.offices.map((o) => ({ value: o.id, label: o.name })) },
      { name: 'sector', label: 'Sector', type: 'select', value: p?.sector ?? 'Residential', options: ['Residential', 'Commercial', 'Education', 'Healthcare', 'Infrastructure', 'Industrial', 'Heritage', 'Other'] },
      { name: 'ownerId', label: 'Owner (director)', type: 'select', value: p?.ownerId, options: activeStaff().map((x) => ({ value: x.id, label: x.name })) },
      { name: 'managerId', label: 'Project manager', type: 'select', value: p?.managerId, options: activeStaff().map((x) => ({ value: x.id, label: x.name })) },
      { name: 'startDate', label: 'Start date', type: 'date', value: p?.startDate ?? todayISO() },
      { name: 'endDate', label: 'Finish date', type: 'date', value: p?.endDate },
      { name: 'purchaseOrder', label: 'Client order number', value: p?.purchaseOrder },
      { name: 'address', label: 'Site address', value: p?.address },
      { name: 'description', label: 'Description', type: 'textarea', value: p?.description, full: true },
    ],
    extraActions: p ? [{ label: 'Delete', kind: 'danger', onClick: () => { removeProject(p); } }] : [],
    onSubmit: (v) => {
      if (s.projects.some((x) => x.jobNo === v.jobNo && x !== p)) return `${v.jobNo} is already used by another project.`;
      let newId = null;
      update((st) => {
        if (p) {
          Object.assign(p, v, { endDate: v.endDate || null });
          if (!p.team.includes(v.managerId)) p.team.push(v.managerId);
        } else {
          newId = uid('prj');
          st.projects.push({ id: newId, ...v, endDate: v.endDate || null, internal: false, team: [...new Set([v.managerId, v.ownerId])], stages: [], invoiceSchedule: [] });
          const n = Number(v.jobNo.replace(/\D/g, ''));
          if (n >= st.settings.nextJobNo) st.settings.nextJobNo = n + 1;
        }
      });
      toast(p ? 'Project saved.' : `${v.jobNo} opened. Add its stages next.`);
      if (newId) location.hash = `#/projects/${newId}/stages`;
    },
  });
}

async function removeProject(p) {
  const s = getState();
  if (s.timesheets.some((e) => e.projectId === p.id) || s.invoices.some((i) => i.projectId === p.id)) {
    toast('Time or invoices are booked to this project. Set its status to Complete or Lost instead.', 'error');
    return;
  }
  if (await confirmDialog(`Delete ${p.jobNo} ${p.name}?`, { okLabel: 'Delete', danger: true })) {
    update((st) => {
      st.projects = st.projects.filter((x) => x.id !== p.id);
      st.allocations = st.allocations.filter((a) => a.projectId !== p.id);
      st.opportunities.forEach((o) => { if (o.projectId === p.id) o.projectId = null; });
    });
    location.hash = '#/projects';
  }
}

function stageForm(p, st = null) {
  formModal({
    title: st ? 'Edit stage' : 'Add stage',
    fields: [
      { name: 'name', label: 'Stage name', value: st?.name, required: true, full: true, placeholder: 'e.g. RIBA 4 Technical design' },
      { name: 'feeType', label: 'Fee basis', type: 'select', value: st?.feeType ?? 'Fixed', options: [{ value: 'Fixed', label: 'Fixed fee' }, { value: 'T&M', label: 'Time & materials' }] },
      { name: 'fee', label: 'Fee (£)', type: 'number', min: 0, step: 50, value: st?.fee ?? '', required: true, hint: 'For time & materials, the estimate or cap.' },
      { name: 'budgetHours', label: 'Budget hours', type: 'number', min: 0, step: 0.5, value: st?.budgetHours ?? '', hint: 'Leave blank to estimate from the fee at £85/h.' },
      { name: 'percentComplete', label: '% complete', type: 'number', min: 0, max: 100, step: 5, value: st?.percentComplete ?? 0, hint: 'Fixed-fee stages only.' },
      { name: 'startDate', label: 'Start date', type: 'date', value: st?.startDate },
      { name: 'weeks', label: 'Duration (weeks)', type: 'number', min: 1, max: 260, value: st?.weeks ?? '' },
    ],
    extraActions: st ? [{ label: 'Delete', kind: 'danger', onClick: () => { removeStage(p, st); } }] : [],
    onSubmit: (v) => update(() => {
      const data = { ...v, budgetHours: v.budgetHours ?? Math.round(v.fee / 85), percentComplete: v.feeType === 'T&M' ? 0 : v.percentComplete ?? 0, startDate: v.startDate || null, weeks: v.weeks || null };
      if (st) Object.assign(st, data);
      else p.stages.push({ id: uid('stg'), ...data });
    }),
  });
}

async function removeStage(p, st) {
  const s = getState();
  if (s.timesheets.some((e) => e.stageId === st.id) || s.invoices.some((i) => i.lines.some((l) => l.stageId === st.id))) {
    toast('Time or invoices are booked to this stage, so it can\'t be deleted.', 'error');
    return;
  }
  if (await confirmDialog(`Delete the stage "${st.name}"?`, { okLabel: 'Delete', danger: true })) {
    update(() => {
      p.stages = p.stages.filter((x) => x.id !== st.id);
      p.invoiceSchedule = p.invoiceSchedule.filter((x) => x.stageId !== st.id);
    });
  }
}

function scheduleForm(p, x = null) {
  formModal({
    title: x ? 'Edit planned billing' : 'Plan billing',
    fields: [
      { name: 'month', label: 'Month', type: 'month', value: x?.month ?? addMonths(monthKey(todayISO()), 1), required: true },
      { name: 'stageId', label: 'Stage', type: 'select', value: x?.stageId, options: p.stages.map((st) => ({ value: st.id, label: st.name })), required: true },
      { name: 'amount', label: 'Amount (£, net)', type: 'number', min: 0, step: 50, value: x?.amount ?? '', required: true },
    ],
    extraActions: x ? [{ label: 'Delete', kind: 'danger', onClick: () => update(() => { p.invoiceSchedule = p.invoiceSchedule.filter((y) => y.id !== x.id); }) }] : [],
    onSubmit: (v) => update(() => {
      if (x) Object.assign(x, v);
      else p.invoiceSchedule.push({ id: uid('sch'), ...v });
    }),
  });
}

function spreadForm(p, f) {
  const thisMonth = monthKey(todayISO());
  formModal({
    title: 'Spread the remaining fee',
    intro: 'Replaces planned billing from this month on. Each stage\'s fee not yet invoiced is split evenly across the months you choose.',
    fields: [
      { name: 'from', label: 'First month', type: 'month', value: thisMonth, required: true },
      { name: 'months', label: 'Number of months', type: 'number', min: 1, max: 36, value: 6, required: true },
    ],
    submitLabel: 'Spread fee',
    onSubmit: (v) => update(() => {
      p.invoiceSchedule = p.invoiceSchedule.filter((x) => x.month < thisMonth);
      for (const r of f.stages) {
        const left = Math.round(r.stage.fee - r.invoiced);
        if (left <= 0) continue;
        const each = Math.round(left / v.months / 10) * 10;
        for (let i = 0; i < v.months; i++) {
          p.invoiceSchedule.push({ id: uid('sch'), stageId: r.stage.id, month: addMonths(v.from, i), amount: i === v.months - 1 ? left - each * (v.months - 1) : each });
        }
      }
    }),
  });
}


// Rank people for a role on this job by skills and availability.
function findPeopleModal(p) {
  const s = getState();
  const grades = [...new Set(s.staff.filter((x) => x.billable).map((x) => x.grade))];
  const body = html`<div class="form-grid">
      <div class="field"><label for="fp-grade">Grade</label><select id="fp-grade">${options(grades, '', { placeholder: 'Any grade' })}</select></div>
      <div class="field"><label for="fp-weeks">Over the next</label><select id="fp-weeks">${options([{ value: 2, label: '2 weeks' }, { value: 4, label: '4 weeks' }, { value: 8, label: '8 weeks' }, { value: 12, label: '12 weeks' }], 4)}</select></div>
      <fieldset class="field full" style="border:0;padding:0;margin:0"><legend style="font-size:12.5px;font-weight:700;color:var(--ink-2);margin-bottom:4px">Skills needed</legend>
        <div class="people" style="gap:4px 14px">${(s.settings.skills || []).map((k) => html`<label class="check"><input type="checkbox" name="fp-skill" value="${k}"> ${k}</label>`)}</div></fieldset>
    </div>
    <div id="fp-results" style="margin-top:14px"></div>`;
  openModal({
    title: `Find people for ${p.jobNo}`, size: 'xwide', body, actions: [{ label: 'Close' }],
    onMount: (el) => {
      const run = () => {
        const skills = [...el.querySelectorAll('[name=fp-skill]:checked')].map((x) => x.value);
        const res = findPeople(getState(), { skills, grade: el.querySelector('#fp-grade').value, from: weekStart(todayISO()), weeks: Number(el.querySelector('#fp-weeks').value) }).slice(0, 10);
        el.querySelector('#fp-results').innerHTML = String(table({
          id: 'fp', rows: res, compact: true, empty: 'Nobody matches.',
          columns: [
            { key: 'name', label: 'Person', sortable: false, render: (r) => html`<strong>${r.person.name}</strong><span class="cell-sub">${r.person.grade} · ${officeName(r.person.officeId)}</span>` },
            { key: 'skills', label: 'Skills', sortable: false, render: (r) => (skills.length ? html`${r.matched.length} of ${skills.length}${r.missing.length ? html`<span class="cell-sub">missing ${r.missing.join(', ')}</span>` : ''}` : html`<span class="muted">${(r.person.skills || []).map((x) => x.skill).slice(0, 3).join(', ')}</span>`) },
            { key: 'free', label: 'Free hours', align: 'num', sortable: false, render: (r) => html`${hrs(r.free)} <span class="muted">of ${hrs(r.capacity)}</span>` },
            { key: 'cost', label: 'Cost /h', align: 'num', sortable: false, render: (r) => money(r.person.costRate) },
            { key: 'score', label: 'Fit', sortable: false, render: (r) => meter(r.score, 100, { label: `fit ${r.score} out of 100` }), width: '140px' },
            { key: 'add', label: '', sortable: false, render: (r) => (p.team.includes(r.person.id) ? html`<span class="muted">On team</span>` : html`<button type="button" class="btn small" data-fp-add="${r.person.id}">Add to team</button>`) },
          ],
        }));
        el.querySelectorAll('[data-fp-add]').forEach((b) => b.addEventListener('click', () => {
          update(() => { if (!p.team.includes(b.dataset.fpAdd)) p.team.push(b.dataset.fpAdd); });
          toast(`${staffName(b.dataset.fpAdd)} added to the team.`);
          run();
        }));
      };
      el.addEventListener('change', run);
      run();
    },
  });
}
