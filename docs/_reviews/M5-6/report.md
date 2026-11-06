# M5-6 · 消费者升级指南与兼容矩阵 · 报告

- 卡：`t_f24cb07e`（M5-6，依赖 M5-5；下游 M5-7a `t_d47f9d6c`）
- 执行：2026-11-06 23:40–2026-11-07 00:40 HKT
- 基线：`zcblog-v2` `main` @ `972008e`；registry `latest` = `tokens 2.1.2` / `og-image 2.1.2`（`2.1.3` / `2.2.x` 不存在）
- 性质：**只改文档、示例与验证脚本**。没有发布任何 npm 包，没有动主题源码（`src/**`、`packages/*/src/**` 0 改动），没有切生产站。

## 0. 结论摘要

| 项 | 结论 |
| -- | ---- |
| 升级文档 | `docs/npm-consumer.md` 新增 §5（`2.1.x → 2.2.x` 升级）、§6（三种回滚）、§7（矩阵）；版本号刷新到 `2.1.2`；README / 包 README / `docs/upgrade.md` 版本口径同步，漂移清零 |
| 升级可执行性 | 用 §5.2 的**同一套命令**跑了 4 格真实升级：registry `2.1.1 → 2.1.2` + 本地 2.2.0 预演包；每步 `astro build` + 三条产物断言，**4 格 × 10 阶段全 PASS** |
| 消费者矩阵 | Node 22/24 × macOS/Linux 四格全 PASS；peer 警告 **0**；macOS Node 24 的 16 条 `npm warn` 全部是 npm 11.16 的 `allow-scripts`（fsevents），与包无关 |
| `2.2.0` 的真实性边界 | 未发布。预演包由仓库同源文件 `npm pack`（只改 `version` 字段）得到，文档与报告中明确标注「预演」而非「已上线」 |
| demo 重建 | `create-site --overlay apps/demo --build --install` → `RESULT PASS html=118`；`verify-deploy-artifacts` PASS；身份串扫描 0 文件；部署到 CF Pages `demo` 分支 `fbd7cfad`，别名 <https://demo.zcblog-v2.pages.dev>；线上首页与本地 `dist/index.html` **sha256 相同** |
| 生产站 | 未触碰：`zcblog-v2.pages.dev` 仍是 `Marx's Blog`；本轮 Pages 记录只有 `demo` 分支的新部署 |
| 门禁 | `pnpm gates:all` PASS（`classified=1121 unclassified=0`）；`verify-versions` 9 PASS/1 SKIP；`prettier --check` 全绿 |

## 1. 升级文档（`docs/npm-consumer.md`）

### 1.1 改了什么

| 节 | 内容 |
| -- | ---- |
| 头部 | 版本从 `2.1.1` 刷新到 `2.1.2`；加「版本以 registry 为准」的 `npm view` 命令；加版本一览表（`2.1.2` / `2.1.1` / `2.1.0` / `0.0.0-stage` 别装 / `2.1.3+`、`2.2.x` 未发布） |
| §1、§4 | 安装与验证示例版本号同步到 `2.1.2`；`peerDependenciesMeta.optional` 的说明补全 |
| **§5 升级** | 5.1 先确认改了什么（`npm view versions` / `dist.integrity`、semver 承诺、两包 lockstep）→ 5.2 三条命令（备份 + 显式版本安装 + 重建；npm/pnpm/Yarn 三写法；caret 会偷跑 minor 的坑）→ 5.3 升级后验收（HTML / tokens 变量 / 1200×630 PNG）→ 5.4 peer 与常见报错的读法表 → 5.5 这条路径验证到什么程度（registry 段 + 本地预演段） |
| **§6 回滚** | 6.1 pin 回滚（最快）／6.2 锁文件回滚（`cp` 备份 + `npm ci`，最彻底）／6.3 git 回滚／6.4 回滚后必须复验；并声明回滚不需要、也不能做 registry 写操作 |
| **§7 矩阵** | 四格实测表 + 读数说明（首装列 vs 升级列口径、Linux 网络差异、peer=0 与 16 条 `allow-scripts` 的来源）+ 7.1 复现命令（`consumer-probe.mjs` / `verify-consumer-matrix.mjs`） |
| §8 | 已知限制保留，新增「2.2.x 尚无 registry 版本」与「demo 用的是与 2.1.2 tarball 逐字节一致的包内容」两条 |

### 1.2 文档里被实测纠正的两处

- **CSS 变量断言**：初稿写 `grep -l -- --color-accent dist/_astro/*.css`，在 demo 产物上查不到——Astro 把小体积 CSS 内联进 HTML，tokens 变量落在 `dist/**/*.html` 里。文档已改成 `grep -rl -- --color-accent dist`（全 `dist/` 扫，内联/独立 CSS 都算），并在文中说明原因。
- **`file` 的输出口径**：写清「输出必须含 `1200 x 630`」，实测 `file dist/og/hello.png` → `PNG image data, 1200 x 630, 8-bit/color RGBA, non-interlaced`。

## 2. 照着文档走一遍（第三方视角复跑）

不是「探针跑过就算」——用文档 §1 / §5.2 / §5.3 / §6.1 / §6.2 的**原样命令**在空目录里从零走了一遍
（macOS，Node 24.13.0，npm 11.16.0）：

```console
$ npm i astro@^7.3.6 @marxchou/dogeared-tokens@2.1.1 @marxchou/dogeared-og-image@2.1.1
$ npm ls @marxchou/dogeared-tokens @marxchou/dogeared-og-image --depth=0
├── @marxchou/dogeared-og-image@2.1.1
└── @marxchou/dogeared-tokens@2.1.1                                       # §5.2 步骤 0
$ cp package.json package.json.bak-upgrade && cp package-lock.json package-lock.json.bak-upgrade
$ npm install @marxchou/dogeared-tokens@2.1.2 @marxchou/dogeared-og-image@2.1.2   # §5.2 步骤 1
$ npm run build
[build] Complete!                                                         # §5.2 步骤 2
$ test -f dist/index.html && echo "html OK"
html OK
$ grep -rl -- "--color-accent" dist | head -1
dist/_astro/index.DBSS0w6l.css
$ file dist/og/hello.png
dist/og/hello.png: PNG image data, 1200 x 630, 8-bit/color RGBA, non-interlaced  # §5.3 三条全过

# §6.1 pin 回滚 → 再 build：Complete（dst 仍是 2.1.2）
# §6.2 锁文件回滚 → cp 备份 + npm ci → 版本回到 2.1.1 → 再 build：Complete，三条断言仍过
```

结论：文档里的每一步都有对应实测输出，包括回滚后再次验收。

## 3. 消费者矩阵（真实命令输出）

### 3.1 表格（`docs/_reviews/M5-6/matrix.json` 生成的原文）

| Cell            | Node    | npm    | OS                    | 首装 `2.1.1` (s) | 升级 `2.1.2` (s) | minor 预演 (s) | pin 回滚 (s) | lockfile 回滚 (s) | peer 警告 | 其它 npm 警告 | 结果 |
| --------------- | ------- | ------ | --------------------- | ---------------: | ---------------: | -------------: | -----------: | ----------------: | --------: | ------------: | ---- |
| `node22-darwin` | 22.22.0 | 10.9.4 | darwin 24.6.0         |             14.6 |              2.0 |            1.4 |          1.7 |               6.8 |         0 |             0 | PASS |
| `node24-darwin` | 24.13.0 | 11.16.0 | darwin 24.6.0        |             37.3 |              2.2 |            2.3 |          1.3 |               5.9 |         0 |            16 | PASS |
| `node22-linux`  | 22.23.4 | 10.9.9 | linux 6.12.107+deb13  |             86.4 |             20.2 |            0.8 |          0.7 |               3.8 |         0 |             0 | PASS |
| `node24-linux`  | 24.22.2 | 11.19.1 | linux 6.12.107+deb13 |            131.4 |              1.7 |            0.7 |          0.6 |               3.5 |         0 |             0 | PASS |

### 3.2 每格的 10 个阶段（原始 console）

`node24-darwin`（本机 nvm）：

```console
$ node scripts/release/consumer-probe.mjs --cell=node24-darwin --next-tokens=… --next-og=… --out=…
[PASS] install-2.1.1       37255ms  2.1.1/2.1.1  peer=0 other-warn=0
[PASS] build-2.1.1         11186ms  2.1.1/2.1.1  peer=0 other-warn=0
[PASS] upgrade-2.1.2        2233ms  2.1.2/2.1.2  peer=0 other-warn=4
[PASS] build-2.1.2          3812ms  2.1.2/2.1.2  peer=0 other-warn=0
[PASS] next-minor-rehearsal 2256ms  2.2.0/2.2.0  peer=0 other-warn=4
[PASS] build-next-minor     4477ms  2.2.0/2.2.0  peer=0 other-warn=0
[PASS] rollback-pin-2.1.2   1318ms  2.1.2/2.1.2  peer=0 other-warn=4
[PASS] build-rollback-pin   2519ms  2.1.2/2.1.2  peer=0 other-warn=0
[PASS] rollback-lockfile-ci 5891ms  2.1.2/2.1.2  peer=0 other-warn=4
[PASS] build-rollback-lock  2727ms  2.1.2/2.1.2  peer=0 other-warn=0

RESULT PASS  cell=node24-darwin node=24.13.0 npm=11.16.0 platform=darwin final=2.1.2/2.1.2
```

`node22-linux`（Debian 13 宿主上的 `node:22-bookworm-slim`）：

```console
[PASS] install-2.1.1       86393ms  2.1.1/2.1.1  peer=0 other-warn=0
[PASS] build-2.1.1          5083ms  2.1.1/2.1.1  peer=0 other-warn=0
[PASS] upgrade-2.1.2       20190ms  2.1.2/2.1.2  peer=0 other-warn=0
[PASS] build-2.1.2          1665ms  2.1.2/2.1.2  peer=0 other-warn=0
[PASS] next-minor-rehearsal  766ms  2.2.0/2.2.0  peer=0 other-warn=0
[PASS] build-next-minor     1633ms  2.2.0/2.2.0  peer=0 other-warn=0
[PASS] rollback-pin-2.1.2    748ms  2.1.2/2.1.2  peer=0 other-warn=0
[PASS] build-rollback-pin   1655ms  2.1.2/2.1.2  peer=0 other-warn=0
[PASS] rollback-lockfile-ci 3848ms  2.1.2/2.1.2  peer=0 other-warn=0
[PASS] build-rollback-lock  1736ms  2.1.2/2.1.2  peer=0 other-warn=0

RESULT PASS  cell=node22-linux node=22.23.4 npm=10.9.9 platform=linux final=2.1.2/2.1.2
```

`node24-linux` 同构（`node=24.22.2 npm=11.19.1`，首装 131393ms、升级 1706ms、minor 预演 709ms、pin 回滚 625ms、lockfile 回滚 3460ms，全 PASS）；`node22-darwin` 见 `matrix.json`（首装 14.6s，升级 2.0s）。

### 3.3 断言不是「装完就算」

每格的 `build-*` 阶段都会验证：`dist/index.html` 非空、产物里能读到 `--color-bg` / `--color-accent` / `--color-fg` 三个变量、`dist/og/hello.png` 是 PNG 且 IHDR 宽高为 `1200×630`。任一不满足 → 该阶段 `ok=false` → 矩阵 `MATRIX FAIL`。

### 3.4 警告口径

- **peer 警告 0**：`tokens` 无 peer；`og-image` 的 `astro@^7.3.6` peer 是 optional 且被满足（`astro 7.4.7`）。
- **macOS Node 24 的 16 条**：`npm warn allow-scripts … fsevents@2.3.3`，npm 11.16 新增的可选依赖安装脚本提示，4 个 install 阶段 × 4 行。Node 22 的 npm 10.9.x 没有该功能，所以为 0；Linux 无 fsevents，也为 0。

## 4. demo 重建与部署

### 4.1 「用当前 registry 版本重建」怎么保证

demo 是**主题源码 + overlay** 装配出来的（`create-site.mjs` 四层覆盖），不直接装 registry 包；所以先证明「仓库里的包内容 == registry 2.1.2 的内容」，再重建：

```console
$ npm pack @marxchou/dogeared-tokens@2.1.2 @marxchou/dogeared-og-image@2.1.2   # 解包后逐一比对
tokens/tokens.css     2× d7cfafd169debe7a9be163d6bdea6a8d9c15e3b8f01bb40723151ddd0cd85c58
tokens/tokens.json    2× 95ea569c9009717772e938ef8c5c895cf96220910c944b23d2077b1e714c4852
tokens/variables.css  2× 09a6d324300c5b11214660e83a68a292fe16472112f7d5c46a6e50db5f0d281c
og/index.js           2× 4ebfabe6184dbae06eaafc1484a16fc19d82f802cb2986ecb8b293249f0c2258
og/index.d.ts         2× 71245a73179a36f2563667a4ab486e864e8f2f47be8f3846c281ad78afabb3eb
og/route.js           2× 1c489c512fb44c5a0a766d9a001a05d59e970e58f66e4d698a36a6943edc8006
og/route.d.ts         2× 19820895936a2a7d0556e04aeeac24f7f65906fb8affc067916062c768705cc4
og/types.js           2× 713c07e6fcd8e9512942f5ef30c587ac07772d05613f09938b970dba60eadac2
og/types.d.ts         2× 48ea169c4d839c5781bf2fa2926e415a607c8c068ee9968daa7c9255533a348b
```

（`2×` = 仓库文件与 tarball 内文件 sha256 同一行输出，两个哈希相同。）9 个关键文件逐一相等 → demo 构建用的就是 `2.1.2` 的字节。

### 4.2 构建

```console
$ SITE_URL="https://demo.zcblog-v2.pages.dev" node scripts/create-site.mjs \
    --overlay apps/demo --out /tmp/demo-m56 --build --install
产物
  dist HTML: 118（阈值 8）
  首页含 overlay 标题「Dogeared Demo」：13 次
  构建耗时: 29.6s

RESULT PASS  out=/tmp/demo-m56 html=118 overlay=apps/demo title_hits=13 build=29.6s layers=theme:490/baseline:28/shim:13/overlay:9
```

### 4.3 产物校验与身份扫描

```console
$ node scripts/gates/verify-deploy-artifacts.mjs /tmp/demo-m56/dist \
    --target cloudflare --expect-site "https://demo.zcblog-v2.pages.dev"
RESULT PASS target=cloudflare site=https://demo.zcblog-v2.pages.dev stubs=3/3 fails=0

$ grep -rIlE 'MIFSH|mcc\.im|MarxChou' /tmp/demo-m56/dist | wc -l
0
$ grep -rIoh 'marxchou' /tmp/demo-m56/dist | wc -l
4        # 全部是 @marxchou/dogeared-tokens 包名
```

### 4.4 部署（只写 `demo` 分支）

```console
$ npx wrangler pages deploy /tmp/demo-m56/dist --project-name zcblog-v2 --branch demo --commit-dirty=true
✨ Success! Uploaded 76 files (145 already uploaded) (3.10 sec)
✨ Deployment complete! Take a peek over at https://fbd7cfad.zcblog-v2.pages.dev
✨ Deployment alias URL: https://demo.zcblog-v2.pages.dev
```

- deployment id：`fbd7cfad-fd60-4f39-a553-b56274967a76`（environment `Preview`，branch `demo`）
- `wrangler pages deployment list` 中本轮只有 `demo` 分支的新记录；`Preview / m5-2-consumer` 等历史记录未被改动。

### 4.5 线上验收

| URL | HTTP | `<title>` | 身份串命中 |
| --- | ---: | --- | ---: |
| `https://demo.zcblog-v2.pages.dev/` | 200 | 这里没有答案，但有同路人。 - Dogeared Demo | 0 |
| `https://demo.zcblog-v2.pages.dev/projects/` | 200 | 项目 - Dogeared Demo | 0 |
| `https://demo.zcblog-v2.pages.dev/archives/` | 200 | 归档 - Dogeared Demo | 0 |
| `https://demo.zcblog-v2.pages.dev/design/` | 200 | 文档站 · Design system | 0 |

**sitemap 全量复核**：`sitemap-0.xml` 里 25 个 URL 全部 HTTP 200，逐页 `grep -E 'MIFSH|mcc\.im|MarxChou'` **0 命中**（共 0 条）。

线上首页与本地构建产物**逐字节一致**：

```console
$ curl -s https://demo.zcblog-v2.pages.dev/ -o /tmp/demo-live-index.html
$ shasum -a 256 /tmp/demo-live-index.html /tmp/demo-m56/dist/index.html
9897b8ffc62635ea69d38321bcb727156c021e709c9a9522c746b41cc9abadd3  /tmp/demo-live-index.html
9897b8ffc62635ea69d38321bcb727156c021e709c9a9522c746b41cc9abadd3  /tmp/demo-m56/dist/index.html
61212 bytes / 61212 bytes
```

### 4.6 生产站未变

```console
$ curl -s https://zcblog-v2.pages.dev/ | grep -o '<title>[^<]*</title>'
<title>这里没有答案，但有同路人。 - Marx&#39;s Blog</title>
```

## 5. 版本与入口漂移检查

| 位置 | 检查 | 处理 |
| ---- | ---- | ---- |
| `packages/tokens/README.md` | 写「published as `2.1.1`」 | 改为 `2.1.2` + 「版本以 registry 为准（`npm view` / `pnpm verify:registry`）」+ 指向 npm-consumer §5/§6 |
| `packages/og-image/README.md` | 同上 | 同上 |
| `docs/upgrade.md` | §0 版本说明仍写「已发 2.1.1」 | 改为「当前 latest 2.1.2，2.1.1 是 README-only patch；主题升级基线仍是 `v2.1.0` tag」并指向 npm-consumer §5–§7 |
| `README.md` 消费者入口 | 无版本、无升级指向 | 补 npm-consumer 小节号导览 + 当前 `latest` 一行 |
| `README.md` 可用脚本·发布 | 缺 changesets / verify 系列 | 补 `release:packages`、`verify:versions`、`verify:registry`、`verify:consumer-matrix`、`fixture:next-minor` |
| `packages/ui/README.md` | 写 `@<npm-scope>/dogeared-ui` 占位 | **故意不改**：包边界门禁（B2）禁止在包文件写组织身份；`ui` 本轮不发布（M5-8 另计） |
| 入口路径 | `docs/npm-consumer.md`、`docs/upgrade.md`、`apps/demo/README.md`、`docs/_reviews/M5-2/report.md` | 全部存在 |

## 6. 新增的验证脚本（只读，不发布）

| 文件 | 作用 |
| ---- | ---- |
| `scripts/release/consumer-probe.mjs` | 单格生命周期探针：临时目录搭最小 Astro 消费者 → `2.1.1` 安装 → 升级 `2.1.2` → 装本地 `2.2.0` 预演包 → pin 回滚 → 锁文件回滚；每步计时 + 分类 peer/其它警告 + 产物断言，输出 JSON |
| `scripts/release/prepare-next-minor-fixture.mjs` | 把 `packages/{tokens,og-image}` 复制到临时目录、只改 `version`、`npm pack --ignore-scripts`；校验 tarball 内版本，产出 `2.2.0` 预演包（tokens 20606 B / og-image 12212 B） |
| `scripts/release/verify-consumer-matrix.mjs` | 汇总矩阵：本机 Node 22/24 逐格跑 probe（`--docker=true` 走 docker 跑 Linux 格），可 `--include=` 合并外部采集的 cell JSON，`--skip-local=true` 只合并；输出 `matrix.json` + Markdown 表 |

`package.json` 增加：`verify:consumer-matrix`、`verify:consumer-matrix:docker`、`fixture:next-minor`。

## 7. 门禁与格式

```console
$ node scripts/release/verify-versions.mjs
RELEASE_SUMMARY {"title":"版本 lockstep / tag 一致性","ok":true,"counts":{"PASS":9,"FAIL":0,"WARN":0,"INFO":0,"SKIP":1},"version":"2.1.2"}

$ pnpm gates:all
RESULT PASS  classified=1121 unclassified=0 theme=720 overlay=302 exclude=99 plan_baseline=998 delta=+123

$ pnpm exec prettier --check <本轮改动的 10 个文件>
All matched files use Prettier code style!
```

## 8. 边界与未做

- **没有**发布 `@marxchou/dogeared-ui`；`private: true` 未动（M5-8 另卡，需 PO 批准）。
- **没有**任何 registry 写操作（无 publish / unpublish / deprecate / dist-tag）。注：执行期间 M5-5 的 PO 批准动作把 `0.0.0-stage` 删了（D-0135），本卡复核定稿时 `versions` 只剩 `2.1.0 / 2.1.1 / 2.1.2`；本卡自身未做任何写入。
- **没有**动主题源码：`git diff --stat` 只有 `CHANGELOG.md`、`README.md`、`docs/npm-consumer.md`、`docs/upgrade.md`、`package.json`、两个包 README；`src/**`、`packages/*/src/**`、`astro.config.*`、`.github/workflows/**` 0 行改动。
- **没有**切生产站、没有改 `demo` 以外的 Pages 分支、没有改 DNS。
- **没有** CI 侧改动：demo 自动部署仍由 `demo.yml` 负责；本轮的 demo 更新是本地 `wrangler pages deploy --branch demo`。
- `2.2.0` 是本地预演，不是发布版本；真实 `2.2.0` 上线后需重跑 §5.1 的 `npm view` 并把 §7 矩阵的「minor 预演」列换成 registry 实测。

## 9. 复现命令（全套）

```bash
cd ~/Documents/WebSiteCode/zcblog-v2
export PATH="$HOME/.nvm/versions/node/v24.13.0/bin:$PATH"   # 本机 nvm 的 Node 24

# 1) 2.2.0 预演包
node scripts/release/prepare-next-minor-fixture.mjs --version=2.2.0 --out=/tmp/m56-fx

# 2) 本机（macOS）Node 22 + 24
node scripts/release/verify-consumer-matrix.mjs --majors=22,24 \
  --fixtures=/tmp/m56-fx --out=/tmp/m56-matrix/local.json

# 3) Linux 格（有 docker daemon 时；镜像 node:22/24-bookworm-slim）
node scripts/release/verify-consumer-matrix.mjs --docker=true --majors=22,24 \
  --fixtures=/tmp/m56-fx --out=/tmp/m56-matrix/linux.json

# 4) 合并（本地无 docker 时用 --include 合并远端 cell JSON）
node scripts/release/verify-consumer-matrix.mjs --skip-local=true --fixtures=/tmp/m56-fx \
  --include=/tmp/m56-matrix/node22-darwin.json --include=/tmp/m56-matrix/node24-darwin.json \
  --include=/tmp/m56-matrix/node22-linux.json  --include=/tmp/m56-matrix/node24-linux.json \
  --out=docs/_reviews/M5-6/matrix.json

# 5) demo 重建 + 部署
SITE_URL="https://demo.zcblog-v2.pages.dev" node scripts/create-site.mjs \
  --overlay apps/demo --out /tmp/demo-m56 --build --install
node scripts/gates/verify-deploy-artifacts.mjs /tmp/demo-m56/dist \
  --target cloudflare --expect-site "https://demo.zcblog-v2.pages.dev"
npx wrangler pages deploy /tmp/demo-m56/dist --project-name zcblog-v2 --branch demo --commit-dirty=true
```

## 10. 下游提醒（M5-7a）

- 本卡新增 3 个 `scripts/release/*.mjs`，`pnpm exec prettier --check .` 已覆盖；`verify-consumer-matrix` 写出的 `matrix.json` 是 Prettier 格式化过的，若重跑生成需再 `pnpm format` 一次。
- demo 部署现在挂在 deployment `fbd7cfad`（本地 dirty 树，`--commit-dirty=true`）。M5-7b 收口 demo 漂移时以此为新基线。
