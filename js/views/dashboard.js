import { getState, currentUser, isManager, staffName, clientProjects, activeStaff, find } from '../store.js';
import { html, money, compactMoney, pct, hrs, fyRange, todayISO, monthLabel, weekStart, addDays, sum, fmtDate, monthKey } from '../util.js';
import * as C from '../calc.js';
import { tile, pageHead, flag, options, pill } from '../ui.js';
import { columnChart, SERIES } from '../charts.js';

export function render(root, { query }) {
  const s = getState();
  const today = todayISO();
  const me = currentUser();
  const fy = fyRange(today, s.settings.fyStartMonth);
  const officeId = query.get('office') || '';
  const ctx = C.makeCtx(s);
  const inOffice = (projectId) => !officeId || ctx.projects.get(projectId)?.officeId === officeId;

  const fins = clientProjects().filter((p) => !officeId || p.officeId === officeId).map((p) => ({ p, f: C.projectFinancials(p, ctx) }));
  const live = fins.filter((x) => C.BILLING_STATUSES.includes(x.p.status));
  const won = C.salesWon(s, fy, officeId);
  const pipe = C.pipelineTotals(s.opportunities.filter((o) => !officeId || o.officeId === officeId));
  const invoicedFY = sum(s.invoices.filter((i) => i.status !== 'Draft' && C.inRange(i.date, fy) && inOffice(i.projectId)), C.invoiceNet);
  const overdue = s.invoices.filter((i) => C.invoiceDisplayStatus(i, today) === 'Overdue' && inOffice(i.projectId));
  const wip = sum(live, (x) => x.f.wip);

  const thisWeek = weekStart(today);
  const from = addDays(thisWeek, -28);
  const to = addDays(thisWeek, -1);
  const people = activeStaff().filter((p) => p.billable && (!officeId || p.officeId === officeId));
  const util = C.utilisation(s, people, from, to);
  const firmUtil = sum(util, (r) => r.capacity) ? sum(util, (r) => r.chargeable) / sum(util, (r) => r.capacity) : null;

  // Charts
  const thisMonth = monthKey(today);
  const cal = C.forecastCalendar(s, fy.months, today, officeId);
  const calSeries = [
    { key: 'invoiced', label: 'Invoiced', color: SERIES[0] },
    { key: 'scheduled', label: 'Scheduled', color: SERIES[1] },
    { key: 'pipeline', label: 'Weighted pipeline', color: SERIES[2] },
  ];
  const calRows = cal.map((r) => ({ label: monthLabel(r.month), tipTitle: monthLabel(r.month, true), highlight: r.month === thisMonth, values: r }));
  const calTotal = sum(cal, (r) => r.invoiced + r.scheduled + r.pipeline);

  const wonRows = fy.months.filter((m) => m <= thisMonth).map((m) => ({
    label: monthLabel(m), tipTitle: monthLabel(m, true), highlight: m === thisMonth,
    values: { won: sum(won.filter((o) => monthKey(o.wonDate) === m), (o) => o.value) },
  }));

  // Side panels
  const myWeekHours = sum(s.timesheets.filter((e) => e.staffId === me.id && e.date >= thisWeek && e.date <= addDays(thisWeek, 6)), (e) => e.hours);
  const myCap = C.weekCapacity(s, me, thisWeek);
  const myStatus = C.weekStatus(s, me.id, thisWeek);
  const lastWeekStatus = C.weekStatus(s, me.id, addDays(thisWeek, -7));

  const watch = live.map((x) => ({ ...x, flags: C.projectFlags(x.f) })).filter((x) => x.flags.length)
    .sort((a, b) => b.flags.length - a.flags.length || b.f.wip - a.f.wip).slice(0, 6);
  const bigWip = live.filter((x) => x.f.wip > 5000).sort((a, b) => b.f.wip - a.f.wip).slice(0, 4);

  const soon = s.leave.filter((l) => l.status === 'Approved' && l.end >= today && l.start <= addDays(today, 21))
    .filter((l) => !officeId || find('staff', l.staffId)?.officeId === officeId)
    .sort((a, b) => a.start.localeCompare(b.start));

  const pending = {
    timesheets: s.timesheetWeeks.filter((w) => w.status === 'Submitted').length,
    expenses: s.expenses.filter((x) => x.status === 'Submitted').length,
    leave: s.leave.filter((l) => l.status === 'Requested').length,
    invoices: s.invoices.filter((i) => i.status === 'Draft').length,
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const officeSel = html`<label class="sr-only" for="dash-office">Office</label><select id="dash-office" class="select">${options(s.offices.map((o) => ({ value: o.id, label: o.name })), officeId, { placeholder: 'All offices' })}</select>`;

  root.innerHTML = String(html`
    ${pageHead(`${greeting}, ${me.name.split(' ')[0]}`, { sub: `${fy.label} · ${officeId ? find('offices', officeId)?.name : 'all offices'} · ${fmtDate(today)}`, actions: officeSel })}

    <section class="tiles" aria-label="Key figures">
      ${tile({ label: `Fees won, ${fy.label}`, value: compactMoney(sum(won, (o) => o.value)), sub: `${won.length} wins`, href: '#/reports/sales-won' })}
      ${tile({ label: 'Weighted pipeline', value: compactMoney(pipe.weighted), sub: `${pipe.count} open · ${compactMoney(pipe.value)} unweighted`, href: '#/pipeline' })}
      ${tile({ label: `Invoiced, ${fy.label}`, value: compactMoney(invoicedFY), sub: 'net of VAT', href: '#/invoices' })}
      ${tile({ label: 'Unbilled WIP', value: compactMoney(wip), sub: `${live.length} live and on-hold jobs`, href: '#/reports/wip' })}
      ${tile({ label: 'Overdue debt', value: compactMoney(sum(overdue, C.invoiceGross)), sub: `${overdue.length} invoices, gross`, href: '#/reports/aged-debt', tone: overdue.length ? 'critical' : '' })}
      ${tile({ label: 'Utilisation, last 4 weeks', value: pct(firmUtil), sub: 'chargeable ÷ available hours', href: '#/reports/utilisation' })}
    </section>

    <div class="grid-main">
      <div class="stack">
        <section class="card" aria-labelledby="cal-h">
          <div class="card-head"><h2 id="cal-h">Invoice and forecast calendar</h2><span class="sub">${fy.label} · ${money(calTotal)} in total</span></div>
          <div class="card-body">${columnChart({ series: calSeries, rows: calRows, caption: 'Invoice and forecast calendar by month' })}
            <p class="muted" style="font-size:12px;margin-top:6px">Scheduled is planned billing on live and on-hold jobs. Weighted pipeline spreads each open opportunity's value × probability evenly over its expected duration.</p>
          </div>
        </section>
        <section class="card" aria-labelledby="won-h">
          <div class="card-head"><h2 id="won-h">Fees won by month</h2><span class="sub">${fy.label} to date · ${money(sum(won, (o) => o.value))}</span></div>
          <div class="card-body">${columnChart({ series: [{ key: 'won', label: 'Fees won', color: SERIES[0] }], rows: wonRows, height: 200, caption: 'Fees won by month' })}</div>
        </section>
      </div>

      <div class="stack">
        <section class="card" aria-labelledby="week-h">
          <div class="card-head"><h2 id="week-h">My timesheet</h2>${pill(myStatus)}</div>
          <div class="card-body">
            <div class="kv"><span>This week</span><b>${hrs(myWeekHours)} of ${hrs(myCap)} h</b></div>
            <div class="kv"><span>Last week</span>${pill(lastWeekStatus)}</div>
            <p style="margin-top:10px"><a class="btn small primary" href="#/timesheets">Open timesheet</a></p>
          </div>
        </section>

        ${isManager() ? html`<section class="card" aria-labelledby="appr-h">
          <div class="card-head"><h2 id="appr-h">Waiting for approval</h2></div>
          <div class="card-body">
            ${[['timesheets', 'Timesheets'], ['expenses', 'Expense claims'], ['leave', 'Leave requests'], ['invoices', 'Draft invoices']].map(([k, label]) => html`<div class="kv"><a href="#/approvals/${k}">${label}</a><b>${pending[k]}</b></div>`)}
          </div>
        </section>` : ''}

        <section class="card" aria-labelledby="watch-h">
          <div class="card-head"><h2 id="watch-h">Projects to watch</h2></div>
          <div class="card-body">
            ${watch.length || bigWip.length ? html`<ul class="attention">
              ${watch.map((x) => html`<li><a href="#/projects/${x.p.id}"><span class="job">${x.p.jobNo}</span> ${x.p.name}</a><span>${x.flags.map((f) => flag(f.kind, f.label))}</span></li>`)}
              ${bigWip.filter((x) => !watch.includes(x)).map((x) => html`<li><a href="#/projects/${x.p.id}"><span class="job">${x.p.jobNo}</span> ${x.p.name}</a>${flag('warning', `${money(x.f.wip)} unbilled`)}</li>`)}
            </ul>` : html`<p class="muted">Nothing needs attention.</p>`}
          </div>
        </section>

        <section class="card" aria-labelledby="off-h">
          <div class="card-head"><h2 id="off-h">Who's off, next 3 weeks</h2></div>
          <div class="card-body">
            ${soon.length ? soon.map((l) => html`<div class="kv"><span>${staffName(l.staffId)}</span><span class="muted">${fmtDate(l.start)}${l.end !== l.start ? ` – ${fmtDate(l.end)}` : ''}</span></div>`) : html`<p class="muted">Nobody is booked off.</p>`}
          </div>
        </section>
      </div>
    </div>`);

  root.querySelector('#dash-office').addEventListener('change', (e) => {
    location.hash = e.target.value ? `#/dashboard?office=${e.target.value}` : '#/dashboard';
  });
}
