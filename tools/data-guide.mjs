import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { escapeAttribute, escapeHtml } from "./i18n.mjs";

const site = "https://econ.adenxie.com.cn";
const dataFiles = ["quarterly.json", "worldbank.json", "china-nbs.json"];

function link(href, label) {
  return `<a href="${escapeAttribute(href)}">${escapeHtml(label)}</a>`;
}

function table(title, headings, rows) {
  return `<table class="data-guide-table" aria-label="${escapeAttribute(title)}">
  <thead><tr>${headings.map((heading) => `<th scope="col">${escapeHtml(heading)}</th>`).join("")}</tr></thead>
  <tbody>
${rows.map(([label, ...values]) => `    <tr><th scope="row">${escapeHtml(label)}</th>${values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("\n")}
  </tbody>
</table>`;
}

function renderGuide(messages, locale, abs, world, china) {
  const english = locale === "en";
  const t = (key) => messages[`dataGuide.${key}`];
  const text = (key) => escapeHtml(t(key));
  const latestAbs = abs.observations.at(-1);
  const latestChina = china.observations.at(-1);
  const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const income = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const pct = (value) => value == null ? "—" : `${value}%`;
  const json = (file) => link(`/data/${file}`, file);

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${text("title")} | ${english ? "Everyday Economics" : "日常经济学"}</title>
  <link rel="stylesheet" href="/src/style.css" />
  <link rel="describedby" href="/llms.txt" />
  <link rel="alternate" hreflang="${english ? "zh-CN" : "en"}" href="${english ? "/data/" : "/en/data/"}" />
</head>
<body>
<div class="page-shell">
  <main class="data-guide">
    <p>${link(english ? "/en/" : "/", t("home"))} · ${english ? '<a href="/data/" lang="zh-CN">中文</a>' : '<a href="/en/data/" lang="en">English</a>'}</p>
    <h1>${text("title")}</h1>
    <p>${text("intro")}</p>
    <section id="abs">
      <h2>${text("abs")}</h2>
      <p>${text("snapshot")} ${abs.snapshotDate} · ${text("coverage")} ${abs.firstQuarter}–${abs.latestQuarter} · ${json(dataFiles[0])}</p>
      <p>${text("absFields")}</p>
      ${table(t("abs"), [t("latest"), "CPI", "WPI", t("absCpiChange"), t("absWpiChange")], [[latestAbs.period, latestAbs.cpiIndex, latestAbs.wpiIndex, pct(latestAbs.cpiQuarterChangePct), pct(latestAbs.wpiQuarterChangePct)]])}
      <p>${text("source")} · ${link(abs.series.cpi.pageUrl, `ABS CPI ${abs.series.cpi.seriesId}`)} · ${link(abs.series.wpi.pageUrl, `ABS WPI ${abs.series.wpi.seriesId}`)}</p>
    </section>
    <section id="world-bank">
      <h2>${text("world")}</h2>
      <p>${text("snapshot")} ${world.snapshotDate} · ${text("common")} ${world.commonFirstYear}–${world.commonLastYear} · ${json(dataFiles[1])}</p>
      <p>${text("worldFields")}</p>
      ${table(t("world"), [t("economy"), t("coverage"), "CPI", t("worldGdp")], world.countries.map(({ iso3, firstYear, lastYear, observations }) => {
        const latest = observations.at(-1);
        return [`${messages[`country.${iso3}`]} (${iso3})`, `${firstYear}–${lastYear}`, decimal.format(latest.cpi), whole.format(latest.gdpPerCapita)];
      }))}
      <p>${text("source")} · ${link(world.indicators.cpi.pageUrl, world.indicators.cpi.id)} · ${link(world.indicators.income.pageUrl, world.indicators.income.id)}</p>
    </section>
    <section id="china">
      <h2>${text("china")}</h2>
      <p>${text("snapshot")} ${china.snapshotDate} · ${text("coverage")} ${china.firstYear}–${china.lastYear} · ${json(dataFiles[2])}</p>
      <p>${text("chinaFields")}</p>
      ${table(t("china"), [t("latest"), "CPI", t("disposable"), t("wage")], [[latestChina.year, decimal.format(latestChina.cpi), income.format(latestChina.disposableIncome), income.format(latestChina.wageIncome)]])}
      <p>${text("source")} · ${link("https://www.stats.gov.cn/sj/ndsj/", english ? "China Statistical Yearbooks" : "中国统计年鉴")} · ${text("chinaReferences")}</p>
    </section>
    <section id="methods">
      <h2>${text("methods")}</h2>
      <ul>
        <li>${text("change")}</li>
        <li>${text("real")}</li>
        <li>${text("conversion")}</li>
      </ul>
    </section>
    <p>${link("/llms.txt", "llms.txt")}</p>
  </main>
</div>
</body>
</html>
`;
}

export async function writeDataGuide(output) {
  const readJson = async (file) => JSON.parse(await readFile(path.join(output, "data", file), "utf8"));
  const [abs, world, china, zh, en] = await Promise.all([...dataFiles, "messages.zh.json", "messages.en.json"].map(readJson));
  const englishDir = path.join(output, "en/data");
  await mkdir(englishDir, { recursive: true });

  const index = `# Everyday Economics | 日常经济学

> Official statistical snapshots for comparing prices, wage prices, output per person and resident income. The site publishes quarterly and annual data with different coverage and units.

Use the data guides for field definitions, calculations and latest paired observations. Use the JSON files for exact values and source references. Cite the observation period separately from the snapshot preparation date. The quarterly ABS snapshot only includes periods with both CPI and WPI.

## Data guides

- [数据与口径](${site}/data/): 字段、单位、最新配对观测与计算方法。
- [Data and methods](${site}/en/data/): Field definitions, units, latest paired observations and calculations.

## JSON snapshots

- [Australia quarterly CPI and WPI](${site}/data/${dataFiles[0]}): Original ABS series and published quarter-on-quarter changes.
- [World Bank annual CPI and nominal GDP per capita](${site}/data/${dataFiles[1]}): The countries array contains ten economies identified by ISO alpha-3 code, with CPI and GDP per capita in current local currency.
- [China annual CPI and resident income](${site}/data/${dataFiles[2]}): NBS annual CPI and nominal disposable and wage income in yuan per resident.
`;

  await Promise.all([
    writeFile(path.join(output, "llms.txt"), index, "utf8"),
    writeFile(path.join(output, "data/index.html"), renderGuide(zh, "zh-CN", abs, world, china), "utf8"),
    writeFile(path.join(englishDir, "index.html"), renderGuide(en, "en", abs, world, china), "utf8"),
  ]);
}
