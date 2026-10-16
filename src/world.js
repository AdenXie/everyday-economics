import { calculateYearWindow, compareCountries, comparisonScale } from "./analysis.js";
import { loadChinaSnapshot, mapChinaObservations } from "./china.js";
import { attachChartInspector } from "./chart-inspector.js";
import { renderReading } from "./stories.js";
import { showWage } from "./wage.js";
import { showTimeMachine } from "./tm.js";

const svgNS = "http://www.w3.org/2000/svg";
const VIEWS = [...document.querySelectorAll(".country-tabs [role=tab]")].map(tab => tab.dataset.view);
const DEFAULT_START = 2000;

let messages = {};
let locale = "zh";
let snapshot = null;
let chinaSnapshot = null;
let chinaReady = false;
let number;
let money;
let currentView = "AUS";
let baseTitle = document.title;
let updateLanguageLinks = () => {};

const $ = (selector) => document.querySelector(selector);

function message(key, values = {}) {
  const template = messages[key] ?? key;
  return Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), template);
}

function signedPct(value) {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${number.format(Math.abs(value))}%`;
}

function yearLabel(year) {
  return message("format.year", { year });
}

function appendSvg(parent, tagName, attributes = {}, text = "") {
  const element = document.createElementNS(svgNS, tagName);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  if (text) element.textContent = text;
  parent.append(element);
  return element;
}

function countryById(iso3) {
  return snapshot.countries.find((country) => country.iso3 === iso3);
}

// ---------- URL state ----------

function readParams() {
  const parameters = new URLSearchParams(window.location.search);
  const view = VIEWS.includes(parameters.get("view")) ? parameters.get("view") : "AUS";
  const from = Number.parseInt(parameters.get("from"), 10);
  const to = Number.parseInt(parameters.get("to"), 10);
  return { view, from: Number.isFinite(from) ? from : null, to: Number.isFinite(to) ? to : null };
}

function writeParams(view, from, to) {
  const url = new URL(window.location.href);
  if (view === "AUS") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  window.history.replaceState({}, "", url);
  updateLanguageLinks();
}

// ---------- year selects ----------

function fillYears(select, firstYear, lastYear) {
  select.replaceChildren();
  for (let year = firstYear; year <= lastYear; year += 1) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = message("format.yearOption", { year });
    select.append(option);
  }
}

function clampRange(from, to, firstYear, lastYear, fallbackStart) {
  let start = from ?? fallbackStart;
  let end = to ?? lastYear;
  start = Math.min(Math.max(start, firstYear), lastYear);
  end = Math.min(Math.max(end, firstYear), lastYear);
  if (start > end) [start, end] = [Math.max(firstYear, fallbackStart), lastYear];
  return [start, end];
}

function linkSelects(startSelect, endSelect, onChange) {
  startSelect.addEventListener("change", () => {
    if (Number(startSelect.value) > Number(endSelect.value)) endSelect.value = startSelect.value;
    onChange();
  });
  endSelect.addEventListener("change", () => {
    if (Number(endSelect.value) < Number(startSelect.value)) startSelect.value = endSelect.value;
    onChange();
  });
}

// ---------- country chart ----------

function renderCountryChart(country, analysis, options = {}) {
  const svg = $(options.svgSelector ?? "#world-chart");
  const tooltip = $(options.tooltipSelector ?? "#world-tooltip");
  const rows = analysis.rows;
  const countryName = options.countryName ?? message(`country.${country.iso3}`);
  const incomeLabel = options.incomeLabel ?? message("world.tooltipIncome");
  svg.replaceChildren();
  tooltip.hidden = true;
  svg.setAttribute("aria-label", message(options.ariaKey ?? "world.chartAria", {
    country: countryName,
    start: yearLabel(analysis.start.year),
    end: yearLabel(analysis.end.year),
    cpi: signedPct(analysis.cpiGrowthPct),
    income: signedPct(analysis.incomeGrowthPct),
    incomeLabel,
  }));
  appendSvg(svg, "title", {}, message(options.titleKey ?? "world.svgTitle", { country: countryName, incomeLabel }));
  appendSvg(svg, "desc", {}, message(options.descriptionKey ?? "world.svgDesc"));

  const width = 1000;
  const height = 390;
  const margin = { left: 72, right: 58, top: 28, bottom: 60 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = rows.flatMap((row) => [row.cpiNormalized, row.incomeNormalized]);
  const minimum = Math.min(...values, 100);
  const maximum = Math.max(...values, 100);
  const span = Math.max(maximum - minimum, 10);
  const rawStep = span / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rawStep);
  const yMin = Math.floor(minimum / step) * step;
  const yMax = Math.ceil(maximum / step) * step;

  const x = (index) => margin.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
  const y = (value) => margin.top + ((yMax - value) / (yMax - yMin)) * plotHeight;

  appendSvg(svg, "rect", { x: margin.left - 16, y: margin.top - 6, width: 7, height: plotHeight + 12, rx: 3.5, class: "chart-spine" });

  const tickFormat = new Intl.NumberFormat(locale === "en" ? "en-AU" : "zh-CN", { maximumFractionDigits: step < 1 ? 1 : 0 });
  for (let value = yMin; value <= yMax + step / 1000; value += step) {
    const position = y(value);
    appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: position, y2: position, class: "chart-grid" });
    appendSvg(svg, "text", { x: margin.left - 22, y: position + 4, "text-anchor": "end", class: "axis-label y-label" }, tickFormat.format(value));
  }
  if (yMin < 100 && yMax > 100) {
    appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: y(100), y2: y(100), class: "chart-grid baseline-grid" });
  }
  appendSvg(svg, "line", { x1: margin.left, x2: margin.left, y1: margin.top, y2: margin.top + plotHeight, class: "chart-axis" });

  const tickIndexes = new Set([0, rows.length - 1]);
  const yearStep = [1, 2, 5, 10, 20].find((candidate) => (rows.length - 1) / candidate <= 6) ?? 20;
  rows.forEach((row, index) => {
    const clearOfEnds = index - 0 >= yearStep * 0.5 && rows.length - 1 - index >= yearStep * 0.5;
    if (row.year % yearStep === 0 && clearOfEnds) tickIndexes.add(index);
  });
  for (const index of tickIndexes) {
    const position = x(index);
    appendSvg(svg, "line", { x1: position, x2: position, y1: margin.top + plotHeight, y2: margin.top + plotHeight + 6, class: "chart-axis" });
    appendSvg(svg, "text", {
      x: position,
      y: height - 22,
      "text-anchor": rows.length > 1 && index === 0 ? "start" : rows.length > 1 && index === rows.length - 1 ? "end" : "middle",
      class: "axis-label x-label",
    }, String(rows[index].year));
  }

  const makePath = (key) => rows.map((row, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(row[key]).toFixed(2)}`).join(" ");
  appendSvg(svg, "path", { d: makePath("cpiNormalized"), class: "series-path cpi-path" });
  appendSvg(svg, "path", { d: makePath("incomeNormalized"), class: "series-path wpi-path" });

  const lastIndex = rows.length - 1;
  const endpoints = [
    ["cpiNormalized", "cpi-point", "CPI"],
    ["incomeNormalized", "wpi-point", options.endpointIncome ?? "GDP"],
  ];
  const endY = endpoints.map(([key]) => y(rows[lastIndex][key]));
  const labelY = [...endY];
  if (Math.abs(labelY[0] - labelY[1]) < 14) {
    const middle = (labelY[0] + labelY[1]) / 2;
    const direction = labelY[0] <= labelY[1] ? -1 : 1;
    labelY[0] = middle + direction * 7;
    labelY[1] = middle - direction * 7;
  }
  endpoints.forEach(([, className, label], index) => {
    appendSvg(svg, "circle", { cx: x(lastIndex), cy: endY[index], r: 5.5, class: `series-point ${className}` });
    appendSvg(svg, "text", { x: x(lastIndex) + 12, y: labelY[index] + 4, class: `endpoint-label ${className}` }, label);
  });

  const rawNumber = new Intl.NumberFormat(locale === "en" ? "en-AU" : "zh-CN", { maximumFractionDigits: 2 });
  attachChartInspector({
    svg, tooltip, rows, x, y, width, height, margin,
    periodLabel: row => yearLabel(row.year),
    note: message("chart.inspectNote"),
    gapLabel: message("chart.inspectGap"),
    formatIndex: value => number.format(value),
    formatGap: value => `${value > 0 ? "+" : ""}${number.format(value)}`,
    series: [
      { normalizedKey: "cpiNormalized", rawKey: "cpi", label: message("world.tooltipCpi"), className: "cpi",
        rawLabel: options.rawCpiLabel ?? message("chart.rawAnnualCpi"), formatRaw: value => rawNumber.format(value) },
      { normalizedKey: "incomeNormalized", rawKey: "gdpPerCapita", label: incomeLabel, className: "wpi",
        rawLabel: options.rawIncomeLabel ?? message("chart.rawGdp"), formatRaw: value => message("format.money", { amount: rawNumber.format(value), currency: message(`currency.${country.iso3}`) }) },
    ],
  });
}

// ---------- country view ----------

function renderCountry(iso3) {
  const country = countryById(iso3);
  const start = Number($("#world-start").value);
  const end = Number($("#world-end").value);
  const analysis = calculateYearWindow(country.observations, start, end);
  const countryName = message(`country.${iso3}`);
  const currency = message(`currency.${iso3}`);

  $("#world-title").textContent = iso3 === "AUS" ? message("world.titleAus") : message("world.title", { country: countryName });
  $("#world-range").textContent = message("world.range", { start: yearLabel(start), end: yearLabel(end), country: countryName });
  renderCountryChart(country, analysis);

  $("#world-cpi-growth").textContent = signedPct(analysis.cpiGrowthPct);
  $("#world-income-growth").textContent = signedPct(analysis.incomeGrowthPct);
  $("#world-basket-label").textContent = message("world.basketLabel", { money: message("format.money", { amount: "100", currency }) });
  $("#world-basket").textContent = message("format.money", { amount: money.format(analysis.cpiIndexed100), currency });

  const real = analysis.cpiDeflatedIncomeGrowthPct;
  const gap = analysis.differencePp;
  $("#world-real").textContent = message("world.realUp", { value: signedPct(real) });
  if (Math.abs(gap) < 0.05) $("#world-real-detail").textContent = message("world.realSameDetail");
  else if (gap > 0) $("#world-real-detail").textContent = message("world.realUpDetail", { gap: number.format(gap) });
  else $("#world-real-detail").textContent = message("world.realDownDetail", { gap: number.format(Math.abs(gap)) });

  $("#world-note").textContent = message(`world.note.${iso3}`);
  renderReading($("#world-reading"), {
    id: iso3, analysis, kind: "annual", locale, message,
    start: yearLabel(start), end: yearLabel(end), currency, first: country.firstYear, last: country.lastYear,
    selectRange(from, to) {
      $("#world-start").value = String(from);
      $("#world-end").value = String(to);
      renderCountry(iso3);
      $("#world-chart").scrollIntoView({ behavior: "instant", block: "center" });
    },
  });
  writeParams(iso3, start, end);
}

function setupCountry(iso3, requested) {
  const country = countryById(iso3);
  fillYears($("#world-start"), country.firstYear, country.lastYear);
  fillYears($("#world-end"), country.firstYear, country.lastYear);
  const [start, end] = clampRange(requested.from, requested.to, country.firstYear, country.lastYear, DEFAULT_START);
  $("#world-start").value = String(start);
  $("#world-end").value = String(end);
  renderCountry(iso3);
}

// ---------- China NBS resident-income view ----------

function readChinaParams() {
  const parameters = new URLSearchParams(window.location.search);
  const from = Number.parseInt(parameters.get("chinaFrom"), 10);
  const to = Number.parseInt(parameters.get("chinaTo"), 10);
  const income = ["disposableIncome", "wageIncome"].includes(parameters.get("chinaIncome"))
    ? parameters.get("chinaIncome")
    : "disposableIncome";
  return { from: Number.isFinite(from) ? from : null, to: Number.isFinite(to) ? to : null, income };
}

function writeChinaParams(from, to, income) {
  const url = new URL(window.location.href);
  url.searchParams.set("chinaFrom", from);
  url.searchParams.set("chinaTo", to);
  url.searchParams.set("chinaIncome", income);
  window.history.replaceState({}, "", url);
  updateLanguageLinks();
}

function renderChina() {
  if (!chinaSnapshot || !chinaReady) return;
  const start = Number($("#china-start").value);
  const end = Number($("#china-end").value);
  const incomeField = $("#china-income").value;
  const incomeLabel = message(incomeField === "wageIncome" ? "china.incomeWage" : "china.incomeDisposable");
  const observations = mapChinaObservations(chinaSnapshot, incomeField);
  const analysis = calculateYearWindow(observations, start, end);
  const countryName = message("country.CHN");
  const currency = message("currency.CHN");

  $("#china-range").textContent = message("world.range", { start: yearLabel(start), end: yearLabel(end), country: countryName });
  $("#china-period").textContent = $("#china-range").textContent;
  $("#china-income-legend").textContent = incomeLabel;
  $("#china-income-label").textContent = incomeLabel;
  $("#china-income-detail").textContent = message(incomeField === "wageIncome" ? "china.incomeDetailWage" : "china.incomeDetailDisposable");
  renderCountryChart({ iso3: "CHN" }, analysis, {
    svgSelector: "#china-chart",
    tooltipSelector: "#china-tooltip",
    countryName,
    incomeLabel,
    ariaKey: "china.chartAria",
    titleKey: "china.svgTitle",
    descriptionKey: "china.svgDesc",
    endpointIncome: message("china.endpointIncome"),
    rawCpiLabel: message("chart.rawChinaCpi"),
    rawIncomeLabel: message("chart.rawResidentIncome"),
  });

  $("#china-cpi-growth").textContent = signedPct(analysis.cpiGrowthPct);
  $("#china-income-growth").textContent = signedPct(analysis.incomeGrowthPct);
  $("#china-basket-label").textContent = message("china.basketLabel", {
    money: message("format.money", { amount: "100", currency }),
  });
  $("#china-basket").textContent = message("format.money", { amount: money.format(analysis.cpiIndexed100), currency });
  const real = analysis.cpiDeflatedIncomeGrowthPct;
  const gap = analysis.differencePp;
  $("#china-real").textContent = message("china.realUp", { value: signedPct(real) });
  if (Math.abs(gap) < 0.05) $("#china-real-detail").textContent = message("china.realSameDetail");
  else if (gap > 0) $("#china-real-detail").textContent = message("china.realUpDetail", { gap: number.format(gap) });
  else $("#china-real-detail").textContent = message("china.realDownDetail", { gap: number.format(Math.abs(gap)) });

  renderReading($("#china-reading"), {
    id: "CHN_NBS", analysis, kind: "annual", locale, message,
    incomeMode: incomeField === "wageIncome" ? "wage" : "disposable",
    start: yearLabel(start), end: yearLabel(end), currency,
    first: chinaSnapshot.firstYear, last: chinaSnapshot.lastYear,
    selectRange(from, to) {
      $("#china-start").value = String(from);
      $("#china-end").value = String(to);
      renderChina();
      $("#china-chart").scrollIntoView({ behavior: "instant", block: "center" });
    },
  });
  writeChinaParams(start, end, incomeField);
}

function setupChina(requested = readChinaParams()) {
  if (!chinaSnapshot || chinaReady) return;
  fillYears($("#china-start"), chinaSnapshot.firstYear, chinaSnapshot.lastYear);
  fillYears($("#china-end"), chinaSnapshot.firstYear, chinaSnapshot.lastYear);
  const [start, end] = clampRange(requested.from, requested.to, chinaSnapshot.firstYear, chinaSnapshot.lastYear, chinaSnapshot.firstYear);
  $("#china-start").value = String(start);
  $("#china-end").value = String(end);
  $("#china-income").value = requested.income;
  $("#china-start").addEventListener("change", () => {
    if (Number($("#china-start").value) > Number($("#china-end").value)) $("#china-end").value = $("#china-start").value;
    renderChina();
  });
  $("#china-end").addEventListener("change", () => {
    if (Number($("#china-end").value) < Number($("#china-start").value)) $("#china-start").value = $("#china-end").value;
    renderChina();
  });
  $("#china-income").addEventListener("change", renderChina);
  $("#china-snapshot-date").textContent = message("china.snapshotDate", { date: chinaSnapshot.snapshotDate });
  renderChinaSources(chinaSnapshot.sources ?? []);
  renderChinaTable();
  $("#china-loading").hidden = true;
  $("#china-error").hidden = true;
  $("#china-content").hidden = false;
  chinaReady = true;
  renderChina();
}

function renderChinaSources(sources) {
  const container = $("#china-sources");
  container.replaceChildren();
  for (const source of sources) {
    const sourceId = String(source.id ?? "").toLowerCase();
    const key = sourceId.includes("cpi") ? "china.sourceKeyCpi"
      : sourceId.includes("disposable") || sourceId.includes("income") ? "china.sourceKeyDisposable"
        : sourceId.includes("wage") ? "china.sourceKeyWage" : "china.sourceKeyOther";
    const row = document.createElement("article");
    row.className = "source-item";
    const badge = document.createElement("span");
    badge.className = `source-key ${sourceId.includes("cpi") ? "cpi-source-key" : "wpi-source-key"}`;
    badge.textContent = message(key);
    const details = document.createElement("div");
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = messages[`china.sourceTitle.${source.id}`] ?? source.title;
    details.append(link);
    const detail = document.createElement("p");
    detail.textContent = source.publishedOn
      ? message("china.sourceDate", { published: source.publishedOn, retrieved: source.retrievedOn ?? chinaSnapshot.snapshotDate })
      : message("china.retrievedDate", { date: source.retrievedOn ?? chinaSnapshot.snapshotDate });
    details.append(detail);
    row.append(badge, details);
    container.append(row);
  }
}

function renderChinaTable() {
  const body = $("#china-data-rows");
  const amount = new Intl.NumberFormat(locale === "en" ? "en-AU" : "zh-CN", { maximumFractionDigits: 1 });
  for (const row of chinaSnapshot.observations) {
    const tr = document.createElement("tr");
    const year = document.createElement("th");
    year.scope = "row";
    year.textContent = yearLabel(row.year);
    tr.append(year);
    for (const text of [number.format(row.cpi), signedPct(row.cpiPreviousYear - 100), amount.format(row.disposableIncome), amount.format(row.wageIncome)]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    body.append(tr);
  }
}

function showChinaError(error) {
  console.error(error);
  $("#china-loading").hidden = true;
  $("#china-content").hidden = true;
  $("#china-error").hidden = false;
}

// ---------- comparison view ----------

function renderCompare() {
  const start = Number($("#compare-start").value);
  const end = Number($("#compare-end").value);
  const sort = $("#compare-sort").value;
  let rows = compareCountries(snapshot.countries, start, end);
  const sortKey = { real: "cpiDeflatedIncomeGrowthPct", cpi: "cpiGrowthPct", income: "incomeGrowthPct" }[sort];
  if (sortKey) {
    rows = [...rows].sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return a.available ? b[sortKey] - a[sortKey] : 0;
    });
  }

  const available = rows.filter((row) => row.available);
  const extent = available.flatMap((row) => [row.cpiGrowthPct, row.incomeGrowthPct]);
  const scale = comparisonScale(extent);
  const zero = scale.zero;
  $("#compare-note").textContent = message(scale.compressed ? "compare.compressedNote" : "compare.note");

  const body = $("#compare-rows");
  body.replaceChildren();
  body.style.setProperty("--zero", `${zero}%`);
  for (const row of rows) {
    const tr = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = message(`country.${row.iso3}`);
    const bars = document.createElement("td");
    bars.className = "compare-bars";
    const realCell = document.createElement("td");
    realCell.className = "numeric compare-real";
    if (!row.available) {
      tr.className = "is-unavailable";
      bars.textContent = message("compare.unavailable", { first: row.firstYear, last: row.lastYear });
      realCell.textContent = "—";
    } else {
      for (const [className, key, label] of [
        ["cpi", "cpiGrowthPct", "compare.barCpi"],
        ["wpi", "incomeGrowthPct", "compare.barIncome"],
      ]) {
        const value = row[key];
        const barRow = document.createElement("div");
        barRow.className = "bar-row";
        const track = document.createElement("div");
        track.className = "bar-track";
        const bar = document.createElement("span");
        bar.className = `bar bar-${className}`;
        const widthPct = scale.width(value);
        bar.style.width = `${widthPct}%`;
        bar.style.left = value >= 0 ? `${zero}%` : `${zero - widthPct}%`;
        if (value < 0) bar.classList.add("is-negative");
        track.append(bar);
        const text = document.createElement("span");
        text.className = "bar-value";
        text.textContent = message(label, { value: signedPct(value) });
        barRow.append(track, text);
        bars.append(barRow);
      }
      realCell.textContent = signedPct(row.cpiDeflatedIncomeGrowthPct);
    }
    tr.append(name, bars, realCell);
    body.append(tr);
  }

  $("#compare-range").textContent = message("compare.range", { start: yearLabel(start), end: yearLabel(end) });
  const missing = $("#compare-missing");
  missing.hidden = available.length === rows.length;
  missing.textContent = message("compare.missing", { first: snapshot.commonFirstYear, last: snapshot.commonLastYear });
  writeParams("compare", start, end);
}

function setupCompare(requested) {
  const firstYear = Math.min(...snapshot.countries.map((country) => country.firstYear));
  const lastYear = Math.max(...snapshot.countries.map((country) => country.lastYear));
  fillYears($("#compare-start"), firstYear, lastYear);
  fillYears($("#compare-end"), firstYear, lastYear);
  const from = requested.from ?? DEFAULT_START;
  const to = requested.to ?? snapshot.commonLastYear;
  const [start, end] = clampRange(from, to, firstYear, lastYear, DEFAULT_START);
  $("#compare-start").value = String(start);
  $("#compare-end").value = String(end);
  renderCompare();
}

// ---------- tabs ----------

function currentYears() {
  if (currentView === "wage" || currentView === "timemachine") return readParams();
  const prefix = currentView === "compare" ? "#compare" : "#world";
  const start = Number($(`${prefix}-start`).value);
  const end = Number($(`${prefix}-end`).value);
  return { from: Number.isFinite(start) && start > 0 ? start : null, to: Number.isFinite(end) && end > 0 ? end : null };
}

function selectView(view, { focus = false, keepYears = true } = {}) {
  const years = keepYears && snapshot ? currentYears() : readParams();
  const previousView = currentView;
  currentView = view;
  for (const tab of document.querySelectorAll(".country-tabs [role=tab]")) {
    const selected = tab.dataset.view === view;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  $("#story").setAttribute("aria-labelledby", `tab-${view}`);
  $("#abs-view").hidden = view !== "AUS";
  $("#china-nbs").hidden = view !== "CHN";
  const toolView = view === "wage" || view === "timemachine";
  $("#world-country").hidden = view === "compare" || toolView;
  $("#world-compare").hidden = view !== "compare";
  $("#wage-view").hidden = view !== "wage";
  $("#tm-view").hidden = view !== "timemachine";

  if (view === "AUS") document.title = baseTitle;
  else if (view === "compare") document.title = message("compare.documentTitle");
  else if (view === "wage") document.title = message("wage.documentTitle");
  else if (view === "timemachine") document.title = message("tm.documentTitle");
  else document.title = message("world.documentTitle", { country: message(`country.${view}`) });

  if (view === "wage") {
    showWage({ messages, locale, region: previousView, onUrlChange: updateLanguageLinks }).catch(error => console.error(error));
    return;
  }
  if (view === "timemachine") {
    showTimeMachine({ messages, locale, region: previousView, onUrlChange: updateLanguageLinks }).catch(error => console.error(error));
    return;
  }
  if (view === "CHN" && chinaSnapshot && !chinaReady) setupChina();
  if (!snapshot) return;
  if (view === "compare") setupCompare(years);
  else setupCountry(view, years);
}

function setupTabs() {
  // The pay calculator and the time machine link to each other without leaving the page.
  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("[data-view-link]") : null;
    if (!link || !VIEWS.includes(link.dataset.viewLink)) return;
    event.preventDefault();
    selectView(link.dataset.viewLink, { focus: true });
    $("#story").scrollIntoView({ block: "start" });
  });
  const tabs = [...document.querySelectorAll(".country-tabs [role=tab]")];
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      if (tab.dataset.view !== currentView) selectView(tab.dataset.view);
    });
    tab.addEventListener("keydown", (event) => {
      const index = tabs.indexOf(tab);
      let next = null;
      if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
      else if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
      else if (event.key === "Home") next = tabs[0];
      else if (event.key === "End") next = tabs.at(-1);
      if (!next) return;
      event.preventDefault();
      selectView(next.dataset.view, { focus: true });
    });
  }
}

export async function startWorld(localeMessages, activeLocale, onUrlChange = () => {}) {
  messages = localeMessages;
  locale = activeLocale;
  updateLanguageLinks = onUrlChange;
  baseTitle = messages["metadata.title"] ?? document.title;
  number = new Intl.NumberFormat(locale === "en" ? "en-AU" : "zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  money = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const initial = readParams();
  setupTabs();
  selectView(initial.view, { keepYears: false });

  loadChinaSnapshot()
    .then((china) => {
      chinaSnapshot = china;
      if (currentView === "CHN") setupChina();
    })
    .catch(showChinaError);

  const response = await fetch(new URL("../data/worldbank.json", import.meta.url), { cache: "no-store" });
  if (!response.ok) throw new Error(`World Bank snapshot request failed: ${response.status}`);
  snapshot = await response.json();

  const { cpi, income } = snapshot.indicators;
  $("#wb-cpi-date").textContent = message("world.sourceDate", { date: cpi.lastUpdated, retrieved: cpi.retrievedOn });
  $("#wb-income-date").textContent = message("world.sourceDate", { date: income.lastUpdated, retrieved: income.retrievedOn });

  linkSelects($("#world-start"), $("#world-end"), () => renderCountry(currentView));
  linkSelects($("#compare-start"), $("#compare-end"), renderCompare);
  $("#compare-sort").addEventListener("change", renderCompare);

  selectView(initial.view, { keepYears: false });
}
