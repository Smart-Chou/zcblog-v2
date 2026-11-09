# M8-6 · 六页视觉重做 · FE 工作量估算与预算结论

> 卡：t_e5fe4abf（blog-fe）｜产出目标：把 4 人日原始预算拆到 6 页 + 1 张地基卡，验证可行性
> 性质：**估算与风险评估**，本轮不改任何页面样式（工作区另有未提交的 M7-4b 代码，与本文件无关）
> 估算口径：1 人日 = 8 h；数值是「实现 + 空态 + 移动断点 + e2e/截图收口」的净工作量，不含设计出稿与 QA 基线生成

---

## 0. 一页结论

**预算不够。** 7 项合计 **62 h ≈ 7.75 人日**（区间 6.5–9.5），原始预算 **4 人日（32 h）**，缺口 **30 h ≈ 3.75 人日（超 94%）**。

- 4 人日最多覆盖 **地基卡 + 3 个低风险页**（赞助 / 系列 / 随笔），游戏 / 文化 / 移动页必须顺延或加预算。
- 地基卡本身**能**被 4 人日覆盖（1.5 人日），但覆盖后只剩 2.5 人日给 6 个页面 = **0.42 人日/页**，是本仓同类页面历史报价（1.67–3.0 人日/页）的 **1/4–1/7**。
- 推荐方案 C：地基卡移出 M8-6 与 M8-1/M8-2 共担，M8-6 记 **6.25 人日**，分两批（批一 4.0 用满原预算，批二 3.75 追加）。

---

## 1. 估算方法：先用本仓历史价格校准，再逐页落数

| 参照卡 | 内容量 | 预算 | 单价 |
|---|---|---:|---:|
| M6-2 首页 | 1 页（6 区块）+ 移动 + 双平台基线 | 2.5 | 2.5 /页 |
| M6-3 文章详情 | 1 页 + TOC 抽屉 + 移动 | 3 | 3.0 /页 |
| M6-4 归档 / 标签 | 2 路由共用一套 | 2 | 1.0 /路由 |
| M8-2 项目/设备/技能 | 3 页（新组件 + KPI + 筛选 + 空态） | 5 | **1.67 /页** |

→ 本仓「内容页视觉重做」的成交价区间是 **1.67–3.0 人日/页**。
→ M8-6 的 4 人日按 6 页 + 1 地基卡摊 = **0.57 人日/项**，是区间下限的 **1/3**，且这 6 页里有 4 页要做**结构重排**（不是换色）。

置信度定义：**高** = ±20% 内；**中** = ±20–40%；**低** = ±40% 以上（存在未定口径或数据缺口）。

---

## 2. 估算总表（页面 × 工作量 × 置信度）

| # | 卡 | 现状实现（实测） | 判定 | 估算 | 人日 | 置信度 |
|---|---|---|---:|---:|---|
| 0 | **地基层（共享组件）** | 4 套重复的 hero/section/empty 外壳（`entities-*` / `talks-*` / `donations-*` / `tags-hero`） | **新组件 + 新 CSS 命名空间** | 12 h | 1.5 | 中高 |
| 1 | **游戏 `/games`** | `pages/games/index.astro` 219 行 + `GameCard` 86 行 + `entities-b.css` 432 行（与 devices 共用）+ e2e 457 行；**卡片无封面/进度**（grep `img/progress` 0 命中）；`Game` schema **没有 `cover` 字段**（`types/entities.ts:236` 的 `cover?` 只属于 `MusicTrack`），种子数据只有 4 条示例 | **需重排结构** | 10 h | 1.25 | 中 |
| 2 | **文化 `/culture`** | 336 行页面 + `CultureCard` 99 行 + `culture.css` 272 行；当前是 3 张「入口卡」（bangumi / douban / music） | **需重排结构 + 可能补数据** | 12 h | 1.5 | 中低 |
| 3 | **随笔 `/talks`** | `TalksContent` 228 行 + `talks.css` 354 行（4 个 `@media`）；当前**单列** + 页内 topics | **需重排结构**（设计稿是 3.5 栅 sticky 两栏） | 8 h | 1.0 | 中 |
| 4 | **赞助 `/donate`** | `DonateContent` 254 行 + `donate.css` 283 行（2 个 `@media`）+ 现成 3 态与账本适配器；缺账本表、缺 FAQ | **改样式 + 2 个新块** | 6 h | 0.75 | 高 |
| 5 | **系列 `/series`** | zh 95 行 + en 84 行路由 + 3 个组件 229 行；**样式寄生在 `tags.css`（558 行 / 8 个 `@media` / 7 条路由共用）** | **改样式 + 抽 CSS** | 6 h | 0.75 | 高 |
| 6 | **移动页** | `BaseLayout` 239 行，**无底栏实现**（`tabbar/bottom-nav` grep 0 命中）；移动 4 稿 = home/article/albums/culture（`18-stitch-coverage.md`） | **新组件（全站级）+ 断点收口** | 8 h | 1.0 | 低 |
| | **合计** | | | **62 h** | **7.75** | 区间 6.5–9.5 |

### 逐页拆解（小时）

| 卡 | 结构/组件 | 卡片与内容 | 移动断点 | 空态/错误态 | e2e + 截图收口 |
|---|---:|---:|---:|---:|---:|
| 地基 | 8（PageHero 2 / SectionHead 1 / EmptyState 1.5 / Chip+FilterBar 2 / ProgressBar 1 / 命名空间文件 0.5） | — | 1.5（断点变量） | 0.5 | 2（演示页 + gates） |
| 游戏 | 2（筛选 + 分组） | 4.5（新 banner 卡 3 + 桌面拓扑 1.5） | 2 | 0.5 | 1 |
| 文化 | 3（三分区 + 追更轨） | 3（热力图，含数据口径） | 2.5（移动 4 段 snap） | 1 | 2.5 |
| 随笔 | 2.5（两栏 sticky） | 2（时间流重做） | 1.5（768–1024 降级横滑） | 1 | 1 |
| 赞助 | — | 4.5（支付卡 1.5 / 账本表 2 / FAQ 1） | 1 | 0.5 | 0（复用现有 4 态预览） |
| 系列 | 1.5（抽 `series.css`） | 2.5（系列卡 + 进度 + 篇目序号） | 0.5 | 0.5（0 系列 = 无路由，不建空态） | 1（/tags/ 回归核对） |
| 移动页 | 3（底栏 tab bar 组件） | — | 3（4 稿断点收口） | — | 2（基线重刷协调 + 证据） |

---

## 3. 地基卡单列：范围、工作量、是否被 4 人日覆盖

**做什么（只做 ≥2 页复用的）**

| 组件 | 复用面 | 说明 |
|---|---|---|
| `PageHero`（kicker / serif 标题 / lede / meta chips） | 6 页全部 | 现在有 4 套实现（`entities-hero`、`talks-hero`、`donations-hero`、`tags-hero`），改名不统一 |
| `SectionHead`（标题 + 右侧 meta） | 游戏 / 文化 / 随笔 / 赞助 | 同上，4 套重复 |
| `EmptyState`（图标 + 标题 + 说明 + 可选动作） | 游戏 / 文化 / 随笔 / 赞助 | 各页自带 `*-state` 复制品；`UI/EmptyState.astro` 已存在但 6 页没用 |
| `FilterBar`/`Chip`（可选中态） | 游戏（状态筛选）+ 随笔（topic 筛选） | 交互直接复用 `src/scripts/tab-nav.ts` 的 `data-tab` 事件委托，**不新增 JS 模块** |
| `ProgressBar`（`role=progressbar` 带可读值） | 游戏（进度）+ 系列（篇目进度） | 现站无此原子 |
| `pages/entities-c.css`（新命名空间） | 6 页 | 新类名只在这里落地，**不改 `entities.css` / `entities-b.css` 一条存量规则** |

**不做什么**：不改 palette / 字号阶梯 / 栅格（D-0148 已冻结）；不做双栏、纹理、HCT；不碰 `packages/tokens`；不把页面专属样式塞进地基卡。

**工作量**：12 h = **1.5 人日**（区间 1.0–2.0）。
**是否被 4 人日覆盖**：**是**（1.5 ≤ 4），但覆盖后只剩 2.5 人日 ÷ 6 页 = 0.42 人日/页 → **页面部分不可行**。地基卡不是"额外开销"，它是 6 页能并行不打架的前提；把它留在 4 人日里等于用 37% 预算买地基、63% 做 6 页。

---

## 4. 预算对照与结论

```
原始预算   32 h  ────────────────────────
估算总量   62 h  ──────────────────────────────────────────────
缺口       30 h  (3.75 人日，+94%)
```

**结论：不够（需裁剪或追加预算）。** 不是"紧一点能挤"的量级——差额接近再造一个 M8-6。

### 裁剪方案（4 个，含数字）

**A. 最小可交付（恰好 4.0 人日，用满原预算）**
地基 1.0（只做 `PageHero` + `SectionHead` + `EmptyState`，不做 `FilterBar`/`ProgressBar`）+ 赞助 0.75 + 系列 0.75 + 随笔 1.0 + 收口缓冲 0.5 = **4.0**
→ 顺延：游戏 1.25 + 文化 1.5 + 移动页 1.0 = **3.75 人日（M8-6b）**
→ 代价：两个 P1 内容页（游戏、文化）与移动验收不落地；筛选用页面内既有 `tab-nav` 兜底，不做新原子。

**B. 全 6 页但砍设计差异点（5.5 人日，仍超预算）**
地基 1.25 + 游戏 0.75（无拓扑、无筛选，只换卡）+ 文化 0.75（无热力图、无追更轨）+ 随笔 0.75（单列换皮）+ 赞助 0.75 + 系列 0.75 + 移动页 0.5（不做底栏，只做断点检查）= **5.5 人日**
→ 仍超 **1.5 人日**，且砍掉的正是稿子与现站的差异点——等于先做一遍"假换皮"、下轮再返工，**不推荐**。

**C. 地基卡共担 + 两批交付（6.25 人日，推荐）**
地基 1.5 移出 M8-6，挂到 M8-1/M8-2 共担（M8-2 的 3 页同样要这套 hero/section/empty）；M8-6 记 **6.25 人日**：
- 批一（4.0，用满原预算）：地基 1.5 + 赞助 0.75 + 系列 0.75 + 随笔 1.0
- 批二（3.75，追加）：游戏 1.25 + 文化 1.5 + 移动页 1.0
→ 批一有零缓冲（收口风险落在 operator），批二可并行 3 张卡。

**D. 一次做完（8.0 人日）**
7.75 向上取整 + 3% 缓冲 = **8 人日**，地基卡先行，6 页并行。适合"这一轮就把 6 页收干净"，但需 PO 明确把 M8-6 从 4 改到 8。

> 若 PO 只能给 4 人日，**选 A**；若能加预算但想控风险，**选 C**；若目标是里程碑一次收口，**选 D**。

---

## 5. 风险清单（每条带证据 + 可执行缓解）

| # | 风险 | 证据（实测） | 影响 | 缓解动作（可执行） | 归属 |
|---|---|---|---|---|---|
| R1 | **共享样式冲突**：地基卡若直接改 `entities.css` / `entities-b.css` | `entities.css` 被 **9 个页面** import（albums×2 / culture / devices / games / music / projects / skills / timeline）；`entities-b.css` 被 games + devices 共用；M8-2 的 projects/devices/skills 三张叶卡已在待办并行 | 返工 8–16 h，且三卡互相踩 | 地基卡**只新增** `pages/entities-c.css` + 新 atom，存量规则零改动；M8-2 三卡与 M8-6 约定"只许新增文件"；合并前 `grep -c "entities-c"` 确认接入点 ≥6 | 地基卡 / PM |
| R2 | **系列样式寄生在 tags.css** | `tags.css` 558 行、8 个 `@media`、被 **7 条路由**共用（`/tags/`、`/tags/<tag>/`、`/series/`、`/series/<slug>/` 及 en 镜像）；`.series-*` 规则与 `.tag-*` 混排 | 改系列打断标签页；且 `pages.visual` **没有** `/tags/` 条目 → 无回归网 | 第一步做**纯搬移**：`.series-*` 与 `.series-hub/.series-detail` 容器抽到 `series.css`，规则内容逐字不变，`/tags/` 手跑截图对比（1440/390 × light/dark）；抽完再改视觉 | 系列卡 / QA |
| R3 | **文化"打卡热力图"没有数据** | `bangumi.json` 每条只有 `subject.date`（作品首播日）与 `updated_at`（抓取快照，全库集中在 2026-05-14）；`douban.json` 的 `date` 是**收藏时间戳**（如 2026-05-23T04:52:21Z）；现站 `Heatmap.astro` 只吃文章 `postsData` | +6 h（只用豆瓣日期）或 +8 h（补 bangumi 真实收藏时间 → 改 fetch 脚本 + 数据契约，落 M8-1） | 先按**只用豆瓣 `date`** 做，标题写明"豆瓣入账日期"；要混 bangumi 就先在 M8-1 加可选字段，**不得**用 `updated_at` 冒充消费日期 | 文化卡 / M8-1 |
| R4 | **列表页 JS 预算只剩 ~3.5 KB** | `scripts/gates/perf-budget.py` 列表页预算 `js: 28 KB`；M6-2 实测 JS p95 `38.6/24.5/24.5 KB`（列表页 24.5） | 游戏/随笔的"筛选"若新增模块会直接顶红 | 复用 `src/scripts/tab-nav.ts`（已挂在 BaseLayout 常驻，`data-tab` 事件委托，douban/bangumi 在用），页内**不新增** script；改完必跑 `perf-budget.py dist` 记录增量 | 游戏 / 随笔 |
| R5 | **移动底栏是全站组件** | `BaseLayout.astro` 239 行，`tabbar/bottom-nav` grep 0 命中 → 需新建；改布局 = 478 页 + 42 张视觉基线全刷 | 基线重刷 + 潜在 CLS/LCP 回退 | 底栏只在 `≤640` 渲染且默认 `display:none`（无 JS 也安全），先在 `/design/components/` 预览页验收，再由 QA 单卡重刷 mac/Linux 基线（不借 macOS 结果冒充 Linux） | 移动页 / QA |
| R6 | **视觉基线缺口：4 页无回归网** | `e2e/pages.visual.spec.ts` 的 PAGES = home / article / archives / albums / culture / projects / 404（7 页）；games / talks / donate / series / tags **均无基线** | 改坏了不会红，只能靠人眼 | QA 先补 5 页 × 2 主题 × 3 视口（30 张/平台，约 4–6 h，属 QA 卡，**不计入**本 62 h）；FE 卡交付时附 1440/390 × light/dark 截图 | QA |
| R7 | **30 min/卡上限 vs ≥6 h 的工作量** | D-0149 规定叶卡 30 min；历史 M7-2a / M7-3a / M7-3c 全部在 30 min 硬上限超时、由 operator 收口 | worker 必然超时，进度假死 | 每页至少拆 2 张：`<页>-a 结构/组件`（≤4 源文件）+ `<页>-b 移动断点 + e2e`；或本里程碑把上限放宽到 120 min（需 PO 签字） | PM |
| R8 | **系列的"空态"不存在** | `series/[...slug].astro` 的 `getStaticPaths` 在 0 系列时返回 `[]`（代码注释：零系列 = 零路由）；其余 5 页都有 `PUBLIC_*_STATE=empty` 预览 | QA 按通用空态清单验收会开假 bug | 验收文档写明"系列空态 = 不产路由（404），用 fixture 站点验证"；其余 5 页用现有 `PUBLIC_GAMES_STATE` / `PUBLIC_TALKS_STATE` / `PUBLIC_DONATE_STATE` / `PUBLIC_CULTURE_STATE` 触发真实空态 | QA / PM |
| R9 | **游戏稿要的两个视觉件都没有字段** | `Game` 接口（`types/entities.ts:170-186`）只有 id/title/platforms/status/year/hours/rating/note/updated，**无 `cover`**；`cover?` 在 236 行属于 `MusicTrack`。进度条需要"已完成/总量"，数据只有 `hours`（无分母） | banner 无真实图源；进度条只能做"时长条"（就不是进度语义） | 二选一并在卡里写死：① banner 只做**无图版**（色块 + 标题排版，0 新字段）；② M8-1 给 `Game` 加 `cover?`（+2–3 h，还要备图）。进度条若无分母就改 `aria-valuetext` 为时长文本，**不要**伪造百分比 | 游戏卡 / M8-1 |

**另需 PM 一句话确认的口径**：本估算把第 6 页"移动页"定义为「移动端收口 = ≤640 底栏 tab bar + 4 个移动稿（home / article / albums / culture，见 `docs/18-stitch-coverage.md`）的断点验收」，**不含**文章页与相册主体（属 M6-3 / M8-3）。仓库里没有 `/m/` 独立路由（`src/pages` 零命中）；若 PM 另有所指，估算需重算。

---

## 6. 依赖与不计入本估算的事项

**依赖（未满足会改变数字）**
- M8-1 实体 schema v2：仅在 R3（bangumi 真实收藏时间）落地时需要；否则文化卡可只用豆瓣日期。
- t_df1498a2（设计侧组件/token 盘点）与 t_18d10646（QA 验收口径）：本估算按现有 `entities-*` / `talks-*` / `donations-*` 四套外壳 + `DESIGN.md` 现状推导；若设计侧要新增 token 键，地基卡 +2 h。
- M8-2 三张叶卡并行中：R1 的"只新增不改存量"约定需要 PM 同时写进那三张卡。

**不计入（避免预算虚胖）**
- QA 侧视觉基线（R6，30 张/平台）、a11y/性能 CI 跑批、Linux 基线生成。
- 设计出稿、PO 选型、`/en/` 路由（5 页的 en 页是 10–27 行的 `<GamesPage />` 包装，不重复实现，已在估算内按 ~5% 计入）。
- `packages/*` 发布链路、生产站切换（D-0125）、音乐播放器（M8-4）、相册（M8-3）。

---

## 7. 附：本轮实测数据（可复核）

```bash
# 页面/组件行数
wc -l src/pages/games/index.astro src/pages/culture/index.astro \
      src/components/Pages/TalksContent.astro src/components/Pages/DonateContent.astro \
      'src/pages/series/[...slug].astro' src/components/C/GameCard.astro
# 共享面
grep -rln "styles/pages/entities.css" src/pages   # 9
grep -rln "styles/pages/tags.css" src/pages       # 7（含 series zh/en）
# 预算
sed -n '30,36p' scripts/gates/perf-budget.py      # list: html 105 / js 28 / css 40
# 样式体量（raw / gz）
gzip -c src/styles/pages/tags.css | wc -c         # 4104 B（558 行，7 路由共用）
```

页面 CSS 余量：列表页预算 40 KB gz，当前 6 页实际加载 `tokens(2.8) + entities(3.7) + 页面表(1.9–2.6)` ≈ 8.4–9.1 KB → **CSS 不是瓶颈**；真正的约束是 JS（28 KB）与共享文件的所有权（R1/R2）。
