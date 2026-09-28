# 日常经济学｜Everyday Economics

[English documentation](README.en.md)

本项目用于制作可复核的经济数据故事板，帮助读者通过图表探索日常经济问题。当前首个故事板聚焦澳洲 CPI 与 WPI；项目之后可扩展至其他经济体和主题，未来计划加入世界银行数据（目前尚未实现）。页面提供独立的中英文静态版本；没有账户、数据库、浏览器端翻译请求或自动发布。

## 本地运行

需要 Node.js 18 或更新版本；运行页面不需要安装 npm 依赖。构建会从仓库内的中英文词条生成中文首页与英文 `/en/` 页面，不调用在线翻译服务。

```powershell
npm run build
npm run dev
```

然后在浏览器打开 <http://127.0.0.1:4173>，英文页位于 <http://127.0.0.1:4173/en/>。首次访问会按浏览器首选语言打开相应页面；手动切换会记住偏好，并保留季度区间。服务只监听本机回环地址。结束预览时，在运行服务的终端按 `Ctrl+C`。

如果默认端口正被占用，可在 PowerShell 运行 `$env:ECON_TAB_PORT=0` 后再运行 `npm run dev`；服务会分配空闲端口并显示实际预览地址。

## 双语文案维护

`data/messages.zh.json` 是中文界面与动态图表文案；`data/messages.en.json` 是经人工整理的英文文案。新增或修改任何文案时，维护者应在同一提交中同步更新两个文件中对应的键。构建会检查中文目录中的每个键都存在英文版本，并把英文词条写入静态 `/en/` 页面和动态图表资源。页面浏览者不会调用翻译服务，也不会传输 API 凭据。

## 这份快照代表什么

- 快照整理于 **2026-09-28**；CPI 与 WPI 能配对的最新季度都是 **2026 Q2**。快照不是实时数据。
- 数据覆盖 **1997 Q3—2026 Q2，共 116 个连续季度**。这是两条原始序列的共同区间；CPI 本身还有更早的历史。
- CPI：ABS *Consumer Price Index, Australia, June 2026*，Table 17，`All groups CPI; Australia; Original`，Series ID **A2325846C**。全国 CPI 为八个首府城市加权平均；此表最后一期指数为 **102.31**。
- WPI：ABS *Wage Price Index, Australia, June 2026*，Table 1，`Total hourly rates of pay excluding bonuses; Australia; Private and Public; All industries; Original`，Series ID **A2603609J**。最后一期原始指数为 **161.2**；同一表中 **161.7 是季节调整后的数值，本故事板没有采用**。
- 两份 ABS 原始工作簿保存在 [`data/sources`](data/sources/)，来源信息、发布日期、系列 ID 和 SHA-256 值记录在 [`data/source-manifest.json`](data/source-manifest.json)。浏览器读取的小型快照在 [`data/quarterly.json`](data/quarterly.json)。

## 计算方式与边界

对读者选择的起止季度，分别计算：

```text
归一化指数(t) = 100 × 指数(t) ÷ 起点指数
区间累计变化 = 100 × (终点指数 ÷ 起点指数 − 1)
CPI 指数化金额 = A$100 × 终点 CPI ÷ 起点 CPI
百分点差 = WPI 区间累计变化 − CPI 区间累计变化
```

图表将两项序列都从所选起点重设为 100；原始指数的基期不同，不能直接比较原始点数。A$100 是 CPI 指数化示意，不是某户家庭的消费账单或一份固定商品清单。CPI 概括家庭消费价格变化，权重会更新；WPI 衡量可比工作组合的工资价格变化，尽量排除工作数量、质量和组合变化。此处 WPI 不含奖金。两项全国指数都不能推断某个人的工资、税后收入、工时或实际支出。

ABS 从 2025 年 12 月的 CPI 发布起，将季度 CPI 重设为 **2025 年 9 月 = 100**。页面只比较每个被选区间内的相对变化。结果以 ABS 发布的已四舍五入季度指数计算，和用 ABS 内部未舍入数据计算的结果可能有小幅差异。

官方来源：

- [ABS CPI，June 2026](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia/jun-2026) · [CPI 方法](https://www.abs.gov.au/methodologies/consumer-price-index-australia-methodology/jul-2026)
- [ABS WPI，June 2026](https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/wage-price-index-australia/jun-2026) · [WPI 方法](https://www.abs.gov.au/methodologies/wage-price-index-australia-methodology/jun-2026)
- [ABS Data API 指南](https://www.abs.gov.au/statistics/application-programming-interfaces-apis/data-api-user-guide)：该 API 标注为 beta，且可能晚于 ABS 发布页更新。本版以官方发布的时间序列工作簿为准，避免将滞后 API 数据称作最新数据。

## 以后如何更新快照

1. 从对应 ABS 发布页下载最新一期 CPI Table 17 与 WPI Table 1，保留原文件到 `data/sources/`。
2. 在 `data/source-manifest.json` 更新两张表的发布日期、发布页 URL、系列 ID、系列描述、工作簿路径、SHA-256 和快照整理日期。仍选择全国 CPI 原始序列，以及全国、私营与公共部门合计、所有行业、不含奖金的 WPI 原始序列。
3. 用装有 `openpyxl` 的 Python 执行：

   ```powershell
   python tools/extract_abs_snapshot.py --snapshot-date YYYY-MM-DD
   ```

   提取器会核对工作簿哈希、表内系列 ID、频率、原始/季调类型、起止期和共同季度连续性，再生成 `data/quarterly.json`。它允许 CPI 在 WPI 开始之前有更多历史，但不会丢掉共同区间的缺季度。

4. 验证与重建：

   ```powershell
   npm run verify
   npm test
   npm run build
   ```

如果新版 ABS 工作簿更改了 sheet 布局或系列 ID，先对照发布页和工作簿 `Index` 页，再修改提取器及明确的校验值；不要仅因为提取成功就沿用旧口径。仓库没有定时任务或发布动作。

## 设计系统与字体

这是一张“可操作的经济观察折页”：标题提出问题，季度刻度负责精确，图中的细刻度脊线是识别点。纸面纹理由本地 CSS 绘制，不加载外部图片或网页服务。

| 角色 | 令牌 | 色值 |
|---|---|---|
| 燕麦纸底 | `--paper` | `#F4EEE2` |
| 留白纸面 | `--paper-white` | `#FBF8F1` |
| 墨绿黑 | `--ink` | `#27342F` |
| CPI 赤土 | `--cpi` | `#B85B43` |
| WPI 桉叶 | `--wpi` | `#4F7770` |
| 刻度黄铜 | `--brass` | `#92774B` |

- **英文 UI、标题和图表标签：** Plus Jakarta Sans，使用本地随项目提供的拉丁 WOFF2 子集。
- **英文正文：** Newsreader，使用本地随项目提供的拉丁 WOFF2 子集。
- **中文 UI：** 本地打包 Adobe Source Han Sans CN 简体中文可变 WOFF2（7,995,716 字节，约 8.0 MB），由浏览器用于按钮、标签、图表文字等 UI。Adobe 使用 CN 表示简体中文地区子集；这个标识对应通常称为 Source Han Sans SC 的思源黑体简体中文版本。该完整地区字形集不需要为新文案重新裁切。字体和对应的 [Adobe SIL Open Font License 1.1](https://github.com/adobe-fonts/source-han-sans/blob/master/LICENSE.txt) 一起放在仓库中。浏览器会缓存字体，之后页面导航无需重复下载。
- **中文正文：** 本地打包 Adobe Source Han Serif CN 简体中文可变 WOFF2（10,421,244 字节，约 10.4 MB），并随项目分发对应的 [Adobe SIL Open Font License 1.1](https://github.com/adobe-fonts/source-han-serif/blob/master/LICENSE.txt)。
- Plus Jakarta Sans 与 Newsreader 按 [SIL Open Font License 1.1](https://openfontlicense.org/) 分发；对应许可文本与字体文件同放在 `assets/fonts/`。来源分别为 [Google Fonts / Plus Jakarta Sans](https://github.com/google/fonts/tree/main/ofl/plusjakartasans) 和 [Production Type / Newsreader](https://github.com/productiontype/Newsreader)。Source Han Sans CN 和 Source Han Serif CN 对应通常所称的 Source Han Sans SC / Source Han Serif SC 简体中文版本；二者分别来自 [Adobe Source Han Sans](https://github.com/adobe-fonts/source-han-sans/tree/release/Variable/WOFF2/OTF/Subset) 和 [Adobe Source Han Serif](https://github.com/adobe-fonts/source-han-serif/tree/release/Variable/WOFF2/OTF/Subset) 官方项目。

字体只保存在本项目的静态资源内；页面不会向 Google Fonts 或其他字体 CDN 发请求。页面支持键盘操作、窄屏布局和 `prefers-reduced-motion`。

## 代码、字体与数据许可

- `LICENSE` 中的 MIT 许可仅覆盖本项目的原创代码，不覆盖字体、ABS 工作簿、数据快照或其他第三方内容。
- 四种随项目提供的字体分别依照 `assets/fonts/` 内的许可文件分发；Source Han Sans CN 和 Source Han Serif CN 使用 SIL OFL 1.1。
- ABS 网站说明其网页材料通常采用 [Creative Commons Attribution 4.0 International（CC BY 4.0）](https://www.abs.gov.au/privacy-and-legals)，但徽标、微观数据、第三方内容等例外材料以及具体发布产品标注的专门条款不在该通用许可内。`data/sources/` 中保留官方 CPI/WPI 工作簿；仓库中的数据和由其整理出的图表不属于 MIT 代码许可。重用时请遵循对应 ABS 来源的许可与署名要求。引用本站整理的图表或衍生数据时，请采用署名 **Based on Australian Bureau of Statistics data**（基于澳大利亚统计局数据）。
