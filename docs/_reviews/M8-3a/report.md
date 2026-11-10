# M8-3a · 相册索引栅格 3 列 / 移动 1 列（验收报告）

卡：`t_4ff99c95`（blog-fe）· 上游 M8-0 `t_8b1853ff`（`28-m8-card-split.md` §5.3）
范围：**只动索引页**（`/albums/`）。详情页网格、`AlbumGrid`、fancybox 一行未改（M8-3b / M8-3c 接手）。

## 1. 改了什么（3 个源文件）

| 文件 | 改动 |
|---|---|
| `src/styles/pages/albums.css` | 相册墙列数契约改为 `<768 → 1 / 768 → 2 / ≥1280 → 3`（原 640 → 2、1024 → 3）；`grid-auto-rows: 1fr` + `align-items: stretch` 锁卡片等高；gap 分档 16 / 20 / 24（24 = DESIGN 基线「3 列画廊 24px gap」） |
| `src/components/Gallery/AlbumCard.astro` | 卡片 `block-size: 100%` + 说明区 `flex: 1`（meta 压到卡片底部）；封面 `aspect-ratio: 4/3` 加注释锁；标题 `line-clamp: 2`、描述 `line-clamp: 2`；元信息 `nowrap` 锁一行、日期不让位、地点走 ellipsis（新增 `.album-card__place-text` 包一层，因为 `text-overflow` 必须落在自己的块上）；张数徽标 `nowrap` + `max-inline-size` |
| `src/components/Gallery/GalleryFilter.astro` | 筛选条 `min-inline-size: 0` / `max-inline-size: 100%`；按钮 `flex: 0 1 auto` + `max-inline-size: 100%` + `overflow-wrap: anywhere`（一个超长地名不再变成一条横向溢出） |

0 行 JS 布局计算；`AlbumGrid` / fancybox / 详情页未触碰。3 文件合计 +66 / −9 行。

## 2. 断点实测（这次真的量了，不是照 CSS 抄）

`/albums/` 13 本相册，内容框 1092px：

| 视口 | 列数（前后） | 轨道 | gap | 卡片高 | 封面比例 | scrollWidth/clientWidth |
|---|---|---|---|---|---|---|
| 375 | 1 → 1 | 340px | 16（原 20） | 315 | 1.33 | 360 / 375 |
| 768 | 2 → 2 | 354.5 ×2 | 20 | 326 | 1.33 | 753 / 768 |
| **1023** | **3 → 2** | 470 ×2 | 20 | 413 | 1.33 | — |
| **1100** | **3 → 2** | 508.5 ×2 | 20 | 441 | 1.33 | — |
| **1279** | **3 → 2** | 536 ×2 | 20 | 462 | 1.33 | — |
| 1280 | 3 → 3 | 348 ×3 | 24 | 321 | 1.33 | 1265 / 1280 |

**唯一的行为变化**：1024–1279 这一档从 3 列（每格 348px）回到 2 列。原来 1024 起就分 3 列，1024 宽屏幕上封面只有 240×180，卡片退化成邮票；1280 起 3 列每格 348px 才是本卡要的读图尺寸。

## 3. 卡片几何锁定

- **封面 4:3**：三档视口实测 `w/h = 1.33`（1.28 < x < 1.38 断言内）。
- **等高**：`grid-auto-rows: 1fr` 后同一面墙 13 张卡片高度差 ≤ 1px（315/326/321 各自全等）。
- **长文本压测**（spec 内现场改 DOM，不改数据）：相册名换成 40 字中文、地名换成 30 字地址、描述三倍长 →
  标题盒 45px = 恰好 2 行、元信息 22px = 恰好 1 行、`scrollWidth == clientWidth`（不横向溢出）；
  卡片 315 → 338（只长 1 行）且 13 张**仍然全等**。截断是真在工作，不是数据碰巧短。

## 4. 筛选不回退

每个地点按钮点下去，可见卡片数 = 全量卡片 `data-tags` 命中数（期望值由 DOM 现算，不写死）：

| 地点 | 命中 / 13 | 375 | 768 | 1280 |
|---|---|---|---|---|
| 深圳 | 9 | ✓ | ✓ | ✓ |
| 广州 / 惠州 / 武汉 / 清远 | 各 1 | ✓ | ✓ | ✓ |

筛完列数不变（列数只由 CSS 断点决定）、0 越界元素；点「全部」（本页唯一的重置入口，不新增控件）13 张全回，`aria-pressed` 正确。

## 5. 空态

空数据真实构建 `PUBLIC_ALBUMS_STATE=empty astro build --outDir dist-m8-3a-empty` → `data-albums-status=empty`：
`[data-albums-empty]` 可见、0 张卡片、无 `.albums-wall`、无筛选条、`h1` 保留、0 越界。
常规构建上另有守卫用例：空态不出现、`status=ok`、首卡可见。

## 6. 验证命令与结果

```bash
# 1) targeted build（常规）
env -u PUBLIC_ALBUMS_STATE ./node_modules/.bin/astro build --outDir dist-m8-3a   # 479 页 · 1m35s · ok
# 2) 本卡 spec（8 passed / 1 skipped，含 6 张证据截图）
ALBUMS_BUILD=full ./node_modules/.bin/playwright test \
  --config=playwright.m8-3a.config.ts e2e/pages-albums-grid.spec.ts
# 3) 空态构建 + 空态用例（1 passed / 1 skipped）
PUBLIC_ALBUMS_STATE=empty ./node_modules/.bin/astro build --outDir dist-m8-3a-empty    # 479 页 · 54s · empty
M83A_DIR=dist-m8-3a-empty M83A_PORT=47324 ALBUMS_BUILD=empty ./node_modules/.bin/playwright test \
  --config=playwright.m8-3a.config.ts e2e/pages-albums-grid.spec.ts -g "空态"
```

新增 `e2e/pages-albums-grid.spec.ts`（375/768/1280 × light/dark 列数 + 比例 + 等高 + 0 溢出 + 筛选计数 + 截断压测 + 空态 + 截图）；
`playwright.m8-3a.config.ts` 是临时 runner（静态产物 + `python3 -m http.server`，端口 47323/47324），与 M7-4b/5a/5b 同做法，**不提交**（沿用仓库现状：`playwright.m7-*.config.ts` 均为未跟踪文件）。

证据截图：`docs/_reviews/M8-3a/screens/albums-{light,dark}-{375,768,1280}.png` + `albums-empty-light-1280.png`（7 张）。

## 7. 给 operator 的交接（本卡故意不做）

1. **`/albums/` 6 张视觉基线必须重刷**（`pages.visual` 的 albums × 3 视口 375/768/1280 × 2 主题；每平台 6 条，两平台 12 个文件）。原因：1280 档卡片变窄 2px → gap 20→24、375 档 gap 20→16，像素必变。**本卡没跑全量 Linux 基线**（D-0149 分道：worker 只做 targeted）。
2. `e2e/pages-albums.spec.ts`（M2-8c 全量：灯箱 / axe / 图床地址形状 / 390·768·1440 列数）未在本卡运行；其中「390 → 1、768 → 2、1440 → 3」在新断点下依然成立，但**整份 spec 含一次真实 build，留给批次跑**。
3. `gates:all`、`type-check`、perf budget 未跑（批次收口）。
4. 未合并、未推送之外的动作：本次提交在 `main`（与 M8-1a/b/c 同做法），未 push。
