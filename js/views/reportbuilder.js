// Custom reports: choose a dataset, columns, an optional grouping and filters,
// then save the report for everyone or export it to CSV.

import { getState, update, find, clientName, staffName, officeName, clientProjects, stageName, currentUser } from '../store.js';
import { html, raw, money, hrs, pct, fmtDate, todayISO, monthKey, monthLabel, weekStart, sum, uid, round2, toCSV, daysBetween } from '../util.js';
import * as C from '../calc.js';
import { pageHead, table, options, download, toast, formModal, confirmDialog, empty } from '../ui.js';
import { barList } from '../charts.js';

const F = (label, type, get, extra = {}) => ({ label, type, get, ...extra });

function datasets(s, today) {
  const ctx = C.makeCtx(s);
  const internal = new Set(s.projects.filter((p) => p.internal).map((p) => p.id));
  const person = (id) => ctx.staff.get(id);
  return {
    projects: {
      label: 'Projects',
      rows: () => clientProjects().map((p) => ({ p, f: C.projectFinancials(p, ctx) })),
      fields: {
        jobNo: F('Job', 'text', (r) => r.p.jobNo), name: F('Project', 'text', (r) => r.p.name), client: F('Client', 'text', (r) => clientName(r.p.clientId)),
        office: F('Office', 'text', (r) => officeName(r.p.officeId)), sector: F('Sector', 'text', (r) => r.p.sector || 'Not set'),
        manager: F('Manager', 'text', (r) => staffName(r.p.managerId)), owner: F('Owner', 'text', (r) => staffName(r.p.ownerId)), status: F('Status', 'text', (r) => r.p.status),
        start: F('Started', 'date', (r) => r.p.startDate), fee: F('Fee', 'money', (r) => r.f.fee), earned: F('Earned', 'money', (r) => r.f.earned),
        invoiced: F('Invoiced', 'money', (r) => r.f.invoiced), wip: F('WIP', 'money', (r) => r.f.wip), cost: F('Cost', 'money', (r) => r.f.cost),
        margin: F('Margin', 'pct', (r) => r.f.margin, { agg: (rows) => { const e = sum(rows, (r) => r.f.earned); return e ? (e - sum(rows, (r) => r.f.cost)) / e : null; } }),
        hours: F('Hours', 'num', (r) => r.f.hours), budgetHours: F('Budget hours', 'num', (r) => r.f.budgetHours),
      },
    },
    invoices: {
      label: 'Invoices',
      rows: () => s.invoices.map((i) => ({ i, p: ctx.projects.get(i.projectId) })),
      fields: {
        number: F('Invoice', 'text', (r) => r.i.number), job: F('Job', 'text', (r) => r.p?.jobNo), client: F('Client', 'text', (r) => clientName(r.p?.clientId)),
        office: F('Office', 'text', (r) => officeName(r.p?.officeId)), date: F('Date', 'date', (r) => r.i.date), month: F('Month', 'month', (r) => monthKey(r.i.date)),
        due: F('Due', 'date', (r) => r.i.dueDate), status: F('Status', 'text', (r) => C.invoiceDisplayStatus(r.i, today)),
        net: F('Net', 'money', (r) => C.invoiceNet(r.i)), vat: F('VAT', 'money', (r) => C.invoiceVat(r.i)), gross: F('Gross', 'money', (r) => C.invoiceGross(r.i)),
        late: F('Days overdue', 'num', (r) => (r.i.status === 'Sent' ? Math.max(0, daysBetween(r.i.dueDate, today)) : 0)),
      },
    },
    time: {
      label: 'Time entries',
      rows: () => s.timesheets.map((e) => ({ e, who: person(e.staffId), p: ctx.projects.get(e.projectId) })),
      fields: {
        date: F('Date', 'date', (r) => r.e.date), month: F('Month', 'month', (r) => monthKey(r.e.date)), week: F('Week of', 'date', (r) => weekStart(r.e.date)),
        person: F('Person', 'text', (r) => r.who?.name), grade: F('Grade', 'text', (r) => r.who?.grade), office: F('Office', 'text', (r) => officeName(r.who?.officeId)),
        job: F('Job', 'text', (r) => r.p?.jobNo), project: F('Project', 'text', (r) => r.p?.name), stage: F('Stage', 'text', (r) => stageName(r.e.projectId, r.e.stageId)),
        chargeable: F('Chargeable', 'text', (r) => (internal.has(r.e.projectId) ? 'No' : 'Yes')),
        hours: F('Hours', 'num', (r) => r.e.hours), value: F('Value', 'money', (r) => r.e.hours * (r.who?.chargeRate || 0)), cost: F('Cost', 'money', (r) => r.e.hours * (r.who?.costRate || 0)),
      },
    },
    opportunities: {
      label: 'Opportunities',
      rows: () => s.opportunities.map((o) => ({ o })),
      fields: {
        title: F('Opportunity', 'text', (r) => r.o.title), client: F('Client', 'text', (r) => clientName(r.o.clientId)), stage: F('Stage', 'text', (r) => r.o.stage),
        owner: F('Owner', 'text', (r) => staffName(r.o.ownerId)), office: F('Office', 'text', (r) => officeName(r.o.officeId)), source: F('Source', 'text', (r) => r.o.source || ''),
        value: F('Value', 'money', (r) => r.o.value), probability: F('Probability', 'pct', (r) => r.o.probability / 100, { agg: (rows) => (rows.length ? sum(rows, (r) => r.o.probability) / rows.length / 100 : null) }),
        weighted: F('Weighted', 'money', (r) => (C.OPEN_STAGES.includes(r.o.stage) ? (r.o.value * r.o.probability) / 100 : 0)),
        decision: F('Decision date', 'date', (r) => r.o.wonDate || r.o.lostDate || r.o.expectedDate), month: F('Decision month', 'month', (r) => monthKey(r.o.wonDate || r.o.lostDate || r.o.expectedDate || today)),
      },
    },
    expenses: {
      label: 'Expenses',
      rows: () => s.expenses.map((x) => ({ x, p: ctx.projects.get(x.projectId) })),
      fields: {
        date: F('Date', 'date', (r) => r.x.date), month: F('Month', 'month', (r) => monthKey(r.x.date)), person: F('Person', 'text', (r) => staffName(r.x.staffId)),
        job: F('Job', 'text', (r) => r.p?.jobNo || 'Overhead'), category: F('Category', 'text', (r) => r.x.category), status: F('Status', 'text', (r) => r.x.status),
        chargeable: F('Rechargeable', 'text', (r) => (r.x.chargeable ? 'Yes' : 'No')), amount: F('Amount', 'money', (r) => r.x.amount),
      },
    },
  };
}

const NUMERIC = ['money', 'num', 'pct'];
const fmt = (type, v) => (v === null || v === undefined || v === '' ? '' : type === 'money' ? money(v) : type === 'num' ? hrs(v) : type === 'pct' ? pct(v) : type === 'date' ? fmtDate(v) : type === 'month' ? monthLabel(v, true) : v);
const OPS = { text: [['is', 'is'], ['not', 'is not'], ['has', 'contains']], date: [['after', 'on or after'], ['before', 'on or before']], month: [['after', 'from'], ['before', 'up to']], money: [['gte', '≥'], ['lte', '≤']], num: [['gte', '≥'], ['lte', '≤']], pct: [['gte', '≥ (%)'], ['lte', '≤ (%)']] };

function test(field, f, v) {
  if (f.value === '' || f.value === undefined) return true;
  const x = field.get(v);
  switch (f.op) {
    case 'is': return String(x ?? '') === f.value;
    case 'not': return String(x ?? '') !== f.value;
    case 'has': return String(x ?? '').toLowerCase().includes(String(f.value).toLowerCase());
    case 'after': return x && x >= f.value;
    case 'before': return x && x <= f.value;
    case 'gte': return Number(x) >= Number(f.value) / (field.type === 'pct' ? 100 : 1);
    case 'lte': return Number(x) <= Number(f.value) / (field.type === 'pct' ? 100 : 1);
    default: return true;
  }
}

// Run a report definition: returns { columns, rows } ready for the table.
export function runReport(s, def, today = todayISO()) {
  const ds = datasets(s, today)[def.dataset];
  if (!ds) return { columns: [], rows: [], fields: {} };
  const fields = ds.fields;
  let rows = ds.rows();
  for (const f of def.filters || []) if (fields[f.field]) rows = rows.filter((r) => test(fields[f.field], f, r));
  const cols = (def.columns || []).filter((k) => fields[k]);
  if (def.groupBy && fields[def.groupBy]) {
    const g = fields[def.groupBy];
    const groups = new Map();
    for (const r of rows) {
      const k = g.get(r) ?? '—';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const numeric = cols.filter((k) => NUMERIC.includes(fields[k].type));
    const out = [...groups].map(([k, list]) => {
      const row = { _group: k, _count: list.length };
      for (const c of numeric) row[c] = fields[c].agg ? fields[c].agg(list) : sum(list, (r) => fields[c].get(r));
      return row;
    });
    return {
      fields, rows: out, grouped: true,
      columns: [
        { key: '_group', label: g.label, value: (r) => r._group, render: (r) => fmt(g.type, r._group) },
        { key: '_count', label: 'Count', align: 'num' },
        ...numeric.map((c) => ({ key: c, label: fields[c].label, align: 'num', render: (r) => fmt(fields[c].type, r[c]) })),
      ],
      csvHead: [g.label, 'Count', ...numeric.map((c) => fields[c].label)],
      csv: out.map((r) => [r._group, r._count, ...numeric.map((c) => (fields[c].type === 'pct' ? round2((r[c] ?? 0) * 100) : round2(r[c] ?? 0)))]),
      numeric,
    };
  }
  return {
    fields, rows, grouped: false,
    columns: cols.map((c) => ({ key: c, label: fields[c].label, align: NUMERIC.includes(fields[c].type) ? 'num' : '', value: (r) => fields[c].get(r), render: (r) => fmt(fields[c].type, fields[c].get(r)) })),
    csvHead: cols.map((c) => fields[c].label),
    csv: rows.map((r) => cols.map((c) => { const v = fields[c].get(r); return typeof v === 'number' ? (fields[c].type === 'pct' ? round2(v * 100) : round2(v)) : v ?? ''; })),
    numeric: cols.filter((c) => NUMERIC.includes(fields[c].type)),
  };
}

const drafts = new Map();

export function render(root, { params: [id] }) {
  const s = getState();
  const saved = s.savedReports.find((r) => r.id === id);
  if (id !== 'new' && !saved) { root.innerHTML = String(empty('Report not found', '', html`<a href="#/reports">All reports</a>`)); return; }
  if (!drafts.has(id)) drafts.set(id, structuredClone(saved || { name: 'New report', dataset: 'projects', columns: ['fee', 'invoiced', 'wip'], groupBy: 'sector', filters: [], sort: null }));
  const def = drafts.get(id);
  const all = datasets(s, todayISO());
  const ds = all[def.dataset];
  const fieldOpts = Object.entries(ds.fields).map(([value, f]) => ({ value, label: f.label }));
  const groupOpts = Object.entries(ds.fields).filter(([, f]) => ['text', 'month', 'date'].includes(f.type)).map(([value, f]) => ({ value, label: f.label }));

  root.innerHTML = String(html`
    <div class="crumbs"><a href="#/reports">Reports</a> /</div>
    ${pageHead(saved ? saved.name : 'Build a report', { sub: saved ? 'Change it below, then save to update it for everyone.' : 'Choose what to see, then save it for everyone.', actions: html`
      <button type="button" class="btn" id="rb-csv">Export CSV</button>
      ${saved ? html`<button type="button" class="btn" id="rb-delete">Delete</button>` : ''}
      <button type="button" class="btn primary" id="rb-save">${saved ? 'Save changes' : 'Save report'}</button>` })}
    <div class="grid-main" style="grid-template-columns:minmax(0,1fr) minmax(0,2.4fr)">
      <section class="card"><div class="card-head"><h2>Set up</h2></div><div class="card-body stack" id="rb-config">
        <div class="field"><label for="rb-ds">Data</label><select id="rb-ds">${options(Object.entries(all).map(([value, d]) => ({ value, label: d.label })), def.dataset)}</select></div>
        <div class="field"><label for="rb-group">Group by</label><select id="rb-group">${options(groupOpts, def.groupBy || '', { placeholder: 'No grouping: one row per record' })}</select></div>
        <fieldset class="field" style="border:0;padding:0;margin:16px 0 0"><legend style="font-size:12.5px;font-weight:700;color:var(--ink-2);margin-bottom:4px">Columns${def.groupBy ? ' (totals of number columns)' : ''}</legend>
          <div class="people" style="flex-direction:column;gap:4px">${fieldOpts.map((f) => html`<label class="check"><input type="checkbox" data-col="${f.value}" ${def.columns.includes(f.value) ? raw('checked') : ''}> ${f.label}${NUMERIC.includes(ds.fields[f.value].type) ? '' : html` <span class="muted">${def.groupBy ? '(not totalled)' : ''}</span>`}</label>`)}</div></fieldset>
        <fieldset class="field" style="border:0;padding:0;margin:16px 0 0"><legend style="font-size:12.5px;font-weight:700;color:var(--ink-2);margin-bottom:4px">Filters</legend>
          ${def.filters.map((f, i) => {
            const t = ds.fields[f.field]?.type || 'text';
            const inputType = t === 'date' ? 'date' : t === 'month' ? 'month' : NUMERIC.includes(t) ? 'number' : 'text';
            return html`<div class="rb-filter"><select data-ff="${i}" aria-label="Filter field">${options(fieldOpts, f.field)}</select><select data-fo="${i}" aria-label="Condition">${options(OPS[t].map(([value, label]) => ({ value, label })), f.op)}</select><input data-fv="${i}" type="${inputType}" value="${f.value}" aria-label="Value"><button type="button" class="icon-btn" data-fx="${i}" aria-label="Remove filter">×</button></div>`;
          })}
          <button type="button" class="btn small" id="rb-add-filter">Add filter</button></fieldset>
      </div></section>
      <section class="card"><div class="card-body" id="rb-result"></div></section>
    </div>`);

  const draw = () => {
    const out = runReport(getState(), def);
    const res = root.querySelector('#rb-result');
    const chartCol = out.grouped && out.numeric[0];
    res.innerHTML = String(html`
      <p class="muted" style="margin-bottom:8px">${out.rows.length} ${out.grouped ? 'groups' : 'rows'}${out.grouped ? '' : out.rows.length > 500 ? ' (showing the first 500; the CSV has them all)' : ''}</p>
      ${chartCol ? html`<div style="margin-bottom:14px">${barList([...out.rows].sort((a, b) => (b[chartCol] ?? 0) - (a[chartCol] ?? 0)).slice(0, 12).map((r) => ({ label: String(fmt(ds.fields[def.groupBy].type, r._group)), value: Math.max(0, r[chartCol] ?? 0) })), { format: (v) => fmt(ds.fields[chartCol].type, v) })}</div>` : ''}
      ${out.columns.length ? table({ id: `rb-${id}-${def.dataset}-${def.groupBy}`, rows: out.grouped ? out.rows : out.rows.slice(0, 500), columns: out.columns, compact: true, empty: 'Nothing matches these filters.',
        footer: Object.fromEntries(out.numeric.filter((c) => ds.fields[c].type !== 'pct').map((c) => [c, fmt(ds.fields[c].type, out.grouped ? sum(out.rows, (r) => r[c]) : sum(out.rows, (r) => ds.fields[c].get(r)))])) })
        : html`<p class="muted">Tick some columns.</p>`}`);
  };
  draw();

  const rerender = () => render(root, { params: [id] });
  const cfg = root.querySelector('#rb-config');
  cfg.querySelector('#rb-ds').addEventListener('change', (e) => {
    const nd = all[e.target.value];
    Object.assign(def, { dataset: e.target.value, columns: Object.entries(nd.fields).filter(([, f]) => NUMERIC.includes(f.type)).slice(0, 2).map(([k]) => k), groupBy: '', filters: [] });
    rerender();
  });
  cfg.querySelector('#rb-group').addEventListener('change', (e) => { def.groupBy = e.target.value; rerender(); });
  cfg.querySelectorAll('[data-col]').forEach((c) => c.addEventListener('change', () => {
    def.columns = [...cfg.querySelectorAll('[data-col]:checked')].map((x) => x.dataset.col);
    draw();
  }));
  cfg.querySelector('#rb-add-filter').addEventListener('click', () => {
    const [k, f] = Object.entries(ds.fields)[0];
    def.filters.push({ field: k, op: OPS[f.type][0][0], value: '' });
    rerender();
  });
  cfg.querySelectorAll('[data-ff]').forEach((el) => el.addEventListener('change', () => {
    const f = def.filters[el.dataset.ff];
    f.field = el.value; f.op = OPS[ds.fields[el.value].type][0][0]; f.value = '';
    rerender();
  }));
  cfg.querySelectorAll('[data-fo]').forEach((el) => el.addEventListener('change', () => { def.filters[el.dataset.fo].op = el.value; draw(); }));
  cfg.querySelectorAll('[data-fv]').forEach((el) => el.addEventListener('change', () => { def.filters[el.dataset.fv].value = el.value; draw(); }));
  cfg.querySelectorAll('[data-fx]').forEach((el) => el.addEventListener('click', () => { def.filters.splice(Number(el.dataset.fx), 1); rerender(); }));

  root.querySelector('#rb-csv').addEventListener('click', () => {
    const out = runReport(getState(), def);
    download(`${(saved?.name || 'report').toLowerCase().replace(/\W+/g, '-')}-${todayISO()}.csv`, toCSV([out.csvHead, ...out.csv]));
  });
  root.querySelector('#rb-save').addEventListener('click', () => {
    if (saved) {
      update((st) => { Object.assign(st.savedReports.find((r) => r.id === id), structuredClone(def), { name: saved.name }); });
      drafts.delete(id);
      toast('Report saved.');
      return;
    }
    formModal({
      title: 'Save report', fields: [{ name: 'name', label: 'Name', required: true, full: true, placeholder: 'e.g. Hours by person this quarter' }], submitLabel: 'Save',
      onSubmit: (v) => {
        const nid = uid('rpt');
        update((st) => { st.savedReports.push({ ...structuredClone(def), id: nid, name: v.name, createdBy: currentUser().id }); });
        drafts.delete('new');
        toast('Report saved under Reports.');
        location.hash = `#/reports/custom/${nid}`;
      },
    });
  });
  root.querySelector('#rb-delete')?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Delete the report "${saved.name}"?`, { okLabel: 'Delete', danger: true }))) return;
    update((st) => { st.savedReports = st.savedReports.filter((r) => r.id !== id); });
    drafts.delete(id);
    location.hash = '#/reports';
  });
}
