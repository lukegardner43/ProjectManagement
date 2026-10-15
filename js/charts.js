// Small SVG/HTML charts. Each has a hover tooltip (any [data-tip], wired up in
// app.js), a legend when there is more than one series, and a table view so no
// value depends on colour alone.

import { html, raw, esc, compactMoney, money } from './util.js';

// Perega rubine, purple and a deepened golden (the brand #F9B000 is too light
// to read as a mark on white). Validated as a categorical set in this order.
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];

function niceStep(max, count) {
  const raw0 = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw0 || 1));
  const n = raw0 / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

// Bar with a 4px rounded data end and a square foot on the baseline.
function topRounded(x, y, w, h, r = 4) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function legend(series) {
  if (series.length < 2) return '';
  return html`<ul class="legend">${series.map((s) => html`<li><span class="swatch" style="background:${s.color}"></span>${s.label}</li>`)}</ul>`;
}

// Columns, one band per row: stacked by default, or side by side with
// grouped: true when the series are alternatives rather than parts of a whole.
// rows: [{ label, highlight, values: { key: n } }]
// width is the drawing width in chart units: use ~1100 for a full-width card so
// text keeps the same size as in a two-thirds card.
export function columnChart({ series, rows, format = compactMoney, tipFormat = money, height = 240, caption = '', grouped = false, width = 720 }) {
  const W = width; const H = height;
  const m = { l: 52, r: 8, t: 12, b: 26 };
  const pw = W - m.l - m.r; const ph = H - m.t - m.b;
  const totals = rows.map((r) => series.reduce((t, s) => t + (r.values[s.key] || 0), 0));
  const peak = grouped ? Math.max(1, ...rows.flatMap((r) => series.map((s) => r.values[s.key] || 0))) : Math.max(1, ...totals);
  const step = niceStep(peak, 4);
  const top = Math.max(step, Math.ceil(peak / step) * step);
  const y = (v) => m.t + ph - (v / top) * ph;
  const band = pw / rows.length;
  const bw = Math.min(24, band * 0.62);
  const GAP = 2;

  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);

  const cols = rows.map((r, i) => {
    const cx = m.l + band * i + band / 2;
    const x = cx - bw / 2;
    let base = 0;
    const segs = [];
    if (grouped) {
      const gw = Math.min(16, (band * 0.7 - GAP * (series.length - 1)) / series.length);
      const x0 = cx - (gw * series.length + GAP * (series.length - 1)) / 2;
      series.forEach((s, j) => {
        const v = r.values[s.key] || 0;
        const h = y(0) - y(v);
        if (h > 0) segs.push(`<path d="${topRounded(x0 + j * (gw + GAP), y(v), gw, h)}" fill="${s.color}"/>`);
      });
    }
    const present = grouped ? [] : series.filter((s) => (r.values[s.key] || 0) > 0);
    present.forEach((s, j) => {
      const v = r.values[s.key];
      const y0 = y(base); const y1 = y(base + v);
      base += v;
      const bottom = j === 0 ? y0 : y0 - GAP; // surface gap between stacked segments
      const h = Math.max(0, bottom - y1);
      if (h <= 0) return;
      segs.push(j === present.length - 1
        ? `<path d="${topRounded(x, y1, bw, h)}" fill="${s.color}"/>`
        : `<rect x="${x}" y="${y1}" width="${bw}" height="${h}" fill="${s.color}"/>`);
    });
    const tip = String(html`<strong>${r.tipTitle || r.label}</strong>${series.map((s) => html`<div class="tip-row"><span class="swatch" style="background:${s.color}"></span>${s.label}<b>${tipFormat(r.values[s.key] || 0)}</b></div>`)}${series.length > 1 && !grouped ? html`<div class="tip-row tip-total">Total<b>${tipFormat(totals[i])}</b></div>` : ''}`);
    return `<g>
      <rect class="hit" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ph}" data-tip="${esc(tip)}" tabindex="0" aria-label="${esc(r.label)}: ${esc(tipFormat(totals[i]))}"/>
      ${segs.join('')}
      <text x="${cx}" y="${H - 8}" class="axis-label ${r.highlight ? 'axis-now' : ''}" text-anchor="middle">${esc(r.label)}</text>
    </g>`;
  });

  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(caption)}">
    ${ticks.map((v) => `<line class="${v === 0 ? 'baseline' : 'gridline'}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-label" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(format(v))}</text>`).join('')}
    ${cols.join('')}
  </svg>`;

  const tableView = html`<details class="chart-table"><summary>View as table</summary>
    <div class="table-wrap"><table class="grid compact"><thead><tr><th>${caption ? 'Period' : ''}</th>${series.map((s) => html`<th class="num">${s.label}</th>`)}${series.length > 1 && !grouped ? html`<th class="num">Total</th>` : ''}</tr></thead>
    <tbody>${rows.map((r, i) => html`<tr><td>${r.tipTitle || r.label}</td>${series.map((s) => html`<td class="num">${tipFormat(r.values[s.key] || 0)}</td>`)}${series.length > 1 && !grouped ? html`<td class="num">${tipFormat(totals[i])}</td>` : ''}</tr>`)}</tbody></table></div>
  </details>`;

  return html`<figure class="chart-fig">${legend(series)}<div class="chart-box">${raw(svg)}</div>${tableView}</figure>`;
}

// Horizontal bars for a single measure. rows: [{ label, value, tip, href }]
export function barList(rows, { format = money, max = null, empty = 'No data' } = {}) {
  if (!rows.length) return html`<p class="muted">${empty}</p>`;
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return html`<ul class="barlist">${rows.map((r) => {
    const w = Math.max(0, Math.min(100, (r.value / top) * 100));
    const label = r.href ? html`<a href="${r.href}">${r.label}</a>` : r.label;
    return html`<li data-tip="${r.tip ? String(r.tip) : `${esc(r.label)}: ${esc(format(r.value))}`}" tabindex="0">
      <span class="bl-label">${label}</span>
      <span class="bl-track"><span class="bl-bar ${r.over ? 'over' : ''}" style="width:${w.toFixed(1)}%"></span></span>
      <span class="bl-value">${format(r.value)}</span>
    </li>`;
  })}</ul>`;
}
