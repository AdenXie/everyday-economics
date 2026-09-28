import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { calculateWindow } from "../src/analysis.js";

const snapshot = JSON.parse(await readFile(new URL("../data/quarterly.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../data/source-manifest.json", import.meta.url), "utf8"));
const rows = snapshot.observations;

assert.equal(snapshot.snapshotDate, manifest.preparedOn, "snapshot date must match the source manifest");
assert.equal(snapshot.firstQuarter, "1997-Q3");
assert.ok(snapshot.observationCount >= 116, "the verified historical range must be retained");
assert.equal(rows.length, snapshot.observationCount);
assert.equal(snapshot.latestQuarter, rows.at(-1).period);
assert.equal(snapshot.series.cpi.seriesId, "A2325846C");
assert.equal(snapshot.series.wpi.seriesId, "A2603609J");
assert.equal(manifest.cpi.indexSeriesId, "A2325846C");
assert.equal(manifest.wpi.indexSeriesId, "A2603609J");
assert.equal(snapshot.series.cpi.seriesType, "Original");
assert.equal(snapshot.series.wpi.seriesType, "Original");
assert.equal(snapshot.series.cpi.sourceWorkbook, manifest.cpi.workbook);
assert.equal(snapshot.series.wpi.sourceWorkbook, manifest.wpi.workbook);
assert.match(snapshot.series.wpi.scope, /excluding bonuses/);

for (const key of ["cpi", "wpi"]) {
  const source = manifest[key];
  const workbook = await readFile(new URL(`../${source.workbook}`, import.meta.url));
  const digest = createHash("sha256").update(workbook).digest("hex").toUpperCase();
  assert.equal(digest, source.sha256, `${key} workbook must match its recorded SHA-256`);
  assert.equal(snapshot.series[key].sourceSha256, source.sha256);
  assert.equal(snapshot.series[key].releaseDate, source.releaseDate);
  assert.equal(snapshot.series[key].pageUrl, source.pageUrl);
}

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

// World Bank annual snapshot: rebuild from the checksummed source extracts and require an exact match.
const { buildSnapshot } = await import("./extract_worldbank.mjs");
const { calculateYearWindow } = await import("../src/analysis.js");
const worldBank = JSON.parse(await readFile(new URL("../data/worldbank.json", import.meta.url), "utf8"));
assert.deepEqual(worldBank, buildSnapshot(), "data/worldbank.json must match a rebuild from data/sources (run node tools/extract_worldbank.mjs)");
assert.deepEqual(worldBank.countries.map((country) => country.iso3), ["AUS", "USA", "KOR", "JPN", "SGP", "CHN"]);
assert.equal(worldBank.indicators.cpi.id, "FP.CPI.TOTL");
assert.equal(worldBank.indicators.income.id, "NY.GDP.PCAP.CN");
for (const country of worldBank.countries) {
  const years = country.observations.map((row) => row.year);
  assert.equal(years[0], country.firstYear);
  assert.equal(years.at(-1), country.lastYear);
  years.forEach((year, index) => assert.equal(year, country.firstYear + index, `${country.iso3} years must be continuous`));
  for (const row of country.observations) {
    assert.ok(Number.isFinite(row.cpi) && row.cpi > 0, `${country.iso3} CPI ${row.year}`);
    assert.ok(Number.isFinite(row.gdpPerCapita) && row.gdpPerCapita > 0, `${country.iso3} GDP per capita ${row.year}`);
  }
  const cpi2010 = country.observations.find((row) => row.year === 2010)?.cpi;
  assert.ok(Math.abs(cpi2010 - 100) < 1e-9, `${country.iso3} CPI must equal 100 in the 2010 reference year`);
  const full = calculateYearWindow(country.observations, country.firstYear, country.lastYear);
  console.log(`World Bank ${country.iso3}: ${country.firstYear}–${country.lastYear}; CPI ${full.cpiGrowthPct.toFixed(1)}%, nominal GDP per capita ${full.incomeGrowthPct.toFixed(1)}%.`);
}
console.log(`World Bank common range ${worldBank.commonFirstYear}–${worldBank.commonLastYear}; source checksums verified.`);
