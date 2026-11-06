# M5-7b · overlay 清单 + demo 漂移收口（R-47 / R-50）

> 卡：`blog2.0/docs/24-m5-plan.md` §M5-7b · 依赖 M5-7a（`ab6e15f`）· decision：D-0138 · 代码提交 `1b8d309` / 报告提交 `0d24ca7`
> 日期：2026-11-07 · 执行：blog-platform

## 0. 结论

两条产品化风险都从「文档里写了规则」变成「代码里挡住了」：

| 目标 | 判据 | 结果 |
|---|---|---|
| R-47 `unclassified=0` | `RESULT PASS classified=1141 unclassified=0 theme=723 overlay=302 exclude=116` | ✅ 0 未分类 / 0 歧义 |
| R-47 `site.manifest.json` 是唯一清单 | `theme-sync` / `create-site` 都 import 门禁分类器，O5 反向核对三类计数 | ✅ 单一真值 |
| R-47 清单变更写 decision log | 新增必填 `changeLog`（`D-NNNN` + 日期 + 说明），格式错即 O0 红 | ✅ 由判据管，不再只靠自觉 |
| R-47 禁止 `--force` 通行 | CLI 只认 `--report` / `--root <dir>`，其余参数 exit 2 | ✅ 参数面 = 能力面 |
| R-50 本地与 demo CI 同口径 | 四步命令与 `demo.yml` 逐条相同；CI/本地跑出同样的数字 | ✅ dist 224 文件、overlay 10 文件均 0 命中 |
| R-50 身份串扫描 = 0 | `check-personalization --mode=dist`（原 CI 内联 grep 的判据） | ✅ 0（`@marxchou/` 包名单独计数） |
| R-50 部署产物与当前 commit 一致 | `pages deployment list` source = `1b8d309` = HEAD；线上与本地 `dist` 抽样逐字节比对 | ✅ 仅差 build 时间戳 |
| 验收 `gates:all` PASS | 9 个门禁 | ✅ |
| 验收 demo workflow 绿 | run `42259005676`（build + deploy 两个 job） | ✅ |
| 验收 无生产站变更 | `deploy.yml` 仅 `workflow_dispatch`；本次无 Deploy run（最近一次 2026-10-31） | ✅ |

## 1. 改了什么

| 文件 | 改动 | 为什么 |
|---|---|---|
| `site.manifest.json` | 新增必填 `changeLog: [{decision, date, summary}]`（首条 `D-0138`）；`$comment` 写明留痕要求 | 清单是唯一真值，「改动要写 decision log」就该留在这份文件里，而不是只写在文档 |
| `scripts/gates/verify-overlay.mjs` | ① `loadManifest()` 增 `changeLog` 判据（`D-NNNN`、`YYYY-MM-DD`、说明 ≥8 字、decision 不复用、日期不倒序）；② CLI 拒绝未定义参数（`--force` / `--skip` / `--allow-unclassified` → exit 2）；③ O0 打印最新 changeLog 条目 | ①把流程规则变成可执行判据；②原先未知参数被静默忽略，`--force` 不改变行为却让人以为拿到了通行证 |
| `scripts/check-personalization.mjs` | 新增 `--mode=dist`：大小写敏感的昵称/缩写/个人域名三串（与原 `demo.yml` grep 同判据），`@marxchou/` 包名单列计数；`--mode=dist` 必须配 `--dir` | 身份扫描原本只存在于 workflow 的内联 shell 里，本地无法复用 → 这是 R-50「本地与 CI 各一套」的根 |
| `.github/workflows/demo.yml` | 身份扫描 step 改为调 `check-personalization.mjs --mode=dist`（dist + `apps/demo` 两次）；`paths` 补该脚本 | CI 与本地共用一条命令；判据脚本变了才触发，防止「改了判据 CI 不跑」 |
| `apps/demo/README.md` | 本地部署段补成与 CI 逐条对应的四步（含两次身份扫描）；已知限制一节的数字改成复测结论；说明文字里不再出现身份串 | 原 README 少了身份扫描一步；而 overlay 源目录也被扫描，README 里写身份串就会红 |
| `docs/overlay-contract.md` | 计数 1046→1141（T723/O302/X116）+ §2.3 增量的逐目录明细；§3 判据表加 `changeLog` 与 **CLI** 两行；§5 增「改清单必须同时写 changeLog + decision-log」 | 契约文档必须与判据同步，否则又是「文档写了没人查」 |

没有改：`src/**`、`packages/*/src/**`（0 改动）、性能/视觉预算、包版本、发布流水线。**分类规则一条未改**——1141 与 1046 的差额（+95：M5 期 86 个新增文件 + 本卡 9 个评审档案）全部落进既有规则。

## 2. R-47：分类与清单

`gates:all`（完整日志 `gates-all.log`，计数含本卡落盘的 9 个评审档案）：

```
RESULT PASS  classified=1141 unclassified=0 theme=723 overlay=302 exclude=116 plan_baseline=998 delta=+143
O0  site.manifest.json 自洽 + 版本 lockstep   PASS
    · changeLog 1 条，最新 D-0138 2026-11-07
O1  tracked 文件全覆盖（unclassified=0）      PASS
O2  唯一归属（ambiguous=0）                   PASS
O3  规则活性（T/O 无死规则）                   PASS
O4  锚点分类符合声明（31 个）                  PASS
O5  theme-sync --list 与门禁同口径            PASS
O6  分类探针（含 override / 未分类）           PASS
O7  示例 overlay 字段完整（1 个）              PASS
    · apps/demo files=10 configs=4 articles=1 data=1 → PASS
```

**唯一清单的证据**（不是「我认为」）：`scripts/theme-sync.mjs` 与 `scripts/create-site.mjs` 都从 `verify-overlay.mjs` 导入 `loadManifest / compileManifest / classifyWith`，没有第二份通配实现；O5 再把 `theme-sync --list theme|overlay|exclude` 的行数与门禁计数逐类对齐（723/302/107），两边只要各拿一份真值就立刻红。

## 3. R-47 负向探针（证明新判据真的会红）

原始输出：`negative-probes.txt`。

| 探针 | 期望 | 实测 |
|---|---|---|
| `changeLog: []` | 红 | `changeLog 缺失或为空` ✅ |
| 条目缺 `date` / `summary` | 红 | 2 项 ✅ |
| `decision: "D-13"`（非四位） | 红 | `不是 D-NNNN 形式` ✅ |
| 日期倒序（11-07 后跟 11-01） | 红 | `早于上一条 2026-11-07` ✅ |
| decision 复用 | 红 | `重复（decision 不可复用）` ✅ |
| `summary: "改"` | 红 | `summary 太短` ✅ |
| 合法条目 | 绿 | 0 项 ✅ |
| 真 repo 副本删掉 `changeLog` + `--root` | O0 红、exit 1 | `缺字段 changeLog` + `changeLog 缺失或为空` ✅ |
| `verify-overlay.mjs --force` | 拒绝 | `不支持参数：--force` + 「没有绕过参数」，exit **2** ✅ |
| `verify-overlay.mjs --allow-unclassified` | 拒绝 | 同上，exit **2** ✅ |
| `check-personalization --mode=dist` 扫注入身份串的目录 | 红 | 3 处命中（昵称/域名/缩写各 1），exit 1 ✅ |

## 4. R-50：本地 = CI（同一条命令）

本地实跑（`demo-build.log` 全量日志）：

```
$ SITE_URL="https://demo.zcblog-v2.pages.dev" \
    node scripts/create-site.mjs --overlay apps/demo --out <scratch>/demo-site --build --install
RESULT PASS  out=…/demo-site html=118 overlay=apps/demo title_hits=13 build=23.9s \
             layers=theme:493/baseline:28/shim:13/overlay:9

$ node scripts/gates/verify-deploy-artifacts.mjs …/dist --target cloudflare \
    --expect-site https://demo.zcblog-v2.pages.dev
RESULT PASS target=cloudflare site=https://demo.zcblog-v2.pages.dev stubs=3/3 fails=0

$ node scripts/check-personalization.mjs --mode=dist --dir=…/dist
RESULT PASS  scanned=224 identity_hits=0 package_identity_lines=2
$ node scripts/check-personalization.mjs --mode=dist --dir=apps/demo
RESULT PASS  scanned=10 identity_hits=0 package_identity_lines=3
```

CI 同一条命令、同样数字（run `42259005676` build job）：

```
Assemble demo (real install)     RESULT PASS html=118 … build=9.6s（Linux 更快）
Verify Cloudflare artifacts      RESULT PASS target=cloudflare stubs=3/3 fails=0
Scan identity leaks (dist+overlay) dist:  scanned=224 identity_hits=0 package_identity_lines=2
                                   overlay: scanned=10  identity_hits=0 package_identity_lines=3
```

`--install` 是真实 `pnpm install --frozen-lockfile`（不是软链），所以「消费者拿到主题 + overlay 能装能构建」在本地也是真验的。

## 5. R-50：部署产物与当前 commit 一致

1. **source commit**：`wrangler pages deployment list`（`pages-deployments.txt`）——demo 分支最新部署 `f3c234cb-0037-49e0-8e87-0b834e3cbf6e`，Source `1b8d309` = 当前 HEAD。
   推送前的上一次部署是 `2ba4ea88` / Source `64ad348`；`64ad348..ab6e15f` 的差异只有 `docs/_reviews/**`、`.github/workflows/ci.yml`，都不进 `dist`，所以那时线上产物同样对应当前运行时。
2. **逐字节比对**：用同一 `SITE_URL` 本地构建，再抓线上同路径（6 个文件）：

| 路径 | 结果 |
|---|---|
| `/` `index.html` | 61212 vs 61212 B，15 B 不同，4 个窗口全在 `og:updated_time` |
| `/article/hello-world/` | 80744 vs 80744 B，16 B 不同，4 个窗口全在 `article:published_time` / `modified_time` / 页面「更新于」时间 |
| `/projects/` | 53882 vs 53882 B，6 B 不同，1 个窗口在 JSON-LD `dateModified` |
| `/tags/` | 49704 vs 49704 B，24 B 不同，4 个窗口全在 JSON-LD `dateModified` |
| `/rss.xml` | **逐字节相同**（1766 B） |
| `/sitemap-index.xml` | **逐字节相同**（259 B） |

分类脚本结论：`RESULT PASS 时间戳之外差异=0`（`live-vs-local-diff.txt`）。凡是 build 时钟决定的字段之外，线上与本地一致——没有「线上还挂着旧产物」的漂移。

## 6. CI 实跑

代码提交 `1b8d309`（判据改动）与报告提交 `0d24ca7`（仅 `docs/**`）：

| workflow | run | HEAD | 结果 |
|---|---|---|---|
| Demo site | `42259005676` | `1b8d309` | **success** — `assemble + build + verify` / `deploy preview (demo branch)` 两个 job 全绿，产出部署 `f3c234cb`（source `1b8d309`） |
| CI | `42261057484` | `0d24ca7` | **success** — `test`（prettier / type-check / unit）/ `gates`（含 `gates:all`）/ `visual (design/atoms · linux baselines)` / `contract` 四 job 全绿 |
| Perf | `42261057543` | `0d24ca7` | **success**（M5-7a 的 list p95 24.5KB 未被打破） |
| A11y PR smoke | `42261057685` | `0d24ca7` | **success** |
| Deploy matrix | `42259005664` | `1b8d309` | 由 `apps/**` 触发（只构建断言，不部署）：`vercel` job success；`gh-pages` / `cloudflare` 两个 job 自 17:09Z 起卡在 **`Install system dependencies`**（apt/字体下载），最终 `cancelled`。该 step 在构建之前，与本次 diff 无关（M5-7a 已记录过 runner 侧 apt 源抖动）；它不在本卡验收项内，也不产出部署。 |

补记（最终 HEAD `ad4065b`，仍为 docs-only）：CI `42261766754` success、A11y `42261766775` success、Perf `42261766672` success。

`0d24ca7` 只加 `docs/_reviews/**` 与 `docs/overlay-contract.md`，不在 demo workflow 的 `paths` 里，所以没有第二次 demo run——运行时输入与 `1b8d309` 完全相同，上面那次 demo 绿即当前状态。

Deploy（生产）workflow 本次未触发：它只有 `workflow_dispatch`，最近一次 run 是 2026-10-31。

## 7. 边界 / 未做

- **不动生产站**：`deploy.yml` 未触发；`apps/demo` 只发 CF Pages `demo` 分支。
- **不动主题渲染**：`src/**` 与 `packages/*/src/**` 零改动，视觉基线不受影响。
- **不改分类规则**：只加 `changeLog` 字段与 CLI 参数约束；1132 的增量全部来自既有规则命中新文件。
- **身份串判据仍是那三串**（昵称 / 昵称缩写 / 个人域名），大小写敏感，与 M3-6 起的口径一致；没有顺手扩成「全小写 domain 也算」——那会把 `@marxchou/` 包名一起判红，需要先给包名单独开口子，属于契约变更，留到有需要时单独决策。
- **未做**：把身份扫描接进 `gates:all`。理由：它依赖一次装配产物（`create-site --build`），套进静态门禁会让 `gates:all` 从秒级变分钟级；现在它挂在 demo workflow 与本地四步上，判据与 CI 同一份实现。

## 8. 复现

```bash
cd ~/Documents/WebSiteCode/zcblog-v2
node scripts/gates/verify-overlay.mjs --report          # O0–O7 + 分类分布
node scripts/gates/verify-overlay.mjs --force           # 期望 exit 2（没有绕过参数）
npm run gates:all                                       # 9 个门禁

W=$(mktemp -d)
SITE_URL="https://demo.zcblog-v2.pages.dev" \
  node scripts/create-site.mjs --overlay apps/demo --out "$W/demo" --build --install
node scripts/gates/verify-deploy-artifacts.mjs "$W/demo/dist" --target cloudflare \
  --expect-site "https://demo.zcblog-v2.pages.dev"
node scripts/check-personalization.mjs --mode=dist --dir="$W/demo/dist"
node scripts/check-personalization.mjs --mode=dist --dir=apps/demo
npx wrangler pages deployment list --project-name zcblog-v2 | head -6
```

## 9. 附件

| 文件 | 内容 |
|---|---|
| `gates-all.log` | 9 个门禁完整输出 |
| `gates-overlay.txt` | `verify-overlay --report`（含分类分布与按目录 Top24） |
| `negative-probes.txt` | changeLog 7 例 + 参数拒绝 + 临时 root + 身份负向 |
| `demo-build.log` | 本地 `create-site --build --install` 全量日志（118 页） |
| `verify-deploy-artifacts.txt` | 产物契约 A0–A7 |
| `identity-scan.txt` | dist + overlay 两次身份扫描 |
| `pages-deployments.txt` | CF Pages 最近部署（含 source commit） |
| `live-vs-local-diff.txt` | 线上 vs 本地逐字节比对结论 |
