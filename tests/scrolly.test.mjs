import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildScrollySteps, calculatorHref, interpolateFrame, SCROLLY_STORIES, stepFrame, stepNumbers } from "../src/scrolly-stories.js";
import { STORY_CHAPTERS } from "../src/story-chapters.js";
import { loadEnglishMessages, renderEnglishStoryPage } from "../tools/i18n.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFileSync(path.join(root, file), "utf8");
const abs = JSON.parse(read("data/quarterly.json"));
const zh = JSON.parse(read("data/messages.zh.json"));
const en = JSON.parse(read("data/messages.en.json"));

test("the Australian scroll story runs intro → five sourced chapters → calculator", () => {
  const steps = buildScrollySteps("ABS", abs);
  assert.deepEqual(steps.map(step => step.kind), ["intro", "chapter", "chapter", "chapter", "chapter", "chapter", "outro"]);
  assert.equal(steps.filter(step => step.kind === "chapter").length, STORY_CHAPTERS.ABS.events.length);
  assert.deepEqual(steps[0].range, [abs.firstQuarter, abs.latestQuarter]);
  assert.deepEqual(steps[1].range, ["1997-Q3", "2001-Q4"]);
  assert.deepEqual(steps[1].view, ["1997-Q3", "2002-Q4"]);
  assert.deepEqual(steps[5].range, ["2021-Q1", "2024-Q4"]);
  assert.deepEqual(steps.at(-1).calculator, { region: "AUS", from: "2021-Q1" });
  for (const [index, step] of steps.entries()) {
    for (const messages of [zh, en]) {
      assert.ok(messages[step.titleKey]?.trim(), `${step.titleKey}`);
      assert.ok(messages[step.bodyKey]?.trim(), `${step.bodyKey}`);
      for (const source of step.sources) assert.ok(messages[source.labelKey]?.trim(), source.labelKey);
    }
    if (step.kind === "chapter") {
      assert.equal(step.sources[0].url, STORY_CHAPTERS.ABS.events[index - 1].sources[0].url);
      assert.ok(step.view[0] <= step.range[0] && step.view[1] >= step.range[1]);
    }
  }
  assert.ok(zh["scrolly.ABS.outro.cta"] && en["scrolly.ABS.outro.cta"]);
  assert.throws(() => buildScrollySteps("XXX", abs), /Unknown scroll story/);
});

test("each step states numbers from the snapshot and frames the chart inside the data", () => {
  const steps = buildScrollySteps("ABS", abs);
  const rows = Object.fromEntries(abs.observations.map(row => [row.period, row]));
  for (const step of steps) {
    const values = stepNumbers(abs, step);
    const [start, end] = step.range.map(period => rows[period]);
    assert.ok(Math.abs(values.cpiPct - (end.cpiIndex / start.cpiIndex - 1) * 100) < 1e-9);
    assert.ok(Math.abs(values.wpiPct - (end.wpiIndex / start.wpiIndex - 1) * 100) < 1e-9);
    assert.ok(Math.abs(values.adjustedPct - ((end.wpiIndex / start.wpiIndex) / (end.cpiIndex / start.cpiIndex) - 1) * 100) < 1e-9);
    const frame = stepFrame(abs, step);
    assert.ok(frame.x0 >= 0 && frame.x1 <= abs.observations.length - 1 && frame.x0 < frame.x1);
    assert.ok(frame.band0 >= frame.x0 && frame.band1 <= frame.x1);
    assert.ok(frame.y0 < 100 * end.cpiIndex / abs.observations[0].cpiIndex && frame.y1 > 100 * end.wpiIndex / abs.observations[0].wpiIndex);
  }
  const intro = stepFrame(abs, steps[0]);
  assert.ok(intro.y0 < 100, "the intro frame shows the shared starting value");
  const middle = interpolateFrame({ x0: 0, x1: 10, y0: 90 }, { x0: 10, x1: 30, y0: 100 }, .5);
  assert.deepEqual(middle, { x0: 5, x1: 20, y0: 95 });
});

test("the calculator link carries the story's region and period but no pay", () => {
  const href = calculatorHref("https://example.org/en/story/../", SCROLLY_STORIES.ABS.calculator);
  const url = new URL(href);
  assert.equal(url.pathname, "/en/");
  assert.deepEqual(Object.fromEntries(url.searchParams), { view: "wage", wageRegion: "AUS", wageFrom: "2021-Q1", wageTo: "latest" });
});

test("the story page is static Chinese at /story/ and translated at /en/story/", () => {
  const source = read("story/index.html");
  for (const match of source.matchAll(/<[^>]*\bdata-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
    if (/data-i18n-attr=/.test(match[0])) continue;
    assert.equal(match[2], zh[match[1]], `static Chinese copy for ${match[1]} must match messages.zh.json`);
  }
  const english = renderEnglishStoryPage(source, loadEnglishMessages(root));
  assert.match(english, /<html lang="en">/);
  assert.match(english, /href="\.\.\/\.\.\/src\/style\.css"/);
  assert.match(english, /src="\.\.\/\.\.\/src\/scrolly\.js"/);
  assert.match(english, /href="\.\.\/\.\.\/assets\/favicon\.svg"/);
  assert.match(english, /id="language-zh" href="\.\.\/\.\.\/story\/"/);
  assert.match(english, /id="language-en" href="\.\/"[^>]*aria-current="page"/);
  assert.match(english, /<a class="identity" href="\.\.\/"/);
  assert.match(english, /<h1 id="scrolly-title">Why do payslips/);
  assert.doesNotMatch(english, /data-i18n(?:-attr)?=/);
  const visibleText = english.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ");
  assert.equal([...visibleText.matchAll(/[㐀-鿿]/g)].map(([character]) => character).join(""), "中文");
  assert.match(read("index.html"), /<a class="scrolly-entry" href="\.\/story\/">/);
});
