# M3-8 出口报告 · 升级指南 + CHANGELOG + 出口门禁 + minor 升级演练

> 卡：`t_a5109b5a`（blog-pm）· 依据 `blog2.0/docs/21-m3-plan.md` §6.2–§6.4 / §7 卡表 M3-8
> 基线：`8a714b1`（M3-7 交接点）· 发布点：`7c57b92` = tag `v2.1.0`
> 执行日：2026-11-05 · 本机 Node 22.22.0 / pnpm 12.10.1 / Astro 7.3.6

---

## 0. 结论

1. **五项出口判据全 PASS**：`node scripts/gates/verify-m3-exit.mjs --all` → `RESULT PASS p1=PASS p2=PASS p3=PASS p7=PASS p10=PASS`（exit 0，原始输出见 §1.2）。
2. **一次真实 minor 升级演练完成**：合成 minor（1 个 token 值 + 1 句组件文案，全部落 T 侧）在**干净 clone** 上 `pnpm install` → `theme-sync --apply` → `build:ci` → 门禁 → 回滚，`applied written=3`、`overlay_changed=0`、O 侧 `git diff` **0 行**、墙钟 **34.6s**（判据 ≤30:00）、回滚后工作区 **0 行**。
3. **发布点已落**：版本 `2.0.0 → 2.1.0` 四处 lockstep（根 + 三包 + `site.manifest.json`），tag `v2.1.0` 打在发布 commit 上；`P10 客户零` 用「装配产物 453 个 T 文件与该 tag 的 blob 逐字节比对」证明站点没有私有 fork。
4. **三个越界文件已登记**（§4）：`site.manifest.json`（+1 T 规则、theme.version/ref）与 `packages/{tokens,ui,og-image}/package.json`（版本 lockstep）。无它们则 `gates:all` 直接红（unclassified / O0 / W0）。

---

## 1. 证据四件套

### 1.1 边界：`git diff --stat 8a714b1..HEAD`

```
 CHANGELOG.md                     |  74 ++++
 docs/upgrade.md                  | 305 +++++++++++++++++
 package.json                     |   3 +-
 packages/og-image/package.json   |   2 +-
 packages/tokens/package.json     |   2 +-
 packages/ui/package.json         |   2 +-
 scripts/gates/verify-m3-exit.mjs | 712 +++++++++++++++++++++++++++++++++++++++
 site.manifest.json               |   5 +-
 8 files changed, 1099 insertions(+), 6 deletions(-)
```

加上本文件（`docs/_reviews/M3-exit/report.md`，X 类）= **9 个文件**，卡上限 10。

| 文件 | 类 | 说明 |
|---|---|---|
| `docs/upgrade.md` | T | 升级指南（边界内） |
| `CHANGELOG.md` | O（清单口径） | 2.1.0 / 2.0.0（边界内） |
| `scripts/gates/verify-m3-exit.mjs` | T | 出口五项门禁（边界内） |
| `package.json` | T | `version 2.1.0` + `gates:m3-exit`（边界内） |
| `docs/_reviews/M3-exit/report.md` | X | 本文件（边界内） |
| `site.manifest.json` | O | **越界**：T 规则 +1（`docs/upgrade.md`）、`theme.version/ref → 2.1.0` |
| `packages/{tokens,ui,og-image}/package.json` | T | **越界**：版本 2.1.0 lockstep（`verify-package-boundary` W0 强制） |

提交（6 个）：

```
7c57b92 docs(m3-8): 演练页数口径订正 —— 主工作区 748 页（476 + 272 个 /tag 桩）、89 篇文章（85 页）
edd1db8 docs(m3-8): 门禁表改为判据口径 + 墙钟区间（25s–2m13s），秒数不进判据
61cd80a docs(m3-8): 门禁实测改记多次运行区间
ce8ce77 fix(m3-8): P10 比对口径订正 —— baseline 层覆盖的 T 文件比该层自己的 blob
e353fce feat(m3-8): 出口门禁收口 + 演练实测数字
e016276 feat(m3-8): 升级指南 + CHANGELOG + 出口五项门禁（WIP 60%）
```

### 1.2 验收命令原始输出

命令：`node scripts/gates/verify-m3-exit.mjs --all`（`head: 7c57b92`，exit 0）

```
M3 出口门禁（P1 可安装 / P2 可配置 / P3 可升级 / P7 质量 / P10 客户零）
root: /Users/chowcong/Documents/WebSiteCode/zcblog-v2
work: /var/folders/d1/vxsbt7qj33ggygyw8w3d944m0000gn/T/zcblog-m3-exit   pnpm: 12.10.1
head: 7c57b92 · checks: P1 P2 P3 P7 P10

── P1 可安装（装配 + 真实装依赖 + 构建 ≤30 分钟）
  · create-site --overlay apps/demo --build --install（含真实装依赖）  exit=0 26.4s
  · 计时口径 rm -rf node_modules && time…：新 out 目录 + pnpm install(--frozen-lockfile) + astro build
  · 墙钟 26.4s（预算 30:00）· dist HTML=118 · node_modules 真实安装=true
  · pnpm 12.10.1 · out=../../../../../var/folders/d1/vxsbt7qj33ggygyw8w3d944m0000gn/T/zcblog-m3-exit/p1/site
  · RESULT PASS  out=/var/folders/d1/…/p1/site html=118 overlay=apps/demo title_hits=13 build=22.3s layers=theme:458/baseline:28/shim:13/overlay:6
  PASS  P1  26.5s

── P2 可配置（改 overlay 0 个主题文件变化）
  · create-site 用改过 title/url 的 overlay 副本重新装配 + 构建  exit=0 30.8s
  · overlay 副本：title=「M3-EXIT-P2 配置演练站」 url=https://p2.example.test
  · 主题侧 git status（src/components packages）：0 行
  · dist/index.html 命中新标题 11 次 · pnpm 12.10.1
  PASS  P2  31.1s

── P3 可升级（minor 升级真实 apply ≤30 分钟、O 侧 0 变更）
  · theme-sync --dry-run（契约判据）  exit=0 0.6s
  · git clone --branch drill/pre-upgrade  exit=0 6.1s
  · pnpm install --frozen-lockfile  exit=0 3.0s
  · theme-sync --apply --to origin/drill/v2.1.0  exit=0 1.5s
  · pnpm build:ci  exit=0 28.5s
  · check-tokens  exit=0 0.4s
  · perf-budget dist  exit=0 1.1s
  · verify-overlay  exit=0 0.1s
  · git reset --hard <drill-from>（回滚）  exit=0 0.3s
  · from drill/pre-upgrade @ e016276 · to drill/v2.1.0 @ 41f72d3
  · dry-run: theme_changed=3 overlay_changed=0 unclassified_changed=0
  · apply 计时口径：rm -rf node_modules 的干净 clone → install + apply + build + 门禁 · 墙钟 34.6s（预算 30:00）
  · applied written=3 removed=0 · 产物命中「minor-drill」2 个 HTML · dist HTML=110 · pnpm 12.10.1
  · O 侧 git diff（src/config src/content src/data src/assets public/assets/note public/images）：0 行
  · SUMMARY {"pages": 108, "over": 0, "scale": 1.0, "p95": {"list": {"html_kb": 77.1, "js_kb": 27.6, "css_kb": 27.3}, "page": {"html_kb": 79.4, "js_kb": 29.5, "css_kb": 28.1}}, "a7_missing": ["article/self-hosted-git-platform-guide/index.html", "blog/2/index.html", "tags/DOCKER/index.html"]}
  · 回滚后 git status：0 行
  PASS  P3  42.8s

── P7 质量（clean clone install+build+门禁全绿）
  · git clone --depth 1（clean clone）  exit=0 4.4s
  · pnpm install --frozen-lockfile  exit=0 3.3s
  · pnpm build:ci（0 篇文章）  exit=0 28.7s
  · verify-overlay（clone 内）  exit=0 0.1s
  · verify-package-boundary（clone 内）  exit=0 0.2s
  · check-tokens（clone 内）  exit=0 0.3s
  · perf-budget（clone 内）  exit=0 1.1s
  · RESULT PASS  packages=3 violations=0 theme_version=2.1.0
  · 结果：10/10 PASS · 0 FAIL
  · clean clone 文章数=0（src/content/article 被 gitignore）· dist HTML=110
  · install 3.3s · build 28.7s
  PASS  P7  38.2s

── P10 客户零（站点主题文件与发布 tag 逐字节相同）
  · create-site 装配（不构建）  exit=0 0.5s
  · 发布基线 v2.1.0 @ 7c57b92
  · ref..HEAD 变更 0 个文件，其中 T 侧 0 个
  · 装配产物 T 文件逐字节比对：compared=453 mismatch=0（baseline 层覆盖 3、跳过符号链接 4、package.json 重写 1）
  PASS  P10  1.0s

临时目录已清理（--keep 保留）
RESULT PASS  p1=PASS p2=PASS p3=PASS p7=PASS p10=PASS
```

**横切基线**（同 commit，`pnpm gates:all` 9 条 + 其余）：`verify-atoms 18/18`、`verify-atom-docs`、`verify-component-inventory`、`verify-doc-drift`、`check-tokens 10/10`、`verify-surface-tokens`（pages 0 新增）、`verify-entities`、`verify-package-boundary packages=3 violations=0`、`verify-overlay classified=1032 unclassified=0`；`prettier --check .` → All matched files use Prettier code style。

**真实站点回归**（主工作区 `pnpm build:ci`）：`748` 个 HTML、`perf-budget SUMMARY over=0`、`verify-og png==article_pages 85/85 · gates=7/7`。

### 1.3 产物

| 产物 | 路径 |
|---|---|
| 升级指南 | `docs/upgrade.md`（305 行） |
| 变更记录 | `CHANGELOG.md`（2.1.0 / 2.0.0） |
| 出口门禁 | `scripts/gates/verify-m3-exit.mjs`（712 行，`pnpm gates:m3-exit`） |
| 本报告 | `docs/_reviews/M3-exit/report.md` |
| 门禁原始日志 | `/Users/chowcong/.hermes/profiles/blog-pm/cache/scratch/m3exit-gate-final3.log` |
| 演练 clone | `/Users/chowcong/.hermes/profiles/blog-pm/cache/scratch/m3exit-drill/site`（detached `drill/pre-upgrade`，已回滚） |
| 演练分支/回滚点 | tag `drill/pre-upgrade` @ `e016276`；分支 `drill/v2.1.0` @ `41f72d3`；tag `v2.1.0` @ `7c57b92` |

### 1.4 回滚

```bash
# 回到 M3-7 交接点（丢弃本卡 6 个 commit）
git reset --hard 8a714b1

# 只回滚发布动作（保留文档/门禁）
git tag -d v2.1.0

# 只回滚演练痕迹
git tag -d drill/pre-upgrade && git branch -D drill/v2.1.0

# 单点回滚 P10 口径订正（若判定应按主题 blob 比）
git revert --no-edit ce8ce77
```

`git reset --hard` 会一并还原 `pnpm-lock.yaml`；`dist/`、`node_modules/` 是 X 类，重新构建即可。**不要**用 `git clean -fd src` 收尾：`src/content/article/`（89 篇）与部分 `src/assets/` 在 `.gitignore` 里。

---

## 2. minor 升级演练（§6.4）原始输出

演练在独立 clone 里做（`git clone --branch drill/pre-upgrade file://<repo> site`），主工作区不当靶子。

**步 1 · 造合成 minor**（分支 `drill/v2.1.0`，commit `41f72d3`，全部 T 侧）：

```
packages/tokens/tokens.json               | 2 +-   (--space-4: 16px → 17px)
packages/tokens/tokens.css                | 4 ++-- (build-tokens.mjs 重生，G-T1 10/10)
src/components/Index/HeroMasthead.astro   | 2 +-   (文案加 minor-drill)
```

**步 2 · dry-run**：

```
theme-sync · dogeared 2.1.0
from drill/pre-upgrade @ e016276
to   drill/v2.1.0 @ 41f72d3
range files=3

theme_changed=3
overlay_changed=0
exclude_changed=0
unclassified_changed=0

T · 主题（升级覆盖）
  M  packages/tokens/tokens.css
  M  packages/tokens/tokens.json
  M  src/components/Index/HeroMasthead.astro

RESULT PASS  theme_changed=3 overlay_changed=0
```

**步 3 · apply**：

```
applied written=3 removed=0
RESULT PASS  theme_changed=3 overlay_changed=0
real 0m1.288s
```

**步 4 · 构建 + 门禁**：

```
[build] 108 page(s) built in 18.72s
[collapse-html] 110 页 · 0 页有改动
real 0m25.265s
check-tokens: 结果：10/10 PASS · 0 FAIL
perf-budget: SUMMARY {"pages": 108, "over": 0, …}
verify-overlay: RESULT PASS  classified=1032 unclassified=0 theme=684 overlay=299 exclude=49
```

**步 5/6 · 断言 + 回滚**：

```
$ git diff --stat -- src/config src/content src/data src/assets public/assets/note public/images
(lines=0)
$ git diff --stat
 packages/tokens/tokens.css              | 4 ++--
 packages/tokens/tokens.json             | 2 +-
 src/components/Index/HeroMasthead.astro | 2 +-
 3 files changed, 4 insertions(+), 4 deletions(-)
$ grep -c "minor-drill" dist/index.html
1
$ git reset --hard drill/pre-upgrade && git status --porcelain | wc -l
0
```

**install 2.218s + apply 1.288s + build 25.265s + 门禁 ≈ 30s**（同一段在门禁里三次复跑：69.8s / 42.8s / 34.6s —— 磁盘/负载差异，判据是 ≤30:00）。

> 演练 clone 里 0 篇文章（`src/content/article/` 被 gitignore）→ 110 页；主工作区同命令 748 页（476 + 272 个 `/tag` 桩）。页数差异来自内容与桩，不是升级。

---

## 3. 五项判据口径（与文档一致）

| 项 | 判据 | 抗作弊点 |
|---|---|---|
| P1 | 新 out 目录 + **真实** `pnpm install --frozen-lockfile` + `astro build` ≤ 30:00，HTML ≥ 8 | 断言 `node_modules` 不是符号链接，防「复用仓库依赖冒充安装」 |
| P2 | overlay 副本改 title/url → 重新装配构建，`git status -- src/components packages` 0 行 + 新标题进 `dist/index.html` | 只改 overlay **副本**，并另行断言仓库 `apps/demo` 未被改动 |
| P3 | dry-run 契约数 + 干净 clone 真实 `--apply` + 构建 + 门禁 + O 侧 0 行 + 文案落地 + 回滚后 0 行 | 文案标记 `minor-drill` 必须出现在产物里，防「apply 只写了空文件」 |
| P7 | clean clone（0 文章）install + build + 4 条门禁全绿 | 断言 `articles=0`，把「0 篇也能构建」变成可复跑判据（计划 V-1） |
| P10 | `theme.ref` 存在 + `ref..HEAD` T 侧 0 变更 + 装配产物 453 个 T 文件与 tag blob 逐字节相同 | 比的是 git blob sha，不是「有没有改动」的自我陈述 |

---

## 4. 偏离与越界（登记）

| # | 项 | 内容 | 判定 |
|---|---|---|---|
| 1 | **越界** `site.manifest.json`（+5 行） | T 规则加 `docs/upgrade.md`；`theme.version/ref → 2.1.0` | 不加规则 → `verify-overlay` O3 报「死规则/未分类」；不改版本 → O0 lockstep 红。同 M3-7 先例 |
| 2 | **越界** `packages/{tokens,ui,og-image}/package.json`（各 1 行） | `version 2.1.0` | `verify-package-boundary` W0 强制四者 lockstep（§3.5） |
| 3 | 版本号 2.1.0 | 本卡把 M3 收口定为 **2.1.0** 并打 tag `v2.1.0` | P10 的判据依赖「发布 tag」；不打 tag 则 P10 无法成立。tag 打在发布 commit 上，tag 之上只有 X 类（本报告） |
| 4 | 演练 from-ref | §6.4 写 `--from v2.0.0 --to drill/v2.1.0`；实际用 `--from drill/pre-upgrade` | **v2.0.0 → v2.1.0 区间必然 `overlay_changed>0`**（`CHANGELOG.md` 新增 + `site.manifest.json` 改规则 = 发布元数据，属 O）。实测见 §5.1；工具拒绝是契约正确行为，故把「机制验证」放在纯 T 区间 |
| 5 | 演练场地 | 不重置主工作区，改在独立 clone | 主工作区有 89 篇 ignore 的文章，`reset --hard`/`clean` 有误删风险；clone 里同样执行真实 apply + 回滚 |
| 6 | P10 比对口径 | baseline 层（`theme-template/{src,public}`）覆盖的 3 个 T 文件与**该层自己的 blob** 比 | 首版按主题 blob 比 → 恒报 `mismatch=3`（`favicon.ico`/`favicon.svg`/`logo.webp` 是示例站占位身份，装配按设计覆盖）。这是假红，已订正并留 commit `ce8ce77` |

---

## 5. 发现（建议上游处理，本卡不改）

### 5.1 `CHANGELOG.md` / `site.manifest.json` 归 O，与「发布动作」天然冲突（R-47 的邻居）

实测 `node scripts/theme-sync.mjs --from v2.0.0 --to v2.1.0 --dry-run`：

```
O · 站点 overlay（升级禁止触碰）
  A  CHANGELOG.md
  M  site.manifest.json
RESULT FAIL  theme_changed=… overlay_changed=2 …
```

结论：**任何一次真实发版都会让跨版本区间出现 O 侧变更**，`theme-sync` 按契约拒绝。两条可选收口（都超出本卡边界）：

1. 把 `CHANGELOG.md` 改判 **T**（§3.5 的措辞「主题 minor bump + CHANGELOG 顶部 Breaking 段」其实支持它），`site.manifest.json` 保持 O，发版时单独 commit；
2. 给 `theme-sync` 加显式白名单 `--allow-release-metadata`（只放行 `CHANGELOG.md` + `site.manifest.json`），并让门禁断言白名单只有这两条。

当前做法（已写进 `docs/upgrade.md` §7.3）：发布元数据单独 commit，机制验证跑纯 T 区间。

### 5.2 clean clone 的构建事实（计划 V-1 已闭合）

0 篇文章时 `pnpm build:ci` **exit 0**，110 页（列表页走空态），`perf-budget over=0`。P7 每次运行都在验这一条。

### 5.3 演示站页数口径

主工作区 `pnpm build:ci` = **748** HTML（476 + 272 个 `/tag/*` 桩，桩由 M3-7 引入）。计划 §1.6 的 476 是 M3-0 测的、早于 M3-7；文档与报告统一改记 748。

### 5.4 计时方差

同一台机器、同一条命令，P1（装配 + install + build）的墙钟在 4 次运行里 **26.4s / 33.4s / 57.4s / 2m12.5s**（`pnpm` store 预热程度与磁盘/负载差异）。R-51 的结论成立：30 分钟判据有余量，但**不能拿单次秒数当基线**，因此文档把秒数移出判据列。

---

## 6. 本卡不做

- 不改任何门禁阈值（`perf-budget` / axe / tokens 判据原样）；
- 不改 `blog2.0/` 的计划、decision-log、risks（§5.1 的建议登记留给 M3 收口）；
- 不碰生产发布（`Smart-Chou/zcblog` 未同步、CF/Vercel 项目设置未动、无 push、无部署）；
- 不发布 npm（三包 `private: true`，无 `publishConfig`）；
- 不引入 `changesets` / release workflow（M4）。
