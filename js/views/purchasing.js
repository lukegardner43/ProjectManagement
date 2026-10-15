// Purchase orders for subconsultants and suppliers. Orders over the approval
// limit need a manager; supplier invoices against an order become project cost,
// and rechargeable ones are billed on to the client like expenses.

import { getState, update, find, staffName, currentUser, isManager, clientProjects } from '../store.js';
import { html, money, money2, fmtDate, todayISO, fyRange, sum, uid, toCSV } from '../util.js';
import { pageHead, table, tile, options, formModal, toast, confirmDialog, download } from '../ui.js';

export const PO_STATUSES = ['Draft', 'Approved', 'Raised', 'Invoiced', 'Paid', 'Cancelled'];

export function poTable(rows, { id = 'pos', showProject = false } = {}) {
  return table({
    id, rows, defaultSort: { key: 'date', dir: -1 }, empty: 'No purchase orders.',
    columns: [
      { key: 'number', label: 'Order', render: (x) => html`<button type="button" class="btn link cell-main" data-po="${x.id}">${x.number}</button>` },
      ...(showProject ? [{ key: 'job', label: 'Job', value: (x) => find('projects', x.projectId)?.jobNo, render: (x) => html`<a href="#/projects/${x.projectId}/costs"><span class="job">${find('projects', x.projectId)?.jobNo}</span></a>` }] : []),
      { key: 'supplier', label: 'Supplier', render: (x) => html`<strong>${x.supplier}</strong><span class="cell-sub">${x.description}</span>` },
      { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
      { key: 'recharge', label: 'Recharge', value: (x) => (x.rechargeable ? 1 : 0), render: (x) => (x.rechargeable ? 'Yes' : 'No') },
      { key: 'amount', label: 'Amount', align: 'num', render: (x) => money2(x.amount) },
      { key: 'status', label: 'Status', value: (x) => PO_STATUSES.indexOf(x.status), render: (x) => statusPill(x.status) },
    ],
  });
}

function statusPill(status) {
  const kind = { Draft: 'neutral', Approved: 'info', Raised: 'info', Invoiced: 'warning', Paid: 'good', Cancelled: 'muted' }[status];
  return html`<span class="pill pill-${kind}">${status === 'Paid' ? html`<span aria-hidden="true">✓</span>` : ''}${status}</span>`;
}

export function render(root, { query }) {
  const s = getState();
  const today = todayISO();
  const fy = fyRange(today, s.settings.fyStartMonth);
  const status = query.get('status') || '';
  const rows = s.purchaseOrders.filter((x) => !status || x.status === status);
  const committed = s.purchaseOrders.filter((x) => ['Approved', 'Raised'].includes(x.status));
  const toPay = s.purchaseOrders.filter((x) => x.status === 'Invoiced');
  const waiting = s.purchaseOrders.filter((x) => x.status === 'Draft' && x.amount > (s.settings.poApprovalLimit ?? 0));

  root.innerHTML = String(html`
    ${pageHead('Purchase orders', { sub: `Subconsultants, surveys and other bought-in services. Orders over ${money(s.settings.poApprovalLimit)} need a manager's approval.`, actions: html`<button type="button" class="btn" id="export">Export CSV</button><button type="button" class="btn primary" id="new-po">New purchase order</button>` })}
    <section class="tiles">
      ${tile({ label: 'Committed', value: money(sum(committed, (x) => x.amount)), sub: `${committed.length} approved or sent` })}
      ${tile({ label: 'Supplier invoices to pay', value: money(sum(toPay, (x) => x.amount)), sub: `${toPay.length} invoices` })}
      ${tile({ label: `Spent, ${fy.label}`, value: money(sum(s.purchaseOrders.filter((x) => ['Invoiced', 'Paid'].includes(x.status) && x.date >= fy.start), (x) => x.amount)) })}
      ${tile({ label: 'Waiting for approval', value: String(waiting.length), href: '#/approvals/purchasing' })}
    </section>
    <div class="toolbar"><label>Status <select class="select" data-q="status">${options(PO_STATUSES, status, { placeholder: 'All' })}</select></label></div>
    <div class="card"><div class="card-body">${poTable(rows, { showProject: true })}</div></div>`);

  root.querySelector('[data-q]').addEventListener('change', (e) => { location.hash = e.target.value ? `#/purchase-orders?status=${e.target.value}` : '#/purchase-orders'; });
  root.querySelector('#new-po').addEventListener('click', () => poForm());
  root.querySelectorAll('[data-po]').forEach((b) => b.addEventListener('click', () => poForm(getState().purchaseOrders.find((x) => x.id === b.dataset.po))));
  root.querySelector('#export').addEventListener('click', () => download(`purchase-orders-${today}.csv`, toCSV([
    ['Order', 'Job', 'Supplier', 'Description', 'Date', 'Amount', 'Rechargeable', 'Status', 'Supplier invoice'],
    ...rows.map((x) => [x.number, find('projects', x.projectId)?.jobNo, x.supplier, x.description, x.date, x.amount, x.rechargeable ? 'Yes' : 'No', x.status, x.supplierInvoice || '']),
  ])));
}

export function poForm(po = null, preset = {}) {
  const s = getState();
  const limit = s.settings.poApprovalLimit ?? 0;
  const suppliers = [...new Set(s.purchaseOrders.map((x) => x.supplier))].sort();
  const editable = !po || ['Draft', 'Approved'].includes(po.status);
  const next = {
    Draft: po && po.amount > limit && isManager() ? [{ label: 'Approve', kind: 'primary', status: 'Approved' }] : [],
    Approved: [{ label: 'Mark as sent to supplier', kind: 'primary', status: 'Raised' }],
    Raised: [{ label: 'Record supplier invoice', kind: 'primary', status: 'Invoiced' }],
    Invoiced: [{ label: 'Mark as paid', kind: 'primary', status: 'Paid' }],
  }[po?.status] || [];
  formModal({
    title: po ? `${po.number} · ${po.status}` : 'New purchase order',
    intro: po ? `Raised by ${staffName(po.raisedBy)} on ${fmtDate(po.date)}${po.approvedBy ? `, approved by ${staffName(po.approvedBy)}` : ''}.` : `Orders up to ${money(limit)} are approved automatically.`,
    fields: [
      { name: 'projectId', label: 'Job', type: 'select', value: po?.projectId || preset.projectId || '', required: true, full: true, placeholder: 'Choose…', options: clientProjects().filter((p) => ['Live', 'On hold'].includes(p.status) || p.id === po?.projectId).map((p) => ({ value: p.id, label: `${p.jobNo} ${p.name}` })) },
      { name: 'supplier', label: 'Supplier', value: po?.supplier, required: true, hint: suppliers.length ? `e.g. ${suppliers.slice(0, 2).join(', ')}` : '' },
      { name: 'amount', label: 'Amount (£, net)', type: 'number', min: 0.01, step: 0.01, value: po?.amount ?? '', required: true },
      { name: 'description', label: 'What for', value: po?.description, required: true, full: true },
      { name: 'rechargeable', label: 'Recharge to the client at cost', type: 'checkbox', value: po?.rechargeable ?? true, full: true },
      ...(po && ['Raised', 'Invoiced', 'Paid'].includes(po.status) ? [{ name: 'supplierInvoice', label: 'Supplier invoice number', value: po.supplierInvoice, required: po.status !== 'Raised' }] : []),
    ],
    submitLabel: po ? 'Save' : 'Create order',
    extraActions: [
      ...(po && po.status === 'Draft' ? [{ label: 'Delete', kind: 'danger', onClick: () => { removePo(po); } }] : []),
      ...(po && !['Paid', 'Cancelled'].includes(po.status) ? [{ label: 'Cancel order', onClick: () => { setStatus(po, 'Cancelled'); } }] : []),
      ...next.map((n) => ({ label: n.label, kind: 'secondary', onClick: (el) => {
        const inv = el.querySelector('[name=supplierInvoice]');
        if (n.status === 'Invoiced' && inv && !inv.value.trim()) { inv.focus(); toast('Enter the supplier invoice number first.', 'error'); return false; }
        setStatus(po, n.status, inv?.value.trim());
      } })),
    ],
    onSubmit: (v) => {
      if (po && !editable && Math.abs(v.amount - po.amount) > 0.005 && po.status !== 'Raised') return 'The amount can\'t change once the supplier has invoiced.';
      update((st) => {
        if (po) {
          Object.assign(po, { projectId: v.projectId, supplier: v.supplier, amount: v.amount, description: v.description, rechargeable: v.rechargeable });
          if (v.supplierInvoice !== undefined) po.supplierInvoice = v.supplierInvoice;
          // Raising an approved order above the limit sends it back for approval.
          if (po.status === 'Approved' && v.amount > limit && !po.approvedBy) po.status = 'Draft';
        } else {
          const n = st.settings.nextPoNo++;
          const auto = v.amount <= limit;
          st.purchaseOrders.push({
            id: uid('po'), number: `PO-${String(n).padStart(4, '0')}`, ...v, status: auto ? 'Approved' : 'Draft', date: todayISO(),
            raisedBy: currentUser().id, approvedBy: null, supplierInvoice: '',
          });
        }
      });
      toast(po ? 'Order saved.' : v.amount <= limit ? 'Order created and approved.' : 'Order created; it needs a manager\'s approval.');
    },
  });
}

export function setStatus(po, status, supplierInvoice) {
  update(() => {
    po.status = status;
    if (status === 'Approved') po.approvedBy = currentUser().id;
    if (supplierInvoice !== undefined && supplierInvoice !== null) po.supplierInvoice = supplierInvoice;
  });
  toast(`${po.number}: ${status.toLowerCase()}.`);
}

async function removePo(po) {
  if (await confirmDialog(`Delete ${po.number}?`, { okLabel: 'Delete', danger: true })) {
    update((s) => { s.purchaseOrders = s.purchaseOrders.filter((x) => x.id !== po.id); });
  }
}
