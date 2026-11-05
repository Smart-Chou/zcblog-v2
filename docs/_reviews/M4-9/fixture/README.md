# M4-9 消费者 fixture（最小 Astro 项目）

用于「三条出图路径」里的 **Astro 预渲染** 那条：只有一个路由壳
`src/pages/og/[...og].png.ts`，挂 `createOgImageRoute()` 并导出 `getStaticPaths()`。

- 三条路径共用同一份 fixture（3 个 slug：`hello` / `cjk-long` / `latin`）与同一份字体，
  只有这样才能把「satori 版本差异」与「打包方式差异」分开归因。
- 另外两条路径：
  - 裸 Node：任务工作区 `probe/render.mjs`（无 astro 消费者，直接 `import` 包并调 route）
  - esbuild bundle：`probe/bundle-render.mjs`（bundle 到 `.bundle/bundle.mjs`；`sharp` 保持 external，
    所以 bundle 必须落在消费者目录内，否则 `sharp` 解析不到）
- 用法（**不要**在本仓目录里 `npm install`，会把 node_modules 写进文档目录）：

```bash
WS=/tmp/m49-consumer && mkdir -p $WS && cp -R docs/_reviews/M4-9/fixture/. $WS
cd $WS && npm install astro@^7.3.6 && npm install /path/to/marxchou-dogeared-og-image-2.1.0.tgz
npm run build && shasum -a 256 dist/og/*.png
```

字体：默认走包内 CDN 下载并缓存在 `.astro/fonts`（首次约 16.8 MB）。
做逐字节对比时改为显式传本地字体，见 `probe/render.mjs` 的 `fonts` 参数。
