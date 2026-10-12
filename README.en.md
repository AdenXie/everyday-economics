# Everyday Economics

[简体中文](README.md)

An open-source economic data explorer built on official statistics. Rebased indices and changes over shared periods help readers understand consumer prices, wage prices and output per person.

- Compare Australian consumer prices and wage prices using quarterly ABS CPI and WPI.
- Explore long-term changes in eight economies using annual World Bank CPI and nominal GDP per capita.
- Use separate Chinese and English pages with reproducible sources and calculations.

## Run locally

Node.js 20 or newer is required. The core charts need no external AI service or npm runtime dependencies.

```sh
npm run build
npm run dev
```

Open the local address printed by the server. Chinese is served at the root and English at `/en/`; build output is written to `dist/`. Rebuild after editing source files to update the preview.

## Data sources

### ABS: Australian quarterly prices and wages

| Indicator | Official series | Definition |
|---|---|---|
| CPI | Table 17, `A2325846C` | National All groups consumer price index, original quarterly series |
| WPI | Table 1, `A2603609J` | Australia, private and public sectors, all industries, excluding bonuses, original quarterly series |

Sources: [ABS CPI](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia) / [ABS WPI](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/wage-price-index-australia). Compare only quarters published for both indicators; do not insert monthly CPI directly into a quarterly series.

<!-- abs-data-status:start -->
Prepared on **2026-09-28**; **116 consecutive paired quarters, 1997-Q3–2026-Q2**. Release details and workbook checksums are recorded in [the source manifest](data/source-manifest.json).
<!-- abs-data-status:end -->

### World Bank: annual prices and output per person

| Indicator | ID | Units and definition |
|---|---|---|
| Consumer price index | [`FP.CPI.TOTL`](https://data.worldbank.org/indicator/FP.CPI.TOTL) | Annual average, 2010 = 100 |
| Nominal GDP per capita | [`NY.GDP.PCAP.CN`](https://data.worldbank.org/indicator/NY.GDP.PCAP.CN) | Current local currency, not adjusted for inflation |

Economies and indicators are defined in [the World Bank source manifest](data/worldbank-manifest.json). Values come from the official API; non-null observations, source URLs, retrieval dates, source update dates and checksums are retained.

<!-- worldbank-data-status:start -->
- Prepared on **2026-10-12** from World Bank WDI. WDI last updated CPI on **2026-10-08** and nominal GDP per capita on **2026-10-08**. This is a dated snapshot, not a live feed.
<!-- worldbank-data-status:end -->

<!-- worldbank-coverage:start -->
| Economy | Years with both series |
|---|---|
| Australia | 1960–2025 |
| United States | 1960–2024 |
| South Korea | 1960–2025 |
| Japan | 1960–2025 |
| Singapore | 1960–2025 |
| China | 1986–2025 |
| Germany | 1960–2025 |
| United Kingdom | 1960–2025 |

The shared paired range is **1986–2024**. Comparisons require both indicators throughout the selected period.
<!-- worldbank-coverage:end -->

Data are provided as snapshots. Publication dates, retrieval dates and available observation periods are different concepts: a new release may revise historical values without adding a comparable quarter or year.

## Calculations

For an indicator with starting value `X₀` and ending value `X₁`:

```text
Rebased index(t) = 100 × X(t) / X₀
Cumulative change (%) = 100 × (X₁ / X₀ − 1)
Percentage-point gap = change in indicator A − change in indicator B
CPI-indexed amount = starting amount × ending CPI / starting CPI
```

The change in annual nominal GDP per capita after CPI inflation is:

```text
Change (%) = 100 × [(ending GDP per capita / starting GDP per capita)
                  / (ending CPI / starting CPI) − 1]
```

If prices double and nominal GDP per capita triples, the growth gap is 100 percentage points, while the CPI-adjusted increase is 50%. The ratio and the percentage-point gap answer different questions.

- CPI is a weighted consumer price measure, not an individual household's bill.
- WPI measures wage prices for a comparable mix of jobs, not individual pay, hours or after-tax income.
- GDP per capita measures average output, not wages or household disposable income. Adjusting it by CPI also differs from real GDP per capita calculated using the GDP deflator.
- Pair CPI with nominal GDP per capita; do not divide an already inflation-adjusted real GDP series by CPI again.
- Compare each economy's own growth rates. Local-currency amounts cannot be ranked without exchange-rate or purchasing-power-parity conversion.
- Do not mix quarterly and annual frequencies, invent missing observations or subtract the raw levels of indices with different definitions.

## Refresh and validate data

The ABS updater needs Python and `openpyxl`. Prepare the environment and check data with:

```sh
python -m pip install openpyxl==3.1.5
npm run refresh:abs
npm run refresh:worldbank
npm run extract:worldbank
node tools/record_data_refresh.mjs both
npm run verify
npm test
npm run build
```

The reusable process is: fetch official sources → validate series definitions and values → generate paired snapshots → refresh data notes → test and build → review before publishing. Existing snapshots are kept when source values do not change; refreshing notes updates only the current data overview.

- The ABS extractor checks workbook hashes, series IDs, definitions, frequency, units and original-series adjustment type.
- The World Bank extractor verifies `canonicalSha256`, then generates continuous paired years with both indicators present.
- `npm run verify` checks continuity, positive values, source integrity and exact World Bank snapshot reconstruction.
- If a source changes its definition, layout or coverage, investigate before adjusting extraction logic; do not bypass checks by editing generated snapshots.

The [ABS workflow](.github/workflows/update-abs.yml) runs manually. The [World Bank workflow](.github/workflows/update-worldbank.yml) supports quarterly checks and manual runs. Changed values produce a candidate branch for review and merge before publication. Scheduled runs are not guaranteed to execute immediately; the same commands can be used for a manual check.

## Reusable implementation

The frontend reads pre-generated snapshots, calculates changes over a selected period and draws charts. Separating data retrieval and validation from presentation reduces external requests at runtime and makes results reproducible.

Chinese and English copy is maintained in `data/messages.zh.json` and `data/messages.en.json`. Update the same key in both catalogs when changing copy; the build generates separate static language pages.

Everyday readings translate the selected period's percentages into index and money illustrations, alongside clearly labelled fictional exercises. Maintainers curate historical phases from official sources and cite them individually; readers can switch the chart to the relevant period. Ranges and source links live in `src/story-chapters.js`, while bilingual prose remains in the message catalogs. When revising a narrative, check its sources and the snapshot's movements, distinguishing historical context from causation that the curves alone cannot establish.

Optional AI assistance should connect to model services through a server. Keep credentials, model settings, prompts and request limits on the server; the browser sends only the necessary question and data context. Current conversations exist only in page memory and clear on reload. When enabling an external service, explain how it processes user data.

Preserve semantic labels, keyboard operation, narrow-screen layouts and clear units. Use text or line styles as well as color to distinguish indicators. If analytics are enabled, collect only necessary aggregate information and avoid logging conversation content or credentials.

## Project structure

| Path | Purpose |
|---|---|
| `index.html`, `src/` | Pages, interaction, charts and calculations |
| `data/sources/` | Official workbooks and checksummed source values |
| `data/*manifest.json` | Series definitions, economies and source metadata |
| `data/quarterly.json`, `data/worldbank.json` | Generated data snapshots |
| `tools/` | Retrieval, extraction, data-note synchronization and build tools |
| `server/`, `api/` | Optional AI server logic |
| `tests/` | Calculation, bilingual-output and server-behavior tests |
| `assets/fonts/` | Font assets and their licenses |

## Licensing and attribution

Original code is licensed under [Apache License 2.0](LICENSE). Fonts and data retain their own terms and are not automatically covered by the code license.

- Font license texts are kept in [assets/fonts/](assets/fonts/); retain the relevant notices when using or distributing them.
- Follow the [ABS licensing and attribution requirements](https://www.abs.gov.au/privacy-and-legals), including exceptions for third-party material. Derived charts can be credited as “Based on Australian Bureau of Statistics data”.
- Follow the [World Bank dataset terms](https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets) and the original sources identified for each indicator. Retain World Bank World Development Indicators attribution for derived charts.
