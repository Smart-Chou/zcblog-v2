# M8-5b · 友圈快照渲染 + 失败态收口

- 卡：`t_17a9e52f`（blog2 板）
- 工作目录：`~/Documents/WebSiteCode/zcblog-v2`
- 产物：`dist-m8-5b`（真实快照）、`dist-m8-5b-empty`（`PUBLIC_FRIENDS_ARTICLES_STATE=empty`）、`dist-m8-5b-corrupt`（真实快照文件临时写坏后构建，已还原）
- 结论：**通过（有一项需 operator 知晓的既有缺陷）**。快照缺失/损坏/过期三态都不再是构建失败或静默跳过；`/friends/` 三种产物全部 200、0 横向溢出；数据链路本卡 0 新增抓取、0 第三方请求、0 新依赖。

## 1. 改了什么

| 文件 | 改动 |
|---|---|
| `src/data/adapters/friends.ts`（+197 行） | 追加友圈快照适配器：`loadFriendsArticles()`（纯函数，永不抛异常）、`normalizeFriendsArticle()`、`loadSnapshotArticles()`、`FRIENDS_ARTICLES_*` 常量。快照用 `import.meta.glob(..., { query: "?raw" })` 读取——**静态 JSON import 遇到语法坏就是构建失败，`?raw` 让「损坏」退化成状态**。形状校验（站名/标题/非 http(s) 丢弃、URL 去重）+ 新鲜度（文件 mtime，阈值 7 天）+ last-known-good（进程内上一次可用快照）。 |
| `src/pages/friends/index.astro` | 删掉页面内的归一化副本，只调 `loadSnapshotArticles({ limit: 6 })`；构建期按 status/stale 打一行 warn 留痕。 |
| `src/pages/en/friends/index.astro`（偏差①） | 同源：英文页原来也静态 import 那个 JSON，快照坏掉英文页会连带炸构建 → 一并改走 adapter。 |
| `src/components/Index/Friends.astro`（偏差②） | 首页「朋友连接」是**唯一还剩的静态 import**（`friends.slice(0,5)`），坏快照会让整站构建失败 → 改走 `loadSnapshotArticles({ limit: 5 })`，首页输出实测不变（`id="friArticle"` 1 处 / `fri-item` 5 条，与 `dist-m8-5a` 一致）。 |
| `scripts/verify-data.mjs` | friends 条目加 `shape: "friends-articles"` + `freshnessFrom: "mtime"`：形状校验（与 adapter 同口径）+ mtime 新鲜度。新增 `VERIFY_DATA_ROOT` 让三态注入不改真实数据文件。**失败级别沿用脚本既有策略**：非 strict 源（`requires: []`）形状异常 → WARN；JSON 解析失败 → FAIL（既有）；过期 → WARN（既有）。 |

## 2. 三态实测（verify-data）

```
$ for s in ok missing corrupt stale shape; do VERIFY_DATA_ROOT=.scratch-m85b/$s node scripts/verify-data.mjs; done
ok      → 🧪 形状正常: 可用 15/15 条 / ✅ 数据正常 / exit 0
missing → ⏭️  数据文件缺失（跳过）                          / exit 0
corrupt → ❌ JSON 解析失败                                 / exit 1
stale   → ⚠️  数据过期 (>7 天) 最新数据 2025-08-31 (436.0 天前)，快照时间取文件 mtime / exit 0
shape   → ⚠️  快照形状异常（非阻断）—— 可用条目 0/3          / exit 0
```

真实仓库跑一次（本卡顺带修的盲区）：`⚠️ 友链文章 数据过期 (>7 天) 最新数据 2026-10-30 (11.0 天前)` —— 改之前这条**静默跳过**，因为快照里只有「17 小时前」这种相对串，`getLatestTimestamp()` 解析不出绝对时间。

## 3. 构建与页面实测

```
npx astro build --outDir dist-m8-5b                              → 479 页，0 error
PUBLIC_FRIENDS_ARTICLES_STATE=empty npx astro build --outDir dist-m8-5b-empty  → 479 页
（快照写成 '[{"name": "oke", ' 后构建 dist-m8-5b-corrupt）      → 479 页，0 error，构建日志 [friends] status=error code=snapshot-corrupt
```

构建日志三态留痕：`友圈快照过期 11.0 天 (>7)，沿用 last-known-good` / `status=empty code=snapshot-empty` / `status=error code=snapshot-corrupt`。

`/friends/` 结构（HTML 直读，与 `dist-m8-5a` 基线一致）：

| 产物 | `data-friends-status` | `data-friends-total` | `data-friends-feed` | 友链卡片 |
|---|---|---|---|---|
| 真实 | ok | 7 | 6 | 7 |
| 空快照 | ok | 7 | 缺失（区块整块不渲染） | 7 |
| 坏快照 | ok | 7 | 缺失（区块整块不渲染） | 7 |

浏览器实测（`.scratch-m85b/verify.mjs`，三产物 × 375/768/1440 × light/dark，共 18 组）：

- `GET /friends/` = **200** 全部 18 组。
- 横向溢出：`scrollWidth ≤ clientWidth`、越界元素 `[]` 全部 18 组（如 375→360、768→753、1440→1425）。
- 友链卡片 7 张、`friends-apply` 申请入口在、空/坏快照下友圈区块 0 条且无空壳。
- axe（wcag2a/aa + wcag21a/aa + wcag22aa，shell `.friends`）：**light 三档 × 三产物 = violations 0 / serious 0**；dark 1440 = 0；**dark 375 / 768 = 1 serious（color-contrast）**。

## 4. 需要 operator 知道的偏差 / 遗留

1. **边界扩到 5 个文件**：卡里只允许 3 个源文件，但英文页与首页各有一处 `import friends-articles.json` 静态导入——只要它们还在，「快照损坏」就仍是整站构建失败，`/friends/` 200 的验收在坏快照下根本不成立。所以两处一并改走 adapter（各 3~6 行，输出不变，已用 dist 对比验证）。若要严格守 3 文件，请回退这两处并接受「坏快照 = 整站构建失败」。
2. **dark 375/768 的 1 条 serious（color-contrast）** 与本卡数据链路无关：**三份产物都有**，包括根本没有友圈区块的空/坏构建；命中 `.friend-card__name`（1.16:1）、`.friend-card__caption`（1.75:1）、`.friends-jump`（2.2:1）、`.fri-site/.fri-updated`（1.75:1）。这些选择器落在 `FriendsContent.astro` / `friends.css`（不在本卡允许的源文件内），M8-5a 只测了 1440 dark 所以没暴露。建议单开一张卡：深色窄屏对比度收口 + 把 375/768 dark 纳入该页 axe 矩阵。
3. **未 commit**：按用户既定 Git 边界（zcblog 系仓库禁止 commit/push），本卡不产生 WIP commit，改动留在工作区。
4. **adapter 单测**：`src/data/adapters/friends-articles.m85b.test.ts`（12 例：三态、脏条目、过期、LKG 回退、垃圾输入不抛）跑完已归档为 `docs/_reviews/M8-5b/adapters-friends-articles.m85b.test.ts.txt` 并从 `src/` 移出，避免触碰边界外的源文件。`npx vitest run src/data/adapters/` 全绿（4 文件 60 例）。
5. **快照本身已过期 11 天**：抓取 workflow 本卡未改（卡边界）。`fetch-friends.mjs` 抓 RSSHub，失败时保留旧文件——这正是「过期仍渲染 last-known-good」的设计前提；要不要把 verify 的过期 WARN 升级为 CI 阻断，属 operator 决策。

## 5. 证据文件

- `screens/{ok,empty,corrupt}-{light-1440,dark-375}.png`（6 张，fullPage）
- `adapters-friends-articles.m85b.test.ts.txt`（12 例单测原文）
- 临时探针（不提交）：`.scratch-m85b/verify.mjs`、`.scratch-m85b/axe-dark.mjs`
