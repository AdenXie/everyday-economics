import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { loadEnglishMessages, renderEnglishPage } from "../tools/i18n.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("English page preserves structural language controls and uses relative assets", () => {
  const messages = loadEnglishMessages(root);
  const source = readFileSync(path.join(root, "index.html"), "utf8");
  const english = renderEnglishPage(source, messages);

  assert.match(english, /<html lang="en">/);
  assert.match(english, /<title>How much more expensive is the basket\?/);
  assert.match(english, /href="\.\.\/src\/style\.css"/);
  assert.match(english, /src="\.\.\/src\/app\.js"/);
  assert.match(english, /<nav class="language-switch" aria-label="Choose language">[\s\S]*?id="language-en"[^>]*aria-current="page"/);
  assert.match(english, /<form class="period-controls" aria-label="Choose the comparison period"/);
  assert.match(english, /id="start-quarter"/);
  assert.match(english, /class="hero-note-label">Start here<\/span>/);
  assert.match(english, /<span>Start quarter<\/span>/);
  assert.match(english, /<span>End quarter<\/span>/);
  assert.match(english, /CPI · consumer prices/);
  assert.match(english, /WPI · wage prices/);
  assert.match(english, /Swipe sideways to see later quarters/);
  assert.doesNotMatch(english, /data-i18n(?:-attr)?=/);
  assert.doesNotMatch(english, /100 ─ 125 ─ 150 ─ 175/);
  const visibleText = english.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ");
  assert.equal([...visibleText.matchAll(/[\u3400-\u9fff]/g)].map(([character]) => character).join(""), "中文");
});

test("English copy contains every Chinese message key", () => {
  const chinese = JSON.parse(readFileSync(path.join(root, "data/messages.zh.json"), "utf8"));
  const english = loadEnglishMessages(root);
  assert.deepEqual(Object.keys(english), Object.keys(chinese));
  for (const key of Object.keys(chinese)) assert.equal(typeof english[key], "string", key);
});

test("the static build refuses a Chinese message with no maintained English copy", () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "econ-tab-i18n-"));
  try {
    mkdirSync(path.join(temporary, "data"), { recursive: true });
    writeFileSync(path.join(temporary, "data/messages.zh.json"), JSON.stringify({ greeting: "中文文案" }));
    writeFileSync(path.join(temporary, "data/messages.en.json"), JSON.stringify({}));
    assert.throws(() => loadEnglishMessages(temporary), /English copy is missing message: greeting/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
