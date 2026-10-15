// CRM activities: calls, meetings, emails, notes and follow-ups against
// clients and opportunities. Follow-ups carry a due date until done.

import { getState, update, find, clientName, staffName, currentUser, activeStaff } from '../store.js';
import { html, fmtDate, todayISO, addDays, uid } from '../util.js';
import * as C from '../calc.js';
import { pageHead, table, pill, tile, options, formModal, toast, confirmDialog } from '../ui.js';

export const ACTIVITY_TYPES = ['Call', 'Meeting', 'Email', 'Note', 'Follow-up'];
const ICON = { Call: '☎', Meeting: '◷', Email: '✉', Note: '✎', 'Follow-up': '⚑' };

export const isDueFollowUp = (a, today = todayISO()) => a.type === 'Follow-up' && !a.done && a.dueDate && a.dueDate <= today;

export function activityTable(rows, { id = 'acts', compact = true, showOwner = true } = {}) {
  const today = todayISO();
  return table({
    id, rows, compact, defaultSort: { key: 'when', dir: -1 }, empty: 'No activity yet.',
    columns: [
      { key: 'type', label: 'Type', render: (a) => html`<span class="nowrap"><span aria-hidden="true">${ICON[a.type]}</span> ${a.type}</span>` },
      { key: 'subject', label: 'Subject', render: (a) => html`<button type="button" class="btn link cell-main" data-activity="${a.id}">${a.subject}</button>${a.notes ? html`<span class="cell-sub">${a.notes}</span>` : ''}` },
      { key: 'client', label: 'Client', value: (a) => clientName(a.clientId), render: (a) => html`<a href="#/clients/${a.clientId}">${clientName(a.clientId)}</a>${a.opportunityId ? html`<span class="cell-sub">${getState().opportunities.find((o) => o.id === a.opportunityId)?.title || ''}</span>` : ''}` },
      ...(showOwner ? [{ key: 'owner', label: 'Owner', value: (a) => staffName(a.ownerId) }] : []),
      { key: 'when', label: 'Date', value: (a) => a.dueDate || a.date, render: (a) => (a.type === 'Follow-up' ? html`<span class="${!a.done && a.dueDate < today ? 'neg' : ''}">Due ${fmtDate(a.dueDate)}</span>` : fmtDate(a.date)) },
      { key: 'done', label: '', sortable: false, render: (a) => (a.type === 'Follow-up' ? (a.done ? pill('Complete') : html`<button type="button" class="btn small" data-done="${a.id}">Mark done</button>`) : '') },
    ],
  });
}

export function bindActivities(root) {
  root.querySelectorAll('[data-activity]').forEach((b) => b.addEventListener('click', () => activityForm(getState().activities.find((a) => a.id === b.dataset.activity))));
  root.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => {
    update((s) => { const a = s.activities.find((x) => x.id === b.dataset.done); a.done = true; a.date = todayISO(); });
    toast('Follow-up done.');
  }));
}

export function render(root, { query }) {
  const s = getState();
  const me = currentUser();
  const today = todayISO();
  const who = query.get('owner') ?? me.id;
  const type = query.get('type') || '';
  const show = query.get('show') || 'all';
  let rows = s.activities.filter((a) => (!who || a.ownerId === who) && (!type || a.type === type));
  if (show === 'open') rows = rows.filter((a) => a.type === 'Follow-up' && !a.done);
  const mine = s.activities.filter((a) => a.ownerId === me.id);
  const overdue = mine.filter((a) => a.type === 'Follow-up' && !a.done && a.dueDate < today);
  const week = mine.filter((a) => a.type === 'Follow-up' && !a.done && a.dueDate >= today && a.dueDate <= addDays(today, 7));
  const logged = s.activities.filter((a) => a.type !== 'Follow-up' && a.date >= addDays(today, -30));
  const q = (k, v) => { const u = new URLSearchParams(query); u.set(k, v); return `#/activities?${u}`; };

  root.innerHTML = String(html`
    ${pageHead('Activities', { sub: 'Calls, meetings, emails and notes with clients, and the follow-ups that keep opportunities moving.', actions: html`<button type="button" class="btn primary" id="new-act">Log activity</button>` })}
    <section class="tiles">
      ${tile({ label: 'My overdue follow-ups', value: String(overdue.length), tone: overdue.length ? 'critical' : '', href: q('show', 'open') })}
      ${tile({ label: 'My follow-ups this week', value: String(week.length) })}
      ${tile({ label: 'Activity logged, last 30 days', value: String(logged.length), sub: 'everyone' })}
      ${tile({ label: 'Open opportunities with no follow-up', value: String(s.opportunities.filter((o) => C.OPEN_STAGES.includes(o.stage) && !s.activities.some((a) => a.opportunityId === o.id && a.type === 'Follow-up' && !a.done)).length), href: '#/pipeline' })}
    </section>
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Show"><a href="${q('show', 'all')}" class="${show === 'all' ? 'on' : ''}">Everything</a><a href="${q('show', 'open')}" class="${show === 'open' ? 'on' : ''}">Open follow-ups</a></div>
      <label>Owner <select class="select" data-q="owner">${options(activeStaff().map((p) => ({ value: p.id, label: p.name })), who, { placeholder: 'Everyone' })}</select></label>
      <label>Type <select class="select" data-q="type">${options(ACTIVITY_TYPES, type, { placeholder: 'All' })}</select></label>
    </div>
    <div class="card"><div class="card-body">${activityTable(rows, { id: 'activities', compact: false })}</div></div>`);

  root.querySelectorAll('[data-q]').forEach((sel) => sel.addEventListener('change', () => { location.hash = q(sel.dataset.q, sel.value); }));
  root.querySelector('#new-act').addEventListener('click', () => activityForm());
  bindActivities(root);
}

export function activityForm(a = null, preset = {}) {
  const s = getState();
  const clientId = a?.clientId || preset.clientId || '';
  const oppsFor = (cid) => s.opportunities.filter((o) => o.clientId === cid && (C.OPEN_STAGES.includes(o.stage) || o.id === a?.opportunityId));
  const contactsFor = (cid) => find('clients', cid)?.contacts || [];
  formModal({
    title: a ? 'Edit activity' : 'Log activity',
    size: 'wide',
    fields: [
      { name: 'type', label: 'Type', type: 'select', value: a?.type || preset.type || 'Call', options: ACTIVITY_TYPES },
      { name: 'date', label: 'Date', type: 'date', value: a?.date || todayISO(), required: true },
      { name: 'subject', label: 'Subject', value: a?.subject, required: true, full: true },
      { name: 'clientId', label: 'Client', type: 'select', value: clientId, required: true, placeholder: 'Choose…', options: s.clients.map((c) => ({ value: c.id, label: c.name })) },
      { name: 'contactId', label: 'Contact', type: 'select', value: a?.contactId || '', placeholder: '—', options: contactsFor(clientId).map((c) => ({ value: c.id, label: c.name })) },
      { name: 'opportunityId', label: 'Opportunity', type: 'select', value: a?.opportunityId || preset.opportunityId || '', placeholder: '—', options: oppsFor(clientId).map((o) => ({ value: o.id, label: o.title })) },
      { name: 'ownerId', label: 'Owner', type: 'select', value: a?.ownerId || currentUser().id, options: activeStaff().map((p) => ({ value: p.id, label: p.name })) },
      { name: 'dueDate', label: 'Follow-up due', type: 'date', value: a?.dueDate || addDays(todayISO(), 7), hint: 'Follow-ups only.' },
      { name: 'done', label: 'Done', type: 'checkbox', value: a?.done ?? false },
      { name: 'notes', label: 'Notes', type: 'textarea', value: a?.notes, full: true },
    ],
    extraActions: a ? [{ label: 'Delete', kind: 'danger', onClick: () => { remove(a); } }] : [],
    onMount: (el) => {
      el.querySelector('[name=clientId]').addEventListener('change', (e) => {
        el.querySelector('[name=contactId]').innerHTML = String(options(contactsFor(e.target.value).map((c) => ({ value: c.id, label: c.name })), '', { placeholder: '—' }));
        el.querySelector('[name=opportunityId]').innerHTML = String(options(oppsFor(e.target.value).map((o) => ({ value: o.id, label: o.title })), '', { placeholder: '—' }));
      });
    },
    onSubmit: (v) => {
      update((st) => {
        const data = { ...v, contactId: v.contactId || null, opportunityId: v.opportunityId || null, dueDate: v.type === 'Follow-up' ? v.dueDate : null, done: v.type === 'Follow-up' ? v.done : true };
        if (a) Object.assign(a, data);
        else st.activities.push({ id: uid('ac'), ...data });
      });
      toast(a ? 'Activity saved.' : 'Activity logged.');
    },
  });
}

async function remove(a) {
  if (await confirmDialog('Delete this activity?', { okLabel: 'Delete', danger: true })) {
    update((s) => { s.activities = s.activities.filter((x) => x.id !== a.id); });
  }
}
