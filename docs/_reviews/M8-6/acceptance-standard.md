# M8-6 验收标准 · 六页与移动端

> **状态**：v1.0（2026-11-09，`blog-qa`）
> **适用**：M8-6 拆出的 6 张页面叶卡（游戏 / 文化 / 随笔 / 赞助 / 系列 / 移动页）。
> **上游契约**：`blog2.0/docs/25-stitch-v2-plan.md` §3「M8-6」、`_design/stitch-v2/selection.md` §3/§4.6/§4.10/§4.13/§4.14/§4.15、`D-0147`、`D-0149`、`D-0151`、`D-0152`。
> **代码基线**：`zcblog-v2` 工作区；已有 `e2e/pages-*.spec.ts`、`e2e/series.spec.ts`、`e2e/pages.visual.spec.ts`。
>
> 本文件是 M8-6 六张叶卡的**唯一验收入口**。卡面只写「引用本文件 §1 + §2.x + §6」，不重写标准；卡面与本文件冲突时以本文件为准，除非 decision-log 有更新的明确决定。

---

## 0. 引用方式与卡片映射

| 卡片代号 | 页面 | 路由 | 主方案（桌面） | 移动方案 | 本文件章节 |
|---|---|---|---|---|---|
| **M8-6-1** | 游戏 | `/games/`、`/en/games/` | `marx_s_blog_gaming_hub_2` | `marx_s_blog_gaming_hub_1` | §2.1 |
| **M8-6-2** | 文化 | `/culture/`、`/en/culture/` | `marx_s_blog_3` | `marx_s_blog_mobile_culture_hub` | §2.2 |
| **M8-6-3** | 随笔 | `/talks/`、`/en/talks/` | `marx_s_blog_talks_blinko_1` | `marx_s_blog_talks_blinko_2` | §2.3 |
| **M8-6-4** | 赞助 | `/donate/`、`/en/donate/` | `marx_s_blog_donate_supporters_2` | `marx_s_blog_donate_supporters_1` | §2.4 |
| **M8-6-5** | 系列 | `/series/`、`/series/<slug>/`、`/en/series/…` | `marx_s_blog_series_collections_1` | `marx_s_blog_series_collections_2` | §2.5 |
| **M8-6-6** | 移动页 | `/`、`/article/<slug>/`、`/albums/`、`/culture/` | 对应桌面页 | 4 张 `mobile_*` 稿 | §2.6 + §3 |

**叶卡必须逐条通过**：§1 全部通用项（G-01…G-24）+ §2.x 本页专项项 + §6 判定规则。只过专项、不过通用，不算 PASS。

---

## 1. 通用验收清单（6 页每页必过）

> 每条都给出**判定方式**。`✅` 表示必须成立；不成立即该项 FAIL，按 §6 判 REQUEST_CHANGES 或 ABORT。
> 所有 DOM 断言都按**属性/选择器**判定，不做「看上去像」的目测。

### 1.1 结构完整

| ID | 验收项 | 判定方式（可执行） |
|---|---|---|
| **G-01** | 路由可访问 | zh 与 en 路由均 `GET` 返回 **200**；无 meta-refresh 中转、无 301 链；系列 zh-only 的 en 详情允许 404（见 §2.5）。 |
| **G-02** | 唯一 h1 | 页面主体内 `h1` 恰好 **1** 个；页面容器有 `aria-labelledby` 指向该 h1 的 `id`。 |
| **G-03** | 标题层级连续 | `h1→h2→h3` 不跳级；每个 `<section>` 有可访问名（`aria-labelledby` 或 `aria-label`）；空标题不算。 |
| **G-04** | 设计区块齐全 | §2.x 的「必需区块表」逐项存在且非空壳；缺一项 FAIL；出现未在契约中的第二套页面/卡片 FAIL（D-0147 一页一主方案）。 |
| **G-05** | 组件复用 | 卡片/筛选/标签/KPI 等复用**地基卡**提供的共享组件；本页不得复制一套新的按钮/卡片/徽章样式。允许页面级布局 CSS，不允许第二套视觉语言。 |

### 1.2 真实数据渲染

| ID | 验收项 | 判定方式 |
|---|---|---|
| **G-06** | 计数一致 | 页面 `data-*-total` = 数据源有效条目数；卡片数、分组数、明细数按 §2.x 公式与 total 对齐。差 1 条即 FAIL。 |
| **G-07** | 字段完整、不造假 | 每条记录的必需字段非空（§2.x 字段表）；未知字段**不渲染空标签、不填 0 冒充已知**（`games.ts` 头注释明确：没统计就删字段）。 |
| **G-08** | 无占位假数据 | 页面主体 HTML 中以下模式命中数必须为 **0**（大小写不敏感）：`示例`、`样例`、`sample-`、`placeholder`、`Lorem`、`待替换`、`seed（`、`TODO`、`FIXME`、`张三`、`李四`、`王五`、`赵六`、`测试用户`。同时 `data-*` 来源标签不得声明 `seed`。 |
| **G-09** | 外链与图片 | 外链必须 `http(s)`，新窗口带 `target="_blank"` 时必须有 `rel="noopener noreferrer"`；`<img>` 必须有可读 `alt`（装饰图 `alt=""` + `aria-hidden`）、有 `width/height` 或 `aspect-ratio`；**0 个空 `src`、0 个破图**。 |
| **G-10** | 中英同源 | zh/en 的 total、条目 id、状态一致；en 页 h1 为英文；不出现中文正文漏到 en。系列 zh-only 不生成 en 详情，语言切换器回 `/en/series/`（现有 e2e 已覆盖）。 |

### 1.3 空态真实呈现

| ID | 验收项 | 判定方式 |
|---|---|---|
| **G-11** | 空态可构建 | 按 §5 的真实构建触发空态，`astro build` 退出码 **0**；目标路由 HTML 必须产出（系列例外：零系列=零路由，见 §2.5）。 |
| **G-12** | 空态可判定 | `data-<page>-status=empty`、`data-<page>-empty` 存在且可见、条目数 **0**、h1/导航/页脚仍在、路由 **200**。 |
| **G-13** | 空态无假填充 | 空态下 **0 张条目卡**、无骨架屏、无「0 条」空卡、无占位图、无空 `<img>`；页面不靠隐藏数据冒充空态。 |
| **G-14** | 空态/错误态分离 | empty 与 error 互斥；error 有原因代码与 warning 提示；empty 不显示 error 文案，error 不显示空态块。 |

### 1.4 a11y 基本项

| ID | 验收项 | 判定方式 |
|---|---|---|
| **G-15** | axe 零阻断 | 页面主体范围内跑 `wcag2a/aa + wcag21a/aa + wcag22aa`：`serious + critical = 0` 且 `incomplete = 0`，light/dark 双主题。沿用 `e2e/pages-*.spec.ts` 的 axe 配置与作用域。 |
| **G-16** | 键盘与焦点 | Tab 顺序 = DOM 顺序；每个可聚焦元素焦点环 **≥2px** 且颜色 = `--color-ring-focus`；不得有 `aria-hidden="true"` 包裹可聚焦元素。 |
| **G-17** | 语义 | 列表用 `ul/ol`；装饰性序号/状态点/评分刻度 `aria-hidden="true"`；进度用 `role="progressbar"` 且有可读 `aria-valuenow/valuetext`；状态不能只靠颜色区分。 |
| **G-18** | 减少动效 | `prefers-reduced-motion: reduce` 下**运行中动画为 0**，区块位移 `<0.5px`（沿用 `pages-talks-donate.spec.ts` 的判定）。 |

### 1.5 无布局溢出

| ID | 验收项 | 判定方式 |
|---|---|---|
| **G-19** | 横向溢出 | 375/390/768/1024/1440 × light/dark：`document.documentElement.scrollWidth ≤ clientWidth + 1`；越界元素数 **0**（自身 `overflow-x: auto/scroll/hidden/clip` 的容器除外）。 |
| **G-20** | 文本不裁切 | 每个可见文本块 `scrollWidth ≤ clientWidth + 1`，或使用 `text-overflow: ellipsis` 且具备 `title`/`aria-label`；禁止 `overflow:hidden` 静默截断。 |
| **G-21** | 断点契约 | 逐页 §2.x 的断点表成立；列数、隐藏区块与 `selection.md` 一致（示例：首页 ≤767 隐藏热门/友链；随笔 ≤768 sticky 侧栏降级；相册 <640/640–1023/≥1024 = 1/2/3 列）。 |
| **G-22** | 移动触控 | 本卡**新增或改动**的可点元素命中区 **≥44×44 CSS px**（文字链接用 padding 补足），相邻可点目标间距 **≥8px**。既有未改动元素若 <44px，记 S3 并在报告里列出归属页，不阻断本卡 PASS。 |

### 1.6 性能与证据

| ID | 验收项 | 判定方式 |
|---|---|---|
| **G-23** | 性能不回退 | `pnpm run build:ci` + `python3 scripts/gates/perf-budget.py dist`：列表页 JS **≤28KB**、文章页 **≤40KB**、HTML p95 **≤150KB**；CLS **≤0.05** @390/1440；本页关闭态无新增第三方请求。 |
| **G-24** | 证据齐全 | `docs/_reviews/M8-6/<card>/report.md` 含「验收项 → 命令 → 输出 → 结论」表；截图至少 1440 light/dark + 390 light + 375 light（移动完整验收另加 375 dark 与交互截图）；截图文件名含页面/宽度/主题。 |

---

## 2. 逐页验收条目

> 每页先给「资料表」，再给「必需区块 / 数据 / 空态 / 移动 / 基线」。
> 每页专项用编号 **P1-01…P5-06**；移动 4 页用 §3.4 的 **M-01…M-16**。卡面可直接引用这些 ID。
> 现有 spec 已覆盖的项直接复用，不重复造断言；新卡只补本页新增的视觉与移动项。

### 2.1 M8-6-1 · 游戏 `/games/`

**资料**

| 项 | 值 |
|---|---|
| 路由 | `/games/`、`/en/games/` |
| 设计稿 | 桌面 `gaming_hub_2`；移动 `gaming_hub_1` |
| 数据源 | `src/data/entities/games.ts`（typed，`normalizeCollection` + `gameSpec`） |
| 现有 spec | `e2e/pages-c1-devices-games.spec.ts` |
| 空态开关 | `PUBLIC_GAMES_STATE=empty`；错误态 `=error` |
| 视觉基线 | **不在** `pages.visual` PAGES 内 → 本里程碑只做证据截图（§4 V-06） |

**必需区块（缺一 FAIL）**

| ID | 区块 | 选择器 / 断言 |
|---|---|---|
| **P1-01** | 页面容器 | `article.entities.entities--games` 恰好 1 个；`data-games-status="ok"`、`data-games-total`、`data-games-groups`、`data-games-stale`、`data-games-updated` 存在 |
| **P1-02** | h1 | `#games-title` 恰好 1 个，`aria-labelledby="games-title"` |
| **P1-03** | Hero meta | 总数 chip 恒在；`已通关` chip 仅当 `finishedCount>0`；`小时` chip 仅当 `totalHours>0`；更新时间 chip 仅当 `feed.updated` 非空 |
| **P1-04** | 分组 | `.game-sections` 下 `.entities-section` 数 = `data-games-groups`；顺序固定 `playing → finished → backlog → shelved`；每组 h2 `id="game-state-<status>"` |
| **P1-05** | 卡片 | `.game-card` 数 = `data-games-total`；序号 1..N 与视觉顺序一致；每卡 title/platforms/statusText/note 非空 |
| **P1-06** | 评分 | 有 `rating` 时 5 格刻度且点亮数 = rating，可见文字 `x/5`；无 `rating` 时 0 格、无空评分文本 |
| **P1-07** | 串流拓扑 | 按 `selection.md` §4.10 **只桌面渲染**；≤767 不出现（它不是内容，是炫技位） |

**数据真实性专项**

- 当前 `games.ts` 4 条全部是 `id=sample-*`、标题含「（示例）」、`meta.source="seed（待替换为真实记录）"` → **G-08 直接 FAIL**。卡内必须二选一：
  1. 换成真实游玩记录（真实标题/平台/状态/一句话评价；`hours`/`rating` 没有就删字段，不填 0）；
  2. 删掉示例条目，让页面以**真实空态**上线（空态是设计内状态，不是缺陷）。
- `hours` 合计 = 各条 `hours` 之和；没填 `hours` 的条目不参与合计，不按 0 计入「平均」等派生指标。

**空态（§5 方法）**

- `PUBLIC_GAMES_STATE=empty` 构建 → `data-games-status=empty`、`data-games-total=0`、`data-games-groups=0`、`[data-games-empty]` 可见、`.game-card` = 0、h1 与页脚仍在。
- 错误态 `=error` → `[data-games-error]` 可见、有原因代码、**不**出现空态块。

**移动（最低限度，非完整 4 页）**

- 375/390：单列；状态筛选（若实现）横向滚动且可键盘/触摸操作；串流拓扑隐藏；16:9 banner 不裁人脸；无横向溢出；可点元素 ≥44×44。

**视觉基线**

- 不在 PAGES → 不新增 gated 基线。证据：1440 light/dark + 390 light + 375 light 共四张。
- 若本卡改到共享组件/外壳 → 按 §4 V-01…V-04 跑**全量** 42×2 + atoms 72×2（由 operator/CI 在批次末尾执行，不在本卡内）。

---

### 2.2 M8-6-2 · 文化 `/culture/`

**资料**

| 项 | 值 |
|---|---|
| 路由 | `/culture/`、`/en/culture/` |
| 设计稿 | 桌面 `marx_s_blog_3`；移动 `mobile_culture_hub` |
| 数据源 | `src/data/bangumi.json`（当前 31 条）、`src/data/douban.json`（当前 10 条）、`src/data/entities/music.ts`（同一实体契约） |
| 现有 spec | `e2e/pages-culture.spec.ts` |
| 空态开关 | `PUBLIC_CULTURE_STATE=empty`；缺实体 `PUBLIC_CULTURE_OMIT=music,douban` |
| 视觉基线 | **在** PAGES 内（`culture`）→ 视觉改动更新 6 张 × 2 平台（§4 V-05） |

**必需区块**

| ID | 区块 | 选择器 / 断言 |
|---|---|---|
| **P2-01** | 页面容器 | `article.entities.entities--culture` 恰好 1 个；`data-culture-status/entries/raw/unique/overlap/hidden` 全在 |
| **P2-02** | h1 | `#culture-title` 恰好 1 个 |
| **P2-03** | 入口卡 | 三源齐全时 `.culture-grid__item` = 3；每卡 1 个站内链接、3 个统计项、非空分类构成 |
| **P2-04** | 计数恒等式 | `raw − overlap = unique`；`data-culture-entries` = 实际渲染卡片数；每卡 `count > 0`（0 条来源整卡不渲染） |
| **P2-05** | 路由探针 | 每卡链接目标必须存在于 `src/pages/<href>/index.astro`；不得出现通向 404 的入口 |
| **P2-06** | 移动 4 段 | 按 `mobile_culture_hub`：番剧/书架/电影/音乐四段 snap 横滑；每段有可访问标题；无内容段不渲染空轨 |

**数据真实性**

- 三个来源都来自真实 JSON/typed 数据；不得为了凑 4 段而生成空卡或假条目。
- 豆瓣与歌单同源 4 条去重口径保留：页面同时报「原始 / 去重后」两个数，禁止只报一个好看的数。
- 封面/条目缺失时走 `EmptyState` 或整卡隐藏，不引入第三方封面代理。

**空态**

- `PUBLIC_CULTURE_STATE=empty` → `data-culture-status=empty`、`entries=0`、`raw=unique=overlap=0`、`data-culture-hidden="bangumi,douban,music"`、`[data-culture-empty="no-entries"]` 可见、0 卡。
- `PUBLIC_CULTURE_OMIT=music` → 2 卡，music 卡消失，其余计数不变，`data-culture-hidden` 含 `music`。

**移动（完整 4 页之一）**

- 除 §3.4 全部 M 项外，本页专项：四段横滑 `scroll-snap-type` 生效；键盘 Tab 能到达每段卡片；横滑容器高度不跳动；无「半张卡被裁」；触控滑动不与页面纵向滚动打架。

**视觉基线**

- `pages.visual` 已有 `culture`：视觉改动更新 `culture-{light,dark}-{375,768,1280}.png` 6 张 × 2 平台；其他 36 张必须 0 差异。
- 数据刷新（bangumi/douban 更新）如果改变计数/卡片，按 §4 V-08 同 PR 更新该页 6 张基线并检查 diff 只含内容变化。

---

### 2.3 M8-6-3 · 随笔 `/talks/`

**资料**

| 项 | 值 |
|---|---|
| 路由 | `/talks/`、`/en/talks/` |
| 设计稿 | 桌面 `talks_blinko_1`（左 3.5 栅 sticky 筛选 + 右时间流）；移动 `talks_blinko_2` |
| 数据源 | `src/data/talks.json`（当前 8 条真实 memos）→ `loadSiteTalks` adapter |
| 现有 spec | `e2e/pages-talks-donate.spec.ts` |
| 空态开关 | `PUBLIC_TALKS_STATE=empty`；错误态 `=error` |
| 视觉基线 | 不在 PAGES → 证据截图（§4 V-06） |

**必需区块**

| ID | 区块 | 选择器 / 断言 |
|---|---|---|
| **P3-01** | 页面容器 | `article.talks` 恰好 1 个；`data-talks-status`、`data-talks-total` 存在 |
| **P3-02** | h1 | `h1.talks-title#talks-title` 恰好 1 个 |
| **P3-03** | Hero meta | 条数 chip 恒在；标签数 chip 仅当 `tags.length>0`；最近时间 chip 仅当有 newest |
| **P3-04** | 时间流 | 使用 `<ol>`；`.essay-card` 数 = `data-talks-total`；`id` 唯一（锚点/去重） |
| **P3-05** | 卡片字段 | 正文非空且**已剔除 `#话题`**；外链 `http(s)` + `target="_blank"` + `rel` 含 `noopener`；配图有 `alt` 与尺寸 |
| **P3-06** | 桌面筛选 | sticky 左栏在 ≥1024 常驻；768–1023 降级为顶部横滑（不得挤压正文） |
| **P3-07** | 标签云 | ok 态 `.talks-topics` 存在；空态不渲染 |

**数据真实性**

- 8 条 memos 的 `datetime/display/content/url/images` 来自真实抓取快照；不得为了视觉塞示例卡片。
- `#话题` 只用于筛选/标签云，不留在正文；同一 id 不重复；时间显示与 `datetime` 不矛盾。

**空态**

- `PUBLIC_TALKS_STATE=empty` → `data-talks-status=empty`、`total=0`、`[data-talks-empty]` 可见、`.essay-card`=0、`.talks-topics` 不渲染、h1 仍在。
- `=error` → `[data-talks-error]` + `Alert warning` + 原因代码，且不出现空态块。

**移动（最低限度）**

- 375/390 单列；sticky 左栏在 ≤768 变顶部横滑；时间线不出现横向溢出；卡片正文与配图不裁切；外链可点区域 ≥44×44。

**视觉基线**

- 不在 PAGES → 不新增 gated 基线；证据 1440 light/dark + 390 light + 375 light 四张。

---

### 2.4 M8-6-4 · 赞助 `/donate/`

**资料**

| 项 | 值 |
|---|---|
| 路由 | `/donate/`、`/en/donate/` |
| 设计稿 | 桌面 `donate_supporters_2`（3 列支付卡 + 年度账本 + 芳名录 + 答疑）；移动 `donate_supporters_1` |
| 数据源 | `src/data/donators.json`（账本）+ `src/config/ui.ts` 的 `donatePage.accounts`（wechat/alipay/paypal 三档）+ `src/assets/qr/*` |
| 现有 spec | `e2e/pages-talks-donate.spec.ts` |
| 空态开关 | `PUBLIC_DONATE_STATE=empty`、`=error`、`=no-accounts` |
| 视觉基线 | 不在 PAGES → 证据截图（§4 V-06） |

**必需区块**

| ID | 区块 | 选择器 / 断言 |
|---|---|---|
| **P4-01** | 页面容器 | `article.donations` 恰好 1 个；`data-donate-status/total/accounts/enabled` 全在 |
| **P4-02** | h1 | `h1.donations-title#donate-title` 恰好 1 个 |
| **P4-03** | 收款方式 | 3 个 `.qr-card`（wechat/alipay/paypal）；每张二维码有可读 `alt`；`src=""` 数量 **0** |
| **P4-04** | 芳名录 | `.donator` 数 = `data-donate-total`；每条 name/amount/date 非空；`amount` 数值 >0 |
| **P4-05** | 致谢/答疑 | `.donations-thanks` 恒在；FAQ 项非空 |
| **P4-06** | 年度账本 | 新组件：表有 `caption`、表头 `th[scope]`；375 下改为卡片列表或容器内横滚，**不得**撑破页面 |

**数据真实性专项（当前阻断）**

- 当前 `src/data/donators.json` 的 4 条是 `张三 / 李四 / 吴十 / 郑十一`，已实测出现在 `dist/donate/index.html` → **G-08 直接 FAIL**。卡内必须二选一：
  1. 换成真实赞赏记录（真实昵称、金额、日期；可匿名化，但不能是明显的占位人名）；
  2. 清空账本，让芳名录走真实空态（页面已有 `data-donate-empty` 分支）。
- 收款二维码是真实资产（wechat-pay.png / alipay.jpg / paypal.png），不得换成示例图；PayPal 外链必须是真实 `http(s)`。

**空态**

- `PUBLIC_DONATE_STATE=empty` → `data-donate-status=empty`、`total=0`、`[data-donate-empty]` 可见、`.donator`=0、`data-donate-accounts=0`、无 `.donations-methods`、无空 `src`、`.donations-thanks` 仍在。
- `=no-accounts` → 当前构建 fixture 的实际产出是 `status=empty`、`accounts=0`、`donators=0`、`[data-donate-no-methods]` 可见、无任何码图/空图。它只用于验收「没有收款方式时不渲染空 `<img>`」，**不**用于验收「有账本但无收款方式」（当前开关不提供该形态；需要时用配置注入点，不在本卡范围）。
- `=error` → `[data-donate-error]` + 原因代码，且不出现空态块。

**移动（最低限度）**

- 375/390：支付卡单列；账本草稿在 375 变卡片列表（不横向滚动）；二维码不溢出；可点区域 ≥44×44；金额与日期不换行错位。

**视觉基线**

- 不在 PAGES → 证据 1440 light/dark + 390 light + 375 light 四张。

---

### 2.5 M8-6-5 · 系列 `/series/` + `/series/<slug>/`

**资料**

| 项 | 值 |
|---|---|
| 路由 | `/series/`、`/series/<slug>/`；`/en/series/…` 仅当该系列有 en 文章 |
| 设计稿 | 桌面 `series_collections_1`；移动 `series_collections_2` |
| 数据源 | 文章 frontmatter `series` + `seriesOrder`（内容契约 v5，D-0145） |
| 现有 spec | `e2e/series.spec.ts` + `scripts/series/build-e2e-fixture.mjs` |
| 空态 | **零系列 = 零路由**（`getStaticPaths` 返回 `[]`） |
| 视觉基线 | 不在 PAGES；且当前基线构建**无法**产出 `/series/`（fixture 0 系列）→ 本里程碑豁免，见下 |

**必需区块**

| ID | 区块 | 选择器 / 断言 |
|---|---|---|
| **P5-01** | 索引 | `.series-hub` 恰好 1 个；`ul.series-list[data-count=N]`，N = 有已发布文章的系列数 |
| **P5-02** | 索引排序 | 按展示名排序；每项 `.series-item` 含名称、链接、`共 N 篇文章`、最近更新时间 |
| **P5-03** | 详情 | `.series-detail` 恰好 1 个；`h1` 恰好 1 个；`ol.series-posts[data-count]` |
| **P5-04** | 篇目顺序 | `seriesOrder` 升序优先，缺省按 `pubDate` 升序；序号 `01..`；链接全部 `/article/<slug>/` |
| **P5-05** | 排除项 | 无 `series` 的文章不得出现在索引或任何系列目录 |
| **P5-06** | 文章页系列导航 | `.series-nav` 显示「第 01 / 02 篇」、目录标当前篇；首篇只有「下一篇」、末篇只有「上一篇」 |

**数据真实性**

- 系列名由 slug 派生，不额外造 `seriesTitle`；`series` 必须是 ASCII 小写 kebab；重复 `seriesOrder` 不炸构建，回落 `pubDate`。
- 单篇系列也能成页（缺省 `seriesOrder` 不阻断），不得为了「至少两篇」隐藏单篇系列。

**空态（特殊：无路由）**

- 用 `CONTENT_ARTICLE_BASE=e2e/fixtures/pages-visual/content/article`（该 fixture **0 篇带 series**）构建：
  - 构建 exit 0；
  - 产出目录 **没有** `series/`；
  - `/series/` 请求 **404**；
  - 不得出现空壳 `/series/` 页面或「暂无系列」占位页。
- 本卡已实测：上述构建 129 页 / 2m19s，`test-results/m86-empty-a/series` 不存在（见 §5 证据）。

**移动（最低限度）**

- 375/390：索引单列；详情篇目单列；`.series-step` 的 grid 不横向溢出；系列内 >12 篇时篇目折叠（设计稿要求）；序号与标题不重叠。

**视觉基线**

- **本里程碑不新增 gated 基线**。原因（事实，不是偏好）：
  1. `pages.visual` 的固定 fixture 只有 6 篇文章且 **0 篇带 `series`**，基线构建根本不会产出 `/series/`；
  2. 若往 fixture 加一篇带 `series` 的文章，会改变 `/`、`/archives/` 的文章列表，导致既有 42 张基线整体漂移；
  3. 因此系列页进入 PAGES 需要单独的平台卡（建独立 fixture / 专用 visual suite），不在 M8-6 叶卡内做。
- 本卡证据：1440 light/dark、390 light、375 light 四张 + `series.spec.ts` 全绿输出。

---

### 2.6 M8-6-6 · 移动页（4 页完整验收）

> 本卡不是新路由，而是对 4 个已有路由做**完整移动验收**并修复发现的问题。选取口径与理由见 §3；完整检查项见 §3.4。

**范围**

| # | 路由 | 设计稿 | 现有移动实现要点（已核实） |
|---|---|---|---|
| 1 | `/` | `marx_s_blog_mobile_home` | ≤767 隐藏 `.popular-section` / `.friends-section`；页脚保留入口 |
| 2 | `/article/<slug>/` | `marx_s_blog_mobile_article_detail` | ≤1023 `.post-toc-drawer[popover]` 右侧抽屉；`.post-toolbar` sticky；桌面 `.toc.post-toc` |
| 3 | `/albums/` | `marx_s_blog_mobile_albums_gallery` | `.albums-wall` <640=1 列、640–1023=2 列、≥1024=3 列；`.album-grid` 同步 column-count |
| 4 | `/culture/` | `marx_s_blog_mobile_culture_hub` | 入口卡单列；四段横滑由 M8-6-2 落地 |

**每页额外结构断言**

- `/`：`.home` 与 `.home-shell` 存在；h1/作者卡/最近文章/随笔/照片在第一屏或第一屏后 1 屏内出现；热门/友链在 ≤767 `display:none` 且不占布局高度。
- `/article/…`：`.post` 存在；无 JS 时正文可读（`javaScriptEnabled:false` 下 h1 + 首段可见）；TOC 触发器可点；抽屉关闭态不占视口（`display:none`），打开态 `::backdrop` 使用 `--color-bg-scrim`。
- `/albums/`：`.albums-wall` 列数与断点一致；灯箱打开后 `Esc` 关闭、焦点回到触发元素；相邻图预加载 ≤1 张。
- `/culture/`：四段横滑可触摸/键盘操作；每段标题可读屏；无内容段不渲染空轨。

**证据**

- 4 路由 × 2 主题 = **8 张 375×812** 截图；
- 390×844 溢出日志（0 越界）；
- 交互截图：TOC 抽屉打开/关闭、灯箱打开、四段横滑起点/终点，各 1 张。

---

## 3. 移动 4 页的选取口径

### 3.1 选取结果

**完整移动验收 = 4 页**：

1. `/`（`mobile_home`）
2. `/article/<slug>/`（`mobile_article_detail`）
3. `/albums/`（`mobile_albums_gallery`）
4. `/culture/`（`mobile_culture_hub`）

**其余页面（游戏 / 随笔 / 赞助 / 系列） = 最低限度检查**，不降低通用项，只减少移动专项交互项（见 §3.5）。

### 3.2 为什么是这 4 页（可复核的理由，不是随意指定）

1. **设计输入里只有这 4 张以 `mobile_` 前缀命名的“主移动页”稿**：`mobile_home`、`mobile_article_detail`、`mobile_albums_gallery`、`mobile_culture_hub`。其余移动画布要么是页面配对的移动断点（如 `gaming_hub_1`、`talks_blinko_2`、`donate_supporters_1`、`series_collections_2`），要么是弹层/子形态（`slide_over_toc_sheet`、`waline_comments_drawer`、`quote_card_drawer`、`redirect_guard` 等）。验收应优先验收“设计明确给出完整移动页”的目标，而不是把 27 张移动画布全拆成页面。
2. **覆盖 4 类不同的移动交互风险**：
   - 首页：长列表 + 首屏 + 移动端隐藏区块；
   - 文章：长文阅读 + sticky 工具条 + 抽屉/焦点/滚动锁；
   - 相册：图片网格 + 灯箱 + 触控手势 + 列数断点；
   - 文化：数据聚合 + 横向 snap 轨 + 卡片触控。
   这 4 类覆盖了 M8-6 六页里所有会出移动事故的交互模式；其余 4 页是静态列表/详情，风险模式已被覆盖。
3. **这 4 页都已经在 `pages.visual` 的 PAGES 矩阵里**（home / article / albums / culture），375 宽基线已存在。完整移动验收可以复用既有基线与 spec，不新增视口矩阵、不增加 CI 固定成本。
4. **其余 4 页（游戏/随笔/赞助/系列）的移动稿是同一页面的响应式结果，不是独立交互**；它们的移动风险（单列、筛选横滑、账本卡片化、篇目折叠）可以用最低限度检查覆盖，完整验收的边际收益低于维护成本。

### 3.3 为什么不是其他页 / 不是全部 27 张

- 游戏/随笔/赞助/系列的移动稿存在，但它们是**页面级重做的移动断点**，其视觉验收已包含在各自叶卡的 §2.x 中；再做一套“完整移动验收”会重复同一组通用项。
- 27 张移动画布中的弹层（TOC、评论、搜索、分享、金句卡、加密、跳转守卫）归属 M7 弹层卡，已由 `overlays.spec.ts` / 各弹层 spec 验收，不属 M8-6 页面验收。
- 把 4 页扩成 27 页会让 M8-6 的移动验收预算（4 人日）失控，且不能提高风险覆盖率。

### 3.4 完整移动验收项（M-01…M-16）

| ID | 验收项 | 判定方式 |
|---|---|---|
| **M-01** | 路由与主题 | 375×812 下 light/dark 均 200；`html[data-theme]` 正确。 |
| **M-02** | 无横向溢出 | 375 与 390 两档：`scrollWidth ≤ clientWidth + 1`；越界元素 0。 |
| **M-03** | 首屏有效 | h1 在首屏内（`top < 812` 且 `bottom > 0`）；首屏不是只有导航/空白。 |
| **M-04** | 移动导航 | `#nav-menu-btn` 可见；点击后 `aria-expanded=true`、菜单可见；`Esc`/点击外部关闭；焦点不困在菜单里。 |
| **M-05** | 触控目标 | 本卡新增/改动的可点元素 ≥44×44 CSS px；相邻目标间距 ≥8px（既有未改动元素按 G-22 记 S3）。 |
| **M-06** | 正文可读 | 正文 ≥16px、行高 ≥1.7；不出现固定高度裁切；不要求双指缩放才能读。 |
| **M-07** | 图片稳定 | 有 `width/height` 或 `aspect-ratio`；CLS ≤0.05；图片不横向溢出；`alt` 存在。 |
| **M-08** | 遮挡检查 | sticky 头部/工具条不盖住锚点标题（`scroll-margin-top ≥ 头部高度`）；底部无浮层盖住页脚/最后一条内容。 |
| **M-09** | 安全区 | 固定底部元素有 `env(safe-area-inset-bottom)`；顶部元素不压刘海。 |
| **M-10** | 抽屉/灯箱 | 打开/关闭、`Esc`、点击遮罩、焦点陷阱、焦点回填、滚动锁/恢复全部成立；关闭态不占视口、不产生布局偏移。 |
| **M-11** | 减少动效 | `prefers-reduced-motion: reduce` 下 0 运行中动画，位移 <0.5px。 |
| **M-12** | 无 hover 依赖 | 所有操作在触摸设备可用（不出现只有 `:hover` 才出现的按钮/文案）。 |
| **M-13** | a11y | 375 下 axe serious/critical=0、incomplete=0，light/dark 双主题。 |
| **M-14** | 运行时干净 | 4 路由无未捕获异常；站内 document/script/stylesheet 请求无 4xx/5xx（第三方与图片桩除外）。 |
| **M-15** | 内容对齐 | 移动端条目数与桌面一致；仅允许契约内省略（首页热门/友链、游戏串流拓扑），且省略有页脚/入口替代。 |
| **M-16** | 证据 | 每页 375 light/dark = 8 张 + 390 溢出日志 + 交互截图（§2.6）。 |

### 3.5 “最低限度检查”具体包含什么

其余 4 页（游戏/随笔/赞助/系列）在 375×812 下必须通过：

- G-01 路由 200、G-02 唯一 h1、G-04 必需区块、G-11…G-14 空态、G-15 axe、G-19 无溢出、G-20 文本不裁切、G-22 触控目标；
- **不要求** M-04 之外的移动导航细节（M-04 仍要求）、M-09 安全区、M-10 抽屉交互（这些页没有抽屉）、M-16 的 375 双主题八张证据；
- 仍要求 375 light 证据 1 张 + 390 溢出日志 1 份（1440 双主题证据见 G-24）。

---

## 4. 双平台视觉基线判定表

### 4.1 事实基线（先对齐，再判定）

| 项 | 当前事实 |
|---|---|
| 页面矩阵 | `e2e/pages.visual.spec.ts` 的 `PAGES` = 7 路由（`/`、`/article/beszel-server-monitoring-guide/`、`/archives/`、`/albums/`、`/culture/`、`/projects/`、`/404/`） |
| 视口 / 主题 | 375 / 768 / 1280 × light / dark = **42 张/平台** |
| 原子基线 | `design-atoms.visual.spec.ts` = **72 张/平台** |
| 平台目录 | macOS `e2e/__screenshots__/pages/`；Linux `e2e/__screenshots__/pages-linux/` |
| 阈值 | macOS `maxDiffPixelRatio: 0.001`；Linux `maxDiffPixels: 0` |
| 基线构建 | `node scripts/visual/build-pages-baseline.mjs`：固定 6 篇 fixture 文章（`e2e/fixtures/pages-visual/content/article`）、`ARTICLE_REPO_PATH` 指向不存在路径、第三方请求打桩 |
| 构建内容事实 | fixture **0 篇带 `series`** → `/series/` 不在基线 dist；`/games/`、`/talks/`、`/donate/` 读仓库内实时数据；`/culture/` 读实时 bangumi/douban/music |
| CI 硬断言 | job `visual (atoms 72 + pages 42 · linux baselines)`；两遍 `grep -qE "^ +42 passed"`；条数写死在 5 处（job 名 / 注释 / 2 处 grep / error 文案） |

### 4.2 判定表（按 `git diff` 路径直接套用）

> **规则**：命中哪一行就执行哪一行的动作；同时命中多行时取**动作更大**的一行（全量 > 单页 > 无）。
> “无基线”行也必须交替代证据，不能什么都不交。

| ID | 触发条件（按改动文件/类型判定） | 双平台基线动作 | 可豁免？ |
|---|---|---|---|
| **V-01** | `packages/tokens/**`、`src/styles/tokens/**`、`src/styles/fonts.css` | atoms 72 + pages 42，**全量重生成**，macOS 与 Linux 各一套 | 否 |
| **V-02** | `src/styles/base.css`、`src/styles/components.css` | atoms 72 + pages 42，全量 | 否 |
| **V-03** | `src/layouts/**`、`src/components/Layout/**`（Header/Nav/Footer/shell） | atoms 72 + pages 42，全量 | 否 |
| **V-04** | `src/components/UI/**` 或其他被 ≥2 个 PAGES 路由使用的共享组件 | atoms 72 + pages 42，全量 | 否 |
| **V-05** | 页面局部：`src/styles/pages/<page>.css`、`src/components/<Page>/**`、`src/pages/<page>/**`，且该页 ∈ PAGES | **仅该页 6 张**（2 主题 × 3 视口）× 2 平台 | 否 |
| **V-06** | 页面局部改动，且该页 ∉ PAGES（当前：`games` / `talks` / `donate` / `series`） | **不新增 gated 基线**；交 1440 light/dark + 390 light + 375 light 证据；进入 PAGES 需单独平台卡 | 是（以证据代替） |
| **V-07** | 仅文案/文本变化，且该页 ∈ PAGES | 该页 6 张 × 2 平台（文字也是像素） | 否 |
| **V-08** | 仅数据变化：`src/data/**`、`content/**`、RSS 快照 | 若数据被 PAGES 路由消费（当前：`bangumi.json`/`douban.json`/`music.ts` → `/culture/`；`pages-visual` 的 6 篇文章 → home/article/archives），**同 PR 更新消费页的 6 张 × 2 平台**。唯一替代：该数据已被 `scripts/visual/build-pages-baseline.mjs` 的 fixture 冻结（当前只有文章 fixture 属于此类），此时用 fixture 构建跑 0 差异。 | 否（消费页必须处理） |
| **V-09** | 仅 JS 行为变化、首屏渲染无变化（懒加载、键盘、抽屉开关） | 无基线；交 before/after 截图 + 对应 e2e 通过输出 | 是 |
| **V-10** | 仅 a11y 属性（`aria-*`/`role`/`tabindex`），无视觉差 | 无基线；交 axe 报告（serious/critical=0） | 是 |
| **V-11** | 仅站外图片/第三方嵌入 | 无基线（基线构建已把站外请求打桩） | 是 |
| **V-12** | 仅文档/测试/工具：`docs/**`（`__screenshots__` 除外）、`e2e/**`（`__screenshots__` 除外）、`scripts/**`（非构建） | 无基线 | 是 |
| **V-13** | 新增/删除 PAGES 路由 | 每页新增/删除 6 张 × 2 平台；同步 `ci.yml` 5 处条数；跑两遍 | 否 |
| **V-14** | 改基线 fixture 内容或 `scripts/visual/build-pages-baseline.mjs` | pages 42 全量 × 2 平台（fixture 变化会移动所有列表页） | 否 |

**一句话版**：**碰共享表面 → 全量 42+72 双平台；只碰 PAGES 内单页 → 该页 6 张双平台；碰 PAGES 外单页 → 证据截图；只碰数据/JS/a11y/文档 → 按 V-08…V-12 豁免但必须举证。**

**判定只需要两个事实**（都可直接查文件，无主观项）：
1. 改动文件是否命中左侧 glob（`git diff --name-only`）；
2. 目标页是否在 `e2e/pages.visual.spec.ts` 的 `PAGES` 数组里（`grep` 即得）。
两种事实组合出的动作只有「全量 / 单页 / 无基线+证据」三种，没有第四种解释。

### 4.3 操作命令（可直接复制）

**macOS（只在 darwin 生成；不得冒充 Linux）**

```bash
node scripts/visual/build-pages-baseline.mjs
PLAYWRIGHT_BASELINE_PLATFORM=macos pnpm exec playwright test e2e/pages.visual.spec.ts --update-snapshots
PLAYWRIGHT_BASELINE_PLATFORM=macos pnpm exec playwright test e2e/pages.visual.spec.ts --reporter=list --retries=0
PLAYWRIGHT_BASELINE_PLATFORM=macos pnpm exec playwright test e2e/pages.visual.spec.ts --reporter=list --retries=0
```

**Linux（官方镜像；与 CI `container.image` 同一个 1.63.0）**

```bash
rsync -a --delete --exclude .git/ --exclude node_modules/ --exclude .astro/ \
  --exclude dist/ --exclude test-results/ --exclude playwright-report/ ./ /tmp/m86-linux/
cd /tmp/m86-linux
docker run --rm --shm-size=2g -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble bash -lc \
  'corepack pnpm exec astro build && corepack pnpm run visual:build:pages && \
   corepack pnpm exec playwright test e2e/pages.visual.spec.ts -g "<page>" \
     --update-snapshots=all --reporter=line'
# 全量复核（不带 update，跑两遍）
docker run --rm --shm-size=2g -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble bash -lc \
  'corepack pnpm exec playwright test e2e/pages.visual.spec.ts --reporter=list --retries=0' \
  | tee /tmp/m86-linux-pages.log
grep -qE "^ +42 passed" /tmp/m86-linux-pages.log && echo MATCH
```

### 4.4 基线纪律（违反任一条即 REQUEST_CHANGES）

1. **双平台成对**：macOS 与 Linux 各自生成；不允许用 macOS 截图冒充 Linux，也不允许只交一个平台。
2. **只改目标页**：V-05/V-07 只允许目标页的 6 张 PNG 变化；其余 36 张的 mtime/sha256 必须不变（更新前后各跑一次 `shasum` 对比）。
3. **两遍无 retry**：`--retries=0` 连跑两遍全绿才算稳定；重试通过视为不稳定。
4. **看 diff 再提交**：基线变更必须人工/vision 检查差异区域，确认是预期视觉变化，不是裁切/空白/错页；报告里贴 diff 摘要。
5. **CI 条数同步**：任何页面增减都要改 `ci.yml` 5 处，`grep -RIn "pages 42\|42 passed\|7 页" .github/workflows/ci.yml` 必须与当前矩阵一致。
6. **基线单独 commit**：`test(visual): ...` 与功能代码分开，便于回滚。

### 4.5 M8-6 的具体映射

| 卡片 | 页面是否在 PAGES | 本卡基线动作 |
|---|---|---|
| 地基卡（共享组件） | 全站 | **全量** atoms 72 + pages 42 × 2 平台（V-01…V-04） |
| M8-6-1 游戏 | 否 | 无 gated 基线；证据（V-06） |
| M8-6-2 文化 | **是** | 该页 6 张 × 2 平台（V-05）；数据刷新按 V-08 |
| M8-6-3 随笔 | 否 | 无 gated 基线；证据（V-06） |
| M8-6-4 赞助 | 否 | 无 gated 基线；证据（V-06） |
| M8-6-5 系列 | 否，且基线 fixture 不产 `/series/` | **豁免**；证据（V-06）。进入 PAGES 需单独平台卡 |
| M8-6-6 移动页 | home/article/albums/culture **是** | 若移动视觉变化，更新对应页 375 那一列（包含在 6 张内）× 2 平台（V-05） |

---

## 5. 空态验收方法（真实构建，不是 mock）

### 5.1 原则

空态必须走**同一条生产构建链**、**同一个 adapter**、**同一个渲染分支**。禁止：

- Playwright `route.fulfill` / `page.evaluate` 删 DOM / 注入 HTML；
- 页面里写 `if (import.meta.env.PUBLIC_X_STATE === "empty") <FakeEmpty/>`；
- 单独维护一个「空态演示页」或截图后 PS；
- 直接改仓库里的真实数据文件再忘记还原。

### 5.2 两种合法触发方式

**A. 构建期 adapter 开关（适用于 games / culture / talks / donate）**

```bash
PUBLIC_<PAGE>_STATE=empty ./node_modules/.bin/astro build --outDir test-results/m86-<page>-empty
```

- `normalizeCollection({ force: "empty" })`、`staticFeed("empty")` 或页面自身的 `PUBLIC_CULTURE_STATE=empty` 判定返回 `status: "empty"`，页面照常走 `status === "empty"` 分支。
- 这是**真实代码路径**，不是 mock；但仍需 §5.5 的等价性抽查证明它不是特判。

**B. 真实空数据源（适用于 series；其他页有数据文件注入点时优先用 B）**

```bash
CONTENT_ARTICLE_BASE=e2e/fixtures/pages-visual/content/article \
  ./node_modules/.bin/astro build --outDir test-results/m86-series-empty
```

- 该 fixture 有 6 篇文章、**0 篇带 `series`** → `getStaticPaths` 返回 `[]` → 不产出 `/series/`。
- 这是「真实数据的空集合」，不是 mock：没有伪造记录，只是集合为空。

### 5.3 逐页命令表

| 页面 | 命令（在仓库根执行） | 预期 |
|---|---|---|
| 游戏 | `PUBLIC_GAMES_STATE=empty ./node_modules/.bin/astro build --outDir test-results/m86-games-empty` | `data-games-status=empty`、`[data-games-empty]`、0 卡 |
| 文化 | `PUBLIC_CULTURE_STATE=empty ./node_modules/.bin/astro build --outDir test-results/m86-culture-empty` | `data-culture-status=empty`、`[data-culture-empty="no-entries"]`、0 卡 |
| 文化（缺实体） | `PUBLIC_CULTURE_OMIT=music,douban ./node_modules/.bin/astro build --outDir test-results/m86-culture-omit` | 入口卡减少，`data-culture-hidden` 列出被剔除来源 |
| 随笔 | `PUBLIC_TALKS_STATE=empty ./node_modules/.bin/astro build --outDir test-results/m86-talks-empty` | `data-talks-status=empty`、`[data-talks-empty]`、0 卡、无 `.talks-topics` |
| 赞助 | `PUBLIC_DONATE_STATE=empty ./node_modules/.bin/astro build --outDir test-results/m86-donate-empty` | `data-donate-status=empty`、`[data-donate-empty]`、0 `.donator`、无 `.donations-methods` |
| 赞助（无收款方式） | `PUBLIC_DONATE_STATE=no-accounts ./node_modules/.bin/astro build --outDir test-results/m86-donate-no-accounts` | `data-donate-accounts=0`、`[data-donate-no-methods]`、无码图/空 `src`（当前 fixture 同时把账本置空，见 §2.4） |
| 系列 | `CONTENT_ARTICLE_BASE=e2e/fixtures/pages-visual/content/article ./node_modules/.bin/astro build --outDir test-results/m86-series-empty` | 无 `series/` 目录；`/series/` 404 |

**批量一次构建（本卡已实测）**：

```bash
CONTENT_ARTICLE_BASE=e2e/fixtures/pages-visual/content/article \
PUBLIC_GAMES_STATE=empty PUBLIC_TALKS_STATE=empty \
PUBLIC_DONATE_STATE=empty PUBLIC_CULTURE_STATE=empty \
./node_modules/.bin/astro build --outDir test-results/m86-empty-a
```

实测输出：`129 page(s) built in 2m 19s`（热缓存重跑约 20s），`Complete!`；`test-results/m86-empty-a/series` **不存在**；四页空态属性均正确（见 §5.6 证据）。

### 5.4 空态断言清单（缺一 FAIL）

| # | 断言 | 说明 |
|---|---|---|
| E-01 | 构建退出码 0 | 空数据不能炸构建 |
| E-02 | 目标路由 HTML 存在 | 系列例外：`dist/series` 必须不存在 |
| E-03 | `data-*-status=empty` | 属性断言用 quote-agnostic 正则（见 §5.5） |
| E-04 | `data-*-total=0` / `entries=0` / `accounts` 预期值 | 计数不能残留 |
| E-05 | `[data-*-empty]` 在 DOM 中且可见 | 不能只是 `display:none` |
| E-06 | 条目卡数量 0 | 0 卡、0 骨架、0「0 条」空卡 |
| E-07 | h1 + 导航 + 页脚仍在 | 空态不是整页空白 |
| E-08 | error 块不出现 | empty / error 互斥 |
| E-09 | 空 `src` 数量 0 | 无空图 |
| E-10 | 系列：`/series/` 404 且无空壳页 | 零系列=零路由 |

### 5.5 反作弊与坑

1. **组件层 0 环境分支**：`grep -rn "PUBLIC_.*_STATE" src/components` 必须为 0；开关只能出现在页面 frontmatter 的 `force:` 传参或 adapter 内。
2. **空态必须由数据状态驱动**：页面里空态块的条件必须是 `status === "empty"` / `entries.length === 0`；不允许 `if (import.meta.env...)` 直接渲染。
3. **等价性抽查（每批一次）**：选一页，用「强制 empty」与「真实空数组」各构建一次，比较空态块的 DOM/文本（忽略哈希/id）→ 必须一致。不一致说明强制路径是特判，判 FAIL。
4. **HTML 折叠会去引号**：本仓库 `html-collapse` 会把 `data-games-status="empty"` 压成 `data-games-status=empty`（实测）。因此断言必须写成：
   ```js
   /data-games-status=(?:"empty"|empty)/.test(html)
   ```
   不要照抄旧 spec 里 `toContain('data-talks-status="empty"')` 的带引号写法，否则会假红。
5. **构建后恢复**：空态构建产物只用于断言/截图；跑 perf / visual / 全量 e2e 前必须重新构建正常 `dist`，不能把 `test-results/*` 当生产产物。
6. **不改仓库数据**：禁止为了空态把 `src/data/*.json` 改成 `[]` 后提交；用开关或 out-of-tree fixture。

### 5.6 本卡实测证据（可复现）

- 构建：`129 page(s) built in 2m 19s`（热缓存重跑约 20s），退出 0；四页均 `h1=1`、`footer=1`、空态属性命中 1 次。
- 产物属性（HTML 已折叠，原文）：
  - 游戏：`data-games-status=empty`、`data-games-total=0`、`data-games-groups=0`、`data-games-empty=forced-empty`
  - 文化：`data-culture-status=empty`、`data-culture-entries=0`、`data-culture-hidden="bangumi,douban,music"`、`data-culture-empty=no-entries`
  - 随笔：`data-talks-status=empty`、`data-talks-total=0`、`data-talks-empty=source-empty`
  - 赞助：`data-donate-status=empty`、`data-donate-total=0`、`data-donate-accounts=0`、`data-donate-empty=source-empty`、`data-donate-no-methods`
  - 系列：`test-results/m86-empty-a/series` 不存在。
- 卡片计数：四页 `game-card` / `culture-grid__item` / `essay-card` / `donator` 均为 **0**。

---

## 6. PASS / REQUEST_CHANGES / ABORT 判据

### 6.1 严重度

| 级别 | 定义 | 例子 |
|---|---|---|
| **S1（阻断）** | 用户可见错误、数据造假、可访问性阻断、跨页污染 | 路由 500、空态构建失败、示例/假人名上生产、axe critical、任何宽度横向溢出 >1px、PAGES 页基线缺一个平台 |
| **S2（需修）** | 不影响可用性但违反契约 | 间距/对齐、alt 文案、焦点顺序、**本卡改动的**触控目标 40–43px、移动端 hover-only、文案与设计不一致 |
| **S3（建议）** | 记录即可，不阻断 | 注释、命名、非用户可见的整理 |

### 6.2 判定

| 结论 | 条件 | 动作 |
|---|---|---|
| **PASS** | G-01…G-24 全部通过 + §2.x 专项全部通过 + 证据齐全 + **0 个 S1 / 0 个 S2 未关闭** | 允许合并；在报告里逐项打勾 |
| **REQUEST_CHANGES** | 存在 1 个及以上 S1/S2，但在本卡范围内可修（改 CSS/组件/数据/文案/补证据） | 列出失败项 ID + 复现命令；修完重跑对应项；**不得**「先合并后补」 |
| **ABORT** | 无法判定或无法在卡内完成（见下） | 停止，不合并；`kanban_block(kind=...)` 或退回 PM 重拆 |

**ABORT 的四种明确触发**（只有这四种）：

1. **依赖未就绪**：地基卡未合入，页面无法复用共享组件（`kind=dependency`）。
2. **数据源不可得且无合法空态**：例如系列没有任何真实文章、赞助无法提供真实账本且 PO 不接受空态上线（`kind=needs_input`）。
3. **无法产出双平台证据**：V-01…V-04 要求全量基线，但 Docker/CI 不可用，且无法在卡内恢复（`kind=capability` 或 `transient`）。
4. **范围必须越界**：修复需要改共享 token/shell 或第二个页面，超出本卡 ≤4 源文件/≤300 行边界（D-0149）→ 退回 PM 拆地基卡/新叶卡，不在本卡硬做。

**不算 ABORT 的情况**：视觉不满意、设计稿有歧义但可用 selection.md 判定、某个 S2 需要多改几行 —— 这些是 REQUEST_CHANGES，不是 ABORT。

### 6.3 逐页「开工前已知阻断项」

> 这不是对改版结果的预判，而是**现状事实**：卡内不解决就不能 PASS。

| 页面 | 现状 | 结论 |
|---|---|---|
| 游戏 | `games.ts` 4 条全是 `sample-*` + 「（示例）」；`dist/games/index.html` 可见 | **G-08 S1** → 必须换真实记录或删除示例走空态 |
| 文化 | bangumi 31 / douban 10 / music 实体均为真实数据 | 无已知 S1；按 §2.2 验收 |
| 随笔 | `talks.json` 8 条真实 memos | 无已知 S1；按 §2.3 验收 |
| 赞助 | `donators.json` 4 条为 `张三/李四/吴十/郑十一`；`dist/donate/index.html` 可见 | **G-08 S1** → 必须换真实记录或清空账本走空态 |
| 系列 | 真实文章有 2 个系列（`hermes-agent`、`sing-box`）；基线 fixture 无系列 | 无数据 S1；基线豁免按 §4.5，证据必须齐 |
| 移动页 | 首页隐藏、文章抽屉、相册列数已实现；文化横滑待 M8-6-2 | 以 §3.4 实测为准；任一 M 项失败即 S1/S2 |

### 6.4 复核规则

- 修复后**只重跑失败项 + 受影响的基线**，不要求全卡从零重来；但报告必须更新失败项状态与新证据。
- 同一失败项连续两轮未修复 → 升级为 ABORT/退回 PM，不再无限 REQUEST_CHANGES。
- 不允许「PASS with follow-up」；未关闭的 S2 就是 REQUEST_CHANGES。

---

## 7. 叶卡引用模板（PM 直接复制）

```markdown
## 验收标准

引用 `docs/_reviews/M8-6/acceptance-standard.md`：
- 通用：§1 G-01…G-24 全部适用。
- 本页专项：§2.<n>（含必需区块、数据真实性、空态、移动、基线）。
- 空态：按 §5 的真实构建方法执行，交构建日志 + HTML 断言 + 截图。
- 视觉基线：按 §4 V-0x 执行；本页属于「PAGES 内/外」：<填写>。
- 判定：§6；PASS 需 0 个未关闭 S1/S2。

开工前已知阻断项：<从 §6.3 抄本页一行；无则写「无」>。
```

---

## 8. 本卡核实到的事实与风险（供 PM/后续卡引用）

1. **游戏数据是种子**：`src/data/entities/games.ts` 头注释写「当前条目是结构样例」，4 条 id 全为 `sample-*`，标题含「（示例）」，`meta.source="seed（待替换为真实记录）"`。这是 G-08 的硬阻断。
2. **赞助芳名录是占位人名**：`src/data/donators.json` 为张三/李四/吴十/郑十一；已进入 `dist/donate/index.html`。同样是 G-08 硬阻断。
3. **系列页无法进入现有视觉基线**：`pages.visual` 的 fixture 只有 6 篇文章、0 篇带 `series`，构建不产 `/series/`；加系列 fixture 会改变首页/归档列表，导致 42 张基线全漂。结论：M8-6 不扩 PAGES，系列只做证据；要 gated 基线必须单开平台卡。
4. **基线构建对数据页不是冻结的**：`/games/`、`/talks/`、`/donate/` 在基线构建里读仓库实时数据；`/culture/` 读实时 bangumi/douban/music。若把它们加入 PAGES，任何数据刷新都会让视觉门禁变红。这是 V-06 选择「本里程碑不扩容」的直接原因。
5. **HTML 折叠会去掉 data 属性引号**：实测 `data-games-empty=forced-empty`；空态断言必须 quote-agnostic（§5.5 第 4 条）。
6. **移动宽度有两套**：基线用 375，现有页面 spec 用 390（`390×844`）。本文件要求完整移动验收两档都过；最低限度只要求 375。
7. **CI 条数写死 5 处**：`ci.yml` 的 job 名 / 注释 / 两遍 `grep` / error 文案；任何 PAGES 增减都必须同步，否则 CI 会以「条数不对」失败（M6-6b 已有先例）。
8. **首页移动端已隐藏热门/友链**（`home.css` ≤767 `display:none`），文章 TOC 抽屉、相册 1/2/3 列也已实现；M8-6-6 应验收既有实现，不要重做。

---

## 附录 A · 逐页选择器与 data 属性索引

| 页面 | 根选择器 | 关键 data 属性 | 卡片选择器 | 空态选择器 |
|---|---|---|---|---|
| 游戏 | `article.entities--games` | `data-games-status/total/groups/stale/updated` | `.game-card` | `[data-games-empty]`、`[data-games-error]` |
| 文化 | `article.entities--culture` | `data-culture-status/entries/raw/unique/overlap/hidden` | `.culture-grid__item` | `[data-culture-empty]` |
| 随笔 | `article.talks` | `data-talks-status/total` | `.essay-card` | `[data-talks-empty]`、`[data-talks-error]` |
| 赞助 | `article.donations` | `data-donate-status/total/accounts/enabled` | `.donator`、`.qr-card` | `[data-donate-empty]`、`[data-donate-error]`、`[data-donate-no-methods]` |
| 系列 | `.series-hub` / `.series-detail` | `ul.series-list[data-count]`、`ol.series-posts[data-count]` | `.series-item` / `.series-step` | 无（零系列=无路由） |
| 首页 | `.home` | — | `.post-featured`、`.post-item`、`.talk-card` | — |
| 文章 | `.post` | — | — | — |
| 相册 | `.entities--albums` | `data-albums-status/total/photos/places/updated` | `.album-card` | `[data-albums-empty]` |

## 附录 B · 命令索引

```bash
# 通用门禁
pnpm run gates:all
pnpm run type-check
pnpm run build:ci
python3 scripts/gates/perf-budget.py dist

# 本页 e2e
pnpm exec playwright test e2e/pages-c1-devices-games.spec.ts      # 游戏
pnpm exec playwright test e2e/pages-culture.spec.ts               # 文化
pnpm exec playwright test e2e/pages-talks-donate.spec.ts          # 随笔 / 赞助
pnpm run series:e2e                                               # 系列
pnpm exec playwright test e2e/pages-home.spec.ts e2e/pages-article.spec.ts \
  e2e/pages-albums.spec.ts e2e/pages-culture.spec.ts              # 移动 4 页

# 视觉基线（按 §4.3）
node scripts/visual/build-pages-baseline.mjs
PLAYWRIGHT_BASELINE_PLATFORM=macos pnpm exec playwright test e2e/pages.visual.spec.ts --update-snapshots
```

---

*本文件是 M8-6 的验收契约。任何偏离先改这里，再改卡面。*
