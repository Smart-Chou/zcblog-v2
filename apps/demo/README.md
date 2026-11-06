# apps/demo — 最小示例 overlay

这是 `Dogeared` 主题的**示例站点 overlay**：它只放站点身份（配置）、内容和数据，
不含任何主题代码（组件、样式、页面、工具都在主题里）。

装配 + 构建（首次需要 `pnpm`；只用 corepack 的机器先 `corepack enable`）：

```bash
corepack enable
node scripts/create-site.mjs --overlay apps/demo --out /tmp/zcd --build
# → RESULT PASS  out=/tmp/zcd html=<n> …  （dist 里至少 8 个 HTML）
```

`--install` 会做真实 `pnpm install --frozen-lockfile`，用于验证消费者不是靠软链跑起来的：

```bash
node scripts/create-site.mjs --overlay apps/demo --out /tmp/zcd --build --install
```

实测（2026-11-06）：`--build --install` → `RESULT PASS html=118`，约 38s，overlay 7 个文件。

只校验 overlay 字段（不装配）：

```bash
node scripts/create-site.mjs --check-overlay apps/demo
# 等价门禁：node scripts/gates/verify-overlay.mjs → O7「示例 overlay 字段完整（1 个）」
```

## 这里的文件

| 文件 | 作用 | 升级主题时 |
| --- | --- | --- |
| `src/config/site.ts` | 站点标题 / 域名 / 作者 / 备案 | **不动**（O） |
| `src/config/feature.ts` | 评论、统计、搜索、公告、分享等开关 | **不动**（O） |
| `src/config/ui.ts` | 导航、社交链接、页脚、侧边栏 | **不动**（O） |
| `src/config/services.ts` | 服务页内容与联系方式 | **不动**（O） |
| `src/content/article/hello-world.md` | 唯一一篇示例文章（frontmatter v4 必填项齐全） | **不动**（O） |
| `src/data/typewriter.json` | 首页打字机文案（覆盖基线占位值） | **不动**（O） |
| `src/data/entities/projects.ts` | 示例项目数据，覆盖主题作者自带项目 | **不动**（O） |

契约：`site.manifest.json` 把 `apps/demo/**` 归 O（`docs/overlay-contract.md`）。
`scripts/theme-sync.mjs --apply` 只写 T 路径，永远不碰这里。

## 装配器怎么用这 7 个文件

`scripts/create-site.mjs` 按四层自下而上覆盖，后写的赢：

1. `theme` — `site.manifest.json` 里分类为 T 的文件（组件 / 页面 / 样式 / 工具 / `packages/**` / 脚本）
2. `baseline` — `theme-template/{src,public}` 的占位 overlay 基线（4 份配置、法务页、10 个占位 JSON、默认资产）
3. `shim` — `src/data/{adapters,entities}/**`（主题页面直接 import，缺了构建必挂）
4. `overlay` — **本目录**：4 个配置 + 1 篇文章 + 2 个数据文件（typewriter / projects）覆盖上面三层

所以本目录只需要**差异**，不需要把主题里已有的占位文件复制一份。

装配结果是**可加不可减**：overlay 能覆盖基线的同名文件，但删除不了基线文件。
示例站最终是 2 篇文章 —— 基线的 `getting-started.md`（主题上手向导）+ overlay 的
`hello-world.md`，共 118 个 HTML；要只留一篇就在 overlay 里放同名文件覆盖它。

## 加自己的站点

1. 复制本目录为 `apps/<你的站点>`（`cp -r apps/demo apps/mysite`）
2. 改 4 个配置文件的**值**（不要改 `interface`，否则 `verify-overlay` 的 O7 会报缺导出）
3. 换 `src/content/article/`、`src/data/*.json` 和 `src/data/entities/projects.ts`
4. `node scripts/create-site.mjs --overlay apps/<你的站点> --out /tmp/mysite --build`

## 已知限制

- **站点身份串已清零（2026-11-06 实测）**：`--build --install` 产物 118 个 HTML，
  `MIFSH` 0 次、站点作者身份 0 次；`/projects/` 已由 overlay 的
  `src/data/entities/projects.ts` 覆盖，404 的 `ping` 行读 `site.url`，设计文档页的
  示例值已改成 Demo Author / example.com。产物里仍有 4 次 `marxchou`，全部是
  `@marxchou/dogeared-tokens` npm 包名链接，不是站点身份。
- **`src/data/i18n/**` 清单归 T**：当前示例未命中作者身份串；新增 i18n 文案时仍需复核。
- **overlay 配置的形状真值取主题当前版本**（`src/config/*.ts`），不是 `theme-template/src/config/*`：
  后者是 2026-01 的分发快照，比主题代码旧（缺 `talksPage` / `donatePage` 等导出，照它写会构建失败）——
  这正是 R-50「demo 与主题配置漂移」的实体。
