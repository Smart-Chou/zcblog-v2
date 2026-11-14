---
name: zcblog-content-ops
description: Content operations for zcblog-v2 - editing articles in the private content repo, the strict frontmatter contract, normalize, the A2b contract gate, and build-time data freshness. Use when adding or editing articles, changing frontmatter, or diagnosing stale site data.
---

# 内容运营：文章、frontmatter 与构建期数据

本仓是**代码**仓；文章的真源在私有仓 `Smart-Chou/zcblog-articles`（本机 sibling checkout：`~/Documents/WebSiteCode/zcblog-articles`，平铺 `*.md` + `article/` + `assets/`）。本仓 `src/content/article/` 被 `.gitignore` 忽略，是构建缓存：`deploy.yml` 从 `_articles/` 检出后 `cp` 进来，手工改动下次部署即被覆盖。

## 改一篇文章的正确路径

1. 在内容仓改（`git` 提交 + push 到 `main`）。
2. 本地预览：把内容仓的 `*.md`（和 `assets/`）`cp` 到本仓 `src/content/article/`（及 `src/assets/`），再 `pnpm dev` 或 `pnpm build`。本仓副本只用于验证，不是真源。
3. 文章更新后站点不会自己重建：内容仓的 `notify.yml` 目前只 dispatch 老站 marxchou.com（`DISPATCH_PAT` 没有 zcblog-v2 权限，D-0175）。要更新生产站，跑 `gh workflow run deploy.yml -R Smart-Chou/zcblog-v2`，或等本仓下一次 `push main`。

`pnpm new-post` 不可用：它指向不存在的 `scripts/new-post.js`。`scripts/new-post.sh` 存在，但它把文件写进 `src/content/article/`（缓存目录），新文章请在内容仓创建。

## frontmatter 契约 v6（`.strict()`）

`src/content.config.ts` 是唯一判据。`.strict()` 意味着**多一个键就构建失败**。

| 键 | 规则 |
|---|---|
| `title` | 必填，非空。60 字是 SEO 软规范，不是构建约束 |
| `description` | 必填，1–200 字 |
| `pubDate` | 必填，`z.coerce.date()` 接受 `2026-11-09` |
| `summary` | 可选，≤300；渲染在正文开头与列表卡 |
| `upDate` | 可选，日期 |
| `series` | 可选，**URL slug**：ASCII 小写 kebab、≤48。展示名由 slug 派生，不要另造 `seriesTitle` |
| `seriesOrder` | 可选，int 0–999；重复编号不炸构建，回落 pubDate |
| `category` | 可选，slug 规则同 series、≤24；v1 的中文 `category` 由 normalize 丢弃，不做自动映射 |
| `lang` | `zh` / `en`，默认 `zh`。英文版命名 `<slug>-en.md`，**不要**用 `.en.md`（内容层吞句点）|
| `image` | 可选 `{ url, alt }`；`url: ""` 合法（回退站点默认图），相对路径合法但新增相对图该红 |
| `features` | `["mermaid"｜"mathjax"｜"katex"｜"plantuml"｜"chart"｜"markmap"]`，默认 `[]` |
| `draft` / `sticky` | 默认 `false` / `0`；`sticky` 参与置顶排序 |
| `waline` / `toc` / `donate` / `author` | 默认 `true`，单篇覆盖开关 —— 删掉这些键会让文章页同时失去目录 / 赞赏 / 作者卡 |

## normalize：只走脚本

`pnpm normalize:content` = `node scripts/normalize-frontmatter.mjs src/content/article`。

- 作用：把内容仓遗留的 v1 布尔键（`mermaid` / `mathjax` / `katex` / `plantuml` / `chart` / `markmap`）`true` 合并进 `features[]`，然后删掉这六个键；`sticky` 保留。
- 幂等：跑两遍结果一致。
- 只动传入的目录（本仓缓存），**从不改内容仓**。
- `--add-only`：只补 `features`、不删遗留键，用于「旧站还在读这些布尔键」的迁移窗口。
- 手写 `features[]` 而不是跑脚本 = 绕过契约：增量同步文章后必须重跑一次 build（`build` 已包含 normalize，`build:ci` 也包含）。

## A2b 内容契约门禁

```bash
python3 scripts/gates/check-content-contract.py src/content/article
```

- 判据是「**先算出现在认识的键**，再看内容里有没有不认识的」：认识键 = `src/content.config.ts` 的 article schema ∪ normalizer 会吃掉的键。两份清单都从源文件解析，禁止手抄。
- **必须跑在 normalize 之前**（`deploy.yml` 就是这个顺序）。normalize 删掉 v1 布尔键后再跑，那一类违规就再也看不见 —— 会得到假绿。
- 相关但不同的门禁：A2（`scripts/gates/check-legacy-keys.py`）查已知旧字段，A2b 查未知新字段。历史上 `series` / `seriesOrder` 就是 A2 清单过期漏过去的（D-0166）。

## 构建期数据抓取与新鲜度

- `pnpm fetch:all` = `talks` + `douban` + `friends` + `bangumi` + `popular` + `stats` + `icons`，产物落在 `src/data/*.json` 与 sprite。
- 六个 fetch 脚本在缺环境变量时**静默 `process.exit(0)`**：不报错、不空白、不失败，所以 CI 永远绿，线上却可能挂着几个月前的快照。`build` 里 `fetch:all` 与 `fetch:verify` 两步带 `|| true` 是这种设计的后果，也是唯一的容忍项。
- `pnpm fetch:verify` = `node scripts/verify-data.mjs`：数据源已配置则校验缺失/空/损坏，未配置则跳过；时效性只警告。
- `pnpm report:freshness` = `node scripts/report-data-freshness.mjs`：≤7 天 OK、8–30 天 WARN、>30 天 STALE，时间基准优选用 `git log` 的提交时间（用 mtime 会被 CI checkout 刷成「刚刚」）。**退出码恒为 0**，它是可见性工具不是门禁。
- 判断「这次没更新」的原因：看 `.cache/data-fetch-status.jsonl`（`scripts/lib/fetch-status.mjs` 上报），区分「缺配置跳过」与「上游失败」。

## 内容验收三问

1. 能不能访问（HTTP 状态码）；
2. 页面对不对（DOM / 文本特征）；
3. **内容新不新**（`src/data/*.json` 的提交时间 vs 上游）。

第 3 条不看，前两条全绿也可能是烂站（D-0175 补记的实测结论）。

## 必读

- `rules/content-contract.md` — 契约 v6 与 normalize 规则的正文。
- `docs/DESIGN.md` §5.6 —— 文章/列表卡的渲染契约（改版式前看）。
- `AGENTS.md` 的 Validation 段 —— 内容相关命令的完整清单。
