// Portfolios: performance of groups of projects by sector, office, client,
// client type, manager or status.

import { getState } from '../store.js';
import { html, money, hrs, pct, compactMoney } from '../util.js';
import * as C from '../calc.js';
import { portfolio, PORTFOLIO_GROUPS } from '../forecast.js';
import { pageHead, table, options, meter } from '../ui.js';
import { barList } from '../charts.js';

export function render(root, { query }) {
  const s = getState();
  const by = PORTFOLIO_GROUPS[query.get('by')] ? query.get('by') : 'sector';
  const scope = query.get('scope') || 'active';
  const statuses = scope === 'active' ? C.BILLING_STATUSES : scope === 'complete' ? ['Complete'] : null;
  const groups = portfolio(s, by, C.makeCtx(s), { statuses });
  const q = (k, v) => { const u = new URLSearchParams(query); u.set(k, v); return `#/portfolios?${u}`; };
  const total = { fee: groups.reduce((t, g) => t + g.fee, 0), earned: groups.reduce((t, g) => t + g.earned, 0), cost: groups.reduce((t, g) => t + g.cost, 0) };

  root.innerHTML = String(html`
    ${pageHead('Portfolios', { sub: 'See how groups of projects are performing, not just one job at a time.' })}
    <div class="toolbar">
      <label>Group by <select class="select" data-q="by">${options(Object.entries(PORTFOLIO_GROUPS).map(([value, g]) => ({ value, label: g.label })), by)}</select></label>
      <label>Projects <select class="select" data-q="scope">${options([{ value: 'active', label: 'Live and on hold' }, { value: 'complete', label: 'Complete' }, { value: 'all', label: 'All' }], scope)}</select></label>
    </div>
    <div class="grid-main">
      <section class="card"><div class="card-head"><h2>By ${PORTFOLIO_GROUPS[by].label.toLowerCase()}</h2></div><div class="card-body">${table({
        id: `portfolio-${by}`, rows: groups, defaultSort: { key: 'fee', dir: -1 },
        columns: [
          { key: 'name', label: PORTFOLIO_GROUPS[by].label, render: (g) => html`<strong>${g.name}</strong><span class="cell-sub">${g.count} projects${g.flagged ? html` · <span class="neg">${g.flagged} flagged</span>` : ''}</span>` },
          { key: 'fee', label: 'Fees', align: 'num', render: (g) => money(g.fee) },
          { key: 'earned', label: 'Earned', align: 'num', render: (g) => money(g.earned) },
          { key: 'invoiced', label: 'Invoiced', align: 'num', render: (g) => money(g.invoiced) },
          { key: 'wip', label: 'WIP', align: 'num', render: (g) => money(g.wip) },
          { key: 'hours', label: 'Hours used', value: (g) => (g.budgetHours ? g.hours / g.budgetHours : null), render: (g) => meter(g.hours, g.budgetHours, { label: `${hrs(g.hours)} of ${hrs(g.budgetHours)} hours` }), width: '140px' },
          { key: 'margin', label: 'Margin', align: 'num', render: (g) => html`<span class="${g.margin < 0 ? 'neg' : ''}">${pct(g.margin)}</span>` },
        ],
        footer: { name: 'All', fee: money(total.fee), earned: money(total.earned), margin: pct(total.earned ? (total.earned - total.cost) / total.earned : null) },
        empty: 'No projects in this scope.',
      })}</div></section>
      <section class="card"><div class="card-head"><h2>Margin achieved</h2><span class="sub">Earned less cost, ÷ earned</span></div><div class="card-body">
        ${barList(groups.filter((g) => g.margin !== null).sort((a, b) => b.margin - a.margin).map((g) => ({
          label: g.name, value: Math.max(0, g.margin), over: g.margin < 0,
          tip: html`<strong>${g.name}</strong><div class="tip-row">Margin<b>${pct(g.margin)}</b></div><div class="tip-row">Earned<b>${compactMoney(g.earned)}</b></div><div class="tip-row">Cost<b>${compactMoney(g.cost)}</b></div>`,
        })), { format: pct, max: 1, empty: 'No earned value yet.' })}
      </div></section>
    </div>`);

  root.querySelectorAll('[data-q]').forEach((sel) => sel.addEventListener('change', () => { location.hash = q(sel.dataset.q, sel.value); }));
}
