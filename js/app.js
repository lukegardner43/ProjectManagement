// App shell: navigation, hash router and the document-level handlers that every
// view relies on (sortable tables, clickable rows, tooltips, global search).

import { load, subscribe, getState, update, currentUser, pendingApprovals, lastSaveError, activeStaff } from './store.js';
import { html, raw } from './util.js';
import { setSort, options } from './ui.js';
import * as dashboard from './views/dashboard.js';
import * as pipeline from './views/pipeline.js';
import * as clients from './views/clients.js';
import * as projects from './views/projects.js';
import * as timesheets from './views/timesheets.js';
import * as approvals from './views/approvals.js';
import * as resourcing from './views/resourcing.js';
import * as invoices from './views/invoices.js';
import * as expenses from './views/expenses.js';
import * as leave from './views/leave.js';
import * as reports from './views/reports.js';
import * as settings from './views/settings.js';

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  funnel: 'M3 4h18l-7 8.5V20l-4-2v-5.5z',
  building: 'M4 21V3h11v18M15 9h5v12M8 7h3M8 11h3M8 15h3M3 21h18',
  folder: 'M3 6.5V19h18V8.5h-9L10 6H3z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3.5 2',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  sun: 'M4 7h16v13H4zM4 11h16M9 4v5M15 4v5',
  invoice: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  check: 'M4 12.5 9 17.5 20 6.5',
  chart: 'M4 20V10M10 20V4M16 20v-7M3 20h18',
  cog: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4z',
};
const icon = (name) => raw(`<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`);

const NAV = [
  { group: '', items: [['/dashboard', 'Dashboard', 'home']] },
  { group: 'Sales', items: [['/pipeline', 'Pipeline', 'funnel'], ['/clients', 'Clients', 'building']] },
  { group: 'Delivery', items: [['/projects', 'Projects', 'folder'], ['/resourcing', 'Resourcing', 'grid']] },
  { group: 'Time & money', items: [['/timesheets', 'Timesheets', 'clock'], ['/expenses', 'Expenses', 'receipt'], ['/leave', 'Leave', 'sun'], ['/invoices', 'Invoices', 'invoice']] },
  { group: 'Manage', items: [['/approvals', 'Approvals', 'check'], ['/reports', 'Reports', 'chart'], ['/settings', 'Settings', 'cog']] },
];

const ROUTES = [
  [/^\/dashboard$/, dashboard.render],
  [/^\/pipeline$/, pipeline.render],
  [/^\/clients$/, clients.list],
  [/^\/clients\/([\w-]+)$/, clients.detail],
  [/^\/projects$/, projects.list],
  [/^\/projects\/([\w-]+)(?:\/(\w+))?$/, projects.detail],
  [/^\/timesheets$/, timesheets.render],
  [/^\/approvals(?:\/(\w+))?$/, approvals.render],
  [/^\/resourcing$/, resourcing.render],
  [/^\/invoices$/, invoices.list],
  [/^\/expenses$/, expenses.render],
  [/^\/leave$/, leave.render],
  [/^\/reports$/, reports.index],
  [/^\/reports\/([\w-]+)$/, reports.report],
  [/^\/settings(?:\/(\w+))?$/, settings.render],
];

function currentRoute() {
  const h = location.hash.replace(/^#/, '');
  const [path, qs] = h.split('?');
  return { path: path || '/dashboard', query: new URLSearchParams(qs || '') };
}

// ── Shell ───────────────────────────────────────────────────────────────────

function buildNav() {
  document.getElementById('nav').innerHTML = String(html`${NAV.map((g) => html`
    ${g.group ? html`<div class="nav-group">${g.group}</div>` : ''}
    <ul>${g.items.map(([path, label, ic]) => html`<li><a href="#${path}" data-nav="${path}">${icon(ic)}<span>${label}</span>${path === '/approvals' ? raw('<span class="nav-badge" id="approvals-badge" hidden></span>') : ''}</a></li>`)}</ul>`)}`);
}

function updateShell(path) {
  const top = `/${path.split('/')[1]}`;
  let label = 'Perega Projects';
  for (const a of document.querySelectorAll('[data-nav]')) {
    const on = a.dataset.nav === top;
    a.classList.toggle('active', on);
    if (on) { a.setAttribute('aria-current', 'page'); label = a.textContent.trim(); } else a.removeAttribute('aria-current');
  }
  document.title = `${label} · Perega Projects`;

  const n = pendingApprovals();
  const badge = document.getElementById('approvals-badge');
  badge.hidden = !n;
  badge.textContent = n;
  badge.setAttribute('aria-label', `${n} waiting`);

  const me = currentUser();
  document.getElementById('user-select').innerHTML = String(options(activeStaff().map((s) => ({ value: s.id, label: s.name })), me?.id));
  document.getElementById('user-role').textContent = me ? `${me.grade}${me.isManager ? ' · approver' : ''}` : '';

  const s = getState().settings;
  const notes = [];
  if (s.demo) notes.push(html`<span>Demo data: every client, person and figure is invented.</span> <a href="#/settings/data">Start with your own data</a>`);
  if (lastSaveError()) notes.push(html`<strong>Changes can't be saved in this browser.</strong> <a href="#/settings/data">Export a backup</a> before you close the tab.`);
  const banner = document.getElementById('banner');
  banner.innerHTML = String(html`${notes.map((x) => html`<div>${x}</div>`)}`);
  banner.hidden = !notes.length;
}

let lastPath = null;
function render() {
  const { path, query } = currentRoute();
  updateShell(path);
  hideTip();
  const old = document.getElementById('view');
  const view = old.cloneNode(false); // drops the previous view's listeners
  old.replaceWith(view);
  const hit = ROUTES.find(([re]) => re.test(path));
  try {
    if (hit) hit[1](view, { params: path.match(hit[0]).slice(1), query });
    else view.innerHTML = String(html`<div class="empty-state"><h3>Page not found</h3><p><a href="#/dashboard">Back to the dashboard</a></p></div>`);
  } catch (e) {
    console.error(e);
    view.innerHTML = String(html`<div class="empty-state"><h3>Something went wrong showing this page</h3><p>${e.message}</p></div>`);
  }
  if (path !== lastPath) {
    window.scrollTo(0, 0);
    document.body.classList.remove('nav-open');
    // Move focus to the page heading for screen-reader users on navigation.
    if (lastPath !== null) view.querySelector('h1')?.setAttribute('tabindex', '-1'), view.querySelector('h1')?.focus({ preventScroll: true });
  }
  lastPath = path;
}

// ── Document-level behaviour ────────────────────────────────────────────────

document.addEventListener('click', (e) => {
  const sortBtn = e.target.closest('[data-sort]');
  if (sortBtn) {
    const t = sortBtn.closest('[data-table-id]');
    if (t) { setSort(t.dataset.tableId, sortBtn.dataset.sort); render(); }
    return;
  }
  const row = e.target.closest('tr[data-href]');
  if (row && !e.target.closest('a, button, input, select, textarea, label')) {
    location.hash = row.dataset.href;
  }
  if (e.target.closest('#menu-toggle')) document.body.classList.toggle('nav-open');
  if (e.target.closest('#scrim')) document.body.classList.remove('nav-open');
});

// Tooltips for chart marks and anything else carrying data-tip.
const tip = document.getElementById('tooltip');
function showTip(el, x, y) {
  tip.innerHTML = el.dataset.tip;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 8, x + 14);
  const top = y + r.height + 20 > window.innerHeight ? y - r.height - 12 : y + 14;
  tip.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
}
function hideTip() { tip.hidden = true; }
document.addEventListener('mousemove', (e) => {
  const el = e.target.closest?.('[data-tip]');
  if (el) showTip(el, e.clientX, e.clientY); else if (!tip.hidden) hideTip();
});
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('[data-tip]');
  if (!el) return hideTip();
  const r = el.getBoundingClientRect();
  showTip(el, r.left + r.width / 2, r.top + r.height / 2);
});
document.addEventListener('scroll', hideTip, { passive: true });

// Signed-in user (no passwords here: this switches whose view you see).
document.getElementById('user-select').addEventListener('change', (e) => {
  update((s) => { s.settings.currentUserId = e.target.value; });
});

// Global search across projects, clients and opportunities.
const search = document.getElementById('search');
const results = document.getElementById('search-results');
let hits = []; let active = -1;
function runSearch() {
  const q = search.value.trim().toLowerCase();
  if (q.length < 2) { results.hidden = true; return; }
  const s = getState();
  const match = (...xs) => xs.some((x) => x && String(x).toLowerCase().includes(q));
  hits = [
    ...s.projects.filter((p) => !p.internal && match(p.jobNo, p.name)).map((p) => ({ href: `#/projects/${p.id}`, label: `${p.jobNo} ${p.name}`, kind: 'Project' })),
    ...s.clients.filter((c) => match(c.name, ...c.contacts.map((x) => x.name))).map((c) => ({ href: `#/clients/${c.id}`, label: c.name, kind: 'Client' })),
    ...s.opportunities.filter((o) => !o.projectId && match(o.title)).map((o) => ({ href: `#/pipeline?open=${o.id}`, label: o.title, kind: 'Opportunity' })),
  ].slice(0, 8);
  active = hits.length ? 0 : -1;
  results.innerHTML = String(hits.length
    ? html`${hits.map((h, i) => html`<li role="option" id="sr-${i}" ${i === active ? raw('aria-selected="true"') : ''}><a href="${h.href}"><span>${h.label}</span><small>${h.kind}</small></a></li>`)}`
    : html`<li class="none">No matches</li>`);
  results.hidden = false;
  search.setAttribute('aria-expanded', 'true');
}
function closeSearch() { results.hidden = true; search.setAttribute('aria-expanded', 'false'); }
search.addEventListener('input', runSearch);
search.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { search.value = ''; closeSearch(); return; }
  if (!hits.length || results.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
    results.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    search.setAttribute('aria-activedescendant', `sr-${active}`);
  }
  if (e.key === 'Enter' && active >= 0) {
    location.hash = hits[active].href.slice(1);
    search.value = ''; closeSearch(); search.blur();
  }
});
search.addEventListener('blur', () => setTimeout(closeSearch, 150));
results.addEventListener('click', () => { search.value = ''; closeSearch(); });

// '/' focuses search, like most web apps.
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]') && !document.querySelector('.modal-backdrop')) {
    e.preventDefault();
    search.focus();
  }
});

// ── Start ───────────────────────────────────────────────────────────────────

load();
buildNav();
subscribe(render);
window.addEventListener('hashchange', render);
if (!location.hash) history.replaceState(null, '', '#/dashboard');
render();

// Keep a second tab in step when this one saves.
window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith('perega-projects/')) { load(); render(); }
});
