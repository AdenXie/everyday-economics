// "Did my pay beat inflation?" tab. Pay amounts live only in the two inputs and in memory:
// they are never written to the URL, storage or any request, and the AI context skips this view.
import {
  buildWageSeries, calculateWageChange, convertPeriod, defaultRange, formatPeriod, groupAmountInput,
  LATEST, readWageParams, resolvePeriod, wageShareUrl, WAGE_REGIONS,
} from "./wage-calculator.js";
import { loadChinaSnapshot } from "./china.js";
import { drawWageCard, loadCardFonts } from "./wage-card.js";

const svgNS = "http://www.w3.org/2000/svg";
const $ = selector => document.querySelector(selector);

let messages = {};
let locale = "zh";
let onUrlChange = () => {};
let data = null;
let ready = null;
let series = null;
let result = null;
let notice = null;
let resizeObserver = null;
let statusTimer = 0;
const cardMessages = {};

function format(template, values = {}) {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
}

function message(key, values) {
  return format(messages[key] ?? key, values);
}

function numberFormats(lang) {
  const tag = lang === "en" ? "en-AU" : "zh-CN";
  return {
    pct: new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    amount: new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }),
    exact: new Intl.NumberFormat(tag, { maximumFractionDigits: 2 }),
    ratio: new Intl.NumberFormat(tag, { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
    compact: new Intl.NumberFormat(tag, { notation: "compact", maximumFractionDigits: 1 }),
  };
}

function signed(value, formatter) {
  const shown = Math.round(value * 10) / 10;
  const prefix = shown > 0 ? "+" : shown < 0 ? "−" : "";
  return `${prefix}${formatter.format(Math.abs(value))}%`;
}

function money(amount, region, formatter = numberFormats(locale).amount) {
  return message("format.money", { amount: formatter.format(amount), currency: message(`currency.${region}`) });
}

function formatPeriodWith(period, text) {
  return formatPeriod(period, series.kind, (key, values) => format(text[key], values));
}

async function loadData() {
  const fetchJson = async file => {
    const response = await fetch(new URL(`../data/${file}`, import.meta.url), { cache: "no-store" });
    if (!response.ok) throw new Error(`${file} request failed: ${response.status}`);
    return response.json();
  };
  const [quarterly, worldBank, china] = await Promise.all([fetchJson("quarterly.json"), fetchJson("worldbank.json"), loadChinaSnapshot()]);
  return { quarterly, worldBank, china };
}

// ---------- form ----------

function fillPeriods(select, withLatest) {
  select.replaceChildren();
  if (withLatest) {
    const option = document.createElement("option");
    option.value = LATEST;
    option.textContent = message("wage.latestOption");
    select.append(option);
  }
  for (const period of series.periods) {
    const option = document.createElement("option");
    option.value = String(period);
    option.textContent = series.kind === "quarterly" ? formatPeriodWith(period, messages) : message("format.yearOption", { year: period });
    select.append(option);
  }
}

function selectedPeriod(select) {
  const value = select.value;
  if (value === LATEST) return LATEST;
  return series.kind === "quarterly" ? value : Number(value);
}

function setRegion(region, { start, end } = {}) {
  series = buildWageSeries(region, data);
  $("#wage-region").value = region;
  for (const label of document.querySelectorAll(".wage-period-label")) {
    label.textContent = message(series.kind === "quarterly" ? "wage.quarterLabel" : "wage.yearLabel");
  }
  fillPeriods($("#wage-start"), false);
  fillPeriods($("#wage-end"), true);
  const defaults = defaultRange(series);
  const startResolved = resolvePeriod(series, start ?? defaults.start);
  const endResolved = end === LATEST || end === undefined ? { period: LATEST, status: "exact" } : resolvePeriod(series, end);
  notice = null;
  for (const [resolved, requested] of [[startResolved, start], [endResolved, end]]) {
    if (requested === undefined || requested === LATEST) continue;
    if (resolved.status === "invalid") notice = { key: "wage.cutoffInvalid" };
    else if (resolved.status === "afterLast") notice = { key: "wage.cutoffLatest", requested: resolved.requested };
    else if (resolved.status === "beforeFirst") notice = { key: "wage.cutoffEarliest", requested: resolved.requested };
  }
  $("#wage-start").value = String(startResolved.status === "invalid" ? defaults.start : startResolved.period);
  $("#wage-end").value = String(endResolved.status === "invalid" ? LATEST : endResolved.period);
  const currency = message(`currency.${region}`);
  for (const node of document.querySelectorAll("[data-wage-currency]")) node.textContent = currency;
  $("#wage-currency").textContent = message("wage.currencyNote", { currency });
}

function endPeriod() {
  const value = selectedPeriod($("#wage-end"));
  if (value !== LATEST) return { period: value, cutoff: null };
  const resolved = resolvePeriod(series, LATEST);
  return { period: resolved.period, cutoff: resolved.status === "afterLast" ? resolved.requested : null };
}

function showNotice(cutoff) {
  const box = $("#wage-cutoff");
  const active = cutoff !== null ? { key: "wage.cutoffLatest", requested: cutoff } : notice;
  box.hidden = !active;
  if (!active) return;
  box.textContent = message(active.key, {
    requested: active.requested === undefined ? "" : formatPeriodWith(active.requested, messages),
    latest: formatPeriodWith(series.last, messages),
    first: formatPeriodWith(series.first, messages),
  });
}

function writeUrl(start, end) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "wage");
  url.searchParams.set("wageRegion", series.region);
  url.searchParams.set("wageFrom", String(start));
  url.searchParams.set("wageTo", String(selectedPeriod($("#wage-end"))));
  window.history.replaceState({}, "", url);
  onUrlChange();
  const base = new URL("./", window.location.href);
  $("#wage-share-link").value = wageShareUrl(base.href, { region: series.region, start, end });
}

// ---------- render ----------

function update() {
  const start = selectedPeriod($("#wage-start"));
  const { period: end, cutoff } = endPeriod();
  showNotice(cutoff);
  writeUrl(start, end);
  $("#wage-card-output").hidden = true;

  const rawStart = $("#wage-start-amount").value.trim();
  const rawEnd = $("#wage-end-amount").value.trim();
  const error = $("#wage-error");
  if (!rawStart || !rawEnd) {
    result = null;
    error.hidden = true;
    $("#wage-result").hidden = true;
    $("#wage-empty").hidden = false;
    $("#wage-status").textContent = "";
    return;
  }
  const outcome = calculateWageChange(series, { start, end, startWage: rawStart, endWage: rawEnd });
  $("#wage-empty").hidden = true;
  if (!outcome.ok) {
    result = null;
    error.hidden = false;
    error.textContent = message(`wage.error.${outcome.error}`);
    $("#wage-result").hidden = true;
    return;
  }
  error.hidden = true;
  result = outcome;
  renderResult();
}

function renderResult() {
  const formats = numberFormats(locale);
  const region = series.region;
  const startLabel = formatPeriodWith(result.start, messages);
  const endLabel = formatPeriodWith(result.end, messages);
  const startMoney = money(result.startWage, region, formats.exact);
  const endMoney = money(result.endWage, region, formats.exact);
  $("#wage-result").hidden = false;
  $("#wage-nominal").textContent = signed(result.nominalPct, formats.pct);
  $("#wage-nominal-detail").textContent = message("wage.nominalAmounts", { start: startMoney, end: endMoney });
  $("#wage-cpi").textContent = signed(result.cpiPct, formats.pct);
  $("#wage-cpi-detail").textContent = message("wage.cpiValues", { start: formats.exact.format(result.startCpi), end: formats.exact.format(result.endCpi) });
  $("#wage-real").textContent = signed(result.realPct, formats.pct);
  $("#wage-verdict-box").dataset.verdict = result.verdict;
  $("#wage-verdict").textContent = message(`wage.verdict.${result.verdict}`);

  const gapRounded = Math.round(Math.abs(result.gapAmount));
  const explainKey = gapRounded === 0 ? "wage.explainSame" : result.gapAmount > 0 ? "wage.explainMore" : "wage.explainLess";
  $("#wage-explain").textContent = message(explainKey, {
    startPeriod: startLabel, endPeriod: endLabel, start: startMoney,
    required: money(result.requiredEndWage, region), gap: money(Math.abs(result.gapAmount), region),
  });
  $("#wage-formula").textContent = message("wage.formula", {
    wageRatio: formats.ratio.format(result.wageRatio), cpiRatio: formats.ratio.format(result.cpiRatio), real: signed(result.realPct, formats.pct),
  });

  const reference = $("#wage-reference");
  reference.hidden = result.reference === null;
  if (result.reference) reference.textContent = message(`wage.reference.${result.reference}`, { value: signed(result.referencePct, formats.pct) });
  const noteKey = series.kind === "quarterly" ? "wage.noteQuarterly" : series.source === "NBS" ? "wage.noteAnnualNBS" : "wage.noteAnnualWB";
  $("#wage-note-frequency").textContent = message(noteKey, { first: formatPeriodWith(series.first, messages), last: formatPeriodWith(series.last, messages) });
  $("#wage-note-approx").hidden = !result.approximate;
  const link = $("#wage-source-link");
  link.textContent = message(`wage.source.${series.source}`);
  link.href = series.source === "ABS" ? data.quarterly.series.cpi.pageUrl
    : series.source === "NBS" ? (data.china.sources.find(source => /cpi/i.test(source.id))?.url ?? data.china.sources[0].url)
      : data.worldBank.indicators.cpi.pageUrl;

  $("#wage-chart-title").textContent = message("wage.chartRange", { region: message(`country.${region}`), start: startLabel, end: endLabel });
  renderChart();

  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    if (!result) return;
    $("#wage-status").textContent = message("wage.status", {
      verdict: message(`wage.verdict.${result.verdict}`), nominal: signed(result.nominalPct, formats.pct),
      cpi: signed(result.cpiPct, formats.pct), real: signed(result.realPct, formats.pct),
    });
  }, 700);
}

function appendSvg(parent, tag, attributes = {}, text = "") {
  const node = document.createElementNS(svgNS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (text) node.textContent = text;
  parent.append(node);
  return node;
}

function axisPeriod(period) {
  if (series.kind !== "quarterly") return String(period);
  const [year, quarter] = period.split("-Q");
  return locale === "en" ? `Q${quarter} ${year}` : `${year} Q${quarter}`;
}

function renderChart() {
  if (!result) return;
  const svg = $("#wage-chart");
  const box = $("#wage-chart-box");
  const formats = numberFormats(locale);
  const width = Math.max(300, Math.round(box.clientWidth || 640));
  const narrow = width < 560;
  const height = narrow ? 250 : 300;
  const margin = { left: narrow ? 46 : 62, right: narrow ? 100 : 128, top: 22, bottom: 38 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const rows = result.path;
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-label", message("wage.chartAria", {
    start: formatPeriodWith(result.start, messages), end: formatPeriodWith(result.end, messages),
    startAmount: money(result.startWage, series.region), endAmount: money(result.endWage, series.region),
    required: money(result.requiredEndWage, series.region),
  }));
  appendSvg(svg, "title", {}, message("wage.chartSvgTitle"));

  const values = rows.flatMap(row => [row.needed, row.wage]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(maximum - minimum, maximum * .04);
  const rawStep = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(candidate => candidate >= rawStep);
  const yMin = Math.floor(minimum / step) * step;
  const yMax = Math.ceil(maximum / step) * step;
  const x = index => margin.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
  const y = value => margin.top + ((yMax - value) / (yMax - yMin || 1)) * plotHeight;

  for (let value = yMin; value <= yMax + step / 1000; value += step) {
    appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: y(value), y2: y(value), class: "chart-grid" });
    appendSvg(svg, "text", { x: margin.left - 10, y: y(value) + 4, "text-anchor": "end", class: "axis-label y-label" }, formats.compact.format(value));
  }
  appendSvg(svg, "line", { x1: margin.left, x2: margin.left, y1: margin.top, y2: margin.top + plotHeight, class: "chart-axis" });
  const tickCount = Math.min(rows.length, narrow ? 2 : 4);
  const ticks = new Set(Array.from({ length: tickCount }, (_, index) => Math.round(index * (rows.length - 1) / Math.max(1, tickCount - 1))));
  for (const index of ticks) {
    appendSvg(svg, "line", { x1: x(index), x2: x(index), y1: margin.top + plotHeight, y2: margin.top + plotHeight + 5, class: "chart-axis" });
    appendSvg(svg, "text", {
      x: x(index), y: height - 12, class: "axis-label x-label",
      "text-anchor": index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle",
    }, axisPeriod(rows[index].period));
  }

  const last = rows.length - 1;
  const neededPath = rows.map((row, index) => `${index ? "L" : "M"}${x(index).toFixed(2)},${y(row.needed).toFixed(2)}`).join(" ");
  appendSvg(svg, "line", { x1: x(last), x2: x(last), y1: y(rows[last].needed), y2: y(rows[last].wage), class: "wage-gap-line" });
  appendSvg(svg, "path", { d: neededPath, class: "series-path cpi-path" });
  appendSvg(svg, "path", { d: `M${x(0)},${y(rows[0].wage)} L${x(last)},${y(rows[last].wage)}`, class: "series-path wpi-path wage-dash" });
  appendSvg(svg, "circle", { cx: x(0), cy: y(rows[0].wage), r: 5, class: "series-point wpi-point" });

  const ends = [
    { value: rows[last].wage, className: "wpi-point", label: message("wage.endpointWage") },
    { value: rows[last].needed, className: "cpi-point", label: message("wage.endpointNeeded") },
  ];
  const labelY = ends.map(end => y(end.value));
  if (Math.abs(labelY[0] - labelY[1]) < 30) {
    const middle = (labelY[0] + labelY[1]) / 2;
    const direction = labelY[0] <= labelY[1] ? -1 : 1;
    labelY[0] = middle + direction * 15;
    labelY[1] = middle - direction * 15;
  }
  ends.forEach((end, index) => {
    appendSvg(svg, "circle", { cx: x(last), cy: y(end.value), r: 5.5, class: `series-point ${end.className}` });
    const text = appendSvg(svg, "text", { x: x(last) + 10, y: labelY[index] - 2, class: `endpoint-label ${end.className}` }, end.label);
    appendSvg(text, "tspan", { x: x(last) + 10, dy: 13, class: "wage-endpoint-amount" }, formats.amount.format(end.value));
  });
}

// ---------- share ----------

async function messagesFor(lang) {
  if (lang === locale) return messages;
  if (!cardMessages[lang]) {
    const response = await fetch(new URL(`../data/messages.${lang}.json`, import.meta.url), { cache: "no-store" });
    if (!response.ok) throw new Error(`messages.${lang}.json request failed: ${response.status}`);
    cardMessages[lang] = await response.json();
  }
  return cardMessages[lang];
}

async function createCard() {
  if (!result) return;
  const lang = $("#wage-card-language").value;
  const text = await messagesFor(lang);
  const formats = numberFormats(lang);
  const t = (key, values) => format(text[key], values);
  const cardMoney = amount => format(text["format.money"], { amount: formats.amount.format(amount), currency: text[`currency.${series.region}`] });
  const showAmounts = $("#wage-share-amounts").checked;
  const page = new URL("./", window.location.href);
  await loadCardFonts(lang);
  const canvas = drawWageCard(document.createElement("canvas"), {
    lang,
    kicker: t("wage.card.kicker"),
    region: t(`country.${series.region}`),
    period: `${formatPeriodWith(result.start, text)} → ${formatPeriodWith(result.end, text)}`,
    verdict: t(`wage.verdict.${result.verdict}`),
    verdictKind: result.verdict,
    real: signed(result.realPct, formats.pct),
    realLabel: t("wage.card.real"),
    rows: [
      { label: t("wage.card.nominal"), value: signed(result.nominalPct, formats.pct), pct: result.nominalPct, tone: "wpi" },
      { label: t("wage.card.cpi"), value: signed(result.cpiPct, formats.pct), pct: result.cpiPct, tone: "cpi" },
    ],
    amounts: showAmounts ? t("wage.card.amounts", {
      start: cardMoney(result.startWage), end: cardMoney(result.endWage), required: cardMoney(result.requiredEndWage),
    }) : null,
    source: t(`wage.card.source.${series.source}`),
    note: t("wage.card.note"),
    url: `${page.host}${page.pathname}`,
  });
  const url = canvas.toDataURL("image/png");
  $("#wage-card-preview").src = url;
  const download = $("#wage-card-download");
  download.href = url;
  download.download = `wage-vs-inflation-${series.region.toLowerCase()}-${lang}.png`;
  $("#wage-card-output").hidden = false;
}

async function copyLink() {
  const input = $("#wage-share-link");
  const button = $("#wage-copy-link");
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand("copy");
  }
  button.textContent = message("wage.share.copied");
  setTimeout(() => { button.textContent = message("wage.share.copy"); }, 1800);
}

// ---------- setup ----------

function formatAmountField(input) {
  const { value, caret } = groupAmountInput(input.value, input.selectionStart ?? input.value.length);
  if (value !== input.value) {
    input.value = value;
    if (document.activeElement === input) input.setSelectionRange(caret, caret);
  }
}

function bind() {
  $("#wage-region").addEventListener("change", () => {
    const kind = buildWageSeries($("#wage-region").value, data).kind;
    const start = convertPeriod(selectedPeriod($("#wage-start")), kind);
    const endValue = selectedPeriod($("#wage-end"));
    setRegion($("#wage-region").value, { start, end: endValue === LATEST ? LATEST : convertPeriod(endValue, kind) });
    update();
  });
  for (const select of [$("#wage-start"), $("#wage-end")]) {
    select.addEventListener("change", () => { notice = null; update(); });
  }
  for (const input of [$("#wage-start-amount"), $("#wage-end-amount")]) {
    input.addEventListener("input", () => { formatAmountField(input); update(); });
  }
  $("#wage-share-amounts").addEventListener("change", () => { $("#wage-card-output").hidden = true; });
  $("#wage-card-language").addEventListener("change", () => { $("#wage-card-output").hidden = true; });
  $("#wage-card-create").addEventListener("click", () => createCard().catch(error => console.error(error)));
  $("#wage-copy-link").addEventListener("click", copyLink);
  $("#wage-card-language").value = locale;
  resizeObserver = new ResizeObserver(() => renderChart());
  resizeObserver.observe($("#wage-chart-box"));
}

async function setup(preferredRegion) {
  try {
    data = await loadData();
  } catch (error) {
    console.error(error);
    $("#wage-loading").hidden = true;
    $("#wage-load-error").hidden = false;
    return false;
  }
  const params = readWageParams(window.location.search);
  const region = params.region ?? (WAGE_REGIONS.includes(preferredRegion) ? preferredRegion : "AUS");
  setRegion(region, params.region ? { start: params.from ?? undefined, end: params.to ?? LATEST } : { end: LATEST });
  bind();
  $("#wage-loading").hidden = true;
  $("#wage-form").hidden = false;
  return true;
}

export async function showWage(options) {
  messages = options.messages;
  locale = options.locale;
  onUrlChange = options.onUrlChange ?? onUrlChange;
  ready ??= setup(options.region);
  if (await ready) update();
}
