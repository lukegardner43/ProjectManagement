import { getState, update, replaceState, resetToDemo, resetToEmpty, officeName } from '../store.js';
import { html, money, pct, todayISO, uid, sum } from '../util.js';
import { pageHead, table, tabs, options, formModal, openModal, toast, confirmDialog, download, pill } from '../ui.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const GRADES = ['Director', 'Associate', 'Principal Engineer', 'Senior Engineer', 'Engineer', 'Graduate Engineer', 'CAD Technician', 'Technician', 'Office Manager', 'Administrator'];

export function render(root, { params: [tab = 'firm'] }) {
  const s = getState();
  const bodies = { firm, people, offices, rates, templates, skills, data };
  root.innerHTML = String(html`
    ${pageHead('Settings')}
    ${tabs([['firm', 'Firm'], ['people', 'People and rates'], ['rates', 'Rate cards'], ['templates', 'Fee templates'], ['skills', 'Skills'], ['offices', 'Offices'], ['data', 'Data']].map(([key, label]) => ({ key, label, href: `#/settings/${key}` })), tab)}
    ${(bodies[tab] || firm)(s)}`);
  ({ firm: bindFirm, people: bindPeople, offices: bindOffices, rates: bindRates, templates: bindTemplates, skills: bindSkills, data: bindData }[tab] || bindFirm)(root);
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
    <div class="field"><label for="s-twon">Fees won target this year (£)</label><input id="s-twon" name="targetWon" type="number" min="0" step="1000" value="${v.targets?.won || ''}"></div>
    <div class="field"><label for="s-tinv">Invoicing target this year (£)</label><input id="s-tinv" name="targetInvoiced" type="number" min="0" step="1000" value="${v.targets?.invoiced || ''}"></div>
    <div class="field"><label for="s-po">Purchase orders need approval over (£)</label><input id="s-po" name="poApprovalLimit" type="number" min="0" step="50" value="${v.poApprovalLimit ?? 1000}"></div>
    <div class="field"><label for="s-util">Utilisation target (%)</label><input id="s-util" name="utilisationTarget" type="number" min="10" max="100" step="5" value="${Math.round((v.utilisationTarget ?? 0.8) * 100)}"><small class="hint">Sets the hours available in the staffing forecast.</small></div>
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
      targets: { won: Number(f.targetWon.value) || 0, invoiced: Number(f.targetInvoiced.value) || 0 }, poApprovalLimit: Number(f.poApprovalLimit.value) || 0,
      utilisationTarget: Math.min(1, Math.max(0.1, (Number(f.utilisationTarget.value) || 80) / 100)),
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


// ── Rate cards ──────────────────────────────────────────────────────────────

function rates(s) {
  return html`<div class="stack">${s.rateCards.map((rc) => html`<section class="card" style="max-width:640px"><div class="card-head"><h2>${rc.name}</h2>
      <span class="page-actions"><button type="button" class="btn small" data-rc-rename="${rc.id}">Rename</button>${s.rateCards.length > 1 ? html`<button type="button" class="btn small" data-rc-delete="${rc.id}">Delete</button>` : ''}</span></div>
    <div class="card-body"><table class="grid compact"><thead><tr><th>Grade</th><th class="num">Charge rate (£/h)</th><th></th></tr></thead><tbody>
      ${Object.entries(rc.rates).map(([g, r]) => html`<tr><td>${g}</td><td class="num"><label class="sr-only" for="rc-${rc.id}-${g}">${g}</label><input id="rc-${rc.id}-${g}" class="input" style="width:100px;text-align:right" type="number" min="0" step="1" value="${r}" data-rc="${rc.id}" data-grade="${g}"></td><td><button type="button" class="icon-btn" data-rc-remove="${rc.id}|${g}" aria-label="Remove ${g}">×</button></td></tr>`)}
    </tbody></table><button type="button" class="btn small" style="margin-top:10px" data-rc-add="${rc.id}">Add grade</button></div></section>`)}
    <p><button type="button" class="btn" id="rc-new">New rate card</button></p>
    <p class="muted">Fee estimates price hours with a rate card. Cost uses the average cost rate of the people in each grade (Settings → People and rates).</p></div>`;
}

function bindRates(root) {
  const card = (id) => getState().rateCards.find((r) => r.id === id);
  root.querySelectorAll('[data-rc]').forEach((i) => i.addEventListener('change', () => update(() => { card(i.dataset.rc).rates[i.dataset.grade] = Math.max(0, Number(i.value) || 0); }, { silent: true })));
  root.querySelectorAll('[data-rc-add]').forEach((b) => b.addEventListener('click', () => formModal({
    title: 'Add grade', fields: [{ name: 'grade', label: 'Grade', required: true }, { name: 'rate', label: 'Charge rate (£/h)', type: 'number', min: 0, required: true }],
    onSubmit: (v) => update(() => { card(b.dataset.rcAdd).rates[v.grade] = v.rate; }),
  })));
  root.querySelectorAll('[data-rc-remove]').forEach((b) => b.addEventListener('click', () => {
    const [id, g] = b.dataset.rcRemove.split('|');
    update(() => { delete card(id).rates[g]; });
  }));
  root.querySelectorAll('[data-rc-rename]').forEach((b) => b.addEventListener('click', () => formModal({
    title: 'Rename rate card', fields: [{ name: 'name', label: 'Name', value: card(b.dataset.rcRename).name, required: true, full: true }],
    onSubmit: (v) => update(() => { card(b.dataset.rcRename).name = v.name; }),
  })));
  root.querySelectorAll('[data-rc-delete]').forEach((b) => b.addEventListener('click', async () => {
    const s = getState();
    if (s.estimates.some((e) => e.rateCardId === b.dataset.rcDelete)) { toast('Estimates use this rate card, so it can\'t be deleted.', 'error'); return; }
    if (await confirmDialog('Delete this rate card?', { okLabel: 'Delete', danger: true })) update((st) => { st.rateCards = st.rateCards.filter((r) => r.id !== b.dataset.rcDelete); });
  }));
  root.querySelector('#rc-new').addEventListener('click', () => formModal({
    title: 'New rate card', intro: 'Starts as a copy of the first rate card.', fields: [{ name: 'name', label: 'Name', required: true, full: true, placeholder: 'e.g. Framework rates 2027' }],
    onSubmit: (v) => update((st) => { st.rateCards.push({ id: uid('rc'), name: v.name, rates: { ...st.rateCards[0].rates } }); }),
  }));
}

// ── Fee templates ───────────────────────────────────────────────────────────

function templates(s) {
  return html`<div class="card"><div class="card-head"><h2>Fee templates</h2><button type="button" class="btn small primary" id="tpl-new">New template</button></div><div class="card-body">
    <p class="muted">A template splits a fee across stages and sets each stage's duration and grade mix. Applying one to an estimate plans the hours that hit its target margin.</p>
    ${table({
      id: 'tpls', rows: s.feeTemplates,
      columns: [
        { key: 'name', label: 'Template', render: (t) => html`<button type="button" class="btn link cell-main" data-tpl="${t.id}">${t.name}</button>` },
        { key: 'sector', label: 'Sector' },
        { key: 'stages', label: 'Stages', align: 'num', value: (t) => t.stages.length },
        { key: 'weeks', label: 'Weeks', align: 'num', value: (t) => sum(t.stages, (x) => x.weeks) },
        { key: 'target', label: 'Target margin', align: 'num', value: (t) => t.targetMargin, render: (t) => pct(t.targetMargin) },
      ],
    })}</div></div>`;
}

function bindTemplates(root) {
  root.querySelector('#tpl-new').addEventListener('click', () => templateEditor(null));
  root.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => templateEditor(getState().feeTemplates.find((t) => t.id === b.dataset.tpl))));
}

function templateEditor(t) {
  const s = getState();
  const grades = Object.keys(s.rateCards[0]?.rates || {});
  const draft = structuredClone(t || { name: '', sector: 'Any', targetMargin: 0.35, stages: [{ name: 'Stage 1', pct: 100, weeks: 4, mix: {} }] });
  const draw = (el) => {
    el.querySelector('#tpl-stages').innerHTML = String(html`<table class="grid compact"><thead><tr><th>Stage</th><th class="num">% of fee</th><th class="num">Weeks</th>${grades.map((g) => html`<th class="num">${g.replace(' Engineer', ' Eng').replace('Technician', 'Tech')} %</th>`)}<th></th></tr></thead><tbody>
      ${draft.stages.map((st, i) => html`<tr>
        <td><input class="input" style="width:100%" value="${st.name}" data-ts="${i}|name" aria-label="Stage name"></td>
        <td class="num"><input class="input" style="width:64px;text-align:right" type="number" min="0" max="100" value="${st.pct}" data-ts="${i}|pct" aria-label="% of fee"></td>
        <td class="num"><input class="input" style="width:56px;text-align:right" type="number" min="1" value="${st.weeks}" data-ts="${i}|weeks" aria-label="Weeks"></td>
        ${grades.map((g) => html`<td class="num"><input class="input" style="width:56px;text-align:right" type="number" min="0" max="100" value="${st.mix?.[g] ? Math.round(st.mix[g] * 100) : ''}" data-ts="${i}|mix|${g}" aria-label="${g} share of hours"></td>`)}
        <td><button type="button" class="icon-btn" data-ts-del="${i}" aria-label="Remove stage">×</button></td></tr>`)}
      </tbody><tfoot><tr><td>Total</td><td class="num">${sum(draft.stages, (x) => Number(x.pct) || 0)}%</td><td class="num">${sum(draft.stages, (x) => Number(x.weeks) || 0)}</td>${grades.map(() => html`<td></td>`)}<td></td></tr></tfoot></table>`);
    el.querySelectorAll('[data-ts]').forEach((inp) => inp.addEventListener('change', () => {
      const [i, k, g] = inp.dataset.ts.split('|');
      const st = draft.stages[Number(i)];
      if (k === 'name') st.name = inp.value;
      else if (k === 'mix') { st.mix = { ...st.mix }; const v = (Number(inp.value) || 0) / 100; if (v) st.mix[g] = v; else delete st.mix[g]; }
      else st[k] = Number(inp.value) || 0;
      draw(el);
    }));
    el.querySelectorAll('[data-ts-del]').forEach((b) => b.addEventListener('click', () => { draft.stages.splice(Number(b.dataset.tsDel), 1); draw(el); }));
  };
  openModal({
    title: t ? `Edit ${t.name}` : 'New fee template',
    size: 'xwide',
    body: html`<div class="form-grid" style="grid-template-columns:2fr 1fr 1fr">
        <div class="field"><label for="tpl-name">Name</label><input id="tpl-name" value="${draft.name}"></div>
        <div class="field"><label for="tpl-sector">Sector</label><input id="tpl-sector" value="${draft.sector}"></div>
        <div class="field"><label for="tpl-target">Target margin (%)</label><input id="tpl-target" type="number" min="0" max="95" value="${Math.round(draft.targetMargin * 100)}"></div>
      </div>
      <div class="table-wrap" id="tpl-stages" style="margin-top:12px"></div>
      <button type="button" class="btn small" id="tpl-add" style="margin-top:8px">Add stage</button>
      <p class="muted" style="margin-top:8px;font-size:12.5px">Grade shares are the split of a stage's hours; each row should add up to 100%. Stage % of fee should add up to 100%.</p>
      <p class="form-error" role="alert" hidden></p>`,
    onMount: (el) => {
      draw(el);
      el.querySelector('#tpl-add').addEventListener('click', () => { draft.stages.push({ name: `Stage ${draft.stages.length + 1}`, pct: 0, weeks: 4, mix: {} }); draw(el); });
    },
    actions: [
      ...(t ? [{ label: 'Delete', kind: 'danger', onClick: () => { update((st) => { st.feeTemplates = st.feeTemplates.filter((x) => x.id !== t.id); }); } }] : []),
      { label: 'Cancel' },
      { label: 'Save template', kind: 'primary', onClick: (el) => {
        draft.name = el.querySelector('#tpl-name').value.trim();
        draft.sector = el.querySelector('#tpl-sector').value.trim() || 'Any';
        draft.targetMargin = Math.min(0.95, Math.max(0, (Number(el.querySelector('#tpl-target').value) || 0) / 100));
        const err = el.querySelector('.form-error');
        const problem = !draft.name ? 'Give the template a name.' : !draft.stages.length ? 'Add at least one stage.'
          : Math.abs(sum(draft.stages, (x) => Number(x.pct) || 0) - 100) > 0.01 ? 'Stage percentages must add up to 100%.'
          : draft.stages.find((x) => Math.abs(sum(Object.values(x.mix || {})) - 1) > 0.011) ? `Grade shares for "${draft.stages.find((x) => Math.abs(sum(Object.values(x.mix || {})) - 1) > 0.011).name}" must add up to 100%.` : '';
        if (problem) { err.textContent = problem; err.hidden = false; return false; }
        update((st) => {
          if (t) Object.assign(st.feeTemplates.find((x) => x.id === t.id), draft);
          else st.feeTemplates.push({ ...draft, id: uid('tpl') });
        });
        toast('Template saved.');
      } },
    ],
  });
}

// ── Skills list ─────────────────────────────────────────────────────────────

function skills(s) {
  return html`<form class="card" id="skills-form" style="max-width:640px"><div class="card-head"><h2>Skills</h2></div><div class="card-body">
    <div class="field"><label for="skills-list">One skill per line</label><textarea id="skills-list" rows="14">${(s.settings.skills || []).join('\n')}</textarea>
    <small class="hint">Removing a skill also removes it from everyone's profile.</small></div>
    <button type="submit" class="btn primary" style="margin-top:12px">Save skills</button></div></form>`;
}

function bindSkills(root) {
  root.querySelector('#skills-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const list = [...new Set(root.querySelector('#skills-list').value.split('\n').map((x) => x.trim()).filter(Boolean))];
    update((s) => {
      s.settings.skills = list;
      for (const p of s.staff) p.skills = (p.skills || []).filter((x) => list.includes(x.skill));
    });
    toast('Skills saved.');
  });
}
