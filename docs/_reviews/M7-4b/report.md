# M7-4b · 文章选区高亮 + 批注工具条

- 卡：`t_4b5e4e3e`（blog2 板）· assignee `blog-fe` · 2026-11-10
- 状态：**blocked（未收口）** —— 8/10 通过，取消高亮的两个交互用例失败。
- 源文件：`src/components/Article/AnnotationLayer.astro`、`src/scripts/annotation-layer.ts`、`src/layouts/MarkdownLayout.astro`（仅挂载）、`e2e/annotations-article.spec.ts`；WIP 提交 `3f3ce0c`。

## 已通过

- 关闭态工具条隐藏、0 个批注 JS 请求。
- 正文选区 → 工具条；「高亮」→ `<mark>`；文本与段落高度不变。
- 非正文/空选区/跨段不出工具条。
- 与金句卡工具条同屏不重叠。
- 390 移动端选中 → 工具条在视口内 → 高亮。
- axe light/dark 打开态 serious/critical 0（作用域已收窄到 `article.post`，排除站点头部既有 contrast 噪音）。

## 失败

```bash
pnpm exec playwright test e2e/annotations-article.spec.ts --reporter=line
# 8 passed / 2 failed
```

1. `再次选中高亮文字 → 按钮变「取消高亮」…`：工具条保持 `hidden`。
2. `点击已高亮的文字（不拖选）→ 工具条给出「取消高亮」`：工具条保持 `hidden`；部分运行里 `ACTION` 被判不可见。

已试过：声明 `holding`（原先未声明导致 tsc 报错）、`pointerdown`/`click` 对 mark 做 preventDefault、在 `apply()` 后重置 holding、测试补 `selectionchange` 与等待。仍未稳定；说明问题在 **选中已有 mark 后 `currentSelection()` 的返回/工具条显隐状态机**，不是纯测试时序。

## 未完成 / 边界

- 不完成本卡就不进入 M7-4c；M7-4c 仍 todo。
- 当前工作区有并发 M8 任务的未提交改动；本卡只提交 `annotations-article.spec.ts`、`annotation-layer.ts` 与本报告/截图，未碰 M8 文件。
- 证据截图：`docs/_reviews/M7-4b/screens/`（toolbar/highlight 1440 dark、390 light）。
- 下一步：在干净树单开一张小卡，只修「选中已有 mark → remove 模式」状态机；不要重做数据层或 HUD。
