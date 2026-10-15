import { getState, update, currentUser, activeStaff, officeName } from '../store.js';
import { html, hrs, fmtDate, todayISO, fyRange, addDays, weekStart, workingDays, isWeekday, parseISO, uid } from '../util.js';
import * as C from '../calc.js';
import { pageHead, table, pill, tile, options, formModal, toast, confirmDialog } from '../ui.js';

const TYPES = ['Annual leave', 'Sick leave', 'Training', 'Unpaid leave', 'Other'];
const DAYS = 42;

export function render(root, { query }) {
  const s = getState();
  const me = currentUser();
  const today = todayISO();
  const fy = fyRange(today, s.settings.fyStartMonth);
  const bal = C.leaveBalance(s, me, fy);
  const mine = s.leave.filter((l) => l.staffId === me.id);
  const officeId = query.get('office') ?? me.officeId;
  const start = weekStart(query.get('from') || today);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  const people = activeStaff().filter((p) => !officeId || p.officeId === officeId);
  const q = (k, v) => { const u = new URLSearchParams(query); u.set(k, v); return `#/leave?${u}`; };
  const cellState = (pid, d) => {
    const l = s.leave.find((x) => x.staffId === pid && ['Approved', 'Requested'].includes(x.status) && d >= x.start && d <= x.end);
    return l ? { l, cls: l.status === 'Approved' ? 'off' : 'req' } : null;
  };

  root.innerHTML = String(html`
    ${pageHead('Leave', { sub: `Leave year ${fy.label}`, actions: html`<button type="button" class="btn primary" id="request">Request leave</button>` })}
    <section class="tiles">
      ${tile({ label: 'Annual allowance', value: `${bal.allowance} days` })}
      ${tile({ label: 'Booked and approved', value: `${hrs(bal.approved)} days` })}
      ${tile({ label: 'Waiting for approval', value: `${hrs(bal.requested)} days` })}
      ${tile({ label: 'Left to book', value: `${hrs(bal.remaining)} days`, tone: bal.remaining < 0 ? 'critical' : '' })}
    </section>
    <section class="card"><div class="card-head"><h2>Who's off</h2>
      <span class="page-actions">
        <label class="sr-only" for="lv-office">Office</label><select id="lv-office" class="select" data-q="office">${options(s.offices.map((o) => ({ value: o.id, label: o.name })), officeId, { placeholder: 'All offices' })}</select>
        <span class="week-nav"><a class="btn small" href="${q('from', addDays(start, -28))}" aria-label="Earlier">‹</a><a class="btn small" href="${q('from', today)}">Today</a><a class="btn small" href="${q('from', addDays(start, 28))}" aria-label="Later">›</a></span>
      </span></div>
      <div class="card-body"><div class="table-wrap"><table class="cal">
        <thead>
          <tr><th></th>${days.map((d, i) => (i % 7 === 0 ? html`<th colspan="7" style="text-align:left">w/c ${fmtDate(d).replace(/ \d{4}$/, '')}</th>` : ''))}</tr>
          <tr><th></th>${days.map((d) => html`<th class="${isWeekday(d) ? '' : 'wk'}">${parseISO(d).toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' })}<br>${parseISO(d).getUTCDate()}</th>`)}</tr>
        </thead>
        <tbody>${people.map((p) => html`<tr><td class="who">${p.name}${officeId ? '' : html` <span class="muted">· ${officeName(p.officeId)}</span>`}</td>${days.map((d) => {
          const st = isWeekday(d) ? cellState(p.id, d) : null;
          const cls = [!isWeekday(d) ? 'wkend' : '', st?.cls || '', d === today ? 'today-col' : ''].join(' ');
          return html`<td class="${cls}" ${st ? html`data-tip="${`${p.name}: ${st.l.type}, ${st.l.status.toLowerCase()}`}" tabindex="0"` : ''}>${st ? (st.l.type === 'Annual leave' ? 'A' : st.l.type[0]) : ''}${st ? html`<span class="sr-only">${st.l.type} ${st.l.status}</span>` : ''}</td>`;
        })}</tr>`)}</tbody>
      </table></div>
      <p class="heat-key" style="margin-top:10px"><span class="k" style="background:var(--purple)"></span> Approved <span class="k" style="background:repeating-linear-gradient(45deg,var(--purple-tint),var(--purple-tint) 4px,#fff 4px,#fff 8px);box-shadow:inset 0 0 0 1px var(--heat-3)"></span> Requested · A annual, S sick, T training, U unpaid, O other</p>
      </div></section>
    <section class="card"><div class="card-head"><h2>My requests</h2></div><div class="card-body">${table({
      id: 'my-leave', rows: mine, defaultSort: { key: 'start', dir: -1 }, empty: 'No leave booked.',
      columns: [
        { key: 'type', label: 'Type' },
        { key: 'start', label: 'Dates', render: (l) => `${fmtDate(l.start)}${l.end !== l.start ? ` – ${fmtDate(l.end)}` : ''}${l.halfDay ? ' (half day)' : ''}` },
        { key: 'days', label: 'Working days', align: 'num', value: (l) => (l.halfDay ? 0.5 : workingDays(l.start, l.end)), render: (l) => (l.halfDay ? '0.5' : workingDays(l.start, l.end)) },
        { key: 'note', label: 'Note' },
        { key: 'status', label: 'Status', render: (l) => pill(l.status) },
        { key: 'act', label: '', sortable: false, render: (l) => (l.start > today && l.status !== 'Rejected' ? html`<button type="button" class="btn small link" data-cancel="${l.id}">Cancel</button>` : '') },
      ],
    })}</div></section>`);

  root.querySelector('#request').addEventListener('click', () => leaveForm());
  root.querySelectorAll('[data-q]').forEach((sel) => sel.addEventListener('change', () => { location.hash = q(sel.dataset.q, sel.value); }));
  root.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
    if (await confirmDialog('Cancel this leave?', { okLabel: 'Cancel leave', danger: true })) {
      update((st) => { st.leave = st.leave.filter((l) => l.id !== b.dataset.cancel); });
      toast('Leave cancelled.');
    }
  }));
}

function leaveForm() {
  const s = getState();
  const me = currentUser();
  const fy = fyRange(todayISO(), s.settings.fyStartMonth);
  const next = addDays(todayISO(), 7);
  formModal({
    title: 'Request leave',
    fields: [
      { name: 'type', label: 'Type', type: 'select', value: 'Annual leave', options: TYPES },
      { name: 'halfDay', label: 'Half day', type: 'checkbox', hint: 'Start and end on the same day.' },
      { name: 'start', label: 'First day', type: 'date', value: next, required: true },
      { name: 'end', label: 'Last day', type: 'date', value: next, required: true },
      { name: 'note', label: 'Note for your manager', type: 'textarea', full: true },
    ],
    submitLabel: 'Send request',
    onMount: (el) => el.querySelector('[name=start]').addEventListener('change', (e) => {
      const end = el.querySelector('[name=end]');
      if (end.value < e.target.value) end.value = e.target.value;
    }),
    onSubmit: (v) => {
      if (v.end < v.start) return 'The last day is before the first day.';
      if (v.halfDay && v.end !== v.start) return 'A half day starts and ends on the same day.';
      const days = v.halfDay ? 0.5 : workingDays(v.start, v.end);
      if (!days) return 'Those dates are all weekend days.';
      if (s.leave.some((l) => l.staffId === me.id && l.status !== 'Rejected' && l.start <= v.end && l.end >= v.start)) return 'You already have leave booked over some of those days.';
      const bal = C.leaveBalance(s, me, fy);
      if (v.type === 'Annual leave' && days > bal.remaining) return `That's ${days} days and you have ${bal.remaining} left this year.`;
      update((st) => st.leave.push({ id: uid('lv'), staffId: me.id, ...v, status: 'Requested', requestedAt: todayISO() }));
      toast('Leave requested.');
    },
  });
}

