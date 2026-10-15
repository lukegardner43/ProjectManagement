import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../js/forecast.js';
import * as C from '../js/calc.js';
import { emptyState, seed } from '../js/seed.js';
import { sum } from '../js/util.js';

const TODAY = '2026-10-15';

test('spreadByMonth splits hours by working days', () => {
  // 2026-10-26 (Mon) to 2026-11-06 (Fri): 5 working days in Oct, 5 in Nov.
  const m = F.spreadByMonth(100, '2026-10-26', '2026-11-06', new Map());
  assert.equal(Math.round(m.get('2026-10')), 50);
  assert.equal(Math.round(m.get('2026-11')), 50);
});

function payState() {
  const s = emptyState(TODAY);
  s.clients = [{ id: 'c1', name: 'Slow Ltd', contacts: [] }, { id: 'c2', name: 'New Ltd', contacts: [] }];
  s.projects.push({ id: 'p1', clientId: 'c1', status: 'Live', stages: [], invoiceSchedule: [{ id: 'x', stageId: 's', month: '2026-11', amount: 1000 }], team: [] });
  s.projects.push({ id: 'p2', clientId: 'c2', status: 'Live', stages: [], invoiceSchedule: [], team: [] });
  const inv = (id, projectId, date, dueDate, status, paidDate = null) => ({ id, number: id, projectId, date, dueDate, status, paidDate, vatRate: 20, lines: [{ stageId: 's', amount: 1000 }] });
  s.invoices = [
    inv('i1', 'p1', '2026-05-31', '2026-06-30', 'Paid', '2026-07-30'), // 60 days to pay, 30 late
    inv('i2', 'p1', '2026-06-30', '2026-07-30', 'Paid', '2026-08-29'), // 60 days, 30 late
    inv('i3', 'p1', '2026-09-30', '2026-10-30', 'Sent'),
    inv('i4', 'p2', '2026-07-31', '2026-08-30', 'Sent'), // 46 days overdue, no history
  ];
  return s;
}

test('client pay stats and predicted payment dates', () => {
  const s = payState();
  const stats = F.clientPayStats(s);
  assert.equal(stats.get('c1').avgDays, 60);
  assert.equal(stats.get('c1').avgLate, 30);
  // Slow Ltd usually pays 60 days after invoice, not on the due date.
  assert.equal(F.predictedPayDate(s.invoices[2], 'c1', stats, TODAY), '2026-11-29');
  // No history: due date; already past it, so expected within a week.
  assert.equal(F.predictedPayDate(s.invoices[3], 'c2', stats, TODAY), '2026-10-22');
});

test('risky payers: habitually late, or long overdue now', () => {
  const r = F.riskyPayers(payState(), TODAY);
  assert.deepEqual(r.map((x) => x.clientId).sort(), ['c1', 'c2']);
});

test('cash forecast places receipts by predicted date, gross of VAT', () => {
  const rows = F.cashForecast(payState(), ['2026-10', '2026-11', '2026-12', '2027-01'], TODAY);
  const by = Object.fromEntries(rows.map((r) => [r.month, Math.round(r.invoices + r.planned)]));
  // i4 lands this month, i3 in November; November's planned billing lands 60 days after month end, in January.
  assert.deepEqual(by, { '2026-10': 1200, '2026-11': 1200, '2026-12': 0, '2027-01': 1200 });
});

test('billing actions: raise, send and chase', () => {
  const s = payState();
  s.staff = [{ id: 'a', chargeRate: 100, costRate: 40, active: true }];
  s.projects[1].stages = [{ id: 's1', name: 'T&M', feeType: 'T&M', fee: 0, budgetHours: 0, percentComplete: 0 }];
  s.timesheets = [{ id: 't', staffId: 'a', projectId: 'p1', stageId: 's1', date: '2026-10-01', hours: 10 }];
  s.invoices.push({ id: 'i5', number: 'i5', projectId: 'p2', date: TODAY, dueDate: '2026-11-14', status: 'Approved', vatRate: 20, lines: [{ stageId: 's', amount: 50 }] });
  const a = F.billingActions(s, TODAY);
  assert.deepEqual(a.raise.map((x) => [x.project.id, x.wip]), [['p1', 1000]]);
  assert.deepEqual(a.send.map((i) => i.id), ['i5']);
  assert.deepEqual(a.chase.map((x) => [x.inv.id, x.daysLate]), [['i4', 46]]);
});

test('staffing forecast: live remaining hours by grade, pipeline weighted, capacity at target', () => {
  const s = emptyState(TODAY);
  s.settings.utilisationTarget = 0.8;
  s.staff = [{ id: 'a', grade: 'Engineer', billable: true, active: true, weeklyHours: 37.5, chargeRate: 80, costRate: 30 }];
  s.projects.push({
    id: 'p1', status: 'Live', team: ['a'], invoiceSchedule: [],
    // 40 budget hours over November, 10 already booked: 30 left.
    stages: [{ id: 's1', feeType: 'Fixed', fee: 4000, budgetHours: 40, percentComplete: 25, startDate: '2026-11-02', weeks: 4, hoursByGrade: { Engineer: 40 } }],
  });
  s.timesheets = [{ id: 't', staffId: 'a', projectId: 'p1', stageId: 's1', date: '2026-10-14', hours: 10 }];
  s.rateCards = [{ id: 'rc', name: 'r', rates: { Engineer: 80 } }];
  s.estimates = [{ id: 'e1', rateCardId: 'rc', startDate: '2026-11-02', method: 'bottom-up', targetMargin: 0.3, stages: [{ id: 'x', name: 'X', feeType: 'Fixed', weeks: 4, pct: 0, hours: { Engineer: 100 } }] }];
  s.opportunities = [{ id: 'o1', stage: 'Proposal', probability: 50, expectedDate: '2026-10-19', estimateId: 'e1' }];
  const out = F.staffingForecast(s, ['2026-10', '2026-11', '2026-12'], TODAY);
  const eng = out.rows.find((r) => r.grade === 'Engineer');
  assert.equal(Math.round(sum(eng.months, (m) => m.live)), 30);
  assert.equal(Math.round(sum(eng.months, (m) => m.pipeline)), 50);
  // November: 21 working days × 7.5 h × 80%.
  assert.equal(Math.round(eng.months[1].capacity), 126);
});

test('revenue by month apportions fixed-fee earned value by hours booked', () => {
  const s = emptyState(TODAY);
  s.staff = [{ id: 'a', chargeRate: 100, costRate: 40 }];
  s.projects.push({ id: 'p1', status: 'Live', team: [], invoiceSchedule: [], stages: [
    { id: 'f', feeType: 'Fixed', fee: 10000, percentComplete: 30 },
    { id: 't', feeType: 'T&M', fee: 0, percentComplete: 0 },
  ] });
  s.timesheets = [
    { staffId: 'a', projectId: 'p1', stageId: 'f', date: '2026-09-10', hours: 10 },
    { staffId: 'a', projectId: 'p1', stageId: 'f', date: '2026-10-10', hours: 30 },
    { staffId: 'a', projectId: 'p1', stageId: 't', date: '2026-10-11', hours: 2 },
  ];
  const by = F.revenueByMonth(s, ['2026-09', '2026-10']).get('p1');
  assert.equal(by.get('2026-09'), 750);
  assert.equal(by.get('2026-10'), 2250 + 200);
});

test('portfolio groups and find-people ranking', () => {
  const s = seed(TODAY);
  const groups = F.portfolio(s, 'sector', C.makeCtx(s), { statuses: ['Live'] });
  assert.ok(groups.length >= 3);
  assert.equal(sum(groups, (g) => g.count), s.projects.filter((p) => !p.internal && p.status === 'Live').length);
  const people = F.findPeople(s, { skills: ['Drainage design', 'SuDS'], from: '2026-10-12', weeks: 4 });
  assert.equal(people[0].person.id, 'stf_lp'); // the drainage specialist
  assert.deepEqual(people[0].missing, []);
});

test('supplier costs: invoiced orders are cost, rechargeable ones also earned', () => {
  const s = emptyState(TODAY);
  s.projects.push({ id: 'p1', status: 'Live', team: [], invoiceSchedule: [], stages: [] });
  s.purchaseOrders = [
    { projectId: 'p1', amount: 1000, status: 'Paid', rechargeable: true },
    { projectId: 'p1', amount: 300, status: 'Invoiced', rechargeable: false },
    { projectId: 'p1', amount: 500, status: 'Raised', rechargeable: true },
    { projectId: 'p1', amount: 999, status: 'Cancelled', rechargeable: true },
  ];
  const f = C.projectFinancials(s.projects[1], C.makeCtx(s));
  assert.equal(f.cost, 1300);
  assert.equal(f.earned, 1000);
  assert.equal(f.supplier.committed, 500);
  assert.equal(f.expensesUninvoiced, 1000);
});
