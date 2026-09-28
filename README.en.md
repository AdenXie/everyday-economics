# Everyday Economics

[简体中文文档](README.md)

Everyday Economics is a collection of reproducible, chart-led stories about everyday economic questions. A row of tabs at the top of the page reads **Australia | United States | South Korea | Japan | Singapore | China | Compare**.

- **Australia**: the first storyboard, comparing consumer prices and wage prices with quarterly ABS CPI and WPI, followed by an annual World Bank view.
- **United States, South Korea, Japan, Singapore, China**: annual World Bank data comparing CPI with nominal GDP per capita (current local currency) from a shared starting year.
- **Compare**: pick one period and see each economy's price rise, nominal GDP per capita rise, and change after CPI inflation side by side.

An **AI assistant** in the bottom-right corner lets readers ask about concepts they meet while reading the charts (see “AI assistant” below).

The Chinese and English pages are separate static pages. The site has no accounts, database, or browser-based translation requests.

## Live site and publishing

Visit [econ.adenxie.com.cn](https://econ.adenxie.com.cn/) or the [English page](https://econ.adenxie.com.cn/en/). The site is hosted on **Vercel**: static pages come from the `dist/` build output, and the AI assistant runs as the Vercel Function [`api/chat.js`](api/chat.js). [`vercel.json`](vercel.json) sets the build command (`npm run verify && npm test && npm run build`). It does not pin a function region, so the function follows the Vercel project setting **Settings → Functions → Function Region** (currently Singapore, `sin1`). Note that the Hong Kong `hkg1` region could not reach the AMD endpoint in testing; after changing region, ask the assistant a question on the live site to confirm it still works. Vercel builds and deploys every push to `main`, so maintainers should validate locally and push only when the user requests it. GitHub Pages is turned off; [`.github/workflows/pages.yml`](.github/workflows/pages.yml) now only runs the checks, tests and build on pushes and pull requests and no longer publishes. The data snapshot is not refreshed on a schedule.

## Run locally

Node.js 20 or newer is required. Serving the site does not require npm dependencies. Build the Chinese home page and English page at /en/, then start the local server:

    npm run build
    npm run dev

Open the local address printed by the server (usually http://127.0.0.1:4173/). The English page is at /en/. On first visit, the browser’s preferred language selects a page; the manual language switch remembers the selection and keeps the selected quarter range, tab, and years. The server listens on the local loopback interface only.

The tab and years live in the URL, so views can be shared: `?view=USA&from=2000&to=2024` opens the United States for 2000–2024, and `?view=compare&from=1997&to=2012` opens the comparison. `view` accepts `AUS`, `USA`, `KOR`, `JPN`, `SGP`, `CHN`, or `compare`; without it the Australia tab opens.

The local server also handles `/api/chat` the same way the Vercel Function does. To try the assistant locally, set the key in the same PowerShell window before starting the server; it lives only in that terminal session and is never written to a file:

    $env:RADEON_API_KEY = "rc-your-key"
    npm run dev

Without a key the pages and charts work as usual and the assistant reports that it is not configured.

If the default port is busy, set ECON_TAB_PORT to 0 in PowerShell before running npm run dev. The server will choose an available port and print its address. Press Ctrl+C in the server terminal to stop the preview.

## Bilingual copy

The manually maintained Chinese catalog is data/messages.zh.json. Its English counterpart is data/messages.en.json. Update the same keys in both files whenever interface or chart copy changes. The build checks that every Chinese key has an English translation, then generates the static English page and English chart messages. Visitors’ browsers do not call a translation service or receive API credentials.

## Australian ABS snapshot

<!-- abs-data-status:start -->
This snapshot was prepared on **2026-09-28**. It covers **116 consecutive paired quarters, 1997-Q3–2026-Q2**. It is a dated snapshot, not a live feed.
- CPI: [ABS Consumer Price Index, Australia, June 2026](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia/jun-2026), Table 17, original national all-groups series **A2325846C**; final index **102.31**.
- WPI: [ABS Wage Price Index, Australia, June 2026](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/wage-price-index-australia/jun-2026), Table 1, original Australia private and public, all industries, excluding bonuses series **A2603609J**; final index **161.2**.
- Official workbooks are retained in [data/sources](data/sources/). Their release details and SHA-256 hashes are in [data/source-manifest.json](data/source-manifest.json); the browser snapshot is [data/quarterly.json](data/quarterly.json).
<!-- abs-data-status:end -->

Official publications and methods:

- [CPI releases](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia) · [CPI methodology](https://www.abs.gov.au/methodologies/consumer-price-index-australia-methodology/jul-2026)
- [WPI releases](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/wage-price-index-australia) · [WPI methodology](https://www.abs.gov.au/methodologies/wage-price-index-australia-methodology/jun-2026)
- [ABS Data API guide](https://www.abs.gov.au/statistics/application-programming-interfaces-apis/data-api-user-guide): the API is marked beta and can lag behind ABS release pages. This snapshot uses the official release workbooks.

## Calculation and interpretation

For a selected start and end quarter:

    Normalized index(t) = 100 × index(t) / start index
    Cumulative change = 100 × (end index / start index − 1)
    CPI-indexed A$100 = A$100 × end CPI / start CPI
    Percentage-point gap = WPI cumulative change − CPI cumulative change

Both chart series are reset to 100 at the selected starting quarter because their published index reference periods differ. The A$100 amount illustrates CPI indexation; it is not a household bill or a fixed basket. CPI tracks household consumer prices with periodically updated weights. WPI tracks wage-price changes for comparable jobs while aiming to exclude changes in the quantity, quality, or composition of work; the series used here excludes bonuses. Neither national index determines an individual’s pay, after-tax income, hours, or spending.

Starting with the December 2025 release, ABS rebased quarterly CPI to September 2025 = 100. The storyboard compares relative changes within each selected range. Results use the rounded quarterly index values published by ABS and may differ slightly from calculations using unrounded internal data.

## Refresh the ABS snapshot

Run **Update ABS data** in GitHub Actions to read the latest official CPI Table 17 and WPI Table 1 workbooks and validate the original series and continuous paired quarters. Only changed values produce a `data/abs-update` candidate branch. Review the sources and changes before merging. If ABS changes the workbook layout or series definition, the workflow fails for manual investigation. The steps below also work locally:

1. Download the latest CPI Table 17 and WPI Table 1 workbooks from the corresponding ABS release pages and retain the original files in data/sources/.
2. Update data/source-manifest.json with the release dates, page URLs, series IDs and descriptions, workbook paths, SHA-256 hashes, and snapshot date. Keep the national original CPI series and the national original WPI series for private and public sectors combined, all industries, excluding bonuses.
3. With Python and openpyxl installed, run:

       python tools/extract_abs_snapshot.py --snapshot-date YYYY-MM-DD

   The extractor checks workbook hashes, series IDs, frequency, original/seasonally adjusted status, periods, and continuous coverage across the paired range. It allows CPI to have earlier history than WPI but does not accept missing quarters in their shared range.
4. Validate and rebuild:

       npm run verify
       npm test
       npm run build

If ABS changes a workbook layout or series ID, compare the release page and workbook Index sheet before changing the extractor or its explicit checks. Do not keep an old series definition simply because extraction succeeds. A push to `main` builds and publishes the website.

## World Bank: six economies (annual)

### Sources

<!-- worldbank-data-status:start -->
- Prepared on **2026-09-28** from World Bank WDI. WDI last updated CPI on **2026-07-13** and nominal GDP per capita on **2026-07-13**. This is a dated snapshot, not a live feed.
<!-- worldbank-data-status:end -->
- **CPI**: [`FP.CPI.TOTL`](https://data.worldbank.org/indicator/FP.CPI.TOTL), Consumer price index (2010 = 100), annual average; the World Bank cites the IMF International Financial Statistics as the original source.
- **Nominal GDP per capita**: [`NY.GDP.PCAP.CN`](https://data.worldbank.org/indicator/NY.GDP.PCAP.CN), GDP per capita (current LCU), in current local currency and not adjusted for inflation.
- Economies: Australia (AUS), United States (USA), South Korea (KOR), Japan (JPN), Singapore (SGP), China (CHN, mainland).

<!-- worldbank-coverage:start -->
| Economy | Years with both series | Note |
|---|---|---|
| Australia | 1960–2025 | |
| United States | 1960–2024 | |
| South Korea | 1960–2025 | |
| Japan | 1960–2025 | |
| Singapore | 1960–2025 | |
| China | 1986–2025 | |

All six economies have paired data for **1986–2024**. The comparison opens on 2000–2024. Years outside an economy's coverage are marked incomplete.
<!-- worldbank-coverage:end -->

### Files and checks

- [`data/sources/worldbank-FP.CPI.TOTL.json`](data/sources/worldbank-FP.CPI.TOTL.json) and [`data/sources/worldbank-NY.GDP.PCAP.CN.json`](data/sources/worldbank-NY.GDP.PCAP.CN.json): every non-null value from the API response, with the API URL, retrieval date, WDI update date, SHA-256 of the raw response, and a canonical SHA-256 of the values (`canonicalSha256`).
- [`data/worldbank-manifest.json`](data/worldbank-manifest.json): the economy list, indicator IDs, and source paths.
- [`tools/extract_worldbank.mjs`](tools/extract_worldbank.mjs): checks the canonical SHA-256, keeps years where both CPI and GDP per capita exist, requires those years to be continuous, and writes [`data/worldbank.json`](data/worldbank.json) for the browser.
- `npm run verify` rebuilds the snapshot from the sources and requires an exact match with `data/worldbank.json`. It also checks continuous years, positive values, and CPI = 100 in 2010 for every economy.

Canonical form: non-null values only, one `ISO3:year:value` line each (value serialized with `JSON.stringify`), sorted by ISO3 and then year, joined with newlines, then hashed with SHA-256.

### Calculation and interpretation

For a selected start and end year:

    Rebased index(t) = 100 × value(t) / start value
    CPI cumulative change = 100 × (end CPI / start CPI − 1)
    GDP per capita cumulative change = 100 × (end GDP per capita / start GDP per capita − 1)
    Percentage-point gap = GDP per capita change − CPI change
    Change after CPI inflation = 100 × [(end / start GDP per capita) / (end / start CPI) − 1]
    CPI-indexed amount = 100 units of local currency × end CPI / start CPI

- **Why nominal rather than real GDP per capita**: CPI is a nominal price level. To ask whether income kept up with prices, the other line must also be nominal, just as the Australian page compares CPI with the WPI. Real GDP per capita (constant prices) has already been deflated by the GDP deflator, so comparing it with CPI would remove inflation twice.
- **A ratio, not the percentage-point gap**: over long periods they differ a lot. If prices double and nominal income triples, the gap is 100 points but income after inflation is only 50% higher. The page shows both.
- **Changes are comparable across economies; levels are not**: each economy's changes are measured in its own currency, so the percentages can sit side by side. GDP per capita levels are not converted by exchange rates or purchasing power parity (PPP) and should not be ranked.
- **GDP per capita is not a wage**: it is output per person and includes company profits and government revenue. In economies with a large foreign-owned sector, such as Singapore, GDP per capita can sit well above what residents receive.
- **Annual CPI differs from ABS quarterly CPI**: World Bank CPI is an annual average with 2010 = 100; the ABS quarterly index on the Australia tab uses September 2025 = 100. They will not match exactly.

### Refresh the World Bank snapshot

The **Update World Bank data** GitHub Action checks the two WDI indicators in January, April, July, and October, and can also run manually. Changed values create a `data/worldbank-update` candidate branch. Review and merge it into `main` to update the site. Scheduled runs can be delayed or missed; the manual entry remains available. Locally, run `npm run refresh:worldbank`, then `npm run extract:worldbank` and the three checks below if data changed.

1. Open both URLs in a browser (the repository's command-line environment may not reach the API directly):
   - `https://api.worldbank.org/v2/country/AUS;USA;KOR;JPN;SGP;CHN/indicator/FP.CPI.TOTL?format=json&per_page=1000&date=1960:2025`
   - `https://api.worldbank.org/v2/country/AUS;USA;KOR;JPN;SGP;CHN/indicator/NY.GDP.PCAP.CN?format=json&per_page=1000&date=1960:2025`

   Raise the end year in `date=1960:2025` when newer years are needed.
2. Write each response's non-null values into `series` in `data/sources/worldbank-<indicator>.json` as `{"ISO3": {"year": value}}`, and update `retrievedOn`, `lastUpdated` (the response's `lastupdated`), `rawResponse`, and `canonicalSha256`. Compute `canonicalSha256` in the browser that fetched the data, using the canonical form above, so the transcription can be proven exact.
3. Update `preparedOn` in `data/worldbank-manifest.json` if needed.
4. Run:

       npm run extract:worldbank
       npm run verify
       npm test
       npm run build

   The extractor stops if an economy has a gap in its years. Find out why before changing anything; do not drop years just to pass the checks.

## AI assistant

The floating button in the bottom-right corner opens an economics helper that explains the concepts and numbers on the page.

- **Model**: set by the Vercel environment variable `AI_MODEL`, currently `Qwen3.8-27B` from AMD Radeon Cloud Token Factory. The assistant header shows the configured model (read from `GET /api/chat`, which returns only the model name, never the key). Called through the OpenAI-compatible endpoint `https://developer.amd.com.cn/radeon/api/v1/chat/completions` with streaming and `reasoning_effort: low` by default for quicker answers (adjustable with `AI_REASONING_EFFORT`). The model's `<think>` reasoning is never shown.
- **The API key stays on the server**: browsers call `/api/chat` on the same domain; the key lives in the Vercel environment variable `RADEON_API_KEY` and is added by [`server/ai-proxy.js`](server/ai-proxy.js). It is not in the page code, the repository, or the build output.
- **The system prompt is set on the server**: use only page data or numbers the reader gives, never invent statistics, no investment, tax or legal advice, and answer in the reader's language. Browsers cannot change the prompt, model or parameters.
- **Page context**: each question carries the current tab, years and the cumulative changes shown on the page (up to 1,400 characters) so answers can refer to what the reader is looking at. The server marks this as data and ignores any instructions inside it.
- **Nothing is saved**: the conversation exists only in the page's memory — not in localStorage, cookies or any server — and a reload clears it. The server logs no message content and has no database.
- **Interaction**: the button opens and closes the panel; moving the pointer or focus back to the page never closes it, only that button (or the × inside the panel) does. Answers are selectable text and each has a Copy button for the original text; generation can be stopped, and the conversation can be cleared. Enter sends, Shift+Enter adds a line, and Enter while choosing characters in an IME does not send.
- **Abuse limits**: the server accepts requests only from the site's own pages (production domain, Vercel preview URLs and local preview); at most 6 questions per IP per minute (a best-effort limit within each function instance); up to 1,500 characters per question, 16 history messages, and 1,200 tokens per answer. The AMD free tier allows about 20 requests per minute per account, shared by all visitors; beyond that readers are asked to wait.
- **Privacy note**: questions and page context are processed by the Vercel Function and AMD Radeon Cloud.

### Deploy to Vercel (one-time setup)

1. Sign in to [vercel.com](https://vercel.com/) with GitHub, choose **Add New → Project**, and import `AdenXie/everyday-economics`. Choose the **Other** framework preset; build settings come from `vercel.json`.
2. On the import screen (or later in **Settings → Environment Variables**) add `RADEON_API_KEY` with the AMD Token Factory key (starting with `rc-`) for Production and Preview, then deploy.
3. In **Settings → Domains**, add `econ.adenxie.com.cn` and update the domain's DNS as Vercel instructs (usually a CNAME for `econ` pointing to the address Vercel shows).
4. In the GitHub repository, **Settings → Pages**, remove the custom domain and turn off Pages so the two platforms do not compete for the domain. Then edit `.github/workflows/pages.yml`: delete the whole `deploy` job and the `actions/configure-pages` and `actions/upload-pages-artifact` steps, keeping only the verify, test and build checks (otherwise every push reports a failed deployment once Pages is off).
5. Every push to `main` then deploys automatically. After changing the key, redeploy on Vercel for it to take effect.

**Changing the model**: edit `AI_MODEL` in the Vercel project's **Settings → Environment Variables** (type Config, Production), then open **Deployments** and **Redeploy** the latest deployment; environment variables only apply to new deployments. The model ID must match the AMD Token Factory model list exactly, for example `Qwen3.8-27B`, `Qwen3.8-Flash-Next`, or `DeepSeek-V4-Flash`. Ask the assistant a question on the live site afterwards to confirm it works.

| Variable | Type | Purpose |
|---|---|---|
| `RADEON_API_KEY` | Secret (required) | AMD Token Factory key, starting with `rc-` |
| `AI_MODEL` | Config | Model ID to call; falls back to `Qwen3.8-27B` when unset |
| `AI_REASONING_EFFORT` | Config (optional) | Reasoning effort, default `low`; `none` omits the parameter for models that do not support it. `Qwen3.8-27B` accepts only `low`, `medium`, and `xhigh` |
| `UPSTREAM_URL` | Config (optional) | Upstream endpoint, default: the AMD public endpoint |
| `ALLOWED_ORIGINS` | Config (optional) | Comma-separated extra allowed origins |

## Design and bundled fonts

The visual system is designed as an interactive editorial data sheet: the headline frames a question, quarter controls support precise comparison, and the chart carries the main explanation. The paper texture is drawn with local CSS; the site does not load remote images or web services.

- English interface, headings, and chart labels use a local Latin subset of Plus Jakarta Sans.
- English body copy uses a local Latin subset of Newsreader.
- Chinese UI uses Adobe Source Han Sans CN, an unmodified Simplified Chinese variable WOFF2 subset from Adobe’s official repository. The bundled file is 7,995,716 bytes (about 8.0 MB); its weight axis is 250–900.
- Chinese body copy uses Adobe Source Han Serif CN, the bundled Simplified Chinese variable WOFF2 subset (10,421,244 bytes, about 10.4 MB).
- Adobe uses CN to identify its Simplified Chinese regional subset; these correspond to the Source Han Sans SC / Source Han Serif SC variants commonly named by users.
- Both Source Han fonts are distributed under the SIL Open Font License 1.1, with their license texts in assets/fonts/. Sources: [Source Han Sans CN WOFF2](https://github.com/adobe-fonts/source-han-sans/blob/release/Variable/WOFF2/OTF/Subset/SourceHanSansCN-VF.otf.woff2), [Source Han Sans license](https://github.com/adobe-fonts/source-han-sans/blob/master/LICENSE.txt), [Source Han Serif CN WOFF2](https://github.com/adobe-fonts/source-han-serif/blob/release/Variable/WOFF2/OTF/Subset/SourceHanSerifCN-VF.otf.woff2), and [Source Han Serif license](https://github.com/adobe-fonts/source-han-serif/blob/master/LICENSE.txt).
- Plus Jakarta Sans and Newsreader are also distributed under the SIL Open Font License 1.1; their font files and license texts are in assets/fonts/. Their sources are [Google Fonts / Plus Jakarta Sans](https://github.com/google/fonts/tree/main/ofl/plusjakartasans) and [Production Type / Newsreader](https://github.com/productiontype/Newsreader).

**Chart colors**: the country tabs and the comparison use only two colors, CPI terracotta and income eucalyptus, with the same meaning as CPI and WPI on the Australia tab. The comparison does not draw six colored lines, because six hues cannot all be told apart from each other (including by readers with color-vision differences). Instead each economy gets a row with two bars; the row label identifies the economy, the bars share one scale across the table, and a vertical rule marks 0. Annual charts show each year's values on hover.

All font files are served from this project; the page does not request fonts from Google Fonts or another font CDN. The page supports keyboard navigation, narrow screens, and prefers-reduced-motion.

## Code, font, and data licenses

The Apache License 2.0 in LICENSE applies only to this project’s original code. It does not apply to bundled fonts, ABS workbooks, the derived data snapshot, or other third-party material. Apache-2.0 includes an express contributor patent grant and redistribution notice requirements.

The four bundled font families have their own license files in assets/fonts/. Both Source Han fonts are covered by the SIL Open Font License 1.1.

World Bank WDI data are generally available under [CC BY 4.0](https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets). When reusing the World Bank charts or derived data from this site, credit “Based on World Bank World Development Indicators data” and follow the original sources named on each indicator page.

The ABS states that website material is generally available under the [Creative Commons Attribution 4.0 International License (CC BY 4.0)](https://www.abs.gov.au/privacy-and-legals), with exceptions including the Coat of Arms, ABS logo, microdata, third-party material, and material protected by trademarks, as well as any product-specific terms. The official CPI and WPI workbooks in data/sources/ and the derived snapshot are separate from the project’s Apache-2.0 code license. Reusers should follow the applicable ABS terms and retain attribution. For attribution of the transformed data used in this storyboard, use: “Based on Australian Bureau of Statistics data.”

## Changelog

### 28 September 2026 · Data update workflows

- Added a manual ABS update and a quarterly World Bank check in GitHub Actions. Changed data produces a candidate branch after source and build checks; a maintainer reviews and merges it before the live site changes.
- Snapshot descriptions and bilingual changelogs update with candidate data. Removed fixed latest-quarter and US-year assumptions that would block later releases.

### 28 September 2026 · Model set by a Vercel environment variable

- The model is now chosen by the Vercel environment variable `AI_MODEL` (currently `Qwen3.8-27B`), so switching models needs no code change; added the optional `AI_REASONING_EFFORT`.
- `GET /api/chat` returns the configured model name, which the assistant header shows instead of a hard-coded label.
- Added matching tests in `tests/ai-proxy.test.mjs`.

### 28 September 2026 · AI assistant and move to Vercel

- Added a floating AI assistant in the bottom-right corner using `Qwen3.8-27B` from AMD Radeon Cloud Token Factory: streamed, copyable answers that can be stopped or cleared. It does not close when the pointer or focus returns to the page, and the conversation lives only in page memory, so a reload clears it.
- Each question automatically includes the current tab, years and cumulative changes shown on the page.
- Moved hosting from GitHub Pages to Vercel: added `vercel.json`, the Vercel Function `api/chat.js`, and the server-side proxy `server/ai-proxy.js` (origin check, per-IP limit, input limits, server-side system prompt). The API key is stored only in the Vercel environment variable `RADEON_API_KEY`.
- GitHub Pages is turned off and `.github/workflows/pages.yml` is now check-only.
- Vercel function region: Hong Kong `hkg1` could not reach the AMD endpoint, so Sydney `syd1` was used to confirm it works; `vercel.json` then stopped pinning a region and follows the project setting (Singapore, `sin1`).
- The local preview server `tools/serve.mjs` now serves `/api/chat`; set `RADEON_API_KEY` to try the assistant locally.
- Added `src/assistant.js`, `tests/ai-proxy.test.mjs`, and `ai.*` copy in both languages.

### 28 September 2026 · World Bank data for six economies

- Added tabs at the top of the page: Australia, United States, South Korea, Japan, Singapore, China, and Compare. The active tab and years are stored in the URL (`view`, `from`, `to`) and kept when switching language.
- Added annual World Bank WDI data: CPI (`FP.CPI.TOTL`) and nominal GDP per capita (`NY.GDP.PCAP.CN`) for Australia, the United States, South Korea, Japan, Singapore, and China, retrieved on 28 September 2026 (WDI updated 13 July 2026).
- New files: `data/sources/worldbank-*.json` (checksummed source values), `data/worldbank-manifest.json`, `data/worldbank.json`, `tools/extract_worldbank.mjs`, `src/world.js`, `tests/worldbank.test.mjs`.
- `src/analysis.js` gains `calculateYearWindow` and `compareCountries`; `tools/verify-data.mjs` now rebuilds and compares the World Bank snapshot and checks continuity; `npm run extract:worldbank` regenerates the snapshot.
- Annual charts gained a hover tooltip; the comparison can be sorted by change after inflation, price rise, or GDP per capita rise.
- The site name is now “Everyday Economics · Prices and income”; new Chinese and English copy was added to both catalogs (`data/messages.zh.json` / `data/messages.en.json`).

### 28 September 2026 · First release

- Published the Australian CPI and WPI quarterly storyboard as static Chinese and English pages on GitHub Pages at `econ.adenxie.com.cn`, with the code under Apache-2.0.
