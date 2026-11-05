# apps/demo — 最小示例 overlay

这是 `Dogeared` 主题的**示例站点 overlay**：它只放站点身份（配置）、内容和数据，
不含任何主题代码（组件、样式、页面、工具都在主题里）。

装配 + 构建：

```bash
node scripts/create-site.mjs --overlay apps/demo --out /tmp/zcd --build
# → RESULT PASS  out=/tmp/zcd html=<n> …  （dist 里至少 8 个 HTML）
```

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

契约：`site.manifest.json` 把 `apps/demo/**` 归 O（`docs/overlay-contract.md`）。
`scripts/theme-sync.mjs --apply` 只写 T 路径，永远不碰这里。

## 装配器怎么用这 6 个文件

`scripts/create-site.mjs` 按四层自下而上覆盖，后写的赢：

1. `theme` — `site.manifest.json` 里分类为 T 的文件（组件 / 页面 / 样式 / 工具 / `packages/**` / 脚本）
2. `baseline` — `theme-template/{src,public}` 的占位 overlay 基线（4 份配置、法务页、10 个占位 JSON、默认资产）
3. `shim` — `src/data/{adapters,entities}/**`（主题页面直接 import，缺了构建必挂）
4. `overlay` — **本目录**：4 个配置 + 1 篇文章 + 1 个 JSON 覆盖上面三层

所以本目录只需要**差异**，不需要把主题里已有的占位文件复制一份。

装配结果是**可加不可减**：overlay 能覆盖基线的同名文件，但删除不了基线文件。
示例站最终是 2 篇文章 —— 基线的 `getting-started.md`（主题上手向导）+ overlay 的
`hello-world.md`，共 115 个 HTML；要只留一篇就在 overlay 里放同名文件覆盖它。

## 加自己的站点

1. 复制本目录为 `apps/<你的站点>`（`cp -r apps/demo apps/mysite`）
2. 改 4 个配置文件的**值**（不要改 `interface`，否则 `verify-overlay` 的 O7 会报缺导出）
3. 换 `src/content/article/`、`src/data/*.json`
4. `node scripts/create-site.mjs --overlay apps/<你的站点> --out /tmp/mysite --build`

## 已知限制（不在本卡范围，已在本卡评论登记）

- **示例站会继承少量站点身份串**：`node scripts/create-site.mjs --overlay apps/demo --out /tmp/zcd --build`
  产物 115 个 HTML 里有 8 个含 `marxchou` 字样 —— 来源两处，都不在 overlay 文件边界内：
  ① `src/data/entities/**`（清单归 O，但没有占位副本，装配器从仓库根取 shim，`/projects/` 因此显示原作者）；
  ② 主题自带的设计文档页 `/design/components/*`（T，页面里的演示数据写死在主题）。
  干净化要么给 `theme-template` 补实体占位，要么把 design 页示例数据外置 —— 需要 PO 拍板。
- **`src/data/i18n/**` 清单归 T**，但 `zh.json` 的 `site` 块写的是主题作者的站点名；
  示例站部分文案仍会带上它。「i18n 站点块归 O」同样是待拍板项。
- **overlay 配置的形状真值取主题当前版本**（`src/config/*.ts`），不是 `theme-template/src/config/*`：
  后者是 2026-01 的分发快照，比主题代码旧（缺 `talksPage` / `donatePage` 等导出，照它写会构建失败）——
  这正是 R-50「demo 与主题配置漂移」的实体。
