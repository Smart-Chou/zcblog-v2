# 视觉回归（visual-regression）

> 本文管：像素基线的双平台分账、目录结构、生成与更新流程、假红判读、以及「旧基线可能编码的是缺陷」这条最贵的坑。
> **必读时机**：改任何可见样式、改 token、加/删页面、动 fixture 内容，或视觉门禁整轮全红时。
> 与 `rules/ci-gates.md` §4（门禁在 CI 的位置）分工：那边说跑在哪，这边说基线怎么生成、什么时候该重出、什么时候**绝对不能**重出。
> 参数真源是 `playwright.config.ts`；流程真源是 `README.md` 的「视觉基线（截图回归）」一节。

---

## 1. 基线按平台分账，跨平台比对毫无意义

样例 fixture 不带 `@font-face`，字形来自操作系统字体栈（macOS 用 Georgia/-apple-system，Playwright Linux 镜像里是 Liberation/FreeSans/Noto）。所以**每个平台自带目录和阈值**，一次只实例化一个 project。<!-- playwright.config.ts:5-15 -->

| 套件 | 覆盖 | macOS 目录 / 阈值 | Linux 目录 / 阈值 |
|---|---|---|---|
| 原子 `/design/atoms` | 12 atom × 3 视口 × 2 主题 = 72 | `design-atoms/` · `maxDiffPixelRatio: 0.01` | `design-atoms-linux/` · `maxDiffPixels: 0` |
| 页面级 | 7 页 × 3 视口 × 2 主题 = 42 | `pages/` · `maxDiffPixelRatio: 0.001` | `pages-linux/` · `maxDiffPixels: 0` |
| 状态级（§7.2） | 3 页 × 2 态 × 3 视口 × 2 主题 = 36 | `pages-states/` · `0.001` | `pages-states-linux/` · `maxDiffPixels: 0` |
| 播放器元素 | 3 形态 × 2 主题 × 2 视口 = 12 | `design-organism/` · `0.001` | `design-organism-linux/` · `maxDiffPixels: 0` |

- **CI 只认 Linux 那四套，判据是 `maxDiffPixels: 0`**——同一镜像、同一字体包、同一浏览器构建号，重渲染实测 0 像素漂移。**永远不要为了让一次运行通过而放宽它**。<!-- playwright.config.ts:76-80 · D-0173 -->
- 平台由 `PLAYWRIGHT_BASELINE_PLATFORM` 决定；不设时按 `process.platform` 推。**不要同时跑两个 project**——拿这台的像素和另一台的 PNG 比，结论没有意义。
- 页面级不共用原子的 1% 阈值：整页图大得多，1% 足以让一整张卡片位移而不报警，所以 macOS 收到 0.1%；播放器元素只有 336×46 这种小盒子，比例阈值是**每个盒子**的容许量，0 像素会把滑块的亚像素边判红 4/12。<!-- playwright.config.ts:40-70 -->

## 2. 目录与总量（324 张 PNG）

```
e2e/__screenshots__/
├── design-atoms/            72   macOS 原子
├── design-atoms-linux/      72   Linux 原子（CI 判据）
├── pages/                   42   macOS 页面级
├── pages-linux/             42   Linux 页面级（CI 判据）
├── pages-states/            36   macOS 状态级
├── pages-states-linux/      36   Linux 状态级（CI 判据）
├── design-organism/         12   macOS 播放器
└── design-organism-linux/   12   Linux 播放器（CI 判据）
```

合计 162 张/平台 × 2 = **324 张**。命名规则 `<页面>-<主题>-<宽度>.png`（原子是 `<组件>-<主题>-<宽度>.png`，状态级是 `<页面>-<态>-<主题>-<宽度>.png`，播放器是 `player-<态>-<主题>-<宽度>.png`），由 `snapshotPathTemplate` 固定到对应 project 的目录。
**四套各自计数，不合并成一个数字**：`ci.yml` 里 `atoms 72` / `pages 42` / `states 36` / `player 12` 是四条独立硬断言；合成一个总数时，某一套整体被 skip 或少跑仍然是绿的。

## 3. 截图必须可复现：六条硬前提

1. **固定内容**。页面级与状态级都跑在 `e2e/fixtures/pages-visual/content/article` 上（`CONTENT_ARTICLE_BASE` 指过去），不碰私有内容仓——否则内容仓加一篇文章，首页/归档/热门整体位移，门禁红在与主题无关的地方。
2. **每篇 fixture 必须带 `upDate`**。缺了就回落到 `new Date()`，基线会把「生成那一天」编码进像素；`build-pages-baseline.mjs` 会直接报错退出。
3. **`ARTICLE_REPO_PATH` 指向不存在的路径**。否则 `src/utils/git-date.ts` 在开发机会读 `git log`、在 CI 跳过，同一份源码在两平台渲染出不同日期。
4. **第三方流量全部打桩或拦断**：任何离开 localhost 的请求，图片用 1×1 PNG 应答（R2/CF 图片缩放、随机封面、友链头像），脚本与服务一律 abort（umami、Waline API、hitokoto、CDN 上的 mermaid）。
5. **自跑 JS 要冻结**：首页 hero 的 `TypewriterText` 是 JS 定时轮换，`animations: "disabled"` 停不住它——spec 会销毁实例并恢复构建期第一句。状态级构建再加 `scripts/visual/freeze-clock.cjs`，让「N 天前」不进入像素。
6. **懒加载强制可见、截图高度封顶 3600 CSS px**：否则首屏外的 `loading="lazy"` 图按滚动时序时有时无；长文 19k px 全截既不可评审也抓不到新回归。

<!-- e2e/pages.visual.spec.ts 头注释 · scripts/visual/build-pages-baseline.mjs · build-state-baseline.mjs -->

## 4. 更新基线的标准流程（两平台都要重出）

```bash
# 1. 用固定内容构建（会覆盖 dist/；做完要正常预览请重跑 pnpm build）
pnpm visual:build:pages

# 2. macOS 基线
pnpm exec playwright test e2e/pages.visual.spec.ts --update-snapshots

# 3. Linux 基线：必须在 CI 用的同一个镜像里
docker run --rm --ipc=host -v "$PWD":/work -w /work \
  -e PLAYWRIGHT_BASELINE_PLATFORM=linux \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -lc 'corepack enable && corepack pnpm install --frozen-lockfile && \
            node scripts/visual/build-pages-baseline.mjs && \
            corepack pnpm exec playwright test e2e/pages.visual.spec.ts --update-snapshots'

# 4. 复核：连跑两遍都必须过
pnpm exec playwright test e2e/pages.visual.spec.ts
```

状态级换成 `pnpm visual:build:states` + `e2e/pages-states.visual.spec.ts`（`PW_SKIP_PREVIEW=1`，它自己起静态服务、不读 `dist/`）。原子/播放器同理换成对应 spec。

- **人工看 diff 才允许提交**：CI 永不自动更新基线。
- **Linux 集不能复用宿主 `node_modules`**：`rolldown` 是原生二进制，macOS 版在 Linux 容器里直接崩（症状是 `✗ empty 构建失败`）。用命名卷 `-v zcblog-linux-nm:/work/node_modules` 在容器内 `pnpm install --frozen-lockfile`。corepack 下 pnpm 偶发 TLS `ECONNRESET` 时改 `npm i -g pnpm@10`。<!-- D-0173 -->
- 新增/删除基线页面：改 `e2e/pages.visual.spec.ts` 的 `PAGES`，**两平台都重出**，并在 PR 里贴 diff 截图。
- `loading` 与 `filtered-empty` 两态**当前不在矩阵里**（`EntityStatus` 只有 `ok|empty|error`，筛选 UI 未合并）。对 `main` 生成那两态只会把 `ok` 版式录成假状态——宁缺勿假。<!-- D-0156 未决 · scripts/visual/build-state-baseline.mjs -->

## 5. 坑：旧基线可能编码的是缺陷

**最贵的一条**：36 张状态级基线在当前代码上 36/36 全红，尺寸完全一致、全图差异 1.691%、聚成 11 个纵向条带。根因不是「基线过期」，而是旧基线把「`tabler:category` 图标缺失」这个 bug 的视觉状态当成了正确——图标宽度为 0，同 flex 容器内右侧元素整体左移 15px。补上图标后页面正确变化，基线才正确变红。<!-- D-0173 · pitfalls §1.1 -->

所以**重出基线前必须回答「这次的差异是 intentional 吗」**，回答不了就去查：

1. **先看尺寸**：expected / actual 尺寸不同 → 布局真的动了，按回归处理。
2. **尺寸相同、差异铺满整页** → 90% 是**滚动条出现与否**（内容宽度被抠掉约 15px，每行都「差一点」，特征差异在右边缘形成通高竖条）。重跑一轮；仍复现就查 `dist/` 是不是 `pnpm visual:build:pages` 产出的。
3. **差异聚成若干条带** → 做位移打分：`dx=+N px` 一致率接近 100%、`dx=0` 明显偏低，就是整体位移（flex/图标/间距），不是抗锯齿。
4. **拿对照实验定根因**：摘掉可疑提交、其余不动，重跑。36 passed 就是它。

**绝不允许**用 `--update-snapshots` 掩盖假红。基线是判据，不是现状的快照。

## 6. 假红的其他常见来源

- **`reuseExistingServer: false`**：runner 自己起 `astro preview`。旧版本复用残留 server 的症状是 `net::ERR_CONNECTION_REFUSED` 或比对到旧 `dist`——不是像素 diff。
- **地址固定 `127.0.0.1`**：`astro preview` 默认只监听 `[::1]`，用 `localhost` 会在 IPv6/IPv4 之间飘。
- **`workers: 1` 不要调大**：42 张全尺寸截图并跑会把 preview server 和字体加载压出时序差，失败信息长得跟真回归一模一样。
- **并行卡换端口**：`PW_PREVIEW_PORT=4337` / `PW_STATES_PORT_BASE=4411`，不要共享 4321 与 4401–4402。
- **`astro preview` 用 `--ignore-lock`，不是 `--force`**（`--force` 只属于 `astro build`，写了会被静默忽略；残留 preview 会让整轮一条用例都不跑）。

<!-- README.md「视觉基线（截图回归）」· playwright.config.ts -->

## 7. 截图审计流水线（不是像素比对）

`e2e/export-audit.spec.ts`（`pnpm audit:a11y`）是另一条线：分母来自 `dist/`（进了产物的页面就必须被审到，不手写路由表），做三件事——全站 dark 逐页（主题生效 + 暗色面不亮 + 1440 无横向溢出）、axe WCAG 2.x A/AA 逐页（serious/critical = 0，incomplete 只记录）、4 页 × 2 主题 × 3 视口的移动溢出矩阵。

- `AUDIT_SHOTS=1` 才写 `docs/_reviews/M2-12/screenshots/**`，CI 不写盘；明细落 `audit-data/{dark-pages,axe,mobile}.jsonl`。
- 跑在 `a11y-pr.yml`（12 路由 smoke）与 `a11y-nightly.yml`（全量 strict）里。
- 它答的是「对不对/能不能用」，像素基线答的是「看起来有没有变」。两者互补，不能互相替代。
