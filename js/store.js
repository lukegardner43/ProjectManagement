// The single in-memory state object, saved to localStorage after every change.
// Views read with getState() and change things only through update(), which
// saves and then re-renders whatever is on screen.

import { seed, emptyState, SCHEMA_VERSION } from './seed.js';

const KEY = 'perega-projects/v1';
const REQUIRED = ['settings', 'offices', 'staff', 'clients', 'opportunities', 'projects', 'timesheets',
  'timesheetWeeks', 'allocations', 'invoices', 'expenses', 'leave'];

let state = null;
const listeners = new Set();
let saveError = null;

export function load() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      state = validate(JSON.parse(saved));
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
  return { ...data, version: SCHEMA_VERSION };
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
    + state.invoices.filter((i) => i.status === 'Draft').length;
}
