---
title: Hello World
description: 示例站的第一篇文章——证明 overlay 的文章覆盖了主题的空内容集。
summary: 一篇最小示例文章（frontmatter 契约 v4 必填项齐全），随 apps/demo overlay 一起装配进示例站。
pubDate: 2026-01-01
tags:
    - demo
    - Dogeared
---

这是 `apps/demo` 带来的唯一一篇示例文章。它不在主题里 —— 主题本身零文章，
文章由站点 overlay（`src/content/article/**`）提供，这是 §4.2「内容由站点自己灌入」的最小证据。

## 它证明了什么

| 判据 | 证据 |
| --- | --- |
| overlay 文章能被主题渲染 | `dist/article/hello-world/index.html` 存在 |
| frontmatter 契约 v4 生效 | `title` / `description` / `pubDate` 三个必填项齐全 |
| 主题不内置文章 | 装配前的主题树里 `src/content/article/` 只有这一篇（来自 overlay） |

## 想改就改

把本文件替换成你自己的文章，或直接删除——删除后列表页会走空态，
构建仍然必须成功（`blog2.0/docs/21-m3-plan.md` §6.3 的 P7 判据）。

:::tip
配置改动走 `src/config/*.ts`，文章走 `src/content/article/`，两者都属于 overlay：升级主题（`scripts/theme-sync.mjs`）永远不会碰它们。
:::
