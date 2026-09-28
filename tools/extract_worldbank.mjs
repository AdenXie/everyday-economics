// Build data/worldbank.json from the World Bank WDI extracts kept in data/sources.
// Each source file stores the non-null API values plus a canonical SHA-256 that was
// computed on the original API response at retrieval time. This script refuses to run
// if the stored values no longer match that checksum.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "data/worldbank-manifest.json"), "utf8"));

export function canonicalSha256(series) {
  const lines = Object.keys(series).sort().flatMap((iso3) => Object.keys(series[iso3]).sort()
    .map((year) => `${iso3}:${year}:${JSON.stringify(series[iso3][year])}`));
  return createHash("sha256").update(lines.join("\n")).digest("hex").toUpperCase();
}

export function loadSource(relativePath, expectedIndicator) {
  const source = JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
  if (source.indicatorId !== expectedIndicator) throw new Error(`${relativePath} holds ${source.indicatorId}, expected ${expectedIndicator}`);
  const actual = canonicalSha256(source.series);
  if (actual !== source.canonicalSha256) throw new Error(`Checksum mismatch in ${relativePath}: ${actual}`);
  return source;
}

export function buildSnapshot() {
  const cpi = loadSource(manifest.indicators.cpi.file, manifest.indicators.cpi.id);
  const income = loadSource(manifest.indicators.income.file, manifest.indicators.income.id);

  const countries = manifest.countries.map((iso3) => {
    const cpiSeries = cpi.series[iso3] ?? {};
    const incomeSeries = income.series[iso3] ?? {};
    const years = Object.keys(cpiSeries).filter((year) => year in incomeSeries).map(Number).sort((a, b) => a - b);
    if (years.length < 2) throw new Error(`${iso3} has fewer than two paired years`);
    for (let index = 1; index < years.length; index += 1) {
      if (years[index] !== years[index - 1] + 1) throw new Error(`${iso3} paired years are not continuous after ${years[index - 1]}`);
    }
    return {
      iso3,
      firstYear: years[0],
      lastYear: years.at(-1),
      observations: years.map((year) => ({
        year,
        cpi: cpiSeries[String(year)],
        gdpPerCapita: incomeSeries[String(year)],
      })),
    };
  });

  const describe = (key, source) => ({
    id: source.indicatorId,
    name: source.indicatorName,
    database: source.database,
    sourceOrganization: source.sourceOrganization,
    apiUrl: source.apiUrl,
    pageUrl: manifest.indicators[key].pageUrl,
    lastUpdated: source.lastUpdated,
    retrievedOn: source.retrievedOn,
    rawResponseSha256: source.rawResponse.sha256,
  });

  return {
    snapshotDate: manifest.preparedOn,
    frequency: "Annual",
    indicators: { cpi: describe("cpi", cpi), income: describe("income", income) },
    commonFirstYear: Math.max(...countries.map((country) => country.firstYear)),
    commonLastYear: Math.min(...countries.map((country) => country.lastYear)),
    countries,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const snapshot = buildSnapshot();
  writeFileSync(path.join(root, "data/worldbank.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  for (const country of snapshot.countries) {
    console.log(`${country.iso3}: ${country.firstYear}–${country.lastYear} (${country.observations.length} years)`);
  }
  console.log(`Common range for all countries: ${snapshot.commonFirstYear}–${snapshot.commonLastYear}. Wrote data/worldbank.json.`);
}
