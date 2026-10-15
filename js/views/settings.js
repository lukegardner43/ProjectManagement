import { getState, update, replaceState, resetToDemo, resetToEmpty, officeName } from '../store.js';
import { html, money, todayISO, uid } from '../util.js';
import { pageHead, table, tabs, options, formModal, toast, confirmDialog, download, pill } from '../ui.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const GRADES = ['Director', 'Associate', 'Principal Engineer', 'Senior Engineer', 'Engineer', 'Graduate Engineer', 'CAD Technician', 'Technician', 'Office Manager', 'Administrator'];

export function render(root, { params: [tab = 'firm'] }) {
  const s = getState();
  const bodies = { firm, people, offices, data };
  root.innerHTML = String(html`
    ${pageHead('Settings')}
    ${tabs([['firm', 'Firm'], ['people', 'People and rates'], ['offices', 'Offices'], ['data', 'Data']].map(([key, label]) => ({ key, label, href: `#/settings/${key}` })), tab)}
    ${(bodies[tab] || firm)(s)}`);
  ({ firm: bindFirm, people: bindPeople, offices: bindOffices, data: bindData }[tab] || bindFirm)(root);
}

function firm(s) {
  const v = s.settings;
  return html`<form class="card" id="firm-form"><div class="card-body form-grid" style="max-width:760px">
    <div class="field"><label for="s-name">Firm name</label><input id="s-name" name="firmName" value="${v.firmName}" required></div>
    <div class="field"><label for="s-fy">Financial year starts</label><select id="s-fy" name="fyStartMonth">${options(MONTHS.map((m, i) => ({ value: i + 1, label: m })), v.fyStartMonth)}</select></div>
    <div class="field"><label for="s-vat">VAT rate (%)</label><input id="s-vat" name="vatRate" type="number" min="0" max="100" step="0.5" value="${v.vatRate}"></div>
    <div class="field"><label for="s-terms">Payment terms (days)</label><input id="s-terms" name="paymentTermsDays" type="number" min="0" max="180" value="${v.paymentTermsDays}"></div>
    <div class="field"><label for="s-hpd">Working hours per day</label><input id="s-hpd" name="hoursPerDay" type="number" min="1" max="12" step="0.25" value="${v.hoursPerDay}"></div>
    <div class="field"><label for="s-prefix">Job number prefix</label><input id="s-prefix" name="jobPrefix" value="${v.jobPrefix}"></div>
    <div class="field"><label for="s-job">Next job number</label><input id="s-job" name="nextJobNo" type="number" min="1" value="${v.nextJobNo}"></div>
    <div class="field"><label for="s-inv">Next invoice number</label><input id="s-inv" name="nextInvoiceNo" type="number" min="1" value="${v.nextInvoiceNo}"></div>
    <div class="field full"><button type="submit" class="btn primary" style="width:max-content">Save settings</button></div>
  </div></form>`;
}

function bindFirm(root) {
  root.querySelector('#firm-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.reportValidity()) return;
    update((s) => Object.assign(s.settings, {
      firmName: f.firmName.value.trim(), fyStartMonth: Number(f.fyStartMonth.value), vatRate: Number(f.vatRate.value), paymentTermsDays: Number(f.paymentTermsDays.value),
      hoursPerDay: Number(f.hoursPerDay.value), jobPrefix: f.jobPrefix.value.trim(), nextJobNo: Number(f.nextJobNo.value), nextInvoiceNo: Number(f.nextInvoiceNo.value),
    }));
    toast('Settings saved.');
  });
}

function people(s) {
  return html`<div class="card"><div class="card-head"><h2>People</h2><button type="button" class="btn small primary" id="add-person">Add person</button></div><div class="card-body">
    <p class="muted">Charge rates value time on jobs; cost rates work out margins. Approvers see the Approvals screen.</p>
    ${table({
      id: 'staff', rows: s.staff, defaultSort: { key: 'name', dir: 1 },
      columns: [
        { key: 'name', label: 'Name', render: (p) => html`<strong>${p.name}</strong><span class="cell-sub">${p.email || ''}</span>` },
        { key: 'grade', label: 'Grade' },
        { key: 'discipline', label: 'Discipline' },
        { key: 'office', label: 'Office', value: (p) => officeName(p.officeId) },
        { key: 'chargeRate', label: 'Charge /h', align: 'num', render: (p) => money(p.chargeRate) },
        { key: 'costRate', label: 'Cost /h', align: 'num', render: (p) => money(p.costRate) },
        { key: 'weeklyHours', label: 'Hours /wk', align: 'num' },
        { key: 'roles', label: 'Role', sortable: false, render: (p) => html`${p.isManager ? pill('Approver') : ''} ${p.billable ? '' : html`<span class="pill pill-neutral">Non-chargeable</span>`} ${p.active === false ? pill('Left') : ''}` },
        { key: 'edit', label: '', sortable: false, render: (p) => html`<button type="button" class="btn small link" data-person="${p.id}">Edit</button>` },
      ],
    })}</div></div>`;
}

function bindPeople(root) {
  root.querySelector('#add-person').addEventListener('click', () => personForm());
  root.querySelectorAll('[data-person]').forEach((b) => b.addEventListener('click', () => personForm(getState().staff.find((p) => p.id === b.dataset.person))));
}

function personForm(p = null) {
  const s = getState();
  formModal({
    title: p ? `Edit ${p.name}` : 'Add person',
    size: 'wide',
    fields: [
      { name: 'name', label: 'Name', value: p?.name, required: true },
      { name: 'email', label: 'Email', type: 'email', value: p?.email },
      { name: 'grade', label: 'Grade', type: 'select', value: p?.grade ?? 'Engineer', options: GRADES },
      { name: 'discipline', label: 'Discipline', value: p?.discipline ?? 'Structural' },
      { name: 'officeId', label: 'Office', type: 'select', value: p?.officeId, options: s.offices.map((o) => ({ value: o.id, label: o.name })) },
      { name: 'weeklyHours', label: 'Contracted hours a week', type: 'number', min: 0, max: 60, step: 0.5, value: p?.weeklyHours ?? 37.5, required: true },
      { name: 'chargeRate', label: 'Charge rate (£/h)', type: 'number', min: 0, step: 1, value: p?.chargeRate ?? 75, required: true },
      { name: 'costRate', label: 'Cost rate (£/h)', type: 'number', min: 0, step: 1, value: p?.costRate ?? 30, required: true },
      { name: 'leaveAllowance', label: 'Annual leave (days)', type: 'number', min: 0, max: 60, step: 0.5, value: p?.leaveAllowance ?? 25 },
      { name: 'isManager', label: 'Approver (timesheets, expenses, leave, invoices)', type: 'checkbox', value: p?.isManager ?? false, full: true },
      { name: 'billable', label: 'Does chargeable work (counts in utilisation and resourcing)', type: 'checkbox', value: p?.billable ?? true, full: true },
      { name: 'active', label: 'Currently employed', type: 'checkbox', value: p?.active ?? true, full: true },
    ],
    onSubmit: (v) => {
      if (p && p.isManager && !v.isManager && s.staff.filter((x) => x.isManager && x.active !== false).length === 1) return 'Keep at least one approver.';
      update((st) => {
        if (p) Object.assign(p, v);
        else st.staff.push({ id: uid('stf'), ...v });
      });
      toast('Saved.');
    },
  });
}

function offices(s) {
  return html`<div class="card" style="max-width:640px"><div class="card-head"><h2>Offices</h2><button type="button" class="btn small primary" id="add-office">Add office</button></div><div class="card-body">
    ${s.offices.map((o) => html`<div class="kv"><span>${o.name} <span class="muted">· ${s.staff.filter((p) => p.officeId === o.id).length} people, ${s.projects.filter((p) => p.officeId === o.id).length} projects</span></span><button type="button" class="btn small link" data-office="${o.id}">Rename</button></div>`)}
  </div></div>`;
}

function bindOffices(root) {
  const form = (o = null) => formModal({
    title: o ? 'Rename office' : 'Add office',
    fields: [{ name: 'name', label: 'Name', value: o?.name, required: true, full: true }],
    onSubmit: (v) => update((s) => { if (o) o.name = v.name; else s.offices.push({ id: uid('off'), name: v.name }); }),
  });
  root.querySelector('#add-office').addEventListener('click', () => form());
  root.querySelectorAll('[data-office]').forEach((b) => b.addEventListener('click', () => form(getState().offices.find((o) => o.id === b.dataset.office))));
}

function data(s) {
  const size = new Blob([JSON.stringify(s)]).size;
  return html`<div class="grid-2">
    <section class="card"><div class="card-head"><h2>Back up and restore</h2></div><div class="card-body">
      <p>Everything is stored in this browser (${Math.round(size / 1024)} KB). Export a backup regularly, and to move to another computer.</p>
      <div class="toolbar"><button type="button" class="btn primary" id="export-json">Export backup (.json)</button>
        <label class="btn" for="import-json" style="cursor:pointer">Import backup…</label><input id="import-json" type="file" accept="application/json,.json" hidden></div>
    </div></section>
    <section class="card"><div class="card-head"><h2>Start again</h2></div><div class="card-body">
      <p>${s.settings.demo ? 'You are looking at invented demo data.' : 'You are using your own data.'}</p>
      <div class="toolbar">
        <button type="button" class="btn" id="reset-demo">Load demo data</button>
        <button type="button" class="btn danger" id="reset-empty">Start with an empty system</button>
      </div>
      <p class="muted">Both replace everything in this browser. Export a backup first if you want to keep it.</p>
    </div></section>
  </div>`;
}

function bindData(root) {
  root.querySelector('#export-json').addEventListener('click', () => {
    download(`perega-projects-backup-${todayISO()}.json`, JSON.stringify(getState(), null, 1), 'application/json');
    toast('Backup downloaded.');
  });
  root.querySelector('#import-json').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let next;
    try { next = JSON.parse(await file.text()); } catch { toast('That file isn\'t valid JSON.', 'error'); return; }
    if (!(await confirmDialog(`Replace everything in this browser with ${file.name}?`, { okLabel: 'Replace', danger: true }))) return;
    try { replaceState(next); toast('Backup restored.'); } catch (err) { toast(err.message, 'error'); }
  });
  root.querySelector('#reset-demo').addEventListener('click', async () => {
    if (await confirmDialog('Replace everything with demo data?', { okLabel: 'Load demo data', danger: true })) { resetToDemo(); toast('Demo data loaded.'); }
  });
  root.querySelector('#reset-empty').addEventListener('click', async () => {
    if (!(await confirmDialog('Delete all projects, time, invoices and people, and start with an empty system?', { okLabel: 'Delete everything', danger: true }))) return;
    resetToEmpty();
    toast('Empty system ready. Start in Settings: add your offices and people.');
    location.hash = '#/settings/firm';
  });
}

