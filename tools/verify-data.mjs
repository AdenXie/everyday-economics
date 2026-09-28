import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateWindow } from "../src/analysis.js";

const snapshot = JSON.parse(await readFile(new URL("../data/quarterly.json", import.meta.url), "utf8"));
const rows = snapshot.observations;

assert.equal(snapshot.snapshotDate, "2026-09-28", "snapshot preparation date must be explicit");
assert.equal(snapshot.firstQuarter, "1997-Q3");
assert.equal(snapshot.latestQuarter, "2026-Q2");
assert.equal(snapshot.observationCount, 116);
assert.equal(rows.length, snapshot.observationCount);
assert.equal(snapshot.series.cpi.seriesId, "A2325846C");
assert.equal(snapshot.series.wpi.seriesId, "A2603609J");
assert.equal(snapshot.series.cpi.seriesType, "Original");
assert.equal(snapshot.series.wpi.seriesType, "Original");
assert.match(snapshot.series.wpi.scope, /excluding bonuses/);
assert.equal(rows.at(-1).period, "2026-Q2");
assert.equal(rows.at(-1).cpiIndex, 102.31);
assert.equal(rows.at(-1).wpiIndex, 161.2);

const uniquePeriods = new Set(rows.map((row) => row.period));
assert.equal(uniquePeriods.size, rows.length, "quarter labels must be unique");

for (let index = 0; index < rows.length; index += 1) {
  const row = rows[index];
  assert.ok(Number.isFinite(row.cpiIndex) && row.cpiIndex > 0, `valid CPI index at ${row.period}`);
  assert.ok(Number.isFinite(row.wpiIndex) && row.wpiIndex > 0, `valid WPI index at ${row.period}`);
  if (index > 0) {
    const previous = rows[index - 1];
    const [year, quarter] = previous.period.split("-Q").map(Number);
    const expected = quarter === 4 ? `${year + 1}-Q1` : `${year}-Q${quarter + 1}`;
    assert.equal(row.period, expected, `no missing or out-of-order quarter after ${previous.period}`);
    const cpiMovement = ((row.cpiIndex / previous.cpiIndex) - 1) * 100;
    const wpiMovement = ((row.wpiIndex / previous.wpiIndex) - 1) * 100;
    assert.ok(Math.abs(cpiMovement - row.cpiQuarterChangePct) < 0.16, `CPI index movement reconciles with published rounded movement at ${row.period}`);
    assert.ok(Math.abs(wpiMovement - row.wpiQuarterChangePct) < 0.16, `WPI index movement reconciles with published rounded movement at ${row.period}`);
  }
}

const fullWindow = calculateWindow(rows, rows[0].period, rows.at(-1).period);
assert.equal(fullWindow.rows[0].cpiNormalized, 100);
assert.equal(fullWindow.rows[0].wpiNormalized, 100);
assert.ok(Math.abs(fullWindow.cpiIndexed100 - (100 * rows.at(-1).cpiIndex) / rows[0].cpiIndex) < 1e-10);

console.log(`Verified ${rows.length} aligned original quarterly observations (${snapshot.firstQuarter} to ${snapshot.latestQuarter}).`);
console.log(`Latest source indices: CPI ${rows.at(-1).cpiIndex}; WPI ${rows.at(-1).wpiIndex}.`);
console.log(`Full-span growth from published index levels: CPI ${fullWindow.cpiGrowthPct.toFixed(1)}%; WPI ${fullWindow.wpiGrowthPct.toFixed(1)}%.`);
