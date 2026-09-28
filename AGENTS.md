# Maintenance instructions

- Keep `data/messages.zh.json` and `data/messages.en.json` in sync. When adding or changing interface or chart copy, update the same key in both files with clear, reviewed Chinese and English wording.
- Preserve the ABS definitions in `data/source-manifest.json`: CPI Table 17 original series `A2325846C`; WPI Table 1 original series `A2603609J` (Australia, Private and Public, all industries, excluding bonuses). Keep the paired-quarter range continuous and validate from the official workbooks.
- World Bank data: keep `FP.CPI.TOTL` (CPI, 2010 = 100) paired with `NY.GDP.PCAP.CN` (nominal GDP per capita, current LCU) for AUS, USA, KOR, JPN, SGP, CHN. Do not swap in real (constant-price) GDP per capita: comparing it with CPI would deflate twice. Source values in `data/sources/worldbank-*.json` must match their `canonicalSha256`; regenerate `data/worldbank.json` with `npm run extract:worldbank`, never by hand.
- Record every user-facing change in the Changelog / 更新记录 section of both `README.md` and `README.en.md`.
- After data, copy, or build changes, run `npm run verify`, `npm test`, and `npm run build`.
- The user authorized the public GitHub repository `AdenXie/everyday-economics` and the initial GitHub Pages deployment at `econ.adenxie.com.cn` on 2026-09-28. The Pages workflow publishes from `main`, so future pushes update the live website. Push, redeploy, or change DNS only when the user asks at that time.
