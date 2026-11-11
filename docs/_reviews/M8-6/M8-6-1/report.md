# M8-6-1 · 游戏 `/games/` 视觉重做 + 真实数据收口 — 交付报告

- 卡：`t_44fe86ce`（M8-6 批二，assignee `blog-fe`）
- 判据：`docs/_reviews/M8-6/acceptance-standard.md` §1 **G-01…G-24** + §2.1 **P1-01…P1-07**
- 设计稿：桌面 `gaming_hub_2`；移动 `gaming_hub_1`
- 基线口径：§4 **V-06**（本页 **不在** `pages.visual` PAGES 内 → 不新增 gated 基线，只做证据截图）
- 分支：`main`（工作区 `~/Documents/WebSiteCode/zcblog-v2`）

## 1. 落地内容

### 1.1 数据收口（P1 / G-07 / G-08 的前置）

| 项 | 改前 | 改后 |
|---|---|---|
| `src/data/entities/games.ts` | 4 条 `id=sample-*`、标题含「（示例）」、`meta.source="seed（待替换为真实记录）"` | `games: Game[] = []`，`meta.source="manual"`；文件头写清「补真实记录时 `hours`/`rating`/`year` 没统计就删字段，不填 0」 |
| 页面呈现 | 假记录撑满页面 → G-08 直接判死 | **真实空态**（设计内状态）：`data-games-status=empty`、`total=0`、`groups=0`、`[data-games-empty]` 可见 |

选的是验收标准 §2.1 给的**第二条路**（删示例 → 空态上线），理由写进数据文件头注释：只有站点所有者知道自己玩过什么，编造「真实记录」比空态更糟。

### 1.2 结构（P1-01…P1-05）

| 项 | 实现 |
|---|---|
| 页面容器 | `article.entities.entities--games`，`aria-labelledby="games-title"`，保留 `data-games-status / total / groups / stale / updated` |
| Hero | `.games-hero` 手写块 → `PageHero`（`id="games-title"`，h1 clamp 由 PageHero 收口，页面 0 处 font-size clamp） |
| Hero 统计行 | 总数 chip **恒在**；`已通关` 仅 `finishedCount>0`；`小时` 仅 `totalHours>0`；更新时间仅 `feed.updated` 非空（当前数据 = `0 款游戏` + `数据更新于 2026-11-11`，无「0 款通关 / 0 小时」） |
| 分组 | 固定顺序 `playing → finished → backlog → shelved`（`GAME_STATUS_ORDER`，空组不渲染）→ `SectionHead`，`id="game-state-<status>"`，`section[aria-labelledby]` 指向它 |
| 卡片 | `<ol class="game-grid">` + `GameCard`（`.game-card` = `<li>`，`Card` 在内部当纸面），序号按**分组后**的视觉顺序 1..N |
| 空/错态 | `DataState kind="empty"` / `kind="error"`（error 带 mono 原因码 `data-games-error`，两者互斥） |

### 1.3 卡片（P1-05 / P1-06 / G-09 / G-17）

- 复用 `UI/atom/Card.astro`（`variant="interactive" padding="md" as="div"`）——**没有给 Card 加任何 prop**，语义钩子 `.game-card` 与 `data-game-*` 落在 `<li>` 上。
- banner = 16:9 **色块**（`aspect-ratio: 16/9`，`--color-bg-sunken`），只排「序号（`fg-muted`，mono）+ 平台·年份」；
  `Game` 类型没有 `cover` 字段 → **0 张第三方封面、0 个空 `<img>`**（e2e 逐卡断言 `img = 0`）。
- 评分：仅 `rating` 有值时渲染 5 格刻度（`aria-hidden`）+ 可见文字 `n/5`；无 `rating` → 0 格、无评分文本（**不显示「0/5」**）。
- 时长：只有 `hours` 时出文本（`n 小时` / `n h`）；**没有分母 → 不渲染 `role="progressbar"`**（e2e 逐卡断言 `progressbar = 0`）。这也是卡面第 5 条「不做伪进度条」的落地方式：页面上根本没有进度组件可复用。
- 状态：文字 `stateText` + 色点（色点 `::before` 纯装饰，状态语义由文字承担，不是只靠颜色）。
- 卡顶边 2px → **1px `--color-border-subtle`**（Card atom 自带的 border，页面不再叠加第二条边）。

### 1.4 串流拓扑（P1-07）

- 角色 → 设备清单里的真实条目（`devices.ts`：`windows-laptop` / `openwrt-router` / `imac` / `macbook`）；型号与规格行全部来自该数据源，**缺设备就整节点不渲染**（不留空壳卡）。
- 只桌面：`@media (max-width: 767px) { .game-topology { display: none } }`，375/390 实测不可见（`isVisible()` 断言）。
- 0 客户端 JS：分组顺序、网格、拓扑隐藏全是纯 CSS；本卡**没有新增任何 script**（筛选器未实现，因此不需要 `tab-nav.ts`）。
- 「查看全部设备」链接命中区 `min-block-size: var(--space-11)` = **44px**（G-22）。

### 1.5 CSS 边界

| 文件 | 改动 |
|---|---|
| `src/styles/pages/games.css` | **新增** 349 行：`.game-sections` / `.game-card*` / `.game-topology*` 全部 `.game-*` 只此一处 |
| `src/styles/pages/entities-b.css` | 只**删除** `.game-*` 与共用的 `.game-sections` 选择器（-167 行）；`.device-*` 一行未动 |
| `src/styles/pages/entities.css` | **未改**（通用 section 外壳保持原样） |

## 2. 验证结果（真实执行）

```
$ ./node_modules/.bin/astro check                                  → 0 errors, 0 warnings (353 files)
$ ./node_modules/.bin/astro build                                  → 482 page(s) built (1m 7s), 0 error
$ ./node_modules/.bin/playwright test e2e/pages-c1-devices-games.spec.ts
                                                                   → 19 passed (3.6m)
$ for g in verify-atoms verify-atom-docs verify-component-inventory verify-doc-drift \
           check-tokens verify-surface-tokens verify-entities verify-package-boundary \
           verify-overlay verify-icon-sprite; do node scripts/gates/$g.mjs; done
                                                                   → 10/10 PASS
```

### e2e 关键输出

```
[i18n]    games: 游戏 / Games · total 0 · groups 0
[h1]      /games/: 1 个 h1，3 个标题，0 跳级          /en/games/: 1 个 h1，3 个标题，0 跳级
[axe]     games light: violations=0 incomplete=0     games dark: violations=0 incomplete=0
[games]   真实空态：0 款 · 0 分组 · 0 卡 · 空态块可见
[empty]   真实构建：两页均为空态，0 卡片，路由 200
[m8-6-1]  Hero chips 条件渲染 OK · 拓扑 1440 可见 / 375·390 隐藏
[evidence] 4 张截图 → docs/_reviews/M8-6/M8-6-1
```

overflow 用例覆盖 **375/390/768/1440 × light/dark**（本轮把 375 加进 `VIEWPORTS`，卡面要求 375 也判），两页 0 越界元素、`scrollWidth ≤ clientWidth+1`。

### 空态复核命令（验收原文）

```bash
PUBLIC_GAMES_STATE=empty ./node_modules/.bin/astro build
# dist/games/index.html: data-games-status=empty · data-games-total=0 · data-games-groups=0
#                        data-games-empty=source-empty · .game-card = 0 · 路由 200
```

该构建在 spec 第 9 段内**真实执行**（含 `finally` 恢复常规构建），本轮 19 例全绿即包含它；随后又重新跑了一次常规 `astro build` 复核产物。

### G-08（无占位假数据）

`dist/games/index.html` 与 `dist/en/games/index.html` 的 `<article class="entities entities--games">` 作用域内，`示例 / 样例 / sample- / 待替换 / seed（ / TODO / FIXME / 张三 / 李四 / 测试用户` 命中数 = **0 / 0**。（全页唯一的 `placeholder` 命中是站点头部的 Pagefind 搜索框 `placeholder="搜索文章..."`，位于 `article` 之外的外壳 chrome，不是本页数据。）

## 3. 证据（4 张，§4 V-06）

`docs/_reviews/M8-6/M8-6-1/`

| 文件 | 视图 |
|---|---|
| `games-light-1440.png` | 桌面 light（Hero + 空态 + 4 节点串流拓扑） |
| `games-dark-1440.png` | 桌面 dark |
| `games-light-390.png` | 移动 390 light（单列、拓扑隐藏） |
| `games-light-375.png` | 移动 375 light（单列、0 溢出） |

人工复核（vision）：1440 无越界/无空壳卡，拓扑 4 卡等宽等高；375/390 单列、拓扑整块消失、空态文案不裁切。

## 4. 边界与未做

1. **视觉基线**：本页 ∉ `pages.visual` PAGES → 按 V-06 **不新增 gated 基线**，只交付 4 张证据；因此没有 macOS/Linux 快照刷新动作。
2. **Linux 侧 e2e**：本机 macOS 执行；CI 的 Linux 镜像会跑同一条命令（用例内无平台特判）。
3. **筛选器**：未实现（卡面「若保留」）。空态下没有可筛对象，新增筛选只会带来第二套交互；需要时再按 `tab-nav.ts` 复用，不新增 script。
4. **真实记录**：`games.ts` 保持空。补记录属于内容工作，不在本卡编造。
