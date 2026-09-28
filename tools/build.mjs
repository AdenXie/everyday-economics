import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeEnglishOutput } from "./i18n.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const files = [
  ["index.html", "index.html"],
  ["src/app.js", "src/app.js"],
  ["src/analysis.js", "src/analysis.js"],
  ["src/world.js", "src/world.js"],
  ["src/assistant.js", "src/assistant.js"],
  ["src/style.css", "src/style.css"],
  ["assets/favicon.svg", "assets/favicon.svg"],
  ["data/quarterly.json", "data/quarterly.json"],
  ["data/worldbank.json", "data/worldbank.json"],
  ["data/messages.zh.json", "data/messages.zh.json"],
  ["assets/fonts/plus-jakarta-sans-latin.woff2", "assets/fonts/plus-jakarta-sans-latin.woff2"],
  ["assets/fonts/newsreader-latin.woff2", "assets/fonts/newsreader-latin.woff2"],
  ["assets/fonts/source-han-sans-cn-vf.otf.woff2", "assets/fonts/source-han-sans-cn-vf.otf.woff2"],
  ["assets/fonts/source-han-serif-cn-vf.otf.woff2", "assets/fonts/source-han-serif-cn-vf.otf.woff2"],
  ["assets/fonts/OFL-Plus-Jakarta-Sans.txt", "assets/fonts/OFL-Plus-Jakarta-Sans.txt"],
  ["assets/fonts/OFL-Newsreader.txt", "assets/fonts/OFL-Newsreader.txt"],
  ["assets/fonts/OFL-Source-Han-Sans.txt", "assets/fonts/OFL-Source-Han-Sans.txt"],
  ["assets/fonts/OFL-Source-Han-Serif.txt", "assets/fonts/OFL-Source-Han-Serif.txt"],
];

for (const [source, destination] of files) {
  const target = path.join(output, destination);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(root, source), target);
}

const english = writeEnglishOutput(root, output);
console.log(`Built Chinese and English static storyboards into ${output} (${english.messageCount} shared messages).`);
