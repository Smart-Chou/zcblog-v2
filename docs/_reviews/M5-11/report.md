# M5-11 · V-0 页面级 screenshot 基线

- 卡：`t_eadb50e3`（M5-9 组合 A 第二卡 · V-0）
- 分支：`main`
- 日期：2026-11-07
- 前置：M5-10（`3b3373e`）

## 1. 做了什么

把「视觉改动必须过 pixel baseline」从**只保护 `/design/atoms`** 扩到**6 个真实页面**：

| 页面 | 说明 |
| --- | --- |
| `/` | 首页（hero / 文章卡 / 光影 / 随笔 / 侧栏 / 页脚） |
| `/article/beszel-server-monitoring-guide/` | 长文代表页（h2/h3、代码块、表格、提示块、目录、评论位） |
| `/archives/` | 归档列表 + 热力图 |
| `/albums/` | 相册网格 |
| `/culture/` | 文化页 |
| `/projects/` | 项目页 |

**6 页 × 2 主题 × 3 视口（375 / 768 / 1280）= 36 shot/平台**，共 72 张基线：

- macOS：`e2e/__screenshots__/pages/`（阈值 `maxDiffPixelRatio 0.001`）
- Linux：`e2e/__screenshots__/pages-linux/`（阈值 `maxDiffPixels 0`，在 CI 同一个镜像里生成）

**没有改任何页面视觉**：`git diff -- src/` 只有 `src/content.config.ts` 的一处可覆盖内容目录（见 §1.1），组件、样式、文案、DOM 结构零改动。

### 1.1 三个让基线可复现的设计决定

1. **固定内容（fixture）**。真实文章来自私有内容仓，加一篇文章就会让首页/归档/热门列表整体位移 —— 那种红与主题无关。所以页面级基线跑在 `e2e/fixtures/pages-visual/content/article/` 的 **6 篇冻结文章**上（1 篇长文副本 + 5 篇短文），由新加的 `CONTENT_ARTICLE_BASE` 覆盖 `src/content.config.ts` 的 `glob.base` 构建。常规构建/部署不设该变量，行为不变（§3.2 有回归证据）。
   - fixture 每篇都必须有 `upDate`：否则 `get-posts-with-meta` 回退到 `new Date()`，构建时间会进像素。`scripts/visual/build-pages-baseline.mjs` 在构建前**硬校验**这一点，缺一个就退 1。
   - `ARTICLE_REPO_PATH` 指向不存在的路径：同一份源码在开发机（有 `~/Documents/WebSiteCode/zcblog-articles`）和 CI（没有）上渲染出的日期才会一致。
2. **第三方流量一律打桩/拦断**（`stubThirdParty()`）。离开 localhost 的请求：图片 → 1×1 SVG；其余 → abort。被拦的是 R2/CF 图片缩放与 `/api/random` 随机封面、友链头像、umami（partytown）、Waline API、hitokoto、`cdn.bootcdn.net` 的 mermaid。远端照片和 CDN 脚本不属于本主题的契约，却是「同一份代码、不同像素」的头号来源。
3. **自跑脚本冻结**。首页 motto 是 JS 打字机（`TypewriterText`），`animations: "disabled"` 停不住它 —— spec 直接 `__typewriterInstance.destroy()` 并把文案还原成构建期首句；`loading="lazy"` 的图在截图前翻成 eager 并等全部 settle；滚动一遍再回顶（触发可见性初始化、复位 nav 滚动态）。

**另外**：截图高度封顶 `MAX_SHOT_HEIGHT = 3600`（≈4 屏）。长文页整页 ~19.3k px，第 4 屏之后是同一段正文堆叠，不封顶会让基线集体膨胀到 ~50MB 且 PR 无法看 diff。封顶后两平台共 **19.5MB**（macOS 10.0 / Linux 9.5）。

### 1.2 接线

- `playwright.config.ts`：从「每平台一个 project」扩成「每平台两个 project」（atoms / pages），用 `testMatch` / `testIgnore` 各认一个 spec；快照目录与阈值按 platform×suite 取值，仍是**一次只实例化本平台**，不跨平台比对。
- `e2e/pages.visual.spec.ts`：36 条用例；每条先断言 `data-theme`、`html.dark` 生效、`h1` 可见、`--color-bg-canvas` 已解析、文档无横向溢出，再截图。
- `scripts/visual/build-pages-baseline.mjs` + `pnpm visual:build:pages`：用固定内容构建视觉用 `dist/`。
- `.github/workflows/ci.yml` 的 `visual` job：构建改为该脚本（**不**再 checkout 私有文章仓），新增 pages 两遍 pass，且**核对用例数 36**（skip 也算绿的老坑，沿用 M5-7a 的 `grep "^ +36 passed"` 手法）。
- README「视觉基线（截图回归）」+ `docs/DESIGN.md` §8.4 E4：`--update-snapshots` 两平台流程、固定内容的理由、新增页面的规矩。

## 2. 证据

### 2.1 两平台各 36 张，重复跑 2 次 0 漂移

macOS（`pnpm visual:build:pages` 之后）：

```text
$ pnpm exec playwright test e2e/pages.visual.spec.ts --update-snapshots   # 生成
36 passed (1.3m)

$ pnpm exec playwright test e2e/pages.visual.spec.ts                      # pass 1
36 passed (1.2m)
$ pnpm exec playwright test e2e/pages.visual.spec.ts                      # pass 2
36 passed (1.0m)
```

**逐字节复现**：先把第一轮生成的 34 张（生成时 375 视口两条用例因断言失败尚未落盘）取 sha256，再整轮 `--update-snapshots` 重生，比对结果：

```text
A=34 B=36 same=34 differing=0
only in B: ['article-dark-375.png', 'article-light-375.png']
```

Linux（`mcr.microsoft.com/playwright:v1.63.0-noble`，容器内 cp 一份干净仓库跑，宿主 `node_modules` 未被打脏）：

```text
$ docker run --rm --shm-size=2g -v <clean-copy>:/work -w /work \
    -e PLAYWRIGHT_BASELINE_PLATFORM=linux mcr.microsoft.com/playwright:v1.63.0-noble bash -lc \
    'corepack pnpm i --frozen-lockfile && node scripts/visual/build-pages-baseline.mjs && \
     corepack pnpm exec playwright test e2e/pages.visual.spec.ts --update-snapshots'
36 passed (1.7m)

# 之后同镜像内连跑两遍（阈值 maxDiffPixels: 0，不是「差不多」）
36 passed (1.2m)     # pass 1
36 passed (1.2m)     # pass 2
```

### 2.2 既有门禁未被破坏（配置改了 project 结构，必须回归）

```text
$ pnpm exec playwright test e2e/design-atoms.visual.spec.ts
72 passed (1.2m)          # atoms 基线仍 72/72（fixture dist 下）

$ pnpm exec playwright test e2e/design-atom-docs.a11y.spec.ts e2e/design-atoms.a11y.spec.ts
48 passed (34.9s)         # docs 36 + atoms 12
```

### 2.3 常规构建路径不受影响

```text
$ pnpm exec astro build            # 不设 CONTENT_ARTICLE_BASE
474 page(s) built
$ ls dist/article | wc -l          # 仍是真实内容仓的 85 篇
85
```

（`git diff -- src/` 仅 `src/content.config.ts` 一处 `glob.base` 可覆盖；默认值 `./src/content/article`，未设变量时与原实现等价。）

### 2.4 CI 环境等价性（干净 clone 重放）

CI 的 `visual` job 是「干净 checkout + 该 job 内的构建」，与生成基线时的工作树（带着若干被 gitignore 的资源目录）不完全相同。为此把已提交的树克隆到 `/tmp`（只含 tracked 文件，等价 CI checkout，且**没有** `src/content/article`），在克隆里跑同一套流程：

```text
$ git clone --depth 1 file://$PWD /tmp/m5-11-ci-sim && cd /tmp/m5-11-ci-sim
$ node scripts/visual/build-pages-baseline.mjs
128 page(s) built · 6 篇文章
$ pnpm exec playwright test e2e/pages.visual.spec.ts
36 passed (1.3m)
```

两棵树构建出的 6 个页面 HTML 长度逐字节相同、差异只出现在 asset hash 字符串上（`/assets/*.{hash}.css|js`、`?v=<sprite hash>`），因此像素不受影响——CI 上跑的是与本地生成基线时同一份渲染。

### 2.5 CI 实测（run 42382418907 · `main` @ `8ae4629`）

```text
visual (atoms 72 + pages 36 · linux baselines)                         success  3m05s
  › Visual regression · atoms 72                                     72 passed
  › Visual regression · pages 36 (pass 1/2)                          36 passed
  › Visual regression · pages 36 (pass 2/2 · stability)              36 passed (58.2s)
```

CI 的 pages 两遍跑的是**干净 checkout + job 内 `build-pages-baseline.mjs` 构建**（不 checkout 私有文章仓），阈值 `maxDiffPixels: 0`——即 Linux 基线在非本地工作树上也是 0 像素可复现，这是验收第 1、2 条的平台侧证据。同一次 run 的 `contract` job 红了，原因是 DESIGN 快照指针未同步，不涉及基线本身，见 §7.1。

## 3. 发现（未修，按卡边界「不改页面视觉」）

**375px 下文章页横向溢出 16px**：宽表格（`thead/tr/th` 实测 `right=426` vs `clientWidth=375`）把文档撑出画布；390px（其它所有 spec 用的宽度）不触发，所以此前没人发现。按卡边界未动样式，spec 里以 `KNOWN_OVERFLOW = { "article@375": 16 }` 记录当前值 —— 其它页/视口仍要求 ≤1px，因此新增溢出照样会红。修掉表格溢出后把该条改成 0 并重生成两平台基线即可。

## 4. 维护规矩（写进 README，这里是摘要）

1. 改视觉 → `pnpm visual:build:pages` → 两平台各自 `--update-snapshots` → **人工看 diff** → 两平台基线一起提交（只更新一套 = 另一平台红在错误的地方）。
2. CI 永不自动更新基线。
3. 新增/删除基线页面：改 spec 的 `PAGES`，两平台全部重生。
4. 刷新 `src/data/{talks,friends-articles,popular,site-stats}.json` 这类**提交进仓的固定数据**同样会改像素（「17 小时前」「14天前」是数据里的字符串，不是构建时算的），刷新数据后要重生基线；这是**数据变了**，不是代码 flaky。

## 5. 余额与风险

- 仓库体积 +19.5MB（两平台各 36 张）。每次重生会整批重写 PNG，git 历史随之增长 —— 这是 pixel baseline 的固有代价，已在 README 说明。若将来嫌大，优先下调 `MAX_SHOT_HEIGHT`（当前 3600），不要把视口或主题数量砍掉。
- 页面级基线的保护范围是**固定内容下的模板/排版/主题**；真实内容引起的移位（新文章、新热门）不会触发它 —— 那类问题由 DOM 级 e2e（`pages-*.spec.ts`、`export-audit.spec.ts`）负责。
- 未接 `--update-snapshots` 的自动 PR 评论（比对图需人工下载 `visual-diff` artifact）。

## 6. 门禁

```text
$ pnpm exec prettier --check e2e/pages.visual.spec.ts playwright.config.ts \
    src/content.config.ts scripts/visual/build-pages-baseline.mjs package.json README.md \
    .github/workflows/ci.yml docs/DESIGN.md
All matched files use Prettier code style!

$ pnpm type-check            # tsc --noEmit
（0 error）
```

本机 shell 里没有 pnpm（只有 corepack），复验时直接跑 `package.json` 里 `gates:all` 的同一条命令链（10 个 `node scripts/gates/*.mjs`，与 CI 完全同源）：

```text
verify-atoms               18/18 PASS
verify-atom-docs           PASS            （12 份文档 D1–D7）
verify-component-inventory PASS            atoms=12 ui=23 page-organisms=11 layout=1 dup=0 total=47
verify-doc-drift           PASS            mismatch=0 · 文档=12 · 对比度行=49
check-tokens               10/10 PASS
verify-surface-tokens      PASS            new_hits=0 · baseline=41/84
verify-entities            9/9 PASS · 0 WARN
verify-package-boundary    PASS            packages=3 violations=0
verify-overlay             PASS            classified=1244 unclassified=0
verify-icon-sprite         PASS
```

npm 只读窗口内：本卡无任何 registry 写操作（只读 `node_modules`、未新增依赖）。

## 7. 收口

### 7.1 `contract` job 初红：DESIGN 快照指针漏同步（已修）

`8ae4629` 的 CI 里 `contract (tokens · surfaces · entities)` **失败**，只有一条：

```text
FAIL  G-S6  designDoc 指针  —  docs/DESIGN.md · 2624 行 · md5 250f223dc23a…
        · 快照 md5 不符：清单 d681e87164ff6cdc9b9905167b1b8448 / 实际 250f223dc23ae4e07371ec694a94f92b
        · 快照行数不符：清单 2622 / 实际 2624
```

根因：本轮改了 `docs/DESIGN.md`（E4 行 + §8.4 页面级基线说明，+2 行），但没同步 `docs/DESIGN.vendor.json` 的 `md5/bytes/lines`。**G-S6 校验的是字节级指针（md5 + 行数），不是 §3.4 键集合**，所以「只写文档、不动 token」同样会红；`resyncWhen` 那句「只改数值不需要重同步」容易被误读成「改文档不用管清单」，实际正确口径是：**任何一次 `docs/DESIGN.md` 的写操作都要更新 `DESIGN.vendor.json`**。

修法（本提交）：更新清单 `md5/bytes/lines` + `syncedBy/syncedAt/previousMd5` 记账，并把真源 `blog2.0/docs/DESIGN.md` 同步为同一份字节；`node scripts/gates/check-tokens.mjs` 回到 10/10。

### 7.2 顺带补齐 M5-10 的 overlay 清单（已修）

M5-10 新增的 `public/icons.svg` 没有登记进 `site.manifest.json`：CI 的 `gates` job 看不到它（该文件构建期生成、干净 checkout 时不存在），但**本地工作树里有**，于是 `verify-overlay` 报 `classified=1243 unclassified=1 violations=1`。已补一条 D-0144 变更记录 + T 类规则 `public/icons.svg`，`verify-overlay` 回到 `unclassified=0`。

教训：新增构建期生成的受管文件后，必须在**同一张卡**里登记 `site.manifest.json`，否则只在有产物的工作树上红，CI 绿——这类「本地红/CI 绿」的漂移比反过来更难发现。

### 7.3 macOS 复验与假红陷阱

清掉残留 preview server 后，本机连跑两遍：

```text
$ ./node_modules/.bin/playwright test e2e/pages.visual.spec.ts     # pass 1
36 passed (1.6m)
$ ./node_modules/.bin/playwright test e2e/pages.visual.spec.ts     # pass 2
36 passed (1.4m)
```

复验过程中踩到一个**会伪装成 flaky 的假红**，已写进 README：`playwright.config.ts` 的 `reuseExistingServer: !CI` 会复用 4321 端口上残留的 `astro preview`（上一轮被中断、或正在 `--force` 重启的时间窗），表现为 `net::ERR_CONNECTION_REFUSED` 或比对到旧 `dist`，而不是像素 diff。跑页面级基线前先 `pkill -f "astro preview --port 4321"` 并确认 `pnpm visual:build:pages` 跑过；失败信息里出现 `ERR_CONNECTION_REFUSED` 时先怀疑服务器，不要 `--update-snapshots`。



### 7.4 本地假红第二根因：`astro preview` 只监听 `::1`

清掉残留 server 后仍出现 `net::ERR_CONNECTION_REFUSED`（21–33/36），不是像素问题：`astro preview` 在本机只监听 IPv6 `[::1]:4321`，而 Chromium/curl 有时先解析 `localhost` 到 `127.0.0.1`。把 `playwright.config.ts` 的 `baseURL`/webServer URL 固定为 `http://127.0.0.1:4321`，并给 preview 命令加 `--host 127.0.0.1` 后，连跑两遍均 **36/36**：

```text
$ pnpm exec playwright test e2e/pages.visual.spec.ts   # pass 1
36 passed (1.4m)
$ pnpm exec playwright test e2e/pages.visual.spec.ts   # pass 2
36 passed (1.3m)
```

这样本地与 CI 都走 IPv4 显式地址，不再依赖 `localhost` 的解析顺序；同时避免复用任意 IPv6 旧 server。

另外把 `reuseExistingServer` 从 `!process.env.CI` 改为恒 `false`：本机残留的 preview 会被 Playwright 误复用，前一次 atoms 跑到 58/72 时 server 被旧父进程回收，剩下 14 条全报 `ERR_CONNECTION_REFUSED`。改为每次由 runner 起新 server 后，atoms 72/72、pages 36/36 × 2 均稳定。
