# M7-3c · 分享弹层接海报预览 + 下载 / 短链降级

- 卡：`t_a6bc6d7e`（blog2 板）· assignee `blog-fe` · 2026-11-09
- 工作区：`/Users/chowcong/Documents/WebSiteCode/zcblog-v2`
- 结论：**完成** —— 分享弹层接入构建期 `/poster/<slug>.png`，桌面两栏（左 3:4 海报 + 右 QR/平台/操作）、移动单列；下载静态海报；「复制短链」无后端时复制 canonical URL 并显示降级文案。
- 源文件：4 个 —— `PostShare.astro`、`share.ts`、`share.css`、`e2e/share-poster.spec.ts`。

## 1. 行为

- 关闭态 `<img data-share-poster>` **无 src**，不请求 `/poster/*.png`；打开弹层才写 src，并等待真实像素。
- 海报 1200×1600（3:4），桌面左侧预览；下载链接 `href=/poster/<slug>.png` + `download`。
- 移动 390：`.share-modal` 为 flex column，单列；平台改为列表；海报不横向溢出；关闭后焦点回到微信/分享入口。
- 短链：本站没有短链服务，不伪造；复制 canonical URL，状态行显示「暂无短链服务，已复制完整文章链接」；剪贴板拒绝时显示手动复制提示。
- 保留 M7-3a 的 QR 懒加载、平台链接、外点/Esc、Umami。

## 2. 验收

```bash
SHARE_POSTER_SHOTS=1 pnpm exec playwright test e2e/share-poster.spec.ts e2e/share.spec.ts --reporter=line
# 15 passed / 4 skipped
```

- 1440/390 分享弹层 axe light/dark：**serious/critical 0**。
- 关闭态请求：`/poster/*.png` 0、overlay 基座 0。
- 海报预览：`naturalWidth=1200`、`naturalHeight=1600`；下载 href 指向当前 slug。
- `share.spec.ts` 既有分享行为不回归。
- 证据：`docs/_reviews/M7-3c/screens/{modal,sheet}-{light,dark}-*.png`（含 shortlink 状态）。

## 3. Operator 复核

- `gates:all` **8/8 PASS**、`gates:surfaces` PASS、`type-check` PASS。
- `build:ci` 477 页；`perf-budget` **over=0**（article JS p95 39.0/40，CSS 39.9/45；page JS max 30.0/30）。
- `pages.visual` **42 passed**（article 375/768/1280 均通过；分享条/弹层没有引入页面基线漂移）。
- Worker run 143 在 30 分钟硬上限超时（1848s），run 144 被 reclaim；WIP 提交 `e4923df` 后由 operator 修正 390 单列断言（CSS 已是 flex column，测试误读残留 `gridTemplateColumns`）并补齐报告/截图。

## 4. 未做 / 边界

1. 不生成海报、不改 `packages/og-image/**`；海报来自 M7-3b-2。
2. 不接第三方短链服务；降级文案是产品明确行为。
3. 移动端在 `[data-share-mode="poster"]` 下隐藏二维码（同机扫码无意义），平台与下载仍可用；需要扫码时桌面/非触摸设备保留 QR。
