import { getState, update, find, clientName, staffName, officeName, activeStaff, currentUser } from '../store.js';
import { html, money, compactMoney, fmtDate, todayISO, fyRange, sum, uid, addDays } from '../util.js';
import * as C from '../calc.js';
import { pageHead, table, pill, avatar, options, formModal, toast, confirmDialog } from '../ui.js';

const DEFAULT_PROB = { Lead: 10, Qualified: 30, Proposal: 50, Won: 100, Lost: 0 };

export function render(root, { query }) {
  const s = getState();
  const today = todayISO();
  const fy = fyRange(today, s.settings.fyStartMonth);
  const mode = query.get('view') === 'list' ? 'list' : 'board';
  const officeId = query.get('office') || '';
  const ownerId = query.get('owner') || '';
  const inFY = (o) => (o.stage === 'Won' ? C.inRange(o.wonDate, fy) : o.stage === 'Lost' ? C.inRange(o.lostDate, fy) : true);
  const opps = s.opportunities.filter((o) => (!officeId || o.officeId === officeId) && (!ownerId || o.ownerId === ownerId) && inFY(o));
  const totals = C.pipelineTotals(opps);
  const q = (k, v) => { const p = new URLSearchParams(query); if (v) p.set(k, v); else p.delete(k); p.delete('open'); return `#/pipeline?${p}`; };

  const filters = html`<div class="toolbar">
    <div class="segmented" role="group" aria-label="Layout"><a href="${q('view', '')}" class="${mode === 'board' ? 'on' : ''}">Board</a><a href="${q('view', 'list')}" class="${mode === 'list' ? 'on' : ''}">List</a></div>
    <label>Office <select class="select" data-filter="office">${options(s.offices.map((o) => ({ value: o.id, label: o.name })), officeId, { placeholder: 'All' })}</select></label>
    <label>Owner <select class="select" data-filter="owner">${options(activeStaff().filter((p) => p.isManager || s.opportunities.some((o) => o.ownerId === p.id)).map((p) => ({ value: p.id, label: p.name })), ownerId, { placeholder: 'Anyone' })}</select></label>
    <span class="spacer"></span>
    <span class="muted">${totals.count} open · ${money(totals.value)} · weighted ${money(totals.weighted)}</span>
  </div>`;

  const card = (o) => html`<article class="opp" draggable="true" data-id="${o.id}">
    <button type="button" class="opp-title" data-edit="${o.id}">${o.title}</button>
    <div class="opp-client">${clientName(o.clientId)} · ${officeName(o.officeId)}</div>
    <div class="opp-meta"><span class="opp-value">${money(o.value)}</span>${C.OPEN_STAGES.includes(o.stage) ? html`<span class="prob">${o.probability}%</span>` : ''}</div>
    <div class="opp-foot">
      <span>${o.stage === 'Won' ? `Won ${fmtDate(o.wonDate)}` : o.stage === 'Lost' ? `Lost ${fmtDate(o.lostDate)}` : `Decision ${fmtDate(o.expectedDate)}`}</span>
      ${avatar(staffName(o.ownerId))}
    </div>
    ${o.projectId ? html`<div class="opp-foot"><a href="#/projects/${o.projectId}">${find('projects', o.projectId)?.jobNo || 'Project'}</a></div>` : ''}
    <div class="opp-foot"><label class="sr-only" for="mv-${o.id}">Move ${o.title} to</label>
      <select id="mv-${o.id}" class="opp-move" data-move="${o.id}">${options(C.OPP_STAGES, o.stage)}</select></div>
  </article>`;

  const board = html`<div class="board">${C.OPP_STAGES.map((stage) => {
    const list = opps.filter((o) => o.stage === stage).sort((a, b) => (a.expectedDate || '').localeCompare(b.expectedDate || ''));
    const open = C.OPEN_STAGES.includes(stage);
    return html`<section class="lane" data-stage="${stage}" aria-label="${stage}">
      <div class="lane-head"><h2>${stage}${!open ? html` <span class="muted" style="font-weight:400">${fy.label}</span>` : ''}</h2>
        <div class="lane-sum">${list.length} · ${compactMoney(sum(list, (o) => o.value))}${open ? html`<br>weighted ${compactMoney(sum(list, (o) => (o.value * o.probability) / 100))}` : ''}</div></div>
      ${list.map(card)}
    </section>`;
  })}</div>`;

  const list = table({
    id: 'pipeline',
    defaultSort: { key: 'expectedDate', dir: 1 },
    rows: opps,
    columns: [
      { key: 'title', label: 'Opportunity', render: (o) => html`<button type="button" class="btn link cell-main" data-edit="${o.id}">${o.title}</button>` },
      { key: 'client', label: 'Client', value: (o) => clientName(o.clientId) },
      { key: 'stage', label: 'Stage', value: (o) => C.OPP_STAGES.indexOf(o.stage), render: (o) => pill(o.stage) },
      { key: 'value', label: 'Value', align: 'num', render: (o) => money(o.value) },
      { key: 'probability', label: 'Prob.', align: 'num', render: (o) => `${o.probability}%` },
      { key: 'weighted', label: 'Weighted', align: 'num', value: (o) => (o.value * o.probability) / 100, render: (o) => money((o.value * o.probability) / 100) },
      { key: 'expectedDate', label: 'Decision', value: (o) => o.wonDate || o.lostDate || o.expectedDate, render: (o) => fmtDate(o.wonDate || o.lostDate || o.expectedDate) },
      { key: 'owner', label: 'Owner', value: (o) => staffName(o.ownerId) },
      { key: 'office', label: 'Office', value: (o) => officeName(o.officeId) },
    ],
    footer: { title: `${opps.length} opportunities`, value: money(sum(opps, (o) => o.value)), weighted: money(totals.weighted) },
  });

  root.innerHTML = String(html`
    ${pageHead('Pipeline', { sub: 'Opportunities from first enquiry to won or lost. Won and lost columns show this financial year.', actions: html`<button type="button" class="btn primary" id="new-opp">New opportunity</button>` })}
    ${filters}
    ${mode === 'board' ? board : html`<div class="card"><div class="card-body">${list}</div></div>`}`);

  root.querySelectorAll('[data-filter]').forEach((sel) => sel.addEventListener('change', () => { location.hash = q(sel.dataset.filter, sel.value); }));
  root.querySelector('#new-opp').addEventListener('click', () => opportunityForm());
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]');
    if (b) opportunityForm(find('opportunities', b.dataset.edit));
  });
  root.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-move]');
    if (!sel) return;
    const stage = sel.value;
    sel.value = find('opportunities', sel.dataset.move).stage; // until the move is confirmed
    moveOpportunity(sel.dataset.move, stage);
  });

  // Drag and drop between lanes (the select on each card does the same from the keyboard).
  root.addEventListener('dragstart', (e) => {
    const c = e.target.closest('.opp');
    if (!c) return;
    e.dataTransfer.setData('text/plain', c.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    c.classList.add('dragging');
  });
  root.addEventListener('dragend', (e) => e.target.closest?.('.opp')?.classList.remove('dragging'));
  root.querySelectorAll('.lane').forEach((lane) => {
    lane.addEventListener('dragover', (e) => { e.preventDefault(); lane.classList.add('drop'); });
    lane.addEventListener('dragleave', (e) => { if (!lane.contains(e.relatedTarget)) lane.classList.remove('drop'); });
    lane.addEventListener('drop', (e) => {
      e.preventDefault();
      lane.classList.remove('drop');
      const id = e.dataTransfer.getData('text/plain');
      if (id) moveOpportunity(id, lane.dataset.stage);
    });
  });

  const openId = query.get('open');
  if (openId && find('opportunities', openId)) {
    history.replaceState(null, '', q('open', '')); // so a later re-render doesn't reopen it
    opportunityForm(find('opportunities', openId));
  }
}

export function moveOpportunity(id, stage) {
  const o = find('opportunities', id);
  if (!o || o.stage === stage) return;
  if (stage === 'Won') return winForm(o);
  if (stage === 'Lost') return lostForm(o);
  update(() => {
    if (!C.OPEN_STAGES.includes(o.stage)) o.probability = DEFAULT_PROB[stage];
    o.stage = stage;
    o.wonDate = null;
    o.lostDate = null;
  });
}

function lostForm(o) {
  formModal({
    title: `Mark "${o.title}" as lost`,
    fields: [
      { name: 'lostDate', label: 'Date', type: 'date', value: todayISO(), required: true },
      { name: 'lostReason', label: 'Reason', type: 'select', options: ['Lost on fee', 'Lost on programme', 'Client stayed with incumbent', 'Project cancelled', 'Did not bid', 'Other'], value: 'Lost on fee' },
    ],
    submitLabel: 'Mark as lost',
    onSubmit: (v) => update(() => Object.assign(o, { stage: 'Lost', probability: 0, lostDate: v.lostDate, lostReason: v.lostReason, wonDate: null })),
  });
}

function winForm(o) {
  const s = getState();
  const nextJob = `${s.settings.jobPrefix}${s.settings.nextJobNo}`;
  const clientJobs = s.projects.filter((p) => p.clientId === o.clientId && !p.internal && p.status !== 'Lost');
  formModal({
    title: `Mark "${o.title}" as won`,
    intro: `Fee ${money(o.value)} from ${clientName(o.clientId)}.`,
    fields: [
      { name: 'wonDate', label: 'Date won', type: 'date', value: todayISO(), required: true },
      { name: 'create', label: 'Then', type: 'select', value: o.projectId ? 'none' : 'project', options: [
        { value: 'project', label: 'Open a new project' },
        ...(clientJobs.length ? [{ value: 'stage', label: 'Add a stage to an existing project' }] : []),
        { value: 'none', label: 'Nothing for now' },
      ] },
      { name: 'jobNo', label: 'Job number (new project)', value: nextJob },
      { name: 'managerId', label: 'Project manager (new project)', type: 'select', value: o.ownerId, options: activeStaff().map((p) => ({ value: p.id, label: p.name })) },
      ...(clientJobs.length ? [{ name: 'projectId', label: 'Existing project', type: 'select', full: true, options: clientJobs.map((p) => ({ value: p.id, label: `${p.jobNo} ${p.name}` })) }] : []),
    ],
    submitLabel: 'Mark as won',
    onSubmit: (v) => {
      if (v.create === 'project' && !v.jobNo) return 'Give the new project a job number.';
      if (v.create === 'project' && s.projects.some((p) => p.jobNo === v.jobNo)) return `${v.jobNo} is already in use.`;
      let goTo = null;
      update((st) => {
        Object.assign(o, { stage: 'Won', probability: 100, wonDate: v.wonDate, lostDate: null });
        const stage = { id: uid('stg'), name: o.title, feeType: 'Fixed', fee: o.value, budgetHours: Math.round(o.value / 85), percentComplete: 0 };
        if (v.create === 'project') {
          const p = {
            id: uid('prj'), jobNo: v.jobNo, name: o.title, clientId: o.clientId, officeId: o.officeId, sector: '', status: 'Live',
            managerId: v.managerId, ownerId: o.ownerId, team: [...new Set([v.managerId, o.ownerId])], startDate: v.wonDate, endDate: null,
            address: find('clients', o.clientId)?.address || '', purchaseOrder: '', description: o.notes || '', internal: false,
            stages: [{ ...stage, name: 'Fee proposal' }], invoiceSchedule: [],
          };
          st.projects.push(p);
          o.projectId = p.id;
          const n = Number(v.jobNo.replace(/\D/g, ''));
          if (n >= st.settings.nextJobNo) st.settings.nextJobNo = n + 1;
          goTo = p.id;
        } else if (v.create === 'stage') {
          const p = st.projects.find((x) => x.id === v.projectId);
          p.stages.push(stage);
          o.projectId = p.id;
          goTo = p.id;
        }
      });
      toast(goTo ? 'Won. The project is ready for its stages and team.' : 'Marked as won.');
      if (goTo) location.hash = `#/projects/${goTo}/stages`;
    },
  });
}

export function opportunityForm(o = null, preset = {}) {
  const s = getState();
  const me = currentUser();
  const v = o || {
    title: '', clientId: preset.clientId || '', officeId: me.officeId, ownerId: me.id, value: '', probability: 10, stage: 'Lead',
    expectedDate: addDays(todayISO(), 60), durationMonths: 6, source: 'Existing client', notes: '',
  };
  formModal({
    title: o ? 'Edit opportunity' : 'New opportunity',
    size: 'wide',
    fields: [
      { name: 'title', label: 'Title', value: v.title, required: true, full: true },
      { name: 'clientId', label: 'Client', type: 'select', value: v.clientId, options: s.clients.map((c) => ({ value: c.id, label: c.name })), placeholder: 'Choose…' },
      { name: 'newClient', label: 'Or a new client', placeholder: 'Client name', hint: 'Adds the client if it isn\'t in the list.' },
      { name: 'value', label: 'Fee value (£)', type: 'number', min: 0, step: 50, value: v.value, required: true },
      { name: 'probability', label: 'Probability (%)', type: 'number', min: 0, max: 100, step: 5, value: v.probability, required: true },
      { name: 'stage', label: 'Stage', type: 'select', options: C.OPEN_STAGES.concat(o && !C.OPEN_STAGES.includes(o.stage) ? [o.stage] : []), value: v.stage, hint: o ? '' : 'Use the board to mark it won or lost.' },
      { name: 'expectedDate', label: 'Expected decision', type: 'date', value: v.expectedDate },
      { name: 'durationMonths', label: 'Expected duration (months)', type: 'number', min: 1, max: 60, value: v.durationMonths, hint: 'Spreads the weighted value across the forecast.' },
      { name: 'source', label: 'Source', type: 'select', options: ['Existing client', 'Referral', 'Tender portal', 'Website', 'Framework', 'Other'], value: v.source },
      { name: 'ownerId', label: 'Owner', type: 'select', value: v.ownerId, options: activeStaff().map((p) => ({ value: p.id, label: p.name })) },
      { name: 'officeId', label: 'Office', type: 'select', value: v.officeId, options: s.offices.map((x) => ({ value: x.id, label: x.name })) },
      { name: 'notes', label: 'Notes', type: 'textarea', value: v.notes, full: true },
    ],
    extraActions: o ? [{ label: 'Delete', kind: 'danger', onClick: () => { remove(o); } }] : [],
    onSubmit: (f) => {
      if (!f.clientId && !f.newClient) return 'Choose a client or type a new one.';
      update((st) => {
        let clientId = f.clientId;
        if (f.newClient) {
          const c = { id: uid('cli'), name: f.newClient, sector: '', address: '', phone: '', notes: '', contacts: [] };
          st.clients.push(c);
          clientId = c.id;
        }
        const data = { title: f.title, clientId, value: f.value, probability: f.probability, expectedDate: f.expectedDate, durationMonths: f.durationMonths || 6, source: f.source, ownerId: f.ownerId, officeId: f.officeId, notes: f.notes };
        if (o) {
          Object.assign(o, data);
          if (C.OPEN_STAGES.includes(f.stage)) o.stage = f.stage;
        } else {
          st.opportunities.push({ id: uid('opp'), ...data, stage: f.stage, wonDate: null, lostDate: null, lostReason: '', projectId: null, createdAt: todayISO() });
        }
      });
      toast(o ? 'Opportunity saved.' : 'Opportunity added.');
    },
  });
}

async function remove(o) {
  if (await confirmDialog(`Delete "${o.title}"? This can't be undone.`, { okLabel: 'Delete', danger: true })) {
    update((st) => { st.opportunities = st.opportunities.filter((x) => x.id !== o.id); });
    toast('Opportunity deleted.');
  }
}
