# M8-5a · 友链页视觉：朋友卡片栅格 + 友圈文章列表

- 卡：`t_3d74497b`（blog2 板）
- 工作目录：`~/Documents/WebSiteCode/zcblog-v2`
- 产物构建：`dist-m8-5a`（ok 态）、`dist-m8-5a-empty`（`PUBLIC_FRIENDS_STATE=empty` 空态）
- 结论：**通过**。站点卡片 7 张 / 友圈条目 6 条，375·768·1440 × light·dark 全部 0 横向溢出，axe 页面主体 violations=0（serious=0，incomplete=0），空态 0 卡片且空态块可见。

## 1. 改了什么

| 文件 | 改动 |
|---|---|
| `src/pages/friends/index.astro` | 读 `src/data/friends-articles.json` 快照 → 归一化（缺站名/标题、非 http(s)、重复脏条目直接丢弃）→ 取前 6 条传给页面主体 |
| `src/pages/en/friends/index.astro` | 同一口径（zh/en 同源，不许一边有友圈一边没有） |
| `src/components/UI/FriendCard.astro` | 新增可选 `site`（来源站名行）与 `as`（默认 `div`=首页容器，`li`=友链页 `<ul>`）；头像缺省不渲染 `img`；首页不传新 props → 输出与 M2-2 一致（首页 5 条，`fri-site` 0 处，实测） |
| `src/components/Pages/FriendsContent.astro` | 新增「友圈最新文章」区块（`#friends-feed`，h2 层级，`data-friends-feed=N`），`articles.length === 0` 时整块不渲染 |
| `src/components/UI/FriendPill.astro` | 站点卡片头像只接受本站路径（image-map）或 `data:` URI，外链头像不再直出 → 无图走首字母；首字母颜色 `fg-muted → fg-heading`（原 3.4:1 不达 AA） |
| `src/styles/pages/friends.css` | 友圈栅格（<768 单列 / ≥768 两列）、卡片边框/圆角/悬浮、站名 mono 小字、标题 2 行截断、时间行；reduced-motion 里补 transition:none |

新增验收资产：`e2e/pages-friends-m85a.spec.ts`（14 条用例）、临时 runner `playwright.m8-5a.config.ts`（不提交）。

## 2. 友圈列表数据来源与空快照行为

- 来源：`src/data/friends-articles.json`（`scripts/fetch-friends.mjs` 抓 RSSHub foreverblog 路由生成，抓取逻辑**本卡一行未改**）。
- 页面只在**构建期**读这个快照，运行期 0 第三方请求；验收里断言整页 `<img>` 的 `src` 无 `http(s)://`（实测 0 张外链图）。
- 空快照行为：快照缺失（数组为空）/ 全部条目非法 → `articles = []` → **不渲染「友圈」区块**（没有标题、没有空列表壳）；友链本体与申请、评论区块照常。
- 空友链行为（`PUBLIC_FRIENDS_STATE=empty`）：友链卡片 0 张、`data-friends-empty` 空态块可见、申请入口不受影响；**友圈区块照常渲染**（它与友链数据是两条独立的快照）。

## 3. 验收实测

```
npx astro build --outDir dist-m8-5a                          → 479 页，1m52s，0 报错
M85A_DIR=dist-m8-5a M85A_EMPTY_DIR=dist-m8-5a-empty \
  npx playwright test -c playwright.m8-5a.config.ts          → 14 passed (11.2s)
```

- 卡片数：375 / 768 / 1440 × light / dark 六组，站点卡片 **7 = data-friends-total**，友圈条目 **6 = data-friends-feed**。
- 0 横向溢出：`scrollWidth ≤ clientWidth + 1` 且越界元素 `[]`（light / dark 各三档）。
- axe（`.friends`，wcag2a/aa + wcag21a/aa + wcag22aa）：light `serious=0 incomplete=0`，dark 同。
- 首字母兜底：7 个，`aria-hidden=true`，最低对比度 light **14.66:1** / dark **13.44:1**。
- 友圈契约：6 条全部 `http(s)` + `target=_blank` + `rel` 含 `noopener`，站名/标题/时间非空。
- 证据截图 6 张：`screens/friends-{light,dark}-{375,768,1440}.png`（fullPage）。

## 4. 与计划文本的偏差（需 operator 知晓）

1. **`FriendCard.astro` 名号已被占用**：仓库里 `src/components/UI/FriendCard.astro` 是**友圈文章条目卡**（首页「朋友连接」+ `/design/components/friendcard/` 在消费）。计划写「新建 FriendCard」是按「仓库里还没有」估的。本卡的落法：**在既有 FriendCard 上做加法**（可选 `site` / `as`，首页输出不变），站点卡片继续用既有的 `FriendPill`（它本来就是这个设计系统里的站点卡）就地收口，不新增重复组件、不动首页与设计文档页。
2. **页面主体在 `FriendsContent.astro`**：`src/pages/friends/index.astro` 只有 21 行「取数 + 交给组件」，卡片栅格与新增区块必须落在 `FriendsContent.astro` 里。为守住「zh/en 同源」，`src/pages/en/friends/index.astro` 同步改了两行。
3. **头像不再拉外链图**（这是本卡唯一视觉行为变化）：`friends.json` 的 7 个头像都是 `avatars.githubusercontent.com`，按「不拉外链图」的要求改为首字母兜底，顺带把首字母对比度从 3.4:1 提到 14.7:1。若 PO 想保留 GitHub 头像，需要把图落到 `src/assets/images/`（image-map 只认本站图），属于新的一张卡。
4. **未 commit**：按用户既定 Git 边界（zcblog 系仓库禁止 commit/push），本卡不产生 WIP commit；改动全部留在工作区，由 operator 决定何时落库。
5. **视觉基线**：`/friends/` 的 6 张本卡截图即为新基线候选，`pages.visual` 全量没跑（按卡边界「本卡不跑全量」）；基线矩阵 42 → 60 的接线仍是 operator 的事。
