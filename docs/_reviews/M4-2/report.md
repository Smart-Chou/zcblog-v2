# M4-2 · tokens tarball 消费验证

- 卡：`t_881eda1a` · M4-2（计划见 `blog2.0/docs/23-m4-plan.md`）
- 日期：2026-11-06 02:35 CST · 基线 commit `d2abf72`（`chore(m4-1)`，工作树 clean）
- 环境：macOS 15.7.7 · node `v26.0.0` · npm `11.12.1`
- 结论：**`@marxchou/dogeared-tokens@2.1.0` 的 tarball 可被空目录里的干净 ESM 消费者安装并使用**；CSS/JSON 逐字节与仓内一致（sha256 全等），零依赖、零 peer 警告。发现 5 项包导出/CLI 设计问题，**只记录不改公共 API**，建议 M4-4 前决策。本卡未 publish、未改版本、未改站点。

## 1. `npm pack`

计划里的 `npm pack --workspace @marxchou/dogeared-tokens` 在 npm 11 下不可用——根 `package.json` 没有 `workspaces` 字段（工作区只用 `pnpm-workspace.yaml` 声明），npm 会直接报 `No workspaces found`。等价做法（与 M4-1 一致）：在包目录内执行 `npm pack`，`files` 白名单语义完全相同。

```console
$ cd packages/tokens && npm pack --pack-destination /tmp/dogeared-pack --json
[
  {
    "id": "@marxchou/dogeared-tokens@2.1.0",
    "name": "@marxchou/dogeared-tokens",
    "version": "2.1.0",
    "size": 20043,
    "unpackedSize": 68511,
    "shasum": "d46678808f56d86f39ac6fa60098ff1fdd849340",
    "integrity": "sha512-Hv0KuxAa00a7Xn0qCuPDg71soabRK02xxtCu0c1rraJgikokGZ34cgXf5lxd+1NCTmsjdWgIhqL0Zoow0zo2lg==",
    "filename": "marxchou-dogeared-tokens-2.1.0.tgz",
    "entryCount": 8,
    "bundled": []
  }
]
```

| 项 | 值 |
| --- | --- |
| tarball | `/tmp/dogeared-pack/marxchou-dogeared-tokens-2.1.0.tgz` |
| packed / unpacked | 20,043 B（19.6 KB）/ 68,511 B（66.9 KB） |
| 文件数 | 8 |
| sha1（npm `shasum`） | `d46678808f56d86f39ac6fa60098ff1fdd849340` |
| sha256（tgz 本体） | `c22ae32f2b8c3d8bd0db5ea7c1195f7b59f67b90a05cb0862c4b425d67465a38` |
| integrity | `sha512-Hv0KuxAa00a7Xn0q…0zo2lg==` |

sha1 与 M4-1 `--dry-run` 记录的 `d4667880…` **完全一致**：从 M4-1 到本卡，包文件集与内容没有漂移。

## 2. 清单 + 逐文件 sha256（tarball vs 仓内）

```console
$ tar -tzvf marxchou-dogeared-tokens-2.1.0.tgz
-rw-r--r--  0 0  0    1065 package/LICENSE
-rw-r--r--  0 0  0    1788 package/NOTICE
-rw-r--r--  0 0  0   11384 package/tokens.css
-rw-r--r--  0 0  0    6802 package/variables.css
-rw-r--r--  0 0  0    1310 package/package.json
-rw-r--r--  0 0  0   18214 package/tokens.json
-rw-r--r--  0 0  0    2422 package/README.md
-rw-r--r--  0 0  0   25526 package/scripts/build-tokens.mjs
```

| 文件 | 字节 | sha256（仓内 = 解包后，全部 OK） |
| --- | --- | --- |
| `tokens.css` | 11,384 | `d7cfafd169debe7a9be163d6bdea6a8d9c15e3b8f01bb40723151ddd0cd85c58` |
| `tokens.json` | 18,214 | `95ea569c9009717772e938ef8c5c895cf96220910c944b23d2077b1e714c4852` |
| `variables.css` | 6,802 | `09a6d324300c5b11214660e83a68a292fe16472112f7d5c46a6e50db5f0d281c` |
| `scripts/build-tokens.mjs` | 25,526 | `24082888b83c0ecbb0d0674fa612b532cc425a13c6382a9f5de170f64e86bb1a` |
| `README.md` | 2,422 | `64ff6aa3e61e6037d3a4c212487889546a4717407e019d4c395caa2c5289d6c2` |
| `LICENSE` | 1,065 | `97684ebfb758c6e5afdba14d85651c2ccdb225eb85c7c209487dc2ab5292e335` |
| `NOTICE` | 1,788 | `9ad03bd5f8aa9190e393290afa3e9cee6a5518f11c6795907f3b1aff7bfb08b9` |
| `package.json` | 1,310 | `4b10005c40c9dabe11042cb5c91c8ba508793aec3072bef66ddd0aa310afa31e` |

8 个条目 = `files` 白名单 7 项 + npm 强制携带的 `package.json`，一个不多一个不少。

## 3. 私有物 / 测试物扫描

```console
$ tar -tzf …tgz | grep -E "node_modules|\.test\.|__tests__|\.spec\.|\.env|\.map$"
none
```

- 无 `node_modules`、测试文件、`*.map`、`.env`、`.gitignore` 之外的隐式文件。
- 本机路径（`/Users/…`、`/home/…`）在包内 **0 命中**；唯一命中 `env` 关键词的两行是 `process.env.TOKENS_REPO_ROOT` / `process.env.TOKENS_DESIGN_DOC` 变量名，不是值。
- 站点身份串：`tokens.css` / `tokens.json` / `variables.css` **0 命中**；命中仅出现在
  - `package.json` 的 `name` / `homepage` / `repository` / `bugs`（包自身身份与仓库地址，B2 已按 `pkgName` 豁免口径处理）；
  - `LICENSE` / `NOTICE` 的 `Copyright (c) 2026 MarxChou` 与 Shirone 出处链接（法务必需）。
- 站点私有数据（B4 的 51 个 sha256 样本）在包内 0 命中——见 §7 门禁输出。

## 4. 干净消费者安装

空目录 `/tmp/dogeared-consumer`，`package.json` 只有 `{name, version, private, type:"module"}`：

```console
$ npm install /tmp/dogeared-pack/marxchou-dogeared-tokens-2.1.0.tgz --no-audit --no-fund
added 1 package in 301ms
```

| 指标 | 结果 |
| --- | --- |
| 安装退出码 | 0 |
| 墙钟耗时（3 次，含 `node` 启动与目录创建） | 560 / 559 / 561 ms |
| npm 自报 | 301 ms |
| 安装包数 | 1（`@marxchou/dogeared-tokens`），`dependencies` 为空，`node_modules` 下只有 `@marxchou` |
| peer 警告 | 无（本包无 `peerDependencies`） |
| engines 警告 | 无（本机 node 26 越界，见 F4） |
| 寻址 | lockfile 记录为 `file:../../../tmp/dogeared-pack/…tgz`，integrity 与 pack 输出一致 |

## 5. 消费断言（7/7 PASS）

```console
CHECK | PASS | bare-specifier import '@marxchou/dogeared-tokens' | threw ERR_PACKAGE_PATH_NOT_EXPORTED (no "." export — finding F1)
CHECK | PASS | import '@marxchou/dogeared-tokens/package.json' | name=@marxchou/dogeared-tokens version=2.1.0 private=true license=MIT
CHECK | PASS | import '@marxchou/dogeared-tokens/tokens.json' | bytes=18214 sha256=95ea569c90… topKeys=[version,designDoc,$comment,palette]
CHECK | PASS | resolve+read '@marxchou/dogeared-tokens/tokens.css' | bytes=11384 sha256=d7cfafd169de… match_repo=true
CHECK | PASS | resolve+read '@marxchou/dogeared-tokens/variables.css' | bytes=6802 sha256=09a6d324300c… match_repo=true
CHECK | PASS | import '@marxchou/dogeared-tokens/scripts/build-tokens.mjs' | exports=18 packageRoot=/private/tmp/dogeared-consumer/node_modules/@marxchou/dogeared-tokens css_sha256=d7cfafd169de…
CHECK | PASS | bin dogeared-tokens-build --check | exit=1 failed_gates=[[FAIL] designDoc — 找不到 tokens.json.designDoc 指向的文件…] (finding F2)

SUMMARY checks=7 pass=7 fail=0
```

口径说明：

1. **裸包入口**：`exports` 没有 `"."`，所以 `import "@marxchou/dogeared-tokens"` 抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`。这是 M4-1 的有意设计（本包无 JS 入口），本卡把「抛该错误而非解析到不该暴露的文件」当作通过，并记为 F1。
2. **CSS 字节断言**：`import.meta.resolve()` 解析子路径 → 读磁盘 → sha256，与仓内 `packages/tokens/tokens.css`、`variables.css` **全等**。这也证明 `exports` 的三个 CSS/JSON 子路径在真实安装树里可解析。
3. **JS 入口**：`scripts/build-tokens.mjs` 可被 import，18 个导出可用，且其 `packageRoot` 指向 `node_modules` 内的副本、`cssPath` 读出的 hash 等于仓内 hash——包内自带构建器在消费端不依赖仓库。
4. **bin**：`dogeared-tokens-build --check` 在消费端 **exit 1**，但失败项只有 `designDoc`（找不到 `docs/DESIGN.md`），G-T2/G-S1…G-S4 全部 `[OK]`。见 F2。

## 6. CSS 的 bundler 消费（esbuild = Vite/Astro 的 CSS 管线底层）

```console
$ esbuild bundle/entry.js --bundle --format=esm --outfile=bundle/out.js --loader:.css=css
  （entry.js: import "@marxchou/dogeared-tokens/tokens.css"; import "…/variables.css";）
esbuild exit=0
bundled css bytes=14374
repo tokens.css            bytes=11384 sha256=d7cfafd1…
bundle_starts="/* node_modules/@marxchou/dogeared-tokens/tokens.css */\n:root {\n  --palette-pape…"

repo_var_names=175  bundle_var_names=236  repo_only=0
repo_decls=229      missing_in_bundle=3
missing_sample=["--font-serif: Newsreader, DM Serif Display, Georgia, \"Source Han Serif SC\", …",
                "--font-sans: …", "--font-mono: …"]
```

结论：CSS 子路径能被 bundler 正常打包，**175 个 token 变量名一个不缺**（`repo_only=0`）。229 条声明里 3 条字体族文本不一致，原因是 esbuild 的 CSS 归一化（去引号/重排），不是内容丢失——打包产物字节不参与「与仓内一致」断言，字节断言只针对 tarball 内的 `tokens.css` 本体（§5）。

## 7. 门禁

```console
$ node scripts/gates/verify-package-boundary.mjs
W0  workspace 骨架（packages: / 三包 manifest / lockstep） PASS  0 项
B1  包内 `~/` 别名 import = 0、相对路径不越界       PASS  0 项
B2  包内站点身份串（marxchou/mcc.im/zcily/73b29141）= 0 PASS  0 项
B3  依赖 ⊆ 白名单 + 站内引用 workspace:*           PASS  0 项
B4  站点私有数据不进包（sha256 51 个样本）           PASS  0 项
RESULT PASS  packages=3 violations=0 theme_version=2.1.0

$ node scripts/gates/check-tokens.mjs
G-T1 生成物一致 PASS（packages/tokens/tokens.css 11384 bytes · sha256 d7cfafd169de…）
G-T2…G-S6 全 PASS
结果：10/10 PASS · 0 FAIL
```

```console
$ node_modules/.bin/prettier --check docs/_reviews/M4-2/report.md
Checking formatting...
All matched files use Prettier code style!
```

本卡未改 `packages/**` 任何文件，因此 prettier 只对本报告生效（`packages/**` 的格式在 M4-1 已验过）。

## 8. 发现（只记录，建议 M4-4 前决策；本卡未改任何公共 API）

| ID | 现象 | 影响 | 建议 |
| --- | --- | --- | --- |
| F1 | `exports` 无 `"."`，裸 import 抛 `ERR_PACKAGE_PATH_NOT_EXPORTED` | 消费者若习惯 `import "@scope/pkg"` 会直接失败；默认导入 CSS 的写法（`import "@scope/pkg/tokens.css"`）是唯一正确姿势 | 二选一：在 README 顶部显式写「本包只能按子路径使用」，或补一个 `"."` → 一个极小的 `index.css`（`@import` 两级）作为默认入口。**不要**补指向 JS 的假入口 |
| F2 | 随包发布的 bin `dogeared-tokens-build --check` 在消费端必然 exit 1：`tokens.json.designDoc` 指向 `docs/DESIGN.md`，该文件不进包，`repoRoot` 落到 `node_modules/…` | 外部用户跑 `--check` 会把「缺设计文档」误读为包坏了；G-T1/G-T2…G-S4 实际全过 | 三选一：(a) 缺失 designDoc 时降级为 `SKIP` 且不影响 exit code；(b) 不发布 bin（`files` 去掉 `scripts/`，`bin` 保留仅仓库内用）；(c) 把 `DESIGN.md` 打进包。推荐 (a) + 文档说明 |
| F3 | `tokens.json` 子路径在 Node 里必须 `with { type: "json" }`；包内无 JS/TS 包装 | `import tokens from "@scope/pkg/tokens.json"` 在老写法下报 `ERR_IMPORT_ATTRIBUTE_MISSING`；无 TS 类型 | M4-4 评估补 `tokens.js`（导出对象）+ `tokens.d.ts`，`exports` 增加 `"./tokens"`；JSON 子路径保留 |
| F4 | `engines.node = ^22 || ^24`，本机 node 26 越界但 npm 11 装本地 tarball 未报 `EBADENGINE` | registry 用户在 26 上无显式警告，仍能装；但 engines 与实际可运行范围不符 | M4-4 发布前把 `engines` 放宽到 `>=22`（或显式加 26），并视需要加 `engine-strict` 说明 |
| F5 | README 安装段用 `@<npm-scope>` 占位（B2 门禁把任何包内 `marxchou` 文本视为身份泄漏） | 发布后读者需自行替换 scope；复制粘贴不可直接运行 | M4-4 发布后再回填真实 scope（届时包名本身已公开，B2 口径需同步放宽到「包名允许」） |

补充观察（非缺陷）：`scripts/build-tokens.mjs` 25,526 B 占 unpacked 体积的 37%，是包里最大单文件；若 F2 选 (b)，包可从 66.9 KB 降到 41.3 KB。

## 9. 边界与未做的事

- **未 publish**：`npm whoami` → `npm error need auth (ENEEDAUTH)`；全程未执行 `npm publish`/`npm adduser`，未打印任何凭据。
- **未改版本**：`version` 仍 `2.1.0`，`private` 仍 `true`，`package.json` 未改动（tarball 内 `package.json` sha256 与仓内一致）。
- **未改站点**：`src/styles/global.css` 仍以相对路径 `@import url(../../packages/tokens/variables.css)` 消费；切到 `@marxchou/dogeared-tokens/variables.css` 属于 M4-4/M4-5，本卡只证明该 specifier 在安装树里可解析。
- **未 commit/push**：`git status --short` 在收尾后只应有本报告一个新增文件，无其它改动。
- 复现脚本（临时目录，不入仓）：`/tmp/m42-install.mjs`（干净安装 + 计时）、`/tmp/dogeared-consumer/verify.mjs`（7 项断言）、`/tmp/dogeared-consumer/probe2.mjs`（bin/json/esbuild 探测）。
