// "Price time machine": move an amount of money between two dates with CPI. Pure helpers only.
import { buildWageSeries, parseAmount, resolvePeriod, shiftPeriod, WAGE_REGIONS, LATEST } from "./wage-calculator.js";

export const TIME_MACHINE_REGIONS = WAGE_REGIONS;
export const DEFAULT_AMOUNT = 100;
export const MAX_AMOUNT = 1e12;

// Redenominations inside the CPI coverage used here. Amounts dated up to `lastOldYear` may be
// entered in the old unit; `perNew` old units equal one current unit. Sources are official pages.
export const CURRENCY_REFORMS = {
  DEU: {
    lastOldYear: 2001, perNew: 1.95583, oldUnit: "DEM", newUnit: "EUR", changeYear: 1999,
    sources: [
      "https://www.ecb.europa.eu/press/pr/date/1998/html/pr981231_2.en.html",
      "https://economy-finance.ec.europa.eu/euro/eu-countries-and-euro/germany-and-euro_en",
    ],
  },
  RUS: {
    lastOldYear: 1997, perNew: 1000, oldUnit: "RUR", newUnit: "RUB", changeYear: 1998,
    sources: ["https://cbr.ru/about_br/history/"],
  },
  KOR: {
    lastOldYear: 1961, perNew: 10, oldUnit: "HWAN", newUnit: "KRW", changeYear: 1962,
    sources: ["https://www.bok.or.kr/eng/main/contents.do?menuNo=400118"],
  },
};

// Checked and needing no conversion inside the coverage used (see tests for the reasons).
export const NO_REFORM_REGIONS = ["AUS", "CHN", "USA", "JPN", "SGP", "GBR", "CAN"];

export function yearOf(period) {
  return Number(String(period).slice(0, 4));
}

export function reformFor(region, period) {
  const reform = CURRENCY_REFORMS[region];
  return reform && yearOf(period) <= reform.lastOldYear ? reform : null;
}

export function toCurrentUnits(amount, unit, reform) {
  return unit === "old" && reform ? amount / reform.perNew : amount;
}

// China defaults to the longer World Bank series; NBS 2013–2025 is an alternative, never mixed.
export function buildPriceSeries(region, data, source = "WB") {
  if (region === "CHN" && source === "WB") {
    const country = data.worldBank?.countries.find(entry => entry.iso3 === "CHN");
    if (!country) throw new TypeError("World Bank snapshot has no data for CHN.");
    return {
      region, kind: "annual", source: "WB", approximate: false,
      first: country.firstYear, last: country.lastYear,
      periods: country.observations.map(row => row.year),
      observations: country.observations,
    };
  }
  return buildWageSeries(region, data);
}

function cpiAt(series, period) {
  const index = series.periods.indexOf(period);
  if (index < 0) return null;
  const row = series.observations[index];
  return series.kind === "quarterly" ? row.cpiIndex : row.cpi;
}

function periodsPerYear(series) {
  return series.kind === "quarterly" ? 4 : 1;
}

export function defaultTimeRange(series) {
  const start = shiftPeriod(series.kind, series.last, -30 * periodsPerYear(series));
  return { from: start < series.first ? series.first : start, to: series.last };
}

export function timeTravel(series, { from, to, amount, unit = "new", toUnit = "new" }) {
  const value = parseAmount(amount);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) return { ok: false, error: "amount" };
  const fromCpi = cpiAt(series, from);
  const toCpi = cpiAt(series, to);
  if (fromCpi === null || toCpi === null) return { ok: false, error: "period" };

  const fromReform = reformFor(series.region, from);
  const toReform = reformFor(series.region, to);
  const inputUnit = fromReform ? unit : "new";
  const outputUnit = toReform ? toUnit : "new";
  const amountCurrent = toCurrentUnits(value, inputUnit, fromReform);
  const priceRatio = toCpi / fromCpi;
  const resultCurrent = amountCurrent * priceRatio;
  const result = outputUnit === "old" ? resultCurrent * toReform.perNew : resultCurrent;

  // Inflation is always measured from the earlier to the later date, whichever way we travel.
  const [early, late] = from <= to ? [fromCpi, toCpi] : [toCpi, fromCpi];
  const steps = Math.abs(series.periods.indexOf(to) - series.periods.indexOf(from));
  const years = steps / periodsPerYear(series);
  const growth = late / early;
  return {
    ok: true,
    region: series.region,
    kind: series.kind,
    source: series.source,
    from, to,
    direction: from < to ? "forward" : from > to ? "backward" : "same",
    amount: value,
    inputUnit,
    outputUnit,
    amountCurrent,
    fromCpi, toCpi,
    priceRatio,
    resultCurrent,
    result,
    years,
    cumulativePct: (growth - 1) * 100,
    annualPct: years > 0 ? (growth ** (1 / years) - 1) * 100 : 0,
    // What happens to cash left untouched from the earlier to the later date.
    idleCashPct: (early / late - 1) * 100,
    trend: growth > 1 ? "inflation" : growth < 1 ? "deflation" : "flat",
    approximate: series.approximate,
  };
}

// Purchasing power of untouched cash, in money of the earlier date, from the earlier to the later date.
export function idleCashPath(series, from, to, amountCurrent) {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const startIndex = series.periods.indexOf(start);
  const endIndex = series.periods.indexOf(end);
  if (startIndex < 0 || endIndex < 0) return [];
  const base = cpiAt(series, start);
  return series.periods.slice(startIndex, endIndex + 1).map(period => {
    const cpi = cpiAt(series, period);
    return { period, cpi, value: amountCurrent * base / cpi };
  });
}

export function pathExtremes(path) {
  let low = 0;
  let high = 0;
  path.forEach((row, index) => {
    if (row.value < path[low].value) low = index;
    if (row.value > path[high].value) high = index;
  });
  return { low, high };
}

// Share links may carry amounts here (they are not personal). Every value is validated.
export function readTimeMachineParams(search, data, today = new Date()) {
  const parameters = new URLSearchParams(search);
  const region = TIME_MACHINE_REGIONS.includes(parameters.get("tmRegion")) ? parameters.get("tmRegion") : "AUS";
  const source = region === "CHN" && parameters.get("tmSource") === "NBS" ? "NBS" : "WB";
  const series = buildPriceSeries(region, data, source);
  const defaults = defaultTimeRange(series);
  const amount = parseAmount(parameters.get("tmAmount") ?? "");
  const notices = [];
  const pick = (raw, fallback, name) => {
    if (raw === null) return fallback;
    const resolved = resolvePeriod(series, raw === "latest" ? LATEST : raw, today);
    if (resolved.status === "invalid") {
      notices.push({ name, status: "invalid" });
      return fallback;
    }
    if (resolved.status !== "exact" && raw !== "latest") notices.push({ name, status: resolved.status, requested: resolved.requested });
    return resolved.period;
  };
  const from = pick(parameters.get("tmFrom"), defaults.from, "from");
  const to = pick(parameters.get("tmTo"), defaults.to, "to");
  const unitParameter = parameters.get("tmUnit");
  return {
    region, source, series, from, to,
    amount: Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT ? amount : DEFAULT_AMOUNT,
    unit: unitParameter === "new" ? "new" : "old",
    toUnit: parameters.get("tmToUnit") === "old" ? "old" : "new",
    notices,
  };
}

export function timeMachineShareUrl(base, { region, source, amount, unit, toUnit, from, to }) {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", "timemachine");
  url.searchParams.set("tmRegion", region);
  if (region === "CHN") url.searchParams.set("tmSource", source);
  url.searchParams.set("tmAmount", String(amount));
  if (reformFor(region, from)) url.searchParams.set("tmUnit", unit);
  if (reformFor(region, to)) url.searchParams.set("tmToUnit", toUnit);
  url.searchParams.set("tmFrom", String(from));
  url.searchParams.set("tmTo", String(to));
  return url.href;
}

// Large multiples (1990s Russia) and small sums both stay readable.
export function amountDigits(value) {
  const magnitude = Math.abs(value);
  if (magnitude >= 100) return { minimumFractionDigits: 0, maximumFractionDigits: 0 };
  if (magnitude >= 1) return { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return { maximumSignificantDigits: 3 };
}
