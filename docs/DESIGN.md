# DESIGN.md · zcblog 设计系统真源 v1.1.0

> **状态**：v1.1.0（M1-1b：§3 值表对齐 Stitch 基线）· 2026-11-02 · 版本判定见 §8.1
> **Owner**：`blog-design`（`docs/11-team-org.md` §2）· **验收**：`blog-pm` 按本文 §9 逐项判定 · **视觉方向签字**：PO（周聪）
> **上位文档**：`docs/16-m1-brief.md`（M1 目标与交付物）、`docs/12-product-charter.md`（产品定义与 P5 设计契约）
> **下游消费方**：`tokens.json`（M1-2）、12 个核心组件（M1-3）、组件文档与视觉基线（M1-4）、门禁（M1-5）
> **取代关系**：本文取代 `zcblog-v2/.claude/DESIGN.md`（v1 皮肤存档，冻结不再更新）。**冲突时以本文为准。**
> **v1.1 已合并（2026-11-02）**：PO 给了 Google Stitch 的初步 UI（`blog2.0/_design/stitch-baseline/`）作为 M1 视觉基线，`tokens.json` 已按它落地（`t_f44ee43d`），本文 §3.3–§3.12 已按同一份 JSON 重写（本卡）——**文档与 JSON 现在是一套值**，不再有「以谁为准」的兜底。差异、推导与原值见 §3.14（历史记录）。
> **CSS 架构（D-0100，2026-11-02）**：Tailwind 已移除；组件用 Astro scoped styles / `src/styles/` 原生 CSS；token 走 `tokens.json → tokens.css`；不写 utility class、`@apply`、`@theme`。
> **性质**：这是**契约**，不是灵感板。写进来的东西要能被机器检查，或者能被第三方判断对错。

---

## 0. 怎么用这份文件

| 你是谁 | 读哪几节 | 你要产出什么 |
|---|---|---|
| `blog-design`（改稿） | 全部 | DESIGN.md 新版本 + tokens 变更提案 |
| `blog-platform`（M1-2 token 编译） | §3 全部 | `tokens.json` / `build-tokens.mjs` / `tokens.css` / 校验脚本 |
| `blog-fe`（M1-3 组件） | §3.4–§3.11、§4、§5 | 12 个组件 + `/design/atoms` 实验页 |
| `blog-qa`（M1-5 门禁） | §6、§8.4、§9 | 硬编码检查、基线评审、`PASS`/`REQUEST_CHANGES` |
| `blog-pm`（验收） | §9 为主，§3.2 与 §4.2 为辅 | 按验收项逐条判定 |
| PO（周聪） | §1、§2、§3.3 | 「这个气质对不对」的一句话判断 |

**三条读法约定**

1. 本文出现的**数字都是契约**。改数字 = 改契约，走 §8 流程。
2. 本文出现的**「现状」字样**是取证结果（命令输出 / 源码行号），不是印象。
3. 本文**不含组件实现**。`src/components/`、`src/pages/` 一个字节都不由本文改动。

---

## 1. 视觉叙事

### 1.1 一句话

> **一本被反复翻阅的暖色纸页笔记本：朱红墨迹、衬线标题、留白充分，深浅色都像同一个物件在不同光线下。**

「Marx's Blog」的既有气质（暖纸 + 朱红 + 衬线）是资产，v1.0 **不换皮肤**，只把它从「一套好看的 CSS」升级为「一套可复用、可检查、可升级的契约」。产品化之后这个气质要服务的不再是一个人的博客，而是「50–500 篇内容的中文个人站」（`12-product-charter.md` §3.2）。

### 1.2 服务什么内容

| 内容 | 设计要做的 | 设计不许做的 |
|---|---|---|
| 长文（1500–10000 字，中英混排） | 让阅读连续：行高 1.8（`--leading-relaxed`）、正文 68ch 上限、目录不抢戏 | 用装饰打断段落；用大色块切碎正文 |
| 代码块 / 表格 / 公式 | 让「块」与「文」区分明显：凹陷表面 + 等宽字体 | 给代码块加彩色左边条（§6 禁止项） |
| 列表与归档（每页 9–12 张卡） | 一眼分清标题、摘要、元信息三级 | 卡片套卡片；每张卡都加阴影 |
| C 层展示页（项目/设备/相册/追番） | 允许更强的视觉表达，但仍在同一套 token 内 | 另起一套配色；引入第二个饱和色 |
| 10 locale（zh-CN/zh-TW/en/ja/ko/fr/de/es/pt-BR/ru） | 排版对 CJK 与拉丁都成立；字族角色固定 | 为某种语言单独写一套字号/行高 |

### 1.3 明确拒绝什么

一句话标准：**任何「为了让页面看起来更贵」而加的视觉**，都要先回答「它帮读者读懂了什么」。

| 拒绝 | 为什么 | 替代做法 |
|---|---|---|
| 二次元皮肤 / 花哨主题市场风 | 与「内容型个人站」的产品定位冲突（`12` §3.3 已把「只要好看的模板」列为非用户） | 一套克制的编辑风，靠排版取胜 |
| 玻璃拟态堆叠、多层 backdrop-blur | 移动端合成成本高；`06-performance-budget.md` §2 的 CSS/JS 预算已经很紧 | 用「表面 + 1px 边框 + 单层阴影」表达层级 |
| 无意义渐变 / 渐变文字 | 与「墨与纸」的隐喻无关，且 `background-clip:text` 有对比度风险 | 用字重、字号、朱红强调 |
| 滚动编排（scroll-jacking）、视差、入场编排 | 直接伤 LCP/TBT（D-0088 删开场动画、D-0094 去透明入场都是这个教训） | 只做状态过渡（hover/focus/展开） |
| 仪表盘式大数字 + 小标签 + 彩色图标 | 把博客做成 SaaS 后台 | 数字用正文色，标签用 muted 文本 |
| 第二套饱和强调色 | 强调色的力量来自稀缺（One Accent Rule） | 语义状态用 success/warning/danger 三色，且**只用于状态** |

### 1.4 品牌记忆点（三条，评审时最先看）

1. **暖纸底色 `#fdf9f2`（`paper-50`）**：不是纯白，也不是米黄。深色是冷墨 `#121316`（`ink-950`），不是纯黑。
2. **赤陶 `#a6331b`（`accent-500`；深色用 `accent-400` `#e05d43`）**：只做强调（链接、主按钮、选中态、焦点环），任何单屏面积 ≤10%。
3. **衬线标题 + 无衬线正文 + 等宽代码**：三族封顶，永不引入第四族。

---

## 2. 设计原则

七条。每条都带**判据**——违反时能指出来，而不是「我觉得不太对」。

| # | 原则 | 判据（可检查） |
|---|---|---|
| P1 | **内容优先** | 任何页面删掉导航/页脚/装饰后，正文仍可完整阅读；正文区域宽度 ≤ `--measure-prose`（68ch） |
| P2 | **克制**：装饰性元素必须有信息职责 | 新增的每个视觉元素要能在组件规格里写清「它传达什么状态/层级」。写不出 → 删 |
| P3 | **可读性 > 装饰** | 正文对比度 ≥4.5:1，大字 ≥3:1（§3.4.7 已逐对实测）；正文行高 1.8（`--leading-relaxed`）；不使用 `text-align: justify` 以外的强制对齐技巧 |
| P4 | **深浅一致**：深色是一等公民，不是反色滤镜 | 每个语义色 token 都有 dark 值；`[data-theme="dark"]` 的键集合与 `:root` **完全相同**（§3.12 门禁） |
| P5 | **动效服务于理解** | 只允许解释「状态变了 / 内容从哪来」的动效；时长取 `--duration-*`；`prefers-reduced-motion` 下必须为 0 |
| P6 | **token 是唯一出口** | 组件里出现字面颜色/圆角/间距 = 违规（§6.1）；组件只消费语义色 + 度量 token |
| P7 | **设计不能压爆性能** | 设计系统自身成本上限：`tokens.css` ≤ 12KB（raw，与 §7 同数）；不新增运行时依赖；不给全局样式表加新规则（R-31 文章页 CSS 39.7/40KB 已贴线） |

> P7 不是口号：`13-package-boundaries.md` §5 已经把 `packages/tokens` 定为「先归集、不发布」的内部包，M1 的实现成本必须落在这个包内。

---

## 3. Token 体系

### 3.1 三层词汇（先说清「语义」到底指哪一层）

`16-m1-brief.md` §3.2 的规则是「组件只能用语义 token；palette 只在 tokens.css 里出现」。这句话在颜色上是完备的，但在间距/圆角上会引起歧义（`--space-4` 算不算语义？）。本文把它拆成三层，作为对 16 §3.2 的**澄清**（不是修改）：

| 层 | 命名 | 允许谁用 | 值的特点 |
|---|---|---|---|
| **L0 palette** | `--palette-<hue>-<step>` | **只有 `tokens.css`** | 原始色值（hex/rgba），无语义 |
| **L1 semantic（颜色）** | `--color-<target>-<role>[-<emphasis>]` | 组件、页面、样式表 | 引用 L0；**组件里唯一允许的颜色来源** |
| **L2 primitive（度量）** | `--space-*` / `--radius-*` / `--shadow-*` / `--text-*` / `--leading-*` / `--tracking-*` / `--font-*` / `--duration-*` / `--ease-*` / `--z-*` / `--layout-*` / `--bp-*` | 组件、页面、样式表 | 字面值（px/rem/ms/ch），本身即语义最小单位 |

**为什么颜色要两层、度量不要两层**：颜色的「同一个角色在不同语境含义不同」（`accent-500` 既是主按钮底色、也是焦点环，同一个语义在深色下还要换成 `accent-400`），所以必须有 palette → semantic 的映射；间距的 `4px` 在哪儿都是 4px，再加一层别名只会产生 `--space-gap-sm` 这种没有信息量的名字。

**由此产生的唯一硬规则**：

> 组件里 `background`/`color`/`border-color`/`fill`/`stroke`/`box-shadow` 的**颜色部分**只能写 `var(--color-*)`；
> 出现 `--palette-*`、`#hex`、`rgb()`/`hsl()` 字面值 = 违规（§6.1）。

### 3.2 命名语法（可直接写进 `tokens.json` 的键）

**颜色（语义层）**

```text
--color-{target}-{role}[-{emphasis}]

target    ∈ bg | overlay | fg | border | accent | ring | status | viz
role      ∈ §3.4 表中登记的 role（闭集，新增 role 走 §8）
emphasis  ∈ strong | subtle | hover | focus | disabled | solid | fg | bg | border | on-accent | inverse
```

`role` 是**闭集**：`tokens.json` 里出现的每个 `--color-*` 键都必须在 §3.4 的表里有一行，反之亦然。**表外无名**——这条让「tokens.json 与 DESIGN.md 不一致」变成可机器判定的错误。

`target` 也是**闭集**，v1.1 补登了 `overlay`。`--color-overlay-hover` 自 v1.0 起就在 `tokens.json` 和 §3.4.1 里，但 v1.0 的 target 枚举漏了它：§3.4.1 把它算进 bg 的 11 个，§3.2 却说 target 只有 7 个值——这是 v1.0 自带的矛盾，v1.1 必须选一个（另一条路是改名成 `--color-bg-overlay-hover`，但那会连带动 `tokens.json` 与 §5.6 里 10 处 token 白名单，收益为零）。

两者不能合并，因为语义不同：

- `bg-` = **某个表面的底色**（canvas / surface / raised / sunken / muted / hover），是主题里真实存在的一张纸，深浅各自有 palette 值；
- `overlay-` = **盖在任意表面上的一层着色**（图片卡、列表行、任意底色都成立），靠 alpha 让同一个值在深底浅底上都工作。

§3.4.1 把两者排在同一组（都是「背景性着色」，查表方便），但 `overlay-hover` 的 target 是 `overlay`——所以那一组是 **bg 10 + overlay 1 = 11**。这是**把既有键补进枚举**，不是新增语义键，按 patch 级文档订正处理（§8.6 第 2 条管的「新增 role」指新增 `--color-*` 键）。

**四条命名细则**

1. **`target` 表达「这个颜色画在什么上」**：`bg-` 是背景、`overlay-` 是叠层、`fg-` 是文字/图标、`border-` 是边框、`accent-` 是色块、`ring-` 是焦点环、`status-` 是状态色、`viz-` 是数据可视化分类色。
2. **`role` 表达「什么语义」**，不表达「什么组件」：写 `--color-fg-muted`，不写 `--color-post-meta-text`。组件名进 token 名 = 换组件就得改 token。
3. **状态用后缀，不造新角色**：hover/active/disabled/selected 一律是 §3.4 已登记的 role，不在组件里发明 `--color-button-hover-bg`。
4. **accent 组只描述「色块」，不描述「文字」**：文字用 `--color-fg-link`。同一件事只有一种叫法（`--color-accent-text` 不存在，永远不要加）。

**度量（primitive 层）**

| 家族 | 语法 | 单位/取值规则 |
|---|---|---|
| 间距 | `--space-<n>`，`n ∈ {1..12, 14, 16, 20, 24}` | **值 = n × 4px**（唯一例外：无） |
| 圆角 | `--radius-<size>`，`size ∈ {xs, sm, md, lg, xl, 2xl, pill}` | px；`pill = 9999px` |
| 阴影 | `--shadow-<1..5>` | 完整 `box-shadow` 值 |
| 字号 | `--text-<step>`，`step ∈ {xs, sm, base, lg, xl, 2xl, 3xl, 4xl, display}` | px（`display` = 56px 定值，**不用 `clamp()`**，理由同 §3.6 的「不提供流体 token」） |
| 行高 | `--leading-<none\|tight\|snug\|normal\|relaxed>` | 无单位倍数（5 档，见 §3.5.3） |
| 字距 | `--tracking-<tight\|normal\|wide>` | em |
| 字族 | `--font-<sans\|serif\|mono>` | 完整 font stack |
| 字重 | `--font-weight-<regular\|medium\|semibold\|bold>` | 100–900 |
| 时长 | `--duration-<fast\|base\|slow\|slower>` | ms |
| 缓动 | `--ease-<standard\|emphasized\|linear>` | `cubic-bezier()` / `linear` |
| 层级 | `--z-<base\|raised\|dropdown\|sticky\|overlay\|modal\|toast\|skip-link>` | 整数 |
| 布局 | `--layout-<content\|article\|wide\|sidebar\|toc\|header-height>` | px |
| 断点 | `--bp-<xs\|sm\|md\|lg\|xl\|2xl>` | px（**只作文档与 JS 读取**，见 §3.10） |
| 行宽 | `--measure-prose` | ch |

**v1.0 → v1.1 的语法变化（两处，都已进 `tokens.json`）**

1. 行高 3 档 → 5 档：`--leading-none`（1，单行控件）与 `--leading-snug`（1.4，小标题）是**新增键**；`tight / normal / relaxed` 保留但数值变了（1.25 / 1.65 / 1.8，见 §3.5.3）。**注意 `--leading-snug` 与旧站同名键不同值**（旧站 1.3，新档 1.4），§3.13 有登记。
2. 布局家族：`--layout-medium`（668px，零消费方，从未进过 `tokens.json`）退役，由 `--layout-article`（780px，阅读栏）取代；`--layout-content` 由 860 改 1200（Stitch 容器）。

**深色覆盖方式（唯一写法）**

```css
:root { --color-bg-canvas: var(--palette-paper-50); /* … */ }
[data-theme="dark"] { --color-bg-canvas: var(--palette-ink-950); /* 只覆盖颜色 */ }
```

四条配套规则：

1. **只覆盖颜色**。`[data-theme="dark"]` 块里出现非 `--color-*` 键 = 违规（暗色不改间距/圆角/字号）。
2. **键集合必须相等**：`:root` 里每个 `--color-*`，dark 块里都要有同名覆盖（§3.12 门禁 2）。
3. **组件不知道主题存在**：组件 CSS 里出现 `[data-theme="dark"]` 或 `prefers-color-scheme` = 违规。主题切换只发生在 token 层。
4. **主题由 `data-theme` 驱动**（`html` 元素上），「跟随系统」是启动时的一次性解析，不是双层 CSS。

---

### 3.3 L0 Palette（原始色，只允许 `tokens.css` 使用）

**步长规则**：`step` 是「亮度序号」——数字越大越暗，**粒度 50**，未使用的步长不定义（不做全量 ramp）。粒度由 v1.0 的 25 改成 50，是因为 Stitch 实际给出的色数撑不起 25 档：硬凑只会产生「相邻两档差 0.3% 亮度」的假精度。规则本身（稀疏、不做全量 ramp、亮度单调）没变。

**两条色相**：`paper`（暖纸，色相 ≈35°）供 light 主题的全部中性；`ink`（冷墨，色相 ≈220°）供 dark 主题的全部中性。同一 step 号在两条梯子里表示**同一亮度位次**，不是同一个颜色——这是「白天暖纸 / 夜间冷墨」的刻意设计（§3.14 是这次裂分的存档）。硬塞进一条 `neutral` 会让「同一个 step 号在深浅下是不同色相」，那正是 palette 层不该有的歧义。

**值的来源**：43 个键 = **30 个 Stitch 基线原值** + **7 个为过 WCAG 门槛推导的值**（§3.14.2 逐个列原值与理由）+ **6 个 viz 分类色**（沿用旧站，Bangumi 的语义已经在用，没有换的理由）。

**第 3 列是从 `tokens.json` 反查的**：脚本遍历 52 个语义键的 light/dark 取值，看每个 palette 键被谁引用（`(l)` = light，`(d)` = dark）。写「**无消费方**」的 4 个键是 Stitch 原值但当前没有任何语义键引用（`paper-300` 是 hairline 原值，`ink-700/900/975` 是深色中间调备用），保留它们是为了 M2 重调中间调时不必回基线里翻 hex——**不是遗漏**。

#### 3.3.1 paper（暖纸：light 主题的全部中性，11 档）

| step | 值 | 被哪些语义键消费（light / dark） |
|---|---|---|
| 0 | `#ffffff` | accent-subtle(l)、bg-raised(l)、bg-surface(l)、fg-on-accent(l) |
| 50 | `#fdf9f2` | bg-canvas(l)、bg-selected(l)、fg-inverse(l)、status-danger-bg(l)、status-danger-border(l)、status-success-bg(l)、status-success-border(l)、status-warning-bg(l)、status-warning-border(l) |
| 100 | `#f7f3ec` | bg-hover(l)、bg-sunken(l)、status-info-bg(l) |
| 150 | `#f2ede4` | bg-muted(l) |
| 200 | `#ebe4d8` | border-subtle(l) |
| 300 | `#ded3c1` | **无消费方** |
| 400 | `#a39c91` | fg-disabled(l) |
| 450 | `#998f7e` | border-default(l)、status-info-border(l) |
| 600 | `#866b66` | border-strong(l)、fg-muted(l)、fg-subtle(l)、status-info-solid(l) |
| 800 | `#58413c` | fg-code(l)、fg-default(l)、status-info-fg(l) |
| 950 | `#1c1c18` | bg-inverse(l)、fg-heading(l) |

#### 3.3.2 ink（冷墨：dark 主题的全部中性，15 档）

| step | 值 | 被哪些语义键消费（light / dark） |
|---|---|---|
| 0 | `#f0ede6` | bg-inverse(d)、fg-heading(d) |
| 100 | `#c8c3b8` | fg-code(d)、fg-default(d)、status-info-fg(d) |
| 200 | `#a39d91` | fg-subtle(d) |
| 300 | `#8c867a` | border-strong(d)、fg-muted(d)、status-info-solid(d) |
| 450 | `#616876` | border-default(d)、status-info-border(d) |
| 500 | `#5f5a50` | fg-disabled(d) |
| 700 | `#3d4350` | **无消费方** |
| 775 | `#2a2e38` | border-subtle(d) |
| 800 | `#262932` | bg-raised(d) |
| 825 | `#22252c` | accent-subtle(d)、bg-hover(d)、bg-sunken(d)、status-info-bg(d) |
| 840 | `#20232b` | bg-muted(d) |
| 875 | `#1a1c22` | bg-surface(d) |
| 900 | `#15181e` | **无消费方** |
| 950 | `#121316` | bg-canvas(d)、bg-selected(d)、fg-inverse(d)、fg-on-accent(d)、status-danger-bg(d)、status-danger-border(d)、status-success-bg(d)、status-success-border(d)、status-warning-bg(d)、status-warning-border(d) |
| 975 | `#0d0e11` | **无消费方** |

#### 3.3.3 accent（赤陶：品牌强调，深浅共用一条 ramp，5 档）

| step | 值 | 被哪些语义键消费（light / dark） |
|---|---|---|
| 300 | `#f0745b` | accent-solid-hover(d)、fg-code-accent(d)、fg-link-hover(d)、status-danger-fg(d) |
| 400 | `#e05d43` | accent-solid(d)、accent-subtle(d)、bg-selected(d)、border-accent(d)、fg-link(d)、ring-focus(d)、status-danger-bg(d)、status-danger-border(d)、status-danger-solid(d) |
| 500 | `#a6331b` | accent-solid(l)、accent-subtle(l)、bg-selected(l)、border-accent(l)、ring-focus(l)、status-danger-bg(l)、status-danger-border(l)、status-danger-solid(l) |
| 600 | `#8e2a17` | accent-solid-hover(l)、fg-link(l) |
| 700 | `#77230f` | fg-code-accent(l)、fg-link-hover(l)、status-danger-fg(l) |

> **danger 不新增色相（「不引入第二个红」）**：错误色复用朱红（旧 DS 的既定决定），所以本章没有 danger 梯子——`--color-status-danger-*` 全部指向 `accent-*`（浅色 solid/fg 用 500/700，深色用 400/300）。这条同时约束了「不要为了告警再引入一个红色」。
>
> **info 不设第四色相**：`--color-status-info-*` 指向 `paper` / `ink` 中性（浅色 solid=600 / fg=800 / bg=100 / border=450；深色 solid=300 / fg=100 / bg=825 / border=450）。理由：本系统的 a11y 规则本来就不允许「只靠颜色表达状态」（§6.1 N4），info 靠图标 + 文案区分即可；多一个色相会把编辑风推向仪表盘（§1.3）。

#### 3.3.4 success（状态：成功，3 档）

| step | 值 | 被哪些语义键消费（light / dark） |
|---|---|---|
| 300 | `#4caf50` | status-success-bg(d)、status-success-border(d)、status-success-fg(d)、status-success-solid(d) |
| 500 | `#2e7d32` | status-success-bg(l)、status-success-border(l)、status-success-solid(l) |
| 700 | `#27762b` | status-success-fg(l) |

#### 3.3.5 warning（状态：警告，3 档）

| step | 值 | 被哪些语义键消费（light / dark） |
|---|---|---|
| 500 | `#ed6c02` | **无消费方** |
| 550 | `#ea6a00` | status-warning-bg(d)、status-warning-bg(l)、status-warning-border(d)、status-warning-border(l)、status-warning-fg(d)、status-warning-solid(d)、status-warning-solid(l) |
| 700 | `#bd4000` | status-warning-fg(l) |

#### 3.3.6 viz（数据可视化分类色，不随主题变，6 档）

| step | 值 | 被哪些语义键消费（light / dark） |
|---|---|---|
| wish | `#ec4899` | viz-wish(d)、viz-wish(l) |
| watched | `#22c55e` | viz-watched(d)、viz-watched(l) |
| watching | `#f97316` | viz-watching(d)、viz-watching(l) |
| on-hold | `#eab308` | viz-on-hold(d)、viz-on-hold(l) |
| dropped | `#ef4444` | viz-dropped(d)、viz-dropped(l) |
| unknown | `#6b7280` | viz-unknown(d)、viz-unknown(l) |

**两条硬规则**

1. `--palette-*` 只允许出现在 `tokens.css`（§3.12.3 G-T4）。组件、页面、其它样式表里出现即违规（§6.1）。
2. **亮度单调**：每个色相按 step 升序，相对亮度严格递减（附录 C 的脚本跑这条）。新增步长不许破坏单调性——它是「step = 亮度序号」这句话的唯一证据。

> **v1.0 的「零漂移承诺」已失效**：v1.0 的 19 个中性值全部来自旧站、迁移不产生色差；v1.1 换成 Stitch 基线后**整站视觉都会变**（暖纸更暖、深色更冷、朱红更亮）。这不是顺手换皮，是 PO 指定的视觉基线（§3.14 开头），代价是 M1-4 的视觉基线要重出。

---

### 3.4 L1 Semantic Color 表（组件唯一可用颜色）

下表 52 个键 = `tokens.json` 的 `semantic.light` / `semantic.dark` 全部条目（**bg 10 + overlay 1 + fg 11 + border 4 + accent/ring 4 + status 16 + viz 6**）。**表外无名**。

取值列写的是**真实引用**，不是色板编号：

- `paper-600` 即 `var(--palette-paper-600)`；
- `color-mix(accent-500 8%, paper-50)` 即 `color-mix(in oklab, var(--palette-accent-500) 8%, var(--palette-paper-50))`；
- `rgba(...)` / `#rrggbbaa` 是 token 里**仅有的字面量**（三个带 alpha 的叠层：`bg-surface-translucent` / `overlay-hover` / `bg-scrim`）。palette 不收 alpha（§3.12 结构约束 2），所以它们只能是字面量。

**键名与用途两列是契约**（G-T3 按行首键名解析）；取值列的真源是 `tokens.json`——改值先改 JSON，再回填本表（§8.2 的③）。

#### 3.4.1 背景与叠层（bg 10 + overlay 1 = 11）

| token | light | dark | 用途 |
|---|---|---|---|
| `--color-bg-canvas` | `paper-50` | `ink-950` | 页面底色 |
| `--color-bg-surface` | `paper-0` | `ink-875` | 卡片 / 内容盒 |
| `--color-bg-surface-translucent` | `#fdf9f2ee` | `#1a1c22ee` | 覆盖在图片上的表面（唯一带 alpha 的实色） |
| `--color-bg-raised` | `paper-0` | `ink-800` | 浮层：下拉、弹窗、toast |
| `--color-bg-sunken` | `paper-100` | `ink-825` | 代码块、表头、内联码片 |
| `--color-bg-muted` | `paper-150` | `ink-840` | 分区底纹、次级容器 |
| `--color-bg-hover` | `paper-100` | `ink-825` | **实底** hover（卡片、导航项） |
| `--color-overlay-hover` | `rgba(28, 28, 24, 0.04)` | `rgba(240, 237, 230, 0.04)` | **叠层** hover（图片卡、列表行、任意底） |
| `--color-bg-selected` | `color-mix(accent-500 8%, paper-50)` | `color-mix(accent-400 12%, ink-950)` | 选中行 / 选中 tag / `::selection` |
| `--color-bg-inverse` | `paper-950` | `ink-0` | 反色表面（tooltip） |
| `--color-bg-scrim` | `rgba(18, 19, 22, 0.55)` | `rgba(0, 0, 0, 0.65)` | 模态遮罩 |

> `--color-bg-hover` 在 light 与 `bg-sunken` 同值（`paper-100`）、dark 与 `bg-sunken` 同值（`ink-825`）：Stitch 没有独立的 hover 表面，hover 由 `border` + `shadow` 表达（§3.8 Border Ground Rule）。键保留给导航项 / 列表行用。
>
> `--color-overlay-hover` 是**叠层**：alpha 让它在 `paper-0` 卡片和 `paper-50` 画布上都能用，所以它不属于 `bg-`（见 §3.2 的 target 说明）。

#### 3.4.2 前景（fg，11）

| token | light | dark | 用途 |
|---|---|---|---|
| `--color-fg-default` | `paper-800` | `ink-100` | 正文 |
| `--color-fg-heading` | `paper-950` | `ink-0` | 标题 |
| `--color-fg-muted` | `paper-600` | `ink-300` | 次级文本：日期、meta、说明 |
| `--color-fg-subtle` | `paper-600` | `ink-200` | 三级文本：placeholder、脚注 |
| `--color-fg-disabled` | `paper-400` | `ink-500` | 禁用态（对比度豁免，见附录 B） |
| `--color-fg-inverse` | `paper-50` | `ink-950` | 反色表面上的文字 |
| `--color-fg-on-accent` | `paper-0` | `ink-950` | 朱红色块上的文字 |
| `--color-fg-link` | `accent-600` | `accent-400` | 链接、可点文本 |
| `--color-fg-link-hover` | `accent-700` | `accent-300` | 链接 hover / secondary 按钮悬停文字 |
| `--color-fg-code` | `paper-800` | `ink-100` | 内联码与代码块正文 |
| `--color-fg-code-accent` | `accent-700` | `accent-300` | 代码强调（变量名、行号高亮） |

> `--color-fg-subtle` 在 light 下与 `--color-fg-muted` **同值**（`paper-600`）。原因：暖纸阶在 4.5 门槛下只容得下三级正文（heading 16.29 / default 8.95 / muted 4.64），第四级没有亮度空间——Stitch 的第三级 `paper-400`（2.59）不能当文本。键保留是为了 M2 重调中间调后能单独拆级（改一个值 = patch）。dark 下两级可分（6.89 / 5.14）。

#### 3.4.3 边框（border，4）

| token | light | dark | 用途 |
|---|---|---|---|
| `--color-border-subtle` | `paper-200` | `ink-775` | 装饰性 1px（卡片、分隔线）——**不承担 3:1 门槛** |
| `--color-border-default` | `paper-450` | `ink-450` | **UI 控件边界**（输入框、复选框、按钮描边）——≥3:1 |
| `--color-border-strong` | `paper-600` | `ink-300` | 控件 hover / 已聚焦边界 |
| `--color-border-accent` | `accent-500` | `accent-400` | 强调描边（secondary 按钮、选中卡） |

> `border-subtle` 是**装饰性** 1px（Stitch 的 hairline 原值），不承担 3:1；承担「识别控件」的是 `border-default`（3.04 / 3.32，§3.4.7）。两者分工写在这里，避免以后拿 `border-subtle` 的 1.20 当漏测报。

#### 3.4.4 强调色块 / 焦点环（4）

| token | light | dark | 用途 |
|---|---|---|---|
| `--color-accent-solid` | `accent-500` | `accent-400` | 主按钮底色、徽标底 |
| `--color-accent-solid-hover` | `accent-600` | `accent-300` | 主按钮 hover/active |
| `--color-accent-subtle` | `color-mix(accent-500 8%, paper-0)` | `color-mix(accent-400 15%, ink-825)` | 轻强调底（tag 选中、提示条底） |
| `--color-ring-focus` | `accent-500` | `accent-400` | `outline: 2px solid` + `outline-offset: 2px` |

> `accent-subtle` 的百分比深浅不同（light 8% / dark 15%）：深色底更暗，同样的百分比会混出看不见的色块。这是 `tokens.json` 里的实际取值，不是笔误。

#### 3.4.5 状态（status，16 = 4 组 × 4）

| token | light | dark |
|---|---|---|
| `--color-status-success-solid` | `success-500` | `success-300` |
| `--color-status-success-fg` | `success-700` | `success-300` |
| `--color-status-success-bg` | `color-mix(success-500 12%, paper-50)` | `color-mix(success-300 14%, ink-950)` |
| `--color-status-success-border` | `color-mix(success-500 45%, paper-50)` | `color-mix(success-300 45%, ink-950)` |
| `--color-status-warning-solid` | `warning-550` | `warning-550` |
| `--color-status-warning-fg` | `warning-700` | `warning-550` |
| `--color-status-warning-bg` | `color-mix(warning-550 12%, paper-50)` | `color-mix(warning-550 14%, ink-950)` |
| `--color-status-warning-border` | `color-mix(warning-550 45%, paper-50)` | `color-mix(warning-550 45%, ink-950)` |
| `--color-status-danger-solid` | `accent-500` | `accent-400` |
| `--color-status-danger-fg` | `accent-700` | `accent-300` |
| `--color-status-danger-bg` | `color-mix(accent-500 12%, paper-50)` | `color-mix(accent-400 14%, ink-950)` |
| `--color-status-danger-border` | `color-mix(accent-500 45%, paper-50)` | `color-mix(accent-400 45%, ink-950)` |
| `--color-status-info-solid` | `paper-600` | `ink-300` |
| `--color-status-info-fg` | `paper-800` | `ink-100` |
| `--color-status-info-bg` | `paper-100` | `ink-825` |
| `--color-status-info-border` | `paper-450` | `ink-450` |

`color-mix()` 的约束：**只允许引用 `--palette-*`**（不允许引用 `--color-*`）。这条保证语义层无循环依赖，`tokens.css` 的声明顺序不需要拓扑排序。

`danger` 复用 `accent` 色相（§3.3.3 的「不引入第二个红」）；`info` 不设第四色相，指向中性。两组都不新增 palette 键。

#### 3.4.6 数据可视化（viz，6）

| token | light | dark | 用途 |
|---|---|---|---|
| `--color-viz-wish` | `viz-wish` | `viz-wish` | 想看 |
| `--color-viz-watched` | `viz-watched` | `viz-watched` | 看过 |
| `--color-viz-watching` | `viz-watching` | `viz-watching` | 在看 |
| `--color-viz-on-hold` | `viz-on-hold` | `viz-on-hold` | 搁置 |
| `--color-viz-dropped` | `viz-dropped` | `viz-dropped` | 抛弃 |
| `--color-viz-unknown` | `viz-unknown` | `viz-unknown` | 未知 |

深浅色同值（分类色不随主题变），全部指向 §3.3.6；**只用于图表/状态点，不用于 UI 语义**。

---

#### 3.4.7 对比度证据（真跑，不是估算）

下表的每一行都由**附录 C 的脚本解析 `tokens.json` 后实算**：WCAG 2.x 相对亮度，`color-mix(in oklab)` 按 oklab 真插值（不是 sRGB 近似）。25 个场景里没有「以 alpha 值为底」的组合（三个叠层 token 不参与门槛），前景若带 alpha 会先合成到底色上。25 个场景 **0 FAIL**。**任一行 FAIL 就是 token 错，不是文档错。**

| 场景 | light | dark | 门槛 | 判定 |
|---|---|---|---|---|
| fg-default / bg-canvas | 8.95 | 10.57 | ≥4.5 | PASS |
| fg-default / bg-surface | 9.39 | 9.69 | ≥4.5 | PASS |
| fg-heading / bg-canvas | 16.29 | 15.89 | ≥4.5 | PASS |
| fg-muted / bg-canvas | 4.64 | 5.14 | ≥4.5 | PASS |
| fg-muted / bg-surface | 4.87 | 4.71 | ≥4.5 | PASS |
| fg-subtle / bg-canvas | 4.64 | 6.89 | ≥4.5 | PASS |
| fg-link / bg-canvas | 5.76 | 5.15 | ≥4.5 | PASS |
| fg-link / bg-surface | 6.04 | 4.72 | ≥4.5 | PASS |
| fg-code / bg-sunken | 8.49 | 8.73 | ≥4.5 | PASS |
| fg-code-accent / bg-sunken | 6.83 | 5.37 | ≥4.5 | PASS |
| fg-on-accent / accent-solid | 4.66 | 5.15 | ≥4.5 | PASS |
| fg-on-accent / accent-solid-hover | 6.04 | 6.51 | ≥4.5 | PASS |
| fg-default / bg-selected | 8.09 | 9.39 | ≥4.5 | PASS |
| fg-inverse / bg-inverse | 16.29 | 15.89 | ≥4.5 | PASS |
| ring-focus / bg-canvas | 4.44 | 5.15 | ≥3.0（非文本） | PASS |
| border-default / bg-canvas | 3.04 | 3.32 | ≥3.0（非文本） | PASS |
| border-default / bg-surface | 3.19 | 3.04 | ≥3.0（非文本） | PASS |
| border-strong / bg-canvas | 4.64 | 5.14 | ≥3.0（非文本） | PASS |
| status-success-fg / status-success-bg | 4.60 | 5.62 | ≥4.5 | PASS |
| status-warning-fg / status-warning-bg | 4.58 | 4.97 | ≥4.5 | PASS |
| status-danger-fg / status-danger-bg | 6.21 | 5.63 | ≥4.5 | PASS |
| status-info-fg / status-info-bg | 8.49 | 8.73 | ≥4.5 | PASS |
| status-success-solid / bg-canvas | 4.89 | 6.68 | ≥3.0（非文本） | PASS |
| status-warning-solid / bg-canvas | 3.05 | 5.80 | ≥3.0（非文本） | PASS |
| status-danger-solid / bg-canvas | 4.44 | 5.15 | ≥3.0（非文本） | PASS |

**豁免项（写清楚为什么豁免，避免以后被当成漏测）**

- `fg-disabled`：light **2.59** / dark **2.71** —— WCAG 明确豁免「inactive 控件」（SC 1.4.3）。
- `border-subtle`：light **1.20** / dark **1.37** —— 装饰性 1px，不承担「识别控件」的职责；承担该职责的是 `border-default`（3.04 / 3.32 PASS）。
- `border-subtle` 在 dark 下用 `ink-775`（比 light 的 `paper-200` 相对更亮），这是刻意的补偿：深色画布上 hairline 太暗等于不存在。

**三行值得记住的边界**：`border-default / bg-canvas` light **3.04**、`status-warning-solid / bg-canvas` light **3.05**、`fg-muted / bg-canvas` light **4.64**——它们都是「刚好过线」的推导值（§3.14.2 的 `paper-450` / `warning-550` / `paper-600`）。**动任何中间调，先看这三行。**

**本表没有「以 §3.14 为准」的兜底了**：v1.1 起本表与 `tokens.json` 同一套值，两者不一致即门禁失败（§3.12.3 G-T3 / §8.4 E3），不存在两套真源。

---

### 3.5 Typography

#### 3.5.1 字族（三族封顶）

```jsonc
"--font-sans":  "DM Sans, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, Source Han Sans SC, Noto Sans CJK SC, Sarasa Gothic SC, Microsoft YaHei, sans-serif, Apple Color Emoji, Segoe UI Emoji",
"--font-serif": "Newsreader, DM Serif Display, Georgia, \"Source Han Serif SC\", \"Noto Serif CJK SC\", serif",
"--font-mono":  "JetBrains Mono, IBM Plex Mono, Ubuntu Mono, Consolas, Liberation Mono, Menlo, monospace"
```

- 迁移映射：`--font-body` → `--font-sans`；`--font-heading` → `--font-serif`；`--font-mono` 不变。
- **v1.1 变更**：serif 栈首位加 `Newsreader`（Stitch 基线的主标题字），并去掉 `Playfair Display` / `Times New Roman` / emoji 段——`Newsreader` 缺席时由 `DM Serif Display` 兜底，中文由 `Source Han Serif SC` 兜底。**这是新增的一个字体下载项**，必须量 LCP/CLS（§10 未决 1）。sans 与 mono 栈未变。
- **字体选型仍是 M1 开放问题**（`16-m1-brief.md` §6.1：现有字体 vs 自托管 vs 系统栈）。本节冻结的是**字族角色与顺序**（serif 标题 / sans 正文 / mono 代码），栈内容可以变，但必须同时改 `tokens.json` 与本节。
- 禁止第四族（含 icon font）：图标一律 SVG（`src/components/Icons`）。

#### 3.5.2 字号阶梯（9 档，12→56；不是等比数列，相邻比 1.11–1.38）

| token | 值 | 用途 |
|---|---|---|
| `--text-xs` | 12px | 角标、图注、超小标签 |
| `--text-sm` | 14px | meta、按钮小号、表格、导航 |
| `--text-base` | 16px | 正文、输入框、按钮默认 |
| `--text-lg` | 18px | 卡片标题、引言 |
| `--text-xl` | 20px | H4 |
| `--text-2xl` | 24px | H3 |
| `--text-3xl` | 32px | H2 |
| `--text-4xl` | 44px | H1 |
| `--text-display` | 56px | 首页 hero（**定值**，不用 `clamp()`） |

迁移：`--text-body` → `--text-base`；`--base-font-size` → `--text-base`（两者同值，合并）；`--text-body-sm` → `--text-sm`。

**v1.1 的三处值变化**：`--text-3xl` 30→32、`--text-4xl` 36→44、`--text-display` 由 `clamp(2.5rem, 6vw, 4.5rem)` 改为定值 56px。前两个是 Stitch 阶梯带来的 +2 / +8（H2/H1 变大，视觉可见）；第三个去掉流体排版，理由与 §3.6 不提供流体间距相同——现有 3 档 hardcode 在视觉上已经稳定，换 fluid 要动 400+ 页却拿不到可验证收益。

#### 3.5.3 行高 / 字距 / 字重

| token | 值 | 用途 |
|---|---|---|
| `--leading-none` | 1 | 单行控件：按钮、tag、avatar 首字母、分页、面包屑 |
| `--leading-tight` | 1.25 | 标题（h1–h4） |
| `--leading-snug` | 1.4 | 小标题、Alert 标题、卡片标题（多行也不散） |
| `--leading-normal` | 1.65 | UI 文本、表格、代码（合并旧 `--leading-code`） |
| `--leading-relaxed` | 1.8 | 正文段落 |
| `--tracking-tight` | -0.02em | 32px 以上标题 |
| `--tracking-normal` | 0 | 正文 |
| `--tracking-wide` | 0.05em | 全大写标签（h5、eyebrow） |
| `--font-weight-regular` | 400 | 正文 |
| `--font-weight-medium` | 500 | 按钮、导航 |
| `--font-weight-semibold` | 600 | 标题 h2–h6 |
| `--font-weight-bold` | 700 | H1 |
| `--measure-prose` | 68ch | 正文最大行宽（P1 判据） |

**v1.1 的行高是整体改值**：旧 3 档（tight 1.3 / normal 1.5 / relaxed 1.75）→ 新 5 档（1 / 1.25 / 1.4 / 1.65 / 1.8）。`none` 与 `snug` 是新增键（§3.2），`tight/normal/relaxed` 三个旧名字全部换了数值——正文 1.75→1.8、代码 1.5→1.65 是可见变化，视觉基线必须重出。

#### 3.5.4 排版角色（token 的组合，组件照此取值）

| 角色 | 字族 | 字号 | 字重 | 行高 | 字距 |
|---|---|---|---|---|---|
| display（首页 hero） | serif | `--text-display` | 700 | tight | tight |
| h1 | serif | `--text-4xl` | 700 | tight | tight |
| h2 | serif | `--text-3xl` | 600 | tight | tight |
| h3 | serif | `--text-2xl` | 600 | tight | tight |
| h4 | serif | `--text-xl` | 600 | tight | tight |
| h5（eyebrow/小标题） | serif | `--text-lg` | 600 | tight | wide + 全大写 |
| h6 | sans | `--text-base` | 600 | tight | normal |
| body | sans | `--text-base` | 400 | relaxed | normal |
| body-sm | sans | `--text-sm` | 400 | relaxed | normal |
| meta / caption | sans | `--text-sm` | 400 | normal | normal |
| label（全大写） | sans | `--text-xs` | 600 | normal | wide |
| code（块/内联） | mono | `--text-sm` | 400 | normal | normal |

> 行高列写的是 §3.5.3 的 token 名（`tight` = 1.25、`normal` = 1.65、`relaxed` = 1.8）。**角色与 token 的对应关系 v1.1 没变，变的是 token 的数值**——上表不需要重排，但每个角色的实际行高都变了。
>
> 现状核对：`typography.css:30-40` 把 h1–h5 统一设为 serif、`--leading-snug`、`-0.02em`；迁移后应改为 `--leading-tight`（1.25）——旧站 `--leading-snug` 是 1.3，与新档 `snug`(1.4) 只是同名，不是同一个值（§3.13 有登记）。h6 不在该选择器内，故为 sans。

---

### 3.6 Space（4px 基准，值 = n × 4px）

| token | 值 | 典型用途 |
|---|---|---|
| `--space-1` | 4px | 图标与文字、chip 内边距 y |
| `--space-2` | 8px | 紧凑间距、badge 内边距 |
| `--space-3` | 12px | 按钮内边距 y、列表项内边距 |
| `--space-4` | 16px | 组件默认内边距 |
| `--space-5` | 20px | 卡片内边距（紧凑） |
| `--space-6` | 24px | 按钮内边距 x、卡片内边距 |
| `--space-7` | 28px | 区块内部间距 |
| `--space-8` | 32px | 区块间距（mobile） |
| `--space-9` | 36px | — |
| `--space-10` | 40px | 大区块间距 |
| `--space-11` | 44px | 指针目标最小尺寸 |
| `--space-12` | 48px | 区块间距（desktop） |
| `--space-14` | 56px | 内容盒内边距（= 旧 `--space`） |
| `--space-16` | 64px | 章节间距 |
| `--space-20` | 80px | 页面上下留白 |
| `--space-24` | 96px | 极端留白（C 层展示页） |

迁移：旧 `--space-2xs/xs/sm/md/lg/xl/2xl/3xl`（4/8/12/16/24/32/48/64）→ `space-1/2/3/4/6/8/12/16`；旧 `--space`(56px) → `space-14`。

**规则**：组件内的 padding/margin/gap **只能取上表值**（或 `0`）。`calc(var(--space-6) / 2)` 这类推导允许，但结果必须仍落在阶梯上（12px = `space-3`，直接写 `space-3`）。

**响应式**：v1.1 **不提供**流体间距 token。窄屏收紧间距靠组件内 `@media` 选更小的阶梯值（如 desktop `space-14` → mobile `space-8`），不靠 `clamp()`。原因：现有 3 档 hardcode（56/42/…) 已经在视觉上稳定，换成 fluid 会动 400+ 页但拿不到可验证收益。

### 3.7 Radius

| token | 值 | 用途 |
|---|---|---|
| `--radius-xs` | 4px | 内联码片、小标签、面包屑焦点环内沿（**下限**） |
| `--radius-sm` | 6px | 内容盒、输入框、次要按钮 |
| `--radius-md` | 8px | 按钮、卡片 |
| `--radius-lg` | 12px | 大卡片、图片容器 |
| `--radius-xl` | 16px | 弹窗/抽屉（内层）——Stitch 半径集的上限 |
| `--radius-2xl` | 28px | 下拉面板（Stitch 无此档，Header 在用，M2 再判是否并入 `xl`） |
| `--radius-pill` | 9999px | 胶囊（导航壳、chip、头像） |

迁移：旧 `--radius-sm`(2)→`xs`(4)；`--radius`/`--radius-md`(4)→`sm`(6)；`--radius-lg`(8)→`md`(8)；`--radius-xl`(12)→`lg`(12)；`--radius-full`→`pill`。

**v1.1 取消 2px 档**：Stitch 的最小圆角是 4px，`xs` 从 2 改 4、`sm` 从 4 改 6（`md/lg/xl` 值不变）。前两档是 **+2px 的可见变化**——旧站所有 2px 的码片/卡片角都会变圆一点，视觉基线要重出。

**规则**：`border-radius` 只能用上表值或 `0`。交互元素圆角下限 **4px**（v1.0 的 2px 档已取消），**永不出现直角交互元素**。

**已登记例外**（§6.2 X1）：`Header` 的导航壳 `46px`、导航项 `10px`。两者不在半径集内，登记为 Header 局部例外，M2 重构 Header 时消解；下拉的 `28px` 已并入 `2xl`，不再是例外。

### 3.8 Shadow（只做「层级」，不做「质感」）

| token | 值 | 用途 |
|---|---|---|
| `--shadow-1` | `0 1px 3px rgba(45, 42, 38, 0.03), 0 1px 2px rgba(45, 42, 38, 0.02)` | 静止卡片 / 内容盒（Stitch `subtle`） |
| `--shadow-2` | `0 1px 4px rgba(45, 42, 38, 0.04), 0 1px 2px rgba(45, 42, 38, 0.03)` | 导航壳静止（**插值推导**，Stitch 无此档） |
| `--shadow-3` | `0 4px 16px -2px rgba(45, 42, 38, 0.05), 0 2px 4px -1px rgba(45, 42, 38, 0.02)` | 卡片 hover、下拉静止（Stitch `card`） |
| `--shadow-4` | `0 8px 24px -4px rgba(45, 42, 38, 0.08), 0 4px 8px -2px rgba(45, 42, 38, 0.04)` | 弹层、抽屉（Stitch `hover`） |
| `--shadow-5` | `0 20px 48px -12px rgba(15, 12, 8, 0.25)` | 模态、toast（Stitch `modal`） |

迁移：旧 `xs/sm/md/lg/xl` → `1/2/3/4/5`（顺序对应，**值全部重写**）。

**为什么是 5 个键而 Stitch 只有 4 档**：Stitch 给的是 `subtle / card / hover / modal` 四档，本系统多一个 `--shadow-2` 给导航壳（静止但有抬升），由 1 与 3 之间插值。保留 5 个键是为了让「层级」连续可读，不是为了多一档质感。

阴影里的 `rgba(45, 42, 38, …)` 是 **primitive 的字面值**：§3.2 的字面值禁令只约束颜色 token（`background`/`color`/`border-color`），`box-shadow` 的完整值属于度量层。深色不覆盖阴影（§3.14.3 决定 3）。

**两条规则**

1. **Border Ground Rule（沿用）**：任何抬升表面 = 1px `--color-border-subtle` + 一级阴影。**有阴影无边界的表面不存在。** 边界负责「是纸」，阴影负责「在哪一层」。
2. **Dark Elevation Rule**：深色下阴影几乎不可见，层级靠 `border` + 表面亮度差表达；因此 dark 的 `bg-raised`(800) 与 `bg-muted`(840) 只差一档亮度，不视为错误。

### 3.9 Motion

| token | 值 | 用途 |
|---|---|---|
| `--duration-fast` | 150ms | hover / focus / 颜色过渡 |
| `--duration-base` | 240ms | 展开/收起、下拉 |
| `--duration-slow` | 350ms | 弹窗进出、位移 |
| `--duration-slower` | 500ms | **仅**主题切换（body 颜色过渡） |
| `--ease-standard` | `cubic-bezier(0.16, 1, 0.3, 1)` | 默认（快出慢停） |
| `--ease-emphasized` | `cubic-bezier(0.65, 0, 0.35, 1)` | 需要「强调」的进出 |
| `--ease-linear` | `linear` | 进度条、骨架屏 |

迁移：`--duration-normal` → `--duration-base`；`--ease-out` → `--ease-standard`；`--ease-in-out` → `--ease-emphasized`；旧 `--ease-in` 退休（无消费方）。

**v1.1 的三处值变化**：`base` 200→240ms、`slow` 300→350ms（Stitch 的 `normal` / `smooth`），`fast` 150 与 `slower` 500 不变。**没有跟 Stitch 走的**是它的 `--transition-*` 复合值：时长与缓动分开存，复合值会让「只改时长」变成改五个 token（§3.14.5）。

**硬规则**

1. **可动画属性白名单**：`opacity`、`transform`、`color`、`background-color`、`border-color`、`box-shadow`、`outline-color`。其它属性做过渡 = 违规（性能 + 意外重排）。
2. **不限时动画（infinite）只允许一种**：骨架屏 shimmer / loading spinner；其余一律禁用。
3. **`prefers-reduced-motion: reduce` 下**：`--duration-*` 归零由组件 `@media` 处理，且**禁止任何位移动画**（`transform: translate*`）。
4. **LCP 元素不许进入场动画**：D-0094（首页 `opacity:0` 起手把 LCP 拖到动画结束）与 D-0088（1600ms 开场遮罩）已经是两次教训。入场动画只允许「只位移不透明」，起点 opacity ≥0.55，且不写 `fill-mode`。
5. **CSS 滚动时间轴（`animation-timeline: scroll()`）禁用**：D-0089 实测压缩器会吃掉声明、且动画不活跃。用 20 行 JS（`reading-progress.ts` 的既有做法）。

### 3.10 Breakpoint

| token | 值 | 语义 | 现状出现次数（`src/`，含组件） |
|---|---|---|---|
| `--bp-xs` | 450px | 小屏手机（≤） | 12 |
| `--bp-sm` | 640px | 大屏手机（≤） | 6 |
| `--bp-md` | 768px | 平板竖屏（≤）：单列断点 | 24 |
| `--bp-lg` | 1024px | 平板横屏 / 小笔记本（≤） | 2 |
| `--bp-xl` | 1280px | 桌面（≤） | 1 |
| `--bp-2xl` | 1440px | 宽屏上限（≤） | 1 |

取值依据：以上 6 个数字是**生产 CSS 里实际存在且被反复使用的断点**（`grep @media src/`），不是重新发明的栅格。新增断点号 = 改契约。

**已知漂移（登记为 X5）**：`Footer.astro` 另有 `480px`、`360px` 两处一次性断点。它们不在契约内，M2 折进 `--bp-xs`。

**规则**

1. **`--bp-*` 不能用在 `@media` 里**（CSS 变量在媒体查询中不生效）。它有三个用途：文档、JS 读取（`getComputedStyle`）、以及 §3.12 的 `responsive` 覆盖键。
2. `@media` 里必须写字面 px，取值只能是上表 6 个之一。出现第 7 个数字 = 违规（§6.1 N7）。
3. **方向**：新代码用 modern range 语法 `@media (width < 768px)`；存量 `max-width` 不动（迁移时随文件一起改，不单独改）。**数字是契约，方向不是。**
4. 断点是**上限语义**（≤）：`md` 表示「到 768 为止是单列」。

### 3.11 zIndex（8 档，闭集）

| token | 值 | 谁在上面 |
|---|---|---|
| `--z-base` | 0 | 普通文档流 |
| `--z-raised` | 1 | 抬升的卡片 / sticky 局部元素 |
| `--z-dropdown` | 10 | 导航下拉、autocomplete |
| `--z-sticky` | 20 | 固定导航、返回顶部、TOC |
| `--z-overlay` | 30 | 遮罩、进度条 |
| `--z-modal` | 50 | `<dialog>` / 搜索弹窗 |
| `--z-toast` | 60 | 全局提示 |
| `--z-skip-link` | 1000 | 跳转链接（必须最高） |

**规则**：`z-index` 只能取上表整数值（或 `auto`）。新增层级 = 先改本节 + `tokens.json`，并写清「谁必须在谁上面」。

**现存字面量登记**（M1 不动，M2 收敛）：`9999`、`10000`、`1000`、`101`、`100`、`90`、`50`、`10`、`1`、`0`、`-1`。其中 `10000`(skip-link) → `--z-skip-link` 可直接替换；`100/101`(pagefind/toast 区) → `--z-toast`；`9999`(热力图 tooltip) 需单独判定归属（§10 未决 5）。

### 3.12 `tokens.json` 结构与生成物

#### 3.12.1 结构（键名 = CSS 变量名，不做二次翻译）

```jsonc
{
  "version": "1.1.0",              // 与 DESIGN.md 同版本号，见 §8.1
  "designDoc": "docs/DESIGN.md",   // 反向指针，构建时可校验版本一致
  "palette": {
    "paper":   { "0": "#ffffff", "50": "#fdf9f2", "450": "#998f7e" /* … 11 档 */ },
    "ink":     { "0": "#f0ede6", "875": "#1a1c22", "950": "#121316" /* … 15 档 */ },
    "accent":  { "300": "#f0745b", "500": "#a6331b", "700": "#77230f" },
    "success": { "300": "#4caf50", "500": "#2e7d32", "700": "#27762b" },
    "warning": { "500": "#ed6c02", "550": "#ea6a00", "700": "#bd4000" },
    "viz":     { "wish": "#ec4899" /* … 6 个分类色 */ }
  },
  "semantic": {
    "light": {
      "--color-bg-canvas": "var(--palette-paper-50)",
      "--color-bg-surface": "var(--palette-paper-0)",
      "--color-overlay-hover": "rgba(28, 28, 24, 0.04)",
      "--color-status-success-bg": "color-mix(in oklab, var(--palette-success-500) 12%, var(--palette-paper-50))"
      /* … §3.4 全部 52 个键 */
    },
    "dark": {
      "--color-bg-canvas": "var(--palette-ink-950)",
      "--color-bg-surface": "var(--palette-ink-875)"
      /* … 与 light 完全相同的键集合 */
    }
  },
  "primitive": {
    "--font-sans": "DM Sans, Inter, …",
    "--text-base": "16px",
    "--space-1": "4px",
    "--radius-md": "8px",
    "--shadow-3": "0 4px 16px -2px rgba(45, 42, 38, 0.05), 0 2px 4px -1px rgba(45, 42, 38, 0.02)",
    "--duration-fast": "150ms",
    "--ease-standard": "cubic-bezier(0.16, 1, 0.3, 1)",
    "--z-sticky": "20",
    "--bp-md": "768px",
    "--layout-content": "1200px",
    "--layout-article": "780px",
    "--measure-prose": "68ch"
    /* … §3.5–§3.11 全部键 */
  },
  "responsive": {
    "--layout-header-height": { "base": "64px", "max-md": "56px", "max-xs": "52px" }
  }
}
```

**结构约束（可当 schema 校验）**

1. `semantic.light` 与 `semantic.dark` 的 **key 集合必须完全相等**。
2. `palette` 的 key 是 `hue.step`，CSS 名 = `--palette-<hue>-<step>`。**不允许**在 palette 里定义非十六进制值（alpha 只出现在 semantic 的三个叠层字面量里）。
3. `primitive` 的 key 必须已经带 `--`（直接就是 CSS 变量名）。
4. `semantic` 的值只能是：`var(--palette-*)`、`color-mix(in oklab, var(--palette-*) <pct>%, var(--palette-*))`、或字面量颜色。**禁止引用其它 `--color-*`**。
5. `responsive` 的键只能是 §3.10 的 `max-<bp>` 或 `base`；v1.1 **只允许 `--layout-header-height` 一个 token** 使用它。
6. 每个 `semantic` 键都必须在 DESIGN.md §3.4 出现，反之亦然（双向查表）。
7. **`palette` 的色相集合是闭集**：`paper / ink / accent / success / warning / viz`。新增色相 = 改 §3.3 + 写决策记录（§8.6 第 1 条）。
8. **每个 palette 键都必须至少被一个 semantic 键引用**——v1.1 不满足（`paper-300`、`ink-700/900/975`、`warning-500` 无消费方，见 §3.3 的说明），所以这条是 **M2 前的告警级检查，不是 CI 红**。写进约束里是为了让「无消费方」是登记过的状态，而不是被当成漏项。

#### 3.12.2 生成物

```
src/styles/tokens/
├── tokens.json        # 唯一真源（上文结构）
├── build-tokens.mjs   # JSON → CSS，幂等
└── tokens.css         # 生成物，进 git，不手改
```

`tokens.css` 的输出顺序固定为：`:root{palette}` → `:root{primitive}` → `:root{semantic.light}` → `[data-theme="dark"]{semantic.dark}` → `@media` 块（responsive）。**顺序固定是为了让 git diff 可读**，也是「生成物一致性」校验能逐字节比对的前提。

#### 3.12.3 四道机器门禁（M1-2 交付，QA 在 M1-5 验收）

| # | 门禁 | 判据 | 失败即 |
|---|---|---|---|
| G-T1 | **生成物一致** | `node build-tokens.mjs --check` 重新生成的结果与 `tokens.css` 逐字节相同 | CI 红（`16` §3.2 明确要求） |
| G-T2 | **深浅键对齐** | `light`/`dark` 键集合差集为空 | CI 红 |
| G-T3 | **表—码一致** | §3.4 的 key 列表（从本文解析）与 `tokens.json` 的 semantic 键集合相等 | CI 红 |
| G-T4 | **无 palette 泄漏** | `src/components/**`、`src/pages/**`、`src/styles/*.css`（除 `tokens.css`）里 `--palette-` 出现 0 次 | CI 红 |

> G-T3 的实现建议：§3.4 的表格行首列就是键名，脚本用 `^\| \`--color-` 正则即可解析——**文档即契约**不是修辞，是真的能被 grep 的。v1.1 起 §3.4 的取值列与 `tokens.json` 同源（本卡就是按 JSON 重新生成的），所以「文档与 JSON 两套值」这个中间状态不再存在。

### 3.13 迁移映射（旧 token → 新 token）

一次性清单。`35` 个颜色类 token、`134` 个去重 token（实测：`src/` 232 个文件）。下表的「引用」= `var(--x)` 出现次数（跨文件累加），不是文件数。**分两批**：M1 只迁 12 个组件用到的部分；全站迁移在 M2 首个切片。

| 旧 | 新 | 引用数 | 备注 |
|---|---|---|---|
| `--color-text` | `--color-fg-default` | 61 | 值相同 |
| `--color-body` | `--color-fg-default` | 6 | 值相同 |
| `--color-text-muted` | `--color-fg-muted` | 45 | 值相同 |
| `--color-muted` | `--color-fg-muted` | 4 | 值相同 |
| `--color-text-dimmed` | `--color-fg-subtle` | 12 | 值相同 |
| `--color-text-secondary` | `--color-fg-muted` | 2 | `#78716c` → `#635d59`（略深，视觉无感） |
| `--color-title` / `--color-heading` / `--color-text-heading` | `--color-fg-heading` | 25/1/4 | 三者同值合并 |
| `--color-link` | `--color-fg-link` | 3 | 值相同 |
| `--color-bg` | `--color-bg-canvas` | 24 | 值相同 |
| `--color-surface` | `--color-bg-surface` | 5 | 值相同 |
| `--color-bg-surface` | `--color-bg-surface` | 34 | 已是语义名，保留 |
| `--color-surface-secondary` | `--color-bg-muted` | 13 | 值相同 |
| `--color-surface-hover` | `--color-bg-hover` | 7 | 值相同 |
| `--color-hover` | `--color-overlay-hover` | 17 | 值相同（alpha 叠层） |
| `--color-selection` | `--color-bg-selected` | 7 | 值相同 |
| `--color-surface-translucent` | `--color-bg-surface-translucent` | 2 | 值相同 |
| `--color-bg-elevated` | `--color-bg-raised` | 3 | 值相同 |
| `--color-code-bg` | `--color-bg-sunken` | 4 | 值相同 |
| `--color-code-fg` | `--color-fg-code` | 2 | 值相同 |
| `--color-code-accent` | `--color-fg-code-accent` | 1 | 值相同 |
| `--color-border` | `--color-border-subtle` | 78 | **按用途分流**：装饰 1px → subtle；控件边界 → default |
| `--color-accent` | `--color-accent-solid`（背景）/ `--color-fg-link`（文字） | 126 | **必须按属性分流**，见下方警告 |
| `--color-bg-accent` | `--color-accent-solid` | 1 | 配 `fg-on-accent` |
| `--color-text-invert` | `--color-fg-on-accent` | 1 | 仅 Sidebar 一处，配 accent 底 |
| `--color-success` / `--color-warning` / `--color-error` | `--color-status-{success\|warning\|danger}-solid` | 4/2/2 | 用作文字时改 `-fg`（否则浅色下 <4.5） |
| `--status-*`（6 个） | `--color-viz-*` | 6 | Bangumi 分类色 |
| `--font-body` / `--font-heading` | `--font-sans` / `--font-serif` | 24 | 值相同 |
| `--text-body` | — | **0** | 定义了但无人使用 → 直接退役 |
| `--base-font-size` | `--text-base` | 2 | 三者同值合并 |
| `--text-body-sm` | `--text-sm` | 4 | 同值 |
| `--leading-snug` / `--leading-code` | `--leading-tight` / `--leading-normal` | 6 / 1 | 旧 snug(1.3)→新 tight(1.25)；**新 `--leading-snug` 是另一个值(1.4)，别按同名直接迁** |
| `--space` | `--space-14` | 41 | 56px |
| `--space-2xs…3xl` | `--space-1/2/3/4/6/8/12/16` | 83 | 见 §3.6 |
| `--radius` / `--radius-md` | `--radius-sm` | 32 | 4px |
| `--radius-sm` | `--radius-xs` | 7 | 2px→**4px**（可见变化，§3.7） |
| `--radius-lg` / `--radius-xl` | `--radius-md` / `--radius-lg` | 17 | 8/12px |
| `--radius-full` | `--radius-pill` | 10 | 9999 |
| `--shadow-xs…xl` | `--shadow-1…5` | 29 | 顺序对应，**值全部重写**（§3.8） |
| `--duration-normal` | `--duration-base` | 31 | 200→**240ms**（§3.9） |
| `--ease-out` / `--ease-in-out` / `--ease-in` | `--ease-standard` / `--ease-emphasized` / 退休 | — | 前两者同值 |
| `--content-width` / `--content-width-max` / `--content-width-medium` | `--layout-content` / `--layout-wide` / `--layout-article` | 18 | 860→**1200** / 1440 / 668→**780**；medium 退役（零消费方） |
| `--z-base…`（tokens.css 既有 6 档） | `--z-*`（8 档） | 0 | 现状 z-index 全是字面量，见 §3.11 |

> ⚠️ **`--color-accent` 的 126 处引用不能盲替换**：它在 `color:` 位置应换 `--color-fg-link`，在 `background`/`border-color` 位置应换 `--color-accent-solid`。两者当前值相同，所以**分流不产生视觉变化**，但分流必须做——否则深色模式下「朱红底上的白字」和「朱红文字」会被同一个 token 绑死，将来无法分别调整。分流方式：`grep -n "var(--color-accent)" <file>` 后逐条看属性名，人工确认（脚本无法区分，这是已接受的成本）。

**退役（无消费方，不迁移）**：`--ease-in`、`--space`（改名）、`--space-2xs…3xl`（改名）、`--z-*` 旧 6 档（改名）。

---

### 3.14 Stitch 基线对齐（`tokens.json` 实值，2026-11-02）

PO 给了新的视觉基线（`_design/stitch-baseline/`：暖纸 / 冷墨 / 赤陶），并要求 palette 以它为准、**不再用 v1.0 的现站色值**。`src/styles/tokens/tokens.json` 已按此落地。

**历史记录（v1.0 → v1.1）**：本节是这次换基线的一次性存档，**不是真源**。§3.3–§3.12 已在 v1.1 按 `tokens.json` 重写，两处逐值一致；本节保留的是「为什么这么换」「哪些值是为达标推导的」，评审与 M2 复盘看这里，**取值一律看 §3.3–§3.12**。

**换的是值，不是键**：`semantic` 的 52 个键**一个没改名、一个没删**（所以 G-T3 表—码一致不受影响），变的是它们的取值来源与部分 primitive 的值。

#### 3.14.1 palette 的 neutral 裂成两条色相

Stitch 的浅色是暖纸（色相≈35°）、深色是冷墨（色相≈220°），这是刻意的昼夜两套纸，不是漂移。硬塞进一条 `neutral` 会让「同一个 step 号」在深浅下是不同色相——那正是 palette 层不该有的歧义。于是：

| hue | 谁在用 | step 范围 | 值域 |
|---|---|---|---|
| `paper` | light 主题的全部中性（bg/fg/border） | 0–950 | `#ffffff` → `#1c1c18`，11 档 |
| `ink` | dark 主题的全部中性（bg/fg/border） | 0–975 | `#f0ede6` → `#0d0e11`，15 档 |
| `accent` | 赤陶，深浅共用一条 ramp | 300–700 | `#f0745b` / `#e05d43` / `#a6331b` / `#8e2a17` + 推导档 |
| `success` / `warning` | 状态三色相之二（danger 复用 accent） | 300–700 | Stitch 原值 + 文字档 |
| `viz` | 六个分类色，不随主题变 | 名字即 step | 沿用 §3.3.6 |

`step` 仍是**亮度序号（越大越暗）**，粒度从 25 改成 **50**：Stitch 实际给出的色数撑不起 25 粒度，硬凑只会产生「相邻两档差 0.3% 亮度」的假精度。规则本身（稀疏、不做全量 ramp、亮度单调）没变，附录 C 的单调性脚本照跑。

#### 3.14.2 为达标推导的 7 个值（其余全部是 Stitch 原值）

Stitch 是一份**视觉**基线，它的 mid-tone 没有考虑 WCAG 门槛（它自己的手册里 `--text-muted` 标 4.9:1，实测在纸底上是 4.27，不达 AA）。凡是要当正文/控件用的值，按「沿 oklab L 轴最小改动到刚好达标」推导，其余一律原值：

| token | Stitch 原值 | 实值 | 为什么 |
|---|---|---|---|
| `paper-600` | `#8c716b` | `#866b66` | 浅色 `fg-muted`：纸底只有 **4.27**，压到 **4.64** |
| `paper-450` | `#ded3c1` | `#998f7e` | 浅色 `border-default`（控件边界）需 ≥3:1，原值 **1.41** |
| `ink-450` | `#3d4350` | `#616876` | 深色 `border-default` 需 ≥3:1，原值在 `#1a1c22` 上 **1.72** |
| `accent-700` | `#b03a22` | `#9e290f` | `fg-link-hover` / `fg-code-accent`：要和 link 肉眼可辨（≥**6.8**） |
| `warning-550` | `#ed6c02` | `#ea6a00` | 浅色 `status-warning-solid` 实心块需 ≥3:1，原值 **2.97**（差 0.03） |
| `success-700` | `#2e7d32` | `#27762b` | 浅色 `status-success-fg` 在 12% 状态底上只有 **4.17** |
| `warning-700` | `#ed6c02` | `#bd4000` | 浅色 `status-warning-fg` 在 12% 状态底上只有 **2.61** |

> `paper-600` 与 `#8c716b` 的差只有 ΔE≈2，肉眼几乎无感；但它是 `fg-muted` 的唯一来源，差 0.23 就是 AA 与不 AA 的差别。这就是「值可以微调、门槛不能挪」的具体样子。

#### 3.14.3 三个结构性决定

1. **`--color-fg-subtle` 在 light 下与 `--color-fg-muted` 同值（`paper-600`）**。暖纸阶在 4.5 门槛下只容得下三级正文（heading 16.29 / default 8.95 / muted 4.64），第三级已经贴着地板，没有第四级的亮度空间。Stitch 的第三级 `#a39c91` 只有 2.59，**不能当文本**。键保留，是为了 M2 重调中间调后能单独拆级（改一个值 = patch）。dark 下两级可分（6.89 / 5.14），所以 dark 用 `ink-200`。
2. **danger 复用 accent，Stitch 的 `#d32f2f` 不进 palette**。§3.3.3 的「不引入第二个红」优先于基线里的单个值；语义上 `--color-status-danger-*` 全部指 `accent-*`。
3. **深色不设 shadow 覆盖**。§3.12 的规则是「dark 块只覆盖颜色」，而 shadow 里带颜色；何况 §3.8 的 Dark Elevation Rule 已经说清「深色靠 border + 亮度差」。Stitch 的重映射（`rgba(0,0,0,.4)` 起）**故意不采纳**——shimmer 级别的黑在 `#121316` 上看不见，加了只是多一份没人维护的值。

#### 3.14.4 重算的对比度（52 键全量跑，抽样 20 行）

由 `tokens.json` 生成时用 oklab 真解析 `color-mix()` 算出（不是估算，也不是沿用手册数字）：

| 场景 | light | dark | 门槛 |
|---|---|---|---|
| fg-default / bg-canvas | 8.95 | 10.57 | ≥4.5 |
| fg-default / bg-surface | 9.39 | 9.69 | ≥4.5 |
| fg-heading / bg-canvas | 16.29 | 15.89 | ≥4.5 |
| fg-muted / bg-canvas | 4.64 | 5.14 | ≥4.5 |
| fg-muted / bg-surface | 4.87 | 4.71 | ≥4.5 |
| fg-subtle / bg-canvas | 4.64 | 6.89 | ≥4.5 |
| fg-link / bg-canvas | 5.76 | 5.15 | ≥4.5 |
| fg-code / bg-sunken | 8.49 | 8.73 | ≥4.5 |
| fg-code-accent / bg-sunken | 6.83 | 5.37 | ≥4.5 |
| **fg-on-accent / accent-solid** | **4.66** | **5.15** | ≥4.5 |
| fg-on-accent / accent-solid-hover | 6.04 | 6.51 | ≥4.5 |
| fg-inverse / bg-inverse | 16.29 | 15.89 | ≥4.5 |
| ring-focus / bg-canvas | 4.44 | 5.15 | ≥3.0 |
| border-default / bg-canvas | 3.04 | 3.32 | ≥3.0 |
| border-default / bg-surface | 3.19 | 3.04 | ≥3.0 |
| border-strong / bg-canvas | 4.64 | 5.14 | ≥3.0 |
| status-success fg / 状态底 | 4.60 | 5.62 | ≥4.5 |
| status-warning fg / 状态底 | 4.58 | 4.97 | ≥4.5 |
| status-danger fg / 状态底 | 6.21 | 5.63 | ≥4.5 |
| status-info fg / 状态底 | 8.49 | 8.73 | ≥4.5 |

> v1.1 订正：本表 `fg-muted / bg-surface` 的 light 一格原写 **4.76**，复跑实为 **4.87**（dark 4.71 无误），判定为 v1.0 笔误、不影响结论。§3.4.7 已是全量 25 行实算版，本表只作存档。

**`fg-on-accent` 是这次唯一改了 §3.4 单元格的值**：白字在深色赤陶 `#E05D43` 上只有 **3.61**（浅色 `#C84B31` 上 4.66，刚好过），所以深色下按钮文字改用 `#121316`（5.15）——朱红底 + 墨字，正好也是 Stitch 夜间「透焰陶」的意图。**这条同时说明：白字按钮在深色主题不成立，不是可选项。**

豁免不变：`fg-disabled`（light 2.59 / dark 2.71）、`border-subtle`（light 1.20 / dark 1.37，装饰性 1px）。**`border-subtle` 保持 Stitch hairline 原值**——卡片、分隔线的外观一个像素没动；承担「识别控件」的 `border-default` 才被推到 3:1。

#### 3.14.5 度量类改动（§3.5–§3.12 的值）

| 类别 | v1.0 文档值 | `tokens.json` 实值 | 说明 |
|---|---|---|---|
| 字号 | 12/14/16/18/20/24/**30/36** + `clamp(2.5rem,6vw,4.5rem)` | 12/14/16/18/20/24/**32/44/56** | Stitch 阶梯；`display` 由 clamp 改为定值 56px（流体排版见 §3.6 的同一理由：拿不到可验证收益） |
| 行高 | tight 1.3 / normal 1.5 / relaxed 1.75（3 档） | none 1 / tight 1.25 / snug 1.4 / normal 1.65 / relaxed 1.8（5 档） | Stitch 五档；`--leading-none`、`--leading-snug` 是**新增键**（minor） |
| 圆角 | xs 2 / sm 4 / md 8 / lg 12 / xl 16 / 2xl 28 / pill | xs **4** / sm **6** / md 8 / lg 12 / xl 16 / 2xl 28 / pill | Stitch 4/6/8/12/16；**2xl 28 保留**（Header 下拉在用，Stitch 半径集止于 16） |
| 阴影 | 5 档（Tailwind 味） | shadow-1 = Stitch `subtle`、**3 = `card`、4 = `hover`、5 = `modal`**，2 为导航壳推导 | Stitch 只有四档；`--shadow-2` 是插值推导（`0 1px 4px .04 + 0 1px 2px .03`） |
| 动效 | 150/200/300/500ms | **150/240/350**/500ms | Stitch `fast/normal/smooth` + 主题切换 500 |
| 布局 | content 860 / wide 1440 / medium 668 | content **1200** / **article 780** / wide 1440 / sidebar 280 / toc 220 | Stitch 1200 容器 + 780 阅读栏；`--layout-medium` 无消费方，由 `--layout-article` 取代 |
| 间距 / 断点 / zIndex | — | 不变 | 间距仍是 n×4px（Stitch 的 10 档是它的子集）；断点 6 值闭集、z 8 档照旧 |

**没跟着 Stitch 走的两处**，写清楚免得以后被当漏项：① Stitch 的组件级断点 `868px`/`960px` 不进 `--bp-*`（§3.10 的 6 值是契约，多一个数字就是第 7 个）；② Stitch 的 `--transition-*` 复合值不进 token（时长与缓动分开存，复合值让「只改时长」变成改五个 token）。

---

## 4. 组件层级

### 4.1 五层（四层组件 + 一层基础设施）

| 层 | 目标目录 | 职责 | 允许 import | 明确禁止 |
|---|---|---|---|---|
| **L0 token** | `src/styles/tokens/tokens.css` | 提供 palette / semantic / primitive | — | 任何组件逻辑；手改（生成物） |
| **L1 atom** | `src/components/UI/atom/` | 不可再分的视觉单元：一个原生元素或一段固定标记 | `tokens.css`、`Icons/*`、`~/types` | 其它组件、`~/config`、`~/data`、`~/content`、`layouts/` |
| **L2 molecule** | `src/components/UI/molecule/` | 组合 2+ atom 完成一个明确任务（如「面包屑」） | atom、`~/types`、`~/utils`（纯函数） | organism / page、数据源、浏览器持久化 |
| **L3 organism** | `src/components/UI/organism/` | 拥有行为或跨组件协作的区块（导航、搜索、评论、卡片列表） | atom + molecule + `~/utils` + `~/scripts` | page、`~/content`（数据由 props 注入） |
| **L4 page** | `src/pages/`、`src/layouts/` | 取数据、决定信息架构、组合任意层 | 全部 | 被任何 L1–L3 反向 import |
| **infra** | `src/components/BaseHead/` | 非视觉：meta / JSON-LD / CSP / 字体预载 | 配置 | 视觉组件（infra 不许渲染可见 UI） |

**目录说明**：v1.0 **不强制**物理重组（避免与 M1-3 撞车）。现阶段只要求：**每个组件在自己的文档里声明层级**；物理迁移在 M2 首个切片做，最终对齐 `13-package-boundaries.md` §5 的 `packages/ui`。

**目录大小写（M1-3 实测）**：实际目录是 `src/components/UI/`（大写），M1-3 的 10 atom + 2 molecule 落在 `UI/atom/` 与 `UI/molecule/`。**不要新建小写 `ui/`**：macOS 默认大小写不敏感会直接撞进现有 `UI/`，Linux CI 上则会出现两个目录。

### 4.2 依赖方向（四条禁令）

```
page ──▶ organism ──▶ molecule ──▶ atom ──▶ token
  │           │            │          │
  └───────────┴────────────┴──────────┴──▶ ✗ 反向 import 一律禁止
```

| # | 禁令 | 为什么 | 怎么查 |
|---|---|---|---|
| D1 | **禁止反向依赖**：atom 不许 import molecule/organism/page | 反向依赖会让 atom 无法独立测试与复用（`13` §1 判定四问的 Q3） | `grep -n "^import" <file>` 人工看 + 后续 lint |
| D2 | **禁止 import `layouts/`** | `13` §2 已抓到 `PostCard` → `PostLayout` 的反向依赖；布局是页面骨架，不是组件 | `grep -rn "layouts/" src/components/` |
| D3 | **禁止跨层相对路径** | `../../../scripts/x.js` 会随目录调整断裂；`13` §2 的 Search 就是这类问题 | `grep -rn "\.\./\.\./" src/components/` |
| D4 | **L1–L3 禁止 import 站点数据与配置**（`~/config`、`~/data`、`~/content`、`~/content.config`） | 这是「接口能稳定吗」的判据；`13` §3 的 🔧 行（Author / Notice / Watermark / WalineComment / Search / Heatmap）都是这一类 | `grep -rn "~/config\|~/data\|~/content" src/components/` |

### 4.3 浏览器状态的归属（细化 `13` §2）

`13` §2 的原始规则「原子/分子不拥有浏览器状态」是对的，但对「可移除 Tag」「可关闭 Alert」这类**局部交互原子**过于绝对。v1.0 的判定标准是**状态的影响半径**：

| 状态类型 | 允许的层 | 例子 |
|---|---|---|
| **局部、无持久化、不跨组件**（一次 `click` 改自己的 DOM/ARIA） | atom 允许（需在规格里写明） | 可移除 Tag、可关闭 Alert、`aria-expanded` 切换 |
| **局部但有副作用**（请求、`localStorage`、计时器） | ≥ organism | 评论加载、主题切换、搜索弹窗 |
| **跨组件 / 跨页**（路由、全局事件、共享单例） | organism（且必须走 `onPageReady` + 单例约定） | 导航换页、阅读进度、TOC 高亮 |
| **模块顶层副作用**（import 即执行） | **禁止**（任何层） | D-0090 浏览量计数、D-0073 顶层初始化 |

> 「import 即执行」这条是拿真实故障换来的：D-0090（SPA 换页后模块不重跑，计数永远 0）与 D-0073（内联脚本里 import 导致整段失效）都属于这一类。

### 4.4 现状归层（90 个 `.astro`，实测）

| 目录 | 数量 | 层级判定 | 备注 |
|---|---|---|---|
| `UI/` | 24 | atom / molecule 为主 | `Search`、`WalineComment`、`Heatmap`、`Hitokoto` 有行为 → organism；`Donate`、`FriendCard`、`ServiceCard`、`EssayItem` 绑定数据实体 → ⛔ 留主题（`13` §3） |
| `Article/` | 12 | molecule | `Toc` 有行为 → organism（tocbot 接管）；`PostCard` 已改 `PostCardShell`（`13` §2 修复记录） |
| `Layout/` | 11 | organism | `Header`/`Nav`/`Footer`/`Sidebar`/`BackToTop`/`ToggleTheme`/`LanguageSwitcher`；`SectionPage` 更像 page 模板 |
| `Pages/` | 12 | **page 级 organism（待消解）** | 组件名＝路由名（`HomeContent`/`BlogContent`/`TagsIndexContent`…）是分层味道：它们应该变成 `src/pages/` 的模板。M2 处理 |
| `Index/` | 7 | organism | 首页分区（`HeroMasthead`/`Posts`/`Popular`/`Photos`…） |
| `Content/` | 1 | molecule | `TableOfContents`，纯渲染（高亮由 `Article/Toc` 接管） |
| `Bangumi/` `Douban/` `Gallery/` | 5+1+2 | organism（数据绑定） | 属 C 层展示页，留主题（`13` §3） |
| `BaseHead/` | 14 | infra | 非视觉，不参与 design token 消费 |
| `Icons/` | 1 | atom | `DynamicIcon`，纯 SVG |

**归层四问**（新组件照此判定，不需要问我）：

1. 它访问站点数据/配置吗？→ 是：不是组件层（page 或 organism + props）。
2. 它有行为/生命周期吗？→ 是：至少 organism（除非落在 §4.3 的「局部」格）。
3. 它由两个以上本系统组件组成吗？→ 是：molecule 或以上。
4. 以上都否 → atom。

### 4.5 M1 的 12 个核心组件 + M8-6-0 的 3 个结构件（归属层）

`16-m1-brief.md` §3.3 叫它们「12 个核心 atom」。按 §4.4 的归层四问，其中 2 个实际是 molecule——**卡名不改，归层必须写对**，否则评审时「atom 里 import atom」会被判违规。

| # | 组件 | 实际层级 | 判定依据 |
|---|---|---|---|
| 1 | Button | atom | 只渲染 `<button>` + 可选图标 slot |
| 2 | Link | atom | 只渲染 `<a>` |
| 3 | Tag | atom | 局部可移除（§4.3 允许格） |
| 4 | Input | atom | 原生 label/input/hint/error 标记，不 import 组件 |
| 5 | Card | atom | 只有 slot |
| 6 | Icon | atom | 纯 SVG |
| 7 | Avatar | atom | `<img>` + 首字母回退 |
| 8 | Divider | atom | 单元素 |
| 9 | Breadcrumb | **molecule** | 组合多个 Link + 分隔符 |
| 10 | Pagination | **molecule** | 组合多个 Link |
| 11 | Alert | atom | 颜色/图标由 props 决定，不 import 组件 |
| 12 | Skeleton | atom | 单元素 + 动画 |
| 13 | PageHero | **molecule** | 组合 Icon + 结构元素（kicker / h1 / meta） |
| 14 | SectionHead | atom | 标题 + 可选 slot；不 import 组件（action 由页面传入） |
| 15 | DataState | **molecule** | 组合 Icon + Alert |

---

## 5. 组件规格模板

### 5.1 模板（复制这段，逐格填；空格 = 没写完）

```md
**组件：<ComponentName>**

- **层级**：atom / molecule / organism
- **状态**：草案 / 稳定 / 废弃　·　**Owner**：blog-fe　·　**规格版本**：1.0
- **用途**：一句话，说清它解决什么问题
- **何时不用**：列出应该改用别的组件的场景（比「用途」更能防误用）

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default / hover / active / focus-visible / disabled / loading / selected / invalid | | | |

**可访问性**

- role / 语义元素：
- 键盘：Tab / Enter / Space / Esc / 方向键
- ARIA：`aria-*` 清单 + 为什么
- 对比度：引用 §3.4.7 的具体行
- 焦点环：`--color-ring-focus` + 2px + offset 2px
- 指针目标：≥24×24（WCAG 2.5.8 AA）；主操作 ≥44×44
- reduced-motion：

**尺寸**

| size | 高度 | 内边距 x | 字号 | 圆角 |
|---|---|---|---|---|

**消费的 token（白名单，不得超出）**

`--color-…` / `--space-…` / `--radius-…` / `--text-…` / `--duration-…`

**禁止（本组件专属）**

- …

**依赖**

- import 白名单：`tokens`、`Icons/*`（atom）；额外允许：…
- 客户端 JS：0 字节 / 有（列出 gzip 体积与触发条件）

**视觉基线**

- 文件：`e2e/__screenshots__/design-atoms/<name>-{light,dark}-{390,768,1440}.png`
- 用例：全部 states × light/dark × 3 视口
```

### 5.2 示例：Button（规格，不含实现）

> 本节是「模板怎么填」的两列压缩示范。**可执行的完整规格在 §5.6.1**（props / slots / states 表、a11y 清单、token 白名单、尺寸表）；两处不一致时以 §5.6.1 为准。

| 项 | 内容 |
|---|---|
| 层级 | atom |
| 用途 | 触发一个动作（提交、跳转、展开）。**不是**导航（导航用 Link） |
| 何时不用 | 跳转到另一个 URL → Link；切换即时状态（如主题）→ 带 `aria-pressed` 的 Toggle 模式 Button；危险操作需二次确认 → Button + `dialog` |
| variant | `primary`（朱红实底）· `secondary`（描边）· `ghost`（无底无框）· `danger`（危险，需二次确认） |
| size | `sm` 32px · `md` 40px · `lg` 48px（高度）；内边距 x = `space-3` / `space-4` / `space-6` |
| states | default / hover / active / focus-visible / disabled / **loading** |
| loading | `aria-busy="true"` + 禁用重复提交 + 文案不变 + 12px spinner；**不改变宽度**（防抖动） |
| 焦点环 | `outline: 2px solid var(--color-ring-focus); outline-offset: 2px`（不用 `box-shadow` 造环——阴影会被 `overflow` 裁掉） |
| token | primary: `--color-accent-solid` / hover `--color-accent-solid-hover` / 文字 `--color-fg-on-accent`；secondary: 文字 `--color-fg-link`、描边 `--color-border-accent`、hover 底 `--color-accent-subtle`；ghost: 文字 `--color-fg-default`、hover 底 `--color-overlay-hover`；danger: 底 `--color-status-danger-solid`、文字 `--color-fg-on-accent` |
| 圆角 | `--radius-md`（8px） |
| 字体 | `--font-sans` / `--text-sm`(sm、md) / `--text-base`(lg) / `--font-weight-medium` |
| 动效 | `--duration-fast` + `--ease-standard`；只动 `background-color` / `box-shadow` / `color` |
| 禁止 | ① 大写化文案（`text-transform: uppercase`）② 图标裸放（icon-only 必须 `aria-label`）③ 居中式「两个按钮等宽并排」的营销 CTA ④ `loading` 时改变尺寸 |
| JS | 0 字节（loading 由父级传 `loading` prop 控制） |

### 5.3 15 个组件的状态覆盖矩阵（M1-3 的 12 个 + M8-6-0 的 3 个；M1-3 仍是验收依据）

| 组件 | default | hover | active | focus-visible | disabled | loading | selected | invalid | 其它 |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---|
| Button | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | variant ×4 × size ×3 |
| Link | ✓ | ✓ | — | ✓ | — | — | — | — | inline / nav / external |
| Tag | ✓ | ✓ | — | ✓ | — | — | ✓ | — | 可移除 / 静态 |
| Input | ✓ | ✓ | — | ✓ | ✓ | — | — | ✓ | readonly / hint / error |
| Card | ✓ | ✓ | — | ✓ | — | — | — | — | static / interactive |
| Icon | ✓ | — | — | — | — | — | — | — | 装饰 / 有语义 |
| Avatar | ✓ | — | — | — | — | — | — | — | 图片 / 首字母回退 |
| Divider | ✓ | — | — | — | — | — | — | — | horizontal / vertical |
| Breadcrumb | ✓ | ✓ | — | ✓ | — | — | — | — | 当前页（`aria-current`） |
| Pagination | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | prev/next disabled |
| Alert | ✓ | — | — | ✓ | — | — | — | — | 4 变体 + 可关闭（关闭按钮的 focus-visible） |
| Skeleton | ✓ | — | — | — | — | — | — | — | text / block / circle |
| PageHero | ✓ | — | — | — | — | — | — | — | 静态结构（kicker / lede / meta / divider） |
| SectionHead | ✓ | — | — | ✓ | — | — | — | — | action slot 内的控件自带状态 |
| DataState | ✓ | — | — | ✓ | — | — | — | — | empty / error 互斥（G-14），无 loading |

### 5.4 状态词汇表（全系统统一的 8 个词，不许自造）

| 状态 | 触发 | 颜色/视觉 | 必带 ARIA |
|---|---|---|---|
| default | — | 见组件规格 | — |
| hover | 指针悬停（`@media (hover: hover)` 内） | `--color-bg-hover` 或 `--color-overlay-hover`；文字可转 `--color-fg-link-hover` | 无 |
| active | 按下 | 与 hover 同色 + 1px 下沉（`transform: translateY(1px)`）；**不新增颜色 token** | 无 |
| focus-visible | 键盘聚焦 | 2px `--color-ring-focus` + offset 2px | 无（原生即可） |
| disabled | 不可用 | 文字 `--color-fg-disabled`，去掉阴影/指针事件 | `disabled` 或 `aria-disabled="true"` |
| loading | 异步进行 | 内容不变 + spinner + 宽度锁定 | `aria-busy="true"` |
| selected | 已选中/当前项 | `--color-bg-selected` + 文字 `--color-fg-default` | `aria-current` 或 `aria-pressed` / `aria-selected` |
| invalid | 校验失败 | 边框 `--color-status-danger-solid` + 文本 `--color-status-danger-fg` | `aria-invalid="true"` + `aria-describedby` 指向错误文案 |

**两条硬规矩**

1. **hover 只在 `@media (hover: hover)` 内生效**（触摸设备不要假 hover；现状 `src/` 有 85 处 `@media (hover: hover)` 块，已是既定写法）。
2. **状态不许只靠颜色**：每个状态必须有第二个通道（图标、下划线、边框、文案、`aria-*`）。

### 5.5 Props 命名约定（回应 `16` §6.4）

| 维度 | 只用这四个词 | 取值 | 反例 |
|---|---|---|---|
| 外观变体 | `variant` | 语义化（`primary`/`secondary`/`ghost`/`danger`） | `type="red"`、`color="blue"`、`kind` |
| 语义色调 | `tone` | `neutral`/`accent`/`success`/`warning`/`danger`/`info` | `status`、`level`、`severity` |
| 尺寸 | `size` | `sm`/`md`/`lg`（必要时 `xs`/`xl`） | `small`/`large`/`big` |
| 状态 | 原生属性优先 | `disabled`/`loading`/`selected`/`invalid` | `isDisabled`、`error`（作为视觉开关） |

规则：**`variant` 管形状/层级，`tone` 管颜色语义，`size` 管尺度，状态用原生语义属性**。一个组件最多同时拥有其中三个（不含状态）。

---


### 5.6 15 个核心组件的规格（M1-3 的 12 个 + M8-6-0 的 3 个结构件）

> **层级**：11 个 atom + 4 个 molecule（Breadcrumb、Pagination、PageHero、DataState，依据 §4.5 的四问）。卡名仍叫「12 个核心 atom」，**归层以本节每条的「层级」字段为准**——否则评审时「atom 里 import atom/molecule」会被判 D1 违规。
> **本节只写契约**：没有 `.astro` 片段、没有 CSS 规则、没有一个色值。凡在本节看到 hex/rgb 或 token 白名单以外的尺寸，按 §6.1 N1/N3 判违规。
> **取值一律查 `tokens.json`**：§3.5–§3.12 的值表正在 `t_15455edf` 同步到 Stitch 基线（§3.14.5），文档与 JSON 暂时并存两套值。**本节只写 token 名、不重复数值**，就是为了不制造第三套值。实现时 `--space-8` 是多少，查 JSON，不要查 §3.6 的旧表。
> **验收**：字段齐全性与机器门禁见 §5.6.16；对比度证据见 §5.6.16-B（`probe-atoms.py` 可复跑）。

#### 5.6.0 八条全局约定（每条组件都适用，后文不再重复）

| # | 约定 | 判据 / 检查方式 |
|---|---|---|
| G1 | **文案一律来自 props 或 slot**：组件内不出现自然语言字符串（站点 10 locale，§1.2）。默认值只能是空值或 `undefined`，不许写「上一页」「关闭」这类兜底 | `grep -nE '"[一-龥]' src/components/UI/atom src/components/UI/molecule` → 0（M1-3 完成后） |
| G2 | **颜色只取 `--color-*`**；`--palette-*` 与字面颜色一律违规 | §6.1 N1 / N2 |
| G3 | **尺寸只取 L2 度量 token**：高度、宽度、间距、圆角、字号同样走 `--space-*`（同一 4 的倍数阶梯），**不新增一套「组件尺寸」token**。字面量白名单只有四项：`0`、`1px`（hairline 边框/分隔线，§3.8）、`2px`（焦点环宽度，§5.4）、百分比或 `auto` | `grep -nE '[0-9]+(\.[0-9]+)?(px\|rem\|em)'` 只命中白名单 |
| G4 | **焦点环统一**：`outline: 2px solid var(--color-ring-focus); outline-offset: 2px`。**不用 `box-shadow` 造环**——阴影会被 `overflow` 裁掉（§5.2 已有此教训） | `grep -n "ring-focus"` 后人工看是否成对出现 `outline` |
| G5 | **hover 只在 `@media (hover: hover)` 内**；过渡属性与时长走 §3.9 白名单，`prefers-reduced-motion: reduce` 下位移为 0 | §5.4 硬规矩 1；N6 |
| G6 | **指针目标 ≥ `--space-6`（24×24）**，主操作 ≥ `--space-11`（44×44）。不够就用 padding 扩，**不许用伪元素把热区压到相邻元素上** | WCAG 2.5.8 AA；人工 |
| G7 | **每个状态必须有第二通道**（图标 / 下划线 / 边框 / 文案 / `aria-*`），不许只靠颜色 | N5 |
| G8 | **JS 默认 0 字节**；局部交互（可移除 Tag、可关闭 Alert）由父级持有状态，组件只渲染触发按钮，见 §4.3「局部」格 | §7 预算表「每个新组件的 JS」 |
| G9 | **样式机制（D-0100）**：Tailwind 已移除。组件样式只能写在 Astro scoped `<style>` 或 `src/styles/` 的模块化 CSS 里；`reset` / `base` / `typography` / `components` 四层保留、`global.css` 不再 import Tailwind。**禁止** utility class、`@apply`、`@theme`；对外暴露的 `class` 只用于布局定位 | `grep -rnE 'tailwind\|@apply\|@theme' src/components src/styles` → 0（§5.6.16-C 的 P8） |

**与现存组件的对应关系**（M1-3 落地时必须处理的破坏面；不改 `src/`，只登记）

| 本节规格 | 现存最接近的实现 | 差异（实现时要改的） |
|---|---|---|
| Button | `UI/Button.astro` 渲染 `<a href>` | **改 `<button>`**；现有 `href` 调用点迁移到 Link。现文件 hover 里有 `translateY(-2px)` + `box-shadow` 抬升，属 N10 |
| Link | 无（散落 `<a>` + `global.css` 的 a 规则） | 新增；`inline` 变体必须常驻下划线 |
| Tag | `UI/Badge.astro`（6 个 `variant`、3 个 `size`） | `variant` → `tone`（§5.5）；`note`/`tip` 合并为 `info`；`danger`/`success`/`warning` 三个与 status 同名 |
| Input | 无（`Search` 里是裸 `<input>` + 内联样式） | 新增；label/hint/error 的 id 关联由组件生成 |
| Card | `UI/Card.astro`（媒体卡，绑 `href`/`image`/`aspectRatio`） | 新 Card 只做容器（无 `href`/`image`）；媒体卡属 organism，留在 `PostCardShell` 一侧 |
| Icon | `Icons/DynamicIcon.astro` | 保留 name 机制；尺寸从内联 px 改为 `size` → `--space-*` |
| Avatar | `UI/Author.astro` 一侧 | 新增，首字母回退是构建期分支（无 JS） |
| Divider | 无（散落 `border-top`） | 新增；间距走 `--space-*`，不许在容器上写 `border` |
| Breadcrumb | 无 | 新增（molecule）：复用 Link + 有序列表 |
| Pagination | `UI/Pagination.astro`（`page` 对象 + 内联 px 宽高 + 内联 `<style>`） | props 拆成 `current`/`total`/`hrefTemplate`；尺寸改 `--space-*`；内联 `<style>` 里的 px 全部删 |
| Alert | `UI/Notice.astro`（`~/config` + `localStorage` + 218 行脚本） | Notice 是 organism（D4 违规）；Alert 只收 props、0 JS |
| Skeleton | 无 | 新增 |

---

#### 5.6.1 Button

- **层级**：atom　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：触发一个**当前页内**的动作（提交、确认、展开），动作的结果不由组件自己承担。
- **何时不用**：跳转到另一个 URL → Link；切换某个即时状态且不提交（如主题）→ Button + `aria-pressed`；危险且不可逆 → `variant="danger"` + 父级 `<dialog>` 二次确认；导航项 → Link（`variant="nav"`）。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `variant` | enum | `secondary` | `primary` / `secondary` / `ghost` / `danger` | 外形与层级。**默认不是 `primary`**：One Accent Rule 下「什么都不填就一片赤陶」是错的 |
| `size` | enum | `md` | `sm` / `md` / `lg` | 见「尺寸」 |
| `type` | enum | `button` | `button` / `submit` / `reset` | 原生；表单内提交必须显式传 `submit` |
| `disabled` | boolean | `false` | — | 用原生 `disabled`，不传 `aria-disabled` |
| `loading` | boolean | `false` | — | 由父级状态驱动，组件不自持 |
| `name` / `value` | string | — | — | 表单提交用；不进视觉 |
| `label` | string | — | — | **仅 icon-only 时必填**，成为 `aria-label`；有 default slot 时必须为空 |
| `class` | string | — | — | 只允许布局类（`class:list`）；视觉相关类名不接受 |

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| `default` | 是（icon-only 时否） | 按钮文案；icon-only 时改传 `label` |
| `icon-start` | 否 | 前置图标（`Icon`，装饰性，`aria-hidden` 由 Icon 负责） |
| `icon-end` | 否 | 后置图标（如外链箭头） |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | — | primary：底 `--color-accent-solid` + 字 `--color-fg-on-accent`；secondary：底透明 + 描边 `--color-border-accent` + 字 `--color-fg-link`；ghost：底透明无框 + 字 `--color-fg-default`；danger：底 `--color-status-danger-solid` + 字 `--color-fg-on-accent` | — |
| hover | `@media (hover: hover)` 指针悬停 | primary → 底 `--color-accent-solid-hover`；secondary → 底 `--color-accent-subtle`；ghost → 底 `--color-overlay-hover`；danger → 底 `--color-accent-solid-hover`（同色相，**不新增 danger-hover 键**） | 无 |
| active | 按下 | 同 hover 底色 + `translateY(1px)`（§5.4：不新增颜色 token） | 无 |
| focus-visible | 键盘聚焦 | G4 焦点环 | 无（原生即可） |
| disabled | `disabled` | primary/danger → 底 `--color-bg-muted` + 字 `--color-fg-disabled`；secondary/ghost → 字 `--color-fg-disabled` + 描边 `--color-border-subtle`；`cursor: not-allowed`；不响应 hover | `disabled` |
| loading | `loading=true` | 文案**不变** + 前置 spinner（Icon）+ 宽度锁定；底色按当前 variant | `aria-busy="true"` + 同时 `disabled` |

其它（**非状态词**，不进 §5.4 闭集）：icon-only（由 slot 组合推导，不设 prop）。

**可访问性**

- role / 语义元素：`<button type>`。**不使用** `<a>`、`<div role="button">`（现状 `UI/Button.astro` 是 `<a>`，M1-3 改）。
- 键盘：Enter / Space 由原生触发；不使用 Esc 与方向键；`loading` 期间不可重复触发（原生 `disabled` 已保证）。
- ARIA：`aria-busy`（loading）、`aria-label`（icon-only，来自 `label`）。**不加** `role="button"`（多余）、不加 `aria-disabled`（有原生 `disabled`）。
- 对比度（light / dark）：`fg-on-accent`/`accent-solid` **4.66 / 5.15**、hover **6.04 / 6.51**（§3.14.4）；secondary 字 `fg-link`/`bg-surface` **6.04 / 4.72**、描边 `border-accent`/`bg-surface` **4.66 / 4.72**（3:1 非文本，§5.6.16-B）；ghost `fg-default`/`bg-surface` **9.39 / 9.69**。disabled 2.33 / 2.29 属 1.4.3 豁免（不承载信息）。
- **深色底上的字必须是 `--color-fg-on-accent`**：白字在深色赤陶上是 3.61（§3.14.4），写 `white` 或任何字面白色都判违规（N1 之外再加一条：深色下的对比度回归）。
- 焦点环：G4；`outline-offset` 保证环与实底之间有缝（环对画布 4.44 / 5.15）。
- 指针目标：`sm` 32 ≥ 24（G6）；`md` 40；`lg` 48 ≥ 44（主操作用 `lg`）。
- reduced-motion：过渡时长归 0，取消 `translateY(1px)`，spinner 改为静态（§3.9 规则 3）。

**尺寸**

| size | 高度 | 内边距 x | 字号 | 圆角 |
|---|---|---|---|---|
| `sm` | `--space-8` | `--space-3` | `--text-sm` | `--radius-md` |
| `md` | `--space-10` | `--space-4` | `--text-sm` | `--radius-md` |
| `lg` | `--space-12` | `--space-6` | `--text-base` | `--radius-md` |

字族 `--font-sans`、字重 `--font-weight-medium`、行高 `--leading-none`、图标与文字间距 `--space-2`。

**消费的 token（白名单，不得超出）**

- 颜色：`--color-accent-solid` `--color-accent-solid-hover` `--color-accent-subtle` `--color-fg-on-accent` `--color-fg-link` `--color-border-accent` `--color-fg-default` `--color-overlay-hover` `--color-status-danger-solid` `--color-bg-muted` `--color-fg-disabled` `--color-border-subtle` `--color-ring-focus`
- 度量：`--space-2 / 3 / 4 / 6 / 8 / 10 / 12`、`--radius-md`、`--text-sm`、`--text-base`、`--font-sans`、`--font-weight-medium`、`--leading-none`、`--duration-fast`、`--ease-standard`
- 阴影：**无**（按钮不吃 shadow；hover 抬升属 N10）

**禁止（本组件专属）**

1. 用 `<a>` 实现按钮（跳转用 Link；现状已犯）。
2. icon-only 不传 `label`（N4）。
3. `loading` 时改变宽度或清空文案（抖动 + 读屏重读）。
4. `text-transform: uppercase`（中文无意义，英文破坏 body 风格）。
5. 两个按钮等宽并排的营销 CTA。
6. hover 里加 `box-shadow` 抬升或 `translateY(-2px)`（现状 `UI/Button.astro` 两处都有，M1-3 修）。
7. 新增 `*-solid-hover` 这类 hover 专用语义键（§3.4 是闭集，用 `--color-accent-solid-hover`）。

**依赖**：import 白名单 `tokens`、`Icons/DynamicIcon`（spinner 与可选图标）。**JS 0 字节**。

**视觉基线**：`e2e/__screenshots__/design-atoms/button-{light,dark}-{390,768,1440}.png`；用例 = `variant`×4 × `size`×3 × states（default/hover/active/focus-visible/disabled/loading）。

---

#### 5.6.2 Link

- **层级**：atom　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：导航到另一个 URL 或当前页锚点。它是**导航**，不承载动作。
- **何时不用**：触发动作 → Button；当前页不可达的项（禁用态）→ 渲染纯文本，Link **不提供 disabled**；整块卡片可点 → Card + 唯一标题链接。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `href` | string | — | 必填 | 空 `href` 或 `#` 占位 → 违规 |
| `variant` | enum | `inline` | `inline` / `nav` / `standalone` | 见 States |
| `external` | boolean | 由 `href` 推导 | — | 跨源时 `target="_blank"` + `rel="noopener noreferrer"`；显式传入可覆盖推导 |
| `current` | boolean | `false` | — | 当前页/当前语言 → `aria-current="page"` |
| `label` | string | — | — | 仅 icon-only 或可见文字不足时 |
| `class` | string | — | — | 只允许布局类 |

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| `default` | 是 | 链接文字 |
| `icon-end` | 否 | 后置图标（外链箭头、`standalone` 的「→」） |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | — | `inline`：字 `--color-fg-link` + **常驻下划线**；`nav`：字 `--color-fg-default`、无下划线；`standalone`：字 `--color-fg-link` + `icon-end` | — |
| hover | `@media (hover: hover)` | 字 `--color-fg-link-hover`；`nav` 另加底 `--color-overlay-hover`；`standalone` 的 icon 位移（`transform`，reduced-motion 下取消） | 无 |
| focus-visible | 键盘聚焦 | G4 焦点环 | 无（原生） |

其它（**非状态词**）：`current`（`aria-current="page"`）——`nav` 时底 `--color-bg-selected` + 字 `--color-fg-default`，`inline`/`standalone` 只把字改为 `--color-fg-default`（**不给正文链接加底**）；`:visited` 不做样式（见禁止 3）。§5.3 的 Link 行没有勾 `selected`，本节**不新增状态词**。

**可访问性**

- role / 语义元素：`<a href>`；**没有 `disabled` 属性**（§5.3 的 Link 行也没有）。
- 键盘：Tab / Enter 原生；焦点顺序跟随 DOM，不用 `tabindex` 正数。
- ARIA：`aria-current="page"`（当前项）；`aria-label` 仅在可见文字不足时；装饰图标 `aria-hidden="true"`。外链由浏览器/读屏判断，**不加英文 SR-only 文案**（10 locale 下会产生未翻译字符串，G1）。
- 对比度：`fg-link`/`bg-canvas` **5.76 / 5.15**（§3.14.4）；hover `fg-link-hover`（accent-700 / accent-300，同一色对见 §3.14.4 `fg-code-accent` 行 6.83 / 5.37）；`nav` 项 `fg-default`/`bg-canvas` **8.95 / 10.57**。
- **正文里的链接必须常驻下划线**（1.4.1 link-in-text-block）：只靠颜色区分 = N5 违规。
- 焦点环：G4。指针目标：`nav` 项整行 ≥ `--space-11`（44）；`inline` 链接按行高，不额外扩（扩了会串行）。
- reduced-motion：icon 位移取消。

**尺寸**

| variant | 高度 | 内边距 x | 字号 | 圆角 |
|---|---|---|---|---|
| `inline` | 行高决定（不设高度） | 0 | **继承**（不设字号） | 0 |
| `nav` | `--space-11` | `--space-3` | `--text-sm` | `--radius-sm` |
| `standalone` | `--space-10` | 0 | `--text-sm` | 0 |

**消费的 token（白名单）**

- 颜色：`--color-fg-link` `--color-fg-link-hover` `--color-fg-default` `--color-bg-selected` `--color-overlay-hover` `--color-ring-focus`
- 度量：`--space-3 / 10 / 11`、`--radius-sm`、`--text-sm`、`--font-sans`、`--duration-fast`、`--ease-standard`

**禁止（本组件专属）**

1. 用 Link 触发动作（提交、打开弹窗、切换状态）。
2. 给 Link 设固定字号/字重（正文里链接要跟随 h2/p 的排版角色；§3.5.4）。
3. 给 `:visited` 上色（泄露阅读历史，且 §5.4 闭集里没有这个状态）。
4. `<a>` 无 `href`、`href="#"`、`href="javascript:…"`。
5. 外链不给 `external` 标记就 `target="_blank"`（用户失去返回能力且没有提示）。
6. 用 `text-decoration: none` 去掉正文链接的下划线。

**依赖**：import 白名单 `tokens`、`Icons/DynamicIcon`（`icon-end`）。**JS 0 字节**。

**视觉基线**：`.../link-{light,dark}-{390,768,1440}.png`；用例 = `variant`×3 × states（default/hover/focus-visible/selected）× 正文内/导航内两种上下文。

---

#### 5.6.3 Tag

- **层级**：atom　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：给内容打一个短标记（分类、状态、筛选项）。**可移除**变体属 §4.3「局部、无持久化」允许格。
- **何时不用**：需要多行说明 → Alert；计数徽标 → 用 `tone="neutral"` 的静态 Tag；导航筛选项列表 → organism（Tag 只渲染单项）。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `tone` | enum | `neutral` | `neutral` / `accent` / `success` / `warning` / `danger` / `info` | 语义色调（§5.5）；`danger` 复用 accent 色相 |
| `size` | enum | `sm` | `sm` / `md` | 见「尺寸」 |
| `selected` | boolean | `false` | — | 已选中的筛选项 |
| `removable` | boolean | `false` | — | 渲染移除按钮（状态归父级，§4.3） |
| `href` | string | — | — | 传入即渲染 `<a>`（筛选项）；不传渲染 `<span>` |
| `removeLabel` | string | — | **`removable` 时必填** | 移除按钮的 `aria-label`（i18n 由页面注入） |
| `class` | string | — | — | 只允许布局类 |

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| `default` | 是 | 标签文字（短，≤ 12 个全角字符；超了应改用正文） |
| `icon-start` | 否 | 前置图标（如状态点），装饰性 |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | — | `neutral`：底 `--color-bg-muted` + 字 `--color-fg-default` + 描边 `--color-border-subtle`；`accent`：底 `--color-bg-surface` + 字 `--color-fg-link` + 描边 `--color-border-accent`；其余四档用 `--color-status-{success\|warning\|danger\|info}-{bg\|fg\|border}` | — |
| hover | 仅 `href` 或 `removable` 时，`@media (hover: hover)` | 叠一层 `--color-overlay-hover`，描边转 `--color-border-default`；**不改 tone 色** | 无 |
| focus-visible | 键盘聚焦（仅可交互 Tag） | G4 焦点环（环画在 Tag 外沿） | 无（原生） |
| selected | `selected=true` | 底 `--color-bg-selected` + 字 `--color-fg-default` + 描边 `--color-border-accent`（**边框是第二通道**，不只靠底色） | `aria-current="true"`（`<a>`）或 `aria-pressed="true"`（`<button>` 形态） |

其它（**非状态词**）：静态（无 `href`、无 `removable`）→ 不是可聚焦元素，无 hover/focus。

**可访问性**

- role / 语义元素：`<span>`（静态）/ `<a href>`（筛选项）/ 可移除时 `<span>` 内含 `<button>`。**HTML 不允许交互嵌套**：`href` + `removable` 同时存在时，移除按钮是 `<a>` 的**兄弟**，不是子元素。
- 键盘：只有可交互 Tag 进 Tab 序列；移除按钮单独一次 Tab（不合并）。
- ARIA：`aria-current` / `aria-pressed` 表达选中；移除按钮 `aria-label` 必须含标签文字（`{removeLabel}：{text}` 由页面拼，G1）。
- 对比度：`selected` `fg-default`/`bg-selected` **8.09 / 9.39**；`neutral` `fg-default`/`bg-muted` **8.05 / 8.94**；`accent` `fg-link`/`bg-surface` **6.04 / 4.72**；`info` **8.49 / 8.73**、`success` **4.60 / 5.62**、`warning` **4.58 / 4.97**、`danger` **6.21 / 5.63**（§3.14.4 + §5.6.16-B）。
- **`accent` 档不用 `--color-accent-subtle` 做底**：`fg-link` 在其上只有 **5.47 / 3.53**（深色不达标），所以 accent Tag 的底是 `--color-bg-surface`，强调靠描边。
- 指针目标：`sm` 24（`--space-6`）刚好达标；**移除按钮单独点按必须 ≥24**，`sm` 时用 padding 把热区补到 `--space-6`，不许压到相邻 Tag。
- reduced-motion：过渡归 0。

**尺寸**

| size | 高度 | 内边距 x | 字号 | 圆角 |
|---|---|---|---|---|
| `sm` | `--space-6` | `--space-2` | `--text-xs` | `--radius-pill` |
| `md` | `--space-8` | `--space-3` | `--text-sm` | `--radius-pill` |

字重 `--font-weight-medium`、行高 `--leading-none`、图标与文字间距 `--space-1`、移除按钮与文字间距 `--space-1`。

**消费的 token（白名单）**

- 颜色：`--color-bg-muted` `--color-bg-surface` `--color-bg-selected` `--color-fg-default` `--color-fg-link` `--color-border-subtle` `--color-border-default` `--color-border-accent` `--color-overlay-hover` `--color-ring-focus` `--color-status-{success|warning|danger|info}-{bg|fg|border}`
- 度量：`--space-1 / 2 / 3 / 6 / 8`、`--radius-pill`、`--text-xs`、`--text-sm`、`--font-weight-medium`、`--leading-none`、`--duration-fast`

**禁止（本组件专属）**

1. 用 Tag 承载多句文案或链接列表（它是标记，不是段落）。
2. 用 `--color-accent-subtle` 给 accent Tag 做底（深色 3.53，已实测）。
3. 自造第 7 种 `tone`（§5.5 的六值是闭集）。
4. 移除按钮只有图标、没有 `aria-label`（N4）。
5. 移除按钮自己 `remove()`（状态归父级，§4.3）。
6. `selected` 只改底色不加 `aria-*`（G7 / N5）。

**依赖**：import 白名单 `tokens`、`Icons/DynamicIcon`（关闭叉）。**JS 0 字节**（移除行为由父级绑事件/重渲染）。

**视觉基线**：`.../tag-{light,dark}-{390,768,1440}.png`；用例 = `tone`×6 × `size`×2 × states（default/hover/focus-visible/selected）× 静态/可移除。

---

#### 5.6.4 Input

- **层级**：atom　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：单行文本输入（搜索、订阅邮箱、评论昵称）。label / hint / 错误文案的 id 关联全部由组件生成。
- **何时不用**：多行 → `<textarea>`（M1 不做，用原生）；筛选器 → Tag 组；文件上传 → 原生 `<input type="file">` + Button。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `label` | string | — | **必填** | 可见 label 文本（G1：不由组件兜底） |
| `name` | string | — | 必填 | 表单字段名；`id` 与 hint/error 的 id 都从它派生 |
| `type` | enum | `text` | `text` / `email` / `url` / `search` / `password` / `number` | 闭集；其它类型用原生 |
| `size` | enum | `md` | `sm` / `md` / `lg` | 见「尺寸」 |
| `value` | string | — | — | 受控语义由父级决定 |
| `placeholder` | string | — | — | **不得替代 label**（见禁止 1） |
| `hint` | string | — | — | 辅助说明，`aria-describedby` 关联 |
| `error` | string | — | — | 非空即 `invalid`（单一真源，不设独立 `invalid` 开关） |
| `disabled` | boolean | `false` | — | 原生 |
| `readonly` | boolean | `false` | — | 原生（非状态词，见「其它」） |
| `required` | boolean | `false` | — | 原生 + 可见标记（见禁止 3） |
| `autocomplete` | string | — | 原生取值 | 邮箱/姓名类字段必须给 |
| `inputmode` | string | — | 原生取值 | `number` 类型要配 |
| `class` | string | — | — | 只允许布局类 |

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| `prefix` | 否 | 前置图标（如搜索放大镜），装饰性 |
| `suffix` | 否 | **只允许静态元素**（单位、快捷键提示）；清空按钮需要 JS，M1 不做 |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | — | 底 `--color-bg-surface`；描边 1px `--color-border-default`；字 `--color-fg-default`；placeholder `--color-fg-muted` | — |
| hover | `@media (hover: hover)` | 描边 `--color-border-strong` | 无 |
| focus-visible | 键盘聚焦 | 描边 `--color-border-accent` + G4 焦点环 | 无（原生） |
| disabled | `disabled` | 底 `--color-bg-muted` + 字 `--color-fg-disabled` + 描边 `--color-border-subtle`；`cursor: not-allowed` | `disabled` |
| invalid | `error` 非空 | 描边 `--color-status-danger-solid` + 错误文案 `--color-status-danger-fg` + 错误图标（第二通道） | `aria-invalid="true"` + `aria-describedby` 含错误 id |
| loading | — | **不适用**：输入框没有异步态；提交中的状态由提交按钮的 `loading` 表达 | — |

其它（**非状态词**）：`readonly` → 底 `--color-bg-sunken`，其余同 default，**不加状态词**（§5.4 闭集只有 8 个）。

**可访问性**

- role / 语义元素：`<input type>`；`<label for>` 必须存在且可见。
- 键盘：原生（Tab 进入、方向键移动光标）；不使用快捷键拦截。
- ARIA：`aria-describedby` 串 `hint` 与 `error` 的 id（顺序：hint → error）；`aria-invalid="true"`（仅 error）；`aria-required` 不需要（原生 `required` 已表达）。
- **错误文案的播报**：静态渲染时用文本 + `aria-describedby`；只有「用户操作后运行时插入」的文案才加 `role="alert"`（同 Alert 的 `live` 规则，见 §5.6.11）。
- 对比度：字 `fg-default`/`bg-surface` **9.39 / 9.69**；placeholder `fg-muted`/`bg-surface` **4.87 / 4.71**（§5.6.16-B；§3.14.4 该 light 格记 4.76，复跑为 4.87，判定笔误，见 §5.6.16-B 第 3 条）；描边 `border-default`/`bg-surface` **3.19 / 3.04**（3:1 非文本）；readonly 字 `fg-default`/`bg-sunken` **8.49 / 8.73**。
- 焦点环：G4；**禁止 `outline: none` 没有替代**。
- 指针目标：高度 ≥ `--space-8`（32）已满足 24；主操作 ≥44 由提交按钮承担（G6）。
- reduced-motion：过渡归 0。

**尺寸**

| size | 高度 | 内边距 x | 字号 | 圆角 |
|---|---|---|---|---|
| `sm` | `--space-8` | `--space-3` | `--text-sm` | `--radius-sm` |
| `md` | `--space-10` | `--space-4` | `--text-base` | `--radius-sm` |
| `lg` | `--space-12` | `--space-4` | `--text-base` | `--radius-sm` |

label 与 input 间距 `--space-2`；hint/error 与 input 间距 `--space-1`；label 字 `--text-sm` + `--font-weight-medium`。

**消费的 token（白名单）**

- 颜色：`--color-bg-surface` `--color-bg-muted` `--color-bg-sunken` `--color-fg-default` `--color-fg-muted` `--color-fg-disabled` `--color-border-default` `--color-border-strong` `--color-border-accent` `--color-border-subtle` `--color-status-danger-solid` `--color-status-danger-fg` `--color-ring-focus`
- 度量：`--space-1 / 2 / 3 / 4 / 8 / 10 / 12`、`--radius-sm`、`--text-sm`、`--text-base`、`--font-sans`、`--font-weight-medium`、`--leading-normal`、`--duration-fast`

**禁止（本组件专属）**

1. 用 `placeholder` 代替 label（读屏与自动填充都会失灵）。
2. `outline: none` 且没有等价的焦点可见方案。
3. `required` 只靠颜色或星号表达（必须有文案，G7）。
4. 自造清除按钮 / 密码可见切换（需要 JS，M1 的 0 字节预算内不做）。
5. 隐藏 label（`sr-only` 也算：表单密集场景可以，但 M1 的表单只有 1–2 个字段）。
6. 用 `invalid` 双开关：`error` 为空却设 `invalid=true` 这种第二个真源。

**依赖**：import 白名单 `tokens`、`Icons/DynamicIcon`（`prefix` 与错误图标）。**JS 0 字节**。

**视觉基线**：`.../input-{light,dark}-{390,768,1440}.png`；用例 = `size`×3 × states（default/hover/focus-visible/disabled/invalid）× 有/无 hint。

---

#### 5.6.5 Card

- **层级**：atom（§4.5：只有 slot，不 import 任何组件）　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：给一组相关内容一个**纸面边界**（标题 + 摘要 + 元信息），让「块」与「文」分开。
- **何时不用**：内容只有一行 → 列表项；需要整块跳转 → Card + 唯一标题 Link（**不是**整卡 `onclick`）；卡片要嵌套 → 拆层级（N10 禁止卡片套卡片）；媒体卡（封面图 + 标题）→ organism（`PostCardShell` 一侧），不进 atom。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `variant` | enum | `flat` | `flat` / `raised` / `interactive` | `flat` 无阴影；`raised` 加一级阴影；`interactive` 可 hover/focus-within |
| `padding` | enum | `md` | `none` / `md` / `lg` | 内边距档位 |
| `as` | enum | `article` | `article` / `div` / `li` / `section` | 语义容器；列表里的卡用 `li` |
| `labelledby` | string | — | 标题元素 id | 用于 `aria-labelledby`；`article` 时必填 |
| `class` | string | — | — | 只允许布局类 |

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| `media` | 否 | 封面/缩略图（由父级决定 `<img>` 还是占位） |
| `header` | 否 | eyebrow / 元信息行 |
| `default` | 是 | 标题 + 摘要 |
| `footer` | 否 | 标签、时间、操作 |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | — | 底 `--color-bg-surface` + 描边 1px `--color-border-subtle`；`flat` 无阴影，`raised` 加 `--shadow-1`（Border Ground Rule：有阴影必有描边，§3.8） | — |
| hover | 仅 `interactive`，`@media (hover: hover)` | 描边 `--color-border-default` + `--shadow-3`；`transform` 位移**不做**（N11 同类风险，且卡内文字会抖） | 无 |
| focus-visible | 仅 `interactive`：卡内链接获得焦点时由 `:focus-within` 触发 | G4 焦点环（画在卡片外沿，`static` 卡不加） | 无（焦点在子元素上，原生） |
| disabled | — | **不适用**：卡不是控件；不可点的卡就是 `flat` | — |

其它（**非状态词**）：`flat` / `raised` / `interactive` 是 variant，不是状态。

**可访问性**

- role / 语义元素：`<article aria-labelledby="…">`（或 `li`/`section`，由 `as` 决定）；**不用** `div[role="link"]`、不给整卡 `tabindex`。
- 键盘：卡本身不进 Tab 序列；只有卡内真实链接/按钮进。
- ARIA：`aria-labelledby` 指向标题（一屏 9–12 张卡时，读屏用户能听到「卡片名」而不只是「文章」）。
- **一个交互区只能有一个真链接**：`interactive` 卡内若有两个链接（标题 + 标签），hover 视觉仍作用于整卡，但**焦点环只跟真实焦点**，不用「stretched link」覆盖层（覆盖层会吃掉内层链接的点击）。
- 对比度：正文 `fg-default`/`bg-surface` **9.39 / 9.69**；meta `fg-muted`/`bg-surface` **4.87 / 4.71**；标题 `fg-heading`/`bg-surface` **17.09 / 14.57**；`raised`（深色下 `bg-raised` 更亮）正文 **9.39 / 8.27**（§5.6.16-B）。
- 焦点环：G4；`interactive` 卡用 `:focus-within` 让环出现在卡的外沿（不改变布局，用 `outline`）。
- 指针目标：卡内链接/按钮各自 ≥ `--space-6`（G6）；`media` 不是点击目标。
- reduced-motion：`interactive` 的 `box-shadow` 过渡归 0（阴影变化不是位移，可以保留瞬时切换）。

**尺寸**

| padding | 内边距（四边） | 槽间距 | 圆角 |
|---|---|---|---|
| `none` | 0 | `--space-2` | `--radius-lg` |
| `md` | `--space-6` | `--space-3` | `--radius-lg` |
| `lg` | `--space-8` | `--space-4` | `--radius-lg` |

`media` 与内容间距 0（`media` 贴边，圆角由上沿裁切）；标题 `--text-lg` + `--font-weight-semibold` + `--font-serif`（h3 角色，§3.5.4）；摘要 `--text-sm` + `--leading-relaxed`。

**消费的 token（白名单）**

- 颜色：`--color-bg-surface` `--color-border-subtle` `--color-border-default` `--color-fg-heading` `--color-fg-default` `--color-fg-muted` `--color-ring-focus`
- 度量：`--space-2 / 3 / 4 / 6 / 8`、`--radius-lg`、`--text-sm`、`--text-lg`、`--font-serif`、`--font-weight-semibold`、`--leading-relaxed`、`--shadow-1`、`--shadow-3`、`--duration-fast`
- **不吃** `--color-bg-raised`（Card 的底永远是 `bg-surface`；`raised` 只是加阴影，不改底）

**禁止（本组件专属）**

1. 卡片套卡片（N10）。
2. 每张卡都加阴影（§1.2：一眼分清三级信息，不靠投影堆）。
3. 整卡可点（`div` + `onclick` / `role="link"` / 伪元素覆盖层）——真正的链接只能有一个，且是卡内标题。
4. Card 里 import organism 或取数据（D4）。
5. 用 `border-left` 彩色条做分类色（N10）。
6. `flat` 卡加 `--shadow-*`（阴影 = 层级，没有层级需求就别用）。

**依赖**：import 白名单 `tokens`（**不 import 任何组件**，含 Icon）。**JS 0 字节**。

**视觉基线**：`.../card-{light,dark}-{390,768,1440}.png`；用例 = `variant`×3 × `padding`×3 × states（default/hover/focus-within）。

---

#### 5.6.6 Icon

- **层级**：atom　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：用 SVG 画一个**含义已被邻近文案表达**的图形，或（有 `label` 时）独立表达一个含义。
- **何时不用**：图标是唯一交互目标 → Button/Link 包住它（Icon 本身不可点）；需要多色/渐变图标 → 不做（§1.3）；品牌 logo → 用图片（有 `alt`）。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `name` | string | — | **必填**，`Icons/` 的闭集 | 图标名；不存在即构建失败（不做运行时兜底） |
| `size` | enum | `md` | `xs` / `sm` / `md` / `lg` | 见「尺寸」 |
| `label` | string | — | — | **传了就变有语义**（`role="img"`）；不传一律装饰性 |
| `class` | string | — | — | 只允许布局类 |

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| — | — | **无 slot**：图标是纯 SVG，不接受内容 |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | — | `fill`/`stroke` = `currentColor`；颜色由**父级**决定（Icon 不消费任何 `--color-*`） | `aria-hidden="true"` + `focusable="false"`（无 `label`）；`role="img"` + `aria-label`（有 `label`） |

其余 7 个状态**不适用**：Icon 不 hover、不聚焦、不 disabled（交互由父级承担）。

**可访问性**

- role / 语义元素：内联 `<svg>`；**不用**图标字体、不用 `<i class="icon-…">`（§3.5.1 第四族禁令）。
- 键盘：不参与（不是可聚焦元素）。
- ARIA：默认 `aria-hidden="true"` + `focusable="false"`；`label` 存在时 `role="img"` + `aria-label={label}`。**两者互斥**，不允许同时 `aria-hidden` 又有 `label`。
- 判定规则：**图标旁已有可见文字表达同一含义** → 装饰性；**图标独立表达状态**（如 Alert 的感叹号）→ 装饰性 + 文案必须另外说清（N5：状态不许只靠图形+颜色）。
- 对比度：**不适用**（非文本、颜色继承父级；父级的色对由父组件规格负责）。若图标是**唯一**的状态指示（不推荐），按非文本 3:1 判，并记入 §6.2 例外。
- 焦点环：不适用（不可聚焦）。
- 指针目标：**不适用**——Icon 不是目标；父级（Button/Link）负责 ≥24 / ≥44（G6）。
- reduced-motion：不适用（静态 SVG）。

**尺寸**

| size | 边长 | 典型用途 |
|---|---|---|
| `xs` | `--space-4` | 行内小图标、Tag 内 |
| `sm` | `--space-5` | 按钮内、Alert 图标 |
| `md` | `--space-6` | 默认、导航项 |
| `lg` | `--space-8` | 空状态、卡片占位 |

**消费的 token（白名单）**

- 颜色：**无**。`fill` / `stroke` 只允许 `currentColor`（本节唯一一处「不吃 `--color-*`」的组件——因为颜色必须由上下文决定，写死任何语义色都会让同一个图标在按钮里、正文里、Alert 里各错一次）。
- 度量：`--space-4 / 5 / 6 / 8`

**禁止（本组件专属）**

1. 图标字体或 `<i>` + `background-image`。
2. `fill`/`stroke` 写 hex、rgb 或 `--color-*`（N1 的变体；唯一合法值是 `currentColor`）。
3. 每个图标内联一份完整 `<path>` 而不复用 sprite（D-0054 已论证 sprite 收益被高估，但**新增**组件不得再加重复内联路径，见 §7 自觉 2）。
4. 无 `label` 却承载唯一语义（读屏听不到）。
5. 把 Icon 当点击目标（`<svg onclick>`）。

**依赖**：import 白名单 `Icons/*`（sprite 或 `DynamicIcon`）。**JS 0 字节**。

**视觉基线**：`.../icon-{light,dark}-{390,768,1440}.png`；用例 = `size`×4 × 装饰/有语义 两种。

---

#### 5.6.7 Avatar

- **层级**：atom　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：作者/用户的**身份标识**（头像图，缺图时用首字母）。
- **何时不用**：只是装饰性色块 → Divider/占位；用户列表 → organism；头像要可点 → 由父级 Link 包裹（Avatar 自身不可交互）。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `src` | string | — | — | 缺省即走首字母回退（**构建期分支**） |
| `alt` | string | — | `src` 存在且非装饰时必填 | 身份描述（人名），不是「头像」 |
| `size` | enum | `md` | `xs` / `sm` / `md` / `lg` / `xl` | 见「尺寸」 |
| `shape` | enum | `circle` | `circle` / `rounded` | `circle` → `--radius-pill`；`rounded` → `--radius-md` |
| `initials` | string | — | 1–2 个字符 | 回退文本；与 `src` 互斥（`src` 优先） |
| `decorative` | boolean | `false` | — | 相邻已有姓名文本时置 `true` → `alt=""` + `aria-hidden` |
| `class` | string | — | — | 只允许布局类 |

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| — | — | **无 slot**：头像里不放文字/徽标（徽标属 organism 的卡） |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | — | 图片路径：`<img>` + 1px `--color-border-subtle` 描边；回退路径：底 `--color-bg-muted` + 字 `--color-fg-default` | 图片：`alt`；回退：`aria-hidden="true"`（`initials` 是图片的替代物，不再重复播报） |

其它（**非状态词**）：`fallback`（无 `src`）是**构建期**分支，不是运行时状态——运行期加载失败不做处理（0 字节预算），见下。

**可访问性**

- role / 语义元素：`<img>`（有 `src`）/ `<span aria-hidden="true">`（回退）。
- 键盘：不参与（不可交互）。
- ARIA：`alt` 必填或 `decorative`；回退时 `aria-hidden="true"` 且**必须**有相邻可见姓名，否则身份信息彻底丢失。
- **运行期加载失败**：不做 `onerror` 兜底（JS 预算 0）；`alt` 由浏览器显示为文本，等价于降级。动态头像（评论区）由 organism 自己处理，不进 atom。
- 对比度：回退字 `fg-default`/`bg-muted` **8.05 / 8.94**。**不能用 `--color-fg-muted`**：实测 `fg-muted`/`bg-muted` 只有 **4.18 / 4.34**（不达 4.5，见 §5.6.16-B 的 INFO 行）——这是本规格里唯一一个「看起来该用 muted、实测被否掉」的取值。
- 焦点环：不适用。指针目标：不适用（不可点；若可点，热区由父级 Link 提供）。
- reduced-motion：不适用。

**尺寸**

| size | 边长 | 回退字号 | 描边 | 圆角 |
|---|---|---|---|---|
| `xs` | `--space-6` | `--text-xs` | 1px `--color-border-subtle` | `--radius-pill`（`rounded` 时 `--radius-sm`） |
| `sm` | `--space-8` | `--text-xs` | 同上 | 同上 |
| `md` | `--space-10` | `--text-sm` | 同上 | 同上 |
| `lg` | `--space-12` | `--text-base` | 同上 | 同上 |
| `xl` | `--space-16` | `--text-lg` | 同上 | 同上 |

回退字字重 `--font-weight-medium`、行高 `--leading-none`（居中）。

**消费的 token（白名单）**

- 颜色：`--color-bg-muted` `--color-fg-default` `--color-border-subtle`
- 度量：`--space-6 / 8 / 10 / 12 / 16`、`--radius-pill`、`--radius-sm`、`--radius-md`、`--text-xs`、`--text-sm`、`--text-base`、`--text-lg`、`--font-sans`、`--font-weight-medium`、`--leading-none`

**禁止（本组件专属）**

1. 有 `src` 却不给 `alt`（也不设 `decorative`）。
2. 用 `background-image` 裁头像（图片语义与 `alt` 一起丢掉）。
3. 首字母回退用 `--color-fg-muted`（实测 4.18 / 4.34 不达标）。
4. 把首字母做成图片。
5. 头像里塞徽标/在线状态点（属 organism；此处只画身份）。
6. 给 Avatar 加 `onclick`（可点就交给父级 Link/Button）。

**依赖**：无（原生 `<img>`；`width`/`height` 属性由 size 推导，防 CLS）。**JS 0 字节**。

**视觉基线**：`.../avatar-{light,dark}-{390,768,1440}.png`；用例 = `size`×5 × `shape`×2 × 图片/回退。

---

#### 5.6.8 Divider

- **层级**：atom　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：在两组内容之间画一条 hairline，给**节奏**，不给信息。
- **何时不用**：卡片/输入框的边界 → 用 `border`（`border-subtle` 已经承担）；表单项分组 → 间距（`--space-*`）；有语义的章节切换 → 标题即可（`<hr>` 不是标题）。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `orientation` | enum | `horizontal` | `horizontal` / `vertical` | 竖向只能用在横向排布的容器里（`display: flex`） |
| `spacing` | enum | `md` | `none` / `sm` / `md` / `lg` | 上下（或左右）外边距档位 |
| `decorative` | boolean | `false` | — | `true` → 纯装饰，`aria-hidden`；`false` → 结构化 `<hr>` |
| `class` | string | — | — | 只允许布局类 |

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| — | — | **无 slot** |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | — | 1px `--color-border-subtle`；水平 `border-block-start`，竖直 `border-inline-start` | `decorative=false` 时 `<hr>` 自带 `separator`；`true` 时 `aria-hidden="true"` |

其余 7 个状态**不适用**（Divider 无 hover/focus/disabled）。

**可访问性**

- role / 语义元素：水平 + `decorative=false` → `<hr>`（原生 `separator`）；竖向 → `<div role="separator" aria-orientation="vertical">`（`<hr>` 表达不了竖线）；`decorative=true` → `<div aria-hidden="true">`。
- 键盘：不参与。
- ARIA：**只有一种情况该用 `<hr>`**——它标记「主题切换」。纯视觉留白用 `decorative=true`，否则读屏用户在每个分隔线处都会听到「分隔符」（现有页面里 `border-top` 假装的分隔线全是这种噪音）。
- 对比度：`border-subtle` 对画布 **1.20 / 1.37**——**属 §3.14.4 已登记的豁免**（装饰性 1px，不承担 3:1）。要让分隔线成为**唯一**分组线索时，改用 `--color-border-default`（3.04 / 3.32）并在规格里写明理由。
- 焦点环 / 指针目标：不适用。
- reduced-motion：不适用。

**尺寸**

| spacing | 水平（上下 margin） | 竖直（左右 margin） |
|---|---|---|
| `none` | 0 | 0 |
| `sm` | `--space-4` | `--space-3` |
| `md` | `--space-8` | `--space-4` |
| `lg` | `--space-12` | `--space-6` |

厚度固定 1px（G3 白名单：hairline）。

**消费的 token（白名单）**

- 颜色：`--color-border-subtle`（豁免档）/ `--color-border-default`（唯一分组线索时）
- 度量：`--space-3 / 4 / 6 / 8 / 12`

**禁止（本组件专属）**

1. 在容器上写 `border-top` 假装分隔线（间距无法统一，且每次都要重算）。
2. 用 `border-left` 彩色条（N10）。
3. 装饰线用 `--color-border-default`（把 3:1 的预算花在留白上）。
4. 用 Divider 代替标题做章节切分（结构信息不该由一条线承担）。
5. 竖向 Divider 放进非 flex 容器（高度会塌成 0）。

**依赖**：无。**JS 0 字节**。

**视觉基线**：`.../divider-{light,dark}-{390,768,1440}.png`；用例 = `orientation`×2 × `spacing`×4。

---

#### 5.6.9 Breadcrumb

- **层级**：**molecule**（§4.5：组合多个 Link + 分隔符）　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：告诉读者「我在站点结构的哪一层」，并提供向上导航。
- **何时不用**：只有两层且父级就是首页 → 用返回链接即可；内容不在层级结构里（如标签聚合页）→ 用 Tag 列表；超过 5 层 → 先修信息架构（面包屑不该用来兜 IA 的烂摊子）。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `items` | `Array<{label, href?}>` | — | **必填，≥2 项** | 最后一项无 `href`（当前页）；中间项必须有 `href` |
| `navLabel` | string | — | **必填** | `<nav aria-label>` 的文本（i18n 由页面注入，G1） |
| `class` | string | — | — | 只允许布局类 |

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| — | — | **无 slot**：内容全部由 `items` 决定。开放 slot 会让页面塞进按钮/下拉，破坏「纯导航」契约 |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | — | 祖先项：字 `--color-fg-muted`、无下划线；当前项：字 `--color-fg-default`、`--font-weight-medium` | — |
| hover | `@media (hover: hover)`（仅祖先项） | 字 `--color-fg-link` + 下划线出现（第二通道） | 无 |
| focus-visible | 键盘聚焦（仅祖先项） | G4 焦点环（环贴着链接文字，`inline` 尺度） | 无（原生） |

其它（**非状态词**）：`current`（末项）→ `aria-current="page"`。**§5.3 把 Breadcrumb 的当前页记在「其它」列而不是 `selected`**，本节照抄矩阵，不改验收依据。

**可访问性**

- role / 语义元素：`<nav aria-label={navLabel}>` + `<ol>` + `<li>`；**用有序列表**——面包屑天然是层级序列，`ol` 让读屏能播报「第 2 项，共 4 项」。
- 键盘：祖先项各占一个 Tab 停靠点（≤4 项，可接受）；当前项**不是链接**，不进 Tab 序列。
- ARIA：末项 `aria-current="page"`；分隔符**由 CSS 生成**（`li:not(:last-child)::after`），不写成文本节点——否则读屏会把「/」念成「斜杠」，10 个 locale 还得各自翻译。
- 对比度：祖先项 `fg-muted`/`bg-canvas` **4.64 / 5.14**；当前项 `fg-default`/`bg-canvas` **8.95 / 10.57**（§3.14.4）。
- **不折叠、不省略**：窄屏允许换行（`flex-wrap: wrap`）。折叠需要 JS 或服务端猜视口，M1 两条都不做；页面可以少传 `items`。
- 焦点环：G4；`inline` 链接的环用 `outline-offset` 让环不压到相邻分隔符。
- 指针目标：祖先项 ≥ `--space-6`（24）由 `padding-block` 补足（G6），**不允许**用 `::after` 扩大热区压到分隔符。
- reduced-motion：过渡归 0。

**尺寸**

| 项 | 值 |
|---|---|
| 字号 / 行高 | `--text-sm` / `--leading-snug` |
| 项间距（gap） | `--space-2` |
| 分隔符左右间距 | `--space-1` |
| 项的纵向 padding | `--space-1`（补到 24 的目标高度） |
| 圆角（焦点环内沿） | `--radius-xs` |

**消费的 token（白名单）**

- 颜色：`--color-fg-muted` `--color-fg-default` `--color-fg-link` `--color-ring-focus`
- 度量：`--space-1 / 2 / 6`、`--radius-xs`、`--text-sm`、`--font-sans`、`--font-weight-medium`、`--leading-snug`、`--duration-fast`

**禁止（本组件专属）**

1. 折叠 / 省略号（需要 JS 或猜视口）。
2. 末项做成链接（当前页链接自己 = 无效点击）。
3. 分隔符写成文本节点（读屏噪音 + i18n 负担）。
4. 用 `<div>`/`<span>` 堆链接（丢失列表语义与「第 n 项」播报）。
5. 在 molecule 里 import organism 或取数据（D1 / D4）。
6. 多个 `<nav>` 都不带 `aria-label`（读屏的 landmark 列表会变成一片「导航」）。

**依赖**：atom `Link`（`variant="nav"` 的视觉，非 `nav` 的尺寸）；`Icons` 不用。**JS 0 字节**。

**视觉基线**：`.../breadcrumb-{light,dark}-{390,768,1440}.png`；用例 = 2/3/5 项 × states（default/hover/focus-visible）× 390 换行。

---

#### 5.6.10 Pagination

- **层级**：**molecule**（§4.5：组合多个 Link）　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：在**可索引的路径分页**之间导航（`/blog/page/2/` 这种），不产生查询串。
- **何时不用**：无限滚动 / 「加载更多」→ organism（需要 JS 与请求）；只有两页 → 上一页/下一页两个按钮（用 Link）；筛选结果分页 → 先修 URL 策略（M1 不做）。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `current` | number | — | **必填**，1 起 | 当前页 |
| `total` | number | — | **必填**，≥1 | 总页数；`total ≤ 1` 时组件渲染为空（不占位） |
| `baseHref` | string | — | **必填** | 第 1 页的 URL（`current=1` 时用它，不拼 `{page}`） |
| `hrefTemplate` | string | — | **必填，含 `{page}`** | 如 `/blog/page/{page}/`；页码替换后必须是**真实可抓取路径** |
| `siblings` | number | `1` | 0–2 | 当前页左右各显示几页（总项数由窗口算法决定） |
| `navLabel` | string | — | **必填** | `<nav aria-label>`（i18n） |
| `prevLabel` / `nextLabel` | string | — | **必填** | 上一页/下一页的可访问名称（含可见文字时仍作为 `aria-label`，保证语音一致） |
| `pageLabel` | string | — | **必填，含 `{page}`** | 页码链接的可访问名称模板，如「第 {page} 页」（只写数字对读屏不够） |
| `class` | string | — | — | 只允许布局类 |

**窗口算法（实现契约，不是建议）**：始终显示第 1 页与第 `total` 页；当前页左右各 `siblings` 页；窗口与两端之间若缺 ≥1 页，渲染一个**省略号占位**（不是链接）；当 `total ≤ 2×siblings+5` 时全量显示、无省略号。

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| — | — | **无 slot**：页码是算法生成的，不由页面插入 |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | — | 页码字 `--color-fg-muted`；描边 1px `--color-border-subtle`；底透明 | — |
| hover | `@media (hover: hover)` | 字 `--color-fg-link` + 底 `--color-overlay-hover` + 描边 `--color-border-default` | 无 |
| active | 按下 | 底 `--color-bg-selected`（瞬时）+ `translateY(1px)` | 无 |
| focus-visible | 键盘聚焦 | G4 焦点环 | 无（原生） |
| disabled | 上一页/下一页到达边界 | 字 `--color-fg-disabled`、描边 `--color-border-subtle`、`cursor: not-allowed`；**不响应 hover** | 渲染为 `<span aria-disabled="true">`，**不是** `<a>` |
| selected | `current` 那一项 | 底 `--color-bg-selected` + 字 `--color-fg-default` + `--font-weight-medium` + 描边 `--color-border-accent`（第二通道：边框 + 字重） | 渲染为 `<span aria-current="page">`，**不是** `<a>` |

**可访问性**

- role / 语义元素：`<nav aria-label={navLabel}>` + `<ol>` + `<li>`；上一页/下一页用 `<a aria-label={prevLabel}>`（图标 + 可见文字二选一）。
- 键盘：只有真实链接进 Tab 序列；当前页与省略号不是链接——**这直接决定了「按 5 次 Tab 才能跳过页码」这种问题不会发生**。
- ARIA：`aria-current="page"`（当前页）、`aria-disabled="true"`（边界）、`aria-label`（页码用 `pageLabel` 模板）。**不**用 `title` 代替 `aria-label`。
- 对比度：页码 `fg-muted`/`bg-canvas` **4.64 / 5.14**；当前页 `fg-default`/`bg-selected` **8.09 / 9.39**；hover 字 `fg-link` **5.76 / 5.15**；disabled 2.33 / 2.29 属 1.4.3 豁免（§5.6.16-B）。
- **URL 必须是可索引路径**：`/blog/page/2/`，不是 `?page=2`——查询串对 SEO 与 Cloudflare 缓存规则都不友好（§3.10 之外的既有教训）。
- 焦点环：G4。指针目标：页码方块 `--space-10`（40 ≥ 24），上一页/下一页 `--space-11`（44）。
- reduced-motion：`translateY(1px)` 取消、过渡归 0。

**尺寸**

| 元素 | 边长 | 内边距 x | 字号 | 圆角 |
|---|---|---|---|---|
| 页码 | `--space-10` | 0（正方形） | `--text-sm` | `--radius-md` |
| 上一页 / 下一页 | `--space-11` | `--space-3` | `--text-sm` | `--radius-md` |

项间距 `--space-1`；整块与上下内容的间距由页面决定，组件不自带 margin（避免跨页面时被两边各加一次）。

**消费的 token（白名单）**

- 颜色：`--color-fg-muted` `--color-fg-default` `--color-fg-link` `--color-fg-disabled` `--color-bg-selected` `--color-overlay-hover` `--color-border-subtle` `--color-border-default` `--color-border-accent` `--color-ring-focus`
- 度量：`--space-1 / 3 / 10 / 11`、`--radius-md`、`--text-sm`、`--font-sans`、`--font-weight-medium`、`--leading-none`、`--duration-fast`

**禁止（本组件专属）**

1. 生成 `?page=` 查询串（静态站必须可索引路径）。
2. 当前页做成链接、边界做成 `href="#"`（死链 + 读屏噪音）。
3. 省略号做成链接或可聚焦元素。
4. 在组件里 import i18n / 站点配置取文案（D4 禁止；文案全部走 props，G1）。
5. 内联 `<style>` 写 px 宽高（现状 `UI/Pagination.astro` 的圆按钮即此类，M1-3 换 token）。
6. 把 `total` 全量渲染（1000 页 = 1000 个链接）。

**依赖**：atom `Link`、`Icons/DynamicIcon`（左右箭头）。**JS 0 字节**（窗口算法在构建期算完）。

**视觉基线**：`.../pagination-{light,dark}-{390,768,1440}.png`；用例 = total=1 / 5 / 12 三组 × current 在首/中/尾 × states（default/hover/active/focus-visible/disabled/selected）。

---

#### 5.6.11 Alert

- **层级**：atom　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：在正文流里插入一条**与内容相关的提示**（版本变更、免责声明、过期警告）。
- **何时不用**：全局横幅（跨页、可关闭、记 localStorage）→ organism（`Notice` 那一类，D4 已判违规）；表单字段级错误 → Input 的 `error`；临时反馈（操作成功）→ toast（organism，需要 JS）。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `tone` | enum | `info` | `neutral` / `success` / `warning` / `danger` / `info` | 语义色调（§5.5 六值闭集） |
| `live` | enum | `none` | `none` / `polite` / `assertive` | **默认 `none`**：页面加载时就存在的提示不该是 live region（见可访问性第 4 条） |
| `title` | string | — | — | 可选标题（短句）；正文走 default slot |
| `dismissible` | boolean | `false` | — | 只渲染关闭按钮，**不自己 remove**（状态归父级，§4.3） |
| `closeLabel` | string | — | **`dismissible` 时必填** | 关闭按钮的 `aria-label`（i18n） |
| `icon` | boolean | `true` | — | 是否显示 tone 图标；`false` 仅当正文已足够明确 |
| `class` | string | — | — | 只允许布局类 |

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| `default` | 是 | 提示正文（允许富文本：链接、`<code>`） |
| `actions` | 否 | 操作区（Button/Link，横向排列） |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | — | 底、描边、字、图标都取 `--color-status-{success\|warning\|danger\|info}-{bg\|border\|fg\|solid}` 同一档；`neutral` 用 `--color-bg-muted` + `--color-border-default` + `--color-fg-default` | `role` 由 `live` 决定（见下） |
| focus-visible | 键盘聚焦（仅关闭按钮 / actions 里的元素） | G4 焦点环 | 无（原生） |

其余 6 个状态**不适用**：Alert 不 hover、不 disabled、不 loading（`tone` 是变体不是状态）。

**可访问性**

- role / 语义元素：`<div>`（或 `<aside>`）+ 图标 + 正文；`live="polite"` → `role="status"`；`live="assertive"` → `role="alert"`；`live="none"` → **无 role**（普通区块）。
- 键盘：Alert 本身不聚焦；关闭按钮与 `actions` 里的元素进 Tab 序列。
- ARIA：`aria-hidden="true"` 给图标；`title` 用 `--font-weight-semibold` 而非 `<h*>`（Alert 不该插进标题大纲）。
- **`role="alert"` 的唯一合法场景**：内容由用户操作**在运行时插入**。页面加载即存在的提示用 `assertive` 会在读屏进入页面时打断当前朗读——这是本组件最容易犯的错，所以默认值是 `none`。
- 对比度：正文对状态底（§3.14.4）：`success` **4.60 / 5.62**、`warning` **4.58 / 4.97**、`danger` **6.21 / 5.63**、`info` **8.49 / 8.73**。
- **边界不承担 3:1**：`--color-status-*-border` 是 45% 混色，对画布只有 **1.58–2.12**（§5.6.16-B 的 INFO 行）。Alert 不是控件，tone 的识别依据是**图标 + 文案**（N5），不是边框。`neutral` 的 `--color-border-default` 对画布是 3.04 / 3.32，顺带达标。
- 关闭按钮：≥ `--space-6`（24），`aria-label={closeLabel}`；**不许**只有 ✕ 图标没有 label（N4）。
- reduced-motion：过渡归 0；关闭动画不做（瞬时移除）。

**尺寸**

| 项 | 值 |
|---|---|
| 内边距 | `--space-4` |
| 图标与正文间距 | `--space-3` |
| 标题与正文间距 | `--space-1` |
| 正文与 actions 间距 | `--space-3` |
| 圆角 | `--radius-md` |
| 图标尺寸 | `--space-5`（Icon `size="sm"`） |
| 标题 | `--text-base` + `--font-weight-semibold` + `--leading-snug` |
| 正文 | `--text-sm` + `--leading-relaxed` |

**消费的 token（白名单）**

- 颜色：`--color-status-{success|warning|danger|info}-{bg|fg|solid|border}`、`--color-bg-muted`、`--color-border-default`、`--color-fg-default`、`--color-fg-link`、`--color-ring-focus`
- 度量：`--space-1 / 3 / 4 / 5 / 6`、`--radius-md`、`--text-sm`、`--text-base`、`--font-sans`、`--font-weight-semibold`、`--leading-snug`、`--leading-relaxed`

**禁止（本组件专属）**

1. 页面加载即存在的提示用 `live="assertive"` / `role="alert"`。
2. 用 `border-left` 彩色条表达 tone（N10 明令禁止的视觉反模式；用整块底色 + 描边 + 图标）。
3. 只靠颜色区分 tone（必须有图标 + 文案，N5）。
4. 把 `Notice` 的 `localStorage`/`sessionStorage` 逻辑搬进 Alert（那是 organism，§4.3「局部但有副作用」格）。
5. 关闭按钮自己 `remove()`（父级控状态，G8）。
6. Alert 里套 Alert / 卡片套 Alert 再套卡片（层级噪音）。
7. 用 Alert 做营销横幅（§1.3）。

**依赖**：atom `Icon`、atom `Button`（关闭按钮）。**JS 0 字节**。

**视觉基线**：`.../alert-{light,dark}-{390,768,1440}.png`；用例 = `tone`×5 × 有/无 `title` × 可关闭/不可关闭 × `live` 三档（`live` 不改变视觉，仅在 DOM 上验证 `role`）。

---

#### 5.6.12 Skeleton

- **层级**：atom　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：在内容到达之前**占住排版位置**，避免加载完成后跳动（CLS）。它是「还没到的内容」的形状，不是装饰。
- **何时不用**：加载 < 200ms 的本地数据 → 直接渲染（骨架闪一下比不显示更糟）；需要重试/失败态 → Skeleton + 文案；内容形状未知 → 用 `block` 一档，不要编造假卡片。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `variant` | enum | `text` | `text` / `block` / `circle` | 见「尺寸」 |
| `lines` | number | `1` | 1–6（仅 `text`） | 文本行数；最后一行宽度 60%（百分比合法，G3） |
| `ratio` | string | — | `16/9` / `4/3` / `1/1` / `3/4`（仅 `block`） | 图片占位比例；不传则高度 100% 由父容器决定 |
| `size` | enum | `md` | `xs` / `sm` / `md` / `lg` / `xl`（仅 `circle`） | 与 Avatar 同一套 scale |
| `loadingLabel` | string | — | **必填** | 读屏播报的「加载中」（i18n 由页面注入，G1） |
| `class` | string | — | — | 只允许布局类 |

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| — | — | **无 slot**：骨架里不能有真实内容 |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | — | 底 `--color-bg-muted`；微光扫过用 `--color-overlay-hover`（叠层，不改基色）；`animation: shimmer` 用 `--duration-slower` + `--ease-linear` + `infinite`（N6 的唯一豁免之一） | 外层 `role="status"` + `aria-busy="true"`；形状 `aria-hidden="true"` |

其它（**非状态词**）：`prefers-reduced-motion: reduce` → 无动画的静态色块（**不是**把时长调成 0 还在循环）。

**可访问性**

- role / 语义元素：外层 `<div role="status" aria-busy="true" aria-live="polite">`；内部形状 `aria-hidden="true"`。读屏只会听到 `loadingLabel` 一次，不会被 6 个灰块刷屏。
- 键盘：不参与（不可聚焦）。
- ARIA：`role="status"` + `aria-live="polite"`（等内容到达时，父级把整块替换掉即可）；**不要**用 `aria-label` 代替 `loadingLabel` 的可见文案职责——它是给读屏的，视觉上不显示文字。
- **内容到达后必须卸载**：Skeleton 不是「已加载」状态的一部分（父级负责替换，组件不做定时器）。
- 对比度：`bg-muted` 与微光叠层之间 **1.08 / 1.16**——装饰性，不承担 3:1；`bg-muted` 对画布 **1.05 / 1.21**（骨架不是控件，不设门槛，INFO 行）。
- 焦点环 / 指针目标：不适用。
- reduced-motion：`animation: none`（静态块）；**不许**用「0 时长 + infinite」糊过去（部分浏览器仍会重绘）。

**尺寸**

| variant | 高度 | 宽度 | 圆角 |
|---|---|---|---|
| `text`（每行） | `--space-3` | 100%（末行 60%） | `--radius-sm` |
| `block` | 由 `ratio` 或父容器决定 | 100% | `--radius-lg` |
| `circle` | `--space-6 / 8 / 10 / 12 / 16`（同 Avatar） | 同高 | `--radius-pill` |

`text` 多行时行间距 `--space-2`；`block` 与相邻元素间距 `--space-3`。

**消费的 token（白名单）**

- 颜色：`--color-bg-muted` `--color-overlay-hover`
- 度量：`--space-2 / 3 / 6 / 8 / 10 / 12 / 16`、`--radius-sm`、`--radius-lg`、`--radius-pill`、`--duration-slower`、`--ease-linear`

**禁止（本组件专属）**

1. 用 Skeleton 做装饰性 shimmer（§1.3 / N6）。
2. 骨架做成真实卡片的形状（那是 organism 的事，且会诱使实现复制卡片结构）。
3. 内容到达后还留着骨架占位。
4. 给 Skeleton 加阴影/描边（它不是表面，没有层级）。
5. 用 `infinite` 动画做骨架以外的任何东西（N6：唯一豁免是 Skeleton / spinner）。
6. `text` 行数 >6（再长就该用 `block`，否则和正文的视觉重量混淆）。

**依赖**：无。**JS 0 字节**。

**视觉基线**：`.../skeleton-{light,dark}-{390,768,1440}.png`；用例 = `variant`×3 × `ratio`×4（`block`）× `lines` 1/3/6；另加 reduced-motion 一档静态基线。

---
#### 5.6.13 PageHero

- **层级**：molecule　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：内容页的统一页头（系列 / 相册 / 友链 / 搜索 / 归档 / 关于）：kicker + h1 + lede + 统计行 + 可选底边，六页共用一份「第一屏骨架」。
- **何时不用**：首页主视觉（`HeroMasthead` 是 organism，构图归它）；页面内某个分组的小标题 → `SectionHead`；文章正文页头由文章模板负责。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `title` | string | — | **必填** | h1 文本 |
| `kicker` | string | — | — | mono 大写标签，前置 accent 短尺；空则不渲染整行（短尺一起不渲染） |
| `lede` | string | — | — | 副文案，单段；空则不留空容器 |
| `meta` | array | `[]` | `{ icon?, label, quiet? }[]` | 统计 / 状态行；`quiet: true` 走 `fg-muted` 弱化档；空数组则整行不渲染 |
| `divider` | boolean | `true` | — | 底部 1px 分隔线（`border-subtle`）；系列页传 `false` |
| `id` | string | — | 与 `slug` 至少给一个 | h1 的 id（页面 `aria-labelledby` 依赖它） |
| `slug` | string | — | — | 未给 `id` 时的兜底：h1 id = `${slug}-title` |
| `class` | string | — | — | 只允许布局类 |

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| `default` | 否 | 页头附加行（Tag 组、外链按钮）；不传则整块不渲染 |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | — | 唯一形态：kicker `--color-fg-muted` + 短尺 `--color-accent-solid`；h1 `--color-fg-heading` + `--text-4xl`；lede `--color-fg-default` + `--text-base` + `--measure-prose`；meta 默认 `--color-fg-default`、`quiet` 档 `--color-fg-muted` + `--text-xs`；`divider` 用 `--color-border-subtle` | h1 带 `id`；页面用 `aria-labelledby` 指向它 |

无 hover / focus / disabled / loading / selected / invalid：PageHero 是静态结构，不承载交互（slot 里的控件自带状态）。

**可访问性**

- role / 语义元素：外层 `<header>` + `<h1>`；kicker 是 `<p>`（不是标题，避免打乱大纲）；meta 是列表语义（图标 `aria-hidden="true"`）。
- 键盘：不参与（自身不可聚焦）。
- ARIA：h1 必须有 `id`（`id` 或 `slug` 至少给一个），否则页面无法 `aria-labelledby`。
- 对比度：h1 `fg-heading`/`bg-canvas` **16.29 / 15.89**；lede `fg-default`/`bg-canvas` **8.95 / 10.57**；meta 弱化档 `fg-muted`/`bg-canvas` **4.64 / 5.14**；短尺 `accent-solid`/`bg-canvas` **6.43 / 5.15**（装饰，不设门槛）。
- 焦点环 / 指针目标：不适用（无自身交互）。
- reduced-motion：无动画、无过渡（0 个 `transition`）。

**尺寸**

| 项 | ≥768 | ≤768 | ≤450 |
|---|---|---|---|
| h1 | `--text-4xl` | `--text-3xl` | 同 ≤768 |
| kicker | `--text-xs` + `--font-mono` + `--tracking-wide` | 同左 | 同左 |
| lede | `--text-base` + `--leading-relaxed` | 不降（正文可读性优先） | 同左 |
| 短尺 | 宽 `--space-12`、高 2px | 同左 | 同左 |
| 纵向节奏 | 上 `--space-6` / 下 `--space-6` | 同左 | 下 `--space-4` |
| meta gap | `--space-3` | 同左 | `--space-2` |

h1 **禁止** `clamp()` / `vw`（D-0149）：只允许上面两档字号的裸断点切换。

**消费的 token（白名单）**

- 颜色：`--color-fg-heading` `--color-fg-default` `--color-fg-muted` `--color-accent-solid` `--color-border-subtle`
- 度量：`--space-1 / 2 / 3 / 4 / 6 / 12`、`--text-4xl`、`--text-3xl`、`--text-base`、`--text-xs`、`--font-sans`、`--font-serif`、`--font-mono`、`--font-weight-regular`、`--tracking-tight`、`--tracking-wide`、`--leading-tight`、`--leading-relaxed`、`--measure-prose`

**禁止（本组件专属）**

1. 给 h1 加 `clamp()` / `vw` / 第三个字号档（D-0149：断点只有 768 一个）。
2. 在组件里写页面专属视觉（卡片、栅格、标签配色）——那是页卡的事。
3. 用 kicker 承载导航或可点击内容（它是标签，不是链接）。
4. `meta` 里塞长句（超过一行就该走 lede）；`quiet` 用来表达「次要」而不是「禁用」。
5. 阴影 / 渐变 / 背景色块（页头不是表面，没有层级）。

**依赖**：`Icon`（meta 图标）。**JS 0 字节**。

**视觉基线**：`.../pagehero-{light,dark}-{390,768,1440}.png`；用例 = 全量形态（kicker + lede + meta×4 + divider）与最小形态（只有 title，`divider={false}`）。

---

#### 5.6.14 SectionHead

- **层级**：atom　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：页面内一个分组的标题行：`title` + 右侧 `meta` 说明 + 右侧 `action` 链接，底边与正文分层。六页的所有「区块标题」共用它，保证 h2 间距、底边与对齐只有一份实现。
- **何时不用**：页面第一屏大标题 → `PageHero`；卡片内部小标题（不需要底边）→ 卡片的标题字段；需要折叠行为 → organism（要 JS）。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `title` | string | — | **必填** | 标题文本 |
| `id` | string | — | **必填** | h2 / h3 的 id；页面 `<section aria-labelledby>` 依赖它，缺失即红 |
| `meta` | string | — | — | 右侧说明（如「固定顺序」「最新在上」），纯文本，不是 Tag；空则不渲染 |
| `level` | number | `2` | `2` / `3` | 标题层级；`3` 只用于已有一层 h2 的页面，不得跳级 |
| `class` | string | — | — | 只允许布局类 |

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| `action` | 否 | 右侧操作位（页面传入 `Link` 或 `Button`）；不传则只有 meta |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | — | 标题 `--color-fg-heading` + `--text-2xl` + `--tracking-tight`；meta `--color-fg-muted` + `--text-sm`；底边 1px `--color-border-subtle`；`padding-block-end` `--space-3` | `id` 落在标题元素上；页面用 `aria-labelledby` 指向 |
| focus-visible | 键盘聚焦（仅 `action` slot 内的元素） | G4 焦点环（由 Link / Button 自带） | 无（原生） |

**可访问性**

- role / 语义元素：真标题元素（`h2` / `h3`，按 `level` 渲染），不是 `<div>` 假装标题；`id` **必填**，否则页面的 `aria-labelledby` 落空。
- 键盘：自身不聚焦；`action` 里的 Link / Button 进 Tab 序列。
- ARIA：不加 `role`；`meta` 是 `<p>`，不进标题大纲；`action` 区内不重复 `title` 的文案。
- 对比度：标题 `fg-heading`/`bg-canvas` **16.29 / 15.89**；meta `fg-muted`/`bg-canvas` **4.64 / 5.14**；action 链接 `fg-link`/`bg-canvas` **5.76 / 5.15**；底边 `border-subtle`/`bg-canvas` **1.20 / 1.37**（分隔线，≥1.0）。
- 焦点环 / 指针目标：不适用（自身无交互）。
- reduced-motion：无动画、无过渡。

**尺寸**

| 项 | ≥768 | ≤768 |
|---|---|---|
| 布局 | 一行，`justify-content: space-between`，`align-items: baseline` | 折成两行（`flex-direction: column`），`gap` `--space-2` |
| 标题 | `--text-2xl` + `--leading-tight` | 同左（不降字号，只改布局） |
| meta / action | 同一侧栏内竖排，`gap` `--space-2` | 与标题同行下的第二行 |
| 底边 | 1px `--color-border-subtle` + `padding-block-end` `--space-3` | 同左 |

**消费的 token（白名单）**

- 颜色：`--color-fg-heading` `--color-fg-muted` `--color-fg-link` `--color-border-subtle`
- 度量：`--space-2 / 3`、`--text-2xl`、`--text-sm`、`--text-xs`、`--font-sans`、`--font-serif`、`--font-weight-regular`、`--tracking-tight`、`--leading-tight`

**禁止（本组件专属）**

1. `id` 不填或填重复值（页面 `aria-labelledby` 会落空，同页两个 `id` 会撞）。
2. 用 `level=3` 跳过 h2（标题层级不得跳级）。
3. 把 `meta` 做成 Tag 胶囊或彩色计数（计数是文案，不是状态色）。
4. 组件自己套 `<section>` / `<header>`（容器与 spacing 归页面）。
5. 在本组件里画分隔线以外的装饰（阴影、背景块、图标大字）。

**依赖**：无（`action` slot 由页面传入，组件不 import Link / Button，避免 atom 反向依赖）。**JS 0 字节**。

**视觉基线**：`.../sectionhead-{light,dark}-{390,768,1440}.png`；用例 = 只有 title / title + meta / title + action / title + meta + action。

---

#### 5.6.15 DataState

- **层级**：molecule　·　**状态**：草案　·　**Owner**：`blog-fe`　·　**规格版本**：1.0
- **用途**：数据派的两个**终止态**：`empty`（真实空集）与 `error`（取数失败）。六页的「没有内容」与「取不到内容」用同一份文案结构与间距，不让每页各写一套。
- **何时不用**：内容正在加载 → 没有这个状态（六页全部构建期取数，见下）；字段级校验失败 → `Input` 的 `error`；一次性操作反馈 → toast（organism）。

**Props**

| 名称 | 类型 | 默认 | 取值 | 说明 |
|---|---|---|---|---|
| `kind` | enum | — | **必填**：`empty` / `error` | 两态互斥（G-14） |
| `title` | string | — | **必填** | `empty` → `<h2>`；`error` → Alert 标题 |
| `message` | string | — | **必填** | 说明文案（一句话说清为什么空 / 为什么失败） |
| `icon` | string | — | Icons 闭集图标名（`empty` 时必填） | `error` 忽略（固定用 Alert 的 warning 图标） |
| `code` | string | — | — | `error` 时的 mono 原因码；缺省不渲染该行，**不写 unknown 占位** |
| `codeLabel` | string | — | — | 原因码行前缀（i18n 由页面注入） |
| `class` | string | — | — | 只允许布局类 |

**Slots**

| 名称 | 必需 | 说明 |
|---|---|---|
| `default` | 否 | 操作区（如「回到首页」「换个关键词」）；`empty` / `error` 都可给 |

**States**

| 状态 | 触发 | 视觉（用哪些 token） | ARIA |
|---|---|---|---|
| default | `kind="empty"` | 圆形 icon 底 `--color-bg-muted` + `--radius-pill` + 直径 `--space-12`；图标 `--color-fg-muted`；标题 `--color-fg-heading` + `--text-xl`；说明 `--color-fg-muted` + `--text-sm` + `--measure-prose` | 标题是 `<h2>`；**不加** `role="status"`（页面加载即存在，不是 live region）；icon `aria-hidden="true"` |
| focus-visible | 键盘聚焦（仅 `default` slot 内的元素） | G4 焦点环（由传入控件自带） | 无（原生） |

**无 `loading` 变体**：六页全部构建期取数（O5），客户端不存在「加载中」；要占位用 `Skeleton`，错误用本组件的 `error`。

**可访问性**

- role / 语义元素：`empty` 是 `<div>` + `<h2>` + `<p>` + 可选操作区；`error` 复用 `Alert tone="warning"`（`live="none"`：页面加载即存在，不用 assertive）。
- 键盘：自身不聚焦；操作区里的 Link / Button 进 Tab 序列。
- ARIA：icon 一律 `aria-hidden="true"`（装饰，语义由标题承担）；原因码是**文本**不是颜色（N5），前缀由 `codeLabel` 注入（G1：组件不写自然语言）。
- 对比度：标题 `fg-heading`/`bg-canvas` **16.29 / 15.89**；说明 `fg-muted`/`bg-canvas` **4.64 / 5.14**；圆形 icon 底上的图标 `fg-muted`/`bg-muted` **4.18 / 4.34**（装饰，不设门槛，INFO）；`error` 走 Alert warning 正文 **4.58 / 4.97**；原因码 `fg-muted`/`bg-canvas` **4.64 / 5.14**。
- 焦点环 / 指针目标：不适用（自身无交互）。
- reduced-motion：无动画、无过渡（不做入场淡入）。

**尺寸**

| 项 | ≥768 | ≤450 |
|---|---|---|
| 纵向 padding | `--space-12` | `--space-8` |
| icon 直径 | `--space-12` | `--space-10` |
| 标题 / 说明间距 | `--space-2` | 同左 |
| 说明宽度 | `--measure-prose` | 同左 |
| 原因码 | `--text-xs` + `--font-mono` | 同左（不降） |

**消费的 token（白名单）**

- 颜色：`--color-bg-muted` `--color-fg-heading` `--color-fg-default` `--color-fg-muted`
- 度量：`--space-2 / 8 / 10 / 12`、`--text-xl`、`--text-sm`、`--text-xs`、`--font-sans`、`--font-serif`、`--font-mono`、`--font-weight-regular`、`--tracking-tight`、`--leading-tight`、`--leading-relaxed`、`--measure-prose`、`--radius-pill`

**禁止（本组件专属）**

1. 加 `loading` 变体（构建期取数，没有加载态；客户端占位用 `Skeleton`）。
2. 页面上同时出现 `empty` 与 `error`（G-14：两态互斥）。
3. 用色块 / 红色边框表达「出错」（tone 由 Alert 的图标 + 文案承担，N5）。
4. 原因码写「unknown」/ 空串占位（没有码就不渲染该行）。
5. 在组件里写死中文文案（`title` / `message` / `codeLabel` 全部由页面注入，G1）。
6. 出场动画 / 淡入（N11）。

**依赖**：`Icon`、`Alert`（同层 atom，molecule → atom 合法）。**JS 0 字节**。

**视觉基线**：`.../datastate-{light,dark}-{390,768,1440}.png`；用例 = `empty`（有 / 无 action）+ `error`（有 / 无 `code`）。

---


#### 5.6.16 本节自检（`blog-pm` / `blog-qa` 按此逐项判定）

**A · 15 × 5 字段齐全性**（缺一格 = `REQUEST_CHANGES`）

| # | 组件 | 小节 | props | slots | states | a11y | 使用 token |
|---|---|---|---|---|---|---|---|
| 1 | Button | §5.6.1 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | Link | §5.6.2 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | Tag | §5.6.3 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | Input | §5.6.4 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 | Card | §5.6.5 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6 | Icon | §5.6.6 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 | Avatar | §5.6.7 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8 | Divider | §5.6.8 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 9 | Breadcrumb | §5.6.9 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 10 | Pagination | §5.6.10 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 11 | Alert | §5.6.11 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 12 | Skeleton | §5.6.12 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 13 | PageHero | §5.6.13 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 14 | SectionHead | §5.6.14 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 15 | DataState | §5.6.15 | ✓ | ✓ | ✓ | ✓ | ✓ |

字段定义沿用 §5.1 模板：**Props** / **Slots** / **States** / **可访问性**（a11y） / **消费的 token（白名单）**。另附模板里的「尺寸 / 禁止 / 依赖 / 视觉基线」——不是验收项，但实现时缺了会返工。

**B · 对比度实测（42 个场景全跑，下表摘录规格实际引用的 40 行；与 §3.14.4 同口径）**

脚本：`~/.hermes/profiles/blog-design/cache/scratch/probe-atoms.py`（真解析 `tokens.json` 的 `var()` 与 `color-mix(in oklab)`，WCAG 相对亮度；退出码 0 = 全部达标）。下表是**组件规格里实际引用到的行**：

| 场景 | light | dark | 门槛 | 结论 |
|---|---|---|---|---|
| Button primary 字 `fg-on-accent`/`accent-solid` | 4.66 | 5.15 | ≥4.5 | PASS |
| Button primary hover 字 | 6.04 | 6.51 | ≥4.5 | PASS |
| Button danger 字（同 primary 色对） | 4.66 | 5.15 | ≥4.5 | PASS |
| Button secondary 字 `fg-link`/`bg-surface` | 6.04 | 4.72 | ≥4.5 | PASS |
| Button secondary 描边 `border-accent`/`bg-surface` | 4.66 | 4.72 | ≥3.0 | PASS |
| Button ghost 字 `fg-default`/`bg-surface` | 9.39 | 9.69 | ≥4.5 | PASS |
| Button disabled 字 `fg-disabled`/`bg-muted` | 2.33 | 2.29 | 1.4.3 豁免 | INFO |
| Link inline `fg-link`/`bg-canvas` | 5.76 | 5.15 | ≥4.5 | PASS |
| Link nav `fg-default`/`bg-canvas` | 8.95 | 10.57 | ≥4.5 | PASS |
| Tag selected `fg-default`/`bg-selected` | 8.09 | 9.39 | ≥4.5 | PASS |
| Tag accent `fg-link`/`bg-surface` | 6.04 | 4.72 | ≥4.5 | PASS |
| **Tag accent 若用 `accent-subtle` 底（不采用）** | **5.47** | **3.53** | ≥4.5 | INFO（因此改底） |
| Tag neutral `fg-default`/`bg-muted` | 8.05 | 8.94 | ≥4.5 | PASS |
| Tag info `status-info-fg`/`-bg` | 8.49 | 8.73 | ≥4.5 | PASS |
| Tag success `status-success-fg`/`-bg` | 4.60 | 5.62 | ≥4.5 | PASS |
| Input 字 `fg-default`/`bg-surface` | 9.39 | 9.69 | ≥4.5 | PASS |
| Input placeholder `fg-muted`/`bg-surface` | 4.87 | 4.71 | ≥4.5 | PASS |
| Input 描边 `border-default`/`bg-surface` | 3.19 | 3.04 | ≥3.0 | PASS |
| Input readonly 字 `fg-default`/`bg-sunken` | 8.49 | 8.73 | ≥4.5 | PASS |
| Card 正文 `fg-default`/`bg-surface` | 9.39 | 9.69 | ≥4.5 | PASS |
| Card meta `fg-muted`/`bg-surface` | 4.87 | 4.71 | ≥4.5 | PASS |
| Card raised 正文 `fg-default`/`bg-raised` | 9.39 | 8.27 | ≥4.5 | PASS |
| Card 标题 `fg-heading`/`bg-surface` | 17.09 | 14.57 | ≥4.5 | PASS |
| Avatar 首字母 `fg-default`/`bg-muted` | 8.05 | 8.94 | ≥4.5 | PASS |
| **Avatar 首字母若用 `fg-muted`（不采用）** | **4.18** | **4.34** | ≥4.5 | INFO（因此改字色） |
| Breadcrumb 祖先项 `fg-muted`/`bg-canvas` | 4.64 | 5.14 | ≥4.5 | PASS |
| Breadcrumb 当前项 `fg-default`/`bg-canvas` | 8.95 | 10.57 | ≥4.5 | PASS |
| Pagination 页码 `fg-muted`/`bg-canvas` | 4.64 | 5.14 | ≥4.5 | PASS |
| Pagination 当前页 `fg-default`/`bg-selected` | 8.09 | 9.39 | ≥4.5 | PASS |
| Alert info 正文 | 8.49 | 8.73 | ≥4.5 | PASS |
| Alert warning 正文 | 4.58 | 4.97 | ≥4.5 | PASS |
| Alert danger 正文 | 6.21 | 5.63 | ≥4.5 | PASS |
| Alert neutral 描边 `border-default`/`bg-canvas` | 3.04 | 3.32 | ≥3.0 | PASS |
| Alert info 描边 `status-info-border`/`bg-canvas` | 3.04 | 3.32 | ≥3.0 | PASS |
| **Alert success/warning/danger 描边对画布** | **1.88 / 1.58 / 1.82** | **2.12 / 1.99 / 1.88** | 不设门槛 | INFO（见下 3.） |
| Skeleton 微光 `border-subtle`/`bg-muted` | 1.08 | 1.16 | ≥1.0 | PASS |
| Divider `border-subtle`/`bg-canvas` | 1.20 | 1.37 | ≥1.0 | PASS |
| 焦点环 `ring-focus`/`bg-canvas` | 4.44 | 5.15 | ≥3.0 | PASS |
| PageHero h1 / SectionHead 标题 / DataState 标题 `fg-heading`/`bg-canvas` | 16.29 | 15.89 | ≥4.5 | PASS |
| PageHero kicker 短尺（装饰） `accent-solid`/`bg-canvas` | 6.43 | 5.15 | 不设门槛 | INFO |
| DataState 圆形 icon 底上的图标（装饰） `fg-muted`/`bg-muted` | 4.18 | 4.34 | 不设门槛 | INFO |

三条读法（**别把 INFO 当 PASS，也别当缺陷**）：

1. **`disabled` 属 1.4.3 豁免**：禁用态不承载信息，2.33 / 2.29 不是缺陷；但**禁用态不许是唯一表达**（该做的事要么说清为什么不能做，要么别禁用）。
2. **状态描边（45% 混色）不承担 3:1**：Alert 不是控件，tone 由图标 + 文案表达（N5）。把它写成「必须 3:1」会逼着给四个 tone 各加一个更深的描边键——那是为一个不需要的门槛增加闭集。
3. **`§3.14.4` 有一格要订正**：`fg-muted / bg-surface` light 记 **4.76**，本节同脚本复跑为 **4.87**（dark 4.71 一致）。4.76 与任何相邻色对都对不上（对 `bg-canvas` 是 4.64、对 `bg-raised` 同为 4.87），判定为笔误。两值都过 4.5，**不影响任何设计结论**；`t_15455edf` 重写 §3.4.7 时按复跑值订正。

**C · 机器门禁（可直接跑；P5/P7/P9/P10 由 `verify-atoms.py` 判定）**

| # | 门禁 | 命令 | 期望 |
|---|---|---|---|
| P1 | M1 的 12 个小节都在（`SPECS` 仍只列 12 个） | `grep -cE '^#### 5\.6\.(1\|2\|3\|4\|5\|6\|7\|8\|9\|10\|11\|12) ' docs/DESIGN.md` | `12` |
| P2 | 五个字段各 12 次（§5.6.1–§5.6.12 区间） | `for f in Props Slots States 可访问性 '消费的 token'; do grep -c "^\*\*$f" docs/DESIGN.md; done` | 每个 `12` |
| P3 | 本节无字面颜色 | `awk '/^### 5\.6 /,/^## 6\./' docs/DESIGN.md \| grep -cE '#[0-9a-fA-F]{3,8}\|rgba?\(\|hsla?\('` | `0` |
| P4 | 本节无 palette 引用 | 同上替换成 `grep -c -- '--palette-'` | `0` |
| P5 | token 名都来自 `tokens.json` | `python3 verify-atoms.py`（提取本节所有 `--[a-z0-9-]+`，与 JSON 的 semantic+primitive 键求差） | 差集 `∅` |
| P6 | 尺寸字面量只剩白名单 | `awk '/^### 5\.6 /,/^## 6\./' docs/DESIGN.md \| grep -oE '[0-9]+(\.[0-9]+)?(px\|rem\|em)' \| sort -u` | 只出现 `1px`、`2px` |
| P7 | 状态词是 §5.4 闭集 | `python3 verify-atoms.py`（抽 States 表首列去重） | ⊆ 8 个词 |
| P8 | 没有 Tailwind 语法（D-0100） | `grep -rnE 'tailwind\|@apply\|@theme' src/components src/styles` | `0` |
| P9 | 本节没有 utility 类名 | `python3 verify-atoms.py`（扫反引号片段里形如 gap-4、px-3、text-sm 的 utility 名） | `0` |
| P10 | 白名单自洽 | `python3 verify-atoms.py`（每组件「非禁止段」出现的 token − 该组件白名单） | 差集 `∅` |

**P5/P10 的两条写法约定**（脚本按此解析，写别了会误报）：

1. **紧凑写法**：`--space-2 / 3 / 4 / 6` = 同一前缀 + 后续数字，脚本展开后再比。**同一行里不要混两个前缀**——脚本只能按第一个前缀展开，后面的数字会被当成不存在的 token。
2. **反例豁免**：含「不采用 / 不用 / 不能用 / 禁止 / 不要」的句子视为反例（如 Tag 里「不用 accent 淡底」），不参与白名单比对——否则「记录一个被否掉的取值」这个动作本身会被判违规。

**M8-6-0 的三节不在 P1–P10 覆盖内**：`verify-atoms.mjs` 的 `SPECS` 仍按 M1 的 12 个枚举，`§5.6.13–15`（PageHero / SectionHead / DataState）只受 `verify-atom-docs` 与 `verify-doc-drift` 约束。要把 P1–P10 扩到 15，需同步 `SPECS` 与 P10 白名单——属后续卡，别在这里改口径。

**D · 与 §5.3 状态矩阵的一致性**

| 组件 | 本节声明的状态 | §5.3 打勾的列 | 一致 |
|---|---|---|---|
| Button | default / hover / active / focus-visible / disabled / loading | 同左（6/6） | ✓ |
| Link | default / hover / focus-visible | 同左（3/3） | ✓ |
| Tag | default / hover / focus-visible / selected | 同左（4/4） | ✓ |
| Input | default / hover / focus-visible / disabled / invalid | 同左（5/5） | ✓ |
| Card | default / hover / focus-visible | 同左（3/3） | ✓ |
| Icon | default | 同左（1/1） | ✓ |
| Avatar | default | 同左（1/1） | ✓ |
| Divider | default | 同左（1/1） | ✓ |
| Breadcrumb | default / hover / focus-visible | 同左（3/3） | ✓ |
| Pagination | default / hover / active / focus-visible / disabled / selected | 同左（6/6） | ✓ |
| Alert | default / focus-visible | 同左（2/2） | ✓ |
| Skeleton | default | 同左（1/1） | ✓ |

**Breadcrumb 与 Pagination 的「当前页」不在同一列**，这是 §5.3 的既有口径（Breadcrumb 记在「其它」、Pagination 记在 `selected`），本节照抄不改——**矩阵是 M1-3 的验收依据，改它等于改验收标准**。若 M1-3 想统一，走 §8 流程改矩阵，别在实现里各写一套。

**E · 不写实现的自证**

| 检查 | 判据 | 结论 |
|---|---|---|
| 无组件代码 | §5.6 全文无 `.astro` 片段、无 `<style>` 块、无 CSS 选择器规则、无 Tailwind utility 类名（D-0100） | ✓ |
| 无实现文件改动 | 本节产生的写入只有 `docs/DESIGN.md`（+ 取证脚本在 `~/.hermes/profiles/blog-design/cache/scratch/`）。`src/` 下若出现改动（`src/styles/*`、`package.json` 等），属并行卡 M1-2（token 编译）与 D-0100（Tailwind 移除），**不是本节写的** | ✓ |
| 无新 token | 本节只引用 `tokens.json` 已有键；需要新键的地方（如 danger hover）明确写了「不新增」 | ✓ |

---

## 6. 禁止项

### 6.1 硬禁止（12 条，全部可机器检查）

| # | 禁止 | 为什么 | 检查方式 | 现状基线 |
|---|---|---|---|---|
| N1 | **组件里写死颜色**（hex / `rgb()` / `hsl()` / 颜色名） | 深色模式必然漏改；换主题必然返工 | `grep -nE "#[0-9a-fA-F]{3,8}\|rgba?\(\|hsla?\(" src/components` | **41 个 hex + 32 个 rgba，分布在 19/90 个文件**；M1 目标 0 |
| N2 | **组件里用 `--palette-*`** | 绕过语义层 = 深浅色不可控 | 同 G-T4 | 0（`--palette-*` 是 v1.0 新命名；落地后只应出现在 `tokens.css`） |
| N3 | **任意圆角值** | 圆角是品牌语言的一部分，随手写会变成「每个卡片都不同」 | `grep -n "border-radius:" src/components \| grep px` | **34 处 px 字面量**（4px×8、20px×5、8px×5…）；目标 0（例外见 §6.2） |
| N4 | **无标签的图标按钮** | 读屏用户只听到「按钮」 | axe `button-name` | 生产已达 0 critical/serious（D-0057），保持 |
| N5 | **只靠颜色表达状态** | 色盲用户不可辨 | 人工 + axe `color-contrast`/`link-in-text-block` | 现有告警已带图标；新增组件按 §5.4 |
| N6 | **无限动画**（`animation-iteration-count: infinite`） | 持续重绘吃电、干扰阅读、违反 P5 | `grep -n "infinite" src/` | 仅 Skeleton/Spinner 允许 |
| N7 | **断点魔数** | 多一个数字就多一条无法验证的分支 | `grep -rho "@media[^{]*" \| grep -oE "[0-9]+px" \| sort -u` | 现状 6 个规范值（450/640/768/1024/1280/1440）+ 页脚 2 处漂移（360/480，见 X5）；出现第 8 个 = 红 |
| N8 | **`z-index` 字面量** | 叠层战争只能靠加数字解决 | `grep -rn "z-index:" src/` | 现状 11 个值（含 `9999`/`10000`）；目标只留 §3.11 的 8 档 |
| N9 | **组件里判断主题**（`[data-theme=…]` / `prefers-color-scheme`） | 主题逻辑必须收敛在 token 层 | `grep -rn "data-theme\|prefers-color-scheme" src/components src/styles \| grep -v tokens.css` | 现状：`ToggleTheme` 有（JS 读写 `data-theme` 属允许，CSS 判断不允许） |
| N10 | **视觉反模式**：第四字族 / 渐变文字 / 卡片套卡片 / `border-left` 彩色条 / 仪表盘大数字 | 这些是「AI 味」和「模板味」的主要来源（§1.3） | 人工评审 + 截图基线 | — |
| N11 | **LCP 元素进入场动画**，或动画从 `opacity:0` 起手 | D-0088 / D-0094 两次实测：直接把 LCP 拖后 0.3–1.6s | Lighthouse 看 LCP 元素 + 人工看首屏 CSS | 现状已修（`page-enter` 只改 opacity、起点 0.55） |
| N12 | **为视觉新增运行时依赖 / 往全局样式表加规则** | R-31：文章页 CSS 39.7/40KB 已贴线；`13` §1 判定四问 | `git diff package.json` + CSS 体积门禁 | 全局 CSS 133KB raw / 26KB gz |

### 6.2 例外登记表（不许「默默违规」，只许「登记后违规」）

| # | 例外 | 位置 | 为什么现在不改 | Owner | 消解时点 |
|---|---|---|---|---|---|
| X1 | 导航壳 `46px`、导航项 `10px` 圆角 | `src/styles/components.css` / `Nav` | Header 不在 M1 范围；改了会动全站视觉基线 | blog-fe | M2 Header 重构 |
| X2 | `z-index: 9999`（热力图 tooltip）、`10000`（skip-link） | `heatmap.css` / `base.css` | 需先判定 tooltip 与 toast/modal 的叠层关系 | blog-design | M1 末（§10 未决 5） |
| X3 | viz 6 色在深色下共用浅色值 | Bangumi | 分类色不是状态色；图表另有对比度要求 | blog-design | M2（C 层展示页） |
| X4 | `Expressive Code` 的 `!important` 变量覆盖 | `global.css`（D-0057） | 第三方在 `.expressive-code` 上声明同名变量，只能提特异性 | blog-fe | 跟随 EC 升级 |
| X5 | `Footer.astro` 的一次性断点 `480px` / `360px` | `src/components/Layout/Footer.astro:306,336` | 页脚网格在 360 附近确实需要更早收窄；M2 折进 `--bp-xs`(450) | blog-fe | M2 Header/Footer 重构 |

**登记规则**：新增例外必须在本表加一行 + 写消解时点；无时点的例外在评审时按违规处理。

---

## 7. 性能与预算约束（设计侧）

设计不产生预算幻觉。`06-performance-budget.md` §2.1 与 R-31 已经把账算到「再加一点就破」的程度，因此设计系统自己必须带成本上限：

| 项 | 上限 | 现状 | 依据 |
|---|---|---|---|
| `tokens.css`（raw） | **≤ 12KB** | 现有 `tokens.css` 5,037B + `variables.css` 7,968B = **13,005B** | 两份合并后必须比现在更小（去重 + 收敛命名） |
| 全局样式（gz） | ≤ 45KB | 41.8 KB（`06` §2 表） | `06` §2 |
| 文章页 CSS（gz） | ≤ 40KB | **39.7KB**（R-31，已贴线） | R-31 明确要求「V2 加样式前先决定抬门禁还是裁 EC」 |
| 文章页 JS（gz，门禁） | ≤ 40KB | p95 34.9KB | D-0052 / D-0056 |
| 每个新组件的 JS | 默认 **0 字节** | 12 个组件的目标 | `16` §3.3「无客户端 JS（除非交互必需）」 |
| 新增字体文件 | **0** | 现有栈全部走系统/已有字体 | `16` §6.1 未结，不许顺手加 |
| 新增运行时依赖 | **0** | — | `12` §7.3、R-34 |

> **P7 与本节同数**：`tokens.css`（raw）的上限在 §2 P7 与本节都写 **12KB**，只允许两处同时改。本节「现状」列是迁移前基线（旧站 `tokens.css` 5,037B + `variables.css` 7,968B = 13,005B）；M1-2 的生成物 `src/styles/tokens/tokens.css` 当前 **11,380B**（2026-11-02 实测，`check-tokens` 10/10 PASS）。

**设计侧的三条自觉**

1. **阴影/圆角是廉价的，模糊与滤镜不是**：`backdrop-filter` 在移动端是合成开销大头，只能在导航壳这一处（现状已有），新组件一律禁止。
2. **图标走 SVG，不走图标字体**：`06` §3 显示内联 SVG 已经让文章页 HTML 到 115KB；设计侧的对策是**同一图标复用 `<symbol>`/sprite**（D-0054 已论证 sprite 收益被高估，但**新增**组件仍不得引入图标字体或每图标一份内联路径）。
3. **动效只买「理解」，不买「惊艳」**：动效预算 = 0 额外请求、0 额外依赖，纯 CSS 或复用既有脚本。

---

## 8. 变更流程

### 8.1 版本与所有权

`DESIGN.md` 与 `tokens.json` **同版本号**（`version` 字段 + 本文标题）。语义版本按**契约破坏面**定义，不按「改动大小」：

| 版本 | 什么算 | 例子 | 必做 |
|---|---|---|---|
| **patch**（1.0.x） | 值微调，键不变，对比度结论不变 | `--space-7` 由 28→30px（会被「n×4」门禁拦住，仅示例）；某色 ±2 亮度 | 更新基线截图 + QA 看 diff |
| **minor**（1.x.0） | **新增** token / role / 状态 / 组件规格，向后兼容 | 新增 `--color-status-info-*`；新增 `--radius-2xl` | 全套证据（§8.4） |
| **major**（x.0.0） | **重命名或删除** token、改命名语法、改层级规则、改状态词汇 | `--color-fg-*` 改名；atom/molecule 定义变化 | 必须附**迁移映射表**（如 §3.13）+ 全站回归 |

**1.0.0 → 1.1.0 的判定（`t_f44ee43d` 落 `tokens.json` + 本卡重写 §3）**

先看「按字面像什么」：palette 从「现站 19 个中性 + 朱红」换成 Stitch 基线（`neutral` 裂成 `paper`/`ink` 两条色相、7 个值为过 WCAG 推导、step 粒度 25→50、palette 键 37→43），primitive 的字号/行高/圆角/阴影/动效/布局**全部改值**，键有增（`--leading-none`、`--leading-snug`、`--layout-article`）**但无删**。值变了、键增了、视觉变了——**不是 patch**。

再看「按 §8.1 的口径是什么」：major 的三条判据是**重命名 / 删除 token / 改命名语法**。52 个语义键**一个没改名、一个没删**，组件层的契约面（`--color-*` 的 52 个名字 + 度量家族名）原封不动；`--palette-*` 只有 `tokens.css` 消费、零组件依赖（G-T4 保证），所以「palette 内部 step 重排」对组件是**不可见**的。`--layout-medium` 也不是「删除已发布 token」——它只在 v1.0 文档里出现过、从未进 `tokens.json`、零消费方，属于**提案撤回**。

结论：**minor（1.1.0）**。真正被破坏的是**视觉基线**（必须重出 + 人工 diff，§8.4 E4），不是组件契约；迁移映射表本来就在 §3.13，且 M1 还没迁站，不存在「已发布 API 变了而使用者不知道」。

> 反过来说：如果哪天要在一条已发布的 palette 上重排 step（组件已经在引 `--palette-*`），那就是 major——**判据是「谁在依赖它」，不是「改了多少行」**。

**谁签什么**

| 动作 | 落盘 | 实现 | 门禁 | 验收 | 视觉方向 |
|---|---|---|---|---|---|
| 改 DESIGN.md | `blog-design` | — | — | `blog-pm` | PO（仅 §1/§2 变化时） |
| 改 tokens.json | `blog-platform`（依本文） | `blog-platform` | `blog-qa` | `blog-pm` | — |
| 用 token 实现组件 | — | `blog-fe` | `blog-qa` | `blog-pm` | — |

### 8.2 五步流程（token 改动的标准路径）

```
① 提案            ② 影响面            ③ 改 tokens.json      ④ 证据              ⑤ 签字
（卡 + 理由）  →  （组件清单）    →   + 重新生成 tokens.css → （基线+脚本+数字）→ （QA→PM）
                                        + 改 DESIGN.md 版本号
```

**① 提案**：在 `blog2` 板开卡，卡里必须写「为什么要改」「不改会怎样」「哪个真实页面证明了它」（不许「设计趋势觉得好看」）。

**② 影响面**：把①②步之间的机器活算清楚，别靠记忆：

```bash
# 受影响的组件（按 token 名）
grep -rln -- "var(--color-fg-muted)" src/components src/pages src/styles

# 受影响的 token 数量与引用数（我算 §3.13 用的就是这个）
# src/ 下 var(--*) 的去重计数

# 有没有绕过语义层
grep -rn -- "--palette-" src/components src/pages src/styles --include=*.css --include=*.astro
```

影响面必须落到三样东西：**组件清单**（多少个文件）、**12 组件矩阵里哪几个**（§5.3）、**是否需要改基线**（视觉变化 → 是）。

**③ 改 token**：先改 `tokens.json`，再 `node build-tokens.mjs` 生成 `tokens.css`，最后改本文对应表格与版本号。**顺序不能反**——先改组件再回填 token 是 `16` §4 明令禁止的做法（「不允许组件里先写死再回填」）。

**④ 证据**：见 §8.4，缺一即退回（`11-team-org.md` §5.2 的交接三件套同口径）。

**⑤ 签字**：QA 出 `PASS` / `REQUEST_CHANGES` / `ABORT`；PM 按 §9 判定；只有涉及 §1 视觉叙事/§2 原则的改动才需要 PO 签字。

### 8.3 影响面的三个必答问题（写进卡里）

1. **谁消费它？**（文件数 + 组件名）
2. **深浅色都要改吗？**（改颜色几乎总是「是」，改度量几乎总是「否」）
3. **视觉会变吗？**（会 → 基线必须更新，且要有人看 diff）

### 8.4 证据清单（token/组件改动的四件套）

| # | 证据 | 命令 / 文件 | 什么时候必需 |
|---|---|---|---|
| E1 | **一致性** | `node build-tokens.mjs --check` 退出码 0 | 每次改 tokens.json |
| E2 | **键对齐** | G-T2 脚本输出（light/dark 差集 = ∅） | 每次改颜色 |
| E3 | **对比度** | 附录 C 脚本输出，全部 PASS | 每次改颜色（含新增状态色） |
| E4 | **视觉基线** | `e2e/__screenshots__/design-atoms/` 3 视口 × 2 主题 diff；页面级 `e2e/__screenshots__/pages/`（6 页 × 3 视口 × 2 主题，M5-11） | 视觉有变化时 |

补充：**基线只能用 `--update-snapshots` 更新，且必须人工看 diff**（`16` §3.5）。CI 不许自动更新基线——自动更新的基线等于没有基线。

页面级基线（`e2e/pages.visual.spec.ts`）必须先用 `pnpm visual:build:pages` 以固定内容构建——它跑在 `e2e/fixtures/pages-visual/` 的 6 篇冻结文章上，不是私有内容仓的最新快照；否则内容仓加一篇文章就会让首页/归档整体位移、视觉门禁红在与主题无关的地方。两平台基线各自生成（Linux 用 `mcr.microsoft.com/playwright:v1.63.0-noble`），流程见 README「视觉基线（截图回归）」。

### 8.5 回滚

- **改动必须是一个可回滚的原子提交**：`tokens.json` + `tokens.css` + `DESIGN.md` 同一次提交。分三次提交会让「回滚 token 但忘回滚文档」成为默认结局。
- 回滚命令：`git revert <sha>`（不改历史，只加反向提交）。
- **基线一起回滚**：视觉基线是同一次提交里的 PNG；只回滚 token 不回滚基线，CI 会红在错误的地方。
- 回滚演练：M1-5 至少做一次「改一个颜色 → 基线变红 → revert → 变绿」的证明（与 G5 的回滚演练同思路：**没演练过 = 没有**）。

### 8.6 什么时候必须写 `decision-log.md`

以下六类改动**先写决策记录再动手**（`blog-pm` 维护，只增不改）：

1. 新增/删除 palette 色相或步长；
2. 新增 semantic `role`（改了 §3.2 的闭集）；
3. 新增/修改断点；
4. 新增 z-index 层级；
5. 改动对比度门槛或豁免项（§3.4.7 豁免段）；
6. 改动 §7 的任何预算上限。

普通 patch（值微调、新增组件规格）不需要单独决策记录，但要有卡 + 证据。

---

## 9. 验收清单（`blog-pm` 按此逐项判定）

**结论只填三选一**：`PASS` / `REQUEST_CHANGES` / `ABORT`。填 `REQUEST_CHANGES` 必须给可执行修改项。

### 9.1 卡片的三个验收项（`t_c76e0e23`）

| # | 验收项 | 判据 | 证据位置 | 结论 |
|---|---|---|---|---|
| A1 | **章节齐全** | 文档含 §1 视觉叙事、§2 设计原则、§3 token 分类与表（8 类：color/typography/space/radius/shadow/motion/breakpoint/zIndex，且 palette 与 semantic 两层都有）、§4 组件层级、§5 组件规格模板、§6 禁止项、§8 变更流程 | 目录标题 1–8 | |
| A2 | **命名约定可直接指导 tokens.json** | §3.2 给出语法与闭集；§3.4 列出 52 个语义键的 light/dark 取值；§3.12 给出 JSON 结构与 6 条结构约束；照抄即可生成 `tokens.json`，无需再问设计 | §3.2 / §3.4 / §3.12 | |
| A3 | **可被 review** | 每条验收项都有**可判定的判据**与**证据位置**（不是「文档质量好」这类不可判定表述）；§9.2 的 16 项全部可勾 | 本节 | |

### 9.2 细化验收项（16 项，逐条判定）

| # | 验收项 | 判据（怎么判） | 证据 | 结论 |
|---|---|---|---|---|
| V1 | 视觉叙事可执行 | §1.3 每条「拒绝」都有替代做法；§1.4 三条记忆点可被截图检验 | §1 | |
| V2 | 原则带判据 | §2 七条每条都有「判据」列且可测（宽度/对比度/键集合/预算） | §2 | |
| V3 | 两层模型说明清楚 | §3.1 说清 palette/semantic 各自谁能用；§3.2 给出正则式语法 | §3.1–3.2 | |
| V4 | palette 完整且可验证 | §3.3 四个色族（neutral/accent/status/viz）全部列出；步长规则可机械验证；18 个 neutral 值 = 生产原值 | §3.3、附录 C | |
| V5 | semantic 表是闭集 | §3.4 共 52 键，分 6 组；每个键有 light/dark/用途 | §3.4 | |
| V6 | 深浅色覆盖方式唯一 | §3.2 四条规则：只覆盖颜色、键集合相等、组件不判断主题、`data-theme` 单一来源 | §3.2、§3.12 | |
| V7 | 对比度有实测 | §3.4.7 的 25 行全部 PASS；豁免项写明依据 | §3.4.7、附录 B | |
| V8 | 8 类 token 齐全 | typography / space / radius / shadow / motion / breakpoint / zIndex / color 各一节 | §3.5–3.11 | |
| V9 | 组件层级有依赖方向 | §4.2 D1–D4 四条禁令 + 检查命令；§4.3 状态归属判定 | §4 | |
| V10 | 现状归层有数字 | §4.4 覆盖 90 个组件（11 个目录），合计 90 | §4.4 | |
| V11 | 规格模板可填空 | §5.1 模板含用途/props/slots/states/a11y/token/禁止/依赖/基线；§5.2 有完整示例 | §5 | |
| V12 | 状态词汇统一 | §5.4 八个状态，每个都有触发/视觉/ARIA | §5.4 | |
| V13 | 禁止项可检查 | §6.1 十二条，每条有检查方式 + **现状基线数字** | §6 | |
| V14 | 例外有出口 | §6.2 五条例外（X1–X5），每条有 owner 与消解时点 | §6.2 | |
| V15 | 变更流程可执行 | §8.2 五步、§8.4 四件证据、§8.5 回滚、§8.6 六类必记 | §8 | |
| V16 | 性能约束带数字 | §7 七项上限，其中 tokens.css ≤12KB 有现状对照（13,005B） | §7 | |

### 9.3 交付边界（不该出现的东西）

| 检查 | 判据 | 结论 |
|---|---|---|
| B1 | 未写组件实现（无 `.astro` 片段、无具体 CSS 规则） | 全文只有 token 表、JSON 结构、命令；无组件代码 |
| B2 | 未改 `src/components/`、`src/pages/` | `git status` 中无这两个目录的改动 |
| B3 | 未新增 `tokens.json`（属 M1-2 卡） | `src/styles/tokens/` 不存在 |

---

## 10. 未决事项（M1 内解决，标注 owner 与时点）

| # | 事项 | 现状与建议 | Owner | 时点 |
|---|---|---|---|---|
| 1 | **正文字体选型**（`16` §6.1-1） | 沿用现有栈；若换自托管必须给出 LCP/CLS 前后数字 | blog-design + blog-fe | M1 末 |
| 2 | **强调色是否沿用 M3E accent**（`16` §6.1-2） | **本版沿用朱红**：它是现有品牌资产，且 §3.4.7 的对比度全部通过。要换色 = major 变更 | PO | M1 视觉评审 |
| 3 | **深色默认值**（`16` §6.1-3） | 建议「跟随系统 + 手动覆盖持久化」；token 层已支持，只差 `data-theme` 初始化策略 | PO | M1 视觉评审 |
| 4 | **`/design/atoms` 是否发布生产**（`16` §6.1-5） | 建议发布 + `noindex`（线上验收方便，与 `16` §3.4 一致） | blog-pm | M1-4 |
| 5 | **`z-index: 9999` 归属** | 需判定热力图 tooltip 与 `--z-toast`/`--z-modal` 的关系 | blog-design | M1 末（X2） |
| 6 | **`.claude/DESIGN.md` 退役** | 本文件生效后它成为第二真源；需在代码仓留一行指针或删除 | blog-platform | M1-2 |
| 7 | **viz 色深色模式对比度** | 6 个分类色深色共用浅色值；图表 a11y 标准（非文本 3:1）未验 | blog-design | M2（X3） |

> `16` §6 的另外两个问题（props 命名、字体）分别已在 §5.5 定案、在 #1 挂账——**不留在「开放」里当摆设**。

---

## 附录 A · 术语

| 术语 | 含义 |
|---|---|
| **palette（L0）** | 原始色值，无语义，只有 `tokens.css` 可用 |
| **semantic token（L1）** | 按用途命名的颜色变量，组件唯一可用颜色 |
| **primitive token（L2）** | 度量类原始值（间距/圆角/字号/时长…），本身即最小语义单位 |
| **atom** | 不 import 本系统其它组件的视觉单元（可 import `Icons/*`） |
| **molecule** | 组合 2+ atom 完成单一任务 |
| **organism** | 拥有行为或跨组件协作的区块 |
| **infra** | 非视觉组件（meta/CSP/JSON-LD） |
| **闭集** | 允许的键/值有明确列表，表外新增即违规 |
| **Border Ground Rule** | 任何抬升表面必须有 1px 边框 + 一级阴影 |
| **One Accent Rule** | 内容表面只有一个饱和强调色，单屏 ≤10% 面积 |
| **Dark Elevation Rule** | 深色下层级靠 border + 亮度差，不靠阴影 |

## 附录 B · 对比度口径与豁免依据

- **正文/小字**：≥4.5:1（WCAG 2.1 SC 1.4.3 AA）。
- **大字**（≥24px 或 ≥18.66px 粗体）：≥3:1。
- **非文本对比**（控件边界、焦点指示、图标）：≥3:1（SC 1.4.11）。
- **豁免**：inactive 控件（`disabled`）不受 1.4.3 约束；**纯装饰**元素不受 1.4.11 约束。
- **计算方法**：`(L1 + 0.05) / (L2 + 0.05)`，`L` 为 WCAG 相对亮度（sRGB 线性化后加权 0.2126/0.7152/0.0722）。附录 C 的脚本即此实现。
- **`color-mix()` 的取值口径**：本表的「状态底」用 sRGB 线性插值近似 `color-mix(in oklab, …)`；二者在这组暖色上差异 < 1 个色阶，不影响 PASS/FAIL 结论。真机验证以浏览器 `getComputedStyle` 为准（M1-5 可选做一次抽查）。

## 附录 C · 复现脚本（对比度与步长单调性）

放在 `scripts/gates/design-tokens-check.py`（M1-5 落地），`python3` 直接跑，无第三方依赖。**它读 `tokens.json`，不把色值抄进脚本**——所以它同时是「文档 vs JSON 一致」的第三只眼：§3.4.7 的 25 行都是它算的。任何一行 FAIL 或 ramp 非单调 → 退出码 1。

```python
#!/usr/bin/env python3
"""DESIGN.md §3.4.7 的复现脚本：打印 25 行对比度 + 豁免项 + 色阶单调性。

用法: python3 design-tokens-check.py [path/to/tokens.json]
无第三方依赖；tokens.json 是唯一真源，本脚本不缓存任何色值。
任何一行 FAIL 或 ramp 非单调 → 退出码 1。
"""
import json
import math
import re
import sys

TOK = sys.argv[1] if len(sys.argv) > 1 else "src/styles/tokens/tokens.json"


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear_to_srgb(c):
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def rgb01(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def to_hex(rgb):
    return "#%02x%02x%02x" % tuple(int(round(max(0, min(1, c)) * 255)) for c in rgb)


def lum(rgb):
    r, g, b = (srgb_to_linear(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


# ---- oklab：与 CSS color-mix(in oklab) 同口径 ----
M1 = [(0.4122214708, 0.5363325363, 0.0514459929),
      (0.2119034982, 0.6806995451, 0.1073969566),
      (0.0883024619, 0.2817188376, 0.6299787005)]
M2 = [(0.2104542553, 0.7936177850, -0.0040720468),
      (1.9779984951, -2.4285922050, 0.4505937099),
      (0.0259040371, 0.7827717662, -0.8086757660)]
M1i = [(4.0767416621, -3.3077115913, 0.2309699292),
       (-1.2684380046, 2.6097574011, -0.3413193965),
       (-0.0041960863, -0.7034186147, 1.7076147010)]
M2i = [(1.0, 0.3963377774, 0.2158037573),
       (1.0, -0.1055613458, -0.0638541728),
       (1.0, -0.0894841775, -1.2914855480)]


def mul(m, v):
    return tuple(sum(m[i][j] * v[j] for j in range(3)) for i in range(3))


def to_oklab(h):
    lms = mul(M1, [srgb_to_linear(c) for c in rgb01(h)])
    return mul(M2, [math.copysign(abs(x) ** (1 / 3), x) for x in lms])


def to_rgb(lab):
    lms = [x ** 3 for x in mul(M2i, lab)]
    return tuple(linear_to_srgb(sum(M1i[i][j] * lms[j] for j in range(3))) for i in range(3))


def oklab_mix(a, pct, b):
    la, lb = to_oklab(a), to_oklab(b)
    return to_hex(to_rgb(tuple(la[i] * pct + lb[i] * (1 - pct) for i in range(3))))


doc = json.load(open(TOK, encoding="utf-8"))
pal, sem = doc["palette"], doc["semantic"]


def split_ref(ref):
    for hue in sorted(pal, key=len, reverse=True):
        if ref.startswith(hue + "-"):
            return hue, ref[len(hue) + 1:]
    raise KeyError(ref)


def hex_of(ref):
    hue, step = split_ref(ref)
    return pal[hue][step]


VAR = re.compile(r"^var\(--palette-([a-z]+-[a-z0-9-]+)\)$")
MIX = re.compile(r"^color-mix\(in oklab, var\(--palette-([a-z]+-[a-z0-9-]+)\) ([\d.]+)%, "
                 r"var\(--palette-([a-z]+-[a-z0-9-]+)\)\)$")
HEX = re.compile(r"^#([0-9a-f]{6})([0-9a-f]{2})?$")
RGBA = re.compile(r"^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$")


def resolve(value):
    """语义值 -> (r,g,b,a) 0..1"""
    m = VAR.match(value)
    if m:
        return rgb01(hex_of(m.group(1))) + (1.0,)
    m = MIX.match(value)
    if m:
        return rgb01(oklab_mix(hex_of(m.group(1)), float(m.group(2)) / 100, hex_of(m.group(3)))) + (1.0,)
    m = HEX.match(value)
    if m:
        a = int(m.group(2), 16) / 255 if m.group(2) else 1.0
        return rgb01("#" + m.group(1)) + (a,)
    m = RGBA.match(value)
    if m:
        return (float(m.group(1)) / 255, float(m.group(2)) / 255,
                float(m.group(3)) / 255, float(m.group(4) or 1.0))
    raise ValueError("无法解析语义值: " + value)


def flat(value):
    """alpha 先合成到不透明白底/黑底由调用方给；这里只处理语义值的实色化（对 #rrggbbaa 用其 rgb）"""
    c = resolve(value)
    return c[:3]


def pair(fg_key, bg_key, theme):
    table = sem[theme]
    bg = flat(table[bg_key])
    fg = resolve(table[fg_key])
    if fg[3] < 0.999:
        fg = tuple(fg[i] * fg[3] + bg[i] * (1 - fg[3]) for i in range(3))
    return ratio(fg[:3], bg)


PAIRS = [
    ("fg-default / bg-canvas", "--color-fg-default", "--color-bg-canvas", 4.5),
    ("fg-default / bg-surface", "--color-fg-default", "--color-bg-surface", 4.5),
    ("fg-heading / bg-canvas", "--color-fg-heading", "--color-bg-canvas", 4.5),
    ("fg-muted / bg-canvas", "--color-fg-muted", "--color-bg-canvas", 4.5),
    ("fg-muted / bg-surface", "--color-fg-muted", "--color-bg-surface", 4.5),
    ("fg-subtle / bg-canvas", "--color-fg-subtle", "--color-bg-canvas", 4.5),
    ("fg-link / bg-canvas", "--color-fg-link", "--color-bg-canvas", 4.5),
    ("fg-link / bg-surface", "--color-fg-link", "--color-bg-surface", 4.5),
    ("fg-code / bg-sunken", "--color-fg-code", "--color-bg-sunken", 4.5),
    ("fg-code-accent / bg-sunken", "--color-fg-code-accent", "--color-bg-sunken", 4.5),
    ("fg-on-accent / accent-solid", "--color-fg-on-accent", "--color-accent-solid", 4.5),
    ("fg-on-accent / accent-solid-hover", "--color-fg-on-accent", "--color-accent-solid-hover", 4.5),
    ("fg-default / bg-selected", "--color-fg-default", "--color-bg-selected", 4.5),
    ("fg-inverse / bg-inverse", "--color-fg-inverse", "--color-bg-inverse", 4.5),
    ("ring-focus / bg-canvas", "--color-ring-focus", "--color-bg-canvas", 3.0),
    ("border-default / bg-canvas", "--color-border-default", "--color-bg-canvas", 3.0),
    ("border-default / bg-surface", "--color-border-default", "--color-bg-surface", 3.0),
    ("border-strong / bg-canvas", "--color-border-strong", "--color-bg-canvas", 3.0),
    ("status-success-fg / status-success-bg", "--color-status-success-fg", "--color-status-success-bg", 4.5),
    ("status-warning-fg / status-warning-bg", "--color-status-warning-fg", "--color-status-warning-bg", 4.5),
    ("status-danger-fg / status-danger-bg", "--color-status-danger-fg", "--color-status-danger-bg", 4.5),
    ("status-info-fg / status-info-bg", "--color-status-info-fg", "--color-status-info-bg", 4.5),
    ("status-success-solid / bg-canvas", "--color-status-success-solid", "--color-bg-canvas", 3.0),
    ("status-warning-solid / bg-canvas", "--color-status-warning-solid", "--color-bg-canvas", 3.0),
    ("status-danger-solid / bg-canvas", "--color-status-danger-solid", "--color-bg-canvas", 3.0),
]
EXEMPT = [
    ("fg-disabled / bg-canvas", "--color-fg-disabled", "--color-bg-canvas"),
    ("border-subtle / bg-canvas", "--color-border-subtle", "--color-bg-canvas"),
]

fail = 0
print("| 场景 | light | dark | 门槛 | 判定 |")
print("|---|---|---|---|---|")
for label, fgk, bgk, need in PAIRS:
    rl, rd = pair(fgk, bgk, "light"), pair(fgk, bgk, "dark")
    ok = rl >= need and rd >= need
    fail += 0 if ok else 1
    print("| %s | %.2f | %.2f | ≥%.1f%s | %s |" %
          (label, rl, rd, need, "" if need == 4.5 else "（非文本）", "PASS" if ok else "**FAIL**"))

print()
print("豁免（不计入门槛）：")
for label, fgk, bgk in EXEMPT:
    print("  %-30s light %.2f  dark %.2f" % (label, pair(fgk, bgk, "light"), pair(fgk, bgk, "dark")))

print()
for hue, steps in pal.items():
    if hue == "viz":
        continue
    ordered = sorted(steps, key=int)
    values = [lum(rgb01(steps[s])) for s in ordered]
    mono = all(values[i] > values[i + 1] for i in range(len(values) - 1))
    fail += 0 if mono else 1
    print("ramp-%-9s monotonic=%s  (%s)" % (hue, mono, " → ".join(ordered)))

print()
print("FAIL 行数 =", fail)
raise SystemExit(1 if fail else 0)
```

> M1-5 应把它接进 `ci.yml`，与 A17（全局样式链）同级；**它是 DESIGN.md 的可执行副本**：文档里写的数字，脚本必须复算一致。

---

## 签字

| 角色 | 人 / profile | 结论 | 日期 |
|---|---|---|---|
| 设计（产出） | `blog-design` | v1.0 草案落盘 | 2026-11-02 |
| 设计（产出） | `blog-design` | v1.1 §3.3–§3.12 对齐 Stitch 基线（版本判定见 §8.1） | 2026-11-02 |
| 平台（token 编译） | `blog-platform` | 待 M1-2 | |
| 前端（组件实现） | `blog-fe` | 待 M1-3 | |
| 质量（门禁） | `blog-qa` | 待 M1-5 | |
| 项目（验收） | `blog-pm` | 待 §9 逐项 | |
| 视觉方向（PO） | 周聪 | 待 M1 视觉评审（§1/§2） | |

---

**参考**

- `docs/16-m1-brief.md` §3.1–§3.2（DESIGN.md 提纲、token schema、命名约定）、§3.3（12 components）、§3.5（视觉基线）、§6（开放问题）
- `docs/04-architecture.md` §1（构建期系统，运行期零服务器）、§4（单页 JS 构成：swup 16.7KB 占大头 → 组件默认 0 JS）
- `docs/13-package-boundaries.md` §1（判定四问）、§2（三处跨层耦合及修复）、§3（UI 组件矩阵，🔧/⛔ 判定）、§5（`packages/tokens` 与 `packages/ui` 目标结构）
- `docs/06-performance-budget.md` §2（预算表）、§2.1（JS 口径与 40/28/30 门禁）、§3（HTML 构成）
- `docs/12-product-charter.md` §5（P5 设计契约：硬编码 = 0）、§7（约束：Astro + 原生 CSS、不使用 Tailwind、不引入 Svelte 5）
- `risks.md` R-31（文章页 CSS 贴线）、R-34（设计系统压爆预算）
- `docs/decision-log.md` D-0094（动画改 LCP）、D-0088（删开场动画）、D-0089（CSS 滚动时间轴不可靠）、D-0057（对比度整改）

