# Maintenance instructions

- Keep `data/messages.zh.json` and `data/messages.en.json` in sync. When adding or changing interface or chart copy, update the same key in both files with clear, reviewed Chinese and English wording.
- Preserve the ABS definitions in `data/source-manifest.json`: CPI Table 17 original series `A2325846C`; WPI Table 1 original series `A2603609J` (Australia, Private and Public, all industries, excluding bonuses). Keep the paired-quarter range continuous and validate from the official workbooks.
- After data, copy, or build changes, run `npm run verify`, `npm test`, and `npm run build`.
- The user has authorized publishing this project to the public GitHub repository `AdenXie/everyday-economics`; pushing this project is approved. Do not enable GitHub Pages or another website deployment unless the user separately authorizes it. For later changes, push only when the user asks at that time.
