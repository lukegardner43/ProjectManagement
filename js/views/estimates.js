import { getState, update, find, clientName, staffName, currentUser, isManager, clientProjects } from '../store.js';
import { html, raw, money, hrs, pct, fmtDate, todayISO, addDays, sum, uid, round2, monthKey, monthLabel, addMonths } from '../util.js';
import * as C from '../calc.js';
import { costEstimate, templateStages, benchmark, rateCard, estimateToProject } from '../estimate.js';
import { spreadByMonth } from '../forecast.js';
import { pageHead, table, pill, tile, options, formModal, openModal, toast, confirmDialog, empty } from '../ui.js';

const SECTORS = ['Residential', 'Commercial', 'Education', 'Healthcare', 'Infrastructure', 'Industrial', 'Heritage', 'Other'];

export function list(root) {
  const s = getState();
  const rows = s.estimates.map((e) => ({ e, c: costEstimate(s, e) }));
  root.innerHTML = String(html`
    ${pageHead('Fee estimates', { sub: 'Price a job top-down from construction cost or a lump sum, or bottom-up from hours by grade, and check the margin before you quote.', actions: html`<button type="button" class="btn primary" id="new-est">New fee estimate</button>` })}
    <div class="card"><div class="card-body">${table({
      id: 'estimates', rows, defaultSort: { key: 'updated', dir: -1 }, rowHref: (r) => `#/estimates/${r.e.id}`,
      empty: 'No fee estimates yet. Start one here or from an opportunity.',
      columns: [
        { key: 'name', label: 'Estimate', value: (r) => r.e.name, render: (r) => html`<a class="cell-main" href="#/estimates/${r.e.id}">${r.e.name}</a><span class="cell-sub">${clientName(r.e.clientId)}</span>` },
        { key: 'for', label: 'For', sortable: false, render: (r) => linkedTo(r.e) },
        { key: 'method', label: 'Method', value: (r) => r.e.method, render: (r) => (r.e.method === 'bottom-up' ? 'Bottom-up' : 'Top-down') },
        { key: 'fee', label: 'Fee', align: 'num', value: (r) => r.c.fee, render: (r) => money(r.c.fee) },
        { key: 'hours', label: 'Hours', align: 'num', value: (r) => r.c.hours, render: (r) => hrs(r.c.hours) },
        { key: 'margin', label: 'Margin', align: 'num', value: (r) => r.c.margin, render: (r) => html`<span class="${r.c.belowTarget ? 'neg' : ''}">${pct(r.c.margin)}</span>${r.c.belowTarget ? html` <span class="flag flag-serious">▲ below ${pct(r.e.targetMargin)}</span>` : ''}` },
        { key: 'status', label: 'Status', value: (r) => r.e.status, render: (r) => pill(r.e.status) },
        { key: 'updated', label: 'Updated', value: (r) => r.e.updatedAt, render: (r) => fmtDate(r.e.updatedAt) },
      ],
    })}</div></div>`);
  root.querySelector('#new-est').addEventListener('click', () => newEstimateForm());
}

function linkedTo(e) {
  const s = getState();
  if (e.projectId) { const p = find('projects', e.projectId); return p ? html`<a href="#/projects/${p.id}"><span class="job">${p.jobNo}</span></a>` : '—'; }
  if (e.opportunityId) { const o = s.opportunities.find((x) => x.id === e.opportunityId); return o ? html`<a href="#/pipeline?open=${o.id}">Opportunity</a> ${pill(o.stage)}` : '—'; }
  return html`<span class="muted">—</span>`;
}

// Create an estimate, optionally for an opportunity or an existing project
// (a variation or extra stage), and open it.
export function newEstimateForm(preset = {}) {
  const s = getState();
  const opp = preset.opportunityId ? s.opportunities.find((o) => o.id === preset.opportunityId) : null;
  const proj = preset.projectId ? find('projects', preset.projectId) : null;
  formModal({
    title: 'New fee estimate',
    size: 'wide',
    intro: opp ? `For the opportunity "${opp.title}".` : proj ? `Extra work on ${proj.jobNo} ${proj.name}.` : '',
    fields: [
      { name: 'name', label: 'Name', value: opp?.title || (proj ? `${proj.name}: additional services` : ''), required: true, full: true },
      { name: 'clientId', label: 'Client', type: 'select', value: opp?.clientId || proj?.clientId || '', options: s.clients.map((c) => ({ value: c.id, label: c.name })), placeholder: 'Choose…', required: true },
      { name: 'sector', label: 'Sector', type: 'select', value: proj?.sector || 'Residential', options: SECTORS },
      { name: 'templateId', label: 'Start from template', type: 'select', value: '', options: s.feeTemplates.map((t) => ({ value: t.id, label: t.name })), placeholder: 'Blank, I\'ll add stages', full: true },
      { name: 'method', label: 'Method', type: 'select', value: 'top-down', options: [{ value: 'top-down', label: 'Top-down: fee split across stages' }, { value: 'bottom-up', label: 'Bottom-up: hours × rates' }] },
      { name: 'startDate', label: 'Expected start', type: 'date', value: opp?.expectedDate ? addDays(opp.expectedDate, 14) : addDays(todayISO(), 28), required: true },
      { name: 'constructionCost', label: 'Construction cost (£)', type: 'number', min: 0, step: 1000, hint: 'Top-down: leave blank to price a lump sum instead.' },
      { name: 'feePct', label: 'Fee (% of construction cost)', type: 'number', min: 0, max: 100, step: 0.1 },
      { name: 'fixedTotal', label: 'Or a lump-sum fee (£)', type: 'number', min: 0, step: 100, value: opp?.value || '' },
      { name: 'rateCardId', label: 'Rate card', type: 'select', value: s.rateCards[0]?.id, options: s.rateCards.map((r) => ({ value: r.id, label: r.name })) },
    ],
    submitLabel: 'Create estimate',
    onSubmit: (v) => {
      let id = null;
      update((st) => {
        const tpl = st.feeTemplates.find((t) => t.id === v.templateId);
        const est = {
          id: uid('est'), name: v.name, clientId: v.clientId, sector: v.sector, opportunityId: opp?.id || null, projectId: proj?.id || null,
          method: v.method, constructionCost: v.constructionCost || 0, feePct: v.feePct || 0, fixedTotal: v.fixedTotal || 0, rateCardId: v.rateCardId,
          templateId: v.templateId || null, targetMargin: tpl?.targetMargin ?? 0.35, startDate: v.startDate, status: 'Draft', approvedBy: null,
          createdBy: currentUser().id, updatedAt: todayISO(), notes: '', stages: [], snapshots: [],
        };
        est.stages = tpl ? templateStages(st, est, tpl) : [{ id: uid('es'), name: 'Stage 1', feeType: 'Fixed', weeks: 4, pct: 100, feeOverride: null, hours: {} }];
        st.estimates.push(est);
        if (opp) { opp.estimateId = est.id; syncOpportunity(st, est); }
        id = est.id;
      });
      location.hash = `#/estimates/${id}`;
    },
  });
}

function syncOpportunity(state, est) {
  const o = est.opportunityId && state.opportunities.find((x) => x.id === est.opportunityId);
  if (o && C.OPEN_STAGES.includes(o.stage)) o.value = Math.round(costEstimate(state, est).fee);
}

// ── Detail / editor ─────────────────────────────────────────────────────────

export function detail(root, { params: [id] }) {
  const s = getState();
  const e = s.estimates.find((x) => x.id === id);
  if (!e) { root.innerHTML = String(empty('Estimate not found', '', html`<a href="#/estimates">All fee estimates</a>`)); return; }
  document.title = `${e.name} · Fee estimate · Perega Projects`;
  const c = costEstimate(s, e);
  const locked = e.status === 'Approved' || e.status === 'Submitted';
  const topDown = e.method !== 'bottom-up';
  const ctx = C.makeCtx(s);
  const bench = benchmark(clientProjects().map((p) => ({ p, f: C.projectFinancials(p, ctx) })), e.sector);
  const opp = e.opportunityId ? s.opportunities.find((o) => o.id === e.opportunityId) : null;
  const project = e.projectId ? find('projects', e.projectId) : null;
  const dis = locked ? raw('disabled') : '';

  // Hours this estimate needs from each grade, by month.
  const months = [];
  for (let m = monthKey(e.startDate); m <= monthKey(c.end) && months.length < 18; m = addMonths(m, 1)) months.push(m);
  const demand = c.grades.map((g) => {
    const by = new Map();
    for (const st of c.stages) spreadByMonth(Number(st.hours?.[g]) || 0, st.start, st.end, by);
    return { g, by, total: sum(c.stages, (st) => Number(st.hours?.[g]) || 0) };
  }).filter((d) => d.total > 0);

  const actions = [];
  if (!locked) actions.push(html`<button type="button" class="btn" id="edit-est">Edit details</button>`);
  actions.push(html`<button type="button" class="btn" id="snapshot">Save snapshot</button><button type="button" class="btn" id="proposal">Fee proposal</button>`);
  if (e.status === 'Draft') actions.push(html`<button type="button" class="btn primary" id="submit">Submit for approval</button>`);
  if (e.status === 'Submitted' && isManager()) actions.push(html`<button type="button" class="btn" id="reopen">Send back</button><button type="button" class="btn primary" id="approve">Approve</button>`);
  if (e.status === 'Submitted' && !isManager()) actions.push(html`<button type="button" class="btn" id="reopen">Recall</button>`);
  if (e.status === 'Approved') actions.push(html`<button type="button" class="btn" id="reopen">Reopen to edit</button>`);
  if (project && e.status === 'Approved') actions.push(html`<button type="button" class="btn secondary" id="apply">Add stages to ${project.jobNo}</button>`);

  const gradeCols = c.grades;
  root.innerHTML = String(html`
    <div class="crumbs"><a href="#/estimates">Fee estimates</a> /</div>
    ${pageHead(e.name, {
      sub: html`${pill(e.status)} · ${clientName(e.clientId)} · ${e.sector}${opp ? html` · <a href="#/pipeline?open=${opp.id}">opportunity</a> (${opp.stage})` : ''}${project ? html` · <a href="#/projects/${project.id}"><span class="job">${project.jobNo}</span></a>` : ''}${e.approvedBy ? ` · approved by ${staffName(e.approvedBy)}` : ''}`,
      actions: html`${actions}`,
    })}
    <section class="tiles" id="est-tiles">${tiles(e, c)}</section>
    ${c.belowTarget ? html`<p class="flag flag-serious" style="margin-bottom:12px;display:flex">▲ The planned hours cost more than this fee allows at the ${pct(e.targetMargin)} target margin. Cut hours, change the grade mix or raise the fee.</p>` : ''}
    <div class="grid-main">
      <section class="card"><div class="card-head"><h2>Pricing</h2>
        <div class="segmented" role="group" aria-label="Method">
          <button type="button" class="${topDown ? 'on' : ''}" data-method="top-down" ${dis}>Top-down</button><button type="button" class="${!topDown ? 'on' : ''}" data-method="bottom-up" ${dis}>Bottom-up</button>
        </div></div>
        <div class="card-body">
          ${topDown ? html`<div class="form-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
            <div class="field"><label for="e-cc">Construction cost (£)</label><input id="e-cc" type="number" min="0" step="1000" value="${e.constructionCost || ''}" data-top="constructionCost" ${dis}></div>
            <div class="field"><label for="e-pct">Fee (% of construction)</label><input id="e-pct" type="number" min="0" max="100" step="0.1" value="${e.feePct || ''}" data-top="feePct" ${dis}></div>
            <div class="field"><label for="e-fixed">Or lump-sum fee (£)</label><input id="e-fixed" type="number" min="0" step="100" value="${e.fixedTotal || ''}" data-top="fixedTotal" ${e.constructionCost > 0 ? raw('disabled') : dis}></div>
          </div>
          <p class="muted" style="margin-top:8px">The fee is split across stages by the % column. Hours by grade are your resourcing plan; they set cost and margin but not the fee.</p>`
          : html`<p class="muted">Bottom-up: each stage's fee is its hours by grade priced on the <strong>${rateCard(s, e.rateCardId).name}</strong> rate card.</p>`}
          <div class="toolbar" style="margin:10px 0 0">
            <label>Template <select class="select" id="tpl" ${dis}>${options(s.feeTemplates.map((t) => ({ value: t.id, label: t.name })), '', { placeholder: 'Apply a template…' })}</select></label>
            <label>Target margin <input class="input" style="width:80px" type="number" min="0" max="95" step="1" value="${Math.round((e.targetMargin ?? 0.35) * 100)}" id="target" ${dis}> %</label>
            <label>Rate card <select class="select" id="ratecard" ${dis}>${options(s.rateCards.map((r) => ({ value: r.id, label: r.name })), e.rateCardId)}</select></label>
          </div>
        </div>
      </section>
      <section class="card"><div class="card-head"><h2>How similar work has gone</h2></div><div class="card-body">
        ${bench ? html`<div class="kv"><span>${e.sector} projects on record</span><b>${bench.count}</b></div>
          <div class="kv"><span>Average fee</span><b>${money(bench.avgFee)}</b></div>
          <div class="kv"><span>Margin achieved so far</span><b>${pct(bench.margin)}</b></div>
          <div class="kv"><span>Budget hours per £1,000 of fee</span><b>${hrs(bench.hoursPer1k)}</b></div>
          <div class="kv"><span>This estimate</span><b>${c.fee ? hrs(c.hours / (c.fee / 1000)) : '—'} h per £1,000</b></div>
          ${bench.margin !== null && c.margin !== null && c.margin > bench.margin + 0.1 ? html`<p class="flag flag-warning" style="margin-top:8px">▲ This margin is well above what ${e.sector.toLowerCase()} jobs have achieved. Check the hours aren't optimistic.</p>` : ''}`
          : html`<p class="muted">No ${e.sector.toLowerCase()} projects with earned value yet.</p>`}
      </div></section>
    </div>

    <section class="card" style="margin-top:16px"><div class="card-head"><h2>Stages</h2>${locked ? html`<span class="sub">Locked while ${e.status.toLowerCase()}. ${e.status === 'Approved' ? 'Reopen to edit.' : ''}</span>` : html`<button type="button" class="btn small primary" id="add-stage">Add stage</button>`}</div>
      <div class="card-body"><div class="table-wrap"><table class="grid compact est-grid">
        <thead><tr>
          <th style="min-width:200px">Stage</th><th>Basis</th><th class="num">Weeks</th><th>Dates</th>${topDown ? html`<th class="num">% of fee</th>` : ''}
          ${gradeCols.map((g) => html`<th class="num" title="${g} at ${money(c.rates[g])}/h">${g.replace(' Engineer', ' Eng').replace('Technician', 'Tech')}<small style="display:block;font-weight:400">${money(c.rates[g])}/h</small></th>`)}
          <th class="num">Hours</th><th class="num">Fee</th><th class="num">Cost</th><th class="num">Margin</th><th></th>
        </tr></thead>
        <tbody>${c.stages.map((st) => html`<tr data-stage-row="${st.id}">
          <td><input class="input" style="width:100%" value="${st.name}" data-f="name" data-s="${st.id}" aria-label="Stage name" ${dis}></td>
          <td><select class="select" data-f="feeType" data-s="${st.id}" aria-label="Fee basis, ${st.name}" ${dis}>${options([{ value: 'Fixed', label: 'Fixed' }, { value: 'T&M', label: 'T&M' }], st.feeType)}</select></td>
          <td class="num"><input class="input" style="width:62px;text-align:right" type="number" min="1" max="260" value="${st.weeks}" data-f="weeks" data-s="${st.id}" aria-label="Weeks, ${st.name}" ${dis}></td>
          <td class="nowrap muted" data-out="dates-${st.id}">${fmtDate(st.start).replace(/ \d{4}$/, '')} – ${fmtDate(st.end)}</td>
          ${topDown ? html`<td class="num"><input class="input" style="width:66px;text-align:right" type="number" min="0" max="100" step="0.5" value="${st.pct}" data-f="pct" data-s="${st.id}" aria-label="% of fee, ${st.name}" ${dis}></td>` : ''}
          ${gradeCols.map((g) => html`<td class="num"><input class="input" style="width:64px;text-align:right" type="number" min="0" step="0.5" value="${Number(st.hours?.[g]) || ''}" data-f="hours" data-g="${g}" data-s="${st.id}" aria-label="${g} hours, ${st.name}" ${dis}></td>`)}
          <td class="num" data-out="hours-${st.id}">${hrs(st.totalHours)}</td>
          <td class="num" data-out="fee-${st.id}"><strong>${money(st.fee)}</strong></td>
          <td class="num" data-out="cost-${st.id}">${money(st.cost)}</td>
          <td class="num" data-out="margin-${st.id}">${marginCell(st.margin, e.targetMargin)}</td>
          <td>${locked ? '' : html`<button type="button" class="icon-btn" data-del="${st.id}" aria-label="Remove ${st.name}">×</button>`}</td>
        </tr>`)}</tbody>
        <tfoot><tr><td>Total</td><td></td><td class="num" data-out="weeks">${sum(c.stages, (x) => x.weeks)}</td><td class="muted nowrap" data-out="end">to ${fmtDate(c.end)}</td>${topDown ? html`<td class="num" data-out="pct">${pctTotal(c.pctTotal)}</td>` : ''}
          ${gradeCols.map((g) => html`<td class="num" data-out="g-${g}">${hrs(sum(c.stages, (x) => Number(x.hours?.[g]) || 0))}</td>`)}
          <td class="num" data-out="hours">${hrs(c.hours)}</td><td class="num" data-out="fee">${money(c.fee)}</td><td class="num" data-out="cost">${money(c.cost)}</td><td class="num" data-out="margin">${marginCell(c.margin, e.targetMargin)}</td><td></td></tr></tfoot>
      </table></div>
      <p class="muted" style="margin-top:8px;font-size:12.5px">Cost uses the average cost rate of the people in each grade. Changes save as you type.</p>
      </div></section>

    <div class="grid-2" style="margin-top:16px">
      <section class="card"><div class="card-head"><h2>Hours needed by month</h2><span class="sub">Feeds the staffing forecast while the opportunity is open</span></div><div class="card-body">
        ${demand.length ? html`<div class="table-wrap"><table class="grid compact"><thead><tr><th>Grade</th>${months.map((m) => html`<th class="num">${monthLabel(m)}</th>`)}</tr></thead>
          <tbody>${demand.map((d) => html`<tr><td>${d.g}</td>${months.map((m) => html`<td class="num">${d.by.get(m) ? Math.round(d.by.get(m)) : ''}</td>`)}</tr>`)}</tbody></table></div>` : html`<p class="muted">Add hours by grade to see the demand this job puts on the team.</p>`}
      </div></section>
      <section class="card"><div class="card-head"><h2>Snapshots</h2></div><div class="card-body">${table({
        id: 'snapshots', rows: [...(e.snapshots || [])].reverse(), compact: true, empty: 'Save a snapshot to keep a copy of the numbers before you change them.',
        columns: [
          { key: 'at', label: 'Saved', sortable: false, render: (x) => fmtDate(x.at) },
          { key: 'by', label: 'By', sortable: false, render: (x) => staffName(x.by) },
          { key: 'fee', label: 'Fee', align: 'num', sortable: false, render: (x) => money(x.fee) },
          { key: 'margin', label: 'Margin', align: 'num', sortable: false, render: (x) => pct(x.margin) },
          { key: 'note', label: 'Note', sortable: false },
        ],
      })}</div></section>
    </div>`);

  bind(root, e);
}

const pctTotal = (t) => html`<span class="${Math.abs(t - 100) > 0.01 ? 'neg' : ''}">${round2(t)}%</span>`;
const marginCell = (m, target) => html`<span class="${m !== null && m < (target ?? 0) ? 'neg' : ''}">${pct(m)}</span>`;

function tiles(e, c) {
  return html`
    ${tile({ label: 'Fee', value: money(c.fee), sub: e.method === 'bottom-up' ? 'hours × rate card' : e.constructionCost > 0 ? `${e.feePct}% of ${money(e.constructionCost)}` : 'lump sum' })}
    ${tile({ label: 'Cost', value: money(c.cost), sub: `${hrs(c.hours)} hours` })}
    ${tile({ label: 'Margin', value: pct(c.margin), tone: c.belowTarget ? 'critical' : '', sub: `target ${pct(e.targetMargin)}` })}
    ${tile({ label: 'Effective rate', value: c.hours ? `${money(c.fee / c.hours)}/h` : '—', sub: 'fee ÷ hours' })}
    ${tile({ label: 'Programme', value: `${sum(c.stages, (x) => x.weeks)} weeks`, sub: `${fmtDate(e.startDate)} – ${fmtDate(c.end)}` })}`;
}

// Live recalculation without re-rendering, so typing and tabbing aren't interrupted.
function refresh(root, e) {
  const s = getState();
  const c = costEstimate(s, e);
  const set = (k, v) => { const el = root.querySelector(`[data-out="${k}"]`); if (el) el.innerHTML = String(v); };
  for (const st of c.stages) {
    set(`dates-${st.id}`, `${fmtDate(st.start).replace(/ \d{4}$/, '')} – ${fmtDate(st.end)}`);
    set(`hours-${st.id}`, hrs(st.totalHours));
    set(`fee-${st.id}`, `<strong>${money(st.fee)}</strong>`);
    set(`cost-${st.id}`, money(st.cost));
    set(`margin-${st.id}`, marginCell(st.margin, e.targetMargin));
  }
  for (const g of c.grades) set(`g-${g}`, hrs(sum(c.stages, (x) => Number(x.hours?.[g]) || 0)));
  set('weeks', sum(c.stages, (x) => x.weeks));
  set('end', `to ${fmtDate(c.end)}`);
  set('pct', pctTotal(c.pctTotal));
  set('hours', hrs(c.hours)); set('fee', money(c.fee)); set('cost', money(c.cost)); set('margin', marginCell(c.margin, e.targetMargin));
  root.querySelector('#est-tiles').innerHTML = String(tiles(e, c));
}

function save(e, fn, { silent = true } = {}) {
  update((st) => {
    fn(e);
    e.updatedAt = todayISO();
    syncOpportunity(st, e);
  }, { silent });
}

function bind(root, e) {
  const stage = (id) => e.stages.find((x) => x.id === id);
  root.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('change', () => {
    const st = stage(el.dataset.s);
    const f = el.dataset.f;
    save(e, () => {
      if (f === 'name') st.name = el.value.trim() || st.name;
      else if (f === 'feeType') st.feeType = el.value;
      else if (f === 'weeks') st.weeks = Math.max(1, Math.round(Number(el.value) || 1));
      else if (f === 'pct') st.pct = Math.max(0, Number(el.value) || 0);
      else if (f === 'hours') {
        st.hours = { ...st.hours };
        const v = Math.max(0, Number(el.value) || 0);
        if (v) st.hours[el.dataset.g] = v; else delete st.hours[el.dataset.g];
      }
    });
    refresh(root, e);
  }));
  root.querySelectorAll('[data-top]').forEach((el) => el.addEventListener('change', () => {
    save(e, () => { e[el.dataset.top] = Math.max(0, Number(el.value) || 0); }, { silent: el.dataset.top !== 'constructionCost' });
    refresh(root, e);
  }));
  root.querySelectorAll('[data-method]').forEach((b) => b.addEventListener('click', () => save(e, () => {
    if (e.method === b.dataset.method) return;
    // Switching to top-down keeps the bottom-up fee as the lump sum and sets each stage's share from it.
    if (b.dataset.method === 'top-down') {
      const c = costEstimate(getState(), e);
      e.constructionCost = 0;
      e.fixedTotal = Math.round(c.fee);
      for (const st of c.stages) e.stages.find((x) => x.id === st.id).pct = c.fee ? round2((st.fee / c.fee) * 100) : 0;
    }
    e.method = b.dataset.method;
  }, { silent: false })));
  root.querySelector('#target')?.addEventListener('change', (ev) => { save(e, () => { e.targetMargin = Math.min(0.95, Math.max(0, Number(ev.target.value) / 100)); }, { silent: false }); });
  root.querySelector('#ratecard')?.addEventListener('change', (ev) => save(e, () => { e.rateCardId = ev.target.value; }, { silent: false }));
  root.querySelector('#tpl')?.addEventListener('change', async (ev) => {
    const t = getState().feeTemplates.find((x) => x.id === ev.target.value);
    if (!t) return;
    if (e.stages.length && !(await confirmDialog(`Replace the stages with "${t.name}"? Hours are set so each stage hits the template's ${pct(t.targetMargin)} target margin.`, { okLabel: 'Replace stages' }))) { ev.target.value = ''; return; }
    save(e, (x) => { x.templateId = t.id; x.targetMargin = t.targetMargin; x.stages = templateStages(getState(), x, t); }, { silent: false });
  });
  root.querySelector('#add-stage')?.addEventListener('click', () => save(e, (x) => {
    x.stages.push({ id: uid('es'), name: `Stage ${x.stages.length + 1}`, feeType: 'Fixed', weeks: 4, pct: 0, feeOverride: null, hours: {} });
  }, { silent: false }));
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => save(e, (x) => { x.stages = x.stages.filter((st) => st.id !== b.dataset.del); }, { silent: false })));
  root.querySelector('#edit-est')?.addEventListener('click', () => editDetails(e));
  root.querySelector('#snapshot').addEventListener('click', () => formModal({
    title: 'Save snapshot', fields: [{ name: 'note', label: 'Note', placeholder: 'e.g. Sent to client', full: true }], submitLabel: 'Save',
    onSubmit: (v) => {
      const c = costEstimate(getState(), e);
      save(e, (x) => { x.snapshots = [...(x.snapshots || []), { at: todayISO(), by: currentUser().id, fee: Math.round(c.fee), cost: Math.round(c.cost), hours: c.hours, margin: c.margin, note: v.note }]; }, { silent: false });
      toast('Snapshot saved.');
    },
  }));
  root.querySelector('#proposal').addEventListener('click', () => proposal(e));
  root.querySelector('#submit')?.addEventListener('click', () => {
    const c = costEstimate(getState(), e);
    if (e.method !== 'bottom-up' && Math.abs(c.pctTotal - 100) > 0.01) { toast(`The stage percentages add up to ${round2(c.pctTotal)}%, not 100%.`, 'error'); return; }
    save(e, (x) => { x.status = 'Submitted'; }, { silent: false });
    toast('Sent for approval.');
  });
  root.querySelector('#approve')?.addEventListener('click', () => { save(e, (x) => { x.status = 'Approved'; x.approvedBy = currentUser().id; }, { silent: false }); toast('Estimate approved.'); });
  root.querySelector('#reopen')?.addEventListener('click', () => save(e, (x) => { x.status = 'Draft'; x.approvedBy = null; }, { silent: false }));
  root.querySelector('#apply')?.addEventListener('click', async () => {
    const p = find('projects', e.projectId);
    if (!(await confirmDialog(`Add ${e.stages.length} stages and their planned billing to ${p.jobNo} ${p.name}?`, { okLabel: 'Add stages' }))) return;
    update((st) => {
      const out = estimateToProject(st, e);
      p.stages.push(...out.stages);
      p.invoiceSchedule.push(...out.schedule);
    });
    toast('Stages added to the project.');
    location.hash = `#/projects/${p.id}/stages`;
  });
}

function editDetails(e) {
  const s = getState();
  formModal({
    title: 'Edit estimate details',
    fields: [
      { name: 'name', label: 'Name', value: e.name, required: true, full: true },
      { name: 'clientId', label: 'Client', type: 'select', value: e.clientId, options: s.clients.map((c) => ({ value: c.id, label: c.name })), required: true },
      { name: 'sector', label: 'Sector', type: 'select', value: e.sector, options: SECTORS },
      { name: 'startDate', label: 'Expected start', type: 'date', value: e.startDate, required: true },
      { name: 'opportunityId', label: 'Opportunity', type: 'select', value: e.opportunityId || '', options: s.opportunities.filter((o) => C.OPEN_STAGES.includes(o.stage) || o.id === e.opportunityId).map((o) => ({ value: o.id, label: o.title })), placeholder: 'None' },
      { name: 'notes', label: 'Assumptions and exclusions (shown on the fee proposal)', type: 'textarea', value: e.notes, full: true },
    ],
    extraActions: [{ label: 'Delete', kind: 'danger', onClick: () => { remove(e); } }],
    onSubmit: (v) => update((st) => {
      if (e.opportunityId && e.opportunityId !== v.opportunityId) { const old = st.opportunities.find((o) => o.id === e.opportunityId); if (old) old.estimateId = null; }
      Object.assign(e, v, { opportunityId: v.opportunityId || null, updatedAt: todayISO() });
      if (e.opportunityId) { const o = st.opportunities.find((x) => x.id === e.opportunityId); o.estimateId = e.id; }
      syncOpportunity(st, e);
    }),
  });
}

async function remove(e) {
  if (!(await confirmDialog(`Delete the estimate "${e.name}"?`, { okLabel: 'Delete', danger: true }))) return;
  update((s) => {
    s.estimates = s.estimates.filter((x) => x.id !== e.id);
    s.opportunities.forEach((o) => { if (o.estimateId === e.id) o.estimateId = null; });
  });
  location.hash = '#/estimates';
}

// A printable fee proposal built from the estimate.
function proposal(e) {
  const s = getState();
  const c = costEstimate(s, e);
  const client = find('clients', e.clientId);
  openModal({
    title: 'Fee proposal',
    size: 'wide',
    body: html`<div class="invoice-doc print-area">
      <div class="inv-top"><div><img src="assets/perega-logo.png" alt="Perega"></div>
        <div style="text-align:right"><h2>FEE PROPOSAL</h2><dl class="inv-meta" style="margin-top:8px"><dt>Date</dt><dd>${fmtDate(todayISO())}</dd><dt>Valid for</dt><dd>90 days</dd></dl></div></div>
      <div class="inv-parties"><div><div class="muted">For</div><strong>${client?.name}</strong>${client?.contacts[0] ? html`<div>FAO ${client.contacts[0].name}</div>` : ''}<div style="white-space:pre-line">${client?.address || ''}</div></div>
        <div><div class="muted">Project</div><strong>${e.name}</strong><div>Programme ${sum(c.stages, (x) => x.weeks)} weeks from ${fmtDate(e.startDate)}</div></div></div>
      <p>Thank you for the opportunity to propose for this commission. Our fees for the stages below are:</p>
      <table class="lines"><thead><tr><th>Stage</th><th>Basis</th><th>Programme</th><th class="num">Fee</th></tr></thead>
        <tbody>${c.stages.map((st) => html`<tr><td>${st.name}</td><td>${st.feeType === 'T&M' ? 'Time charged, estimate' : 'Fixed fee'}</td><td>${st.weeks} weeks from ${fmtDate(st.start)}</td><td class="num">${money(st.fee)}</td></tr>`)}</tbody></table>
      <div class="totals"><div class="grand"><span>Total fee</span><b>${money(c.fee)}</b></div><div><span class="muted">Excluding VAT</span></div></div>
      ${c.stages.some((x) => x.feeType === 'T&M') ? html`<p style="margin-top:12px">Time-charged stages are billed monthly at our standard rates: ${Object.entries(c.rates).map(([g, r], i) => `${i ? ', ' : ''}${g} ${money(r)}`).join('')} per hour.</p>` : ''}
      ${e.notes ? html`<h3 style="margin-top:14px">Assumptions and exclusions</h3><p style="white-space:pre-line">${e.notes}</p>` : ''}
      <div class="inv-foot">Fees are invoiced monthly in line with progress, payable within ${s.settings.paymentTermsDays} days.</div>
    </div>`,
    actions: [{ label: 'Close' }, { label: 'Print or save as PDF', kind: 'primary', onClick: () => { window.print(); return false; } }],
  });
}

