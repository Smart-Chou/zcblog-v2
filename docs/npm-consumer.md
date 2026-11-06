# 只消费 Dogeared npm 包（tokens / og-image）

这篇是给**不 fork 主题仓库**的消费者用的最小接入说明。完整的主题站点装配（页面、内容、
配置 overlay）仍走 `docs/upgrade.md` 的 `theme-sync` / `create-site` 链路；这里只覆盖两个
已发布到 npm 的包。

> 当前版本：`@marxchou/dogeared-tokens@2.1.1`、`@marxchou/dogeared-og-image@2.1.1`。
> `@marxchou/dogeared-ui` 仍是 private，未发布；不要在消费者项目里依赖它。

## 1. 最小 Astro 消费者

已实测（2026-11-06，npm 11.15.0，Node 26）：空目录安装 + `astro build` 成功。

```bash
mkdir dogeared-consumer && cd dogeared-consumer
npm init -y
npm i astro@^7.3.6 @marxchou/dogeared-tokens@2.1.1 @marxchou/dogeared-og-image@2.1.1
```

`og-image` 的 peer 依赖是 `astro@^7.3.6`，用 Astro 5 会在 `npm install` 阶段报
`ERESOLVE`；这不是包坏了，是 peer 约束。

`package.json` 建议至少：

```json
{
    "type": "module",
    "scripts": { "build": "astro build" },
    "dependencies": {
        "astro": "^7.3.6",
        "@marxchou/dogeared-tokens": "2.1.1",
        "@marxchou/dogeared-og-image": "2.1.1"
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
（**1200×630 RGBA PNG**）；单页 + 一张 OG 的构建约 0.9s。路由文件必须是
`src/pages/og/[...og].png.ts`，`getStaticPaths()` 的 `params.og` 要和帖子 slug 一致。

## 5. 已知限制

- `npm audit` 会报 **3 个 moderate**：satori 钉 `fflate@0.7.3`（GHSA-px8p-9vwx-vf98）。
  消费者可按 `packages/og-image/README.md` 的 npm / pnpm / Yarn 作用域 override 配方处理；
  上游 issue 草稿在 `docs/_reviews/M4-9/upstream-satori-fflate-issue.md`，当前不提交。
- 本页只验证包接入，不包含 Dogeared 的页面/组件/内容 schema；完整主题消费请走
  `docs/upgrade.md`，并注意 `@marxchou/dogeared-ui` 尚未发布。
- 生产站是否切换与 npm 消费无关；`marxchou.com` 保持旧版（D-0125）。
