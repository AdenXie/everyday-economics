// Scroll story page: a sticky chart follows the step in view. Steps are generated from
// SCROLLY_STORIES so another economy's story only needs data, chapters and copy.
import { buildScrollySteps, calculatorHref, interpolateFrame, SCROLLY_STORIES, stepFrame, stepNumbers } from "./scrolly-stories.js";

const svgNS = "http://www.w3.org/2000/svg";
const locale = document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "zh";
const number = new Intl.NumberFormat(locale === "en" ? "en-AU" : "zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const narrowLayout = window.matchMedia("(max-width: 899px)");
const $ = selector => document.querySelector(selector);

let messages = {};
let snapshot = null;
let steps = [];
let active = -1;
let frame = null;
let animation = 0;
let observer = null;

function message(key, values = {}) {
  const template = messages[key] ?? key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
}

function signed(value) {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${number.format(Math.abs(value))}%`;
}

function quarterLabel(period) {
  const [year, quarter] = period.split("-Q");
  return message("format.quarterOption", { year, quarter });
}

function shortQuarter(period) {
  const [year, quarter] = period.split("-Q");
  return locale === "en" ? `Q${quarter} ${year}` : `${year} Q${quarter}`;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function appendSvg(parent, tag, attributes = {}, text = "") {
  const node = document.createElementNS(svgNS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (text) node.textContent = text;
  parent.append(node);
  return node;
}

function numbersText(step) {
  const values = stepNumbers(snapshot, step);
  return message("scrolly.numbers", {
    start: quarterLabel(values.start), end: quarterLabel(values.end),
    cpi: signed(values.cpiPct), wpi: signed(values.wpiPct), adjusted: signed(values.adjustedPct),
  });
}

// ---------- steps ----------

function stepValues(step) {
  const values = stepNumbers(snapshot, step);
  return { start: quarterLabel(values.start), end: quarterLabel(values.end), cpi: signed(values.cpiPct), wpi: signed(values.wpiPct) };
}

function stepTitle(step) {
  return message(step.titleKey, stepValues(step));
}

function renderSteps(storyId) {
  const list = $("#scrolly-steps");
  list.replaceChildren();
  steps.forEach((step, index) => {
    const item = element("li", `scrolly-step scrolly-${step.kind}`);
    item.tabIndex = 0;
    item.dataset.step = String(index);
    item.setAttribute("aria-labelledby", `scrolly-step-${index}`);
    const card = element("div", "scrolly-card");
    const meta = message("scrolly.stepCount", { n: index + 1, total: steps.length });
    card.append(element("p", "scrolly-meta", step.years ? `${step.years} · ${meta}` : meta));
    const heading = element("h2", "", stepTitle(step));
    heading.id = `scrolly-step-${index}`;
    card.append(heading);
    card.append(element("p", "scrolly-body", message(step.bodyKey, stepValues(step))));
    card.append(element("p", "scrolly-numbers", numbersText(step)));
    if (step.sources.length) {
      const sources = element("p", "scrolly-step-sources");
      for (const source of step.sources) {
        const link = element("a", "", message(source.labelKey));
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        sources.append(link);
      }
      card.append(sources);
    }
    if (step.calculator) {
      const link = element("a", "scrolly-cta", message(`scrolly.${storyId}.outro.cta`, { from: quarterLabel(step.calculator.from) }));
      link.href = calculatorHref(new URL("../", window.location.href).href, step.calculator);
      card.append(link);
    }
    item.append(card);
    list.append(item);
  });
}

function activate(index, { announce = true } = {}) {
  if (index === active || !steps[index]) return;
  active = index;
  for (const node of document.querySelectorAll(".scrolly-step")) node.classList.toggle("is-active", Number(node.dataset.step) === index);
  const step = steps[index];
  const target = stepFrame(snapshot, step);
  $("#scrolly-figure-title").textContent = `${shortQuarter(step.view[0])} — ${shortQuarter(step.view[1])}`;
  $("#scrolly-chart").setAttribute("aria-label", message("scrolly.chartAria", { title: stepTitle(step), numbers: numbersText(step) }));
  if (announce) $("#scrolly-live").textContent = message("scrolly.live", { title: stepTitle(step), numbers: numbersText(step) });
  animateTo(target);
}

function animateTo(target) {
  cancelAnimationFrame(animation);
  if (!frame || reducedMotion.matches) {
    frame = target;
    drawChart();
    return;
  }
  const from = frame;
  const started = performance.now();
  const duration = 650;
  const tick = now => {
    const t = Math.min(1, (now - started) / duration);
    const eased = t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    frame = interpolateFrame(from, target, eased);
    drawChart();
    if (t < 1) animation = requestAnimationFrame(tick);
  };
  animation = requestAnimationFrame(tick);
}

// ---------- chart ----------

function niceStep(span) {
  const raw = span / 5;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(candidate => candidate >= raw);
}

function drawChart() {
  if (!frame) return;
  const svg = $("#scrolly-chart");
  const box = $("#scrolly-chart-box");
  const width = Math.max(280, Math.round(box.clientWidth));
  const height = Math.max(180, Math.round(box.clientHeight));
  const compact = width < 520;
  const margin = { left: compact ? 38 : 50, right: compact ? 40 : 52, top: compact ? 26 : 34, bottom: compact ? 26 : 32 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const rows = snapshot.observations;
  const base = rows[0];
  const { x0, x1, y0, y1, band0, band1 } = frame;
  const x = index => margin.left + ((index - x0) / Math.max(x1 - x0, 1e-6)) * plotWidth;
  const y = value => margin.top + ((y1 - value) / Math.max(y1 - y0, 1e-6)) * plotHeight;
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const clipId = "scrolly-clip";
  const defs = appendSvg(svg, "defs");
  appendSvg(appendSvg(defs, "clipPath", { id: clipId }), "rect", { x: margin.left, y: margin.top - 4, width: plotWidth, height: plotHeight + 8 });

  const step = niceStep(y1 - y0);
  for (let value = Math.ceil(y0 / step) * step; value <= y1; value += step) {
    appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: y(value), y2: y(value), class: Math.abs(value - 100) < 1e-6 ? "chart-grid baseline-grid" : "chart-grid" });
    appendSvg(svg, "text", { x: margin.left - 8, y: y(value) + 4, "text-anchor": "end", class: "axis-label y-label" }, number.format(value).replace(/[.,]0$/, ""));
  }

  const plot = appendSvg(svg, "g", { "clip-path": `url(#${clipId})` });
  const isWhole = Math.round(band0) === 0 && Math.round(band1) === rows.length - 1;
  if (!isWhole) {
    appendSvg(plot, "rect", { x: x(band0), y: margin.top - 4, width: Math.max(2, x(band1) - x(band0)), height: plotHeight + 8, class: "scrolly-band" });
  }
  const visible = [Math.max(0, Math.floor(x0) - 1), Math.min(rows.length - 1, Math.ceil(x1) + 1)];
  for (const [key, className] of [["cpiIndex", "cpi-path"], ["wpiIndex", "wpi-path"]]) {
    const points = [];
    for (let index = visible[0]; index <= visible[1]; index += 1) points.push(`${points.length ? "L" : "M"}${x(index).toFixed(1)},${y(100 * rows[index][key] / base[key]).toFixed(1)}`);
    appendSvg(plot, "path", { d: points.join(" "), class: `series-path ${className}` });
  }
  appendSvg(svg, "line", { x1: margin.left, x2: margin.left, y1: margin.top, y2: margin.top + plotHeight, class: "chart-axis" });

  // x ticks: years inside the frame, thinned to fit.
  const yearsShown = (x1 - x0) / 4;
  const yearStep = [1, 2, 5, 10].find(candidate => yearsShown / candidate <= (compact ? 4 : 7)) ?? 10;
  for (let index = Math.ceil(x0); index <= Math.floor(x1); index += 1) {
    const [year, quarter] = rows[index].period.split("-Q").map(Number);
    if (quarter !== 1 || year % yearStep !== 0) continue;
    appendSvg(svg, "line", { x1: x(index), x2: x(index), y1: margin.top + plotHeight, y2: margin.top + plotHeight + 5, class: "chart-axis" });
    appendSvg(svg, "text", { x: x(index), y: height - (compact ? 8 : 10), "text-anchor": "middle", class: "axis-label x-label" }, String(year));
  }

  // Annotation: highlighted range with the values at each end.
  const current = steps[active];
  if (!isWhole && current?.kind === "chapter") {
    const label = appendSvg(svg, "text", { x: (x(band0) + x(band1)) / 2, y: margin.top - 10, "text-anchor": "middle", class: "scrolly-band-label" }, current.years);
    label.setAttribute("aria-hidden", "true");
    for (const index of [Math.round(band0), Math.round(band1)]) {
      for (const [key, className] of [["cpiIndex", "cpi-point"], ["wpiIndex", "wpi-point"]]) {
        appendSvg(plot, "circle", { cx: x(index), cy: y(100 * rows[index][key] / base[key]), r: 4.5, class: `series-point ${className}` });
      }
    }
  }
  if (current?.kind === "intro") {
    appendSvg(svg, "circle", { cx: x(0), cy: y(100), r: 5, class: "series-point scrolly-origin" });
    appendSvg(svg, "text", { x: x(0) + 10, y: y(100) + 20, class: "scrolly-band-label" }, message("scrolly.originLabel"));
  }
  const lastIndex = Math.min(rows.length - 1, Math.round(x1));
  const endValues = [["cpiIndex", "cpi-point", "CPI"], ["wpiIndex", "wpi-point", "WPI"]].map(([key, className, name]) => ({
    className, name, value: 100 * rows[lastIndex][key] / base[key],
  }));
  const labelY = endValues.map(entry => y(entry.value));
  if (Math.abs(labelY[0] - labelY[1]) < 14) {
    const middle = (labelY[0] + labelY[1]) / 2;
    const direction = labelY[0] <= labelY[1] ? -1 : 1;
    labelY[0] = middle + direction * 7;
    labelY[1] = middle - direction * 7;
  }
  endValues.forEach((entry, index) => {
    appendSvg(svg, "text", { x: width - margin.right + 6, y: labelY[index] + 4, class: `endpoint-label ${entry.className}` }, compact ? entry.name : `${entry.name} ${Math.round(entry.value)}`);
  });
}

// ---------- observers and keyboard ----------

function observe() {
  observer?.disconnect();
  // The trigger line sits in the middle of the reading area: below the sticky chart on phones.
  const rootMargin = narrowLayout.matches ? "-62% 0px -30% 0px" : "-45% 0px -45% 0px";
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) activate(Number(entry.target.dataset.step));
  }, { rootMargin });
  for (const node of document.querySelectorAll(".scrolly-step")) observer.observe(node);
}

function bindKeyboard() {
  const list = $("#scrolly-steps");
  list.addEventListener("focusin", event => {
    const step = event.target.closest(".scrolly-step");
    if (step) activate(Number(step.dataset.step));
  });
  list.addEventListener("keydown", event => {
    const step = event.target.closest(".scrolly-step");
    if (!step || event.target !== step) return;
    const offset = { ArrowDown: 1, PageDown: 1, j: 1, ArrowUp: -1, PageUp: -1, k: -1 }[event.key];
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      list.querySelector(`[data-step="${event.key === "Home" ? 0 : steps.length - 1}"]`)?.focus();
      return;
    }
    if (!offset) return;
    const next = list.querySelector(`[data-step="${Number(step.dataset.step) + offset}"]`);
    if (!next) return;
    event.preventDefault();
    next.focus();
  });
}

function renderSources() {
  const list = $("#scrolly-source-links");
  list.replaceChildren();
  for (const series of [snapshot.series.cpi, snapshot.series.wpi]) {
    const item = element("li");
    const link = element("a", "", `${series.publication} · ${series.seriesId}`);
    link.href = series.pageUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    item.append(link, document.createTextNode(` · ${message("format.releaseDate", { date: series.releaseDate })}`));
    list.append(item);
  }
}

async function start() {
  const storyId = document.querySelector(".scrolly").dataset.story;
  try {
    const [messageResponse, snapshotResponse] = await Promise.all([
      fetch(new URL(`../data/messages.${locale}.json`, import.meta.url), { cache: "no-store" }),
      fetch(new URL(`../data/${SCROLLY_STORIES[storyId].snapshot}`, import.meta.url), { cache: "no-store" }),
    ]);
    if (!messageResponse.ok || !snapshotResponse.ok) throw new Error("Story data request failed.");
    messages = await messageResponse.json();
    snapshot = await snapshotResponse.json();
  } catch (error) {
    console.error(error);
    $("#scrolly-error").hidden = false;
    return;
  }
  steps = buildScrollySteps(storyId, snapshot);
  renderSteps(storyId);
  renderSources();
  bindKeyboard();
  activate(0, { announce: false });
  observe();
  narrowLayout.addEventListener("change", observe);
  new ResizeObserver(() => drawChart()).observe($("#scrolly-chart-box"));
}

start();
