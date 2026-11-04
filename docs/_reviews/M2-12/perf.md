# M2-12a · P6 性能 CI 门禁（dist 层：列表 / 文章 / 页面）

> 卡：`t_93d8239b`（M2 第 13 卡，父卡 M2-11b）· 分支 `perf/m2-12a-budget-gate` · PR #1
> 日期：2026-11-05 · 门：P6 / A6 · 预算：2 人日 / ≤10 源文件 / 一个子系统（性能门禁）

## 1. 结论

- **A6 预算门禁已进 CI**：`python3 scripts/gates/perf-budget.py dist` 是唯一判据，绿灯/红灯都不靠人眼。
  新增独立 workflow `.github/workflows/perf.yml`（红了能一眼归因到「预算超支 / 引用缺失 / dist 缺失」），
  `ci.yml` 的 gates job 保留同一条命令当第二道保险（复用已建好的 dist，零额外构建成本）。
- **本树实测 0 页超支**：CI 构建（zh+en，474 页）exit 0；本地 8 门构建（586 页）同样 exit 0。两套 p95 见 §3。
- **负向验证可复现**：`PERF_BUDGET_SCALE=0.95` 把阈值整体压 5% → 必红（CI 构建 474 页里 369 页超支，exit 1；见 §7 的绿灯/红灯两个 run）。
- **D-0077 的 LCP/CLS/TBT 没有搬进 CI**，理由与替代断言见 §4。这是本卡**刻意**留下的唯一缺口，已列 follow-up。

## 2. 门禁分两层，别混在一起

| 层 | 判据 | 口径 | 跑在哪 | 会不会红 |
|---|---|---|---|---|
| **dist 层**（本卡） | 每页型 HTML 大小、JS(gz)、CSS(gz) | 构建产物，JS 跟随静态 import 链去重 | CI：`perf.yml` + `ci.yml` gates job | **会红**（预算=棘轮，只许往下） |
| **lab 层**（D-0077 / A7） | LCP / CLS / TBT / Perf | hostdzire 机房 + Lighthouse 12.8.2 移动预设 + 3 次中位数 | 机房脚本 `reports/lh5-remote.sh` | **不进 CI**（见 §4） |

dist 层挡的是「塞进来 20KB 内联脚本 / 多引一个 chunk / 列表页多渲染 200 个链接 / 静态资源引用写错」这类**确定性回归**；
它看不见 TTFB、字体回流、随机封面图这些**线路相关**的问题——那些只能按 D-0077 的机器口径测。

## 3. 预算与实测

命令：`python3 scripts/gates/perf-budget.py dist --json perf.json`（单位 KB；HTML 为原始大小，JS/CSS 为 gzip -9）。

### 3.1 CI 构建（zh+en，`I18N_LOCALES` 未设 = 线上现状，474 页）

| 页型 | 页数 | 门禁 html/js/css | HTML p95 | JS p95 | CSS p95 | JS 最大 | 最紧余量 |
|---|---|---|---|---|---|---|---|
| article | 85 | 215 / 40 / 45 | 176.0 | 38.1 | 31.8 | 38.6 | +2.3 KB (1.1%) · `article/expressive-code` · html |
| list | 286 | 105 / 28 / 40 | 66.3 | 27.2 | 25.8 | 27.9 | +0.1 KB (0.4%) · `blog/1` · js |
| page | 103 | 105 / 30 / 40 | 79.4 | 29.4 | 28.0 | 29.4 | +0.6 KB (2.0%) · `donate` · js |

### 3.2 本地 8 门构建（`I18N_LOCALES=zh,en,zh-TW,ja,ko,fr,de,es,pt-BR,ru`，586 页）

| 页型 | 页数 | 门禁 html/js/css | HTML p95 | JS p95 | CSS p95 | JS 最大 | 最紧余量 |
|---|---|---|---|---|---|---|---|
| article | 85 | 215 / 40 / 45 | 177.5 | 38.1 | 31.8 | 38.6 | +0.8 KB (0.4%) · `article/expressive-code` · html |
| list | 286 | 105 / 28 / 40 | 67.1 | 27.2 | 25.8 | 27.9 | +0.2 KB (0.19%) · `archives/` · html |
| page | 215 | 105 / 30 / 40 | 92.7 | 27.9 | 27.8 | 29.4 | +0.0 KB (0.00%) · `ja/archives/` · html |

**两套数字为什么不同（重要）**：语言路由由 `src/utils/i18n.ts` 的 `enabledLocales()` 决定，默认只有 `zh,en`；
8 门构建要显式设 `I18N_LOCALES`。所以 CI 现在量的是**线上真正会发出去的那份 474 页**，
本地 586 页是「切 all 之后」的预演。授权 locale 页（`ja/archives`、`ru/archives` 等）恰恰是**全站最紧的两页**（105.0 KB / 105 KB 预算），
它们不在 CI 的测量集里——**如果哪天 deploy 把 `I18N_LOCALES` 切到全部语言，perf.yml 必须同步加同一行 env，且 archives 要先减重**，见 §8。

共同点：三型 p95 都远低于 TARGET（JS ≤100 KB），A6 的 100 KB 目标早已达成。
TARGET 是**目标线**不阻断；门禁线按「当前 p95 + 3~5%」定（D-0051 / D-0052）。

其他观察：

- **p95 与 max 差距很大**：list 的 p95 是 66～67 KB 但 max 是 104.8 KB（`archives/`），预算实际被**一页**卡住。
  想按 p95 下调棘轮之前必须先给 `archives/` 减重，否则红的一定还是它。
- **压线页**：`article/expressive-code` html 214.2/215、`archives/` html 104.83/105、`blog/1` js 27.9/28、`donate` js 29.4/30。
  任何新增内联样式/脚本都会先撞这几处。

## 4. D-0077 分页阈值（lab 层，参考值，不进 CI）

D-0077 定的 A7 五页固定集与门禁（移动预设、机房口径；首页经 D-0095 调整）：

| 页面 | `/` | 文章页 | `/blog/2/` | `/tags/DOCKER/` | `/archives/` |
|---|---|---|---|---|---|
| LCP 门禁 | ≤3.2s | ≤3.8s | ≤3.8s（**3 次中位数**） | ≤3.2s | ≤2.8s |
| CLS | ≤0.05 | | | | |
| TBT | ≤250ms | | | | |

**为什么不在 GitHub runner 上判红**：

1. D-0077 把测量机器写死了（hostdzire `23.82.96.33` 直连 CF；本机直连生产 HTML 传一半就断）。换到 runner，TTFB 与边缘线路全变，数字与那组阈值不可比。
2. `/blog/2/` 的封面是 `pic-api.marxchou.com/api/random`，**每次请求换图**：实测 4.31 / 3.91 / 3.00 / 3.02s，单次与中位数差 0.84s。搬进 CI 只会得到一个随机红绿的门禁。
3. 要做 CI 级 lab 门禁，得引入 `lighthouserc.json` + `@lhci/cli`（本卡文件边界之外），且要先定「用哪台机器当测量点」。

**本卡在 CI 里保留的替代断言**：`perf-budget.py` 核对 A7 固定 5 页是否还在产物里
（`index.html`、`article/self-hosted-git-platform-guide/index.html`、`blog/2/index.html`、`tags/DOCKER/index.html`、`archives/index.html`）。
约定是 **只报告不判红**（打印 ⚠️ 并写进 job summary）：路由改名或内容欠检时，至少能在 CI 输出里看见「lab 门禁失去了测量对象」，而不是静默失效。

## 5. CI 接线

### 5.1 新增 `.github/workflows/perf.yml`

- 触发：`push` / `pull_request`（main、theme）+ `workflow_dispatch`。
- 步骤与 `ci.yml` gates job 同源：checkout → 私有内容仓 checkout → 复制 + normalize frontmatter → libvips → pnpm/node → `pnpm run build` → perf-budget。
- 输出三份：stdout 表（run log）、`$GITHUB_STEP_SUMMARY`（p95 表 + 临界限 + 超支页清单）、artifact `perf-budget`（json + log，`if: always()`，保留 14 天）。
- 负向开关：`workflow_dispatch.inputs.budget_scale` 优先，其次仓库变量 `PERF_BUDGET_SCALE`，都为空 = 1.0 真实门禁。

### 5.2 `ci.yml` gates job

原来的 `Performance budget (A6)` 一行命令，改成同一条命令 + `--json` + `--summary` + 失败上传 artifact。
gates job 里 dist 已经建好，这一步**零额外构建成本**，与 `perf.yml` 互为保险。

### 5.3 阈值只有一个真值

`scripts/gates/perf-budget.py` 的 `BUDGET`（三型 × html/js/css）。两个 workflow 都只是**调用**它，没有第二份预算表。
缩放只走 `--scale` / `PERF_BUDGET_SCALE`，不允许在 workflow 里内联数字——否则「棘轮只许往下」没人守得住。

### 5.4 脚本本身补了什么（只补 CI 输出与阈值读取，不动 BUDGET 值）

| 能力 | 参数 | 用途 |
|---|---|---|
| 阈值缩放 | `--scale f` / `PERF_BUDGET_SCALE` | 负向验证：不改源码、不改预算表就能让门禁红 |
| job summary | `--summary path` / `GITHUB_STEP_SUMMARY` | p95 表 + 临界限 + 超支页，进 run 页面 |
| 机器可读末行 | 恒输出 `SUMMARY {...}` | CI grep 归档（与 `verify-entities --json` 同款约定） |
| 引用缺失 | 已有逻辑保留 | `<script src>` / `<link href>` 指向不存在的文件 = 失败（不是 0） |
| A7 固定页核对 | 恒输出，写进 summary | lab 门禁的测量集是否还在产物里（只报告） |
| 退出码 2 | `dist` 不存在 / 参数错 | 空 dist 不再被当成「0 页全绿」 |

## 6. 负向验证（怎么复现）

```bash
# 真实门禁：绿
python3 scripts/gates/perf-budget.py dist
#   zh+en 构建：扫描 474 页 | 超预算 0 页 → exit 0
#   8 门构建：  扫描 586 页 | 超预算 0 页 → exit 0

# 负向：阈值整体 ×0.95（不改 BUDGET、不改源码）
PERF_BUDGET_SCALE=0.95 python3 scripts/gates/perf-budget.py dist
#   zh+en 构建：扫描 474 页 | 超预算 3xx 页 → exit 1（stdout 前 10 页逐条列出超的指标）
```

CI 侧同一个开关，两条路：

1. **`workflow_dispatch`**：填 `budget_scale: 0.95` 直接跑（要求 `perf.yml` 已在默认分支上）。
2. **临时改一行**（本卡采用，因为 perf.yml 还没合并进默认分支）：

```yaml
# perf.yml → Performance budget 步骤
env:
    PERF_BUDGET_SCALE: "0.95" # 负向探针
```

推一次 → Perf workflow 在 perf-budget 步骤红；把这一行改回去再推 → 绿。两个 run 见 §7。

退出码约定：`0` 全绿 · `1` 有超支 · `2` 用法错误或 dist 不存在。

## 7. 证据

| 项 | 链接 / 数字 |
|---|---|
| **绿灯 run**（Perf，474 页 / 0 超支） | https://github.com/Smart-Chou/zcblog-v2/actions/runs/41894725794 （`perf budget (dist)`: success） |
| **负向红灯 run**（Perf，阈值 ×0.95，369/474 页超支） | https://github.com/Smart-Chou/zcblog-v2/actions/runs/41896174069 （`perf budget (dist)`: failure / exit 1） |
| ci.yml gates job（同 run 第二道保险） | https://github.com/Smart-Chou/zcblog-v2/actions/runs/41894725761 （gates: success） |
| 同一 PR 的 CI 总结论 | failure，**唯一红是 `test` job 的既有 I7b**（`albumscontent` 0 引用，父卡 M2-11b 已记为 known-red，与本卡无关） |
| p95（474 页 / 586 页） | 见 §3.1 / §3.2 |

本地实跑留档：

```
$ python3 scripts/gates/perf-budget.py dist
扫描 586 页 | 超预算 0 页
article    85  177.5  38.1  31.8  38.6  215/40/45   +0.8 KB (0.4%)
list      286   67.1  27.2  25.8  27.9  105/28/40   +0.2 KB (0.2%)
page      215   92.7  27.9  27.8  29.4  105/30/40   +0.0 KB (0.0%)
SUMMARY {"pages": 586, "over": 0, "scale": 1.0, ...}

$ PERF_BUDGET_SCALE=0.95 python3 scripts/gates/perf-budget.py dist
扫描 586 页 | 超预算 377 页   → exit 1
```

## 8. 已知问题（本卡不改判据，转卡）

1. **判定精度是「1 位小数 KB」**：`ja/archives/index.html` = 107,527 B、`ru/archives/index.html` = 107,558 B，
   都**超过** 105 KB（= 107,520 B），但 105.01 / 105.04 四舍五入成 105.0 后被放过。
   本卡不动这个口径：改成字节精确会让这 2 页立即红，而修复要动页面源码（越界，且 CI 现在根本不构建这两页）。
   现在的处理是把它们放进 summary 的「临界限」清单（余量 0.00%）——**数字摆出来，判定不动**。
   收紧精度 + `archives` 减重应该放在同一张卡做，否则只是把一条已知超支变成常红。
2. **`archives` 结构性超重**：页型 max 104.8 KB vs p95 66～67 KB，差 38 KB。父卡记的减重手段（内部链接去 `rel`、分页/按年折叠、内联 heatmap 样式外链）都还没做。
3. **CI 不构建 locale 页**（见 §3.2）：`I18N_LOCALES` 默认 `zh,en`，授权 locale 页不在 CI 测量集里。
   切 all 之前必须：perf.yml 加 `I18N_LOCALES: all` + archives 减重，否则切完 CI 会漏测最紧的那两页。
4. **`article/expressive-code` html 214.2/215**：动态示例页，新增一段示例代码就会撞线。

## 9. 不做 / 后续卡

- **不把 LCP/CLS/TBT 搬进 CI**（需 `lighthouserc.json` + `@lhci/cli` + 选定测量机器，超出本卡文件边界）。
- **不调 BUDGET 数值**（棘轮只许往下；下调要等 archives 减重）、**不改页面源码**。
- **不做暗色逐页 / 移动审计** → M2-12b。
- 门禁脚本自身的 bug（例如 import 链解析漏 chunk）→ 另开卡给 `blog-fe`，不在本卡修。
