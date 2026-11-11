# M8-6-0 · 地基卡执行报告（s0 组件骨架）

> **状态**：WIP（2026-11-11，`blog-fe`，session 30 min 上限交接）
> **卡**：`t_0744aa27` · 契约：`docs/_reviews/M8-6/acceptance-standard.md`、26 §7、27 §4.1、`D-0155`
> **本轮范围**：只交付 3 个组件源码 + 编译/渲染验证；文档三件套（页/JSON/registry）、DESIGN.md、inventory/FROZEN_COUNTS 未动，见 §4 TODO。

---

## 1. 交付物

| 文件 | 层 | 行数 | 说明 |
|---|---|---:|---|
| `src/components/UI/molecule/PageHero.astro` | molecule | 209 | kicker（accent 短尺 `--space-12`）+ h1 + lede + `meta[]`（quiet 档）+ `divider` + default slot |
| `src/components/UI/atom/SectionHead.astro` | atom | 113 | `title` / `meta?` / `id`（必填）/ `level?` 2\|3 / `action?` slot |
| `src/components/UI/molecule/DataState.astro` | molecule | 171 | `kind=empty\|error`；error 复用 `Alert tone="warning"` + mono 原因码 |

新增源码 **493 行**（含注释与样式）。**超出 ≤300 行理想值 193 行**，原因：三个组件是新建而非改造，样式层 34 个 token 槽位（颜色/尺寸/字号/字距/行高/圆角/measure）逐条落值 + 三处断点契约各 2–4 条规则；注释占 60 行（组件头写明断点契约与禁止项，供页卡直接引用）。**未引入任何依赖**，`git diff packages/tokens/` 为空。

## 2. 验收项 → 命令 → 输出 → 结论

| 验收项（27 §4.1） | 命令 | 输出 | 结论 |
|---|---|---|---|
| 5. 组件可渲染、light/dark 示例区非空 | `curl http://127.0.0.1:4400/m86-0-probe/`（临时探针页，已删） | `HTTP=200 bytes=31434` | PASS（结构级） |
| 组件 JS 0 字节 | 组件内无 `<script>`；探针页 `grep -c '<script' = 0` | 0 | PASS |
| 6. `grep -cE '#[0-9a-fA-F]{3,8}\|rgba?\(\|hsla?\('` = 0 | 同左 | 0 命中（3 文件） | PASS |
| 7. `px` 只允许 1px/2px/断点 | `grep -n 'px'` 3 文件 | 1px×2（两条底边线）、2px×1（短尺）、768/450（断点）；0 尺寸字面量 | PASS |
| 4. `check-tokens.mjs` exit 0 | `node scripts/gates/check-tokens.mjs` | `结果：10/10 PASS · 0 FAIL` | PASS |
| 编译 / TS | `npx tsc --noEmit` | 无输出（0 error） | PASS |
| `prefers-reduced-motion` 过渡归零 | 3 组件 0 个 `transition` / `animation` | — | 不适用（N/A 即成立） |
| `@media` 只允许 450/768/1024 | 源码 4 处：PageHero 768/450、SectionHead 768、DataState 450 | — | PASS |
| 1–3. 文档 JSON / 文档页 / registry、8. 分母 | 未执行 | — | **TODO（§4）** |
| 9. 视觉基线 | 不由本卡执行（QA 批次末尾） | — | 交接 |

### 2.1 渲染结构断言（探针页，`m860-probe.html` 解析）

| 断言 | 实测 |
|---|---|
| PageHero 两种形态各 1 个 `<header class="page-hero">` | 2 |
| `divider` 默认渲染 1 处；`divider={false}` 不渲染 | 1（minimal 无） |
| kicker 空 → 短尺/整行不渲染（minimal 形态 0 个 `.page-hero__kicker`） | 0（另 1 处在 full 形态） |
| `id` 显式传 `games-title`；只给 `slug` → `series-title` 兜底 | 两处均命中 |
| `meta[]` 4 条 chip，`quiet` 档 1 处 | chip-label=4 / quiet=1 |
| h1 基础 `--text-4xl`，`(width <= 768px)` 降 `--text-3xl` | 均命中，无 `clamp()`/`vw` |
| SectionHead `level=2→h2` / `level=3→h3`，`id` 落值 | 均命中 |
| SectionHead `(width <= 768px)` → `flex-direction: column` | 命中 |
| DataState empty：圆底 icon（`aria-hidden="true"`）+ h2 + 说明 + action | 命中 |
| DataState error：`alert--warning` + `原因代码：<code>` | 命中；error 块内 0 个 empty 节点 |
| 静止空态不带 `role="status"` | `role="status"` 出现 0 次 |

## 3. 阶段结论

- **s0（本轮，30 min）**：3 个组件的 props / slots / 断点 / 空值分支 / a11y 语义按 26 §7 落值完成；token 全部命中现有 `tokens.json`（34 个白名单键逐个 grep 过，`MISSING` 0）；样式 scoped，未碰任何存量 `pages/*.css`。
- **未完成项全部在下节**，不涉及返工风险：组件 API 已按文档定稿，页卡可直接接入。

## 4. TODO（下一 session 起点）

### s1 剩余（文档三件套 · ~40 min）
1. `src/pages/design/_docs/data/pagehero.json` / `sectionhead.json` / `datastate.json`：七项字段（用途/何时不用、Props、Slots、States、a11y、token 白名单、示例锚点）。范式照 `data/alert.json`。
2. `src/pages/design/atoms/pagehero.astro` / `sectionhead.astro` / `datastate.astro`：`<AtomDoc>` + `<DemoFrame>` 示例区（PageHero 两种形态、SectionHead 三种组合、DataState empty/error）。
3. `src/pages/design/_docs/index.ts`：`DOCS` 追加 3 条 import + 数组项（顺序放在 `skeleton` 之后，保持 prev/next 稳定）。
   > ⚠️ `scripts/gates/verify-component-inventory.mjs` 的 `I1` 硬编码「registry 12 条」（`imports.length` 与 `应 12` 文案），追加到 15 条时须同步改为 15，否则 I1 必红。

### s3（分母 + DESIGN · ~50 min）
4. `docs/component-inventory.json`：atom 10→11 / molecule 2→4 / total 47→50，`node scripts/gates/verify-component-inventory.mjs --update` 重写快照。
5. `scripts/gates/verify-component-inventory.mjs`：`FROZEN_COUNTS` 同步 `{atom:11, molecule:4, total:50}`（D-0155）。
6. `docs/DESIGN.md`：§5.6.13–15 三节 + §5.3 状态矩阵 3 行 + §4.5 层表 3 行（会签 blog-design）。
7. 四条门禁：`verify-atom-docs` / `verify-component-inventory` / `verify-component-docs` / `check-tokens`。
8. 组件文档页截图 1440 light/dark（探针页已删，截图走文档页）。

## 5. 另发现的存量红（不属本卡，勿在本卡修）

- `verify-component-inventory.mjs` 当前 **`I3` / `I7a` FAIL**，唯一原因：`src/components/UI/FriendApply.astro`（M8-5c 新增）**未登记进 `docs/component-inventory.json`**，`ui=23` 实测文件 25。与 M8-6-0 无关（本卡 3 个文件在 `UI/atom`、`UI/molecule` 子目录，只经 registry 计数，未触发该检查）。已在卡上提 hotspot 提示，建议 operator 归到 M8-5c 收口或平台卡。
- `I7b` `usage 快照过期 9 条`（link/tag/card/icon/alert/author/badge/ui-button/friendcard）：跑 `--update` 即消；必须与 s3 第 4 步合并成一次提交，避免两次改写同一文件。
