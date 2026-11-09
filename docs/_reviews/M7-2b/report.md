# M7-2b · 桌面 Waline 皮肤 a11y 收口（9 serious）

- 卡：`t_7391eef5`（blog2 板）· assignee `blog-fe` · 2026-11-09
- 工作区：`/Users/chowcong/Documents/WebSiteCode/zcblog-v2`
- 结论：**完成** —— 把 M7-2a 只在 ≤640 生效的 Waline 皮肤 token 覆盖与死上传隐藏提升到全断点；1440 打开态 axe（作用域 `#comment-wrapper`，wcag2a/aa + 21a/aa + 22aa）light/dark **violations 0（含 serious/critical）**，390 打开态仍 0，M7-2a 的 12 条行为 0 回归。
- 源文件：**2 个**（`src/styles/comments.css`、`e2e/pages-comments.spec.ts`），未触碰 `WalineComment.astro` / `article.css` / `MarkdownLayout` / `overlays.css` / `package.json` / Waline server/config。

## 1. 做了什么

M7-2a 的遗留是「同一段 DOM 在 ≤640 已换皮、≥641 还是 Waline 默认皮」。本卡把那段覆盖**原样上移**出媒体查询，一行值都没改：

| 改动 | 前 | 后 |
| --- | --- | --- |
| `#comment-wrapper #waline [data-waline]` token 块（15 个颜色变量） | 在 `@media (max-width: 640px)` 内 | 全局（移动/桌面同一套） |
| `#comment-wrapper #waline label[for="wl-image-upload"] { display: none }` | 同上 | 全局 |
| 抽屉外壳 / sheet / 滚动 / 遮罩 / 开合逻辑 | — | 一行未改（仍在 `≤640`） |

覆盖的只有**颜色变量**：`--waline-theme-color`、`--waline-active-color`、`--waline-color`、`--waline-bg-color{,-light,-hover}`、`--waline-border-color`、`--waline-disable-{bg-color,color}`、`--waline-info-{color,bg-color}`、`--waline-{light,dark}-grey`、`--waline-bq-color`、`--waline-badge-color`。值全部引用站内 token，`[data-theme="dark"]` 自动翻转。**没有**动字号、行高、间距、圆角、结构、交互、懒加载。

### 为什么这样就能同时收掉 9 个节点

| axe 规则 | 命中源 | 收口机制 |
| --- | --- | --- |
| `color-contrast` ×8 | Waline 默认 `#999` 灰（字数/Powered by/未选中排序）与 `#27ae60` 绿（提交键底/「按正序」） | `--waline-info-color` / `--waline-light-grey` / `--waline-dark-grey` → `--color-muted`；`--waline-theme-color` / `--waline-badge-color` → `--color-accent` |
| `aria-prohibited-attr` ×1 | `label[for="wl-image-upload"][aria-label]`（无 role；上传本身是死入口，`imageUploader` 直接 reject） | 全断点 `display: none` —— 隐藏子树不进无障碍树，规则与死入口一起消失 |

## 2. 验收命令与实测

```bash
corepack pnpm run build:ci        # ✓ 477 pages · 26,003,638 B（collapse 后），1m34s
M72B_SHOTS=1 corepack pnpm exec playwright test e2e/pages-comments.spec.ts --reporter=line
# → 12 passed / 1 skipped（M72A 暗色关闭态截图门控）+ 新增 1440 axe ×2；复跑 13 passed / 1 skipped
```

| 项 | 结果 |
| --- | --- |
| **1440 打开态 axe（light）** | **violations 0**（`serious/critical = 0`，实际全等级 0） |
| **1440 打开态 axe（dark）** | **violations 0** |
| 390 打开态 axe（light / dark） | 仍 **0**（M7-2a 结论不回归） |
| M7-2a 12 条行为 | 全过：关闭态 0 请求、打开才加载、关闭后 0 新请求、抽屉几何 390×742.72、滚动锁、关闭恢复滚动位置、Esc/遮罩/关闭键、焦点回填 |
| 1440 内联形态 | `#comment-wrapper` 内 `position: fixed` 元素 **0**；`html.comment-drawer-open` **false**；`#waline-drawer` 无 `role`；`#waline` 宽 **706.66** = `#comment-wrapper` 宽（ratio 1.00） |
| 死上传 label | `display: none`（元素仍在 DOM，只是不进渲染与无障碍树） |
| Waline 自身字号/间距 | 逐元素实测**未变**：editor 14px / submit 12px / 正文 16px / Powered by 10px（全部来自 Waline 皮，本卡未覆盖字体相关变量） |
| 横向溢出 | 390 开/关 ≤ 1px（0） |

证据截图（生产构建 + 真实 Waline API，`docs/_reviews/M7-2b/screens/`）：

- `m72b-1440-open-light.png`
- `m72b-1440-open-dark.png`

### 视觉变化（允许范围内）

桌面评论区从「Waline 默认绿 + 灰」变成站内语义色：提交键与选中排序为赤陶 accent（白字 on accent **5.11:1**），字数/版权/未选中项为 muted（muted on surface **6.34:1** light / **6.18:1** dark）；上传图标消失。布局、行高、宽度、间距均未变。light/dark 打开态截图逐一目视核对：无错位、无缺块、无挤压。

## 3. 迭代与构建记录（D-0150）

1. 改 `comments.css`（上移覆盖块）；`astro dev` 上跑 axe 探针：1440 light/dark 均 **0 violations**，`fixed=0`、`#waline` 宽 706.66、字号未变 —— 一次改对，无需二次调值。
2. 补写 1440 axe 用例（light/dark）+ `M72B_SHOTS` 截图门控。
3. `build:ci` **一次**（477 页），随后跑 spec 两轮。

## 4. 已知问题 / 遗留

1. **「390 关闭：滚动位置恢复」首轮偶发一次 21px 偏差**（容差 2px），复跑与单条重跑均通过。属既有用例的时序敏感（长文懒加载图片在关闭瞬间改变文档高度，`scrollTo` 被 clamp），与本次改动无关（本次未改抽屉滚动记录/回填逻辑，亦未改 390 分支样式）。建议 operator 在下轮把这步改成「先 `waitForLoadState('networkidle')` 再记 `scrollY`」以消抖；本卡未擅自放宽容差。
2. 桌面视觉确实变了（用户可感知）：这是卡面允许的「只改颜色/对比度」。
3. 390 反应行仍偏挤（6 列表情在 350px 内容宽折两行）—— M7-2a 已记的 Waline 内部布局债，需另开卡。
4. 全量 `pages.visual` / Linux 容器 / `gates:all` 未在本卡跑（卡面要求只跑本 spec，视觉基线由 operator 批次补；桌面 Waline 打开态不在页面视觉基线里 —— 基线只拍关闭态）。

## 5. 复现

```bash
corepack pnpm run build:ci
M72B_SHOTS=1 corepack pnpm exec playwright test e2e/pages-comments.spec.ts --reporter=line
```
