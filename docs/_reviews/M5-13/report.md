# M5-13 · N-1b 文章系列导航与内容回填

- 卡：`t_3943016c`（依赖 M5-12 = N-1a；WIP=1）
- 决策：**D-0146**（文章页系列导航形态 + 回填策略）
- 分支：`zcblog-v2` 的 `main`；commit 见卡 metadata
- 结论：**PASS**。有 `series` 的文章页出现「系列名 + 目录（当前篇高亮）+ 上下篇」，
  无 `series` 的文章**零 DOM**；内容仓回填 2 个教程系列共 6 篇，真实构建（477 页）里
  `/series/` 与两篇目录页都已生成；JS 增量 **0**，article HTML p95/最差均未变。

## 1. 文章页系列导航（`src/components/Series/SeriesNav.astro`）

结构（全部服务端渲染，**零客户端 JS**）：

```
<nav class="series-nav" data-series="sing-box" aria-label="系列导航 · Sing Box">
  ├ head      系列 · 专栏 / Sing Box（→ /series/sing-box/） / 第 03 / 03 篇
  ├ ol.list   <li> 01 标题…  02 标题…  03 标题（aria-current="page"，不可点）
  └ pager     系列上一篇 / 系列下一篇（按 seriesOrder 相邻，首末篇只出一侧）
```

- **挂载点**：`MarkdownLayout.astro` 里紧贴 `<PostFooter>`，`.post-footer + .series-nav`
  是直接相邻兄弟（e2e 据此断言「没有空壳包装元素」）。位置在标签/版权之后、分享条之前 ——
  读者看完正文与出处分区，顺着系列地图走向下一篇，不需要回顶部。
- **零系列零 DOM**：是否渲染由布局层决定 —— `frontmatter.series ? seriesContextOf(...) : null`，
  falsy 时连聚合函数都不跑，Astro 不会输出任何 `.series-nav` / 包裹 `div`（对比「渲染后 `hidden`」）。
- **排序只有一处**：`seriesContextOf(posts, id)`（`src/utils/series.ts` 新增）内部调用
  `collectSeries` —— 与 `/series/<slug>/` 目录页同一份分组与排序（seriesOrder → pubDate → slug），
  文章页的「下一篇」不可能与目录页的下一张卡不一致。
- **边界**：首篇 `prev=null`、末篇 `next=null`、单篇系列两侧都 null → 整个 `.series-nav__pager`
  不输出；当前篇是 `<span aria-current="page">`（不是指向自身的链接）。
- **i18n**：`series.navAria / progress / prevInSeries / nextInSeries` 中英双语齐平
  （`verify-i18n` 8/8 PASS）。进度用 `seriesTotalLabel()` 补零，避免「第 03 / 3 篇」这种半截补零。
- **样式**：`src/styles/pages/article.css` 新增 `.series-nav*`（只消费 tokens，0 hex）。
  刻意**不铺底色** —— `--color-bg-sunken` 上的 `--color-fg-muted` 只有 4.41（light）/ 4.24（dark），
  12px 小字过不了 AA（同 `.share-label` 的坑）；改为留白 + 上下细线，文字全部落在 surface 上
  （muted 4.87/4.71，accent 6.04/4.72）。
- **不改变正文渲染**：只在正文之外加一块导航；`data-fancybox-off`、Toc、分享、相邻文章导航均未触碰。

## 2. 内容回填（幂等 · 先 dry-run）

工具：`scripts/series/backfill-series.mjs` + 编辑计划 `scripts/series/series-map.json`。

四条规则：默认 dry-run（`--apply` 才写盘）／已写且一致 = `noop`／已有值不一致 = `conflict` 只报告
不覆盖（进程 1 退出）／只插 `series` + `seriesOrder` 两行（插在 `upDate` 之后，正文与其余键序不动）。

| 系列 | `series` | slug → 顺序 |
| --- | --- | --- |
| sing-box 三部曲 | `sing-box` | `debian-sing-box-proxy-pitfalls` 1 / `sing-box-client-multi-node-config` 2 / `sing-box-docker-deploy` 3 |
| Hermes Agent 实操 | `hermes-agent` | `hermes-agent-memory-optimization` 1 / `hermes-memory-cleanup-backup` 2 / `hermes-agent-supabase-security-fix` 3 |

- 顺序按**发布顺序**（也是阅读顺序），不是随便编号；两组的标题/副标题里本来就写着前后文关系。
- 幂等证据：`--apply` 后立即全量二次 dry-run → `add=0 noop=6`；脚本内置「写盘后重算一遍必须是 noop」。
- 冲突证据：把夹具文章改名成计划里的文件名跑一遍 → `conflict`、文件 md5 不变、退出 1。
- 写入范围：内容仓 `~/Documents/WebSiteCode/zcblog-articles`（源，6 文件 `M`）与本地 `src/content/article`
  （gitignore 的构建副本，同样 6 文件）。**内容仓按用户既定边界未 commit**，见 §6。
- 只回填了两个「已确认的教程系列」；affine / rustdesk / VPS 初始化等候选没动 —— 那需要编辑判断，
  属于下一轮内容工作，不塞进本卡。

## 3. 验收对照

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 1. 有系列渲染导航，无系列零空壳 | **PASS** | 真实构建 `dist/article/sing-box-docker-deploy/` 有 1 个 `.series-nav`；`bitwarden` 等无系列页 `grep -c series-nav` = 0；e2e「零 DOM」用例断言 `.series-nav` / `[data-series]` 均 0 |
| 2. 上下篇边界正确、顺序稳定、目录链接可达 | **PASS** | e2e 三态：首篇只有「下一篇」、末篇只有「上一篇」、单篇系列无翻页区；目录顺序 = `seriesOrder`（夹具首篇 pubDate 反而更晚）；点系列名真跳到 `/series/self-hosted/`（swup 路径） |
| 3. 新增 e2e ≥2 条 | **PASS（5 条）** | `e2e/series.spec.ts` §5：首篇 / 末篇 / 单篇系列 / 无 series 零 DOM / 英文标签；套件 15 passed |
| 4. article HTML 最差 ≤215KB、p95 不超；JS +0 | **PASS** | 见 §4：p95 148.4KB、最差 185.3KB（均与 M5-10 收口值一致），nav 块 1.45–1.76KB；JS p95 38.6KB 不变 |
| 5. `gates:all` PASS、`unclassified=0`、demo 118 页不回归 | **PASS** | 见 §4 |

## 4. 门禁与预算读数（本机，最终代码）

```
verify-atoms              18/18 PASS
verify-atom-docs          8/8 PASS
verify-component-inventory RESULT PASS atoms=12 ui=23 page-organisms=11 layout=1 dup=0 total=47
verify-doc-drift          RESULT PASS mismatch=0 文档=12 对比度行=49
check-tokens              10/10 PASS
verify-surface-tokens     RESULT PASS pages_hits=2(legacy frozen, new=0) new_hits=0 baseline=41/84
verify-entities           exit 0
verify-package-boundary   RESULT PASS packages=3 violations=0 theme_version=2.1.2
verify-overlay            RESULT PASS classified=1261 unclassified=0 theme=824 overlay=302 exclude=135
verify-icon-sprite        8/8 PASS
```

性能预算（`scripts/gates/perf-budget.py dist`，749 页，**超预算 0 页**）：

| 类型 | 页数 | HTML p95 | JS p95 | CSS p95 | 门禁 h/j/c | 最紧余量 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| article | 85 | 148.4 KB | 38.6 KB | 34.4 KB | 215/40/45 | +0.9 KB (2.2%) |
| list | 286 | 59.4 KB | 24.5 KB | 27.7 KB | 105/28/40 | +2.8 KB (10.0%) |
| page | 378 | 54.2 KB | 24.5 KB | 29.2 KB | 105/30/40 | +0.3 KB (1.0%) |

- **JS 增量 0**：`<script>` 一个没加（纯静态 `<nav>` + `<ol>`，无折叠交互）。
- article HTML：p95 148.4KB、最差 185.3KB（`article/expressive-code/`）与 M5-10 收口值**完全一致**
  （系列文章增量被 p95/最大值掩盖：nav 块实测 1.45–1.76KB/篇）。
  系列文章里最大的一篇 `sing-box-docker-deploy` = 176.3KB，仍在预算内。
- CSS p95 34.0 → 34.4KB（+0.4，门限 45）：`article.css` 新增约 190 行 `.series-nav*`，全站共一份。

其它：真实构建 **477 页**（M5-12 时 474，+3 = `/series/` + `/series/sing-box/` + `/series/hermes-agent/`；
英文无系列，`/en/series/` 不生成）；`verify-build` 全绿（85 篇文章 / 89 篇内容）；
demo `RESULT PASS html=118 layers=theme:509/baseline:28/shim:13/overlay:9`；
`astro check` 0 errors / 0 warnings / 6 hints（基线不变）；`tsc --noEmit` 0；prettier `--check .` 通过；
单测 14 文件 / **163 tests**（+8：`seriesContextOf` 7 条、`seriesTotalLabel` 1 条）。

## 5. e2e 设计

`e2e/series.spec.ts` 新增 `文章页系列导航` 描述块（夹具复用 M5-12 的 5 篇，不新增文件）：

1. **首篇**：`.post-footer + .series-nav` 相邻、`data-series`、进度「第 01 / 02 篇」、目录两项
   （marker 01/02、当前项 `aria-current="page"`、当前项无可点 href）、首篇无 `prev`、
   `next` 指向 `/article/series-step-two/`，最后**真点击**系列名走 swup 到 `/series/self-hosted/` 并断言目录页可见。
2. **末篇**：「第 02 / 02 篇」、当前项 `data-position="02"`、有 `prev` 无 `next`。
3. **单篇系列**：目录 1 项、当前即它、`.series-nav__pager` 0 个（不是空 div）。
4. **无 series**：`.series-nav` / `[data-series]` / 相邻空壳全部 0，正文 `.article-content h2` 照常渲染。
5. **英文页**：`Part 01 of 01`、系列链到 `/en/series/self-hosted/`、无翻页区。

冷却提示：preview 冷启动首跳会慢，系列目录点击的 `waitForURL` / 可见性断言显式给 15s
（默认 5s 在本机偶发超时，会把「链接可达」测成假红）。实测 `pnpm series:e2e` = **15 passed**。

## 6. 边界与遗留

- 内容仓（`Smart-Chou/zcblog-articles`）6 个文件已改但**未 commit / 未 push** ——
  用户既定边界是「网站内容仓不代提交」。落地顺序：人工 review 这 6 个 2 行 diff → 提交推送 →
  deploy.yml 下次构建即产出 `/series/`。在此之前生产站不会出现系列页。
- 本地 `src/content/article` 是 gitignore 的构建副本，已同步同样 6 个字段，仅影响本机构建。
- 审计中发现两处**既有**（与本卡无关、未修）的文章页问题，登记备查：
  1. 正文 blockquote 内联 `code` / 链接对比度 4.38 / 3.97（axe serious ×10，全部在正文引用块，
     文章页不在 A8 的 5 页 axe 基线内）；
  2. 390 宽下 `sing-box-docker-deploy` 有 36px 横向溢出，来源是正文里的长行内 token
     （`~/Library/Application Support/`）；删掉 `.series-nav` 后 `scrollWidth` 不变（426），
     证明与本次改动无关。
- 未做（明确不在本卡）：导航栏系列入口、系列 RSS、系列 OG 图、affine/rustdesk 等其余候选系列的回填。

## 7. 视觉复核

截图：`~/.hermes/cache/scratch/zcblog-m5-13-shots/`（article-series light/dark × 1440、390 + 无系列对照）。
探针（DOM，不靠肉眼）：nav 可见宽高 780×365（1440）/ 317×418（390）、`afterFooter=post-footer`、
无系列页 `seriesNav:false`。
