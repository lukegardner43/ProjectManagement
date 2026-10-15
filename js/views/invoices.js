import { getState, update, find, clientName, staffName, clientProjects, currentUser, isManager, stageName } from '../store.js';
import { html, raw, money, money2, fmtDate, todayISO, fyRange, addDays, sum, round2, toCSV } from '../util.js';
import * as C from '../calc.js';
import { pageHead, table, pill, tile, options, openModal, formModal, toast, confirmDialog, download } from '../ui.js';

const STATUSES = ['Draft', 'Approved', 'Sent', 'Overdue', 'Paid'];

export function list(root, { query }) {
  const s = getState();
  const today = todayISO();
  const fy = fyRange(today, s.settings.fyStartMonth);
  const lastFy = fyRange(addDays(fy.start, -1), s.settings.fyStartMonth);
  const status = query.get('status') || '';
  const period = query.get('period') || 'fy';
  const range = period === 'fy' ? fy : period === 'last' ? lastFy : null;
  const rows = s.invoices.filter((i) => (!status || C.invoiceDisplayStatus(i, today) === status) && (!range || C.inRange(i.date, range) || i.status === 'Draft'));
  const outstanding = s.invoices.filter((i) => i.status === 'Sent');
  const overdue = outstanding.filter((i) => C.invoiceDisplayStatus(i, today) === 'Overdue');
  const q = (k, v) => { const u = new URLSearchParams(query); u.set(k, v); return `#/invoices?${u}`; };
  const project = (i) => find('projects', i.projectId);

  root.innerHTML = String(html`
    ${pageHead('Invoices', { actions: html`<button type="button" class="btn" id="export">Export CSV</button><button type="button" class="btn primary" id="new-invoice">New invoice</button>` })}
    <section class="tiles">
      ${tile({ label: `Invoiced, ${fy.label}`, value: money(sum(s.invoices.filter((i) => i.status !== 'Draft' && C.inRange(i.date, fy)), C.invoiceNet)), sub: 'net' })}
      ${tile({ label: 'Outstanding', value: money(sum(outstanding, C.invoiceGross)), sub: `${outstanding.length} invoices, gross` })}
      ${tile({ label: 'Overdue', value: money(sum(overdue, C.invoiceGross)), sub: `${overdue.length} invoices`, tone: overdue.length ? 'critical' : '', href: '#/reports/aged-debt' })}
      ${tile({ label: 'Drafts', value: String(s.invoices.filter((i) => i.status === 'Draft').length), sub: 'waiting for approval', href: '#/approvals/invoices' })}
    </section>
    <div class="toolbar">
      <label>Status <select class="select" data-q="status">${options(STATUSES, status, { placeholder: 'All' })}</select></label>
      <label>Period <select class="select" data-q="period">${options([{ value: 'fy', label: fy.label }, { value: 'last', label: lastFy.label }, { value: 'all', label: 'All time' }], period)}</select></label>
    </div>
    <div class="card"><div class="card-body">${table({
      id: 'invoices', rows, defaultSort: { key: 'date', dir: -1 }, empty: 'No invoices match.',
      columns: [
        { key: 'number', label: 'Number', render: (i) => html`<button type="button" class="btn link cell-main" data-invoice="${i.id}">${i.number}</button>` },
        { key: 'project', label: 'Project', value: (i) => project(i)?.jobNo, render: (i) => html`<a href="#/projects/${i.projectId}/billing"><span class="job">${project(i)?.jobNo}</span></a> ${project(i)?.name}` },
        { key: 'client', label: 'Client', value: (i) => clientName(project(i)?.clientId) },
        { key: 'date', label: 'Date', render: (i) => fmtDate(i.date) },
        { key: 'dueDate', label: 'Due', render: (i) => fmtDate(i.dueDate) },
        { key: 'net', label: 'Net', align: 'num', value: C.invoiceNet, render: (i) => money(C.invoiceNet(i)) },
        { key: 'gross', label: 'Gross', align: 'num', value: C.invoiceGross, render: (i) => money(C.invoiceGross(i)) },
        { key: 'status', label: 'Status', value: (i) => C.invoiceDisplayStatus(i, today), render: (i) => pill(C.invoiceDisplayStatus(i, today)) },
      ],
      footer: { number: `${rows.length} invoices`, net: money(sum(rows, C.invoiceNet)), gross: money(sum(rows, C.invoiceGross)) },
    })}</div></div>`);

  root.querySelectorAll('[data-q]').forEach((sel) => sel.addEventListener('change', () => { location.hash = q(sel.dataset.q, sel.value); }));
  root.querySelectorAll('[data-invoice]').forEach((b) => b.addEventListener('click', () => invoiceView(find('invoices', b.dataset.invoice))));
  root.querySelector('#new-invoice').addEventListener('click', chooseProject);
  root.querySelector('#export').addEventListener('click', () => {
    download(`invoices-${today}.csv`, toCSV([
      ['Number', 'Job', 'Project', 'Client', 'Date', 'Due', 'Net', 'VAT', 'Gross', 'Status', 'Paid'],
      ...rows.map((i) => [i.number, project(i)?.jobNo, project(i)?.name, clientName(project(i)?.clientId), i.date, i.dueDate, round2(C.invoiceNet(i)), round2(C.invoiceVat(i)), round2(C.invoiceGross(i)), C.invoiceDisplayStatus(i, today), i.paidDate || '']),
    ]));
  });
}

function chooseProject() {
  formModal({
    title: 'New invoice',
    fields: [{ name: 'projectId', label: 'Project', type: 'select', required: true, full: true, placeholder: 'Choose…', options: clientProjects().filter((p) => C.BILLING_STATUSES.includes(p.status) || p.status === 'Complete').map((p) => ({ value: p.id, label: `${p.jobNo} ${p.name}` })) }],
    submitLabel: 'Next',
    onSubmit: (v) => { setTimeout(() => invoiceForm({ projectId: v.projectId }), 0); },
  });
}

// Create or edit a draft. New invoices suggest each stage's WIP and any
// rechargeable expenses not yet billed.
export function invoiceForm({ projectId = null, invoice = null }) {
  const s = getState();
  const p = find('projects', invoice?.projectId || projectId);
  const f = C.projectFinancials(p, C.makeCtx(s));
  const client = find('clients', p.clientId);
  const today = todayISO();
  const rows = [
    ...f.stages.map((r) => {
      const existing = invoice?.lines.find((l) => l.stageId === r.stage.id);
      const suggest = Math.max(0, Math.round(r.wip));
      return {
        stageId: r.stage.id, name: r.stage.name,
        on: invoice ? !!existing : suggest > 0,
        description: existing?.description || `${r.stage.name}: ${r.stage.feeType === 'T&M' ? 'time charges' : `progress to ${r.stage.percentComplete}% complete`}`,
        amount: existing?.amount ?? suggest,
        help: `Fee ${money(r.stage.fee)} · earned ${money(r.earned)} · invoiced ${money(r.invoiced)}`,
      };
    }),
  ];
  const expExisting = invoice?.lines.find((l) => l.stageId === 'expenses');
  if (f.expensesUninvoiced > 0.005 || expExisting) {
    rows.push({ stageId: 'expenses', name: 'Rechargeable expenses', on: invoice ? !!expExisting : true, description: expExisting?.description || 'Rechargeable expenses', amount: expExisting?.amount ?? round2(f.expensesUninvoiced), help: `${money2(f.expensesUninvoiced)} approved and not yet invoiced` });
  }
  const terms = s.settings.paymentTermsDays ?? 30;
  const v = invoice || { date: today, dueDate: addDays(today, terms), reference: p.purchaseOrder || '', contactId: client?.contacts[0]?.id || '', vatRate: s.settings.vatRate ?? 20, notes: '' };

  const body = html`<form class="inv-form" novalidate>
    <p class="modal-intro"><span class="job">${p.jobNo}</span> ${p.name} · ${client?.name}</p>
    <div class="form-grid">
      <div class="field"><label for="i-date">Invoice date</label><input id="i-date" name="date" type="date" value="${v.date}" required></div>
      <div class="field"><label for="i-due">Due date</label><input id="i-due" name="dueDate" type="date" value="${v.dueDate}" required></div>
      <div class="field"><label for="i-ref">Client reference / order no.</label><input id="i-ref" name="reference" value="${v.reference}"></div>
      <div class="field"><label for="i-contact">For the attention of</label><select id="i-contact" name="contactId">${options((client?.contacts || []).map((c) => ({ value: c.id, label: `${c.name}${c.role ? `, ${c.role}` : ''}` })), v.contactId, { placeholder: '—' })}</select></div>
    </div>
    <table class="lines" style="margin-top:14px">
      <thead><tr><th style="width:28px"><span class="sr-only">Include</span></th><th>Description</th><th class="num" style="width:130px">Amount (£)</th></tr></thead>
      <tbody>${rows.map((r, i) => html`<tr>
        <td><input type="checkbox" aria-label="Include ${r.name}" data-on="${i}" ${r.on ? raw('checked') : ''}></td>
        <td><input aria-label="Description for ${r.name}" data-desc="${i}" value="${r.description}"><small class="hint muted">${r.help}</small></td>
        <td><input class="amt" aria-label="Amount for ${r.name}" type="number" step="0.01" data-amt="${i}" value="${r.amount}"></td>
      </tr>`)}</tbody>
    </table>
    <div class="totals" id="inv-totals"></div>
    <div class="form-grid" style="margin-top:10px">
      <div class="field"><label for="i-vat">VAT rate (%)</label><input id="i-vat" name="vatRate" type="number" min="0" max="100" step="0.5" value="${v.vatRate}"></div>
      <div class="field full"><label for="i-notes">Notes on the invoice</label><textarea id="i-notes" name="notes" rows="2">${v.notes}</textarea></div>
    </div>
    <p class="form-error" role="alert" hidden></p>
  </form>`;

  const read = (el) => {
    const form = el.querySelector('form');
    const lines = rows.map((r, i) => ({ on: form.querySelector(`[data-on="${i}"]`).checked, stageId: r.stageId, description: form.querySelector(`[data-desc="${i}"]`).value.trim(), amount: round2(Number(form.querySelector(`[data-amt="${i}"]`).value) || 0) }))
      .filter((l) => l.on && l.amount !== 0).map(({ on, ...l }) => l);
    return { form, lines, date: form.date.value, dueDate: form.dueDate.value, reference: form.reference.value.trim(), contactId: form.contactId.value || null, vatRate: Number(form.vatRate.value) || 0, notes: form.notes.value.trim() };
  };
  const refresh = (el) => {
    const { lines, vatRate } = read(el);
    const net = sum(lines, (l) => l.amount);
    el.querySelector('#inv-totals').innerHTML = String(html`<div><span>Net</span><b>${money2(net)}</b></div><div><span>VAT at ${vatRate}%</span><b>${money2((net * vatRate) / 100)}</b></div><div class="grand"><span>Total</span><b>${money2(net * (1 + vatRate / 100))}</b></div>`);
  };

  openModal({
    title: invoice ? `Edit ${invoice.number}` : 'Raise invoice',
    size: 'wide',
    body,
    onMount: (el) => {
      refresh(el);
      el.querySelector('form').addEventListener('input', () => refresh(el));
      el.querySelector('#i-date').addEventListener('change', (e) => { el.querySelector('#i-due').value = addDays(e.target.value, terms); });
    },
    actions: [
      { label: 'Cancel' },
      {
        label: invoice ? 'Save draft' : 'Create draft', kind: 'primary',
        onClick: (el) => {
          const d = read(el);
          const err = el.querySelector('.form-error');
          const problem = !d.form.reportValidity() ? 'Check the dates.' : !d.lines.length ? 'Tick at least one line with an amount.' : d.dueDate < d.date ? 'The due date is before the invoice date.' : '';
          if (problem) { err.textContent = problem; err.hidden = false; return false; }
          let saved;
          update((st) => {
            const data = { date: d.date, dueDate: d.dueDate, reference: d.reference, contactId: d.contactId, vatRate: d.vatRate, notes: d.notes, lines: d.lines };
            if (invoice) { Object.assign(invoice, data); saved = invoice; }
            else {
              const n = st.settings.nextInvoiceNo++;
              saved = { id: `inv_${n}_${Date.now().toString(36)}`, number: `INV-${n}`, projectId: p.id, status: 'Draft', paidDate: null, createdBy: currentUser().id, approvedBy: null, ...data };
              st.invoices.push(saved);
            }
          });
          toast(`${saved.number} saved as a draft.`);
          setTimeout(() => invoiceView(find('invoices', saved.id)), 0);
        },
      },
    ],
  });
}

function invoiceDoc(inv) {
  const s = getState();
  const p = find('projects', inv.projectId);
  const client = find('clients', p?.clientId);
  const contact = client?.contacts.find((c) => c.id === inv.contactId);
  const net = C.invoiceNet(inv);
  return html`<div class="invoice-doc print-area">
    <div class="inv-top">
      <div><img src="assets/perega-logo.png" alt="Perega"><p class="muted" style="margin-top:8px">${s.settings.firmName}</p></div>
      <div style="text-align:right"><h2>${inv.status === 'Draft' ? 'DRAFT INVOICE' : 'INVOICE'}</h2>
        <dl class="inv-meta" style="margin-top:8px"><dt>Number</dt><dd>${inv.number}</dd><dt>Date</dt><dd>${fmtDate(inv.date)}</dd><dt>Due</dt><dd>${fmtDate(inv.dueDate)}</dd>${inv.reference ? html`<dt>Your ref.</dt><dd>${inv.reference}</dd>` : ''}</dl></div>
    </div>
    <div class="inv-parties">
      <div><div class="muted">To</div><strong>${client?.name}</strong>${contact ? html`<div>FAO ${contact.name}</div>` : ''}<div style="white-space:pre-line">${client?.address || ''}</div></div>
      <div><div class="muted">Project</div><strong>${p?.jobNo} ${p?.name}</strong><div>${p?.address || ''}</div></div>
    </div>
    <table class="lines"><thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
      <tbody>${inv.lines.map((l) => html`<tr><td>${l.description || stageName(inv.projectId, l.stageId)}</td><td class="num">${money2(l.amount)}</td></tr>`)}</tbody></table>
    <div class="totals"><div><span>Net</span><b>${money2(net)}</b></div><div><span>VAT at ${inv.vatRate}%</span><b>${money2(C.invoiceVat(inv))}</b></div><div class="grand"><span>Total due</span><b>${money2(C.invoiceGross(inv))}</b></div></div>
    ${inv.notes ? html`<p style="margin-top:14px">${inv.notes}</p>` : ''}
    <div class="inv-foot">Payment is due by ${fmtDate(inv.dueDate)}. Please quote ${inv.number} with your payment.</div>
  </div>`;
}

export function invoiceView(inv) {
  if (!inv) return;
  const today = todayISO();
  const shown = C.invoiceDisplayStatus(inv, today);
  const actions = [{ label: 'Print or save as PDF', onClick: () => { window.print(); return false; } }];
  if (inv.status === 'Draft') {
    actions.unshift({ label: 'Delete', kind: 'danger', onClick: () => { removeInvoice(inv); } });
    actions.push({ label: 'Edit', onClick: () => { setTimeout(() => invoiceForm({ invoice: inv }), 0); } });
    if (isManager()) actions.push({ label: 'Approve', kind: 'primary', onClick: () => approveInvoice(inv) });
  }
  if (inv.status === 'Approved') actions.push({ label: 'Mark as sent', kind: 'primary', onClick: () => setStatus(inv, 'Sent') });
  if (inv.status === 'Sent') {
    actions.unshift({ label: 'Back to approved', onClick: () => setStatus(inv, 'Approved') });
    actions.push({ label: 'Record payment', kind: 'primary', onClick: () => { setTimeout(() => paymentForm(inv), 0); } });
  }
  if (inv.status === 'Paid') actions.unshift({ label: 'Undo payment', onClick: () => update(() => { inv.status = 'Sent'; inv.paidDate = null; }) });
  openModal({
    title: html`${inv.number} ${pill(shown)}`,
    size: 'wide',
    body: html`${invoiceDoc(inv)}
      <p class="muted" style="margin-top:14px;font-size:12.5px">Raised by ${staffName(inv.createdBy)}${inv.approvedBy ? ` · approved by ${staffName(inv.approvedBy)}` : ''}${inv.paidDate ? ` · paid ${fmtDate(inv.paidDate)}` : ''}</p>`,
    actions,
  });
}

export function approveInvoice(inv) {
  update(() => { inv.status = 'Approved'; inv.approvedBy = currentUser().id; });
  toast(`${inv.number} approved. Mark it as sent once it has gone to the client.`);
}

function setStatus(inv, status) {
  update(() => { inv.status = status; });
  toast(`${inv.number} marked as ${status.toLowerCase()}.`);
}

function paymentForm(inv) {
  formModal({
    title: `Record payment for ${inv.number}`,
    intro: `${money2(C.invoiceGross(inv))} due ${fmtDate(inv.dueDate)}.`,
    fields: [{ name: 'paidDate', label: 'Date paid', type: 'date', value: todayISO(), required: true }],
    submitLabel: 'Mark as paid',
    onSubmit: (v) => { update(() => { inv.status = 'Paid'; inv.paidDate = v.paidDate; }); toast(`${inv.number} paid.`); },
  });
}

async function removeInvoice(inv) {
  if (await confirmDialog(`Delete draft ${inv.number}?`, { okLabel: 'Delete', danger: true })) {
    update((s) => { s.invoices = s.invoices.filter((x) => x.id !== inv.id); });
    toast('Draft deleted.');
  }
}

