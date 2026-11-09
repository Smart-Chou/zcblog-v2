# M7-3d-1 · 金句卡 Canvas 渲染器 + 内部演示页

- 卡：`t_f9482c49`（blog2 板）· assignee `blog-fe` · 2026-11-09
- 工作区：`/Users/chowcong/Documents/WebSiteCode/zcblog-v2`
- 结论：**完成** —— 浏览器本地 Canvas 1080×1440（3:4）金句卡渲染器，加 `/design/components/quote-card/` 内部演示页；不接文章选中，不新增公开页面。
- 源文件：3 个 —— `src/scripts/quote-card.ts`、`src/pages/design/components/quote-card.astro`、`e2e/quote-card.spec.ts`（WIP `1e7bcc3`，1324 行；超出 D-0149 300 行上限，按单渲染器实现接受）。

## 1. 实现

- `renderQuoteCard(canvas, input)`：1080×1440、1:1 像素，读 CSS token 取色，light/dark 同源。
- 输入 `quote / title / author`，可选 `kicker / site`；不加载第三方库、不加载新字体、不发网络请求。
- 排版：`Intl.Segmenter("zh", {granularity:"word"})` 按词断行，避免把「文案」拆成两行；不可用时回退逐字切分。带行首/行尾禁则、字号 60→36 先缩后截断、`truncated/overflow/maxLineWidth` metrics。
- 输出：`canvas.toBlob("image/png")` → object URL → `<a download>`，文件名含 `quote`。
- 演示页：固定 fixture、生成/下载按钮、状态行；`noindex`，不套站点 shell。
- 本卡不接文章选中工具条/抽屉/正文，后续 M7-3d-2 再接。

## 2. 验证

```bash
pnpm exec playwright test e2e/quote-card.spec.ts --reporter=line
# 7 passed / 4 skipped
```

- 1440/390 生成态：canvas **1080×1440**、3:4、引文不出右边界、不裁字。
- 下载：`href` 是 blob、文件名含 `quote`、落地是真 PNG。
- 390 页面无横向滚动；axe light/dark **serious/critical 0**。
- `build:ci` **478 页**；`gates:all` **8/8 PASS**、`gates:surfaces` PASS、`type-check` PASS、`perf-budget` **over=0**（page JS p95 30.9/40；page max 30.0/30）。
- 证据：`docs/_reviews/M7-3d-1/screens/{page,card}-{light,dark}-*.png`。

## 3. Operator 复核

- Worker run #147 在 **1852s** 超 1800s 硬上限，run #148 已 reclaim + block；WIP `1e7bcc3` 保留，operator 接手收口。
- 门禁 P3 把演示页提示文案里的 `36px` 判成白名单外尺寸；改为「36 像素」后 8/8 通过（无视觉改动）。
- 视觉复核：light 版此前把「文案」拆成两行；已加 `Intl.Segmenter` 词边界断行，复跑 7/7，截图重生成。
- `pages.visual` 42 passed 不受影响（未改文章页/全局 shell）；`dist` 新增演示页，属内部路由。

## 4. 未做 / 边界

1. 不接文章正文选中、不做工具条/抽屉（M7-3d-2）。
2. 不引入第三方 Canvas/排版库；字体只用站点已有字体栈。
3. 金句卡留白偏编辑风、上半部内容较密；版式精修留到接入文章后的真实长度样本再调，不在本卡扩大范围。
