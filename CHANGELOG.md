# 变更记录

本仓 `@marxchou/zcblog`（主题 `dogeared`，`private: true`，**不发布 npm**）的版本变更。
格式沿用 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)：`minor` 内的变更不 breaking，breaking 只随 `minor` 一起发（§3.5）。

升级步骤见 [`docs/upgrade.md`](docs/upgrade.md)；T/O/X 契约见 [`docs/overlay-contract.md`](docs/overlay-contract.md)。

---

## [Unreleased]

（M4：公开发布 npm / Changesets、`🔧` 六组件去 config 化、子路径部署、12 个 ✅ 原语迁移，均未开始。）

---

## [2.1.0] — 2026-11-05 · 双仓产品化（M3）

主题从「一个能构建的站点」变成「一个能装、能覆盖、能升级的主题」。**站点侧升级到本版无需改任何 overlay 文件**（O 侧 0 变更，见 `node scripts/gates/verify-m3-exit.mjs P3`）。

### Added

- **pnpm workspace + 三个内部包**（`private: true`，不发布）：
  - `packages/tokens` —— 设计 token 真源 `tokens.json` → 生成物 `tokens.css`（逐字节校验）+ 原语/调色板 `variables.css` + `build-tokens.mjs`（带 `--check`）。零运行时依赖。
  - `packages/ui` —— 零依赖原语：`Badge`（M3-3a）、`Button`（M3-3b）。其余原语留 M4。
  - `packages/og-image` —— `createOgImageRoute(options)` route factory：出 1200×630 PNG，文章列表/站点身份/调色板/字体全部由主题侧注入，包内 `~/` 引用为 0。
- **包装配契约与门禁**：`site.manifest.json`（T/O/X 三类路径唯一真值）、`scripts/gates/verify-overlay.mjs`（O0–O7）、`scripts/gates/verify-package-boundary.mjs`（W0 + B1–B4）、`docs/package-boundary.md`、`docs/overlay-contract.md`。
- **升级工具** `scripts/theme-sync.mjs`：`--dry-run` / `--apply` / `--list theme|overlay|exclude`；按清单分类，O 侧与未分类变更一律 exit 1。
- **装配器** `scripts/create-site.mjs` + 示例站 `apps/demo`（overlay 字段完整性校验与门禁同一份判据）。
- **三目标部署矩阵**：`scripts/deploy-matrix.sh`（GH Pages / Cloudflare Pages / Vercel，各自注入 `SITE_URL` 构建 + 产物断言）、`scripts/gates/verify-deploy-artifacts.mjs`、`public/_redirects`、`.github/workflows/deploy-matrix.yml`、`docs/deploy-matrix.md`。
- **出口门禁** `scripts/gates/verify-m3-exit.mjs`（P1 可安装 / P2 可配置 / P3 可升级 / P7 质量 / P10 客户零）与 `pnpm gates:m3-exit`。
- **本文档** `docs/upgrade.md`：升级流程、计时口径、演练复现、已知限制与排错。

### Changed

- `tokens.json` / `tokens.css` 迁入 `packages/tokens/`；`variables.css` 从 `src/styles/` 移入包内，`src/styles/global.css` 改为 `@import url(../../packages/tokens/variables.css)`。
- `Badge.astro` / `Button.astro` 迁入 `packages/ui/src/`；站点侧保留同名**符号链接**（`src/components/UI/Badge.astro` → `packages/ui/src/Badge.astro`），因此页面 import 路径不变。
- `src/integrations/og-image*.ts` 降为薄适配层：组装 options（文章、站点身份、主题色、字体）后挂 `/og/[...og].png`。
- `check-tokens.mjs` 改为从 `packages/tokens` 读真源与生成物（判据不变，仍 10/10）。
- `vercel.json` 显式声明 `buildCommand` / `outputDirectory`，不再依赖平台自动检测。
- `theme-template/` 降级为「示例 overlay 基线」，由 `apps/demo` + `create-site.mjs` 取代 `snapshot-theme.mjs` 的单向快照角色。

### Breaking

> 面向**主题消费者**（直接引用内部路径的项目）。本仓站点与新示例站都不受影响（符号链接 + 适配层）。

- 直接引用 `src/styles/variables.css` 的地方改为 `packages/tokens/variables.css`。
- 直接引用组件实现的路径改为 `packages/ui/src/<Primitive>.astro`。
- `packages/*` 版本与根 `package.json` **lockstep**（三包 + 根同 minor 一起 bump，`verify-package-boundary` W0 强制）；站内引用一律 `workspace:*`，不接受 `^2.x` 自引用范围。

### Known limitations

- 只支持**根路径**部署：`import.meta.env.BASE_URL` 引用 0 处，`href="/…"` 硬编码 46 处（2026-11-05 复测），子路径部署必然 404。
- GitHub Pages 无 301、无自定义 header；`/tag/:tag → /tags/:tag/` 只能 meta-refresh 桩。
- `CHANGELOG.md` 与 `site.manifest.json` 归 O 侧：跨版本区间里它们会以 `overlay_changed>0` 触发 `theme-sync` 拒绝，发布动作需单独 commit（`docs/upgrade.md` §7.3）。
- clean clone 没有文章（`src/content/article/` 被 gitignore），构建走空态，110 页、exit 0。
- OG 图字体默认走网络，离线环境必须显式传 `fonts`。

### 验证

```bash
pnpm gates:all                                # 14 条横切门禁（PR 级）
node scripts/gates/verify-m3-exit.mjs --all   # 出口五项 P1–P3/P7/P10
bash scripts/deploy-matrix.sh                 # 三目标矩阵（GH Pages / Cloudflare / Vercel）
```

---

## [2.0.0] — 2026-11-05 · 基线

M2 结束时的站点/主题同树状态，M3 的升级起点。tag `v2.0.0` 落于 M3-5（`theme-sync` 需要一个可复跑的分类基线），因此它**包含** M3-1…M3-5 的包骨架：从 `v2.0.0` 到 `v2.1.0` 的区间是 M3-6…M3-8。

内容：Astro 7 站点（476 HTML、95 条路由、zh/en 双语）、`/design/` 组件与 atom 文档站、14 条门禁脚本、24 个 Playwright spec + 144 张视觉基线、OG 图生成、Pagefind 搜索、Waline 评论、PWA。

已知债（未在 2.1.0 处理）：`list` 类 JS gzip p95 余量 0.0KB（R-44）、`🔧` 六组件仍读 `~/config`、`⛔` 五组件永留主题。
