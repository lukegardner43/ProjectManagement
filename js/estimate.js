// Fee estimates: price a job top-down (construction cost × fee %, or a lump
// sum, split across stages by percentage) or bottom-up (hours by grade × the
// rate card), and see the margin the fee yields against cost rates.
// Pure functions of state, unit tested in tests/estimate.test.js.

import { sum, addDays, addMonths, monthKey, uid, round2 } from './util.js';

export function rateCard(state, id) {
  return (state.rateCards || []).find((r) => r.id === id) || state.rateCards?.[0] || { id: null, name: 'No rate card', rates: {} };
}

// Average cost rate of the people holding each grade. A grade nobody holds
// is costed at 45% of its charge rate.
export function gradeCostRates(state, rc) {
  const out = {};
  for (const g of Object.keys(rc.rates)) {
    const people = state.staff.filter((s) => s.grade === g && s.active !== false && s.costRate > 0);
    out[g] = people.length ? sum(people, (p) => p.costRate) / people.length : rc.rates[g] * 0.45;
  }
  return out;
}

export const topDownTotal = (est) => (est.constructionCost > 0 ? (est.constructionCost * (est.feePct || 0)) / 100 : est.fixedTotal || 0);

export function costEstimate(state, est) {
  const rc = rateCard(state, est.rateCardId);
  const costRates = gradeCostRates(state, rc);
  const grades = Object.keys(rc.rates);
  const total = topDownTotal(est);
  let next = est.startDate;
  const stages = est.stages.map((st) => {
    const h = (g) => Number(st.hours?.[g]) || 0;
    const hours = sum(grades, h);
    const value = sum(grades, (g) => h(g) * rc.rates[g]);
    const cost = sum(grades, (g) => h(g) * costRates[g]);
    const fee = est.method === 'bottom-up' ? value : st.feeOverride ?? (total * (st.pct || 0)) / 100;
    const start = next;
    const end = addDays(start, Math.max(1, st.weeks || 1) * 7 - 1);
    next = addDays(end, 1);
    // st.hours stays the per-grade object; totalHours is its sum.
    return { ...st, totalHours: hours, value, cost, fee, margin: fee > 0 ? (fee - cost) / fee : null, start, end };
  });
  const fee = sum(stages, (s) => s.fee);
  const cost = sum(stages, (s) => s.cost);
  const margin = fee > 0 ? (fee - cost) / fee : null;
  return {
    stages, grades, rates: rc.rates, costRates, total, fee, cost,
    hours: sum(stages, (s) => s.totalHours),
    value: sum(stages, (s) => s.value),
    margin,
    pctTotal: sum(est.stages, (s) => Number(s.pct) || 0),
    // Half-hour rounding of planned hours can land a hair under target; ignore that.
    belowTarget: margin !== null && margin < (est.targetMargin ?? 0) - 0.005,
    end: stages.length ? stages[stages.length - 1].end : est.startDate,
  };
}

// Hours a stage fee can buy, split by the template's grade mix, so the stage
// lands exactly on the target margin. The starting point for bottom-up checks.
export function hoursForFee(fee, mix, costRates, targetMargin) {
  const entries = Object.entries(mix || {}).filter(([, share]) => share > 0);
  const blended = sum(entries, ([g, share]) => share * (costRates[g] || 0));
  if (!blended || fee <= 0) return {};
  const totalHours = (fee * (1 - targetMargin)) / blended;
  return Object.fromEntries(entries.map(([g, share]) => [g, Math.round(totalHours * share * 2) / 2]));
}

export function templateStages(state, est, template) {
  const rc = rateCard(state, est.rateCardId);
  const costRates = gradeCostRates(state, rc);
  const total = topDownTotal(est);
  const target = template.targetMargin ?? est.targetMargin ?? 0.35;
  return template.stages.map((ts) => ({
    id: uid('es'), name: ts.name, feeType: ts.feeType || 'Fixed', weeks: ts.weeks || 4, pct: ts.pct || 0, feeOverride: null,
    hours: hoursForFee((total * (ts.pct || 0)) / 100, ts.mix, costRates, target),
  }));
}

// How similar work has actually gone: projects in the same sector with
// earned value, their average fee and achieved margin.
export function benchmark(projectsWithFin, sector) {
  const similar = projectsWithFin.filter((x) => x.p.sector === sector && !x.p.internal && x.f.earned > 0);
  if (!similar.length) return null;
  const earned = sum(similar, (x) => x.f.earned);
  return {
    count: similar.length,
    avgFee: sum(similar, (x) => x.f.fee) / similar.length,
    margin: earned ? (earned - sum(similar, (x) => x.f.cost)) / earned : null,
    hoursPer1k: sum(similar, (x) => x.f.fee) ? sum(similar, (x) => x.f.budgetHours) / (sum(similar, (x) => x.f.fee) / 1000) : null,
  };
}

// Project stages and planned billing from an estimate: each stage's fee is
// billed evenly across the calendar months its dates span.
export function estimateToProject(state, est) {
  const c = costEstimate(state, est);
  const stages = [];
  const schedule = [];
  for (const s of c.stages) {
    const id = uid('stg');
    stages.push({
      id, name: s.name, feeType: s.feeType, fee: round2(s.fee), budgetHours: Math.round(s.totalHours * 2) / 2 || Math.round(s.fee / 85),
      percentComplete: 0, startDate: s.start, weeks: s.weeks,
      hoursByGrade: Object.fromEntries(Object.entries(s.hours || {}).map(([g, h]) => [g, Number(h) || 0]).filter(([, h]) => h > 0)),
    });
    const months = [];
    for (let m = monthKey(s.start); m <= monthKey(s.end); m = addMonths(m, 1)) months.push(m);
    const each = Math.round(s.fee / months.length);
    months.forEach((m, i) => schedule.push({ id: uid('sch'), stageId: id, month: m, amount: i === months.length - 1 ? Math.round(s.fee - each * (months.length - 1)) : each }));
  }
  return { stages, schedule, fee: c.fee };
}

export function stageEnd(stage) {
  return stage.startDate ? addDays(stage.startDate, Math.max(1, stage.weeks || 1) * 7 - 1) : null;
}
