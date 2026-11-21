# H-11 · 页面级视觉基线改为 CI-only 门禁

**日期**：2026-11-20
**结论**：采用方案 A。`maxDiffPixelRatio` **未放宽（仍 0.001）**，改的是「谁跑它」。

---

## 1. 为什么是 A 而不是 B

原登记给的三个方案里，B（放宽阈值）看起来最省事：把 `pages` 的 macOS 阈值
从 0.001 调到 0.002–0.003，本地就绿了。**实测证明这条路是错的。**

复现命令：

```bash
node scripts/visual/build-pages-baseline.mjs
playwright test e2e/pages.visual.spec.ts --project=chromium-pages --retries=0
# → 18 failed / 24 passed (2.3m)，全部是 home / archives / 404 × 3 视口 × 2 主题
```

### 实测 diff 比例（关键数据）

失败时 Playwright 输出的实际差异比例：

| 比例 | 出现次数 |
|---|---|
| 0.01 | 3 |
| 0.02 | 1 |
| 0.03 | 2 |
| 0.04 | 3 |
| 0.05 | 4 |
| 0.06 | 5 |
| 0.13 | 1 |
| 0.15 | 1 |
| 0.17 | 1 |

**范围 1% – 17%，阈值是 0.1%。** 差 10 – 170 倍。
放宽到 0.003 只能救其中 3 条，要全绿得放宽到 0.17 —— 那已不是门禁，
而是「任何变化都放行」。

## 2. 根因不是字体 AA，是字体替换

登记时把它概括成「macOS 与 CI Linux 容器的字体栅格化差异」。**这个描述不够准确。**

**证据一：页面高度不同。**

```
home-dark-375-expected.png  (375, 3270)   ← CI Linux 容器生成
home-dark-375-actual.png    (375, 3296)   ← macOS 本地
```

差 **26 px**。子像素抗锯齿差异不会改变整页高度；行盒变高才会。

**证据二：diff 图上元素出现「上下两份轮廓」。**
用 `vision_analyze` 看 `home-dark-375-diff.png`：站点头部、文章卡片、
每个板块标题、页脚全部呈现上下错开的双份高亮 —— 这是内容流整体下移的典型形态，
不是边缘噪点。

**证据三：两边用的字体根本不同。**
看 CI 生成的 `expected.png`（`vision_analyze`）：中文是**宋体**（Noto Serif CJK），
西文是 **DejaVu Serif** —— 全是衬线体。
而站点字体栈 `--font-body` 指定的是 `PingFang SC` / `Microsoft YaHei` 这类**无衬线**中文字体。

**CI 容器 `mcr.microsoft.com/playwright:v1.65.0-noble` 里这些字体一个都没装**，
所以全部 fallback 到系统衬线。macOS 本地有 PingFang，两边渲染的是不同字体，
行高与字宽都不同 → 整页高度差 26px → 每个元素都位移 → 1%–17% 差异。

**所以这 18 条红与代码无关，且靠调阈值无法「修好」——只能调宽到失去意义。**

## 3. 落地内容

### 3.1 明确它是 CI-only 门禁

`e2e/pages.visual.spec.ts` 无法「跳过本地运行」——Playwright 的 project 配置
决定谁跑它。所以落地方式是**把这条纪律写进两处**：

1. `playwright.config.ts` 的 `pages` / `pages-states` 项目注释（改的是注释，
   不是阈值 —— 阈值一个字没动）
2. `README` / 本地开发说明：页面级视觉只在 CI 跑

### 3.2 判据没放宽

```diff
  expect: {
      toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: "disabled" as const },
  },
```

**这行没改。** 改的是「不要指望本地能预判它」。

## 4. 遗留与备选

- **方案 C（Linux 容器本地跑）**：与 CI 完全同栈，能真正解决「本地预判」需求。
  代价是要装 Docker + 拉 2GB 镜像。当前不做，登记备选。
  若将来需要本地调试页面级视觉，这是**唯一正确**的路 —— 而不是调阈值。
- **`design-atoms` 那套 72 张在本地是绿的**：因为它们是元素截图（小尺寸，
  字体替换影响有限），不受本问题影响。所以「本地视觉全绿」不等于「页面级也绿」。
- **文章页在两种构建下都不失败**：说明问题集中在 `home`/`archives`/`404` 这类
  信息密度高的页面（大量文本节点，字体替换的累积位移最明显）。

## 5. 一条方法教训

我最初倾向 A 的理由是「偏好」，不是证据。真正让结论站住的是三件事：
① 逐条取出实际 ratio（1%–17%）；② 对比 PNG 尺寸（3270 vs 3296）；
③ 看 `expected.png` 里的字体（全是衬线 fallback）。

**「差一点点，放宽阈值就好」是最诱人的错误结论。先量化差多少，再谈放宽。**
