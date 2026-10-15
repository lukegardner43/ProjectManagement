// One page for the signed-in person: their tasks across every job, follow-ups
// due, the projects they manage and where their timesheet stands.

import { getState, currentUser, clientName } from '../store.js';
import { html, hrs, money, pct, todayISO, weekStart, addDays, sum } from '../util.js';
import * as C from '../calc.js';
import { pageHead, tile, table, meter, flag } from '../ui.js';
import { taskTable, taskBoard, bindTasks, taskForm, isOverdue } from './tasks.js';
import { activityTable, bindActivities, activityForm } from './activities.js';

export function render(root, { query }) {
  const s = getState();
  const me = currentUser();
  const today = todayISO();
  const view = query.get('view') || 'board';
  const myTasks = s.tasks.filter((t) => t.assignees.includes(me.id));
  const open = myTasks.filter((t) => t.status !== 'Completed');
  const overdue = open.filter((t) => isOverdue(t, today));
  const dueWeek = open.filter((t) => t.due >= today && t.due <= addDays(today, 7));
  const followUps = s.activities.filter((a) => a.ownerId === me.id && a.type === 'Follow-up' && !a.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const ws = weekStart(today);
  const weekHours = sum(s.timesheets.filter((e) => e.staffId === me.id && e.date >= ws && e.date <= addDays(ws, 6)), (e) => e.hours);
  const ctx = C.makeCtx(s);
  const managed = s.projects.filter((p) => !p.internal && p.managerId === me.id && C.BILLING_STATUSES.includes(p.status)).map((p) => ({ p, f: C.projectFinancials(p, ctx) }));
  const recent = myTasks.filter((t) => t.status === 'Completed' && t.due >= addDays(today, -14));
  const boardRows = view === 'board' ? [...open, ...recent] : myTasks;

  root.innerHTML = String(html`
    ${pageHead('My work', { sub: `${me.name} · ${me.grade}`, actions: html`<button type="button" class="btn" id="log-act">Log activity</button><button type="button" class="btn primary" id="new-task">New task</button>` })}
    <section class="tiles">
      ${tile({ label: 'Open tasks', value: String(open.length), sub: `${dueWeek.length} due in the next 7 days` })}
      ${tile({ label: 'Overdue tasks', value: String(overdue.length), tone: overdue.length ? 'critical' : '' })}
      ${tile({ label: 'Follow-ups due', value: String(followUps.filter((a) => a.dueDate <= today).length), sub: `${followUps.length} open`, href: '#/activities?show=open' })}
      ${tile({ label: 'Hours this week', value: `${hrs(weekHours)} h`, sub: C.weekStatus(s, me.id, ws), href: '#/timesheets' })}
    </section>

    <section class="card"><div class="card-head"><h2>My tasks</h2>
      <div class="segmented" role="group" aria-label="View"><a href="#/my-work?view=board" class="${view === 'board' ? 'on' : ''}">Board</a><a href="#/my-work?view=list" class="${view === 'list' ? 'on' : ''}">List</a></div></div>
      <div class="card-body">${view === 'board' ? taskBoard(boardRows, { by: 'status', showProject: true }) : taskTable(myTasks, { id: 'my-tasks', showProject: true })}
      ${view === 'board' ? html`<p class="muted" style="font-size:12.5px;margin-top:8px">Drag a card to change its status. Completed shows the last two weeks.</p>` : ''}</div></section>

    <div class="grid-2" style="margin-top:16px">
      <section class="card"><div class="card-head"><h2>My follow-ups</h2></div><div class="card-body">${activityTable(followUps, { id: 'my-followups', showOwner: false })}</div></section>
      <section class="card"><div class="card-head"><h2>Projects I manage</h2></div><div class="card-body">${table({
        id: 'my-projects', rows: managed, compact: true, empty: 'You don\'t manage any live projects.', rowHref: (r) => `#/projects/${r.p.id}`,
        columns: [
          { key: 'job', label: 'Job', value: (r) => r.p.jobNo, render: (r) => html`<a href="#/projects/${r.p.id}"><span class="job">${r.p.jobNo}</span></a> ${r.p.name}<span class="cell-sub">${clientName(r.p.clientId)}</span>` },
          { key: 'hours', label: 'Hours used', value: (r) => r.f.hoursUsed, render: (r) => meter(r.f.hours, r.f.budgetHours), width: '130px' },
          { key: 'complete', label: 'Done', align: 'num', value: (r) => r.f.percentComplete, render: (r) => pct(r.f.percentComplete) },
          { key: 'wip', label: 'WIP', align: 'num', value: (r) => r.f.wip, render: (r) => money(r.f.wip) },
          { key: 'flags', label: '', sortable: false, render: (r) => C.projectFlags(r.f).slice(0, 1).map((x) => flag(x.kind, x.label)) },
        ],
      })}</div></section>
    </div>`);

  root.querySelector('#new-task').addEventListener('click', () => taskForm(null, { assignees: [me.id] }));
  root.querySelector('#log-act').addEventListener('click', () => activityForm());
  bindTasks(root);
  bindActivities(root);
}
