import { getState, find, activeStaff, officeName } from '../store.js';
import { html, raw, esc, hrs, fmtDate, todayISO, weekStart, addDays, sum } from '../util.js';
import * as C from '../calc.js';
import { pageHead, options, openModal, toast } from '../ui.js';
import { setAllocation } from './projects.js';

const expanded = new Set();
const WEEKS = 12;

function loadClass(ratio, cap) {
  if (cap <= 0) return 'h0';
  if (ratio > 1.0001) return 'over-cap';
  if (ratio === 0) return 'h0';
  if (ratio <= 0.25) return 'h1';
  if (ratio <= 0.5) return 'h2';
  if (ratio <= 0.75) return 'h3';
  if (ratio <= 0.9) return 'h4';
  return 'h5';
}

export function render(root, { query }) {
  const s = getState();
  const today = todayISO();
  const thisWeek = weekStart(today);
  const start = weekStart(query.get('from') || addDays(thisWeek, -14));
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(start, i * 7));
  const officeId = query.get('office') || '';
  const discipline = query.get('discipline') || '';
  const people = activeStaff().filter((p) => p.billable && (!officeId || p.officeId === officeId) && (!discipline || p.discipline === discipline))
    .sort((a, b) => officeName(a.officeId).localeCompare(officeName(b.officeId)) || a.name.localeCompare(b.name));
  const disciplines = [...new Set(s.staff.map((p) => p.discipline))].sort();
  const q = (k, v) => { const u = new URLSearchParams(query); if (v) u.set(k, v); else u.delete(k); return `#/resourcing?${u}`; };

  const cellData = (p, w) => {
    const list = s.allocations.filter((a) => a.staffId === p.id && a.weekStart === w);
    const hours = sum(list, (a) => a.hours);
    const cap = C.weekCapacity(s, p, w);
    return { list, hours, cap, ratio: cap > 0 ? hours / cap : hours > 0 ? 2 : 0 };
  };
  const tipFor = (p, w, d) => String(html`<strong>${p.name}, w/c ${fmtDate(w)}</strong>
    <div class="tip-row">Planned<b>${hrs(d.hours)} h</b></div><div class="tip-row">Available<b>${hrs(d.cap)} h</b></div>
    ${d.list.map((a) => html`<div class="tip-row">${find('projects', a.projectId)?.jobNo} ${find('projects', a.projectId)?.name}<b>${hrs(a.hours)}</b></div>`)}
    ${d.ratio > 1 ? html`<div class="tip-row tip-total"><span>! Over capacity</span><b>+${hrs(d.hours - d.cap)} h</b></div>` : ''}`);

  let lastOffice = null;
  const rows = people.map((p) => {
    const header = p.officeId !== lastOffice && !officeId ? html`<tr><th colspan="${WEEKS + 1}" style="text-align:left;padding-top:12px">${officeName(p.officeId)}</th></tr>` : '';
    lastOffice = p.officeId;
    const open = expanded.has(p.id);
    const projectIds = [...new Set(s.allocations.filter((a) => a.staffId === p.id && weeks.includes(a.weekStart)).map((a) => a.projectId))];
    return html`${header}<tr>
      <td class="who"><button type="button" class="btn link" data-expand="${p.id}" aria-expanded="${open}">${open ? '▾' : '▸'} ${p.name}</button><span class="cell-sub" style="padding-left:18px">${p.grade} · ${p.discipline}</span></td>
      ${weeks.map((w) => {
        const d = cellData(p, w);
        const cls = loadClass(d.ratio, d.cap);
        const label = d.cap <= 0 ? 'Off' : `${hrs(d.hours)}`;
        return html`<td class="cell"><button type="button" class="${cls}" data-cell="${p.id}|${w}" data-tip="${tipFor(p, w, d)}" aria-label="${p.name}, week of ${fmtDate(w)}: ${hrs(d.hours)} of ${hrs(d.cap)} hours${d.ratio > 1 ? ', over capacity' : ''}">${d.ratio > 1 ? raw('<span aria-hidden="true">! </span>') : ''}${label}</button></td>`;
      })}
    </tr>
    ${open ? projectIds.map((pid) => html`<tr class="sub"><td class="who"><a href="#/projects/${pid}/team">${find('projects', pid)?.jobNo}</a> ${find('projects', pid)?.name}</td>${weeks.map((w) => html`<td class="subcell">${hrs(sum(s.allocations.filter((a) => a.staffId === p.id && a.projectId === pid && a.weekStart === w), (a) => a.hours)) || ''}</td>`)}</tr>`) : ''}
    ${open && !projectIds.length ? html`<tr class="sub"><td class="who" colspan="${WEEKS + 1}">Nothing planned in these weeks.</td></tr>` : ''}`;
  });

  const totals = weeks.map((w) => {
    const cap = sum(people, (p) => C.weekCapacity(s, p, w));
    const planned = sum(people, (p) => cellData(p, w).hours);
    return { cap, planned };
  });

  root.innerHTML = String(html`
    ${pageHead('Resourcing', {
      sub: 'Planned hours against each person\'s available hours, by week. Available hours allow for approved leave.',
      actions: html`<span class="week-nav"><a class="btn" href="${q('from', addDays(start, -28))}" aria-label="Earlier">‹</a><a class="btn" href="${q('from', '')}">Now</a><a class="btn" href="${q('from', addDays(start, 28))}" aria-label="Later">›</a></span>`,
    })}
    <div class="toolbar">
      <label>Office <select class="select" data-q="office">${options(s.offices.map((o) => ({ value: o.id, label: o.name })), officeId, { placeholder: 'All' })}</select></label>
      <label>Discipline <select class="select" data-q="discipline">${options(disciplines, discipline, { placeholder: 'All' })}</select></label>
      <span class="spacer"></span>
      <div class="heat-key" aria-label="Key">Load:
        <span class="k h0" style="box-shadow:inset 0 0 0 1px var(--line)"></span>0%
        <span class="k h1"></span><span class="k h2"></span><span class="k h3"></span><span class="k h4"></span><span class="k h5"></span>100%
        <span class="k over-cap"></span>! Over capacity</div>
    </div>
    <div class="card"><div class="card-body"><div class="table-wrap">
      <table class="heat">
        <thead><tr><th style="text-align:left">Person</th>${weeks.map((w) => html`<th class="${w === thisWeek ? 'now' : ''}">${fmtDate(w).replace(/ \d{4}$/, '')}${w === thisWeek ? html`<br><span style="color:var(--rubine)">this week</span>` : ''}</th>`)}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="sub"><td class="who"><strong>Planned / available</strong></td>${totals.map((t) => html`<td class="subcell">${Math.round(t.planned)}/${Math.round(t.cap)}</td>`)}</tr>
          <tr class="sub"><td class="who"><strong>Spare hours</strong></td>${totals.map((t) => html`<td class="subcell ${t.cap - t.planned < 0 ? 'neg' : ''}">${Math.round(t.cap - t.planned)}</td>`)}</tr>
        </tfoot>
      </table>
    </div></div></div>`);

  root.querySelectorAll('[data-q]').forEach((sel) => sel.addEventListener('change', () => { location.hash = q(sel.dataset.q, sel.value); }));
  root.querySelectorAll('[data-expand]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.expand;
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    render(root, { query });
  }));
  root.querySelectorAll('[data-cell]').forEach((b) => b.addEventListener('click', () => {
    const [id, w] = b.dataset.cell.split('|');
    editWeek(find('staff', id), w, () => render(root, { query }));
  }));
}

function editWeek(person, w, done) {
  const s = getState();
  const cap = C.weekCapacity(s, person, w);
  const current = s.allocations.filter((a) => a.staffId === person.id && a.weekStart === w);
  const candidates = s.projects.filter((p) => !p.internal && C.BILLING_STATUSES.includes(p.status));
  const listed = [...new Set([...current.map((a) => a.projectId), ...candidates.filter((p) => p.team.includes(person.id)).map((p) => p.id)])];
  const hoursFor = (pid) => sum(current.filter((a) => a.projectId === pid), (a) => a.hours);
  const row = (pid) => {
    const p = find('projects', pid);
    return `<div class="kv"><label for="ea-${esc(pid)}"><span class="job">${esc(p.jobNo)}</span> ${esc(p.name)}</label><input id="ea-${esc(pid)}" class="input" style="width:90px;text-align:right" type="number" min="0" max="80" step="0.5" value="${hoursFor(pid) || ''}" data-pid="${esc(pid)}"></div>`;
  };
  openModal({
    title: `${person.name}, week of ${fmtDate(w)}`,
    body: html`<p class="modal-intro">${hrs(cap)} hours available this week.</p>
      <div id="ea-rows">${raw(listed.map(row).join(''))}</div>
      <div class="field" style="margin-top:12px"><label for="ea-add">Add another project</label>
        <select id="ea-add">${options(candidates.filter((p) => !listed.includes(p.id)).map((p) => ({ value: p.id, label: `${p.jobNo} ${p.name}` })), '', { placeholder: 'Choose…' })}</select></div>
      <p class="muted" style="margin-top:10px">Total: <strong id="ea-total">${hrs(sum(current, (a) => a.hours))}</strong> h</p>`,
    onMount: (el) => {
      const total = () => { el.querySelector('#ea-total').textContent = hrs(sum([...el.querySelectorAll('[data-pid]')], (i) => Number(i.value) || 0)); };
      el.addEventListener('input', total);
      el.querySelector('#ea-add').addEventListener('change', (e) => {
        if (!e.target.value) return;
        el.querySelector('#ea-rows').insertAdjacentHTML('beforeend', row(e.target.value));
        e.target.querySelector(`option[value="${CSS.escape(e.target.value)}"]`).remove();
        e.target.value = '';
        [...el.querySelectorAll('#ea-rows input')].pop()?.focus();
      });
    },
    actions: [
      { label: 'Cancel' },
      { label: 'Save', kind: 'primary', onClick: (el) => {
        el.querySelectorAll('[data-pid]').forEach((i) => setAllocation(person.id, i.dataset.pid, w, Math.max(0, Number(i.value) || 0)));
        toast('Plan updated.');
        done();
      } },
    ],
  });
}
