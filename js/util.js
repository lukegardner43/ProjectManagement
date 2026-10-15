// Shared helpers: HTML escaping, formatting, dates and CSV. No DOM access here,
// so calc.js and seed.js (which import this) also run under `node --test`.

// ── HTML ────────────────────────────────────────────────────────────────────

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

function part(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  if (v === false || v === null || v === undefined) return '';
  return esc(v);
}

// Tagged template: every interpolation is escaped unless it is itself html`` or raw().
// Arrays are joined, and false/null/undefined render as nothing, so
// `${cond && html`...`}` and `${list.map(...)}` both work.
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return new Raw(out);
}

// ── Numbers ─────────────────────────────────────────────────────────────────

const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const gbp2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const n0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

// Round first so -0.4 shows as £0, not -£0.
export const money = (n) => gbp0.format(Math.round(n || 0) || 0);
export const money2 = (n) => gbp2.format(n || 0);
export const hrs = (n) => n1.format(n || 0);
export const int = (n) => n0.format(n || 0);
export const pct = (n) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—');

// 1,284 / 12.9K / 4.2M — for axis ticks and stat tiles.
export function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return `${trim(n / 1e6)}M`;
  if (a >= 1e3) return `${trim(n / 1e3)}K`;
  return n0.format(n);
}
const trim = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, ''));
export const compactMoney = (n) => (n < 0 ? '-£' : '£') + compact(Math.abs(n));

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const sum = (arr, f = (x) => x) => arr.reduce((t, x) => t + (f(x) || 0), 0);

// ── Dates ───────────────────────────────────────────────────────────────────
// Dates are ISO 'YYYY-MM-DD' strings throughout, handled in UTC so that day
// arithmetic never trips over a daylight-saving change.

export const parseISO = (s) => new Date(`${s}T00:00:00Z`);
export const toISO = (d) => d.toISOString().slice(0, 10);

export function todayISO() {
  const d = new Date();
  return toISO(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}

export function addDays(s, n) {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export const dayOfWeek = (s) => (parseISO(s).getUTCDay() + 6) % 7; // Monday = 0
export const isWeekday = (s) => dayOfWeek(s) < 5;
export const weekStart = (s) => addDays(s, -dayOfWeek(s));
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

// Monday–Friday days from a to b inclusive.
export function workingDays(a, b) {
  if (b < a) return 0;
  let n = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) if (isWeekday(d)) n++;
  return n;
}

export const monthKey = (s) => s.slice(0, 7);
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export const monthStart = (key) => `${key}-01`;
export const monthEnd = (key) => addDays(monthStart(addMonths(key, 1)), -1);

export function fmtDate(s) {
  if (!s) return '—';
  return parseISO(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export function fmtDay(s) {
  return parseISO(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
export function monthLabel(key, long = false) {
  return parseISO(monthStart(key)).toLocaleDateString('en-GB', {
    month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC',
  });
}

// Financial year containing `date`, starting on the first of `startMonth` (1–12).
export function fyRange(date, startMonth = 4) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const startYear = m >= startMonth ? y : y - 1;
  const first = `${startYear}-${String(startMonth).padStart(2, '0')}`;
  const months = Array.from({ length: 12 }, (_, i) => addMonths(first, i));
  const endYear = startMonth === 1 ? startYear : startYear + 1;
  return {
    start: monthStart(months[0]),
    end: monthEnd(months[11]),
    months,
    label: startMonth === 1 ? `FY ${startYear}` : `FY ${startYear}/${String(endYear).slice(2)}`,
  };
}

// ── Misc ────────────────────────────────────────────────────────────────────

export const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();

export function toCSV(rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function groupBy(arr, key) {
  const m = new Map();
  for (const x of arr) {
    const k = typeof key === 'function' ? key(x) : x[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}
