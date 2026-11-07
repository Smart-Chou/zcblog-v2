# M5-10 · N-3 图标 sprite 与文章 HTML 减重

- 卡：`t_196b2d0c`（M5-9 组合 A 第一卡）
- 分支：`main`
- 日期：2026-11-07
- 决策：D-0143

## 1. 做了什么

把 UI 图标从「每页内联 SVG」改成「构建期一份 sprite + 每实例一个 `<use>`」：

- `scripts/generate-icons.js`：新增 `public/icons.svg`（72 图标中 70 个走 sprite，2 个自带
  `url(#)` / `href="#` 的图标保持内联）和 `src/components/Icons/sprite.ts`
  （`SPRITE_VERSION` = sprite 内容 sha256 前 8 位、`ICON_VIEWBOXES`、`ICON_INLINE_ONLY`）。
- `src/components/Icons/icon-markup.ts`：输出
  `<svg viewBox><use href="/icons.svg?v=<hash>#id"></use></svg>`，保留
  `class` / `width` / `height` / `style` / `currentColor` / `aria-hidden` 语义；内联图标
  自动回退原 SVG。
- `DynamicIcon.astro`、`PostShare.astro` 改走 `iconMarkup()`。
- `public/_headers`：`/icons.svg` 加 `Cache-Control: public, max-age=31536000, immutable`；
  `SpritePreload.astro` 在 `<head>` preload。
- `astro.config.mjs`：`build.inlineStylesheets: "never"`，把每页恒定约 8KB 的 scoped
  `<style>` 改成带哈希的外链 CSS（`/assets/*` 已 immutable）。
- `PostShare` 的二维码从构建期内联（单篇 10.4KB）改成点击微信时才 `import("uqr")` 渲染；
  不引入第三方 QR 服务。
- `scripts/gates/verify-icon-sprite.mjs` + `gates:icons` / `gates:all`：S1–S7 漂移门禁
  （sprite 存在、哈希与清单一致、清单/sprite 双向无孤儿、inlineOnly 不进 sprite、
  `_headers` immutable）。

**关键实现选择**：sprite 用 `<g id>`，不用 `<symbol viewBox>`。`<symbol>` 会多一层嵌套
viewport，实测 24 单位图标差 11–59 像素；`<g id>` + 外层 `<svg viewBox>` 与旧内联
像素一致（0/2304）。这是本轮视觉基线仍能 72/72 通过的原因。

## 2. 证据

### 2.1 构建与 perf

```text
$ pnpm run build:ci
474 page(s) built in 1m 25s
748 页 · 25,108,888 B（html-collapse 后）
EXIT=0
```

`python3 scripts/gates/perf-budget.py dist`：

| 类型 | HTML p95 前 | HTML p95 后 | 最差页前 | 最差页后 | JS p95 | CSS p95 | 超支 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| article | 176.1 KB | **148.4 KB** | 212.8 KB | **185.3 KB** | 38.6 KB | 34.0 KB | **0** |
| list | — | 59.4 KB | — | — | 24.5 KB | 27.5 KB | 0 |
| page | — | 54.2 KB | — | — | 24.5 KB | 29.2 KB | 0 |

- article p95 目标 ≤150、最差 ≤190，均通过；`article/beszel-server-monitoring-guide/index.html`
  的 JS 仍有 +0.9KB 余量（38.6/40）。
- CSS p95 从 31.8 → 34.0KB（外链化带来的请求/文件组织变化），门限 45KB，**未超**。

### 2.2 视觉基线

```text
$ pnpm exec playwright test e2e/design-atoms.visual.spec.ts
72 passed (1.1m)                       # macOS chromium

$ docker run --rm --shm-size=2g -v /tmp/m5-10-linux:/work -w /work \
    mcr.microsoft.com/playwright:v1.63.0-noble bash -lc \
    'corepack pnpm i --frozen-lockfile && corepack pnpm exec astro build && \
     corepack pnpm exec playwright test e2e/design-atoms.visual.spec.ts'
72 passed (1.2m)                       # Linux chromium-linux
```

macOS 与 Linux 两套基线均全绿，阈值未放宽（macOS 1% ratio / Linux 0 diff pixels）。

### 2.3 e2e 与门禁

```text
$ pnpm exec playwright test e2e/pages-article.spec.ts
21 passed, 5 skipped (55.7s)

$ pnpm exec playwright test e2e/pages-article.spec.ts -g '徽标 sprite'
[sprite] 29 个 <use> 实例，sprite 内 70 个 <g>，缺 id 0，零尺寸 0（隐藏 6）
1 passed

$ pnpm run gates:all
RESULT PASS classified=1157 unclassified=0
S1–S7 8/8 PASS

$ pnpm run type-check
EXIT=0
```

`e2e/pages-article.spec.ts` 的 sprite 断言只统计 `href` 含 `/icons.svg` 的跨文档引用；
`logos:telegram` / `mingcute:github-line` 的内联回退自带同文档 `<use href="#…">`，不再误判。
隐藏的主题切换/分享抽屉图标用 `checkVisibility()` 排除，可见图标零尺寸仍为硬失败。

### 2.4 消费者装配

```text
$ node scripts/create-site.mjs --overlay apps/demo --out /tmp/m5-10-demo --build
RESULT PASS out=/tmp/m5-10-demo html=118 overlay=apps/demo title_hits=13 build=24.2s
layers=theme:497/baseline:28/shim:13/overlay:9
EXIT=0
```

新增的 `icon-markup.ts` / `sprite.ts` / `SpritePreload.astro` 已进入 `git ls-files`，
`create-site` 的 theme 层会随包装配；否则会出现 `Rolldown failed to resolve import
"~/components/Icons/icon-markup"`（首次构建时已复现并修正）。

## 3. 变更文件

- `scripts/generate-icons.js`
- `scripts/gates/verify-icon-sprite.mjs`（新）
- `public/icons.svg`（新，22,617 B / 70 `<g>`）
- `src/components/Icons/sprite.ts`（新）
- `src/components/Icons/icon-markup.ts`（新）
- `src/components/Icons/DynamicIcon.astro`
- `src/components/Icons/index.ts`
- `src/components/BaseHead/BaseHead.astro`
- `src/components/BaseHead/SpritePreload.astro`（新）
- `src/components/Article/PostShare.astro`
- `src/scripts/share.ts`
- `astro.config.mjs`
- `public/_headers`
- `package.json`
- `e2e/pages-article.spec.ts`

## 4. 残余与边界

- 首屏新增一次 `/icons.svg` 请求（22.6KB raw / 约 6.3KB gz，已 preload，之后 immutable 命中）；
  这是用「一次缓存换每页 HTML 减重」的已知取舍。
- Article CSS p95 34.0KB（门限 45）仍有空间；如果后续 V-0/N-1 继续加样式，需重新看这条。
- 没有改生产站、没有碰 npm registry；npm 账号只读窗口与本卡无关。
