# M7-1a · 搜索 spotlight 视觉（Pagefind 行为保持）

- 卡：`t_97475fd9`（blog2 板）· assignee `blog-fe` · 2026-11-09
- 工作区：`/Users/chowcong/Documents/WebSiteCode/zcblog-v2`
- 结论：**完成**（本卡 spec 13 passed；axe serious/critical = 0；既有 8 条搜索行为用例原样通过）
- 选型依据：`selection.md` §4.22 —— 桌面 `pagefind_k_spotlight_1`（680px 命令面板）、移动 `spotlight_2`（同一弹层的窄版）

## 1. 做了什么（只换壳，不动行为）

一套 DOM、两个断点，仍然是 Pagefind Component UI（`pagefind-modal-trigger` / `pagefind-modal`）：

| 断点 | 形态 | 结构 |
| --- | --- | --- |
| ≥641（含 1440） | 命令面板 | 680px 宽、圆角 12、顶部 12vh；头部 = 图标块 + 裸输入（20px / 半粗）+ 索引状态芯片 + 关闭键；结果区 = 摘要行 + 首条「最佳匹配」暖底卡（左侧 3px 赤陶内嵌条）+ 结果树；页脚 = 四组键帽提示 + `Search by Pagefind` |
| ≤640（390） | 同一弹层的窄版 | 全屏 sheet（390×844）、圆角 0、无边框无阴影；头部收成「图标 + 输入 + 关闭」（状态芯片隐藏）；结果卡 padding 收窄、主摘要压两行、子结果只留命中标题（目录式） |

配色全部落到**语义 token**（`packages/tokens/variables.css` + `src/styles/tokens.css`，这两份在 `global.css` 里全局可用）：
`--color-surface` / `--color-surface-secondary` / `--color-selection` / `--color-accent` / `--color-code-accent` / `--color-body` / `--color-heading` / `--color-muted` / `--color-text-dimmed` / `--color-border` / `--color-hover`。

**色值字面量：31 处 → 0**（剩下的 2 处 hex 只在注释里说明历史值；4 处 `rgba()` 是阴影与遮罩，沿用本文件既有写法，不进 palette）。

### 为什么覆盖规则要四层 `:is(*, #\#)`

Pagefind 自带 CSS 用 `:is(*, #\#):is(*, #\#):is(*, #\#)`（特异性 3,0,0）压过普通类选择器；而它的 `pagefind-component-ui.css` 是**首次交互时**由 `Search.astro` 的 `ensurePagefindCss()` 追加到 `<head>` 末尾的，**加载顺序也在我方之后**。只靠顺序不行、只叠三层也不够（3,1,0 对 3,1,0 平手，谁后加载谁赢），所以本文件对 pagefind 内部类名的覆盖统一用四层前缀（4,0,0 + 类）。

## 2. 源文件清单（3 个源文件 + 1 个测试，未越界）

```
src/styles/search-global.css    724 行（重写）
src/components/UI/Search.astro  340 行（头部三段 + 页脚键帽文案）
e2e/search.spec.ts              251 行（新增 5 条：1440 形态 / 390 形态 / axe ×2 / 证据截图）
```

`src/utils/search-template.js` **未改**（模板 DOM 够用，分组标题不需要它改）——
因此也没有第 4 个源文件。未触碰：`src/pages/**`、`src/layouts/**`、`base.css`、`components.css`、
`overlays.css`、`src/scripts/overlay.ts`、`package.json`、内容 schema、palette、`/redirect/`、404。

对照设计稿，**没照搬**的部分与原因：

- **范围筛选「[全部] [文章] [随笔]」**：要往 Pagefind 的键盘选择模型里插过滤（`↑↓` 会落到被隐藏的条目上），
  属于交互/行为改动，不在「只换壳 + 行为保持」的授权内，需要新卡。本卡不做假控件。
- **「PAGEFIND 1.3 · 85 索引」「耗时 4ms」**：编造数字。状态芯片只说真话——`Pagefind · 本地索引` + 绿点。
  结果条数仍由 Pagefind 自己的 `.pf-summary` 播报。
- **最近搜索 / 热门标签 / 触控快捷键 2×2**：需要新的数据源与 localStorage 行为，不在本卡。
- **`⌘J 新标签页` 键帽**：Pagefind 未绑定该快捷键，不写进提示（页脚只列真实可用的 ↑↓ / ↵ / Tab / Esc）。

## 3. 验收命令与实测

```bash
corepack pnpm run build:ci                       # ✓ 477 pages · 25911838 B（collapse 后）
M71A_SHOTS=1 corepack pnpm exec playwright test e2e/search.spec.ts --reporter=line
# → 13 passed (25.2s)
```

| 项 | 结果 |
| --- | --- |
| 既有 8 条行为用例（入口 / 打开 / Esc / 输入出结果 / 关闭态 0 请求 / 打开→关闭后 0 新请求 / ⌘K 热身） | **8 passed**，一行未改 |
| 1440 命令面板宽 | `dialog.pf-modal` = **680px**，`top = 108px`（12vh × 900），`border-radius = 12px` |
| 首条结果（最佳匹配） | `backgroundColor` 非透明（`--color-surface-secondary`）+ `box-shadow` 含 `inset`（左侧赤陶条） |
| 桌面关闭键 / 状态芯片 | 都可见（Pagefind 默认只在 ≤640 显示关闭键，本卡显式打开） |
| 390 窄版 | 弹层 **390×844**、`border-radius = 0px`、横向溢出 **0px**、状态芯片隐藏、关闭键可见 |
| 窄版摘要 | `-webkit-line-clamp = 2`；子结果摘要隐藏（目录式命中标题） |
| 首屏不预加载 / 首次交互才请求 / 关闭后 0 新请求 | 既有用例实测通过（`performance.getEntriesByType('resource')` 前后一致） |
| axe（弹层打开态，作用域 `.pf-modal`，wcag2a/aa + 21a/aa + 22aa） | **light 0 violations / dark 0 violations**（serious/critical = 0） |

证据截图（`docs/_reviews/M7-1a/screens/`，生产构建 + 真实 Pagefind 索引，查询词「服务器」= 54 条结果）：

- `search-desktop-light.png` / `search-desktop-dark.png`（1440×900）
- `search-mobile-light.png` / `search-mobile-dark.png`（390×844）

## 4. 对比度实测（不靠肉眼）

axe 的 `color-contrast` 对**伪元素覆盖**下的节点会返回 `incomplete`（"background color could not be determined
due to a pseudo element"）：命中的正是 `.custom-excerpt mark`（被 `.custom-tree-body::before` 的竖线覆盖）与
`.pf-input-clear`（被 `.pf-input-wrapper::after` 的焦点线覆盖）。这两处用脚本按真实计算色实测：

| 元素 | light | dark |
| --- | --- | --- |
| `.custom-excerpt mark` / `.custom-sub-excerpt mark` | **6.48:1**（`#8b3a36` on `#fde8e5`） | **8.08:1**（`#f0a8a2` on `#3d1815`） |
| `.pf-input-clear`（清除） | 6.34:1 | 6.18:1 |
| `.pf-summary`（结果条数） | 6.34:1 | 6.18:1 |
| 页脚键帽 / 品牌 | 8.14:1 / 6.34:1 | 7.96:1 / 6.18:1 |
| 索引状态芯片 | 5.61:1 | 5.48:1 |

> 高亮字最初直接取 `--color-accent`（`#c2413b` on `#fde8e5`）实测只有 **4.34:1**（14px 正文不达标），
> 已改为既有 token `--color-code-accent`（深赤陶），上表为改后的值。

## 5. 遗留（都不在 4 文件边界内，未越界改）

1. **页头触发器与相邻「菜单」胶囊有 5px 基线差**（`trigger.y=10` vs `menu.y=15`，两者高度都是 34）。
   触发器的圆角/尺寸其实由 `Header.astro` 的 scoped 规则
   `[data-astro-cid-…] pagefind-modal-trigger{--pf-border-radius:var(--shell-radius-md)}` 决定，
   本次只换配色、几何保持原样；这 5px 属共享外壳（M6-1）的历史问题，建议单开卡。
2. **范围筛选（桌面）**：见 §2，需要行为卡。
3. **`color-contrast` 的 2 类 `incomplete`**：伪元素覆盖导致 axe 无法自动判定，已用手工实测补证（§4）；
   若门禁要求 `incomplete = 0`，需要给 `.custom-tree-body::before` / 输入焦点线换实现方式（会牵动模板）。
4. **CJK 分词下的多段高亮**：`服务器` 会被拆成「服务 / 器」两段 mark（`Intl.Segmenter` 覆盖的既有行为），
   本卡按卡面要求**未动分词逻辑**，纯视觉上已用同一底色让两段连续可读。

## 6. 复现

```bash
corepack pnpm run build:ci
M71A_SHOTS=1 corepack pnpm exec playwright test e2e/search.spec.ts --reporter=line
```

不跑 `pages.visual` / 全量 `gates:all` / Linux 容器（按卡面：不在本卡）。
