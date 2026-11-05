# M4-3 · og-image tarball 消费验证

- 卡：`t_2c8270d3` · M4-3（计划见 `blog2.0/docs/23-m4-plan.md`）
- 日期：2026-11-06 02:45 CST · 基线 commit `52c12a3`（起点与收尾 `git status` 均 clean）
- 环境：macOS 15.7.7 · node `v26.0.0` · npm `11.12.1` · 消费者内装到 `astro 7.4.6` / `satori 0.26.0` / `sharp 0.35.5`
- 结论：**`@marxchou/dogeared-og-image@2.1.0` 的 tarball 可被空目录里的干净消费者安装并生成 1200×630 PNG**。三条互不相同的路径（Astro 预渲染 / esbuild 打包直调 / 无 astro 直调）产出的 PNG **逐字节相同**（sha256 `8e6c490e…`）。默认字体 CDN 分支也实测出图。但包只发 TS 源码：**裸 Node 直接 import 必失败**（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`），只有 bundler 能消费——这是本卡最需要注意的限制。本卡未 publish、未改版本、未改站点。

## 1. `npm pack`

计划里的 `npm pack --workspace @marxchou/dogeared-og-image` 在 npm 11 下不可用——根 `package.json` 没有 `workspaces` 字段（工作区只由 `pnpm-workspace.yaml` 声明），与 M4-2 同一原因：

```console
$ npm pack --workspace @marxchou/dogeared-og-image --pack-destination /tmp/dogeared-pack
npm error No workspaces found:
npm error   --workspace=@marxchou/dogeared-og-image
```

等价做法：在包目录内 `npm pack`（`files` 白名单语义完全相同）：

```console
$ cd packages/og-image && npm pack --pack-destination /tmp/dogeared-pack-og-m43 --json
[
  {
    "id": "@marxchou/dogeared-og-image@2.1.0",
    "name": "@marxchou/dogeared-og-image",
    "version": "2.1.0",
    "size": 9116,
    "unpackedSize": 25675,
    "shasum": "5e0e630ffa5f41987f1b4b9cd2cb89bc252a3275",
    "integrity": "sha512-NIDNH6tEtynHelFpfBEFLGsp+W20BXoNQbGG2uKK3PvBamx53m3F7sz1i1bz4TfL+T17lZL4WQBRLzO5cH0vVg==",
    "filename": "marxchou-dogeared-og-image-2.1.0.tgz",
    "entryCount": 7,
    "bundled": []
  }
]
```

| 项 | 值 |
| --- | --- |
| tarball | `/tmp/dogeared-pack-og-m43/marxchou-dogeared-og-image-2.1.0.tgz` |
| packed / unpacked | 9,116 B（8.9 KB）/ 25,675 B（25.1 KB） |
| 文件数 | 7 |
| sha1（npm `shasum`） | `5e0e630ffa5f41987f1b4b9cd2cb89bc252a3275` |
| sha256（tgz 本体） | `e041788e266398c956c882200960225c8eb3dd15dfae93e61ea6efe1515d82c5` |
| integrity | `sha512-NIDNH6tE…0vVg==` |

重跑一次 pack（另一个目录）得到**同一个** sha1 / sha256 → 打包可复现，无时间戳/顺序漂移。

## 2. 清单 + 逐文件 sha256（tarball vs 仓内）

```console
$ tar -tzvf marxchou-dogeared-og-image-2.1.0.tgz
-rw-r--r--  0 0  0   1065 package/LICENSE
-rw-r--r--  0 0  0   1788 package/NOTICE
-rw-r--r--  0 0  0   1312 package/package.json
-rw-r--r--  0 0  0   2962 package/README.md
-rw-r--r--  0 0  0    284 package/src/index.ts
-rw-r--r--  0 0  0  15534 package/src/route.ts
-rw-r--r--  0 0  0   2730 package/src/types.ts
```

| 文件 | 字节 | sha256（仓内 = 解包后，7/7 OK） |
| --- | --- | --- |
| `src/route.ts` | 15,534 | `8e17aec9d99c735df2c790c9c90abe895ae296d6e9115d8387acf22fabf35c2f` |
| `src/types.ts` | 2,730 | `03fc06aa15ac0b283dd7826d4454d79bd71bc821cf7683a058b4ef06dc9b5770` |
| `src/index.ts` | 284 | `a571251aee65fe50e43bc56d9dd1bacba3902756cf2b6c251fcae6e4a0d0dbc7` |
| `README.md` | 2,962 | `54fae35f81ba852304ebc0c4170ac2116cdd8bbd1b5277707f3d5409673c5df4` |
| `package.json` | 1,312 | `cdf2db09cb520fd82c4e72f3f055770acd6276fbe88da527d8a3ef140e871a70` |
| `NOTICE` | 1,788 | `9ad03bd5f8aa9190e393290afa3e9cee6a5518f11c6795907f3b1aff7bfb08b9` |
| `LICENSE` | 1,065 | `97684ebfb758c6e5afdba14d85651c2ccdb225eb85c7c209487dc2ab5292e335` |

7 个条目 = `files` 白名单里 `src`(3) + `README.md`/`LICENSE`/`NOTICE` + npm 强制携带的 `package.json`，一个不多一个不少。

## 3. tarball 清单干净度扫描

```console
$ grep -rnE '/Users/|/private/tmp|/home/|\bchowcong\b' .        # none
$ find . -name node_modules -o -name '*.map'                    # none
$ find . -type f \( -name '*.test.*' -o -name '*.spec.*' \)     # none
$ grep -rniE '\.env\b|api[_-]?key|token|password|secret' .      # 3 命中，全是中文里的「token」一词或字面文档
$ du -sh . && find . -type f | wc -l                            # 40K / 7
```

- 无 `node_modules`、无测试文件、无 `*.map`、无 `.env`、无本机绝对路径。
- 站点私有串（`marxchou.com` / `zcblog` / `mifsh`）命中仅限：`package.json` 的 `name`/`homepage`/`repository`/`bugs`（包自身身份，B2 已豁免口径）；`NOTICE` 的 Shirone 出处与版权（法务必需）；`src/index.ts`、`src/types.ts` 的文档注释里**旧包名 `zcblog-og-image`**（见 F4，溯源文字，非路径/非配置）。
- 站点私有数据（B4 的 51 个 sha256 样本）零命中——见 §8 门禁。

## 4. 干净消费者 A：Astro 预渲染（主路径）

`/tmp/dogeared-og-consumer`（空目录，只有 `package.json`：`private`/`type:module`）：

```console
$ npm i /tmp/dogeared-pack-og-m43/marxchou-dogeared-og-image-2.1.0.tgz
npm warn EBADENGINE Unsupported engine {
npm warn EBADENGINE   package: '@marxchou/dogeared-og-image@2.1.0',
npm warn EBADENGINE   required: { node: '^22.0.0 || ^24.0.0' },
npm warn EBADENGINE   current: { node: 'v26.0.0', npm: '11.12.1' }
npm warn EBADENGINE }
added 215 packages, and audited 216 packages in 38s
```

| 包 | 版本 | 来源 |
| --- | --- | --- |
| `@marxchou/dogeared-og-image` | 2.1.0 | tarball |
| `astro` | 7.4.6 | peer，npm 自动装（无需手写） |
| `satori` | 0.26.0 | tarball 的 `dependencies` |
| `sharp` | 0.35.5 | tarball 的 `dependencies`，与 astro 自带的那份 **deduped** |

```console
$ npm ls sharp satori astro
dogeared-og-consumer@1.0.0
└─┬ @marxchou/dogeared-og-image@2.1.0
  ├─┬ astro@7.4.6
  │ └── sharp@0.35.5 deduped
  ├── satori@0.26.0
  └── sharp@0.35.5
```

`npm ls --all` 统计：`UNMET PEER DEPENDENCY` **0** 行、`ERESOLVE`/`invalid` **0** 行；152 行 `UNMET OPTIONAL DEPENDENCY` 全是 astro/rolldown/sharp 的平台专用可选二进制（正常，macOS 上不需要 linux/win32 那份）。

消费者侧只写了一个路由壳（README 用法原样，`src/pages/og/[...og].png.ts`：组装 `posts`/`site`/`theme`/`fonts` + `getStaticPaths`），**没有**在 `astro.config.mjs` 里加 `vite.ssr.noExternal`：

```console
$ npx astro build
02:39:34 [build] output: "static"
02:39:34 [build] ✓ Completed in 129ms.          # 收集构建信息
02:39:34 [build] Building static entrypoints...
02:39:34 [vite] ✓ built in 124ms
02:39:34   ├─ /og/hello-dogeared.png (+211ms)
02:39:34   ├─ /og/latin-only.png (+26ms)
02:39:34 ✓ Completed in 360ms.
02:39:34 [build] Complete!
```

### 生成图证据

| 场景 | 文件 | 字节 | 尺寸 | sha256 |
| --- | --- | --- | --- | --- |
| Astro 预渲染（中文长标题被截断 + 摘要） | `dist/og/hello-dogeared.png` | 49,283 | 1200×630 | `8e6c490ec799784d2270f7699491c107a683916854e91251d09461aea4f47b17` |
| Astro 预渲染（纯拉丁超长标题，走 42 字符分支） | `dist/og/latin-only.png` | 52,304 | 1200×630 | `81f2993e381a17674861e87e48c3e7d7036749e3d0eca867c8b540337a8c0b8d` |
| esbuild 打包后直调（不支持 rest 数组的那条断言另计） | `fixtures/out/direct-hello-dogeared.png` | 49,283 | 1200×630 | `8e6c490e…`（与第 1 行**逐字节相同**） |
| 无 astro 消费者直调 | `fixtures/out/direct-hello-dogeared.png` | 49,283 | 1200×630 | `8e6c490e…`（同） |
| 默认字体（CDN）分支 | `fixtures/out/cdn-default-font.png` | 39,337 | 1200×630 | `92560617d5ad685d4595f0e38951a8dbd0c59a12a10d7ccefc637b7e7a05b7b4` |

三重独立校验一致：自写 IHDR 解析（`width=1200 height=630`、PNG 签名、首 chunk `IHDR`）· `file` 报 `PNG image data, 1200 x 630, 8-bit/color RGBA, non-interlaced` · `sips -g pixelWidth -g pixelHeight` 报 1200/630。视觉核验（vision）确认中文正常渲染、无豆腐块，左侧强调竖条／分隔线／页脚 url+站点名／深色背景全部到位。

## 5. 裸 Node 直接 import **必失败**（重要限制）

```console
$ node scripts/bare-import.mjs      # import("@marxchou/dogeared-og-image")
BARE_IMPORT=FAIL
CODE=ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING
MESSAGE=Stripping types is currently unsupported for files under node_modules, for
        "…/node_modules/@marxchou/dogeared-og-image/src/index.ts"
```

原因：`exports["."]` 指向 `./src/index.ts`，包内没有构建产物。node 26 原生剥类型**明确不支持 `node_modules` 下的文件**，所以「装完就能 `node -e import(...)`」不成立；能消费的是 bundler（Astro 7/Vite 走 rolldown 打包，实测默认配置即可）。这条必须在 README 写明，否则使用者会以为装坏了。见 F1。

## 6. 直接调用路径（bundler，不经过 Astro）

消费者自己装 `esbuild@0.28.2` 作 devDep，把 `scripts/direct-call.mjs` 打成 14,364 B 的 ESM（`satori`/`sharp` external），再跑：

```console
$ node dist-call/direct.mjs
PASS  export:createOgImageRoute  typeof=function
PASS  export:只暴露运行期函数    keys=createOgImageRoute
PASS  factory:返回 callable      typeof=function
PASS  route:status200            status=200
PASS  route:content-type         ct=image/png
PASS  route:cache-control        cc=public, max-age=31536000, immutable
PASS  route:png 签名
PASS  route:1200x630             1200x630
PASS  route:非空                 bytes=49283
PASS  route:unknown-slug-404     status=404
PASS  route:unknown-slug-plaintext  og-image: 未知文章 slug「nope」
PASS  factory:缺必有错           [og-image] createOgImageRoute 缺少必填选项：site.url, theme.background, theme.foreground, theme.accent。
PASS  route:数组 params 解析     status=200
SUMMARY  13/13 PASS
```

产出的 PNG 与 Astro 预渲染那份 `cmp` 无差异 → 同一份固定输入在两条路径上出图完全一致，`options` 注入契约稳定。

## 7. 无 astro 消费者 + 类型检查

- **运行期不依赖 astro**：`npm i --legacy-peer-deps`（32 包 / 2s，`node_modules/astro` 确认不存在）后同一脚本 **13/13 PASS**，PNG sha256 仍是 `8e6c490e…`。`src/route.ts` 里 `import type { APIRoute } from "astro"` 是纯类型导入，编译期即被擦除。
- **类型可解析**：消费者 `tsc -p tsconfig.json`（TypeScript **7.0.2**）exit 0 —— 覆盖 `src/pages/og/[...og].png.ts` 与 `type-probe.ts`（后者用两条 `@ts-expect-error` 反向证明冻结契约真必填：`theme` 缺 `accent`、`posts` 项缺 `pubDate` 都编译期报错；若契约被放宽成可选，`tsc` 会因「未使用的 @ts-expect-error」而失败）。
- 但注意：`--legacy-peer-deps` 装上后 `npm ls` **不会**报 `UNMET PEER DEPENDENCY astro`，缺 peer 是静默的（见 F5）。

## 8. 默认字体 CDN 分支

不传 `options.fonts`，走包内 `DEFAULT_FONT_URLS`：

```console
DEFAULT_FONTS=OK status=200 1200x630 bytes=39337 elapsed=4325ms
SHA256=92560617d5ad685d4595f0e38951a8dbd0c59a12a10d7ccefc637b7e7a05b7b4
CACHE  NotoSansSC-Bold.otf              8543168B
CACHE  NotoSansSC-Bold.otf.source       95B
CACHE  NotoSansSC-Regular.otf           8331336B
CACHE  NotoSansSC-Regular.otf.source    98B
```

冷启动 4.3s（17 MB 字体下载 + 渲染），缓存命中后与本地字体路径等价。下载下来的字体与仓内 `.astro/fonts` 缓存 **sha256 相同**（Regular `faa6c9df…`、Bold `c6cb5a93…`），`.source` 边车正确写入来源 URL。

## 9. peerDependencies / dependencies 归属

| 依赖 | 声明 | 实际用途 | 判定 |
| --- | --- | --- | --- |
| `astro` `^7.3.6` | **peer** | 只用于 `import type { APIRoute }`（返回类型） | ✅ 正确。主题包与站点必须共用同一份 Astro，peer 可避免双份 Astro；npm 11 会自动装（实测 astro 7.4.6），消费者无需手写 |
| `satori` `^0.26.0` | **dependencies** | 运行期 HTML→SVG，用到 `fonts`/`width`/`height` 选项，版本敏感 | ✅ 正确。不是宿主单例，交给包自己锁版本更安全 |
| `sharp` `^0.35.5` | **dependencies** | 运行期 SVG→PNG | ✅ 正确。且与 astro 自身的 sharp 同版本 → 实测 `deduped`，不会出现两份 libvips |
| `node:fs` / `node:path` | — | 内置模块 | ✅ 无需声明 |
| 隐藏 peer | — | `grep -rn "^import" src/` 只有 astro(type)/satori/sharp/node:\*/./types | ✅ **零隐藏依赖**：声明的 3 个外部包 = 实际 import 的 3 个外部包 |

无 `optionalDependencies`、无 `devDependencies`。总安装体积代价（含 peer）：215 包 / 38s，其中绝大部分来自 peer `astro`；只用运行期（`--legacy-peer-deps`）时 32 包 / 2s。

## 10. 门禁

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 包边界 | `node scripts/gates/verify-package-boundary.mjs` | **PASS** packages=3 violations=0（B1/B2/B3/B4 全 0，B4 的 51 个站点私有样本零命中） |
| token | `node scripts/gates/check-tokens.mjs` | **10/10 PASS**（G-T1…G-S6） |
| tsc（站点） | `npx tsc --noEmit` | **exit 0**，无输出 |
| prettier | `prettier --check "packages/og-image/**/*.{ts,json,md}"` + 本报告 | **clean**（"All matched files use Prettier code style!"） |

`tsconfig.json` 的 `include` 只有 `src/**/*`，仓库根 `tsc` **不覆盖** `packages/**`；包自身的类型正确性由 §7 的消费者 `tsc` 承担（这是更贴近真实使用的检查）。

## 11. 发现（只记录，不改公共 API）

| ID | 级别 | 问题 | 建议 |
| --- | --- | --- | --- |
| **F1** | P1 | 包只发 TS 源码，`exports["."]`→`./src/index.ts`；裸 Node `import` 直接 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`（§5）。README 完全没写这条 | 发布前二选一：① 加 build 步骤产出 `dist/*.js` + `*.d.ts`（`exports` 指 dist）；② 明确在 README/Requirements 写「必须在 Astro/Vite 等 bundler 环境导入，不支持裸 Node」 |
| **F2** | P1 | `engines.node` = `^22.0.0 \|\| ^24.0.0` → 本机 node 26 安装时**真的报** `npm warn EBADENGINE`（M4-2 报的 F4 在 tokens 上没触发，因为 tokens 无 `engines`；og-image 有，所以每次都刷） | 发布前放宽到 `>=22`（M4-2 F4 同一决策） |
| **F3** | P2 | `main`/`module`/`types` 三个字段都指向 `.ts`；`module` 字段对现代 bundler 已无意义且会误导非 bundler 消费者 | 若走 F1① 则一并指 dist；若走 F1② 至少删掉 `module` |
| **F4** | P3 | `README.md` 的安装段仍是 `@<npm-scope>/dogeared-og-image` 占位（B2 门禁把 `marxchou` 当站点身份串，所以只能占位）；`src/index.ts`、`src/types.ts` 注释里还写着**旧包名 `zcblog-og-image`** | 发布后回填真 scope 并放宽 B2；顺手把注释包名改成 `dogeared-og-image` |
| **F5** | P3 | peer `astro` 只在类型层使用：无 astro 消费者 13/13 PASS、PNG 字节一致；`--legacy-peer-deps` 安装时 `npm ls` 不报 UNMET PEER，缺 peer 静默 | peer 归属不改（对主题包正确），但 README 应写明「运行期不加载 astro」；若希望离线脚本可用，考虑 `peerDependenciesMeta.astro.optional = true` |
| **F6** | P3 | 包内零测试文件（仓库有 vitest，但包没有单测）；本轮以 13 条消费者断言替代 | M4-4 评估把 `direct-call` 断言固化成 `packages/og-image` 的 smoke 测试 |

## 12. 边界与偏差

- **未做**：`npm publish`（含真发布）、改版本号、改 `private`、改站点代码、改 tokens/ui 公共 API。工作树收尾 `git status --porcelain` 为空——本卡只新增本报告。
- `npm publish --dry-run` 仅作观察：exit 0，输出 `+ @marxchou/dogeared-og-image@2.1.0` 并提示需要登录；**dry-run 不会触发 `EPRIVATE`**，所以「private 能拦住误发布」这一点本卡没有实测（真发布会被 npm 拒绝，且当前 `npm whoami` 为未登录）。
- **偏差 1**：`npm pack --workspace` 不可用（根无 `workspaces` 字段），改在包目录内 `npm pack`，与 M4-1/M4-2 一致。
- **偏差 2**：本机 `execute_code` 在无人值守模式被禁用，`node -e/-p` 被审批策略拦为危险命令，所有断言改为落盘脚本 + `node <file>` 执行（脚本在消费者目录 `/tmp/dogeared-og-consumer/scripts/`）；这也是报告里每条断言都能复跑的原因。
- **限制**：Astro 侧只验证了 `output: "static"` 预渲染；SSR/`prerender=false` 下的运行时行为未测（计划外）。字体的 CDN 分支在本机网络通（HEAD 200 / 0.26s），受限网络下的失败提示（抛错 + 提示覆盖）只审读了代码，未构造失败态实测。

## 13. 复跑命令

```console
# 1) 打包（包目录内，根无 workspaces）
cd packages/og-image && npm pack --pack-destination /tmp/dogeared-pack-og-m43 --json

# 2) 干净消费者
mkdir -p /tmp/dogeared-og-consumer && cd /tmp/dogeared-og-consumer
printf '{"name":"dogeared-og-consumer","version":"1.0.0","private":true,"type":"module"}\n' > package.json
npm i /tmp/dogeared-pack-og-m43/marxchou-dogeared-og-image-2.1.0.tgz
npx astro build                     # 需先放 astro.config.mjs 与 src/pages/og/[...og].png.ts
node scripts/verify-png.mjs dist/og/*.png

# 3) 直调 + 类型
npm i -D esbuild typescript @types/node
npx esbuild scripts/direct-call.mjs --bundle --format=esm --platform=node \
  --target=node22 --external:satori --external:sharp --outfile=dist-call/direct.mjs
node dist-call/direct.mjs
npx tsc -p tsconfig.json
```

消费者工程（`astro.config.mjs`、路由壳、`scripts/*.mjs`、`type-probe.ts`、字体 fixtures）留在 `/tmp/dogeared-og-consumer` 与 `/tmp/dogeared-og-consumer-noastro`，可整套复跑；报告内已给关键片段。
