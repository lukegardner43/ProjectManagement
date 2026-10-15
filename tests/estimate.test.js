import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costEstimate, hoursForFee, templateStages, estimateToProject, gradeCostRates, topDownTotal, benchmark } from '../js/estimate.js';
import { DEFAULT_RATE_CARD, DEFAULT_FEE_TEMPLATES } from '../js/seed.js';

const RC = { id: 'rc', name: 'Test', rates: { Senior: 100, Junior: 50 } };
const state = {
  rateCards: [RC],
  staff: [
    { grade: 'Senior', costRate: 40, active: true },
    { grade: 'Senior', costRate: 50, active: true },
    { grade: 'Junior', costRate: 20, active: true },
    { grade: 'Junior', costRate: 99, active: false }, // left: ignored
  ],
};

const base = {
  rateCardId: 'rc', startDate: '2026-11-02', targetMargin: 0.4,
  stages: [
    { id: 'a', name: 'Design', weeks: 4, pct: 60, hours: { Senior: 10, Junior: 20 } },
    { id: 'b', name: 'Site', weeks: 2, pct: 40, hours: { Senior: 5 } },
  ],
};

test('cost rates average the people in each grade, ignoring leavers', () => {
  assert.deepEqual(gradeCostRates(state, RC), { Senior: 45, Junior: 20 });
  // A grade nobody holds is costed at 45% of its charge rate.
  assert.equal(gradeCostRates(state, { rates: { Director: 200 } }).Director, 90);
});

test('top-down: fee is construction cost × fee %, split by stage %', () => {
  const est = { ...base, method: 'top-down', constructionCost: 500000, feePct: 2 };
  assert.equal(topDownTotal(est), 10000);
  const c = costEstimate(state, est);
  assert.deepEqual(c.stages.map((s) => s.fee), [6000, 4000]);
  // Cost: Design 10×45 + 20×20 = 850; Site 5×45 = 225.
  assert.deepEqual(c.stages.map((s) => s.cost), [850, 225]);
  assert.equal(c.fee, 10000);
  assert.equal(c.cost, 1075);
  assert.equal(c.hours, 35);
  assert.ok(Math.abs(c.margin - 0.8925) < 1e-9);
  assert.equal(c.belowTarget, false);
  // Stages run back to back from the start date.
  assert.deepEqual(c.stages.map((s) => [s.start, s.end]), [['2026-11-02', '2026-11-29'], ['2026-11-30', '2026-12-13']]);
  // A lump sum is used when there's no construction cost.
  assert.equal(topDownTotal({ constructionCost: 0, fixedTotal: 7777 }), 7777);
});

test('bottom-up: fee is hours × rate card', () => {
  const c = costEstimate(state, { ...base, method: 'bottom-up' });
  assert.deepEqual(c.stages.map((s) => s.fee), [10 * 100 + 20 * 50, 5 * 100]);
  assert.equal(c.fee, 2500);
  assert.ok(c.margin < 0.6 && c.margin > 0.5);
});

test('margin below target is flagged', () => {
  const c = costEstimate(state, { ...base, method: 'top-down', fixedTotal: 1200, targetMargin: 0.4 });
  assert.equal(c.belowTarget, true); // 1,075 cost on a 1,200 fee
});

test('hours for a fee hit the target margin exactly', () => {
  const rates = { Senior: 45, Junior: 20 };
  const h = hoursForFee(10000, { Senior: 0.5, Junior: 0.5 }, rates, 0.35);
  // Budget 6,500 at a blended 32.5/h = 200 hours, split evenly.
  assert.deepEqual(h, { Senior: 100, Junior: 100 });
  assert.deepEqual(hoursForFee(0, { Senior: 1 }, rates, 0.35), {});
});

test('templates plan hours that land on the target margin', () => {
  const s = { rateCards: [DEFAULT_RATE_CARD], staff: [] };
  const tpl = DEFAULT_FEE_TEMPLATES[0];
  const est = { rateCardId: DEFAULT_RATE_CARD.id, startDate: '2026-11-02', method: 'top-down', constructionCost: 1000000, feePct: 4, targetMargin: tpl.targetMargin, stages: [] };
  est.stages = templateStages(s, est, tpl);
  assert.equal(est.stages.length, tpl.stages.length);
  const c = costEstimate(s, est);
  assert.equal(c.fee, 40000);
  assert.ok(Math.abs(c.margin - tpl.targetMargin) < 0.01, `margin ${c.margin}`);
  for (const t of DEFAULT_FEE_TEMPLATES) {
    assert.equal(t.stages.reduce((a, x) => a + x.pct, 0), 100, t.name);
    for (const st of t.stages) assert.ok(Math.abs(Object.values(st.mix).reduce((a, b) => a + b, 0) - 1) < 1e-9, `${t.name}: ${st.name}`);
  }
});

test('an estimate becomes project stages and monthly planned billing', () => {
  const est = { ...base, method: 'top-down', constructionCost: 0, fixedTotal: 9000 };
  const out = estimateToProject(state, est);
  assert.equal(out.stages.length, 2);
  assert.deepEqual(out.stages.map((s) => [s.fee, s.budgetHours, s.startDate, s.weeks]), [[5400, 30, '2026-11-02', 4], [3600, 5, '2026-11-30', 2]]);
  assert.deepEqual(out.stages[0].hoursByGrade, { Senior: 10, Junior: 20 });
  // Design (Nov) bills in November; Site spans Nov 30–Dec 13 so bills across both months.
  const byStage = (i) => out.schedule.filter((x) => x.stageId === out.stages[i].id).map((x) => [x.month, x.amount]);
  assert.deepEqual(byStage(0), [['2026-11', 5400]]);
  assert.deepEqual(byStage(1), [['2026-11', 1800], ['2026-12', 1800]]);
  assert.equal(out.schedule.reduce((a, x) => a + x.amount, 0), 9000);
});

test('benchmark averages similar projects with earned value', () => {
  const rows = [
    { p: { sector: 'Residential' }, f: { earned: 100, cost: 40, fee: 1000, budgetHours: 10 } },
    { p: { sector: 'Residential' }, f: { earned: 300, cost: 200, fee: 3000, budgetHours: 30 } },
    { p: { sector: 'Commercial' }, f: { earned: 999, cost: 1, fee: 5, budgetHours: 1 } },
  ];
  const b = benchmark(rows, 'Residential');
  assert.equal(b.count, 2);
  assert.equal(b.avgFee, 2000);
  assert.equal(b.margin, 0.4);
  assert.equal(b.hoursPer1k, 10);
  assert.equal(benchmark(rows, 'Heritage'), null);
});
