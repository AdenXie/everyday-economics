// Scroll stories are data: each one names its snapshot, reuses the sourced chapters in
// STORY_CHAPTERS and ends at the pay calculator. Page logic in scrolly.js only reads this.
import { calculateWindow } from "./analysis.js";
import { chapterRange } from "./stories.js";
import { STORY_CHAPTERS } from "./story-chapters.js";

export const SCROLLY_STORIES = {
  ABS: {
    snapshot: "quarterly.json",
    kind: "quarterly",
    chapters: "ABS",
    padding: 4,
    calculator: { region: "AUS", from: "2021-Q1" },
  },
};

function periodsOf(snapshot) {
  return snapshot.observations.map(row => row.period);
}

// intro (whole record from 100) → one step per sourced chapter → outro linking to the calculator.
export function buildScrollySteps(storyId, snapshot) {
  const story = SCROLLY_STORIES[storyId];
  if (!story) throw new RangeError(`Unknown scroll story: ${storyId}`);
  const periods = periodsOf(snapshot);
  const first = periods[0];
  const last = periods.at(-1);
  const whole = { range: [first, last], view: [first, last] };
  const steps = [{ id: "intro", kind: "intro", ...whole, titleKey: `scrolly.${storyId}.intro.title`, bodyKey: `scrolly.${storyId}.intro.body`, sources: [] }];

  STORY_CHAPTERS[story.chapters].events.forEach((event, index) => {
    const range = chapterRange(event, first, last, story.kind);
    if (!range) return;
    const startIndex = periods.indexOf(range[0]);
    const endIndex = periods.indexOf(range[1]);
    const view = [
      periods[Math.max(0, startIndex - story.padding)],
      periods[Math.min(periods.length - 1, endIndex + story.padding)],
    ];
    steps.push({
      id: `chapter-${index}`,
      kind: "chapter",
      range,
      view,
      years: `${event.start}–${event.end}`,
      titleKey: `story.${story.chapters}.event.${index}.title`,
      bodyKey: `story.${story.chapters}.event.${index}.body`,
      sources: event.sources.map((source, sourceIndex) => ({ url: source.url, labelKey: `story.${story.chapters}.event.${index}.source.${sourceIndex}` })),
    });
  });

  steps.push({
    id: "outro", kind: "outro", ...whole,
    titleKey: `scrolly.${storyId}.outro.title`, bodyKey: `scrolly.${storyId}.outro.body`, sources: [],
    calculator: { ...story.calculator, from: story.calculator.from < first ? first : story.calculator.from },
  });
  return steps;
}

// The core numbers each step states in text and announces when the chart changes.
export function stepNumbers(snapshot, step) {
  const window = calculateWindow(snapshot.observations, ...step.range);
  return {
    start: step.range[0],
    end: step.range[1],
    cpiPct: window.cpiGrowthPct,
    wpiPct: window.wpiGrowthPct,
    adjustedPct: ((1 + window.wpiGrowthPct / 100) / (1 + window.cpiGrowthPct / 100) - 1) * 100,
  };
}

// Chart frame for a step: index span on the x axis and a padded y range covering the
// visible part of both lines (indexed to the first observation = 100).
export function stepFrame(snapshot, step) {
  const periods = periodsOf(snapshot);
  const x0 = periods.indexOf(step.view[0]);
  const x1 = periods.indexOf(step.view[1]);
  const base = snapshot.observations[0];
  const visible = snapshot.observations.slice(x0, x1 + 1)
    .flatMap(row => [100 * row.cpiIndex / base.cpiIndex, 100 * row.wpiIndex / base.wpiIndex]);
  const low = Math.min(...visible);
  const high = Math.max(...visible);
  const pad = Math.max((high - low) * .12, 2);
  return {
    x0, x1,
    y0: Math.max(0, low - pad), y1: high + pad,
    band0: periods.indexOf(step.range[0]),
    band1: periods.indexOf(step.range[1]),
  };
}

export function interpolateFrame(from, to, progress) {
  const result = {};
  for (const key of Object.keys(to)) result[key] = from[key] + (to[key] - from[key]) * progress;
  return result;
}

export function calculatorHref(base, calculator) {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", "wage");
  url.searchParams.set("wageRegion", calculator.region);
  url.searchParams.set("wageFrom", calculator.from);
  url.searchParams.set("wageTo", "latest");
  return url.href;
}
