import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateYearWindow, compareCountries } from "../src/analysis.js";

const snapshot = JSON.parse(await readFile(new URL("../data/worldbank.json", import.meta.url), "utf8"));
const byIso = Object.fromEntries(snapshot.countries.map((country) => [country.iso3, country]));

test("annual window rebases CPI and nominal GDP per capita to 100", () => {
  const result = calculateYearWindow(byIso.AUS.observations, 2000, 2024);
  assert.equal(result.rows[0].cpiNormalized, 100);
  assert.equal(result.rows[0].incomeNormalized, 100);
  const cpiRatio = result.end.cpi / result.start.cpi;
  const incomeRatio = result.end.gdpPerCapita / result.start.gdpPerCapita;
  assert.ok(Math.abs(result.cpiGrowthPct - (cpiRatio - 1) * 100) < 1e-10);
  assert.ok(Math.abs(result.incomeGrowthPct - (incomeRatio - 1) * 100) < 1e-10);
  assert.ok(Math.abs(result.differencePp - (result.incomeGrowthPct - result.cpiGrowthPct)) < 1e-10);
  assert.ok(Math.abs(result.cpiDeflatedIncomeGrowthPct - ((incomeRatio / cpiRatio) - 1) * 100) < 1e-10);
});

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
  assert.ok(compareCountries(snapshot.countries, snapshot.commonFirstYear, snapshot.commonLastYear).every((row) => row.available));
});

test("reversed or missing years are rejected", () => {
  assert.throws(() => calculateYearWindow(byIso.JPN.observations, 2024, 2000), RangeError);
  assert.throws(() => calculateYearWindow(byIso.CHN.observations, 1970, 2000), RangeError);
});
