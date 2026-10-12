// Keep the two READMEs' dated data descriptions in step with candidate snapshots.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (!["abs", "worldbank", "both"].includes(mode)) {
  throw new Error("Usage: node tools/record_data_refresh.mjs abs|worldbank|both");
}
const abs = JSON.parse(readFileSync(path.join(root, "data/quarterly.json"), "utf8"));
const wb = JSON.parse(readFileSync(path.join(root, "data/worldbank.json"), "utf8"));
const names = {
  AUS: ["澳大利亚", "Australia"], USA: ["美国", "United States"],
  KOR: ["韩国", "South Korea"], JPN: ["日本", "Japan"],
  SGP: ["新加坡", "Singapore"], CHN: ["中国", "China"],
  DEU: ["德国", "Germany"], GBR: ["英国", "United Kingdom"],
  RUS: ["俄罗斯", "Russia"], CAN: ["加拿大", "Canada"],
};

function replaceBlock(document, key, content) {
  const start = `<!-- ${key}:start -->`;
  const end = `<!-- ${key}:end -->`;
  const begin = document.indexOf(start);
  const finish = document.indexOf(end);
  if (begin < 0 || finish < begin || document.indexOf(start, begin + 1) >= 0) {
    throw new Error(`Missing or duplicate README markers: ${key}`);
  }
  return document.slice(0, begin) + `${start}\n${content}\n${end}` + document.slice(finish + end.length);
}

function absBlock(english) {
  return english
    ? `Prepared on **${abs.snapshotDate}**; **${abs.observationCount} consecutive paired quarters, ${abs.firstQuarter}–${abs.latestQuarter}**. Release details and workbook checksums are recorded in [the source manifest](data/source-manifest.json).`
    : `快照整理于 **${abs.snapshotDate}**，覆盖 **${abs.firstQuarter}—${abs.latestQuarter}，${abs.observationCount} 个连续配对季度**。发布日期和工作簿校验值见[来源清单](data/source-manifest.json)。`;
}

function worldbankStatus(english) {
  const cpiDate = wb.indicators.cpi.lastUpdated;
  const incomeDate = wb.indicators.income.lastUpdated;
  if (english) return `- Prepared on **${wb.snapshotDate}** from World Bank WDI. WDI last updated CPI on **${cpiDate}** and nominal GDP per capita on **${incomeDate}**. This is a dated snapshot, not a live feed.`;
  return `- 快照整理于 **${wb.snapshotDate}**，取自世界银行 WDI；CPI 最后更新于 **${cpiDate}**，名义人均 GDP 最后更新于 **${incomeDate}**。快照不是实时数据。`;
}

function coverage(english) {
  const lines = [english ? "| Economy | Years with both series |" : "| 经济体 | 两项都有数据的年份 |", "|---|---|"];
  for (const country of wb.countries) {
    const [zh, en] = names[country.iso3];
    if (!zh) throw new Error(`Unknown economy ${country.iso3}`);
    const range = `${country.firstYear}${english ? "–" : "—"}${country.lastYear}`;
    lines.push(`| ${english ? en : zh} | ${range} |`);
  }
  lines.push("");
  lines.push(english
    ? `The shared paired range is **${wb.commonFirstYear}–${wb.commonLastYear}**. Comparisons require both indicators throughout the selected period.`
    : `全部经济体的共同配对区间为 **${wb.commonFirstYear}—${wb.commonLastYear}**。比较时要求所选区间内两项指标都有数据。`);
  return lines.join("\n");
}

for (const [file, english] of [["README.md", false], ["README.en.md", true]]) {
  const fullPath = path.join(root, file);
  let document = readFileSync(fullPath, "utf8");
  if (mode === "abs" || mode === "both") document = replaceBlock(document, "abs-data-status", absBlock(english));
  if (mode === "worldbank" || mode === "both") {
    document = replaceBlock(document, "worldbank-data-status", worldbankStatus(english));
    document = replaceBlock(document, "worldbank-coverage", coverage(english));
  }
  writeFileSync(fullPath, document);
}
