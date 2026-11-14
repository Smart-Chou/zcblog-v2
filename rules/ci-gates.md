# CI 门禁（ci-gates）

> 本文管：`scripts/gates/` 下 **19 个门禁脚本 + 1 个盘点工具**各自的判据、红意味着什么、怎么修，以及它们在 CI 里跑在哪一步、哪些阻断部署。
> **必读时机**：门禁红了、要加一个新门禁、要判断「这条能不能只跑本地」、或要解释「为什么 CI 绿了线上还是坏的」。
> 与 `rules/project-rules.md` §7（提交前最小集）分工：那边说「什么时候跑哪条」，这边说「每条到底在查什么」。逐条判据的实现以脚本源码为准——本文写的是**读源码后的结论**。
> **门禁的结论只看 exit code 与末尾汇总行**（`RESULT PASS …` / `结果：N/N PASS`），不看日志里有没有 FAIL 字样。用 `| tail` 会吞掉退出码，请 `node …; echo exit=$?`。

---

## 1. 名单（2026-11-14 实测）

| # | 脚本 | 层 | 项数 | 现状 |
|---|---|---|---|---|
| 1 | `check-tokens.mjs` | 源码 | 10 | **10/10 PASS** |
| 2 | `verify-atoms.mjs` | 源码 | 18（P1–P10 + A1–A8） | **18/18 PASS** |
| 3 | `verify-atom-docs.mjs` | 源码（`--dist` 加 D8） | 8 | **8/8 PASS** |
| 4 | `verify-component-docs.mjs` | 源码（`--dist` 加 D8） | 10 | **10/10 PASS**（38 份文档） |
| 5 | `verify-component-inventory.mjs` | 源码 + git | 7（I1–I7） | PASS `total=51` |
| 6 | `verify-doc-drift.mjs` | 源码 | 4（D1–D4） | PASS `mismatch=0` |
| 7 | `verify-surface-tokens.mjs` | 源码 | 5（P1–P3 + C1–C2） | PASS `baseline=41/84` |
| 8 | `verify-entities.mjs` | 源码 | 14（E1–E11） | **14/14 PASS** |
| 9 | `verify-i18n.mjs` | 源码（`VERIFY_I18N_DIST=1` 加 I9/I10） | 8+2 | **8/8 PASS**（10 locale / 241 键） |
| 10 | `verify-icon-sprite.mjs` | 生成物 | 9（S1–S8） | **9/9 PASS**（引用 58 个） |
| 11 | `verify-package-boundary.mjs` | 源码 + 包 | 5（W0 + B1–B4） | PASS `packages=3 violations=0` |
| 12 | `verify-overlay.mjs` | git + 清单 | 8（O0–O7） | **当前红**：`unclassified=2`（`docs/licenses/*` 未登记，先于本文件存在） |
| 13 | `verify-og.mjs` | dist + 行为探针 | 7（O1–O7） | 5/7：O6/O7 因探针模块加载失败而红 |
| 14 | `verify-deploy-artifacts.mjs` | dist | 8 组（A0–A7） | PASS `stubs=276/276` |
| 15 | `verify-m3-exit.mjs` | 装配 + 真实安装 | 5（P1/P2/P3/P7/P10） | 未在本机跑（需 `pnpm`/`git`，单项墙钟 ≤30:00） |
| 16 | `check-content-contract.py` | 内容（A2b） | 24 个允许键 | PASS（90 篇 0 未知键） |
| 17 | `check-legacy-keys.py` | 内容（A2） | 14 个旧键 | PASS（90 篇 0 遗留键） |
| 18 | `check-relative-assets.py` | 内容（A3） | 1 类判据 | PASS（22/22 可解析） |
| 19 | `perf-budget.py` | dist | 3 个页面类型 | PASS（765 页 0 超支） |
| — | `content_inventory.py` | **工具，不是门禁** | — | 供 A2/A3 复用的 frontmatter 解析器 |

`content_inventory.py` 是 G1 的内容盘点工具（`python3 scripts/gates/content_inventory.py <content-dir> [--json out.json]`），退出码不表达契约；A2/A3 通过 `import parse_frontmatter` 复用它。不要把它当第六道内容门禁。

## 2. `pnpm gates:all` 恰好包含 10 个

`verify-atoms` → `verify-atom-docs` → `verify-component-inventory` → `verify-doc-drift` → `check-tokens` → `verify-surface-tokens` → `verify-entities` → `verify-package-boundary` → `verify-overlay` → `verify-icon-sprite`。全是串行 `&&`，任一红即停。<!-- package.json scripts.gates:all -->

**不在这 10 个里的**：`verify-component-docs`、`verify-i18n`、`verify-og`、`verify-deploy-artifacts`、`verify-m3-exit`、三道内容门禁、`perf-budget`。所以「`gates:all` 绿」≠「全部门禁绿」——内容与 dist 层要另外跑。

## 3. 逐门判据

### 3.1 `check-tokens.mjs` — token 契约（10 道）

| 项 | 查什么 | 红 = | 修 |
|---|---|---|---|
| G-T1 | `build-tokens.mjs --check` 重新生成与 `tokens.css` 逐字节相同 | 手改了生成物，或改 JSON 没重编 | 跑 `node packages/tokens/scripts/build-tokens.mjs`，别手改 `tokens.css` |
| G-T2 | `semantic.light` / `dark` 键集合相等 | 加语义色只加了一侧 | 两侧同加，深色值必须实测对比度 |
| G-T3 | `DESIGN §3.4` 的 `--color-*` 行 = `tokens.json` semantic 键集合 | 文档与 JSON 两套口径 | 改文档或改 JSON，二者同源 |
| G-T4 | `src/components`、`src/pages`、`src/styles/*.css` 里 `--palette-` 出现 0 次 | 绕过语义层直接用原始色 | 换成 `--color-*`；palette 只在 `tokens.css` |
| G-S1 | palette 值域全 6 位 hex | 写了 alpha / 简写 / 命名色 | alpha 只允许出现在 semantic 的三个叠层字面量 |
| G-S2 | primitive 键名均以 `--` 开头 | 写了不带前缀的键 | 键名 = CSS 变量名 |
| G-S3 | semantic 值只引用 palette 且引用真实存在 | 引用了不存在的 palette 档 / 引用了别的 `--color-*` | 语义值只能引 palette 或 color-mix |
| G-S4 | responsive 键只允许 `base` / `max-<bp>`，且只有 `--layout-header-height` | 新开 responsive token | 断点用 `--bp-*` 媒体查询，不要 responsive token |
| G-S5 | 生成物每条 `--x:` 的出现次数与 JSON 期望完全相等 | 有重复声明 / 漏声明 | 查 JSON 是否有同键两处 |
| G-S6 | `designDoc` 指针可解析、快照 md5 与 `docs/DESIGN.vendor.json` 一致 | 改了 `docs/DESIGN.md` 没更新 vendor 快照 | 同步两处；真源在治理仓 |

**红的意义**：token 是唯一的颜色/尺寸真源，这一门红说明「代码与契约已经分叉」，不是格式问题。

### 3.2 `verify-atoms.mjs` — DESIGN §5.6 自检（18 项）

文档侧 P1–P10：12 个小节都在 / 五个字段各 12 次 / 本节无字面颜色 / 无 palette / token 名都来自 `tokens.json` / 尺寸只剩 `1px`·`2px` / 状态词在 §5.4 八词闭集内 / 无 Tailwind / 无 utility 类名 / 白名单自洽。<!-- DESIGN §5.6.13-C -->

组件侧 A1–A8：12 个组件文件都在 / 0 字面颜色 / 0 Tailwind / token 都存在 / **0 JS（`<script>`、`client:*` 各 0）** / **交互组件统一焦点环（`outline: 2px solid var(--color-ring-focus)`）** / 尺寸字面量白名单 / 无硬编码中文。

**修法**：渲染侧问题改组件源码；P 系列问题改 `DESIGN §5.6` 或该组件白名单，二者必须同时改。别为了让 P10 变绿而扩大白名单——白名单即契约。
**已知覆盖边界**：`SPECS` 只枚举 M1 的 12 个，`§5.6.13–15`（PageHero/SectionHead/DataState）不受这套扫描。<!-- DESIGN §5.6.13 末段 · D-0168 第 5 项 -->

### 3.3 文档三件套

- `verify-atom-docs.mjs`（8 项）：15 份数据都在 / 七项字段非空 / 15 个页面都在且用 `<AtomDoc>`+`<DemoFrame>` / token 可解析 / 文档层 0 字面色 / 0 Tailwind / px 只 `0·1px·2px` /（`--dist`）7 section 无空表。**红 = 文档与组件不同批交付**。
- `verify-component-docs.mjs`（10 项，D0–D9）：23 个 legacy UI 各一份七章节文档，外加 registry 可解析（D0）、示例区有画框（D8）、与 `docs/component-inventory.json` 对账（D9）。**D5 的特殊口径**：数据 JSON 里的字面值与尺寸必须能在组件源码逐字找到——legacy 组件本来就有硬编码值，文档只能引用、不许发明。
- `verify-doc-drift.mjs`（4 项，D1–D4）：改了 `DESIGN §5.6` 的 props/states/对比度却没同步 `_docs/data/*.json` 即红；只校验可机器判定的部分（对比度数字、token 名），文案语义靠评审。已知缺口冻结在 `FROZEN_TOKEN_GAPS`，**新增缺口即红**。

### 3.4 `verify-component-inventory.mjs` — P9 的分母（I1–I7）

I1 registry ↔ 15 份 data 一一对应；I2 atoms 记录与 `data.source` 一致；I3 `src/components/UI/*.astro` 25 个文件都在清单（24 `ui` + 1 个 `layout` 壳 `PostCardShell`）；I4 `src/components/Pages/*.astro` 每个文件都必须登记（`status=debt`，不写文档）；I5 slug 全局唯一、与 atom 同名必须 `ui-` 前缀；I6 **三方一致**（`FROZEN_COUNTS` = 清单自报 = 源码实测）；I7 `usage_count` 是快照，0 引用且非 `dead` 即红（过期只告警）。

**修法**：加组件就同批改清单与 `FROZEN_COUNTS`；清理死组件要显式标 `status: dead`，不能靠删记录；`usage` 漂移跑 `--update` 重写。<!-- D-0168 第 3 项 -->

### 3.5 `verify-surface-tokens.mjs` — P5 棘轮

- `src/pages/**`：hex/rgb/hsl = 0；Tailwind = 0；px 只 `0·1px·2px` + `@media` 断点（存量冻结在 `pages_exempt`，**新增一条即红**）。
- `src/components/**`（非 atom/molecule）：颜色字面量必须已在 `docs/surface-token-baseline.json`，**只减不增**（`--update` 拒绝变长）。
- 现状 `baseline=41/84`：84 是冻结上限，41 是当前实际条数。**改 `FROZEN_COMPONENT_TOTAL` = 放宽棘轮**，必须走 review 并记账。<!-- verify-surface-tokens.mjs 常量区 -->

### 3.6 `verify-entities.mjs` — C 层实体契约（E1–E11）

数据文件存在且导出数组 + `meta` / schema 通过 / 可选字段 present-only / `ENTITY_CONTRACT_VERSION` 等于期望值 / id 唯一 / zh+en 路由都在 / 导航入口在 / 空数组可构建 / 180 天新鲜度 WARN（**不 fail**）/ 负向自检（数据驱动 + 值级坏样例）/ 参照完整性 / **真实数据 `dropped = 0` 硬断言**。

设计取舍：**运行时宽容、CI 严格**，共用同一份校验器——不要为让门禁变绿而在页面里吞异常，也不要为让页面能跑而放宽校验器。`--json` 会把 `SUMMARY {...}` 打在最后一行供 CI 归档。

### 3.7 `verify-i18n.mjs` — 注册表 / 回退链 / 路由（I1–I10）

I1 registry ↔ 词典双向一致 / I2 `astro.config.mjs` 的 i18n 段与 registry 一致 / I3 词典形状（键 ⊆ zh 基准、叶子是字符串、空串只在 zh 也为空时）/ **I4 路由关键键 100% 直译** / I5 任何键在任何语言下都能取到值 / I6 覆盖率 ≥45% 棘轮 / I7 5 个 `[locale]` 模板路由存在且不与静态语言目录撞名 / I8 `I18N_LOCALES` 开关语义 / I9·I10（`VERIFY_I18N_DIST=1`）dist 里 8 语言路由落盘、且产物无原始 key。
**为什么跑真代码**：它把 `src/utils/i18n.ts` 复制成临时模块后真 import，纯正则扫描会在「改了逻辑但文本一样」时假绿。
**现状**：10 locale / 241 基准键；zh、en 100%，其余 55.6%。加文案只加 zh+en 不会红，但 I4 的 120 个路由键必须直译。

### 3.8 `verify-icon-sprite.mjs` — sprite 与清单漂移（S1–S8）

`sprite` 文件存在且是 `<svg>`+`<g id>` / `SPRITE_VERSION` = sprite 的 sha256 前 8 位 / 清单每个图标在 sprite 里有同名 `<g>` / sprite 每个 `<g>` 在清单里查得到 / id 唯一不含 `:` / `ICON_INLINE_ONLY` 不在 sprite 里 / `_headers` 有 `/icons.svg` immutable / **S8 源码引用的图标都在清单里**。
**红 = 忘了跑 `node scripts/generate-icons.js`**，症状是线上缺图或缓存不失效，而构建不报错。S8 是补上「清单↔sprite 两侧都查、中间源码引用无人查」的缺口后加的。<!-- D-0173 -->

### 3.9 `verify-package-boundary.mjs` — 包边界（W0 + B1–B4）

W0 workspace 声明 + 三包 manifest/版本 lockstep + 发布状态合规（`tokens`/`og-image` 可发布、`ui` 仍 private）；B1 包内 `~/` 别名 = 0；B2 包内站点身份串 = 0（唯一豁免：包自身 npm name）；B3 依赖 ⊆ 白名单且站内互引必须 `workspace:*`；B4 站点私有数据（`src/data`、`src/config`、`src/assets/qr`、`public/assets/note` 抽样）不进包。
**红 = 主题已经偷偷依赖站点**，这是「能不能交给第二个客户」的判据。

### 3.10 `verify-overlay.mjs` — T/O/X 契约（O0–O7）

O0 清单自洽（`manifestVersion`/`theme`/`classes`/`anchors` 齐、`theme.version` 与根 `package.json` lockstep、`changeLog` 每条是 `D-NNNN` + 合法日期 + 非空说明）；**O1 `git ls-files` 每个文件恰好命中一类，`unclassified=0`**；O2 不得同时命中两类；O3 T/O 每条规则至少命中 1 个 tracked 文件（死规则即红，`reserved` 允许 0 命中）；O4 anchors 存在且分类符合声明；O5 `theme-sync --list` 与门禁同口径；O6 七个合成探针落对类；O7 `apps/<site>/` overlay 字段完整。
**最常见的红**：新增了顶层文件/目录但没在 `site.manifest.json` 加规则（先 `git add` 才会被扫到）。**修法**：给新目录在清单里落一条规则，再跑 `--report` 看分类分布。**T 还是 X 有硬判据，别猜**：T（theme）会被 `theme-sync --apply` 覆盖并随主题包分发，只给「主题代码与主题工具链」；X（exclude）是「构建产物、缓存、评审档案、**Agent 上下文**」，AI 工具目录（`.claude/**`、`.agents/**`）一律 X。落进 T 的后果是下游站点执行 theme-sync 时被覆盖。`AGENTS.md`、`rules/**` 是给人读的治理文档 → T；`.agents/skills/**` 是 Agent 上下文 → X。<!-- D-0144 · D-0183 -->

### 3.11 dist 层三门

- `verify-og.mjs [dist]`：`dist/og/*.png` 数 = 文章页数；slug 双向一致；每张是真 PNG 1200×630（读 IHDR）；每页 `og:image` 指向自己的图；包内 `~/` = 0；O6 字体契约探针（本地字体能出图 / 指错文件必须抛错不静默降级）；O7 未知 slug → 404。**O6/O7 需要把包内 TS 复制到 `.astro/og-probe` 再 import**，该目录为空就报「探针模块加载失败」——那是探针自身故障，不是图坏了。<!-- verify-og.mjs prepareProbeModule -->
- `verify-deploy-artifacts.mjs <dist> [--target gh-pages|cloudflare|vercel] [--expect-site URL]`：规范域名注入、`/tag/:tag → /tags/:tag/` 三目标各自能力、两套平台跳转配置与构建期桩互为镜像（单跳、不链式）、缓存头、**root-only 部署（产物不得有 `<base href>`）**。汇总 `stubs=N/N`。它在 `demo.yml` 与 `deploy-matrix.sh` 里是阻断项。
- `perf-budget.py <dist>`：按 article/list/page 统计 HTML 原文与 JS/CSS gzip，与 `BUDGET` 比；`TARGET` 只报告不阻断；`--scale`/`PERF_BUDGET_SCALE` 只为负向验证存在。退出码 `0` 全在预算内 / `1` 超支 / `2` 用法或 dist 缺失。**预算是棘轮，只许往下调**。<!-- D-0051 · D-0052 -->

### 3.12 内容三道（详见 `rules/content-contract.md`）

- `check-content-contract.py`（**A2b 未知键**）：允许键 = `content.config.ts` 的 18 个 schema 键 ∪ `normalize-frontmatter.mjs` 消费的 6 个 = 24；两份清单都从源文件解析，不手抄。退出码 `0` 全认识 / `1` 有未知键（部署必须中断）/ `2` 门禁自身故障（含**空内容目录**）。**必须在 normalize 之前跑**，否则 v1 旧键已被删掉、看不见。<!-- D-0166 · D-0167 · D-0179 -->
- `check-legacy-keys.py`（A2 已知旧键）：`LEGACY` 手抄清单（`mermaid mathjax katex plantuml chart markmap tabs fancybox reveal paid type palette rendering references`），只查有 `pubDate` 的真实文章。退出码 `0`/`1`。它是 A2b 的前身，**对没见过的新字段天生失明**——别把它当契约门禁。
- `check-relative-assets.py`（A3 相对图）：三种形态（Markdown `![]()`、HTML `<img src>`、frontmatter `image.url`）都查，非 `http(s)://`、非 `/` 开头、非 `#`/`data:` 即命中；`--verify <code-repo>` 解析能否找到文件；`--expect 22` 锁处数。退出码 `0`/`1`。

### 3.13 `verify-m3-exit.mjs` — M3 出口五项（重活）

`--all` 或指定 `P1 P7`；P1 可安装（装配 + 真实 `pnpm install --frozen-lockfile` + `astro build`，墙钟 ≤30:00）、P2 可配置（改 overlay 标题/域名后主题 0 文件变化）、P3 可升级（dry-run 计数 + 真实 apply + 回滚）、P7 质量（clean clone 0 文章构建 + 四道门禁）、P10 客户零（装配产物每个 T 文件与发布 tag 的 blob 逐字节相同）。退出码 `0`/`1`/`2`（参数错），汇总行 `RESULT PASS  p1=PASS …`。
**只在发布/里程碑前跑**：它要联网装依赖、要 `git`、要 drill refs（`docs/upgrade.md §6`），不适合每次提交。

## 4. CI 里各门的位置

`.github/workflows/ci.yml` 四个 job：

| job | 步骤里的门禁 |
|---|---|
| `test` | `pnpm lint` → `type-check` → `test:unit` → `verify-atoms` + `verify-atom-docs` → `verify-component-inventory` + `verify-doc-drift` |
| `contract` | `check-tokens` → `verify-surface-tokens` → `verify-package-boundary` → `verify-entities --json` |
| `visual` | 视觉基线四套（atoms 72 / pages 42 / states 36 / player 12，各连跑两遍）+ docs a11y |
| `gates` | 真实内容构建 → `verify-build.mjs` → `verify-atom-docs --dist` → `check-legacy-keys` + `check-relative-assets --expect 22` → `perf-budget` |

其余 workflow：`deploy.yml` 里 **`check-content-contract.py` 在最前（normalize 之前）**，之后 `check-tokens` → `verify-surface-tokens` → `verify-entities` → build → `verify-build.mjs` → A2/A3 → `perf-budget` → lint，全绿才 `wrangler pages deploy`；`perf.yml` 单独跑 `perf-budget`（阈值同一份 `BUDGET`）；`demo.yml` 与 `deploy-matrix.yml`/`deploy-matrix.sh` 跑 `verify-deploy-artifacts`；`release.yml` 跑 `pnpm gates:all`；`a11y-pr.yml`/`a11y-nightly.yml` 跑 `export-audit.spec.ts`（axe strict）。<!-- 各 workflow 实测 -->

**没接任何 workflow 的门禁**：`verify-i18n`、`verify-og`、`verify-component-docs`、`verify-m3-exit`（只有 npm script）。它们目前是「本地/里程碑手动门禁」，不要声称它们挡住了 CI。<!-- grep .github/workflows + package.json -->

## 5. 哪些是阻断性的

- **阻断部署**（`deploy.yml` 任一红即中断，不许注释、不许加 `|| true`）：A2b 内容契约、token 契约、P5 棘轮、实体契约、build、`verify-build.mjs`、A2、A3、性能预算、lint。只有两个 `fetch:*` 步骤被显式容忍。<!-- D-0175 -->
- **阻断合并**（PR 上红）：`test` / `contract` / `visual` / `gates` **四个 job 的全部步骤**（`gates` job 要 checkout 私有内容仓，需要 `ARTICLES_PAT`）。
- **只报告不阻断**：`report-data-freshness.mjs`（数据新鲜度）、实体 E7 的 180 天 WARN、inventory 的过期快照告警、`perf-budget` 的 `TARGET` 列。
- **里程碑门禁**：`verify-m3-exit` 五项。

## 6. 红了先做这四件事

1. **看 exit code，不看日志末尾**：管道会吞状态；`RESULT FAIL` 之后紧跟 `exit=0` 的现场是假的。
2. **确认你跑的是同一条命令**：CI 用 `node scripts/gates/<脚本名>.mjs`，本地别加包装，也别只跑 `pnpm gates:all` 就以为覆盖了内容层。
3. **区分「门禁抓对了」与「门禁自己坏了」**：A2b 的退出码 `2`、`verify-og` 的探针加载失败、`verify-overlay` 的 `unclassified` 都属于「先修门禁/清单，不是先改业务」。
4. **别为了让门禁变绿而放宽判据**：`FROZEN_COUNTS`、`FROZEN_COMPONENT_TOTAL`、`pages_exempt`、`FROZEN_TOKEN_GAPS` 都是棘轮；动它们等于改契约，必须走 review 并在 `decision-log.md` 记账。
