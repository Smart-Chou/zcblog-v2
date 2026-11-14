# Dogeared（折角）

> 可发布的 Astro 博客主题：原生 CSS + design tokens、M3E 组件、10 locale、64 atoms、
> 独立文档站，以及 `create-site` 装配器。`marxchou.com` 是第一个客户，不是唯一客户。

**是什么** —— 一个可发布的 **Astro 博客主题**（主题名 Dogeared，包名 `@marxchou/dogeared-*`）：原生 CSS + design tokens，没有 Tailwind、没有前端框架组件，配 `create-site` 装配器和一个独立文档站。
**给谁用** —— 想自托管一个内容型博客、又不想被第二套设计系统绑架的人；以及想看「一个主题怎么当产品做」的开发者：治理规则、门禁、像素基线全在仓里。
**当前状态** —— 生产站 <https://zcblog-v2.pages.dev> 在跑（Cloudflare Pages），三个包已发布到 npm，**欢迎 issue 和 PR**（见 [参与贡献](#参与贡献)）。

## 消费者入口

```bash
git clone https://github.com/Smart-Chou/zcblog-v2.git dogeared
cd dogeared
corepack enable
pnpm install --frozen-lockfile

# 用 apps/demo 作为最小 overlay 基线，输出到独立目录
SITE_URL="https://your-site.example.com" \
  node scripts/create-site.mjs --overlay apps/demo --out ../my-site --build --install
```

真实站点请复制一个 overlay，替换 `src/config/{site,feature,ui,services}.ts`、内容和数据；
`apps/demo` 只是示例，不是你的站点身份。升级主题时 overlay 不会被覆盖。

- 主题装配/overlay 契约：`docs/overlay-contract.md`
- 只消费 npm 包：`docs/npm-consumer.md`（接入 §1–§4，升级 §5，回滚 §6，Node 22/24 × macOS/Linux 矩阵 §7）
- 升级与版本：`docs/upgrade.md`
- 示例站部署：`apps/demo/README.md`（线上预览 <https://demo.zcblog-v2.pages.dev>）
- 外部消费者验收记录：`docs/_reviews/M5-2/report.md`
- npm `latest`（2026-11-06）：`@marxchou/dogeared-tokens@2.1.2`、`@marxchou/dogeared-og-image@2.1.2`、`@marxchou/dogeared-ui@2.1.2`（三包均已公开）

## 参考站点：Marx's Blog

[marxchou.com](https://marxchou.com) — 基于 Astro 构建的个人博客网站，支持文章、标签、归档、相册、番剧追踪、随笔、友链、豆瓣书影音、捐赠等功能。

## 功能特性

- **响应式设计** — 适配各种设备尺寸，自定义 CSS 变量系统
- **深色/浅色模式** — CSS 自定义属性 + `prefers-color-scheme` 媒体查询 + 手动切换
- **文章管理** — 支持 Markdown 和 MDX 格式，含阅读时间、字数统计、相邻文章导航
- **标签系统** — 文章标签分类与聚合页面
- **归档页面** — 按时间线展示所有文章
- **Markdown 扩展** — Mermaid 图表、PlantUML、KaTeX 数学公式、Chart.js、Markmap 思维导图、Reveal.js 幻灯片、GitHub 卡片、自定义提示（Asides）、标签页（Tabs）、图片网格、内容加密
- **代码高亮** — Expressive Code，支持行号、代码折叠、复制按钮、语言标识
- **搜索功能** — Pagefind 构建时索引，客户端全文搜索
- **SEO 优化** — 自动生成 Sitemap（多语言）、OG/Twitter/JSON-LD Meta 标签、robots.txt；部署完成后自动向搜索引擎推送新/更新文章（IndexNow：Bing / Yandex / Seznam / Naver / Yep）
- **RSS 订阅** — 中文和英文独立订阅源（另提供 Atom 与 JSON Feed），含阅读时间和字数
- **热门文章** — 首页「近期热门」榜：基于 Umami 近 30 天访问数据，构建期每日自动同步
- **OG 图片** — 使用 Satori + Sharp 在构建时自动生成社交分享卡片
- **多语言** — 中英文双语：界面与内容双层隔离；英文文章以 `<slug>-en.md`（`lang: en`）发布，自动路由 `/en/article/<slug>/`，翻译对互标 hreflang、语言切换器直达对照版，中英列表/归档/标签/相关文章/订阅源完全隔离
- **评论系统** — Waline 自托管评论，支持表情反应与搜索
- **网站分析** — Umami 自托管统计分析
- **页脚计数** — Umami 全站浏览计数：构建期同步 + 访问时实时追平（公开 Share 链接，无需账号）
- **文章分享** — 一键分享到微信（扫码）/ 微博 / QQ空间 / 豆瓣 / X / Telegram / Facebook / Reddit；移动端支持系统分享；无第三方脚本，二维码构建时生成
- **PWA** — Service Worker 离线缓存，自动更新，可安装为桌面应用
- **相册功能** — Fancybox 灯箱相册展示
- **番剧追踪** — 追番记录展示（Bangumi 数据源）
- **豆瓣书影音** — 豆瓣在读/看过/想看展示
- **随笔** — Blinko 随笔展示
- **友链** — 友情链接与友链文章聚合（Foreverblog RSS）；支持 GitHub Issue 表单自助申请与自动审核合并
- **捐赠功能** — 支付宝 / 微信支付 / PayPal
- **外链重定向** — 外部链接经确认页面中转，防止用户无感知离开
- **公告栏** — 可配置顶部公告（支持 localStorage 持久关闭）
- **水印** — 可选页面水印
- **阅读进度条** — 粘性顶部进度条，CSS 滚动驱动动画
- **返回顶部** — 文章页返回顶部按钮
- **中日韩文字排版优化** — Pangu 自动在中英文之间添加空格
- **自托管字体** — DM Sans / DM Serif Display 本地托管，无第三方字体请求
- **图片 CDN** — 正文图片托管于 Cloudflare R2（s3.marxchou.com），边缘缓存加速；图床/相册图片经 Cloudflare Image Transformations 输出按需缩略图
- **View Transitions** — Astro 视图过渡动画

## 技术栈

| 类别 | 技术 |
| ---- | ---- |
| **框架** | Astro 7.x（静态站点生成，Vite 7） |
| **CSS** | 原生 CSS + design tokens（无 Tailwind） |
| **语言** | TypeScript（严格模式） |
| **内容** | MDX + Remark/Rehype 插件流水线 |
| **图标** | Astro Icon（Iconify JSON: Logos / MingCute / Tabler） |
| **代码高亮** | Expressive Code（行号 + 可折叠区域插件） |
| **评论** | Waline（自托管） |
| **搜索** | Pagefind（构建时索引） |
| **分析** | Umami（自托管） |
| **PWA** | vite-plugin-pwa（Service Worker + 运行时缓存） |
| **OG 图片** | Satori + Sharp |
| **数学公式** | KaTeX（rehype-katex + remark-math） |
| **打字排版** | Pangu（中英文自动空格） |
| **灯箱** | Fancybox UI |
| **性能** | Partytown（第三方脚本卸载到 Web Worker） |
| **视图过渡** | astro-vtbot |
| **部署** | Cloudflare Pages（demo/预览）· GitHub Pages / Vercel（可选目标） |
| **CI/CD** | GitHub Actions |
| **单元测试** | Vitest |
| **E2E 测试** | Playwright |
| **格式化** | Prettier + prettier-plugin-astro |
| **版本管理** | standard-version |
| **包管理** | pnpm（强制使用） |

## 目录结构

```text
/
├── .github/workflows/         # CI 与部署工作流
├── .claude/                   # AI 辅助配置与设计规范（DESIGN.md、PRODUCT.md）
├── public/                    # 静态资源（favicon、logo、文章图片、字体等）
├── scripts/                   # 构建/数据获取脚本
│   ├── fetch-talks.mjs        # 从 Blinko API 拉取随笔
│   ├── fetch-douban.mjs       # 从豆瓣拉取书影音
│   ├── fetch-friends.mjs      # 从 Foreverblog RSS 拉取友链文章
│   ├── fetch-bangumi.mjs      # 从 Bangumi/MAL 拉取番剧数据
│   ├── generate-icons.js      # 生成 PWA 图标
│   ├── verify-data.mjs        # 构建前验证抓取数据
│   ├── link-check.mjs         # 死链检查
│   ├── new-post.sh            # 创建新文章脚本
│   └── lib/                   # 共享工具函数
├── src/
│   ├── assets/                # 源码资源（字体、二维码、封面图）
│   ├── components/            # Astro 组件
│   │   ├── Article/           # 文章组件（PostCard、Toc、Breadcrumb、PostMeta、PostShare 等）
│   │   ├── Bangumi/           # 番剧追踪 UI
│   │   ├── BaseHead/          # SEO Head 组件
│   │   ├── Content/           # 目录组件（TableOfContents）
│   │   ├── Douban/            # 豆瓣书影音
│   │   ├── Gallery/           # 相册组件（Fancybox 灯箱）
│   │   ├── Icons/             # 自定义图标
│   │   ├── Index/             # 首页组件（Hero、RecentArticles 等）
│   │   ├── Layout/            # 布局组件（Header、Footer、Nav 等）
│   │   ├── Pages/             # 独立页面组件（HomeContent、ArchiveContent 等）
│   │   └── UI/                # 通用 UI（Author、Donate、WalineComment、Notice、Watermark 等）
│   ├── config/                # 集中配置
│   │   ├── index.ts           # 统一导出
│   │   ├── site.ts            # 站点元数据、作者、图床、页面配置
│   │   ├── feature.ts         # 功能开关（评论、搜索、分析、捐赠、水印、公告栏、分享）
│   │   └── ui.ts              # 导航、社交链接、页脚配置
│   ├── content/               # Astro 内容集合
│   │   ├── article/           # 文章 Markdown/MDX（本地开发副本，当前 85 篇）
│   │   └── pages/             # 独立页面（cookies、copyright、privacy-policy）
│   ├── content.config.ts      # 内容集合 Zod Schema 定义
│   ├── data/                  # JSON 数据源
│   │   ├── albums.json        # 相册数据
│   │   ├── bangumi.json       # 番剧追踪数据
│   │   ├── douban.json        # 豆瓣书影音数据
│   │   ├── friends.json       # 友链列表
│   │   ├── friends-articles.json # 友链文章聚合
│   │   ├── talks.json         # 随笔（Blinko）
│   │   ├── donators.json      # 捐赠者列表
│   │   ├── typewriter.json    # 打字机效果文本
│   │   └── i18n/              # 国际化翻译（zh.json、en.json）
│   ├── integrations/          # 自定义 Astro 集成
│   │   ├── redirect.ts        # 外链重定向集成
│   │   ├── pagefind.ts        # Pagefind 搜索索引集成
│   │   ├── og-image.ts        # OG 图片生成集成
│   │   └── og-image-route.ts  # OG 图片路由处理
│   ├── layouts/               # 页面布局
│   │   ├── BaseLayout.astro   # 基础 HTML 结构（Header、Footer、Notice）
│   │   ├── MarkdownLayout.astro # 文章布局（Toc、相关内容、评论、捐赠）
│   │   └── PostLayout.astro   # 轻量文章包装
│   ├── pages/                 # Astro 路由页面
│   │   ├── index.astro        # 首页
│   │   ├── 404.astro          # 404 页面
│   │   ├── 500.astro          # 500 页面
│   │   ├── robots.txt.ts      # 动态 robots.txt
│   │   ├── rss.xml.ts         # RSS 订阅源
│   │   ├── redirect.astro     # 外链重定向中转页
│   │   ├── [...custom].astro  # 独立页面通配路由
│   │   ├── article/           # 文章详情页
│   │   ├── blog/              # 分页博客列表
│   │   ├── tags/              # 标签页面
│   │   ├── archives/          # 归档页面
│   │   ├── albums/            # 相册页面
│   │   ├── bangumi/           # 番剧追踪页面
│   │   ├── talks/             # 随笔页面
│   │   ├── friends/           # 友链页面
│   │   ├── donate/            # 捐赠页面
│   │   ├── douban/            # 豆瓣页面
│   │   └── en/                # 英文镜像页面
│   ├── remark-plugin/         # 自定义 Remark/Rehype 插件
│   │   ├── remark-align.ts    # 内容对齐
│   │   ├── remark-asides.ts   # 自定义提示框
│   │   ├── remark-code-blocks.ts # 代码块增强
│   │   ├── remark-encrypted.ts # 内容加密（remark 阶段）
│   │   ├── remark-github-card.ts # GitHub 仓库卡片
│   │   ├── remark-image-grid.ts  # 图片网格布局
│   │   ├── remark-include.ts  # 文件引入
│   │   ├── remark-inline-syntax.ts # 行内语法扩展
│   │   ├── remark-tabs.ts     # 标签页组件
│   │   └── rehype-encrypted.ts # 内容加密（rehype 阶段，AES-256-GCM）
│   ├── schemas/               # Zod 数据校验 Schema
│   ├── scripts/               # 客户端 TypeScript/JavaScript
│   │   ├── chart-renderer.ts  # Chart.js 渲染
│   │   ├── markmap-renderer.ts # Markmap 思维导图渲染
│   │   ├── reveal-renderer.ts # Reveal.js 幻灯片渲染
│   │   ├── fancybox-*.ts      # Fancybox 灯箱处理
│   │   ├── search-template.js # Pagefind 搜索模板
│   │   ├── tabs.ts            # 标签页交互
│   │   ├── share.ts           # 分享交互（微信弹层 / 复制链接 / 系统分享）
│   │   ├── heatmap.ts         # 热力图
│   │   └── redirect-handler.ts # 重定向处理
│   ├── styles/                # CSS 样式（~22 个文件）
│   │   ├── variables.css      # 设计变量（字体、颜色、间距、阴影）
│   │   ├── fonts.css          # 自托管字体（DM Sans / DM Serif Display）
│   │   ├── global.css         # 全局样式入口
│   │   ├── base.css           # 基础样式
│   │   ├── reset.css          # CSS Reset
│   │   ├── typography.css     # 排版样式
│   │   ├── components.css     # 组件样式
│   │   ├── home.css           # 首页样式
│   │   ├── toc.css            # 目录样式
│   │   ├── markdown-extend.css # 文章扩展样式（mermaid/plantuml/chart 等）
│   │   ├── remark-aside.css   # 提示框（callout）双主题样式
│   │   └── ...                # 其他覆盖/扩展样式
│   ├── types/                 # TypeScript 类型定义
│   └── utils/                 # 工具函数（16 个文件）
│       ├── article-stats.ts   # 文章统计
│       ├── adjacent-posts.ts  # 相邻文章
│       ├── date-utils.ts      # 日期处理
│       ├── git-date.ts        # Git 日期
│       ├── image-utils.ts     # 图片处理
│       ├── i18n.ts            # 国际化
│       ├── encrypt.ts         # 加密解密
│       ├── fancybox.ts        # Fancybox 初始化
│       └── post-meta/         # 阅读时间等元数据
├── e2e/                       # Playwright E2E 测试
│   ├── smoke.spec.ts          # 冒烟测试
│   ├── navigation.spec.ts     # 导航测试
│   ├── theme.spec.ts          # 主题切换测试
│   ├── i18n.spec.ts           # 国际化测试
│   ├── article.spec.ts        # 文章页测试
│   ├── search.spec.ts         # 搜索功能测试
│   └── interactions.spec.ts   # 交互测试
├── astro.config.mjs           # Astro 框架配置
├── content.config.ts          # 内容集合 Schema
├── package.json               # 项目依赖与脚本
├── tsconfig.json              # TypeScript 配置
├── vitest.config.ts           # Vitest 单元测试配置
├── playwright.config.ts       # Playwright E2E 测试配置
├── vercel.json                # Vercel 部署配置
├── .prettierrc.mjs            # Prettier 格式化配置
├── .editorconfig              # 编辑器配置
└── .env.example               # 环境变量示例
```

## 项目结构导览

上面那棵树回答「有什么文件」；这一节回答「我想改 X，该看哪份文档」。README 是消费者视角，**真源在 `AGENTS.md` + `rules/` + `docs/`**——说法冲突时以它们为准。

### 想知道 X 该看哪

| 我想… | 看这里 |
| ---- | ---- |
| 改视觉 / 配色 / 字号 | [`docs/DESIGN.md`](docs/DESIGN.md) §3 Token 体系；[`rules/component-api.md`](rules/component-api.md) |
| 加一个组件 | [`rules/component-api.md`](rules/component-api.md)；[`.agents/skills/zcblog-new-feature/SKILL.md`](.agents/skills/zcblog-new-feature/SKILL.md) |
| 改一篇文章 | 私有内容仓 `Smart-Chou/zcblog-articles`——**不是本仓**（`src/content/article/` 只是构建缓存） |
| 加 / 改 frontmatter 字段 | [`rules/content-contract.md`](rules/content-contract.md)；契约本体 `src/content.config.ts` |
| 门禁红了 | [`rules/ci-gates.md`](rules/ci-gates.md)（逐个脚本的判据 + 能不能只跑本地） |
| 改部署 / 换平台 | [`docs/deploy-matrix.md`](docs/deploy-matrix.md)；[`rules/ci-gates.md`](rules/ci-gates.md) |
| 改视觉基线（截图回归） | [`rules/visual-regression.md`](rules/visual-regression.md) |
| 加 / 改 e2e 用例 | `e2e/*.spec.ts`；视觉相关的另见 [`rules/visual-regression.md`](rules/visual-regression.md) |
| 改数据源抓取（随笔 / 豆瓣 / 番剧） | `scripts/fetch-*.mjs`；坑见 [`rules/pitfalls.md`](rules/pitfalls.md) |
| 发 npm 包 / 动版本号 | [`docs/release.md`](docs/release.md)；`pnpm verify:versions` |
| 把主题升级到别人的站点 | [`docs/overlay-contract.md`](docs/overlay-contract.md)、[`docs/upgrade.md`](docs/upgrade.md) |
| 用 AI 工具改这个仓 | [`AGENTS.md`](AGENTS.md) 先读；任务化入口在 [`.agents/skills/`](.agents/skills/README.md) |
| 踩过的坑 | [`rules/pitfalls.md`](rules/pitfalls.md)（缓存、假红、平台差异） |

### 治理三层，按这个顺序读

1. [`AGENTS.md`](AGENTS.md) —— 总纲：必遵规则、必读文档清单、验证命令。AI 编码工具进仓先读这份。
2. [`rules/`](rules/)（6 篇）+ [`docs/`](docs/)（7 篇）—— 硬约束与契约正文：组件分层、token、内容契约、门禁、视觉基线、部署矩阵。
3. [`.agents/skills/`](.agents/skills/README.md)（3 篇）—— 任务化入口（日常开发 / 加功能 / 内容运营），只回答「这次任务该读什么、跑哪些命令」。
4. 仓外还有治理仓 `blog2.0`（决策记录 `decision-log.md`，只增不改）——**只在作者本机有效**；clone 到别处时以仓内 `rules/` + `docs/` 为准。

### 双仓 + 三站，别搞混

- **本仓** `Smart-Chou/zcblog-v2`：主题 + 站点源码，`push main` 自动部署。
- **内容仓** `Smart-Chou/zcblog-articles`（私有）：文章与图片的唯一真源，推送后触发本仓重建。没有它的权限也能改主题，只是本地看不到文章。
- **三个站**：生产 <https://zcblog-v2.pages.dev>；示例 overlay <https://demo.zcblog-v2.pages.dev>；第一个客户站 <https://marxchou.com>（代码冻结，只作参考）。

### 还是找不到？

- 先搜：`rg "关键词" rules/ docs/ src/`；组件计数只认 [`docs/component-inventory.json`](docs/component-inventory.json)，别在文档里手抄第二份。
- 目录树里没列到的脚本，去 `package.json` 的 `scripts` 里找同名命令。

## 快速开始

```bash
# 安装依赖（仅支持 pnpm）
pnpm install

# 开发模式（启动开发服务器）
pnpm run dev

# 拉取外部数据 + 构建生产版本
pnpm run build

# 预览构建产物
pnpm run preview
```

> 环境要求：Node.js 22+（CI 使用 22.x）、pnpm（`packageManager` 字段锁定 `pnpm@12`）。

## 参与贡献

**这个项目欢迎 issue 和 PR** —— 报 bug、提功能、改文档、改代码都算贡献。文章内容不在本仓（真源是私有仓 `zcblog-articles`），但主题本身是开放的。

### 三种参与方式

| 我想… | 入口 |
| ---- | ---- |
| 报 bug | [新建 Bug 报告](https://github.com/Smart-Chou/zcblog-v2/issues/new?template=bug_report.yml)（`.github/ISSUE_TEMPLATE/bug_report.yml`），写清复现步骤、期望 / 实际结果、Node 与 pnpm 版本 |
| 提功能 / 提设计改动 | [新建功能请求](https://github.com/Smart-Chou/zcblog-v2/issues/new?template=feature_request.yml)（`.github/ISSUE_TEMPLATE/feature_request.yml`），先说「要解决什么问题」和使用场景 |
| 改代码 | 先读 [`CONTRIBUTING.md`](CONTRIBUTING.md)，再按下面三步跑起来 |

### 重大改动先开 issue

新功能、改设计、动 token 或组件分层、加依赖——**先开 issue 对齐方向，再写代码**。仓里的门禁很硬（颜色只走语义 token、组件分层单向、JS/CSS 预算、像素基线），方向没对齐的实现大概率在 `pnpm gates:all` 上整轮返工。issue 里写清要解决的问题，比直接贴 500 行 diff 有用。

### 最短上手路径

```bash
corepack enable   # 只支持 pnpm（package.json 锁定 pnpm@12）
pnpm install
pnpm dev          # → http://localhost:4321
```

**不需要配任何环境变量**就能起站：`.env` 不存在时所有外部数据源拉取都被跳过，页面照常渲染。两个如实的提醒：

- `src/content/article/` 是 gitignored 的构建缓存，新 clone 里是**空的**；开发服务器会打一条 `[glob-loader] The base directory ... does not exist` 的 warn，不是坏了，是没内容。
- 「随笔 / 豆瓣 / 番剧 / 热门」这些区块读的是仓里**已提交的 JSON 旧快照**（`src/data/*.json`），不是实时数据。

改完提交前，至少跑这一串（新增文件先 `git add`，否则 overlay 门禁 O1 看不见未 tracked 文件）：

```bash
pnpm format && pnpm type-check && pnpm test:unit && pnpm gates:all
```

### 改之前先读

| 文档 | 什么时候读 |
| ---- | ---- |
| [`AGENTS.md`](AGENTS.md) | 用 AI 编码工具（Claude Code / Codex / Cursor）改这个仓——**先让它读这份** |
| [`rules/`](rules/) | 硬约束：组件分层、token、内容契约、门禁、视觉基线、踩坑 |
| [`docs/DESIGN.md`](docs/DESIGN.md) | 视觉真源：§3 token / §4 分层 / §5 组件规格 / §6 禁止项 / §7 预算 |

### 不接受什么

- 引入 Tailwind、Svelte 或任何第二套设计系统（含 utility class、`@apply`、`@theme`）
- 提交 `src/content/article/` 或任何文章内容——真源是私有仓 `zcblog-articles`
- 改 `.github/workflows/deploy.yml` 的发布链路，或给门禁加 `|| true` 绕过
- 把格式化噪音、无关重排混进功能 PR（一个 PR 只做一件事，见 `CONTRIBUTING.md`）

## 可用脚本

### 开发

| 脚本 | 说明 |
| ---- | ---- |
| `pnpm dev` | 启动 Astro 开发服务器 |
| `pnpm dev:clean` | 清除 Vite 缓存后启动开发服务器 |
| `pnpm start` | 同 `pnpm dev` |
| `pnpm build` | 拉取外部数据 + 构建生产版本 |
| `pnpm preview` | 预览构建产物 |
| `pnpm type-check` | TypeScript 类型检查 |
| `pnpm new-post` | 交互式创建新文章 |

### 数据获取

| 脚本 | 说明 |
| ---- | ---- |
| `pnpm fetch:all` | 并行拉取所有外部数据（talks + douban + friends + bangumi + icons） |
| `pnpm talks` | 从 Blinko API 拉取随笔数据 |
| `pnpm douban` | 从豆瓣拉取书影音数据 |
| `pnpm friends` | 从 Foreverblog RSS 拉取友链文章 |
| `pnpm bangumi` | 从 Bangumi/MAL 拉取番剧追踪数据 |
| `pnpm icons` | 生成 PWA 图标 |
| `pnpm fetch:verify` | 验证所有抓取数据的完整性 |
| `pnpm links` | 检查文章中的死链 |

### 代码质量

| 脚本 | 说明 |
| ---- | ---- |
| `pnpm format` | Prettier 格式化所有文件 |
| `pnpm format:check` | 检查格式是否合规 |
| `pnpm lint` | 代码检查（等同于 format:check） |

### 测试

| 脚本 | 说明 |
| ---- | ---- |
| `pnpm test:unit` | 运行 Vitest 单元测试 |
| `pnpm test:unit:watch` | 以监听模式运行单元测试 |
| `pnpm test:e2e` | 运行 Playwright E2E 测试 |
| `pnpm test:e2e:ui` | 以 UI 模式运行 E2E 测试 |
| `pnpm visual:build:pages` | 用固定内容构建视觉基线用的 `dist/`（页面级基线专用，见下） |
| `pnpm test:visual:pages` | 跑 7 页 × 2 主题 × 3 视口的页面级视觉基线（42 条） |
| `pnpm visual:build:states` | 构建 `/projects/` `/devices/` `/skills/` 的 empty / error 两态到 `.visual-states/` |
| `pnpm test:visual:states` | 跑状态级视觉基线（3 页 × 2 态 × 2 主题 × 3 视口 = 36 条） |

#### 视觉基线（截图回归）

两套像素基线，**平台各自独立**（字体栈不同，跨平台比对无意义）：

| 套件 | 覆盖 | 基线目录（macOS / Linux） | 阈值 |
| ---- | ---- | ---- | ---- |
| `/design/atoms` | 12 个原子 × 3 视口 × 2 主题 = 72 | `e2e/__screenshots__/design-atoms{,‑linux}/` | macOS 1% / Linux 0 px |
| 页面级（V-0） | 7 页 × 3 视口（375/768/1280）× 2 主题 = 42 | `e2e/__screenshots__/pages{,‑linux}/` | macOS 0.1% / Linux 0 px |
| 状态级（§7.2） | 3 页 × 2 态（empty/error）× 3 视口 × 2 主题 = 36 | `e2e/__screenshots__/pages-states{,‑linux}/` | macOS 0.1% / Linux 0 px |

页面级覆盖的 7 页：`/`、`/article/beszel-server-monitoring-guide/`、`/archives/`、`/albums/`、`/culture/`、`/projects/`、`/404/`。状态级覆盖 `/projects/`、`/devices/`、`/skills/` 的 empty 与 error 分支。Linux 集必须在 CI 用的同一个镜像里生成，与 macOS 集互不比较。

**三套基线各自计数，不要把数字合并**：`ci.yml` 里 `atoms 72` / `pages 42` / `states 36` 是三条独立硬断言。合成一个总数时，某一套整体被 skip 或少跑仍然会是绿的。

**为什么页面级基线要先单独构建**：页面内容来自私有内容仓，多加一篇文章就会让首页/归档/热门列表整体位移。所以页面级基线跑在 `e2e/fixtures/pages-visual/` 的固定文章上，由 `CONTENT_ARTICLE_BASE` 指向该目录构建（常规构建/部署不设置此变量，行为不变）。所有 fixture 文章必须带 `upDate`，否则构建时间会进入像素。

生成/更新流程（**必须人工看 diff，CI 永不自动更新基线**）：

```bash
# 1. 用固定内容构建（会覆盖 dist/；完成后如需正常预览请重新 pnpm build）
pnpm visual:build:pages

# 2. macOS 基线
pnpm exec playwright test e2e/pages.visual.spec.ts --update-snapshots

# 3. Linux 基线（必须在这个镜像里跑，和 CI visual job 同一个 tag）
docker run --rm --ipc=host -v "$PWD":/work -w /work \
  -e PLAYWRIGHT_BASELINE_PLATFORM=linux \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -lc 'corepack enable && corepack pnpm install --frozen-lockfile && \
            node scripts/visual/build-pages-baseline.mjs && \
            corepack pnpm exec playwright test e2e/pages.visual.spec.ts --update-snapshots'

# 4. 复核：连跑两遍必须都过（Linux 集为 0 像素）
pnpm exec playwright test e2e/pages.visual.spec.ts
```

**假红先排查服务器，不要急着 `--update-snapshots`**：`playwright.config.ts` 现在固定 `reuseExistingServer: false`，每次由 runner 自己起 `astro preview`——旧版本会复用残留 server，症状是 `net::ERR_CONNECTION_REFUSED` 或比对到旧 `dist`，不是像素 diff。再确认第 1 步的固定内容构建跑过。配置同时固定 `--host 127.0.0.1` / `baseURL=http://127.0.0.1:4321`：本机 `astro preview` 默认只监听 `[::1]`，靠 `localhost` 解析会在 IPv6/IPv4 之间飘，表现为随机 `ERR_CONNECTION_REFUSED`。

**preview 启动用 `--ignore-lock`，不是 `--force`**：astro 7.3.6 的 `preview` 没有 `--force`（那个 flag 只属于 `astro build`），写了会被静默忽略。只要 `.astro/preview.json` 里还留着**活着的** preview（兄弟卡并行跑、或被 SIGKILL 后 supervisor 拉起的实例），旧命令会以 exit 1 退出并报 `Another astro preview server is already running`，一条用例都不跑——整轮假红，而且报错文案自己推荐了这个不存在的 flag。`--ignore-lock` 既不读也不写 lock，多个 preview 可以在不同端口并存。要保留「一个 worktree 只留一个 preview」的纪律就手动 `astro preview stop` / `astro preview status`，别指望配置代劳：并行卡占着的 server 不该被别人的 runner 杀掉。

**并发跑测请换端口，不要共享 4321 和 4401–4402**：同一个 worktree 里多张卡同时跑视觉门禁时，用 `PW_PREVIEW_PORT=4337 pnpm test:visual:pages` 与 `PW_STATES_PORT_BASE=4411 pnpm test:visual:states` 各自错开（或直接复制一份独立工作目录跑）。`pnpm test:visual:states` 自带 `PW_SKIP_PREVIEW=1`，因为它只服务 `.visual-states/` 下的静态目录，不读 `dist/`。


新增/删除基线页面时：改 `e2e/pages.visual.spec.ts` 的 `PAGES`，然后**两平台都重新生成一遍**，并在 PR 里贴 diff 截图。远端图片、CDN 脚本、Waline 评论、hitokoto 一律在 spec 里打桩或拦断（见 spec 头部注释），不要为了「看起来更真实」放开网络——那会让门禁随机红。

**状态级基线（§7.2）另走一套构建**：三页的 `empty` / `error` 分支只存在于 `PUBLIC_{PROJECTS,DEVICES,SKILLS}_STATE` 被设置的构建里，所以 `pnpm visual:build:states` 会按状态各构建一次整站到 `.visual-states/<state>/`（三页共用一次构建，成本 1/3）。状态 spec 自己起静态服务（`4401` 起），不读 `dist/`、不碰 `astro preview`。

```bash
# 1. 构建两个状态的站点（← 会写 .visual-states/，不动 dist/）
pnpm visual:build:states

# 2. macOS 基线
pnpm exec playwright test e2e/pages-states.visual.spec.ts --update-snapshots

# 3. Linux 基线（同一个镜像）
docker run --rm --ipc=host -v "$PWD":/work -w /work \
  -e PLAYWRIGHT_BASELINE_PLATFORM=linux \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -lc 'corepack enable && corepack pnpm install --frozen-lockfile && \
            node scripts/visual/build-state-baseline.mjs && \
            PW_SKIP_PREVIEW=1 corepack pnpm exec playwright test \
              e2e/pages-states.visual.spec.ts --update-snapshots'

# 4. 复核：两遍都必须 36 passed
pnpm test:visual:states
```

`loading` 与 `filtered-empty` 两态**当前不在矩阵里**：`EntityStatus` 只有 `ok | empty | error`，三页模板没有 loading 分支，筛选 UI 也还没上 `main`（都在未合并的 `m8-wip-20261110` 上，见 decision-log D-0156「未决」）。对 `main` 生成那两态只会把 `ok` 版式录成假状态，所以宁缺勿假。该分支合入后：在 `scripts/visual/build-state-baseline.mjs` 与 spec 的 `STATES` 里各加一项，重新生成，「3 页 × 4 态 × 2 主题 × 3 视口 = 72」——矩阵是算出来的，不用手抄。


### 发布

| 脚本 | 说明 |
| ---- | ---- |
| `pnpm release` | 使用 standard-version 生成 changelog 并 bump 版本 |
| `pnpm release:dry` | 预览版本 bump（不实际执行） |
| `pnpm release:packages` | `changeset publish`（真实发布 npm 包，需 PO 批准） |
| `pnpm verify:versions` | 校验四处版本 lockstep（根 + 三个包 + manifest） |
| `pnpm verify:registry` | 只读复查 registry：版本 / dist-tag / tarball / integrity / provenance / 归属 |
| `pnpm verify:consumer-matrix` | 消费者矩阵：Node 22/24 的安装 → 升级 → 回滚全生命周期（`--docker=true` 跑 Linux 格） |
| `pnpm fixture:next-minor` | 把仓库里的包打成「下一 minor」本地预演 tarball（不发布、不改源码） |
| `pnpm seo:indexnow` | 向 IndexNow 网络手动提交 URL（默认近 26 小时窗口内发布的文章；`--all` 全量、`--dry-run` 预览，见「部署」） |

## 环境变量

复制 `.env.example` 为 `.env` 并填入对应值（数据源变量均为可选，未配置的源在构建时自动跳过）：

| 变量 | 必需 | 说明 |
| ---- | ---- | ---- |
| `BLINKO_API_URL` | 否 | Blinko 服务地址（配合 `BLINKO_API_TOKEN`；不设则跳过随笔拉取） |
| `BLINKO_API_TOKEN` | 否 | Blinko API Token（不设则跳过随笔拉取） |
| `DOUBAN_USER_ID` | 否 | 豆瓣用户 ID（不设则跳过书影音拉取） |
| `BANGUMI_USER_ID` | 否 | Bangumi 用户 ID（不设则跳过追番拉取） |
| `FOREVERBLOG_RSS_URL` | 否 | Foreverblog RSS 源地址（默认使用 rsshub.rssforever.com） |
| `INDEXNOW_KEY` | 否 | IndexNow 密钥（36 位 hex；本地/CI 推送用；不设则本地脚本静默跳过） |
| `BAIDU_TOKEN` | 否 | 百度普通收录 API Token（可选，用于同步提交百度） |
| `ENCRYPTION_PASSWORD` | 否 | 文章加密密码（未设置且存在加密内容时构建报错） |
| `BUILD_CONCURRENCY` | 否 | Astro 构建并发数（默认 = CPU 核心数；CI 部署时固定为 1） |

> 注：IndexNow 主动推送已内置（部署完成后自动提交新/更新文章到 IndexNow 网络：Bing / Yandex / Seznam / Naver / Yep）。仓库 Secrets 配置 `INDEXNOW_KEY` 即启用；验证文件位于 `public/<key>.txt`（内容 = key）。手工推送：`pnpm seo:indexnow`。

## 配置

网站的核心配置集中在 `src/config/` 目录：

| 文件 | 说明 |
| ---- | ---- |
| [src/config/site.ts](src/config/site.ts) | 网站标题、描述、URL、域名、作者信息、图床服务、页面配置 |
| [src/config/feature.ts](src/config/feature.ts) | 功能开关：评论（Waline）、搜索（Pagefind）、分析（Umami）、捐赠、公告栏、水印、文章分享 |
| [src/config/ui.ts](src/config/ui.ts) | 导航链接、社交链接、页脚信息、友链页面文案 |

其他重要配置文件：

| 文件 | 说明 |
| ---- | ---- |
| [astro.config.mjs](astro.config.mjs) | Astro 框架配置（i18n、Markdown 插件、集成、PWA、构建优化） |
| [src/content.config.ts](src/content.config.ts) | 内容集合 Zod Schema 定义 |
| [vercel.json](vercel.json) | Vercel 备用部署配置（重定向 / 构建内存） |

## 内容管理

### 文章

文章存储在 `src/content/article/` 目录中，使用 Markdown（`.md`）或 MDX（`.mdx`）格式编写。

> ⚠️ 该目录是**本地开发副本**：CI 构建时会用私有仓库 `zcblog-articles` 的内容覆盖它（`cp _articles/*.md src/content/article/`）。线上文章的发布与修改请以 `zcblog-articles` 仓库为准。

**中英文双语约定**：

- 中文文章：`<slug>.md`（`lang` 缺省即 zh）→ `/article/<slug>/`
- 英文文章：`<slug>-en.md` + frontmatter `lang: en` → `/en/article/<slug>/`；与中文版同 base slug 时自动互为**翻译对**（hreflang 互标、语言切换器直达、sitemap 配对）
- ⚠️ 不要用 `<slug>.en.md` 命名：Astro 内容层会吞掉文件名中的英文句点，导致 URL 变成 `xxxen`
- 中英文内容**完全隔离**：列表 / 归档 / 标签 / 相关文章 / 相邻导航 / 订阅源 / 站内搜索均按语言区分

文章 Frontmatter：

```yaml
---
title: 文章标题              # 必填
description: 文章描述          # 可选，用于 SEO
summary: 文章摘要              # 可选，用于列表展示
pubDate: 2024-01-01           # 必填，发布日期
upDate: 2024-06-01            # 可选，更新日期
tags: [标签1, 标签2]           # 标签列表
lang: zh                      # 语言：zh（默认）或 en（英文文章文件名用 <slug>-en.md）
image:                        # 可选，封面图（默认随机图床图片）
  url: cover.jpg
  alt: 封面描述
sticky: 0                     # 置顶优先级（数字越大越靠前，0 为不置顶）
draft: false                  # 是否为草稿（草稿不会出现在生产构建中）
toc: true                     # 是否显示目录
waline: true                  # 是否启用评论
donate: true                  # 是否显示捐赠区域
author: true                  # 是否显示作者信息
mathjax: false                # 启用 MathJax 数学公式
mermaid: false                # 启用 Mermaid 图表
plantuml: false               # 启用 PlantUML 图表
katex: false                  # 启用 KaTeX 数学公式
chart: false                  # 启用 Chart.js 图表
markmap: false                # 启用 Markmap 思维导图
reveal: false                 # 启用 Reveal.js 幻灯片
fancybox: true                # 启用 Fancybox 图片灯箱
tabs: true                    # 启用标签页组件
---
```

### 独立页面

独立页面存储在 `src/content/pages/` 中，通过通配路由 `[...custom].astro` 渲染。当前包含：Cookies 政策、版权声明、隐私政策。

Frontmatter：

```yaml
---
title: 页面标题
description: 页面描述（可选）
---
```

## 数据源

项目依赖多个外部数据源，通过构建脚本在构建前拉取：

| 数据 | 来源 | 输出文件 | 拉取脚本 |
| ---- | ---- | ---- | ---- |
| 随笔 | Blinko API | `src/data/talks.json` | `scripts/fetch-talks.mjs` |
| 书影音 | 豆瓣 | `src/data/douban.json` | `scripts/fetch-douban.mjs` |
| 友链文章 | Foreverblog RSS | `src/data/friends-articles.json` | `scripts/fetch-friends.mjs` |
| 番剧追踪 | Bangumi/MAL | `src/data/bangumi.json` | `scripts/fetch-bangumi.mjs` |

静态 JSON 数据（手动维护）：

| 数据 | 文件 |
| ---- | ---- |
| 相册 | `src/data/albums.json` |
| 友链列表 | `src/data/friends.json` |
| 捐赠者 | `src/data/donators.json` |
| 打字机文本 | `src/data/typewriter.json` |
| 多语言翻译 | `src/data/i18n/zh.json`、`src/data/i18n/en.json` |

## 部署

> **现状（2026-11）**：生产站已迁到 **Cloudflare Pages**——`push main` 触发 `.github/workflows/deploy.yml`，用 wrangler 发布到 `zcblog-v2` 项目的 production 环境（<https://zcblog-v2.pages.dev>，D-0175）。下面「GitHub Pages」一节保留为历史流程与备用目标；三平台产物差异与适配层见 [`docs/deploy-matrix.md`](docs/deploy-matrix.md)。

### GitHub Pages（主要部署方式）

推送至 `main` 或 `theme` 分支时自动触发；`zcblog-articles` 推送后由其 `notify.yml` 触发 `repository_dispatch (articles-updated)`；亦支持手动触发：

1. 从私有仓库 `Smart-Chou/zcblog-articles` 拉取文章与图片
2. 安装系统依赖（libvips）
3. 安装 pnpm + Node.js 22
4. 安装依赖并构建
5. 部署到 GitHub Pages
6. IndexNow 主动推送（近 26h 窗口内新/更新文章，失败不阻断部署）

### Vercel（可选备用）

项目保留 `vercel.json`（含 `tag → tags` 等重定向与构建内存配置）作为备用部署方案；当前生产部署为 GitHub Pages。

### 构建流程

```
pnpm build
  ├── pnpm fetch:all（并行）
  │   ├── talks（Blinko 随笔）
  │   ├── douban（豆瓣书影音）
  │   ├── friends（友链文章 RSS）
  │   ├── bangumi（番剧追踪）
  │   └── icons（PWA 图标）
  ├── pnpm fetch:verify（数据校验）
  └── astro build（静态站点生成 + Pagefind 索引）
```

## CI/CD

| 工作流 | 触发条件 | 内容 |
| ---- | ---- | ---- |
| **CI** | 推送/PR 到 `main` 或 `theme` | Lint → TypeScript 类型检查 → 单元测试 |
| **Deploy** | 推送到 `main`/`theme` / 文章更新 / 手动触发 | 拉取文章 → 安装依赖 → 构建 → 部署到 GitHub Pages → **IndexNow 主动推送**（窗口内新/更新文章，非阻塞） |

## 内容加密

部分内容支持密码加密。在文章正文中使用容器指令标记：

```md
:::encrypted[提示语（如：我的生日）]
需要加密的内容
:::
```

- 密码优先级：指令属性 `:::encrypted{password="xxx"}` > 环境变量 `ENCRYPTION_PASSWORD`（站点默认密码）；`hint` 属性用于展示提示语。
- 构建时 `remark-encrypted` + `rehype-encrypted` 使用 Node crypto（AES-256-GCM，密钥由密码 + 文章 slug 经 PBKDF2 派生）加密为 Base64；访问者输入密码后由客户端解密渲染。

## 多语言 (i18n)

**界面层**：

- **中文**：默认语言，URL 无前缀（如 `/blog/1/`）
- **英文**：URL 前缀 `/en/`（如 `/en/blog/1/`）
- 翻译文本存储在 `src/data/i18n/` 中
- 订阅源按语言拆分：RSS / Atom / JSON Feed 均各有中英两版

**内容层（中英文完全隔离）**：

- **中文文章**：`<slug>.md` → `/article/<slug>/`；**英文文章**：`<slug>-en.md` + `lang: en` → `/en/article/<slug>/`
- 同 base slug 的中英两篇自动互为**翻译对**：互相标注 `hreflang`（`x-default` → 中文）、语言切换器直达对照版、sitemap `xhtml:link` 配对；独立英文文章（无中文对照）切换器回退英文列表页，`hreflang` 仅含 en 与 x-default
- 列表 / 归档 / 标签 / 相关文章 / 上下篇导航 / 订阅源 / 站内搜索（Pagefind 按 `lang` 分语言索引）均按语言隔离
- 无英文文章时 en 列表显示空态（`/en/blog/1/` 页面保留，供切换器回退，勿令其 404）

## 相关仓库与服务

| 名称 | 作用 |
| ---- | ---- |
| `Smart-Chou/zcblog`（本仓库） | 站点源码与构建配置 |
| `Smart-Chou/zcblog-articles`（私有） | 文章与图片的唯一部署来源；推送后触发本站重建 |
| `Smart-Chou/marxchou-waline` | 评论服务端（Vercel Serverless） |
| Cloudflare R2 `blog-all` + `s3.marxchou.com` | 文章图片 CDN（发布时上传，边缘缓存） |

## 许可证

MIT License
