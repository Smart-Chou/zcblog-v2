# M8-6-5 · 系列页视觉重做 + `.series-*` 从 `tags.css` 拆出

- 卡：`t_713e1f8d`（M8-6 批一 · 系列）
- 规格：`docs/_reviews/M8-6/acceptance-standard.md` §2.5（P5-01…P5-06）+ §1 通用项 + §4 V-06
- 范围：`/series/`（`series_collections_1`）、`/series/<slug>/`（移动 `_2`）
- 结论：**阶段 a 0 视觉差成立，阶段 b 结构与断言全绿**。系列样式出处已独立，`/tags/` 与系列页互不牵连。

---

## 1. 阶段 a · 纯搬移（先做，单独验证）

### 1.1 改了什么

| 文件 | 动作 |
|---|---|
| `src/styles/pages/series.css` | **新建**：`.series-hub` / `.series-detail` / `.series-list` / `.series-item` / `.series-link` / `.series-meta-line` / `.series-count` / `.series-latest` / `.series-posts` / `.series-step*` / 焦点环 / 断点 —— 从 `tags.css` **逐字**搬出（规则声明零改动） |
| `src/styles/pages/tags.css` | 只删搬移段（-135 行），保留一条指引注释；文件内不再有任何 `.series-*` 规则（`grep -c '\.series-'` 仅命中该注释） |
| `src/pages/series/[...slug].astro` | import 由 `tags.css` 改为 `series.css` |
| `src/pages/en/series/[...slug].astro` | 同上 |

搬移点：`git show --stat b402664` → 4 files, +170 / −135。

### 1.2 0 视觉差证据

构建：`astro build`（拆出前 `dist-m865-before` / 拆出后 `dist-m865-after`），同一批内容、同一台机器、`reducedMotion: reduce`、`deviceScaleFactor: 1`、`fullPage`。

逐像素比对（`node .scratch-m865/pixel-diff.mjs`，sharp 解码后逐通道比对）：

| 截图 | 尺寸 | 差异像素 | 差异占比 | 最大通道差 |
|---|---|---|---|---|
| `tags__1440__light` | 1440×3435 | 0 | 0% | 0 |
| `tags__1440__dark` | 1440×3435 | 0 | 0% | 0 |
| `tags__390__light` | 390×10205 | 0 | 0% | 0 |
| `tags__390__dark` | 390×10205 | 0 | 0% | 0 |
| `tags_AI__1440__light` | 1440×1581 | 1231 | 0.0541% | 153 |
| `tags_AI__1440__dark` | 1440×1581 | 0 | 0% | 0 |
| `tags_AI__390__light` | 390×1506 | 0 | 0% | 0 |
| `tags_AI__390__dark` | 390×1506 | 0 | 0% | 0 |

8 组里 7 组**逐字节一致**。剩下一组的差异已定位：包围盒 `x604-677 × y530-1257`（一条窄竖带），裁切对照见 `shots/tags-ai-diff-side-by-side.png` —— 差异内容是**浏览量数字**（左「— views.」/ 右「443 views」），即客户端浏览量接口的异步竞态，标题/摘要/间距/颜色/字体渲染完全一致。不属于样式差异，也与本次搬移无关（同一批截图的其它 7 组证明渲染管线一致）。

原始数据：`phase-a/pixel-diff.json`；对照图：`phase-a/before-*.png` / `phase-a/after-*.png`。

### 1.3 连带影响确认

`/tags/`、`/tags/AI/` 在 1440/390 × light/dark 的横向溢出均为 0、axe serious/moderate 均为空（与拆出前同一结论），说明 `.series-*` 移出后标签页样式无缺、无回退。

---

## 2. 阶段 b · 视觉重做

### 2.1 结构（三大结构件全部接入）

| 位置 | 旧 | 新 |
|---|---|---|
| 索引页头 | `<header class="tags-hero">` 借用标签页语言 | `PageHero`（`kicker` / `title` / `lede` / `meta` / `divider={false}` / `slug="series-hub"`） |
| 索引分区头 | 无（列表直接跟在页头后） | `<section class="series-index" aria-labelledby="series-index-heading">` + `SectionHead`（title=「全部系列」、meta=「共 N 个系列」） |
| 详情页头 | `<header class="tag-detail__hero">` + `.tag-detail__title/__lede/__back` | `PageHero`（`divider={false}`，默认 slot 放返回链接 `.series-back`） |
| 索引列表 | `<ul class="series-list">` 单列分隔线行 | 卡片栅格：`repeat(auto-fit, minmax(min(100%, 22rem), 1fr))`，1440 两列 / 390·375 单列 |

零系列 = 零路由：`getStaticPaths` 仍返回 `[]`，**没有**新增空态/错态分支，也没有引入 `DataState`（本页无空态形态，硬造一个可达的空壳才会违反 P5 与 §5.5 反作弊）。`DataState` 接入的判定写在这里，供复核。

### 2.2 D10 · 步骤序号

`.series-step__marker` 的 `color` 由 `--color-fg-link` 改 `--color-fg-muted`（原注释里「小字用 fg-link」的理由被 D10 取代：序号是位置信息、不是链接）。实测 computed color：

- light `rgb(134, 107, 102)`、dark `rgb(140, 134, 122)`
- 视觉上序号比标题弱一档（`shots/series-detail__390__dark.png`），不再抢标题权重

### 2.3 边界遵守

- **0 新增 JS**：三个结构件 + 组件改动全部是 `.astro` 静态产出；`page-hero` / `section-head` 无 script。
- **数据契约未动**：`collectSeries` / `seriesHref` / `seriesStepLabel` / `enrichPost` 一行未改；索引条目仍是「名称 + 链接 + 共 N 篇文章 + 最近更新时间」。
- **`/tags/` 未碰**：`tags.css` 只做删除，`pages/tags/*`、`[locale]/tags.astro` 零改动（阶段 a 的 0 差截图即证据）。
- 体量：`series.css` 194 行（≤300 理想值内）。

### 2.4 选择器契约（P5-01…P5-03 不变）

| ID | 断言 | 实测 |
|---|---|---|
| P5-01 | `.series-hub` 恰 1；`ul.series-list[data-count=N]` | hub=1，`data-count="2"`，`.series-item`=2（生产内容：hermes-agent、sing-box） |
| P5-02 | 每项含名称/链接/`共 N 篇文章`/最近更新 | e2e 断言通过（fixture：Astro Notes 1 篇、Self Hosted 2 篇，按展示名排序） |
| P5-03 | `.series-detail` 恰 1；`h1` 恰 1；`ol.series-posts[data-count]` | `data-count="3"`，h1=1 |

---

## 3. 验收证据

### 3.1 构建 / 类型 / 门禁

| 项 | 结果 |
|---|---|
| targeted build（真实内容，`dist-m865-v2`） | **482 页 / Complete!**（`.scratch-m865-build-v2.log`），产出 `series/index.html`、`series/hermes-agent/`、`series/sing-box/` |
| `tsc --noEmit` | **0 错误** |
| `gates:*`（10 个脚本逐个跑） | **10/10 PASS**（atoms / atom-docs / component-inventory / doc-drift / tokens / surface-tokens / entities / package-boundary / overlay / icon-sprite） |
| `pnpm series:e2e`（fixture 构建 + `e2e/series.spec.ts`） | **15 passed (23.2s)**，exit 0 |

### 3.2 布局 / a11y（`shots/probe.json`，24 次页面加载）

矩阵：`/series/`、`/series/hermes-agent/`、`/tags/`、`/tags/AI/` × 1440/390/375 × light/dark。

- **横向溢出：0**（每个组合 `document.scrollWidth ≤ clientWidth`，越界元素清单为空）
- **axe（wcag2a/aa + wcag21a/aa + wcag22aa）：moderate 0 / incomplete 0**；`/series/` 与 `/series/<slug>/` 全部组合 serious = 0
- 唯一 serious 命中：1440 **light** 下 `.pf-trigger-text`（Pagefind 搜索触发器文字）2 个节点 —— 见 §5.2，**拆出前构建同样命中**，属站点头部既有问题，不是本卡引入
- 栅格实测：1440 → `538px 538px 0px`（两列，auto-fit 空轨道塌陷）；390 → `355px`；375 → `340px`（单列，无溢出）
- 页头分隔线：`page-hero--divider` 类不存在（`divider={false}` 生效）

### 3.3 截图（`docs/_reviews/M8-6/M8-6-5/shots/`）

| 文件 | 用途 |
|---|---|
| `series__1440__light/dark.png`、`series__390__light/dark.png`、`series__375__light/dark.png` | 索引 6 张（1440/390/375 × light/dark） |
| `series-detail__1440__light/dark.png`、`series-detail__390__light/dark.png`、`series-detail__375__light/dark.png` | 详情 6 张 |
| `tags__1440__light.png`、`tags-detail__1440__light.png` | 对照（未连带） |
| `tags-ai-diff-side-by-side.png` | 阶段 a 唯一差异的定位图（浏览量异步） |
| `phase-a/before-*.png`、`phase-a/after-*.png`、`phase-a/pixel-diff.json` | 阶段 a 前后对照与逐像素数据 |

移动稿（`_2`）符合项：索引单列、详情篇目单列、`.series-step` grid 无横向溢出、序号与标题不重叠 —— 对应 `series-detail__390__*` / `series-detail__375__*`。系列内 >12 篇的篇目折叠属设计稿要求，本卡未改篇目渲染（`SeriesPosts` 只换页头），现状与 M5-12 一致，未引入回退。

### 3.4 视觉基线（§4 V-06 豁免）

系列页仍不在 PAGES：`pages.visual` fixture 0 篇带 `series`，基线构建不产 `/series/`，扩 fixture 会让既有基线整体漂移。本卡按 §4.5 走 V-06 证据（截图 + `series.spec.ts` 全绿），不新增 gated 基线。

---

## 4. 改动清单

```
src/styles/pages/series.css            | 搬入 .series-*（阶段 a）+ 卡片栅格/D10/返回入口（阶段 b）
src/styles/pages/tags.css              | 阶段 a 只删搬移段
src/pages/series/[...slug].astro       | 阶段 a 改 import
src/pages/en/series/[...slug].astro    | 阶段 a 改 import
src/components/Series/SeriesHub.astro  | PageHero + SectionHead + 卡片栅格
src/components/Series/SeriesPosts.astro| PageHero（divider=false）+ .series-back
e2e/series.spec.ts                     | 索引统计断言随结构更新（2 处）
```

复现：

```bash
# 阶段 a 前后对照（两份构建 + 逐像素）
node .scratch-m865/pixel-diff.mjs
# 阶段 b 证据（需先起静态服务指向构建目录）
node .scratch-m865/probe-b.mjs http://127.0.0.1:4403 docs/_reviews/M8-6/M8-6-5/shots
# 行为回归
pnpm series:e2e && ./node_modules/.bin/tsc --noEmit
```

---

## 5. 偏差与已知项（复核用）

### 5.1 索引统计拆分 → 同步更新既有断言

重做后页头统计按「页头=文章总数、分区头=系列数」拆开（避免两处重复同一句）。旧 spec 断言 `.series-hub .tags-meta` 同时含两个计数，该选择器与 `.tags-*` 一起在阶段 a 就已不属于系列页。故把 `e2e/series.spec.ts` 的 2 处断言改为：`.page-hero__meta` 含「共 3 篇文章」、`.section-head__meta` 含「共 2 个系列」。**断言的数据强度未降**（系列数、文章数都还在断言里），只是跟着结构换了落点。

### 5.2 `.pf-trigger-text` 对比度（既有，不属本卡）

1440 light 下 `color-contrast` serious，2 个节点：`.pf-trigger-text`、`.nav-menu-btn-label`（Pagefind 触发器与菜单按钮的文字标签）。拆出前构建（`dist-m865-before`）在 `/tags/` 与 `/series/` 上命中同一 violation（`.scratch-m865/axe-before.log`），因此是站点头部组件的既有问题，需平台卡或头部卡处理；本卡不改它（会连带全站视觉）。

### 5.3 `/en/series/` 在无英文系列时为 404

当前生产内容无英文系列文章 → 不产 `/en/series/`，语言切换器指向它会 404。这是既有路由策略（§2.5「`/en/series/…` 仅当该系列有 en 文章」）与 G-10 的张力点，`series.spec.ts` 的「语言切换器不造死链」用例当前通过（只校验 href 归一到 `/en/series/`）。本卡不动路由，仅记录，供 §2.5 复核者判断是否需要单开卡（建议：en 无系列时切换器降级为不可点）。

### 5.4 返回入口的颜色来源

`.series-back` 只补布局（inline-flex / gap / align-self / min-block-size），文字颜色由 `Link` 的 `standalone` 变体（scoped，0,2,0）决定：实测 computed color `rgb(142, 42, 23)`（accent），而 `--color-fg-muted` 是 `#866b66` —— 说明原先那行 `color: var(--color-fg-muted)` 被覆盖、本就是惰性的。因此提交里删掉该行 + 补 `align-self: flex-start` 均为**渲染 no-op**（实测：加 align-self 前后 `.series-back` 的 rect 完全一致 `x=1178.23, y=234.80, 80.27×40`，父 `.page-hero__actions` 是 flex + `align-items: center`），证据截图仍与提交后的代码一致。与 `/tags/<tag>/` 的 `.tag-detail__back` 行为一致（同一处覆盖），CSS 注释已写明，避免后人误以为这里是 muted。

### 5.5 视觉观感（供 PO 定夺，不阻断）

1440 下 2 个系列只占一行，卡片下方约半屏留白；卡片底色 `--color-bg-surface` 与页面底色的对比偏低，边界主要靠 1px `border-subtle` + `shadow-1`。这是真实内容量 + 现有 token 的结果，没有为了「填满」造内容或加装饰。若设计稿要求更强卡片边界，建议在 token 层（`--color-border-subtle` 或新增 card 阴影档）处理，避免页面级硬编码。
