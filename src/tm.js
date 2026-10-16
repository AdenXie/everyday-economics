// Price time machine tab. Amounts here are not personal, so region, amount and dates live in the URL.
import {
  amountDigits, buildPriceSeries, CURRENCY_REFORMS, idleCashPath, pathExtremes, readTimeMachineParams, reformFor,
  timeMachineShareUrl, timeTravel,
} from "./time-machine.js";
import { currentPeriod, formatPeriod, groupAmountInput } from "./wage-calculator.js";
import { loadPriceData } from "./wage.js";
import { attachChartInspector } from "./chart-inspector.js";
import { drawWageCard, loadCardFonts } from "./wage-card.js";
import { STORY_CHAPTERS } from "./story-chapters.js";

const svgNS = "http://www.w3.org/2000/svg";
const $ = selector => document.querySelector(selector);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const DESTATIS_CPI = "https://www.destatis.de/DE/Themen/Wirtschaft/Preise/Verbraucherpreisindex/Publikationen/Downloads-Verbraucherpreise/statistischer-bericht-verbraucherpreisindex-lange-reihen-5611103.html";

let messages = {};
let locale = "zh";
let onUrlChange = () => {};
let data = null;
let ready = null;
let series = null;
let result = null;
let linkNotices = [];
let shownResult = null;
let tween = 0;
let statusTimer = 0;
const cardMessages = {};

function format(template, values = {}) {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
}

function message(key, values) {
  return format(messages[key] ?? key, values);
}

function tag(lang = locale) {
  return lang === "en" ? "en-AU" : "zh-CN";
}

function amountText(value, lang = locale) {
  return new Intl.NumberFormat(tag(lang), amountDigits(value)).format(value);
}

// Fixed conversion rates are shown exactly (1.95583, 1,000, 10).
function rateText(value) {
  return new Intl.NumberFormat(tag(), { maximumFractionDigits: 5 }).format(value);
}

function moneyText(value, region, text = messages, lang = locale) {
  return format(text["format.money"], { amount: amountText(value, lang), currency: text[`currency.${region}`] });
}

function pctText(value, lang = locale, digits = 1) {
  const shown = Number(value.toFixed(digits));
  const prefix = shown > 0 ? "+" : shown < 0 ? "−" : "";
  return `${prefix}${new Intl.NumberFormat(tag(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(value))}%`;
}

function periodText(period, text = messages) {
  return formatPeriod(period, series.kind, (key, values) => format(text[key], values));
}

function inputMoney(text = messages, lang = locale) {
  const reform = reformFor(series.region, result.from);
  if (result.inputUnit === "old") return format(text["tm.moneyOld"], { amount: amountText(result.amount, lang), unit: text[`tm.unitShort.${reform.oldUnit}`] });
  return moneyText(result.amount, series.region, text, lang);
}

// ---------- form ----------

function storyId() {
  if (series.region === "AUS") return "ABS";
  if (series.region === "CHN" && series.source === "NBS") return "CHN_NBS";
  return series.region;
}

function setSeries(region, source, { from, to } = {}) {
  series = buildPriceSeries(region, data, source);
  $("#tm-region").value = region;
  $("#tm-source").value = series.source;
  $("#tm-source-field").hidden = region !== "CHN";
  for (const id of ["#tm-from", "#tm-to"]) $(id).max = String(series.periods.length - 1);
  const index = (period, fallback) => {
    const found = series.periods.indexOf(period);
    return found < 0 ? fallback : found;
  };
  $("#tm-from").value = String(index(from, 0));
  $("#tm-to").value = String(index(to, series.periods.length - 1));
}

function periodAt(slider) {
  return series.periods[Number(slider.value)];
}

function convertForSeries(period, kind) {
  const year = Number(String(period).slice(0, 4));
  return kind === "quarterly" ? `${year}-Q2` : year;
}

function updateUnitControls(from) {
  const reform = reformFor(series.region, from);
  const fieldset = $("#tm-unit");
  fieldset.hidden = !reform;
  const unit = document.querySelector('input[name="tm-unit"]:checked')?.value ?? "old";
  if (reform) {
    $("#tm-unit-old").textContent = message(`tm.unitName.${reform.oldUnit}`);
    $("#tm-unit-new").textContent = message(`tm.unitName.${reform.newUnit}`);
    $("#tm-reform-note").textContent = message(`tm.reformNote.${series.region}`, { year: from });
  }
  $("#tm-amount-unit").textContent = reform && unit === "old" ? message(`tm.unitShort.${reform.oldUnit}`) : message(`currency.${series.region}`);
  return reform ? unit : "new";
}

function sliderLabels(from, to) {
  for (const [slider, output, period] of [[$("#tm-from"), $("#tm-from-label"), from], [$("#tm-to"), $("#tm-to-label"), to]]) {
    const label = period === series.last ? message("tm.latestSuffix", { period: periodText(period) }) : periodText(period);
    output.textContent = label;
    slider.setAttribute("aria-valuetext", label);
  }
}

function showNotice(to) {
  const box = $("#tm-notice");
  const now = currentPeriod(series.kind);
  const lines = linkNotices.map(notice => notice.status === "invalid" ? message("wage.cutoffInvalid")
    : notice.status === "afterLast" ? message("wage.cutoffLatest", { requested: periodText(notice.requested), latest: periodText(series.last) })
      : message("wage.cutoffEarliest", { requested: periodText(notice.requested), first: periodText(series.first) }));
  if (!lines.length && to === series.last && now > series.last) {
    lines.push(message("wage.cutoffLatest", { requested: periodText(now), latest: periodText(series.last) }));
  }
  box.hidden = !lines.length;
  box.textContent = lines.join(" ");
}

function writeUrl(state) {
  const url = new URL(window.location.href);
  for (const key of [...url.searchParams.keys()]) if (key.startsWith("tm")) url.searchParams.delete(key);
  const share = new URL(timeMachineShareUrl(url.href, state));
  for (const [key, value] of share.searchParams) url.searchParams.set(key, value);
  window.history.replaceState({}, "", url);
  onUrlChange();
  $("#tm-share-link").value = timeMachineShareUrl(new URL("./", window.location.href).href, state);
}

// ---------- render ----------

function update() {
  const from = periodAt($("#tm-from"));
  const to = periodAt($("#tm-to"));
  sliderLabels(from, to);
  const unit = updateUnitControls(from);
  showNotice(to);
  $("#tm-card-output").hidden = true;
  const rawAmount = $("#tm-amount").value.trim();
  writeUrl({ region: series.region, source: series.source, amount: rawAmount.replace(/,/g, "") || "100", unit, toUnit: "new", from, to });

  const outcome = timeTravel(series, { from, to, amount: rawAmount, unit });
  const error = $("#tm-error");
  if (!outcome.ok) {
    result = null;
    error.hidden = false;
    error.textContent = message(`tm.error.${outcome.error}`);
    $("#tm-result").hidden = true;
    return;
  }
  error.hidden = true;
  result = outcome;
  renderResult();
}

function headlineText(value) {
  return message("tm.headline", {
    from: periodText(result.from), amount: inputMoney(), to: periodText(result.to), result: moneyText(value, series.region),
  });
}

function animateHeadline() {
  cancelAnimationFrame(tween);
  const target = result.resultCurrent;
  const start = shownResult;
  const node = $("#tm-headline");
  if (start === null || reducedMotion.matches || !Number.isFinite(start) || start === target) {
    shownResult = target;
    node.textContent = headlineText(target);
    return;
  }
  const began = performance.now();
  const step = now => {
    const t = Math.min(1, (now - began) / 380);
    const eased = 1 - (1 - t) ** 3;
    // Interpolate on a log scale so jumps across orders of magnitude (1990s Russia) stay smooth.
    shownResult = start > 0 && target > 0 ? Math.exp(Math.log(start) + (Math.log(target) - Math.log(start)) * eased) : start + (target - start) * eased;
    node.textContent = headlineText(t < 1 ? shownResult : target);
    if (t < 1) tween = requestAnimationFrame(step);
    else shownResult = target;
  };
  tween = requestAnimationFrame(step);
}

function renderResult() {
  const region = series.region;
  $("#tm-result").hidden = false;
  animateHeadline();

  const fromReform = reformFor(region, result.from);
  const converted = $("#tm-converted");
  converted.hidden = result.inputUnit !== "old";
  if (result.inputUnit === "old") {
    converted.textContent = message("tm.converted", {
      amount: amountText(result.amount), unit: message(`tm.unitShort.${fromReform.oldUnit}`),
      rate: rateText(fromReform.perNew), current: moneyText(result.amountCurrent, region),
    });
  }
  const toReform = reformFor(region, result.to);
  const equivalent = $("#tm-old-equivalent");
  equivalent.hidden = !toReform;
  if (toReform) {
    equivalent.textContent = message("tm.oldEquivalent", {
      to: periodText(result.to), amount: amountText(result.resultCurrent * toReform.perNew),
      unit: message(`tm.unitShort.${toReform.oldUnit}`), rate: rateText(toReform.perNew),
    });
  }

  const [early, late] = result.from <= result.to ? [result.from, result.to] : [result.to, result.from];
  const years = new Intl.NumberFormat(tag(), { maximumFractionDigits: 2 }).format(result.years);
  $("#tm-cumulative").textContent = pctText(result.cumulativePct);
  $("#tm-annual").textContent = pctText(result.annualPct, locale, 2);
  $("#tm-span").textContent = message("tm.span", { early: periodText(early), late: periodText(late), years });
  // Near −100% one decimal would round to "−100.0%" (worthless); show enough digits to stay truthful.
  const idleDigits = Math.abs(result.idleCashPct) >= 99.9 ? 3 : 1;
  $("#tm-idle").textContent = pctText(result.idleCashPct, locale, idleDigits);
  $("#tm-idle-box").dataset.trend = result.direction === "same" ? "flat" : result.trend;
  const storyKey = result.direction === "same" ? "tm.story.same" : `tm.story.${Math.abs(result.cumulativePct) < .05 ? "flat" : result.trend}`;
  $("#tm-story").textContent = message(storyKey, {
    early: periodText(early), late: periodText(late), cumulative: pctText(result.cumulativePct),
    cumulativeAbs: pctText(Math.abs(result.cumulativePct)).replace(/^[+−]/, ""), idleAbs: pctText(Math.abs(result.idleCashPct), locale, idleDigits).replace(/^[+−]/, ""),
  });
  const cpiFormat = new Intl.NumberFormat(tag(), { maximumFractionDigits: 3 });
  $("#tm-formula").textContent = message("tm.formula", {
    amount: moneyText(result.amountCurrent, region), toCpi: cpiFormat.format(result.toCpi), fromCpi: cpiFormat.format(result.fromCpi),
    result: moneyText(result.resultCurrent, region),
  });

  renderNotes();
  renderChart();
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { if (result) $("#tm-status").textContent = headlineText(result.resultCurrent); }, 600);
}

function renderNotes() {
  const range = { first: periodText(series.first), last: periodText(series.last) };
  $("#tm-note-frequency").textContent = series.kind === "quarterly" ? message("wage.noteQuarterly", range)
    : message(series.source === "NBS" ? "tm.noteAnnualNBS" : "tm.noteAnnualWB", range);
  const extra = $("#tm-note-extra");
  extra.hidden = !["CHN", "DEU"].includes(series.region);
  if (series.region === "CHN") extra.textContent = message("tm.noteChina");
  if (series.region === "DEU") extra.textContent = message("tm.noteDEU", range);
  const reform = CURRENCY_REFORMS[series.region];
  const reformNote = $("#tm-note-reform");
  reformNote.hidden = !reform;
  if (reform) reformNote.textContent = message(`tm.reformNote.${series.region}`, { year: reform.lastOldYear });

  const links = [];
  const dataLink = series.source === "ABS" ? [message("wage.source.ABS"), data.quarterly.series.cpi.pageUrl]
    : series.source === "NBS" ? [message("wage.source.NBS"), data.china.sources.find(source => /cpi/i.test(source.id))?.url ?? data.china.sources[0].url]
      : [message("wage.source.WB"), data.worldBank.indicators.cpi.pageUrl];
  links.push(dataLink);
  if (reform) reform.sources.forEach((url, index) => links.push([message(`tm.sourceLink.${series.region}.${index}`), url]));
  if (series.region === "DEU") links.push([message("tm.sourceLink.DEU.2"), DESTATIS_CPI]);
  const container = $("#tm-sources");
  container.replaceChildren();
  links.forEach(([label, url], index) => {
    if (index) container.append(document.createTextNode(" · "));
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    container.append(link);
  });
}

function appendSvg(parent, name, attributes = {}, text = "") {
  const node = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
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
  const svg = $("#tm-chart");
  const tooltip = $("#tm-tooltip");
  const baseAmount = result.direction === "backward" ? result.resultCurrent : result.amountCurrent;
  const rows = idleCashPath(series, result.from, result.to, baseAmount);
  svg.replaceChildren();
  tooltip.hidden = true;
  if (rows.length < 2) return;
  const width = 1000;
  const height = 390;
  const margin = { left: 84, right: 70, top: 52, bottom: 60 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = rows.map(row => row.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(maximum - minimum, maximum * .02);
  const raw = span / 5;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const stepSize = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(candidate => candidate >= raw);
  const yMin = Math.max(0, Math.floor(minimum / stepSize) * stepSize);
  const yMax = Math.ceil(maximum / stepSize) * stepSize;
  const x = index => margin.left + (index / (rows.length - 1)) * plotWidth;
  const y = value => margin.top + ((yMax - value) / (yMax - yMin || 1)) * plotHeight;
  const { low, high } = pathExtremes(rows);
  const early = rows[0].period;
  const late = rows.at(-1).period;
  const baseMoney = moneyText(baseAmount, series.region);

  $("#tm-chart-title").textContent = message("tm.chartTitle", { amount: baseMoney, early: periodText(early), late: periodText(late) });
  svg.setAttribute("aria-label", message("tm.chartAria", {
    amount: baseMoney, early: periodText(early), late: periodText(late),
    start: moneyText(rows[0].value, series.region), end: moneyText(rows.at(-1).value, series.region),
    low: moneyText(rows[low].value, series.region), lowPeriod: periodText(rows[low].period),
    high: moneyText(rows[high].value, series.region), highPeriod: periodText(rows[high].period),
  }));
  appendSvg(svg, "title", {}, message("tm.chartSvgTitle"));
  appendSvg(svg, "rect", { x: margin.left - 16, y: margin.top - 6, width: 7, height: plotHeight + 12, rx: 3.5, class: "chart-spine" });

  const tick = new Intl.NumberFormat(tag(), { notation: "compact", maximumFractionDigits: 2 });
  for (let value = yMin; value <= yMax + stepSize / 1000; value += stepSize) {
    appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: y(value), y2: y(value), class: "chart-grid" });
    appendSvg(svg, "text", { x: margin.left - 22, y: y(value) + 4, "text-anchor": "end", class: "axis-label y-label" }, tick.format(value));
  }
  appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: y(baseAmount), y2: y(baseAmount), class: "chart-grid baseline-grid" });
  appendSvg(svg, "line", { x1: margin.left, x2: margin.left, y1: margin.top, y2: margin.top + plotHeight, class: "chart-axis" });

  const periodsPerYear = series.kind === "quarterly" ? 4 : 1;
  const yearsShown = (rows.length - 1) / periodsPerYear;
  const yearStep = [1, 2, 5, 10, 20].find(candidate => yearsShown / candidate <= 6) ?? 20;
  const ticks = new Set([0, rows.length - 1]);
  rows.forEach((row, index) => {
    const year = Number(String(row.period).slice(0, 4));
    const firstOfYear = series.kind !== "quarterly" || String(row.period).endsWith("Q1");
    const clear = index >= yearStep * periodsPerYear * .5 && rows.length - 1 - index >= yearStep * periodsPerYear * .5;
    if (firstOfYear && year % yearStep === 0 && clear) ticks.add(index);
  });
  for (const index of ticks) {
    appendSvg(svg, "line", { x1: x(index), x2: x(index), y1: margin.top + plotHeight, y2: margin.top + plotHeight + 6, class: "chart-axis" });
    appendSvg(svg, "text", {
      x: x(index), y: height - 22, class: "axis-label x-label",
      "text-anchor": index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle",
    }, axisPeriod(rows[index].period));
  }

  // Important years: starts of the sourced history chapters, plus any currency changeover.
  const marks = [];
  for (const event of STORY_CHAPTERS[storyId()]?.events ?? []) {
    const period = series.kind === "quarterly" ? `${event.start}-Q1` : event.start;
    const index = rows.findIndex(row => row.period === period);
    if (index > 0 && index < rows.length - 1) marks.push({ index, label: String(event.start), className: "tm-mark" });
  }
  const reform = CURRENCY_REFORMS[series.region];
  if (reform) {
    const index = rows.findIndex(row => Number(String(row.period).slice(0, 4)) === reform.lastOldYear + 1);
    if (index > 0) marks.push({ index, label: `${reform.lastOldYear + 1} · ${message("tm.markReform")}`, className: "tm-mark tm-mark-reform" });
  }
  marks.sort((a, b) => a.index - b.index);
  let lastLabelX = -Infinity;
  for (const mark of marks) {
    const px = x(mark.index);
    appendSvg(svg, "line", { x1: px, x2: px, y1: margin.top - 4, y2: margin.top + plotHeight, class: `${mark.className}-line` });
    if (px - lastLabelX < 64) continue;
    appendSvg(svg, "text", { x: px, y: margin.top - 12, "text-anchor": "middle", class: mark.className }, mark.label);
    lastLabelX = px;
  }

  const path = rows.map((row, index) => `${index ? "L" : "M"}${x(index).toFixed(2)},${y(row.value).toFixed(2)}`).join(" ");
  appendSvg(svg, "path", { d: path, class: "series-path wpi-path" });
  // The starting point is already the dashed baseline, so it gets no extreme label of its own.
  const extremes = [[low, "tm.markLow"], [high, "tm.markHigh"]].filter(([index], position) => index > 0 && (position === 0 || high !== low));
  for (const [index, key] of extremes) {
    const cy = y(rows[index].value);
    appendSvg(svg, "circle", { cx: x(index), cy, r: 5.5, class: "series-point wpi-point" });
    const below = key === "tm.markLow" ? cy + 22 : cy - 12;
    const anchor = index < rows.length * .15 ? "start" : index > rows.length * .85 ? "end" : "middle";
    appendSvg(svg, "text", { x: x(index), y: Math.min(margin.top + plotHeight - 4, Math.max(margin.top + 12, below)), "text-anchor": anchor, class: "endpoint-label wpi-point" },
      `${message(key)} ${amountText(rows[index].value)}`);
  }

  const rawFormat = new Intl.NumberFormat(tag(), { maximumFractionDigits: 3 });
  attachChartInspector({
    svg, tooltip, rows, x, y, width, height, margin,
    periodLabel: row => periodText(row.period),
    note: message("tm.inspectNote"), gapLabel: "",
    formatIndex: value => moneyText(value, series.region),
    formatGap: value => String(value),
    series: [{ normalizedKey: "value", rawKey: "cpi", label: message("tm.seriesLabel"), className: "wpi", rawLabel: message("tm.rawCpi"), formatRaw: value => rawFormat.format(value) }],
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
  const lang = $("#tm-card-language").value;
  const text = await messagesFor(lang);
  const t = (key, values) => format(text[key], values);
  await loadCardFonts(lang);
  const page = new URL("./", window.location.href);
  const from = periodText(result.from, text);
  const to = periodText(result.to, text);
  const source = series.source === "ABS" ? t("wage.card.source.ABS") : series.source === "NBS" ? t("wage.card.source.NBS") : t("tm.card.source.WB");
  const canvas = drawWageCard(document.createElement("canvas"), {
    lang,
    kicker: t("tm.card.kicker"),
    region: t(`country.${series.region}`),
    period: `${from} → ${to}`,
    verdict: t("tm.card.from", { from, amount: inputMoney(text, lang) }),
    verdictKind: "flat",
    real: moneyText(result.resultCurrent, series.region, text, lang),
    realLabel: t("tm.card.to", { to }),
    rows: [
      { label: t("tm.cumulativeLabel"), value: pctText(result.cumulativePct, lang), pct: result.cumulativePct, tone: "cpi" },
      { label: t("tm.annualLabel"), value: pctText(result.annualPct, lang, 2), pct: result.annualPct, tone: "cpi" },
    ],
    bars: false,
    amounts: null,
    source,
    note: t("tm.card.note"),
    url: `${page.host}${page.pathname}`,
  });
  const url = canvas.toDataURL("image/png");
  $("#tm-card-preview").src = url;
  const download = $("#tm-card-download");
  download.href = url;
  download.download = `price-time-machine-${series.region.toLowerCase()}-${lang}.png`;
  $("#tm-card-output").hidden = false;
}

async function copyLink() {
  const input = $("#tm-share-link");
  const button = $("#tm-copy-link");
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

function bind() {
  const changeSeries = (region, source) => {
    const from = periodAt($("#tm-from"));
    const to = periodAt($("#tm-to"));
    const next = buildPriceSeries(region, data, source);
    const atLatest = to === series.last;
    linkNotices = [];
    setSeries(region, source, { from: convertForSeries(from, next.kind), to: atLatest ? next.last : convertForSeries(to, next.kind) });
    update();
  };
  $("#tm-region").addEventListener("change", () => changeSeries($("#tm-region").value, "WB"));
  $("#tm-source").addEventListener("change", () => changeSeries("CHN", $("#tm-source").value));
  for (const slider of [$("#tm-from"), $("#tm-to")]) {
    slider.addEventListener("input", () => { linkNotices = []; update(); });
  }
  $("#tm-swap").addEventListener("click", () => {
    const from = $("#tm-from").value;
    $("#tm-from").value = $("#tm-to").value;
    $("#tm-to").value = from;
    linkNotices = [];
    update();
  });
  $("#tm-amount").addEventListener("input", () => {
    const input = $("#tm-amount");
    const { value, caret } = groupAmountInput(input.value, input.selectionStart ?? input.value.length);
    if (value !== input.value) {
      input.value = value;
      if (document.activeElement === input) input.setSelectionRange(caret, caret);
    }
    update();
  });
  for (const radio of document.querySelectorAll('input[name="tm-unit"]')) radio.addEventListener("change", update);
  $("#tm-card-language").addEventListener("change", () => { $("#tm-card-output").hidden = true; });
  $("#tm-card-create").addEventListener("click", () => createCard().catch(error => console.error(error)));
  $("#tm-copy-link").addEventListener("click", copyLink);
  $("#tm-card-language").value = locale;
}

async function setup(preferredRegion) {
  try {
    data = await loadPriceData();
  } catch (error) {
    console.error(error);
    $("#tm-loading").hidden = true;
    $("#tm-load-error").hidden = false;
    return false;
  }
  const hasLink = new URLSearchParams(window.location.search).has("tmRegion");
  const search = hasLink ? window.location.search : `?tmRegion=${encodeURIComponent(preferredRegion ?? "AUS")}`;
  const params = readTimeMachineParams(search, data);
  linkNotices = params.notices;
  setSeries(params.region, params.source, { from: params.from, to: params.to });
  $("#tm-amount").value = groupAmountInput(String(params.amount)).value;
  const unitRadio = document.querySelector(`input[name="tm-unit"][value="${params.unit}"]`);
  if (unitRadio) unitRadio.checked = true;
  bind();
  $("#tm-loading").hidden = true;
  $("#tm-form").hidden = false;
  return true;
}

export async function showTimeMachine(options) {
  messages = options.messages;
  locale = options.locale;
  onUrlChange = options.onUrlChange ?? onUrlChange;
  ready ??= setup(options.region);
  if (await ready) update();
}
