# M4-6 · 包产物修复：og-image/ui 构建产物 + engines 放宽

- 卡：`t_20a7ac2a` · M4-6（计划见 `blog2.0/docs/23-m4-plan.md`，上游 M4-4 = `t_6f55211b`）
- 日期：2026-11-06 03:25 CST · 基线 commit `10cf92b`
- 环境：macOS 15.7.7 · node `v26.0.0` · npm `11.12.1` · pnpm `12.10.1`（`corepack pnpm`）
- 结论：**三包现在都能交付给真实消费者，`preflight --mode=publish` 只剩两类预期失败**（P1 × 3 = 仍 private、P5 = publish-plan 为空）。
  - `og-image` 走 F1 方案 ①：真实 `dist/*.js` + `*.d.ts`，**裸 Node `import` 从「必失败」变成「可用」**（M4-3 F1 消除）。
  - `ui` 走「dist 产物 + 文档化限制」：`.astro` 组件无法编译成普通 JS（Astro 编译器产物不是独立运行模块），所以 `dist/` 里的桶文件是纯 ESM、但重导出目标仍是 `.astro`；README「Requirements」写明 **Astro/Vite only、裸 Node 不支持**，包内测试把这条限制钉成断言。
  - 出图三条路径结论不变，PNG 与 M4-3 **逐字节相同**（`sha256 8e6c490e…`，49,283 B）。

## 0. 交付一览

| 项 | 结论 | 证据 |
| -- | ---- | ---- |
| F1（P1）og-image 只发 TS | ① 加 build 产出 dist，`exports`/`main`/`types` 指 dist，`module` 删除 | §2 |
| F1（P1）ui 只发 TS | ① dist 桶文件 + ② README「Astro/Vite only」双写，包内测试钉住限制 | §3 |
| F2（P1）engines `^22\|\|^24` | 三包 → `>=22`；干净消费者 `npm i` 不再刷 EBADENGINE | §4 |
| F3（P2）`main`/`module`/`types` 指 `.ts` | 全部改 dist，`module` 字段删除 | §4 |
| F4（P3）README 占位 / 旧包名 | 三包 README 明说 `@<npm-scope>` 是占位；`zcblog-og-image` → `dogeared-og-image` | §5 |
| F5（P3）peer astro optional | `peerDependenciesMeta.astro.optional=true`；无 astro 也能装、能出图 | §4 |
| F6（P3）消费者断言固化 | `packages/{tokens,ui,og-image}/test/smoke.test.mjs`：8/9/10 条，`pnpm --filter ./packages/<pkg> test` 可跑 | §6 |
| tokens（M4-2 F1）`exports` 无 `.` | 补 `"." → "./tokens.css"`（不造假 JS 入口） | §4 |
| `private` | **未翻转**（发布卡的事） | §12 |

## 1. 构建怎么落地（设计约束先摆出来）

包边界门禁 `verify-package-boundary` 的 B3 白名单**不允许包声明 devDependencies**（tokens/ui/og-image 三包的 `devDependencies` 允许集合都是空），所以：

- **不往包里加编译器**。`scripts/build.mjs` 用 `createRequire(package.json).resolve("typescript/bin/tsc")` 从 workspace 根解析 `typescript`（根 `devDependencies` 里已有 `^5.9.3`，pnpm 的 `node_modules/.bin` 与根 `node_modules` 都对包目录可见），找不到就报「请在仓库根 `pnpm install`」。
- **构建脚本自己是包内文件**（`scripts/build.mjs`，stdlib + tsc），并**自证产物**：跑完逐个校验必需文件存在、非空、`exports`/`main`/`types` 里每个 `./` 目标在磁盘上真实存在（对不上就在这里红，而不是发出去才知道）。
- `prepack` 也接了 build：手工 `npm pack` / `changeset pack` 时自动重建 dist（`--ignore-scripts` 的 dry-run 会绕过它，见 §11 F2）。

## 2. F1-①：og-image 加 build，裸 Node 现在能 `import`

改动：

| 文件 | 改动 |
| ---- | ---- |
| `packages/og-image/src/index.ts` · `src/route.ts` | 相对导入补 `.js`（ESM 规范；NodeNext 下 tsc 才认，否则 dist 产物在裸 Node 里 `ERR_MODULE_NOT_FOUND`） |
| `packages/og-image/tsconfig.build.json` | 新增：`module/moduleResolution=NodeNext`、`target ES2022`、`rootDir src`、`outDir dist`、`declaration`、`noEmitOnError`、`strict` |
| `packages/og-image/scripts/build.mjs` | 新增：清 dist → tsc → 自证 5 个必需产物 + 打印 `BUILD_OK` |
| `packages/og-image/package.json` | `main/types → ./dist/*`，`module` 删除，`exports["."]` 三条件全指 dist，`files` 加 `dist`，`engines → >=22`，`peerDependenciesMeta`，`scripts.build/prepack/pretest/test` |

产物（`node scripts/build.mjs`）：

```console
BUILD_OK 5/5 必需产物 · 6 个条目 · 19142 B → dist/
```

`dist/` 内容：`index.js`(388) `index.d.ts`(492) `route.js`(13804) `route.d.ts`(1053) `types.js`(678) `types.d.ts`(2727)。`route.js` 里 `import type { APIRoute } from "astro"` 已被擦除，运行期只剩 `satori`/`sharp`/`node:fs`/`node:path`。

**裸 Node 证据**（干净消费者，不是仓内）：

```console
# 消费者 A：npm i tarball + astro（31s，217 包，零 EBADENGINE）
$ node scripts/bare-import.mjs
BARE_IMPORT=OK
EXPORT_KEYS=createOgImageRoute

# 消费者 B：只装 og-image tarball，**不装 astro**
$ npm i .../marxchou-dogeared-og-image-2.1.0.tgz    # 29 个顶层依赖 / 42 MB
$ npm ls astro --all
dogeared-m46-consumer-noastro@1.0.0
└── (empty)
$ node bare-render.mjs <repo>/.astro/fonts
BARE_IMPORT=OK keys=createOgImageRoute
ASTRO_PRESENT=false
RENDER status=200 bytes=49283 sha256=8e6c490ec799784d2270f7699491c107a683916854e91251d09461aea4f47b17
```

对比 M4-3 §5（同一探针）：`BARE_IMPORT=FAIL / CODE=ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`。**这条阻断已消除**。

**站点侧不受影响**（站点不按包名导入，走相对路径 `../../packages/og-image/src/index`）：

- `tsc --noEmit -p tsconfig.json` → **exit 0**；
- Vite 解析探针（用仓库那份 vite，`configFile:false`）：

```console
ENTRY /Users/…/packages/og-image/src/index.ts
RESOLVE ./route.js -> packages/og-image/src/route.ts
RESOLVE ./types.js -> packages/og-image/src/types.ts
```

## 3. F1：ui 为什么是「dist + documented bundler-only」

`.astro` 不是 TS：Astro 编译器把它编成依赖 Astro 运行时的渲染函数，**没有「编译成普通 JS 就能裸 Node import」这条路**。所以 ui 同时做两件事，任何一半都不单独交付：

1. **有真实 dist 产物**：`scripts/build.mjs` 把 `src/*.astro` 原样复制进 `dist/`，再用 tsc 把 `src/index.ts` 桶文件编成 `dist/index.js` + `dist/index.d.ts`（`build/astro-modules.d.ts` 提供 `*.astro` 的环境声明，只用于编译，不进包）。`exports` 的四个目标全指 dist：

```console
$ node scripts/build.mjs
BUILD_OK 2 个 .astro + 桶文件 · 8/8 入口存在 · 3991 B → dist/
```

2. **限制写进 README + 钉进测试**：`README.md → Requirements` 第一句就是 **Astro / Vite only**，并解释「entry 是纯 ESM，但重导出目标是 `.astro`，所以裸 Node `import` 会失败——这是设计，不是坏包」。`test/smoke.test.mjs` 里两条断言：

```console
✔ 限制: 裸 Node import 桶文件因 .astro 失败（README 已写明，不是坏包）
✔ 限制: README「Requirements」明确写了只在 Astro/Vite 里可用
```

失败码实测是 `ERR_UNKNOWN_FILE_EXTENSION`（node 不认识 `.astro`），测试接受 `ERR_UNKNOWN_FILE_EXTENSION|ERR_MODULE_NOT_FOUND` 两种，其它错误码算失败。

**真实消费证明**（消费者 A 的 Astro 项目，按 README 用法）：

```console
$ npx astro build
03:22:26   ├─ /og/hello-dogeared.png (+214ms)
03:22:26   ├─ /og/latin-only.png (+25ms)
03:22:27   ├─ /ui-demo/index.html (+6ms)
$ grep -o '<span class="badge…' dist/ui-demo/index.html
<span class="badge badge--tip badge--sm" data-astro-cid-hrvpjz5v>New<
<a href="/archives/" class="btn btn-secondary" data-astro-cid-2brrl52s>Archive<
<span class="badge badge--danger badge--md" data-astro-cid-hrvpjz5v>subpath<   # 子路径入口 dist/Badge.astro
```

即：**桶文件（`dist/index.js`）与子路径（`dist/Badge.astro`）两条入口在真实 Astro 里都工作**。

## 4. manifest 层：engines / main-module-types / peer / tokens 入口

| 包 | engines | main / types / module | peer | `exports["."]` |
| -- | ------- | --------------------- | ---- | -------------- |
| tokens | `^22.0.0 \|\| ^24.0.0` → **`>=22`** | 无（保持无 JS 入口） | — | 新增 `".": "./tokens.css"` |
| ui | 同上 → **`>=22`** | `./dist/index.js` / `./dist/index.d.ts` / **`module` 删除** | `peerDependenciesMeta.astro.optional = true` | `./dist/index.js` |
| og-image | 同上 → **`>=22`** | 同上 | 同上 | `./dist/index.js` |

逐条实测：

- **engines**：消费者 A 安装输出只剩 `added 217 packages … in 31s`，**没有 EBADENGINE**（M4-3 §4 里同一步是 `npm warn EBADENGINE required: { node: '^22.0.0 || ^24.0.0' }`）。
- **astro optional**：消费者 B 只装 og-image，`npm ls astro --all` 为空、`node_modules/astro` 不存在（`ASTRO_PRESENT=false`），仍能出图 → **optional 真的生效，npm 不再自动拉 astro**。代价：想要 `APIRoute` 类型的消费者要自己装 astro（README 已写明）。
- **tokens 的 `"."`**：`import.meta.resolve("@marxchou/dogeared-tokens")` → `…/dogeared-tokens/tokens.css`；`require.resolve("…/tokens.json|tokens.css|variables.css")` 全部可解析。**没有造假 JS 入口**——所以裸 Node `import` 该包仍然失败，但失败码从 M4-2 的 `ERR_PACKAGE_PATH_NOT_EXPORTED`（结构错）变成 `ERR_UNKNOWN_FILE_EXTENSION`（CSS 本质，Node 不能 import 样式），README 已写明「bundler 才消费 `.`，Node 请用子路径读文件」。

## 5. F4：README 占位与旧包名

- 三包 `README.md → Install` 段统一加了一句：**`@<npm-scope>` 是故意留的占位**——包边界门禁 B2 不允许把组织身份串写进包文件，发布后回填真实 scope。占位本身保留（不是遗漏）。
- `packages/og-image/src/index.ts`、`src/types.ts` 注释里的旧包名 `zcblog-og-image` → `dogeared-og-image`（2 处，注释文字，无行为变更）。
- `packages/ui/src/index.ts` 头注释里的「zcblog UI 包入口（包身份串只出现在 package.json 的 name 里，B2 口径）」**保留**：那是 B2 口径的说明文字，不是旧包名残留。

## 6. F6：包内 smoke 测试

```console
$ cd <repo> && corepack pnpm --filter ./packages/tokens   test   # 8/8 PASS
$ cd <repo> && corepack pnpm --filter ./packages/ui       test   # 9/9 PASS
$ cd <repo> && corepack pnpm --filter ./packages/og-image test   # 10/10 PASS
```

（`--filter` 用目录路径而不是包名：包内文件出现 `@marxchou/...` 会被 B2 判为身份串泄漏，这条坑已在本卡踩到并修掉。）

| 包 | 断言重点 | 备注 |
| -- | -------- | ---- |
| tokens（8） | `.` → `tokens.css`；每个 exports 目标存在；`tokens.css` 与 `tokens.json` 编译结果**逐字节一致**（调 `build-tokens.mjs --check`）；结构三块（palette/primitive/semantic）；零依赖 + `sideEffects` + engines | 无运行期代码，测的是「文件对不对、生成物有没有漂移」 |
| ui（9） | 入口全指 dist、无 `.ts` 源码入口、`module` 已删；自引用解析 dist；`.astro` 在 dist 与 src 一致；桶文件是纯 ESM 且重导出两个组件；组件有 `Props` + scoped style + 无 `~/`；**裸 Node import 必失败**；README 含限制句；零运行期依赖 | 第三条「限制」断言是这包的护栏 |
| og-image（10） | 自引用解析 dist；只暴露 `createOgImageRoute`；`main/types` 指向并存在；缺必填 → 抛错列键；未知 slug → 404 text/plain；**1200×630 PNG + 与 M4-3 逐字节相同**；数组 params；依赖归属；engines | 出图断言直接对比 M4-3 的固定输入与 golden sha256 |

**M4-3 的 13 条消费者断言映射**（F6 要求「固化」）：

| M4-3（消费者 direct-call） | 包内对应 |
| --- | --- |
| `export:createOgImageRoute`、`export:只暴露运行期函数` | `exports: 只暴露运行期函数 createOgImageRoute` + 自引用解析 |
| `factory:返回 callable` | `factory: 返回 callable 的 APIRoute` |
| `route:status200` / `content-type` / `cache-control` | 同一条出图测试的三个断言 |
| `route:png 签名` / `1200x630` / `非空` | 同一条出图测试（签名 + IHDR 宽高 + 字节数 == 49,283） |
| `route:unknown-slug-404` / `-plaintext` | `route: 未知 slug 返回 404 纯文本` |
| `factory:缺必有错` | `factory: 缺必填项抛错并列出缺失键` |
| `route:数组 params 解析` | `route: rest 参数为数组时同样解析` |
| （新增） | `main/types` 指向 dist、`module` 已删、依赖归属、engines |

**字体依赖**：出图断言要真实字体，按 `DOGEARED_OG_FONT_DIR` → 仓库 `.astro/fonts` 顺序找，找不到就 SKIP（并打出原因），不让清洁检出（CI）变红。两条渲染断言之外还有 8 条不依赖字体。跳过分支实测（把包复制到没有 `.astro/fonts` 的目录再跑）：

```console
ℹ tests 10 · pass 8 · fail 0 · skipped 2
```

M4-3 的 `default-fonts.mjs`（CDN 分支）**没有固化**：它依赖公网下载 17 MB 字体，不适合放进包内测试（见 §11 F6）。

## 7. tarball 前后对比

| 包 | 文件数 | packed | Δ | 解包 | sha256（新） |
| -- | -----: | -----: | -: | ---: | ------------ |
| tokens | 8 → **8** | 20,043 → **20,379 B** | +336 B（+1.68%） | 69,320 B | `6ea9410daa20…` |
| ui | 7 → **11** | 4,707 → **5,342 B** | +635 B（+13.49%） | 15,243 B | `a866afcf74e2…` |
| og-image | 7 → **13** | 9,116 → **10,852 B** | +1,736 B（+19.04%） | 46,506 B | `e190111c0c29…` |

（"前" 取自 M4-2/M4-3 的 `npm pack` 记录：tokens 8 文件 / 20,043 B、ui 7 / 4,707、og-image 7 / 9,116。）

新增文件清单：

```console
# tokens（体积只因为 package.json 变大：exports "." + scripts + engines）
LICENSE NOTICE README.md package.json scripts/build-tokens.mjs tokens.css tokens.json variables.css

# ui（+4）
dist/Badge.astro dist/Button.astro dist/index.js dist/index.d.ts

# og-image（+6）
dist/index.js dist/index.d.ts dist/route.js dist/route.d.ts dist/types.js dist/types.d.ts
```

`src/**` 仍然随包发布（`files` 白名单里保留）：消费者能读到源码，代价已计入上面的 Δ。`test/`、`scripts/`、`tsconfig.build.json`、`build/` **不在**白名单 → 不进 tarball（preflight P3b 的「测试目录」检查也是 0 命中）。

## 8. release 链复跑（验收项 1–3）

```console
$ node scripts/release/build-packages.mjs
[PASS] B1:@marxchou/dogeared-tokens   build 成功（node scripts/build-tokens.mjs）
[PASS] B1:@marxchou/dogeared-ui       build 成功（node scripts/build.mjs）
[PASS] B1:@marxchou/dogeared-og-image build 成功（node scripts/build.mjs）
[PASS] B2:@marxchou/dogeared-tokens   5 个声明入口全部存在（./tokens.css, ./tokens.json, ./variables.css …）
[PASS] B2:@marxchou/dogeared-ui       5 个声明入口全部存在（./dist/index.d.ts, ./dist/index.js, ./dist/Badge.astro …）
[PASS] B2:@marxchou/dogeared-og-image 3 个声明入口全部存在（./dist/index.d.ts, ./dist/index.js, ./package.json）
RELEASE_SUMMARY {"ok":true,"counts":{"PASS":6,"FAIL":0,...},"built":[三个包]}
```

```console
$ node scripts/release/preflight.mjs --mode=publish
[PASS] P4b:@marxchou/dogeared-tokens   入口 ./tokens.css 可被裸 Node 解析（有 build 脚本）
[PASS] P4b:@marxchou/dogeared-ui       入口 ./dist/index.js 可被裸 Node 解析（有 build 脚本）
[PASS] P4b:@marxchou/dogeared-og-image 入口 ./dist/index.js 可被裸 Node 解析（有 build 脚本）
[FAIL] P1  @marxchou/dogeared-tokens   仍是 private:true，禁止发布
[FAIL] P1  @marxchou/dogeared-ui       仍是 private:true，禁止发布
[FAIL] P1  @marxchou/dogeared-og-image 仍是 private:true，禁止发布
[FAIL] P5  changeset publish-plan 为空：这次发布不会有任何包进 registry
           plan={"version":1,"plan":[]}
RELEASE_SUMMARY {"mode":"publish","ok":false,"counts":{"PASS":27,"FAIL":4,"WARN":3,"INFO":1,"SKIP":1}}
```

**P4a / P4b 已全部消失**，只剩 P1（private，发布卡翻转）与 P5（空 publish-plan，同因 private）两类预期失败。check 模式 `ok:true`（`PASS 27 / FAIL 0 / WARN 4 / INFO 4`）。

```console
$ node scripts/release/publish-dry-run.mjs        # 9/9 PASS
[PASS] D0/D1/D2 × 3 包；tarball 20,379 / 5,342 / 10,852 B
       sha256 6ea9410d… / a866afcf… / e190111c…
RELEASE_SUMMARY {"ok":true,"counts":{"PASS":9,"FAIL":0,...}}
```

两次变体都是 `npm notice Publishing to https://registry.npmjs.org/ … (dry-run)`，**没有 registry 写入**（evidence 落盘 `dry-run-evidence.json`）。

## 9. 三条出图路径复核（验收项 4）

消费者 A（干净目录 + tarball + astro 7.4.6）重跑，输入与 M4-3 完全一致：

| 路径 | 结果 | 字节 | sha256 |
| ---- | ---- | ---: | ------ |
| Astro 预渲染（`astro build` → `dist/og/*.png`） | 1200×630 | 49,283 / 52,304 | `8e6c490e…` / `81f2993e…` |
| esbuild 打包后直调（`SUMMARY 13/13 PASS`） | 1200×630，`cmp` 与 Astro 那份一致 | 49,283 | `8e6c490e…` |
| 裸 Node（无 astro 消费者 B） | 200 | 49,283 | `8e6c490e…` |
| ui：Astro 渲染（桶文件 + 子路径） | 正常 HTML（见 §3） | — | — |

与 M4-3 报告的三个 sha256（`8e6c490e…` / `81f2993e…`）**完全一致**——结论不变：`options` 注入契约、satori 版式、sharp 出图在「源码直用」和「dist 产物」之间没有漂移。唯一变化是裸 Node 那条：M4-3 是「必失败」，现在是「可用」（og-image）；ui 仍是 documented-bundler-only（与 PNG 无关）。

## 10. 门禁（验收项 5）

| 门禁 | 命令 | 结果 |
| --- | ---- | ---- |
| token 门禁 | `node scripts/gates/check-tokens.mjs` | **10/10 PASS · 0 FAIL**（G-T1 生成物一致仍绿：tokens 的 `build` 是可复现的） |
| 包边界 | `node scripts/gates/verify-package-boundary.mjs` | **RESULT PASS packages=3 violations=0**（W0–B4 全 0；B2 首轮曾因测试注释里的 `@marxchou/...` FAIL 3 项，改为目录过滤后归零） |
| 全量 | `corepack pnpm gates:all` | 9 个门禁串行全绿（atoms 18/18、docs 10/10、boundary、overlay …） |
| 类型 | `node_modules/.bin/tsc --noEmit -p tsconfig.json` | **exit 0** |
| 格式 | `prettier --check "packages/**/*.{ts,mjs,json,md,astro}"` | clean |

> 并发说明：本轮 `gates:all` 跑通时 `verify-overlay` 也是绿的，但那是 M4-7（`t_36fea29e`）在同一工作树里改 `site.manifest.json` / `docs/overlay-contract.md` 的并行成果，**不归本卡**。本卡只保证「与包相关」的门禁不退化（check-tokens、boundary、tsc、prettier）。

## 11. 新发现（只记录，不在本卡修）

| ID | 级别 | 问题 | 建议 |
| -- | ---- | ---- | ---- |
| **F1** | P2 | `preflight` 的 P4c 用「按 `\|\|` 切分 + 去版本前缀取 major」的老办法判断 engines，`>=22` 被读成「只要 22」，于是三包各刷一条 `P4c …不含当前 Node 26` 的**假阳性 WARN** | 修 `scripts/release/lib.mjs`：用 semver 区间判断（或 `node:semver`/手写 `>=` 解析）。在修好之前，publish 模式仍会带 3 条误导性 WARN |
| **F2** | P1 | `release.yml` 的 **dry-run job 没有 build 步骤**，而 `publish-dry-run.mjs` 用 `npm pack --ignore-scripts`（跳过 `prepack`）→ **CI 的 dry-run 证据会是缺 `dist/` 的 tarball**，与 `preflight` job（先 build 再 pack）真实发布的产物不一致 | dry-run job 里加 `node scripts/release/build-packages.mjs`（或给 `publish-dry-run.mjs` 加 `--with-build`）。本卡已加 `prepack`，但 `--ignore-scripts` 会绕过它，所以不能替代 |
| **F3** | P3 | ui 的裸 Node 限制只能「文档化 + 测试钉住」，无法技术消除（`.astro` 无法编译成独立 JS 模块） | 若将来真需要「裸 Node 可用」的 ui，得改成 `.ts`/框架无关渲染函数，属于 API 重设计，不在包产物卡范围 |
| **F4** | P3 | tokens 的 `"."` 是 CSS，裸 Node `import` 报 `ERR_UNKNOWN_FILE_EXTENSION`（不是包坏，是 Node 不 import 样式） | README 已写明；preflight P4b 的措辞「可被裸 Node 解析」对 CSS 包不准确，可考虑按扩展名分档 |
| **F5** | P3 | `src/` 与 `dist/` 双发（ui/og-image）：ui 多 3.2 KB、og-image 多 18 KB 解包体积 | 保留（读者能看源码）；若后续想瘦身，`files` 去掉 `src` 即可，不影响入口 |
| **F6** | P2 | 包内 og-image 出图断言在**没有字体缓存的环境（CI 清洁检出）会 SKIP**，只剩 8 条结构断言 | 把两份 Noto 字体（约 8 MB/份，太大）或更小的子集字体作为 test fixture 入库；或让 CI 步骤先缓存字体目录 |
| **F7** | P3 | 构建依赖 workspace 根的 `typescript`（因为 B3 白名单禁止包内 devDependencies） | 若 packages 将来拆成独立仓库，需给包加 `devDependencies.typescript` 并放宽 B3 —— 现在这样是**对的**（单一编译器版本），只是耦合点要记住 |

## 12. 边界与偏差

- **只改** `packages/**`（`package.json`、`src/*.ts` 两处 import/注释、README、新增 `scripts/`、`test/`、`tsconfig.build.json`、`ui/build/astro-modules.d.ts`）与 `docs/_reviews/M4-6/**`（本报告）。
- **未做**：publish（真发布）、翻转 `private`、改版本号、动 `.changeset/**`、动 `.github/workflows/release.yml`、动 `scripts/release/**`、改站点代码。
- 工作树里同时存在 **M4-7**（`site.manifest.json`、`docs/overlay-contract.md`）与 **M4-4**（`.changeset/`、`scripts/release/`、`release.yml`、根 `package.json`/`pnpm-lock.yaml`）的未提交改动 —— 都不是本卡产物，本卡未触碰。
- 偏差：无（两条踩坑已在正文记录：B2 身份串不能用包名写测试命令注释；prettier 会在测试/脚本上重排，写完后需 `prettier --write` 再复跑）。

## 13. 复跑命令

```bash
cd <repo>

# 1) 构建三包（dist + tokens.css）
node scripts/release/build-packages.mjs

# 2) 包内 smoke 测试（tokens 8 / ui 9 / og-image 10）
corepack pnpm --filter ./packages/tokens test
corepack pnpm --filter ./packages/ui test
corepack pnpm --filter ./packages/og-image test      # 无字体缓存时 8 PASS + 2 SKIP

# 3) 发布前检查（publish 模式：只应剩 P1×3 + P5）
node scripts/release/preflight.mjs --mode=publish

# 4) 发布命令 dry-run（9/9，不写 registry）
node scripts/release/publish-dry-run.mjs --out /tmp/dogeared-m46-dryrun

# 5) 门禁
node scripts/gates/check-tokens.mjs
node scripts/gates/verify-package-boundary.mjs
corepack pnpm gates:all

# 6) 消费者复验（tarball 在 dry-run 产物目录里）
mkdir -p /tmp/m46-consumer && cd /tmp/m46-consumer
printf '{"name":"m46-consumer","version":"1.0.0","private":true,"type":"module"}\n' > package.json
npm i /tmp/dogeared-m46-dryrun/packages-og-image/*.tgz astro@^7.3.6
node -e 'import("@marxchou/dogeared-og-image").then(m => console.log("OK", Object.keys(m)))'
```
