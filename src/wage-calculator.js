// "Did my pay beat inflation?" — pure calculation helpers shared by the page and tests.
// Pay amounts never leave these functions: nothing here touches the URL, storage or network.
import { calculateWindow, calculateYearWindow } from "./analysis.js";

export const WAGE_REGIONS = ["AUS", "CHN", "USA", "KOR", "JPN", "SGP", "DEU", "GBR", "RUS", "CAN"];
export const FLAT_THRESHOLD_PCT = 1;
export const LATEST = "latest";

// Australia: ABS quarterly CPI (with WPI as a reference); China: NBS annual CPI (with resident
// disposable income as a reference); other economies: World Bank annual CPI with no pay reference.
export function buildWageSeries(region, { quarterly, worldBank, china } = {}) {
  if (!WAGE_REGIONS.includes(region)) throw new RangeError(`Unsupported region: ${region}`);
  if (region === "AUS") {
    if (!quarterly) throw new TypeError("ABS quarterly snapshot is required for Australia.");
    return {
      region, kind: "quarterly", source: "ABS", reference: "wpi", approximate: false,
      first: quarterly.firstQuarter, last: quarterly.latestQuarter,
      periods: quarterly.observations.map(row => row.period),
      observations: quarterly.observations,
    };
  }
  if (region === "CHN") {
    if (!china) throw new TypeError("NBS annual snapshot is required for China.");
    return {
      region, kind: "annual", source: "NBS", reference: "disposableIncome", approximate: true,
      first: china.firstYear, last: china.lastYear,
      periods: china.observations.map(row => row.year),
      observations: china.observations.map(row => ({ year: row.year, cpi: row.cpi, gdpPerCapita: row.disposableIncome })),
    };
  }
  const country = worldBank?.countries.find(entry => entry.iso3 === region);
  if (!country) throw new TypeError(`World Bank snapshot has no data for ${region}.`);
  return {
    region, kind: "annual", source: "WB", reference: null, approximate: false,
    first: country.firstYear, last: country.lastYear,
    periods: country.observations.map(row => row.year),
    observations: country.observations,
  };
}

export function currentPeriod(kind, date = new Date()) {
  const year = date.getFullYear();
  return kind === "quarterly" ? `${year}-Q${Math.floor(date.getMonth() / 3) + 1}` : year;
}

export function parsePeriod(kind, value) {
  if (value === LATEST) return LATEST;
  const text = String(value ?? "").trim();
  if (kind === "quarterly") return /^\d{4}-Q[1-4]$/.test(text) ? text : null;
  return /^\d{4}$/.test(text) ? Number(text) : null;
}

// Fit a requested period into the published range. "latest" means "now": if the current quarter
// or year has not been published, fall back to the newest observation and say so.
export function resolvePeriod(series, requested, today = new Date()) {
  const parsed = parsePeriod(series.kind, requested);
  if (parsed === null) return { period: null, requested, status: "invalid" };
  const wanted = parsed === LATEST ? currentPeriod(series.kind, today) : parsed;
  if (wanted > series.last) return { period: series.last, requested: wanted, status: "afterLast" };
  if (wanted < series.first) return { period: series.first, requested: wanted, status: "beforeFirst" };
  if (!series.periods.includes(wanted)) return { period: null, requested: wanted, status: "invalid" };
  return { period: wanted, requested: wanted, status: "exact" };
}

export function shiftPeriod(kind, period, steps) {
  if (kind !== "quarterly") return period + steps;
  const [year, quarter] = period.split("-Q").map(Number);
  const index = year * 4 + quarter - 1 + steps;
  return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
}

// Moving between quarterly and annual regions keeps the calendar year.
export function convertPeriod(period, kind) {
  if (period === LATEST || period === null || period === undefined) return period;
  const year = Number(String(period).slice(0, 4));
  return kind === "quarterly" ? `${year}-Q4` : year;
}

export function defaultRange(series) {
  const start = shiftPeriod(series.kind, series.last, series.kind === "quarterly" ? -20 : -5);
  return { start: start < series.first ? series.first : start, end: LATEST };
}

// Accepts "70,000", "70 000", "７００００" or "70，000.50". Returns NaN for anything else.
export function parseAmount(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "")
    .replace(/[０-９．－]/g, character => String.fromCharCode(character.charCodeAt(0) - 0xfee0))
    .replace(/[−–]/g, "-")
    .replace(/[\s,，'_]/g, "");
  return /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
}

// Live thousands grouping for the amount inputs; keeps the caret after the same digit.
export function groupAmountInput(value, caret = String(value).length) {
  const text = String(value)
    .replace(/[０-９．]/g, character => String.fromCharCode(character.charCodeAt(0) - 0xfee0));
  const digitsBeforeCaret = text.slice(0, caret).replace(/[^\d.]/g, "").length;
  let raw = text.replace(/[^\d.]/g, "");
  const dot = raw.indexOf(".");
  if (dot >= 0) raw = `${raw.slice(0, dot + 1)}${raw.slice(dot + 1).replace(/\./g, "").slice(0, 2)}`;
  const [integer, fraction] = raw.split(".");
  const grouped = (integer.replace(/^0+(?=\d)/, "")).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formatted = fraction === undefined ? grouped : `${grouped}.${fraction}`;
  let seen = 0;
  let position = 0;
  while (position < formatted.length && seen < digitsBeforeCaret) {
    if (/[\d.]/.test(formatted[position])) seen += 1;
    position += 1;
  }
  return { value: formatted, caret: position };
}

// Verdict uses the value as displayed (one decimal), so "+1.0%" never reads as "roughly level".
export function verdictFor(realPct, threshold = FLAT_THRESHOLD_PCT) {
  const shown = Math.round(realPct * 10) / 10;
  if (shown >= threshold) return "ahead";
  if (shown <= -threshold) return "behind";
  return "flat";
}

export function calculateWageChange(series, { start, end, startWage, endWage }) {
  const fromWage = parseAmount(startWage);
  const toWage = parseAmount(endWage);
  if (!Number.isFinite(fromWage) || fromWage <= 0) return { ok: false, error: "startWage" };
  if (!Number.isFinite(toWage) || toWage <= 0) return { ok: false, error: "endWage" };
  if (!series.periods.includes(start) || !series.periods.includes(end)) return { ok: false, error: "period" };
  if (start >= end) return { ok: false, error: "order" };

  const window = series.kind === "quarterly"
    ? calculateWindow(series.observations, start, end)
    : calculateYearWindow(series.observations, start, end);
  const cpiRatio = window.rows.at(-1).cpiNormalized / 100;
  const wageRatio = toWage / fromWage;
  const realPct = (wageRatio / cpiRatio - 1) * 100;
  const requiredEndWage = fromWage * cpiRatio;
  const referencePct = series.reference === "wpi" ? window.wpiGrowthPct
    : series.reference ? window.incomeGrowthPct : null;
  const steps = window.rows.length - 1;

  return {
    ok: true,
    region: series.region,
    kind: series.kind,
    start,
    end,
    startWage: fromWage,
    endWage: toWage,
    startCpi: series.kind === "quarterly" ? window.start.cpiIndex : window.start.cpi,
    endCpi: series.kind === "quarterly" ? window.end.cpiIndex : window.end.cpi,
    wageRatio,
    cpiRatio,
    nominalPct: (wageRatio - 1) * 100,
    cpiPct: (cpiRatio - 1) * 100,
    realPct,
    verdict: verdictFor(realPct),
    requiredEndWage,
    gapAmount: toWage - requiredEndWage,
    reference: series.reference,
    referencePct,
    approximate: series.approximate,
    path: window.rows.map((row, index) => ({
      period: series.kind === "quarterly" ? row.period : row.year,
      needed: fromWage * row.cpiNormalized / 100,
      wage: fromWage + (toWage - fromWage) * (steps ? index / steps : 1),
    })),
  };
}

// Share links carry the region and periods only — never pay amounts.
export function wageShareUrl(base, { region, start, end }) {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", "wage");
  url.searchParams.set("wageRegion", region);
  url.searchParams.set("wageFrom", String(start));
  url.searchParams.set("wageTo", String(end));
  return url.href;
}

export function readWageParams(search) {
  const parameters = new URLSearchParams(search);
  const region = parameters.get("wageRegion");
  return {
    region: WAGE_REGIONS.includes(region) ? region : null,
    from: parameters.get("wageFrom"),
    to: parameters.get("wageTo"),
  };
}

export function formatPeriod(period, kind, message) {
  if (kind !== "quarterly") return message("format.year", { year: period });
  const [year, quarter] = String(period).split("-Q");
  return message("format.quarterOption", { year, quarter });
}
