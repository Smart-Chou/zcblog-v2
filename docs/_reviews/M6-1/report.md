# M6-1 · 外壳与原子视觉底座 — 实施报告

> 卡：`t_b112fa5a`（blog2 板）· 负责人 `blog-fe` · 2026-11-08
> 基线：`main` @ `2b966e5`（工作区干净）· 变更：**恰好 10 个源文件** + 36 张 macOS 视觉基线 + 本报告
> 上游：`D-0147`（每页 1 主方案）、`D-0148`（accent 三档 `#A6331B / #8E2A17 / #77230F`）
> 边界：`src/pages/**` 0 改动、`src/styles/pages/*.css` 0 改动、overlay 0 改动、无字体、无 Material Symbols、无 Tailwind

---

## 1. 一句话结论

外壳（Header / Nav / Footer / 容器 / 栅格）与原子表面（卡片 / 徽章 / 胶囊 / 等宽标签）已换成 Stitch v2 的语言并吃到冻结后的 palette，
**6 条门禁全绿、JS 增量 0、无横向溢出、swup 下 header 不重复绑定**；palette 一行没动，`--layout-content-wide: 1140px` 是 tokens.json 的唯一新增。

---

## 2. diff 清单（10 个源文件）

| # | 文件 | 改了什么 | 行数 |
|---|---|---|---:|
| 1 | `packages/tokens/tokens.json` | 只加 `"--layout-content-wide": "1140px"`（primitive 层，紧跟 `--layout-content`） | +1 |
| 2 | `packages/tokens/tokens.css` | 由 `node packages/tokens/scripts/build-tokens.mjs` 生成（sha 头 + 1 行键） | +2/−1 |
| 3 | `src/styles/tokens.css` | 旧键桥接：`--content-width-max → var(--layout-wide, 1440px)`、`--sidebar-width → var(--layout-sidebar, 280px)`；删死别名（灰阶 10 条、`--color-hover-accent`、`--color-backdrop` + 暗色覆盖、`--toc-width`、`--content-width-wide`、`--leading-headings`、`--z-toast`） | +66/−? |
| 4 | `src/styles/base.css` | 新增 `--shell-*` 外壳别名（语义 token 优先 / 旧名兜底）；`body` 画布与正文色；`.main` 容器外边距与纵向节拍；`.content > section + section` 区块节奏 | +71 |
| 5 | `src/styles/components.css` | 原子表面语言：`.card` / `.card--interactive` / `.card--plain` / `.card--flush`、`.badge-section` / `.badge-status-dot`、`.tag-pill` / `.post-tags-link`、`.mono-label` / `.mono-metric`；旧块迁到 `--shell-*` | +180 |
| 6 | `src/components/UI/Card.astro` | 可选 `variant?: "media" \| "plain"` + `flush?`，默认不传 = 输出与改前一致（无额外 class / 属性） | +72 |
| 7 | `src/layouts/BaseLayout.astro` | `page-wrapper` 支持 12 栅格可选列 `columns="8-4" / "4-8"`（默认 `auto` = 旧行为）；容器 1140、外边距 24/20/16、gap 32；`.main` 内不再重复加内边距 | +81 |
| 8 | `src/components/Layout/Header.astro` | 全宽吸顶条（半透明画布 + 背景模糊 + 1px 边线，高 `--layout-header-height`）；容器 1140；左＝Logo + 字标（站名/副标题）；右＝搜索触发器（pagefind 换皮成 34px 面片胶囊）+ 菜单胶囊 + 语言 / 主题 / 头像组 | +306 |
| 9 | `src/components/Layout/Nav.astro` | `#nav-menu-btn` 收成 34px 胶囊（带「菜单 / Menu」标签，≤768 收成图标）；下拉面板挂到页头正下方、`--layout-content-wide` 宽、胶囊条目、当前页整颗填强调色 + `aria-current="page"`；修 `isActive("/")` 前缀匹配 bug | +206 |
| 10 | `src/components/Layout/Footer.astro` | 统计行（等宽数字 + 大写字距标签）/ 技术栈胶囊 / 备案行三段重排，与 shell 同宽 1140、同一 24px 外边距，全部 `--shell-*` | +97 |

`git diff --stat HEAD`：`10 files changed, 804 insertions(+), 279 deletions(-)`。

---

## 3. 六条验收命令（真实输出）

### 1) `pnpm run gates:all` → exit 0

| 门禁 | 结果 |
|---|---|
| atoms / molecule | `18/18 PASS · 0 FAIL` |
| 组件清单 | `PASS atoms=12 ui=23 page-organisms=11 layout=1 dup=0 total=47` |
| 文档漂移 | `PASS mismatch=0 文档=12 对比度行=49` |
| token 契约（G-T1…G-S6） | `10/10 PASS · 0 FAIL`（含 G-T1 生成物逐字节一致、G-T4 `--palette-` 泄漏 0） |
| 数据实体 | `9/9 PASS · 0 FAIL · 0 WARN` |
| 包边界 | `PASS packages=3 violations=0 theme_version=2.1.2` |
| overlay 契约 | `PASS classified=1263 unclassified=0`（`ambiguous=0`） |
| 图标 sprite | `8/8 PASS` |

### 2) `pnpm run gates:surfaces` → PASS

```
P1 src/pages/** 颜色字面量 = 0（存量冻结）  PASS  新增 0 · 基线存量 0
P2 src/pages/** Tailwind = 0                PASS  命中 0
P3 src/pages/** px 只允许 0/1px/2px         PASS  新增 0 · 基线存量 2
C1 src/components/** 颜色只减不增           PASS  13 文件 41 条 · 基线 41 条 · 上限 84
C2 src/components/** Tailwind = 0           PASS  命中 0
```
组件颜色字面量从冻结的 84 条降到实测 41 条（`Card.astro` 的 `rgba/white` 被 `--shell-*` 取代），棘轮只降不升。

### 3) `pnpm run type-check` → 干净（`tsc --noEmit`，无输出无报错）

### 4) `pnpm run build:ci && python3 scripts/gates/perf-budget.py dist` → 超预算 0 页

| 类型 | 页数 | HTML p95 | JS p95 | CSS p95 | 门禁 h/j/c | 最紧余量 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| article | 85 | 149.2 KB | **38.6 KB** | 35.7 KB | 215/40/45 | +0.9 KB (2.2%) |
| list | 286 | 60.3 KB | **24.5 KB** | 29.0 KB | 105/28/40 | +2.8 KB (10.0%) |
| page | 378 | 55.1 KB | **24.5 KB** | 30.5 KB | 105/30/40 | +0.3 KB (1.0%) |

- **JS 增量 0**：三类页面 JS p95 与 M5-13 报告的 `38.6 / 24.5 / 24.5 KB` **逐项相同**；没有任何 `<script>` 新增，`Header/Nav` 只改了既有模块脚本内部的逻辑。
- HTML p95 +0.8~0.9 KB（字标 + 头像 + 胶囊 class），CSS p95 +1.3~1.6 KB（全站一份外壳样式），均远在门禁内。

### 5) `pnpm exec playwright test e2e/pages.visual.spec.ts` → 36 passed

- macOS 基线重生成：`--update-snapshots` 36/36 写入 `e2e/__screenshots__/pages/`（值变内容、文件数不变）；随后**不带** `--update-snapshots` 复跑 36 passed。
- `e2e/__screenshots__/pages-linux/`：worker 本地未改；**operator 复核时发现外壳变化同样影响 Linux**，已在 `mcr.microsoft.com/playwright:v1.63.0-noble` 内重建 36 张并回写（`36 passed (1.5m)`），没有拿 macOS 基线冒充。
- `KNOWN_OVERFLOW` 保持原值（`article@375 = 16px`），未改 spec。

### 6) 对比度

`selection.md` §9.3 的第 6 条命令（`check-tokens.mjs --contrast`）在仓库里不存在独立开关；对比度由 `verify-atom-docs.mjs` / `verify-doc-drift.mjs` 的对比度行门禁覆盖（`gates:all` 内 `对比度行=49 · mismatch=0` 已 PASS）。
**palette 0 改动**（`tokens.json` diff 只有 `--layout-content-wide` 一行），因此 D-0148/M6-1a 已复核的 25 个场景数值不变；本卡未重复运行附录 C 脚本。

### 附：回归面（超出验收、顺手跑）

| 套件 | 结果 |
|---|---|
| `e2e/navigation.spec.ts` + `e2e/theme.spec.ts` | **11 passed**（汉堡按钮在桌面/移动都可见、开合/Esc/换页收起、主题持久化全过） |
| `e2e/overlays.spec.ts` | **21 passed / 4 skipped**（快捷键 / 手势入口都从新 Nav 打开；reduced-motion 0 运行中动画） |
| `e2e/pages-home.spec.ts` + `e2e/pages-albums.spec.ts` | **31 passed / 6 skipped**（首页与相册是本次改动视觉影响面最大的两页） |

---

## 4. 运行时实测（探针脚本，非仓库文件）

脚本：`~/.hermes/kanban/boards/blog2/workspaces/t_b112fa5a/shell-shots.mjs`（Playwright，第三方请求全拦，与 `pages.visual.spec.ts` 同口径）。

| 视口 × 主题 | 页头高 | 画布 token | body 背景 | 当前页胶囊底色 | 横向溢出 |
|---|---|---|---|---|---|
| 1440 light | 65px（64 + 1px 边线） | `#fdf9f2` | `rgb(253,249,242)` | `rgb(166,51,27)` = accent-500 | 0（scrollWidth − clientWidth = −15，滚动条预留） |
| 1440 dark | 65px | `#121316` | `rgb(18,19,22)` | `rgb(224,93,67)` = accent-400 | 0 |
| 1024 light/dark | 65px | 同上 | 同上 | 同上 | 0 |
| 390 light/dark | 53px（52 + 1px） | 同上 | 同上 | 同上 | 0 |

- **swup 不重复绑定**：从 `/` → `/archives/` → `/tags/` 连续两次换页后 `#progress-container` = 1、`.nav-shell` = 1，滚动后 `.scrolled` 正常切换，`aria-current="page"` 只剩 `/tags/` 一项。
- **无横向溢出**：三个视口 × 两主题全部 0 溢出（`pages.visual.spec.ts` 的同一断言也通过）。
- `grep -rn "material-symbols" src/` = **1**，命中在 `src/components/Icons/index.ts:156` 的 JSDoc 示例字符串（HEAD 既有、本卡未改），0 个 Material Symbols 依赖或 `<link>`。构建产物里 0 处引用。

---

## 5. 截图（`docs/_reviews/M6-1/screens/`）

| 文件 | 内容 |
|---|---|
| `shell-light-1440.png` / `shell-dark-1440.png` | 1440 视口首页，页头 + hero |
| `shell-light-1024.png` / `shell-dark-1024.png` | 1024 |
| `shell-light-390.png` / `shell-dark-390.png` | 390（移动） |
| `shell-menu-light-1440.png` / `shell-menu-dark-1440.png` | 导航胶囊面板展开态（当前页整颗填强调色） |

共 8 张（要求的 6 张 + 2 张展开态）。全部来自**固定夹具构建**（`pnpm visual:build:pages`）的 preview，与视觉基线同源。

---

## 6. 与 `selection.md` §9 的偏差（全部有据）

1. **移动端横向内边距保持旧值 12px / 10px（设计 20px / 16px）。**
   `e2e/pages.visual.spec.ts` 把 `article@375` 的横向溢出冻结在 **16px**（宽表格，属 M6-3 的页面卡）；把 `.main` 横向内边距从 10px 提到 16px 会让它变成 **21px**，视觉门禁直接红。改表格换行不在 10 文件边界内，所以只改纵向节拍，横向留到 M6-3。已在 `base.css` 就地注释。
2. **没有做「旧键全量颜色桥接」，改用 `--shell-*` 一层 indirection。**
   tokens 包是**按页 import**（37 条路由 `import "~/styles/tokens/tokens.css"`），并非全局；在 `src/styles/tokens.css` 里写 `--color-bg: var(--color-bg-canvas)` 会让剩下那些没 import 的路由拿到**空值**（透明画布）。所以外壳与原子统一读 `--shell-*`：有语义层用冻结 palette，没有就退回 `variables.css` 旧值。
   **代价**：页面层仍在用 `--color-accent`（旧 `#c2413b`）的组件（正文链接、部分页面组件）会与外壳的 `#a6331b` 并存，直到 M6-2…M6-5 把页面迁到语义 token。这一条是刻意的、临时的，不是漏改。
3. **`src/styles/tokens.css` 的桥接带字面兜底**（`var(--layout-wide, 1440px)` / `var(--layout-sidebar, 280px)`）：同上，未 import tokens 包的路由需要兜底，否则 `SectionPage` / `page-wrapper` 的 `max-width` 会算成 `auto`。
4. **Header 加了字标（Logo 图 + 站名 + 副标题）**，`selection.md` §9.2 #8 只写了「导航胶囊化 + 搜索触发器 + 语言/主题/头像组」。设计稿 `marx_s_blog_2` / `toc` / `archives_tags_1` 三张的 header 左侧都是 wordmark（站名 + 副标题），只放一枚 32px 头像会被读成「左边缘一个孤立头像」，因此按稿补字标；≤450 隐藏字标只留 Logo。
5. **修了 `Nav.astro` 的 `isActive("/")` bug**（按卡内文件边界授权范围）。
   旧判定 `/^\/[^/]*\/$/.test("/")` 为 `false`，`/` 掉进 `currentPath.startsWith("/")` 分支 —— **全站每一页都把「首页」算成当前页**。以前只表现为多亮一项；M6-1 把当前页做成整颗填色 + `aria-current="page"` 后，会出现两颗「当前页」并让读屏播报两次。已在 SSR 与运行时两处同口径修掉（`href === "/"` 视为单段、精确匹配）。
6. **`tokens.json` 的 `$comment.families.layout` 仍是 6**（实际 7 个键）。验收明确要求该文件 diff 只允许 `--layout-content-wide` 一行，所以没顺手改计数，留给后续卡。
7. **`.post-card` 圆角 4px → 12px、卡片阴影换成 `--shadow-1/2/3`**（tokens 包的极轻阴影）。属原子表面语言统一，非设计稿冲突。
8. **`--shell-*` 只在 base.css 定义，没有提升为 tokens.json 的 primitive**：它们是「外壳别名」，不是新度量；palette/度量真源仍只有 `packages/tokens/tokens.json` 一处。

---

## 7. 留给后续卡

- **M6-2…M6-5**：把页面从 `variables.css` 旧名迁到语义 token（顺手消掉本报告 §6.2 的双 accent），需要新的 `columns="8-4"` 栅格时直接用 `BaseLayout` 的新 prop。
- **M6-3（文章页）**：宽表格换行/滚动修好后，把 `pages.visual.spec.ts` 的 `KNOWN_OVERFLOW` 降到 0 并把移动端内边距提到设计值 20px。
- **M6-6（QA）**：shell 三视口两主题已可作为基线扩容的输入（本卡 8 张截图 + 36 张 pages 基线）。
- 可选清理：`ToggleTheme.astro` 里 `#f59e0b` / `#3b82f6` 的固定图标色（本次只在 Header 内覆盖为静音色，源文件不在 10 文件边界内）。


---

## 8. Operator 复核（2026-11-08 18:55）

- 复核 8 张 shell 截图，并用 Playwright 实测：`nav-shell` 与 `.main` 的左/右外框同为 143/1283；品牌块左 167、正文左 167，右侧 1259 对齐。初版 header 的 `max-width:1140 + padding 24` 与正文 `1200` 容器不同宽，视觉上品牌/操作组各偏 15–20px；已在 `base.css` 把 `.main` 收敛到 1140 外框（含 24 内边距），`.content` 不再二次限宽。
- 该修正使 **36 张 pages 基线**（macOS）与 **36 张 Linux** 同时重生成；shell 8 张截图已按新对齐重拍。
- 解释：`dist` 的 `perf-budget.py` 在固定夹具构建后会报 A7 缺 2 页，属预期；随后用 `pnpm run build:ci` 的完整 749 页产物复跑，`over=0`、`a7_missing=[]`，JS p95 `38.6 / 24.5 / 24.5` 不变。
