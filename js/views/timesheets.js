import { getState, update, find, currentUser, isManager, activeStaff, staffName } from '../store.js';
import { html, raw, hrs, fmtDate, todayISO, weekStart, addDays, sum, uid, parseISO } from '../util.js';
import * as C from '../calc.js';
import { pageHead, pill, options, formModal, toast, confirmDialog } from '../ui.js';

// Rows added this session that have no hours yet, per person and week.
const extraRows = new Map();

const rowKey = (projectId, stageId) => `${projectId}|${stageId}`;

export function render(root, { query }) {
  const s = getState();
  const me = currentUser();
  const today = todayISO();
  const week = weekStart(query.get('week') || today);
  const staffId = isManager() ? query.get('staff') || me.id : me.id;
  const person = find('staff', staffId) || me;
  const days = C.weekDates(week);
  const sub = C.weekSubmission(s, person.id, week);
  const status = sub?.status || 'Draft';
  const locked = status === 'Submitted' || status === 'Approved';
  const entries = s.timesheets.filter((e) => e.staffId === person.id && e.date >= week && e.date <= days[6]);
  const k = `${person.id}|${week}`;
  const keys = new Set([...entries.map((e) => rowKey(e.projectId, e.stageId)), ...(extraRows.get(k) || [])]);
  const rows = [...keys].map((key) => {
    const [projectId, stageId] = key.split('|');
    const p = find('projects', projectId);
    return { key, projectId, stageId, p, stage: p?.stages.find((x) => x.id === stageId) };
  }).filter((r) => r.p && r.stage)
    .sort((a, b) => (a.p.internal - b.p.internal) || a.p.jobNo.localeCompare(b.p.jobNo) || a.stage.name.localeCompare(b.stage.name));
  const cell = (r, d) => sum(entries.filter((e) => e.projectId === r.projectId && e.stageId === r.stageId && e.date === d), (e) => e.hours);
  const onLeave = (d) => s.leave.find((l) => l.staffId === person.id && l.status === 'Approved' && d >= l.start && d <= l.end);
  const capacity = C.weekCapacity(s, person, week);
  const planned = s.allocations.filter((a) => a.staffId === person.id && a.weekStart === week);
  const total = sum(entries, (e) => e.hours);
  const nav = (w, st = staffId) => `#/timesheets?week=${w}${st !== me.id ? `&staff=${st}` : ''}`;
  const canApprove = isManager() && person.id !== me.id && status === 'Submitted';

  root.innerHTML = String(html`
    ${pageHead(person.id === me.id ? 'My timesheet' : `Timesheet: ${person.name}`, {
      sub: html`${pill(status)}${sub?.comment ? html` <span class="neg">“${sub.comment}”</span>` : ''}${sub?.approvedBy ? ` · approved by ${staffName(sub.approvedBy)}` : ''}`,
      actions: html`
        ${isManager() ? html`<label class="sr-only" for="ts-staff">Person</label><select id="ts-staff" class="select">${options(activeStaff().map((x) => ({ value: x.id, label: x.name })), person.id)}</select>` : ''}
        <span class="week-nav"><a class="btn" href="${nav(addDays(week, -7))}" aria-label="Previous week">‹</a><span class="week-label">${fmtDate(week)} – ${fmtDate(days[6])}</span><a class="btn" href="${nav(addDays(week, 7))}" aria-label="Next week">›</a></span>
        ${week !== weekStart(today) ? html`<a class="btn" href="${nav(weekStart(today))}">This week</a>` : ''}`,
    })}
    ${planned.length ? html`<p class="muted">Planned this week: ${planned.map((a, i) => html`${i ? ', ' : ''}<a href="#/projects/${a.projectId}">${find('projects', a.projectId)?.jobNo}</a> ${hrs(a.hours)} h`)}</p>` : ''}
    <div class="card"><div class="card-body">
      <div class="table-wrap"><table class="grid ts-grid">
        <thead><tr><th>Job and stage</th>${days.map((d, i) => html`<th class="${i > 4 ? 'weekend' : ''} ${d === today ? 'today' : ''}">${parseISO(d).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}<small>${parseISO(d).getUTCDate()}</small>${onLeave(d) ? html`<span class="leave-day">${onLeave(d).type === 'Annual leave' ? 'Leave' : onLeave(d).type.split(' ')[0]}</span>` : ''}</th>`)}<th>Total</th><th><span class="sr-only">Remove</span></th></tr></thead>
        <tbody>${rows.length ? rows.map((r) => html`<tr data-row="${r.key}">
          <td><span class="job">${r.p.jobNo}</span> ${r.p.internal ? '' : r.p.name}<span class="cell-sub">${r.stage.name}</span></td>
          ${days.map((d, i) => html`<td class="${i > 4 ? 'weekend' : ''}"><input type="number" min="0" max="24" step="0.25" inputmode="decimal" value="${cell(r, d) || ''}" data-cell="${r.key}|${d}" aria-label="${r.p.jobNo} ${r.stage.name}, ${fmtDate(d)}" ${locked ? raw('disabled') : ''}></td>`)}
          <td class="ts-total" data-row-total>${hrs(sum(days, (d) => cell(r, d)))}</td>
          <td>${locked ? '' : html`<button type="button" class="icon-btn" data-remove-row="${r.key}" aria-label="Remove ${r.p.jobNo} ${r.stage.name}">×</button>`}</td>
        </tr>`) : html`<tr><td class="empty" colspan="10">No time this week yet. Add a row for each job and stage you worked on.</td></tr>`}</tbody>
        <tfoot><tr><td>Total</td>${days.map((d, i) => html`<td class="ts-total ${i > 4 ? 'weekend' : ''}" data-day-total="${d}">${hrs(sum(entries.filter((e) => e.date === d), (e) => e.hours))}</td>`)}<td class="ts-total"><span id="ts-week-total" class="${total < capacity ? 'ts-short' : ''}">${hrs(total)}</span> <span class="muted" style="font-weight:400">/ ${hrs(capacity)}</span></td><td></td></tr></tfoot>
      </table></div>
      <div class="toolbar" style="margin:14px 0 0">
        ${locked ? '' : html`<button type="button" class="btn" id="add-row">Add row</button>
          ${planned.length ? html`<button type="button" class="btn" id="add-planned">Add planned jobs</button>` : ''}
          <button type="button" class="btn" id="copy-last">Copy rows from last week</button>`}
        <span class="spacer"></span>
        ${status === 'Draft' || status === 'Rejected' ? html`<button type="button" class="btn primary" id="submit">Submit for approval</button>` : ''}
        ${status === 'Submitted' && person.id === me.id ? html`<button type="button" class="btn" id="recall">Recall</button>` : ''}
        ${canApprove ? html`<button type="button" class="btn" id="reject">Reject</button><button type="button" class="btn primary" id="approve">Approve</button>` : ''}
        ${status === 'Approved' && isManager() ? html`<button type="button" class="btn" id="reopen">Reopen</button>` : ''}
      </div>
      <p class="muted" style="margin-top:10px;font-size:12.5px">Hours save as you type. Weeks lock once submitted; recall a week to change it.</p>
    </div></div>`);

  root.querySelector('#ts-staff')?.addEventListener('change', (e) => { location.hash = nav(week, e.target.value); });

  root.querySelectorAll('[data-cell]').forEach((inp) => inp.addEventListener('change', () => {
    const [projectId, stageId, date] = inp.dataset.cell.split('|');
    let v = Number(inp.value);
    if (!Number.isFinite(v) || v < 0) v = 0;
    v = Math.min(24, Math.round(v * 4) / 4);
    inp.value = v || '';
    update((st) => {
      st.timesheets = st.timesheets.filter((e) => !(e.staffId === person.id && e.projectId === projectId && e.stageId === stageId && e.date === date));
      if (v > 0) st.timesheets.push({ id: uid('t'), staffId: person.id, projectId, stageId, date, hours: v });
    }, { silent: true });
    refreshTotals(root);
  }));

  root.querySelectorAll('[data-remove-row]').forEach((b) => b.addEventListener('click', async () => {
    const [projectId, stageId] = b.dataset.removeRow.split('|');
    const has = entries.some((e) => e.projectId === projectId && e.stageId === stageId);
    if (has && !(await confirmDialog('Remove this row and its hours for the week?', { okLabel: 'Remove', danger: true }))) return;
    extraRows.get(k)?.delete(b.dataset.removeRow);
    update((st) => { st.timesheets = st.timesheets.filter((e) => !(e.staffId === person.id && e.projectId === projectId && e.stageId === stageId && e.date >= week && e.date <= days[6])); });
  }));

  const addKeys = (list) => {
    if (!extraRows.has(k)) extraRows.set(k, new Set());
    list.forEach((x) => extraRows.get(k).add(x));
    update(() => {}, {});
  };
  root.querySelector('#add-row')?.addEventListener('click', () => addRowForm(person, (key) => addKeys([key])));
  root.querySelector('#add-planned')?.addEventListener('click', () => addKeys(planned.map((a) => {
    const p = find('projects', a.projectId);
    const st = p.stages.find((x) => x.feeType === 'T&M' || x.percentComplete < 100) || p.stages[0];
    return rowKey(p.id, st.id);
  })));
  root.querySelector('#copy-last')?.addEventListener('click', () => {
    const prev = s.timesheets.filter((e) => e.staffId === person.id && e.date >= addDays(week, -7) && e.date < week);
    if (!prev.length) { toast('Nothing was booked last week.', 'error'); return; }
    addKeys([...new Set(prev.map((e) => rowKey(e.projectId, e.stageId)))]);
  });

  root.querySelector('#submit')?.addEventListener('click', async () => {
    const t = sum(getState().timesheets.filter((e) => e.staffId === person.id && e.date >= week && e.date <= days[6]), (e) => e.hours);
    if (t === 0) { toast('There are no hours to submit.', 'error'); return; }
    if (t < capacity && !(await confirmDialog(`This week has ${hrs(t)} of ${hrs(capacity)} expected hours. Submit anyway?`, { okLabel: 'Submit' }))) return;
    setWeek(person.id, week, { status: 'Submitted', submittedAt: todayISO(), comment: '' });
    toast('Timesheet submitted.');
  });
  root.querySelector('#recall')?.addEventListener('click', () => setWeek(person.id, week, { status: 'Draft' }));
  root.querySelector('#approve')?.addEventListener('click', () => { approveWeek(person.id, week); toast(`${person.name}'s week approved.`); });
  root.querySelector('#reject')?.addEventListener('click', () => rejectWeek(person.id, week));
  root.querySelector('#reopen')?.addEventListener('click', () => setWeek(person.id, week, { status: 'Draft', approvedBy: null, approvedAt: null }));
}

function refreshTotals(root) {
  let week = 0;
  root.querySelectorAll('tr[data-row]').forEach((tr) => {
    const t = sum([...tr.querySelectorAll('[data-cell]')], (i) => Number(i.value) || 0);
    tr.querySelector('[data-row-total]').textContent = hrs(t);
    week += t;
  });
  root.querySelectorAll('[data-day-total]').forEach((td) => {
    const d = td.dataset.dayTotal;
    td.textContent = hrs(sum([...root.querySelectorAll(`[data-cell$="|${d}"]`)], (i) => Number(i.value) || 0));
  });
  root.querySelector('#ts-week-total').textContent = hrs(week);
}

function setWeek(staffId, week, changes) {
  update((s) => {
    let w = s.timesheetWeeks.find((x) => x.staffId === staffId && x.weekStart === week);
    if (!w) { w = { staffId, weekStart: week, status: 'Draft', submittedAt: null, approvedBy: null, approvedAt: null, comment: '' }; s.timesheetWeeks.push(w); }
    Object.assign(w, changes);
  });
}

export function approveWeek(staffId, week) {
  setWeek(staffId, week, { status: 'Approved', approvedBy: currentUser().id, approvedAt: todayISO(), comment: '' });
}

export function rejectWeek(staffId, week) {
  formModal({
    title: `Reject ${staffName(staffId)}'s week of ${fmtDate(week)}`,
    fields: [{ name: 'comment', label: 'What needs changing?', type: 'textarea', required: true, full: true }],
    submitLabel: 'Reject',
    onSubmit: (v) => { setWeek(staffId, week, { status: 'Rejected', comment: v.comment }); toast('Sent back for changes.'); },
  });
}

function addRowForm(person, done) {
  const s = getState();
  const projects = s.projects.filter((p) => p.internal || (C.BILLING_STATUSES.includes(p.status) && p.stages.length));
  const mine = projects.filter((p) => p.internal || p.team.includes(person.id));
  const others = projects.filter((p) => !mine.includes(p));
  const projectOptions = [...mine, ...others].map((p) => ({ value: p.id, label: `${p.jobNo} ${p.name}${!p.internal && !mine.includes(p) ? ' (not on team)' : ''}` }));
  const stageOptions = (pid) => (find('projects', pid)?.stages || []).map((x) => ({ value: x.id, label: x.name }));
  const first = mine.find((p) => !p.internal) || projects[0];
  formModal({
    title: 'Add a row',
    fields: [
      { name: 'projectId', label: 'Job', type: 'select', value: first?.id, options: projectOptions, required: true, full: true },
      { name: 'stageId', label: 'Stage', type: 'select', options: stageOptions(first?.id), required: true, full: true },
    ],
    submitLabel: 'Add',
    onMount: (el) => {
      el.querySelector('[name=projectId]').addEventListener('change', (e) => {
        el.querySelector('[name=stageId]').innerHTML = String(options(stageOptions(e.target.value), ''));
      });
    },
    onSubmit: (v) => done(rowKey(v.projectId, v.stageId)),
  });
}
