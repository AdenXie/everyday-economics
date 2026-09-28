import { calculateWindow } from "./analysis.js";

const svgNS = "http://www.w3.org/2000/svg";
const locale = document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "zh";
const number = new Intl.NumberFormat(locale === "en" ? "en-AU" : "zh-AU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const money = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const elements = {
  start: document.querySelector("#start-quarter"),
  end: document.querySelector("#end-quarter"),
  chart: document.querySelector("#trend-chart"),
  selectedRange: document.querySelector("#selected-range"),
  snapshotStamp: document.querySelector("#snapshot-stamp"),
  dataRange: document.querySelector("#data-range"),
  cpiGrowth: document.querySelector("#cpi-growth"),
  wpiGrowth: document.querySelector("#wpi-growth"),
  basketValue: document.querySelector("#basket-value"),
  comparisonResult: document.querySelector("#comparison-result"),
  comparisonDetail: document.querySelector("#comparison-detail"),
  cpiSourceLink: document.querySelector("#cpi-source-link"),
  wpiSourceLink: document.querySelector("#wpi-source-link"),
  cpiSourceDetail: document.querySelector("#cpi-source-detail"),
  wpiSourceDetail: document.querySelector("#wpi-source-detail"),
  cpiSourceDate: document.querySelector("#cpi-source-date"),
  wpiSourceDate: document.querySelector("#wpi-source-date"),
  languageZh: document.querySelector("#language-zh"),
  languageEn: document.querySelector("#language-en"),
  error: document.querySelector("#load-error"),
};

let messages = {};

function message(key, values = {}) {
  const template = messages[key] ?? key;
  return Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), template);
}

function formatQuarter(period) {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!match) return period;
  const [, year, quarter] = match;
  return locale === "en" ? `Q${quarter} ${year}` : `${year} 年第 ${quarter} 季度`;
}

function quarterOption(period) {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!match) return period;
  const [, year, quarter] = match;
  return message("format.quarterOption", { year, quarter });
}

function signedPct(value) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${number.format(value)}%`;
}

function updateLanguageLinks() {
  if (!elements.languageZh || !elements.languageEn || !elements.start.value || !elements.end.value) return;
  const currentDirectory = new URL("./", window.location.href);
  const targets = locale === "en"
    ? { zh: new URL("../", currentDirectory), en: currentDirectory }
    : { zh: currentDirectory, en: new URL("./en/", currentDirectory) };

  for (const [link, target, current] of [
    [elements.languageZh, targets.zh, locale === "zh"],
    [elements.languageEn, targets.en, locale === "en"],
  ]) {
    target.search = window.location.search;
    target.hash = window.location.hash;
    target.searchParams.set("start", elements.start.value);
    target.searchParams.set("end", elements.end.value);
    link.href = target.href;
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function updateRangeInAddress() {
  const url = new URL(window.location.href);
  url.searchParams.set("start", elements.start.value);
  url.searchParams.set("end", elements.end.value);
  window.history.replaceState({}, "", url);
  updateLanguageLinks();
}

function appendSvg(tagName, attributes = {}, text = "") {
  const element = document.createElementNS(svgNS, tagName);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  if (text) element.textContent = text;
  return element;
}

function setSourceLinks(snapshot) {
  const cpi = snapshot.series.cpi;
  const wpi = snapshot.series.wpi;
  elements.snapshotStamp.textContent = message("format.snapshotStamp", { date: snapshot.snapshotDate });
  elements.dataRange.textContent = message("format.dataRange", {
    first: formatQuarter(snapshot.firstQuarter),
    latest: formatQuarter(snapshot.latestQuarter),
    count: snapshot.observationCount,
    snapshot: snapshot.snapshotDate,
  });
  elements.cpiSourceLink.href = cpi.pageUrl;
  elements.cpiSourceLink.textContent = cpi.publication;
  elements.wpiSourceLink.href = wpi.pageUrl;
  elements.wpiSourceLink.textContent = wpi.publication;
  elements.cpiSourceDetail.textContent = message("sources.cpiDetail");
  elements.wpiSourceDetail.textContent = message("sources.wpiDetail");
  elements.cpiSourceDate.textContent = message("format.releaseDate", { date: cpi.releaseDate });
  elements.wpiSourceDate.textContent = message("format.releaseDate", { date: wpi.releaseDate });
}

function populateQuarterSelects(snapshot) {
  const periods = new Set(snapshot.observations.map((row) => row.period));
  for (const row of snapshot.observations) {
    const startOption = document.createElement("option");
    startOption.value = row.period;
    startOption.textContent = quarterOption(row.period);
    elements.start.append(startOption);

    const endOption = startOption.cloneNode(true);
    elements.end.append(endOption);
  }

  const parameters = new URLSearchParams(window.location.search);
  const requestedStart = parameters.get("start");
  const requestedEnd = parameters.get("end");
  const validStart = periods.has(requestedStart) ? requestedStart : snapshot.firstQuarter;
  const validEnd = periods.has(requestedEnd) ? requestedEnd : snapshot.latestQuarter;
  const [start, end] = validStart <= validEnd ? [validStart, validEnd] : [snapshot.firstQuarter, snapshot.latestQuarter];
  elements.start.value = start;
  elements.end.value = end;
  updateLanguageLinks();
}

function renderChart(rows, analysis) {
  const svg = elements.chart;
  svg.replaceChildren();
  svg.setAttribute("aria-label", message("format.chartAria", {
    start: formatQuarter(analysis.start.period),
    end: formatQuarter(analysis.end.period),
    cpi: signedPct(analysis.cpiGrowthPct),
    wpi: signedPct(analysis.wpiGrowthPct),
  }));

  const title = appendSvg("title", {}, message("chart.svgTitle"));
  const desc = appendSvg("desc", {}, message("chart.svgDesc"));
  svg.append(title, desc);

  const width = 1000;
  const height = 390;
  const margin = { left: 72, right: 58, top: 28, bottom: 60 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const allValues = rows.flatMap((row) => [row.cpiNormalized, row.wpiNormalized]);
  const minimum = Math.min(...allValues);
  const maximum = Math.max(...allValues);
  let yMin = Math.floor((minimum - 3) / 5) * 5;
  let yMax = Math.ceil((maximum + 3) / 5) * 5;
  if (yMax - yMin < 10) {
    yMin = Math.floor((minimum - 5) / 5) * 5;
    yMax = Math.ceil((maximum + 5) / 5) * 5;
  }
  if (yMin === yMax) yMax = yMin + 10;

  const x = (index) => margin.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
  const y = (value) => margin.top + ((yMax - value) / (yMax - yMin)) * plotHeight;

  svg.append(appendSvg("rect", {
    x: margin.left - 16,
    y: margin.top - 6,
    width: 7,
    height: plotHeight + 12,
    rx: 3.5,
    class: "chart-spine",
  }));

  const yTicks = 5;
  for (let index = 0; index <= yTicks; index += 1) {
    const value = yMin + ((yMax - yMin) * index) / yTicks;
    const position = y(value);
    svg.append(appendSvg("line", {
      x1: margin.left,
      x2: width - margin.right,
      y1: position,
      y2: position,
      class: value === 100 ? "chart-grid baseline-grid" : "chart-grid",
    }));
    svg.append(appendSvg("text", {
      x: margin.left - 22,
      y: position + 4,
      "text-anchor": "end",
      class: "axis-label y-label",
    }, number.format(value)));
  }

  svg.append(appendSvg("line", {
    x1: margin.left,
    x2: margin.left,
    y1: margin.top,
    y2: margin.top + plotHeight,
    class: "chart-axis",
  }));

  const desiredTicks = Math.min(5, rows.length);
  const xTickIndexes = new Set();
  for (let index = 0; index < desiredTicks; index += 1) {
    xTickIndexes.add(rows.length === 1 ? 0 : Math.round((index * (rows.length - 1)) / (desiredTicks - 1)));
  }
  for (const index of xTickIndexes) {
    const position = x(index);
    svg.append(appendSvg("line", {
      x1: position,
      x2: position,
      y1: margin.top + plotHeight,
      y2: margin.top + plotHeight + 6,
      class: "chart-axis",
    }));
    svg.append(appendSvg("text", {
      x: position,
      y: height - 22,
      "text-anchor": index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle",
      class: "axis-label x-label",
    }, formatQuarter(rows[index].period)));
  }

  const makePath = (key) => rows.map((row, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(row[key]).toFixed(2)}`).join(" ");
  svg.append(appendSvg("path", { d: makePath("cpiNormalized"), class: "series-path cpi-path" }));
  svg.append(appendSvg("path", { d: makePath("wpiNormalized"), class: "series-path wpi-path" }));

  const lastIndex = rows.length - 1;
  for (const [key, className, label] of [
    ["cpiNormalized", "cpi-point", "CPI"],
    ["wpiNormalized", "wpi-point", "WPI"],
  ]) {
    const row = rows[lastIndex];
    svg.append(appendSvg("circle", { cx: x(lastIndex), cy: y(row[key]), r: 5.5, class: `series-point ${className}` }));
    svg.append(appendSvg("text", {
      x: x(lastIndex) + 12,
      y: y(row[key]) + 4,
      class: `endpoint-label ${className}`,
    }, label));
  }
}

function render(snapshot) {
  const startPeriod = elements.start.value;
  const endPeriod = elements.end.value;
  const analysis = calculateWindow(snapshot.observations, startPeriod, endPeriod);
  renderChart(analysis.rows, analysis);

  elements.selectedRange.textContent = `${formatQuarter(analysis.start.period)} — ${formatQuarter(analysis.end.period)}`;
  elements.cpiGrowth.textContent = signedPct(analysis.cpiGrowthPct);
  elements.wpiGrowth.textContent = signedPct(analysis.wpiGrowthPct);
  elements.basketValue.textContent = `A$${money.format(analysis.cpiIndexed100)}`;

  const gap = analysis.differencePp;
  if (Math.abs(gap) < 0.05) {
    elements.comparisonResult.textContent = message("comparison.same");
    elements.comparisonDetail.textContent = message("comparison.sameDetail", { gap: number.format(Math.abs(gap)) });
  } else if (gap > 0) {
    elements.comparisonResult.textContent = message("comparison.wpiMore", { gap: number.format(gap) });
    elements.comparisonDetail.textContent = message("comparison.wpiMoreDetail");
  } else {
    elements.comparisonResult.textContent = message("comparison.wpiLess", { gap: number.format(Math.abs(gap)) });
    elements.comparisonDetail.textContent = message("comparison.wpiLessDetail");
  }
}

async function start() {
  try {
    const [localeResponse, snapshotResponse] = await Promise.all([
      fetch(new URL(`../data/messages.${locale}.json`, import.meta.url), { cache: "no-store" }),
      fetch(new URL("../data/quarterly.json", import.meta.url), { cache: "no-store" }),
    ]);
    if (!localeResponse.ok) throw new Error(`Language data request failed: ${localeResponse.status}`);
    if (!snapshotResponse.ok) throw new Error(message("error.snapshotRequest", { status: snapshotResponse.status }));
    messages = await localeResponse.json();
    const snapshot = await snapshotResponse.json();
    setSourceLinks(snapshot);
    populateQuarterSelects(snapshot);
    elements.start.addEventListener("change", () => {
      if (elements.start.value > elements.end.value) elements.end.value = elements.start.value;
      updateRangeInAddress();
      render(snapshot);
    });
    elements.end.addEventListener("change", () => {
      if (elements.end.value < elements.start.value) elements.start.value = elements.end.value;
      updateRangeInAddress();
      render(snapshot);
    });
    render(snapshot);
  } catch (error) {
    console.error(error);
    elements.error.hidden = false;
    elements.error.textContent = message("error.load");
    elements.snapshotStamp.textContent = message("error.snapshotUnavailable");
  }
}

start();
