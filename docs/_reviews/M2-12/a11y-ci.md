# A11y CI 接线（2026-11-05）

> 来源：M2-12b 出口审计的已知边界「全站 axe 未接 CI」（`audit.md` §10 第 6 点）。
> 目标：不把 586 页全量塞进每个 PR，同时不让新增 serious/critical 静默溜过。

## 分层

| 层 | workflow | 触发 | 范围 | 预算 |
|---|---|---|---|---|
| PR 烟测 | `.github/workflows/a11y-pr.yml` | `pull_request` / `push` main、theme / 手动 | 固定 11 条代表路由 + 第一篇已构建文章 | 约 2–4 分钟 |
| 夜间全量 | `.github/workflows/a11y-nightly.yml` | 每天 UTC 19:00（HKT 03:00）/ 手动 | `dist/` 全部 HTML（当前 586 页），8 locale | 约 15–20 分钟 |
| 发布门禁 | 人工/复用 nightly | 发版前 | 全量严格 | 同 nightly |

两层都用 `AUDIT_BASELINE=0`，不依赖 `axe-known.json`；基线当前已清空为 0。

## PR 烟测路由

```text
/ /en/ /blog/1/ /archives/ /tags/ /culture/ /bangumi/ /douban/
/cookies/ /design/components/author/ /404.html
+ dist/article 下第一篇实际文章（动态取，不写死 slug）
```

覆盖：共享 Header/Footer、首页、列表、归档、标签、文化、番禺/豆瓣 tab、法务内联链接、文档组件示例、404、文章分享浮层。移动矩阵仍跑 24 组合（`p09-mobile-matrix` 固定 4 页）。

## 关键命令

```bash
# PR 烟测（本地等价）
pnpm run build:ci
AUDIT_BASELINE=0 \
AUDIT_ROUTES='/ /en/ /blog/1/ /archives/ /tags/ /culture/ /bangumi/ /douban/ /cookies/ /design/components/author/ /404.html' \
pnpm exec playwright test e2e/export-audit.spec.ts --reporter=list --retries=0

# 夜间全量（本地等价）
I18N_LOCALES=all pnpm run build:ci
AUDIT_BASELINE=0 pnpm exec playwright test e2e/export-audit.spec.ts --reporter=list --retries=0
```

## 本地验证（2026-11-05）

- PR 烟测：**36 passed / 2 skipped / 35.0s**（12 条路由 + 24 个移动组合）。
- 动态文章路由：**26 passed / 2 skipped / 1.4m**（单篇文章 + 固定移动矩阵）。
- 负向探针：在 `dist/index.html` 注入低对比度节点后，`AUDIT_ROUTES='/' AUDIT_BASELINE=0` → **exit 1**，证明严格门禁会红；测试后已恢复 `dist/index.html`。
- YAML：Ruby YAML 解析通过；`prettier --check` 通过。

## 已知边界

- PR 烟测不是全量；内容/长尾页的 serious 由 nightly 兜底，最坏延迟 24 小时。
- nightly 尚未接 Lark/Issue 自动通知；先依赖 GitHub 失败通知与 job summary，后续可加。
- `export-audit.spec.ts` 全量单 worker 约 15 分钟；如果夜间窗口吃紧，再按 `--shard` 拆 4 个 job（需共享 dist artifact）。
- `AUDIT_SHOTS` 默认关闭；CI 不写截图，截图仍由需要时手动开。
