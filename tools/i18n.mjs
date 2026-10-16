import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

function readJson(file, fallback = {}) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
}

export function loadEnglishMessages(root) {
  const chinese = readJson(path.join(root, "data/messages.zh.json"));
  const english = readJson(path.join(root, "data/messages.en.json"));

  for (const key of Object.keys(chinese)) {
    if (typeof english[key] !== "string") throw new Error(`English copy is missing message: ${key}`);
  }
  return english;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function translateSlots(sourceHtml, messages) {
  const slots = [...sourceHtml.matchAll(/<([a-z][\w:-]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>/gi)];
  const replacements = [];
  const lowerHtml = sourceHtml.toLowerCase();
  for (const match of slots) {
    const opening = match[0];
    if (/\bdata-i18n-attr=/.test(opening)) continue;
    const [, tag, key] = match;
    if (typeof messages[key] !== "string") throw new Error(`English output is missing message: ${key}`);
    const bodyStart = match.index + opening.length;
    const closingStart = lowerHtml.indexOf(`</${tag.toLowerCase()}>`, bodyStart);
    if (closingStart < 0) throw new Error(`Cannot find closing tag for English message: ${key}`);
    replacements.push({
      start: bodyStart,
      end: closingStart,
      text: escapeHtml(messages[key]),
    });
  }
  let html = sourceHtml;
  for (const replacement of replacements.reverse()) {
    html = `${html.slice(0, replacement.start)}${replacement.text}${html.slice(replacement.end)}`;
  }

  html = html.replace(/<[^>]+>/g, (tag) => {
    const key = tag.match(/\bdata-i18n="([^"]+)"/)?.[1];
    const attribute = tag.match(/\bdata-i18n-attr="([^"]+)"/)?.[1];
    if (!key || !attribute) return tag;
    if (typeof messages[key] !== "string") throw new Error(`English output is missing message: ${key}`);
    const attributePattern = new RegExp(`\\b${attribute}="[^"]*"`);
    if (!attributePattern.test(tag)) throw new Error(`Cannot find ${attribute} for English message ${key}`);
    return tag.replace(attributePattern, `${attribute}="${escapeAttribute(messages[key])}"`);
  });

  return html
    .replace(/\sdata-i18n-attr="[^"]*"/g, "")
    .replace(/\sdata-i18n="[^"]*"/g, "")
    .replace('<html lang="zh-CN">', '<html lang="en">');
}

function markEnglishCurrent(html, zhHref, enHref) {
  html = html.replace(/<a\b[^>]*\bid="language-zh"[^>]*>/, (tag) => tag.replace(/href="[^"]*"/, `href="${zhHref}"`).replace(/\saria-current="page"/, ""));
  return html.replace(/<a\b[^>]*\bid="language-en"[^>]*>/, (tag) => tag.replace(/href="[^"]*"/, `href="${enHref}"`).replace(/\saria-current="page"/, "")
    .replace('lang="en"', 'lang="en" aria-current="page"'));
}

export function renderEnglishPage(sourceHtml, messages) {
  const html = translateSlots(sourceHtml, messages)
    .replace('href="./assets/favicon.svg"', 'href="../assets/favicon.svg"')
    .replace('href="./src/style.css"', 'href="../src/style.css"')
    .replace('src="./src/app.js"', 'src="../src/app.js"');
  return markEnglishCurrent(html, "../", "./");
}

// story/index.html sits one level down and its English copy (en/story/) two levels down.
// Home links ("../") already resolve to /en/ from there, so only shared assets move.
export function renderEnglishStoryPage(sourceHtml, messages) {
  const html = translateSlots(sourceHtml, messages)
    .replace(/(href|src)="\.\.\/(assets|src)\//g, '$1="../../$2/');
  return markEnglishCurrent(html, "../../story/", "./");
}

export function writeEnglishOutput(root, output) {
  const messages = loadEnglishMessages(root);
  const pages = [
    ["index.html", "en/index.html", renderEnglishPage],
    ["story/index.html", "en/story/index.html", renderEnglishStoryPage],
  ];
  const pagePaths = pages.map(([source, destination, render]) => {
    const pagePath = path.join(output, destination);
    mkdirSync(path.dirname(pagePath), { recursive: true });
    writeFileSync(pagePath, render(readFileSync(path.join(root, source), "utf8"), messages), "utf8");
    return pagePath;
  });
  const messagePath = path.join(output, "data/messages.en.json");
  writeFileSync(messagePath, `${JSON.stringify(messages, null, 2)}\n`, "utf8");
  return { pagePath: pagePaths[0], pagePaths, messagePath, messageCount: Object.keys(messages).length };
}
