// Billing: what to raise, approve, send and chase this month, when cash is
// likely to land, and which clients pay late.

import { getState, find, clientName, staffName } from '../store.js';
import { html, money, fmtDate, todayISO, monthKey, monthLabel, addMonths, sum } from '../util.js';
import * as C from '../calc.js';
import { billingActions, riskyPayers, cashForecast, clientPayStats, predictedPayDate } from '../forecast.js';
import { pageHead, table, tile, pill } from '../ui.js';
import { columnChart, SERIES } from '../charts.js';
import { invoiceForm, invoiceView } from './invoices.js';

export function render(root) {
  const s = getState();
  const today = todayISO();
  const ctx = C.makeCtx(s);
  const a = billingActions(s, today, ctx);
  const risky = riskyPayers(s, today);
  const stats = clientPayStats(s);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(monthKey(today), i));
  const cash = cashForecast(s, months, today);
  const clientOf = (inv) => ctx.projects.get(inv.projectId)?.clientId;
  const job = (projectId) => { const p = ctx.projects.get(projectId); return html`<a href="#/projects/${p.id}/billing"><span class="job">${p.jobNo}</span></a> ${p.name}`; };

  root.innerHTML = String(html`
    ${pageHead('Billing', { sub: 'Work through these each week: raise what has been earned, approve and send drafts, and chase what is late.' })}
    <section class="tiles">
      ${tile({ label: 'Ready to raise', value: money(sum(a.raise, (x) => x.suggested)), sub: `${a.raise.length} jobs` })}
      ${tile({ label: 'Drafts to approve', value: String(a.approve.length), href: '#/approvals/invoices' })}
      ${tile({ label: 'Approved, not sent', value: money(sum(a.send, C.invoiceGross)), sub: `${a.send.length} invoices` })}
      ${tile({ label: 'To chase', value: money(sum(a.chase, (x) => C.invoiceGross(x.inv))), sub: `${a.chase.length} overdue`, tone: a.chase.length ? 'critical' : '' })}
      ${tile({ label: 'Cash expected, next 3 months', value: money(sum(cash.slice(0, 3), (r) => r.invoices + r.planned)), sub: 'gross, incl. planned billing' })}
    </section>

    <div class="grid-2">
      <section class="card"><div class="card-head"><h2>Ready to raise</h2><span class="sub">WIP earned, or this month's planned billing not yet invoiced</span></div><div class="card-body">${table({
        id: 'raise', rows: a.raise, compact: true, empty: 'Nothing waiting to be invoiced.',
        columns: [
          { key: 'job', label: 'Job', sortable: false, render: (x) => html`${job(x.project.id)}<span class="cell-sub">${clientName(x.project.clientId)} · ${staffName(x.project.managerId)}</span>` },
          { key: 'wip', label: 'WIP', align: 'num', sortable: false, render: (x) => money(x.wip) },
          { key: 'planned', label: 'Planned this month', align: 'num', sortable: false, render: (x) => (x.planned ? html`${money(x.planned)}${x.invoicedThisMonth ? html`<span class="cell-sub">${money(x.invoicedThisMonth)} raised</span>` : ''}` : '—') },
          { key: 'act', label: '', sortable: false, render: (x) => html`<button type="button" class="btn small primary" data-raise="${x.project.id}">Raise</button>` },
        ],
      })}</div></section>
      <section class="card"><div class="card-head"><h2>To chase</h2></div><div class="card-body">${table({
        id: 'chase', rows: a.chase, compact: true, empty: 'Nothing overdue.',
        columns: [
          { key: 'inv', label: 'Invoice', sortable: false, render: (x) => html`<button type="button" class="btn link cell-main" data-inv="${x.inv.id}">${x.inv.number}</button><span class="cell-sub">${clientName(clientOf(x.inv))}</span>` },
          { key: 'gross', label: 'Gross', align: 'num', sortable: false, render: (x) => money(C.invoiceGross(x.inv)) },
          { key: 'late', label: 'Days late', align: 'num', sortable: false, render: (x) => html`<span class="${x.daysLate > 30 ? 'neg' : ''}">${x.daysLate}</span>` },
          { key: 'usual', label: 'Usually pays', sortable: false, render: (x) => (x.usual && x.usual.count >= 2 ? `${Math.round(x.usual.avgDays)} days after invoice` : html`<span class="muted">no history</span>`) },
        ],
      })}</div></section>
    </div>

    <div class="grid-2" style="margin-top:16px">
      <section class="card"><div class="card-head"><h2>Approved, waiting to send</h2></div><div class="card-body">${table({
        id: 'send', rows: a.send, compact: true, empty: 'Nothing waiting to send.',
        columns: [
          { key: 'inv', label: 'Invoice', sortable: false, render: (i) => html`<button type="button" class="btn link cell-main" data-inv="${i.id}">${i.number}</button>` },
          { key: 'job', label: 'Job', sortable: false, render: (i) => job(i.projectId) },
          { key: 'gross', label: 'Gross', align: 'num', sortable: false, render: (i) => money(C.invoiceGross(i)) },
        ],
      })}</div></section>
      <section class="card"><div class="card-head"><h2>Clients who pay late</h2></div><div class="card-body">${table({
        id: 'risky', rows: risky, compact: true, empty: 'No clients stand out.',
        columns: [
          { key: 'client', label: 'Client', sortable: false, render: (r) => html`<a href="#/clients/${r.clientId}">${clientName(r.clientId)}</a>` },
          { key: 'late', label: 'Average days late', align: 'num', sortable: false, render: (r) => (r.stats && r.stats.count >= 2 ? Math.round(r.stats.avgLate) : '—') },
          { key: 'overdue', label: 'Overdue now', align: 'num', sortable: false, render: (r) => (r.overdue ? html`${money(r.overdue.amount)}<span class="cell-sub">oldest ${r.overdue.maxDays} days</span>` : '—') },
        ],
      })}</div></section>
    </div>

    <section class="card" style="margin-top:16px"><div class="card-head"><h2>Cash forecast</h2><span class="sub">Gross receipts expected by month</span></div><div class="card-body">
      ${columnChart({
        series: [{ key: 'invoices', label: 'Unpaid invoices', color: SERIES[0] }, { key: 'planned', label: 'Planned billing', color: SERIES[1] }],
        rows: cash.map((r, i) => ({ label: monthLabel(r.month), tipTitle: monthLabel(r.month, true), highlight: i === 0, values: r })),
        height: 300, width: 1100, caption: 'Cash forecast by month',
      })}
      <p class="muted" style="font-size:12px;margin-top:6px">Unpaid invoices are placed at each client's usual payment pace (from their paid invoices, once there are two), or the due date. Planned billing is assumed invoiced at month end and paid at the same pace.</p>
    </div></section>

    <section class="card" style="margin-top:16px"><div class="card-head"><h2>Unpaid invoices and expected payment</h2></div><div class="card-body">${table({
      id: 'expected', compact: true, defaultSort: { key: 'expected', dir: 1 }, empty: 'Nothing unpaid.',
      rows: s.invoices.filter((i) => ['Sent', 'Approved'].includes(i.status)),
      columns: [
        { key: 'number', label: 'Invoice', render: (i) => html`<button type="button" class="btn link" data-inv="${i.id}">${i.number}</button>` },
        { key: 'client', label: 'Client', value: (i) => clientName(clientOf(i)) },
        { key: 'due', label: 'Due', value: (i) => i.dueDate, render: (i) => fmtDate(i.dueDate) },
        { key: 'expected', label: 'Expected', value: (i) => predictedPayDate(i, clientOf(i), stats, today), render: (i) => { const d = predictedPayDate(i, clientOf(i), stats, today); return html`<span class="${d > i.dueDate ? 'neg' : ''}">${fmtDate(d)}</span>`; } },
        { key: 'gross', label: 'Gross', align: 'num', value: C.invoiceGross, render: (i) => money(C.invoiceGross(i)) },
        { key: 'status', label: 'Status', value: (i) => C.invoiceDisplayStatus(i, today), render: (i) => pill(C.invoiceDisplayStatus(i, today)) },
      ],
    })}</div></section>`);

  root.querySelectorAll('[data-raise]').forEach((b) => b.addEventListener('click', () => invoiceForm({ projectId: b.dataset.raise })));
  root.querySelectorAll('[data-inv]').forEach((b) => b.addEventListener('click', () => invoiceView(find('invoices', b.dataset.inv))));
}
