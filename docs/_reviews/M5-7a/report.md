# M5-7a · 列表 JS 预算 + 文档 e2e 门禁

> 卡：`t_d47f9d6c` · 门：M5-7a · 日期：2026-11-07 · 决策：D-0137
> 依赖：M5-6（`fddb929`）
> 结论：**R-44 关闭**（list JS p95 27.3 → **24.5KB** / 28KB）、**R-41 关闭**（docs e2e 在 CI 绿 + 用例数硬断言）

---

## 1. R-44 · 列表 JS 预算余量恢复

### 1.1 起手实测（`perf-budget.py dist`，746 页）

| 类型 | 页数 | HTML p95 | JS p95 | CSS p95 | JS 最大 | 门禁 h/j/c | 最紧余量 |
|---|---:|---:|---:|---:|---:|---|---|
| article | 85 | 176.1 | 38.2 | 31.8 | 38.7 | 215/40/45 | +2.2 KB (1.0%) · html |
| **list** | 286 | 65.8 | **27.3** | 25.9 | **28.0** | 105/28/40 | **+0.0 KB (0.0%)** `/blog/1/` · js |
| page | 375 | 62.8 | 27.3 | 26.7 | 29.5 | 105/30/40 | +0.5 KB (1.7%) · js |

`/blog/1/` 的 28.00KB 是逐模块加出来的（gzip 9，跟随静态 import 链）：

| 模块 | gz | 性质 |
|---|---:|---|
| `page.*.js`（swup + plugins + astro prefetch） | 16.50 | 站内路由，首屏必须有 |
| **`config.*.js`（站点配置桶）** | **3.89** | **只为了 `redirect` / 两个 class 名单** |
| `BaseLayout…script_index_1`（a11y-scroll / tab-nav / pageview / 灯箱…） | 3.01 | 首屏行为 |
| `Search…`（搜索浮层入口） | 1.61 | 首屏行为 |
| `BaseLayout…script_index_0`（redirect-handler 本体） | 0.99 | 首屏行为 |
| `preload-helper` / `page-lifecycle` | 0.82 / 0.46 | 共享工具 |
| `Hitokoto…` / `BackToTop…` | 0.40 / 0.32 | 首屏行为 |

### 1.2 改动（1 个文件，3 行）

`src/scripts/redirect-handler.ts`：

```diff
-import { config } from "~/config";
+import { config } from "~/config/feature";
```

**为什么这一行值 2.84KB**：`src/config/index.ts` 是桶文件，做的是

```ts
import * as siteConfig from "./site";
import * as featureConfig from "./feature";
export * from "./site";  // 等等
export const { site, author, notFoundPage, tagsPage, archivesPage, redirectPage, imageService } = siteConfig;
export const { config, pageView, postView, donate, waline, search, umami, popular, notice, watermark, share } = featureConfig;
```

namespace 导入 + 解构导出 + `export *` 三件事叠加，Rollup 无法把没用到的导出去掉：客户端只是要三个值
（`config.redirect`、`redirectIncludeClass`、`redirectExcludeClass`），却必须把全站站点文案
（title / subtitle / description / keywords / tagsPage / archivesPage / notFoundPage / imageService…）一起下载解析。
直连 `~/config/feature` 后，进入首屏图的是 `feature.*.js` **1.05KB gz**（`config` 对象的 7 个字段 + 同模块被
桶文件共享的几个开关），站点文案彻底退出客户端。

### 1.3 收口实测（同一命令、同一内容集、`pnpm run build` 与 `perf.yml` 同口径）

| 类型 | 页数 | HTML p95 | JS p95 | CSS p95 | JS 最大 | 门禁 h/j/c | 最紧余量 |
|---|---:|---:|---:|---:|---:|---|---|
| article | 85 | 176.1 | 38.5 | 31.8 | 38.9 | 215/40/45 | +2.2 KB (1.0%) · html |
| **list** | 286 | 65.8 | **24.5** | 25.9 | **25.2** | 105/28/40 | +1.5 KB (1.4%) · html |
| page | 375 | 62.8 | 24.5 | 26.7 | 29.7 | 105/30/40 | +0.3 KB (1.0%) · js |

- list JS p95 **27.3 → 24.5KB**（目标 ≤26.0 ✅，门禁 28KB，**余量 3.5KB / 12.5%**）
- list JS 最大页 **28.0 → 25.2KB**（`/blog/1/` 逐模块：16.50 + 3.03 + 1.61 + 1.05 + 0.99 + 0.82 + 0.46 + 0.40 + 0.32 = 25.18）
- page JS p95 **27.3 → 24.5KB**；**0 页超支**；A7 固定 5 页齐全（`a7_missing: []`）
- 预算值 **未动**（`BUDGET` 保持 28KB）：卡面禁止抬预算，收紧属另一件事（见 §1.5）

**首屏 JS 里到底还剩什么**（`/blog/1/` 的 9 个模块全文 grep）：

| 探针串 | 命中模块 | 说明 |
|---|---|---|
| `深圳非科班独立开发者`（站点 description） | **0** | 站点文案彻底退出客户端 |
| `indie developer`（站点 keywords） | **0** | 同上 |
| `post-content`（`redirectIncludeClass`） | 2（`feature.*.js` + BaseLayout script） | 重定向配置仍在，行为不变 |
| `modal-mask` / `friends-container` / `author`（`redirectExcludeClass`） | 1（`feature.*.js`） | 同上 |

### 1.4 行为等价验证（不是「看着没报错」）

改的是 import 路径，风险全在「运行时拿到的 `config` 还是不是同一个对象」。用一个临时 e2e 探针（跑完即删，
不进仓库）在真实 dist + 真实打包产物上验：

- 注入 `.post-content` 内的外链 → 被改写成 `/redirect/?url=<base64url>`，`original-href` 保留原址，
  `target=_blank`、`rel="noopener noreferrer"`，并追加外链 `<svg>` 图标 ✅
- 同一容器内的**内链**、**图片链**（`<a><img></a>`）不改写 ✅
- 排除区 `.author` / `.modal-mask` 里的外链不改写 ✅（`redirectExcludeClass` 生效）

探针输出（`redirect-probe.log`）：`✓ 1 passed`，`ext1.href=/redirect/?url=aHR0cHM6Ly9leGFtcGxlLmNvbS9hP2I9MQ`。

### 1.5 取舍与被否掉的方案

| 方案 | 收益 | 为什么不做 |
|---|---|---|
| **改直连 `~/config/feature`（采用）** | −2.84KB/页 | — |
| 动态 `import("./scripts/redirect-handler")` | 门禁数字再 −2.0KB | 只是把成本挪出**静态 import 图**，浏览器照样下载；对着度量口径优化，等于自欺 |
| 两个 class 名单搬成 `<html data-redirect-*>` | 再 −1.05KB | 多一条「属性被删就静默失效」的隐藏契约；为 1KB 不值 |
| 抬预算到 30KB | 0 | 卡面明令禁止；而且 R-44 的病根是「公共 chunk 里塞了用不到的东西」，不是预算不够 |
| 关 swup a11y 插件 | −9.6KB | 换页读屏播报丢失（D-0057 明确要保留） |

**已知副作用（记录，不掩盖）**：article JS p95 **38.2 → 38.5KB**（+0.3）。少数文章页同时拉桶文件 chunk 和
新拆出来的 `feature` chunk，多付一次 1.05KB 的一部分；仍远低于 40KB 门禁，且全站首屏总量是下降的
（list/page 各 −2.84KB）。不动它，因为这要把「桶文件是否值得重构」单独裁决，超出本卡范围。

**棘轮值**：24.5 × 1.05 ≈ 25.7 → **26KB** 是下一轮该有的门禁值。本轮不动，原因是
`24-m5-plan.md` §M5-9 与 M5-8 仍按「28KB 列表预算」表述，此时收紧会把「预算变更」和「新功能选型」耦在一张卡里；
留给 M5-9 之后单独一张卡 + 单独 decision。

---

## 2. R-41 · 文档页 e2e 进 CI

### 2.1 复核结果：不是「只手动跑」，但判据太软

卡面前提（「36 条用例目前只手动跑」）在 M2-1 之后就过时了：`ci.yml` 的 `visual` job 里已有

```yaml
- name: Docs a11y · atom docs + atoms (R-41)
  run: |
      corepack pnpm exec playwright test e2e/design-atom-docs.a11y.spec.ts e2e/design-atoms.a11y.spec.ts --reporter=list --retries=0
      echo "Docs a11y · atom docs 36 passed + atoms 12 passed"
```

历史 run `42246582062`（commit `48d86cf`）的 `visual` job 里，36 条 docs 用例**逐条 ✓**（`button`…`skeleton` ×
structure / axe light+dark / 390px），耗时约 12s，job 结论 success。

真正的缺口是**判据**：Playwright 对 `test.skip` 的用例仍返回 0，那行 `echo "36 passed"` 是无条件打印的——
用例被裁到 3 条、或被 `test.describe.skip` 掉，这个 step 依然绿。M5-7a 补的是这条硬断言。

### 2.2 改动

```yaml
- name: Docs a11y · atom docs + atoms (R-41)
  shell: bash          # 容器任务默认 sh(dash)，不认 set -o pipefail
  run: |
      set -o pipefail
      corepack pnpm exec playwright test \
        e2e/design-atom-docs.a11y.spec.ts e2e/design-atoms.a11y.spec.ts \
        --reporter=list --retries=0 | tee "$RUNNER_TEMP/docs-a11y.log"
      if ! grep -qE "^ +48 passed" "$RUNNER_TEMP/docs-a11y.log"; then
        echo "::error::docs a11y 用例数不是 48（docs 36 + atoms 12）——被 skip 也算绿，必须看条数"
        tail -30 "$RUNNER_TEMP/docs-a11y.log"
        exit 1
      fi
```

- 期望条数 = docs **36**（12 slug × {structure, axe light+dark, 390px}）+ atoms **12** = **48**
- 为什么留在 `visual` job 而不是新开 job：那里已经有 Playwright 1.63.0-noble 镜像、`dist` 和浏览器，
  加一个 job 等于再跑一次 install+build（约 3 分钟）换「归因更清楚」；而 `--reporter=list` + 具名 step
  已经把失败归因到具体用例，成本不值
- **触发路径**：`ci.yml` 的 `on: push / pull_request → branches: [main, theme]` + `workflow_dispatch`
- **超时**：step 实测 14s（36 条 docs 约 12s），所在 job `timeout-minutes: 20`；spec 内单条用例 30s（playwright.config）
- 历史基线与新断言的关系：这次不是「把没接的接上」，而是「把接上的接牢」——旧 step 的 `echo` 保留语义，
  换成真正的判据

---

## 3. 验收证据

| # | 项 | 命令 / 来源 | 结果 |
|---|---|---|---|
| 1 | 性能预算 | `python3 scripts/gates/perf-budget.py dist` | **PASS**，746 页 0 超支，list JS p95 **24.5** |
| 2 | docs e2e（本地） | `playwright test e2e/design-atom-docs.a11y.spec.ts e2e/design-atoms.a11y.spec.ts` | **48 passed (37.6s)** |
| 3 | docs e2e（CI） | run `42254206711` · job `visual` `128016931831` · commit `22bc830` | **success**，`48 passed (20.7s)`（docs 36 + atoms 12），step 21s |
| 4 | 视觉基线（本机 macOS 套） | `playwright test e2e/design-atoms.visual.spec.ts` | **72 passed**，0 张 diff |
| 5 | 门禁束 | `gates:all` | **PASS**，`unclassified=0`，classified=1126 |
| 6 | 类型 | `tsc --noEmit` | PASS |
| 7 | 单测 | `vitest run` | 13 files / **139 passed** |
| 8 | 格式 | `prettier --check .` | 全过（含顺带修好的 `site.manifest.json`） |
| 9 | 外链重写行为 | 临时探针（§1.4） | 4 项判据全过 |

---

## 4. CI run 证据

**代码 commit**：`64ad348`（R-44 + R-41 断言）→ `22bc830`（修 step 的 shell 声明）

| workflow | run | 结论 | 关键点 |
|---|---|---|---|
| **CI** | [`42254206711`](https://github.com/Smart-Chou/zcblog-v2/actions/runs/42254206711) | **success** | job `test` / `contract` / `gates` / `visual` 全绿 |
| └ `visual` · docs a11y step | job `128016931831` | success | `48 passed (20.7s)`，18:38:54→18:39:15（HKT 00:39），逐条见 `ci-docs-a11y.log` |
| └ `visual` · 视觉基线 ×2 | 同上 | success | Linux 基线 72×2 全过，重试 0 |
| **Perf** | [`42254206540`](https://github.com/Smart-Chou/zcblog-v2/actions/runs/42254206540) | **success** | `扫描 746 页 \| 超预算 0 页`；list JS p95 **24.5** / 最大 25.2；article 38.5；page 24.5 |
| A11y PR smoke | [`42254206458`](https://github.com/Smart-Chou/zcblog-v2/actions/runs/42254206458) | success | 11 路由 strict |
| Demo site | [`42253181686`](https://github.com/Smart-Chou/zcblog-v2/actions/runs/42253181686) | success | `create-site` 重建（含本次 `src/**` 改动） |

**CI 上跑出来的 p95 与本地一致**（同一内容口径：CI 拉了 86 篇文章，本地 89 篇；两边的 p95 都是 24.5）：
说明 24.5 不是本机特权数值。

### 4.1 过程中的两个真问题（都已修，不是「重跑一次就好了」）

1. **`sh -e` 不认 `set -o pipefail`**：run `42253181658` 的 `visual` job 在 docs step 第一行
   `set: Illegal option -o pipefail` → exit 2。GitHub 的**容器任务默认 shell 是 `sh`(dash)**，
   而本机是 bash，所以本地复跑永远看不到这个错。修法：step 显式 `shell: bash`（commit `22bc830`）。
   —— 这正是「接线了」和「接牢了」的差别：旧 step 没有 pipefail，所以它连「playwright 挂了没挂」都不关心。
2. **`ubuntu-latest` 换到 26.04 后 apt 源 403**：run `42253181618`（A11y PR smoke）在
   `Install system dependencies` 失败——`packages.microsoft.com/ubuntu/26.04/prod … 403 Forbidden` /
   `no longer signed`。这是 runner 镜像侧问题，与本次改动无关：同一个 workflow 在 `22bc830` 上 success
   （run `42254206458`），CI/Perf 的同类步骤也没红。记为**偶发基础设施噪声**，未改 workflow。

---

## 5. 数据文件

- `perf-baseline.json` — 改动前全量扫描（746 页，逐页 html/js/css）
- `perf-after.json` — 改动后全量扫描
- `redirect-probe.log` — 外链重写探针输出
- `docs-a11y-local.log` — 本地 48 条用例日志

---

## 6. 边界

- 未改预算表、未改页面结构、未改 CSS / 视觉；零新增依赖
- 未动 `24-m5-plan.md`（预算收紧留给 M5-9 之后）
- `site.manifest.json` 的改动**只有格式**（prettier 折行），字段零变化，`verify-overlay` 复跑 PASS；
  它自 `48d86cf` 起让 CI `test` job 的 `Lint` 红、后续 type-check/unit 全被 skip（R-43 同类故障），
  本卡顺带修掉，避免「CI 整体是红的，却把 docs e2e 的绿当证据」
