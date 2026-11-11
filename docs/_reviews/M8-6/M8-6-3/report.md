# M8-6-3 · 随笔页视觉重做：两栏 sticky + 时间流 + 空错态

- 卡：`t_93530457`（批一 · 随笔 `/talks/`）
- 规格：`docs/_reviews/M8-6/acceptance-standard.md` §2.3 **P3-01…P3-07** + §1 G-01…G-24
- 设计：`marx_s_blog_talks_blinko_1`（1440 两栏）/ `marx_s_blog_talks_blinko_2`（移动单列）
- 提交：`045dbad` feat(m8-6-3) + 本报告所在提交

## 1. 改了什么

| 文件 | 变更 |
|---|---|
| `src/components/Pages/TalksContent.astro` | 重写结构：`PageHero` + 两栏 `talks-layout` + `SectionHead` ×2 + `DataState` ×2 + `Tag` 话题云 + `<ol>` 时间流 |
| `src/styles/pages/talks.css` | 重写：两栏栅格 / sticky / 顶部横滑 / 日期列 token 组合 / EssayItem 纸面语言 / reduced-motion 归零 |
| `e2e/pages-talks-donate.spec.ts` | 新增 P3-01…P3-07 五条测试 + 随笔移动（375/390）一条；修正两处旧断言；证据截图加 375 档 |
| `src/pages/talks/index.astro` | 未改（包装层已是最薄形态） |

### 结构（DOM 契约）

```
article.talks[data-talks-status][data-talks-total][aria-labelledby=talks-title]
├─ header.page-hero                      ← PageHero（kicker / h1.talks-title#talks-title / lede / meta chips / 来源外链 slot）
└─ div.talks-layout(.talks-layout--two-col)
   ├─ aside.talks-filters[aria-labelledby=talks-topics-title]   ← 仅 ok 且 tags>0
   │  ├─ .section-head（话题 · 按出现次数排序）
   │  └─ ul.talks-topics > li.talks-topic > span.tag.tag--neutral.tag--sm
   └─ section.talks-main[aria-labelledby=talks-timeline-title]
      ├─ .section-head（时间线 · 最新在上）
      ├─ [ok]    div.talks-track > span.talks-rail + ol.talks-timeline > li.talks-entry
      │          （li 内：time 日期列 + EssayItem.essay-card）
      ├─ [error] div.talks-state[data-talks-error=<code>] > DataState(kind=error)
      └─ [empty] div.talks-state[data-talks-empty=<code>] > DataState(kind=empty)
```

### 关键决策

1. **Hero chip（P3-03）**：条数 chip 恒在（0 条也报 `0 条`，不留空页头）；标签数 chip 只在 `tags.length>0` 时入数组；最近时间 chip 只在 adapter 给出 `newest` 时入数组，且走 `quiet` 弱化档。三枚 chip 的组装是**同一份 `heroMeta` 数组的条件展开**，不是三段并列 JSX —— 少一处就会漂。
2. **日期列 8rem 不在 token 集（D7）**：登记为页内变量
   `--talks-date-col: calc(var(--space-16) * 2)`（= 8rem = 128px），栅格与轨道读同一个变量。
   轨道 `inset-inline-start` 与 `.talks-entry` 的 `grid-template-columns` 因此不可能漂开。**未引入字面量尺寸**。
3. **断点契约**：只出现 `min-width:1024` / `max-width:768` / `max-width:450`。
   移动优先：**默认**就是「筛选在正文上方 + 话题云横滑」，`≥1024` 才升级两栏并 sticky。
   这样 768–1023 天然落在「顶部横滑、不挤压正文」，不需要 769–1023 的区间查询（契约里没有这个值）。
4. **话题云横滑 vs axe**：`overflow-x:auto` 的容器在新版 Chrome 里是**可聚焦滚动区**，
   axe 会报 `scrollable-region-focusable`（serious），键盘测试也会把它算成无焦点环元素。
   两个问题的同一个真因：`@media (min-width:1024px)` 的 `overflow-x:visible` 覆盖写在了基础规则**之前**，
   被后面的基础 `overflow-x:auto` 反超。修法：把 1024 覆盖挪到基础规则之后（行内已注明原因），
   并给 `.talks-topics:focus-visible` 补 `--color-ring-focus` 环（移动端横滑区被 Tab 到时颜色统一）。
5. **`EssayItem` 不动组件**：`/design/components/essayitem/` 文档页与随笔页共用同一组件，
   纸面/悬停语言改在 `talks.css` 用三个类选择器（`.talks .talks-entry .essay-card`，0,3,0）
   压过 Astro scoped 的 `[data-astro-cid-*]`（0,2,0）。组件契约与文档页零变化。
6. **外链命中区**：桌面 `--space-8`(32) 保持；`≤768` 提到 `--space-11`(44)，
   页头来源外链同步 `min-block-size:--space-11`（验收「≥44」只对 375/390 生效，桌面不为它牺牲密度）。
7. **0 客户端 JS**：sticky、横滑、悬停全是 CSS；页面无 `<script>`（R4：列表页 JS 预算 28 KB）。

### 空 / 错态口径

- `PUBLIC_TALKS_STATE=empty` → `data-talks-status=empty`、`total=0`、`[data-talks-empty]` 可见、
  `.essay-card`=0、**`.talks-topics` 与 `.talks-filters` 都不存在**、h1 仍在、`SectionHead` 仍在。
- `PUBLIC_TALKS_STATE=error` → `[data-talks-error]` + `DataState(kind=error)` 内的
  `Alert tone=warning` + 原因码（`data-state__code`），且不出现空态块。

## 2. 验收自检

### P3 / G 对照

| ID | 判据 | 谁来证 | 结果 |
|---|---|---|---|
| P3-01 | `article.talks` ×1，`data-talks-status/total` 在 | `P3-01/02` 测试 | ✅ |
| P3-02 | `h1.talks-title#talks-title` ×1 | `P3-01/02`（追加 `.page-hero__title` ×1） | ✅ |
| P3-03 | 条数恒在 / 标签数 conditional / 最近时间 conditional | `P3-03`（含「chip 总数 = 1+…」恒等式） | ✅ |
| P3-04 | `<ol>`；卡片数 = total；id 唯一 | `P3-04/05`（`tag==="OL"`、8=8、id 唯一） | ✅ |
| P3-05 | 正文非空且无 `#`；外链 http(s)+`_blank`+`noopener`；配图 alt/尺寸 | `P3-04/05` + 既有「随笔契约」测试 | ✅ |
| P3-06 | ≥1024 sticky 常驻；768–1023 顶部横滑不挤压正文 | `P3-06`（1440 两栏 28.1%、滚动 500 后 top=88；768/900/1023 单列+非 sticky+占满行+`overflow-x:auto`） | ✅ |
| P3-07 | ok 态 `.talks-topics` 存在、空态不渲染 | `P3-07`（15 个话题全 `tag--neutral` `tag--sm`）+ empty fixture 断言 | ✅ |
| G-18 | reduced-motion 过渡归零 | spec「prefers-reduced-motion」：talks 探针 10 个，0 动画 0 位移 | ✅ |
| 移动 | 375/390 单列、0 横向溢出、外链 ≥44 | 「随笔移动」测试 | ✅ |
| 空/错态 | `empty`/`error` 真实构建分支 | spec「随笔 empty/error 态」（真构建 zh+en 双路由） | ✅ |

### 实跑记录（本机 macOS，`astro preview` + Playwright 1.63）

| 命令 | 结果 |
|---|---|
| `npx astro build` | 482 页，Complete |
| `-g "P3-|随笔移动"` | **6 passed (11.3s)** |
| `-g "axe talks|Tab 顺序|P3-06|overflow talks"` | **4 passed (24.9s)**；axe talks light/dark serious=0 incomplete=0；壳内可聚焦 9 个逐个 Tab 检查 9 个，焦点环全 = `--color-ring-focus` |
| `-g "随笔 empty|随笔 error|证据截图 talks"` | **3 passed (1.8m)**（两次真实构建 + 4 张证据） |
| 全量 `pages-talks-donate.spec.ts` | **38 passed (17.3m)**，exit 0（含赞助页 5 态真实构建） |
| CLS `/talks/` @1440 / @390 | 0.0000 / 0.0000 |
| reduced-motion | talks 探针 10 个，0 动画，0 位移 |

全量 spec 已在 2026-11-11 15:38 跑完，**38/38 passed**；随笔侧不再有未跑项。

## 3. 证据

`docs/_reviews/M8-6/M8-6-3/evidence/`

| 文件 | 说明 |
|---|---|
| `talks-light-1440.png` | 1440 light：两栏（左 28.1% sticky 筛选 + 右时间流 + 日期列 + 轨道） |
| `talks-dark-1440.png` | 1440 dark：同上，暗色纸面/轨道/标签对比度 |
| `talks-light-390.png` | 390 light：单列，日期折到卡片上方，话题云横滑 |
| `talks-light-375.png` | 375 light：同上窄档，0 横向溢出 |

## 4. 遗留 / 下一手

1. 无未跑项；视觉基线与 `PAGES` 无关（本页不在 PAGES 内）→ 不新增 gated 基线，证据截图即基线。
2. e2e 里两处旧断言已按新结构更新（均属本卡边界内的 spec 维护）：
   - 空/错态 fixture：`<h1 class="talks-title">` → `class="[^"]*talks-title`（PageHero 追加 `page-hero__title`，语义类保留）。
   - 错误态原因码：`talks-state__hint` → `data-state__code`（原因码行由 `DataState` 出，与赞助页口径一致）。
3. 视觉基线与 `PAGES` 无关（本页不在 PAGES 内）→ 不新增 gated 基线，证据截图即基线。
