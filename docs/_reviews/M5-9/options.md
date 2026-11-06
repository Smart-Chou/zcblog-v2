# M5-9 · 新功能与视觉改版选题（不写代码）

> 卡：`blog2.0/docs/24-m5-plan.md` §M5-9 · 依赖 M5-7b（`de4a795`）· decision：D-0139
> 日期：2026-11-07 · 执行：blog-pm · 状态：**待 PO 选择**
> 本卡交付的是**决策材料**：候选、成本、风险、验收标准。**零产品代码改动**（`src/**`、`packages/*/src/**`、预算、workflow 均未动）。

---

## 0. 一句话

PO 放开「新功能 / 视觉改版」后，真正卡脖子的不是想法，而是**两条余量**：文章页 JS 只剩 **1.5KB**、page 类型最差页 JS 只剩 **0.3KB**；而「视觉必须过 screenshot baseline」这条约束目前**只保护 `/design/atoms`，一个真实页面都不保护**。所以候选清单里排在最前面的两项不是功能，而是**腾余量**和**补基线**。

| 结论 | 证据 |
|---|---|
| 任何带全站客户端 JS 的新功能，现在都进不来 | article JS p95 38.5 / 门禁 40（余量 1.5KB）；page 最大 29.7 / 门禁 30（余量 0.3KB） |
| 「视觉改动要过 baseline」当前几乎不设防 | pixel 基线仅 `/design/atoms` 12 specimen × 3 视口 × 2 主题 = 72 PNG/平台；真实页面 0 张 |
| 4 条"想当然"的候选其实早就做完了 | 图片响应式、PWA 预缓存、中文字体、Markdown 扩展语法（见 §2 排除项，逐条有实测） |

---

## 1. 实测基线（本卡取证，2026-11-07）

### 1.1 预算与余量

`cd zcblog-v2 && python3 scripts/gates/perf-budget.py dist`（746 页，`SUMMARY over=0`）

| 类型 | 页数 | HTML p95 | HTML 门禁 | 最紧页余量 | JS p95 | JS 门禁 | JS 最大 | CSS p95 | CSS 门禁 |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|
| article | 85 | 176.1 | 215 | **+2.2KB**（`article/expressive-code` 212.8） | 38.5 | 40 | 38.9 | 31.8 | 45 |
| list | 286 | 65.8 | 105 | **+1.5KB**（`archives`） | 24.5 | 28 | 25.2 | 25.9 | 40 |
| page | 375 | 62.8 | 105 | — | 24.5 | 30 | **29.7**（`donate`，余量 **+0.3KB**） | 26.7 | 40 |

> 门禁是「当前 p95 + 25% 余量」的棘轮（`06-performance-budget.md` §2.1）；**只许下调**。本卡不提议改预算——任何一项候选若要抬预算，必须在 decision log 里单独论证。

### 1.2 一页的 JS 到底花在哪（采样 `article/beszel-server-monitoring-guide`，16 个文件 38.9KB gz）

| chunk | gz | 说明 |
|---|---:|---|
| `page.DgdtAvVB.js` | **16.5** | swup 导航全家（85 处 swup 符号；accessibility 插件已不在包里） |
| `Toc.astro…js` | 4.6 | 目录（tocbot） |
| `config.*.js` | 3.1 | 站点配置桶 |
| `BaseLayout…js` | 3.0 | 常驻模块 |
| `WalineComment…js` | 2.2 | 评论入口 |
| `PostShare…js` | 1.7 | 分享 |

列表页/首页同为 24.5KB，构成 = `page.js` 16.5 + BaseLayout 3.0 + Search 1.6 + feature 1.1 + 1.0 + preload-helper 0.8。

### 1.3 一页的 HTML 花在哪（同一页）

`raw 198.5KB` = 内联 `<svg>` **44 个 / 49.0KB** + 内联 `<script>` 11 段 / 23.5KB + 内联 `<style>` 2 块 / 7.8KB + 正文。图标走 `DynamicIcon.astro` → `getIconSvg()`，**逐实例把整段 SVG 内联进 HTML**。

### 1.4 视觉门禁现状

| 项 | 实测 |
|---|---|
| pixel 基线唯一覆盖 | `/design/atoms` 12 specimen × 3 视口 × 2 主题 = **72 PNG/平台**（mac 2.2MB / linux 2.1MB，共 144 个文件 4.3MB） |
| 阈值 | macOS `maxDiffPixelRatio 0.01`；Linux `maxDiffPixels 0`（必须在 `mcr.microsoft.com/playwright:v1.63.0-noble` 内生成） |
| 真实页面 | **0 张像素基线**；保护来自 24 个 spec / **260 条 `test()`**（DOM、a11y、交互、i18n，`grep -c "test("` 计数） |
| 语料 | 746 页（article 85 / list 286 / page 375） |

### 1.5 产品侧现状（影响候选可行性）

- `packages/tokens@2.1.2`、`-og-image@2.1.2` 已上 npm；`-ui` **registry 404（未发布）**，工作区有 4 个未提交改动（疑似 M5-8 在跑），本卡未触碰。
- 文章 schema（`src/content.config.ts`）：**无 `series` / `collection` 字段**。
- 评论：`src/config/feature.ts` 只有 `waline` 一段，组件直连 Waline → 无 provider 抽象。
- i18n：10 locale 已配置、`/en` 路由在；内容仅 zh / en。
- PWA：`dist/sw.js` **76 条** precache 条目（预算 ≤80）。

---

## 2. 先排除 4 项（省得 PO 花时间选已经做完的事）

| 曾被当作候选 | 实测结论 | 证据 |
|---|---|---|
| 图片响应式 / AVIF | **已达标，不是候选** | HTML 实际引用 50 个去重图片共 **7.40MB**，分布 AVIF 404 次 / 5.1MB、WebP 906 次 / 2.1MB、PNG 1 次；`srcset` 已在（Astro image + CF `cdn-cgi/image` 缩放远端图）；最大单图 313KB |
| PWA 首访预缓存 25.2MB | **文档过期，不是候选** | `dist/sw.js` 现 **76 条**（≤80 条预算内）；25.2MB/478 条是 2026-10-30 口径 |
| 中文字体子集 | **无对象，不是候选** | `public/fonts/` 只有 DM Sans / DM Serif Display 的 latin + latin-ext 4 个 woff2（88.6KB）；CJK 走系统栈，没有自托管中文字体可裁 |
| 自定义 Markdown 语法（15+） | **大部分已在** | `astro.config.mjs` 已挂 7 个 remark 插件：code-blocks / inline-syntax / asides / image-grid / github-card / tabs / align |

> 附带澄清：`dist/` 里 43.65MB 图片不被任何 HTML 引用（og-image 与历史残留）。这是**仓库卫生**问题，不是用户可见的性能问题，不进候选。

---

## 3. 新功能候选

每项格式：目标用户 / 范围 / 依赖 / 预算影响 / 新 decision / 人日 / 风险 / 验收标准 / 建议优先级。

### N-1 · 系列 / 专栏（series）

| 项 | 内容 |
|---|---|
| 目标用户 | 第二用户（有 50–500 篇、内容天然成系列的中文站长）；客户零（86 篇里教程类已成系列） |
| 范围 | `content.config.ts` 加 `series?: string` + `seriesOrder?: number`；`/series/` 索引页 + `/series/<slug>/` 列表页；文章页系列导航（上下篇 + 系列目录） |
| 依赖 | schema 变更 = 产品契约 → **需新 decision**；内容仓 frontmatter 批量补字段（`normalize-frontmatter.mjs` 兜底）；列表模板复用现有 `SectionPage` |
| 预算影响 | JS **+0**（纯 SSR，复用现有组件）；HTML 文章页 **+1.5–3KB**（系列导航）→ 文章最差页只剩 2.2KB，**必须先做 N-3** |
| 人日 | **3** |
| 风险 | 中：最差页 HTML 余量；内容仓批量写入的幂等性；无 series 时必须不渲染任何空壳 |
| 验收 | `perf-budget` 0 超支（article JS ≤40、最差页 HTML ≤215）；`gates:all` PASS；新增 e2e ≥4 条（索引/列表/文章导航/无 series 不渲染）；`create-site --overlay apps/demo --build` 118 页不回归 |
| 优先级 | **P1** |

### N-2 · 评论多 provider（Twikoo / Giscus）

| 项 | 内容 |
|---|---|
| 目标用户 | 不想自建 Waline 服务、或要"零后端评论"的站长 |
| 范围 | `config.comments.provider: 'waline' | 'twikoo' | 'giscus' | 'none'`；三个适配组件（全部 `await import()`）；CSP `script-src` / `connect-src` 白名单按 provider 生成；空态/错误态/无 JS 回退 |
| 依赖 | Waline 组件的 props 契约；`ContentSecurityPolicy.astro`；第三方 provider 的域名与隐私说明 |
| 预算影响 | 三者都在动态 `import()` 内 → 静态链 **+0**；但必须实测「provider=none 时零请求、零 chunk」 |
| 人日 | **4** |
| 风险 | 中高：三方脚本 + CSP 放宽（不许出现 `unsafe-inline`）；Giscus 依赖 GitHub OAuth；隐私/合规提示 |
| 验收 | provider=none 时文章页网络日志 **零** 评论请求；article JS p95 **不增 >0.2KB**；三 provider 各 1 条 e2e（本地 stub）；CSP 头无放宽带宽；关闭时零 DOM |
| 优先级 | **P2** |

### N-3 · 图标改 sprite（HTML 减重，兼作 N-1/N-4 的前置）

| 项 | 内容 |
|---|---|
| 目标用户 | 所有读者（移动端首屏 HTML）；**所有后续 HTML 变更的地基** |
| 范围 | 构建期生成 `public/icons.svg` sprite；`DynamicIcon` 输出 `<use href="/icons.svg#id">`；保留 `class`/`width`/`height`/`currentColor` 语义；sprite 加 `Cache-Control: immutable` |
| 依赖 | `getIconSvg()` 图标集；`_headers`；44 处实例逐个回归（含 `fill` 继承与 `aria-hidden`） |
| 预算影响 | article HTML **−30~45KB/页**（估，按 49KB 里 UI 图标占比）；JS **+0**；CSS 不变；首屏 **+1 请求**（sprite 可 `preload`，跨页缓存） |
| 人日 | **2** |
| 风险 | 中：外部 sprite 的 `currentColor` 继承、`<use>` + `width/height` 覆盖、图标视觉回归 |
| 验收 | article HTML p95 176.1 → **≤150KB**、最差页 ≤190KB；**视觉基线 72/72 双平台 PASS**（图形像素是最硬的门禁）；e2e 图标用例全绿；`_headers` 增加 sprite 规则 |
| 优先级 | **P0**（不选它，N-1 / N-4 / 任何文章页视觉改动都贴着 2.2KB 余量走钢丝） |

### N-4 · 消费端文档站（D6：`docs.marxchou.com` 还是 `marxchou.com/docs`）

| 项 | 内容 |
|---|---|
| 目标用户 | 第二用户（安装 / 配置 / 升级 / 三目标部署） |
| 范围 | 独立静态文档站，复用仓库里 9 篇 `docs/*.md`（`npm-consumer` / `upgrade` / `overlay-contract` / `deploy-matrix` …）+ 组件文档页；站内搜索；版本切换（2.1.x） |
| 依赖 | **D6 未决**（域名/路径）→ 需新 decision；`link-check.mjs`；文档漂移 R-42 |
| 预算影响 | 新 page 类型页；**page 最差页 JS 已 29.7/30** → 文档站必须 **0 客户端 JS**（或不并入同一 perf 类型，需单独论证） |
| 人日 | **4** |
| 风险 | 中：文档与代码漂移（R-42）；搜索选型（Pagefind 复用 vs 另起）；与 `/design` 组件文档页职责重叠 |
| 验收 | 9 篇 md 全渲染 + 站内搜索可用；`link-check` 0 死链；page JS p95 **不升**（最差页 ≤30KB）；`gates:all` PASS；与 `docs.npm-consumer.md` 的版本号一致（registry 为真值） |
| 优先级 | **P2**（产品化缺口里最"值钱"的一条，但撞 page JS 墙） |

### N-5 · 内容 CLI（`sync` / `eject` / `clean`）

| 项 | 内容 |
|---|---|
| 目标用户 | 第二用户（接内容仓、退出主题、清缓存） |
| 范围 | 在现有 `create-site.mjs` 旁加三命令：`sync`（内容仓 → `src/content`，幂等）、`eject`（overlay 固化到主题）、`clean`（构建产物/缓存） |
| 依赖 | `overlay-contract.md`（R-47 判据面）；`normalize-frontmatter.mjs` |
| 预算影响 | 构建期工具，**运行期 0** |
| 人日 | **3** |
| 风险 | 中低：`eject` 不可逆（需 dry-run + 备份）；不得绕过 R-47 的 `changeLog` 与分类器 |
| 验收 | 三命令各带 `--dry-run`；重复执行幂等（跑两遍 diff 为空）；负向探针（非法 overlay → exit≠0）；`gates:all` PASS；`unclassified=0` |
| 优先级 | **P3** |

### N-6 · 阅读态增强（收藏 / 阅读列表，localStorage）

| 项 | 内容 |
|---|---|
| 目标用户 | 回访读者 |
| 范围 | 文章页"收藏"按钮 + `/bookmarks/` 页（读 localStorage，SSR 壳 + 客户端填充） |
| 预算影响 | **JS +1.2~1.8KB** → 直接吃掉 article 剩余 1.5KB，**必须有 N-7 先腾 JS 余量** |
| 人日 | 1.5 |
| 风险 | 中：无 JS 时页面空；`localStorage` 在隐私模式抛错；与 Service Worker 缓存交互 |
| 验收 | article JS p95 ≤40（腾余量后）；`/bookmarks/` 无 JS 时显示空态而非空白；e2e 2 条；不上传任何用户数据 |
| 优先级 | **P3**（等 JS 余量回收之后再谈） |

### N-7 · JS 余量回收（按需触发，前置卡）

| 项 | 内容 |
|---|---|
| 目标 | 把 article JS p95 从 38.5 拉到 ≤34KB，为任何带客户端 JS 的新功能腾出空间 |
| 范围 | `Toc`(4.6KB) → 目录进入视口/点击时 `import()`；`PostShare`(1.7KB) → 点击分享时 `import()`；Waline 入口(2.2KB) → 评论区进入视口时 `import()` |
| 注意 | D-0137 明确「不为凑度量做动态 import」。本卡动机不同：**为新功能腾预算**，且每次都要给出"首屏关键路径实际变短"的证据，不只是把 chunk 移出静态图 |
| 人日 | **1.5** |
| 风险 | 中：TOC 闪一下；评论区进入视口前无占位；swup 换页后的事件绑定 |
| 验收 | article JS p95 ≤34KB（或说明为何达不到）；TOC/分享/评论三项交互 e2e 全绿；`perf-budget` 0 超支；首屏 LCP 不变差（本地 Lighthouse 12 对比，走代理） |
| 优先级 | **条件 P0**：选任何带客户端 JS 的候选（N-2/N-6）就必须先做 |

---

## 4. 视觉改版候选

### V-0 · 页面级 screenshot 基线（前置，必做）

| 项 | 内容 |
|---|---|
| 为什么 | 现有 pixel 基线只覆盖 `/design/atoms`；**真实页面 0 张**。「视觉改动必须过 baseline」这条约束今天等于没有 |
| 基线页面（首批 6 个） | `/`、`/article/beszel-server-monitoring-guide/`（代表长文）、`/archives/`、`/albums/`、`/culture/`、`/projects/` |
| 范围 | 6 页 × 2 主题 × 3 视口（375 / 768 / 1280）= **36 shot/平台**；macOS 集本地生成，Linux 集在 `mcr.microsoft.com/playwright:v1.63.0-noble` 内生成；动态区（热门/统计/时间）固定数据或遮罩 |
| 成本 | 本地 macOS ~10 min；Linux 集 ~25–40 min（首次拉镜像另计）；**维护：每次视觉改动重生成两套** |
| 人日 | **1.5** |
| 风险 | 中：字体 AA 漂移（mac 已有 1% 阈值）；动态内容导致 flaky；Linux 集必须在容器里生成，跑错平台会假红 |
| 验收 | 两平台各 36 张、CI `visual` job 跑同一 spec 绿；重复跑 2 次 0 像素漂移；`--update-snapshots` 流程写进 README |
| 优先级 | **P0**（V-1/V-2/V-3/V-4 的前置） |

### V-1 · 首页信息层级改版（单页）

| 项 | 内容 |
|---|---|
| 基线页面 | `/`（V-0 的 6 张） |
| 范围 | `src/styles/home.css`（20.5KB）+ `Index` 组件；**不碰 token** |
| 改动边界 | 只改排版/层级/密度；不改数据结构、不加 JS |
| 成本 | 2 人日（含 2 轮 PO 反馈） |
| 风险 | 审美风险 **高**（PO 唯一裁决）；CLS 回归；`page` 类型 HTML 变化 |
| 验收 | V-0 基线 diff 由 PO 看图签字；CLS < 0.1；a11y 对比度 ≥4.5（`check-tokens`）；`pages-home` 10 条 e2e 绿；JS 不变 |
| 优先级 | **P2** |

### V-2 · 文章页中文排版升级

| 项 | 内容 |
|---|---|
| 基线页面 | 3 篇代表文（长文 / 含代码 / 含图文） × 2 主题 × 3 视口 = 18 shot/平台 |
| 范围 | `article.css`（18.7KB，105 处 `var()`）：行高、字号阶梯、标点挤压/避头尾、代码块密度、注释块 |
| 成本 | 2.5 人日 |
| 风险 | 全站 85 篇文章同时受影响；HTML/JS **零变化**（纯 CSS）；CSS p95 31.8/45 有余量，但 CSS 涨幅要盯 |
| 验收 | 视觉基线 diff 逐条审查（18 × 2）；CSS p95 ≤45KB；对比度报告；`pages-article` 18 条 e2e 绿；无横向溢出（375 视口） |
| 优先级 | **P2**（价值高、风险可控，但需要 V-0 先就位） |

### V-3 · 第三主题 / 可配置主色（构建期生成）

| 项 | 内容 |
|---|---|
| 范围 | `packages/tokens` 增主题维度 + `build-tokens.mjs` 生成多套 `semantic`；`ToggleTheme` 三态；**运行时 0 JS**（HCT 运行时取色 +10~15KB 会破预算，明确不做） |
| 依赖 | `tokens@2.1.2` **已发布** → 主题维度属于 minor 变更，需 CHANGELOG + 升级说明 + `changelog` 门禁；`surface-token-baseline.json` 重建 |
| 基线成本 | design-atoms 基线 72 → **108/平台**（+36），页面级基线 ×1.5（54 shot/平台） |
| 人日 | **3–4** |
| 风险 | 高：对比度需逐 token 校验（`check-tokens`）；暖纸/冷墨两梯色的语义不能被第三套破坏；所有 pixel 基线翻倍维护 |
| 验收 | `gates:tokens` / `gates:surfaces` PASS；三主题对比度报告 ≥4.5/3.0；108 × 2 平台基线全绿；零 FOUC；tokens 包 minor + 升级说明；消费者 `npm i` 后旧主题不变 |
| 优先级 | **P3** |

### V-4 · 书影音 / 相册页视觉

| 项 | 内容 |
|---|---|
| 基线页面 | `/culture/`、`/albums/`（+ `/music/`） |
| 范围 | `Culture`、`Gallery` 组件 + `src/styles/pages/*` |
| 成本 | 2 人日 |
| 风险 | 中低（页面独立，爆炸半径小）；但数据来自抓取脚本，需固定快照才可截图 |
| 验收 | V-0 基线 diff 审查；`pages-culture`(12) / `pages-albums`(16) e2e 绿；JS 不变；无新请求 |
| 优先级 | **P2** |

---

## 5. 建议排序（PO 只需选一个组合）

| 组合 | 内容 | 人日 | 适合什么阶段 |
|---|---|---:|---|
| **A（推荐）** | **N-3 图标 sprite + V-0 页面基线 + N-1 系列** | **6.5** | 先把余量与门禁补齐，再上第一个真功能 |
| B | A + N-2 评论多 provider | 10.5 | 想把主题卖给"不想跑 Waline"的人 |
| C（产品化优先） | N-3 + **N-7 JS 余量** + N-4 文档站 + N-5 内容 CLI | 10.5 | 目标是"陌生人能装能升"，不是自己写文章 |
| D（视觉优先） | V-0 + V-1 首页 + V-2 文章排版 | 6 | 先把"好不好看"定下来，功能后置 |
| 单点 | V-3 第三主题 / V-4 书影音 / N-6 收藏 | 3–4 / 2 / 1.5 | 只想补一块短板 |

**不建议**：10 locale 全量内容翻译（运营成本，不是工程成本）；运行时 HCT 取色（+10~15KB 破预算）；右键菜单 / FAB（P3 且与"克制"的视觉叙事冲突）；付费阅读（超出本门范围，`feature/paid-reading` 分支继续不合并）。

---

## 6. PO 决策清单（勾选即开工，PM 另行拆卡）

- [ ] 组合 **A** / **B** / **C** / **D**（或自定义勾选下面单项）
- [ ] 单项：N-1 / N-2 / N-3 / N-4 / N-5 / N-6 / N-7
- [ ] 单项：V-0 / V-1 / V-2 / V-3 / V-4
- [ ] 视觉改版的**基线页面清单**是否就是 V-0 的 6 个？（增删在这里说，落地后加页 = 重跑两平台）
- [ ] N-4 文档站域名：`docs.marxchou.com` 还是 `marxchou.com/docs`？（D6 至今未决）
- [ ] 是否授权**首次**收紧预算（候选：list 28→26KB，D-0137 已算出棘轮一致值）。本卡不动；要动单独一张卡 + 单独 decision

> 选定后：每项一张实施卡（含上表验收标准），不塞进 M5 主线；实施卡的第一条验收永远是「不改预算、不用 `--force`、不碰生产站」。

---

## 7. 本卡边界

| 项 | 结论 |
|---|---|
| 产品代码 | **0 改动**（`src/**`、`packages/*/src/**`、`apps/**` 未动） |
| 预算 / 门禁 | 未改任何预算值与门禁脚本；`gates:all` 复跑见 §8 |
| 生产站 | 未触发 `deploy.yml`（仅 `workflow_dispatch`） |
| 未发布包 | 未执行任何 publish；`@marxchou/dogeared-ui` 仍 registry 404 |
| 他人工作区 | `packages/ui/` 4 个文件 + `scripts/release/{lib,verify-guards}.mjs` + `scripts/gates/verify-package-boundary.mjs` 共 **7 个未提交文件**（疑似 M5-8 并发进行中）；本卡未触碰、未暂存、未提交。**§8 的门禁结果是在这个脏树上跑出的**（9/9 PASS），不代表干净树——提交前须由 M5-8 收口后复跑 |

---

## 8. 证据与复现

```bash
cd zcblog-v2

# 1) 预算与余量（本文件 §1.1 的数字全部来自这条命令）
python3 scripts/gates/perf-budget.py dist

# 2) 门禁（新增评审文档后仍须 PASS、unclassified=0）
node scripts/gates/verify-overlay.mjs          # → RESULT PASS classified=… unclassified=0

# 3) 视觉基线规模
find e2e/__screenshots__ -name '*.png' | wc -l   # → 144（72 mac + 72 linux）

# 4) e2e 用例规模
grep -c "test(" e2e/*.spec.ts | awk -F: '{s+=$2} END {print s}'   # → 260

# 5) PWA 预缓存条目
grep -o 'url:"[^"]*"' dist/sw.js | wc -l         # → 76

# 6) 本卡取证探针（JS 链 / HTML 组成 / 被引用图片体积）
python3 <workspace>/probe.py dist
python3 <workspace>/probe2.py dist
```
