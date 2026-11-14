---
name: zcblog-new-feature
description: Adding a new feature, page, route, or component family to zcblog-v2 - decision-log check, DESIGN chapter mapping, card sizing, gates, visual baselines, and the decision record. Use when adding or reshaping functionality, routes, tokens, or component specs.
---

# 新增功能 / 页面 / 组件

zcblog-v2 的改动单位是「卡」，不是「需求」。一张卡 = 一个路由或一个组件族 + 一条 e2e spec，**源文件 ≤4 个、净新增 ≤300 行、只碰一个子系统**（D-0149）。超了就拆：地基卡（`tokens.json` / `base.css` / `components.css` / shell）先落地，叶卡再并行。

## 0. 先查有没有决策

在 `~/Documents/hermes-desktop-files/blog2.0/docs/decision-log.md` 里搜关键词（仓外文档，仅本机有效；clone 到别处时以仓内 `rules/` 与 `docs/` 为准）。已经拍过的事照旧执行，不要重新发明；要推翻旧决策就写新 D-xxxx 并显式引用被推翻的那条。产品边界与技术栈禁令查 `12-product-charter.md`，已知缺口查 `挂起事项登记-20261113.md` —— 登记过的缺口不要当新 bug 修。

## 1. 读对应章节

| 你要加的东西 | 先读 |
|---|---|
| 新 token / 改色值 / 改度量 | `docs/DESIGN.md` §3（§3.4 是 52 个语义键的表）|
| 新组件 / 改组件 API | §5.6（12 个核心组件）或 §5.7（organism：有生命周期 / 跨页单例 / 第三方网络）|
| 新页面 / 新路由 | §4（分层与归层表）、`docs/overlay-contract.md`（这页属于 T 还是 O）|
| 交互 / 动效 / JS | §5.7、§7（JS/CSS 预算）、`12-product-charter.md` |
| 新的包级能力 | `docs/package-boundary.md`（B1–B4）、`docs/release.md` |

`docs/DESIGN.md` 是仓外真源的**逐字节快照**，不是草稿纸：真要改契约，先在治理仓改 `blog2.0/docs/DESIGN.md`，再 `cp` 进本仓、更新 `docs/DESIGN.vendor.json` 的 `md5` / `bytes` / `lines` / `syncedAt`，最后跑 `pnpm gates:tokens`（G-S6 比指针）。只改本仓快照会被判红。

## 2. 定卡粒度与落点

- 一个页面 = 一个 `src/pages/**` 路由文件（zh + `/en/` 镜像按现有目录结构对称加）+ 一条 spec。
- 一个组件族 = `src/components/**` 下的同层文件 + `src/pages/design/atoms/<slug>/` 文档页 + `src/pages/design/_docs/` 的 registry 条目（`gates:inventory` 的 I1/I2 会核对 registry 与 `data/*.json` 一一对应）。
- 主题级能力（会被别人 clone/升级）必须在 `site.manifest.json` 里归到 **T**；站点身份、内容、数据、资产是 **O**，一个字节不许动；缓存与评审档案是 **X**，两边都不入清单。判据见 `docs/overlay-contract.md`，门禁 `node scripts/gates/verify-overlay.mjs`。

## 3. 实现时的硬约束

- 颜色只走语义 token（组件里 `--palette-*` / hex / `rgb()` / `hsl()` 一律违规）；尺寸除 `0 / 1px / 2px / 百分比 / auto` 外必须走 `--space-*` `--text-*` `--radius-*` `--shadow-*`。
- atom / molecule 保持 0 JS：要 `<script>`、要 `client:*`、要跨页单例，就升 organism 并在 DESIGN §5.7 立规格再写。
- 文案进 `src/data/i18n/*.json`（现有 10 份词典），fallback 链在 `src/utils/i18n.ts`；只加中文键 = 另外 9 种语言静默回落，A8 也会盯组件内的中文字面量。
- 依赖方向单向：L1–L3 不 import `~/config` `~/data` `~/content`，组件不 import `layouts/`，`packages/*` 不用 `~/` 反向读站点代码。
- 新依赖先过 `12-product-charter.md` 的许可与范围红线，再过 §7 的 JS/CSS 预算；预算与功能冲突时砍功能。

## 4. 出门禁

```bash
pnpm type-check                                  # tsc --noEmit
pnpm test:unit                                   # 14 文件 / 163 用例
pnpm build                                       # normalize → fetch → astro build → 压缩
git add <新文件>                                  # 必须先 add，O1 只统计 tracked（D-0144）
pnpm gates:all                                   # 10 个门禁脚本
pnpm lint                                        # prettier --check .（只读）
pnpm test:e2e                                    # 49 spec
node scripts/verify-build.mjs                    # A1/A11/A13 + pagefind
python3 scripts/gates/perf-budget.py dist        # 预算，只在部署前必须
```

新组件还要单独确认 `pnpm gates:atoms`（P1–P10 + A1–A8，实测 18/18 PASS）；新增图标必须先在 sprite 清单里登记，否则 `gates:icons` 的 S3/S4/S8 三面都会红。

## 5. 更新视觉基线

1. 先跑 `pnpm test:visual:pages`（六页 × 2 主题 × 3 视口）和 `pnpm test:visual:states`（状态级），确认差异列表。
2. **逐张**看差异是不是 intentional。D-0173 的教训：旧基线曾把「图标缺失导致整体右移 15px」编码成正确，任何人都不该用 `--update-snapshots` 一把梭。
3. 确认后只在**当前平台**重出基线：`pnpm visual:build:pages` / `pnpm visual:build:states`。CI 只认 Linux 的 `maxDiffPixels: 0`，macOS 的图不替代 Linux 图。
4. 新增页面/组件属于「视觉面扩大」，必须同时给出基线，否则等于永久失去回归保护。

## 6. 写决策记录

在 `decision-log.md` 追加 `## D-xxxx · 一句话标题（YYYY-MM-DD）`：**触发原因 → 取舍过程 → 决定 → 证据（命令输出 / CI run 链接）→ 已知代价**。只增不改，旧条目一个字都不要改。决策里出现的数字必须能在命令输出或 CI run 里复现，不接受「我本地试过」。

同时更新 `AGENTS.md` / `rules/` / `docs/` 中受影响的那一条，并（若引入新概念）在 `.agents/skills/README.md` 的技能清单里判断是否需要新技能。

## 反模式

- 先写代码再补 DESIGN 与决策 —— 契约文档会退化成事后描述。
- 一张卡里顺手重构无关模块 —— 门禁红了你分不清是谁的锅。
- 因为「只差一点」把字面量塞进组件 —— A7 是逐行正则，没有「只差一点」。
- 拿 macOS 基线糊 Linux CI —— 换来的是长期假红。
