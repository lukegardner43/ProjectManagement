// UI building blocks shared by the views: tables, modals, forms, pills, tiles.

import { html, raw, esc } from './util.js';

// ── Tables ──────────────────────────────────────────────────────────────────
// Sort state survives re-renders, keyed by table id. The click handler that
// changes it lives in app.js (any [data-sort] inside a [data-table-id]).

const sortState = new Map();

export function setSort(tableId, key) {
  const cur = sortState.get(tableId);
  sortState.set(tableId, { key, dir: cur?.key === key ? -cur.dir : 1 });
}

const cmp = (a, b) => {
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1;
  if (b === null || b === undefined || b === '') return -1;
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en-GB', { numeric: true });
};

// columns: { key, label, value(row) → sortable raw value, render(row) → html,
//            align: 'num' | 'center', sortable, width }
export function table({ id, columns, rows, empty = 'Nothing to show yet.', footer = null, rowHref = null, defaultSort = null, compact = false }) {
  const st = sortState.get(id) || defaultSort;
  let data = rows;
  if (st) {
    const col = columns.find((c) => c.key === st.key);
    if (col) {
      const v = col.value || ((r) => r[col.key]);
      data = [...rows].sort((a, b) => cmp(v(a), v(b)) * st.dir);
    }
  }
  const cell = (c, r) => (c.render ? c.render(r) : c.value ? c.value(r) : r[c.key]);
  return html`<div class="table-wrap"><table class="grid ${compact ? 'compact' : ''}" data-table-id="${id}">
    <thead><tr>${columns.map((c) => html`<th class="${c.align || ''}" ${c.width ? raw(`style="width:${esc(c.width)}"`) : ''} ${st?.key === c.key ? raw(`aria-sort="${st.dir > 0 ? 'ascending' : 'descending'}"`) : ''}>${
      c.sortable === false ? c.label : html`<button type="button" class="th-sort" data-sort="${c.key}">${c.label}<span class="sort-ind" aria-hidden="true">${st?.key === c.key ? (st.dir > 0 ? '▲' : '▼') : ''}</span></button>`
    }</th>`)}</tr></thead>
    <tbody>${data.length
      ? data.map((r) => html`<tr ${rowHref ? raw(`data-href="${esc(rowHref(r))}" class="clickable"`) : ''}>${columns.map((c) => html`<td class="${c.align || ''}">${cell(c, r)}</td>`)}</tr>`)
      : html`<tr><td class="empty" colspan="${columns.length}">${empty}</td></tr>`}</tbody>
    ${footer ? html`<tfoot><tr>${columns.map((c) => html`<td class="${c.align || ''}">${footer[c.key] ?? ''}</td>`)}</tr></tfoot>` : ''}
  </table></div>`;
}

// ── Small pieces ────────────────────────────────────────────────────────────

const PILL = {
  Live: 'good', Approved: 'good', Paid: 'good', Won: 'good',
  'On hold': 'warning', Submitted: 'warning', Requested: 'warning', Proposal: 'info', Qualified: 'info',
  Overdue: 'critical', Rejected: 'critical', Lost: 'muted',
  Enquiry: 'info', Sent: 'info', Lead: 'info',
  Complete: 'neutral', Draft: 'neutral',
};
const ICON = { good: '✓', warning: '●', critical: '!', info: '', neutral: '', muted: '' };

export function pill(status) {
  const kind = PILL[status] || 'neutral';
  return html`<span class="pill pill-${kind}">${ICON[kind] ? html`<span aria-hidden="true">${ICON[kind]}</span>` : ''}${status}</span>`;
}

export function flag(kind, label) {
  return html`<span class="flag flag-${kind}"><span aria-hidden="true">${kind === 'critical' ? '!' : '▲'}</span>${label}</span>`;
}

export function tile({ label, value, sub = '', href = '', tone = '' }) {
  const inner = html`<div class="tile-label">${label}</div><div class="tile-value ${tone}">${value}</div>${sub ? html`<div class="tile-sub">${sub}</div>` : ''}`;
  return href ? html`<a class="tile" href="${href}">${inner}</a>` : html`<div class="tile">${inner}</div>`;
}

export function tabs(items, active) {
  return html`<nav class="tabs" aria-label="Sections">${items.map((t) => html`<a href="${t.href}" class="tab ${t.key === active ? 'active' : ''}" ${t.key === active ? raw('aria-current="page"') : ''}>${t.label}${t.count ? html`<span class="tab-count">${t.count}</span>` : ''}</a>`)}</nav>`;
}

// Hours or money used against a budget. Turns to the critical colour past 100%.
export function meter(value, max, { label = '' } = {}) {
  const ratio = max > 0 ? value / max : 0;
  const over = ratio > 1;
  const w = Math.min(100, Math.round(ratio * 100));
  return html`<div class="meter ${over ? 'over' : ''}" role="img" aria-label="${label || `${Math.round(ratio * 100)}% used`}">
    <div class="meter-track"><div class="meter-fill" style="width:${w}%"></div></div>
    <span class="meter-text">${max > 0 ? (over && Math.round(ratio * 100) <= 100 ? '>100%' : `${Math.round(ratio * 100)}%`) : '—'}${over ? html` <span class="sr-only">over budget</span>` : ''}</span>
  </div>`;
}

export function avatar(name) {
  const ini = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return html`<span class="avatar" title="${name}" aria-hidden="true">${ini}</span>`;
}

export function options(items, selected, { placeholder = null } = {}) {
  const list = items.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  return html`${placeholder !== null ? html`<option value="">${placeholder}</option>` : ''}${list.map((o) => html`<option value="${o.value}" ${String(o.value) === String(selected ?? '') ? raw('selected') : ''}>${o.label}</option>`)}`;
}

export function empty(title, text, action = '') {
  return html`<div class="empty-state"><h3>${title}</h3><p>${text}</p>${action}</div>`;
}

export function pageHead(title, { sub = '', actions = '' } = {}) {
  return html`<div class="page-head"><div><h1>${title}</h1>${sub ? html`<p class="page-sub">${sub}</p>` : ''}</div><div class="page-actions">${actions}</div></div>`;
}

// ── Modals ──────────────────────────────────────────────────────────────────

export function openModal({ title, body, actions = [], size = '', onMount }) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = String(html`<div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <header class="modal-head"><h2 id="modal-title">${title}</h2><button type="button" class="icon-btn" data-close aria-label="Close">×</button></header>
    <div class="modal-body">${body}</div>
    ${actions.length ? html`<footer class="modal-foot">${actions.map((a, i) => html`<button type="button" class="btn ${a.kind || ''}" data-action-index="${i}">${a.label}</button>`)}</footer>` : ''}
  </div>`);
  const prev = document.activeElement;
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey, true);
    if (prev && document.contains(prev)) prev.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') trapFocus(e, wrap);
  };
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { close(); return; }
    const b = e.target.closest('[data-action-index]');
    if (b) {
      const a = actions[Number(b.dataset.actionIndex)];
      if (a.onClick?.(wrap) !== false) close();
    }
  });
  document.addEventListener('keydown', onKey, true);
  root.append(wrap);
  onMount?.(wrap, close);
  const first = wrap.querySelector('[autofocus]') || wrap.querySelector('.modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea') || wrap.querySelector('.modal-foot .primary') || wrap.querySelector('[data-close]');
  first?.focus();
  return { el: wrap, close };
}

function trapFocus(e, wrap) {
  const f = [...wrap.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const [a, z] = [f[0], f[f.length - 1]];
  if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
}

export function confirmDialog(message, { title = 'Are you sure?', okLabel = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title, body: html`<p>${message}</p>`,
      actions: [
        { label: 'Cancel', onClick: () => { answered = true; resolve(false); } },
        { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => { answered = true; resolve(true); } },
      ],
    });
    // Closing with × or Escape counts as cancel.
    new MutationObserver((_, obs) => { if (!document.contains(m.el)) { obs.disconnect(); if (!answered) resolve(false); } })
      .observe(document.getElementById('modal-root'), { childList: true });
  });
}

// fields: { name, label, type, value, options, required, min, max, step, hint, full, placeholder }
function fieldHtml(f) {
  const id = `f_${f.name}`;
  const req = f.required ? raw('required') : '';
  const attrs = raw([
    f.min !== undefined ? `min="${esc(f.min)}"` : '',
    f.max !== undefined ? `max="${esc(f.max)}"` : '',
    f.step !== undefined ? `step="${esc(f.step)}"` : '',
    f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '',
  ].join(' '));
  const hint = f.hint ? html`<small class="hint">${f.hint}</small>` : '';
  if (f.type === 'checkbox') {
    return html`<div class="field ${f.full ? 'full' : ''}"><label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${f.value ? raw('checked') : ''}> ${f.label}</label>${hint}</div>`;
  }
  let control;
  if (f.type === 'select') control = html`<select id="${id}" name="${f.name}" ${req}>${options(f.options, f.value, { placeholder: f.placeholder ?? null })}</select>`;
  else if (f.type === 'textarea') control = html`<textarea id="${id}" name="${f.name}" rows="3" ${req}>${f.value ?? ''}</textarea>`;
  else if (f.type === 'html') control = f.html;
  else control = html`<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${f.value ?? ''}" ${req} ${attrs}>`;
  return html`<div class="field ${f.full ? 'full' : ''}"><label for="${id}">${f.label}${f.required ? html`<span class="req" aria-hidden="true"> *</span>` : ''}</label>${control}${hint}</div>`;
}

export function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'html') continue;
    const el = form.elements[f.name];
    if (!el) continue;
    if (f.type === 'checkbox') out[f.name] = el.checked;
    else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
    else out[f.name] = typeof el.value === 'string' ? el.value.trim() : el.value;
  }
  return out;
}

// onSubmit(values) may return false (or a string error) to keep the form open.
export function formModal({ title, fields, submitLabel = 'Save', onSubmit, size = '', intro = '', onMount, extraActions = [] }) {
  const body = html`${intro ? html`<p class="modal-intro">${intro}</p>` : ''}<form class="form-grid" novalidate>${fields.map(fieldHtml)}<p class="form-error" role="alert" hidden></p><button type="submit" hidden></button></form>`;
  const submit = (el) => {
    const form = el.querySelector('form');
    if (!form.reportValidity()) return false;
    const res = onSubmit(readForm(form, fields), el);
    if (typeof res === 'string') {
      const err = form.querySelector('.form-error');
      err.textContent = res;
      err.hidden = false;
      return false;
    }
    return res;
  };
  const m = openModal({
    title, body, size, onMount,
    actions: [...extraActions, { label: 'Cancel' }, { label: submitLabel, kind: 'primary', onClick: submit }],
  });
  m.el.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (submit(m.el) !== false) m.close();
  });
  return m;
}

// ── Toasts and downloads ────────────────────────────────────────────────────

export function toast(message, kind = 'ok') {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.textContent = message;
  root.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3600);
}

export function download(filename, text, type = 'text/csv') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
