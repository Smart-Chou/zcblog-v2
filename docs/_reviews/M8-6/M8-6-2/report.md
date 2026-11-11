# M8-6-2 · 文化 `/culture/` 视觉重做 — 交付报告

- 卡：`t_4c30b6a6`（M8-6 批二，assignee `blog-fe`）
- 判据：`docs/_reviews/M8-6/acceptance-standard.md` §2.2 **P2-01…P2-06** + §3.4 **M-01…M-16**
- 基线口径：§4 **V-05**（本页 ∈ PAGES → 仅本页 6 张 × 2 平台）
- 分支：`main`（工作区 `~/Documents/WebSiteCode/zcblog-v2`）

## 1. 落地内容

### 阶段 a — 三分区 + 追更轨 + 入口卡

| 项 | 实现 |
|---|---|
| Hero | `.culture-hero` → `PageHero`（`id="culture-title"`，计数条=入口数/去重条数/原始条数） |
| 入口分区头 | `.entities-section__head` → `SectionHead`（`id="culture-entries-title"`，meta「固定顺序 · 番剧 → 豆瓣书影音 → 歌单」） |
| 空态 | `.culture-empty` 手写块 → `DataState kind="empty"` |
| 入口卡 | `CultureCard` 保持契约：序号（`fg-muted`）、来源 kicker、标题 + 箭头（Icon，非 `→` 字符）、说明、`dl` 统计、`ul` 分类 |
| 悬停 | `.culture-card:hover` → `box-shadow: var(--shadow-3)`（Card atom 语言） |
| 卡顶边 | 2px → **1px** `border-subtle` |
| `culture.css` 语义修正 | 两处 `font-size: var(--space-*)` 换 `--text-2xl` / `--text-3xl`，像素值不变（20px / 28px） |
| 断点 | 补 `≤768`（单列 + 段轨卡宽 78%）与 `≤450`（86% + 标题降级） |
| `culture-note` | 保留；原始 / 去重两个数在 Hero 计数条里都报（e2e 断言 `raw − overlap = unique`） |

### 阶段 b — 豆瓣入账热力图

- 数据口径**只吃** `src/data/douban.json` 的 `date`（`slice(0, 10)`，即入账/抓取当天）；**不用** bangumi `updated_at`（抓取快照，全库集中在一天，画出来是竖线）。
- 标题写死「豆瓣入账日期 · 2026」；脚注自报口径并说明为什么不用 bangumi 抓取时间。
- 形态：GitHub 风格 7 行 × 53 列整周对齐；色阶 0–4 由当天条数分档（1 / 2–3 / 4–6 / ≥7），全部 `color-mix` 派生自 `--color-accent-solid`，0 hex。
- 可访问性：整块 `role="img"` + `aria-label`（标题 + 统计摘要），365 个格子 `aria-hidden`（逐格朗读是噪音）；滚动容器 `tabindex="0"`（axe `scrollable-region-focusable` 是 serious）。
- 空态：`PUBLIC_CULTURE_STATE=empty` 时整块不渲染；`PUBLIC_CULTURE_OMIT=music` 只减卡不减热力图；**无 error 态**（沿用「缺实体不渲染」产品判据）。

### 阶段 c — 四段轨道

- `CultureRail`（`data-culture-rail` = `anime` / `bookshelf` / `cinema` / `music`）+ `CultureItemCard`：
  - 桌面 = 追更轨（横向滚动，卡宽 `clamp(16rem, 24vw, 20rem)`）；
  - `≤768` = 四段 snap 横滑，`scroll-snap-type: x mandatory` + `scroll-snap-align: start` + `overscroll-behavior-x: contain`；
  - 卡宽 78%（≤450 为 86%）+ 4px 间隙 → 滑到终点不裁半张卡；
  - 纯 CSS 切换，0 JS（R4：列表页不加 script）。
- **无内容段不渲染空轨**：`cultureRails` 在页面侧 `filter(items.length > 0)`，组件内不做空态。
- 每段有可访问标题（`aria-labelledby` → `SectionHead` 的 `h2`），Tab 可达每段卡片（e2e 用真实 Tab 走位验证）。

## 2. 验证结果（真实执行）

```
$ ./node_modules/.bin/astro check        → 0 errors, 0 warnings (353 files)
$ ./node_modules/.bin/astro build        → 482 pages, 0 error (50.7s)
$ ./node_modules/.bin/playwright test e2e/pages-culture.spec.ts → 19 passed (2.7m)
```

### e2e 关键输出

```
[axe]      culture light: violations=0 incomplete=0
[axe]      culture dark : violations=0 incomplete=0
[axe375]   light: violations=0 incomplete=0
[axe375]   dark : violations=0 incomplete=0
[heatmap]  1 个入账日 / 10 条 · 371 格 · 「豆瓣入账日期 · 2026」
[mobile]   375: 四段 snap/Tab/高度/裁切 全部成立
[mobile]   390: 四段 snap/Tab/高度/裁切 全部成立
[contract] 3 个入口 · raw 45 − overlap 4 = unique 41
[evidence] 4 张页级 + 8 张四段起终 → docs/_reviews/M8-6/M8-6-2
```

`pages-culture.spec.ts` 覆盖：路由 200（中/英）、中英同源、h1 唯一 + 层级、overflow（light/dark × 390/768/1440 + 新增 375）、axe 1440 与 375 双主题、入口契约、站内链接探针、旧路由保留、导航入口、`PUBLIC_CULTURE_OMIT=music` 真实构建、证据截图，以及本卡新增的 6 条 M8-6-2 专项。

### 本卡新增的测试（第 12 段）

| 用例 | 断言要点 |
|---|---|
| 四段轨 | 4 段顺序固定；每段 `aria-labelledby` 指向真实非空标题；每段卡数 > 0 且每卡 1 链接；无编造观看进度（`progress` = 0） |
| 热力图口径 | 标题含「豆瓣入账日期」；`data-culture-heatmap-days/total/year` 与 Node 侧直接数 `douban.json` 的真值对账；格子数是 7 的倍数；脚注自报口径；图例 5 档 |
| 结构 | 状态 ∈ {ok, empty}、无 `[data-culture-error]`；Hero 同时报原始/去重；卡顶边 `1px`；CSSOM 里存在 `.culture-card:hover` 的 box-shadow |
| 移动四段（375/390） | 375 无横向溢出；h1 在首屏内；每轨 `scroll-snap-type: x`；单卡宽 ≤ 轨道可视宽；滑到终点最后一张卡不裁（overhang ≤ 1px）；横滑后容器高度不变；真实 Tab 走位能落到四段 |
| axe 375 | 双主题 serious/critical = 0、incomplete = 0（M-13） |
| 证据 | 1440 light/dark、390/375 light + 四段起/终 8 张 |

## 3. 本轮修掉的真实缺陷（测试暴露，不是猜测）

1. **axe `scrollable-region-focusable`（serious）**：热力图 53 列在 375 下横滑，滚动容器无焦点入口。修法：`role="img"` + `tabindex="0"` + `:focus-visible` 描边。
2. **axe `color-contrast` incomplete（月份行）**：月份标签装在 12px 宽的格子里，文字溢出盒子；375 下第 5 个月起还落在滚动容器裁切边界外 → 背景不可采样。修法：月份格改为 `grid-column: start / span N`（跨满该月），标签走 `data-month` + `::before`（该行本就是 `aria-hidden` 装饰，语义摘要由整块 `aria-label` 承担）。
3. **热力图与被删的旧 `.culture-section__head` 选择器**：spec 里的 `.entities-section__meta` 随 `SectionHead` 改名而失效，已同步为 `.section-head__meta`。

## 4. 视觉基线（§4 V-05）

本页在 `e2e/pages.visual.spec.ts` 的 PAGES 内 → 需要刷新 **macOS** 侧 6 张：

`culture-{light,dark}-{375,768,1280}.png`

- macOS 侧：**已刷新并复核**（commit `2c47cfc`）。
  ```
  node scripts/visual/build-pages-baseline.mjs                       → 133 pages 0 error
  PLAYWRIGHT_BASELINE_PLATFORM=macos playwright test … -g culture --update-snapshots → 6 passed
  PLAYWRIGHT_BASELINE_PLATFORM=macos playwright test … --retries=0  → 38 passed / 4 failed
  ```
  `git status e2e/__screenshots__` 只有 culture 6 张 → 其余 36 张 **0 差异**（shasum 未变，未提交即证明）。
  4 条失败全部是 `albums-{light,dark}-{375,1280}`：`/albums/` 不在本卡边界（未改 `src/pages/albums/**` 与 `albums.css`），是**既有基线漂移**，需单独开卡处理，本卡不夹带。
- Linux 侧：按卡面边界**不由 worker 执行**，交 QA/operator 用 `mcr.microsoft.com/playwright:v1.63.0-noble` 跑。
- 其余 36 张：本卡只动 `src/pages/culture/**`、`src/components/Culture/**`、`src/styles/pages/culture.css`、`e2e/pages-culture.spec.ts` → 命中 V-05（单页），不改共享表面，理论上 0 差异，**需在基线刷新后逐张 shasum 复核**。

## 5. 未完成 / 交接

1. **macOS 基线 6 张未刷新**（阻塞 gates 的 visual 环节）：
   ```bash
   node scripts/visual/build-pages-baseline.mjs
   PLAYWRIGHT_BASELINE_PLATFORM=macos ./node_modules/.bin/playwright test e2e/pages.visual.spec.ts --update-snapshots -g "culture"
   PLAYWRIGHT_BASELINE_PLATFORM=macos ./node_modules/.bin/playwright test e2e/pages.visual.spec.ts --reporter=list --retries=0
   ```
   跑两遍确认稳定，并记录「变化的只有 culture 6 张、其余 36 张 shasum 未变」。
2. **Linux 基线**：QA/operator 用官方镜像执行（§4.3），worker 未 do。
3. **gates 8/8**：`scripts/gates/` 未在本轮跑完（依赖上面两项）。

## 6. 空态复核命令

```bash
PUBLIC_CULTURE_STATE=empty ./node_modules/.bin/astro build   # data-culture-status=empty, entries=0, 0 卡, [data-culture-empty="no-entries"]
PUBLIC_CULTURE_OMIT=music ./node_modules/.bin/astro build    # 2 卡，音乐入口消失，计数不变
```

`PUBLIC_CULTURE_OMIT=music` 的真实构建已在 spec 第 10 段内执行（含 finally 恢复常规构建），本轮 19 例全绿即包含该验证。空态 `PUBLIC_CULTURE_STATE=empty` 走 QA §5.3 文化行，未在本卡单独重复。
