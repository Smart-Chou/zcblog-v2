# 踩坑记录（Pitfalls）

> 本文在治理仓 `blog2.0/docs/pitfalls.md` 与代码仓 `rules/pitfalls.md` 各存一份，**以治理仓为准**（那边是撰写地）。
> 代码仓这份是给不进治理仓的人（含 AI 编码工具）看的快照；两边不一致时回治理仓改，不要只改这一份。
> 新增坑的顺序固定：先追加 `decision-log.md`（拿到 `D-xxxx`），再回来归类——反过来会留下没有决策号的坑。
> 本节以下正文与治理仓同文、未做删改；引用时请引决策号，不要引章节号（章节号会随归类调整）。
> 全文 8 章 26 条：视觉基线 / 内容契约 / Astro 构建 / CI 门禁与探针 / 容器 / 部署域名 / macOS 与 Git 工具链 / 服务凭据。
> 这些坑的共同点不是「命令写错了」，而是**验证手段本身会骗人**（假绿 / 假红 / 假成功）；修业务前先确认判据没坏。<!-- D-0178 -->

> 本文是 `decision-log.md` 的检索层，不是它的替代。decision-log 按时间追加，回答「当时为什么这么定」；本文按领域归类，回答「我现在遇到 X 该查什么」。
> 每条三段：**现象 / 根因 / 解法**，末尾括号是来源决策号。
> 每条都能在 `decision-log.md` 找到原文（D-0178 补录了此前只存在于会话的 4 条工具链坑）。
> 新增坑先追加 decision-log，再回来归类，避免两处口径分叉。

---

## 1. 视觉基线

### 1.1 旧视觉基线可能编码的是缺陷：补上图标后 36 张全红，红的是基线不是代码

**现象**：状态级视觉基线在当前代码上 36/36 全红；36 张图尺寸完全一致，全图差异仅 1.691%，聚成 11 个纵向条带（导航图标组、chips、说明文字、页脚），核心内容区零差异。

**根因**：旧基线图编码的是「skills 页 `tabler:category` 图标缺失」这个 bug 的视觉状态。`icon-markup.ts:52` 遇未注册图标名 `return ""`，图标宽度为 0，同 flex 容器内右侧元素整体左移 15px。补上图标后页面正确变化，基线才正确变红——**这批图不是「过期」，是把缺陷当成了正确**。

**解法**：用对照实验锁定（摘掉 `36727a20` 的图标修复、其余不动 → 36 passed）；按平台各重出 36 张、共 72 张入库；同时给 `verify-icon-sprite.mjs` 加 S8，扫源码两种引用形式 `<Icon name="...">` 与 `icon: "..."`，补上「清单→sprite、sprite→清单两侧都查，中间源码引用无人查」的缺口。排查时先对差异条带做位移打分（dx=+15px 一致率 99.96%，dx=0 仅 55.27%），再下结论。（D-0173）

### 1.2 基线产物不提交，卡标 done 也等于门禁没生效

**现象**：一张卡把状态级基线「做完了」并标记 `done`，但 `git ls-files` 对 `build-state-baseline.mjs` / `pages-states.visual.spec.ts` 的追踪状态是 0/2，工作区另有 34 项未提交；复核时这套 spec 在当前代码上 36/36 全红。

**根因**：卡的状态只证明「实现跑通过」，不证明「产物进了仓库」。CI 拿不到 spec 和基线图，门禁在流水线里等于不存在；而本地工作区看起来又一切正常。

**解法**：拆成三个独立提交——图标修复 + S8、门禁脚本与 spec（不含图片）、72 张基线图；每个提交可单独回退，回退 `edaaec11` 就是「摘下 CI 门禁」，回退 `71400eb2` 就是「有门禁无基线」。验收门禁类工作时，先查 `git ls-files` 而不是看卡状态。（D-0173）

---

## 2. 内容契约与 frontmatter

### 2.1 内容仓新增 schema 未声明的字段，会让生产构建连续静默失败数天

**现象**：`marxchou.com` 定时部署自 2026-11-10 起连续 4 次失败，站点内容冻结在 11-09 的产物；报错 `InvalidContentEntryDataError`、`Unrecognized keys: "series", "seriesOrder"`。

**根因**：内容仓 `9af2c09` 给 6 篇文章写入 `series` / `seriesOrder`，而生产仓 `src/content.config.ts` 仍是 v4 契约、`.strict()` 下不认这两个键。`normalize-frontmatter.mjs` 只删 v1 的 6 个布尔键与 `category`，不处理 `series`，于是构建期炸掉。CI 没拦住是因为它用固定 fixture 构建，从不碰真实内容仓。

**解法**：生产 schema 按加法补两个可选字段（`series` 用 ASCII 小写 kebab 正则、≤48；`seriesOrder` 为 `int 0..999`），只做契约兼容、不建 `/series/` 路由；不把 `.strict()` 改成 `.passthrough()`（会让以后真写错的字段也静默通过）；另立 A2b 内容契约门禁（见 2.3）。（D-0166）

### 2.2 build 不调用 normalize-frontmatter，第一次同步旧格式文章就会炸

**现象**：从内容仓补一篇 `1panel-v1-to-v2-cli-migration.md` 后 `pnpm build` 报 `InvalidContentEntryDataError`，散字段 `mathjax`/`mermaid`/`plantuml`/`katex`/`chart`/`markmap` 被 `.strict()` 判为未知键。

**根因**：`scripts/normalize-frontmatter.mjs` 本来就在 v2 仓库里，但 `build` / `build:ci` 都没调用它；生产仓 `Smart-Chou/zcblog` 的 `deploy.yml` 早就在跑同名脚本。v2 的 `src/content/article/` 是 gitignored，现有 89 篇恰好都已归一化，所以成了「第一次同步新内容就会炸」的潜伏缺口。

**解法**：`package.json` 新增 `normalize:content`，前置到 `build` / `build:ci` 开头；可容忍的 fetch 各自用括号包成 `(fetch:all || true)`，normalize 保持硬失败——它守的是内容格式契约，静默失败等于把 schema 错误推迟到 astro build 才暴露。验证要跑两遍确认幂等（90 篇改 4 篇，第二遍 0 篇）。（D-0174 补记）

### 2.3 schema 键只能靠「缩进基准」收：只靠配平与正则都会收错键

**现象**：内容契约门禁（A2b）初版从 `content.config.ts` 提取允许键，只认出 2 个，且把 `image` 内层的 `url` / `alt` 当成 frontmatter 键。

**根因（2026-11-14 实测定稿，推翻了 D-0167 的三处归因）**：

1. **「数花括号会被 `image` 带偏」—— 配平本身没错，错在没做缩进过滤**。定位对象边界只能靠花括号配平（唯一可行办法）；漏键的原因是收键时把外层对象里所有 `X:` 都收了。实测不收缩进过滤能捞出 **22~28 个键**，其中 5 个是假的：`url`、`alt`、`loader`、`schema`、`message`（`message` 来自 `.regex(…, { message: "…" })` 的选项对象，最容易漏想）。**加 16 空格缩进过滤后正好 18 个**。
2. **「正则找首个 `z.object(` 会落在 `image` 内层」—— 归因错**。prettier 把 `z` 和 `.object(` 拆成两行，全文**字面量** `z.object(` 只剩 `pages` 集合那一处（`src/content.config.ts:139`），而 `pages` 正好只有 `title`/`description` **2 个键**。所以「只认出 2 个键」这个**症状是真的，但原因不是 image，是误锁到了 pages**。真正的防法是匹配 `\.\s*object\s*\(`（点号与 `object` 之间允许换行），而不是防 image。
3. **「不剥注释会漏掉一半键」—— 对本实现不成立**。实测当前这份 config 剥不剥都是 18 个键。那句话说的是「按逗号切键」的写法。但剥注释仍然必须做，理由换成真的：**块注释里不带 `*` 前缀的被注释字段行（如 `retiredField: z.string(),`）和真键长得一模一样，不剥就等于把放行名单放宽**（用例：注释掉一个字段、内容里写它 → 不剥注释则假绿判 0，剥了才判 1）。

**解法**：跳过结构性键 `loader`/`schema`，取第一个非结构性键（`title`）的缩进作基准，只收同级缩进、遇更小缩进即止（prettier 不改变同级缩进，所以稳定）；先剥注释再识别；**同时**要空掉字符串字面量内容再配平（字符串里的 `{`/`}` 会破坏配平，保留引号与换行即可）；允许键集合从源文件解析、不在门禁里手抄。退出码分 `0` 全认识 / `1` 有未知键 / `2` 门禁自身故障；**空内容目录判 2 不判绿**——「内容没同步」与「内容干净」在输出上是同一个假绿。（D-0167 · D-0179 勘误）

### 2.4 按「使用率 0」删除 optional 字段，会让用 `&&` 判断的消费方全站关闭

**现象**：若按「实测使用率 0」删掉 `toc` / `donate` / `author`，86 篇文章页会同时失去目录、赞赏与作者卡。

**根因**：`MarkdownLayout.astro:169-172` 用真值判断（`frontmatter.toc && <Toc/>`）；字段被移除后是 `undefined`，整块不再渲染。旧 schema 的 `default(true)` 在 `optional` 内仍然生效（zod 4.6.5 实测）。**没人显式写 ≠ 默认没生效**；`tabs` / `fancybox` 用 `!== false`，`undefined` 反而安全，`toc` 这类用 `&&`，删掉就是全站关闭。

**解法**：保留字段并默认 `true`；改 schema 前先 `grep` 消费方，按「`&&` 真值判断」与「`!== false`」两类分别评估，不能只看内容仓里有没有人显式写这个键。（D-0020）

### 2.5 用文件 mtime 判「数据是否过期」，在 CI 里恒为通过

**现象**：`scripts/verify-data.mjs` 对 `friends-articles.json` 设 `freshnessFrom: "mtime"`，本地跑报「3.5 天前」，一切正常；而该文件 git 提交时间实际是 **144.8 天前**。

**根因**：`git clone` / `actions/checkout` 把**所有文件的 mtime 重置为检出时刻**。在 CI 里 mtime 永远是「刚刚」，所以任何基于 mtime 的新鲜度过期检查在流水线中恒绿。这和 fetch 脚本静默 `exit 0` 叠加，导致 `albums.json` 陈旧 6 个月、`douban.json` 5.5 个月都无人发现 —— 两道防线同时失效。

**解法**：新鲜度基准改用 **git 提交时间**（`git log -1 --format=%ci -- <file>`），只在文件未入库（untracked）时回退 mtime，并在输出里标明用的是哪一种基准。**判据层面**：凡「以文件 mtime 为基准的时间判断」在 CI 中都不可信，要么用 git 时间，要么用文件内容里的时间戳字段。（D-0180 补记）

---

## 3. Astro 构建

### 3.1 `manualChunks` 把所有依赖塞进 vendor，会让动态 `import()` 完全失效

**现象**：源码里本来就是 `await import()` 的 Waline（Vue 29KB）、fancybox（37.9KB）、marked（13.3KB）全部出现在首屏，文章页首屏 JS 达 121.6KB。

**根因**：`astro.config.mjs` 的 `manualChunks` 对 `node_modules` 一律 `return "vendor"`。懒加载专用的包被并进同一个 chunk 后，Rollup 只能让首屏整块加载——**分包策略把动态 import 抵消了**。

**解法**：删掉 `return "vendor"` 兜底（保留 `@waline` 按 pageview 拆分、`astro-icon` 的既有规则），其余交给 Rollup 自动切分。实测 article 121.6→32.1、list 114.7→21.7、page 116.5→23.5（gzip）；随后把 A6 门禁收紧为 40/28/30，并验证评论与灯箱的懒加载路径与旧构建逐项一致。（D-0052）

### 3.2 在 `@import` 之前插入规则，会让其后整条样式链静默失效

**现象**：预览站「基础样式还在，组件自己的绑定样式没了」——卡片没有背景和网格、body 没有底色；构建不报错、页面也不 404。

**根因**：修 Expressive Code 行号对比度时，把 `:root { --ec-lineNumbers-fg: … !important }` 插到了 `src/styles/global.css` 第一行。CSS 规范要求 `@import` 出现在所有规则之前，前面有普通规则会让其后所有 `@import` 失效——`components.css`、pagefind、transitions、loading 等 8 份样式整份没进构建。

**解法**：把普通规则移出 `@import` 之前，产物 CSS 从 34.6KB 恢复到 106.9KB、变量声明 92→495。改这类文件先用 `grep -n '@import'` 确认位置，并核对产物体积有没有异常缩小；另加 A17「全局样式链完整」门禁（CSS 合计 >60KB、必须出现 `--color-bg:`/`--pf-`/`--search-text-subtle`）。注意构建其实打了 17 条 CSS 警告，靠人看日志不算门禁。（D-0063、D-0065）

### 3.3 `persistAssets: true` 会把上一页的 CSS 留在 head，让共用类名跨页串味

**现象**：从首页 SPA 点进 `/blog/`，文章卡标题是 18px/400、卡片高 562px；直接打开 `/blog/1/` 却是 30px/600、卡片高 660px。强刷后正常。

**根因**：为了「不闪裸页」把 `updateHead` 设成 `{awaitAssets:false, persistAssets:true}`。`persistAssets` 让上一页的样式表留在 `<head>` 里，首页 `HomeContent.css` 的 `.post-card-title{font-size:var(--text-lg);font-weight:400}` 继续命中列表页的同名元素。

**解法**：改为 `{awaitAssets:true, persistAssets:false}`，等新页样式就位再替换内容并移除旧表；保留 `preload`/`progress`/0.2s 淡入，换页只多 50–70ms。排查手法：把「直开」与「SPA 进」的同一元素 computed style 做对比，再枚举命中规则及其来源 sheet。共用类名必须先收进作用域（如 `.home-page`）再并入全局，否则直开时同样串味。（D-0081、D-0083）

### 3.4 CSP 与脚本加载方式不成对维护，统计脚本会被静默拦下

**现象**：首页和文章页 console 各两条 CSP violation，`umami.marxchou.com/script.js` 与 `www.googletagmanager.com/gtag/js` 都被 `script-src` 拦下；生产站 v1 的 CSP 一字不差，两个站的统计大概率一直是空的。

**根因**：`Analytics.astro` 用 `type="text/partytown"`，但 partytown 仍在主线程发起请求，来源必须写进 `script-src`；而 CSP 组件只把 umami 放进了 `connect-src`。换加载方式（普通 → partytown/动态注入）时最容易漏 `script-src`。

**解法**：`script-src` 按配置动态拼，放行 `umami.umamiBaseUrl` 与 `www.googletagmanager.com`（仅开关打开时）；`connect-src` 补 GA 采集端点；补 `worker-src 'self' blob:`（partytown 的 worker 是 blob URL）。这类错误只在浏览器 console 出现，构建、Lighthouse、门禁都看不见——每个验收应带一条「console 0 error」断言。（D-0076）

---

## 4. CI 门禁与探针

### 4.1 性能预算只累加 `<script src>`，会漏掉整块 vendor chunk（5.8KB vs 121.6KB）

**现象**：移除 ClientRouter 后，`scripts/gates/perf-budget.py` 报文章页首屏 JS 只有 5.8KB，门禁全绿；真实首屏 JS 是 121.6KB。

**根因**：脚本只累加 HTML 里 `<script src>` 的直接引用，**漏掉整块 vendor chunk**。移除 ClientRouter 后入口脚本很小，但静态 import 链拉进来的 vendor 没被计入，测量工具本身失效。

**解法**：从每个 entry 出发递归跟随**静态** import（`from"./x.js"` / `import"./x.js"`），动态 `import()` 视为懒加载不计，外链 CDN 不计。修正后 article 121.6 / list 114.7 / page 115.8 KB。A6 的 15KB 目标就是建立在错误口径上的，必须随口径重定。（D-0050）

### 4.2 上游 lint 失败会让后续门禁全部 skipped，而 GitHub 界面不报红

**现象**：`origin/main` 的 CI `test` job 从 `83d6e86` 起在 Lint 步失败，其后的 type-check、unit、Atom 门禁、Inventory 门禁**全部 skipped**——四道门禁事实上停摆，GitHub 界面上却不显示为红。

**根因**：仓库无 pre-commit hook（无 husky/lint-staged），`format:check` 只在 CI 跑；各卡 worker 用 write_file/patch 直接落 `.astro`/`.ts`，收尾只跑 node 门禁脚本，格式债积累到 38 个文件。

**解法**：`prettier -w .` 清零（逐文件比对确认 37 个文件无逻辑变化）；把 `format` 固化为每卡门禁束第一条；登记 R-43「skipped 不能当 PASS」的台账口径；不加 pre-commit hook（`.git/hooks` 不进版本库、多 clone 不同步，反而制造「本地绿、CI 红」）。（D-0113）

### 4.3 e2e 写了但不在任何 workflow 里，等于没有回归防护

**现象**：`e2e/pages-radio.spec.ts` 的 11 条断言全部通过，但播放器的全部确定性断言只在本地跑过；`/radio/` 在 CI 里没有任何覆盖。

**根因**：`ci.yml` 只跑 `design-atoms.*` / `pages.visual` / `pages-states.visual`，`a11y-pr.yml` 的 route 清单也没有 `/radio/`。这与「有 e2e 覆盖」的字面说法不冲突，但在**回归防护**上不成立。

**解法**：把「spec 是否在 workflow 的 command 或 route 清单里」当作覆盖判据，而不是「repo 里有没有这个文件」；要么接进 CI（属 CI 成本决策，需 PO），要么在文档里明确登记为「本地专用、无回归防护」，不要写成已覆盖。（D-0172）

### 4.4 探针用裸字符串判断元素存在，会把 439 个文件误判为红

**现象**：探针按裸字符串判断页面是否含某功能，结果 439 个文件全部被误判报红（假红），排查方向被带到「站点到处都有这个元素」。

**根因**：裸字符串会命中文案 JSON、注释、`id`/`class` 名、内联脚本里的变量名，**不等于 DOM 节点存在**。例如 `site-player` 字符串只出现在文案块的 `id="site-player-copy"`，而真正的 `<site-player>` 元素数是 0。

**解法**：用 DOM 节点正则（如 `<(site-player)\b`）判定元素，而不是裸字符串；把「元素数」与「文案出现」分成两条断言。可复用范例是 D-0174 的产物自检：`<site-player` 节点 0，字符串仅出现在 `id="site-player-copy"` 文案里；线上验收也应按状态码 + 内容特征双判，不靠字符串搜索。（D-0178；判据示例见 D-0174）

### 4.5 `A && B || true && C` 左结合，会让 A 的失败被 `|| true` 吞掉

**现象**：构建步骤里 A 失败，但整条命令仍继续跑到 C，流水线看起来正常，实际 A 的错误被吞掉。

**根因**：shell 的 `&&` 与 `||` 同优先级且左结合，`A && B || true && C` 实际解析成 `((A && B) || true) && C`；`|| true` 把 A 的失败改写成了成功，后续步骤照常执行。

**解法**：只给明确可容忍的步骤加容错，并显式分组——如 D-0174 补记里的 `(fetch:all || true)` 各自括号包起来；守契约的 normalize 保持硬失败。复杂条件用 `if A; then B; fi` 分步写，不靠一行 `&&`/`||` 串联。（D-0178；修法示例见 D-0174 补记）

---

## 5. Docker 与构建环境

### 5.1 在 Linux 容器里挂宿主 `node_modules`，rolldown 原生二进制会直接崩

**现象**：在 `mcr.microsoft.com/playwright:v1.63.0-noble` 容器里生成 Linux 视觉基线，复用宿主的 `node_modules` 后构建直接失败，报 `✗ empty 构建失败`。

**根因**：`rolldown` 是原生二进制，macOS 版在 Linux 容器里不能执行；`node_modules` 里装的平台特定 optional dependency 也不会因为换容器而重装。

**解法**：用命名卷装 Linux 依赖——`-v zcblog-linux-nm:/work/node_modules`，容器内跑 `pnpm install --frozen-lockfile`（35.6s）；不要挂宿主目录。生成后不带 `--update-snapshots` 连跑第二遍验证稳定性（36 passed / maxDiffPixels 0）。（D-0173）

### 5.2 回滚后直接请求已删除的静态文件仍返回 200，因为边缘对象缓存还在

**现象**：回滚演练里把部署从 B 切回 A 后，直接请求 B 才有的静态文件仍返回 200，看起来像「回滚没生效」。

**根因**：CF Pages 的回滚只是部署指针切换，边缘节点上的对象缓存仍持有旧文件；状态码不能证明当前产物是哪一份。

**解法**：验收 URL 加 `?x=<ts>` 穿透缓存再请求，确认删除的文件变 404；回滚 RTO 用 API 计时（实测 0.6s，边缘数秒生效）。涉及「删文件」的部署，验收必须带缓存穿透参数。（D-0060）

---

## 6. 部署与域名

### 6.1 `SITE_URL` 只设给 IndexNow 不设给 Build，canonical/sitemap 会静默指向旧站

**现象**：站点切到 `zcblog-v2.pages.dev` 后，每个页面的 `<link rel="canonical">`、`robots.txt` 的 Sitemap、`sitemap-0.xml` 的 114 条 `<loc>` 全指向 `marxchou.com`；页面本身访问正常，HTTP 全 200。

**根因**：`deploy.yml` 里 `SITE_URL` 只在 IndexNow 那一步设了，**Build 步骤没传**；`astro.config` 的 canonical / sitemap / robots 都读它，取不到就回落到 `src/config/site.ts:78` 的默认值 `https://marxchou.com`。`demo.yml` 反而是对的（`SITE_URL: ${{ env.DEMO_URL }}`）。

**解法**：Build 步骤显式加 `SITE_URL: https://zcblog-v2.pages.dev`；验收清单必须包含 `<head>` 元信息（canonical / og:url / robots / sitemap），不能只看 HTTP 200 和 DOM 节点。后果不是「链接错了」而是「新站主动把权重让给旧站」，搜索引擎会判重复内容而不索引。（D-0175 补记）

### 6.2 验收只看状态码和 DOM 节点，抓不到「节点在、内容是几个月前的」

**现象**：首页、文章页、`/radio/` 等六条关键路径全 200，DOM 特征也对，但 `douban.json`（5-29）、`albums.json`（5-07）、`bangumi.json`（6-22）都是几个月前的静态快照。

**根因**：验收口径只有「HTTP 状态码 + 页面里有没有某个节点」，没有时间维度；更糟的是六个 fetch 脚本（talks/douban/friends/bangumi/popular/site-stats）缺环境变量时全部 `process.exit(0)`，CI 永远绿。这类故障的特征是**不报错、不空白、不失败**，可以无限期存在。

**解法**：站点验收三问——① 能不能访问（状态码）② 页面对不对（DOM/文本特征）③ **内容新不新（`src/data/*.json` 的 git 日期/时间戳 vs 上游）**。第三个不看，前两个全绿也可能是烂站；同时把「区块空着」与「区块有内容但陈旧」分开记录，二者修复优先级完全不同。（D-0175 补记）

---

## 7. macOS/BSD 与 Git 工具链

### 7.1 macOS 自带 BSD grep 不支持 `-P`，`\u` 会被当字面量

**现象**：在 macOS 上用 `grep -P` 做 Unicode/中文匹配，命令不按预期工作：`-P` 不被支持，`\uXXXX` 被当成字面量 `uXXXX`，匹配为空或直接报错。

**根因**：macOS 自带的是 BSD grep，没有编译 PCRE 支持，`-P` 不存在；`\uXXXX` 不是 POSIX 正则转义，它会把 `\u` 当成字面量 `u`。

**解法**：改用 `rg`（ripgrep）、`perl -CSD -ne`，或 POSIX 字符类 `[[:alpha:]]` 等可移植写法。门禁脚本和一次性探针都不要假设 GNU grep；本地验证过的命令要同时在 CI 的 Linux 上跑一遍。（D-0178）

### 7.2 `.gitignore` 只认 `#` 注释，写 `/* */` 会被当模式误伤文件

**现象**：在 `.gitignore` 里按代码习惯写 `/* ... */` 注释，被注释的路径仍被忽略，或注释块本身被当成匹配模式，误伤了本来要跟踪的文件。

**根因**：`.gitignore` 的注释只支持行首 `#`；`*`、`/`、`?` 都是模式语法，`/* */` 会被解析成一条匹配规则，而不是注释。

**解法**：注释一律用 `#`；改完用 `git check-ignore -v <path>` 查到底是哪一条规则命中，不要靠猜。同类问题也适用于 `.dockerignore`、`.prettierignore` 等 ignore 文件。（D-0178）

### 7.3 macOS 大小写不敏感、Git 区分大小写、Astro slug 转小写，混合大小写文件名会被误判缺失并撞 URL

**现象**：内容仓的 `typoraImg-tool.md`（大写 I）与 v2 的 `typoraimg-tool.md`（小写 i）被当成「缺一篇文章」，实际是同一个文件；另外，大小写不同的两个文件名会撞进同一个 URL。

**根因**：macOS 文件系统大小写不敏感，本地看到的是同一个文件；Git 区分大小写，index 里可以是两个路径。同时 Astro 的 glob loader 生成 slug 时会把文件名转小写（`dist/article/` 与生产 sitemap 都是全小写），所以 `typoraImg-tool` 与 `typoraimg-tool` 最终是同一个 URL。

**解法**：对照「缺文章」时先 `git ls-files` 看真实大小写，不要用 Finder 或本地路径判断；新增文章文件名统一小写，避免混合大小写带来的误判与 URL 冲突。（D-0174；D-0036）

### 7.4 软链根 `node_modules` 到临时 monorepo，`pnpm exec` 会按 realpath purge 真仓

**现象**：为让临时 monorepo 里的 `changeset pack` 找到依赖，把根 `node_modules` 软链进去；`pnpm exec` 随后按 realpath 清理，把**真仓**的 `node_modules` purge 掉了（本次已发生并恢复）。

**根因**：pnpm 解析 symlink 到真实路径后再执行清理/安装，临时目录里的操作实际作用在真仓上；软链看起来只是「借用」，实际把目标目录暴露给了写操作。

**解法**：临时副本里改 `package.json` 删掉 `prepack`，不软链依赖；真仓先确保三包 `dist/tokens.css` 存在（缺了跑 `build-packages.mjs`）。已写入 `docs/release.md` 已知限制——不要用软链把有写操作的目录借给临时工作区。（D-0122）

---

## 8. 服务与凭据

### 8.1 `DISPATCH_PAT` 只覆盖一个仓，向另一个仓 dispatch 会失败

**现象**：给文章仓加 `notify.yml` 后，向 `zcblog-v2` 发 `repository_dispatch` 失败；v2 的自动同步实际上没有触发。

**根因**：`DISPATCH_PAT`（2026-05-30 创建）只覆盖 `Smart-Chou/zcblog`，没有 `zcblog-v2` 的权限；`notify.yml` 只 dispatch 了旧仓。表面上「配置了自动通知」，实际目标仓收不到。

**解法**：v2 改靠自身 `push main` 自动部署，需要时手动 `gh workflow run deploy.yml -R Smart-Chou/zcblog-v2`；`notify.yml` 里那条注释掉并写明原因，不做成「每次打印一条失败日志」的样子——失败的告警会让人失去对告警的信任。将来补到覆盖两仓的 PAT 再取消注释。（D-0175）

### 8.2 CF API token 没有 purge 权限，HTML 边缘缓存就只能压到 300s

**现象**：想沿用 zone 默认把 HTML 边缘缓存设成 7200s，但 `POST /purge_cache` 返回 **401**；没有 purge 能力，发版后读者可能长时间看到旧页面。

**根因**：API token 没有 purge 权限，拿不到主动清缓存的能力；没有 purge，就必须把最坏陈旧窗口压到「能人工等」的量级。

**解法**：HTML 走 edge cache 300s、feeds 继续 bypass cache；把 300s 作为当前证据下唯一安全值，提到 3600s 之前先打通 purge 权限。改缓存规则前存 JSON 快照（`docs/_data/cf-cache-rules-before-*.json`），可一次 PUT 还原。（D-0047）
