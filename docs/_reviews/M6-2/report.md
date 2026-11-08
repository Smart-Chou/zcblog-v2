# M6-2 · 首页重做（marx_s_blog_2）

- 卡：`t_04407aa0`（blog2 板）· 2026-11-08
- 基线：`main` @ `54fd07b`（M6-1 收口）
- 输入：`selection.md` §4.1；桌面 `marx_s_blog_2`，移动 `marx_s_blog_mobile_home`
- 提交：`6654229` 首页重做 · `ae34489` 证据截图固定打字机 · `c4fcc6e` 证据图更新 · 本报告修正
- 说明：worker 在 150 次迭代预算处超时（改动已落工作区），operator 复核收口；本报告的数字均由收口人**重新跑过**，不引用 worker 自述。

## 1. 改动

| 文件 | 内容 |
|---|---|
| `src/styles/pages/home.css` | 首页 6 区块视觉语言：Hero（赤陶短横 + 衬线大标题 + 等宽统计）/ 作者卡 / 8-4 栅格 / 区块头（竖条 + 无衬线标题 + 等宽链接）/ FEATURED 实底胶囊 / 文章卡 / 4 格照片 / 随笔便签 / 热门 01–05 leaderboard / 侧栏卡；≤1023 单栏并隐藏热门与友链 |
| `src/components/Index/Talk.astro` | 首条随笔在构建期 SSR 出来（无 JS / 脚本未到时不再是空白卡），ticker 仍接管轮换；**0 新增客户端 JS** |
| `e2e/pages-home.spec.ts` | 证据截图用例补「停打字机并写回首句」，避免证据图停在半句（仅 `HOME_SHOTS=1` 时运行） |
| `e2e/__screenshots__/pages/home-*.png` | 6 张 macOS 首页基线（1280/768/375 × light/dark） |
| `e2e/__screenshots__/pages-linux/home-*.png` | 6 张 Linux 首页基线（`mcr.microsoft.com/playwright:v1.63.0-noble` 内生成） |
| `docs/_reviews/M6-2/screens/` | 1440 / 1024 / 390 × light/dark 共 6 张证据图 |

没有改 `src/pages/**`、路由、数据 schema、`packages/tokens/tokens.json` 的 palette、字体与 JS 模块。

> 回退说明：收口过程中曾把旧 `.home-page .section-link` 的两处 token 改成语义色，复查发现 `.home-page` 在构建产物里 **0 命中**（`grep -c home-page dist/index.html` = 0，全站只有 `/design/components/friendcard/` 的代码示例里出现），属死选择器，已 `git checkout` 回退，不进 diff。

## 2. 版式要点（实测尺寸，1440 内容宽 1092）

- 桌面：1140 shell 内 8/4 栅格 = 主栏 **707** / 侧栏 **353**，gap 32；区块头竖条 3px，内容盒 167→1259。
- 1024：主栏 **619** / 侧栏 **310**；≤1023 收成单栏（实测 390 无第二列）。
- 区块高度（light 1440）：hero 636 · posts 1161（featured 251）· photos 263 · talk 125 ｜ popular 589 · culture 497 · friends 363 —— 6 个区块都不是空壳。
- 移动（390）：`popular` / `friends` 计算样式 `display:none`（0×0，不占位、不参与栅格），其余四块照常；页脚保留两个入口。
- FEATURED 用 `accent-solid` + `on-accent` 实底胶囊（light/dark 的对比度数值见 `packages/tokens` 的对比度表），不用 `color-mix` 浅底：暗色下浅赤陶底 + accent-400 只有 3.5:1，axe 会判 serious。
- 照片 EXIF 白条改用 `object-fit: cover` + `object-position: center top`，保留裁切语义，768 档 `<img>` 不再越界。

## 3. 验证（收口人在 macOS 15.7.7 / node 24.13 / 固定夹具重跑）

```text
pnpm run gates:all          exit 0
  atoms 12 / ui 23 / page-organisms 11 / layout 1（total 47，dup 0）
  文档对比度行 49 · 组件盘点 PASS · overlay unclassified=0（tracked 1272）
  icons 8/8 PASS（sprite 70 <g>，hash 一致）
pnpm run gates:surfaces     PASS  new_hits=0 · baseline 41/84
pnpm run type-check         exit 0
pnpm run build:ci           749 页
python3 scripts/gates/perf-budget.py dist
  over=0 · a7_missing=[]
  p95  HTML 149.2/60.3/55.1 · JS 38.6/24.5/24.5 · CSS 35.7/29.0/30.5 KB
pnpm exec playwright test e2e/pages-home.spec.ts     15 passed / 6 skipped
pnpm exec playwright test e2e/pages.visual.spec.ts   36 passed（macOS，连跑两次）
docker（playwright:v1.63.0-noble）同上               36 passed（Linux）
```

- **JS 增量 0**：三类页面 JS p95 `38.6 / 24.5 / 24.5 KB` 与 M6-1 / M5-13 报告逐项相同；首页 `<script src>` 仍只有 `page` + `Search` + 2 个 BaseLayout 模块（gzip 16,945 / 1,703 / 1,074 / 3,161 B），没有新增脚本，也没有新增内联脚本。
- **Tab 顺序**：真实内容构建下 `visited=53/53 unreachable=[]`，页面内容焦点环颜色偏差 0（chrome 的 Header/Footer 不在本卡边界）。
- **CLS**：`[cls] home @1440 = 0.0000`（load 后 2s，PerformanceObserver）。
- **LCP（真实图片，PerformanceObserver candidates）**：1440 = featured 封面 33,960px² @388ms；1024 = featured 封面 32,639px² @316ms；390 = featured 封面（343×168 ≈ 57.6k px²）@196ms；`h1.hero-title` 分别在 368 / 236 / 172ms 到达。三档 LCP 都是首屏首图，没有为了「LCP = 标题」去改字号或压图。
- **横向溢出 0**：1440 `scrollWidth 1425 / clientWidth 1440`、1024 `1009 / 1024`、390 `375 / 390`（差值 = 滚动条），`overflow` 违规元素数组为空。
- **Linux 基线不是 macOS 冒充**：容器内 `bin/pages-linux` 与仓库内 6 张 home 基线 `diff -rq` **完全一致**（0 像素差，与 CI 阈值 `maxDiffPixels 0` 对得上）。

### 已知假红（不复现为产品缺陷）

`e2e/pages-home.spec.ts` 的「Tab 顺序 + 焦点环」在**固定夹具构建**（`pnpm run visual:build:pages`，6 篇冻结文章）下偶发红：第 5 个可聚焦元素是 header 的主题按钮，但 Tab 落到一个不带 `data-kbd` 的 `<a>` —— pagefind 触发器在快照之后被升级、节点被替换。同一份代码用 `pnpm run build:ci`（749 页真实内容）跑两次均 `15 passed`，`visited=53/53`。夹具构建是给像素基线用的，功能 e2e 应跑真实构建，已在报告标注，未改测试阈值。

## 4. 与 `selection.md` §4.1 的偏差

1. **移动端「不渲染」 Popular / Friends 实为 `display:none`**：静态站构建期无法判视口，单份 HTML 只能靠媒体查询隐藏；两块的取数都在构建期（`Popular`/`Friends` 走 content collection，0 客户端请求），所以「省 2 个请求」这条前提本来就不成立，视觉结果与稿子一致。
2. **移动底部 tab bar 未做**：稿子有，但它是新组件，超出「只换皮 + 复用 Index/*」边界；移动沿用 M6-1 的页头菜单 + 页脚入口。
3. **Hero 多一行打字机 slogan**：稿子没有这一行，但 `TypewriterText` 是现站组件且 LCP 文案随 HTML 到达（D-0087），删它会掉内容，保留且不加 JS。
4. **随笔块的位置**：稿子把「状态条」放在作者卡下方（hero 内），本卡按现有 6 区块结构放在主栏第 3 块（`Talk` 在 `Photos` 之前）；Hero 的 AI 声明条仍由 `Notice.astro` 承担，没做新组件。
5. **照片 EXIF 的实现**：保留 M2-2b 的裁切目标，但用原生 `object-fit` 代替 133% 位移技巧，修掉 768 档 `<img>` 越界。
6. **首条随笔 SSR**：`Talk` 原来初始 `<ul>` 是空的，JS 未到位就是空白卡；现在构建期渲染首条（可访问性兜底，不新增 JS）。
7. **测试侧新增**：证据截图用例加「停打字机」两行逻辑（仅 `HOME_SHOTS=1`），不参与 CI 断言。

## 5. 截图

`docs/_reviews/M6-2/screens/`：`home-{light,dark}-{1440,1024,390}.png`（6 张，真实内容构建，`reducedMotion: reduce`，打字机停在第 1 句）。

## 6. 遗留

- 移动底部 tab bar、移动精选分类胶囊、相册/灯箱、评论抽屉：按计划属 M6-3 起的页面卡。
- 页面内仍并存旧 `variables.css` 的 token 名与新语义 token；本卡只换首页皮，不做全站清扫。
