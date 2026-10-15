// The single in-memory state object, saved to localStorage after every change.
// Views read with getState() and change things only through update(), which
// saves and then re-renders whatever is on screen.

import { seed, emptyState, v2Defaults, SCHEMA_VERSION } from './seed.js';

const KEY = 'perega-projects/v1';
// Present since version 1; later collections are added by upgrade().
const REQUIRED = ['settings', 'offices', 'staff', 'clients', 'opportunities', 'projects', 'timesheets',
  'timesheetWeeks', 'allocations', 'invoices', 'expenses', 'leave'];

let state = null;
const listeners = new Set();
let saveError = null;

export function load() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const data = JSON.parse(saved);
      state = validate(data);
      if (state.version !== data.version) persist(); // keep storage in step after an upgrade
      return;
    }
  } catch (e) {
    console.warn('Saved data could not be read; starting from demo data.', e);
  }
  state = seed();
  persist();
}

export const getState = () => state;
export const lastSaveError = () => saveError;

export function update(fn, { silent = false } = {}) {
  fn(state);
  persist();
  if (!silent) notify();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveError = null;
  } catch (e) {
    // Private windows and full storage both land here. The app keeps working
    // for this visit; the banner tells the user to export before closing.
    saveError = e;
  }
}

// Throws with a readable message if `data` is not a usable export.
export function validate(data) {
  if (!data || typeof data !== 'object') throw new Error('The file is not a Perega Projects export.');
  const missing = REQUIRED.filter((k) => !(k in data));
  if (missing.length) throw new Error(`The file is missing: ${missing.join(', ')}.`);
  for (const k of REQUIRED.slice(1)) {
    if (!Array.isArray(data[k])) throw new Error(`"${k}" should be a list.`);
  }
  if ((data.version || 1) > SCHEMA_VERSION) throw new Error('This file was made by a newer version of the app.');
  if (!data.projects.some((p) => p.internal)) data.projects.unshift(emptyState().projects[0]);
  return upgrade(data);
}

// Version 1 saves predate fee estimates, tasks, CRM activities, purchase
// orders, rate cards and custom reports: add them empty, keep everything else.
function upgrade(data) {
  // Untouched demo data from version 1 is simply regenerated with the new features.
  if (data.settings?.demo && (data.version || 1) < 2) return seed();
  const d = v2Defaults();
  const out = { ...data };
  for (const k of ['rateCards', 'feeTemplates', 'estimates', 'tasks', 'activities', 'purchaseOrders', 'savedReports']) {
    if (!Array.isArray(out[k])) out[k] = d[k];
  }
  out.settings = { ...d.settingsDefaults, ...out.settings, targets: { ...d.settingsDefaults.targets, ...out.settings.targets } };
  out.staff = out.staff.map((p) => (Array.isArray(p.skills) ? p : { ...p, skills: [] }));
  out.version = SCHEMA_VERSION;
  return out;
}

export function replaceState(next) {
  state = validate(next);
  persist();
  notify();
}

export const resetToDemo = () => replaceState(seed());
export const resetToEmpty = () => replaceState(emptyState());

// ── Lookups ─────────────────────────────────────────────────────────────────

export function currentUser() {
  return state.staff.find((s) => s.id === state.settings.currentUserId) || state.staff[0];
}
export const isManager = () => !!currentUser()?.isManager;

export const find = (list, id) => state[list].find((x) => x.id === id) || null;
export const staffName = (id) => find('staff', id)?.name || '—';
export const clientName = (id) => find('clients', id)?.name || '—';
export const officeName = (id) => find('offices', id)?.name || '—';
export const activeStaff = () => state.staff.filter((s) => s.active !== false);
export const clientProjects = () => state.projects.filter((p) => !p.internal);

export function stageName(projectId, stageId) {
  if (stageId === 'expenses') return 'Rechargeable expenses';
  const p = find('projects', projectId);
  return p?.stages.find((s) => s.id === stageId)?.name || '—';
}

export function projectLabel(p) {
  return p ? `${p.jobNo} ${p.name}` : '—';
}

// Approvals waiting on the signed-in manager, for the nav badge.
export function pendingApprovals() {
  if (!isManager()) return 0;
  return state.timesheetWeeks.filter((w) => w.status === 'Submitted').length
    + state.expenses.filter((x) => x.status === 'Submitted').length
    + state.leave.filter((l) => l.status === 'Requested').length
    + state.invoices.filter((i) => i.status === 'Draft').length
    + state.estimates.filter((e) => e.status === 'Submitted').length
    + state.purchaseOrders.filter((p) => p.status === 'Draft' && p.amount > (state.settings.poApprovalLimit ?? 0)).length;
}
