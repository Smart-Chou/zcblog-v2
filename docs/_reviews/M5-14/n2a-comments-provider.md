# N-2a · 评论 provider 契约（`none` / `waline`）

- **日期**：2026-11-18
- **卡**：M5-9 候选 N-2 的最小可验收切片
- **结论**：**PASS**（原卡 4 人日的 1/4 落地；`twikoo` / `giscus` 按 CSP 铁律挂起，见 H-12）

## 1. 为什么拆

M5-9 `options.md` 里的 N-2 原文是 **4 人日**，范围含三个 provider 适配组件、
CSP `script-src` / `connect-src` 按 provider 生成、空态/错误态、无 JS 回退。
按 **D-0149**（一卡 = 一个组件族 + 一条 e2e，源文件 ≤4、净新增 ≤300 行），
这必须拆。

拆法不是按「平均切 4 份」，而是按**是否存在外部依赖**切：

| 切片 | 内容 | 前置条件 | 状态 |
|---|---|---|---|
| **N-2a**（本卡） | provider 契约 + `none` / `waline` | 无 | **完成** |
| N-2b | `twikoo` | 仅需 `connect-src` 加用户自己的域名 | 可开工 |
| N-2c | `giscus` | **需 PO 批准放开 `frame-src`** + GitHub OAuth 前置 | **挂起（H-12）** |
| N-2d | 空态 / 错误态 / 无 JS 回退 | 三个 provider 都在 | 未开始 |

N-2b / N-2c 之所以不能顺手做完，是因为 `ContentSecurityPolicy.astro:29` 写着
「新增 origin 必须走 PO 单独批准，禁止 `*` 与宽泛 `https:`」。CSP 是安全面，
我不能自己签字。

## 2. 改了什么（3 源文件 + 1 spec）

### `src/config/feature.ts`

新增两个类型和一个常量：

```ts
export type CommentProvider = "none" | "waline";

export interface CommentsConfig {
    provider: CommentProvider;
}

export const comments: CommentsConfig = {
    provider: (import.meta.env.PUBLIC_COMMENTS_PROVIDER as CommentProvider) || "waline",
};

export const waline: WalineConfig = {
    enable: comments.provider === "waline",   // ← 由 provider 派生
    ...
};
```

**为什么 provider 不塞进 `WalineConfig`**：三个 provider 的配置形状完全不同
（Waline/Twikoo 要 `serverUrl`、Giscus 要 `repo` + `category`），塞进去会让
「provider=giscus 时 serverUrl 该填什么」变成无解的必填项。provider 是**选路**，
具体配置留在各自的块里。

**为什么 `waline.enable` 改成派生**：存量代码有 4 处读它
（`MarkdownLayout:253`、`FriendsContent:378`、`TalksContent:227`、`DonateContent:413`），
直接改成读 provider 等于给每处都加一次解引用。派生之后
「provider=none 却忘关 waline.enable」这种自相矛盾的配置**在结构上不可能存在**。

**为什么接 `PUBLIC_COMMENTS_PROVIDER`**：沿用 `PUBLIC_DONATE_STATE` /
`PUBLIC_TALKS_STATE` 的既有约定。没有它就无法产出「provider=none 的产物」，
也就无法验证「零请求」——只能测开着的一侧。

### `src/config/index.ts`
加 `comments` 到 feature 重导出。

### `apps/demo/src/config/feature.ts`

门禁 O7 拦下来的：

```
- apps/demo：src/config/feature.ts 缺导出 CommentProvider, CommentsConfig, comments
  （主题仍会 import 它们）
```

`apps/demo` 是主题下发给消费者的 overlay 副本，有意保留差异
（`donate.enable: false`、`ga: false`）。补上同样的类型，但 **`provider` 写死 `"none"`**，
与「示例站外部服务全部关闭」一致；不接 env 是因为 `apps/demo` 的 tsconfig 没有
`vite/client` 类型（LSP 当场报 `Property 'env' does not exist on type 'ImportMeta'`）。

### `e2e/comments-provider.spec.ts`（新，3 条用例）

- `provider=none`：零评论请求、零评论 DOM
- `provider=waline`：按钮在，折叠态不加载运行时（N-7 的懒加载不能被改坏）
- 契约自洽：DOM 与 provider 一致（两种产物都会执行）

## 3. 实测数据

### `provider=none` 产物

```bash
$ PUBLIC_COMMENTS_PROVIDER=none SITE_URL=https://zcblog-v2.pages.dev pnpm run build:ci
$ grep -c 'comment-wrapper' dist/article/bitwarden/index.html
0                          # ← 构建期就不生成 DOM，比运行时隐藏更强

$ playwright test e2e/comments-provider.spec.ts
2 passed · 1 skipped (6.2s)
```

### 默认（waline）产物

```bash
$ SITE_URL=https://zcblog-v2.pages.dev pnpm run build:ci
$ grep -c 'comment-wrapper' dist/article/bitwarden/index.html
1

$ playwright test e2e/comments-provider.spec.ts
2 passed · 1 skipped (7.0s)
```

两半各 2 passed / 1 skipped —— **互斥**（一个产物只能是一个 provider），
第 3 条「契约自洽」在两种产物下都执行。

### 门禁 / 预算

| 项 | 结果 |
|---|---|
| `tsc --noEmit` | 0 |
| `prettier --check .` | 全绿 |
| `gates:all` | 18/18 · 10/10 · 14/14 · O7 PASS · `unclassified=0` |
| `vitest` | **182 passed / 4 skipped** |
| `perf-budget` | `pages=766 over=0`；article JS p95 **31.1KB**（门禁 40，N-7 后为 31.0，本卡 +0.1 = 新增的 provider 常量） |

`O7` 首次跑是 **FAIL**（`apps/demo` 缺导出），补齐后转 PASS。这条门禁很有价值：
它专门拦「主题加了导出但示例 overlay 没跟上」。

## 4. 走过的弯路

### 4.1 拦截器把「浏览量」误判成「评论区加载了」

第一次跑 waline 用例时红在：

```
折叠态不该加载 Waline 运行时：https://waline.marxchou.com/api/article?lang=en-US
```

这不是评论区。`@waline/client/pageview` 在算**文章阅读量**（头部的「阅读 N」），
由 `src/scripts/pageview.ts` 常驻初始化，与评论开关无关。我的 `isCommentTraffic`
只排除了含 `pageview` 字样，漏了实际接口 `/api/article`。

`pages-comments.spec.ts:39` 早就在排除它，照抄即可。真正要盯的是 `/api/comment`。

**教训**：断言「零请求」时，排除清单必须按**实际接口**写，不能按模块名猜。

### 4.2 「跑错产物就断言红」这个设计是错的

最初两条用例都断言「当前产物必须是 X」。实测必然有一条红——
因为**同一棵源码树在一次构建里只能产出一个 provider**。这等于要求
`pnpm build` 同时产出两种 HTML。

改成 `test.skip(provider !== expected)` 后两半各自 2 passed / 1 skipped。
代价是「单次运行只覆盖一半」，所以第 3 条「契约自洽」必须两种产物都执行，
且验收要求**贴出两次运行的条数**（本报告 §3 就是）。

### 4.3 我一度在注释里写「由 CI 覆盖两半」——那是假的

写完后去核实，发现 **51 个 e2e spec 里只有 6 个进 CI**：

```
design-atoms.visual / design-atoms.a11y / design-atom-docs.a11y
pages.visual / pages-states.visual / pages-radio(.visual)
export-audit
```

`pages-comments` / `pages-article` / `lazy-load-n7` / 本 spec **全都不在 CI 里**。
已改成如实描述并登记 **H-13**。这条借款也意味着 N-7 的 `lazy-load-n7.spec.ts`
目前只有本地执行路径。

## 5. 没做的事

- **`twikoo` / `giscus`**：见 H-12。Giscus 的 `frame-src` 从 `'self'` 放开是本次唯一
  真正削弱隔离面的改动，需 PO 签字。
- **空态 / 错误态 / 无 JS 回退**（原卡要求）：要在三个 provider 都在之后才有意义，
  归 N-2d。
- **CSP 一行没动**：本卡不碰 `ContentSecurityPolicy.astro`。
- **`pages-comments.spec.ts`（503 行，M7-2a）未跑**：它依赖真实 waline 服务器，
  需求外部网络；本卡不改变抽屉行为（`WalineComment.astro` 未改），风险为零。
