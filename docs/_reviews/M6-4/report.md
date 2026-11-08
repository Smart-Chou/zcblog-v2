# M6-4 · 归档与标签页重做（archives_tags）

- 卡：`t_a0f38b0d`（blog2 板）· 2026-11-09
- 基线：`main` @ `8a363e3`（M6-3）
- 输入：`selection.md` §4.3 + §4.4；桌面 `marx_s_blog_archives_tags_1`，移动 `marx_s_blog_archives_tags_2`
- 说明：attempt 1 在 150 次迭代预算处超时（2747s），改动已落工作区；operator 接手完成测试、暗色对比度、标签长尾布局、视觉基线与报告（提交 `d25424c`）。claim worker（run 124）随后在干净重建上复核全部门禁并补齐 CI 证据，见 §3。

## 1. 改动（9 个源文件 ≤ 停点 10）

| 文件 | 内容 |
|---|---|
| `src/components/Pages/ArchivesContent.astro` | 4 张 KPI 卡、52 周热力图布局、年份/月份折叠时间轴、右栏知识域 / 标签云 / 导出 / 引言；移动端胶囊切换 |
| `src/components/Pages/TagsIndexContent.astro` | 标签首页：统计卡 + 前 12 高权重胶囊 + 272 标签长尾 CSS 分列；移动 Matrix 胶囊 |
| `src/components/Pages/TagPostsContent.astro` | 单标签页换皮；继续复用 `TagsPostCard` / `.post-card` 契约 |
| `src/components/UI/Archive.astro` | 时间轴行换皮；不把全站 85 篇扩成带标签/字数的重卡（列表 HTML 预算） |
| `src/styles/pages/archives.css` | 归档版式、KPI、热力图、年份折叠、右栏；1023/1024 断点 |
| `src/styles/pages/tags.css` | 标签首页 / 单标签页、统计卡、标签云 CSS 分列、移动胶囊；长尾链接 `inline-flex` 修计数被推到列尾 |
| `src/styles/heatmap.css` | 月份行从固定 53 列改为按实际周数生成，移动 26 周不再横向撑破卡片 |
| `src/styles/components.css` | operator 修复：暗色 `.badge-section` 底色降到 `--color-bg-sunken`，避免 #f0745b on #3d2f31 的 4.45:1 |
| `e2e/pages-tags.spec.ts`（新）/ `e2e/pages-archives.spec.ts` | 标签全量、CSS 分列、无 JS、axe、移动胶囊；归档断言适配 M6-1 的 1140 外壳 |

没有改内容 schema、路由、palette、依赖；没有引入 d3 / 图谱 JS。

## 2. 版式实测（全量内容：85 篇文章 / 272 标签）

| 页面 / 视口 | 实测 |
|---|---|
| `/archives/` 1440 | 主栏 **699** @x=167，右栏 **353** @x=906；文档 `scrollWidth 1425 / clientWidth 1440`；热力图 body **1090/1090**，366 格；年份 summary **52px** |
| `/archives/` 1024 | 主栏 **961**，右栏改到主栏下方（不强行挤双栏）；无横向溢出 |
| `/archives/` 390 | 单栏 355；移动热力图 **191 格**（26 周窗口）；无横向溢出；胶囊 355×54 |
| `/tags/` 1440 | 272 个标签全量渲染；长尾 `columns:15rem` 实测 4 列；无 JS |
| `/tags/` 390 | 单列；胶囊切换「编年时空 / 标签图谱」355×54 |
| `/tags/DOCKER/` | 2 张 `TagsPostCard`，计数 2 与卡片数一致 |

- 热力图 365 天口径未改；移动端只渲染 26 周窗口，`heatmap.css` 不再用固定 53 列，避免月份行把卡片撑宽。
- 年份折叠按钮实测 52px，满足 44px 触控面积；`prefers-reduced-motion` 用例 0 动画。

## 3. 验证

```text
pnpm run gates:all          exit 0
pnpm run gates:surfaces     PASS new_hits=0
pnpm run type-check         exit 0
pnpm run build:ci           477 页
python3 scripts/gates/perf-budget.py dist
  749 页 · over=0 · a7_missing=[]
  p95 HTML 149.6/60.4/55.1 · JS 38.4/24.5/24.5 · CSS 36.6/29.0/30.3 KB
pnpm exec playwright test e2e/pages-archives.spec.ts e2e/pages-tags.spec.ts
  54 passed / 6 skipped
```

- 标签侧 axe（light/dark × 1440）0 violations；归档 / 单标签页 axe 0 violations。
- `pages-archives` 的 CLS：1440 **0.0003**、390 **0.0000**；键盘 Tab 顺序、焦点环、无 JS、reduced-motion 均通过。
- 视觉基线：`archives-*` macOS **6 张** + Linux **6 张**已重生成并各自验证 6 passed；其他页面未动。
- **重要本地复现坑**：`visual:build:pages` 会把 Astro 内容缓存切到 6 篇夹具；随后直接跑 `build:ci` 可能继续读夹具，导致 `/tags/` 只有 14 个标签。已在本地把 `.astro` 缓存移走后重建，得到 85 篇 / 272 标签再跑验收。CI 是干净 checkout，不会继承此缓存。
- **claim worker 复核（2026-11-09 01:00）**：`astro build --force` 重建全量内容（477 页，其中 `/tags/<tag>/` 272 个），重跑 `perf-budget`（749 页 over=0）与两个 e2e 文件（**54 passed / 6 skipped**）；`visual:build:pages` + `pages.visual.spec.ts` macOS **36 passed**。
- **CI `d25424c`**：CI **42502565489** `test / gates / contract / visual (atoms 72 + pages 36 · linux baselines)` 全 success；Perf **42502565508**、A11y PR smoke **42502565471**、Deploy matrix **42502565479** 均 success —— Linux 视觉基线由 CI 的 `maxDiffPixels 0` 判定通过。

## 4. 与 selection §4.3 / §4.4 的偏差与修正

1. **归档时间轴不做大卡**：85 篇文章逐条加标签胶囊/导语会把列表 HTML 从约 57KB 推到 167KB，击穿 105KB 列表预算；保留日期 + 标题紧凑行，标签由右栏/标签页承担。
2. **移动端不新建独立 `/tags/` 路由**：按稿用「编年时空 / 标签图谱」胶囊切换；桌面 `/tags/` 独立路由保留。
3. **270+ 标签不引入图谱 JS**：纯 CSS `columns:15rem`，移动 `columns:1`；不做 d3 力导向图。
4. **长尾标签计数贴住标签名**：M6-4 初稿用 `display:flex` 撑满列宽，导致 2 个长尾标签的计数被 `margin-inline-start:auto` 推到列另一端；改为 `inline-flex`。
5. **暗色 badge 对比度**：M6-4 新徽章在 dark 下 4.45:1，差 0.05；用 `--color-bg-sunken` 降底，不改变全站 accent。

## 5. 截图

`docs/_reviews/M6-4/screens/`：`{archives,tags,tag-detail}-{1440,1024,390}-{light,dark}.png`（全量内容构建，18 张）。

## 6. 遗留

- 移动页脚入口、标签长尾搜索/筛选属于后续 M8；本卡不做。
- 272 标签首屏在低端手机仍需观察真实设备长任务；本地 390 无横向溢出、无脚本。
- `perf-budget` 列表 HTML 最紧余量来自 `/archives/`（+7.5KB / 7.1%）；下一张增加归档内容的卡需要先看这条。
