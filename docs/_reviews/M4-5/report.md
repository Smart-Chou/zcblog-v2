# M4-5 · 第三方干净安装验收

- **结论：PASS**（空项目安装 + 构建 + OG 出图全通过；0 私有路径/凭据泄漏；1 条 P2 依赖告警需在真发布前处理，见 §5 F1）
- 执行：blog-qa / 2026-11-06 03:30–03:40 (+08:00)
- 基线：仓库 HEAD `7bc2a46`（M4-6 包产物修复后），工作树干净（`git status --porcelain` = 0 行）
- 边界：只写 `docs/_reviews/M4-5/**` 与临时目录；未 publish、未改 `packages/**` 源码、未碰生产、未 commit

---

## 1. 环境与安装来源

| 项           | 值                                                         |
| ------------ | ---------------------------------------------------------- |
| OS / 架构    | macOS 15.7.7 · x86_64                                      |
| Node / npm   | v26.0.0 / 11.12.1                                          |
| registry     | `https://registry.npmjs.org/`                              |
| 三包状态     | `private: true`（未 publish）→ **必须 tarball 安装**       |
| 实际安装来源 | 本仓 `npm pack` 产物，落在 `/tmp/dogeared-pack/`（非 registry） |
| 消费项目位置 | `~/.hermes/profiles/blog-qa/cache/scratch/m4-5/consumer-run{1,2,3,4}` |
| 消费项目方式 | `mkdir` 空目录 + `npm init -y` + 最小 Astro 项目，**未复制本仓 node_modules / 未用 workspace / 未用 file: 指向包源码** |

### 1.1 tarball 清单（`npm pack`，prepack 触发真实 build）

| 包 | 文件 | 打包体积 | 解包体积 | 文件数 | sha256 |
| --- | --- | --- | --- | --- | --- |
| `@marxchou/dogeared-tokens` | `marxchou-dogeared-tokens-2.1.0.tgz` | 20,379 B | 69.3 kB | 8 | `6ea9410daa20b0eb…5986bc` |
| `@marxchou/dogeared-ui` | `marxchou-dogeared-ui-2.1.0.tgz` | 5,342 B | 15.2 kB | 11 | `a866afcf74e2d955…4c49d3` |
| `@marxchou/dogeared-og-image` | `marxchou-dogeared-og-image-2.1.0.tgz` | 10,852 B | 46.5 kB | 13 | `e190111c0c2995d5…e129f7` |

体积与 M4-6 报告一致（20,379 / 5,342 / 10,852 B），说明 M4-6 之后的 `dist/` 产物稳定。
**打包可复现**：第二次独立 `npm pack`（`/tmp/dogeared-pack-run2/`）三包 **sha256 逐字节相同** → npm 对 tarball 做了确定性归一化，同 commit 重打包不会产生漂移。

---

## 2. 执行步骤（含实际耗时）

### run1 — 分两步安装（冷缓存）

```bash
mkdir -p scratch/m4-5/consumer-run1 && cd $_ && npm init -y
npm install astro@^7.3.6      # 193 pkgs, 28.81s（冷缓存），0 vulnerabilities
npm install /tmp/dogeared-pack/marxchou-dogeared-{tokens,ui,og-image}-2.1.0.tgz
                              # +25 pkgs, 4.23s
npm run build                 # 6.41s（astro build）
```

### run2 — 重新 `npm pack` → 再装一次（验证可复现，卡片必做项 5）

```bash
cd packages/{tokens,ui,og-image} && npm pack --pack-destination /tmp/dogeared-pack-run2
mkdir .../consumer-run2 && npm init -y
npm install astro@^7.3.6                     # 6.69s（npm 缓存已热）
npm install /tmp/dogeared-pack-run2/*.tgz    # 2.09s
npm run build                                # 9.75s
```

### run3 — 一条命令装全（最贴近真实消费者）

```bash
npm install astro@^7.3.6 <3 tgz>   # 217 pkgs, 7.32s, npm warn 行数 = 0
npm run build                      # 5.81s
```

### run4 — 只装三包（验证 peer astro 是 optional）

```bash
npm install <3 tgz>    # 3.74s
npm ls                 # exit 0；astro 未被自动安装
```

### 消费项目内容（最小但覆盖三包公共面）

- `src/styles/global.css` —— 按 tokens README 的顺序做 `@layer variables` + `@import "@marxchou/dogeared-tokens/variables.css"` / `tokens.css`
- `src/pages/index.astro` —— barrel 导入 `import { Badge, Button } from "@marxchou/dogeared-ui"`，渲染 3 个 Badge（tip/success/warning）+ 2 个 Button（primary/secondary）
- `src/pages/og/[...og].png.ts` —— `createOgImageRoute({ posts, site, theme })` + `getStaticPaths()`，预渲染 `/og/hello.png`
- `probe-resolve.mjs` —— 裸 Node 侧入口解析与 route 调用探针（见 §3.4）

---

## 3. 验证结果

### 3.1 构建

| run | `astro build` | `/og/hello.png` 预渲染 | 产物 |
| --- | --- | --- | --- |
| run1 | ✅ 6.41s | ✅ 4.01s | `index.html` 1,089 B · `_astro/index.DJmOVShS.css` 23,161 B · `og/hello.png` 48,269 B（共 76 KB） |
| run2 | ✅ 9.75s | ✅ 7.23s | 同上，sha256 **逐字节相同** |
| run3 | ✅ 5.81s | ✅ 3.23s | 同上，sha256 **逐字节相同** |

三次独立安装 + 构建的产物 sha256 完全一致：

```
index.html                 1fac43fc23e0a714075416ceddddcc9b523db9b3e6f7e3c40af8a07e4e765002
_astro/index.DJmOVShS.css  ad906cad9f32785f5b2ef9f95a4c3d9b71942551001f137a321e5f36ea283d7c
og/hello.png               96e6b0642dd1054831266584bf08df9f0b5f8745937ad83c03185b5bc28bc3f0
```

构建期无警告、无 warning 级别日志；`og/hello.png` 为 1200×630 PNG（`sips` 实测），视觉复核见 §3.5。

### 3.2 无私有路径 / 无凭据泄漏

| 检查 | 范围 | 结果 |
| --- | --- | --- |
| `/Users/chowcong` | `dist/**` + `node_modules/@marxchou/**` | **0 命中** |
| `dogeared-pack`（临时目录名） | 同上 | 0 命中 |
| 包内 `package.json` 的 `file:` / `workspace:` | 三个已安装包 | **0 命中**（grep exit 1） |
| tarball 载荷中的绝对路径 | 三包 `tar -xO \| grep` | **0 命中** |
| 凭据样式（`ghp_`/`github_pat_`/`npm_…`/`sk-…`/`BEGIN … PRIVATE KEY`/`CF_PURGE_TOKEN`/`ark-`） | `dist/**` + `node_modules/@marxchou/**` | **0 命中** |
| tarball 文件清单 | 三包 | 仅 `LICENSE/NOTICE/README/package.json` + `dist/**` + `src/**` + tokens 的 `*.css/*.json/scripts/build-tokens.mjs`，无 `.env`/`.npmrc`/测试/本机文件 |
| `zcblog-v2` 字样 | 全范围 | 仅出现在三包 `package.json` 的 `homepage`/`repository`/`bugs` 里，形态是 `https://github.com/Smart-Chou/zcblog-v2` 公开 URL，**不是本机路径** |

> 说明：消费项目自己的 `package.json` 里 npm 会把 tarball 依赖记成 `file:../../…/xxx.tgz`——这是 npm 对非 registry 安装的记录方式，属于**消费方**元数据；三包自身的元数据与任何构建产物里都没有 `file:`/`workspace:`/绝对路径。

### 3.3 peer 依赖

- `npm ls`（整树，run1/run3/run4）**exit 0**。
- `npm ls --all` 里 25 条 `UNMET OPTIONAL DEPENDENCY` 全部是 `@img/sharp-*` 的**跨平台可选二进制**（本机 x86_64 只装 `@img/sharp-darwin-x64` + `libvips-darwin-x64`），**非可选 UNMET = 0**。
- run4（不装 astro）：`astro` 未被自动拉取，`npm ls` 整树仍 exit 0 → M4-6 把 peer 转 optional 的改动在第三方场景下成立。
- 反向说明：`npm ls astro`（点名查询）在 run4 返回 exit 1 并显示 `└── (empty)`，这是 npm 对"被查询包未安装"的返回码，不是缺 peer。

### 3.4 三包公共面在第三方项目里可用

`probe-resolve.mjs`（消费目录内，裸 Node 执行）：

```
resolve OK  @marxchou/dogeared-tokens            -> ./node_modules/@marxchou/dogeared-tokens/tokens.css
resolve OK  @marxchou/dogeared-tokens/tokens.css -> ./node_modules/@marxchou/dogeared-tokens/tokens.css
resolve OK  @marxchou/dogeared-tokens/variables.css -> …/variables.css
resolve OK  @marxchou/dogeared-tokens/tokens.json   -> …/tokens.json
resolve OK  @marxchou/dogeared-ui                -> ./node_modules/@marxchou/dogeared-ui/dist/index.js
resolve OK  @marxchou/dogeared-ui/Badge.astro    -> …/dist/Badge.astro
resolve OK  @marxchou/dogeared-ui/Button.astro   -> …/dist/Button.astro
resolve OK  @marxchou/dogeared-og-image          -> ./node_modules/@marxchou/dogeared-og-image/dist/index.js
og-image exports: createOgImageRoute
bare GET /og/bare -> 200 image/png 31895 bytes        # 裸 Node 直接调 route 工厂，无需 Astro 运行时
bare GET /og/nope -> 404 og-image: 未知文章 slug「nope」
ui bare import -> expected failure: ERR_UNKNOWN_FILE_EXTENSION
```

即：og-image 在**裸 Node** 就可用（M4-6 F1① 的收益在第三方安装里复现）；ui 依赖 Astro/Vite 编译、裸 Node 必失败是**已文档化且被包内测试钉住**的行为，不是 tarball 缺陷。
Astro 侧：`dist/index.html` 里 3 个 `class="badge …"`、2 个 `class="btn …"`，CSS 产物 23,161 B 含 **236 个自定义属性**与 `var(--…)` 引用 → tokens 层与组件样式都被正确打包，没有"组件渲染了但变量没加载"的半成品状态。

### 3.5 OG 图内容复核（视觉）

`vision` 复核 `dist/og/hello.png`：标题「第三方干净安装验收」CJK 逐字清晰、无 tofu/缺字；描述两行、左金线/短横杠/右上装饰圆/底部分隔线按设计出现；页脚左 `consumer.example.com`、右 `Dogeared Consumer`。即字体下载（默认 CDN）→ satori → sharp 全链在第三方项目里真实跑通，不是空壳 200。

### 3.6 安装足迹

| 项 | 值 |
| --- | --- |
| 三包本身 | tokens 84 KB / og-image 80 KB / ui 44 KB（`node_modules` 实测） |
| 传递依赖 | satori 5.4 MB、sharp 1.0 MB（+ `@img/*` 预编译二进制） |
| 整个 node_modules（含 astro） | 185–186 MB / 217–219 pkgs |

---

## 4. 警告清单（原样记录）

| # | 来源 | 内容 | 影响 |
| --- | --- | --- | --- |
| W1 | `npm audit` | **2 moderate**：`satori 0.0.27–0.33.4`  improper SVG escaping（GHSA-wx4j-mvgx-mqwp），实际落地 `satori@0.26.0`，`^0.26.0` 范围内 **no fix available** | 见 F1 |
| W2 | 构建期 | 每个**全新**消费项目首次构建要下载 `NotoSansSC-Regular.otf`(8.3 MB)+`Bold`(8.5 MB) 到 `<cwd>/.astro/fonts`；本次 3 个 run 各下了一次 | 见 F3 |
| W3 | 安装期（异常子进程） | 有一次安装子进程跑在 **node 22.23.1**（非本机默认 v26），出现 `EBADENGINE` 仅针对 `astro@7.4.6`/`@astrojs/prism`/`@astrojs/telemetry`（要求 `>=22.23.4`）；**三包零 EBADENGINE** | 见 F4 |
| W4 | 依赖规格 | 三期安装均显示 `found 0 vulnerabilities`（astro 安装阶段）；三包安装后因 satori 变为 2 moderate | 同 W1 |

---

## 5. 发现与建议（本卡不改包代码，退回对应发布卡）

**F1（P2，需真发布前处理）· og-image 的 `satori` 依赖把消费者钉在带告警的版本**
`packages/og-image/package.json` 声明 `satori: "^0.26.0"`。0.x 的 caret 语义等价 `>=0.26.0 <0.27.0`，所以第三方项目**只会**装到 `0.26.0`；npm registry 最新为 `0.63.2`，而 GHSA-wx4j-mvgx-mqwp 的受影响区间是 `0.0.27–0.33.4` → 在声明的范围内无解，消费者 `npm install` 后立刻看到 2 moderate。
暴露面：satori 负责把标题/描述转 SVG，若把**外部可控**文本传给 og-image，存在注入面；本站标题为自撰内容，风险低，但作为公开发布的包，"装完即报 2 moderate" 会直接掉分。
建议：单独开卡把范围抬到 `>=0.33.5`（或最新 0.63.x），并**重新验证出图三路径 PNG 是否仍逐字节一致**——升 satori 可能改变排版，这会牵动 M4-6 的"三路径同 sha"结论，必须在发布卡里一并重测。
最小复现：
```bash
mkdir -p /tmp/satori-audit && cd /tmp/satori-audit && npm init -y >/dev/null
npm i /tmp/dogeared-pack/marxchou-dogeared-og-image-2.1.0.tgz
npm audit          # satori 0.0.27-0.33.4, 2 moderate
npm ls satori      # satori@0.26.0
```

**F2（P3）· tarball 内 `"private": true` 原样保留**
tarball 里的 `package.json` 仍带 `private: true`。tarball 安装不受影响（npm 只拦 publish），但这意味着：在三包 flip 之前，任何"从 registry 装"的路径都不存在，README 里那行 `npm install @<scope>/dogeared-*` 目前只是前瞻文案（README 自己也写明了）。不是缺陷，但发布卡需要保证 flip 与 README 同步。

**F3（P3）· 每个新项目重复下载 16.8 MB 字体**
字体缓存在 `<消费项目>/.astro/fonts`，跨项目不共享；三个 run 各下一次（3.2–7.2 s 的 og 预渲染差异主要来自这里），离线/受限网络必须显式传 `fonts`（否则按设计**抛错**而不是静默无字体）。建议在 README/发布说明里给出"CI 缓存 `.astro/fonts` 或打包小型字体子集"的一句话指引（对应 M4-6 F6）。

**F4（P3）· `engines: >=22` 比 astro 自身要求更宽**
三包 `engines.node >=22`，但 `astro@7.4.6` 要求 `>=22.23.4`。在 node 22.23.1 上装三包零告警、装 astro 报 `EBADENGINE`（W3 实测）。消费者会把这两条告警混为一谈；建议 README 的 Requirements 写成 `Node >= 22.23.4（Astro 侧要求；三包自身只需 >=22）`。

**F5（P3，沿用 M4-6 F5）· tarball 同时发 `src/` 与 `dist/`**
ui 解包 15.2 kB / 11 个文件里 `src` 与 `dist` 各一份组件，og-image 13 个文件同样双份；tokens 还发 25.5 kB 的 `build-tokens.mjs` + bin。可读性换体积，接受即可，仅记录。

**F6（P3）· 消费方 `package.json` 会写入 `file:../../…` 相对规格**
tarball 安装后 npm 记录的是从消费目录出发的相对 `file:` 规格。若消费者把项目挪目录或提交仓库，这条路径会失效。建议对外文档给"把 tgz 放进项目内再 `npm i ./xxx.tgz`"的写法（或等真发布）。

---

## 6. 验收对照

- [x] 空项目安装 + 构建通过：三次独立安装（分步冷缓存 / 重打包再装 / 一条命令），三次 `astro build` 全绿，产物 sha256 相同
- [x] 无私有路径/凭据泄漏：`/Users/chowcong`、`zcblog-v2`（仅公开 GitHub URL）、`file:`/`workspace:`、凭据样式 全部 0 命中（§3.2）
- [x] 报告含命令、版本、耗时、警告：§2 / §3 / §4
- [x] 不 publish、不改生产：registry 全程只读；未 publish；未碰站点代码与 deploy
- [x] 结论明确 PASS/FAIL：**PASS**（附 1 条 P2 依赖告警 F1，附最小复现）

## 7. 未做 / 边界自证

- 未 `npm publish`、未创建 dist-tag、未动 registry（三包仍 `private: true`，`/tmp` 内只有本地 tarball）
- 未修改 `packages/**` 源码；只在包目录跑 `npm pack`（`prepack` 重建的 `dist/` 是 `.gitignore:2 dist/` 覆盖的生成物），执行后仓库 `git status --porcelain` 仍为 **0 行**
- 未 commit / push（git 边界：zcblog 仓只读）
- 未做真实 CI runner 验证（本卡只做本机第三方安装）；`npm ci`/锁文件路径未覆盖（tarball 场景以 `npm install` 为准）
