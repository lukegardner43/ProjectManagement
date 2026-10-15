import { getState, update, find, staffName, clientProjects } from '../store.js';
import { html, money, fmtDate, todayISO, fyRange, sum, uid } from '../util.js';
import * as C from '../calc.js';
import { pageHead, table, pill, tile, formModal, toast, confirmDialog, empty } from '../ui.js';
import { opportunityForm } from './pipeline.js';
import { activityTable, bindActivities, activityForm } from './activities.js';

export function list(root) {
  const s = getState();
  const today = todayISO();
  const fy = fyRange(today, s.settings.fyStartMonth);
  const ctx = C.makeCtx(s);
  const rows = s.clients.map((c) => {
    const projects = clientProjects().filter((p) => p.clientId === c.id);
    const ids = new Set(projects.map((p) => p.id));
    const opps = s.opportunities.filter((o) => o.clientId === c.id);
    return {
      c,
      live: projects.filter((p) => p.status === 'Live').length,
      fees: sum(projects, (p) => C.projectFinancials(p, ctx).fee),
      invoicedFY: sum(s.invoices.filter((i) => ids.has(i.projectId) && i.status !== 'Draft' && C.inRange(i.date, fy)), C.invoiceNet),
      outstanding: sum(s.invoices.filter((i) => ids.has(i.projectId) && i.status === 'Sent'), C.invoiceGross),
      pipeline: C.pipelineTotals(opps).weighted,
    };
  });
  root.innerHTML = String(html`
    ${pageHead('Clients', { sub: `${s.clients.length} clients`, actions: html`<button type="button" class="btn primary" id="new-client">New client</button>` })}
    <div class="card"><div class="card-body">${table({
      id: 'clients', rows, defaultSort: { key: 'name', dir: 1 }, rowHref: (r) => `#/clients/${r.c.id}`,
      columns: [
        { key: 'name', label: 'Client', value: (r) => r.c.name, render: (r) => html`<a class="cell-main" href="#/clients/${r.c.id}">${r.c.name}</a><span class="cell-sub">${r.c.address}</span>` },
        { key: 'sector', label: 'Sector', value: (r) => r.c.sector },
        { key: 'live', label: 'Live jobs', align: 'num' },
        { key: 'fees', label: 'Total fees', align: 'num', render: (r) => money(r.fees) },
        { key: 'invoicedFY', label: `Invoiced ${fy.label}`, align: 'num', render: (r) => money(r.invoicedFY) },
        { key: 'outstanding', label: 'Outstanding', align: 'num', render: (r) => money(r.outstanding) },
        { key: 'pipeline', label: 'Weighted pipeline', align: 'num', render: (r) => money(r.pipeline) },
      ],
    })}</div></div>`);
  root.querySelector('#new-client').addEventListener('click', () => clientForm());
}

export function detail(root, { params: [id] }) {
  const s = getState();
  const c = find('clients', id);
  if (!c) { root.innerHTML = String(empty('Client not found', 'It may have been deleted.', html`<a href="#/clients">All clients</a>`)); return; }
  const today = todayISO();
  const ctx = C.makeCtx(s);
  const projects = clientProjects().filter((p) => p.clientId === c.id);
  const ids = new Set(projects.map((p) => p.id));
  const invoices = s.invoices.filter((i) => ids.has(i.projectId)).sort((a, b) => b.date.localeCompare(a.date));
  const opps = s.opportunities.filter((o) => o.clientId === c.id);
  const fins = new Map(projects.map((p) => [p.id, C.projectFinancials(p, ctx)]));

  root.innerHTML = String(html`
    <div class="crumbs"><a href="#/clients">Clients</a> /</div>
    ${pageHead(c.name, { sub: [c.sector, c.address].filter(Boolean).join(' · '), actions: html`<button type="button" class="btn" id="edit-client">Edit</button><button type="button" class="btn" id="log-act">Log activity</button><button type="button" class="btn secondary" id="new-opp">New opportunity</button>` })}
    <section class="tiles">
      ${tile({ label: 'Fees on all jobs', value: money(sum([...fins.values()], (f) => f.fee)), sub: `${projects.length} projects` })}
      ${tile({ label: 'Invoiced to date', value: money(sum(invoices.filter((i) => i.status !== 'Draft'), C.invoiceNet)), sub: 'net' })}
      ${tile({ label: 'Outstanding', value: money(sum(invoices.filter((i) => i.status === 'Sent'), C.invoiceGross)), sub: `${invoices.filter((i) => C.invoiceDisplayStatus(i, today) === 'Overdue').length} overdue`, tone: invoices.some((i) => C.invoiceDisplayStatus(i, today) === 'Overdue') ? 'critical' : '' })}
      ${tile({ label: 'Weighted pipeline', value: money(C.pipelineTotals(opps).weighted), sub: `${C.pipelineTotals(opps).count} open` })}
    </section>
    <div class="grid-main">
      <div class="stack">
        <section class="card"><div class="card-head"><h2>Projects</h2></div><div class="card-body">${table({
          id: 'client-projects', rows: projects, rowHref: (p) => `#/projects/${p.id}`, defaultSort: { key: 'jobNo', dir: -1 }, empty: 'No projects yet.',
          columns: [
            { key: 'jobNo', label: 'Job', render: (p) => html`<span class="job">${p.jobNo}</span>` },
            { key: 'name', label: 'Project', render: (p) => html`<a class="cell-main" href="#/projects/${p.id}">${p.name}</a>` },
            { key: 'status', label: 'Status', render: (p) => pill(p.status) },
            { key: 'fee', label: 'Fee', align: 'num', value: (p) => fins.get(p.id).fee, render: (p) => money(fins.get(p.id).fee) },
            { key: 'invoiced', label: 'Invoiced', align: 'num', value: (p) => fins.get(p.id).invoiced, render: (p) => money(fins.get(p.id).invoiced) },
          ],
        })}</div></section>
        <section class="card"><div class="card-head"><h2>Opportunities</h2></div><div class="card-body">${table({
          id: 'client-opps', rows: opps, defaultSort: { key: 'date', dir: -1 }, empty: 'No opportunities.',
          columns: [
            { key: 'title', label: 'Opportunity', render: (o) => html`<a class="cell-main" href="#/pipeline?open=${o.id}">${o.title}</a>` },
            { key: 'stage', label: 'Stage', render: (o) => pill(o.stage) },
            { key: 'value', label: 'Value', align: 'num', render: (o) => money(o.value) },
            { key: 'date', label: 'Date', value: (o) => o.wonDate || o.lostDate || o.expectedDate, render: (o) => fmtDate(o.wonDate || o.lostDate || o.expectedDate) },
            { key: 'owner', label: 'Owner', value: (o) => staffName(o.ownerId) },
          ],
        })}</div></section>
        <section class="card"><div class="card-head"><h2>Invoices</h2></div><div class="card-body">${table({
          id: 'client-invoices', rows: invoices.slice(0, 15), defaultSort: { key: 'date', dir: -1 }, empty: 'No invoices.',
          columns: [
            { key: 'number', label: 'Number' },
            { key: 'project', label: 'Project', value: (i) => find('projects', i.projectId)?.jobNo },
            { key: 'date', label: 'Date', render: (i) => fmtDate(i.date) },
            { key: 'gross', label: 'Gross', align: 'num', value: C.invoiceGross, render: (i) => money(C.invoiceGross(i)) },
            { key: 'status', label: 'Status', value: (i) => C.invoiceDisplayStatus(i, today), render: (i) => pill(C.invoiceDisplayStatus(i, today)) },
          ],
        })}</div></section>
      </div>
      <div class="stack"><section class="card"><div class="card-head"><h2>Contacts</h2><button type="button" class="btn small" id="add-contact">Add contact</button></div>
        <div class="card-body">${c.contacts.length ? c.contacts.map((x) => html`<div class="kv"><span><strong>${x.name}</strong><span class="cell-sub">${x.role}</span>${x.email ? html`<a href="mailto:${x.email}">${x.email}</a>` : ''}${x.phone ? html`<span class="cell-sub">${x.phone}</span>` : ''}</span><button type="button" class="btn small link" data-contact="${x.id}">Edit</button></div>`) : html`<p class="muted">No contacts yet.</p>`}
        ${c.notes ? html`<h3 style="margin-top:14px">Notes</h3><p>${c.notes}</p>` : ''}</div>
      </section>
      <section class="card"><div class="card-head"><h2>Activity</h2></div><div class="card-body">${activityTable(s.activities.filter((a) => a.clientId === c.id), { id: 'client-acts' })}</div></section></div>
    </div>`);

  root.querySelector('#edit-client').addEventListener('click', () => clientForm(c));
  root.querySelector('#new-opp').addEventListener('click', () => opportunityForm(null, { clientId: c.id }));
  root.querySelector('#add-contact').addEventListener('click', () => contactForm(c));
  root.querySelector('#log-act').addEventListener('click', () => activityForm(null, { clientId: c.id }));
  bindActivities(root);
  root.querySelectorAll('[data-contact]').forEach((b) => b.addEventListener('click', () => contactForm(c, c.contacts.find((x) => x.id === b.dataset.contact))));
}

export function clientForm(c = null) {
  formModal({
    title: c ? 'Edit client' : 'New client',
    fields: [
      { name: 'name', label: 'Name', value: c?.name, required: true, full: true },
      { name: 'sector', label: 'Sector', value: c?.sector, placeholder: 'e.g. Developer' },
      { name: 'phone', label: 'Phone', value: c?.phone },
      { name: 'address', label: 'Address', type: 'textarea', value: c?.address, full: true },
      { name: 'notes', label: 'Notes', type: 'textarea', value: c?.notes, full: true },
    ],
    extraActions: c ? [{ label: 'Delete', kind: 'danger', onClick: () => { removeClient(c); } }] : [],
    onSubmit: (v) => {
      let newId = null;
      update((s) => {
        if (c) Object.assign(c, v);
        else { newId = uid('cli'); s.clients.push({ id: newId, ...v, contacts: [] }); }
      });
      toast('Client saved.');
      if (newId) location.hash = `#/clients/${newId}`;
    },
  });
}

async function removeClient(c) {
  const s = getState();
  if (s.projects.some((p) => p.clientId === c.id) || s.opportunities.some((o) => o.clientId === c.id)) {
    toast('This client has projects or opportunities, so it can\'t be deleted.', 'error');
    return;
  }
  if (await confirmDialog(`Delete ${c.name}?`, { okLabel: 'Delete', danger: true })) {
    update((st) => { st.clients = st.clients.filter((x) => x.id !== c.id); });
    location.hash = '#/clients';
  }
}

function contactForm(c, x = null) {
  formModal({
    title: x ? 'Edit contact' : 'Add contact',
    fields: [
      { name: 'name', label: 'Name', value: x?.name, required: true },
      { name: 'role', label: 'Role', value: x?.role },
      { name: 'email', label: 'Email', type: 'email', value: x?.email },
      { name: 'phone', label: 'Phone', value: x?.phone },
    ],
    extraActions: x ? [{ label: 'Remove', kind: 'danger', onClick: () => update(() => { c.contacts = c.contacts.filter((y) => y.id !== x.id); }) }] : [],
    onSubmit: (v) => update(() => {
      if (x) Object.assign(x, v);
      else c.contacts.push({ id: uid('con'), ...v });
    }),
  });
}
