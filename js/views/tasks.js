// Tasks tied to project stages: shared by the project Tasks tab and My work.

import { getState, update, find, staffName, activeStaff, currentUser } from '../store.js';
import { html, raw, fmtDate, todayISO, addDays, uid } from '../util.js';
import { table, avatar, options, formModal, toast, confirmDialog } from '../ui.js';

export const TASK_STATUSES = ['Not started', 'In progress', 'Completed'];

export const isOverdue = (t, today = todayISO()) => t.status !== 'Completed' && t.due && t.due < today;

function statusPill(t) {
  if (isOverdue(t)) return html`<span class="pill pill-critical"><span aria-hidden="true">!</span>Overdue</span>`;
  return t.status === 'Completed' ? html`<span class="pill pill-good"><span aria-hidden="true">✓</span>Completed</span>`
    : t.status === 'In progress' ? html`<span class="pill pill-info">In progress</span>` : html`<span class="pill pill-neutral">Not started</span>`;
}

const people = (ids) => html`<span class="people">${ids.map((id) => avatar(staffName(id)))}</span>`;

export function taskTable(rows, { id = 'tasks', showProject = false } = {}) {
  return table({
    id, rows, defaultSort: { key: 'due', dir: 1 }, empty: 'No tasks.',
    columns: [
      { key: 'title', label: 'Task', render: (t) => html`<button type="button" class="btn link cell-main" data-task="${t.id}">${t.title}</button>${t.notes ? html`<span class="cell-sub">${t.notes}</span>` : ''}` },
      ...(showProject ? [{ key: 'project', label: 'Job', value: (t) => find('projects', t.projectId)?.jobNo, render: (t) => html`<a href="#/projects/${t.projectId}/tasks"><span class="job">${find('projects', t.projectId)?.jobNo}</span></a>` }] : []),
      { key: 'stage', label: 'Stage', value: (t) => find('projects', t.projectId)?.stages.find((s) => s.id === t.stageId)?.name || '—' },
      { key: 'who', label: 'Assigned', sortable: false, render: (t) => people(t.assignees) },
      { key: 'start', label: 'Start', render: (t) => fmtDate(t.start) },
      { key: 'due', label: 'Due', render: (t) => html`<span class="${isOverdue(t) ? 'neg' : ''}">${fmtDate(t.due)}</span>` },
      { key: 'status', label: 'Status', value: (t) => TASK_STATUSES.indexOf(t.status), render: (t) => html`<label class="sr-only" for="ts-${t.id}">Status of ${t.title}</label><select id="ts-${t.id}" class="select" style="height:28px" data-task-status="${t.id}">${options(TASK_STATUSES, t.status)}</select>${isOverdue(t) ? html` <span class="flag flag-critical">! overdue</span>` : ''}` },
    ],
  });
}

// Kanban by status or by person. Cards can be dragged between lanes.
export function taskBoard(rows, { by = 'status', team = [], showProject = false } = {}) {
  const lanes = by === 'person'
    ? [...team.map((id) => ({ key: id, label: staffName(id) })), { key: '', label: 'Unassigned' }]
    : TASK_STATUSES.map((s) => ({ key: s, label: s }));
  const inLane = (t, lane) => (by === 'person' ? (lane.key ? t.assignees.includes(lane.key) : !t.assignees.length) : t.status === lane.key);
  return html`<div class="board" style="grid-template-columns:repeat(${lanes.length}, minmax(220px, 1fr))">${lanes.map((lane) => {
    const list = rows.filter((t) => inLane(t, lane)).sort((a, b) => (a.due || '').localeCompare(b.due || ''));
    return html`<section class="lane" data-task-lane="${by}|${lane.key}" aria-label="${lane.label}">
      <div class="lane-head"><h2>${lane.label}</h2><div class="lane-sum">${list.length}</div></div>
      ${list.map((t) => html`<article class="opp" draggable="true" data-task-card="${t.id}">
        <button type="button" class="opp-title" data-task="${t.id}">${t.title}</button>
        <div class="opp-client">${showProject ? html`<span class="job">${find('projects', t.projectId)?.jobNo}</span> · ` : ''}${find('projects', t.projectId)?.stages.find((s) => s.id === t.stageId)?.name || ''}</div>
        <div class="opp-foot"><span class="${isOverdue(t) ? 'neg' : ''}">Due ${fmtDate(t.due)}</span>${people(t.assignees)}</div>
        ${by === 'person' ? html`<div class="opp-foot">${statusPill(t)}</div>` : ''}
      </article>`)}
    </section>`;
  })}</div>`;
}

export function bindTasks(root, { onChange = null } = {}) {
  const set = (id, fn) => { update((s) => { const t = s.tasks.find((x) => x.id === id); if (t) fn(t); }); onChange?.(); };
  root.querySelectorAll('[data-task]').forEach((b) => b.addEventListener('click', () => taskForm(getState().tasks.find((t) => t.id === b.dataset.task))));
  root.querySelectorAll('[data-task-status]').forEach((sel) => sel.addEventListener('change', () => set(sel.dataset.taskStatus, (t) => { t.status = sel.value; })));
  root.querySelectorAll('[data-task-card]').forEach((c) => c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.dataset.taskCard); c.classList.add('dragging'); }));
  root.querySelectorAll('[data-task-lane]').forEach((lane) => {
    lane.addEventListener('dragover', (e) => { e.preventDefault(); lane.classList.add('drop'); });
    lane.addEventListener('dragleave', (e) => { if (!lane.contains(e.relatedTarget)) lane.classList.remove('drop'); });
    lane.addEventListener('drop', (e) => {
      e.preventDefault();
      lane.classList.remove('drop');
      const id = e.dataTransfer.getData('text/plain');
      const [by, key] = lane.dataset.taskLane.split('|');
      set(id, (t) => {
        if (by === 'status') t.status = key;
        else t.assignees = key ? [key] : [];
      });
    });
  });
}

export function taskForm(t = null, preset = {}) {
  const s = getState();
  const projects = s.projects.filter((p) => !p.internal && ['Live', 'On hold'].includes(p.status));
  const projectId = t?.projectId || preset.projectId || projects[0]?.id;
  const p = find('projects', projectId);
  const pool = activeStaff();
  const assigned = new Set(t?.assignees || preset.assignees || [currentUser().id]);
  const checks = html`<div class="people" style="gap:4px 14px" role="group" aria-label="Assigned to">${pool.filter((x) => p?.team.includes(x.id) || assigned.has(x.id)).map((x) => html`<label class="check"><input type="checkbox" name="assignee" value="${x.id}" ${assigned.has(x.id) ? raw('checked') : ''}> ${x.name}</label>`)}</div>`;
  const today = todayISO();
  formModal({
    title: t ? 'Edit task' : 'New task',
    size: 'wide',
    fields: [
      { name: 'title', label: 'Task', value: t?.title, required: true, full: true },
      ...(preset.projectId || t ? [] : [{ name: 'projectId', label: 'Job', type: 'select', value: projectId, options: projects.map((x) => ({ value: x.id, label: `${x.jobNo} ${x.name}` })), full: true }]),
      { name: 'stageId', label: 'Stage', type: 'select', value: t?.stageId || preset.stageId || p?.stages.find((x) => x.percentComplete < 100)?.id, options: (p?.stages || []).map((x) => ({ value: x.id, label: x.name })) },
      { name: 'status', label: 'Status', type: 'select', value: t?.status || 'Not started', options: TASK_STATUSES },
      { name: 'start', label: 'Start', type: 'date', value: t?.start || today },
      { name: 'due', label: 'Due', type: 'date', value: t?.due || addDays(today, 7), required: true },
      { name: 'hours', label: 'Estimated hours', type: 'number', min: 0, step: 0.5, value: t?.hours ?? '' },
      { name: 'assignees', label: 'Assigned to (the project team)', type: 'html', html: checks, full: true },
      { name: 'notes', label: 'Notes', type: 'textarea', value: t?.notes, full: true },
    ],
    extraActions: t ? [{ label: 'Delete', kind: 'danger', onClick: () => { remove(t); } }] : [],
    onMount: (el) => {
      el.querySelector('[name=projectId]')?.addEventListener('change', (e) => {
        const np = find('projects', e.target.value);
        el.querySelector('[name=stageId]').innerHTML = String(options(np.stages.map((x) => ({ value: x.id, label: x.name })), np.stages.find((x) => x.percentComplete < 100)?.id));
      });
    },
    onSubmit: (v, el) => {
      if (v.start && v.due < v.start) return 'The due date is before the start.';
      const assignees = [...el.querySelectorAll('[name=assignee]:checked')].map((x) => x.value);
      update((st) => {
        const data = { title: v.title, stageId: v.stageId, status: v.status, start: v.start, due: v.due, hours: v.hours, notes: v.notes, assignees };
        if (t) Object.assign(t, data);
        else st.tasks.push({ id: uid('tk'), projectId: v.projectId || projectId, ...data, createdAt: today });
      });
      toast(t ? 'Task saved.' : 'Task added.');
    },
  });
}

async function remove(t) {
  if (await confirmDialog(`Delete the task "${t.title}"?`, { okLabel: 'Delete', danger: true })) {
    update((s) => { s.tasks = s.tasks.filter((x) => x.id !== t.id); });
  }
}
