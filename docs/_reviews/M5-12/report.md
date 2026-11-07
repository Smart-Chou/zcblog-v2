# M5-12 · N-1a 系列 schema、索引与列表页

- 卡：`t_46b4923a`（依赖 M5-11；下游 M5-13 = N-1b 文章系列导航 + 内容回填）
- 决策：**D-0145**（内容契约 v4 → v5）
- 分支：`zcblog-v2` 的 `main`；commit 见卡 metadata
- 结论：**PASS**。零 series 的站点不产出任何 `/series/` 路由（demo 仍 118 页），有系列的站点自动出现
  索引页 + 目录页，排序、hreflang、语言切换、390 宽版式全部有 e2e 断言。

## 1. 内容契约（v5）

| 字段 | 类型 | 规则 | 不写时 |
| --- | --- | --- | --- |
| `series` | `string?` | URL slug：`^[a-z0-9]+(-[a-z0-9]+)*$`，≤48 | 不属于任何系列 |
| `seriesOrder` | `number?` | int `0..999`，系列内升序 | 排在已编号文章之后，再按 pubDate 升序 |

- **`series` 是 slug 不是展示名**：`/series/<slug>/` 不做 encodeURI，大小写/空格不会分裂成两个路由；
  展示名由 `seriesNameOf()` 派生（`self-hosted` → `Self Hosted`）。因此没有第三个字段、
  也没有站点级「系列注册表」——回填 89 篇时字段越少越不容易写错。
- 排序三档兜底：`seriesOrder` → `pubDate` 升序 → `slug` 字典序。重复编号不炸构建，且顺序可复现。
- `draft: true` 的文章不进系列（不计数、不参与排序、不影响「最近更新」）。
- 内容仓 frontmatter **一篇未改**（回填属 M5-13，卡边界明确）。

## 2. 路由

| 路径 | 生成条件 |
| --- | --- |
| `/series/` | zh 有 ≥1 个系列 |
| `/series/<slug>/` | 该系列在 zh 有 ≥1 篇非草稿文章 |
| `/en/series/`、`/en/series/<slug>/` | 同上，按英文文章独立判断 |

- 用 **rest 参数路由** `src/pages/series/[...slug].astro`（en 同理）：`getStaticPaths` 返回 `[]` 时
  既不生成索引也不生成目录。静态 `index.astro` 无论如何都会产出一页，那正是「空壳」。
- 索引页只列出**有文章**的系列（`collectSeries` 从集合出发，天然没有空组），按展示名字典序。
- 目录页按 `seriesOrder` 排序，卡片复用列表页 `TagsPostCard`，两位 STEP 序号（`01`）在卡片上方，
  与卡片左边缘对齐（分栏方案会让卡片比页头缩进一格，产生锯齿，已否）。
- hreflang：`BaseLayout` 新增 `noZhAlternate`（与既有 `noEnAlternate` 对称）。zh-only 系列不输出
  `hreflang="en"`，en-only 系列不输出 `hreflang="zh"`，`x-default` 指向自身。
- 语言切换器：先查构建期集合 → 对侧有同名系列就直达，否则落到对侧系列索引，再否则回首页。
- `series` 已从 `scripts/gates/check-legacy-keys.py` 的 LEGACY 集合移除（否则回填的内容会被判遗留键）。

## 3. 验收对照

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 1. 无 series 零空壳、零路由报错 | **PASS** | 真实内容构建（474 页）`dist/series` 不存在；demo 构建 `dist/series` 不存在；`/series/not-a-real-series/` 404 |
| 2. 索引只列有文章的系列；列表按 `seriesOrder` | **PASS** | e2e「索引 2 个系列」+「目录顺序 01→02」；夹具第 1 篇 pubDate 更晚但排第 1 |
| 3. 新增 e2e ≥2 条 | **PASS（10 条）** | `e2e/series.spec.ts`：索引 / 目录排序 / 单篇系列 / 无 series 不渲染 / 404 / en 隔离 / hreflang / 切换器 / 390 版式 ×2 |
| 4. `create-site --overlay apps/demo --build` 118 页 | **PASS** | `RESULT PASS out=/tmp/zcd-m512c html=118 … layers=theme:506/…` |
| 5. `gates:all` PASS、`unclassified=0`、perf 0 超支 | **PASS** | 见 §4 |

附加（未在卡里但受影响的契约）：`verify-build` 全绿（85 篇文章 / 89 篇内容）、`verify-i18n` 8/8 PASS、
`astro check` 0 errors / 0 warnings / 6 hints（与基线一致）、`tsc --noEmit` 退出 0、prettier `--check .` 通过。

## 4. 门禁读数（本机，最终代码）

```
verify-atoms              18/18 PASS
verify-atom-docs          8/8 PASS
verify-component-inventory RESULT PASS atoms=12 ui=23 page-organisms=11 layout=1 dup=0 total=47
verify-doc-drift          RESULT PASS mismatch=0 文档=12 对比度行=49
check-tokens              10/10 PASS
verify-surface-tokens     RESULT PASS pages_hits=2(legacy frozen, new=0) new_hits=0 baseline=41/84
verify-entities           exit 0（warning 不阻断）
verify-package-boundary   RESULT PASS packages=3 violations=0 theme_version=2.1.2
verify-overlay            RESULT PASS classified=1257 unclassified=0 theme=821 overlay=302 exclude=134
verify-icon-sprite        8/8 PASS
```

性能预算（`scripts/gates/perf-budget.py dist`，746 页，**超预算 0 页**）：

| 类型 | 页数 | HTML p95 | JS p95 | CSS p95 | 门禁 h/j/c | 最紧余量 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| article | 85 | 148.4 KB | 38.6 KB | 34.0 KB | 215/40/45 | +0.9 KB (2.2%) |
| list | 286 | 59.4 KB | 24.5 KB | 27.7 KB | 105/28/40 | +2.8 KB (10.0%) |
| page | 375 | 54.2 KB | 24.5 KB | 29.2 KB | 105/30/40 | +0.3 KB (1.0%) |

- JS p95 与 M5-10 收口的 38.6 KB 一致：系列页**零客户端 JS**（纯静态链接 + 服务端渲染的切换器判断）。
- 系列页属于 `page` 类型，HTML 体积与 donate 同级；索引/目录没有新增任何 `<script>`。

## 5. e2e 设计：为什么要固定夹具

生产内容仓当前 0 篇写 `series`（回填是 M5-13），所以真实构建里根本没有 `/series/` 路由 ——
e2e 无从断言。解法与 M5-11 的页面视觉基线同源：

- `e2e/fixtures/series/content/article/`（5 篇，4 篇带 series）作为固定内容；
- `node scripts/series/build-e2e-fixture.mjs` 用 `CONTENT_ARTICLE_BASE` + 不存在的 `ARTICLE_REPO_PATH`
  构建一份 dist（`upDate` 必填，防止构建时间进 DOM）；
- `pnpm series:e2e` = 构建夹具 + `playwright test e2e/series.spec.ts`，实测 **10 passed**。

夹具刻意构造了三类对照组：`seriesOrder=1` 但 pubDate 更晚（证明排序靠编号）、
无 `seriesOrder` 的第二个系列（证明缺省兜底）、无 `series` 的文章（证明「无 series 不渲染」）。

## 6. 视觉复核

截图：`~/.hermes/cache/scratch/zcblog-m5-12-shots/`（hub / detail / detail-en × light/dark × 1440/390）。

- 首轮视觉复核发现两处真实缺陷并已修：
  1. `最近更新` 与日期粘连（Astro 剥掉模板换行空白）→ `.series-latest` 改 inline-flex + gap；
     计数与日期之间补 `/` 分隔符（与 `.tags-meta` 同一套语言）。
  2. STEP 序号原本在左侧独立栏：卡片左边缘比页头缩进一格，整页出现锯齿 → 改为序号置顶单列。
- 对比度核算（node 纯函数）：`accent-solid` 在纸色底 `#faf7f2` 上只有 **4.36**（小字不达标），
  STEP 序号改用 `--color-fg-link`（亮 accent-600 = **5.89**；暗 accent-400 在 `#1a1c22` = **4.72**）。
- DOM 探针：三视口 `scrollWidth ≤ clientWidth`（390 宽无横向溢出），页面恰好 1 个 `h1`。
- 视觉模型对「对比度约 3.6」的判断与实测不符（截屏压缩 + 目测），以 token 计算为准；
  「序号位置不对齐」的判断与 DOM 一致，已按 DOM 修正。

## 7. 改动文件

新增：

- `src/utils/series.ts`（聚合/排序/展示名/URL，纯函数）
- `src/utils/__tests__/series.test.ts`（16 条单测）
- `src/components/Series/SeriesHub.astro`、`src/components/Series/SeriesPosts.astro`（页面主体，非 `Pages/` 有机物 —— 见下）
- `src/pages/series/[...slug].astro`、`src/pages/en/series/[...slug].astro`
- `e2e/series.spec.ts`、`e2e/fixtures/series/content/article/*.md`（5）
- `scripts/series/build-e2e-fixture.mjs`

修改：

- `src/content.config.ts`（v5 字段）
- `src/layouts/BaseLayout.astro`、`src/components/BaseHead/{BaseHead,SeoLinks}.astro`（`noZhAlternate`）
- `src/components/Layout/LanguageSwitcher.astro`（系列页跳转规则）
- `src/data/i18n/{zh,en}.json`（`series.*` 11 个键）
- `src/styles/pages/tags.css`（系列页共用页头语言 + `.series-*`）
- `scripts/gates/check-legacy-keys.py`（移出 `series`）
- `package.json`（`series:build:e2e` / `series:e2e`）

`site.manifest.json` **未改**：新文件全部落在既有 T 规则（`src/**`、`e2e/**`、`scripts/**`）内，
提交后 `git ls-files` 计入 T，`unclassified=0`（D-0144 的教训：先 `git add` 再跑门禁）。
文档属 X 规则（`docs/_reviews/**`）或主题外仓（`blog2.0/docs`）。

## 8. 边界与遗留

- **未改**内容仓 frontmatter（含 `zcblog-articles`）：回填是 M5-13 的验收项。
- 未加导航入口：`src/config/ui.ts` 是站点 overlay（O），导航项由站点所有者决定；M5-13 的文章页系列导航
  会把 `/series/` 变成可达入口（当前系列页在无文章内链时是孤岛，这正是 M5-13 存在的理由）。
- 未碰 npm registry（只读窗口到 2026-11-10 12:18 CST）。
- 组件放在 `src/components/Series/` 而不是 `src/components/Pages/`：`Pages/*` 是 P9 的「page-organism 债」
  分母（冻结 11，只减不增），而这两个组件只承载系列页的两个视图，和 `Index/*` 一样属于版块组件。
  如果后续要把它们收进 P9 分母，应单独走 decision 改口径。
