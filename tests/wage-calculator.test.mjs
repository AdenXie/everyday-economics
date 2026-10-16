import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildWageSeries, calculateWageChange, currentPeriod, defaultRange, convertPeriod, groupAmountInput,
  parseAmount, readWageParams, resolvePeriod, verdictFor, wageShareUrl, WAGE_REGIONS, LATEST,
} from "../src/wage-calculator.js";

const load = file => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"));
const data = { quarterly: load("quarterly.json"), worldBank: load("worldbank.json"), china: load("china-nbs.json") };
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

test("Australia uses quarterly ABS CPI A2325846C and reports WPI only as a reference", () => {
  const series = buildWageSeries("AUS", data);
  assert.equal(series.kind, "quarterly");
  assert.equal(data.quarterly.series.cpi.seriesId, "A2325846C");
  const result = calculateWageChange(series, { start: "2019-Q4", end: "2026-Q2", startWage: "70,000", endWage: "85000" });
  assert.equal(result.ok, true);
  assert.equal(result.startCpi, 80.7);
  assert.equal(result.endCpi, 102.31);
  close(result.nominalPct, (85000 / 70000 - 1) * 100);
  close(result.cpiPct, (102.31 / 80.7 - 1) * 100);
  close(result.realPct, ((85000 / 70000) / (102.31 / 80.7) - 1) * 100);
  close(result.requiredEndWage, 70000 * 102.31 / 80.7, 1e-6);
  close(result.gapAmount, 85000 - 70000 * 102.31 / 80.7, 1e-6);
  assert.equal(result.verdict, "behind");
  assert.equal(result.reference, "wpi");
  close(result.referencePct, (161.2 / 133.5 - 1) * 100);
  assert.equal(result.approximate, false);
  assert.equal(result.path.length, 27);
  assert.equal(result.path[0].needed, 70000);
  close(result.path.at(-1).needed, result.requiredEndWage, 1e-6);
  assert.equal(result.path.at(-1).wage, 85000);
});

test("China uses NBS annual CPI, disposable income as a reference and marks results approximate", () => {
  const series = buildWageSeries("CHN", data);
  assert.equal(series.kind, "annual");
  assert.deepEqual([series.first, series.last], [2013, 2025]);
  const rows = Object.fromEntries(data.china.observations.map(row => [row.year, row]));
  const result = calculateWageChange(series, { start: 2015, end: 2025, startWage: 60000, endWage: 96000 });
  close(result.cpiRatio, rows[2025].cpi / rows[2015].cpi);
  close(result.realPct, (1.6 / (rows[2025].cpi / rows[2015].cpi) - 1) * 100);
  assert.equal(result.verdict, "ahead");
  assert.equal(result.reference, "disposableIncome");
  close(result.referencePct, (rows[2025].disposableIncome / rows[2015].disposableIncome - 1) * 100);
  assert.equal(result.approximate, true);
});

test("other economies use World Bank annual CPI and offer no pay reference", () => {
  for (const region of WAGE_REGIONS.filter(code => !["AUS", "CHN"].includes(code))) {
    const series = buildWageSeries(region, data);
    const country = data.worldBank.countries.find(entry => entry.iso3 === region);
    assert.equal(series.last, country.lastYear);
    const result = calculateWageChange(series, { start: series.last - 1, end: series.last, startWage: 100, endWage: 100 });
    assert.equal(result.reference, null);
    assert.equal(result.referencePct, null);
    const [previous, last] = country.observations.slice(-2);
    close(result.cpiPct, (last.cpi / previous.cpi - 1) * 100);
  }
});

test("the first and last published periods are valid boundaries", () => {
  const aus = buildWageSeries("AUS", data);
  const full = calculateWageChange(aus, { start: aus.first, end: aus.last, startWage: 1, endWage: 2 });
  assert.equal(full.ok, true);
  assert.equal(full.path.length, data.quarterly.observationCount);
  const single = calculateWageChange(aus, { start: "2026-Q1", end: "2026-Q2", startWage: 100, endWage: 100 });
  close(single.cpiPct, (102.31 / 101.7 - 1) * 100);
  assert.equal(single.path.length, 2);
  const china = buildWageSeries("CHN", data);
  assert.equal(calculateWageChange(china, { start: 2013, end: 2025, startWage: 1, endWage: 1 }).ok, true);
});

test("'now' and later periods stop at the latest published observation and say so", () => {
  const aus = buildWageSeries("AUS", data);
  const october = new Date(2026, 9, 16);
  assert.equal(currentPeriod("quarterly", october), "2026-Q4");
  assert.equal(currentPeriod("annual", october), 2026);
  assert.deepEqual(resolvePeriod(aus, LATEST, october), { period: "2026-Q2", requested: "2026-Q4", status: "afterLast" });
  assert.deepEqual(resolvePeriod(aus, "2030-Q1", october), { period: "2026-Q2", requested: "2030-Q1", status: "afterLast" });
  assert.deepEqual(resolvePeriod(aus, "2026-Q2", october), { period: "2026-Q2", requested: "2026-Q2", status: "exact" });
  assert.deepEqual(resolvePeriod(aus, LATEST, new Date(2026, 5, 1)), { period: "2026-Q2", requested: "2026-Q2", status: "exact" });
  assert.deepEqual(resolvePeriod(aus, "1990-Q1", october), { period: "1997-Q3", requested: "1990-Q1", status: "beforeFirst" });
  assert.equal(resolvePeriod(aus, "2020-Q5", october).status, "invalid");
  assert.equal(resolvePeriod(aus, "2020", october).status, "invalid");

  const china = buildWageSeries("CHN", data);
  assert.deepEqual(resolvePeriod(china, LATEST, october), { period: 2025, requested: 2026, status: "afterLast" });
  assert.deepEqual(resolvePeriod(china, "2010", october), { period: 2013, requested: 2010, status: "beforeFirst" });
  const usa = buildWageSeries("USA", data);
  assert.deepEqual(resolvePeriod(usa, LATEST, october), { period: 2024, requested: 2026, status: "afterLast" });
  assert.equal(resolvePeriod(usa, "2019-Q4", october).status, "invalid");
});

test("inputs are validated: positive amounts and a start before the end", () => {
  const aus = buildWageSeries("AUS", data);
  const base = { start: "2019-Q4", end: "2026-Q2", startWage: 70000, endWage: 85000 };
  for (const startWage of [0, -5, "", "abc", "1.2.3", "-70,000", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(calculateWageChange(aus, { ...base, startWage }), { ok: false, error: "startWage" }, String(startWage));
  }
  assert.deepEqual(calculateWageChange(aus, { ...base, endWage: 0 }), { ok: false, error: "endWage" });
  assert.deepEqual(calculateWageChange(aus, { ...base, start: "2026-Q2", end: "2019-Q4" }), { ok: false, error: "order" });
  assert.deepEqual(calculateWageChange(aus, { ...base, start: "2026-Q2", end: "2026-Q2" }), { ok: false, error: "order" });
  assert.deepEqual(calculateWageChange(aus, { ...base, end: "2026-Q4" }), { ok: false, error: "period" });
  assert.deepEqual(calculateWageChange(aus, { ...base, start: 2019 }), { ok: false, error: "period" });
});

test("amount parsing and live grouping accept common formats", () => {
  assert.equal(parseAmount("70,000"), 70000);
  assert.equal(parseAmount(" 70 000 "), 70000);
  assert.equal(parseAmount("７００００"), 70000);
  assert.equal(parseAmount("70，000.5"), 70000.5);
  assert.equal(parseAmount("−5"), -5);
  assert.ok(Number.isNaN(parseAmount("A$70k")));
  assert.deepEqual(groupAmountInput("70000"), { value: "70,000", caret: 6 });
  assert.deepEqual(groupAmountInput("7,0000", 3), { value: "70,000", caret: 2 });
  assert.deepEqual(groupAmountInput("1234567.891"), { value: "1,234,567.89", caret: 12 });
  assert.deepEqual(groupAmountInput("abc"), { value: "", caret: 0 });
  assert.deepEqual(groupAmountInput("0085"), { value: "85", caret: 2 });
});

test("verdict treats changes within ±1% (as displayed) as roughly level", () => {
  assert.equal(verdictFor(0), "flat");
  assert.equal(verdictFor(0.94), "flat");
  assert.equal(verdictFor(0.96), "ahead");
  assert.equal(verdictFor(1), "ahead");
  assert.equal(verdictFor(-0.94), "flat");
  assert.equal(verdictFor(-1.04), "behind");
});

test("defaults and region switches stay inside each source", () => {
  assert.deepEqual(defaultRange(buildWageSeries("AUS", data)), { start: "2021-Q2", end: LATEST });
  assert.deepEqual(defaultRange(buildWageSeries("CHN", data)), { start: 2020, end: LATEST });
  assert.equal(convertPeriod("2019-Q4", "annual"), 2019);
  assert.equal(convertPeriod(2019, "quarterly"), "2019-Q4");
  assert.equal(convertPeriod(LATEST, "annual"), LATEST);
});

test("share links contain only the region and periods", () => {
  const link = wageShareUrl("https://example.org/en/?start=2000-Q1&salary=70000#top", { region: "AUS", start: "2019-Q4", end: "2026-Q2" });
  const url = new URL(link);
  assert.deepEqual([...url.searchParams.keys()], ["view", "wageRegion", "wageFrom", "wageTo"]);
  assert.equal(url.pathname, "/en/");
  assert.equal(url.hash, "");
  assert.doesNotMatch(link, /70000|85000|salary/);
  assert.deepEqual(readWageParams(url.search), { region: "AUS", from: "2019-Q4", to: "2026-Q2" });
  assert.equal(readWageParams("?wageRegion=XXX").region, null);
});
