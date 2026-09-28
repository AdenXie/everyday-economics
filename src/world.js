import { calculateYearWindow, compareCountries } from "./analysis.js";

const svgNS = "http://www.w3.org/2000/svg";
const VIEWS = ["AUS", "USA", "KOR", "JPN", "SGP", "CHN", "compare"];
const DEFAULT_START = 2000;

let messages = {};
let locale = "zh";
let snapshot = null;
let number;
let money;
let currentView = "AUS";
let baseTitle = document.title;

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

function renderCountryChart(country, analysis) {
  const svg = $("#world-chart");
  const tooltip = $("#world-tooltip");
  const rows = analysis.rows;
  const countryName = message(`country.${country.iso3}`);
  svg.replaceChildren();
  tooltip.hidden = true;
  svg.setAttribute("aria-label", message("world.chartAria", {
    country: countryName,
    start: yearLabel(analysis.start.year),
    end: yearLabel(analysis.end.year),
    cpi: signedPct(analysis.cpiGrowthPct),
    income: signedPct(analysis.incomeGrowthPct),
  }));
  appendSvg(svg, "title", {}, message("world.svgTitle", { country: countryName }));
  appendSvg(svg, "desc", {}, message("world.svgDesc"));

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
    ["incomeNormalized", "wpi-point", "GDP"],
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

  // Hover layer: crosshair, markers and a tooltip for the nearest year.
  const hover = appendSvg(svg, "g", { class: "hover-layer", visibility: "hidden" });
  const crosshair = appendSvg(hover, "line", { y1: margin.top, y2: margin.top + plotHeight, class: "crosshair" });
  const cpiMarker = appendSvg(hover, "circle", { r: 5, class: "series-point cpi-point" });
  const incomeMarker = appendSvg(hover, "circle", { r: 5, class: "series-point wpi-point" });
  const target = appendSvg(svg, "rect", {
    x: margin.left - 10, y: margin.top, width: plotWidth + 20, height: plotHeight, class: "hover-target",
  });

  const index1 = new Intl.NumberFormat(locale === "en" ? "en-AU" : "zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const showAt = (clientX) => {
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(clientX, 0).matrixTransform(matrix.inverse());
    const ratio = rows.length === 1 ? 0 : (point.x - margin.left) / plotWidth;
    const index = Math.min(rows.length - 1, Math.max(0, Math.round(ratio * (rows.length - 1))));
    const row = rows[index];
    const cx = x(index);
    crosshair.setAttribute("x1", cx);
    crosshair.setAttribute("x2", cx);
    cpiMarker.setAttribute("cx", cx);
    cpiMarker.setAttribute("cy", y(row.cpiNormalized));
    incomeMarker.setAttribute("cx", cx);
    incomeMarker.setAttribute("cy", y(row.incomeNormalized));
    hover.setAttribute("visibility", "visible");

    tooltip.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = yearLabel(row.year);
    const note = document.createElement("span");
    note.className = "tooltip-note";
    note.textContent = message("world.tooltipNote");
    tooltip.append(heading, note);
    for (const [className, label, value] of [
      ["cpi", message("world.tooltipCpi"), row.cpiNormalized],
      ["wpi", message("world.tooltipIncome"), row.incomeNormalized],
    ]) {
      const line = document.createElement("span");
      line.className = `tooltip-row tooltip-${className}`;
      const swatch = document.createElement("i");
      swatch.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.textContent = label;
      const figure = document.createElement("b");
      figure.textContent = index1.format(value);
      line.append(swatch, name, figure);
      tooltip.append(line);
    }
    tooltip.hidden = false;
    const wrapper = tooltip.parentElement.getBoundingClientRect();
    const svgBox = svg.getBoundingClientRect();
    const pixelX = svgBox.left - wrapper.left + tooltip.parentElement.scrollLeft + (cx / width) * svgBox.width;
    const flip = pixelX + tooltip.offsetWidth + 18 > tooltip.parentElement.scrollLeft + wrapper.width;
    tooltip.style.left = `${flip ? pixelX - tooltip.offsetWidth - 14 : pixelX + 14}px`;
    tooltip.style.top = `${(margin.top / height) * svgBox.height + 4}px`;
  };
  const hide = () => {
    hover.setAttribute("visibility", "hidden");
    tooltip.hidden = true;
  };
  target.addEventListener("pointermove", (event) => showAt(event.clientX));
  target.addEventListener("pointerdown", (event) => showAt(event.clientX));
  target.addEventListener("pointerleave", hide);
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
  const low = Math.min(0, ...extent);
  const high = Math.max(0, ...extent);
  const range = high - low || 1;
  const zero = (-low / range) * 100;

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
        const widthPct = (Math.abs(value) / range) * 100;
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
  const prefix = currentView === "compare" ? "#compare" : "#world";
  const start = Number($(`${prefix}-start`).value);
  const end = Number($(`${prefix}-end`).value);
  return { from: Number.isFinite(start) && start > 0 ? start : null, to: Number.isFinite(end) && end > 0 ? end : null };
}

function selectView(view, { focus = false, keepYears = true } = {}) {
  const years = keepYears && snapshot ? currentYears() : readParams();
  currentView = view;
  for (const tab of document.querySelectorAll(".country-tabs [role=tab]")) {
    const selected = tab.dataset.view === view;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  $("#story").setAttribute("aria-labelledby", `tab-${view}`);
  $("#abs-view").hidden = view !== "AUS";
  $("#world-country").hidden = view === "compare";
  $("#world-compare").hidden = view !== "compare";

  if (view === "AUS") document.title = baseTitle;
  else if (view === "compare") document.title = message("compare.documentTitle");
  else document.title = message("world.documentTitle", { country: message(`country.${view}`) });

  if (!snapshot) return;
  if (view === "compare") setupCompare(years);
  else setupCountry(view, years);
}

function setupTabs() {
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

export async function startWorld(localeMessages, activeLocale) {
  messages = localeMessages;
  locale = activeLocale;
  baseTitle = messages["metadata.title"] ?? document.title;
  number = new Intl.NumberFormat(locale === "en" ? "en-AU" : "zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  money = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const initial = readParams();
  setupTabs();
  selectView(initial.view, { keepYears: false });

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
