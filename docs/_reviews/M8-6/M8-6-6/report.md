# M8-6-6 · 移动端收口（底栏 tab bar + 4 页完整移动验收）

> 卡片：`t_efafdbb8`（M8-6 批二）
> 标准：`docs/_reviews/M8-6/acceptance-standard.md` §2.6 + §3.4 M-01…M-16
> 代码基线：`zcblog-v2` `main`
> 日期：2026-11-11

## 1. 交付内容

| # | 改动 | 文件 |
|---|---|---|
| 1 | **≤640 底栏 tab bar**：4 入口（博客 / 随笔 / 媒体生活 / 相册）、默认 `display:none`、纯 CSS 断点、`env(safe-area-inset-bottom)`、`aria-current="page"`、命中区 44×44+、相邻 8px、`body:has(.bottom-tabs)` 留 60px | `src/components/Layout/BottomTabs.astro`（新）、`src/layouts/BaseLayout.astro` |
| 2 | **窄屏 admonition 越界修复**：≤768 取消 `remark-aside` 左右负外边距 | `src/styles/pages/article.css` |
| 3 | **文章分享条 axe 修复**：`.share-bar::before` 绝对定位伪元素盖住 `.share-label/.share-count`，改为 `border-inline-start` 真实边框 | `src/styles/pages/share.css` |
| 4 | **TOC 跳转用例稳定化**：固定等 900ms（覆盖 tocbot 420ms + 回填），不再用 rAF 稳定性探针 | `e2e/pages-article.spec.ts` |
| 5 | **页面视觉基线稳定化**：截图前对全部图片 `decode()`，避免懒加载图片在基线里半加载 | `e2e/pages.visual.spec.ts` |

底栏形态取自 `mobile_home` / `mobile_albums_gallery` / `mobile_culture_hub` 的同一个 `<nav>`。桌面不渲染盒子（`display:none`），但 `share.css` 的边框修复会改变文章分享条 1px 视觉，属预期。

### 底栏实测（`/talks/`，`evidence/measurements.json`）

| 视口 | `display` | 入口 | 命中区 | 相邻间距 | `body` 底部留白 |
|---|---|---|---:|---:|---:|
| 375 | block | 4 | 80×52 | 8px | 60px |
| 640 | block | 4 | 146×52 | 8px | 60px |
| 768 | none | 4（不可见） | 0×0 | — | 0px |

`aria-current="page"` 在 375/640 只挂当前路由；`/`、`/talks/`、`/albums/`、`/culture/` 各归各格。

## 2. 验证

### 2.1 代码门禁

| 项 | 结果 |
|---|---|
| `astro check` | **0 errors / 0 warnings** |
| `astro build` | **482 pages**，Complete |
| `tsc --noEmit` | **0** |
| `gates:all` | **8/8 PASS** |

### 2.2 四份移动 spec（分文件独立跑，避免共享 `dist/` 被并发重建）

| spec | 结果 |
|---|---|
| `pages-home.spec.ts` | **15 passed / 6 skipped** |
| `pages-article.spec.ts` | **23 passed / 5 skipped** |
| `pages-albums.spec.ts` | **16 passed** |
| `pages-culture.spec.ts` | **19 passed** |
| 合计 | **73 passed / 11 skipped / 0 failed** |

未采用一次 84 例全量的原因：albums / culture 各含真实 `astro build` fixture，本机冷缓存单次 6m+；四份串行超过 30min 卡预算。分文件与单例结果均已落盘，失败项为 0。

关键输出：

```
[axe] article light/dark @1440  .post serious=0 incomplete=0
[toc] 点击 #前言 → 标题 top=100.2px（页头 65.0px）
[nav] 390px / 1440px: 相册入口可点击 → /albums/
[axe] /albums/ + 详情 light/dark: violations=0 incomplete=0
[empty] 真实构建：空态、0 本相册、页头保留、路由 200
```

### 2.3 移动专项

- M-02：375/390/768/1440 双主题 0 横向溢出；`remark-aside` 负边距根因已修。
- M-05 / M-09：底栏命中区 80×52 / 146×52，gap 8px，安全区使用 `env()`。
- M-07：四页 CLS ≤0.05（各 spec 的 CLS 用例）。
- M-13：4 路由 375 双主题 axe serious/critical=0、incomplete=0（`evidence/measurements.json`）。
- M-16：8 张 375 双主题 + 390 溢出日志 + TOC 开/关、灯箱、四段轨起/终截图。

### 2.4 视觉基线（M8 批次末尾统一重刷）

| 平台 | 命令 | 结果 |
|---|---|---|
| macOS | `pages.visual.spec.ts --project=chromium-pages --update-snapshots=all` 后无更新复跑 | **42 passed**（更新）/ **42 passed**（校验） |
| Linux（官方镜像 `mcr.microsoft.com/playwright:v1.63.0-noble`） | 同 spec `--project=chromium-linux-pages` | **42 passed**（更新）/ **42 passed**（无更新校验） |
| atoms | `design-atoms.visual.spec.ts` | **72 passed**，0 变更 |

本批次实际变更：macOS **19** 张、Linux **26** 张（含此前 M8 累积的 albums/culture 视觉差异 + 本次 375 底栏 + share.css 1px 边框）；其余基线逐像素不变。

## 3. 证据

`docs/_reviews/M8-6/M8-6-6/evidence/`

| 文件 | 说明 |
|---|---|
| `home-375-{light,dark}.png` | 首页 375 双主题 |
| `article-375-{light,dark}.png` | 文章页 375 双主题 |
| `albums-375-{light,dark}.png` | 相册 375 双主题 |
| `culture-375-{light,dark}.png` | 文化 375 双主题 |
| `toc-open-375.png` / `toc-closed-375.png` | 目录抽屉开 / 关 |
| `albums-lightbox-375.png` | 灯箱打开，主图已加载、底栏隐藏 |
| `culture-rail-{start,end}-375.png` | 四段轨起点 / 终点 |
| `measurements.json` | 底栏量测、390 溢出、375 双主题 axe |
| `e2e.log` | 四份 spec 的完整输出 |

## 4. 结论

移动端形态已收口：底栏、断点、安全区、命中区、`aria-current` 成立；四路由移动验收通过；窄屏溢出、TOC 跳转、分享条 axe 三个实测缺陷已修；双平台页面基线已重刷并各自复跑通过。无遗留项。
