# M6-6a · 核心页 macOS 视觉基线（home / article / archives / 404）

- 卡片：`t_c6001ca0`（blog2 板），父卡 `t_b6795919`（M6-5b，串行排序用）
- 授权：PO 2026-11-09 最小垂直切片（D-0149）—— 只动 1 个测试文件 + macOS 基线图
- 改动源文件（2 个，正好卡面上限）：
  - `e2e/pages.visual.spec.ts`：`PAGES` 加一条 `{ name: "404", path: "/404/" }`（原文件无此 entry），同步头注释的页数说明
  - `e2e/__screenshots__/pages/`：新增 6 张 `404-*.png`
- 未触碰：任何 `src/**`、`scripts/**`、`package.json`、`base.css` / `components.css` / tokens、`playwright.config.ts`、`.github/workflows/ci.yml`、`e2e/__screenshots__/pages-linux/`

## 1. 页面清单与截图数

`pages.visual` 的矩阵是 3 视口（375 / 768 / 1280）× 2 主题（light / dark）。本卡范围内的 4 页：

| 页面 | 路径 | 卡片前已有 | 本卡新增 | 本卡合计 |
| --- | --- | --- | --- | --- |
| home | `/` | 6 | 0 | 6 |
| article | `/article/beszel-server-monitoring-guide/` | 6 | 0 | 6 |
| archives | `/archives/` | 6 | 0 | 6 |
| **404** | **`/404/`** | 0 | **6** | **6** |
| 合计 | | **18** | **6** | **24** |

24 = 4 页 × 2 主题 × 3 视口，与卡面一致；其中 18 张是既有基线，本卡只**新增** 404 的 6 张。
`e2e/__screenshots__/pages/` 目录由 36 张 → 42 张（另 3 页 `albums / culture / projects` 的 18 张原样未动）。

404 基线尺寸（`sips -g pixelWidth -g pixelHeight`）：

```
404-light-375.png   375 × 1896    404-dark-375.png   375 × 1896
404-light-768.png   768 × 1858    404-dark-768.png   768 × 1858
404-light-1280.png 1280 × 1673    404-dark-1280.png 1280 × 1673
```

## 2. 三条命令的结果

> 环境说明：本 worker shell 的 PATH 里没有裸 `pnpm`（corepack 是唯一入口，`package.json` 里 `packageManager: pnpm@12.10.1`）。三条命令一律以 `corepack pnpm …` 等价执行，语义与卡面命令相同。

### 2.1 构建固定内容预览（`pnpm run visual:build:pages`）

```
▶ 视觉基线构建：N 篇固定文章 → dist/
[build] 128 page(s) built in 11.18s
[build] Complete!
real 14.7s
```

产物含 `dist/404.html`（Astro 把 `src/pages/404.astro` 静态输出成 `404.html`，不是 `404/index.html`）。

### 2.2 `/404/` 真的打开的是路由，不是文件路径（200 断言）

`astro preview`（与本 card 的 `webServer` 同一条命令）在空闲端口上实测：

```
GET /404/      -> 200      ← spec 用的就是这个
GET /404        -> 404      ← 无斜杠不命中（trailingSlash: "always"）
GET /404.html   -> 200      ← 文件直取，spec 没有用它
GET /nope/      -> 404
```

`openPage()` 里的 `expect(response?.status(), "GET /404/").toBe(200)` 在每次运行中都会重新校验这一条，不是一次性探测。

### 2.3 第一遍：带 `--update-snapshots=all` 生成

```
corepack pnpm exec playwright test e2e/pages.visual.spec.ts \
  -g 'home|article|archives|404' --update-snapshots=all --reporter=line
→ 24 passed (59.0s)
```

其中只有 6 条打印了 `A snapshot doesn't exist … writing actual.`（`404-*` 六张），说明既有 18 张没有被"写新内容顶掉"，而是逐字节重写后与原文件相同。

### 2.4 第二遍：不带 update 复核

```
corepack pnpm exec playwright test e2e/pages.visual.spec.ts \
  -g 'home|article|archives|404' --reporter=line
→ 24 passed (49.9s)
```

首尾两遍均 24/24 通过。

## 3. 基线差异归因（先查后刷，没有强刷）

卡面要求：404 之外的页面若出现基线变化，先 block 报告，不要强刷。执行顺序按这个要求做：

1. **先**跑一遍不带 update 的 `-g 'home|article|archives'`（只跑既有 3 页 18 张）：
   `18 passed (38.2s)` —— 当前 `dist` 与既有 macOS 基线逐像素一致。
2. **再**跑带 `--update-snapshots=all` 的 4 页 24 张。
3. 跑完 `git status` 只出现 6 个 `??`（未跟踪）PNG，18 张既有 PNG 无 `M` 记录 → 既有没有被改写。

即：macOS 侧本次**没有任何非预期漂移**；本卡的基线变化全部等于"新增 404 的 6 张"。

## 4. 画面抽查

对 `404-light-1280.png` 与 `404-dark-375.png` 做了视觉判读：

- 1280 light：页头（头像 / 站名 / 搜索 / 菜单 / 语言 / 主题）、`HTTP 404 · 信号丢失` 徽标、超大 `404` 数字、标题"页面未找到"、两枚 CTA、终端诊断块、`迷途寻路 · 最近航标` 三卡、断链上报块、页脚齐全，无空白区、无裁切。
- 375 dark：底色为深炭黑（暗色主题确实生效），桌面端 3 列航标在移动端堆成单列，CTA 满宽纵向；终端块按设计是浅色（"终端窗口"拟物），不是漏刷暗色。
- 结构不变式另有断言兜底：每张都过 `--color-bg-canvas` 解析、dark 底色非透明、`h1` 可见、`scrollWidth - clientWidth ≤ 1px`。

## 5. 遗留（需 operator / 后续卡处理，本卡按边界未动）

1. **Linux 基线缺 404 的 6 张**：`e2e/__screenshots__/pages-linux/` 仍是 36 张。卡面明令"不改 Linux 基线、不跑 Linux 容器"，所以 Linux 侧 404 基线要在 `mcr.microsoft.com/playwright:v1.63.0-noble` 里补（M6-6c 或 operator 跑）。
2. **CI visual job 会因条数硬断言变红**（这条必须先处理再 push，否则 main 的门禁直接失败）：
   - `.github/workflows/ci.yml` 第 178 / 190 行两个 step 用 `grep -qE "^ +36 passed"` 硬卡条数，第 125 行 job 名写着 `pages 36`，第 177 行注释写着"6 页 × 3 视口 × 2 主题 = 36"。
   - 本次把 `PAGES` 从 6 条加到 7 条后，full suite 变成 **42** 条，这两处断言会失败。需要把 36 改为 42（3 处文案 + 2 处 grep），并在同一批补上 Linux 基线。
   - 该文件不在本卡授权的 2 个源文件内，故只报告不改。
3. `albums / culture / projects` 的 macOS 基线仍取 M5-11 的旧版（本轮没有重生成，也没有变化），按卡面留给 M6-6c。
4. 本卡**未 push**：commit 在本地，push 前已核对只含本卡文件，等 operator 复核后由 operator push。

## 6. 复现

```bash
corepack pnpm run visual:build:pages
corepack pnpm exec playwright test e2e/pages.visual.spec.ts -g '404' --update-snapshots=all --reporter=line
corepack pnpm exec playwright test e2e/pages.visual.spec.ts -g 'home|article|archives|404' --reporter=line
```
