import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateWindow, calculateYearWindow } from "../src/analysis.js";
import { readingNumbers, chapterRange } from "../src/stories.js";
import { STORY_CHAPTERS } from "../src/story-chapters.js";

test("everyday readings use growth ratios rather than percentage-point subtraction", () => {
  const annual = calculateYearWindow([{ year: 1, cpi: 100, gdpPerCapita: 100 }, { year: 2, cpi: 200, gdpPerCapita: 300 }], 1, 2);
  assert.deepEqual(readingNumbers(annual, "annual"), { price: 200, income: 300, ratio: 1.5, adjustedPct: 50 });
  const wages = calculateWindow([{ period: "2020-Q1", cpiIndex: 100, wpiIndex: 100 }, { period: "2020-Q2", cpiIndex: 115, wpiIndex: 110 }], "2020-Q1", "2020-Q2");
  assert.ok(Math.abs(readingNumbers(wages, "quarterly").adjustedPct - (1.1 / 1.15 - 1) * 100) < 1e-10);
  assert.equal(readingNumbers(calculateYearWindow(annual.rows, 1, 1), "annual").adjustedPct, 0);
});

test("historical shortcuts stay inside source coverage and reject periods outside it", () => {
  assert.deepEqual(chapterRange({ start: 1997, end: 2001 }, "1997-Q3", "2026-Q2", "quarterly"), ["1997-Q3", "2001-Q4"]);
  assert.deepEqual(chapterRange({ start: 2020, end: 2026 }, "1997-Q3", "2026-Q2", "quarterly"), ["2020-Q1", "2026-Q2"]);
  assert.deepEqual(chapterRange({ start: 1960, end: 1990 }, 1986, 2025, "annual"), [1986, 1990]);
  assert.equal(chapterRange({ start: 1960, end: 1980 }, 1986, 2025, "annual"), null);
});

test("every chart has bilingual authored stories, sourced chapters and usable shortcuts", () => {
  const zh = JSON.parse(readFileSync(new URL("../data/messages.zh.json", import.meta.url), "utf8"));
  const en = JSON.parse(readFileSync(new URL("../data/messages.en.json", import.meta.url), "utf8"));
  const wb = JSON.parse(readFileSync(new URL("../data/worldbank.json", import.meta.url), "utf8"));
  const abs = JSON.parse(readFileSync(new URL("../data/quarterly.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(STORY_CHAPTERS), ["ABS", ...wb.countries.map(c => c.iso3)]);
  for (const [id, story] of Object.entries(STORY_CHAPTERS)) {
    const prefix = `story.${id}`;
    for (const name of ["title", "intro", "vignette", "takeaway"]) {
      for (const messages of [zh, en]) assert.ok(messages[`${prefix}.${name}`]?.trim());
    }
    const country = id === "ABS" ? null : wb.countries.find(c => c.iso3 === id);
    assert.ok(story.events.length >= 4);
    for (const [index, event] of story.events.entries()) {
      assert.ok(event.start <= event.end);
      const range = chapterRange(event, country?.firstYear ?? abs.firstQuarter, country?.lastYear ?? abs.latestQuarter, country ? "annual" : "quarterly");
      assert.ok(range, `${id} chapter ${index} should intersect available data`);
      if (country) calculateYearWindow(country.observations, ...range);
      else calculateWindow(abs.observations, ...range);
      for (const name of ["title", "body"]) {
        for (const messages of [zh, en]) assert.ok(messages[`${prefix}.event.${index}.${name}`]?.trim());
      }
      assert.ok(event.sources.length > 0);
      for (const [sourceIndex, source] of event.sources.entries()) {
        const url = new URL(source.url);
        assert.equal(url.protocol, "https:");
        assert.match(url.hostname, /(?:^|\.)(?:rba\.gov\.au|abs\.gov\.au|federalreservehistory\.org|federalreserve\.gov|bankofengland\.co\.uk|ons\.gov\.uk|bundesbank\.de|imf\.org|worldbank\.org|bok\.or\.kr|kdi\.re\.kr|boj\.or\.jp|mti\.gov\.sg|meti\.gov\.sg|mas\.gov\.sg|singstat\.gov\.sg|stats\.gov\.cn|wto\.org|bankofcanada\.ca|statcan\.gc\.ca|cbr\.ru)$/);
        for (const messages of [zh, en]) assert.ok(messages[`${prefix}.event.${index}.source.${sourceIndex}`]?.trim());
      }
    }
  }
});
