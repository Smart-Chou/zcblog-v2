# M7-3a · 分享入口 + 微信 QR 弹层视觉（不接海报生成）

- 卡：`t_29c35d53`（blog2 板）· assignee `blog-fe` · 2026-11-09
- 工作区：`/Users/chowcong/Documents/WebSiteCode/zcblog-v2`
- 结论：**完成** —— 分享入口条与微信二维码弹层按 `selection.md` §4.17 的 modal/sheet 方向换壳；保留 `share.ts` 的全部行为。**本卡不生成 3:4 海报**，海报生成拆到 M7-3b。
- 源文件：3 个 —— `src/components/Article/PostShare.astro`、`src/styles/pages/share.css`、`e2e/share.spec.ts`；未改 `share.ts` / `overlay.ts` / `article.css` / `overlays.css` / `package.json`。

## 1. 做了什么

### 分享入口条

- 桌面：左侧「分享到」+ 真实分享计数（赤陶竖条），右侧白色托盘内 9 个图标；平台顺序、链接、`target/rel` 保持。
- 移动（≤640）：入口条改为 **2 列网格**；每个格子固定 3.25rem 高，避免 `aspect-ratio` 反推内容高时 Chromium 把第二行裁掉。
- 仍保留微信公众号 / 复制 / 系统分享三个 action；分享计数来自现有站点数据，没有伪造。

### 微信二维码弹层

- 桌面 1440：居中卡片（`min(22rem,100%)`），顶部 WECHAT QR 标签 + 关闭键，二维码、说明、文章 URL 分块；遮罩铺满视口。
- 移动 390：同一 DOM 变成贴底 sheet，二维码区域与入口条网格同一套 token；关闭后焦点回填。
- QR 仍是 **点击微信后才 `import("uqr")`**；关闭态 HTML 不内联二维码，也不下载 overlay 基座。
- 修复关闭态 transform 过渡导致「遮罩只铺半屏、前 150ms 点外点关不掉」的问题：就位时只保留淡入。

## 2. 验收

```bash
pnpm exec playwright test e2e/share.spec.ts --reporter=line
```

- **6 passed / 4 skipped**（截图用例由 `SHOTS=1` 门控）；1440 关闭态 7 个站外锚点顺序不变、URL 真实；打开微信才加载 overlay/QR chunk；复制链接写入当前文章 URL。
- axe 分享弹层：light/dark **serious=0 / violations=0**。
- 390 入口条网格无横向溢出；sheet 宽 ≥ 视口 − 20（扣除 scrollbar-gutter），底部贴边，可开可关并回焦。
- 证据截图（`docs/_reviews/M7-3a/screens/`）：
  - `bar-light-1440.png` / `bar-dark-1440.png`
  - `bar-light-390.png` / `bar-dark-390.png`
  - `modal-light-1440.png` / `modal-dark-1440.png`
  - `sheet-light-390.png` / `sheet-dark-390.png`

## 3. Operator 复核

- `type-check` PASS、`gates:all` **8/8 PASS**、`gates:surfaces` PASS。
- `build:ci` **477 页**；`perf-budget` **over=0**（article CSS p95 39.3/45、JS p95 38.7/40；page JS max 30.0/30）。
- 本机 `pages.visual` **42 passed**（分享入口条的换壳没有引入页面基线漂移；article 页 375/768/1280 均通过）。
- Worker run 137 在 30 分钟硬上限处超时（1833s）；run 138 被 reclaim 后由 operator 收口。最终提交分两笔：`5908f71`（主体）+ operator 的 `fix(share)`（网格高度、过渡、断言）。

## 4. 明确未做

1. **3:4 分享海报生成**：构建期 Satori / `@marxchou/dogeared-og-image` 不在本卡；当前弹层是微信 QR，不是海报预览。
2. **海报下载 / 短链降级**：M7-3c。
3. **金句卡 Canvas**：M7-3d。
4. 分享条保留了现有站点配置的平台集合；没有新增平台或伪造分享数。

## 5. 已知边界

- 移动入口条的图标网格依赖 `scrollbar-gutter: stable` 的 15px 槽位，因此测试对 sheet 宽度留了 20px 余量；这是浏览器几何差异，不是布局溢出。
- 二维码弹层是「微信扫码分享」语义，不承担 OG 海报预览；在 M7-3b/3c 接入生成图之前，不应把它当分享海报验收。
