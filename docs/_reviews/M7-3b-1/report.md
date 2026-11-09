# M7-3b-1 · og-image 包 3:4 海报渲染变体（不接 UI）

- 卡：`t_d9cb5eca`（blog2 板）· assignee `blog-platform` · 2026-11-09
- 工作区：`/Users/chowcong/Documents/WebSiteCode/zcblog-v2`
- 结论：**完成** —— `@marxchou/dogeared-og-image` 用**同一套 Satori 模板**新增 3:4 分享海报变体（1200×1600），默认分支仍是 1200×630 且**逐字节未变**。未接 UI、未生成文章静态资产、未动 `src/**`、未改版本号、未 publish。
- 源文件：**3 个**（卡上硬上限）—— `packages/og-image/src/types.ts`、`packages/og-image/src/route.ts`、`packages/og-image/test/poster.test.mjs`（新增）。

## 1. 改了什么

### API（只加可选键，冻结面不动）

```ts
createOgImageRoute({ posts, site, theme, fonts?, fontCacheDir?, poster?: boolean })
```

- `poster?: boolean`（`types.ts`）：`true` → 3:4 竖版 1200×1600；缺省 / `false` → 现有 1200×630。
- **没有新增运行期导出**：变体走 options 开关而不是第二条 factory（包内断言 `Object.keys(pkg)` 仍是 `["createOgImageRoute"]`）。
- `index.ts` 未改（类型名未新增）；`package.json` / lockfile / tokens / `src/**` 全部未动。

### 版式：一套模板，两组参数

`route.ts` 里把抽取前的字面量收成 `OG_LAYOUT`（逐像素基线）与 `POSTER_LAYOUT`（3:4），渲染树仍然是**同一棵树**；海报只多两个节点（顶部元信息行、tags 胶囊行），OG 分支靠 `meta: null` / `tags: null` / `descBox: null` 保持原子树。

| 项 | 默认 OG | 海报 |
|---|---|---|
| 画布 | 1200×630 | 1200×1600（严格 3:4） |
| 边距 | 72 / 88 / 56 | 88 / 96 / 80 |
| 内容宽 | 1024 | 1002（1200−96×2−6 竖条） |
| 标题 | 80px / 1.35，CJK 14 字、拉丁 42 字截断 | 92px / 1.3，CJK 38 字、拉丁 76 字截断 |
| 分隔条 | 100×4，marginTop 28 | 120×4，marginTop 40 |
| 摘要 | 裸文本 24px / 1.55，100 字截断 | 色块面板 28px / 1.65，220 字截断，圆角 18、padding 40×48、**面板吃剩余高度（上限 640px，文字垂直居中）** |
| tags | —（不渲染） | `#tag` 胶囊行 22px，gap 12，落在底部轨道 |
| 顶部元信息 | — | 左站点名（强调色）+ 右 `YYYY-MM-DD` |
| 页脚 | url 左 / 站点名右，18px | 同结构 20px / paddingTop 28 |
| 装饰 | 圆 280 @ −60/−60；点 8 @ bottom48/right88 | 圆 360 @ −80/−80；点 8 @ bottom72/right96（镜射 `paddingBottom−8`，不压页脚文字） |

截断预算是按「最坏情况放得下」倒推的：标题 38 字 ≈ 4 行（≤478px）、摘要 220 字 ≈ 7 行（≤387px）；连同边距、分隔条、胶囊行、页脚，最坏占用约 1274px < 可用 1432px，余量由 `flexGrow` 吸收 —— 结构上不可能撞页脚。

## 2. 验收（实跑输出）

```bash
corepack pnpm --filter ./packages/og-image build   # BUILD_OK 5/5 必需产物 · 6 条目 · 29229 B
corepack pnpm --filter ./packages/og-image test    # 10 tests / pass 10 / fail 0 / skipped 0
node --test test/poster.test.mjs                   # 7 tests / pass 7 / fail 0 / skipped 0
```

（`pnpm` 不在本机 PATH，用 `corepack pnpm`；等价命令。）

- **默认 OG 未回退**：smoke 的 golden 断言 `49,574 B / 6b9d8762…` 仍然通过 —— 重构后 1200×630 的 PNG 与 M4-9 基线**逐字节相同**；`poster.test.mjs` 里再独立复算了一次同一 golden。
- **`poster: false` 与不传 `poster` 逐字节等价**（同一条渲染树）。
- **海报尺寸**：PNG IHDR 1200×1600，`width*4 === height*3` 严格成立。
- **像素结构（sharp 解码后扫行列，最坏情况 fixture）**：
  - 底部留白最后 30 行 **0 墨点**（页脚没有出画布）；
  - y>320 的右侧 30 列 **0 墨点**（文字没越右留白）；
  - 首个墨点在第 94 行（顶部元信息），最后墨点第 1517 行（页脚底边 1520 之内）；
  - 摘要与底部轨道之间有 ≥24 行的连续空档（说明没有被内容撑满/撞叠）；
  - tags 胶囊行命中 ≥24 行强调色横带，且落在 y=1427（> 0.6×1600）与页脚之上。
- **依赖方向**：`dist` 里只有 `route.js` import `satori` / `sharp`（构建期），入口与类型面未外溢；站点侧仍只在 `src/integrations/og-image-route.ts`（Astro 端点，构建期）引用本包，浏览器端未引入 satori/sharp。

### 出图（`docs/_reviews/M7-3b-1/`）

- `poster.png` —— 1200×1600，179,886 B。
- `og-1200x630.png` —— 同一 fixture 的默认 OG，67,910 B（对照用）。

### 性能与内存（fixture 预热后单次渲染，Node 22.23.1 / 同一进程；两次运行取区间）

| | 默认 OG | 海报 |
|---|---|---|
| 耗时 | 26–32 ms | 62–64 ms（≈2.4×，画布像素 2.54×） |
| RSS 增量 | +1.4–3.2 MB | +8.7–10.0 MB |
| 进程 RSS 基线 | 438–463 MB | 459–482 MB |
| PNG 字节 | 67,910 B（稳定） | 179,886 B（稳定） |

耗时与像素数基本线性（余差是本机抖动）；RSS 增量主要来自 satori 中间 SVG 与 sharp 的像素缓冲，均为一次性、进程内不累积（预热渲染 + 计量渲染后回到基线附近）。字体（16.8 MB 两个 OTF）由 factory 内 `fontPromise` 共享，只读一次。

## 3. 与默认 OG 的差异（除尺寸外）

1. 顶部多一行元信息（站点标识 + 日期），标题字号 80→92，标题/摘要截断预算放宽（14/42→38/76、100→220 字）。
2. 摘要从裸文本变成色块面板（7% 强调色 + 18px 圆角），面板吸收剩余高度并在内部垂直居中，避免海报下半张留大片空底。
3. 新增 tags 胶囊行，且 **tags + 页脚组成底部轨道**（`flexGrow` 空档移到摘要与 tags 之间）；这条改动对 OG 是空操作（OG 的 tags 为 null，空档仍在摘要与页脚之间）。
4. 装饰圆 280→360、装饰点按 `paddingBottom−8` 镜射。
5. 缓存头、404 行为、字体加载/缓存/失败语义、`assertOptions` 校验：**完全未变**。

## 4. 明确未做 / 已知边界

1. **`poster.test.mjs` 没接进 `pnpm test`**：本包 `scripts.test` 写死 `node --test test/smoke.test.mjs`，而本卡禁止改 `package.json`。所以海报用例要单独跑（`node --test test/poster.test.mjs`）；`pnpm --filter ./packages/og-image test` 仍只跑 smoke。**接线是下一张卡的活**（改 `scripts.test` 为 `node --test test/*.test.mjs` 即可，未做是因为越界）。
2. **不接 UI**：海报仍由 factory 产出 `APIRoute` 响应，未生成任何文章静态资产、未改 `src/**`；分享弹层/M7-3b-2 需要自己建一个 `poster: true` 的 factory 实例（与本实例可以共存，字体共享各自 factory 内）。
3. **视觉细调属 M7-3b-2**：当前版式是「结构先立起来」的版本（元素齐全、不裁字、不溢出）。LLM 视觉复核提过两点审美意见（摘要面板比文字高、摘要下沿到 tags 间距 174px 大于其余间距）——这两点是刻意的留白选择（海报底部由 tags+页脚轨道锚定），若 M7-3b-2 要对齐 `selection.md` §4.17 的编辑风稿（更大标题、引号装饰、作者行），应在那一卡按稿调参，本卡不动。
4. **未改版本号、未 publish**：`packages/og-image` 仍是 2.1.2，`private:false` 未变；npm 上仍是最新 2.1.2。发布归 M5 的 release 链，不在本卡。
5. **跨包影响为零**：`dist` 是构建产物（gitignore），未提交；`src/**`、tokens、站点设计系统、lockfile 均未触碰（`git status` 只有 3 个源文件 + 本目录）。

## 5. 复核入口（给 operator）

```bash
cd /Users/chowcong/Documents/WebSiteCode/zcblog-v2
corepack pnpm --filter ./packages/og-image build
corepack pnpm --filter ./packages/og-image test          # 默认 OG golden
cd packages/og-image && node --test test/poster.test.mjs  # 3:4 变体 + 产出图
# 产出：docs/_reviews/M7-3b-1/{poster.png,og-1200x630.png}
```

判据速记：`poster.png` 是 1200×1600 且 3:4；`og-1200x630.png` 与改动前同一 fixture 的图逐字节相同（golden `6b9d876220aa74da…`）。
