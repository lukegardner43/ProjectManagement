import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/calc.js';
import { seed, emptyState } from '../js/seed.js';
import { fyRange, workingDays, weekStart, addMonths, html, raw, toCSV, money } from '../js/util.js';

const TODAY = '2026-10-15'; // a Thursday

function stateWithProject() {
  const s = emptyState(TODAY);
  s.staff = [
    { id: 'a', name: 'A', chargeRate: 100, costRate: 40, weeklyHours: 37.5, billable: true },
    { id: 'b', name: 'B', chargeRate: 50, costRate: 20, weeklyHours: 37.5, billable: true },
  ];
  s.projects.push({
    id: 'p1', jobNo: 'G1', name: 'Test', status: 'Live', officeId: 'off_main', team: ['a', 'b'], invoiceSchedule: [],
    stages: [
      { id: 's1', name: 'Fixed', feeType: 'Fixed', fee: 10000, budgetHours: 100, percentComplete: 40 },
      { id: 's2', name: 'T&M', feeType: 'T&M', fee: 5000, budgetHours: 50, percentComplete: 0 },
    ],
  });
  s.timesheets = [
    { id: 't1', staffId: 'a', projectId: 'p1', stageId: 's1', date: '2026-10-12', hours: 30 },
    { id: 't2', staffId: 'b', projectId: 'p1', stageId: 's2', date: '2026-10-13', hours: 10 },
  ];
  s.invoices = [
    { id: 'i1', number: 'INV-1', projectId: 'p1', date: '2026-09-30', dueDate: '2026-10-30', status: 'Sent', vatRate: 20, lines: [{ stageId: 's1', amount: 3000 }] },
    { id: 'i2', number: 'INV-2', projectId: 'p1', date: '2026-10-15', dueDate: '2026-11-14', status: 'Draft', vatRate: 20, lines: [{ stageId: 's1', amount: 999 }] },
  ];
  s.expenses = [
    { id: 'e1', staffId: 'a', projectId: 'p1', amount: 100, chargeable: true, status: 'Approved' },
    { id: 'e2', staffId: 'a', projectId: 'p1', amount: 50, chargeable: false, status: 'Paid' },
    { id: 'e3', staffId: 'a', projectId: 'p1', amount: 999, chargeable: true, status: 'Submitted' },
  ];
  return s;
}

test('project financials: earned, invoiced, WIP, cost and margin', () => {
  const s = stateWithProject();
  const f = C.projectFinancials(s.projects[1], C.makeCtx(s));
  // Fixed stage earns 40% of 10,000; T&M earns 10 h × £50; plus £100 rechargeable expenses.
  assert.equal(f.earned, 4000 + 500 + 100);
  // Drafts don't count as invoiced.
  assert.equal(f.invoiced, 3000);
  assert.equal(f.wip, 1600);
  // 30 h × £40 + 10 h × £20 + approved/paid expenses (150); submitted claims excluded.
  assert.equal(f.cost, 1200 + 200 + 150);
  assert.equal(f.hours, 40);
  assert.equal(f.budgetHours, 150);
  assert.equal(f.percentComplete, 0.4);
  assert.ok(Math.abs(f.margin - (4600 - 1550) / 4600) < 1e-9);
});

test('project flags when hours run ahead of progress', () => {
  assert.deepEqual(C.projectFlags({ hoursUsed: 0.5, percentComplete: 0.45, margin: 0.3 }), []);
  const flags = C.projectFlags({ hoursUsed: 1.2, percentComplete: 0.6, margin: -0.1 }).map((x) => x.label);
  assert.equal(flags.length, 3);
});

test('invoice totals and overdue status', () => {
  const inv = { status: 'Sent', dueDate: '2026-10-01', vatRate: 20, lines: [{ amount: 1000 }, { amount: 250 }] };
  assert.equal(C.invoiceNet(inv), 1250);
  assert.equal(C.invoiceVat(inv), 250);
  assert.equal(C.invoiceGross(inv), 1500);
  assert.equal(C.invoiceDisplayStatus(inv, TODAY), 'Overdue');
  assert.equal(C.invoiceDisplayStatus({ ...inv, dueDate: '2026-10-15' }, TODAY), 'Sent');
  assert.equal(C.invoiceDisplayStatus({ ...inv, status: 'Paid' }, TODAY), 'Paid');
});

test('aged debt buckets by days overdue', () => {
  const s = emptyState(TODAY);
  const mk = (due, amount) => ({ status: 'Sent', dueDate: due, vatRate: 0, lines: [{ amount }] });
  s.invoices = [mk('2026-10-20', 1), mk('2026-10-10', 10), mk('2026-08-31', 100), mk('2026-06-01', 1000), { ...mk('2026-01-01', 5), status: 'Paid' }];
  const b = C.agedDebt(s, TODAY);
  assert.deepEqual(b.map((x) => x.total), [1, 10, 100, 0, 1000]);
});

test('forecast calendar splits invoiced, scheduled and weighted pipeline', () => {
  const s = stateWithProject();
  s.projects[1].invoiceSchedule = [
    { id: 'x1', stageId: 's1', month: '2026-09', amount: 777 }, // past: ignored
    { id: 'x2', stageId: 's1', month: '2026-10', amount: 2000 },
    { id: 'x3', stageId: 's1', month: '2026-11', amount: 1000 },
  ];
  s.opportunities = [
    { id: 'o1', stage: 'Proposal', value: 12000, probability: 50, expectedDate: '2026-08-01', durationMonths: 3, officeId: 'off_main' },
    { id: 'o2', stage: 'Lost', value: 99999, probability: 0, expectedDate: '2026-10-01', durationMonths: 1 },
  ];
  const months = ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01'];
  const cal = C.forecastCalendar(s, months, TODAY);
  assert.deepEqual(cal.map((r) => r.invoiced), [3000, 0, 0, 0, 0]);
  assert.deepEqual(cal.map((r) => r.scheduled), [0, 2000, 1000, 0, 0]);
  // 6,000 weighted over 3 months, starting this month because the expected date has passed.
  assert.deepEqual(cal.map((r) => r.pipeline), [0, 2000, 2000, 2000, 0]);
});

test('sales won and pipeline totals', () => {
  const s = emptyState(TODAY);
  s.opportunities = [
    { stage: 'Won', value: 100, wonDate: '2026-04-01', officeId: 'x' },
    { stage: 'Won', value: 200, wonDate: '2026-03-31', officeId: 'x' },
    { stage: 'Lead', value: 1000, probability: 10 },
    { stage: 'Proposal', value: 1000, probability: 60 },
  ];
  const fy = fyRange(TODAY, 4);
  assert.deepEqual(C.salesWon(s, fy).map((o) => o.value), [100]);
  assert.deepEqual(C.pipelineTotals(s.opportunities), { count: 2, value: 2000, weighted: 700 });
});

test('leave reduces capacity, half days count as half', () => {
  const s = emptyState(TODAY);
  const p = { id: 'a', weeklyHours: 37.5 };
  s.leave = [
    { staffId: 'a', start: '2026-10-12', end: '2026-10-13', status: 'Approved' },
    { staffId: 'a', start: '2026-10-14', end: '2026-10-14', status: 'Approved', halfDay: true },
    { staffId: 'a', start: '2026-10-15', end: '2026-10-16', status: 'Requested' },
  ];
  assert.equal(C.leaveDays(s, 'a', '2026-10-12', '2026-10-18'), 2.5);
  assert.equal(C.weekCapacity(s, p, '2026-10-12'), 2.5 * 7.5);
});

test('utilisation counts only client work as chargeable', () => {
  const s = stateWithProject();
  s.timesheets.push({ id: 't3', staffId: 'a', projectId: 'prj_int', stageId: 'int_admin', date: '2026-10-14', hours: 7.5 });
  const [a] = C.utilisation(s, [s.staff[0]], '2026-10-12', '2026-10-16');
  assert.equal(a.hours, 37.5);
  assert.equal(a.chargeable, 30);
  assert.equal(a.capacity, 37.5);
  assert.equal(a.utilisation, 0.8);
});

test('date helpers', () => {
  assert.equal(weekStart('2026-10-15'), '2026-10-12');
  assert.equal(weekStart('2026-10-18'), '2026-10-12');
  assert.equal(workingDays('2026-10-12', '2026-10-18'), 5);
  assert.equal(addMonths('2026-11', 3), '2027-02');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  const fy = fyRange('2026-02-10', 4);
  assert.equal(fy.start, '2025-04-01');
  assert.equal(fy.end, '2026-03-31');
  assert.equal(fy.label, 'FY 2025/26');
  assert.equal(fyRange('2026-02-10', 1).label, 'FY 2026');
});

test('html escapes interpolations but not nested html', () => {
  const name = '<img src=x onerror=alert(1)>';
  assert.equal(String(html`<b>${name}</b>`), '<b>&lt;img src=x onerror=alert(1)&gt;</b>');
  assert.equal(String(html`<i>${html`<b>${'&'}</b>`}</i>`), '<i><b>&amp;</b></i>');
  assert.equal(String(html`${[1, 2].map((n) => html`<li>${n}</li>`)}`), '<li>1</li><li>2</li>');
  assert.equal(String(html`${false}${null}${raw('<br>')}`), '<br>');
});

test('CSV quoting and money formatting', () => {
  assert.equal(toCSV([['a', 'b,c', 'say "hi"'], [1, '', 'x\ny']]), 'a,"b,c","say ""hi"""\r\n1,,"x\ny"');
  assert.equal(money(1234.6), '£1,235');
  assert.equal(money(-0.4), '£0');
});

test('demo data is internally consistent', () => {
  const s = seed(TODAY);
  const ids = (k) => new Set(s[k].map((x) => x.id));
  const staff = ids('staff');
  const projects = new Map(s.projects.map((p) => [p.id, p]));
  for (const e of s.timesheets) {
    assert.ok(staff.has(e.staffId));
    assert.ok(projects.get(e.projectId)?.stages.some((st) => st.id === e.stageId), `stage ${e.stageId}`);
    assert.ok(e.date < TODAY && e.hours > 0);
  }
  // Nobody books more than a working day.
  const day = new Map();
  for (const e of s.timesheets) day.set(`${e.staffId}${e.date}`, (day.get(`${e.staffId}${e.date}`) || 0) + e.hours);
  assert.ok(Math.max(...day.values()) <= 7.5);
  for (const i of s.invoices) assert.ok(projects.has(i.projectId) && i.lines.length && i.dueDate >= i.date);
  assert.equal(new Set(s.invoices.map((i) => i.number)).size, s.invoices.length);
  assert.equal(new Set(s.projects.map((p) => p.jobNo)).size, s.projects.length);
  for (const o of s.opportunities) if (o.projectId) assert.ok(projects.has(o.projectId));
  assert.ok(s.settings.nextInvoiceNo > Math.max(...s.invoices.map((i) => Number(i.number.slice(4)))));
  // The same day always produces the same demo.
  assert.deepEqual(seed(TODAY), s);
});
