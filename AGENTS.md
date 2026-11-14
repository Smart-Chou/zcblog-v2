# AGENTS.md · zcblog-v2

## Summary

zcblog-v2 是一套面向中文内容型个人站点的 Astro 主题与组件系统（主题名 Dogeared，包 `@marxchou/dogeared-*`）；第一个客户是 marxchou.com，当前生产站是 https://zcblog-v2.pages.dev。
技术栈 = **Astro 7 + 原生 CSS（CSS variables + `src/styles/`）+ pnpm**。Tailwind 已移除：不写 utility class、不写 `@apply` / `@theme`；暂不引入 Svelte 5。
内容与代码分离：文章与图片的真源在私有仓 `Smart-Chou/zcblog-articles`，本仓 `src/content/article/` 是 gitignored 的构建缓存，手工改会在下次部署被覆盖。
治理文档（DESIGN.md / decision-log.md / 产品章程）在代码仓**外**，路径见「Required documents」。

## Must-follow rules

- 颜色只走语义 token：`--palette-*` 只允许出现在 `tokens.css`；`src/components` / `src/pages` / 其它样式表里出现 `--palette-*`、hex、`rgb()/hsl()` 即违规，组件颜色基线只减不增。 <!-- DESIGN §3.12.3 G-T4 / §6.1 · D-0109 -->
- 尺寸不写字面量：除 `0` / `1px` / `2px` / 百分比 / `auto` 外，一律用 `--space-*` `--text-*` `--radius-*` `--shadow-*`；白名单外即违规，12 个核心组件由 A7 机器判红。 <!-- DESIGN §5.6 A7 -->
- 组件分层单向：atom 不得 import molecule/organism/page，组件不得 import `layouts/`，L1–L3 不得 import `~/config` `~/data` `~/content`；`packages/*` 不得用 `~/` 别名反向读站点代码。 <!-- DESIGN §4.2 D1–D4 · 21-m3-plan §3.4 B1 -->
- atom/molecule 保持 0 JS（无 `<script>`、无 `client:*`）。需要生命周期或跨页单例的交互，升 organism 并在 DESIGN §5.7 立规格再写。 <!-- DESIGN §5.6 A5 / §5.7 -->
- 用户可见文案不硬编码：10 份词典在 `src/data/i18n/*.json`，fallback 链在 `src/utils/i18n.ts`；组件内硬编码自然语言是 A8 违规。 <!-- DESIGN §5.6 A8 -->
- 视觉基线按平台各自生成（macOS / Linux），CI 只认 Linux 的 `maxDiffPixels: 0`；更新基线前逐张确认差异是 intentional —— 旧基线曾把一个图标缺陷固化成了「正确」。 <!-- D-0173 · playwright.config.ts:11-14 -->
- 视觉改动必须过 screenshot baseline，新功能不得突破 JS/CSS 预算；两者冲突时砍功能，不砍预算。 <!-- D-0133 · 06-performance-budget.md -->
- 卡粒度 = 一个路由或一个组件族 + 一条 e2e spec；源文件 ≤4 个、净新增 ≤300 行、只碰一个子系统。`base.css` / `components.css` / tokens / shell 先做地基卡，叶卡再并行。 <!-- D-0149 -->
- frontmatter 归一化只走脚本：内容仓文章带 v1 散字段，由 `pnpm normalize:content` 转成 `features[]`。手改成 v2 键是绕过契约；增量同步文章后必须重跑一次 build。 <!-- D-0167 · D-0174 补记 -->
- 门禁失败即中断部署：`deploy.yml` 的步骤不许注释、不许加 `|| true` 绕过；只有两个 fetch 步骤被显式容忍。 <!-- D-0175 -->
- DESIGN.md 真源在治理仓，仓内 `docs/DESIGN.md` + `docs/DESIGN.vendor.json` 是门禁校验的快照（G-S6 比 md5）；改一处必须同步另一处。 <!-- DESIGN §3.12.3 G-S6 · D-0159 -->
- 新决策写进 `decision-log.md`（D-xxxx，只增不改）；数字必须来自命令输出或 CI run，不接受「我本地试过」。 <!-- 12-product-charter.md §5 -->

## Required documents

治理文档根目录：`/Users/chowcong/Documents/hermes-desktop-files/blog2.0/docs/`

- `<docs>/DESIGN.md` — 视觉与组件契约真源（§3 token、§4 分层、§5 组件规格、§6 禁止项）。required before 改 token / 组件 / 层级 / 动效。
- `<docs>/decision-log.md` — 2,500+ 行只增不改的决策记录。required before 任何「我要改个规矩」的动作：先搜你的改动是否已有 D-xxxx。
- `<docs>/12-product-charter.md` — 产品边界、技术栈禁令、许可证（代码 MIT + NOTICE）。required before 引入依赖或扩大范围。
- `<docs>/13-package-boundaries.md`、`<docs>/21-m3-plan.md` §3.4 — 包边界 B1–B4 与 W0 骨架。required before 动 `packages/*` 或跨包 import。
- `<docs>/06-performance-budget.md` — JS/CSS/LCP/CLS 预算与测量协议。required before 加依赖、加 JS、改首屏。
- `<docs>/15-tool-routing.md` — 角色与验收路由（实现者 ≠ 验收者，高风险需交叉评审）。required before 接外部 CLI 或自评审。
- `<docs>/挂起事项登记-20261113.md` — 已知缺口（数据新鲜度、单测数量等）。required before 把一个问题当「新 bug」修。
- 仓内 `docs/DESIGN.md`、`docs/overlay-contract.md`、`docs/package-boundary.md`、`docs/component-inventory.json` — 门禁直接消费的快照与清单。
- 若在他人机器上 clone 本仓，上面 `<docs>/` 的绝对路径无效，请以仓库内 `docs/` 与 README.md 为准。

## Validation

- 改任何源码：`pnpm build`（= `normalize:content` → fetch → `astro build` → 压缩 HTML，全站 489 页量级）。
- 改 TS / 工具函数：`pnpm test:unit`（vitest，**14 文件 / 163 用例**，约 3s）。
- 改页面或组件：`pnpm test:e2e`（Playwright，49 个 spec）。它自带 `astro preview` 起在 `dist/`，所以先 `pnpm build`。
- 改 token / 组件样式：`pnpm gates:tokens`（10 道 token 契约门禁）与 `pnpm gates:surfaces`（P5 棘轮，只减不增）。
- 提交前：`pnpm gates:all`（10 个门禁脚本）+ `pnpm lint`（= `prettier --check .`，只读）+ `pnpm type-check`。注意 `pnpm format` 是 `-w`，别拿它当检查用。
- 部署前额外：`node scripts/verify-build.mjs`（A1/A11/A13 + pagefind）与 `python3 scripts/gates/perf-budget.py dist`。
- 视觉改动：`pnpm test:visual:pages` / `pnpm test:visual:states`；重出基线只在该平台跑 `pnpm visual:build:pages` / `pnpm visual:build:states`。
- 新增主题文件：先 `git add` 再跑 `gates:all` —— `verify-component-inventory` 只统计 tracked 文件。 <!-- D-0144 -->
