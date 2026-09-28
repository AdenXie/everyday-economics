// Fetch the two WDI indicators, keeping a candidate update only when values change.
// The generated snapshot is rebuilt separately by npm run extract:worldbank.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSha256 } from "./extract_worldbank.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "data/worldbank-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const today = new Date().toISOString().slice(0, 10);
const countries = manifest.countries;
const countrySet = new Set(countries);
if (countries.join(",") !== "AUS,USA,KOR,JPN,SGP,CHN") throw new Error("Unexpected WDI country list");
if (manifest.indicators.cpi.id !== "FP.CPI.TOTL" || manifest.indicators.income.id !== "NY.GDP.PCAP.CN") {
  throw new Error("Unexpected WDI indicator pairing");
}

function fetchIndicator(entry) {
  const filePath = path.join(root, entry.file);
  const previous = JSON.parse(readFileSync(filePath, "utf8"));
  const url = new URL(`https://api.worldbank.org/v2/country/${countries.join(";")}/indicator/${entry.id}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("per_page", "1000");
  url.searchParams.set("date", `1960:${new Date().getUTCFullYear()}`);
  // curl follows the host's proxy settings, which Node's built-in fetch may not.
  const raw = execFileSync("curl", ["--fail", "--location", "--silent", "--show-error", "--retry", "2", "--max-time", "25", url.toString()], {
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
    timeout: 90000,
  });
  const payload = JSON.parse(raw);
  if (!Array.isArray(payload) || payload.length !== 2 || !Array.isArray(payload[1])) {
    throw new Error(`Unexpected WDI response for ${entry.id}`);
  }
  const [metadata, records] = payload;
  if (Number(metadata.page) !== 1 || Number(metadata.pages) !== 1 || Number(metadata.total) !== records.length) {
    throw new Error(`Incomplete WDI response for ${entry.id}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.lastupdated ?? "")) {
    throw new Error(`Missing WDI update date for ${entry.id}`);
  }
  const series = Object.fromEntries(countries.map((iso3) => [iso3, {}]));
  const seen = new Set();
  for (const record of records) {
    const iso3 = record.countryiso3code;
    const year = String(record.date);
    if (!countrySet.has(iso3) || record.indicator?.id !== entry.id || !/^\d{4}$/.test(year)) {
      throw new Error(`Unexpected country, indicator, or year in ${entry.id}`);
    }
    const key = `${iso3}:${year}`;
    if (seen.has(key)) throw new Error(`Duplicate WDI observation ${entry.id} ${key}`);
    seen.add(key);
    if (record.value === null) continue;
    if (typeof record.value !== "number" || !Number.isFinite(record.value) || record.value <= 0) {
      throw new Error(`Invalid WDI value ${entry.id} ${key}`);
    }
    series[iso3][year] = record.value;
  }
  for (const iso3 of countries) {
    if (Object.keys(series[iso3]).length < 2) throw new Error(`Too few WDI values for ${entry.id} ${iso3}`);
  }
  const checksum = canonicalSha256(series);
  const source = {
    ...previous,
    indicatorName: records[0]?.indicator?.value ?? previous.indicatorName,
    apiUrl: url.toString(),
    retrievedOn: today,
    lastUpdated: metadata.lastupdated,
    rawResponse: {
      chars: raw.length,
      records: records.length,
      sha256: createHash("sha256").update(raw).digest("hex").toUpperCase(),
    },
    canonicalSha256: checksum,
    series,
  };
  return { filePath, source, changed: checksum !== previous.canonicalSha256 };
}

const results = [
  fetchIndicator(manifest.indicators.cpi),
  fetchIndicator(manifest.indicators.income),
];
if (!results.some((result) => result.changed)) {
  console.log("No World Bank values changed; the repository snapshot stays as it is.");
} else {
  for (const result of results) {
    if (result.changed) writeFileSync(result.filePath, `${JSON.stringify(result.source, null, 2)}\n`);
  }
  manifest.preparedOn = today;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`WDI values changed on ${today}; updated source files and manifest. Run npm run extract:worldbank.`);
}
