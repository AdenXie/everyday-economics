# Everyday Economics

[简体中文文档](README.md)

Everyday Economics is a collection of reproducible, chart-led stories about everyday economic questions. The first storyboard compares Australian consumer prices and wage prices using quarterly CPI and WPI data. The project can grow to cover other economies and topics; World Bank data is planned for a future addition and is not included yet.

The Chinese and English pages are separate static pages. The site has no accounts, database, browser-based translation requests, or automatic publishing.

## Run locally

Node.js 18 or newer is required. Serving the site does not require npm dependencies. Build the Chinese home page and English page at /en/, then start the local server:

    npm run build
    npm run dev

Open the local address printed by the server (usually http://127.0.0.1:4173/). The English page is at /en/. On first visit, the browser’s preferred language selects a page; the manual language switch remembers the selection and keeps the selected quarter range. The server listens on the local loopback interface only.

If the default port is busy, set ECON_TAB_PORT to 0 in PowerShell before running npm run dev. The server will choose an available port and print its address. Press Ctrl+C in the server terminal to stop the preview.

## Bilingual copy

The manually maintained Chinese catalog is data/messages.zh.json. Its English counterpart is data/messages.en.json. Update the same keys in both files whenever interface or chart copy changes. The build checks that every Chinese key has an English translation, then generates the static English page and English chart messages. Visitors’ browsers do not call a translation service or receive API credentials.

## Current data snapshot

This snapshot was prepared on 28 September 2026. The latest quarter currently shared by both series is 2026 Q2. It covers 116 consecutive quarters, from 1997 Q3 to 2026 Q2. This is a dated snapshot, not a live feed.

- CPI: Australian Bureau of Statistics (ABS), Consumer Price Index, Australia, June 2026, Table 17, “All groups CPI; Australia; Original,” series A2325846C. The national CPI is a weighted average of the eight capital cities. The table’s final index value is 102.31.
- WPI: ABS, Wage Price Index, Australia, June 2026, Table 1, “Total hourly rates of pay excluding bonuses; Australia; Private and Public; All industries; Original,” series A2603609J. The final original index is 161.2. The 161.7 value in the same table is seasonally adjusted and is not used here.
- The official source workbooks are retained in data/sources/. Publication details, series IDs, workbook paths, and SHA-256 hashes are recorded in data/source-manifest.json. The compact snapshot used by the browser is data/quarterly.json.

Official publications and methods:

- [ABS CPI, June 2026](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia/jun-2026) · [CPI methodology](https://www.abs.gov.au/methodologies/consumer-price-index-australia-methodology/jul-2026)
- [ABS WPI, June 2026](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/wage-price-index-australia/jun-2026) · [WPI methodology](https://www.abs.gov.au/methodologies/wage-price-index-australia-methodology/jun-2026)
- [ABS Data API guide](https://www.abs.gov.au/statistics/application-programming-interfaces-apis/data-api-user-guide): the API is marked beta and can lag behind ABS release pages. This snapshot uses the official release workbooks.

## Calculation and interpretation

For a selected start and end quarter:

    Normalized index(t) = 100 × index(t) / start index
    Cumulative change = 100 × (end index / start index − 1)
    CPI-indexed A$100 = A$100 × end CPI / start CPI
    Percentage-point gap = WPI cumulative change − CPI cumulative change

Both chart series are reset to 100 at the selected starting quarter because their published index reference periods differ. The A$100 amount illustrates CPI indexation; it is not a household bill or a fixed basket. CPI tracks household consumer prices with periodically updated weights. WPI tracks wage-price changes for comparable jobs while aiming to exclude changes in the quantity, quality, or composition of work; the series used here excludes bonuses. Neither national index determines an individual’s pay, after-tax income, hours, or spending.

Starting with the December 2025 release, ABS rebased quarterly CPI to September 2025 = 100. The storyboard compares relative changes within each selected range. Results use the rounded quarterly index values published by ABS and may differ slightly from calculations using unrounded internal data.

## Refresh the snapshot

1. Download the latest CPI Table 17 and WPI Table 1 workbooks from the corresponding ABS release pages and retain the original files in data/sources/.
2. Update data/source-manifest.json with the release dates, page URLs, series IDs and descriptions, workbook paths, SHA-256 hashes, and snapshot date. Keep the national original CPI series and the national original WPI series for private and public sectors combined, all industries, excluding bonuses.
3. With Python and openpyxl installed, run:

       python tools/extract_abs_snapshot.py --snapshot-date YYYY-MM-DD

   The extractor checks workbook hashes, series IDs, frequency, original/seasonally adjusted status, periods, and continuous coverage across the paired range. It allows CPI to have earlier history than WPI but does not accept missing quarters in their shared range.
4. Validate and rebuild:

       npm run verify
       npm test
       npm run build

If ABS changes a workbook layout or series ID, compare the release page and workbook Index sheet before changing the extractor or its explicit checks. Do not keep an old series definition simply because extraction succeeds. The repository has no scheduled job or publishing action.

## Design and bundled fonts

The visual system is designed as an interactive editorial data sheet: the headline frames a question, quarter controls support precise comparison, and the chart carries the main explanation. The paper texture is drawn with local CSS; the site does not load remote images or web services.

- English interface, headings, and chart labels use a local Latin subset of Plus Jakarta Sans.
- English body copy uses a local Latin subset of Newsreader.
- Chinese UI uses Adobe Source Han Sans CN, an unmodified Simplified Chinese variable WOFF2 subset from Adobe’s official repository. The bundled file is 7,995,716 bytes (about 8.0 MB); its weight axis is 250–900.
- Chinese body copy uses Adobe Source Han Serif CN, the bundled Simplified Chinese variable WOFF2 subset (10,421,244 bytes, about 10.4 MB).
- Adobe uses CN to identify its Simplified Chinese regional subset; these correspond to the Source Han Sans SC / Source Han Serif SC variants commonly named by users.
- Both Source Han fonts are distributed under the SIL Open Font License 1.1, with their license texts in assets/fonts/. Sources: [Source Han Sans CN WOFF2](https://github.com/adobe-fonts/source-han-sans/blob/release/Variable/WOFF2/OTF/Subset/SourceHanSansCN-VF.otf.woff2), [Source Han Sans license](https://github.com/adobe-fonts/source-han-sans/blob/master/LICENSE.txt), [Source Han Serif CN WOFF2](https://github.com/adobe-fonts/source-han-serif/blob/release/Variable/WOFF2/OTF/Subset/SourceHanSerifCN-VF.otf.woff2), and [Source Han Serif license](https://github.com/adobe-fonts/source-han-serif/blob/master/LICENSE.txt).
- Plus Jakarta Sans and Newsreader are also distributed under the SIL Open Font License 1.1; their font files and license texts are in assets/fonts/. Their sources are [Google Fonts / Plus Jakarta Sans](https://github.com/google/fonts/tree/main/ofl/plusjakartasans) and [Production Type / Newsreader](https://github.com/productiontype/Newsreader).

All font files are served from this project; the page does not request fonts from Google Fonts or another font CDN. The page supports keyboard navigation, narrow screens, and prefers-reduced-motion.

## Code, font, and data licenses

The MIT License in LICENSE applies only to this project’s original code. It does not apply to bundled fonts, ABS workbooks, the derived data snapshot, or other third-party material.

The four bundled font families have their own license files in assets/fonts/. Both Source Han fonts are covered by the SIL Open Font License 1.1.

The ABS states that website material is generally available under the [Creative Commons Attribution 4.0 International License (CC BY 4.0)](https://www.abs.gov.au/privacy-and-legals), with exceptions including the Coat of Arms, ABS logo, microdata, third-party material, and material protected by trademarks, as well as any product-specific terms. The official CPI and WPI workbooks in data/sources/ and the derived snapshot are separate from the project’s MIT code license. Reusers should follow the applicable ABS terms and retain attribution. For attribution of the transformed data used in this storyboard, use: “Based on Australian Bureau of Statistics data.”
