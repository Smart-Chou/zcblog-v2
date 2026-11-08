# M6-1a · 颜色 token 按新稿落盘

- 卡：M6-1a（颜色子卡；M6-0 选型已交付）
- 日期：2026-11-08
- 范围：**只改 palette accent 的三个值**；页面结构 / 布局 / paper、ink palette / 生产站不动。

## 1. 取值依据

PO 选择“颜色按新稿来”。核对 51 份 `code.html` 的 tailwind config（实现层）：

| token | 现行 | 新稿 |
|---|---|---|
| `paper-50` / surface | `#FDF9F2` | `#FDF9F2`（不变） |
| `accent-500` | `#C84B31` | **`#A6331B`** |
| `accent-600` | `#B03A22` | **`#8E2A17`** |
| `accent-700` | `#9E290F` | **`#77230F`** |

`craft_editorial_indie/DESIGN.md` 叙述段写的 `#FBF7F0` 与 50/51 份 `code.html` 的 `surface/background` 不一致；以 `code.html` 的 `#FDF9F2` 为准，避免把叙述笔误落成生产值。`--layout-article` 也维持 780：新稿文章页是 1140 shell 的 8/12 分栏，实测正文 740–760，不存在 880 的稿子依据。

## 2. 对比度（WCAG 相对亮度实算）

| 组合 | 现行 | 新稿 |
|---|---:|---:|
| accent-solid 对纸底 | 4.44 | **6.43** |
| link 文字对纸底 | 5.76 | **8.02** |
| 白字对 accent | 4.66 | **6.75** |

对照图与截图：`blog2.0/_design/stitch-v2/token-compare/`（`compare-final.png`）。

## 3. 改动文件

- `packages/tokens/tokens.json`：`accent.500/600/700`；`$comment` 的 accent-700 推导记录。
- `packages/tokens/tokens.css`：由 `build-tokens.mjs` 生成。
- `docs/DESIGN.md`：§3.3.3 accent 值表与 §1.4 / 示例 JSON 同步；`paper-50` 仍 `#fdf9f2`。
- `docs/DESIGN.vendor.json`：md5 `2e7801576cd…`，键集合未变。
- `e2e/__screenshots__/`：light 方案受影响的基线重生成（macOS 21 atoms + 27 pages；Linux 21 + 27），共 96 张。

## 4. 验证

```text
node scripts/gates/check-tokens.mjs      10/10 PASS · 0 FAIL
pnpm run gates:all                       PASS · unclassified=0
pnpm run type-check                      0 errors
pnpm exec playwright test e2e/design-atoms.visual.spec.ts
                                         72 passed
pnpm exec playwright test e2e/pages.visual.spec.ts
                                         36 passed × 2（连跑）
Linux（mcr.microsoft.com/playwright:v1.63.0-noble）
  atoms 72 passed / pages 36 passed（--update-snapshots=all）
changelog 目标 commit 478b8bf
  CI run 42466693844：test / visual / gates / contract 全 success
  A11y PR smoke 42466693866、Perf 42466693822、Deploy matrix 42466693831、Demo site 42466693796 全 success
```

## 5. 边界

- **没有**改布局、页面组件、内容 schema、demo 或生产站；`marxchou.com` 仍不切换。
- **没有**改 `ink` / `paper` 其余档位；dark 主题保持现行值，因为新稿 A/B 只验证了 light accent。
- 新的对比度更稳，但 accent 更深；上线前仍以 PO 对实际页面的视觉判断为准。
