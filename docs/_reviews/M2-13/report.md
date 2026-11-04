# M2-13a · 暗色对比度修复（报告）

> 卡：`t_0ed1c793`｜来源：M2-12b 出口审计 axe 结果（`docs/_reviews/M2-12/audit.md` §6.1 / §6.3）
> 日期：2026-11-05｜基线：`1d59e93` / `ae61207`

## 1. 结论

- 全站 586 页（dark）**`color-contrast` 0 页、`link-in-text-block` 0 页**（修前 548 页 / 3 页）。
- axe serious/critical：**8 规则 / 661 findings / 833 节点 → 6 规则 / 139 节点**；剩下的 6 条规则全部是 `M2-13b`（ARIA 语义、命中区）的范围。
- 结构与移动零回归：586/586 主题生效 + 底色亮度 ≤0.010 + 1440 无溢出；P-09 24 组合 0 溢出。
- `axe-known.json` 16 → **7 条**（只留 M2-13b 条目），基线只减不增。

## 2. 改了什么（只改颜色 / 下划线，零结构改动）

| 组 | 症状（暗色实测） | 改法 | token / 落点 |
|---|---|---|---|
| 搜索触发器占位（546 页） | `#767676` on `#1e1e2e` = 3.61 | `--pf-text-muted` 在暗色下映射到 `--search-text-muted`（`#9ca3af` = 6.46）；浅色不动（4.54 已过线） | `src/styles/search-global.css` |
| 搜索框 placeholder | `#6b7280` on `#1e1e2e` = 3.39 | 同源同修（同一个 `--pf-text-muted`） | 同上（`pagefind-modal`） |
| 一言出处（91 页） | `#6b6762` on `#1c1917` = 3.11 | 暗色 `--color-muted`（6.7–6.9） | `src/components/UI/Hitokoto.astro` |
| 番剧/豆瓣状态徽章 | 白字 on viz 亮色 = 1.91–3.52 | 徽章字色随状态给深墨 `--status-badge-fg`（4.7–9.3）；未知灰反过来仍用白（4.83） | `variables.css` + `Bangumi/Card.astro` |
| tab / 筛选计数 | `opacity:.7` 混合 = 3.53 / 2.17 | 去掉 opacity，实色 `--color-muted` / `inherit`（6.9 / 6.0） | `Bangumi/TabNav.astro`、`Bangumi/FilterControls.astro`、`Pages/DoubanContent.astro` |
| 文档站 `.build-time`（40 页） | `--color-text` + `opacity:.6` = 4.32 | 去掉 opacity，`--color-muted`（6.68） | `UI/PageHeader.astro` |
| EC 行号（diff 插入行） | `#8b949e` on `#254025` = 3.71 | `--ec-lineNumbers-fg: #b0b4bb`（5.49） | `src/styles/global.css` |
| remark-aside 内链 | accent on tint = 3.90（浅色 3.88 / 4.36） | 改 `--color-code-accent`（暗 5.97 / 浅 5.80） | `src/styles/remark-aside.css` |
| `/redirect/` 提示 | `opacity:.4` 混合 = 3.17 | 去掉 opacity（12.37） | `src/styles/redirect.css` |
| `/500.html` 主按钮 | 白字 on `#e8736a` = 2.96 | 新增 `--color-on-accent`（浅纸白 / 暗深墨），`.btn-primary` 默认走它 | `variables.css` + `UI/Button.astro` |
| 法务三页内联链接 | 只靠颜色区分（2.32:1） | 正文链接常驻下划线（非颜色线索） | `src/pages/[...custom].astro` |

新增 token：`--color-on-accent`（浅 `#fffcf8` / 暗 `#15181e`）、`--status-badge-fg`、`--status-badge-fg-inverse`。没有新增组件颜色字面量（surface 基线 42 → 41，收紧）。

## 3. 证据（可复跑）

```bash
# 构建（必须带 I18N_LOCALES=all，否则分母不是 586）
I18N_LOCALES=all ./node_modules/.bin/astro build

# 全量复测（约 16–22 分钟，含 586 页 + 24 移动组合）
AUDIT_DATA_DIR=docs/_reviews/M2-13/audit-data npx playwright test e2e/export-audit.spec.ts
# → 611 passed / 2 skipped / 0 failed

# 只跑受影响的 15 条路由（迭代用，约 40 秒）
AUDIT_ROUTES='/ /blog/1/ /bangumi/ /douban/ /design/components/pageheader/ /design/components/hitokoto/ /article/expressive-code/ /redirect/ /500.html /cookies/ /copyright/ /privacy-policy/' \
  AUDIT_DATA_DIR=/tmp/m2-13a npx playwright test e2e/export-audit.spec.ts -g v01-all-pages
```

产物：`docs/_reviews/M2-13/audit-data/{axe,dark-pages,mobile}.jsonl`、`denominator.json`（586 页 / 2 个 meta-refresh 跳转桩）、`axe-known.json`（7 条）。

## 4. 门禁（本树实跑）

`check-tokens` 10/10 · `verify-atoms` 18/18 · `verify-atom-docs` 8/8 · `verify-surface-tokens` PASS（41/84，new_hits=0）· `verify-i18n` 8/8 · `verify-entities` 9/9 · `verify-doc-drift` PASS · `astro check` 0 errors / 6 hints · `prettier --check .` exit 0。

## 5. 没做 / 残留（不在本卡边界）

- `AUDIT_BASELINE=0` 全量仍会在 6 条 ARIA 规则上红（`aria-hidden-focus` 85 页、`aria-prohibited-attr` 19、`aria-allowed-attr` 10 + critical、`label` 8 + critical、`link-name` 8、`target-size` 9）—— 全部是 `t_79c616b4`（M2-13b）的交付物。
- 没有为本卡做像素基线（先锁像素等于把未修观感固化；且本卡就是改颜色）。
- 浅色主题只做了归因抽样（受影响路由 × light），无新增违规；不把浅色全量纳入本卡验收口径。

## 6. 回滚

单 commit 可回退：`git revert <M2-13a commit>`；`axe-known.json` 从 `docs/_reviews/M2-12/audit-data/axe-known.json@{1d59e93}` 取回 16 条即可恢复修前基线。
