import { STORY_CHAPTERS } from "./story-chapters.js";

export function readingNumbers(analysis, kind) {
  const last = analysis.rows.at(-1);
  const price = last.cpiNormalized;
  const income = kind === "quarterly" ? last.wpiNormalized : last.incomeNormalized;
  return { price, income, ratio: income / price, adjustedPct: (income / price - 1) * 100 };
}

export function chapterRange(event, first, last, kind) {
  const requestedStart = kind === "quarterly" ? `${event.start}-Q1` : event.start;
  const requestedEnd = kind === "quarterly" ? `${event.end}-Q4` : event.end;
  const start = requestedStart < first ? first : requestedStart;
  const end = requestedEnd > last ? last : requestedEnd;
  return start <= end ? [start, end] : null;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function renderReading(container, { id, analysis, kind, locale, message, start, end, currency, first, last, selectRange }) {
  const story = STORY_CHAPTERS[id];
  const sameStory = container.dataset.story === id;
  const expanded = sameStory && container.querySelector("details")?.open;
  const activeEvent = container.contains(document.activeElement) ? document.activeElement.dataset.event : null;
  container.replaceChildren();
  container.dataset.story = id;
  const number = new Intl.NumberFormat(locale === "en" ? "en-AU" : "zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const signed = value => `${value > 0 ? "+" : value < 0 ? "−" : ""}${number.format(Math.abs(value))}%`;
  const values = readingNumbers(analysis, kind);
  const prefix = `story.${id}`;

  const header = element("div", "reading-header");
  header.append(element("p", "eyebrow", message("story.eyebrow")), element("h3", "", message(`${prefix}.title`)));
  header.append(element("p", "reading-intro", message(`${prefix}.intro`)));
  container.append(header);

  const numbers = element("div", "reading-numbers");
  numbers.append(element("p", "reading-period", message("story.selected", { start, end })));
  const list = element("ul", "reading-values");
  for (const [role, key] of [["prices", "story.priceReading"], ["income", kind === "quarterly" ? "story.wageReading" : "story.outputReading"], ["adjusted", kind === "quarterly" ? "story.wageAdjusted" : "story.outputAdjusted"]]) {
    const item = element("li", `reading-value reading-${role}`);
    item.append(element("strong", "reading-label", message(`story.label.${role}`)));
    item.append(element("span", "", message(key, {
      price: number.format(values.price), income: number.format(values.income), currency,
      pricePct: signed(analysis.cpiGrowthPct), incomePct: signed(kind === "quarterly" ? analysis.wpiGrowthPct : analysis.incomeGrowthPct),
      ratio: number.format(values.ratio), adjusted: signed(values.adjustedPct),
    })));
    list.append(item);
  }
  numbers.append(list, element("p", "reading-small", message("story.cumulative")));
  container.append(numbers);

  const details = element("details", "reading-history");
  details.open = Boolean(expanded);
  const summary = element("summary", "");
  summary.append(element("span", "", message("story.expand")), element("span", "reading-time", message("story.time")));
  details.append(summary);
  const vignette = element("aside", "reading-vignette");
  vignette.append(element("p", "reading-label", message("story.fictional")), element("p", "", message(`${prefix}.vignette`)));
  details.append(vignette, element("h4", "reading-history-title", message("story.historyTitle")), element("p", "reading-small", message("story.contextNote")));
  const timeline = element("ol", "reading-timeline");
  story.events.forEach((event, index) => {
    const item = element("li", "reading-chapter");
    const heading = element("div", "reading-chapter-head");
    heading.append(element("span", "reading-date", `${event.start}–${event.end}`), element("h5", "", message(`${prefix}.event.${index}.title`)));
    item.append(heading, element("p", "", message(`${prefix}.event.${index}.body`)));
    const footer = element("div", "reading-chapter-footer");
    const sources = element("div", "reading-sources");
    for (const [sourceIndex, source] of event.sources.entries()) {
      const link = element("a", "", message(`${prefix}.event.${index}.source.${sourceIndex}`));
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      sources.append(link);
    }
    footer.append(sources);
    const range = chapterRange(event, first, last, kind);
    if (range) {
      const button = element("button", "reading-view", message("story.showPeriod"));
      button.type = "button";
      button.dataset.event = String(index);
      button.addEventListener("click", () => selectRange(...range));
      footer.append(button);
    }
    item.append(footer);
    timeline.append(item);
  });
  details.append(timeline, element("p", "reading-takeaway", message(`${prefix}.takeaway`)), element("p", "reading-small", message("story.flatLine")));
  container.append(details);
  if (sameStory && activeEvent !== undefined && activeEvent !== null) container.querySelector(`[data-event="${activeEvent}"]`)?.focus({ preventScroll: true });
}
