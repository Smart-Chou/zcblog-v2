# M7-4a · 批注数据层 + 高亮渲染基础（不接文章）

- 卡片：`t_35bc5f20`（板 `blog2`，assignee `blog-fe`）
- 来源：`selection.md` 批注/划线；M6-3 文章页版式；D-0149
- 状态：**交付完成**（本卡只做「数据层 + 渲染基础」，不碰文章页选中工具条）
- 时间：2026-11-10 00:33–00:55（含一次全站重建 4m10s）

## 1. 交付物（源文件 4 个，严格落在边界内）

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `src/scripts/annotations.ts` | 新 | 版本化 localStorage schema、add/remove/list/clear、文本偏移与重定位、去重/上限；**不依赖 DOM** |
| `src/styles/pages/annotations.css` | 新 | 只定义 `mark.annotation-mark` 的 light/dark 渲染态，不改全局布局 |
| `src/pages/design/components/annotations.astro` | 新 | 内部演示页 `/design/components/annotations/`（noindex，固定 fixture + 添加/清除按钮） |
| `e2e/annotations.spec.ts` | 新 | 数据层 6 例 + 演示页 12 例（含 axe / 断点 / 网络 / 截图） |

未改动：`MarkdownLayout.astro`、文章页、`article.css`、`quote-selection*`、`quote-card*`、Waline、`package.json`、内容 schema、`docs/DESIGN*`。未新增依赖。

## 2. 数据层契约（M7-4b 直接消费）

```ts
const store = getAnnotationStore();                 // 单例，页面级
store.add({ docId, blockIndex, start, end, quote, text });  // → { ok, record?, duplicate?, reason? }
store.list(docId);  // 按 blockIndex → start 稳定排序
store.remove(id); store.clear(docId);
```

- **key**：`zcblog:annotations:v1`（= `zcblog:annotations:v${ANNOTATIONS_SCHEMA_VERSION}`），值是信封
  `{ schema: "zcblog.annotations", version: 1, updatedAt, records[] }`。
- **偏移口径**：`docId + blockIndex + [start, end)`，单位 UTF-16 code unit，与 `Selection` /
  `String.slice` 完全一致 —— 选区拿到的偏移可以原样存、原样切回原文，中间不做换算。
- **重定位**：`resolveSpan(text, record)` 先认偏移（`exact`），偏移失效时只接受「引文在段落内
  **唯一命中**」（`relocated`）；命中多处或零处返回 `null`，渲染层跳过这一条 —— 宁可少画一条，
  也不把高亮画到别的句子上。
- **不写脏数据**（e2e 逐条断言）：`blank`（纯空白选区）、`invalid-span`（零长度/起止颠倒/非整数）、
  `overflow`（越过段落末尾）、`quote-mismatch`（引文与原文对不上）、`overlap`（同段与已有批注相交，
  端点相接不算）、`limit`（每篇 200 条上限）、`invalid-target`（缺 docId/段号）。
- **去重**：`id = docId#blockIndex:start-end` 是确定的，重复写入返回 `{ ok: true, duplicate: true }`，
  不新增记录。
- **自愈**：非 JSON / `version` 不是 1 / 不是信封（比如别处写进来的裸数组）→ **清 key** 当空库；
  信封里混着坏记录 → 过滤后写回；无版本旧 key（`zcblog:annotations`、`zcblog:annotations:v0`）
  在第一次读盘时清掉。全程 try/catch：localStorage 不可用（无痕、配额）退化到进程内内存，API 不变。

## 3. 渲染基础

`mark.annotation-mark` 三条硬约束（都有机器判据）：

1. **零布局偏移**：只改 `background-color` / `border-radius` / `box-shadow(inset)`，
   `padding`、`margin` 断言恒为 `0px`；e2e 比对加高亮前后段落 `getBoundingClientRect().height` 完全相等。
2. **跨行不断**：`box-decoration-break: clone`，390px 下第 2 段那句正好跨行，截图可见两段都有完整圆角底色。
3. **light/dark 可见**：底色由 `color-mix` 从 `--palette-accent-500/400` 混出，跟随 `[data-theme]`；
   深色下提高到 30% 浓度，另加 1px 强调色下划线做「非颜色」冗余。e2e 断言两个主题的 computed
   `background-color` 不同且都不透明。打印态退化为虚线下划线。

## 4. 验证（本机实跑，非推断）

| 项 | 结果 |
| --- | --- |
| `astro build`（全站） | **PASS** · 479 页 · 4m10s · 退出码 0 |
| `playwright test e2e/annotations.spec.ts` | **18 passed / 0 failed**（18.8s） |
| axe serious/critical（空态 + 高亮态 × light/dark） | **0 / 0 / 0 / 0**（total violations 也是 0） |
| `tsc --noEmit` | **PASS** |
| `gates/check-tokens.mjs` | **11/11 PASS** |
| `gates/verify-component-inventory.mjs` | **PASS**（atoms=12 ui=23 page-organisms=11 layout=1 total=47） |
| 网络请求 | 演示页加载 + 加高亮 + 刷新共 0 个第三方/字体/图片/接口请求（spec 内断言，非人工目测） |
| 横向溢出 | 1440 / 390 均 `scrollWidth ≤ clientWidth + 1` |

证据截图：`docs/_reviews/M7-4a/screens/`（8 张：demo / page × light·dark × 1440·390）。
`ANNOTATIONS_SHOTS=1 playwright test e2e/annotations.spec.ts` 可复现。

## 5. 过程中值得记住的两个坑

1. **`astro preview` 有全局锁**：`.astro/preview.json` 记着 pid，同一仓库里已有预览服务时不光
   端口冲突，换到 4322 也会直接「Another astro preview server is already running」退出。
   本卡收口时本机有别的 worker 起在 4321（00:33 起），因此用临时配置
   `.tmp-pw-t_35bc5f20.config.ts` 打开 `reuseExistingServer`（该文件**未提交**，
   跑完已删除）。后续 worker 撞到同样报错时优先复用，别杀别人的 preview。
2. **fix 循环里最贵的是全站重建**：`astro build` 4 分钟，「只跑本卡 spec」的价值就在这里。
   样式类改动只需重建一次再跑整份 spec，而不是每改一行跑一次。

## 6. 留给 M7-4b 的边界

- 数据层公开 API 视为**冻结**（M7-4b 只消费，不改）：`AnnotationRecord` / `AddResult` / `AddRejection` /
  `createAnnotationStore` / `getAnnotationStore` / `resolveSpan` / `findQuoteOffset` / `spansOverlap` / `isValidSpan` / `sliceQuote`。
- 文章页挂载时请用 `getAnnotationStore()`（单例），不要自己 `createAnnotationStore()` —— 否则
  多实例会各持一份快照，虽然每次读写都重新 hydrate，但语义上没必要。
- 演示页的 `window.__annotations` 只是**测试钩子**（noindex 内部页），M7-4b 不要依赖它。
