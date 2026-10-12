import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildChinaSnapshot } from "../tools/extract_china.mjs";
import { mapChinaObservations } from "../src/china.js";
import { calculateYearWindow } from "../src/analysis.js";

const snapshot = JSON.parse(readFileSync(new URL("../data/china-nbs.json", import.meta.url), "utf8"));

test("manual NBS snapshot rebuilds exactly and joins annual rather than December CPI", () => {
  assert.deepEqual(snapshot, buildChinaSnapshot());
  assert.equal(snapshot.firstYear, 2013);
  assert.equal(snapshot.lastYear, 2025);
  assert.equal(snapshot.observations.length, 13);
  assert.equal(snapshot.observations[0].cpi, 100);
  assert.equal(snapshot.observations.at(-1).cpiPreviousYear, 100);
  assert.equal(snapshot.observations.at(-1).cpi, snapshot.observations.at(-2).cpi);
  assert.equal(snapshot.observations.at(-1).disposableIncome, 43377);
  assert.equal(snapshot.observations.at(-1).wageIncome, 24555);
  assert.equal(snapshot.observations[0].wageIncome, 10410.8);
});

test("both China income selections use nominal source levels and a CPI ratio", () => {
  for (const field of ["disposableIncome", "wageIncome"]) {
    const rows = mapChinaObservations(snapshot, field);
    const full = calculateYearWindow(rows, 2013, 2025);
    const ratio = (snapshot.observations.at(-1)[field] / snapshot.observations[0][field])
      / (709.4 / 594.8);
    assert.ok(Math.abs(full.cpiDeflatedIncomeGrowthPct - (ratio - 1) * 100) < 1e-9);
    assert.equal(full.rows[0].incomeNormalized, 100);
    assert.equal(rows[0].gdpPerCapita, snapshot.observations[0][field]);
    const oneYear = calculateYearWindow(rows, 2025, 2025);
    assert.equal(oneYear.cpiGrowthPct, 0);
    assert.equal(oneYear.incomeGrowthPct, 0);
  }
  assert.throws(() => mapChinaObservations(snapshot, "gdp"), RangeError);
});
