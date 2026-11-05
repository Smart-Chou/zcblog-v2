# content overlay 契约（T / O / X）· 判据与升级工具

> M3-5 产物 · 依据 `blog2.0/docs/21-m3-plan.md` §4（D-0116 范围冻结）· 门禁 `node scripts/gates/verify-overlay.mjs --report` · 升级工具 `node scripts/theme-sync.mjs`
>
> 这一页是 §4.1「三类路径」的**可执行版本**：每条路径归属都由 `site.manifest.json` 声明，由门禁逐文件核对。没有「文档写了但没人检查」的条目；反向也成立——脚本里出现的每条检查都在这里解释为什么存在。

## 1. 一句话

主题升级只允许改 **T**；**O** 是站点的身份/内容/数据/资产，一个字节都不许动；**X** 是构建缓存与评审档案，两边都不入清单。

升级的自动化判据是两条命令，不是靠人记：

```bash
node scripts/gates/verify-overlay.mjs --report   # 每个 tracked 文件都要落到 T/O/X 之一
node scripts/theme-sync.mjs --from v2.0.0 --to <新 tag> --dry-run   # overlay_changed 必须为 0
```

## 2. 三类路径

| 类 | 含义 | 升级行为 | 今天实测文件数（`git ls-files` 口径） |
|---|---|---|---|
| **T · theme** | 主题代码与主题工具链 | `theme-sync --apply` 覆盖 | 674 |
| **O · overlay** | 站点身份 / 内容 / 数据 / 资产 / 部署适配 | 永不触碰（工具不写、门禁报红） | 289 |
| **X · exclude** | 构建产物、缓存、评审档案、Agent 上下文 | 不动、不入任一清单 | 49 |

合计 **1012** = `git ls-files` 当前总数；`unclassified=0`、`ambiguous=0`。

### 2.1 计划基线 998 → 实测 1012（delta +14）

§4.1 的 998 是**计划冻结时**的实测值。此后四张卡各自新增了 T 文件，一件没删：

| 来源卡 | 新增 tracked 文件 |
|---|---|
| M3-1 | `docs/package-boundary.md`、`scripts/gates/verify-package-boundary.mjs` |
| M3-2 | `packages/tokens/{package.json,tokens.json,tokens.css}`（`variables.css`/`build-tokens.mjs` 是 rename，不计新增） |
| M3-3a/3b | `packages/ui/{package.json,src/index.ts,src/Badge.astro,src/Button.astro}` |
| M3-4 | `packages/og-image/{package.json,src/index.ts,src/route.ts,src/types.ts}`、`scripts/gates/verify-og.mjs` |

`git diff --name-status --diff-filter=A c2d894a^ HEAD | wc -l` = **14**（`--diff-filter=D` = 0），所以 998 + 14 = 1012 完全对上。门禁把这两个数字一起打印（`plan_baseline=998 delta=+14`），delta 只会因为**新增 tracked 文件**变化——那一刻正是契约需要重新确认的时刻。M3-5 自己新增的 4 个文件（`site.manifest.json`、`scripts/theme-sync.mjs`、`scripts/gates/verify-overlay.mjs`、`docs/overlay-contract.md`）提交后 delta 变成 `+18`。

## 3. 判据表（`scripts/gates/verify-overlay.mjs`）

| # | 判据 | 命中后果 | 怎么改 |
|---|---|---|---|
| **O0** | `site.manifest.json` 可解析；`manifestVersion=1`；`theme` / `planBaseline` / `classes` / `overrides` / `anchors` 齐；`theme.version` 与根 `package.json` 的 `version`、`theme.package` 与 `name` lockstep；`overrides` 无重复/非法类 | FAIL | 改清单；版本随主题一起 bump（M3-1 的 W0 已经在管三包 lockstep） |
| **O1** | `git ls-files -z` 的每个文件恰好命中一类 → `unclassified=0` | FAIL | 见 §5：先判断归属，再往 `classes.*.rules` 加一条，不要往 T 里默认塞 |
| **O2** | 同一路径不得同时命中 T/O/X → `ambiguous=0`（`overrides` 精确路径优先，合法） | FAIL | 收紧规则（例：`src/data/**` 会与 `src/data/i18n/**` 撞车，所以拆成 `src/data/*.json` + `entities` + `adapters`） |
| **O3** | T/O 的每条 `rules` 至少命中 1 个 tracked 文件（死规则 = 契约漂移）；`reserved` 允许 0 命中 | FAIL（仅 `rules`） | 路径已消失就删规则；路径将出现就写进 `reserved` |
| **O4** | `anchors` 逐个存在且分类符合声明；T/O/X 三侧都要有代表路径 | FAIL | 补锚点（锚点是「契约没被写成一段空话」的样本） |
| **O5** | `theme-sync --list theme\|overlay\|exclude` 的行数与门禁计数完全一致 | FAIL | 说明工具和门禁各拿了一份真值——R-47 的直接成因。工具必须继续 import 门禁的分类器 |
| **O6** | 7 个合成探针（T / O / override / X / 构建目录 / 未分类）落到预期类 | FAIL | 分类器本身坏了，先修分类器 |

汇总行固定为 `RESULT PASS  classified=<N> unclassified=0 theme=… overlay=… exclude=… plan_baseline=998 delta=+D`，FAIL 时 `RESULT FAIL …`，退出码 1。

## 4. 判定细则（每条都可以被追问「凭什么」）

**总原则：代码归主题（T），数据与身份归站点（O）。** §4.2 已经用同一把尺子量过「数据」层：`src/data/adapters/*.ts` 定义形状与空态、`src/data/*.json` 是站点数据——形状是代码，值是数据。这条原则推到目录级就是下表的每一行。

| 路径 | 类 | 理由 |
|---|---|---|
| `src/components/**`、`layouts`、`pages`、`styles`、`utils`、`scripts`、`integrations`、`remark-plugin`、`rehype-plugin`、`schemas`、`types` | T | §4.1 原文列举 |
| `src/config/index.ts` | T | §1 表格已标注：`src/config/` 里只有 `index.ts` 是主题 glue，另外 4 个是站点值 |
| `src/config/{site,feature,ui,services}.ts` | O | §4.1 原文；§4.3「用户要改的」第一行 |
| `src/content/**`（今天 3 个法务页） | O | §4.1 原文。§4.4 的目录树把法务页写成 T「主题默认页」，两处冲突时**以 §4.1/§4.3 为准**（卡纪律：按 §4.1 分类）。要改成 T 必须先改 §4.1 并重跑门禁 |
| `src/data/*.json`、`entities/**`、`adapters/**` | O | §4.1 原文（23 个）。`i18n/` 除外 |
| `src/data/i18n/**`（10 个词典） | T | §4.1 原文：词典属主题（i18n 是主题能力，站点只覆盖译法时才另开 overlay） |
| `src/assets/**`（52） | O | §4.1 原文（含 `logo.svg`、`404.svg`、`qr/*` 主题默认值仍归站点，因为站点会替换它） |
| `public/assets/note/**`（192）、`public/images/**`（10）、`public/cover.png`、`public/a9c7….txt` | O | §4.1 原文（站点图片与站点校验文件） |
| `public/fonts/**`、`favicon.*`、`logo.webp`、`assets/rss/**` | T | §4.1 原文 |
| `scripts/**`（含 `gates/`、`fetch-*.mjs`、`postbuild/`） | T | §4.1 只点名了 `scripts/gates/**`，但 fetch/postbuild 是**代码**：站点值从 `src/config` 与 `.env` 读，产物（`src/data/*.json`、图标）落在 O。按「代码 T / 数据 O」归 T。见 §6 待确认第 1 条 |
| `.github/workflows/{ci,perf,a11y-pr,a11y-nightly,friend-link}.yml`、`friend-link.mjs`、`ISSUE_TEMPLATE/friend-link.yml` | T | §4.1「`.github/workflows/**`（除站点专属）」。友链自动化是主题特性（README「可选能力」列了它），不是某一站的发布配置 |
| `.github/workflows/deploy.yml` | O | 唯一的「站点专属」workflow：它写死了本仓的发布目标（CF Pages 项目 / GitHub Pages / `ARTICLES_PAT`） |
| `vercel.json`、`public/_headers` | O | §4.2「部署」行：平台配置属站点适配层（`deploy/<platform>/` 的同类物）。M3-7 新增 `public/_redirects` 时同样归 O（已写在 `reserved`） |
| `packages/**`（13） | T | §4.1 原文；包内边界另由 M3-1 的 B1–B4 管 |
| `e2e/**`（168） | T | §4.1 原文 |
| `theme-template/**`（40） | T | §4.1 原文 + D-E ①：它是示例 overlay 基线，但基线本身随主题版本走 |
| `docs/{DESIGN.md,DESIGN.vendor.json,component-inventory.json,surface-token-baseline.json}` | T | §4.1 原文 |
| `docs/package-boundary.md`、`docs/overlay-contract.md` | T | 主题的判据文档，随主题分发 |
| `docs/_reviews/**`（47） | X | 卡纪律与 §4.1 原文：项目证据，不随主题分发 |
| `.claude/**`（2） | X | Agent 上下文（PRODUCT/DESIGN 摘要），既不是主题代码也不是站点身份 |
| 根 `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `astro.config.mjs` / `tsconfig.json` / `playwright.config.ts` / `vitest.config.ts` / `.npmrc` / `.prettierrc.mjs` / `.prettierignore` / `.editorconfig` / `.gitignore` / `.env.example` / `README.md` / `CONTRIBUTING.md` / `LICENSE` | T | §4.4 目录树把它们列在主题侧（`package.json` 的 `name`/`version` 由 overlay 覆盖，见 §7） |
| `site.manifest.json` | O | 站点自己的清单（声明本站在跟哪个主题版本）。工具**不**代写它，见 §7 |
| 构建/缓存目录 `dist/`、`node_modules/`、`.astro/`、`.vite-cache/`、`playwright-report/`、`test-results/`、`.git/` | X | §4.1 原文；它们本来就不在 `git ls-files` 里，写成 `reserved` 是为了文档完整 |

## 5. 新增/删除路径时的动作

1. 跑 `node scripts/gates/verify-overlay.mjs`。新文件会出现在 `O1 未分类` 里（**这是设计意图**：R-47 不允许默认塞进 T）。
2. 按 §4 的原则判断归属：
   - 主题代码 / 主题工具链 → T；站点值、站点内容、站点资产、平台配置 → O；构建缓存、评审档案 → X。
   - 判不出来就**停下来问**，不要写进 T。写错 T 的代价是升级时静默覆盖站点文件。
3. 加到 `site.manifest.json` 的 `classes.<T|O|X>.rules`。将来才出现的路径写 `rules` 会让 O3 判红（死规则），那种情况写 `reserved`。
4. 精确路径优先于 glob：`src/styles/site.css`（§4.2 允许站点新增的唯一样式文件）写在 `overrides` 里归 O，否则会被 `src/styles/**` 判成 T。
5. 重跑门禁 + `node scripts/theme-sync.mjs --list theme` 自检。

## 6. 需要 PO 确认的 3 条判断（不是默认值，是判断后写在清单里的）

| # | 判断 | 现取 | 若改成另一边的影响 |
|---|---|---|---|
| 1 | 根 `scripts/**`（fetch-*、postbuild、pagefind、verify-*）归 T | T（代码归主题、数据归 O） | 改 O 则主题修 fetch bug 永远到不了站点；改 T 后要保证脚本不写死站点身份（`check-personalization` 已在管） |
| 2 | `public/_headers`、`vercel.json` 归 O | O（部署适配属站点） | 改 T 则主题升级会改站点缓存/重定向策略，M3-7 的三目标矩阵会互相踩 |
| 3 | `src/content/pages/*`（3 个法务页）归 O | O（§4.1/§4.3） | 改 T 则 §4.4 的「主题默认法务页」成立，但站点改过的法务文案会在升级时被覆盖 |

## 7. `theme-sync` 用法与语义

```bash
# 预览：区间内哪些文件会变，T/O 各多少（P3 可升级的判据命令）
node scripts/theme-sync.mjs --from v2.0.0 --to HEAD --dry-run
# 带示例站 overlay 目录：该目录整棵一律算 O（不看清单规则）
node scripts/theme-sync.mjs --from v2.0.0 --to drill/v2.1.0 --dry-run --overlay apps/demo
# 应用：只覆盖 T 路径；T 路径有未提交改动时拒绝
node scripts/theme-sync.mjs --from v2.0.0 --to v2.1.0 --apply
# 给 P10 用：列出某一类的全部路径
git diff --name-only v2.1.0..HEAD -- $(node scripts/theme-sync.mjs --list theme)   # 期望 0 行
```

| 行为 | 判据 |
|---|---|
| `overlay_changed>0` | 退出码 1。区间里出现了 O 侧变更 → 这不是纯主题升级 |
| `unclassified_changed>0` | 退出码 1。清单漏规则（R-47），先补规则，没有绕过参数 |
| `--apply` 写盘范围 | 只写 T；对每个待写路径先查 `git status --porcelain`，有未提交改动就整体拒绝 |
| `--apply` 与清单 | 工具**不**改 `site.manifest.json`（它属 O）。`theme.ref` 的推进由人在复核 diff 后确认 |
| `--from` 缺省 | 用 `site.manifest.json` 的 `theme.ref` |
| git ref 不存在 | 退出码 2，并打印可用标签与打基线的命令 |

P3（跨 minor 升级 overlay 侧 0 文件变更）与 P10（主题文件与 tag 逐字节相同）都落在同一条路径上：`--list theme` 给路径，`git diff` 给结论，`overlay_changed` 给计数。

## 8. 回滚

```bash
git reset --hard <M3-5 之前的 commit>
git clean -fd site.manifest.json docs/overlay-contract.md scripts/theme-sync.mjs scripts/gates/verify-overlay.mjs
git tag -d v2.0.0          # 只有在 M3-5 打过基线标签时才需要
```

门禁与工具都是**只读**脚本（`--apply` 之外不写盘），回滚不涉及数据迁移。
