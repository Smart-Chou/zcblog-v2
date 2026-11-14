---
name: zcblog-dev-workflow
description: Daily development workflow for the zcblog-v2 Astro blog theme - which gates to run for each kind of change, cache clearing, commit conventions, and false-red triage. Use when building, testing, validating, formatting, committing, or debugging a red gate in zcblog-v2.
---

# zcblog-v2 开发工作流：从改代码到提交

本仓是 Astro 7 + 原生 CSS + pnpm 的内容站点兼主题源码。所有命令在仓库根执行；包管理器锁 pnpm（`preinstall` 里的 `only-allow pnpm`，`packageManager: pnpm@12.10.1`）。硬性规则见 `AGENTS.md` 与 `rules/`，本页只收敛「改了什么 → 跑什么 → 红了怎么判断」。

## 本地起站

```bash
pnpm dev            # astro dev，http://localhost:4321
pnpm dev:clean      # 先 rm -rf node_modules/.vite 再起
pnpm build          # 全量构建（normalize + fetch + astro build + 压缩 HTML）
pnpm preview        # 预览 dist/，e2e 与视觉比对用的就是它
```

`pnpm dev` 不跑 normalize 与 fetch：本地想看真实文章前，先按 `zcblog-content-ops` 把内容仓文章 `cp` 进 `src/content/article/` 并跑一次 `pnpm normalize:content`。

## 改什么 → 跑哪些门禁

| 你改了什么 | 必跑 | 说明 |
|---|---|---|
| `src/pages/**`、`src/layouts/**`、`src/components/**` | `pnpm build` → `pnpm test:e2e` | e2e 自带 `astro preview` 服务 `dist/`，不 build 等于拿旧产物测 |
| `src/utils/**`、`src/scripts/**`、`*.test.ts` | `pnpm test:unit` | vitest，实测 14 文件 / 163 用例，约 3s |
| `packages/tokens/tokens.json`、`packages/tokens/tokens.css`、影响颜色的 `src/styles/**` | `pnpm gates:tokens` + `pnpm gates:surfaces` | 10 条 token 契约（实测 10/10 PASS）+ P5 棘轮（颜色只减不增） |
| 新增 / 删除 `src/components/**` 文件 | 先 `git add`，再 `pnpm gates:all` | `verify-overlay` 的 O1 只扫 `git ls-files`：未 tracked 的文件既不分类也不违规，commit 之后才 `unclassified=N` 红（D-0144）|
| `site.manifest.json` | `node scripts/gates/verify-overlay.mjs --report` | T/O/X 归属判据；改清单必须留一条 D-NNNN，否则 O0 红 |
| `src/content.config.ts`、`scripts/normalize-frontmatter.mjs`、文章 frontmatter | `python3 scripts/gates/check-content-contract.py src/content/article` | 必须在 normalize **之前**跑；schema 是 `.strict()`（D-0179）|
| `docs/DESIGN.md` | 同步 `docs/DESIGN.vendor.json` 的 md5 / bytes / lines，再 `pnpm gates:tokens` | G-S6 只比指针，改一处漏一处即红 |
| 影响外观的 token 值、布局、图标 | `pnpm test:visual:pages` / `pnpm test:visual:states` | 基线按平台生成，macOS 与 Linux 的图互不认 |
| 任何准备提交的改动 | `pnpm gates:all` + `pnpm lint` + `pnpm type-check` | `gates:all` 串 10 个常驻门禁（`scripts/gates/` 共 20 个脚本，其余按类型单跑）；`lint` = `prettier --check .`（只读）|

## 缓存清理

以下都在 `.gitignore` 里，删掉不丢源码：

- `node_modules/.vite` — Vite 预打包缓存。改了样式/组件但 dev 不生效时清（`pnpm dev:clean` 即 `rm -rf node_modules/.vite && astro dev`）。
- `.astro` — Astro 的内容层与类型缓存。动过 `src/content.config.ts` 或 remark/rehype 插件后必须清，否则 `astro sync` 继续用旧 schema。
- `dist/` — 构建产物；e2e 与视觉比对都读它。怀疑「测到旧页面」时重跑 `pnpm build`。
- `.cache/data-fetch-status.jsonl` — fetch 脚本的上报日志，新鲜度报告读它；要重测抓取先删。

## 提交约定

- Conventional commits：`type(scope): subject`，`type` 取 `feat` / `fix` / `test` / `docs` / `refactor` / `chore`。
- `git add -u` + 显式 `git add <新文件>`，**不要 `git add -A`**：仓根的 `.scratch-*` / `dist-*` 取证目录虽已 gitignore，但别靠它兜。
- 门禁红不提交；**未经用户确认不要 commit / push**。
- `src/content/article/` 永不提交 —— 它是内容仓的构建缓存，见 `zcblog-content-ops`。

## 常见假红

- `net::ERR_CONNECTION_REFUSED` 或比对到旧页面：本机残留的 `astro preview` 占了 4321 端口。`playwright.config.ts` 已设 `reuseExistingServer: false`，仍建议先 `pkill -f "astro preview"`。
- 视觉 diff 尺寸完全一致、差异只落在动态区（导航图标、chips、页脚）：先判断是否 intentional，不要直接 `--update-snapshots`。D-0173 的教训是旧基线把图标缺失固化成「正确」。
- 平台跑错：用 macOS 图对 Linux CI 必然红；Linux 基线只在 `mcr.microsoft.com/playwright:v1.63.0-noble` 里生成。
- `gates:all` 报 `unclassified=1`：新文件没 `git add`（见上表）。
- 内容门禁「突然全绿」：先确认它在 normalize 之前跑的 —— normalize 删掉 v1 布尔键后，A2b 就看不见那类违规。
- `pnpm lint` 红但文件没动：它扫全仓 `.`（含 markdown），用 `pnpm exec prettier --check <路径>` 定位。
- `pnpm format` 带 `-w`，会写盘 —— 永远不要当只读检查用。
- `pnpm type-check` 现在无已知例外（`tsc --noEmit` 干净退出）；别照搬其他 Astro 仓库「过滤掉 N 个 TS9013」的习惯。

## 必读

- `AGENTS.md` — 必遵规则 12 条、必读文档清单、验证命令。
- `rules/ci-gates.md` — 每条门禁的判据与失败含义。
- `rules/pitfalls.md` — 完整踩坑记录（本页只留高频项）。
- `.agents/skills/zcblog-new-feature/SKILL.md` — 加功能时的有序流程。
