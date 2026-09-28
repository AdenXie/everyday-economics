// Keep the two READMEs' dated data descriptions in step with candidate snapshots.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
const noChangelog = process.argv.includes("--no-changelog");
if (!["abs", "worldbank", "both"].includes(mode)) {
  throw new Error("Usage: node tools/record_data_refresh.mjs abs|worldbank|both [--no-changelog]");
}
const abs = JSON.parse(readFileSync(path.join(root, "data/quarterly.json"), "utf8"));
const wb = JSON.parse(readFileSync(path.join(root, "data/worldbank.json"), "utf8"));
const names = {
  AUS: ["澳大利亚", "Australia"], USA: ["美国", "United States"],
  KOR: ["韩国", "South Korea"], JPN: ["日本", "Japan"],
  SGP: ["新加坡", "Singapore"], CHN: ["中国", "China"],
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
  const last = abs.observations.at(-1);
  const cpi = abs.series.cpi;
  const wpi = abs.series.wpi;
  if (english) return [
    `This snapshot was prepared on **${abs.snapshotDate}**. It covers **${abs.observationCount} consecutive paired quarters, ${abs.firstQuarter}–${abs.latestQuarter}**. It is a dated snapshot, not a live feed.`,
    `- CPI: [ABS ${cpi.publication}](${cpi.pageUrl}), Table 17, original national all-groups series **${cpi.seriesId}**; final index **${last.cpiIndex}**.`,
    `- WPI: [ABS ${wpi.publication}](${wpi.pageUrl}), Table 1, original Australia private and public, all industries, excluding bonuses series **${wpi.seriesId}**; final index **${last.wpiIndex}**.`,
    `- Official workbooks are retained in [data/sources](data/sources/). Their release details and SHA-256 hashes are in [data/source-manifest.json](data/source-manifest.json); the browser snapshot is [data/quarterly.json](data/quarterly.json).`,
  ].join("\n");
  return [
    `- 快照整理于 **${abs.snapshotDate}**，覆盖 **${abs.firstQuarter}—${abs.latestQuarter}，${abs.observationCount} 个连续配对季度**；不是实时数据。`,
    `- CPI：[ABS ${cpi.publication}](${cpi.pageUrl})，Table 17，全国所有类别原始序列 **${cpi.seriesId}**；最后一期指数 **${last.cpiIndex}**。`,
    `- WPI：[ABS ${wpi.publication}](${wpi.pageUrl})，Table 1，全国私营与公共部门合计、所有行业、不含奖金的原始序列 **${wpi.seriesId}**；最后一期指数 **${last.wpiIndex}**。`,
    `- 官方工作簿保存在 [data/sources](data/sources/)；发布日期与 SHA-256 见 [data/source-manifest.json](data/source-manifest.json)，网页快照见 [data/quarterly.json](data/quarterly.json)。`,
  ].join("\n");
}

function worldbankStatus(english) {
  const cpiDate = wb.indicators.cpi.lastUpdated;
  const incomeDate = wb.indicators.income.lastUpdated;
  if (english) return `- Prepared on **${wb.snapshotDate}** from World Bank WDI. WDI last updated CPI on **${cpiDate}** and nominal GDP per capita on **${incomeDate}**. This is a dated snapshot, not a live feed.`;
  return `- 快照整理于 **${wb.snapshotDate}**，取自世界银行 WDI；CPI 最后更新于 **${cpiDate}**，名义人均 GDP 最后更新于 **${incomeDate}**。快照不是实时数据。`;
}

function coverage(english) {
  const lines = [english ? "| Economy | Years with both series | Note |" : "| 经济体 | 两项都有数据的年份 | 说明 |", "|---|---|---|"];
  for (const country of wb.countries) {
    const [zh, en] = names[country.iso3];
    if (!zh) throw new Error(`Unknown economy ${country.iso3}`);
    const range = `${country.firstYear}${english ? "–" : "—"}${country.lastYear}`;
    lines.push(`| ${english ? en : zh} | ${range} | |`);
  }
  lines.push("");
  lines.push(english
    ? `All six economies have paired data for **${wb.commonFirstYear}–${wb.commonLastYear}**. The comparison opens on 2000–${wb.commonLastYear}. Years outside an economy's coverage are marked incomplete.`
    : `六个经济体都有配对数据的共同区间是 **${wb.commonFirstYear}—${wb.commonLastYear}**。对比页默认显示 2000—${wb.commonLastYear} 年；超出某经济体覆盖范围的年份会标为“数据不完整”。`);
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
  if (!noChangelog) {
    const heading = english ? "## Changelog\n" : "## 更新记录\n";
    if (!document.includes(heading)) throw new Error(`Missing changelog in ${file}`);
    const date = new Date().toISOString().slice(0, 10);
    const title = mode === "abs" ? (english ? "ABS data candidate" : "ABS 数据候选更新") : (english ? "World Bank data candidate" : "世界银行数据候选更新");
    const detail = mode === "abs"
      ? (english ? `Updated the official original CPI/WPI snapshot through ${abs.latestQuarter}; review the candidate branch before merging.` : `将官方 CPI/WPI 原始序列快照更新至 ${abs.latestQuarter}；合并候选分支前请审阅。`)
      : (english ? `Updated the six-economy WDI snapshot through the shared year ${wb.commonLastYear}; review the candidate branch before merging.` : `将六经济体 WDI 快照更新至共同年份 ${wb.commonLastYear}；合并候选分支前请审阅。`);
    document = document.replace(heading, `${heading}\n### ${date} · ${title}\n\n- ${detail}\n`);
  }
  writeFileSync(fullPath, document);
}
