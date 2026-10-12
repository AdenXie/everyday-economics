import test from "node:test";
import assert from "node:assert/strict";
import { attachChartInspector } from "../src/chart-inspector.js";

function makeNode(name, ownerDocument = null) {
  const listeners = new Map();
  const node = {
    name,
    ownerDocument,
    children: [],
    attributes: {},
    style: {},
    hidden: false,
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: 0,
    clientHeight: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    rect: { left: 0, top: 0, width: 0, height: 0 },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    listenerCount(type) { return listeners.get(type)?.size ?? 0; },
    dispatch(type, values = {}) {
      const event = {
        target: this,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        ...values,
      };
      for (const handler of listeners.get(type) ?? []) handler(event);
      return event;
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    append(...children) {
      for (const child of children) {
        child.parentElement = this;
        this.children.push(child);
      }
    },
    replaceChildren(...children) {
      this.children = [];
      this.append(...children);
    },
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    },
    contains(target) {
      return this === target || this.children.some(child => child.contains(target));
    },
    getBoundingClientRect() { return this.rect; },
  };
  Object.defineProperty(node, "textContent", {
    get() { return node.text ?? node.children.map(child => child.textContent).join(""); },
    set(value) { node.text = String(value); node.children = []; },
  });
  return node;
}

function makeChart() {
  const document = makeNode("document");
  document.createElement = name => makeNode(name, document);
  document.createElementNS = (_namespace, name) => makeNode(name, document);

  const wrapper = makeNode("wrapper", document);
  wrapper.rect = { left: 100, top: 50, width: 320, height: 390 };
  wrapper.clientWidth = 320;
  wrapper.clientHeight = 390;
  wrapper.scrollLeft = 300;

  const svg = makeNode("svg", document);
  svg.rect = { left: -200, top: 50, width: 1000, height: 390 };
  svg.setAttribute("aria-label", "Chart description");
  const tooltip = makeNode("tooltip", document);
  tooltip.offsetWidth = 180;
  tooltip.offsetHeight = 90;
  wrapper.append(svg, tooltip);

  const rows = [
    { period: "2020", cpiIndex: 100, wpiIndex: 100, cpi: 100, wage: 900 },
    { period: "2021", cpiIndex: 112, wpiIndex: 130, cpi: 104, wage: 1200 },
    { period: "2022", cpiIndex: 125, wpiIndex: 118, cpi: 110, wage: 1500 },
  ];
  const margin = { left: 72, right: 58, top: 28, bottom: 60 };
  const x = index => margin.left + index * ((1000 - margin.left - margin.right) / (rows.length - 1));
  const y = value => 300 - value;
  const options = {
    svg, tooltip, rows, x, y, margin,
    periodLabel: row => row.period,
    note: "Normalized index; source values below",
    gapLabel: "Income minus CPI",
    formatIndex: value => value.toFixed(1),
    formatGap: value => `${value > 0 ? "+" : ""}${value.toFixed(1)}`,
    series: [
      { normalizedKey: "cpiIndex", rawKey: "cpi", label: "CPI", rawLabel: "Index points", formatRaw: value => String(value), className: "cpi" },
      { normalizedKey: "wpiIndex", rawKey: "wage", label: "WPI", rawLabel: "Dollars per worker", formatRaw: value => String(value), className: "wpi" },
    ],
  };
  return { document, wrapper, svg, tooltip, rows, x, options };
}

function plotTarget(svg) {
  return svg.children.find(child => child.getAttribute("class") === "hover-target");
}

function text(node) {
  return node.textContent;
}

test("touch release keeps the detailed tooltip through leave and capture loss, then dismisses outside the chart", () => {
  const { document, wrapper, svg, tooltip, x, options } = makeChart();
  attachChartInspector(options);
  const target = plotTarget(svg);
  const point = svg.rect.left + x(1);

  target.dispatch("pointerdown", { pointerType: "touch", pointerId: 7, clientX: point });
  assert.equal(tooltip.hidden, false, "touch down opens the tooltip immediately");
  target.dispatch("pointerleave", { pointerType: "touch", pointerId: 7 });
  target.dispatch("pointerup", { pointerType: "touch", pointerId: 7 });
  target.dispatch("pointerleave", { pointerType: "touch", pointerId: 7 });
  target.dispatch("lostpointercapture", { pointerType: "touch", pointerId: 7 });
  assert.equal(tooltip.hidden, false, "release, leave, and capture loss do not dismiss the pinned tooltip");
  assert.match(text(tooltip), /2021/);
  assert.match(text(tooltip), /Index points: 104/);
  assert.match(text(tooltip), /Dollars per worker: 1200/);
  assert.match(text(tooltip), /Income minus CPI\+18\.0/);
  assert.ok(Number.parseFloat(tooltip.style.left) >= 300);
  assert.ok(Number.parseFloat(tooltip.style.left) + tooltip.offsetWidth <= 620);

  document.dispatch("pointerdown", { target: makeNode("outside", document) });
  assert.equal(tooltip.hidden, true, "an outside tap dismisses the pinned tooltip");

  target.dispatch("pointerdown", { pointerType: "touch", pointerId: 8, clientX: point });
  target.dispatch("pointerup", { pointerType: "touch", pointerId: 8 });
  wrapper.dispatch("scroll");
  assert.equal(tooltip.hidden, true, "horizontal chart scrolling clears a stale pinned tooltip");

  target.dispatch("pointerdown", { pointerType: "touch", pointerId: 9, clientX: point });
  target.dispatch("pointercancel", { pointerType: "touch", pointerId: 9 });
  assert.equal(tooltip.hidden, true, "cancelled touch gestures dismiss the tooltip");
});

test("mouse and keyboard inspection retain the renderer label, support Home/End, and suppress plot browser actions", () => {
  const { document, wrapper, svg, tooltip, x, options } = makeChart();
  attachChartInspector(options);
  const target = plotTarget(svg);

  target.dispatch("pointermove", { pointerType: "mouse", clientX: svg.rect.left + x(1) });
  assert.equal(tooltip.hidden, false);
  target.dispatch("pointerleave", { pointerType: "mouse" });
  assert.equal(tooltip.hidden, true, "mouse hover closes when it leaves the plot");

  assert.equal(svg.getAttribute("aria-label"), "Chart description");
  assert.equal(svg.getAttribute("tabindex"), "0");
  const end = svg.dispatch("keydown", { key: "End" });
  assert.equal(end.defaultPrevented, true);
  assert.match(text(tooltip), /2022/);
  const announcement = wrapper.children.find(child => child.getAttribute("role") === "status");
  assert.equal(announcement.getAttribute("aria-live"), "polite");
  assert.match(text(announcement), /2022.*Index points: 110.*Dollars per worker: 1500.*Income minus CPI: -7\.0/);
  svg.dispatch("keydown", { key: "Home" });
  assert.match(text(tooltip), /2020/);

  const context = svg.dispatch("contextmenu");
  const selection = target.dispatch("selectstart");
  assert.equal(context.defaultPrevented, true);
  assert.equal(selection.defaultPrevented, true);

  svg.replaceChildren();
  attachChartInspector(options);
  assert.equal(document.listenerCount("pointerdown"), 1, "rerender replaces the prior outside-tap listener");
  assert.equal(wrapper.children.filter(child => child.getAttribute("role") === "status").length, 1, "rerender replaces the old live region");
});
