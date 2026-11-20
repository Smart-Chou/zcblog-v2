# N-2b · Twikoo 评论 provider

**卡**：评论 provider 契约第 3 个实现（`none` / `waline` → `+twikoo`）
**日期**：2026-11-20
**前置**：N-2a（`5ccc8f61`）已落地 `none` / `waline` 与选路骨架

---

## 1. 关键结论：Twikoo 不阻塞于 H-12

H-12 待 PO 决策的是「是否允许第三方 CDN 脚本」。上一轮我把它记成
「Twikoo 和 Giscus 都需要这个决策」，**这是不准确的**——Twikoo 有两种接入方式，
代价差一个数量级：

| 接入方式 | CSP 代价 | 是否采用 |
|---|---|---|
| 官方 CDN `<script src="https://cdn.jsdelivr.net/npm/twikoo/...">` | 要放宽 `script-src`，等于允许运行任意第三方 JS + 必须配 SRI | ❌ |
| **npm 包 + `import("twikoo")`** | 脚本由 Vite 打包进 `'self'`，`script-src` **一字不改**，只在 `connect-src` 加云函数域名 | ✅ |

所以 H-12 只阻塞 Giscus（它必须松开 `frame-src 'self'`）。Twikoo 在本卡独立完成。

---

## 2. 改动清单（14 文件）

### 配置契约

- `src/config/feature.ts`
  - `CommentProvider` 加 `"twikoo"`
  - 新增 `TwikooConfig`（`enable` / `envId` / `lang`），注释写明两种接入方式的 CSP 差异
  - 新增 `twikoo` 常量，`enable: comments.provider === "twikoo"` —— 与 `waline.enable` 同一套派生纪律，结构上不存在「provider=twikoo 却忘关 waline」
- `src/config/index.ts` 导出 `twikoo`
- `apps/demo/src/config/feature.ts` 同步 `CommentProvider` / `TwikooConfig` / `twikoo`（O7 要求示例站导出主题实际 import 的所有符号；N-2a 已踩过这个坑）

### 组件

- **`src/components/UI/TwikooComment.astro`**（新，~250 行）
  SSR 外壳与 `WalineComment.astro` 同构：`#comment-wrapper` → `#twikoo-toggle` → 抽屉（`.comment-drawer`，复用 `~/scripts/comment-drawer`）。三种形态（桌面内联 / 移动抽屉 / 未配置占位）一套 DOM。
- **`src/components/UI/Comments.astro`**（新，选路壳）
  按 `comments.provider` 渲染对应实现。**为什么需要它**：四处调用点原本都写 `waline.enable && <WalineComment>`，若逐处改成三段条件判断，改一处漏三处的风险太高；一个选路组件把映射收敛在一处，调用点只写 `<Comments locale>`。

### 调用点收敛（4 处）

`MarkdownLayout.astro` / `FriendsContent.astro` / `TalksContent.astro` / `DonateContent.astro`：
`waline.enable && <WalineComment>` → `<Comments>`

`MarkdownLayout` 保留了 `frontmatter.waline` 判断——那是**文章级开关**（内容层意愿，`z.boolean().default(true)`），与「用哪个 provider」是两件事。

### CSP

`ContentSecurityPolicy.astro`：`extraOrigins` 加 `twikoo.enable && twikoo.envId ? twikoo.envId : null`。
`envId` 为空时被既有 `.filter(Boolean)` 滤掉，未部署云函数不会产生空串。
**`script-src` 未做任何改动。**

### 构建

- `scripts/copy-vendor-css.mjs`（新）：构建期把 `twikoo/dist/twikoo.css` 拷到 `public/assets/vendor/`
- `package.json`：`build` / `build:ci` 在 `normalize:content` 之后插入该脚本
- `.gitignore` 排除 `public/assets/vendor/`

### 测试

`e2e/comments-provider.spec.ts`：`renderedProvider()` 从二态扩到三态、新增 twikoo 用例、契约自洽条覆盖三 provider。

### 门禁分母

`scripts/gates/verify-component-inventory.mjs`：`FROZEN_COUNTS` 的 `ui 24 → 26`、`total 51 → 53`，I3 硬编码同步。注释写明新增的是哪两个组件、为什么它们是「运行时装配壳」而非视觉组件。
`docs/component-inventory.json` 由 `--update` 重新生成。

---

## 3. 实测

### 体积（最关键的一条）

`twikoo.min.js` = **359,395 B / gzip 121,324 B**，而 article JS 门禁只有 **40 KB**。

| 指标 | 改动前 | 改动后 |
|---|---|---|
| article JS p95 | 32.6 KB | **32.5 KB** |
| 超预算页数 | 0 | **0** |

361 KB 的 chunk 完全不计入首屏——`perf-budget.py` 的 `_static_imports()` 只统计静态 import（注释原文：「`import("./x.js")` 是懒加载，不计入首屏」），Twikoo 走动态 `import()`。

### 三种 provider 的 e2e（互斥，各需独立构建）

| 产物 | 结果 | 真实执行的用例 |
|---|---|---|
| `twikoo` | 2 passed / 2 skipped | twikoo 懒加载 + 契约自洽 |
| `waline` | 2 passed / 2 skipped | waline 懒加载 + 契约自洽 |
| `none` | 2 passed / 2 skipped | 零请求零 DOM + 契约自洽 |

三次跑的都是同一份源码，通过 `PUBLIC_COMMENTS_PROVIDER` 构建期折叠。

### 产物核验

```
id="twikoo"     : 1
id="waline"     : 0     ← 选路正确，没有误渲染
script-src      : 与改动前逐字相同（未放宽）
connect-src     : envId 为空 → 无额外域名（filter(Boolean) 生效）
dist/assets/vendor/twikoo.css : 24,472 B 已就位
```

### 门禁

```
gates:all   RESULT PASS   classified=1777  unclassified=0
            I3  26 条 UI 100% 登记
            O1/O7 PASS   · apps/demo files=10 configs=4
tsc --noEmit  0
vitest / perf / icons  全绿
```

---

## 4. 一条弯路（构建失败）

第一次构建 twikoo 产物直接失败：

```
[rolldown:vite-resolve] plugin threw an error
"./dist/twikoo.css" is not exported under the conditions [...] from package twikoo
```

根因：`twikoo` 的 `package.json` 只有 `"exports": { ".": "./dist/twikoo.min.js" }`，
**没有导出 CSS 子路径**，所以 `import css from "twikoo/dist/twikoo.css?url"` 解析不了。

三个候选解法与取舍：

1. **改成从 CDN 加载 CSS** —— 要放宽 `style-src`，违反 H-12 的「不放宽」原则。❌
2. **把 36 KB CSS 提交进仓库** —— 会与依赖版本漂移（升级 twikoo 忘重拷 → 样式静默变旧）。❌
3. **构建期拷贝到 `public/assets/vendor/`（采用）** —— 同源自托管，`style-src 'self'` 已覆盖，产物进 `.gitignore` 永不脱节。✅

---

## 5. 遗留

- **`envId` 目前为空**：Twikoo 云函数尚未部署。此时组件渲染「未配置」占位文案、不发起任何请求（`doInitTwikoo` 在 `!twikoo.envId` 时直接 return）。部署云函数后只需填 `feature.ts → twikoo.envId` 并切 `PUBLIC_COMMENTS_PROVIDER=twikoo`。
- **生产仍是 `waline`**：本卡只做实现与验收，未切换默认 provider。切换是一次独立的、需要用户确认的上线动作。
- **`renderedProvider` 在双 toggle 时返回 `unknown`**：那是选路组件写坏的信号，契约自洽条会红。
- **`giscus` 仍未实现**：等 H-12 决策（要松开 `frame-src 'self'`，是本轮唯一真正削弱隔离面的改动）。
