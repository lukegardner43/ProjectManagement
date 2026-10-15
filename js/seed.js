// Demo data: a fictional engineering consultancy's book of work, generated
// relative to today so the dashboard always has a current year to show.
// Every person, client and project here is invented. Replace it from
// Settings → Data (start with an empty system, or import your own JSON).

import { addDays, addMonths, isWeekday, monthKey, monthEnd, monthLabel, todayISO, weekStart, workingDays, dayOfWeek, round2 } from './util.js';

export const SCHEMA_VERSION = 1;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function emptyState(today = todayISO()) {
  return {
    version: SCHEMA_VERSION,
    settings: {
      firmName: 'Perega',
      fyStartMonth: 4,
      vatRate: 20,
      hoursPerDay: 7.5,
      paymentTermsDays: 30,
      jobPrefix: 'G',
      nextJobNo: 10001,
      nextInvoiceNo: 1001,
      currentUserId: 'stf_admin',
      demo: false,
      createdAt: today,
    },
    offices: [{ id: 'off_main', name: 'Head office' }],
    staff: [{
      id: 'stf_admin', name: 'Administrator', grade: 'Director', discipline: 'Structural', officeId: 'off_main',
      chargeRate: 120, costRate: 55, weeklyHours: 37.5, isManager: true, billable: true, leaveAllowance: 25, active: true,
    }],
    clients: [],
    opportunities: [],
    projects: [internalProject()],
    timesheets: [],
    timesheetWeeks: [],
    allocations: [],
    invoices: [],
    expenses: [],
    leave: [],
  };
}

function internalProject() {
  return {
    id: 'prj_int', jobNo: 'INT', name: 'Internal & overheads', internal: true, clientId: null, officeId: null,
    status: 'Live', sector: 'Internal', ownerId: null, managerId: null, startDate: null, endDate: null, team: [],
    invoiceSchedule: [],
    stages: [
      { id: 'int_admin', name: 'Administration', feeType: 'Fixed', fee: 0, budgetHours: 0, percentComplete: 0 },
      { id: 'int_bd', name: 'Business development', feeType: 'Fixed', fee: 0, budgetHours: 0, percentComplete: 0 },
      { id: 'int_bids', name: 'Bids & fee proposals', feeType: 'Fixed', fee: 0, budgetHours: 0, percentComplete: 0 },
      { id: 'int_cpd', name: 'Training & CPD', feeType: 'Fixed', fee: 0, budgetHours: 0, percentComplete: 0 },
    ],
  };
}

export function seed(today = todayISO()) {
  const rnd = mulberry32(28805);
  const r = (a, b) => a + rnd() * (b - a);
  const ri = (a, b) => Math.floor(r(a, b + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const half = (x) => Math.round(x * 2) / 2;
  const ago = (n) => addDays(today, -n);
  // Shift a date off a weekend onto the following Monday.
  const weekday = (d) => (dayOfWeek(d) === 5 ? addDays(d, 2) : dayOfWeek(d) === 6 ? addDays(d, 1) : d);

  const offices = [
    { id: 'off_bri', name: 'Bristol' },
    { id: 'off_lon', name: 'London' },
    { id: 'off_man', name: 'Manchester' },
  ];

  const S = (id, name, grade, discipline, officeId, chargeRate, costRate, isManager, extra = {}) => ({
    id, name, grade, discipline, officeId, chargeRate, costRate, weeklyHours: 37.5, isManager,
    billable: true, leaveAllowance: 25, active: true, email: `${name.toLowerCase().replace(/\W+/g, '.')}@example.com`, ...extra,
  });
  const staff = [
    S('stf_ag', 'Alex Grant', 'Director', 'Structural', 'off_bri', 145, 72, true, { leaveAllowance: 28 }),
    S('stf_hm', 'Hannah Moss', 'Associate', 'Structural', 'off_bri', 120, 56, true),
    S('stf_rk', 'Ravi Kapoor', 'Associate', 'Civil', 'off_lon', 120, 56, true),
    S('stf_ec', 'Emily Clarke', 'Principal Engineer', 'Structural', 'off_lon', 105, 47, false),
    S('stf_tb', 'Tom Baker', 'Senior Engineer', 'Civil', 'off_man', 92, 39, true),
    S('stf_so', 'Sofia Okafor', 'Senior Engineer', 'Structural', 'off_bri', 92, 39, false),
    S('stf_jw', 'James Whitfield', 'Engineer', 'Structural', 'off_man', 76, 31, false),
    S('stf_lp', 'Lucy Price', 'Engineer', 'Drainage', 'off_bri', 76, 31, false),
    S('stf_dn', 'Daniel Novak', 'Graduate Engineer', 'Civil', 'off_lon', 60, 25, false),
    S('stf_cr', 'Chloe Reid', 'Graduate Engineer', 'Structural', 'off_bri', 60, 25, false),
    S('stf_mh', 'Marcus Hill', 'CAD Technician', 'CAD', 'off_man', 64, 27, false),
    S('stf_ff', 'Fiona Ford', 'Office Manager', 'Admin', 'off_bri', 0, 29, false, { billable: false, weeklyHours: 30 }),
  ];
  const person = new Map(staff.map((s) => [s.id, s]));

  const C = (id, name, sector, town, contacts) => ({
    id, name, sector, address: town, phone: '', notes: '',
    contacts: contacts.map(([n, role], i) => ({
      id: `${id}_c${i}`, name: n, role,
      email: `${n.split(' ')[0].toLowerCase()}@${id.slice(4)}.example.com`, phone: '',
    })),
  });
  const clients = [
    C('cli_hd', 'Harbourside Developments Ltd', 'Developer', 'Bristol', [['Oliver Hart', 'Development Director'], ['Priya Shah', 'Project Manager']]),
    C('cli_sh', 'Severn Homes', 'Housebuilder', 'Gloucester', [['Gareth Jones', 'Technical Director']]),
    C('cli_na', 'Northgate Architects', 'Architect', 'London', [['Isla Bennett', 'Partner'], ['Sam Turner', 'Architect']]),
    C('cli_ce', 'Cotswold Estates', 'Landowner', 'Cirencester', [['Henry Wells', 'Estate Manager']]),
    C('cli_ah', 'Avonvale Housing Association', 'Housing association', 'Bath', [['Megan Price', 'Asset Manager']]),
    C('cli_kc', 'Kingsway Construction', 'Contractor', 'Manchester', [['Liam Doyle', 'Design Manager'], ['Rosa Martin', 'Commercial Manager']]),
    C('cli_bt', 'Bluebell Schools Trust', 'Education', 'Bristol', [['Anna Ellis', 'Estates Lead']]),
    C('cli_mf', 'Marlow & Finch Architects', 'Architect', 'London', [['Jonah Finch', 'Director']]),
    C('cli_wc', 'Westfield City Council', 'Public sector', 'Salford', [['Karen Lowe', 'Principal Engineer']]),
  ];

  // [jobNo, name, client, office, sector, status, PM, owner, team, stages]
  // stage: [name, feeType, fee, % complete (fixed) or hours (T&M), window [from, to] days ago or null, overrun]
  const defs = [
    ['G28781', 'Wapping Wharf Block C', 'cli_hd', 'off_bri', 'Residential', 'Live', 'stf_hm', 'stf_ag', ['stf_hm', 'stf_ag', 'stf_so', 'stf_cr', 'stf_mh'], [
      ['RIBA 2 Concept design', 'Fixed', 32500, 100, [330, 270]],
      ['RIBA 3 Spatial coordination', 'Fixed', 47000, 100, [270, 180]],
      ['RIBA 4 Technical design', 'Fixed', 86500, 65, [180, 0]],
      ['RIBA 5 Construction stage support', 'T&M', 27000, 0, null],
    ]],
    ['G28785', 'Severn Meadows Phase 2', 'cli_sh', 'off_bri', 'Residential', 'Live', 'stf_so', 'stf_hm', ['stf_so', 'stf_lp', 'stf_cr'], [
      ['Drainage strategy', 'Fixed', 17000, 100, [240, 190]],
      ['Section 278 highways design', 'Fixed', 39500, 40, [190, 0]],
      ['Plot foundations', 'Fixed', 56000, 55, [150, 0], 1.6],
    ]],
    ['G28788', 'Northgate Library Refurbishment', 'cli_na', 'off_lon', 'Education', 'Live', 'stf_ec', 'stf_rk', ['stf_ec', 'stf_dn', 'stf_rk'], [
      ['Structural survey', 'T&M', 11000, 110, [210, 180]],
      ['RIBA 3 Spatial coordination', 'Fixed', 25000, 100, [180, 100]],
      ['RIBA 4 Technical design', 'Fixed', 38000, 30, [100, 0]],
    ]],
    ['G28790', 'Cotswold Barn Conversions', 'cli_ce', 'off_bri', 'Residential', 'Live', 'stf_so', 'stf_ag', ['stf_so', 'stf_cr'], [
      ['Feasibility', 'Fixed', 8000, 100, [200, 170]],
      ['RIBA 4 Technical design', 'Fixed', 22500, 80, [170, 0]],
    ]],
    ['G28792', 'Avonvale Retrofit Programme', 'cli_ah', 'off_bri', 'Residential', 'Live', 'stf_hm', 'stf_hm', ['stf_hm', 'stf_lp', 'stf_cr', 'stf_so'], [
      ['Condition surveys', 'T&M', 32500, 250, [160, 0]],
      ['Retrofit design', 'Fixed', 63000, 25, [90, 0]],
    ]],
    ['G28794', 'Kingsway Logistics Hub', 'cli_kc', 'off_man', 'Commercial', 'Live', 'stf_tb', 'stf_rk', ['stf_tb', 'stf_jw', 'stf_mh'], [
      ['RIBA 4 Steel frame design', 'Fixed', 97000, 70, [220, 0]],
      ['Temporary works', 'T&M', 21500, 125, [60, 0]],
      ['RIBA 5 Construction stage support', 'Fixed', 29000, 10, [30, 0]],
    ]],
    ['G28796', 'Bluebell Primary Extension', 'cli_bt', 'off_bri', 'Education', 'Live', 'stf_hm', 'stf_ag', ['stf_hm', 'stf_ag', 'stf_cr', 'stf_lp'], [
      ['RIBA 2–3 Concept and coordination', 'Fixed', 27000, 100, [300, 220]],
      ['RIBA 4 Technical design', 'Fixed', 34000, 90, [220, 0]],
      ['RIBA 5 Site inspections', 'T&M', 14500, 45, [40, 0]],
    ]],
    ['G28798', 'Marlow Street Offices', 'cli_mf', 'off_lon', 'Commercial', 'On hold', 'stf_ec', 'stf_rk', ['stf_ec', 'stf_dn'], [
      ['RIBA 2 Concept design', 'Fixed', 20000, 100, [260, 200]],
      ['RIBA 3 Spatial coordination', 'Fixed', 30500, 20, [200, 150]],
    ]],
    ['G28799', 'Westfield Bridge Assessment', 'cli_wc', 'off_man', 'Infrastructure', 'Live', 'stf_tb', 'stf_rk', ['stf_tb', 'stf_jw'], [
      ['Principal inspection', 'T&M', 16000, 145, [150, 110]],
      ['Structural assessment', 'Fixed', 43000, 45, [110, 0]],
    ]],
    ['G28800', 'Thameside Mixed-Use Scheme', 'cli_na', 'off_lon', 'Residential', 'Live', 'stf_rk', 'stf_rk', ['stf_rk', 'stf_ec', 'stf_dn'], [
      ['RIBA 2 Concept design', 'Fixed', 43000, 100, [200, 140]],
      ['RIBA 3 Spatial coordination', 'Fixed', 68500, 60, [140, 0]],
      ['Basement impact assessment', 'Fixed', 16000, 80, [120, 0]],
    ]],
    ['G28801', 'Harbourside Car Park Repairs', 'cli_hd', 'off_bri', 'Infrastructure', 'Complete', 'stf_so', 'stf_ag', ['stf_so', 'stf_cr'], [
      ['Investigation', 'Fixed', 14500, 100, [280, 240]],
      ['Repair design', 'Fixed', 25000, 100, [240, 160]],
      ['Site supervision', 'T&M', 11000, 100, [160, 100]],
    ]],
    ['G28803', 'Severn Meadows Phase 3', 'cli_sh', 'off_bri', 'Residential', 'Live', 'stf_so', 'stf_hm', ['stf_so', 'stf_lp'], [
      ['Drainage strategy', 'Fixed', 20000, 15, [35, 0]],
      ['Plot foundations', 'Fixed', 65000, 0, null],
    ]],
    ['G28804', 'Clifton Townhouse Basement', 'cli_ce', 'off_bri', 'Residential', 'Live', 'stf_hm', 'stf_ag', ['stf_hm', 'stf_cr'], [
      ['RIBA 4 Technical design', 'Fixed', 17500, 50, [70, 0]],
      ['Party wall support', 'T&M', 4500, 20, [40, 0]],
    ]],
    ['G28805', 'Westfield Depot Roof', 'cli_wc', 'off_man', 'Commercial', 'Live', 'stf_jw', 'stf_tb', ['stf_jw', 'stf_mh'], [
      ['Condition survey', 'T&M', 6500, 55, [50, 30]],
      ['Roof replacement design', 'Fixed', 21500, 35, [30, 0]],
    ]],
  ];

  const clientOf = new Map(clients.map((c) => [c.id, c]));
  const plans = [];
  const projects = defs.map(([jobNo, name, clientId, officeId, sector, status, managerId, ownerId, team, stageDefs]) => {
    const id = `prj_${jobNo.toLowerCase()}`;
    const windows = stageDefs.map((s) => s[4]).filter(Boolean);
    const startDate = weekday(ago(Math.max(...windows.map((w) => w[0]))));
    const p = {
      id, jobNo, name, clientId, officeId, sector, status, managerId, ownerId, team,
      startDate, endDate: status === 'Complete' ? ago(Math.min(...windows.map((w) => w[1]))) : null,
      address: clientOf.get(clientId).address, purchaseOrder: rnd() < 0.5 ? `PO-${ri(40000, 99999)}` : '',
      description: '', internal: false, invoiceSchedule: [], stages: [],
    };
    p.stages = stageDefs.map(([sName, feeType, fee, amount, win, overrun], i) => {
      const budgetHours = Math.round(fee / 85 / 5) * 5;
      const st = {
        id: `stg_${jobNo.toLowerCase()}_${i + 1}`, name: sName, feeType, fee, budgetHours,
        percentComplete: feeType === 'T&M' ? 0 : amount,
      };
      if (win) {
        const target = feeType === 'T&M' ? amount : budgetHours * (amount / 100) * (overrun || r(0.8, 1.05));
        const start = weekday(ago(win[0]));
        const end = win[1] === 0 ? ago(1) : ago(win[1]);
        plans.push({ p, st, start, end, daily: target / Math.max(1, workingDays(start, end)), owed: 0, remaining: target });
      }
      return st;
    });
    return p;
  });
  const projectById = new Map(projects.map((p) => [p.id, p]));

  // ── Leave (generated first so nobody books time on a day off) ─────────────
  const L = (staffId, type, from, to, status, extra = {}) => {
    const start = weekday(addDays(today, from));
    let end = addDays(today, to);
    if (end < start) end = start;
    if (!isWeekday(end)) end = addDays(end, dayOfWeek(end) === 5 ? -1 : -2);
    return { id: `lv_${staffId}_${from}`, staffId, type, start, end: end < start ? start : end, status, halfDay: false, note: '', requestedAt: ago(Math.max(1, -from + 14)), ...extra };
  };
  const leave = [
    L('stf_so', 'Annual leave', -60, -56, 'Approved'),
    L('stf_ec', 'Annual leave', -100, -96, 'Approved'),
    L('stf_tb', 'Annual leave', -30, -28, 'Approved'),
    L('stf_jw', 'Sick leave', -12, -12, 'Approved'),
    L('stf_mh', 'Annual leave', -5, -5, 'Approved'),
    L('stf_hm', 'Annual leave', -140, -133, 'Approved'),
    L('stf_cr', 'Annual leave', -80, -76, 'Approved'),
    L('stf_dn', 'Annual leave', 3, 7, 'Approved'),
    L('stf_hm', 'Annual leave', 21, 25, 'Approved'),
    L('stf_ag', 'Annual leave', 50, 54, 'Approved'),
    L('stf_cr', 'Annual leave', 35, 36, 'Requested'),
    L('stf_lp', 'Annual leave', 10, 10, 'Requested', { halfDay: true }),
    L('stf_tb', 'Training', 17, 18, 'Requested', { note: 'IStructE course' }),
  ];
  const onLeave = (staffId, d) => leave.some((l) => l.staffId === staffId && l.status === 'Approved' && d >= l.start && d <= l.end);

  // ── Timesheets ─────────────────────────────────────────────────────────────
  const timesheets = [];
  let tid = 0;
  const entry = (staffId, projectId, stageId, date, hours) => timesheets.push({ id: `t${(++tid).toString(36)}`, staffId, projectId, stageId, date, hours });
  const earliest = plans.reduce((m, pl) => (pl.start < m ? pl.start : m), today);
  const fillFrom = weekStart(ago(7 * 16)); // overhead time is only filled in for the last 16 weeks
  for (let d = earliest; d < today; d = addDays(d, 1)) {
    if (!isWeekday(d)) continue;
    const used = new Map();
    for (const pl of plans) {
      if (d < pl.start || d > pl.end || pl.remaining <= 0) continue;
      pl.owed += pl.daily * r(0.5, 1.5);
      while (pl.owed >= 1.5 && pl.remaining > 0.25) {
        const chunk = Math.max(0.5, Math.min(half(r(1.5, 4)), half(pl.owed), half(pl.remaining)));
        const free = pl.p.team.filter((s) => !onLeave(s, d) && 7.5 - (used.get(s) || 0) >= chunk);
        if (!free.length) break;
        // The project manager does a bigger share than anyone else.
        const who = free.includes(pl.p.managerId) && rnd() < 0.35 ? pl.p.managerId : pick(free);
        entry(who, pl.p.id, pl.st.id, d, chunk);
        used.set(who, (used.get(who) || 0) + chunk);
        pl.owed -= chunk;
        pl.remaining -= chunk;
      }
    }
    if (d < fillFrom) continue;
    for (const s of staff) {
      if (onLeave(s.id, d)) continue;
      const day = s.weeklyHours / 5;
      const rest = half(day - (used.get(s.id) || 0));
      if (rest < 0.5) continue;
      const senior = ['Director', 'Associate'].includes(s.grade);
      const stage = !s.billable ? 'int_admin' : senior && rnd() < 0.55 ? pick(['int_bd', 'int_bids']) : rnd() < 0.2 ? 'int_cpd' : 'int_admin';
      entry(s.id, 'prj_int', stage, d, rest);
    }
  }

  // Each week up to last week is approved; last week is partly still waiting.
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);
  const timesheetWeeks = [];
  const weeksWithTime = new Map();
  for (const e of timesheets) {
    const k = `${e.staffId}|${weekStart(e.date)}`;
    weeksWithTime.set(k, true);
  }
  for (const k of weeksWithTime.keys()) {
    const [staffId, ws] = k.split('|');
    if (ws >= thisWeek) continue;
    const approver = staffId === 'stf_ag' ? 'stf_hm' : person.get(staffId).officeId === 'off_lon' ? 'stf_rk' : person.get(staffId).officeId === 'off_man' ? 'stf_tb' : 'stf_ag';
    if (ws === lastWeek) {
      if (staffId === 'stf_jw') continue; // not submitted yet
      if (['stf_so', 'stf_lp', 'stf_cr', 'stf_dn', 'stf_mh'].includes(staffId)) {
        timesheetWeeks.push({ staffId, weekStart: ws, status: 'Submitted', submittedAt: addDays(ws, 4), approvedBy: null, approvedAt: null, comment: '' });
        continue;
      }
    }
    timesheetWeeks.push({ staffId, weekStart: ws, status: 'Approved', submittedAt: addDays(ws, 4), approvedBy: approver, approvedAt: addDays(ws, 7), comment: '' });
  }

  // ── Expenses ───────────────────────────────────────────────────────────────
  const expenses = [];
  const live = projects.filter((p) => p.status !== 'Complete');
  for (let i = 0; i < 26; i++) {
    const p = pick(live);
    const staffId = pick(p.team);
    const date = weekday(ago(ri(2, 120)));
    const kind = pick(['Mileage', 'Mileage', 'Mileage', 'Rail travel', 'Parking', 'Subsistence', 'Accommodation', 'Printing']);
    let amount; let description;
    if (kind === 'Mileage') { const miles = ri(12, 180); amount = round2(miles * 0.45); description = `Site visit, ${miles} miles @ 45p`; }
    else if (kind === 'Rail travel') { amount = round2(r(28, 140)); description = 'Train to client meeting'; }
    else if (kind === 'Parking') { amount = round2(r(4, 18)); description = 'Site parking'; }
    else if (kind === 'Subsistence') { amount = round2(r(6, 22)); description = 'Lunch on site'; }
    else if (kind === 'Accommodation') { amount = round2(r(85, 140)); description = 'Hotel, one night'; }
    else { amount = round2(r(25, 160)); description = 'A1 drawing prints'; }
    const age = -Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
    const status = age > 45 ? 'Paid' : age > 14 ? 'Approved' : 'Submitted';
    expenses.push({ id: `exp_${i + 1}`, staffId, projectId: p.id, date, category: kind, description, amount, chargeable: kind !== 'Subsistence', status, receipt: kind !== 'Mileage', approvedBy: status === 'Submitted' ? null : p.managerId });
  }
  expenses[3].status = 'Rejected';
  expenses[3].comment = 'Please attach a receipt';

  // ── Invoices: month by month, billing what was earned in the month ────────
  const thisMonth = monthKey(today);
  const cumHours = new Map(); // stageId -> sorted [date, hours, value]
  for (const e of timesheets) {
    if (e.projectId === 'prj_int') continue;
    if (!cumHours.has(e.stageId)) cumHours.set(e.stageId, []);
    cumHours.get(e.stageId).push([e.date, e.hours, e.hours * person.get(e.staffId).chargeRate]);
  }
  const stageTotal = (stageId, upTo) => {
    let h = 0; let v = 0;
    for (const [d, hh, vv] of cumHours.get(stageId) || []) if (!upTo || d <= upTo) { h += hh; v += vv; }
    return { h, v };
  };
  const earnedBy = (st, upTo) => {
    if (st.feeType === 'T&M') return stageTotal(st.id, upTo).v;
    const all = stageTotal(st.id).h;
    return all ? (st.fee * st.percentComplete) / 100 * (stageTotal(st.id, upTo).h / all) : 0;
  };
  const lastWorkingDay = (m) => { let d = monthEnd(m); while (!isWeekday(d)) d = addDays(d, -1); return d; };

  const raw = [];
  for (const p of projects) {
    for (let m = monthKey(p.startDate); m < thisMonth; m = addMonths(m, 1)) {
      const prevEnd = monthEnd(addMonths(m, -1));
      const end = monthEnd(m);
      const lines = [];
      for (const st of p.stages) {
        const amount = Math.round((earnedBy(st, end) - earnedBy(st, prevEnd)) / 10) * 10;
        if (amount >= 100) {
          lines.push({ stageId: st.id, description: `${st.name}: ${st.feeType === 'T&M' ? 'time charges' : 'progress'} for ${monthLabel(m, true)}`, amount });
        }
      }
      const exp = expenses.filter((x) => x.projectId === p.id && x.chargeable && ['Approved', 'Paid'].includes(x.status) && monthKey(x.date) === m);
      const expTotal = round2(exp.reduce((t, x) => t + x.amount, 0));
      if (expTotal > 0) lines.push({ stageId: 'expenses', description: `Rechargeable expenses for ${monthLabel(m, true)}`, amount: expTotal });
      if (!lines.length) continue;
      raw.push({ p, date: lastWorkingDay(m), lines });
    }
  }
  raw.sort((a, b) => a.date.localeCompare(b.date));
  let invNo = 2101;
  const invoices = raw.map(({ p, date, lines }) => {
    const dueDate = addDays(date, 30);
    let paidDate = addDays(date, ri(18, 52));
    if (p.status === 'On hold' && date >= ago(150)) paidDate = null; // slow payer
    const paid = paidDate && paidDate < today;
    const contact = clientOf.get(p.clientId).contacts[0];
    return {
      id: `inv_${invNo}`, number: `INV-${invNo++}`, projectId: p.id, date, dueDate, status: paid ? 'Paid' : 'Sent',
      paidDate: paid ? paidDate : null, vatRate: 20, lines, reference: p.purchaseOrder || '', contactId: contact?.id || null,
      createdBy: p.managerId, approvedBy: p.ownerId, notes: '',
    };
  });

  // One draft this month, waiting for approval.
  const wapping = projectById.get('prj_g28781');
  const rib4 = wapping.stages[2];
  const draftAmount = Math.round((earnedBy(rib4, today) - earnedBy(rib4, monthEnd(addMonths(thisMonth, -1)))) / 10) * 10;
  if (draftAmount > 0) {
    invoices.push({
      id: `inv_${invNo}`, number: `INV-${invNo++}`, projectId: wapping.id, date: today, dueDate: addDays(today, 30), status: 'Draft',
      paidDate: null, vatRate: 20, lines: [{ stageId: rib4.id, description: `${rib4.name}: progress for ${monthLabel(thisMonth, true)}`, amount: draftAmount }],
      reference: wapping.purchaseOrder, contactId: 'cli_hd_c1', createdBy: 'stf_hm', approvedBy: null, notes: '',
    });
  }

  // ── Planned billing for the rest of each job ──────────────────────────────
  for (const p of projects) {
    if (!['Live', 'On hold'].includes(p.status)) continue;
    const delay = p.status === 'On hold' ? 3 : 0;
    let sid = 0;
    for (const st of p.stages) {
      const left = st.feeType === 'T&M' ? st.fee - stageTotal(st.id).v : st.fee * (1 - st.percentComplete / 100);
      if (left < 500) continue;
      const notStarted = st.feeType === 'T&M' ? !cumHours.has(st.id) : st.percentComplete === 0;
      const n = Math.min(6, Math.max(1, Math.ceil(left / 7000)));
      const first = addMonths(thisMonth, delay + (notStarted ? ri(1, 2) : 0));
      const each = Math.round(left / n / 50) * 50;
      for (let i = 0; i < n; i++) {
        p.invoiceSchedule.push({ id: `sch_${p.jobNo}_${++sid}`, stageId: st.id, month: addMonths(first, i), amount: i === n - 1 ? Math.round(left - each * (n - 1)) : each });
      }
    }
  }

  // ── Opportunities ──────────────────────────────────────────────────────────
  const fee = (id) => projectById.get(id).stages.reduce((t, s) => t + s.fee, 0);
  const O = (id, title, clientId, officeId, ownerId, value, probability, stage, extra = {}) => ({
    id, title, clientId, officeId, ownerId, value, probability, stage, expectedDate: null, durationMonths: 6,
    wonDate: null, lostDate: null, lostReason: '', projectId: null, source: 'Existing client', notes: '', createdAt: ago(ri(60, 200)), ...extra,
  });
  const won = (id, projectId, daysAgo, title, value) => {
    const p = projectById.get(projectId);
    return O(id, title || p.name, p.clientId, p.officeId, p.ownerId, value ?? fee(projectId), 100, 'Won', { wonDate: weekday(ago(daysAgo)), expectedDate: weekday(ago(daysAgo)), projectId, createdAt: ago(daysAgo + ri(30, 80)) });
  };
  const open = (id, title, clientId, officeId, ownerId, value, probability, stage, inDays, durationMonths, source = 'Existing client') =>
    O(id, title, clientId, officeId, ownerId, value, probability, stage, { expectedDate: weekday(addDays(today, inDays)), durationMonths, source });
  const opportunities = [
    won('opp_01', 'prj_g28781', 350),
    won('opp_02', 'prj_g28785', 250),
    won('opp_03', 'prj_g28788', 220),
    won('opp_04', 'prj_g28790', 205),
    won('opp_05', 'prj_g28792', 170),
    won('opp_06', 'prj_g28794', 230, 'Kingsway Logistics Hub', 126000),
    won('opp_07', 'prj_g28796', 310, 'Bluebell Primary Extension', 61000),
    won('opp_08', 'prj_g28798', 270),
    won('opp_09', 'prj_g28799', 160),
    won('opp_10', 'prj_g28800', 210),
    won('opp_11', 'prj_g28801', 290),
    won('opp_12', 'prj_g28803', 40),
    won('opp_13', 'prj_g28804', 75),
    won('opp_14', 'prj_g28805', 55),
    won('opp_15', 'prj_g28781', 30, 'Wapping Wharf Block C: construction stage support', 27000),
    won('opp_16', 'prj_g28794', 62, 'Kingsway Logistics Hub: temporary works', 21500),
    won('opp_17', 'prj_g28796', 45, 'Bluebell Primary: site inspections', 14500),
    open('opp_20', 'Portishead Marina Apartments', 'cli_hd', 'off_bri', 'stf_ag', 85000, 60, 'Proposal', 30, 9),
    open('opp_21', 'Severn Meadows Phase 4 drainage', 'cli_sh', 'off_bri', 'stf_hm', 14000, 35, 'Qualified', 60, 4),
    open('opp_22', "St Anne's Academy sports hall", 'cli_bt', 'off_bri', 'stf_ag', 42000, 50, 'Proposal', 20, 8),
    open('opp_23', 'Kingsway Distribution Centre 2', 'cli_kc', 'off_man', 'stf_rk', 68000, 40, 'Qualified', 75, 10),
    open('opp_24', 'Northgate Theatre feasibility', 'cli_na', 'off_lon', 'stf_rk', 9000, 15, 'Lead', 90, 3),
    open('opp_25', 'Avonvale Retrofit Phase 2 surveys', 'cli_ah', 'off_bri', 'stf_hm', 26000, 70, 'Proposal', 14, 6),
    open('opp_26', 'Highway structures framework', 'cli_wc', 'off_man', 'stf_rk', 120000, 10, 'Lead', 150, 12, 'Tender portal'),
    open('opp_27', 'Bath Road office refurbishment', 'cli_mf', 'off_lon', 'stf_ec', 22000, 30, 'Qualified', 45, 6),
    open('opp_28', 'Estate stables conversion', 'cli_ce', 'off_bri', 'stf_so', 7500, 20, 'Lead', 40, 3, 'Referral'),
    O('opp_30', 'Temple Quay hotel', 'cli_hd', 'off_bri', 'stf_ag', 55000, 0, 'Lost', { lostDate: weekday(ago(50)), expectedDate: weekday(ago(50)), lostReason: 'Lost on fee' }),
    O('opp_31', 'Free school phase 2', 'cli_bt', 'off_bri', 'stf_hm', 18000, 0, 'Lost', { lostDate: weekday(ago(120)), expectedDate: weekday(ago(120)), lostReason: 'Client stayed with incumbent' }),
  ];

  // ── Resource allocations: four weeks back, eight ahead ────────────────────
  const allocations = [];
  let aid = 0;
  for (let w = -4; w <= 8; w++) {
    const ws = addDays(thisWeek, w * 7);
    for (const s of staff) {
      if (!s.billable) continue;
      const mine = projects.filter((p) => p.status === 'Live' && p.team.includes(s.id) && p.stages.some((st) => st.feeType === 'T&M' || st.percentComplete < 100));
      if (!mine.length) continue;
      const target = s.id === 'stf_so' && (w === 1 || w === 2) ? 42 : s.id === 'stf_hm' && w === 3 ? 18 : w > 5 ? r(12, 24) : r(22, 34);
      const weights = mine.map(() => r(0.5, 1.5));
      const total = weights.reduce((a, b) => a + b, 0);
      mine.forEach((p, i) => {
        const hours = Math.round((target * weights[i]) / total);
        if (hours >= 2) allocations.push({ id: `al${++aid}`, staffId: s.id, projectId: p.id, weekStart: ws, hours });
      });
    }
  }

  const state = emptyState(today);
  state.settings = { ...state.settings, currentUserId: 'stf_ag', nextJobNo: 28806, nextInvoiceNo: invNo, demo: true };
  return {
    ...state,
    offices, staff, clients, opportunities,
    projects: [internalProject(), ...projects],
    timesheets, timesheetWeeks, allocations, invoices, expenses, leave,
  };
}
