# M8-3b · 相册详情网格 3 列 + 图片比例锁

卡片：`t_7ca8550a` · 分支 `main` · 日期 2026-11-10

## 改了什么

| 文件 | 改动 |
| --- | --- |
| `src/components/C/AlbumGrid.astro` | 文件头把版式口径从「瀑布流」改写为「比例锁定网格」；新增 `TILE_RATIO = "4 / 3"` 并挂成 `data-album-tile-ratio`，供 e2e 对账。**0 行 JS 布局计算**，DOM 结构与缩略图/原图分离逻辑一行未动 |
| `src/styles/pages/albums.css` | 详情页 `.album-grid` 从 `column-count` 多列瀑布流改成 CSS grid；`.album-grid__item` 加 `aspect-ratio: 4 / 3`；`.album-grid__image` 改 `block-size: 100%` + `object-fit: cover` + `object-position: center`；断点与索引页合并为同一口径（768 → 2、1280 → 3，gap 20 / 24）。索引页 `.albums-wall` 规则**一行未改** |
| `e2e/pages-albums-detail-grid.spec.ts`（新增） | 详情页专项：列数契约 / 断点两侧 / 0 布局偏移 / 灯箱不回退 / 缩略图-原图分离 / 证据截图 |
| `e2e/pages-albums.spec.ts` | 只改「三视口列数」一处断言：详情页从读 computed `column-count` 改为读 `grid-template-columns` 轨道数（M8-3b 起详情页也是 grid）。其余用例未动 |

未碰：`fancybox-album.ts`、`fancybox.ts`（留给 M8-3c）。

## 为什么锁 4/3

数据里 `photos` 只有图床相对路径，没有宽高。瀑布流等于把页面高度交给图片下载速度 —— 图一到位整页往下推。实测这本相册的真实比例是混的（1920×1301 / 1920×1440 / 1554×2943 / 1920×2778 / 1920×1663），只有「瓦片比例固定 + 图片 cover 裁切」才能让盒子在图片到货前后尺寸一致（CLS = 0）；原图全貌交给灯箱（`a[href]` 不带宽度参数）。

## 实测数据（`dist-m8-3b2`，479 页构建产物）

构建：`env -u PUBLIC_ALBUMS_STATE npx astro build --outDir dist-m8-3b2` → 479 页 / 3m46s / `Complete!`
测试：`M83B_DIR=dist-m8-3b2 npx playwright test -c playwright.m8-3b.config.ts e2e/pages-albums-detail-grid.spec.ts` → **7 passed（23.6s）**

列数与几何（详情页 `/albums/shenzhen_feng-huang-shan/`，12 张）：

```
[grid] light 375px  → 1 列 · gap 16px · 12 瓦片 · 瓦片 340×255 · 比例 1.33–1.33 · 行 12 · scroll 360/375
[grid] light 768px  → 2 列 · gap 20px · 12 瓦片 · 瓦片 355×266 · 比例 1.33–1.33 · 行 6  · scroll 753/768
[grid] light 1280px → 3 列 · gap 24px · 12 瓦片 · 瓦片 348×261 · 比例 1.33–1.33 · 行 4  · scroll 1265/1280
[grid] dark  … 三档数字与 light 完全一致（主题不改版式）
```

断点两侧（列数是断点决定的，不是碰巧）：

```
375 → 1 · 767 → 1 · 768 → 2 · 1023 → 2 · 1279 → 2 · 1280 → 3 · 1440 → 3
```

0 布局偏移（先把图床与 `/cdn-cgi/image` 全部卡住，量一遍；放行后再量一遍，逐瓦片比对 `offsetLeft/Top/Width/Height` 与页高）：

```
[cls] 375px : 图片 2/12 → 14/12 · 页高 4014 → 4014 · 12 瓦片偏移 0
[cls] 768px : 图片 2/12 → 14/12 · 页高 2403 → 2403 · 12 瓦片偏移 0
[cls] 1280px: 图片 2/12 → 14/12 · 页高 1857 → 1857 · 12 瓦片偏移 0
```

灯箱与地址分离（M8-3c 前不得回退）：

```
[lightbox] 主视图 2 条原图 · Esc 关闭 → 焦点归还
[split]    12 张：原图走图床 · 缩略图 width=640
```

`e2e/pages-albums.spec.ts` 中受本卡影响的用例（M2-8c 列数断言）：

```
[columns] 390px  → 墙 1 列（355px）      · 照片 1 列（355px）
[columns] 768px  → 墙 2 列（354.5px×2）  · 照片 2 列（354.5px×2）
[columns] 1440px → 墙 3 列（348px×3）    · 照片 3 列（348px×3）
→ 1 passed（6.0s）
```

## 证据截图

`docs/_reviews/M8-3b/screens/`（7 张，由 spec 的「证据截图」用例生成）：
`album-detail-{light,dark}-{375,768,1280}.png` + `album-detail-lightbox-1280.png`。

说明：截图用例把外网图片统一 route 成 1×1 PNG（离线可跑，证明的是版式骨架），所以瓦片里是纯色块而不是照片 —— 列数、等高、间距、圆角、灯箱打开态都是真实渲染。

真实照片的裁切效果这次**没能取证**：`~/.hermes/.../scratch/*.img` 那批样本是早期下载被截断的 JPEG（17KB ~ 900KB，`curl` 复测直接超时 `27331 / 638809 bytes`），Chromium 只解出顶部若干行，截图里看起来像「照片只占了瓦片顶部一条」—— 那是样本坏的，不是版式坏。同一页面 DOM 实测 `img` 盒子 = 瓦片盒子（348×261 vs 348×261）、`object-fit: cover`、`complete: true`，所以瓦片确实被图片铺满。结论：裁切是否得体需在图床可达的网络下重拍，本卡不下判断。

## 需要重刷的视觉基线

`/albums/` 与 `/albums/<id>/` 的页面级视觉基线（`e2e/__screenshots__/pages*/`，每平台 6 条 × 2 平台）在本次必然位移：

- 详情页：瀑布流 → 网格，整页高度与排列全变（1280 下 12 张照片 4 行等宽等高；原来列高错落）。
- 索引页：M8-3a 已改（1024→2 列、gap 20→24 / 375 gap 20→16），本卡未动它，但基线与当前代码同样不一致。

两处都留给 operator 批次重刷，本卡不跑 `--update-snapshots`。

## 没做（不在本卡边界）

- `e2e/pages-albums.spec.ts` 全量（含 `PUBLIC_ALBUMS_STATE=empty` 的真实构建 + axe + 图床形状）未跑，只跑了受影响的列数用例 —— 全量含两次真实构建，留给批次。
- `gates:all` / `type-check` / perf budget 未跑。
- 未 push。
