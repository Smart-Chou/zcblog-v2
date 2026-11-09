# M7-3b-2 · 文章海报静态资产 + poster 测试接线

- 卡：`t_990e78a4`（blog2 板）· assignee `blog-platform` · 2026-11-09
- 工作区：`/Users/chowcong/Documents/WebSiteCode/zcblog-v2`
- 结论：**完成** —— 85 篇文章的 3:4 海报在**站点构建期**预渲染成 `dist/poster/<slug>.png`（全部 1200×1600、严格 3:4）；`pnpm --filter ./packages/og-image test` 现在同时跑 smoke + poster（17/17 pass）；`/og/<slug>.png` 的 1200×630 输出未受任何影响。未接分享弹层 UI（M7-3c）、未改浏览器 JS、未改包源码。

## 1. 改了什么（3 个源文件，卡上上限 4 个）

| 文件 | 改动 |
|---|---|
| `packages/og-image/package.json` | `scripts.test`：`node --test test/smoke.test.mjs` → `node --test test/*.test.mjs`。版本/依赖/`exports` 未动。 |
| `src/pages/poster/[...slug].png.ts`（新） | Astro 端点：`getStaticPaths()` 枚举 `buildOgImageOptions().posts`，`GET` 用 `createOgImageRoute({ ...options, poster: true })`。 |
| `e2e/poster-assets.spec.ts`（新） | 三条断言：`dist/poster/*` 全部 3:4、preview 下 `/poster/<slug>.png` 是真静态资产（1200×1600）、同 slug 的 `/og/` 仍 1200×630。 |

`src/integrations/og-image-route.ts` **未改**：它已经 `export async function buildOgImageOptions()`（M3-4 抽取时就导出了），端点直接复用即可 —— 不必为了"动四个文件"去改它，`/og/` 行为因此零风险。

### 两个实现坑（都在新端点内解决，没有越界改包）

1. **参数名映射**：包内 `readSlug()` 只读 `params.og`（与 `/og/[...og].png` 同一实现），而本端点的 rest 段按卡上约定叫 `slug`。在 `GET` 里把 `context.params.slug` 映射成 `{ params: { og } }` 传给 factory。
2. **不能展开 `APIContext`**：第一版写 `route({ ...context, params: {...} })`，`astro build` 直接红：
   `[PrerenderClientAddressNotAvailable] Astro.clientAddress cannot be used inside prerendered route`。原因是展开对象会触碰 `clientAddress` 等 getter，而 prerender 阶段没有请求上下文。factory 全程只解构 `{ params }`，所以只传 `params` 即可（`as unknown as APIContext`，注释写明了理由）。

## 2. 验收（实跑输出）

### 包测试接线

```bash
$ corepack pnpm --filter ./packages/og-image test
$ node scripts/build.mjs      → BUILD_OK 5/5 必需产物 · 6 条目 · 29229 B
$ node --test test/*.test.mjs
ℹ tests 17   ℹ pass 17   ℹ fail 0   ℹ skipped 0      (smoke 10 + poster 7, 4.2s 含 build)
```

`POSTER_METRICS`（同一进程、fixture 预热后单次渲染）：默认 OG `26 ms / 67,910 B`，海报 `64 ms / 179,886 B`；smoke golden `49,574 B / 6b9d8762…` 仍然逐字节命中 —— 默认分支没有回退。

### 站点构建

```bash
$ corepack pnpm run build:ci
[build] 477 page(s) built in 5m 42s
[build] Complete!
real 5m51s
$ corepack pnpm run type-check       # tsc --noEmit，0 错
```

- **生成数量：85 张**（= 文章数，`/poster/` 构建日志 85 条）。
- **尺寸：85/85 都是 1200×1600**，`width*4 === height*3` 全部成立（Python 直接读 IHDR 复核，0 例外）。
- **产物**：`dist/poster/`（13 MB），单张 103,273–192,705 B（均值 164,054 B）。
- **单张耗时**：构建日志里 `/poster/*.png` 的 `(+Xms)` 求和 **8,358 ms / 85 ≈ 98 ms/张**（含冷启动与并发争用）；包内预热后纯渲染是 **64 ms**。相对 5m42s 的整站构建约 **2.4%**，无需裁剪到单 fixture。
- **`/og/` 未受影响**：`dist/og/` 85 张，**85/85 仍是 1200×630**（同一脚本复核）。
- **浏览器包干净**：`grep -rl "satori\|sharp" dist/assets dist/_astro` → 0 命中。satori/sharp 只在构建期 Node 侧。

### e2e（只跑这一个 spec，未跑全量）

```bash
$ ./node_modules/.bin/playwright test e2e/poster-assets.spec.ts --reporter=line
3 passed (3.8s)
```

## 3. 产物路径

| 路径 | 说明 |
|---|---|
| `dist/poster/<slug>.png` | 85 张 3:4 海报（1200×1600），构建期生成，不进 git |
| `dist/poster/blog-as-a-product.png` | 抽查样本 164,809 B；视觉复核：顶部元信息行 / 标题 / 摘要面板 / 6 个 tags 胶囊 / 页脚齐全，无裁切、无溢出、不撞页脚 |
| `dist/og/<slug>.png` | 既有 1200×630 OG，回归通过 |

## 4. 明确未做 / 已知边界

1. **不接 UI**：分享弹层（M7-3c）自己引用 `/poster/<slug>.png` 即可；本次没有改 `src/components/**`、`share.ts` 或任何浏览器 JS，`dist` 里也没有任何客户端 chunk 引用海报 URL。
2. **不发布、不改版本**：`@marxchou/dogeared-og-image` 仍 2.1.2，`dist`（包构建产物）gitignore 未提交。
3. **构建成本**：85 张海报 ≈ +8.4s 构建机时（并发后墙钟影响更小）。若文章量显著增长再考虑按需子集，当前不必。
4. **e2e 依赖 `dist`**：`poster-assets.spec.ts` 判的是构建产物，必须在本卡 `build:ci` 之后跑（preview server 也是从 `dist` 起的）。

## 5. 复核入口（给 operator）

```bash
cd /Users/chowcong/Documents/WebSiteCode/zcblog-v2
corepack pnpm --filter ./packages/og-image test    # 17/17，含 poster
corepack pnpm run build:ci                         # 477 页 + 85 张海报
./node_modules/.bin/playwright test e2e/poster-assets.spec.ts --reporter=line
# 判据速记：dist/poster/*.png 全部 1200×1600 且 w*4===h*3；dist/og/*.png 仍 1200×630
```


## 6. Operator 收口补记（2026-11-09）

- 视觉复核发现摘要面板与 tags 之间仍有约 25% 空档：route.ts 在 descBox 之外又插了一个 `flexGrow:1` 占位，剩余高度被两者平分。
- 已改为有 tags 时占位 `flexGrow:0`，让 descBox 的 `flexGrow:1` 吃满剩余高度（OG 分支 tags=null，占位仍为 1，默认 1200×630 不受影响）。
- `packages/og-image` build 5/5、poster 7/7 重跑通过；`docs/_reviews/M7-3b-1/poster.png` 已重生成（180,309 B）。
- 站点侧 85 张海报由 CI `build:ci` 重新生成；本机不再重复 5m42s 构建。
