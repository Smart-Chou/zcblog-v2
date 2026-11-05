# 升级指南（主题 `dogeared` 2.1.0）

> 本文是**站点维护者**的升级手册：怎么从 `v2.0.0` / 上一个 tag 升到 `v2.1.0`，升级时哪些文件会被覆盖、哪些绝对不动，以及怎么用一条命令证明自己没搞坏。
>
> 依据：`blog2.0/docs/21-m3-plan.md` §3.5（版本规则）、§4（overlay 契约）、§6.2–§6.4（出口判据与演练）。
> 相关文档：`docs/overlay-contract.md`（T/O/X 契约正文）、`docs/package-boundary.md`（三包边界）、`docs/deploy-matrix.md`（三目标部署）。

---

## 0. 30 秒版

```bash
git tag upgrade/rollback-$(date +%Y%m%d%H%M)            # ① 回滚点
node scripts/theme-sync.mjs --from v2.0.0 --to v2.1.0 --dry-run   # ② 预览：overlay_changed 必须 0
node scripts/theme-sync.mjs --from v2.0.0 --to v2.1.0 --apply     # ③ 应用（只写 T 侧）
pnpm install --frozen-lockfile && pnpm build:ci                     # ④ 装依赖 + 构建
node scripts/gates/check-tokens.mjs && python3 scripts/gates/perf-budget.py dist   # ⑤ 门禁
git diff --stat -- src/config src/content src/data src/assets public/assets/note public/images   # ⑥ 必须是 0 行
```

任何一步红了就 `git reset --hard upgrade/rollback-<时间戳>` 退回（`node_modules` 不用回滚，重装即可）。

**判据**：`overlay_changed=0`、构建 exit 0、`check-tokens` 10/10、`perf-budget` 0 页超预算、O 侧 `git diff` 0 行、墙钟 ≤ 30 分钟。

---

## 1. 版本与工具

| 项 | 值（2.1.0 实测） |
|---|---|
| 主题包 | `@marxchou/zcblog`（`private: true`，不发布 npm） |
| 包管理器 | `pnpm@12.10.1`（`packageManager` 字段锁定，`.npmrc` 只放 `minimum-release-age=0`） |
| Node | 22.x（本次实测 `v22.22.0`） |
| Astro | `^7.3.6` |
| 升级工具 | `scripts/theme-sync.mjs`（M3-5） |
| 装配工具 | `scripts/create-site.mjs`（M3-6） |
| 出口门禁 | `scripts/gates/verify-m3-exit.mjs`（M3-8） |

**版本规则**（§3.5，不可协商）：

1. `packages/tokens`、`packages/ui`、`packages/og-image` 与根 `package.json` **lockstep**：同一 minor 一起 bump。`node scripts/gates/verify-package-boundary.mjs` 的 W0 会直接判红。
2. 站内引用一律 `workspace:*`，禁止写 `^2.1.0` 这类自引用版本范围。
3. 包内 breaking = 主题 **minor** bump + 本文件与 `CHANGELOG.md` 顶部「Breaking」段；minor 内不得 breaking。
4. 升级一律以 **tag** 为基线（`site.manifest.json` 的 `theme.ref`），不用分支名。

---

## 2. 谁动谁不动（T / O / X）

分类真值**只有一份**：根目录 `site.manifest.json`。`verify-overlay.mjs`（门禁）、`theme-sync.mjs`（升级）、`create-site.mjs`（装配）读的是同一份编译产物 —— 这是 R-47「清单漂移」的唯一防线。

| 类 | 含义 | 升级行为 | 典型路径 |
|---|---|---|---|
| **T · theme** | 主题代码，整体替换 | `theme-sync --apply` 覆盖 | `src/{components,layouts,pages,styles,utils,scripts,integrations}/**`、`packages/**`、`scripts/gates/**`、`astro.config.mjs`、`package.json`、`pnpm-lock.yaml`、`.github/workflows/*.yml`、`docs/{DESIGN,upgrade,…}.*` |
| **O · overlay** | 站点身份/内容/数据/资产 | **永不触碰** | `src/config/{site,feature,ui,services}.ts`、`src/content/**`、`src/data/**`（除 `i18n/`）、`src/assets/**`、`public/assets/note/**`、`public/images/**`、`vercel.json`、`public/_headers`、`site.manifest.json`、`apps/demo/**`、`CHANGELOG.md` |
| **X · 排除** | 构建/缓存/评审档案 | 不动 | `dist/`、`node_modules/`、`.astro/`、`docs/_reviews/**`、`.claude/**` |

自检两条：

```bash
node scripts/gates/verify-overlay.mjs --report   # classified=N unclassified=0 ambiguous=0
node scripts/gates/verify-overlay.mjs --report | grep '^RESULT'   # 一行汇总
```

`unclassified>0` 意味着清单漏了规则（新增文件没归类），必须先补 `site.manifest.json`，**不许**用参数绕过。`scripts/theme-sync.mjs` 遇到未分类同样 exit 1。

---

## 3. 升级前检查

```bash
git status --porcelain            # 必须干净（theme-sync --apply 拒绝覆盖有未提交改动的 T 文件）
git tag -l                        # 确认目标 tag 存在
node scripts/theme-sync.mjs --list theme | wc -l   # T 文件分母（2.1.0 = 684）
```

`--apply` 的前置硬条件：它要写的每个 T 路径在本地**无未提交改动**；有则直接拒绝（不是警告，是 exit 1）。

---

## 4. 升级流程（一次 minor，≤30 分钟）

### 4.1 打回滚点

```bash
git tag upgrade/rollback-$(date +%Y%m%d%H%M) && git rev-parse --short upgrade/rollback-$(date +%Y%m%d%H%M)
```

tag 比 commit sha 好记，也比 `git stash` 可靠：`reset --hard` 能连 `pnpm-lock.yaml` 一起还原。

### 4.2 预览 diff（不写盘）

```bash
node scripts/theme-sync.mjs --from v2.0.0 --to v2.1.0 --dry-run
```

输出里看四个数：

| 数 | 期望 | 不为期望时说明什么 |
|---|---|---|
| `theme_changed` | `>0` | `0` = 两个 ref 之间没有主题变更（选错 ref 了） |
| `overlay_changed` | **`0`** | `>0` = 这次「升级」把站点数据也改了 → 拒绝继续（见 §7.3） |
| `unclassified_changed` | **`0`** | `>0` = 清单漏规则（R-47），先补 `site.manifest.json` |
| `exclude_changed` | 任意 | X 侧变更只报告不拦截 |

### 4.3 应用

计时口径**固定**（P3 判据就是它）：先清依赖，再计时整段。

```bash
rm -rf node_modules
time node scripts/theme-sync.mjs --from v2.0.0 --to v2.1.0 --apply
```

工具只做一件事：把区间内 **T 侧**变更从 `to` 的树写进工作区（含新增/删除/重命名）。O 侧一个字节都不写，也**不**改 `site.manifest.json`（清单属 O，升级后由人改）。

### 4.4 装依赖 + 构建 + 门禁

```bash
time pnpm install --frozen-lockfile
time pnpm build:ci
node scripts/gates/check-tokens.mjs                    # 必须 10/10
python3 scripts/gates/perf-budget.py dist              # 必须 over=0
node scripts/gates/verify-overlay.mjs                  # 必须 unclassified=0
```

`build:ci`（`astro build` + HTML 折叠）不带 7 个抓取脚本，是「可复现构建」的口径；`pnpm build` 会先跑抓取（`|| true` 兜底），不适合当门禁。

### 4.5 断言 overlay 没被动 + 更新清单

```bash
git diff --stat -- src/config src/content src/data src/assets public/assets/note public/images   # 期望 0 行
git diff --stat                                                                                   # 只应出现 T 文件
```

升级完成后手工改 `site.manifest.json`（**属 O，工具不代写**）：

```json
"theme": { "version": "2.1.0", "ref": "v2.1.0" }
```

再跑一次 `node scripts/gates/verify-m3-exit.mjs P10`：它要求「站点主题文件与 `theme.ref` 逐字节相同」。

### 4.6 回滚

```bash
git reset --hard upgrade/rollback-<时间戳>
git status --porcelain     # 必须 0 行
pnpm install --frozen-lockfile
```

`dist/`、`node_modules/` 是 X 类，不在 git 里，重置后重新构建即可。**不要**用 `git clean -fd src` 收尾 —— `src/content/article/` 与 `src/assets/` 的部分目录在 `.gitignore` 里，`clean` 会把 92 篇文章（本地 overlay）当垃圾删掉。

---

## 5. 出口门禁 `verify-m3-exit`

```bash
node scripts/gates/verify-m3-exit.mjs --all        # 或 pnpm gates:m3-exit
node scripts/gates/verify-m3-exit.mjs P1 P7        # 只跑指定项
node scripts/gates/verify-m3-exit.mjs --all --work /tmp/x --keep   # 换临时目录 / 保留取证
```

| 项 | 判据（PASS 条件） | 本次实测（2026-11-05） |
|---|---|---|
| **P1 可安装** | 新 out 目录装配 `apps/demo` + **真实** `pnpm install --frozen-lockfile` + `astro build`，墙钟 ≤ 30:00，`dist` HTML ≥ 8 | 27.8s · 118 HTML · node_modules 真实安装 |
| **P2 可配置** | 改 overlay 副本的 `site.ts` 标题/域名后重新装配构建：`git status --porcelain -- src/components packages` 空行，且新标题出现在 `dist/index.html` | 25.0s · 主题侧 0 行 · 新标题命中 11 次 |
| **P3 可升级** | ① dry-run 打印 `theme_changed>0 overlay_changed=0 unclassified_changed=0`；② 干净 clone 上 `install + --apply + build:ci + check-tokens + perf-budget + verify-overlay` 全 exit 0，墙钟 ≤ 30:00，O 侧 `git diff` 0 行，演练文案进产物；③ `git reset --hard` 后工作区 0 行 | 69.8s · `theme_changed=3 overlay_changed=0` · O 侧 0 行 · 回滚 0 行 |
| **P7 质量** | clean clone（`git clone --depth 1 file://<repo>`，0 篇文章）`install + build:ci + verify-overlay + verify-package-boundary + check-tokens + perf-budget` 全 exit 0 | 76.3s · 0 文章 · 110 HTML · 4 条门禁全绿 |
| **P10 客户零** | `theme.ref`（发布 tag）存在；`git diff <ref>..HEAD` 的 T 侧 0 个变更；装配产物的每个 T 文件与该 tag 的 blob **逐字节相同**（例外：`package.json` 由装配按设计改 name/description；baseline 层 `theme-template/{src,public}` 覆盖的同名 T 文件比该层自己的 blob；符号链接不比内容） | 见 `docs/_reviews/M3-exit/report.md` |

**计时口径**（P1/P3 都是 30 分钟判据，R-51）：一律「无 `node_modules` 的窄环境 → 装依赖 → 构建」，不在热缓存目录里计时。本机 `pnpm` store 已预热，所以 install 只要数秒；换机器请按同一口径重测，不要拿别人的秒数当基线。

门禁**不进** `ci.yml`：五项合计是分钟级且要 clone 两次，属出口/发布前判据，不是 PR 级检查（PR 门禁见 `pnpm gates:all`）。

---

## 6. minor 升级演练（§6.4 复现）

M3-8 用一次**真实 apply** 验证了这条链路。演练的每一步都可复跑：

```bash
# 0 · 回滚点（= 当前发布点）
git tag drill/pre-upgrade && git rev-parse --short drill/pre-upgrade

# 1 · 造一个合成 minor：1 个 token 值 + 1 句组件文案，全部落在 T 侧
git switch -c drill/v2.1.0
#   packages/tokens/tokens.json   改一个 token 值
node packages/tokens/scripts/build-tokens.mjs          # tokens.css 必须跟着重生（G-T1 逐字节）
#   src/components/Index/HeroMasthead.astro  文案里加 minor-drill 标记
git commit -am "drill: v2.1.0（1 token + 1 文案，全 T 侧）"

# 2 · 预览
node scripts/theme-sync.mjs --from drill/pre-upgrade --to drill/v2.1.0 --dry-run

# 3 · 应用（P3 计时口径：无 node_modules 的干净树）
rm -rf node_modules && time node scripts/theme-sync.mjs --from drill/pre-upgrade --to drill/v2.1.0 --apply

# 4 · 构建 + 门禁
time pnpm install --frozen-lockfile && time pnpm build:ci
node scripts/gates/check-tokens.mjs && python3 scripts/gates/perf-budget.py dist

# 5 · 断言 overlay 未动
git diff --stat -- src/config src/content src/data src/assets public/assets/note public/images

# 6 · 文案生效
grep -c "minor-drill" dist/index.html

# 7 · 回滚
git reset --hard drill/pre-upgrade && git status --porcelain
```

实测结果（2026-11-05，本机 Node 22.22.0 / pnpm 12.10.1）：

| 步 | 结果（本机 2026-11-05） |
|---|---|
| dry-run | `theme_changed=3 overlay_changed=0 unclassified_changed=0`（`tokens.json` + `tokens.css` + `HeroMasthead.astro`） |
| install | `pnpm install --frozen-lockfile` **2.2s**（store 已预热） |
| apply | `applied written=3 removed=0`，墙钟 **1.3s** |
| 构建 | clean clone（0 文章）`dist` **110** HTML，`build:ci` **25.3s**（astro 18.7s） |
| 门禁 | `check-tokens` 10/10 · `perf-budget` `over=0` · `verify-overlay` `unclassified=0` |
| overlay 断言 | `git diff --stat` O 侧 **0 行**；全量 diff 只有 3 个 T 文件（4 插入 / 4 删除） |
| 文案 | `dist/index.html` 命中 `minor-drill` 1 次 |
| 整段墙钟 | **≈30s**（install + apply + build + 门禁）≪ 30:00 |
| 回滚 | `reset --hard drill/pre-upgrade` 后 `git status --porcelain` 0 行、`git diff` 0 行 |

> 同一段判据在出口门禁里复跑（`verify-m3-exit P3`）实测 **69.8s**（`build:ci` 65.2s，clone 落在系统临时目录）。
> 同一台机器、同一条命令、不同次 25s–70s 的差异来自磁盘与负载（R-51）；判据是 **≤30:00**，不因一次快就收窄预算，也不因一次慢就放宽。

> 演练在**独立 clone** 里做（`git clone --branch drill/pre-upgrade file://<repo>`），不拿主工作区当靶子：主工作区有 92 篇被 ignore 的文章，任何 `reset/clean` 都可能误伤。clone 里 0 篇文章 → 构建 110 页；主工作区同命令是 476 页，页数差异来自内容，不是升级。

**drill refs 要留着**：`verify-m3-exit P3` 靠 `drill/pre-upgrade` + `drill/v2.1.0` 复跑同一段判据。清掉它们等于清掉出口证据（`git tag -d drill/pre-upgrade && git branch -D drill/v2.1.0`）。

---

## 7. 已知限制（都带验证命令，不猜）

### 7.1 只支持根路径部署，不支持子路径

```bash
grep -rc "import.meta.env.BASE_URL" src astro.config.mjs | grep -v ":0"   # 无输出 = 0 处
grep -rn 'href="/' src --include=*.astro | wc -l                          # 46 处（2026-11-05 复测）
```

`user.github.io/repo/` 这类子路径部署今天必然 404。要支持得把 46 处 `href="/…"` + 4 处 CSS `url("/…")` 全部改走 `BASE_URL`，属 M4（PO 决策 D-D ①「M3 只支持根路径 + 文档化」）。

### 7.2 GitHub Pages 没有 301、没有自定义 header

`/tag/:tag → /tags/:tag/` 在 GH Pages 只能用 meta-refresh 桩（SEO 语义弱于 301）；`public/_headers` 只对 Cloudflare Pages 生效。三目标差异与断言见 `docs/deploy-matrix.md` 与 `node scripts/gates/verify-deploy-artifacts.mjs dist --target <t>`。

### 7.3 `CHANGELOG.md` 与 `site.manifest.json` 属 O，跨版本区间的「发布元数据」会被判成 overlay 变更

`site.manifest.json` 把 `CHANGELOG.md` 归 **O**（§4.1「站点侧发布记录」），`verify-overlay.mjs` O3 要求 T/O 无死规则，所以它同时是「预留路径」。后果实测：

```bash
node scripts/theme-sync.mjs --from v2.0.0 --to v2.1.0 --dry-run
# theme_changed=… overlay_changed=2 unclassified_changed=0 → exit 1
#   O  A  CHANGELOG.md
#   O  M  site.manifest.json
```

这两条不是「升级改坏了站点」，而是**发布动作本身**动了 O 侧（新增 changelog、给新 T 文件补清单规则）。工具按契约拒绝，这是对的：`theme-sync` 不做例外。实操结论：

- 校验「升级机制」时用 **纯 T 区间**（§6 的 `drill/pre-upgrade → drill/v2.1.0`），`overlay_changed` 必为 0；
- 跨大版本升级时，把 `CHANGELOG.md` / `site.manifest.json` 的变更**单独 commit**（`chore(release):`），不要混在 `theme-sync --apply` 的那一次里；
- 是否要把 `CHANGELOG.md` 改判 T（发布记录随主题走，§3.5 的措辞其实支持），留待 decision-log —— M3 不改契约。

### 7.4 clean clone 里没有文章和部分图片

`.gitignore` 里有 `src/content/article/`、`src/assets/{note,coverimage,…}/`。clean clone → 0 篇文章，`build:ci` 仍然 exit 0（110 页，列表页走空态；P7 就是这条判据）。文章由内容仓 checkout 进来，不进这个仓库。

### 7.5 OG 图字体走网络

`packages/og-image` 的 route factory 接受 `fonts` 覆盖；不传时按主题配置下载字体。离线/受限 CI 必须显式给 `fonts`（本地路径或自托管 URL），否则出图阶段失败（失败会明确报错，不静默降级）。

---

## 8. 排错

| 症状 | 原因 | 处理 |
|---|---|---|
| `pnpm: command not found` | PATH 没带 nvm/homebrew bin | `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"`；`verify-m3-exit` 会自动扫 nvm 兜底并在找不到时明确报错 |
| `git ref 不存在：v2.1.0` | 目标 tag 没打 | `git tag v2.1.0 <release commit>`；`git tag -l` 看现有 tag |
| `overlay_changed>0` | 区间里有 O 侧变更（改配置/内容/数据，或发布元数据，见 §7.3） | 把 O 侧改动拆成独立 commit，升级只跑 T 侧 |
| `unclassified_changed>0` | 新增文件没归类（R-47） | 补 `site.manifest.json` 的 `rules`/`overrides`，再跑 `verify-overlay` |
| `拒绝应用：以下 T 路径有未提交改动` | 工作区脏 | `git stash` 或先 commit；工具不会覆盖未提交的 T 文件 |
| `theme.version ≠ 根 package.json version` | 版本没 lockstep | 四个 `package.json`（根 + 三包）+ `site.manifest.json` 一起改 |
| P1/P3 超过 30 分钟 | 网络/字体下载/冷 store | 先 `pnpm install` 预热 store 再按固定口径重测；把实测数字记进本节，不要放宽预算 |
| P10 报「主题文件在 <tag> 之后又被改动」 | 发布后又改了 T 文件 | 要么回滚那些 T 改动，要么升 minor 重新 tag —— 这正是 P10 要防的「私有 fork 化」 |

---

## 9. 相关命令速查

```bash
pnpm gates:all                    # PR 级门禁束（14 条）
pnpm gates:m3-exit                # M3 出口五项（P1/P2/P3/P7/P10）
node scripts/theme-sync.mjs --list theme|overlay|exclude
node scripts/create-site.mjs --overlay apps/demo --out /tmp/zcd --build [--install]
node scripts/gates/verify-overlay.mjs --report
node scripts/gates/verify-package-boundary.mjs
bash scripts/deploy-matrix.sh     # 三目标构建矩阵（GH Pages / Cloudflare / Vercel）
```
