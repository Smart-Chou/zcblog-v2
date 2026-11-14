# 组件 API 规则（component-api）

> 本文管：组件的分层归属、依赖方向、props 契约、JS 预算、文档义务、P9 分母登记。**新建或修改任何 `src/components/**` 前必读。**
> 与 `rules/project-rules.md` §3（五层骨架）、`rules/ci-gates.md`（`verify-atoms` / `verify-atom-docs` / `verify-component-inventory` 的判据）分工：本文说「该怎么写」，那两篇说「机器怎么判」。
> 规格真源是 `DESIGN.md` §4（层级）与 §5.5/§5.6（props 与 12+3 个组件规格）——本文只固化判定规则，不复述每个组件的取值表。

---

## 1. 层由行为决定，不由文件放在哪里决定

| 层 | 目录 | 允许 import | 禁止 |
|---|---|---|---|
| L1 atom | `src/components/UI/atom/` | `tokens.css`、`Icons/*`、`~/types` | 其它组件、`~/config`、`~/data`、`~/content`、`layouts/` |
| L2 molecule | `src/components/UI/molecule/` | atom、`~/types`、`~/utils`（纯函数） | organism / page、数据源、浏览器持久化 |
| L3 organism | `src/components/UI/organism/` | atom + molecule + `~/utils` + `~/scripts` | page、`~/content`（数据由 props 注入） |
| L4 page | `src/pages/`、`src/layouts/` | 全部 | 被任何 L1–L3 反向 import |
| infra | `src/components/BaseHead/` | 配置 | 渲染可见 UI |

**归层四问**（不需要请示，照着判）：访问站点数据/配置吗？→ 不是组件层。有行为/生命周期吗？→ 至少 organism（除非落在 §2 的「局部」格）。由两个以上本系统组件组成吗？→ molecule 或以上。以上都否 → atom。<!-- DESIGN §4.4 -->

## 2. 四条依赖禁令（评审时逐条查）

- **D1 禁止反向依赖**：atom 不许 import molecule/organism/page。反向依赖会让 atom 无法独立测试与复用。<!-- DESIGN §4.2 D1 -->
- **D2 禁止 import `layouts/`**：布局是页面骨架，不是组件。<!-- DESIGN §4.2 D2 -->
- **D3 禁止跨层相对路径**：禁止 `../../../` 这类相对链——它会随目录调整断裂，跨层一律用别名。<!-- DESIGN §4.2 D3 -->
- **D4 L1–L3 禁止 import 站点数据与配置**（`~/config`、`~/data`、`~/content`、`~/content.config`）。<!-- DESIGN §4.2 D4 -->
- 包内（`packages/*`）不得用 `~/` 别名反向读站点代码；不得出现站点身份串（`marxchou` / `mcc.im` / `zcily` / `73b29141`）。`verify-package-boundary` 的 B1/B2 硬判。<!-- docs/package-boundary.md · M3-1 B1/B2 -->

**浏览器状态的归属按「影响半径」判，不按层一刀切**：

| 状态 | 允许的层 |
|---|---|
| 局部、无持久化、不跨组件（一次 click 改自己的 DOM/ARIA） | atom 允许（须在规格里写明） |
| 局部但有副作用（请求、`localStorage`、计时器） | ≥ organism |
| 跨组件 / 跨页（路由、全局事件、共享单例） | organism，且走 `onPageReady` + 单例约定 |
| 模块顶层副作用（import 即执行） | **任何层都禁止** |

<!-- DESIGN §4.3 · D-0090 · D-0073 -->

## 3. atom / molecule 必须 0 JS

- 判定：文件里 `<script>` 命中 0、`client:load|idle|visible|only|media` 命中 0。<!-- DESIGN §5.6 A5 · verify-atoms.mjs A5 -->
- `loading` / `disabled` 这类「像交互」的状态由**父级静态 props** 驱动，不在组件里写计时器或事件监听（`Button` 就是这么做的）。
- 需要生命周期、跨页单例、第三方网络依赖 → 升 organism，并在 `DESIGN §5.7` 立规格后再写代码。`SitePlayer` 是唯一登记的行为组件。<!-- DESIGN §5.7 · §6.2 X6 -->
- 新增交互组件的 JS 预算默认 **0 字节**；例外必须登记进 `DESIGN §6.2` 例外表（带消解时点），否则评审按违规处理。<!-- DESIGN §7 · §6.2 -->

## 4. Props 契约

- 四个维度只用四个词：`variant`（外观变体）、`tone`（颜色语义）、`size`（尺度），状态用原生语义属性（`disabled` / `loading` / `selected` / `invalid`）。一个组件最多同时拥有其中三个。<!-- DESIGN §5.5 -->
- 反例即违规：`type="red"`、`color="blue"`、`kind`、`status` / `level` / `severity`、`small` / `large`、`isDisabled`。
- 类型用 `export interface Props` 声明，默认值在解构处给（`const { variant = "secondary", size = "md" } = Astro.props`），不要写 `Astro.props.variant ?? ...` 散在模板里。
- `class` 必须能透传且**不覆盖调用方类**：用 `class:list={[...]}` 合并，不要字符串拼接。<!-- 参考 atom/Button.astro 既有写法 -->
- icon-only 控件必须有 `aria-label` 来源（`label` prop），有可见文字时 `label` 必须为空——不能两者都给。<!-- DESIGN §6.1 N4 · §5.6.1 -->
- 有可见文案就给 slot，不要把中文写进组件：A8 扫 `"中文` / `>中文` 两种形态，命中即违规。用户可见文案进 `src/data/i18n/*.json`，组件只接收字符串。<!-- DESIGN §5.6 A8 · src/data/i18n -->

## 5. 样式契约

- 颜色只能用 `--color-*` 语义 token；组件里出现 hex / `rgb()` / `hsl()` 即 N1 违规（12 个核心组件由 A2 判红，其余由 P5 棘轮只减不增）。<!-- DESIGN §6.1 N1 · verify-surface-tokens C1 -->
- 尺寸字面量白名单只有 `0` / `1px` / `2px` / 百分比 / `auto`；其余一律 `--space-*` `--text-*` `--radius-*`（A7 判红）。<!-- DESIGN §5.6 A7 -->
- 交互组件的焦点环必须统一：`:focus-visible`（Input 可用 `:focus-within`）+ `outline: 2px solid var(--color-ring-focus)`，offset 2px。用 `box-shadow` 造环会被 `overflow` 裁掉。<!-- DESIGN §5.4 · §5.6 A6 · verify-atoms.mjs A6 -->
- 状态不许只靠颜色：每个状态必须有第二通道（图标、下划线、边框、文案、`aria-*`）。<!-- DESIGN §6.1 N5 · §5.4 -->
- hover 只在 `@media (hover: hover)` 内生效，触摸设备不要假 hover。<!-- DESIGN §5.4 两条硬规矩 1 -->
- 组件样式保持 scoped；全局样式表不为单个组件加规则（文章页 CSS 已贴 40KB 门禁线）。<!-- DESIGN §6.1 N12 · §7 -->

## 6. 文档义务（与组件同批交付，不是「以后补」）

**每个 atom / molecule 必须有一份七章节文档**：用途与何时不用 / Props / Slots / States / a11y / token 白名单 / 示例。判据全在 `verify-atom-docs`（D1–D8）与 `verify-component-docs`（D0–D9）：

- 数据在 `src/pages/design/_docs/data/<slug>.json`（legacy UI 在 `data/components/<slug>.json`），页面在 `src/pages/design/atoms|components/<slug>.astro`。<!-- verify-atom-docs D1/D3 -->
- 文档层不许自造视觉值：页面/版式里 hex / `rgb()` / `hsl()` = 0；px 只允许 `0` / `1px` / `2px`；数据 JSON 里出现的字面值必须能在组件源码里逐字找到。<!-- verify-atom-docs D5/D7 · verify-component-docs D5/D7 -->
- 文档里引用的 token 名必须能在 `tokens.json` 解析（D4），且必须出现在 `DESIGN §5.6` 对应小节（`verify-doc-drift` D4）；对比度数字必须来自 `§5.6.13-B` 的实测列或标注决策号（D3）。
- 改了 `DESIGN §5.6` 的 props / states / 对比度却没同步 JSON → `verify-doc-drift` 红。<!-- verify-doc-drift D1–D4 -->
- 有 dist 时还要查构建产物：每页 7 个 section、无空表、示例有画框（D8）。所以文档页改动要跑一次 `--dist`。

## 7. P9 分母：新组件必须进清单，不是「文件存在就算」

- 唯一分母是 `docs/component-inventory.json`，冻结值写在 `verify-component-inventory.mjs` 的 `FROZEN_COUNTS`。2026-11 现状：`atom 11 / molecule 4 / ui 24 / layout 1 / page-organism 11 / total 51`。<!-- D-0155 · D-0161 · D-0168 · verify-component-inventory.mjs:61 -->
- 新增 atom/molecule 时必须**同批**做四件事：① 建组件文件；② 加 `_docs/data/<slug>.json` + 文档页；③ `docs/component-inventory.json` 加记录（`slug` / `file` / `layer` / `usage_count` / `doc_url` / `status`）；④ 改 `FROZEN_COUNTS` 与清单 `counts`。三方（清单自报 = 冻结值 = 实测）不一致即红（I6）。<!-- verify-component-inventory I2/I6 -->
- `slug` 全局唯一；与 atom 同名的 legacy UI 必须加 `ui-` 前缀（`ui-button` / `ui-card` / `ui-pagination`）。<!-- verify-component-inventory I5 -->
- `usage_count` / `usage_tags` 是快照：0 引用且 `status` 不是 `dead` 即红；快照过期只告警，跑 `--update` 重写。<!-- verify-component-inventory I7 · D-0168 第 3 项 -->
- `src/components/Pages/*.astro` 这类 page-organism 以 `status: debt` 登记，不写文档——**别为了消红把它删掉**，删了 I4 会红。

## 8. 反例清单（评审直接打回）

- ❌ atom 里 import 另一个 atom（应声明为 molecule）。`Breadcrumb` / `Pagination` / `PageHero` / `DataState` 就是 molecule，卡名叫「atom」不代表层级是 atom。<!-- DESIGN §4.5 -->
- ❌ 在 atom 里 `import { site } from "~/config"`。
- ❌ `<style>` 里写 `border-radius: 12px`、`padding: 14px`、`color: #c84b31`。
- ❌ 自造 `:hover { background: … }` 而不走状态 token。
- ❌ 新建小写 `src/components/ui/`（macOS 会撞进 `UI/`，Linux 变两个目录）。<!-- DESIGN §4.1 -->
- ❌ 组件里硬编码中文按钮文案，或写 `aria-label="关闭"` 字面量。

## 9. Props 写法模板（照这个形状写，评审才不用来回问）

```astro
---
export interface Props {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    disabled?: boolean;
    loading?: boolean;
    /** 仅 icon-only 时必填（成为 aria-label）；有默认 slot 时必须为空。 */
    label?: string;
    class?: string;
}

const { variant = "secondary", size = "md", disabled = false, loading = false, label, class: className } =
    Astro.props;
---
<button class:list={["button", `button--${variant}`, `button--${size}`, className]} disabled={disabled || loading}>
    <slot />
</button>
```

三条要点：枚举值直接写进联合类型（不要 `string`）；默认值在解构处给；`class` 改名后在 `class:list` 里**追加**而不是替换。<!-- 参考 src/components/UI/atom/Button.astro -->

## 10. 改完跑这几条

```bash
node scripts/gates/verify-atoms.mjs              # P1–P10 文档 + A1–A8 组件（18 项）
node scripts/gates/verify-atom-docs.mjs          # D1–D7（加 --dist 跑 D8）
node scripts/gates/verify-component-docs.mjs     # legacy UI 文档 D0–D9（加 --dist 跑 D8）
node scripts/gates/verify-component-inventory.mjs # I1–I7；usage 漂移用 --update 重写
node scripts/gates/verify-doc-drift.mjs          # DESIGN §5.6 ↔ 文档 JSON
node scripts/gates/verify-surface-tokens.mjs     # P5 棘轮（--update 收紧基线，拒绝变长）
```

全部 exit 0 才算完；`pnpm gates:all` 会把其中 5 条一起跑（见 `rules/ci-gates.md` §2）。
