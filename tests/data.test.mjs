import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateWindow, formatQuarter } from "../src/analysis.js";

const snapshot = JSON.parse(await readFile(new URL("../data/quarterly.json", import.meta.url), "utf8"));

test("selected period rebases both series to 100 and derives the CPI amount", () => {
  const result = calculateWindow(snapshot.observations, "2000-Q1", "2026-Q2");
  assert.equal(result.rows[0].cpiNormalized, 100);
  assert.equal(result.rows[0].wpiNormalized, 100);
  assert.ok(Math.abs(result.cpiIndexed100 - (100 * result.end.cpiIndex) / result.start.cpiIndex) < 1e-10);
  assert.ok(Math.abs(result.differencePp - (result.wpiGrowthPct - result.cpiGrowthPct)) < 1e-10);
});

test("a one-quarter window shows no change", () => {
  const result = calculateWindow(snapshot.observations, "2026-Q2", "2026-Q2");
  assert.equal(result.rows.length, 1);
  assert.equal(result.cpiGrowthPct, 0);
  assert.equal(result.wpiGrowthPct, 0);
  assert.equal(result.cpiIndexed100, 100);
});

test("invalid or reversed date selections are rejected", () => {
  assert.throws(() => calculateWindow(snapshot.observations, "2026-Q3", "2026-Q2"), RangeError);
  assert.throws(() => calculateWindow(snapshot.observations, "1990-Q1", "2026-Q2"), RangeError);
});

test("quarter labels stay clear and sortable", () => {
  assert.equal(formatQuarter("2026-Q2"), "2026 Q2");
});
