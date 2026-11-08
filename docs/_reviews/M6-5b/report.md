# M6-5b · 跳转守卫单页视觉（redirect_guard）

- 卡片：`t_b6795919`（blog2 板），父卡 `M6-5a`（串行排序用）
- 选型：`selection.md` §4.25 —— 桌面 `redirect_guard_modal` + 移动 `redirect_guard`，**只换壳**
- 改动源文件（3 个，正好卡面上限）：
  - `src/pages/redirect.astro`（重写：结构 + 状态机 + 内联脚本）
  - `src/styles/redirect.css`（重写：全部规则收进 `.rg` 作用域）
  - `e2e/pages-redirect.spec.ts`（新建）
- 未触碰：`404.astro` / `404.css` / `components.css` / `base.css` / `overlays.css` / 内容 schema / palette / 依赖 / i18n 数据文件

## 1. 做了什么

### 一套 DOM，两个断点

| 断点 | 形态 | 结构 |
| --- | --- | --- |
| ≥641（含 1024 / 1440） | `redirect_guard_modal` | 工具条（状态点 + `Security Guard // Outbound Redirect` + `Esc` 键帽 + 关闭键）→ 盾牌/警告标题行 + `外部跳转` 胶囊 → 目标解析卡（URL 条 + 复制 + 协议/DOMAIN/REL 三条事实）→ 独立漫游声明 3 条 → 状态行（`aria-live`）→ 操作行（左「留在本站」/ 右实底赤陶 CTA + 倒计时芯片）→ 路由页脚 |
| ≤640 | `redirect_guard` | 同 DOM 收窄：标题块居中、事实清单单列、操作行 `column-reverse` 满宽（主 CTA 在上）、英文括注隐藏、页脚换行 |

零位图、零内部滚动、零遮罩（守卫是页级对话框，页面自身滚动）。

### 协议：逐条保留，未改一行判定逻辑

- `?url=` 的 **base64url 解码**（`-`→`+`、`_`→`/`、补 `=`）、`//` 前缀补 `https:`
- **黑名单优先 → 白名单次之**（`["*.taobao.com", "*.jd.com"]`；白名单 = `site.domains` + 通配 + `github.com` / `astro.build` / `vercel.com` / `t.me`）
- 白名单命中 → **5 秒倒计时后 `location.replace`**；黑名单 → CTA `disabled` + 文案 `禁止跳转`；非黑非白 → 可点但不自动跳（原行为）
- **解析失败 → 退出打开态**：`data-overlay` / `role` / `aria-*` 归零，降级为兜底面板（M2-5 契约不变，旧门禁仍绿）
- 原有的 `contextmenu` / `F12` 反调试监听原样保留（属既有安全行为，不擅自改）

### 新增的东西（都在「视觉 + 交互壳」范围内）

1. **状态机** `data-state`：`guard`（默认）/ `safe`（白名单）/ `warn`（未验证）/ `danger`（黑名单）/ `error`（解析失败）/ `dismissed`（用户取消）。颜色只由状态驱动，全部走 `--color-status-*` 语义 token。
2. **键盘取消**：`Esc` 与关闭键等价 → 停表、退出打开态、露出取消态面板、**焦点回填**到「返回首页」（`#rg-fallback-home-dismissed`）。错误态同理回填到 `#rg-fallback-home`。
3. **复制目标地址**：`navigator.clipboard.writeText`（只在页内复制文本，不渲染指向目标站的 `<a>` —— 不新增外链拦截绕过口）。
4. **三条真实事实**代替设计稿里的虚构项：协议（HTTPS/HTTP，来自 `new URL().protocol`）、DOMAIN（`hostname`）、REL（`nofollow · noopener`）。没有伪造「证书权威签发 / TLS 1.3 / VERIFIED」这类无法验证的结论；判定牌只用 `待解析 / 已验证 / 黑名单 / 未验证 / 解析失败`。
5. **零 JS 兜底**：标题、lede、声明 3 条、「留在本站」链接、`<noscript>` 说明都是 SSR 内容；CTA 带 `hidden`，只在 JS 接管后才取消 —— 没有死按钮。

## 2. 验证（真实执行）

```bash
corepack pnpm run build:ci
corepack pnpm exec playwright test e2e/pages-redirect.spec.ts --reporter=line
```

| 项 | 结果 |
| --- | --- |
| `build:ci` | **pass** · 477 pages · `dist/redirect/index.html` 56,286 B |
| 本卡 spec | **20 passed**（判据 12 + 证据截图 8） |
| 横向溢出 1440 / 1024 / 390 × light/dark | **0 px** 全部 |
| axe（wcag2a/aa + 21a/aa + 22aa，作用域 `.rg`） | **0 violations**（light 与 dark），兜底态另测一次也是 0 |
| `prefers-reduced-motion: reduce` | 运行中动画 **0** |
| 旧门禁 `e2e/overlays.spec.ts`（跳转守卫 3 条） | **3 passed** —— 含 `[data-overlay]` 关闭态 0 节点、`axe serious=0 incomplete=0`（light/dark）、打开不拉额外 overlay 资源 |
| 零 JS（`javaScriptEnabled: false`） | 标题 / lede / 3 条声明 / `#rg-stay`（`href="/"`）/ noscript 说明均在，CTA 隐藏 |
| 黑名单 | `#jump-button` disabled、判定牌「黑名单」、`data-state="danger"` |
| 解析失败 | `[data-overlay]` 计数 0、兜底面板可见、标题栏仍有文字（不白屏）、CTA 隐藏 |
| Esc | `data-state="dismissed"`、焦点 `#rg-fallback-home-dismissed`、等 6s 后仍停在 `/redirect/`（表已停） |

证据截图（`docs/_reviews/M6-5b/screens/`）：

- `redirect-light-{1440,1024,390}.png`、`redirect-dark-{1440,1024,390}.png`（正常守卫态）
- `redirect-error-light-1440.png`（解析失败兜底）
- `redirect-dismissed-light-1440.png`（Esc 取消 + 焦点回填）

## 3. 过程中踩的两个坑（已修，写在这里比写在 commit 里有用）

1. **无限循环动画会把 M2-5 门禁打红。** `overlays.spec.ts` 对 `[data-overlay]` 子树里所有动画调 `Animation.finish()`，而无限迭代动画 `finish()` 抛 `InvalidStateError`。原本给状态点做的呼吸动画因此删掉，改静态实底。守卫页的「活着」信号不值得一条门禁。
2. **`×` 与 `←` 这两个文本字形会被 axe 判 `incomplete`。** `color-contrast: .rg__stay-arrow`（字形字重/背景算不准）+ `label-content-name-mismatch: #rg-close`（可见文本 `×` 不在 `aria-label` 里）。两者都换成既有 sprite 图标（`tabler:x` / `tabler:chevron-left`），图标不进文本层，两条都消失。legacy 门禁要的是 `incomplete=0`，比 serious 更严。
3. 图标只能从 **已生成的 sprite** 里挑：`scripts/generate-icons.js` 产出 `src/components/Icons/index.ts` 与 `public/icons.svg`，两者都在本卡 3 文件边界外，所以首次写的 `tabler:shield-check` / `tabler:world-search` 渲染成 `?`（截图里可见）。改用已收录的 `tabler:alert-triangle-filled` / `tabler:world` 后正常。

## 4. 偏离与未做（需要 PO 决策的留在这里）

- **「24h 免二次提示」复选框未做。** 两张设计稿都有，但要落地必须引入 localStorage 信任名单 —— 属于改安全策略，超出本卡授权。
- **移动端「不自动跳」未改。** selection §4.25 主张「倒计时只做桌面」；卡面明确要求「保留 5 秒倒计时」。按卡面执行（协议不变），移动端仍有 5 秒自动跳。若要按 selection 落地，是一张单独的行为卡。
- **判定牌不写「VERIFIED / TLS 1.3 / 证书权威签发」。** 纯静态站无从校验证书链，写了就是编造。现在只写解析得到的事实（协议 / 域名 / rel）。
- **卷标仍是全站外壳（header/footer）**：axe 作用域取 `.rg`（与 M6-5a 同口径），外壳那 4.4:1 的浅色小字属 M6-1 共享层，已由 M6-5a 记为 M6-6 处理。

## 5. 遗留 / 交接

- 双平台视觉基线（mac/lin）未刷新 —— 按卡面交给 operator/CI 批量跑。
- 全量门禁（`gates:all` / `gates:surfaces` / `pages.visual`）未跑，只跑了本卡 spec + 一次 `build:ci` + 旧的 redirect 三条子用例。
- 本卡耗时 ~55min，超出 25min 预算（主要花在 4 次 `build:ci`：axe 对比度修正、图标改名、无限动画与文本字形两处 legacy 门禁修复各需重建一次）。已在 60% 处提交 WIP commit `543913b`。
- 仓库未 push（按授权由 operator 决定）。
