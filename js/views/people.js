// People: profiles, skills and the skills matrix. Rates and employment
// details live in Settings → People and rates.

import { getState, update, find, officeName, activeStaff, isManager } from '../store.js';
import { html, raw, hrs, pct, todayISO, weekStart, addDays, sum } from '../util.js';
import * as C from '../calc.js';
import { pageHead, table, tabs, avatar, options, toast, openModal } from '../ui.js';

const LEVELS = { 1: 'Working knowledge', 2: 'Competent', 3: 'Expert' };

export function render(root, { params: [view = 'directory'], query }) {
  const s = getState();
  const officeId = query.get('office') || '';
  const people = activeStaff().filter((p) => !officeId || p.officeId === officeId).sort((a, b) => a.name.localeCompare(b.name));
  const ws = weekStart(todayISO());
  const weeks = [0, 1, 2, 3].map((i) => addDays(ws, i * 7));
  const free = (p) => {
    const cap = sum(weeks, (w) => C.weekCapacity(s, p, w));
    return { cap, planned: sum(weeks, (w) => C.allocatedHours(s, p.id, w)) };
  };
  const office = html`<label>Office <select class="select" id="ppl-office">${options(s.offices.map((o) => ({ value: o.id, label: o.name })), officeId, { placeholder: 'All' })}</select></label>`;

  const directory = () => html`<div class="card"><div class="card-body">${table({
    id: 'people', rows: people, defaultSort: { key: 'name', dir: 1 },
    columns: [
      { key: 'name', label: 'Name', render: (p) => html`<span class="person">${avatar(p.name)}<span><button type="button" class="btn link cell-main" data-person="${p.id}">${p.name}</button><span class="cell-sub">${p.email || ''}</span></span></span>` },
      { key: 'grade', label: 'Grade' },
      { key: 'discipline', label: 'Discipline' },
      { key: 'office', label: 'Office', value: (p) => officeName(p.officeId) },
      { key: 'skills', label: 'Top skills', sortable: false, render: (p) => html`<span class="chips">${[...(p.skills || [])].sort((a, b) => b.level - a.level).slice(0, 3).map((x) => html`<span class="chip">${x.skill}${x.level === 3 ? html` <span aria-label="expert">★</span>` : ''}</span>`)}</span>` },
      { key: 'free', label: 'Free, next 4 weeks', align: 'num', value: (p) => { const f = free(p); return f.cap - f.planned; }, render: (p) => { const f = free(p); return p.billable ? html`<span class="${f.planned > f.cap ? 'neg' : ''}">${hrs(Math.max(0, f.cap - f.planned))} h</span> <span class="muted">${pct(f.cap ? f.planned / f.cap : null)} planned</span>` : html`<span class="muted">non-chargeable</span>`; } },
    ],
  })}</div></div>`;

  const skills = s.settings.skills || [];
  const matrix = () => html`<div class="card"><div class="card-body">
    <div class="table-wrap"><table class="matrix">
      <thead><tr><th class="who">Person</th>${skills.map((k) => html`<th><span>${k}</span></th>`)}</tr></thead>
      <tbody>${people.filter((p) => p.billable).map((p) => html`<tr><td class="who">${p.name}<span class="cell-sub">${p.grade}</span></td>${skills.map((k) => {
        const lvl = (p.skills || []).find((x) => x.skill === k)?.level || 0;
        return html`<td class="lvl lvl-${lvl}" ${lvl ? raw(`data-tip="${p.name}: ${k}, ${LEVELS[lvl].toLowerCase()}" tabindex="0"`) : ''}>${lvl ? html`${'●'.repeat(lvl)}<span class="sr-only">${LEVELS[lvl]}</span>` : ''}</td>`;
      })}</tr>`)}</tbody>
      <tfoot><tr><td class="who"><strong>People with the skill</strong></td>${skills.map((k) => html`<td class="lvl">${people.filter((p) => (p.skills || []).some((x) => x.skill === k)).length || html`<span class="neg">0</span>`}</td>`)}</tr></tfoot>
    </table></div>
    <p class="heat-key" style="margin-top:10px">● working knowledge · ●● competent · ●●● expert. Click a name in the directory to edit skills.</p>
  </div></div>`;

  root.innerHTML = String(html`
    ${pageHead('People', { sub: `${people.length} people${officeId ? ` in ${officeName(officeId)}` : ''}` })}
    ${tabs([{ key: 'directory', label: 'Directory', href: '#/people' }, { key: 'skills', label: 'Skills matrix', href: '#/people/skills' }], view)}
    <div class="toolbar">${office}</div>
    ${view === 'skills' ? matrix() : directory()}`);

  root.querySelector('#ppl-office').addEventListener('change', (e) => { location.hash = `#/people${view === 'skills' ? '/skills' : ''}${e.target.value ? `?office=${e.target.value}` : ''}`; });
  root.querySelectorAll('[data-person]').forEach((b) => b.addEventListener('click', () => profile(find('staff', b.dataset.person))));
}

// Profile with a skills editor. Anyone can update their own skills; managers anyone's.
export function profile(p) {
  const s = getState();
  const me = s.settings.currentUserId;
  const canEdit = isManager() || p.id === me;
  const projects = s.projects.filter((x) => !x.internal && x.status === 'Live' && x.team.includes(p.id));
  const fy = { start: addDays(todayISO(), -91), end: addDays(todayISO(), -1) };
  const [u] = C.utilisation(s, [p], fy.start, fy.end);
  const skills = s.settings.skills || [];
  const have = new Map((p.skills || []).map((x) => [x.skill, x.level]));
  openModal({
    title: p.name,
    size: 'wide',
    body: html`<div class="grid-2">
      <div><dl class="facts">
        <dt>Grade</dt><dd>${p.grade}</dd><dt>Discipline</dt><dd>${p.discipline}</dd><dt>Office</dt><dd>${officeName(p.officeId)}</dd>
        <dt>Email</dt><dd>${p.email ? html`<a href="mailto:${p.email}">${p.email}</a>` : '—'}</dd>
        <dt>Contracted</dt><dd>${p.weeklyHours} h a week</dd>
        ${p.billable ? html`<dt>Utilisation</dt><dd>${pct(u.utilisation)} over the last 13 weeks</dd>` : ''}
      </dl>
      <h3 style="margin:14px 0 6px">Live projects</h3>
      ${projects.length ? projects.map((x) => html`<div><a href="#/projects/${x.id}"><span class="job">${x.jobNo}</span></a> ${x.name}</div>`) : html`<p class="muted">None.</p>`}</div>
      <div><h3 style="margin-bottom:6px">Skills</h3>
        <div class="table-wrap"><table class="grid compact"><thead><tr><th>Skill</th><th>Level</th></tr></thead><tbody>
        ${skills.map((k) => html`<tr><td>${k}</td><td><label class="sr-only" for="sk-${k}">${k} level</label><select id="sk-${k}" class="select" style="height:28px" data-skill="${k}" ${canEdit ? '' : raw('disabled')}>${options([{ value: 0, label: '—' }, ...Object.entries(LEVELS).map(([v, l]) => ({ value: v, label: l }))], have.get(k) || 0)}</select></td></tr>`)}
        </tbody></table></div></div>
    </div>`,
    actions: canEdit ? [{ label: 'Cancel' }, { label: 'Save skills', kind: 'primary', onClick: (el) => {
      const next = [...el.querySelectorAll('[data-skill]')].map((x) => ({ skill: x.dataset.skill, level: Number(x.value) })).filter((x) => x.level > 0);
      update(() => { p.skills = next; });
      toast('Skills saved.');
    } }] : [{ label: 'Close' }],
  });
}
