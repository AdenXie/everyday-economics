import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateYearWindow, compareCountries, comparisonScale } from "../src/analysis.js";

const snapshot = JSON.parse(await readFile(new URL("../data/worldbank.json", import.meta.url), "utf8"));
const byIso = Object.fromEntries(snapshot.countries.map((country) => [country.iso3, country]));

for (const iso3 of ["AUS", "DEU", "GBR", "RUS", "CAN"]) {
  test(`${iso3} annual window rebases CPI and nominal GDP per capita to 100`, () => {
    const result = calculateYearWindow(byIso[iso3].observations, 2000, 2024);
    assert.equal(result.rows[0].cpiNormalized, 100);
    assert.equal(result.rows[0].incomeNormalized, 100);
    const cpiRatio = result.end.cpi / result.start.cpi;
    const incomeRatio = result.end.gdpPerCapita / result.start.gdpPerCapita;
    assert.ok(Math.abs(result.cpiGrowthPct - (cpiRatio - 1) * 100) < 1e-10);
    assert.ok(Math.abs(result.incomeGrowthPct - (incomeRatio - 1) * 100) < 1e-10);
    assert.ok(Math.abs(result.differencePp - (result.incomeGrowthPct - result.cpiGrowthPct)) < 1e-10);
    assert.ok(Math.abs(result.cpiDeflatedIncomeGrowthPct - ((incomeRatio / cpiRatio) - 1) * 100) < 1e-10);
  });
}

test("CPI-deflated change is a ratio, not the percentage-point gap", () => {
  const rows = [{ year: 1, cpi: 100, gdpPerCapita: 100 }, { year: 2, cpi: 200, gdpPerCapita: 300 }];
  const result = calculateYearWindow(rows, 1, 2);
  assert.equal(result.differencePp, 100);
  assert.equal(result.cpiDeflatedIncomeGrowthPct, 50);
});

test("comparison marks countries without data for the whole window", () => {
  const rows = compareCountries(snapshot.countries, 1980, snapshot.commonLastYear);
  const china = rows.find((row) => row.iso3 === "CHN");
  assert.equal(china.available, false);
  assert.equal(rows.find((row) => row.iso3 === "KOR").available, true);
  assert.equal(rows.find((row) => row.iso3 === "DEU").available, true);
  assert.equal(rows.find((row) => row.iso3 === "GBR").available, true);
  assert.equal(rows.find((row) => row.iso3 === "RUS").available, false);
  assert.equal(rows.find((row) => row.iso3 === "CAN").available, true);
  assert.equal(rows.length, 10);
  assert.ok(compareCountries(snapshot.countries, snapshot.commonFirstYear, snapshot.commonLastYear).every((row) => row.available));
});

test("reversed or missing years are rejected", () => {
  assert.throws(() => calculateYearWindow(byIso.JPN.observations, 2024, 2000), RangeError);
  assert.throws(() => calculateYearWindow(byIso.CHN.observations, 1970, 2000), RangeError);
});

test("extreme historical growth does not hide other economies or alter the figures", () => {
  const rows = compareCountries(snapshot.countries, 1992, 2024);
  const figures = rows.flatMap(row => [row.cpiGrowthPct, row.incomeGrowthPct]);
  const scale = comparisonScale(figures);
  assert.equal(scale.compressed, true);
  const canada = rows.find(row => row.iso3 === "CAN");
  const russia = rows.find(row => row.iso3 === "RUS");
  assert.ok(scale.width(canada.incomeGrowthPct) > 20, "Canada remains visible beside Russia's early inflation");
  assert.ok(scale.width(canada.incomeGrowthPct) < scale.width(russia.incomeGrowthPct));
  assert.ok(russia.incomeGrowthPct > 1000000, "the source-derived percentage is retained");
  const linear = comparisonScale([-10, 0, 20]);
  assert.equal(linear.compressed, false);
  assert.ok(Math.abs(linear.zero - 100 / 3) < 1e-10);
  assert.ok(Math.abs(linear.width(20) / linear.width(-10) - 2) < 1e-10);
  const signed = comparisonScale([-50, 1000000]);
  assert.ok(signed.zero > 0 && signed.zero < 100);
  assert.ok(signed.width(-50) > 0);
  assert.equal(comparisonScale([0, 0]).width(0), 0);
});
