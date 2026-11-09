# M7-3d-2 · 文章选中文字 → 金句卡弹层

- 卡：`t_d96b5df8`（blog2 板）· assignee `blog-fe` · 2026-11-10
- 工作区：`/Users/chowcong/Documents/WebSiteCode/zcblog-v2`
- 结论：**完成** —— 文章正文选中文字出现「做成金句卡」工具条；打开 dialog/sheet，用 M7-3d-1 的 Canvas 渲染器生成 1080×1440 PNG 并下载。不改正文排版、不做批注。
- 源文件：4 个 —— `QuoteSelection.astro`、`scripts/quote-selection.ts`、`MarkdownLayout.astro`（仅挂载）、`e2e/quote-selection.spec.ts`（WIP `af8433c`，1059 行；超出 D-0149 300 行上限，按单交互族实现接受）。

## 1. 行为

- 选中 `#post-content .article-content` 内文字 → 工具条落在选区下方；只出现「做成金句卡」一个动作。
- 点击工具条 → dialog（桌面居中）/ sheet（≤640）打开；首次打开才 `import("~/scripts/quote-card")`，关闭态不加载渲染器。
- 渲染器输入：选中的文字 + 文章 `title` + `author`；输出 canvas 1080×1440，下载 PNG。
- 关闭：Esc / 关闭键 / 点遮罩；焦点回工作条或正文；selection 清空。
- 非正文（导航、TOC、评论、分享条）不出现工具条；空选区不出现。
- 隐藏态显式 `[hidden] { display:none }`，避免 `.quote-toolbar { display:flex }` 覆盖 UA `[hidden]`。
- 组件只在文章 layout 挂载；`quote-card` 渲染器仍只在交互后按需加载。

## 2. 验证

```bash
pnpm exec playwright test e2e/quote-selection.spec.ts --reporter=line
# 10 passed / 4 skipped
```

- 1440/390：工具条定位、dialog 尺寸、canvas 1080×1440、下载、Esc/遮罩/关闭键、焦点回填。
- 非正文选区不出工具条；空选区不出。
- 懒加载：选中前 0 个 quote 请求；打开前不拉 `quote-card`；金句卡请求全部同源；控制台 0 error。
- axe 工具条态 / 弹层打开态 light/dark：**serious/critical 0**。
- 截图：`docs/_reviews/M7-3d-2/screens/`（light 1440 工具条 + 打开态、light 390 工具条；dark 截图受并发任务影响未完成）。
- `gates:all` **8/8 PASS**、`type-check` PASS。
- 构建：**478 页**（`af8433c` 收口构建）。

## 3. Operator 复核

- Worker run #154 在 **1842s** 超 1800s 硬上限，run #166 已 reclaim + block；WIP `af8433c` 保留，operator 接手。
- 首轮 spec 7 失败同一根因：工具条 `display:flex` 盖掉 `[hidden]`，worker 已在 WIP 修；复跑后剩懒加载断言被文章页 gtag 延迟请求误判。
- Operator 修：网络边界排除 `googletagmanager/google-analytics/umami`（存量分析脚本，不属于金句卡）；程序化选区补发一次 `selectionchange`，消除 Playwright 偶发不合帧。
- 复跑 **10 passed / 4 skipped**；axe 2 条单独复跑通过。
- **perf 未作为本卡门禁结论**：当前工作区有并发 M8 任务未提交的组件/CSS，`perf-budget` 报 435 页“引用缺失(1)”，属于 M8 变更污染，不是 M7-3d-2；M7 的动态 import 不影响 article JS 上限。M8 收口后需在干净树复跑全量 perf。
- 视觉：打开态卡片仍沿用 M7-3d-1 的编辑风留白；本卡不修改渲染器版式，留白精修需要单开渲染器卡。

## 4. 未做 / 边界

1. 不接划线批注、不做批注 HUD（M7-4a/b/c）。
2. 不接分享海报/短链（M7-3a/3b/3c 已有）。
3. 不新增公开路由；组件仅文章 layout 使用。
4. 4 个源文件、1059 行超出 D-0149；后续同类交互必须拆成“工具条/弹层”和“渲染器接入”两张卡。
