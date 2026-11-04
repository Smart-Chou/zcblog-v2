# M2-13b · ARIA 语义与可访问名修复（share-pop / 分页 / 番剧 tab / 任务列表 / link-name / 页脚 / 命中区）

> 来源：M2-12b 出口审计（`docs/_reviews/M2-12/audit.md` §6.1 后半 + §6.2）与 M2-13a 对比度收口（`docs/_reviews/M2-13/report.md`）。
> 本卡只改 **ARIA 语义 / 可访问名 / 命中区**，零颜色改动。

## 1. 结论

`AUDIT_BASELINE=0`（严格零容忍）全量跑 **586 页 × dark**：

```
611 passed (14.7m) · 2 skipped（AUDIT_SHOTS 未开，跳过截图两条）
violations: 0 条规则 / 0 页 / 0 节点   ← 修前 6 规则 / 139 节点，其中 critical 2 规则
incomplete: color-contrast 551 页 / 3437 节点 · aria-required-children 1 页 / 1 节点
dark 结构层: 586/586 主题生效 · 底色 >0.010 的 0 页 · 1440 横向溢出 0 · HTTP 全 200
P-09 移动: 24 组合（4 页 × 2 主题 × 3 视口）溢出 0
```

`axe-known.json`：**7 条 → 0 条**（`M2-12/audit-data`、`M2-13/audit-data`、`M2-13b/audit-data` 三处同步为 `[]`）。
基线清空后，默认跑法（不设 `AUDIT_BASELINE=0`）也等同严格模式——新增任何 serious/critical 直接判红。

原始数据：`docs/_reviews/M2-13b/audit-data/{axe,dark-pages,mobile}.jsonl` + `denominator.json`（586 页 / 2 个 meta refresh 跳转桩：`/blog/`、`/en/blog/`）。

## 2. 逐项修复

| # | 项 | 修前（M2-12b 数据） | 修法 | 落点 |
|---|---|---|---|---|
| 1 | `.share-pop` 关闭态可聚焦 | `aria-hidden-focus` serious · 85 页 / 85 节点 | 关闭态 `visibility: hidden`（+ 打开态 `visibility: visible`），`visibility` 用 `0s linear <duration>` 延迟到淡出结束再生效，动画不变 | `src/styles/article.css` |
| 2 | 分页禁用态 | `aria-prohibited-attr` serious · 19 页 / 19 节点 | 两个 nav `<a>` 补 `role="link"`：禁用态没有 `href`（Astro 省略 `undefined`）→ 落到 generic，`aria-label`/`aria-disabled` 被忽略；有 `href` 时 `role="link"` 与隐含角色一致 | `src/components/UI/Pagination.astro` |
| 3 | 番剧 tab | `aria-allowed-attr` **critical** · 2 页 / 10 节点 | `nav role="tablist"`；按钮 `role="tab"` + `id="tab-<id>"` + `aria-selected` + `aria-controls="panel-<id>"`；分区 `role="tabpanel"` + `id="panel-<id>"` + `aria-labelledby` | `Bangumi/TabNav.astro`、`Bangumi/BangumiSection.astro` |
| 4 | 豆瓣 tab（同型） | 同类模式，修前未进红 | 同上（`data-tab` 的 `aria-selected` 由 `tab-nav.ts` 写，缺 role 即同类违规） | `src/components/Pages/DoubanContent.astro` |
| 5 | 任务列表 checkbox | `label` **critical** · 1 页 / 8 节点 | 新增 rehype 插件：对 `li.task-list-item` 内的 `input[type=checkbox]` 补 `aria-label` = 该列表项文本（压空白 + 80 字截断），不改结构/样式/`checked` | `src/rehype-plugin/rehype-task-list-a11y.ts`（新）+ `astro.config.mjs` |
| 6 | 正文图片链接 | `link-name` serious · 2 页 / 8 节点 | 灯箱包裹 `<a class="img-link">` 时补 `aria-label`：有 `alt` 用 `alt`，否则 `查看大图`（zh）/ `View full-size image`（其余语言） | `src/utils/fancybox.ts` |
| 7 | 页脚统计 | `aria-prohibited-attr` incomplete · 546 页 / 546 节点 | `.footer-stats` 补 `role="group"`（`aria-label` 在无 role 的 `div` 上不受支持） | `src/components/Layout/Footer.astro` |
| 8 | 社交图标命中区 | `target-size` serious · 1 页 / 9 节点（`/design/components/author/`） | 文档页示例区给 `.author-links a` 兜 24×24 下限（`display:inline-flex` + `min-width/height`）。生产页的 34px 来自全局 `article.css`，不受影响 | `src/pages/design/_docs/DemoFrame.astro` |

## 3. 三个值得记下来的判断

1. **share-pop 用 `visibility` 而不是 `inert`。** 关掉可聚焦有 `inert` / `hidden` / `tabindex="-1"` 三条路：`hidden` 会丢过渡，`inert` 要在打开态反向摘除（overlay 基座的 `open/close`、`ovl:close`、外点/Esc 三处都要管，属于改行为），`tabindex` 要逐个元素翻。`visibility: hidden` 一行 CSS 就同时移出 Tab 序与读屏树，再配 `visibility 0s linear <duration>` 把它的生效点推到淡出之后。实测：关闭态按钮 `focus()` 不生效、打开态焦点落到关闭按钮、Esc 后重新不可聚焦、关闭后 0.1s 内仍 `visible`（淡出没被砍断）。
2. **图片链接文案不能写十种语言。** 这段代码落在 `BaseLayout` 的公共 chunk 里，全站每页都吃：十语言文案实测把 blog 列表页 JS 顶到 28.2KB（预算 28KB），9-19 页超支。压到 zh/en 两条后回到 28.0KB（正好在预算线上）。非中英页面用英文兜底——这 8 门语言目前只有回退正文，与内容事实一致。
3. **命中区修在文档页，不修在组件里。** 违规只出现在 `/design/components/author/`（文档页不加载 `article.css`，示例区是裸排版）。把规则塞进 `Author.astro` 的 scoped style 会让**每个含作者卡的页面**多背 ~0.5KB 内联样式（实测 archives 105.3KB，超 HTML 预算）——`target-size` 是文档示例的问题，所以落点是 `DemoFrame`。

## 4. 代价与回归面

**性能（`perf-budget.py dist`，586 页）**：`0 页超支`，exit 0。

| 页型 | HTML p95 | JS p95 | CSS p95 | 最紧余量 |
|---|---|---|---|---|
| article (85) | 177.5KB | 38.2KB | 31.8KB | +0.8KB html |
| list (286) | 67.1KB | 27.3KB | 25.9KB | +0.0KB js（`/blog/1/`） |
| page (215) | 92.7KB | 28.0KB | 27.8KB | +0.0KB html（`/ja/archives/`） |

对比 M2-13a 基线：JS p95 各页型 **+0.1KB**（灯箱文案进公共 chunk），HTML 基本持平（`/archives/` +11B、`/blog/1/` +40B、首页 +11B，来自页脚 `role="group"` 与分页 `role="link"`）。**列表页 JS 余量已经归零**——下一张卡只要再往公共 chunk 加东西就会立即超支，这是本卡留下的真实风险，写在这里而不是埋在数据里。

**功能探针（5 条，final dist 实跑）**：

- `.share-pop`：关闭态 `visibility:hidden` + 按钮 `focus()` 不生效；打开态 `visible`/`aria-hidden=false`/`data-overlay=share`/焦点在关闭按钮；Esc 后回落关闭态；淡出仍在（关闭后 0.1s `visible`，0.4s `hidden`）。
- 番剧：`tablist` + 5 tab（`aria-selected` 只有一个 true）+ `aria-controls` 全部命中目标 + 5 个 `tabpanel` 的 `aria-labelledby` 对应；点第 2 个 tab → `panel-book` 显示、其余 `display:none`。
- 豆瓣：3 tab / 3 panel，切换后只有一个 `aria-selected=true`。
- 任务列表：8 个 checkbox 全带 `aria-label`（例：`AFFiNE 容器已重启`），`checked=false` / `disabled=true` 不变。
- 图片链接：4 个 `.img-link` 的 `aria-label` 全为 `查看大图`。
- 无重复 id：`/bangumi/`、`/en/bangumi/`（19 个）、`/douban/`、`/en/douban/`（15 个）逐个页面去重检查 0 冲突。

**门禁**：`prettier --check .` 0 · `astro check` 0 errors / 0 warnings / 6 hints · `verify-atoms` 18/18 · `verify-atom-docs` 8/8 · `verify-doc-drift` PASS（mismatch=0）· `check-tokens` 10/10 · `verify-surface-tokens` PASS（new_hits=0）· `verify-entities` 9/9 · `verify-i18n` 8/8 · `perf-budget` 0 超支 · `verify-component-inventory` **FAIL 1/8**（I7b `albumscontent` 0 引用，M2-11b 已记 known-red，非本卡引入）。

## 5. 没做 / 边界

- **颜色/对比度**：不动（M2-13a 的边界）。本卡复测里 `color-contrast` 仍是 incomplete（551 页 / 3437 节点，non-text 内容与遮挡背景无法判定），与 M2-12b 同性质，不是新问题。
- **`aria-required-children` incomplete（1 页）**：`/design/components/donatorslist/` 的 `ul.donators[role=list]` 子节点形状待定；incomplete 不判红，留给后续 a11y 卡。
- **overlay 行为逻辑**：零改动，只改关闭态的 CSS 可见性。
- **未接 CI**：`export-audit.spec.ts` 全量 ~15 分钟 + 需 `I18N_LOCALES=all` 构建，接 CI 的前置仍是「按 diff 路由子集扫」或夜间全量（M2-12b 已记）。

## 6. 复跑

```bash
# 分母：必须带 I18N_LOCALES=all，否则只有 zh+en 的 474 页
I18N_LOCALES=all npx astro build

# 全量严格零容忍（586 页 + 24 移动组合，实测 14.7 分钟）
AUDIT_BASELINE=0 AUDIT_DATA_DIR=docs/_reviews/M2-13b/audit-data \
  npx playwright test e2e/export-audit.spec.ts

# 只跑受影响路由（迭代用）
AUDIT_BASELINE=0 AUDIT_ROUTES='/bangumi/ /douban/ /blog/1/ /design/components/author/ /article/affine-selfhost-ai-config/' \
  npx playwright test e2e/export-audit.spec.ts -g v01-all-pages
```

## 7. 提交

- `e3325d8` fix(a11y): M2-13b ARIA 语义与可访问名（7 项修复，10 个源文件）
- `f1c608e` fix(a11y): M2-13b 收口（img-link 文案压到双语言兜底 / 命中区下限移到 DemoFrame）
