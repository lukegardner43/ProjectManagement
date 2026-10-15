import { getState, update, find, staffName, currentUser, isManager, activeStaff } from '../store.js';
import { html, money2, fmtDate, todayISO, sum, uid, round2 } from '../util.js';
import { pageHead, table, pill, tile, options, formModal, toast, confirmDialog } from '../ui.js';

const CATEGORIES = ['Mileage', 'Rail travel', 'Parking', 'Subsistence', 'Accommodation', 'Printing', 'Equipment', 'Other'];
const MILEAGE_RATE = 0.45;

export function render(root, { query }) {
  const s = getState();
  const me = currentUser();
  const who = isManager() ? query.get('staff') ?? me.id : me.id;
  const status = query.get('status') || '';
  const rows = s.expenses.filter((x) => (!who || x.staffId === who) && (!status || x.status === status));
  const mine = s.expenses.filter((x) => x.staffId === me.id);
  const q = (k, v) => { const u = new URLSearchParams(query); u.set(k, v); return `#/expenses?${u}`; };

  root.innerHTML = String(html`
    ${pageHead('Expenses', { sub: 'Claims are approved by a manager, then paid with payroll. Rechargeable expenses are billed to the client.', actions: html`<button type="button" class="btn primary" id="new-expense">New claim</button>` })}
    <section class="tiles">
      ${tile({ label: 'My claims waiting', value: money2(sum(mine.filter((x) => x.status === 'Submitted'), (x) => x.amount)), sub: `${mine.filter((x) => x.status === 'Submitted').length} claims` })}
      ${tile({ label: 'Approved, to be paid', value: money2(sum(mine.filter((x) => x.status === 'Approved'), (x) => x.amount)) })}
      ${tile({ label: 'Rejected', value: String(mine.filter((x) => x.status === 'Rejected').length), sub: 'edit and resubmit' })}
    </section>
    <div class="toolbar">
      ${isManager() ? html`<label>Person <select class="select" data-q="staff">${options(activeStaff().map((p) => ({ value: p.id, label: p.name })), who, { placeholder: 'Everyone' })}</select></label>` : ''}
      <label>Status <select class="select" data-q="status">${options(['Submitted', 'Approved', 'Rejected', 'Paid'], status, { placeholder: 'All' })}</select></label>
    </div>
    <div class="card"><div class="card-body">${table({
      id: 'expenses', rows, defaultSort: { key: 'date', dir: -1 }, empty: 'No claims.',
      columns: [
        { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
        ...(who ? [] : [{ key: 'who', label: 'Person', value: (x) => staffName(x.staffId) }]),
        { key: 'project', label: 'Job', value: (x) => find('projects', x.projectId)?.jobNo || 'Overhead', render: (x) => (x.projectId ? html`<a href="#/projects/${x.projectId}/expenses"><span class="job">${find('projects', x.projectId)?.jobNo}</span></a>` : 'Overhead') },
        { key: 'category', label: 'Category' },
        { key: 'description', label: 'Description', render: (x) => html`${x.description}${x.comment ? html`<span class="cell-sub neg">${x.comment}</span>` : ''}` },
        { key: 'chargeable', label: 'Recharge', render: (x) => (x.chargeable ? 'Yes' : 'No') },
        { key: 'amount', label: 'Amount', align: 'num', render: (x) => money2(x.amount) },
        { key: 'status', label: 'Status', render: (x) => pill(x.status) },
        { key: 'act', label: '', sortable: false, render: (x) => (['Submitted', 'Rejected'].includes(x.status) && (x.staffId === me.id || isManager()) ? html`<button type="button" class="btn small link" data-edit="${x.id}">Edit</button>` : x.status === 'Approved' && isManager() ? html`<button type="button" class="btn small link" data-paid="${x.id}">Mark paid</button>` : '') },
      ],
      footer: { date: `${rows.length} claims`, amount: money2(sum(rows, (x) => x.amount)) },
    })}</div></div>`);

  root.querySelectorAll('[data-q]').forEach((sel) => sel.addEventListener('change', () => { location.hash = q(sel.dataset.q, sel.value); }));
  root.querySelector('#new-expense').addEventListener('click', () => expenseForm());
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => expenseForm(find('expenses', b.dataset.edit))));
  root.querySelectorAll('[data-paid]').forEach((b) => b.addEventListener('click', () => {
    update(() => { find('expenses', b.dataset.paid).status = 'Paid'; });
    toast('Marked as paid.');
  }));
}

export function expenseForm(x = null, preset = {}) {
  const s = getState();
  const me = currentUser();
  const projects = s.projects.filter((p) => !p.internal && ['Live', 'On hold'].includes(p.status));
  formModal({
    title: x ? 'Edit claim' : 'New expense claim',
    intro: x?.status === 'Rejected' ? 'Saving sends this claim back for approval.' : '',
    fields: [
      { name: 'date', label: 'Date', type: 'date', value: x?.date ?? todayISO(), required: true, max: todayISO() },
      { name: 'category', label: 'Category', type: 'select', value: x?.category ?? 'Mileage', options: CATEGORIES },
      { name: 'projectId', label: 'Job', type: 'select', value: x?.projectId ?? preset.projectId ?? '', options: projects.map((p) => ({ value: p.id, label: `${p.jobNo} ${p.name}` })), placeholder: 'Overhead (no job)', full: true },
      { name: 'description', label: 'Description', value: x?.description, required: true, full: true },
      { name: 'miles', label: 'Miles (mileage only)', type: 'number', min: 0, step: 1, hint: `Works out the amount at ${MILEAGE_RATE * 100}p a mile.` },
      { name: 'amount', label: 'Amount (£)', type: 'number', min: 0.01, step: 0.01, value: x?.amount ?? '', required: true },
      { name: 'chargeable', label: 'Recharge to the client', type: 'checkbox', value: x?.chargeable ?? true },
      { name: 'receipt', label: 'I have a receipt', type: 'checkbox', value: x?.receipt ?? true },
    ],
    extraActions: x ? [{ label: 'Delete', kind: 'danger', onClick: () => { removeExpense(x); } }] : [],
    onMount: (el) => {
      const miles = el.querySelector('[name=miles]');
      miles.addEventListener('input', () => {
        if (miles.value) {
          el.querySelector('[name=amount]').value = round2(Number(miles.value) * MILEAGE_RATE).toFixed(2);
          el.querySelector('[name=category]').value = 'Mileage';
        }
      });
    },
    onSubmit: (v) => {
      if (v.chargeable && !v.projectId) return 'Only expenses on a job can be recharged to a client.';
      const { miles, ...data } = v;
      if (miles && !data.description.includes('mile')) data.description += ` (${miles} miles)`;
      update((st) => {
        if (x) Object.assign(x, data, { status: 'Submitted', comment: '' });
        else st.expenses.push({ id: uid('exp'), staffId: me.id, ...data, projectId: data.projectId || null, status: 'Submitted', approvedBy: null });
      });
      toast('Claim submitted for approval.');
    },
  });
}

async function removeExpense(x) {
  if (await confirmDialog('Delete this claim?', { okLabel: 'Delete', danger: true })) {
    update((s) => { s.expenses = s.expenses.filter((e) => e.id !== x.id); });
  }
}
