const svgNamespace = "http://www.w3.org/2000/svg";
const activeInspectors = new WeakMap();

function addSvgElement(document, parent, tagName, attributes = {}) {
  const element = document.createElementNS(svgNamespace, tagName);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  parent.append(element);
  return element;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function nearestIndex(rows, x, pointX) {
  if (rows.length < 2) return 0;
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (x(middle) < pointX) low = middle + 1;
    else high = middle;
  }
  if (low === 0) return 0;
  return pointX - x(low - 1) <= x(low) - pointX ? low - 1 : low;
}

function setTooltipContent({ tooltip, document, row, periodLabel, note, series, formatIndex, gapLabel, formatGap }) {
  tooltip.replaceChildren();

  const heading = document.createElement("strong");
  heading.textContent = periodLabel(row);
  tooltip.append(heading);

  const noteLine = document.createElement("span");
  noteLine.className = "tooltip-note";
  noteLine.textContent = note;
  tooltip.append(noteLine);

  for (const item of series) {
    const group = document.createElement("div");
    group.className = `tooltip-series tooltip-series-${item.className}`;

    const line = document.createElement("span");
    line.className = `tooltip-row tooltip-${item.className}`;
    const swatch = document.createElement("i");
    swatch.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = item.label;
    const value = document.createElement("b");
    value.textContent = formatIndex(row[item.normalizedKey]);
    line.append(swatch, label, value);

    const raw = document.createElement("span");
    raw.className = "tooltip-raw";
    raw.textContent = `${item.rawLabel}: ${item.formatRaw(row[item.rawKey], row)}`;
    group.append(line, raw);
    tooltip.append(group);
  }

  if (series.length > 1) {
    const gap = Number(row[series[1].normalizedKey]) - Number(row[series[0].normalizedKey]);
    const gapLine = document.createElement("span");
    gapLine.className = "tooltip-gap";
    const label = document.createElement("span");
    label.textContent = gapLabel;
    const value = document.createElement("b");
    value.textContent = formatGap(gap);
    gapLine.append(label, value);
    tooltip.append(gapLine);
  }
}

function placeTooltip({ tooltip, svg, width, height, margin, cx }) {
  const wrapper = tooltip.parentElement;
  const wrapperBox = wrapper.getBoundingClientRect();
  const svgBox = svg.getBoundingClientRect();
  const scrollLeft = wrapper.scrollLeft || 0;
  const scrollTop = wrapper.scrollTop || 0;
  const visibleWidth = wrapper.clientWidth || wrapperBox.width;
  const visibleHeight = wrapper.clientHeight || wrapperBox.height;
  const visibleLeft = scrollLeft;
  const visibleRight = visibleLeft + visibleWidth;
  const anchorX = svgBox.left - wrapperBox.left + scrollLeft + (cx / width) * svgBox.width;
  const tooltipWidth = tooltip.offsetWidth || tooltip.getBoundingClientRect().width;
  const tooltipHeight = tooltip.offsetHeight || tooltip.getBoundingClientRect().height;
  const preferredRight = anchorX + 12;
  const preferredLeft = anchorX - tooltipWidth - 12;
  const left = clamp(
    preferredRight + tooltipWidth <= visibleRight - 8 ? preferredRight : preferredLeft,
    visibleLeft + 8,
    visibleRight - tooltipWidth - 8,
  );

  const viewportHeight = svg.ownerDocument.defaultView?.innerHeight ?? wrapperBox.top + visibleHeight;
  const navigationBottom = svg.ownerDocument.querySelector?.(".country-tabs")?.getBoundingClientRect().bottom ?? 0;
  const visibleTop = scrollTop + Math.max(0, navigationBottom - wrapperBox.top);
  const visibleBottom = scrollTop + Math.min(visibleHeight, viewportHeight - wrapperBox.top);
  const anchorTop = svgBox.top - wrapperBox.top + scrollTop + ((margin.top + 8) / height) * svgBox.height;
  const top = clamp(anchorTop, visibleTop + 6, visibleBottom - tooltipHeight - 6);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

/** Add touch, pointer, and keyboard inspection to an already-rendered line chart. */
export function attachChartInspector({
  svg,
  tooltip,
  rows,
  x,
  y,
  width = 1000,
  height = 390,
  margin = { left: 72, right: 58, top: 28, bottom: 60 },
  periodLabel,
  note,
  gapLabel,
  series,
  formatIndex,
  formatGap,
}) {
  activeInspectors.get(svg)?.();

  const document = svg.ownerDocument;
  const announcement = document.createElement("span");
  announcement.className = "visually-hidden";
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  announcement.setAttribute("aria-atomic", "true");
  tooltip.parentElement.append(announcement);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const hover = addSvgElement(document, svg, "g", { class: "hover-layer", visibility: "hidden", "aria-hidden": "true" });
  const crosshair = addSvgElement(document, hover, "line", {
    x1: margin.left,
    x2: margin.left,
    y1: margin.top,
    y2: margin.top + plotHeight,
    class: "crosshair",
  });
  const markers = series.map((item) => addSvgElement(document, hover, "circle", {
    r: 5,
    class: `series-point ${item.className}-point`,
  }));
  const target = addSvgElement(document, svg, "rect", {
    x: margin.left,
    y: margin.top,
    width: plotWidth,
    height: plotHeight,
    class: "hover-target",
    "aria-hidden": "true",
  });

  svg.setAttribute("tabindex", "0");
  tooltip.hidden = true;

  let currentIndex = null;
  let touchPointerId = null;
  let touchPinned = false;
  let keyboardActive = false;
  const listeners = [];
  const listen = (element, eventName, handler, options) => {
    element.addEventListener(eventName, handler, options);
    listeners.push([element, eventName, handler, options]);
  };

  const hide = () => {
    hover.setAttribute("visibility", "hidden");
    tooltip.hidden = true;
  };

  const showIndex = (index) => {
    if (!rows.length) return;
    currentIndex = clamp(index, 0, rows.length - 1);
    const row = rows[currentIndex];
    const cx = x(currentIndex);
    crosshair.setAttribute("x1", cx);
    crosshair.setAttribute("x2", cx);
    markers.forEach((marker, seriesIndex) => {
      const item = series[seriesIndex];
      marker.setAttribute("cx", cx);
      marker.setAttribute("cy", y(row[item.normalizedKey]));
    });
    hover.setAttribute("visibility", "visible");
    setTooltipContent({ tooltip, document, row, periodLabel, note, series, formatIndex, gapLabel, formatGap });
    tooltip.hidden = false;
    placeTooltip({ tooltip, svg, width, height, margin, cx });
  };

  const showAtClientX = (clientX) => {
    const bounds = svg.getBoundingClientRect();
    const pointX = bounds.width ? ((clientX - bounds.left) / bounds.width) * width : margin.left;
    showIndex(nearestIndex(rows, x, pointX));
  };

  listen(target, "pointermove", (event) => {
    if (event.pointerType === "touch" && event.pointerId !== touchPointerId) return;
    showAtClientX(event.clientX);
  });
  listen(target, "pointerdown", (event) => {
    keyboardActive = false;
    if (event.pointerType === "touch") {
      touchPinned = false;
      touchPointerId = event.pointerId;
      target.setPointerCapture?.(event.pointerId);
    } else {
      touchPinned = false;
      touchPointerId = null;
    }
    showAtClientX(event.clientX);
  });
  listen(target, "pointerup", (event) => {
    if (event.pointerType === "touch" && event.pointerId === touchPointerId) {
      touchPointerId = null;
      touchPinned = true;
    }
  });
  listen(target, "pointercancel", (event) => {
    if (event.pointerId === touchPointerId || event.pointerType === "touch") {
      touchPointerId = null;
      touchPinned = false;
      hide();
    }
  });
  listen(target, "pointerleave", () => {
    if (!touchPinned && !keyboardActive && touchPointerId === null) hide();
  });
  listen(target, "selectstart", (event) => event.preventDefault());
  listen(svg, "contextmenu", (event) => event.preventDefault());
  listen(svg, "focus", () => {
    if (currentIndex === null) currentIndex = 0;
  });
  listen(svg, "blur", () => {
    keyboardActive = false;
    if (!touchPinned) hide();
  });
  listen(svg, "keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Escape") {
      keyboardActive = false;
      touchPinned = false;
      hide();
      return;
    }
    keyboardActive = true;
    touchPinned = false;
    const base = currentIndex ?? 0;
    const next = event.key === "Home" ? 0
      : event.key === "End" ? rows.length - 1
        : event.key === "ArrowRight" ? Math.min(rows.length - 1, base + 1)
          : Math.max(0, base - 1);
    showIndex(next);
    const row = rows[currentIndex];
    const values = series.map(item => `${item.label}: ${formatIndex(row[item.normalizedKey])}; ${item.rawLabel}: ${item.formatRaw(row[item.rawKey], row)}`);
    const difference = series.length > 1
      ? ` ${gapLabel}: ${formatGap(row[series[1].normalizedKey] - row[series[0].normalizedKey])}.` : "";
    announcement.textContent = `${periodLabel(row)}. ${values.join(". ")}.${difference}`;
  });
  listen(document, "pointerdown", (event) => {
    if (!svg.contains(event.target)) {
      touchPinned = false;
      touchPointerId = null;
      keyboardActive = false;
      hide();
    }
  }, true);
  listen(tooltip.parentElement, "scroll", () => {
    touchPinned = false;
    touchPointerId = null;
    keyboardActive = false;
    hide();
  }, { passive: true });

  const cleanup = () => {
    for (const [element, eventName, handler, options] of listeners) {
      element.removeEventListener(eventName, handler, options);
    }
    tooltip.hidden = true;
    announcement.remove();
    activeInspectors.delete(svg);
  };
  activeInspectors.set(svg, cleanup);
  return cleanup;
}
