# M7-4b · 文章选区高亮 + 批注工具条（收口）

- 卡：`t_4b5e4e3e`（blog2 板）· assignee `blog-fe`
- 基线：`14f89b7` + 本卡修复
- 结论：**完成**；`e2e/annotations-article.spec.ts` **10 passed / 0 failed**，type-check PASS，`gates:all` **8/8 PASS**。

## 根因（只读诊断 `t_fce3289c`）

`AnnotationLayer.astro` 内联 bootstrap 的 `selectionchange` 监听器每次都无条件调 `load()`。
模块已加载后，`initAnnotationLayer()` 再跑 `render()`，其 `unwrap()` 用
`mark.replaceWith(...)` 把承载当前选区的 `<mark>` 移出文档；选区不是被
`removeAllRanges()` 清掉的，而是节点脱离后自动塌缩（`collapsed=true`，
`toString()=''`），随后 rAF 的 `update()` 读到空选区 → `hide()`。

表现为工具条先出现、随后消失；旧 `dist` 与源码不一致时更不可复现，必须先
`astro build` 再测。

## 修复

1. `src/components/Article/AnnotationLayer.astro`
   - `selectionchange` 的首次懒加载加 `if (state.loaded) return`；模块加载后选区
     变化交给 `annotation-layer.ts` 自己处理，不再重复 `render()` 拆 mark。
2. `src/scripts/annotation-layer.ts`
   - `onViewportChange()` 不再无条件 `hide()`：选区仍有效时重新 `place()`，避免
     程序化滚动/移动端选中把工具条误收。
3. `e2e/annotations-article.spec.ts`
   - 390 移动端在程序化滚动稳定后再断言；若首轮 toolbar 被滚动收掉，重新落一次
     选区，避免跨用例负载造成的时序假红。

## 验证

```text
pnpm exec playwright test e2e/annotations-article.spec.ts
→ 10 passed (33.5s)

pnpm run type-check
→ tsc --noEmit (exit 0)

pnpm run gates:all
→ 8/8 PASS ✅
```

覆盖：关闭态 0 批注请求、正文选中 → 工具条 → mark、刷新后高亮保留、再次选中
mark → remove、点击已高亮文字 → remove、非正文/空选区/跨段不出工具条、与金句卡
工具条不重叠、390 移动端、axe light/dark serious 0。

## 证据

- 诊断原始事件时序与旧 `dist` 对照：`docs/_reviews/M7-4b/debug.md`
- 截图：`docs/_reviews/M7-4b/screens/`
- 诊断卡：`t_fce3289c`；修复卡：`t_4b5e4e3e`

## 边界

M8 并行改动未进入本卡，已隔离在本地分支 `m8-wip-20261110`（未推 main）。
