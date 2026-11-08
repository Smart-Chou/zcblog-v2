# M6-2 · 首页重做（marx_s_blog_2）

- 卡：`t_04407aa0`（blog2 板）· 2026-11-08
- 基线：`main` @ `54fd07b`
- 输入：`selection.md` §4.1；桌面 `marx_s_blog_2`，移动 `marx_s_blog_mobile_home`
- 说明：worker 在 150 次迭代预算处超时，但改动已落工作区；以下由 operator 复核、补验和收口。

## 1. 改动

| 文件 | 内容 |
|---|---|
| `src/styles/pages/home.css` | 首页 6 区块视觉语言：Hero/作者卡/8-4 栅格/区块头/FEATURED 徽章/文章卡/4 网格照片/随笔便签/热门 leaderboard/侧栏卡；移动端隐藏 Popular / Friends |
| `src/components/Index/Talk.astro` | 首条随笔在构建期 SSR 出来，无 JS 时不再空白；ticker 仍接管轮换 |
| `src/styles/home.css` | operator 修正旧 `.home-page .section-link` 的暗色语义色（`--color-text-muted` → `--color-fg-muted`） |
| `e2e/__screenshots__/pages/home-*.png` | 6 张 macOS 首页基线 |
| `e2e/__screenshots__/pages-linux/home-*.png` | 6 张 Linux 首页基线（Playwright noble 生成） |
| `docs/_reviews/M6-2/screens/` | 1440/1024/390 × light/dark 6 张首页截图 |

没有改 `src/pages/**`、路由、数据 schema、palette 或 JS 模块。

## 2. 版式要点

- 桌面：1140 shell 内 8/4 栅格（主栏 707 / 侧栏 353），区块头「赤陶竖条 + 无衬线标题 + 等宽查看全部」。
- 移动：单栏，隐藏 Popular / Friends（页脚仍保留入口）；照片 2×2；文章卡与作者卡全宽。
- FEATURED 使用 accent-solid + on-accent 实底胶囊（light 6.7:1 / dark 5.2:1）。
- 照片 EXIF 白条改用 `object-fit: cover` + `object-position: center top`，保留裁切语义，`<img>` rect 不再越界。

## 3. 验证（真实命令）

```text
pnpm run gates:all                 exit 0（atoms 18/18、token 10/10、overlay unclassified=0）
pnpm run gates:surfaces            PASS（new_hits=0、baseline=41/84）
pnpm run type-check                exit 0
pnpm run build:ci                  749 页
python3 scripts/gates/perf-budget.py dist
  over=0 / a7_missing=[]
  JS p95 38.6 / 24.5 / 24.5 KB（与 M5-13 相同，JS 增量 0）
pnpm exec playwright test e2e/pages-home.spec.ts
  15 passed / 6 skipped
pnpm exec playwright test e2e/pages.visual.spec.ts
  36 passed（固定夹具，macOS 基线）
axe（WCAG 2 A/AA + 2.1 + 2.2，首页 `.home`）
  light 1440 / 390：0 violations
  dark 1440 / 390：0 violations
```

- 运行时 `home-shots`：1440/1024/390 × light/dark 全部 **0 横向溢出**；scrollWidth 1425/1009/375 对 clientWidth 1440/1024/390。
- 390 真实图片模式 LCP 为 `h1.hero-title`（约 172–184ms）；stub 图片模式为 featured excerpt（约 228–256ms），均为首屏内容，未用 CSS 伪造 LCP。
- 暗色 a11y 首轮使用的临时探针在 `goto` 后才切主题，axe 读到一半 light token；改用 `preferredTheme` 预置后，四种组合 0 violations。`src/styles/home.css` 的 section-link 同步改为语义 token，避免暗色 3.81:1。

## 4. 与 selection §4.1 的偏差

1. **未做移动底部 tab bar**：稿子有，但它是新组件，超出本卡「只换皮 + 复用 Index 组件」边界；移动端仍用页头菜单。
2. **移动端不渲染 Popular / Friends**：按稿执行；页脚保留入口。
3. **照片 EXIF 处理**：保留 M2-2b 的裁切目标，但改为原生 `object-fit`，修复 768 档 `<img>` 越界；白条仍被 `.photo-frame` 裁掉。
4. **首条随笔 SSR**：原 ticker 列表初始为空，无 JS/脚本未到位时是空白卡；M6-2 构建期渲染首条，属于可访问性兜底，不新增客户端 JS。
5. **M6-1 的 `--shell-*` 与旧页面 token 并存**：本页已尽量走 M6-1 外壳语言，页面内仍有旧 `variables.css` 名；后续页面卡继续迁移，不在本卡全量清扫。

## 5. 截图

`docs/_reviews/M6-2/screens/`：`home-{light,dark}-{1440,1024,390}.png`。
