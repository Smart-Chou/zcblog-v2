# 只消费 Dogeared npm 包（tokens / og-image）

这篇是给**不 fork 主题仓库**的消费者用的接入与升级说明。完整的主题站点装配（页面、内容、
配置 overlay）仍走 `docs/upgrade.md` 的 `theme-sync` / `create-site` 链路；这里只覆盖两个
已发布到 npm 的包。

> 当前版本（2026-11-06 实测）：`@marxchou/dogeared-tokens@2.1.2`、`@marxchou/dogeared-og-image@2.1.2`
> （registry `latest`）。`@marxchou/dogeared-ui` 仍是 private，未发布；不要在消费者项目里依赖它。
>
> **版本以 registry 为准**，本文的版本号只是写作时快照：
>
> ```bash
> npm view @marxchou/dogeared-tokens version
> npm view @marxchou/dogeared-og-image version
> ```

| 版本            | 状态       | 说明                                                                 |
| --------------- | ---------- | -------------------------------------------------------------------- |
| `2.1.2`         | `latest`   | M5-4 用 GitHub OIDC 发布，带 SLSA provenance；当前推荐的起点          |
| `2.1.1`         | 可用       | README-only patch，运行时与 `2.1.0` 相同                              |
| `2.1.0`         | 可用       | 首发版本                                                             |
| `2.1.3+` / `2.2.x` | 未发布  | 升级到下一 minor 的步骤见 §5；本轮用本地 2.2.0 预演包验证过同一条路径  |

> 早期发布留下的 `0.0.0-stage` 占位已于 2026-11-06 删除（D-0135），registry 上现在只有
> `2.1.0 / 2.1.1 / 2.1.2` 三个版本；`versions` 列表可直接 `npm view <pkg> versions` 复核。

## 1. 最小 Astro 消费者

已实测（2026-11-06，npm 10.9.4 / 11.16.0，Node 22.22.0 / 24.13.0，macOS 与 Linux 各两格）：空目录安装 + `astro build` 成功，详见 §7。

```bash
mkdir dogeared-consumer && cd dogeared-consumer
npm init -y
npm i astro@^7.3.6 @marxchou/dogeared-tokens@2.1.2 @marxchou/dogeared-og-image@2.1.2
```

`og-image` 的 peer 依赖是 `astro@^7.3.6`（`peerDependenciesMeta.optional = true`），用 Astro 5
会在 `npm install` 阶段报 `ERESOLVE`；这不是包坏了，是 peer 约束。

`package.json` 建议至少：

```json
{
    "type": "module",
    "scripts": { "build": "astro build" },
    "dependencies": {
        "astro": "^7.3.6",
        "@marxchou/dogeared-tokens": "2.1.2",
        "@marxchou/dogeared-og-image": "2.1.2"
    }
}
```

`astro.config.mjs` 用最小配置即可：

```js
import { defineConfig } from "astro/config";
export default defineConfig({});
```

## 2. 接 tokens（CSS）

在全局样式或页面里按顺序导入。`variables.css` 是手工原语层，`tokens.css` 是生成的
semantic 层；顺序不能反：

```astro
---
import "@marxchou/dogeared-tokens/variables.css";
import "@marxchou/dogeared-tokens/tokens.css";
---
```

实测构建后的 CSS 里可以读到 `--color-bg`、`--color-accent`、`--color-bg-raised` 等变量；
`tokens.css` 同时带 `:root` 与 `[data-theme="dark"]` 块。

不需要 JS 入口；需要原始值时按路径读取：

```js
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tokens = JSON.parse(
    await readFile(require.resolve("@marxchou/dogeared-tokens/tokens.json"), "utf8"),
);
```

## 3. 接 og-image（Astro API route）

```ts
// src/pages/og/[...og].png.ts
import { createOgImageRoute } from "@marxchou/dogeared-og-image";

const posts = [
    {
        id: "hello",
        title: "Hello Dogeared",
        tags: ["demo"],
        pubDate: new Date("2026-11-06"),
        description: "A minimal OG image",
    },
];

export const getStaticPaths = () => posts.map((post) => ({ params: { og: post.id } }));

export const GET = createOgImageRoute({
    posts: posts.map((p) => ({
        slug: p.id,
        title: p.title,
        tags: p.tags,
        pubDate: p.pubDate,
        description: p.description,
    })),
    site: {
        title: "My Site",
        author: "Me",
        url: "https://example.com",
        description: "A site using Dogeared",
    },
    theme: {
        background: "#FDF9F2",
        foreground: "#121316",
        accent: "#C84B31",
    },
});
```

注意 route 参数名是 `og`（factory 读 `context.params.og`），文件要放在
`/og/[...og].png.ts`；`getStaticPaths()` 由站点自己提供，slug 要和 `options.posts[].slug` 对齐。

`fonts` 可传 WOFF 的 http(s) URL 或本地路径；不传时用包内默认 Noto Sans SC CDN 字体，
离线构建请传本地字体（包会明确报错，不会静默渲染无字体图）。实际生成 PNG
需要 satori + sharp，首次运行会稍慢。

## 4. 验证

```bash
npm run build
```

实测输出：`dist/index.html`、`dist/_astro/*.css`，以及 `dist/og/hello.png`
（**1200×630 RGBA PNG**）；单页 + 一张 OG 的构建约 0.9s（首次运行含依赖预热会慢一个量级）。路由文件必须是
`src/pages/og/[...og].png.ts`，`getStaticPaths()` 的 `params.og` 要和帖子 slug 一致。

## 5. 升级：2.1.x → 下一 minor（2.2.x）

### 5.1 先确认这一版改了什么

```bash
npm view @marxchou/dogeared-tokens versions --json      # 有哪些版本
npm view @marxchou/dogeared-tokens@2.2.0 dist.integrity # 目标版本是否已在 registry 上
```

语义承诺：`minor` 内不 breaking，breaking 只随 `minor` 一起发并写在 `CHANGELOG` 的
`Breaking` 段。两个包**同版本 lockstep**（`tokens` 与 `og-image` 永远同号），升级时一起升。

> 现在跑第二条会得到 `E404`——`2.2.0` 还没发布。这不是命令写错：它正是「目标版本不存在，
> 先别改 `package.json`」的判据。

### 5.2 升级步骤（npm）

```bash
# 0) 留退路：记版本 + 备份清单
npm ls @marxchou/dogeared-tokens @marxchou/dogeared-og-image --depth=0
cp package.json package.json.bak-upgrade
cp package-lock.json package-lock.json.bak-upgrade

# 1) 升到目标 minor（两包一起，显式版本号）
npm install @marxchou/dogeared-tokens@2.2.0 @marxchou/dogeared-og-image@2.2.0

# 2) 重建
npm run build
```

- pnpm：`pnpm add @marxchou/dogeared-tokens@2.2.0 @marxchou/dogeared-og-image@2.2.0`
- Yarn：`yarn add @marxchou/dogeared-tokens@2.2.0 @marxchou/dogeared-og-image@2.2.0`

**今天就能照做的一次升级**：`2.2.0` 还没发布，所以现在把上面第 1 步的版本号换成 `2.1.2`
（起点 `2.1.1`），命令与验收步骤完全相同——这条路径本轮在 4 个 cell 上都真跑过（§7）。

**caret 范围要小心**：如果 `package.json` 写的是 `"^2.1.2"`，`npm update` 会自动吃到
`2.2.0`（minor 在 caret 允许范围内），升级就发生在你没显式操作的时候。要「升级由人决定」
就写精确版本（本文示例都是精确版本）；要「跟 latest 走」就写 caret，并在 CI 里锁
`package-lock.json`。

### 5.3 升级后验收（三条都过才算成功）

```bash
test -f dist/index.html && echo "html OK"
grep -rl -- "--color-accent" dist | head -1               # tokens 真的进了产物（内联或独立 CSS 都算）
file dist/og/hello.png                                   # 期望：PNG image data, 1200 x 630
```

`file` 的输出必须含 `1200 x 630`。Astro 默认会把小体积 CSS 内联进 HTML，所以查变量要用
`grep -rl`（全 `dist/` 扫），不要只盯着 `dist/_astro/*.css`。如果你的站点用
`@marxchou/dogeared-tokens` 的 `tokens.json` 做别的事（设计文档、生成器），升级后再跑一次
自己的读取脚本。

### 5.4 peer 警告与常见报错怎么读

| 现象                                                                  | 含义 / 处理                                                                 |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `npm warn allow-scripts … fsevents …`                                 | npm 11.16+ 对可选依赖安装脚本的新提示，与这两个包无关；macOS 上常见，可忽略     |
| `ERESOLVE … peer astro@"^7.3.6"`                                      | 站点里的 astro 版本不在 peer 范围；先 `npm ls astro`，再决定升 astro 还是留旧包 |
| 没有任何 peer 警告                                                    | 正常：`tokens` 无 peer 依赖，`og-image` 的 astro peer 是可选的                |
| `Cannot find module "@marxchou/dogeared-og-image"` 只在构建期出现      | route 文件路径/导出名写错（应为 `/og/[...og].png.ts` + `createOgImageRoute`）  |

### 5.5 这条路径验证到什么程度

| 段             | 版本来源                                   | 结果 |
| -------------- | ------------------------------------------ | ---- |
| `2.1.1 → 2.1.2` | registry（真实发布版，带 provenance）      | 4 格全 PASS（macOS/Linux × Node 22/24），数据见 §7 |
| `2.1.2 → 2.2.0` | **本地打包**：仓库同源文件、仅把 `version` 改成 `2.2.0`，`npm pack` 出 tarball | 4 格全 PASS，用的就是 §5.2 这套命令 |

`2.2.0` 还没发布，所以这一段的版本号是「预演」而不是「已上线」；真实发布后命令一字不改，
只把 tarball 换成 registry 版本即可。

## 6. 回滚

三种方式按场景选，都不需要 registry 写操作（消费者本来也不能 unpublish / deprecate）。

### 6.1 pin 回滚（最快，推荐先试）

```bash
npm install @marxchou/dogeared-tokens@2.1.2 @marxchou/dogeared-og-image@2.1.2
npm run build
```

适用：只想把这两个包退回去，其他依赖不动。

### 6.2 锁文件回滚（最彻底）

```bash
cp package.json.bak-upgrade package.json
cp package-lock.json.bak-upgrade package-lock.json
npm ci
npm run build
```

适用：升级顺带改了整棵依赖树（`npm install` 会做 dedupe / 抬升），要精确回到升级前的图。
`npm ci` 会按锁文件重装，比 `npm install` 更可预测。

### 6.3 git 回滚（升级已提交）

```bash
git revert <upgrade-commit>
npm ci && npm run build
```

### 6.4 回滚后必须复验

回滚不是「装回去就完了」——用 §5.3 的三条再验一次。回滚只影响你自己的依赖树；registry
上的版本、dist-tag、provenance 都不会因为消费者回滚而改变。

## 7. 消费者矩阵（2026-11-06 实测）

每格是同一套生命周期：**首装 `2.1.1` → 升到 `2.1.2` → 升到 2.2.0 预演包 → pin 回滚 `2.1.2`
→ 锁文件回滚 `2.1.2`**，每一步都跟着一次 `astro build` 和产物断言（HTML + `--color-accent`
+ 1200×630 PNG）。

| Cell            | Node    | npm    | OS                    | 首装 `2.1.1` (s) | 升级 `2.1.2` (s) | minor 预演 (s) | pin 回滚 (s) | lockfile 回滚 (s) | peer 警告 | 其它 npm 警告 | 结果 |
| --------------- | ------- | ------ | --------------------- | ---------------: | ---------------: | -------------: | -----------: | ----------------: | --------: | ------------: | ---- |
| `node22-darwin` | 22.22.0 | 10.9.4 | darwin 24.6.0         |             14.6 |              2.0 |            1.4 |          1.7 |               6.8 |         0 |             0 | PASS |
| `node24-darwin` | 24.13.0 | 11.16.0 | darwin 24.6.0        |             37.3 |              2.2 |            2.3 |          1.3 |               5.9 |         0 |            16 | PASS |
| `node22-linux`  | 22.23.4 | 10.9.9 | linux 6.12.107+deb13  |             86.4 |             20.2 |            0.8 |          0.7 |               3.8 |         0 |             0 | PASS |
| `node24-linux`  | 24.22.2 | 11.19.1 | linux 6.12.107+deb13 |            131.4 |              1.7 |            0.7 |          0.6 |               3.5 |         0 |             0 | PASS |

读数说明：

- **首装列**是空目录 + 全量依赖（astro、satori、sharp 等），包含 registry 拉取；**升级列**
  只重新解析两个小包，所以是秒级。Linux 两格跑在境外 VPS 的 docker 里，网络比 macOS 本机
  慢一个量级（86s / 131s），这是网络差异，不是包的问题。
- **peer 警告 0** 是真实结果：`tokens` 没有 peer，`og-image` 的 astro peer 是可选的且被满足。
- **其它 npm 警告 16** 全部是 npm 11.16 的 `allow-scripts` 提示（`fsevents`，macOS 可选依赖），
  与两个包无关；Node 22 的 npm 10.9.x 还没有这个功能，所以是 0。
- 版本号是各格里的**实际 node/npm 版本**（linux 用的是当前 `node:XX-bookworm-slim` 镜像，因此
  patch 号比本机 nvm 高）。

### 7.1 自己复现

仓库里两个脚本，都是只读 registry、不发布任何东西：

```bash
# 单格：从 2.1.1 一路走到回滚（--next-* 不给就只跑 registry 段）
node scripts/release/consumer-probe.mjs --cell=node22-darwin \
  --next-tokens=/tmp/fx/marxchou-dogeared-tokens-2.2.0.tgz \
  --next-og=/tmp/fx/marxchou-dogeared-og-image-2.2.0.tgz \
  --out=/tmp/matrix/node22-darwin.json

# 全矩阵：本机 Node 22/24 + 可选 docker 跑 linux 格，汇总成表格
node scripts/release/prepare-next-minor-fixture.mjs --version=2.2.0 --out=/tmp/fx
node scripts/release/verify-consumer-matrix.mjs --out=/tmp/matrix.json
node scripts/release/verify-consumer-matrix.mjs --docker=true --majors=22,24 --out=/tmp/matrix-linux.json
```

`--docker=true` 需要本机有 docker daemon；没有的话用远端 Linux 跑同一条 `consumer-probe.mjs`，
再用 `--include=/path/to/cell.json --skip-local=true` 合并。

## 8. 已知限制

- `npm audit` 会报 **3 个 moderate**：satori 钉 `fflate@0.7.3`（GHSA-px8p-9vwx-vf98）。
  消费者可按 `packages/og-image/README.md` 的 npm / pnpm / Yarn 作用域 override 配方处理；
  上游 issue 草稿在 `docs/_reviews/M4-9/upstream-satori-fflate-issue.md`，当前不提交。
- 本页只验证包接入，不包含 Dogeared 的页面/组件/内容 schema；完整主题消费请走
  `docs/upgrade.md`，并注意 `@marxchou/dogeared-ui` 尚未发布。
- `2.2.x` 尚无 registry 版本：§5 的 minor 升级路径由本地预演包验证（§5.5），发布后需把 §5.1
  的 `npm view ...@2.2.0` 换成真实查询重跑一次。
- 生产站是否切换与 npm 消费无关；`marxchou.com` 保持旧版（D-0125）。示例站
  <https://demo.zcblog-v2.pages.dev> 用的是仓库内与 `2.1.2` tarball **逐字节一致**的包内容
  （见 `docs/_reviews/M5-6/report.md` 的哈希比对），不是另一套代码。
