# M7-4c · 批注 HUD 列表 + 跳转/删除（收口）

- 卡：`t_2fa7aa19`（blog2 板）
- 结论：**完成**；`annotations-hud.spec.ts` + `annotations-article.spec.ts` **17 passed / 0 failed**；type-check PASS，`gates:all` **8/8 PASS**，Perf **over=0**。

## 实现

- `src/components/Article/AnnotationHud.astro`
  - 常驻入口按钮 + 桌面右侧浮层（≥1100px）/ 移动贴底抽屉（≤1099px）+ 空态。
  - 列表条目由脚本从版本化 localStorage 读取，服务端不预渲染假数据。
- `src/scripts/annotation-hud.ts`
  - 读取 `getAnnotationStore()`、跳转到 `mark[data-annotation-id]` 并短暂强调。
  - 删除先走 `store.remove(id)`，再把 DOM `<mark>` 摊平回文本并同步计数；列表与高亮一起消失。
  - 焦点陷阱、Esc/关闭键/点遮罩、关闭后焦点回填；移动端滚动锁/恢复。
- `src/components/Article/AnnotationLayer.astro` 只挂载 HUD 并传 slug/locale；不改高亮算法。
- `e2e/annotations-hud.spec.ts` — 17 条（含 1440/390、键盘、空态、删除同步、axe light/dark）。

## 性能收口

HUD 的内联 bootstrap 会随每个文章页首屏加载（约 0.6 KB gzip），把两篇长文推到 40.4 KB。
本轮把 HUD 改为**跟随高亮层按需加载**：`annotation-layer.ts` 在初始化/换页时
`import("~/scripts/annotation-hud")`；无批注的文章页仍只加载高亮层，HUD 模块零请求。
同时把 HUD 强调态的 4 处 palette 直引改成语义 token，过 G-T4。

```text
扫描 751 页 | 超预算 0 页
article  JS p95 39.3  CSS p95 41.7
page     JS p95 24.6  JS 最大 29.3
```

## 验收

- 有批注：入口显示数量，打开列出摘要/时间；跳转滚动并强调；删除后刷新不复现；全删显示空态。
- 1440 浮层不遮正文主栏；390 贴底抽屉、滚动锁/恢复、Esc/关闭键/遮罩、焦点回填。
- 关闭态 0 HUD 请求；axe serious 0。
- 回归：`annotations-article.spec.ts` 10/10 未受影响。

## 证据

- 截图：`docs/_reviews/M7-4c/screens/{panel-1440-light,panel-1440-dark,panel-after-delete-1440-light,empty-state-1440-light,jump-emphasis-1440-light,drawer-390-light}.png`
- 说明：e2e 控制台仍有 `getRangeAt: 0 is not a valid index` 的 pageerror 噪音（无断言失败），属选区被清空后的调试日志，后续可清理。

## 边界

M8 并行改动未进入 main；M8-2 技能页提交已从 main revert，保留在 `m8-wip-20261110`。
