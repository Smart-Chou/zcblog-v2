# 项目规则（project rules）

> 本文管：项目定位、技术栈禁令、分层骨架、提交与格式化、质量闸门总表、环境与命令。**新增代码前必读。**
> 与 `rules/component-api.md`（组件接口）、`rules/ci-gates.md`（19 个门禁逐条）、`rules/visual-regression.md`（像素基线）、`rules/content-contract.md`（frontmatter）、`rules/pitfalls.md`（踩坑）分工：本文只给「是什么 / 不许做什么」，机制细节在那五篇。
> 治理真源在代码仓外：`blog2.0/docs/DESIGN.md`（设计契约）、`decision-log.md`（只增不改的决策记录）。仓内 `docs/DESIGN.md` 是门禁校验用的快照，不是撰写地。

---

## 1. 项目定位

zcblog-v2 = 可发布的 Astro 博客主题「Dogeared（折角）」，包名 `@marxchou/dogeared-*`。`marxchou.com` 是第一个客户，不是唯一客户。

- 三种形态共用一份源码：**源码站**（本仓 `pnpm build`）、**overlay 装配站**（`scripts/create-site.mjs` + `apps/<site>/`）、**npm 消费**（只装 `@marxchou/dogeared-tokens` / `og-image`）。改主题源码时三种形态都要能跑。<!-- docs/overlay-contract.md · docs/npm-consumer.md -->
- 当前生产站 = `https://zcblog-v2.pages.dev`（CF Pages production）。`marxchou.com` 代码冻结在 `83747e1`，只照更文章。<!-- D-0174 · D-0175 -->
- 设计语言是「折角纸 + 语义 token」，不是组件库拼装：颜色/尺寸/动效一律从 token 取，组件只消费 token。

## 2. 技术栈：Astro 7 + 原生 CSS + pnpm，没有第四样

| 允许 | 版本锚点 |
|---|---|
| Astro | `astro ^7.3.6`（`package.json`） |
| CSS | 原生 CSS + CSS 自定义属性，分层在 `src/styles/` |
| 包管理 | `pnpm`，`packageManager: pnpm@12.10.1`，`preinstall` 用 `only-allow pnpm` 硬挡 npm/yarn |
| 语言 | TypeScript（`pnpm type-check` = `tsc --noEmit`） |

**严禁 Tailwind**：不写 utility class、不写 `@apply`、不写 `@theme`、不引入 `tailwindcss` / `@tailwindcss/vite`。P8（DESIGN §5.6.13-C）、A3（组件）、C2（`src/components/**`）三道门禁扫这三个词，命中即红。<!-- D-0100 · DESIGN §6.1 N1/N3 -->

**严禁 Svelte 5**（当前阶段不做）。需要交互 → 升 organism 写原生 JS/TS，并按 `DESIGN §5.7` 立规格。<!-- D-0108 · D-0147 -->

**严禁第二套设计系统**：不从外部项目整体移植 token 体系/工具类体系；可以学机制，直接移植代码须保留 MIT 声明并更新 `NOTICE`。<!-- D-0147 -->

**颜色只有一条路**：组件/页面只允许语义 token（`--color-*`）；`--palette-*` 只允许出现在 `tokens.css`（生成物）。`src/components`、`src/pages`、其它样式表里出现 `--palette-*` / hex / `rgb()` / `hsl()` 即违规。<!-- DESIGN §3.12.3 G-T4 · §6.1 N1/N2 -->

**尺寸不写字面量**：除 `0` / `1px` / `2px` / 百分比 / `auto` 外一律用 `--space-*` `--text-*` `--radius-*` `--shadow-*`；12 个核心组件由 A7 机器判红。<!-- DESIGN §5.6 A7 · §6.1 N3 -->

## 3. 分层结构：五层单向，反向 import 一律禁止

```
L0 token  src/styles/tokens/tokens.css（生成物，不手改）
L1 atom   src/components/UI/atom/       只消费 token + Icons/*
L2 molecule src/components/UI/molecule/ 组合 2+ atom
L3 organism src/components/UI/organism/ 拥有行为 / 跨组件协作
L4 page   src/pages/ · src/layouts/     取数据、决定信息架构
infra     src/components/BaseHead/      非视觉（meta/JSON-LD/CSP），不许渲染可见 UI
```

- **目录名大写 `UI/`**。不要新建小写 `ui/`：macOS 大小写不敏感会直接撞进现有目录，Linux CI 上则出现两个。<!-- DESIGN §4.1 -->
- 跨层引用用别名（`~/`），禁止 `../../` 相对链；布局不是组件，组件不得 import `layouts/`。<!-- DESIGN §4.2 D2/D3 -->
- L1–L3 不得 import `~/config` `~/data` `~/content` `~/content.config`（数据由 props 注入）。<!-- DESIGN §4.2 D4 -->
- 每个组件必须在自己文档里声明层级；归层判定用 `DESIGN §4.4` 的四问，不要凭手感。

## 4. 内容与代码分离

- 文章与图片真源在私有仓 `Smart-Chou/zcblog-articles`；本仓 `src/content/article/` 是 gitignored 的构建缓存，**手改会在下次部署被覆盖**。
- 内容仓的文章带 v1 散字段，只能由 `pnpm normalize:content` 转成 `features[]`；手改成 v2 键等于绕过契约。<!-- D-0167 · D-0174 补记 -->
- 详情见 `rules/content-contract.md`。

## 5. 提交约定

- **Conventional Commits**：`feat|fix|docs|test|chore|style|perf|ci|refactor(scope): 摘要`，scope 用子系统名（`gates` / `deploy` / `visual` / `M8-6`）。<!-- CONTRIBUTING.md -->
- **一个提交只做一件可验证的事**（CONTRIBUTING 的「single purpose」）；门禁类工作要拆到「脚本与 spec」与「基线产物」可独立回退。<!-- D-0173 -->
- 不要 `git add -A` 把临时产物带进来，只加你确实改过的文件；**提交前先向人确认**。
- 改文章仓的 `.yml` 也要过 prettier——它的 workflow 会被下游 `prettier --check .` 约束。<!-- D-0175 -->

## 6. 格式化与 lint

- 格式化器只有 **prettier**（`prettier-plugin-astro`，`printWidth: 100`，`.prettierrc.mjs`）。
- `pnpm format` = `prettier -w .`（**写入**）；`pnpm lint` = `prettier --check .`（**只读**）。当检查用时永远用 `pnpm lint`，别拿 `-w` 当验证。
- 无 pre-commit hook（不用 husky/lint-staged）：`.git/hooks` 不进版本库，多 clone 不同步，只会制造「本地绿、CI 红」。格式债靠每张卡的第一次门禁束清。<!-- D-0113 -->
- `.prettierignore` 忽略 `*.md` / `*.mdx` / `src/data/*.json` / `pnpm-lock.yaml`，以及 **`packages/tokens/tokens.css`**（生成物，格式化会让 G-T1 逐字节比对永远红）。
- 不许手动格式化 `tokens.css` / `dist/**`：前者是生成物，后者是产物。

## 7. 质量闸门总表

本地提交前的最小集（全部 exit 0 才算过）：

| 命令 | 查什么 | 何时跑 |
|---|---|---|
| `pnpm lint` | prettier --check | 每次提交前 |
| `pnpm type-check` | `tsc --noEmit` | 改 TS / 工具函数 |
| `pnpm test:unit` | vitest | 改 TS / 纯函数 |
| `pnpm gates:all` | 10 个门禁脚本串行 | 每次提交前（见下） |
| `pnpm build` | normalize → fetch → astro build → 压 HTML | 改任何源码 |
| `pnpm test:e2e` | Playwright（自带 `astro preview`，**先 build**） | 改页面或组件 |
| `pnpm gates:tokens` / `gates:surfaces` | token 契约 / P5 棘轮 | 改 token 或组件样式 |
| `node scripts/verify-build.mjs` | A1/A11/A13 + pagefind | 部署前额外 |
| `python3 scripts/gates/perf-budget.py dist` | A6 性能预算 | 部署前额外 |

`pnpm gates:all` 恰好包含 10 个（顺序即执行顺序）：
`verify-atoms` → `verify-atom-docs` → `verify-component-inventory` → `verify-doc-drift` → `check-tokens` → `verify-surface-tokens` → `verify-entities` → `verify-package-boundary` → `verify-overlay` → `verify-icon-sprite`。<!-- package.json scripts.gates:all -->

- 新增主题文件要**先 `git add` 再跑 `gates:all`**：`verify-overlay` 的 O1 只扫 `git ls-files`，未 tracked 的新文件既不算分类也不算违规，跑完才发现 `unclassified=1`。<!-- D-0144 -->
- 新增目录（如 `rules/`）同样要在 `site.manifest.json` 里落一条 T/O/X 规则，否则 O1 会红。<!-- site.manifest.json classes · verify-overlay O1 -->
- **skipped ≠ PASS**：上游步骤失败后 GitHub 显示「跳过」而不是红，门禁事实上停摆。加步骤时不要让它依赖一个可能失败的软步骤。<!-- D-0113 · D-0172 -->
- 逐条判据、失败含义、修法见 `rules/ci-gates.md`。

## 8. 环境与命令

- 包管理器只有 pnpm（`corepack enable` 即可获得锁定版本）。`pnpm install --frozen-lockfile` 是 CI 的唯一装法。
- `pnpm dev` 起 Astro dev；`pnpm build` 是全量构建（会先 normalize 内容、再跑 `fetch:all`，两个 fetch 用 `(… || true)` 容忍，normalize 保持硬失败）。<!-- D-0174 补记 · D-0178 -->
- `pnpm build:ci` = normalize + astro build + 压 HTML，**不跑 fetch**；CI 与视觉基线构建用这条。
- `pnpm preview` 读 `dist/`。视觉门禁需要 `astro preview`，所以先 build。
- Node：CI 里 `test`/`contract` job 用 Node 24，`gates`/`deploy`/`perf` 用 Node 22；本地不要用更老的版本验证，与 CI 结论不同步。
- macOS 自带 BSD grep 不支持 `-P`，`\u` 会被当字面量；含 CJK / Unicode 的匹配改用 Python 正则或 `rg`。<!-- D-0178 -->

## 9. 改动边界（卡粒度）

- 一张卡 = 一个路由或一个组件族 + 一条 e2e spec；源文件 ≤ 4 个、净新增 ≤ 300 行、只碰一个子系统。<!-- D-0149 -->
- 地基先做：`base.css` / `components.css` / tokens / 页面壳先落地，叶子卡再并行。
- 视觉改动必须过像素基线；新功能不得突破 JS/CSS 预算，两者冲突时砍功能、不砍预算。<!-- D-0133 · docs/06-performance-budget.md -->

## 10. 治理文档在哪里

- 设计契约真源：`blog2.0/docs/DESIGN.md`；仓内 `docs/DESIGN.md` + `docs/DESIGN.vendor.json` 是快照，`check-tokens` 的 G-S6 比 md5。重同步方式写在 `DESIGN.vendor.json` 的 `resyncCommand` 里：`cp <治理仓>/docs/DESIGN.md docs/DESIGN.md` → 更新该 JSON 的 `md5`/`bytes`/`lines`/`syncedAt` → 跑 `check-tokens`。只改数值不用重同步（G-T3 只认键名）。
- 决策记录：`blog2.0/docs/decision-log.md`（`D-xxxx`，只增不改）。动手改规矩前先搜有没有既有决策号。
- 本仓文档：`docs/overlay-contract.md`（T/O/X 分类）、`docs/package-boundary.md`（B1–B4）、`docs/component-inventory.json`（P9 分母）、`docs/surface-token-baseline.json`（P5 棘轮基线）。
