# M6-6b · 404 Linux 基线 + CI 42 条

- 卡片：`t_e1be0b1c`（blog2 板），父卡 `t_c6001ca0`（M6-6a）
- 授权：PO 2026-11-09 最小垂直切片；源文件边界 3 处（Linux 404 基线 6 张 / `ci.yml` 条数 / 本报告）
- 改动：
  - `e2e/__screenshots__/pages-linux/`：新增 6 张 `404-{light,dark}-{375,768,1280}.png`（36 → 42 张）
  - `.github/workflows/ci.yml`：visual job 的页面级条数 36 → 42（job 名 / 注释 / 2 处 `grep` / 1 处 error 文案），其他 CI 逻辑未动
- 未触碰：`e2e/pages.visual.spec.ts`、`src/**`、`scripts/**`、`package.json`、`pnpm-lock.yaml`、`playwright.config.ts`、tokens、`e2e/__screenshots__/pages{,-linux}` 里 404 之外的 36 张
- 未 push（按卡面，等 operator 复核）

## 1. 环境与同步

| 项 | 值 |
| --- | --- |
| 宿主 | macOS 15.7.7 / Docker 29.9.2 |
| 镜像 | `mcr.microsoft.com/playwright:v1.63.0-noble`（与 `@playwright/test` 1.63.0 钉版一致，与 CI `container.image` 同一个） |
| 构建目录 | `/tmp/m6-color-linux`（**非** macOS 截图目录），由当前仓库 rsync 同步：`rsync -a --delete --exclude .git/ --exclude node_modules/ --exclude .astro/ --exclude dist/ --exclude test-results/ --exclude playwright-report/ ./ /tmp/m6-color-linux/` |
| 依赖 | 目录内 `node_modules` 为容器内已装的 linux-x64 依赖（`@esbuild+linux-x64`、`@rollup+rollup-linux-x64-gnu`、`@img+sharp-linux-x64`），`pnpm-lock.yaml` 与仓库 `sha256 e04bd7bd…` 完全一致 → 不需要重装 |
| 源 commit | `4fee02c` + 本卡工作区改动 |

## 2. 生成 Linux 404 基线（带 update，只跑 404）

```bash
cd /tmp/m6-color-linux
rm -f .astro/preview.json
docker run --rm --shm-size=2g -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble bash -lc \
  'corepack pnpm exec astro build && corepack pnpm run visual:build:pages && corepack pnpm exec playwright test e2e/pages.visual.spec.ts -g 404 --update-snapshots=all --reporter=line'
```

输出（尾部原文）：

```
[1/6] … › viewport 375 › light › 404-light-375
A snapshot doesn't exist at /work/e2e/__screenshots__/pages-linux/404-light-375.png, writing actual.
...
[6/6] … › viewport 1280 › dark › 404-dark-1280
A snapshot doesn't exist at /work/e2e/__screenshots__/pages-linux/404-dark-1280.png, writing actual.

  6 passed (18.1s)
```

只写 6 个不存在的文件，没有任何 `Writing actual` 落到 404 之外的图片上。

## 3. 全量 pages.visual 复核（不带 update）

### 3.1 第一遍（`--reporter=line`）

```
Running 42 tests using 1 worker

[1/42] … viewport 375 › light › home-light-375
...
[42/42] … viewport 1280 › dark › 404-dark-1280
  42 passed (1.5m)
```

### 3.2 第二遍（`--reporter=list`，与 CI `visual` job 的 reporter 完全一致）

CI 的硬断言是 `grep -qE "^ +42 passed"`，所以这里用 CI 的真实格式再跑一遍并直接套用该 grep：

```
  ✓  42 [chromium-linux-pages] › e2e/pages.visual.spec.ts:192:25 › page-level visual baseline › viewport 1280 › dark › 404-dark-1280 (1.6s)

  42 passed (1.5m)
```

```
$ grep -qE "^ +42 passed" /tmp/m6-color-linux-pages42.log && echo MATCH
MATCH
$ grep -cE "^ +42 passed" /tmp/m6-color-linux-pages42.log
1
```

两遍都是 **42 passed**、`--retries=0`、无 `--update-snapshots`。既有 36 张零漂移：两次跑完 `/tmp/m6-color-linux/e2e/__screenshots__/pages-linux/404-*.png` 的 mtime 仍是生成时刻（02:43:0x），文件未被复核运行重写；6 张 PNG 与仓库内副本 `sha256` 逐一相同。Linux 全量未出现任何 404 之外的差异。

## 4. 基线尺寸（Linux vs macOS）

`sips -g pixelWidth -g pixelHeight`（Linux 由上面镜像生成，macOS 取自 M6-6a）：

| 文件 | Linux | macOS |
| --- | --- | --- |
| `404-light-375.png` / `404-dark-375.png` | 375 × 1897 | 375 × 1896 |
| `404-light-768.png` / `404-dark-768.png` | 768 × 1860 | 768 × 1858 |
| `404-light-1280.png` / `404-dark-1280.png` | 1280 × 1675 | 1280 × 1673 |

1–2 px 的高度差来自两平台字体光标度不同，两套基线互不比较（`playwright.config.ts` 按平台选目录，Linux `maxDiffPixels: 0`）。

视觉抽查：`vision` 判读 `pages-linux/404-light-1280.png` → 页头（搜索/菜单/语言/主题）、`HTTP 404 · 信号丢失` 胶囊、404 数字、标题「页面未找到」、双 CTA、终端排障块、三张 ROUTE 航标卡、断链遥测上报、页脚统计与备案行全部齐整，无空白、无裁切、不是首页/文章页误截。

## 5. CI 改动与行号

只动 visual job，`pages 36` → `pages 42`：

| 内容 | 旧行 | 新行 |
| --- | --- | --- |
| job 段头注释 `页面级 36 张` | 114 | 114（→ 42 张） |
| `name: visual (atoms 72 + pages 36 · linux baselines)` | 125 | 125（→ pages 42） |
| 条数注释 `6 页 × 3 视口 × 2 主题 = 36` | 177 | 177（→ 7 页 … = 42，拆成两行） |
| `name: Visual regression · pages 36 (pass 1/2)` | 178 | 179 |
| `grep -qE "^ +36 passed"`（第 1 遍） | 184 | 185 |
| error 文案 `不是 36（6 页 × …）` | 185 | 186（→ 不是 42（7 页 × …）） |
| `name: Visual regression · pages 36 (pass 2/2 · stability)` | 190 | 191 |
| `grep -qE "^ +36 passed"`（第 2 遍） | 196 | 197 |

行 179 之后整体下移 1 行，因为条数注释由一行拆成两行。

未动的相邻 36：docs a11y 的 `docs 12 slug × 3 组 = 36`（155 行）与 `grep "^ +48 passed"`（166/167 行）属于另一条 suite，保持原样。

### 验收 grep

```
$ grep -RIn "36 passed\|pages 36\|6 页 × 3" .github/workflows/ci.yml
（无输出，exit 1）

$ grep -n "42" .github/workflows/ci.yml
114:    # ---- 视觉门禁：/design/atoms 72 张 + 页面级 42 张像素基线（Linux）----
125:        name: visual (atoms 72 + pages 42 · linux baselines)
177:            # M5-11 / V-0 建立 6 页；M6-6a 加 /404/ → 7 页 × 3 视口 × 2 主题 = 42。
179:            - name: Visual regression · pages 42 (pass 1/2)
185:                  if ! grep -qE "^ +42 passed" "$RUNNER_TEMP/pages-visual-1.log"; then
186:                    echo "::error::页面级视觉基线用例数不是 42（7 页 × 2 主题 × 3 视口）"
191:            - name: Visual regression · pages 42 (pass 2/2 · stability)
197:                  if ! grep -qE "^ +42 passed" "$RUNNER_TEMP/pages-visual-2.log"; then

$ corepack pnpm exec prettier --check .github/workflows/ci.yml
All matched files use Prettier code style!
```

## 6. 结论与遗留

- Linux 侧 404 基线已由官方镜像补齐（6 张），全量 `pages.visual` 在 Linux 两遍均 **42 passed**，无 404 之外的漂移；CI 的 `grep "^ +42 passed"` 已用真实 `--reporter=list` 输出验证命中。本卡三处授权改动全部收口，可进入 main 的 CI。
- 遗留（**不在本卡授权范围**，未改）：文档里仍写「6 页 / 36」——`README.md:303`（`pnpm test:visual:pages` 说明）、`README.md:312/314`（页面级矩阵与页面清单）、`playwright.config.ts:21`（`3 viewports = 36 page-level baselines per platform`）、`docs/DESIGN.md:2284`（E4 行）。这些是描述性文字，不影响门禁执行，建议随 M6-6c/文档卡一并更新。
- 未 push：等 operator 复核后执行。
