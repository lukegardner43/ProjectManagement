import { getState, update, find, staffName, isManager, currentUser, activeStaff } from '../store.js';
import { html, money, money2, hrs, fmtDate, todayISO, weekStart, addDays, sum, workingDays } from '../util.js';
import * as C from '../calc.js';
import { pageHead, table, tabs, pill, toast, formModal, empty } from '../ui.js';
import { approveWeek, rejectWeek } from './timesheets.js';
import { invoiceView, approveInvoice } from './invoices.js';
import { costEstimate } from '../estimate.js';
import { setStatus as setPoStatus } from './purchasing.js';

export function render(root, { params: [tab = 'timesheets'] }) {
  const s = getState();
  if (!isManager()) {
    root.innerHTML = String(html`${pageHead('Approvals')}${empty('Approvals are for managers', `${currentUser().name} isn't set up as an approver. Directors and associates can be made approvers in Settings → People.`)}`);
    return;
  }
  const today = todayISO();
  const lastWeek = addDays(weekStart(today), -7);
  const internal = new Set(s.projects.filter((p) => p.internal).map((p) => p.id));
  const weeks = s.timesheetWeeks.filter((w) => w.status === 'Submitted');
  const exps = s.expenses.filter((x) => x.status === 'Submitted');
  const leave = s.leave.filter((l) => l.status === 'Requested');
  const drafts = s.invoices.filter((i) => i.status === 'Draft');
  const ests = s.estimates.filter((e) => e.status === 'Submitted');
  const pos = s.purchaseOrders.filter((p) => p.status === 'Draft' && p.amount > (s.settings.poApprovalLimit ?? 0));
  const missing = activeStaff().filter((p) => !['Submitted', 'Approved'].includes(C.weekStatus(s, p.id, lastWeek)));

  const weekHours = (w) => {
    const list = s.timesheets.filter((e) => e.staffId === w.staffId && e.date >= w.weekStart && e.date <= addDays(w.weekStart, 6));
    return { total: sum(list, (e) => e.hours), chargeable: sum(list.filter((e) => !internal.has(e.projectId)), (e) => e.hours) };
  };

  const bodies = {
    timesheets: () => html`
      <section class="card"><div class="card-head"><h2>Submitted timesheets</h2>${weeks.length > 1 ? html`<button type="button" class="btn small primary" id="approve-all">Approve all ${weeks.length}</button>` : ''}</div><div class="card-body">${table({
        id: 'ap-weeks', rows: weeks, defaultSort: { key: 'week', dir: 1 }, empty: 'No timesheets waiting.',
        columns: [
          { key: 'who', label: 'Person', value: (w) => staffName(w.staffId) },
          { key: 'week', label: 'Week of', value: (w) => w.weekStart, render: (w) => fmtDate(w.weekStart) },
          { key: 'hours', label: 'Hours', align: 'num', value: (w) => weekHours(w).total, render: (w) => hrs(weekHours(w).total) },
          { key: 'chargeable', label: 'Chargeable', align: 'num', value: (w) => weekHours(w).chargeable, render: (w) => `${hrs(weekHours(w).chargeable)} h` },
          { key: 'submitted', label: 'Submitted', render: (w) => fmtDate(w.submittedAt) },
          { key: 'act', label: '', sortable: false, render: (w) => html`<span class="page-actions"><a class="btn small" href="#/timesheets?staff=${w.staffId}&week=${w.weekStart}">View</a><button type="button" class="btn small" data-reject-week="${w.staffId}|${w.weekStart}">Reject</button><button type="button" class="btn small primary" data-approve-week="${w.staffId}|${w.weekStart}">Approve</button></span>` },
        ],
      })}</div></section>
      <section class="card"><div class="card-head"><h2>Not yet submitted for the week of ${fmtDate(lastWeek)}</h2></div><div class="card-body">
        ${missing.length ? missing.map((p) => html`<div class="kv"><span>${p.name}</span><span class="page-actions">${pill(C.weekStatus(s, p.id, lastWeek))}<a class="btn small" href="#/timesheets?staff=${p.id}&week=${lastWeek}">Open</a></span></div>`) : html`<p class="muted">Everyone has submitted.</p>`}
      </div></section>`,
    expenses: () => html`<section class="card"><div class="card-head"><h2>Expense claims</h2>${exps.length > 1 ? html`<button type="button" class="btn small primary" id="approve-all-exp">Approve all ${exps.length}</button>` : ''}</div><div class="card-body">${table({
      id: 'ap-exp', rows: exps, defaultSort: { key: 'date', dir: 1 }, empty: 'No claims waiting.',
      columns: [
        { key: 'who', label: 'Claimed by', value: (x) => staffName(x.staffId) },
        { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
        { key: 'project', label: 'Job', value: (x) => find('projects', x.projectId)?.jobNo || 'Overhead' },
        { key: 'category', label: 'Category' },
        { key: 'description', label: 'Description', render: (x) => html`${x.description}${x.receipt ? '' : html` <span class="flag flag-warning">No receipt</span>`}` },
        { key: 'amount', label: 'Amount', align: 'num', render: (x) => money2(x.amount) },
        { key: 'act', label: '', sortable: false, render: (x) => html`<span class="page-actions"><button type="button" class="btn small" data-reject-exp="${x.id}">Reject</button><button type="button" class="btn small primary" data-approve-exp="${x.id}">Approve</button></span>` },
      ],
      footer: { who: `${exps.length} claims`, amount: money2(sum(exps, (x) => x.amount)) },
    })}</div></section>`,
    leave: () => html`<section class="card"><div class="card-head"><h2>Leave requests</h2></div><div class="card-body">${table({
      id: 'ap-leave', rows: leave, defaultSort: { key: 'start', dir: 1 }, empty: 'No leave requests waiting.',
      columns: [
        { key: 'who', label: 'Person', value: (l) => staffName(l.staffId) },
        { key: 'type', label: 'Type' },
        { key: 'start', label: 'Dates', render: (l) => `${fmtDate(l.start)}${l.end !== l.start ? ` – ${fmtDate(l.end)}` : ''}${l.halfDay ? ' (half day)' : ''}` },
        { key: 'days', label: 'Days', align: 'num', value: (l) => (l.halfDay ? 0.5 : workingDays(l.start, l.end)), render: (l) => (l.halfDay ? '0.5' : workingDays(l.start, l.end)) },
        { key: 'clash', label: 'Also off', sortable: false, render: (l) => {
          const off = s.leave.filter((o) => o.id !== l.id && o.status === 'Approved' && o.start <= l.end && o.end >= l.start).map((o) => staffName(o.staffId));
          return off.length ? off.join(', ') : html`<span class="muted">Nobody</span>`;
        } },
        { key: 'note', label: 'Note' },
        { key: 'act', label: '', sortable: false, render: (l) => html`<span class="page-actions"><button type="button" class="btn small" data-decline="${l.id}">Decline</button><button type="button" class="btn small primary" data-approve-leave="${l.id}">Approve</button></span>` },
      ],
    })}</div></section>`,
    invoices: () => html`<section class="card"><div class="card-head"><h2>Draft invoices</h2></div><div class="card-body">${table({
      id: 'ap-inv', rows: drafts, defaultSort: { key: 'date', dir: 1 }, empty: 'No draft invoices.',
      columns: [
        { key: 'number', label: 'Number', render: (i) => html`<button type="button" class="btn link cell-main" data-view-inv="${i.id}">${i.number}</button>` },
        { key: 'project', label: 'Project', value: (i) => find('projects', i.projectId)?.jobNo, render: (i) => html`<span class="job">${find('projects', i.projectId)?.jobNo}</span> ${find('projects', i.projectId)?.name}` },
        { key: 'date', label: 'Date', render: (i) => fmtDate(i.date) },
        { key: 'net', label: 'Net', align: 'num', value: C.invoiceNet, render: (i) => money(C.invoiceNet(i)) },
        { key: 'by', label: 'Raised by', value: (i) => staffName(i.createdBy) },
        { key: 'act', label: '', sortable: false, render: (i) => html`<span class="page-actions"><button type="button" class="btn small" data-view-inv="${i.id}">View</button><button type="button" class="btn small primary" data-approve-inv="${i.id}">Approve</button></span>` },
      ],
    })}</div></section>`,
    estimates: () => html`<section class="card"><div class="card-head"><h2>Fee estimates</h2></div><div class="card-body">${table({
      id: 'ap-est', rows: ests, empty: 'No fee estimates waiting.',
      columns: [
        { key: 'name', label: 'Estimate', render: (e) => html`<a class="cell-main" href="#/estimates/${e.id}">${e.name}</a><span class="cell-sub">by ${staffName(e.createdBy)}</span>` },
        { key: 'fee', label: 'Fee', align: 'num', value: (e) => costEstimate(s, e).fee, render: (e) => money(costEstimate(s, e).fee) },
        { key: 'margin', label: 'Margin', align: 'num', render: (e) => { const c = costEstimate(s, e); return html`<span class="${c.belowTarget ? 'neg' : ''}">${Math.round((c.margin ?? 0) * 100)}%</span> <span class="muted">target ${Math.round(e.targetMargin * 100)}%</span>`; } },
        { key: 'act', label: '', sortable: false, render: (e) => html`<span class="page-actions"><a class="btn small" href="#/estimates/${e.id}">Review</a><button type="button" class="btn small primary" data-approve-est="${e.id}">Approve</button></span>` },
      ],
    })}</div></section>`,
    purchasing: () => html`<section class="card"><div class="card-head"><h2>Purchase orders over ${money(s.settings.poApprovalLimit)}</h2></div><div class="card-body">${table({
      id: 'ap-po', rows: pos, empty: 'No purchase orders waiting.',
      columns: [
        { key: 'number', label: 'Order' },
        { key: 'job', label: 'Job', value: (x) => find('projects', x.projectId)?.jobNo, render: (x) => html`<span class="job">${find('projects', x.projectId)?.jobNo}</span>` },
        { key: 'supplier', label: 'Supplier', render: (x) => html`${x.supplier}<span class="cell-sub">${x.description}</span>` },
        { key: 'by', label: 'Raised by', value: (x) => staffName(x.raisedBy) },
        { key: 'amount', label: 'Amount', align: 'num', render: (x) => money2(x.amount) },
        { key: 'act', label: '', sortable: false, render: (x) => html`<span class="page-actions"><button type="button" class="btn small" data-reject-po="${x.id}">Cancel</button><button type="button" class="btn small primary" data-approve-po="${x.id}">Approve</button></span>` },
      ],
    })}</div></section>`,
  };

  root.innerHTML = String(html`
    ${pageHead('Approvals', { sub: 'Everything waiting on a manager, across all offices.' })}
    ${tabs([
      { key: 'timesheets', label: 'Timesheets', href: '#/approvals/timesheets', count: weeks.length },
      { key: 'expenses', label: 'Expenses', href: '#/approvals/expenses', count: exps.length },
      { key: 'leave', label: 'Leave', href: '#/approvals/leave', count: leave.length },
      { key: 'invoices', label: 'Invoices', href: '#/approvals/invoices', count: drafts.length },
      { key: 'estimates', label: 'Fee estimates', href: '#/approvals/estimates', count: ests.length },
      { key: 'purchasing', label: 'Purchase orders', href: '#/approvals/purchasing', count: pos.length },
    ], tab)}
    <div class="stack">${(bodies[tab] || bodies.timesheets)()}</div>`);

  const on = (sel, fn) => root.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
  on('[data-approve-week]', (b) => { const [id, w] = b.dataset.approveWeek.split('|'); approveWeek(id, w); toast('Approved.'); });
  on('[data-reject-week]', (b) => { const [id, w] = b.dataset.rejectWeek.split('|'); rejectWeek(id, w); });
  on('#approve-all', () => { weeks.forEach((w) => approveWeek(w.staffId, w.weekStart)); toast(`${weeks.length} timesheets approved.`); });
  on('[data-approve-exp]', (b) => setExpense(b.dataset.approveExp, 'Approved'));
  on('[data-reject-exp]', (b) => formModal({
    title: 'Reject claim', fields: [{ name: 'comment', label: 'Reason', type: 'textarea', required: true, full: true }], submitLabel: 'Reject',
    onSubmit: (v) => setExpense(b.dataset.rejectExp, 'Rejected', v.comment),
  }));
  on('#approve-all-exp', () => { update((st) => st.expenses.forEach((x) => { if (x.status === 'Submitted') { x.status = 'Approved'; x.approvedBy = currentUser().id; } })); toast('Claims approved.'); });
  on('[data-approve-leave]', (b) => setLeave(b.dataset.approveLeave, 'Approved'));
  on('[data-decline]', (b) => setLeave(b.dataset.decline, 'Rejected'));
  on('[data-view-inv]', (b) => invoiceView(find('invoices', b.dataset.viewInv)));
  on('[data-approve-inv]', (b) => approveInvoice(find('invoices', b.dataset.approveInv)));
  on('[data-approve-est]', (b) => { update((st) => { const e = st.estimates.find((x) => x.id === b.dataset.approveEst); e.status = 'Approved'; e.approvedBy = currentUser().id; }); toast('Estimate approved.'); });
  on('[data-approve-po]', (b) => setPoStatus(s.purchaseOrders.find((x) => x.id === b.dataset.approvePo), 'Approved'));
  on('[data-reject-po]', (b) => setPoStatus(s.purchaseOrders.find((x) => x.id === b.dataset.rejectPo), 'Cancelled'));
}

function setExpense(id, status, comment = '') {
  update((s) => { const x = s.expenses.find((e) => e.id === id); x.status = status; x.approvedBy = currentUser().id; x.comment = comment; });
  toast(`Claim ${status.toLowerCase()}.`);
}

function setLeave(id, status) {
  update((s) => { const l = s.leave.find((e) => e.id === id); l.status = status; l.decidedBy = currentUser().id; });
  toast(status === 'Approved' ? 'Leave approved.' : 'Leave declined.');
}
