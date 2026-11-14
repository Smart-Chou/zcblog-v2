# 参与贡献

> 本文管：怎么报问题、怎么提功能、改了代码要跑什么、PR 会被怎么审。**第一次提 PR 前请通读一遍。**
> 不重复下层文档：硬约束在 `AGENTS.md` 与 `rules/`，机制细节在 `docs/`，按任务划分的流程在 `.agents/skills/`。

zcblog-v2（主题名 Dogeared，包 `@marxchou/dogeared-*`）是 Astro 7 + 原生 CSS + pnpm 的中文内容型博客主题。
`marxchou.com` 是第一个客户，不是唯一客户 —— 所以「合我的站」不等于「对主题成立」，改公共部分要照顾三种形态：源码站、overlay 装配站、npm 消费。
代码 MIT，见 `LICENSE` 与 `NOTICE`。

## 1. 怎么参与

| 你想做的事 | 入口 | 注意 |
| --- | --- | --- |
| 报一个 bug | [新建 Bug 报告](https://github.com/Smart-Chou/zcblog-v2/issues/new?template=bug_report.yml) | 一个 issue 一个现象，附复现步骤和错误日志 |
| 提一个功能 | [新建功能请求](https://github.com/Smart-Chou/zcblog-v2/issues/new?template=feature_request.yml) | 先说清「解决什么问题」，不要只写「我想要 X」 |
| 改代码 | Fork → 开分支 → 提 PR | 先读第 2 节与第 5 节 |
| 改自己的文章 / 站点配置 | 见第 4 节 | **不要**改本仓 `src/content/article/` |

本仓没有开 Discussions，问题都走 issue。使用与装配类问题先看 README 的「消费者入口」与 `docs/overlay-contract.md`；确实要报错时，请贴出你的 overlay 目录结构与实际构建命令。

## 2. 大改动先开 issue

一句话：**新功能、改设计、动 token、改分层、加依赖** —— 先开 issue 对齐方向，再写代码。

1. 先搜一遍现有 issue，再搜 `rules/` 与 `AGENTS.md` 的 Must-follow rules，确认不是已经定过的规矩。
2. 开 feature request，写清：解决什么问题、期望行为、影响范围（样式/token、组件、路由、构建门禁……）。
3. 等维护者回一句「可以」再动手。没等到回复就写完，很可能在 PR 阶段被判「方向不符」。
4. 小改动不必先开 issue：错别字、文档修正、有明确复现步骤的 bug 修复，直接提 PR。

为什么这么要求：这个仓库的改动有连带成本 —— 改 token 要重出视觉基线，加组件要补文档与组件清单，新增 `.github/` 文件要在 `site.manifest.json` 里登记，否则 `verify-overlay` 的 O1 会以 `unclassified=N` 报红。先把范围谈清楚，比事后返工便宜。

## 3. 本地开发

需要 Node 22 或 24（CI 的 `test` / `contract` job 用 24，`gates` / `deploy` 用 22；不要用更老的版本验证，结论会和 CI 不同步）。包管理器**只有 pnpm**：`package.json` 的 `preinstall` 跑 `npx only-allow pnpm`，用 npm / yarn 装依赖会直接失败。

```bash
git clone https://github.com/Smart-Chou/zcblog-v2.git
cd zcblog-v2
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

**不配任何环境变量也能跑起来。** `.env.example` 里的变量只影响外部数据区块（豆瓣、番剧、友链、统计、Blinko 等）：`build` 脚本里的 `fetch:all` 与 `fetch:verify` 两步都被 `|| true` 容忍，失败不中断构建。代价是这些区块停在仓库内的旧快照，首页的「最近」类区块可能和线上不一致 —— 这不是 bug，别为它开 issue。

另外两条常用命令：`pnpm build`（全量构建，产物在 `dist/`）、`pnpm preview`（读 `dist/` 起预览）。

## 4. 改文章 ≠ 改代码

文章与图片的真源在**私有仓** `Smart-Chou/zcblog-articles`。本仓的 `src/content/article/` 是 `.gitignore` 里的**构建缓存**，CI 在构建前从私有仓 checkout 再拷进来。

- 手改本仓 `src/content/article/` 的任何文件，下次构建/部署会被覆盖，PR 里也不会出现（它被 ignore 了）。
- 想把文章改到线上，去私有仓改；贡献者没有权限时，开 issue 说明要改哪篇，由维护者同步。
- frontmatter 的 v1 布尔键只由 `pnpm normalize:content` 转成 `features[]`，手改成 v2 键等于绕过契约（详见 `rules/content-contract.md`）。
- 改**主题代码**想看真实内容可以；改**内容**请走内容仓。这是两条互不相交的路。

## 5. 提交前必跑

### 5.1 每次提交都要过（全部 exit 0）

| 命令 | 实际做什么 | 通过的判据 |
| --- | --- | --- |
| `pnpm lint` | `prettier --check .`，**只读** | 末尾 `All matched files use Prettier code style!` |
| `pnpm type-check` | `tsc --noEmit` | 无输出即通过 |
| `pnpm test:unit` | vitest，14 文件 / 163 用例，约 3 秒 | `Tests 163 passed (163)` |
| `pnpm gates:all` | 串行 10 个门禁脚本，任一红即停 | 末尾 `RESULT PASS` 与各脚本的 `N/N PASS` |

**不要拿 `pnpm format` 当检查。** 它是 `prettier -w .`，会直接改写文件（包括你没打算动的）。要检查用 `pnpm lint`；确实要统一格式时才跑 `pnpm format`，之后逐项 review `git diff` 再提交。

看门禁结论只看 exit code 与末尾汇总行，不看日志里有没有 FAIL 字样 —— `pnpm gates:all | tail` 会把退出码吞掉，请用 `; echo exit=$?`。
已知红项：`verify-overlay` 的 O1 目前因 `docs/licenses/*` 未登记为 T 类而红（记录在 `rules/ci-gates.md` §1）。你的改动没碰这些文件时，在 PR 里说明一句即可，不要去改 `site.manifest.json` 里与本次无关的行。

### 5.2 按改动类型加跑

| 你改了什么 | 加跑 | 为什么 |
| --- | --- | --- |
| 任何源码 | `pnpm build` | 构建才是最终判据，`astro build` 会暴露类型以外的模板错误 |
| 页面 / 组件 / 布局 | `pnpm test:e2e` | Playwright 49 个 spec；它读 `dist/`，**所以先 `pnpm build`** |
| token / 样式 | `pnpm gates:tokens`、`pnpm gates:surfaces` | token 契约 10 条；P5 表面 token 棘轮（颜色只减不增） |
| 外观可见变化 | `pnpm test:visual:pages`（必要时加 `test:visual:states`） | 见第 6 节 |
| 组件新增或改名 | `pnpm gates:inventory`、`pnpm gates:docs` | 组件清单是唯一分母，文档要与规格对齐 |
| 内容模型 / frontmatter | `pnpm gates:content-contract` | 必须在 `normalize:content` **之前**跑，否则归一化会吃掉违规证据 |
| 新增主题文件 | 先 `git add`，再 `pnpm gates:all` | `verify-overlay` 只扫 `git ls-files`；未 tracked 的新文件不被分类，等 commit 后才 `unclassified=N` |

## 6. 改外观：基线要你自己重生

仓库有 **324 张** PNG 基线，按平台分账（macOS / Linux 各 162 张）。**CI 只认 Linux 那四套，判据是 `maxDiffPixels: 0`**，所以在 macOS 上重出的基线不会让 CI 变绿；Linux 集必须在 CI 用的同一个 Playwright 镜像（`mcr.microsoft.com/playwright:v1.63.0-noble`）里生成，命令写在 `README.md` 的「视觉基线（截图回归）」一节。

四条底线：

- 只在**你真的改了外观**时重出基线。为了让一次运行变绿而 `--update-snapshots`，会把缺陷固化成「正确」—— 这个坑踩过，旧基线曾把一个图标缺陷编码成基准。
- CI 永不自动更新基线，`--update-snapshots` 只能人工跑，且跑完要逐张看 diff。
- 重出后**连跑两遍**，两遍都过才算稳定；重试会把 flake 藏起来。
- 新增/删除基线页面时，`e2e/pages.visual.spec.ts` 的 `PAGES` 与两平台基线要一起改。

PR 里请说明：改了什么、重出了哪几套、各多少张、Linux 那一套是否在同一镜像里生成。逐条判据与假红排查见 `rules/visual-regression.md`。

## 7. 提交信息：Conventional Commits

格式 `feat|fix|docs|test|chore|style|perf|ci|refactor(scope): 摘要`，scope 用子系统名（`gates` / `components` / `visual` / `deploy` / `i18n` / `rules`）。中文摘要可以，但前缀与 scope 必须是英文小写。

```text
fix(gates): 让 verify-overlay 把 docs/licenses 归入 T 类
feat(components): 给 TagList 加折叠阈值，超过 6 个标签收进「+N」
docs(rules): 在 ci-gates 补 P5 棘轮的失败含义与修法
```

- 一个提交只做一件可验证的事。门禁类工作把「脚本与 spec」和「基线产物」拆成两个提交，方便单独回退。
- 不要写「修复了一些问题」这类无法定位的摘要；也不要在一个提交里混入 `pnpm format` 的全库改写。

## 8. PR 要求

PR 模板会逐项问你，这里说判据：

- **单个目的**。一个 PR 只解决一件事。重构 + 新功能 + 顺手格式化，会被要求拆开。
- **附验证输出**。不是「我跑过了」，而是把命令和末尾汇总行贴进 PR（例如 `Tests 163 passed (163)`、`RESULT PASS`、`All matched files use Prettier code style!`）。
- **改外观附截图**，明/暗两个主题各一张，并说明是否重生基线。
- **改 token 说明棘轮影响**：`gates:surfaces` 的基线是只减不增的，新增一处颜色用法要解释为什么不能复用现有语义 token。
- **不混入无关改动**。不要 `git add -A`：仓库里有大量 `dist-*` / `.scratch-*` / `playwright-report/` 之类的本地产物，误提交会让 review 无从下手。
- **破坏性变更单列一段「迁移方法」**（改组件 props、改内容契约、改 token 名），并同步 `docs/` 里对应的契约文件。

## 9. 这些 PR 会被直接关掉

- **引入 Tailwind**：不写 utility class、不写 `@apply` / `@theme`、不加 `tailwindcss` 依赖。P8 / A3 / C2 三道门禁扫这三个词，命中即红。
- **引入 Svelte 或任何框架组件**：仓里没有 `.svelte`，也没有 `client:*`。atom / molecule 保持 0 JS；需要交互请升 organism，并按 `docs/DESIGN.md` §5.7 先立规格。
- **引入第二套设计系统**：不整体移植外部项目的 token 体系或工具类体系。学机制可以；直接移植代码必须保留 MIT 声明并更新 `NOTICE`。
- **改 `docs/DESIGN.md` 的正文**：它是仓外治理仓的逐字节快照，md5 记在 `docs/DESIGN.vendor.json`，`check-tokens` 的 G-S6 会比对。要改设计契约请提 issue，由维护者同步两处。
- **动 `.github/workflows/deploy.yml` 的发布段**：`Deploy to Cloudflare Pages (production)` 及其后的步骤涉及生产凭据与 IndexNow 提交，只由维护者改。
- **提交 `src/content/article/` 或任何生成物**：`packages/tokens/tokens.css`（由 `tokens.json` 生成）、`public/icons.svg`（脚本生成）、`dist/` 都不手改。

## 10. 文档地图（先读再问）

| 你要做的事 | 读这个 |
| --- | --- |
| 搞清楚仓库定位与 12 条硬约束 | `AGENTS.md`（60 行索引） |
| 提交约定、门禁总表、环境命令 | `rules/project-rules.md` |
| 每条门禁查什么、红了怎么修 | `rules/ci-gates.md` |
| 改组件 / 加组件 | `rules/component-api.md` + `docs/DESIGN.md` §5 |
| 改 token / 样式 / 动效 | `docs/DESIGN.md` §3 §6 §7 + `rules/visual-regression.md` |
| 改内容模型 / frontmatter | `rules/content-contract.md` |
| 判断「这是不是已知问题」 | `rules/pitfalls.md` |
| 按任务走的流程（开发 / 新功能 / 内容运维） | `.agents/skills/` |
| 部署、发布、npm 消费、overlay 装配 | `docs/deploy-matrix.md`、`docs/release.md`、`docs/npm-consumer.md`、`docs/overlay-contract.md` |

治理真源在代码仓外（治理仓 `blog2.0` 的 `DESIGN.md` 与 `decision-log.md`，本机才有），仓内 `docs/` 是它的可移植快照。**clone 到别的机器时以仓内 `rules/` 与 `docs/` 为准** —— 仓外路径不存在不是错误。

## 11. 许可证

代码 MIT，见 `LICENSE`；第三方素材与移植代码的归属记在 `NOTICE`。提交 PR 即表示你同意以 MIT 授权你的贡献。改动里含从别处移植的代码时，请在 PR 描述里写明来源与许可证，并更新 `NOTICE`。
