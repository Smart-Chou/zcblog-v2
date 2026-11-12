# Dogeared Radio · 站级 SitePlayer（M8-4）

> 2026-11-12 · 站级悬浮播放器，按 `blog2.0/docs/26-m8-4-player-spec.md` 落地。
> 路由：`/radio/`（zh）· `/en/radio/`（en）· `noindex`

## 1. 状态：从「页面级 Dock」升级为「站级 SitePlayer」

上一版是 `/radio/` 独占的 `RadioDock`（已删除）。现在：

- 播放器由 `SitePlayer.astro` 挂在 **BaseLayout**，节点落在 `#app` 之外 → swup 只替换 `main`，播放器身份不变 → **跨页不断播**。
- **arm-on-play**：访客没按过播放时，全站 **0 个 `.site-player` 节点、0 条 media 请求、0 字节播放器 chunk**（spec §2.2 S0「不是隐藏，是不存在」，§3.3「无播放器的页面视觉零变化」）。按过播放后写 `localStorage.dogeared-radio-armed=1`，之后每页都带；按关闭清除。
- `/radio/` 页是唯一例外：它自己带唤起按钮，所以该页总挂载（否则按钮点了没反应）。

## 2. 电台（数据源 `src/config/radio.ts`）

| 电台 | 流 | 说明 |
|---|---|---|
| **Radio Paradise · Main Mix**（默认） | `https://stream.radioparadise.com/mp3-128` | 人工策展、无广告，官方 stream links 页面明确面向第三方播放器 |
| **Nightride FM** | `https://stream.nightride.fm/nightride.mp3` | Synthwave 24/7 社区电台 |

`Devs.fm` 曾被选为第二台，但它的客户端一直停在启动动画（`Performing system diagnostics...`），页面与 JS chunk 里都没有音频源，因此按「不交付死按钮」处理，换成 Nightride。

CSP：`media-src 'self' https://stream.radioparadise.com https://stream.nightride.fm`（精确 origin，无通配）。

## 3. 与 spec 的差异（3 条，都有理由）

| spec | 实现 | 理由 |
|---|---|---|
| §4.3 进度条 + `aria-valuetext` | **不渲染进度条** | 两个源都是**无限直播流**（无 duration、不可 seek）。画一条永远 0 的条是假状态。切到点播源时按 spec 补回。 |
| §2.1 S3b `ended` 子态 | 代码保留处理，实际不触发 | 同上：直播流不会 `ended`。 |
| §3.2 卡片高度算式 132 / 100 | 用 `ResizeObserver` 写真实高度到 `--site-player-block-size` | 文案长度与状态都真实变化，硬编码算式值会在 i18n 或长电台名下失效。避让不变量（V1–V3）不变。 |

## 4. 实测（Playwright / Chromium，本地 preview）

| # | 判据 | 结果 |
|---|---|---|
| A | 冷访客（未按播放）全站播放器节点数 | **0** |
| A | 冷访客是否加载播放器 chunk | **false** |
| A | 冷访客 media 请求数 | **0** |
| B | `/radio/` 点「打开播放器」 | `data-state=expanded`、`data-playing=true`、`readyState=4`、`paused=false`、`aria-label="暂停：Radio Paradise"` |
| B | 播放键是否带 `aria-pressed` | **false**（spec §4.2 A3） |
| C | swup 换页 → `/archives/` | 播放器节点数 **1**、`sameNode=true`、`paused=false`、`currentTime` 0.88 → 2.34 单调增 |
| D | 点关闭 | 节点 **0**、`armed` 标记清除、音频源已摘除 |
| D | 全程 media 请求 | 只有 1 条 `stream.radioparadise.com/mp3-128` |
| E | 375 展开态 | 播放器 `bottom=728` vs BottomTabs `top=751` → **23px 间距**；无横向溢出 |
| F | 文章页 + 播放器 + 滚到底 | 末段正文与页脚均不与播放器相交（V3 PASS），`--site-player-block-size=108px` |
| — | axe 375 light/dark、1440 dark | serious/critical **0** |
| — | axe 1440 light | 仅站点原有 `pf-trigger-text` / `nav-menu-btn-label`（4.4:1），非播放器内容 |
| — | 页面级视觉基线（macOS，42 张） | **42 passed**（arm 策略下未播放访客零变化，基线未重出即通过） |
| — | `type-check` | 0 |
| — | `gates:all` | 8/8 PASS（18/18、10/10、14/14 全绿） |

JS 预算（spec §6.3）：门控脚本 **294 B（未压缩）/ 294 B gz**（预算 ≤0.5KB），播放器 chunk **3025 B gz**（预算 ≤4KB）。

## 5. 额外做的一条：全站只有一路声音

spec §6.2 第 12 条要求「不得与 `/music/` 页内播放器同时出声」。实现方式是监听 document 上任意 `HTMLMediaElement` 的 `play` 事件（capture），自己先 `pause()` —— 这样无论页内播放器怎么写、以后再加音频组件，都只有一路在响。

## 6. 文件

- `src/components/UI/organism/SitePlayer.astro` — 全局样式 + 门控脚本（**不输出 DOM**）
- `src/scripts/site-player.ts` — 播放器 chunk（按需 import）
- `src/config/radio.ts` — 电台数据（唯一 URL 来源）
- `src/config/radio-flags.ts` — 门控常量（让门控脚本只内联几百字节）
- `src/components/Radio/RadioPageContent.astro` — `/radio/` 页内容（只发 `radio-open` / `radio-station` 事件）
- `src/pages/radio/index.astro` / `src/pages/en/radio/index.astro` — 页面壳
- `src/styles/pages/radio.css` — 页面排版
- `src/layouts/BaseLayout.astro` — 挂载 `<SitePlayer />`
- `src/components/BaseHead/ContentSecurityPolicy.astro` — `media-src`
- 已删除：`src/components/Layout/RadioDock.astro`、`src/scripts/radio-dock.ts`

验收脚本：`docs/_reviews/radio-dock/site-player-check.cjs`（A–F 六组真跑断言）。
截图：`docs/_reviews/radio-dock/shots/site-player-*.png`。

## 7. 明确没做

- 没有导航入口、没有 sitemap 收录、没有为 `/radio/` 单独出页面基线。
- 没有 now-playing 元数据（Radio Paradise API 无 CORS 头，硬拉会被浏览器拦；播放器只声明真实的 LIVE 状态并外链官方页面）。
- 没有 HLS、没有电台目录、没有播放列表。
- 没改 `#back-to-top` 的基础值（`bottom: 40px; right: 30px; z-index: 100` 是已登记漂移）：只在播放器存在时用 `:has()` 覆盖它的位置，无播放器的页面零变化。
