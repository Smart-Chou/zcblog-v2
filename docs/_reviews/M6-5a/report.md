# M6-5a · 404 单页视觉（404_1 / 404_2 二选一）

- 卡：`t_d52eafc8` · assignee `blog-fe` · 2026-11-09
- 工作区：`/Users/chowcong/Documents/WebSiteCode/zcblog-v2`
- 结论：**通过**（本卡 spec 12 passed；axe serious/critical = 0；无横向溢出）

## 1. 选型理由（为什么不是「二选一」）

卡面要求按 `selection.md` §4.16 在 `404_1`（终端叙事，现有实现）与 `404_2`（主稿）之间二选一。
`selection.md` 的实测结论是**二选一不成立**：

> 实测**不成立** —— 两张是同一叙事的两断点：都用「信标/信号失联 + 仿真终端 + 航线推荐」，
> 桌面多「恢复信标 3 卡 + 热门电波 3 卡 + 断链上报」，移动多「上一个正常节点」。→ **都保留**，
> 按断点分流，不做二选一，也不维护两套叙事。

因此本卡按该结论落地：**一套叙事、一套 DOM、两个形态**（不维护两份实现）：

| 断点 | 形态 | 与设计稿的对应 |
| --- | --- | --- |
| ≥1025 | 大 404 编号（两枚 `4` 赤陶 / `0` 墨黑）+ 坐标芯片 + 终端诊断卡 + 3 列航标卡 + 断链上报 | `marx_s_blog_404_2` 桌面 |
| ≤640 | 404 化为标题背后的半透明水印、按钮满宽、航标卡单列 | `marx_s_blog_404_1` 移动 |

不做（沿用 §4.16「不做」项）：终端里的「可注入指令」（`cat random_quote.txt` / `roll d20`）只做视觉示意，
不接真命令 —— 404 页不为几行假命令加载 JS 模块。终端底部改为诚实文案
「等待指令 · 静态构建，以上为构建期快照」，而不是看起来能点的假命令胶囊。

三个必须保留的恢复路径都保留：**返回首页**（primary）、**检索入口**（页头 pagefind 触发器 + 页内
`⌘K`/`Ctrl K` 提示）、**最近 3 篇航标**（`getAllArticles` 取最新 3 篇，零新增数据源）。

设计稿里没有照搬的部分，及原因：

- **假 GPS 坐标**（`LAT: 22.5428" N … Shenzhen Bay`）：不编造数据，改成真实的运行态芯片
  「边缘节点 · 静态路由未命中 · TTL 0 已过期」。
- **「盲盒换一篇」**：需要构建期随机或运行时随机，前者会破坏视觉基线的确定性，后者要加 JS。
  改为 3 张确定的最近航标卡。
- **「返回上一个正常节点」**（`history.back()`）：纯 JS 行为，静态零运行时站点不做；
  同一意图由 `浏览归档` 承接。
- **断链上报**：保留，指向真实仓库 `https://github.com/Smart-Chou/zcblog/issues/new`。

## 2. 源文件清单（3 个源文件，未越界）

```
src/pages/404.astro          230 行  （重写）
src/styles/pages/404.css     662 行  （重写）
e2e/pages-404.spec.ts        191 行  （新建）
```

未改：`src/pages/redirect.astro`、`src/styles/redirect.css`、`src/styles/components.css`、
`src/styles/base.css`、内容 schema、palette（`tokens.css`）、依赖（`package.json` 无 diff）。

`404.css` 合规：0 hex / rgb() / hsl()，只消费语义 token；px 字面量仅 `1px` / `2px` 与断点；
全部规则收在 `.not-found` 作用域内。

## 3. 验收命令与实测

```bash
pnpm run build:ci
# ✓ 477 页构建完成；[collapse-html] 751 页 · 0 有改动 · 25,743,186 B
# dist/404.html = 43,387 B；页面内 <img> 2 个（都在外壳 header/footer，正文 0 位图）

NF404_SHOTS=1 pnpm exec playwright test e2e/pages-404.spec.ts --reporter=line
# 12 passed (14.5s)
```

逐项实测：

| 判据 | 结果 |
| --- | --- |
| `/404/` 200 | ✅ |
| 恰好 1 个 `<h1>`、标题层级不跳级 | ✅（h1 → h2） |
| 1440 横向溢出 | 0px（light / dark） |
| 1024 横向溢出 | 0px（light / dark） |
| 390 横向溢出 | 0px（light / dark） |
| axe（wcag2a/aa + wcag21a/aa + wcag22aa，作用域 `.not-found`） | 0 violations（light 与 dark 均 0） |
| 零 JS 可读 | ✅ 终端 `HTTP/2 404`、3 个航标、`/` 与 `/archives/` 按钮、`⌘K` 提示、页头 pagefind trigger 全在 |
| 零位图（正文） | ✅ `.not-found img` = 0 |
| `prefers-reduced-motion` | 运行中动画 0（光标呼吸只在 `no-preference` 下存在） |
| 断点分形态 | 1440 航标 3 列 / 390 单列；390 `.nf-code` `position: absolute`（水印） |

## 4. 截图（`docs/_reviews/M6-5a/screens/`）

`NF404_SHOTS=1` 生成，1440 / 1024 / 390 × light / dark 共 6 张，均为 fullPage + `animations:"disabled"`：

| 文件 | 尺寸 |
| --- | --- |
| `404-light-1440.png` | 184K |
| `404-light-1024.png` | 180K |
| `404-light-390.png` | 152K |
| `404-dark-1440.png` | 184K |
| `404-dark-1024.png` | 180K |
| `404-dark-390.png` | 152K |

## 5. 调试中踩到的一条硬坑（已固化进 spec）

主题切换必须先把 `transition` 关掉再取色：站点给 `color` / `background-color` 配了
`--duration-fast` 过渡，`setAttribute("data-theme")` 之后立刻跑 axe 会取到「前景已切到 dark、
底色还停在 light」的半截状态，报出 `#ffffff` 底 + `#c8c3b8` 前景这类**真实页面不存在**的组合
（实测 4 条 serious）。`open404()` 里先注入 `*{transition:none!important}` 再切主题，
axe 才稳定为 0。同样原因，孤立跑单个 axe 测试会假绿、整套一起跑会假红 —— 现已消除。

## 6. 遗留（明确移交，不在本卡修）

1. **外壳浅色对比度 4.4:1（M6-1 共享文件）**：`document` 级 axe 会在 `.pf-trigger-text`（搜索占位
   `搜索文章…`）与 `.nav-menu-btn-label`（`菜单`）上报 `color-contrast` serious：`--color-fg-muted`
   (#866b66) 在 `--color-bg-canvas` (#f7f3ec) 上只有 4.4:1。属 `src/styles/components.css` /
   `Header.astro` 的边界，本卡 3 文件改不了；spec 因此按既有页面级口径把 axe 作用域收到
   `.not-found`（与 M6-4 的「页面主体 serious=0」一致）。建议在 M6-6 外壳收口时统一处理。
2. **页内搜索入口是「提示」不是按钮**：`pagefind-modal-trigger` 全站单实例（`Search.astro` 的
   swup 重挂逻辑用 `document.querySelector("pagefind-modal-trigger")` 定位并替换第一个），
   404 页再挂一个实例会在换页后与 header 抢引用。所以页内用「站内检索在页头 · ⌘K / Ctrl K」提示
   指向 header 的真实触发器。若 PO 要页内按钮，需要先给 shell 加多实例支持（改共享组件），
   属另一张卡。
3. **暗色主题下终端卡是浅色**：终端用 `--color-bg-inverse`，暗色下按语义反相为米白底深字
   （对比度 ~16:1）。这是全站 inverse 语义的既定行为，不是失误；若要「永远深色终端」，
   需要 palette 层给一个恒暗 surface token（改 tokens 包，超出边界）。
4. **视觉基线未入库**：`e2e/__screenshots__/pages{,-linux}/` 的双平台基线由 operator/CI 批量跑
   （卡面 §预算与停点），本卡只出了 6 张证据截图。`404` 已包含在 `pages.visual.spec.ts` 的
   页面集合里，基线刷新时要一并重录。
5. **预算**：本卡实际耗时约 28 分钟（25 分钟预算，超出 ~3 分钟），迭代 20 次左右（上限 60）。
   超时原因：三次 `build:ci`（CSS 每改一次都要重新 build 才能进 `dist` 预览）+ axe 主题过渡坑定位。
   未到 85% 停点，故未走 block 交接。

## 7. 提交

```
11d5f48 feat(m6-5a): 404 单页按 Stitch v2 重做（404_2 桌面 / 404_1 移动，一套叙事两断点）
+ 后续 docs(m6-5a): 报告与截图（本文件）
```

`git status` 仅含本卡文件：`src/pages/404.astro`、`src/styles/pages/404.css`、
`e2e/pages-404.spec.ts`、`docs/_reviews/M6-5a/`。未 push。
