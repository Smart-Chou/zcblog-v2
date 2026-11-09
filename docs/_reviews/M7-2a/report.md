# M7-2a · 移动评论抽屉（桌面保持内联）

- 卡：`t_6a93bec0`（blog2 板）· assignee `blog-fe` · 2026-11-09
- 工作区：`/Users/chowcong/Documents/WebSiteCode/zcblog-v2`
- 结论：**完成** —— `e2e/pages-comments.spec.ts` 12 passed（生产构建 + 真实 Waline API）；axe 打开态（作用域 `#comment-wrapper`）light/dark serious/critical = 0；桌面 1440 内联评论区几何与改动前逐值一致。
- 选型依据：`selection.md` §4.23 —— 桌面 `marx_s_blog_toc` 的页内评论区（无抽屉）、移动 `waline_comments_drawer`（706×1600 移动稿）。

## 1. 做了什么

一套 DOM、两个断点。抽屉外壳只在 ≤640 变成贴底 sheet；≥641 外壳整体 `display: contents`（零盒子），评论仍是正文流里的内联块 —— 桌面没有新增任何 wrapper、遮罩或 JS 分支。

| 断点 | 形态 | 结构 |
| --- | --- | --- |
| ≥641（含 1440） | 内联评论区（原样） | 外壳 `display: contents`；工具条/遮罩 `display: none`；`#waline-toggle` → `#waline` 的懒加载、`onPageReady` 重置、`destroy` 生命周期一行未改 |
| ≤640（390） | 贴底抽屉 | 88dvh sheet、顶部圆角 16、抓手条 + 「评论 / Waline · 按需加载」工具条 + 40px 圆形关闭键；正文在 `.comment-drawer__body` 内滚动；遮罩铺满视口 |

保留的行为（逐条实测，见 §3）：

- 关闭态不请求 Waline JS/CSS（`#waline` 子节点 0、`waline.*.js|css` 资源条目 0）；
- 点击才加载；关闭只隐藏、**不销毁实例**，因此关闭后 0 新请求（重新打开不再拉一次）；
- `#waline-toggle` 在关闭态可点、可再次打开，`aria-expanded` 同步；
- `onPageReady` 复位抽屉 + 内联两种形态；`astro:before-swap` / `beforeunload` 仍 `destroy()`。

### 交互细节

- 打开：记录 `window.scrollY` → `html.comment-drawer-open`（`overflow: hidden`）→ 焦点落在关闭键 → 抽屉 `role="dialog" aria-modal="true" aria-labelledby="waline-drawer-title"`（**只在小屏打开时才挂**，桌面不挂）。
- 关闭：Esc / 关闭键 / 点遮罩 → 解除滚动锁 → `window.scrollTo(0, savedY)` → 焦点回填 `#waline-toggle`。
- 焦点陷阱：Tab / Shift+Tab 在抽屉内循环。
- 视口跨过 640：自动关闭抽屉，桌面不残留 fixed 遮罩。
- 动效：`translateY(100%) → 0`（`@starting-style` 起帧），`prefers-reduced-motion` 下关闭过渡。

## 2. 源文件清单（3 个源文件，未越界）

```
src/components/UI/WalineComment.astro   抽屉 DOM + 开合逻辑（+ 移动端 Waline 皮肤/DOM 修补）
src/styles/comments.css                 新文件（~275 行）：外壳零占位基线 + ≤640 抽屉 + 移动端 Waline token
src/scripts/comment-drawer.ts           新文件：移动抽屉交互的按需模块（开合/焦点/滚动锁）
e2e/pages-comments.spec.ts              新文件（~420 行）：12 条用例 + 截图门控
```

`comment-drawer.ts` 是 operator 收口时补的第 4 个源文件：抽屉交互从主组件拆成动态 import，只在移动端首次点击时下载。否则 WalineComment 的页内 JS 会把 donate/friends/talks 的 page JS 推到 **30.4 KB**（门禁 30 KB），perf 6 页超预算。

未触碰：`MarkdownLayout.astro`、`FriendsContent/TalksContent/DonateContent`、`overlays.css`、`article.css`、`package.json`、Waline server/config、内容 schema、tokens、视觉基线。

### 为什么用 `display: contents` 而不是 `display: none`（桌面）

桌面要求「评论仍是正文流内联，不改」。新外壳（drawer → sheet → body → bar/scrim）必须占 0 盒子：`display: contents` 让三层 wrapper 不生成盒子、子节点直接参与 `#comment-wrapper` 的流；工具条与遮罩 `display: none`。实测 `#comment-wrapper` 与 `#waline-toggle` 的 rect 与改动前完全一致（`y=12917.69 / w=355 / h=46.80`）。

### 两处「不照搬设计稿」

- **评论数徽章（稿里写死 18）**：编造数字，不做。工具条只写真实状态「Waline · 按需加载」。
- **筛选项（全部 / 只看作者 / 技术讨论）**：Waline 没有这个数据维度，属于行为改动，不在本卡（只做外壳）。

## 3. 验收命令与实测

```bash
corepack pnpm run build:ci                       # ✓ 477 pages · 26,002,495 B（collapse 后）
M72A_SHOTS=1 corepack pnpm exec playwright test e2e/pages-comments.spec.ts --reporter=line
# → 12 passed (28.2s)
```

| 项 | 结果 |
| --- | --- |
| 390 关闭态 | `#waline` 子节点 **0**；Waline 运行时资源条目 **0**（`performance.getEntriesByType('resource')`，排除常驻的 `waline-pageview`）；抽屉 `visibility: hidden`、无 `role` |
| 390 打开态几何 | sheet **390 × 742.72**（88dvh）、`top = 101.28`、`left = 0`、上圆角 **16px** / 下 **0px**；遮罩 **390×844**、`opacity 1`、非透明 |
| 滚动锁 | `html` 有 `comment-drawer-open`、`overflow: hidden`；滚轮打在遮罩上 `scrollY` **不变** |
| 抽屉内滚动 | `.comment-drawer__body` `overflow-y: auto`；注入 1200px 探针后 `scrollTop 320` 生效，`window.scrollY` 不变 |
| 关闭恢复 | 打开前 `scrollY` → 关闭后差值 **≤ 2px**；焦点回 `#waline-toggle`；文案回「展开评论」；可再次点开 |
| 关闭后请求 | 打开阶段 N 条 Waline 流量，关闭后 1.5s 内 **仍为 N**（0 新请求） |
| 横向溢出（390 开/关） | `scrollWidth - clientWidth` **≤ 1px**（实测 0） |
| 1440 关闭态 | drawer/sheet `display: contents`、`position: static`；bar/scrim `display: none`；`#comment-wrapper` 内 fixed 元素 **0**；Waline 资源 **0** |
| 1440 打开态 | `#waline` `display: block`、宽 **706.66**（= 正文栏）；无 `role=dialog`、未锁滚动、fixed 元素 **0** |
| axe（390 打开，light / dark） | **0 violations（serious/critical = 0）**，作用域 `#comment-wrapper`，wcag2a/aa + 21a/aa + 22aa |

证据截图（生产构建 + 真实 Waline API；`docs/_reviews/M7-2a/screens/`）：

- `m72a-390-open-light.png` / `m72a-390-open-dark.png`
- `m72a-390-closed-light.png` / `m72a-390-closed-dark.png`
- `m72a-1440-closed-light.png`

## 4. Waline 皮肤：为什么在抽屉里换色（以及为什么桌面不换）

Waline 3.16 默认皮在深色/浅色下都有 9 个 serious 节点（全部来自它自己的皮肤，不是抽屉外壳）：

| 规则 | 命中 | 实测 |
| --- | --- | --- |
| `color-contrast` ×8 | `#999` 字数/排序/Powered by、`#27ae60` 提交键与「按正序」 | **2.71–2.87:1** |
| `aria-prohibited-attr` ×1 | `label[for=wl-image-upload][aria-label]`（无 role） | 上传入口本身是死按钮（`imageUploader` 直接 reject） |

处理（都只在移动抽屉内，`#comment-wrapper #waline [data-waline]` 覆盖变量）：

- 皮肤变量改站内 token：`--waline-theme-color: --color-accent`、`--waline-info-color/light-grey: --color-muted`、`--waline-bg-color: --color-bg-surface` 等，值全部走 token，`[data-theme="dark"]` 自动翻转。实测对比度：muted on surface **6.34:1**（light）/ **6.18:1**（dark）；accent on surface **4.99:1** / **5.32:1**；白字 on accent **5.11:1**。
- 死上传入口：移动端初始化后用 MutationObserver 摘掉 `label[for="wl-image-upload"]`（死按钮 + 该 aria 违规同时消失）；桌面保持原样。

**桌面（1440）不改这层皮肤** —— 卡面要求桌面评论维持内联现状，所以桌面仍带 Waline 原有 9 个 serious 节点。这是既有债务（本卡之前就存在），**留 M7-2b（Waline 换皮）统一处理**。因此 spec 里 1440 只验形态与懒加载，不跑 axe；axe 门禁只针对本次新做的移动抽屉。

## 5. 遗留（不在本卡边界内）

1. **桌面 Waline 皮肤 a11y 债务**：见 §4，9 个 serious 节点（8 对比度 + 1 aria），需 M7-2b 换皮卡在桌面一并收口；届时 `#comment-wrapper #waline [data-waline]` 的覆盖块可以从 ≤640 提到两断点。
2. **Waline 反应行在 390 太挤**：6 列表情在 350px 内容宽下标签折两行（`牛逼哄 / 哄`）。属 Waline 内部布局，本卡只给抽屉加内边距；若要做「横向滚动反应条」需要新卡。
3. **关闭动效在无 `@starting-style` 的浏览器**：退化为直接出现/消失（Chrome 117+ / Safari 17.4+ 有动效）。
4. **抽屉内焦点陷阱是轻量版**：只做首尾循环，不做「背景 inert」。`aria-modal="true"` 已声明，但读屏软件对背景的隔离依赖其对 aria-modal 的支持。

## 6. 复现

```bash
corepack pnpm run build:ci
M72A_SHOTS=1 corepack pnpm exec playwright test e2e/pages-comments.spec.ts --reporter=line
```

worker 未跑全量 `pages.visual` / `gates:all` / Linux 容器（按卡面）；operator 收口时已补跑 `gates:all` 8/8、`gates:surfaces` PASS、`type-check` PASS、`build:ci` 477 页、`perf-budget` over=0、本机 `pages.visual` 42 passed。

> 构建说明（D-0150）：迭代用 `astro dev`；收口共 `build:ci` 四次 —— 首版通过后查出关闭键圆角被 `.post button:focus-visible`（pages/article.css，(0,2,1)）压成 4px，修 CSS 后第二次构建；prettier 后第三次确认 dist=源；operator 为 perf 把抽屉交互拆成动态模块后第四次重建。除这四次外没有再构建。最终 perf：`over=0`，page JS max **30.0 KB**（门禁 30）；本地 `pages.visual` 42 passed。
