# M6-3 · 文章详情页重做（toc + mobile_article_detail）

- 卡：`t_5080b864`（blog2 板）· 2026-11-08
- 基线：`main` @ `49581a6`（M6-2 收口）
- 输入：`selection.md` §4.2；桌面 `screens/marx_s_blog_toc`，移动 `screens/marx_s_blog_mobile_article_detail`，暗色参考 `screens/marx_s_blog_1`，抽屉 `screens/marx_s_blog_slide_over_toc_sheet`
- 提交：`48e30e9` feat(m6-3) · 本报告
- 说明：attempt 1 在 150 次迭代预算处超时（改动已落工作区），attempt 2 接手：**把验收清单里剩下的门禁全部重跑**（build/perf-budget、gates、type-check、pages-article、macOS+Linux 视觉基线），并补了 attempt 1 未完成的三件事 —— Linux 基线、1024 暗色证据图、移动抽屉 e2e。本报告的数字全部是 attempt 2 实跑结果，不引用 attempt 1 自述。

## 1. 改动（6 个源文件 ≤ 停点 10）

| 文件 | 内容 |
|---|---|
| `src/layouts/MarkdownLayout.astro` | `.post-layout` 8/4 骨架（`.post-main` / `.post-rail`）；移动 `.post-toolbar` 里「目录 N」触发按钮（`popovertarget="post-toc-drawer"`）；评论壳挪进主栏底部；相关阅读 `<RelatedPosts variant="rail">` 放正文末尾；右栏 `.post-rail__sticky` = 目录卡 + 作者卡 |
| `src/components/Article/Toc.astro` | 目录卡（构建期渲染，D-0082 不变）+ 右侧 `popover` 抽屉；删掉脚本里「fixed/absolute 贴底」的定位逻辑（改纯 CSS sticky）。类名指纹 `.toc` / `.toc-content` / `.toc-list(-item)` / `.toc-link` / `.post-toc__title` 全部保留（tocbot、axe 作用域、e2e 依赖它们） |
| `src/components/Article/RelatedPosts.astro` | 新增 `variant="rail"`：竖排条目（缩略图 + 标题 + 日期），桌面/移动同一套 DOM |
| `src/utils/toc.ts`（新，39 行） | `tocNodes()`：目录树与节数唯一口径，桌面卡与移动按钮计数共用，避免两处各算一遍 |
| `src/styles/pages/article.css` | +506 行：8/4 版式、目录卡、抽屉（含遮罩、动画）、作者卡、相关阅读竖排、断点 1023/1024 严丝合缝 |
| `src/styles/toc.css` | `.toc` 去掉 `position: fixed` 与 `≤1280 隐藏`（sticky 由版式承担） |

测试/基线侧（不属于源文件计数）：`e2e/pages-article.spec.ts`（+119）、`e2e/pages.visual.spec.ts`（KNOWN_OVERFLOW 清空）、`e2e/__screenshots__/pages{,-linux}/article-*.png`（12 张重生成）。

没有改 `src/pages/**`、路由、内容 schema、`packages/tokens/tokens.json`、字体、`package.json`（0 新增依赖）。

## 2. 版式要点（实测，含滚动条差值）

| 视口 | 主栏 | 右栏 | 目录卡 | 文档级横向溢出 |
|---|---|---|---|---|
| 1440 | **707** @x=167 | **353** @x=905 | 353×501，sticky top=**88**（滚 4000px 后仍是 88） | −15（= 经典滚动条） |
| 1024 | **619** @x=24 | **310** @x=675（不折叠） | 可见 | −15 |
| 390 | **355** @x=10（单栏） | 静态目录卡 **0×0**（不可见，DOM 仍在） | 触发按钮 99×36「目录 8」 | −9 |
| 375（视觉门禁视口） | 340 | — | — | **−2**（M5-11 冻结的 `article@375: 16` 已清零） |

- **长表格**：正文最宽表格 640px，落在 340px 的容器里 —— 表格自身 `overflow-x: auto`（client 340 / scroll 640），祖先盒 `scroll 363 / client 340` 只多出的 23px 落在页面右内边距里，文档 `scrollWidth` 仍小于 `clientWidth`。代码块同口径（`pre` overflow-x auto）。因此 `KNOWN_OVERFLOW` 从 `{article@375: 16}` 改为 `{}`，门禁对全部页面/视口要求 ≤1px。
- **移动抽屉**：390 下 `popover` 面板 x=**32**、宽 **343**、右沿贴可用视口（差 15px = headless 的经典滚动条；真机 overlay 滚动条为 0），遮罩为 `::backdrop`。Esc 关闭后 `document.activeElement` 回到 `.post-toc-trigger`（e2e 断言），点遮罩 light-dismiss，**0 行新增 JS**（全部是 HTML `popover` 的声明式行为）。
- **相关阅读位置**：留在正文末尾（rail 版式），不塞进右栏 —— 900px 高的视口装不下「目录 + 作者 + 相关」三块吸顶卡，稿子本身也把相关阅读放在正文后。

## 3. 验证（attempt 2 在 macOS 15.7.7 / node 26.0.0 实跑）

```text
pnpm run gates:all          exit 0
  atoms=12 ui=23 page-organisms=11 layout=1 dup=0 total=47
  文档对比度行 49 · packages=3 violations=0 · overlay unclassified=0（1279）
  icons 8/8 PASS（sprite 70 <g>）
pnpm run gates:surfaces     PASS  new_hits=0 · pages_hits=2(legacy frozen) · baseline 41/84
pnpm run type-check         exit 0
pnpm run build:ci           477 页（2m39s）
python3 scripts/gates/perf-budget.py dist
  749 页扫描 · over=0 · a7_missing=[]
  p95  HTML 149.6/60.3/55.1 · JS 38.4/24.5/24.5 · CSS 36.6/28.9/30.4 KB
pnpm exec playwright test e2e/pages-article.spec.ts        23 passed / 5 skipped
pnpm exec playwright test e2e/design-atoms.visual.spec.ts e2e/pages.visual.spec.ts
  macOS 108 passed（72 atoms + 36 pages，连跑两次）
docker playwright:v1.63.0-noble  pages.visual                 36 passed（连跑两次）
```

- **JS 增量 0**：三类页面 JS p95 `38.4 / 24.5 / 24.5 KB` 与 M6-2 的 `38.6 / 24.5 / 24.5` 同量级（无新增脚本，`MarkdownLayout` 里的 4 个 `<script>` 全是既有的 markmap/chart/reveal/tabs 条件脚本）；抽屉的 Esc、焦点回填、遮罩关闭都交给浏览器原生 `popover`，`Toc.astro` 没有新增客户端代码。
- **无 JS 仍可读**：`javaScriptEnabled:false` 下，桌面目录卡可见可跳（原 D-0082 用例），移动**抽屉也能开**（`popovertarget` 是声明式的）、29 条 `.toc-link`、点 `#准备工作` 落到 `top=99.9px`（新用例）。
- **移动抽屉 e2e（新增 2 条）**：① 390 静态目录卡不可见（0×0 / display:none / visibility:hidden 任一）+ 触发按钮带 `popovertarget` + 打开后 29 条目录 + 贴右沿 + Esc 关闭 + 焦点回填 + 点遮罩关闭；② 无 JS 下抽屉可开且锚点跳转生效。
- **Linux 基线不是 macOS 冒充**：容器内 `pages-linux` 与仓库内 36 张 PNG `diff -rq` **完全一致**（0 像素差，对得上 CI 的 `maxDiffPixels 0`）。基线是在 `mcr.microsoft.com/playwright:v1.63.0-noble` 里生成的，并在格式化后**用同一批 PNG 复跑**仍然 36 passed。
- **只有 article-* 基线变了**：`git status` 里 6 张 macOS + 6 张 Linux 全是 `article-*`，home/archives/albums/culture/projects 一个像素没动 —— 本卡没有泄漏到其他页面。
- **Prettier/格式**：改动文件 `prettier --check` 全绿（格式化后重跑了 type-check、pages-article、108 张 macOS 视觉，均无像素漂移）。

## 4. 与 `selection.md` §4.2 / 卡片正文的偏差

1. **卡片说「保留现有 `Toc.astro` 的 no-JS `<details>` 兜底」——原代码里并没有 `<details>`**：`git show HEAD:src/components/Article/Toc.astro | grep -c '<details'` = 0。页面上的 7 个 `<details>` 来自 expressive-code 的代码折叠，不是目录。无 JS 兜底改由「构建期渲染整棵目录 + 声明式 `popover`」承担，并新增无 JS e2e 覆盖（桌面 + 移动）。这一点 attempt 1 也发现了，此处确认并落为测试。
2. **抽屉没有写自定义 JS**：稿子的滑出抽屉用 `popover` + CSS 过渡实现，Esc / 焦点回填 / 遮罩关闭全部是浏览器原生行为。代价是抽屉动画只能用 `popover` 的 `@starting-style`/`transition` 表达，不能做横向拖拽关闭 —— 换来了「JS 增量 0」这条硬约束。
3. **相关阅读放正文末尾而非右栏**：见 §2 说明（900px 视口放不下三块吸顶卡，且稿子本身也在正文后）。
4. **移动端没做底部 tab bar、也没做 A-/A+ 字号工具**：两者都是新组件（字号工具还要写 localStorage + 改 `--text-base`），超出「只换皮 + 复用 M6-1 原子」的范围；移动端沿用 M6-1 的页头菜单 + 页脚入口。仓库里当前没有任何字号切换实现（`grep -rn "text-base\|A+" src/components/Article src/layouts` 为空）。
5. **评论只挪位置**：`.post-comments` 移到主栏底部，`WalineComment` 组件与 provider 完全没动（交互归 M7-2）。
6. **测试侧的两处修正（都在 M6-3 责任范围内）**：
   - `KNOWN_OVERFLOW` 清零（卡片明确要求「M6-3 负责把 KNOWN_OVERFLOW 降到 0」）。
   - 修正 `分享弹层关闭态` 用例的假红：它只排除 `http://localhost:4321`，而 baseURL 是 `127.0.0.1`，同源 chunk `feature.DkFqrIlh.js` 的哈希里带 `qr` 被判成第三方 QR 服务。改成按 `page.url()` 的 origin 排除同源，判据（零第三方 QR 服务）不变。

## 5. 截图

`docs/_reviews/M6-3/screens/`（真实内容构建，`reducedMotion: reduce`，第三方请求全部拦断）：

- `m63-{1440,1024,390}-{light,dark}.png` —— 6 张首屏
- `m63-drawer-{light,dark}.png` —— 390 抽屉展开
- `m63-scroll.png` —— 1440 滚 4000px 后目录仍吸在 88px
- `m63-end.png` —— 1440 页尾（相关阅读竖排 + 评论壳）

## 6. 遗留

- 移动底部 tab bar、字号 A-/A+、目录归档/系列入口：按计划属后续页面卡或 M7。
- 右栏在 1024 仍显示（稿子也是双栏）；若要 768 收单栏，需要另立卡决定断点语义（现在 1023/1024 严格对齐 M6-1 外壳断点）。
- `perf-budget` 的 article JS 余量只剩 +1.1KB（2.8%）：本卡没加 JS，但下一张动文章页脚本的卡要盯这条。
