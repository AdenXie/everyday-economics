// Rebuild the manually collected NBS topic. This does not fetch or refresh data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function buildChinaSnapshot() {
  const source = JSON.parse(readFileSync(path.join(root, "data/sources/china-nbs-annual.json"), "utf8"));
  const rows = source.observations;
  const hash = createHash("sha256").update(JSON.stringify(rows)).digest("hex").toUpperCase();
  assert.equal(hash, source.canonicalSha256, "NBS source values must match their recorded checksum");
  assert.ok(rows.length >= 2);
  assert.equal(rows[0].year, 2013, "retain the unified household-survey baseline");
  const sourceIds = new Set(source.sources.map(item => item.id));
  for (const item of source.sources) {
    assert.equal(new URL(item.url).hostname, "www.stats.gov.cn");
    assert.equal(new URL(item.url).protocol, "https:");
  }
  const base = rows[0].cpi1978;
  assert.ok(Number.isFinite(base) && base > 0);
  let priceLevel = base;
  const observations = rows.map((row, index) => {
    assert.equal(row.year, 2013 + index, "NBS annual years must be continuous");
    for (const key of ["cpiPreviousYear", "disposableIncome", "wageIncome"]) {
      assert.ok(Number.isFinite(row[key]) && row[key] > 0, `valid ${key} at ${row.year}`);
    }
    for (const key of ["cpiSource", "disposableSource", "wageSource"]) assert.ok(sourceIds.has(row[key]));
    if (row.cpi1978 === null) {
      assert.ok(index > 0, "a CPI extension needs a preceding price level");
      priceLevel *= row.cpiPreviousYear / 100;
    } else {
      assert.ok(Number.isFinite(row.cpi1978) && row.cpi1978 > 0);
      if (index) assert.ok(Math.abs((row.cpi1978 / priceLevel) * 100 - row.cpiPreviousYear) < 0.12, "CPI levels must reconcile with rounded annual movements");
      priceLevel = row.cpi1978;
    }
    return {
      year: row.year,
      cpi: (priceLevel / base) * 100,
      cpiPreviousYear: row.cpiPreviousYear,
      disposableIncome: row.disposableIncome,
      wageIncome: row.wageIncome,
    };
  });
  return {
    snapshotDate: source.retrievedOn,
    frequency: "Annual",
    scope: source.scope,
    firstYear: observations[0].year,
    lastYear: observations.at(-1).year,
    cpiMethod: "Rebase published national fixed-base CPI (1978=100) to 2013=100; extend 2025 using the published rounded annual change of 0.0%. CPI-adjusted results are approximate.",
    incomeMethod: "Nominal annual household income per resident, not employee average earnings or a fixed-job wage price index.",
    sourceFile: "data/sources/china-nbs-annual.json",
    sourceSha256: hash,
    sources: source.sources,
    observations,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const snapshot = buildChinaSnapshot();
  writeFileSync(path.join(root, "data/china-nbs.json"), JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`NBS China: ${snapshot.firstYear}–${snapshot.lastYear}; ${snapshot.observations.length} annual observations.`);
}
