# AGENTS.md · zcblog-v2

## Summary

zcblog-v2 是中文内容型个人站的 Astro 主题与组件系统（主题名 Dogeared，包 `@marxchou/dogeared-*`）；首个客户 marxchou.com，当前生产站 https://zcblog-v2.pages.dev（`push main` 自动部署，D-0175）。
技术栈 = **Astro 7 + 原生 CSS（`tokens.json` → `tokens.css` + `src/styles/`）+ pnpm**。**不是** Tailwind（已移除：禁 utility class / `@apply` / `@theme`，D-0100），**不是** Svelte（无 `.svelte`、无框架 `client:*` 组件）。
双仓 + 仓外治理：文章真源在私有仓 `Smart-Chou/zcblog-articles`，本仓 `src/content/article/` 是 gitignored 的构建缓存（手改会在下次部署被覆盖）；治理仓 `blog2.0` 在代码仓外，仓内 `docs/` 是它的可移植快照。
指导体系三层：本文件（总纲）→ `rules/` + `docs/`（硬性规则与契约）→ `.agents/skills/`（按任务触发的入口，不重复下层内容）。

## Must-follow rules

- 颜色只走语义 token：`--palette-*` 只允许出现在 `tokens.css`；`src/components` / `src/pages` / 其它样式表里出现 `--palette-*`、hex、`rgb()/hsl()` 即违规。 <!-- DESIGN §3.12.3 G-T4 / §6.1 N2 · D-0109 -->
- 尺寸不写字面量：除 `0` / `1px` / `2px` / 百分比 / `auto` 外，一律用 `--space-*` `--text-*` `--radius-*` `--shadow-*`；A7 逐行扫 12 个核心组件（10 atom + 2 molecule）。 <!-- DESIGN §5.6 A7 -->
- 组件分层单向：atom 不得 import molecule/organism/page，组件不得 import `layouts/`，L1–L3 不得 import `~/config` `~/data` `~/content`；`packages/*` 不得用 `~/` 别名反向读站点代码。 <!-- DESIGN §4.2 D1–D4 · docs/package-boundary.md -->
- atom/molecule 保持 0 JS（无 `<script>`、无 `client:*`）。需要生命周期或跨页单例的交互，升 organism 并在 DESIGN §5.7 立规格再写。 <!-- DESIGN §5.6 A5 / §5.7 -->
- 用户可见文案不硬编码：10 份词典在 `src/data/i18n/*.json`，fallback 链在 `src/utils/i18n.ts`；组件内中文字面量由 A8 判红。 <!-- DESIGN §5.6 A8 -->
- 视觉基线按平台各自生成（macOS / Linux），CI 只认 Linux 的 `maxDiffPixels: 0`；更新基线前逐张确认差异是 intentional —— 旧基线曾把一个图标缺陷固化成了「正确」。 <!-- D-0173 · playwright.config.ts -->
- 视觉改动必须过 screenshot baseline，新功能不得突破 JS/CSS 预算；两者冲突时砍功能，不砍预算。 <!-- D-0133 · DESIGN §7 -->
- 卡粒度 = 一个路由或一个组件族 + 一条 e2e spec；源文件 ≤4 个、净新增 ≤300 行、只碰一个子系统。地基卡（`base.css` / `components.css` / tokens / shell）先做，叶卡再并行。 <!-- D-0149 -->
- frontmatter 归一化只走脚本：内容仓的 v1 布尔键由 `pnpm normalize:content` 转成 `features[]`。手改成 v2 键是绕过契约；增量同步文章后必须重跑一次 build。 <!-- D-0167 · D-0174 -->
- 门禁失败即中断部署：`deploy.yml` 的步骤不许注释、不许加 `|| true` 绕过；`build` 脚本里只有 `fetch:all` / `fetch:verify` 两步被显式容忍。 <!-- D-0175 -->
- 新增主题文件（新组件、新 sprite、新 public 资源）先 `git add` 再跑 `gates:all` —— `verify-overlay` 的 O1 只扫 `git ls-files`，未 tracked 的文件既不分类也不算违规，等你 commit 后才 `unclassified=N` 红。 <!-- D-0144 -->
- 新决策写进 `decision-log.md`（D-xxxx，只增不改）；数字必须来自命令输出或 CI run，不接受「我本地试过」。 <!-- 12-product-charter.md §5 -->

## Required documents

仓内（clone 到任何机器都有效，优先读这些）：

- `rules/project-rules.md` — 项目硬性规则、提交约定与门禁总表。required before 任何提交。
- `rules/component-api.md` — 组件 props / API 面与 §5.6 规格的对应关系。required before 改或新增 `src/components/**`。
- `rules/ci-gates.md` — 每条门禁的判据、失败含义与「不许绕过」清单。required before 加跑、跳过或排查门禁。
- `rules/a11y.md` — axe 的五个 WCAG tag、serious/critical 判红、`contrast incomplete` 不算通过、键盘与焦点环硬要求、`axe-known.json` 棘轮（当前为空数组，即全站 0 条 serious/critical）。required before 改交互组件、focus 样式或 `--color-ring-focus`。
- `rules/css-important.md` — `!important` 的五类合法场景、六类严禁与三问准入，以及「先加 `html` 前缀补特异性，不够再硬顶」的本仓做法。required before 在任何 CSS 里写 `!important`。
- `rules/visual-regression.md` — 基线的平台 / 阈值 / 更新与复验流程。required before 动视觉基线或改影响外观的 token。
- `rules/content-contract.md` — 内容模型契约 v6（`.strict()`）与 normalize 规则。required before 改 `src/content.config.ts` 或处理文章。
- `rules/pitfalls.md` — 已踩过的坑（缓存、假红、平台差异）。required before 把一次失败当新问题排查。
- `docs/DESIGN.md` — 视觉与组件契约真源快照（v1.2.0，2974 行；§3 token / §4 分层 / §5 组件规格 / §6 禁止项 / §7 预算）。required before 改 token / 组件 / 层级 / 动效。它是仓外真源的逐字节快照，md5 记在 `docs/DESIGN.vendor.json`，G-S6 校验该指针 —— 改一处必须同步另一处。
- `docs/overlay-contract.md` — T（主题可覆盖）/ O（站点身份，一字不动）/ X（缓存不入清单）的路径归属。required before 动 `site.manifest.json` 或 `theme-sync`。
- `docs/package-boundary.md` — `packages/*` 三包边界 B1–B4 与判据。required before 动 `packages/*` 或跨包 import。
- `docs/deploy-matrix.md` — GitHub Pages / Cloudflare Pages / Vercel 同一份产物的适配层。required before 改 `astro.config.mjs` 部署相关、`_redirects`、`vercel.json`。
- `docs/06-performance-budget.md` — `BUDGET` / `TARGET` 两级阈值、棘轮约定（只许下调）、`--scale` 负向验证、JS 跟随静态 import 链的口径。required before 动 `perf-budget.py` 的阈值、改首屏脚本或引入新依赖。
- `docs/release.md` — Changesets lockstep 发布链（只有 tag 推送或手动 dispatch 才进发布）。required before 发布或改 `release.yml`。
- `docs/upgrade.md` — 站点维护者升级手册：哪些文件被覆盖、哪些绝对不动。required before 升级主题或迁移站点。
- `docs/npm-consumer.md` — 只消费 npm 包（不 fork 主题）的接入与回滚矩阵。required before 支持外部消费者。
- `docs/component-inventory.json` — 组件清单的唯一分母（`gates:inventory` 消费；不要在文档或指令里手抄第二份计数）。

仓外（治理仓 `blog2.0`；**仅在本机有效**，clone 到别处时以仓内 `rules/` 与 `docs/` 为准）：

- `~/Documents/hermes-desktop-files/blog2.0/docs/decision-log.md` — 2,500+ 行只增不改的决策记录。required before 任何「我要改个规矩」的动作：先搜你的改动是否已有 D-xxxx。
- `~/Documents/hermes-desktop-files/blog2.0/docs/12-product-charter.md` — 产品边界、技术栈禁令、许可证（代码 MIT + NOTICE）。required before 引入依赖或扩大范围。
- `~/Documents/hermes-desktop-files/blog2.0/docs/挂起事项登记-20261113.md` — 已知缺口登记（H-01…H-10，含已完成与已作废项）。required before 把一个现象当「新 bug」修。

## Validation

- 改源码：`pnpm build`（`normalize:content` → `fetch:all` → `fetch:verify` → `astro build` → 压缩 HTML；当前 `dist/` 765 个 `index.html`）。
- 改 TS / 工具函数：`pnpm test:unit`（vitest，**14 文件 / 163 用例**，约 3s）。
- 改页面 / 组件：`pnpm test:e2e`（Playwright，**49 个 spec**；它自带 `astro preview` 服务 `dist/`，所以先 `pnpm build`）。
- 改 token / 样式：`pnpm gates:tokens`（10 条 token 契约，实测 10/10 PASS）与 `pnpm gates:surfaces`（P5 棘轮，颜色只减不增）。
- 提交前：`pnpm gates:all`（串 10 个常驻门禁；`scripts/gates/` 下共 20 个脚本，其余按改动类型单跑，逐条见 `rules/ci-gates.md`）+ `pnpm lint`（= `prettier --check .`，只读）+ `pnpm type-check`（`tsc --noEmit`）。`pnpm format` 带 `-w`，别拿它当检查。
- 部署前额外：`node scripts/verify-build.mjs`（A1/A11/A13 + pagefind）与 `python3 scripts/gates/perf-budget.py dist`。
- 内容：`python3 scripts/gates/check-content-contract.py src/content/article` —— 必须在 normalize **之前**跑（normalize 会吃掉 v1 布尔键，之后跑就看不见那类违规，D-0179）。
- 视觉：`pnpm test:visual:pages` / `pnpm test:visual:states`；重出基线只在该平台跑 `pnpm visual:build:pages` / `pnpm visual:build:states`。
- 新增主题文件：先 `git add` 再跑 `gates:all`（见 Must-follow rules 第 11 条，D-0144）。
