# 27 · M8-6 拆卡方案（1 张地基卡 + 6 张页面叶卡）

> 卡：`t_201f140b`（blog-pm）｜日期：2026-11-09｜状态：**v1.0 冻结候选**
> 上游输入（三份，全部读完才动笔）：
> - 设计侧：`blog2.0/docs/26-m8-6-component-inventory.md`（462 行，t_df1498a2）
> - QA 侧：`zcblog-v2/docs/_reviews/M8-6/acceptance-standard.md`（730 行，sha256 `62f821ab…`，t_18d10646）
> - FE 侧：`zcblog-v2/docs/_reviews/M8-6/estimate-fe.md`（164 行，commit `e8ecea7`，t_e5fe4abf）
> 本文只做**拆卡、预算、依赖、占位卡收尾**；不写实现代码、不做视觉判断。

---

## 0. 一页结论

1. **卡数冻结为 7 张**：`M8-6-0 地基` + `M8-6-1 游戏` / `-2 文化` / `-3 随笔` / `-4 赞助` / `-5 系列` / `-6 移动页`。6 页各出现一次，无遗漏无重复（§2 映射表）。
2. **预算分两批**（采纳 FE 的 C 方案批次结构，但**地基卡留在 M8-6 账内**）：
   - **批一 = 4.0 人日，正好用满 M8-6 原始预算**：地基 1.5 + 赞助 0.75 + 系列 0.75 + 随笔 1.0；
   - **批二 = 3.75 人日，需 PO 追加**：游戏 1.25 + 文化 1.5 + 移动页 1.0；
   - 总需求 **7.75 人日**（FE 62 h），与 4 人日缺口 **3.75（+94%）**。未批准的批二卡只创建、不派工。
3. **地基卡范围按设计侧口径收窄为 3 个组件**：`PageHero` / `SectionHead` / `DataState`。FE 评论里的 `FilterBar` / `ProgressBar` / `pages/entities-c.css` **不进地基卡**（逐条裁决见 §5.1）。
4. **卡粒度**：任务书把卡数冻结在 7 张，而 FE 实测每页 ≥6 h、D-0149 是 25 min/60 iter —— 两者冲突。裁决为「**一页一卡 + 卡内两个强制阶段（a 结构/组件、b 移动+证据）**」，单卡 2 次 dispatch，阶段 a 收口必须 WIP commit（D-0156）。若 PO 放宽卡数，§5.3 有机械展开为 12 张的映射表，内容零改写。
5. **占位卡 `t_3e96f36a` 在本卡完成后关闭**，替代关系与 M8-0/M8-1 状态写入 D-0154 与卡片评论（§7）。M8-0 **BLOCKED 但不阻塞 M8-6**（只卡 M8-4，D-0153）；M8-1 仍是占位卡（`t_c166bd51`，todo），地基卡按设计口径挂它为父。
6. **三项账外成本不塞进 4 人日**：双平台视觉基线（地基全量 42+72、文化 6 张、移动 375 列）、operator 收口、设计出图/PO 选型 —— 由 QA/operator 在批次末尾执行（D-0149「验证分道」）。把它们摊进 4 人日只会制造虚假自洽。

---

## 1. 输入事实对齐（拆卡只用这一张表）

| 事实 | 值 | 出处 |
|---|---|---|
| 6 页主方案（桌面 / 移动） | 游戏 `gaming_hub_2`/`gaming_hub_1`；文化 `blog_3`/`mobile_culture_hub`；随笔 `talks_blinko_1`/`talks_blinko_2`；赞助 `donate_supporters_2`/`donate_supporters_1`；系列 `series_collections_1`/`series_collections_2` | selection.md §79-84、QA §0 |
| 地基卡组件 | `PageHero`(molecule, 5 页) / `SectionHead`(atom, 4 页) / `DataState`(molecule, empty 4 / error 3) | 26 §6.1 |
| 地基卡触点 | 新建 9（组件+文档页+文档 JSON ×3）+ 改 4（registry / DESIGN.md / inventory+FROZEN_COUNTS / decision-log） | 26 §6.3 |
| 卡片壳 | 复用现有 `UI/atom/Card.astro`（7 个消费方），不新建、不加 prop | 26 §4-6、§6.2 O8 |
| 旧 `PageHeader` / `EmptyState` | v0.9 遗留（`--color-title` 等不在 tokens.json），**不可复用**，也不删不改 | 26 §0-6、D8 |
| P9 分母 | 现值 atom 10 / molecule 2 / total 47 → 新增 3 组件后 11 / 4 / 50，必须走 decision-log | 26 §0-5、§6.3 |
| 视觉基线矩阵 | 7 路由 × 3 视口 × 2 主题 = 42 张/平台 + atoms 72；`/culture/` 在内，games/talks/donate/series **不在** | QA §4.1 |
| 系列基线 | fixture 6 篇 0 篇带 series → 基线构建不产 `/series/`；本里程碑**豁免** gated 基线 | QA §2.5、§4.5 |
| 数据阻断 1 | `games.ts` 4 条全为 `sample-*` +「（示例）」→ G-08 S1 | QA §6.3 |
| 数据阻断 2 | `donators.json` 4 条为张三/李四/吴十/郑十一 → G-08 S1 | QA §6.3 |
| 空态口径 | 只接受同构建链的 adapter 开关（A）或真实空数据源（B）；禁 route mock/DOM 注入/组件内 env 特判 | QA §5.1–§5.5 |
| 移动完整验收 | 4 页：`/`、`/article/<slug>/`、`/albums/`、`/culture/`；其余 4 页为最低限度检查 | QA §3.1–§3.5 |
| 空态构建实测 | `PUBLIC_*_STATE=empty` 四页 + 零系列 fixture → 129 页，exit 0 | QA §5.6 |
| FE 总量 | 62 h = 7.75 人日（区间 6.5–9.5）；逐项 1.5/1.25/1.5/1.0/0.75/0.75/1.0 | estimate-fe §2 |
| M8-0 状态 | `t_8b1853ff` blocked；门禁卡 `t_9079ba85` blocked（无合法音频源，D-0153） | 本卡 sqlite 实查 |
| M8-1 状态 | `t_c166bd51`「占位跟踪卡，不执行」todo；schema v2 未开工 | 本卡 sqlite 实查 |

---

## 2. 7 张卡 ↔ 6 个页面（无遗漏/无重复的判定表）

| # | 卡 | 页面 | 路由 | 批次 | QA 章节 | 在 PAGES | 移动验收档 |
|---|---|---|---|---|---|---|---|
| 0 | **M8-6-0** | 共享结构件（非页面） | — | 批一 | 本文 §4.1 + QA §4 V-01…V-04 | 全站共享 | — |
| 1 | **M8-6-1** | 游戏 | `/games/`、`/en/games/` | 批二 | §1 + §2.1 | 否 | 最低限度 |
| 2 | **M8-6-2** | 文化 | `/culture/`、`/en/culture/` | 批二 | §1 + §2.2 + §3.4 | **是** | 完整 4 页之一 |
| 3 | **M8-6-3** | 随笔 | `/talks/`、`/en/talks/` | 批一 | §1 + §2.3 | 否 | 最低限度 |
| 4 | **M8-6-4** | 赞助 | `/donate/`、`/en/donate/` | 批一 | §1 + §2.4 | 否 | 最低限度 |
| 5 | **M8-6-5** | 系列 | `/series/`、`/series/<slug>/`、`/en/series/…` | 批一 | §1 + §2.5 | 否 | 最低限度 |
| 6 | **M8-6-6** | 移动页 | `/`、`/article/<slug>/`、`/albums/`、`/culture/` | 批二 | §1 + §2.6 + §3.4 | **是**（4 路由） | 完整 4 页 |

**判定**：6 个页面 = 6 张页卡，一行一页；地基卡不承载任何页面视觉。`grep` 本表页码列可验「1..6 各一次」。

---

## 3. 依赖关系

```
M8-1（t_c166bd51，schema v2，todo）
  └─ M8-6-0 地基（PageHero / SectionHead / DataState + P9 分母）
       ├─ M8-6-1 游戏   ┐
       ├─ M8-6-2 文化   ├ 默认：6 张页卡彼此无依赖，可并行（各自文件集不重叠）
       ├─ M8-6-3 随笔   │
       ├─ M8-6-4 赞助   │
       ├─ M8-6-5 系列   ┘
       └─ M8-6-6 移动页 ← 额外父：M8-6-2 文化（唯一例外，见下）
```

- **默认**：6 张页卡父依赖只有地基卡，彼此无依赖，可并行。
- **唯一例外**：`M8-6-6 移动页` 多一条父边 ← `M8-6-2 文化`。理由（事实，不是偏好）：
  1. QA §2.6 与 §2.2 规定 `/culture/` 的四段 snap 横滑由 M8-6-2 落地，移动页要验收它（P2-06 / §3.4 交互截图）；
  2. 两张卡都会改 `/culture/` 的 375 视觉列 → 并行会撞同一 6 张基线 × 2 平台（QA §4.4 第 2 条「其余 36 张必须 0 差异」）；
  3. 两张卡都在批二，串行不损失批一的吞吐。
- **不建立的边**：M8-0（blocked，D-0153 只卡 M8-4）；其余 5 页与 M8-1 的边（设计 A2：schema v2 只加 projects/devices/skills 可选字段，6 页实体契约不变）。地基卡保留 M8-1 父边是**沿用设计侧 §6.5 的口径**；页卡不继承该边，避免被 M8-1 连带阻塞。
- **执行顺序建议（不建边，仅排派工）**：批一 `地基 → 系列 → 赞助 → 随笔`（系列要动 `tags.css`，先做完减少后续页回归面）；批二 `文化 → 移动页`，游戏独立可插空。

---

## 4. 7 张卡的可创建清单

> 每张卡固定：标题 / assignee / parents / 批次 / 预算 / **body 全文**（可直接粘贴到 `kanban_create(body=...)`）。
> 卡 body 里的验收一律**引用** `docs/_reviews/M8-6/acceptance-standard.md` 的条目 ID，不重抄标准。

### 4.1 卡 0/7 · 地基卡

| 字段 | 值 |
|---|---|
| 标题 | `M8-6-0 · 共享结构件地基：PageHero / SectionHead / DataState + P9 分母` |
| assignee | `blog-fe`（会签：`blog-design` DESIGN.md 三节规格、`blog-platform` inventory/FROZEN_COUNTS、`blog-qa` 全量基线） |
| parents | `t_c166bd51`（M8-1） |
| 批次 / 预算 | 批一 / **1.5 人日（12 h）**，3 个 worker session |
| 交付格式 | 3 组件 + 3 文档页 + 3 文档 JSON + registry + DESIGN.md + inventory/FROZEN_COUNTS；因果见 26 §6 |

````markdown
## 目标
为 M8-6 的 6 张页卡提供 3 个共享结构件（页头 / 分组小标题 / 空错态），并把 P9 组件分母扩容落进 decision-log。页面专属视觉一律留在页卡内。

## 范围（做）
1. `src/components/UI/molecule/PageHero.astro`：kicker（mono 大写 + 48px accent 短尺）+ h1 + lede + `meta[]`（Icon+文本，`quiet` 弱化档）+ 可选分隔线（`divider` 默认 true，系列页传 false）+ 可选默认 slot（只放 Link/Button）。5 页复用（games/culture/talks/donate/series）。h1 断点：≥768 `--text-4xl`、<768 `--text-3xl`，**禁止 clamp()/vw**（D1）。规格见 26 §7.1。
2. `src/components/UI/atom/SectionHead.astro`：`title` / `meta?` / `id`（必填，供 `aria-labelledby`）/ `level?`（2|3）/ `action?` slot；≥768 一行两端对齐 + 底边 1px `border-subtle`，≤768 折两行。4 页复用。规格见 26 §7.2。
3. `src/components/UI/molecule/DataState.astro`：`kind="empty"|"error"`；empty = 圆形 icon 底 + h2 + 说明 + action slot；error = `Alert tone="warning"` + mono 原因码行（`code` 缺省不渲染该行）。4 页空态 / 3 页错误态。无 loading 变体。规格见 26 §7.3。
4. 每个组件的固定三件套：`src/pages/design/atoms/<slug>.astro` 文档页、`src/pages/design/_docs/data/<slug>.json` 七项数据（用途/何时不用、Props、Slots、States、a11y、token 白名单、示例）、`src/pages/design/_docs/index.ts` registry 条目。
5. `docs/DESIGN.md`：新增 §5.6.13–§5.6.15 三节规格；§5.3 状态矩阵补 3 行；§4.5 层表补 3 行。
6. `docs/component-inventory.json`：atom 10→11、molecule 2→4、total 47→50；同步 `scripts/gates/verify-component-inventory.mjs` 的 `FROZEN_COUNTS`（脚本注释写明「改这里 = 改 P9 的口径，必须走 decision-log」）。
7. 决策已由 PM 预写：`blog2.0/docs/decision-log.md` **D-0155**（P9 分母扩容）。开工第一步只核对它存在，不重复写。

## 范围（不做，明确列表）
页壳 PageShell、元信息 chip 独立组件、序号 Ordinal、Pagination（6 页 0 使用）、Skeleton（6 页 0 客户端取数、无加载态）、赞助位 QrCard/DonatorsList 改造、时间轴/话题云/四段轮播、给 Card atom 加 prop、**新建 `pages/entities-c.css`**（FE 评论提议、设计文件清单无此项，裁决见 27 §5.1）。理由逐条见 26 §6.2。

## 硬约束
- 颜色只用 v1.1 语义键；尺寸只取 `--space-*`/`--text-*`/`--radius-*`/`--shadow-*`；`@media` 只允许 450/768/1024；`prefers-reduced-motion` 下过渡归零；组件 JS **0 字节**。
- 不新增 token：`git diff packages/tokens/` 必须为空（白名单 34 个键已全部存在）。
- 不修改 `entities.css` / `entities-b.css` / `talks.css` / `donate.css` / `tags.css` 的任何存量规则（9 页共用 + M8-2 三卡并行 + `/tags/` 7 路由共用）。
- 旧 `UI/PageHeader.astro` / `UI/EmptyState.astro` 保留给仍在用的 5 个路由，不删不改。

## 验收（可机器判定，全绿才算完）
1. `node scripts/gates/verify-atom-docs.mjs` exit 0（3 份新 JSON 七项字段 + token 可解析）
2. `node scripts/gates/verify-component-inventory.mjs` exit 0（counts 与文件一致）
3. `node scripts/gates/verify-component-docs.mjs` exit 0
4. `node scripts/gates/check-tokens.mjs` exit 0
5. 3 个文档页 `/design/atoms/<slug>/` 可打开，light/dark 各一张截图，示例区非空
6. 3 个组件源码 `grep -cE '#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\('` = 0
7. 3 个组件源码 `grep -c 'px'` 只允许 1px/2px/断点数字
8. `git diff packages/tokens/` 为空
9. 视觉基线（QA §4 V-01…V-04，**不由本卡执行**）：`src/components/UI/**` 是共享表面 → 地基卡合入后由 QA/operator 跑 **atoms 72 + pages 42 × 2 平台**全量，两遍无 retry 全绿。本卡只交组件文档页截图（1440 light/dark）。

## 交付物
- 源码与文档（见「范围」）；`docs/_reviews/M8-6/M8-6-0/report.md`：验收项 → 命令 → 输出 → 结论 表 + 截图。
- 阶段结论写进 report（s1/s2/s3 各自一段），供 operator 接手时不必重读 diff。

## 预算与阶段（D-0156 例外：1.5 人日 / 3 sessions）
| session | 内容 | 预算 |
|---|---|---:|
| s1 | PageHero + SectionHead（组件 + 两个文档页/JSON + registry） | 4 h |
| s2 | DataState（empty/error 两态 + 文档页/JSON） | 3 h |
| s3 | DESIGN.md 三节 + §5.3/§4.5 + inventory/FROZEN_COUNTS + 4 条门禁 + 收口 | 5 h |
每 session 25 min / 60 iter 上限；60% 时 WIP commit；s1/s2 结束必须 commit + 在 report 写阶段结论，不得把三个 session 混成一次长跑。

## 依赖
- 父：M8-1（`t_c166bd51`，schema v2）。**事实注记**：M8-1 目前是占位卡且只给 projects/devices/skills 加可选字段，本卡不消费这些字段（设计 A2）→ 若 PO 决定并行，删掉此父边不会产生返工。
- 不依赖 M8-0：`t_9079ba85` 因无合法音频源 BLOCKED（D-0153），只卡 M8-4。
- 下游：6 张页卡全部以本卡为父。

## 影响目录与会签
`src/components/UI/**`（新增）、`src/pages/design/**`（新增+registry）、`docs/DESIGN.md`、`docs/component-inventory.json`、`scripts/gates/verify-component-inventory.mjs`。会签：blog-design（三节规格文字）、blog-platform（分母脚本）、blog-qa（全量基线）。

## 已知风险
- R1：P9 分母没决策 → PR 必红。**已由 D-0155 预写**，开工先核对。
- R2：新增 `UI/**` 触发全量基线（42+72 × 2 平台），属 QA 批次末尾动作，不在本卡预算内；本卡不交 gated 基线。
- R5：旧别名层（`src/styles/tokens.css` 的 `--color-text`/`--content-width-max`）仍全局生效，新组件只允许 v1.1 键（`verify-surface-tokens` 会拦）。
- R7：13 个触点 > D-0149 的 ≤4 源文件 → 已按 M6-1 先例申请例外（D-0156）；按 session 切分，不做单次长跑。
````

### 4.2 卡 1/7 · 游戏 `/games/`

| 字段 | 值 |
|---|---|
| 标题 | `M8-6-1 · 游戏页视觉重做 + 真实数据收口（/games/）` |
| assignee | `blog-fe`（会签：`blog-qa` 验收、`blog-design` 卡内容） |
| parents | 地基卡 |
| 批次 / 预算 | 批二（**需 PO 追加**）/ **1.25 人日（10 h）**，2 sessions |
| 备注 | 与 M8-2 devices 共用 `entities-b.css` → 只碰 `.game-*` 选择器；新规则写本页 CSS，不改共享段 |

````markdown
## 目标
把 `/games/` 从「状态分组 + 纯文字卡」重做为 `marx_s_blog_gaming_hub_2` 的桌面形态（移动用 `gaming_hub_1`），并让页面首次以**真实数据**上线（当前 4 条是 `sample-*` 示例，G-08 S1）。

## 现状（实测，勿重查）
- `src/pages/games/index.astro`（219 行）+ `src/components/C/GameCard.astro`（86 行）+ `src/styles/pages/entities-b.css`（432 行，与 devices 共用）+ `e2e/pages-c1-devices-games.spec.ts`。
- 卡片无封面/进度（grep `img|progress` 0 命中）；`Game` 接口（`src/types/entities.ts:170-186`）**无 `cover` 字段**（`:237` 的 `cover?` 属 `MusicTrack`），进度条**无分母**（只有 `hours`）。
- 页头/分组头/空错态分别是 `.entities-hero` / `.entities-section__head` / `.entities-state*` 的 4 套复制之一；h1 用 `clamp(...,4.5vw,...)`（D1 违规）。
- 数据：`src/data/entities/games.ts` 4 条 `id=sample-*`、标题含「（示例）」、`meta.source="seed（待替换为真实记录）"`。

## 范围（做）
1. **数据收口（默认走空态，不造假）**：删除 4 条示例记录；页面以**真实空态**上线（空态是设计内状态，QA 已实测可构建）。若 PO 在开工前提供真实游玩记录，则按真实标题/平台/状态/一句话评价替换，`hours`/`rating` 没有就删字段、不填 0。
2. Hero → `PageHero`（`kicker` 用现有 mono 短尺文案；chips 迁入 `meta[]`：总数恒在，`已通关` 仅当 finished>0，`小时` 仅当 totalHours>0，更新时间仅当 feed.updated 非空）。
3. 分组 → `SectionHead`（4 组固定顺序 `playing → finished → backlog → shelved`，`id="game-state-<status>"`）+ 卡网格。
4. 卡片 → 复用 `UI/atom/Card.astro`（不新建卡壳、不加 prop）；卡内容 = 序号（`fg-muted`，D10）、平台、年份、状态文案、note、五星刻度（仅在有 rating 时渲染 5 格，无 rating 时 0 格且不渲染空评分文本）、时长。
5. **banner 走无图版**：色块 + 标题排版（固定 `aspect-ratio`），不引第三方封面代理、不加 `cover` 字段。`Game.cover` 若要加，属 M8-1 后续，不在本卡。
6. **不做伪进度条**：无分母就不渲染 `role="progressbar"`；有 `hours` 时只显示时长文本。QA G-17 的 progressbar 断言在本页不适用（无进度语义）。
7. 筛选（若保留）：复用 `src/scripts/tab-nav.ts` 的 `data-tab` 事件委托，页内**不新增** script 模块（列表页 JS 预算 28 KB，只剩 ~3.5 KB）。
8. 串流拓扑按 `selection.md` §4.10 **只桌面渲染**，≤767 不出现。
9. 错误态 / 空态 → `DataState`（error = Alert warning + mono 原因码）。
10. 视觉偏差：h1 clamp 由 PageHero 收口；卡 hover 统一 Card atom 的 `shadow-3`；2px 顶边改 1px `border-subtle`（D6）。

## 不做
不改 `entities.css` 的通用 section 规则；不改 `entities-b.css` 的 `.device-*`；不给 Card atom 加 prop；不做封面图/图片代理；不做分页/骨架屏；不重做 `/devices/`。

## 数据与空态口径
- ok / empty / error 三态由 `PUBLIC_GAMES_STATE` 驱动（`normalizeCollection({ force })`），组件内 0 环境分支。
- 空态构建：`PUBLIC_GAMES_STATE=empty ./node_modules/.bin/astro build --outDir test-results/m86-games-empty` → `data-games-status=empty`、`data-games-total=0`、`data-games-groups=0`、`[data-games-empty]` 可见、`.game-card`=0、h1 与页脚仍在。
- 断言必须 quote-agnostic：`/data-games-status=(?:"empty"|empty)/`（`html-collapse` 会去引号，QA §5.5-4）。
- 计数：`data-games-total` = 有效条目数；`hours` 合计只累计已填项，未填不按 0 计入。

## 移动版要求（最低限度档）
375/390 单列；状态分组标题与卡片不横向溢出；筛选条（若实现）可键盘/触摸横滑、命中区 ≥44×44；拓扑隐藏；无图 banner 固定比例不抖动；卡片文字不裁切（G-20）。

## 验收（引用，不重写）
- 通用：`docs/_reviews/M8-6/acceptance-standard.md` §1 **G-01…G-24 全部适用**（G-08 是本卡的主战场）。
- 本页专项：§2.1 **P1-01…P1-07**（容器 data 属性 / 唯一 h1 / Hero meta 条件 / 分组数与顺序 / 卡片字段 / 评分刻度 / 拓扑仅桌面）。
- 空态：§5.2 A + §5.3 游戏行 + §5.4 E-01…E-09。
- 移动：§3.5 最低限度（G-19/G-20/G-22 + 375 light 截图 1 张 + 390 溢出日志）。
- 视觉基线：§4 **V-06**（页面 ∉ PAGES → 不新增 gated 基线；交 1440 light/dark + 390 light + 375 light 四张证据）。
- 判定：§6；PASS 需 0 个未关闭 S1/S2。开工前已知阻断：§6.3 游戏行（`sample-*` → G-08 S1）。

## 交付物
`docs/_reviews/M8-6/M8-6-1/report.md`（验收项 → 命令 → 输出 → 结论）+ 4 张证据截图；`pnpm exec playwright test e2e/pages-c1-devices-games.spec.ts` 全绿输出。

## 预算与阶段
| 阶段 | 内容 | 预算 |
|---|---|---:|
| a | 结构（分组/Hero/SectionHead 迁移）+ 无图 banner 卡 + 桌面拓扑 + 空态接线 | 7 h |
| b | 移动断点 + 筛选接入 tab-nav + e2e/证据收口 | 3 h |
每阶段 ≤4 源文件、≤300 行；阶段 a 结束 commit + report 阶段结论；30 min 未完成阶段 b → `kanban_block(kind="transient")`。

## 依赖
父：M8-6-0 地基卡（未合入时按 QA §6.2 ABORT-1 停工，不自己复制一套 hero/section）。

## 影响目录与会签
`src/pages/games/index.astro`、`src/components/C/GameCard.astro`、`src/styles/pages/entities-b.css`（仅 `.game-*`）、`src/data/entities/games.ts`、`e2e/pages-c1-devices-games.spec.ts`。会签：blog-qa（G-08 数据口径）、blog-design（banner 无图版形态）。

## 已知风险
- R9：无 `cover`、无进度分母 → 已裁决「无图 banner + 不做伪进度条」，不阻塞。
- R4：列表页 JS 28 KB / 余量 ~3.5 KB → 筛选只复用 `tab-nav.ts`，不新增模块；改完跑 `python3 scripts/gates/perf-budget.py dist`。
- R1：`entities-b.css` 与 devices/M8-2 共用 → 只许改 `.game-*`，合并前 `git diff --stat src/styles/pages/entities-b.css` 复核。
- R6：本页无 gated 基线 → 交付必须自带 4 张证据图，不能只写「已检查」。
````

### 4.3 卡 2/7 · 文化 `/culture/`

| 字段 | 值 |
|---|---|
| 标题 | `M8-6-2 · 文化页视觉重做 + 豆瓣入账热力图 + 四段移动轨（/culture/）` |
| assignee | `blog-fe`（会签：`blog-qa` 基线、`blog-design` 热力图口径） |
| parents | 地基卡 |
| 批次 / 预算 | 批二（**需 PO 追加**）/ **1.5 人日（12 h）**，3 sessions |
| 备注 | 唯一在 `pages.visual` PAGES 内的 M8-6 页面 → 改完必须更新本页 6 张 × 2 平台；是移动页卡的父 |

````markdown
## 目标
把 `/culture/` 从「3 张入口卡」重做为 `marx_s_blog_blog_3` 的桌面形态（三分区 + 追更轨 + 热力图），移动按 `marx_s_blog_mobile_culture_hub` 做四段 snap 横滑。这是 M8-6 唯一有真移动稿的页面，也是移动页卡的依赖。

## 现状（实测，勿重查）
- `src/pages/culture/index.astro`（336 行）+ `src/components/Culture/CultureCard.astro`（99 行）+ `CultureGrid.astro` + `src/styles/pages/culture.css`（272 行）+ 共用 `entities.css` / `entities-b.css`。
- 数据：`src/data/bangumi.json`（31 条）、`src/data/douban.json`（10 条）、`src/data/entities/music.ts`。
- 偏差：`culture.css:144` `font-size: var(--space-6)`、`:243` `var(--space-8)`（用间距 token 当字号，硬违规）；**0 个 max-width 断点**；卡 hover `--shadow-2`（应为 `shadow-3`）；`2px` 顶边（应 1px）；`auto-fill 30rem` 无列数契约。
- 空态：`PUBLIC_CULTURE_STATE=empty`；缺实体 `PUBLIC_CULTURE_OMIT=music,douban`；**无 error 态**（缺实体 = 整卡不渲染，是本页产品判据，不许加 error 分支）。

## 范围（做）
1. 三分区结构（番剧 / 书架 / 电影 三源入口 + 追更轨），Hero → `PageHero`、分区头 → `SectionHead`、空态 → `DataState`。
2. **热力图数据口径（写死）**：只用 `douban.json` 的 `date`（收藏时间戳），标题写「豆瓣入账日期」；**禁止**用 bangumi 的 `updated_at` 冒充消费日期（那是抓取快照，全库集中在 2026-05-14）。要混 bangumi 真实收藏时间，先在 M8-1 加可选字段，不在本卡。
3. `CultureCard` 布局：序号（`fg-muted`）、来源 kicker、标题+箭头、说明、`dl` 统计行、分类构成 `ul`；hover 迁到 Card atom 的 `shadow-3`；卡顶边 2px → 1px `border-subtle`。
4. `culture-note` 口径说明保留（原始 / 去重后两个数都报）。
5. 修两处 `space→font-size`（值相等的 `--text-2xl` / `--text-3xl`，像素不变，纯语义修正）。
6. 补 768 / 450 两个 max-width 断点（现状 0 个；单列契约）。
7. 移动：按 `mobile_culture_hub` 做番剧/书架/电影/音乐**四段 snap 横滑**（每段可访问标题；无内容段不渲染空轨；键盘 Tab 可达每段卡片；高度不跳；不出现半张卡被裁）。
8. 视觉基线：本页在 PAGES → 更新 `culture-{light,dark}-{375,768,1280}.png` 6 张 × 2 平台；其余 36 张必须 0 差异。

## 不做
不加 error 态；不改「缺实体不渲染」判据；不引入第三方封面代理；不改 `entities.css` 通用类；不重做 `/bangumi/` `/douban/` `/music/` 三个子页；不动 `pages.visual` 的 PAGES 数组。

## 数据与空态口径
- `PUBLIC_CULTURE_STATE=empty` → `data-culture-status=empty`、`entries=0`、`raw=unique=overlap=0`、`data-culture-hidden="bangumi,douban,music"`、`[data-culture-empty="no-entries"]` 可见、0 卡。
- `PUBLIC_CULTURE_OMIT=music` → 2 卡，music 卡消失，其余计数不变。
- 计数恒等式 `raw − overlap = unique`（QA P2-04）；每卡 `count > 0`，0 条来源整卡不渲染。
- 断言 quote-agnostic（QA §5.5-4）。

## 移动版要求（完整 4 页之一）
除 §3.4 **M-01…M-16** 全表外，本页专项：四段横滑 `scroll-snap-type` 生效；键盘 Tab 可达每段卡片；横滑容器高度不跳动；无「半张卡被裁」；触控滑动不与页面纵向滚动打架。

## 验收（引用，不重写）
- 通用：QA §1 **G-01…G-24**。
- 本页专项：§2.2 **P2-01…P2-06**。
- 移动：§3.4 **M-01…M-16**（本页是 4 个完整验收路由之一）。
- 空态：§5.2 A + §5.3 文化两行 + §5.4 E-01…E-09。
- 视觉基线：§4 **V-05**（仅本页 6 张 × 2 平台）+ **V-08**（数据刷新时同 PR 更新并检查 diff 只含内容变化）；纪律见 §4.4。
- 判定：§6；开工前已知阻断：§6.3 文化行「无已知 S1」。

## 交付物
`docs/_reviews/M8-6/M8-6-2/report.md` + 1440 light/dark、390/375 light、四段横滑起点/终点截图；`pnpm exec playwright test e2e/pages-culture.spec.ts` 全绿；基线 diff 摘要（哪 6 张变了、其余 36 张 shasum 未变）。

## 预算与阶段
| 阶段 | 内容 | 预算 |
|---|---|---:|
| a | 三分区 + Hero/SectionHead + CultureCard/dl/note + 修 space→font-size + 2px/1px | 7 h |
| b | 热力图（豆瓣 date 口径）+ 空态接线 + 断点 768/450 | 3 h |
| c | 四段 snap 横滑 + e2e/证据 + 基线（本页 6 张 × 2 平台） | 2 h |

## 依赖
父：M8-6-0 地基卡。下游：M8-6-6 移动页（唯一有页间父边的卡）。

## 影响目录与会签
`src/pages/culture/index.astro`、`src/components/Culture/*.astro`、`src/styles/pages/culture.css`、`e2e/pages-culture.spec.ts`、`e2e/__screenshots__/pages*/culture-*`。会签：blog-qa（基线 + 热力图口径）、blog-design（三分区与热力图形态）。

## 已知风险
- R3：热力图无 bangumi 真实收藏时间 → 只吃豆瓣 `date` 并在标题写口径，不做「混合来源」的假热力。
- R2：本页在 PAGES → 视觉改动要刷 6 张 × 2 平台；Linux 基线必须在官方镜像生成（QA §4.3），不得用 macOS 冒充。
- R1：共用 `entities.css` → 只改本页类与自己的 CSS，不改通用 section 规则。
- 置信度：FE 判 medium-low（热力图数据口径是本卡最大不确定项），阶段 b 结束若口径仍有歧义，block 而非猜。
````

### 4.4 卡 3/7 · 随笔 `/talks/`

| 字段 | 值 |
|---|---|
| 标题 | `M8-6-3 · 随笔页视觉重做：3.5 栅 sticky 两栏 + 时间流（/talks/）` |
| assignee | `blog-fe` |
| parents | 地基卡 |
| 批次 / 预算 | 批一 / **1.0 人日（8 h）**，2 sessions |

````markdown
## 目标
把 `/talks/` 从「单列 + 页内话题」重做为 `marx_s_blog_talks_blinko_1`（≥1024：左 3.5 栅 sticky 筛选 + 右时间流），移动按 `talks_blinko_2` 降级。

## 现状（实测，勿重查）
- `src/pages/talks/index.astro`（21 行包装）→ `src/components/Pages/TalksContent.astro`（228 行）+ `src/styles/pages/talks.css`（354 行，4 个 `@media`）。
- 当前单列；页内 topics 云；时间轴 `grid-template-columns: 8rem minmax(0,1fr)`（8rem 不在 token 集）；Hero `.talks-hero`、section 头 `.talks-section__head`、空错态 `.talks-state*` 各一套复制；h1 `clamp(4.5vw)`。
- 数据：`src/data/talks.json` 8 条真实 memos → `loadSiteTalks` adapter；三态 `PUBLIC_TALKS_STATE`。

## 范围（做）
1. Hero → `PageHero`（条数 chip 恒在；标签数 chip 仅当 tags>0；最近时间 chip 仅当有 newest）。
2. 分组头 → `SectionHead`（meta 用「最新在上」）。
3. 桌面两栏：左 3.5 栅 sticky 筛选（≥1024 常驻），右时间流；768–1023 降级为顶部横滑，不挤压正文；≤768 单列。
4. 时间流：`<ol>` + 轨道 + 日期列（8rem → `--space-*` 组合或明确登记例外，二选一并写进 report）；`EssayItem` 版式统一到 Card atom 的纸面/悬停语言。
5. 话题云：`UI/atom/Tag.astro`（neutral/sm），ok 态才渲染，空态不渲染。
6. 空/错态 → `DataState`；错误态保留 Alert warning + 原因码。
7. 视觉偏差：h1 clamp 由 PageHero 收口；`prefers-reduced-motion` 下过渡归零（G-18）。

## 不做
不把时间轴轨道/日期列抽成组件（单页复用，26 §6.2 O7）；不改 adapter 三态；不新增 JS 模块（sticky/横滑都是 CSS）；不重做 `EssayItem` 的数据契约。

## 数据与空态口径
- `PUBLIC_TALKS_STATE=empty` → `data-talks-status=empty`、`total=0`、`[data-talks-empty]` 可见、`.essay-card`=0、`.talks-topics` 不渲染、h1 仍在；`=error` → `[data-talks-error]` + Alert + 原因码，且不出现空态块。
- 正文必须已剔除 `#话题`；`id` 唯一；外链 `http(s)` + `target="_blank"` + `rel` 含 `noopener`；配图有 `alt` 与尺寸。

## 移动版要求（最低限度档）
375/390 单列；sticky 左栏在 ≤768 变顶部横滑；时间线无横向溢出；卡片正文与配图不裁切；外链可点区 ≥44×44。

## 验收（引用，不重写）
- 通用：QA §1 **G-01…G-24**。
- 本页专项：§2.3 **P3-01…P3-07**。
- 空态：§5.2 A + §5.3 随笔行 + §5.4 E-01…E-09。
- 移动：§3.5 最低限度 + 375 light 证据。
- 视觉基线：§4 **V-06**（∉ PAGES → 证据截图 1440 light/dark + 390 light + 375 light）。
- 判定：§6；开工前已知阻断：§6.3 随笔行「无已知 S1」。

## 交付物
`docs/_reviews/M8-6/M8-6-3/report.md` + 4 张证据截图；`pnpm exec playwright test e2e/pages-talks-donate.spec.ts` 全绿。

## 预算与阶段
| 阶段 | 内容 | 预算 |
|---|---|---:|
| a | 两栏骨架 + Hero/SectionHead 迁移 + 时间流重做 + 空错态 | 5 h |
| b | 移动降级（≤768 顶部横滑）+ e2e/证据 + 收口 | 3 h |

## 依赖
父：M8-6-0 地基卡。

## 影响目录与会签
`src/components/Pages/TalksContent.astro`、`src/styles/pages/talks.css`、`src/pages/talks/index.astro`、`e2e/pages-talks-donate.spec.ts`。会签：blog-qa。

## 已知风险
- R4：列表页 JS 28 KB → 不加 script，sticky/横滑纯 CSS。
- 8rem 列宽不在 token 集（D7）→ 用 `--space-*` 组合，或登记例外并在 report 说明。
````

### 4.5 卡 4/7 · 赞助 `/donate/`

| 字段 | 值 |
|---|---|
| 标题 | `M8-6-4 · 赞助页视觉重做：3 列支付卡 + 年度账本 + 答疑（/donate/）` |
| assignee | `blog-fe`（会签：`blog-pm` 账本数值与 FAQ 文案） |
| parents | 地基卡 |
| 批次 / 预算 | 批一 / **0.75 人日（6 h）**，2 sessions（FE 置信度：高） |

````markdown
## 目标
把 `/donate/` 重做为 `marx_s_blog_donate_supporters_2`（3 列支付卡 + 年度透明账本 + 同路人芳名录 + 赞助答疑），移动按 `donate_supporters_1` 单列。当前已具备 5 态与真实二维码资产，缺账本表与 FAQ。

## 现状（实测，勿重查）
- `src/pages/donate/index.astro`（40 行）→ `src/components/Pages/DonateContent.astro`（254 行）+ `src/styles/pages/donate.css`（283 行，2 个 `@media`，**0 处 `prefers-reduced-motion`**）。
- 数据：`src/data/donators.json`（账本）+ `src/config/ui.ts` 的 `donatePage.accounts`（wechat/alipay/paypal）+ `src/assets/qr/*`（真实资产）。
- 五态：ok / empty / error / 未开放 / 无收款方式（`PUBLIC_DONATE_STATE`）。
- **数据阻断**：`donators.json` 4 条为张三/李四/吴十/郑十一，已进入 `dist/donate/index.html` → G-08 S1。
- 本期缺口：年度账本表、FAQ 块；收尾块 `radius-xl` 越档（应 lg）；无 reduced-motion。

## 范围（做）
1. Hero → `PageHero`（chips：支持者数 / 累计金额 / 方式数，按数据条件渲染）；分区头 → `SectionHead`；空/错态 → `DataState`。
2. 收款方式：3 列网格（wechat/alipay/paypal），`QrCard` 只调版式、不改组件契约；二维码真实资产，`alt` 可读，**0 个空 `src`**；PayPal 外链真实 `http(s)`。
3. **年度账本（新增块）**：`<table>` 有 `caption`、`th[scope]`；375 下改卡片列表（容器内横滚不算过）；结构先落地。**数值口径**：金额/进度只由 PO 提供的真实数据渲染；PO 未提供时**不渲染金额列与覆盖进度**（不写 0、不复制设计稿样例 ¥1,420 / 68%）——P4-06 断言的是 caption/th/移动形态，结构可独立通过。
4. **赞助答疑（新增块）**：3 条问答，文案源 = `_design/stitch-v2/screens/marx_s_blog_donate_supporters_2/code.html` L521+（赞助款项用途 / 如何上榜 / 是否可匿名）；不得留空格子、不写「待补充」。
5. **芳名录数据收口（默认走空态）**：清空 `donators.json` 的 4 条占位人名，芳名录走真实空态（页面已有 `data-donate-empty` 分支）；PO 提供真实赞赏记录后再补，卡内不编造昵称/金额/日期。设计稿里的「星芒智舍 / Forecho」同样是样稿数据，**不得**抄进仓库。
6. 五态文案与分支保持：未开放 / 无收款方式 用 Alert；空态不显示 error 文案，error 不显示空态块。
7. 视觉偏差：收尾块 `radius-xl` → `radius-lg`；补 `prefers-reduced-motion`（自有过渡归零，组件内建的归零不重复写）；`auto-fit 15rem` 的第三个 min 值收敛到断点契约（1 列 ≤768 / 3 列 ≥1024）。
8. QrCard 的「不渲染空 `<img>`」与二维码解析两道闸不许拆。

## 不做
不改 `donatePage.accounts` 的配置结构；不改 Waline 评论（懒加载保持）；不新增 JS；不动 `/en/donate/` 的包装逻辑；不把二维码换成示例图。

## 数据与空态口径
- `=empty` → `data-donate-status=empty`、`total=0`、`[data-donate-empty]` 可见、`.donator`=0、`data-donate-accounts=0`、无 `.donations-methods`、无空 `src`、`.donations-thanks` 仍在。
- `=no-accounts` → 当前 fixture 同时把账本置空：`accounts=0`、`donators=0`、`[data-donate-no-methods]` 可见、无码图/空图。它只验「无收款方式不渲染空图」，**不**验「有账本但无收款方式」。
- `=error` → `[data-donate-error]` + 原因码，不出现空态块。
- 断言 quote-agnostic（QA §5.5-4）。

## 移动版要求（最低限度档）
375/390：支付卡单列；账本 375 变卡片列表（不横向滚动）；二维码不溢出；可点区 ≥44×44；金额与日期不换行错位。

## 验收（引用，不重写）
- 通用：QA §1 **G-01…G-24**（G-08 是本卡主战场）。
- 本页专项：§2.4 **P4-01…P4-06**。
- 空态：§5.2 A + §5.3 赞助三行 + §5.4 E-01…E-09。
- 移动：§3.5 最低限度 + 375 light 证据。
- 视觉基线：§4 **V-06**（∉ PAGES → 证据 4 张）。
- 判定：§6；开工前已知阻断：§6.3 赞助行（占位人名 → G-08 S1）。

## 交付物
`docs/_reviews/M8-6/M8-6-4/report.md` + 4 张证据截图 + 五态构建日志/断言；`pnpm exec playwright test e2e/pages-talks-donate.spec.ts` 全绿。

## 预算与阶段
| 阶段 | 内容 | 预算 |
|---|---|---:|
| a | 支付卡 3 列 + 年度账本结构 + FAQ + Hero/SectionHead/DataState 迁移 | 4 h |
| b | 移动单列/账本卡片化 + 五态收口 + e2e/证据 | 2 h |

## 依赖
父：M8-6-0 地基卡。账本数值与真实赞赏记录依赖 PO 提供（不阻塞结构交付）。

## 影响目录与会签
`src/components/Pages/DonateContent.astro`、`src/styles/pages/donate.css`、`src/pages/donate/index.astro`、`src/data/donators.json`、`e2e/pages-talks-donate.spec.ts`。会签：blog-pm（FAQ 文案 + 账本数值口径）、blog-qa。

## 已知风险
- G-08：占位人名必须清零；默认清空账本走空态，不编造记录。
- 账本数值无数据源 → 结构先落地、金额条件渲染；PO 不提供也不阻塞 P4-06。
- `donate.css` 缺 reduced-motion（其余 5 份都有）→ 本卡补齐并交证据。
````

### 4.6 卡 5/7 · 系列 `/series/`

| 字段 | 值 |
|---|---|
| 标题 | `M8-6-5 · 系列页视觉重做 + `.series-*` 从 tags.css 拆出（/series/）` |
| assignee | `blog-fe`（会签：`blog-qa` `/tags/` 回归） |
| parents | 地基卡 |
| 批次 / 预算 | 批一 / **0.75 人日（6 h）**，2 sessions（FE 置信度：高） |
| 备注 | 先做**纯搬移**再改视觉；`tags.css` 被 7 条路由共用且 `/tags/` 无 gated 基线 → 搬移阶段必须手跑 `/tags/` 对比 |

````markdown
## 目标
把 `/series/` 索引与详情重做为 `marx_s_blog_series_collections_1`（移动 `_2`），并把寄居在 `tags.css` 的 `.series-*` 规则拆到独立文件，解除「改系列会连带 `/tags/`」的耦合。

## 现状（实测，勿重查）
- `src/pages/series/[...slug].astro`（95 行，rest 路由：零系列 = 零路由，D-0145）→ `SeriesHub`（62 行）+ `SeriesPosts`（69 行）+ `SeriesNav`（98 行）。
- 样式：**没有自己的 CSS 文件**，`.series-*` 全部写在 `src/styles/pages/tags.css`（558 行 / 8 个 `@media` / 7 条路由共用），文件头自注「M5-12，未在本卡范围内」。
- 页头借用 `.tags-hero`（无底部分隔线）；详情页 `.tag-detail__hero` 变体；步骤序号 `.series-step__marker` 用 `fg-link`（应 `fg-muted`，D10）。
- 空态：零系列 = 零路由，**没有空态可验**（QA §2.5 / §5.2 B）；基线 fixture 0 篇带 series → 不产 `/series/`。
- 真实数据：2 个系列（`hermes-agent`、`sing-box`）。

## 范围（做）
1. **阶段 a 纯搬移（规则内容逐字不变）**：把 `.series-*` 与 `.series-hub` / `.series-detail` 容器规则从 `tags.css` 抽到新文件 `src/styles/pages/series.css`；`[...slug].astro` 改 import。**先**手跑 `/tags/`、`/tags/<tag>/` 1440/390 × light/dark 对比截图（共 4 张/尺寸），确认 0 视觉差，再进入阶段 b。
2. Hero → `PageHero`（`divider={false}`，与 tags-hero 现状一致）；详情页「← 返回」走默认 slot 的 `Link`。
3. 索引：`SeriesHub` 列表项（名称 / 链接 / `共 N 篇文章` / 最近更新时间），按展示名排序。
4. 详情：`SeriesPosts` 步骤序号 `01..` 改 `fg-muted`；`seriesOrder` 升序优先、缺省 `pubDate`；>12 篇折叠（设计稿要求）；`.series-nav`「第 01 / 02 篇」保持（P5-06，属文章页，本卡只核对不重做）。
5. 容器节奏：`space-8` 是否统一到 `space-10` 由本卡判定并在 report 写明（U2 未决，选一个并留痕）。
6. `DataState` 本期不用（零系列=零路由，不造假空态）。

## 不做
不改「零系列 = 零路由」；不改文章页 `.series-nav` 的算法；不动 `/tags/` 的 `.tag-*` 规则；不为系列新增 gated 视觉基线（要基线需单开平台卡，QA §2.5）。

## 数据与空态口径
- 空态 = 真实空集合：`CONTENT_ARTICLE_BASE=e2e/fixtures/pages-visual/content/article ./node_modules/.bin/astro build --outDir test-results/m86-series-empty` → 构建 exit 0、**无 `series/` 目录**、`/series/` 404、不出现「暂无系列」空壳页。
- 系列名由 slug 派生；`series` 必须 ASCII 小写 kebab；重复 `seriesOrder` 回落 `pubDate`，不炸构建；单篇系列也能成页。

## 移动版要求（最低限度档）
375/390：索引单列；详情篇目单列；`.series-step` grid 不横向溢出；>12 篇折叠可展开；序号与标题不重叠。

## 验收（引用，不重写）
- 通用：QA §1 **G-01…G-24**。
- 本页专项：§2.5 **P5-01…P5-06**。
- 空态：§5.2 B + §5.3 系列行 + §5.4 E-10。
- 移动：§3.5 最低限度 + 375 light 证据。
- 视觉基线：§4 **V-06**（∉ PAGES 且 fixture 不产 `/series/` → 豁免；交 1440 light/dark + 390 light + 375 light + `series.spec.ts` 全绿）。
- `/tags/` 回归：搬移后 `/tags/`、`/tags/<tag>/` 截图 0 差异（本卡自证，不依赖 gated 基线）。
- 判定：§6；开工前已知阻断：§6.3 系列行「无数据 S1」。

## 交付物
`docs/_reviews/M8-6/M8-6-5/report.md` + 4 张证据 + `/tags/` 搬移前后对比 4 张/尺寸 + `pnpm run series:e2e` 全绿输出 + `git diff` 证明 `tags.css` 只删不加 `.series-*`。

## 预算与阶段
| 阶段 | 内容 | 预算 |
|---|---|---:|
| a | 纯搬移 `series.css` + import 切换 + `/tags/` 对比（规则逐字不变） | 3 h |
| b | 视觉重做（索引项/序号颜色/折叠）+ 移动 + e2e/证据 | 3 h |
阶段 a 必须单独 commit（`refactor(series): 抽离 series.css`），便于回滚；阶段 b 再改视觉。

## 依赖
父：M8-6-0 地基卡。

## 影响目录与会签
`src/styles/pages/tags.css`（只删 `.series-*`）、`src/styles/pages/series.css`（新增）、`src/pages/series/[...slug].astro`、`src/components/Series/*.astro`、`e2e/series.spec.ts`。会签：blog-qa（`/tags/` 回归）。

## 已知风险
- R2/R3：`tags.css` 7 路由共用、`/tags/` 无 gated 基线 → 搬移必须逐字不动 + 手跑对比，不许「顺手优化」。
- R8：系列无空态 → 用零系列 fixture 构建验证 404，不建空壳页。
- 文件数：6 个触点 > D-0149 ≤4 → 用阶段 a/b 切分，每阶段 ≤4 源文件（D-0156）。
````

### 4.7 卡 6/7 · 移动页

| 字段 | 值 |
|---|---|
| 标题 | `M8-6-6 · 移动端收口：底栏 tab bar + 4 页完整移动验收` |
| assignee | `blog-fe`（会签：`blog-qa` 基线重刷） |
| parents | 地基卡 **+ M8-6-2 文化卡**（唯一页间父边） |
| 批次 / 预算 | 批二（**需 PO 追加**）/ **1.0 人日（8 h）**，2 sessions（FE 置信度：低） |
| 备注 | 本卡改 `BaseLayout` = 全站表面 → 触发 atoms 72 + pages 42 全量基线（V-03），由 QA 在批次末尾跑 |

````markdown
## 目标
补齐全站移动端形态：≤640 的底栏 tab bar（新组件，全站级）+ 4 个路由（`/`、`/article/<slug>/`、`/albums/`、`/culture/`）的**完整移动验收**并修掉实测问题。不重做这 4 页的桌面设计。

## 现状（实测，勿重查）
- `src/layouts/BaseLayout.astro`（239 行），`tabbar|bottom-nav` grep **0 命中** → 底栏需新建。
- 4 张移动主稿：`mobile_home`、`mobile_article_detail`、`mobile_albums_gallery`、`mobile_culture_hub`（`_design/stitch-v2/screens`，`ls | grep mobile` 实测 4 张）。
- 已实现（本卡只验收，不重做）：首页 ≤767 隐藏 `.popular-section` / `.friends-section`；文章 ≤1023 `.post-toc-drawer[popover]` 右上抽屉 + `.post-toolbar` sticky；相册 `.albums-wall` <640=1 / 640–1023=2 / ≥1024=3 列；文化四段横滑由 M8-6-2 落地。
- 移动宽度两套：基线 375、页面 spec 390（QA §8-6）→ 两档都要过。

## 范围（做）
1. **底栏 tab bar（新组件）**：只在 `≤640` 渲染且默认 `display:none`（无 JS 也安全），`env(safe-area-inset-bottom)`，4 个入口（首页/文章?/相册/归档或文化——按 `mobile_home` 稿定），当前页 `aria-current="page"`，命中区 ≥44×44，相邻 ≥8px；先在 `/design/components/` 或现有预览位验收，再上全站。
2. `/`：`.home` / `.home-shell` 存在；h1/作者卡/最近文章/随笔/照片在前 1 屏内；≤767 热门/友链 `display:none` 且不占布局高度。
3. `/article/<slug>/`：`.post` 存在；`javaScriptEnabled:false` 下 h1 + 首段可读；TOC 触发器可点；关闭态不占视口，打开态 `::backdrop` 用 `--color-bg-scrim`；`Esc` 关闭、焦点回填、滚动锁/恢复。
4. `/albums/`：列数断点一致；灯箱 `Esc` 关闭、焦点回触发元素；相邻图预加载 ≤1 张。
5. `/culture/`：四段横滑可触摸/键盘；每段标题可读屏；无内容段不渲染空轨（**实现已在 M8-6-2，本卡只复验**）。
6. 修实测问题：横向溢出、遮挡（`scroll-margin-top`）、hover-only 操作、<16px 正文、CLS >0.05、站内 4xx。

## 不做
不重做 home/article/albums 的桌面设计（属 M6-2/M6-3/M8-3）；不新建 `/m/` 独立路由（仓库无此路由，本卡定义 = 5 个内容页 @390 + 底栏）；不动弹层组（TOC/评论/搜索/分享归 M7，已由 overlays 系列 spec 覆盖）；不改 `pages.visual` PAGES 数组。

## 移动版要求（完整 4 页）
QA §3.4 **M-01…M-16** 全表，逐路由跑：
- M-01 路由/主题、M-02 无横向溢出（375/390）、M-03 首屏有效、M-04 移动导航、M-05 触控目标、M-06 正文可读、M-07 图片稳定/CLS、M-08 遮挡、M-09 安全区、M-10 抽屉/灯箱、M-11 reduced-motion、M-12 无 hover 依赖、M-13 axe、M-14 运行时干净、M-15 内容对齐、M-16 证据。

## 数据与空态口径
本卡不新增数据、不新增空态；4 路由的既有空态（`data-albums-empty`、`data-culture-empty` 等）按 QA §5 已验证，不重测（§6.4 只重跑失败项）。

## 验收（引用，不重写）
- 通用：QA §1 **G-01…G-24**。
- 本卡专项：§2.6 四路由结构断言 + §3.4 **M-01…M-16**。
- 证据：§2.6（4 路由 × 2 主题 = 8 张 375×812 + 390 溢出日志 + 交互截图：TOC 开/关、灯箱、四段横滑起/终）。
- 视觉基线：§4 **V-03**（改 `src/layouts/**` → atoms 72 + pages 42 全量 × 2 平台，QA/operator 执行）+ **V-05**（4 页 375 列变化含在 6 张内）。
- 判定：§6；开工前已知阻断：§6.3 移动页行「以 §3.4 实测为准」。

## 交付物
`docs/_reviews/M8-6/M8-6-6/report.md` + 8 张 375 双主题 + 交互截图 + 390 溢出日志（0 越界）；`pnpm exec playwright test e2e/pages-home.spec.ts e2e/pages-article.spec.ts e2e/pages-albums.spec.ts e2e/pages-culture.spec.ts` 全绿。

## 预算与阶段
| 阶段 | 内容 | 预算 |
|---|---|---:|
| a | 底栏组件（≤640、display:none 默认、安全区）+ 3 页收口（home/article/albums） | 4 h |
| b | `/culture/` 四段复验 + 4 页证据/溢出日志 + 基线重刷协调 | 4 h |

## 依赖
父：M8-6-0 地基卡 + **M8-6-2 文化卡**（`/culture/` 四段横滑由它落地，且两卡撞同一 375 基线列）。文化卡未完成时只能做阶段 a，不得提前动 `/culture/` 的 375 基线。

## 影响目录与会签
`src/layouts/BaseLayout.astro`、新底栏组件（`src/components/Layout/**`）、`src/styles/pages/{home,article,albums,culture}.css`（仅断点修补）、`e2e/pages-{home,article,albums,culture}.spec.ts`。会签：blog-qa（全量基线，V-03）、blog-design（底栏形态）。

## 已知风险
- R5：底栏是全站组件，改布局 = 478 页 + 42 张基线全刷 → 底栏默认 `display:none`、只在 ≤640 生效，先在预览位验收；Linux 基线由 QA 在官方镜像生成。
- 置信度低（FE）：4 页里有 3 页的移动实现属别的里程碑 → 本卡必须先实测再改，不许按稿重做。
- 若文化卡延期 → 本卡阶段 b 无法收口，按 QA §6.2 ABORT-1（依赖未就绪）`kanban_block(kind="dependency")`，不硬做。
````

---

## 5. 输入之间的冲突与裁决（PM 对本卡的实质产出）

> 三份输入不是无缝拼装的；下面 6 条是拆卡时必须钉死的分歧，每条给出裁决与代价。

### 5.1 地基卡范围：3 个组件，不是 5 个

| 项 | 设计侧（26 号） | FE 评论 | 裁决 |
|---|---|---|---|
| PageHero | IN（5 页） | IN | **IN** |
| SectionHead | IN（4 页） | IN | **IN** |
| DataState | IN（empty 4 / error 3） | 写作 `EmptyState` | **IN，名为 `DataState`**；旧 `UI/EmptyState.astro` 是 v0.9 遗留，不可复用也不删 |
| FilterBar / Chip | OUT（O2：chip 只作 `meta[]` 内部标记；筛选用既有 `tab-nav.ts`） | IN（2 h） | **OUT**；筛选在页内用 `data-tab` 事件委托，不新增原子、不新增 JS |
| ProgressBar | 未列入 IN（游戏无分母、系列用序号） | IN（1 h） | **OUT**；不做伪进度条（QA G-17 的 progressbar 断言在无分母页面不适用） |
| `pages/entities-c.css` | 文件清单无此项 | IN（0.5 h） | **OUT**；组件样式走 scoped style，页内规则留在各自页面 CSS |

**影响**：地基卡本体从 FE 的 12 h 里少 3 h 工作量，但预算仍记 **1.5 人日**——差额作为 0.5 缓冲，抵消 FE 未计入的文档页双主题截图、4 条门禁返工与 13 触点切换成本。这是保守取法，不是虚报。

### 5.2 地基卡的预算记账：留在 M8-6 账内

FE 的 C 方案把地基 1.5「移出 M8-6 与 M8-1/M8-2 共担」，M8-6 记 6.25。本文**不采用这个记账**：
- 地基卡的 13 个触点、380–450 行、3 个 session 都是 M8-6 批一的真实工作量，移出账目会让批一看起来「4.0 做 4 项」，实际是 4.0 做 1 地基 + 3 页；
- 共担的正确表达是**复用收益**（M8-2 三页同样用 PageHero/SectionHead/DataState，免二次开发），不是把成本从一张卡挪到另一张卡的账上；
- 因此 M8-6 总需求 = **7.75 人日**（不是 6.25），批一 4.0 / 批二 3.75。差异 **1.5** 就是地基归属口径，不改变人日实数。

### 5.3 30 min/卡 vs 每页 ≥6 h

- 任务书把卡数冻结为 7（1+6），FE 的 R7 证明「每页 ≥6 h，30 min 单卡必然超时」（M7-2a/3a/3c 全部由 operator 收口）。
- 裁决（D-0156）：**一页一卡 + 卡内两个强制阶段**。阶段 a = 结构/组件（≤4 源文件、≤300 行），阶段 b = 移动 + 证据。单卡 2 次 dispatch，每 session 30 min / 60 iter；阶段 a 收口必须 WIP commit + report 阶段结论；阶段 b 未完成 → `kanban_block(kind="transient")` 交 operator，**不许沉默跑到 150 iter**。
- 若 PO 允许放宽卡数上限，按下表机械展开为 12 张，内容零改写：

| 7 卡形态 | 展开为 12 张时的子卡 |
|---|---|
| M8-6-0 | `-0a` PageHero+SectionHead / `-0b` DataState / `-0c` 文档+分母+门禁（3 张，串行） |
| M8-6-1 | `-1a` 结构+banner+拓扑 / `-1b` 移动+筛选+e2e |
| M8-6-2 | `-2a` 三分区+卡片 / `-2b` 热力图+空态 / `-2c` 四段轨+基线 |
| M8-6-3 | `-3a` 两栏+时间流 / `-3b` 移动+e2e |
| M8-6-4 | `-4a` 支付卡+账本+FAQ / `-4b` 移动+五态 |
| M8-6-5 | `-5a` 纯搬移 series.css / `-5b` 视觉+e2e |
| M8-6-6 | `-6a` 底栏+3 页 / `-6b` culture 复验+证据 |

### 5.4 预算分配与裁剪决定

**采纳：C 方案的批次结构（批一用满 4.0，批二追加 3.75）。**

| 批次 | 卡 | 人日 | 小时 | 累计 |
|---|---|---:|---:|---:|
| 批一（4.0，原预算内） | M8-6-0 地基 | 1.50 | 12 | 1.50 |
| | M8-6-4 赞助 | 0.75 | 6 | 2.25 |
| | M8-6-5 系列 | 0.75 | 6 | 3.00 |
| | M8-6-3 随笔 | 1.00 | 8 | **4.00** |
| 批二（3.75，需 PO 追加） | M8-6-1 游戏 | 1.25 | 10 | 5.25 |
| | M8-6-2 文化 | 1.50 | 12 | 6.75 |
| | M8-6-6 移动页 | 1.00 | 8 | **7.75** |

- **与 FE 逐项估算无差异**（1.5 / 1.25 / 1.5 / 1.0 / 0.75 / 0.75 / 1.0 原样采纳）；差异只在记账口径（§5.2）与阶段切分（§5.3）。
- **批一 0 缓冲**：4.0 正好用满，收口风险落在 operator（FE 同样提示）。不为了「看起来有余量」砍任何一页的范围。
- **明确不采纳的方案**：
  - **A（4.0 只做地基 + 3 页，其余顺延）**：与「批二未获批准」的形态等价，已内含在本方案里，不单列；
  - **B（5.5 全 6 页降级）**：砍掉的正是稿子与现站的差异点（拓扑/热力图/两栏/底栏），等于先做假换皮再返工，且仍超 1.5 人日 → 否决；
  - **D（8.0 一次做完）**：风险集中、需一次批 8 人日，PO 未批 → 暂不采纳；若 PO 选择 D，本文的 7 张卡与阶段划分不变，只是批二立即派工。
- **未获追加的后果写死**：批二三卡创建后停在 todo（不进 ready），M8-6 出口降级为「地基 + 3 页」；**不得**靠压缩验收（跳过移动/证据/基线）来「做完 6 页」。

### 5.5 数据缺口的三条写死口径

| # | 缺口 | 卡内口径 |
|---|---|---|
| 1 | 文化热力图无 bangumi 消费日期 | 只吃 `douban.json` 的 `date`，标题写「豆瓣入账日期」；禁止用 `updated_at` 冒充 |
| 2 | 游戏无 `cover`、进度无分母 | banner 走无图版；不渲染 `role="progressbar"`，只显示时长文本；`cover` 字段留 M8-1 |
| 3 | 系列 0 系列无空态 | 零系列 = 零路由，用 fixture 构建验 404；不造空壳页 |

### 5.6 赞助账本：结构先落地，数值待 PO

设计稿的 ¥1,420 / 68% 是样稿数字；仓库无账本数据源，PO 也没给真实支出。裁决：账本**结构与断言先落地**（caption / `th[scope]` / 375 卡片化），**金额列与覆盖进度只在 PO 提供真实数值时渲染**；不写 0、不复制样稿数字。P4-06 断言的是结构，不是金额，故不阻塞本卡 PASS。FAQ 文案用设计稿三条（用途/上榜/匿名），PO 会签后落地。

---

## 6. 执行与收口协议（7 张卡通用）

1. **验证分道**（D-0149）：worker 只跑 targeted build + 本卡 spec + 本卡截图；`gates:all`、双平台视觉基线、全量 perf 由 operator/CI 在批次末尾跑一次。不建纯验收卡。
2. **session 预算**（D-0149/D-0150/D-0152/D-0156）：25–30 min / 60 iter；60% WIP commit；只 build 一次（视觉迭代用 `astro dev`）；需要第二次全量 build 就交接，不把构建等待算成实现时间。卡创建时设 `max_runtime_seconds=1800`。
3. **阶段门**：每张页卡阶段 a 结束必须 commit（`feat(<page>): 结构/组件阶段`）+ 在 report 写「已过哪些 ID、还剩哪些」；阶段 b 结束才允许 `kanban_complete`。
4. **证据路径**：`docs/_reviews/M8-6/M8-6-<n>/report.md`；截图至少 1440 light/dark + 390 light + 375 light（移动完整 4 页另加 375 dark 与交互截图）——QA G-24。
5. **基线分工**：地基卡 → 全量 42+72 × 2 平台；文化 → 本页 6 张 × 2 平台；移动页 → 4 页 375 列 + 全量（改 BaseLayout 触发 V-03）；页面外 3 页 → 只交证据，不新增 gated 基线。Linux 基线只在官方镜像生成，不得用 macOS 冒充（QA §4.4）。
6. **ABORT 口径**：只按 QA §6.2 四种触发（地基未合入 / 数据源不可得且无合法空态 / 双平台证据不可得 / 范围必须越界）；「视觉不满意」「稿子有歧义」是 REQUEST_CHANGES，不是 ABORT。
7. **会签**：`docs/DESIGN.md` 改动由 blog-design 会签；`component-inventory`/`FROZEN_COUNTS` 由 blog-platform 会签；账本数值与 FAQ 文案由 blog-pm（PO）会签；基线由 blog-qa 会签。
8. **禁止**：跨卡改共享文件（`entities.css`/`entities-b.css`/`tags.css`/tokens/shell 的存量规则）；伪造示例数据；用 route mock 造空态；把 macOS 基线冒充 Linux。

---

## 7. 占位卡 `t_3e96f36a` 收尾记录

| 项 | 值 |
|---|---|
| 占位卡 | `t_3e96f36a` ·「M8-6 · 游戏 / 文化 / 随笔 / 赞助 / 系列 / 移动页（milestone 占位）」，assignee `blog-fe`，status `todo` |
| 处置 | **关闭（done / archived）**，不执行。执行者 = operator/PO：worker 的工具层禁止跨卡变更状态（`kanban_complete` 对非本卡返回 `worker is scoped to task …`），本卡已留 `kanban_comment`（comment_id 171）作交接；operator 执行 `hermes kanban --board blog2 complete t_3e96f36a --summary "M8-6 已拆解，由 M8-6-0…6 替代（27 号文档 §7）"` 即可。 |
| 替代关系 | 地基 → `M8-6-0`；游戏 → `M8-6-1`；文化 → `M8-6-2`；随笔 → `M8-6-3`；赞助 → `M8-6-4`；系列 → `M8-6-5`；移动页 → `M8-6-6` |
| 记录位置 | ①本文 §7；②`blog2.0/docs/decision-log.md` **D-0154**；③`t_3e96f36a` 的 `kanban_comment` + 完成 summary |
| M8-0 状态 | `t_8b1853ff` blocked、门禁 `t_9079ba85` blocked（无合法音频源，D-0153）。**不阻塞 M8-6**：只卡 M8-4。 |
| M8-1 状态 | `t_c166bd51`「占位跟踪卡，不执行」todo，schema v2 未开工。地基卡按设计口径挂它为父；页卡不继承该边（A2：6 页实体契约不变）。 |
| 未创建的卡 | 本次只交「可创建清单」；7 张卡的实际创建由 operator/PO 按 §4 粘贴 body。若 PO 冻结批二预算，只创建批一 4 张。 |

**追溯链**：占位卡 → 本文（§2 映射 + §4 body）→ D-0154/D-0155/D-0156 → 7 张卡 → QA 条目 ID。任一处断链，QA 可按上表反查。

---

## 8. 风险与未决

| # | 项 | 状态 / 处置 |
|---|---|---|
| 1 | 批二 3.75 人日未获追加 | **待 PO 决定**（审批人 MarxChou）。未批前批二三卡只创建不派工；出口降级为「地基 + 3 页」 |
| 2 | 地基卡挂 M8-1 父边，而 M8-1 未开工 | 设计口径保留该边；若 PO 要并行，删边零返工（本文 §4.1 依赖段已写明） |
| 3 | 移动页 ↔ 文化卡父边 | 唯一页间依赖，理由见 §3；若强行并行，375 基线会互撞（QA §4.4-2） |
| 4 | 赞助账本数值无来源 | 结构先落地、金额条件渲染；PO 提供后补数据卡（不在本 7 张内） |
| 5 | 游戏/赞助示例数据 | 默认走空态；PO 提供真实记录后再补内容卡（不伪造） |
| 6 | DESIGN.md 卡片圆角自相矛盾（§3.7 md vs §5.6.5 lg） | **未决**，属 design owner；地基卡不实现卡片，页卡统一迁 Card atom（lg），若裁决改 md 只改 atom 一处 |
| 7 | 系列容器 gap（space-8 vs space-10） | 交给系列卡判定并留痕（U2） |
| 8 | games/talks/donate/series 是否新增 gated 基线 | **本里程碑不扩容**（QA 口径），要基线单开平台卡 |
| 9 | 4 人日是否真的够 | **不够**：7.75 vs 4.0，缺口 3.75；本文用批次与阶段门把风险显性化，不用降级掩盖 |

---

## 9. 变更记录

| 版本 | 日期 | 内容 |
|---|---|---|
| v1.0 | 2026-11-09 | 首版：7 卡冻结（1 地基 + 6 页）、预算分两批（4.0 / 3.75）、依赖图（1 处页间例外）、4 条输入冲突裁决、7 份可直接粘贴的卡 body、占位卡收尾与 D-0154–D-0156 |
