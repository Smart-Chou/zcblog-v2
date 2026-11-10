# M7-5a · 全站快捷键速查 dialog（收口）

- 卡：`t_970315b0`（blog2 板）
- 结论：**完成**；`shortcuts.spec.ts` **11 passed / 0 failed**；type-check PASS，`gates:all` **8/8 PASS**，Perf **over=0**。

## 实现

- `src/components/Layout/ShortcutHelp.astro`
  - 全站常驻 `?` / `Ctrl-Cmd + /` 触发；普通输入框/可编辑区不抢键。
  - 原生 `<dialog>`：桌面居中面板、≤640 贴底全宽 sheet；Esc / 关闭键 / 点遮罩关闭。
  - 关闭后焦点回填；`?` 与 `Ctrl+/` 不会同时开两块面板。
- `src/scripts/shortcuts.ts`
  - 首次命中才 `import()`；复用 overlay 基座的 passive 模式、`ovl:close`、焦点回填。
  - `openShortcutHelp(event)` 在动态 chunk 内做可编辑区判断，bootstrap 只留键位筛。
- `src/layouts/BaseLayout.astro` 挂载组件；关闭态 `display:none`，零布局零请求。

## 性能收口

Shortcut bootstrap 会随全站首屏进入 JS 预算。除压缩到单监听外，另把
`BackToTop` 从首屏改为首次滚动/指针交互时按需加载（`src/scripts/back-to-top.ts`）。
最终：

```text
扫描 751 页 | 超预算 0 页
article  JS p95 39.6  CSS p95 41.9
page     JS p95 24.9  JS 最大 29.3
```

## 验收

- 1440 / 390 打开态：dialog 语义、焦点入内、贴底/居中、Esc/关闭键/遮罩关闭、焦点回填。
- 关闭态：0 请求、无布局偏移。
- axe light/dark serious 0、incomplete 0；reduced-motion 下 0 运行中动画。
- 回归：`annotations-article` / `annotations-hud` 既有 spec 通过。

## 证据

- 截图：`docs/_reviews/M7-5a/screens/{shortcuts-1440-light,shortcuts-1440-dark,shortcuts-390-light,shortcuts-closed-1440}.png`
- 说明：本卡收口时 worker 超时，由 operator 恢复被临时移除的 BaseLayout 挂载点并补性能收口。

## 边界

M8 并行改动仍隔离在 `m8-wip-20261110`；M8-2 技能页提交已从 main revert。
