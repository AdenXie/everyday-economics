# 日常经济学｜Everyday Economics

[English documentation](README.en.md)

本项目用于制作可复核的经济数据故事板，帮助读者通过图表探索日常经济问题。页面顶部有一排标签页：**澳洲｜美国｜韩国｜日本｜新加坡｜中国｜对比**。

- **澳洲**：首个故事板，用 ABS 季度 CPI 与 WPI 比较物价和工资价格；下方另附世界银行口径的年度视角。
- **美国、韩国、日本、新加坡、中国**：用世界银行年度数据，比较 CPI 与名义人均 GDP（本币现价）从同一起点年份出发的变化。
- **对比**：选定同一段年份，把六个经济体的物价涨幅、名义人均 GDP 涨幅和“扣除物价后”的变化并排比较。

页面右下角有一个 **AI 助手**浮窗：读者看图时遇到不懂的概念，可以直接提问（详见下方“AI 助手”一节）。

页面提供独立的中英文静态版本；没有账户、数据库或浏览器端翻译请求。

## 在线查看与发布

网站地址：[econ.adenxie.com.cn](https://econ.adenxie.com.cn/)；英文版位于 [/en/](https://econ.adenxie.com.cn/en/)。

网站托管在 **Vercel**：静态页面来自构建产物 `dist/`，AI 助手的后端是 Vercel Function [`api/chat.js`](api/chat.js)。配置见 [`vercel.json`](vercel.json)：构建命令为 `npm run verify && npm test && npm run build`。`vercel.json` 不指定函数区域，函数跟随 Vercel 项目设置 **Settings → Functions → Function Region**（目前为新加坡 `sin1`）。注意：香港 `hkg1` 节点实测连不上 AMD 接口，换区域后应在网站上实际提问一次确认 AI 正常。推送到 `main` 后，Vercel 会自动构建并更新线上网站，因此维护者应在本地检查通过后再按用户要求推送。GitHub Pages 已停用；[`.github/workflows/pages.yml`](.github/workflows/pages.yml) 现在只在推送和 PR 时运行校验、测试与构建，不再发布。数据本身没有定时刷新。

## 本地运行

需要 Node.js 20 或更新版本；运行页面不需要安装 npm 依赖。构建会从仓库内的中英文词条生成中文首页与英文 `/en/` 页面，不调用在线翻译服务。

```powershell
npm run build
npm run dev
```

然后在浏览器打开 <http://127.0.0.1:4173>，英文页位于 <http://127.0.0.1:4173/en/>。首次访问会按浏览器首选语言打开相应页面；手动切换会记住偏好，并保留季度区间、当前标签页和年份。

标签页和年份写在网址参数里，可以直接分享：`?view=USA&from=2000&to=2024` 打开美国页 2000—2024 年；`?view=compare&from=1997&to=2012` 打开对比页。`view` 可取 `AUS`、`USA`、`KOR`、`JPN`、`SGP`、`CHN`、`compare`，省略时为澳洲。服务只监听本机回环地址。结束预览时，在运行服务的终端按 `Ctrl+C`。

本地预览服务器也会处理 `/api/chat`，行为与 Vercel 上的函数一致。想在本地试用 AI 助手，先在同一个 PowerShell 窗口设置 Key，再启动服务；Key 只存在于这个终端会话里，不会写入任何文件：

```powershell
$env:RADEON_API_KEY = "rc-你的Key"
npm run dev
```

没有设置 Key 时，页面和图表照常可用，AI 助手会提示“尚未配置”。

如果默认端口正被占用，可在 PowerShell 运行 `$env:ECON_TAB_PORT=0` 后再运行 `npm run dev`；服务会分配空闲端口并显示实际预览地址。

## 双语文案维护

`data/messages.zh.json` 是中文界面与动态图表文案；`data/messages.en.json` 是经人工整理的英文文案。新增或修改任何文案时，维护者应在同一提交中同步更新两个文件中对应的键。构建会检查中文目录中的每个键都存在英文版本，并把英文词条写入静态 `/en/` 页面和动态图表资源。页面浏览者不会调用翻译服务，也不会传输 API 凭据。

## 澳洲 ABS 快照代表什么

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

## 以后如何更新 ABS 快照

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

如果新版 ABS 工作簿更改了 sheet 布局或系列 ID，先对照发布页和工作簿 `Index` 页，再修改提取器及明确的校验值；不要仅因为提取成功就沿用旧口径。仓库没有定时数据刷新任务；推送到 `main` 会触发网站构建和发布。

## 世界银行六个经济体（年度）

### 数据来源

- 快照整理于 **2026-09-28**，取自世界银行 World Development Indicators（WDI）API；两个指标在 WDI 中的最后更新日期都是 **2026-07-13**。快照不是实时数据。
- **CPI**：[`FP.CPI.TOTL`](https://data.worldbank.org/indicator/FP.CPI.TOTL)，Consumer price index (2010 = 100)，年度平均；世界银行注明原始来源为 IMF 国际金融统计（IFS）。
- **名义人均 GDP**：[`NY.GDP.PCAP.CN`](https://data.worldbank.org/indicator/NY.GDP.PCAP.CN)，GDP per capita (current LCU)，本币现价、未扣除物价。
- 经济体：澳大利亚（AUS）、美国（USA）、韩国（KOR）、日本（JPN）、新加坡（SGP）、中国（CHN，中国大陆）。

| 经济体 | 两项都有数据的年份 | 说明 |
|---|---|---|
| 澳大利亚 | 1960—2025 | |
| 美国 | 1960—2024 | 世界银行尚未发布 2025 年美国 CPI |
| 韩国 | 1960—2025 | |
| 日本 | 1960—2025 | |
| 新加坡 | 1960—2025 | |
| 中国 | 1986—2025 | 世界银行的中国 CPI 从 1986 年开始 |

六个经济体都有数据的共同区间是 **1986—2024**。对比页默认显示 2000—2024 年；选到某个经济体没有覆盖的年份时，该行会标为“数据不完整”，不会拿不同区间硬比。

### 文件与校验

- [`data/sources/worldbank-FP.CPI.TOTL.json`](data/sources/worldbank-FP.CPI.TOTL.json)、[`data/sources/worldbank-NY.GDP.PCAP.CN.json`](data/sources/worldbank-NY.GDP.PCAP.CN.json)：从 API 原始响应中提取的全部非空数值，并记录 API 地址、取数日期、WDI 更新日期、原始响应的 SHA-256，以及数值本身的规范化 SHA-256（`canonicalSha256`）。
- [`data/worldbank-manifest.json`](data/worldbank-manifest.json)：国家列表、指标 ID 与源文件路径。
- [`tools/extract_worldbank.mjs`](tools/extract_worldbank.mjs)：先核对规范化 SHA-256，再为每个经济体取 CPI 与人均 GDP 都有值的年份，要求年份连续，生成浏览器读取的 [`data/worldbank.json`](data/worldbank.json)。
- `npm run verify` 会从源文件重新生成快照，要求与仓库中的 `data/worldbank.json` 完全一致，并检查年份连续、数值为正、每国 2010 年 CPI = 100。

规范化方式：只取非空值，每行写成 `ISO3:年份:数值`（数值用 `JSON.stringify` 序列化），先按 ISO3 再按年份排序，用换行连接后计算 SHA-256。

### 计算方式与边界

对读者选择的起止年份：

```text
归一化指数(t) = 100 × 数值(t) ÷ 起点数值
CPI 累计变化 = 100 × (终点 CPI ÷ 起点 CPI − 1)
名义人均 GDP 累计变化 = 100 × (终点人均 GDP ÷ 起点人均 GDP − 1)
百分点差 = 名义人均 GDP 累计变化 − CPI 累计变化
扣除物价后的变化 = 100 × [(终点人均 GDP ÷ 起点人均 GDP) ÷ (终点 CPI ÷ 起点 CPI) − 1]
CPI 指数化金额 = 100 本币 × 终点 CPI ÷ 起点 CPI
```

- **为什么用名义人均 GDP 而不是实际人均 GDP**：CPI 是名义价格水平。要回答“收入有没有跑赢物价”，另一条线也必须是名义值，这和澳洲页 CPI 对比 WPI 的思路一致。实际人均 GDP（不变价）已经用 GDP 平减指数扣过一次价格，再和 CPI 比等于重复扣除。
- **“扣除物价后”用比值而不是百分点差**：区间长时两者差别很大。例如物价翻倍、名义收入涨到 3 倍，百分点差是 100，但扣除物价后只多了 50%。页面同时显示两者。
- **跨国比较的是涨幅，不是水平**：每个经济体都用自己的本币计算涨幅，百分比可以并排比较；人均 GDP 的绝对金额没有换算汇率或购买力平价（PPP），不能直接比较高低。
- **人均 GDP 不是工资**：它是经济体人均产出，包括企业利润和政府收入，不等于家庭工资或可支配收入。新加坡等外资占比高的经济体，人均 GDP 可能明显高于居民实际获得的收入。
- **年度 CPI 与 ABS 季度 CPI 不同**：世界银行 CPI 是全年平均，以 2010 年为 100；澳洲页上方的 ABS 季度指数以 2025 年 9 月为 100。两者口径不同，数值不会完全一致。

### 以后如何更新世界银行快照

1. 用浏览器打开以下两个地址（本仓库的命令行环境可能无法直接访问 API）：
   - `https://api.worldbank.org/v2/country/AUS;USA;KOR;JPN;SGP;CHN/indicator/FP.CPI.TOTL?format=json&per_page=1000&date=1960:2025`
   - `https://api.worldbank.org/v2/country/AUS;USA;KOR;JPN;SGP;CHN/indicator/NY.GDP.PCAP.CN?format=json&per_page=1000&date=1960:2025`

   需要新年份时，把 `date=1960:2025` 的结束年份改大。
2. 把每个响应里的非空值按 `{"ISO3": {"年份": 数值}}` 写入 `data/sources/worldbank-<指标>.json` 的 `series`，同时更新 `retrievedOn`、`lastUpdated`（响应头部的 `lastupdated`）、`rawResponse` 与 `canonicalSha256`。`canonicalSha256` 应在取数的浏览器里按上面的规范化方式计算，用来证明转写没有出错。
3. 如有需要，更新 `data/worldbank-manifest.json` 的 `preparedOn`。
4. 运行：

   ```powershell
   npm run extract:worldbank
   npm run verify
   npm test
   npm run build
   ```

   如果某个经济体出现年份缺口，提取器会停止并报错；先查明原因，不要为了通过校验删掉年份。

## AI 助手

页面右下角的浮窗是一个经济学问答助手，帮助读者理解页面上的概念和数字。

- **模型**：AMD Radeon Cloud Token Factory 的 `Qwen3.8-27B`，通过 OpenAI 兼容接口 `https://developer.amd.com.cn/radeon/api/v1/chat/completions` 调用，流式输出，推理强度设为 `low` 以加快回答。模型输出的 `<think>` 推理部分不会显示给读者。
- **API Key 只在服务端**：浏览器只请求同域名的 `/api/chat`；Key 存在 Vercel 项目的环境变量 `RADEON_API_KEY` 中，由 [`server/ai-proxy.js`](server/ai-proxy.js) 在服务端加到请求上。网页代码、仓库和构建产物里都没有 Key。
- **系统提示词在服务端**：解释概念时只用页面数据或读者给出的数字，不编造统计数据；不提供投资、税务或法律建议；按提问语言回答。浏览器不能修改系统提示词、模型或参数。
- **附带页面上下文**：每次提问会附上读者当前的标签页、年份和页面上显示的累计变化（最多 1,400 字），让 AI 能结合“你正在看的数字”回答。服务端把这段内容标记为数据，其中若出现指令会被忽略。
- **不保存记录**：对话只存在浏览器页面的内存里，不写入 localStorage、Cookie 或任何服务器；刷新页面即清空。服务端不记录消息内容，也没有数据库。
- **交互**：点击右下角按钮打开或收起；鼠标或焦点回到网页时浮窗不会自动关闭，只能通过这个按钮（或浮窗内的 × 按钮）收起。每条 AI 回答都能直接选中文字复制，也可以点“复制”按钮复制原文；回答生成中可以随时停止，也可以一键清空对话。输入框按 Enter 发送、Shift+Enter 换行，中文输入法选字时按 Enter 不会误发。
- **防滥用**：服务端只接受本站页面发来的请求（生产域名、Vercel 预览地址和本地预览）；每个 IP 每分钟最多 6 次提问（在同一函数实例内生效的尽力限制）；单条问题最多 1,500 字，最多带 16 条历史消息，单次回答最多 1,200 tokens。AMD 免费额度为每个账号每分钟约 20 次请求、由所有访客共享，超出时读者会看到“请稍等再试”。
- **隐私提示**：读者的问题和页面上下文会发送到 Vercel 函数和 AMD Radeon Cloud 处理。

### 部署到 Vercel（一次性设置）

1. 用 GitHub 账号登录 [vercel.com](https://vercel.com/)，选择 **Add New → Project**，导入仓库 `AdenXie/everyday-economics`。Framework Preset 选 **Other**；构建设置会自动读取 `vercel.json`，无需修改。
2. 在导入页面（或之后的 **Settings → Environment Variables**）添加 `RADEON_API_KEY`，值为 AMD Token Factory 的 Key（`rc-` 开头），勾选 Production 和 Preview。然后部署。
3. 部署完成后，在 **Settings → Domains** 添加 `econ.adenxie.com.cn`，按 Vercel 显示的值修改域名 DNS（通常是把 `econ` 的 CNAME 指向 Vercel 给出的地址）。
4. 在 GitHub 仓库 **Settings → Pages** 中移除自定义域名并停用 Pages，避免两个平台争用同一个域名。随后编辑 `.github/workflows/pages.yml`：删除整个 `deploy` job，以及 build job 里的 `actions/configure-pages` 和 `actions/upload-pages-artifact` 两步，只保留 verify、test、build 检查（否则停用 Pages 后每次推送都会报部署失败）。
5. 以后推送到 `main` 就会自动部署。修改 Key 后，需要在 Vercel 里重新部署一次才会生效。

可选环境变量：`AI_MODEL`（默认 `Qwen3.8-27B`）、`UPSTREAM_URL`（默认 AMD 公共接口）、`ALLOWED_ORIGINS`（逗号分隔的额外允许来源）。

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

**图表配色**：各国标签页与对比页只用 CPI 赤土和收入端桉叶两种颜色，与澳洲页的 CPI/WPI 保持同一含义。对比页没有把六个国家画成六条彩色线，因为六种颜色无法两两区分（包括色觉差异读者），所以改为“每个经济体一行、并排两根横条”，国家由行名区分，横条在同一张表内共用比例尺，0 用竖线标出。年度图表支持鼠标悬停查看每一年的数值。

字体只保存在本项目的静态资源内；页面不会向 Google Fonts 或其他字体 CDN 发请求。页面支持键盘操作、窄屏布局和 `prefers-reduced-motion`。

## 代码、字体与数据许可

- `LICENSE` 中的 Apache License 2.0 仅覆盖本项目的原创代码，不覆盖字体、ABS 工作簿、数据快照或其他第三方内容。该协议明确提供贡献者专利授权，并要求再分发时保留许可及适用的署名说明。
- 四种随项目提供的字体分别依照 `assets/fonts/` 内的许可文件分发；Source Han Sans CN 和 Source Han Serif CN 使用 SIL OFL 1.1。
- 世界银行 WDI 数据通常以 [CC BY 4.0](https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets) 许可提供；引用本站整理的世界银行数据图表时，请注明 **Based on World Bank World Development Indicators data**（基于世界银行世界发展指标数据），并遵循各指标页面注明的原始来源。
- ABS 网站说明其网页材料通常采用 [Creative Commons Attribution 4.0 International（CC BY 4.0）](https://www.abs.gov.au/privacy-and-legals)，但徽标、微观数据、第三方内容等例外材料以及具体发布产品标注的专门条款不在该通用许可内。`data/sources/` 中保留官方 CPI/WPI 工作簿；仓库中的数据和由其整理出的图表不属于 Apache-2.0 代码许可。重用时请遵循对应 ABS 来源的许可与署名要求。引用本站整理的图表或衍生数据时，请采用署名 **Based on Australian Bureau of Statistics data**（基于澳大利亚统计局数据）。

## 更新记录

### 2026-09-28 · AI 助手与迁移到 Vercel

- 页面右下角新增 AI 助手浮窗，使用 AMD Radeon Cloud Token Factory 的 `Qwen3.8-27B`：流式回答、可复制、可停止、可清空；不会因鼠标或焦点回到网页而关闭；对话只存在页面内存中，刷新即清空。
- 提问时自动附上当前标签页、年份和页面上的累计变化，便于 AI 结合读者正在看的数字回答。
- 网站托管从 GitHub Pages 迁移到 Vercel：新增 `vercel.json`、Vercel Function `api/chat.js` 与服务端代理 `server/ai-proxy.js`（来源校验、每 IP 限流、输入长度限制、服务端系统提示词）。API Key 只保存在 Vercel 环境变量 `RADEON_API_KEY` 中。
- 已停用 GitHub Pages，`.github/workflows/pages.yml` 改为只做检查。
- Vercel 函数区域：香港 `hkg1` 连不上 AMD 接口，先改为悉尼 `syd1` 验证可用；随后 `vercel.json` 不再指定区域，跟随项目设置（新加坡 `sin1`）。
- 本地预览服务器 `tools/serve.mjs` 新增 `/api/chat`，设置 `RADEON_API_KEY` 后可在本地试用 AI。
- 新增 `src/assistant.js`、`tests/ai-proxy.test.mjs`，以及中英文 `ai.*` 词条。

### 2026-09-28 · 加入世界银行六个经济体

- 页面顶部新增标签页：澳洲、美国、韩国、日本、新加坡、中国、对比；当前标签页与年份写入网址参数（`view`、`from`、`to`），切换中英文时保留。
- 新增世界银行 WDI 年度数据：CPI（`FP.CPI.TOTL`）与名义人均 GDP（`NY.GDP.PCAP.CN`），覆盖澳大利亚、美国、韩国、日本、新加坡、中国，数据取自 2026-09-28（WDI 更新于 2026-07-13）。
- 新增文件：`data/sources/worldbank-*.json`（带校验值的源数据）、`data/worldbank-manifest.json`、`data/worldbank.json`、`tools/extract_worldbank.mjs`、`src/world.js`、`tests/worldbank.test.mjs`。
- `src/analysis.js` 新增 `calculateYearWindow` 与 `compareCountries`；`tools/verify-data.mjs` 增加世界银行快照的重建比对与连续性检查；`npm run extract:worldbank` 用于重新生成快照。
- 年度图表新增鼠标悬停提示；对比页可按“扣除物价后”“物价涨幅”“人均 GDP 涨幅”排序。
- 站点名称改为“日常经济学 · 价格与收入”；中英文词条同步新增（`data/messages.zh.json` / `data/messages.en.json`）。

### 2026-09-28 · 首次发布

- 发布澳洲 CPI 与 WPI 季度故事板，中英文静态页面，GitHub Pages 自定义域名 `econ.adenxie.com.cn`，代码采用 Apache-2.0。
