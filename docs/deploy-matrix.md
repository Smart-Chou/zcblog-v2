# 三部署矩阵（M3-7）

同一份源码，在 **GitHub Pages / Cloudflare Pages / Vercel** 三个目标上构建并断言产物。
本文只描述「同一份产物如何适配三个平台」，不涉及任何实际部署、密钥或平台项目设置。

- 矩阵口径来源：`blog2.0/docs/21-m3-plan.md` §5（v1.0，D-0116 冻结）
- 适配层实现：`scripts/deploy-matrix.sh`、`scripts/gates/verify-deploy-artifacts.mjs`、
  `public/_redirects`、`vercel.json`、`astro.config.mjs`（`SITE_URL` + `tagRedirectStubs`）
- CI：`.github/workflows/deploy-matrix.yml`（matrix 三个 job，只构建 + 断言，**不部署**）

## 1. 一条命令

```bash
bash scripts/deploy-matrix.sh                  # 三目标全跑 → 末尾打印 3/3 target PASS
bash scripts/deploy-matrix.sh --target vercel  # 单目标（CI 每个 job 用这个）
```

脚本对每个目标做的事完全相同，只有环境变量不同：

```bash
SITE_URL=https://<host> NODE_OPTIONS=--max-old-space-size=4096 pnpm build:ci
node scripts/gates/verify-deploy-artifacts.mjs dist --target <target> --expect-site "$SITE_URL"
cp -R dist "$MATRIX_OUT_DIR/<target>/dist"      # 三次构建共用 dist，断言证据必须留档
```

末尾会对三份留档产物各再跑一次门禁，所以 `3/3 target PASS` 是「三份不同的 dist 都过」，
不是「同一份 dist 被检查三遍」。

域名可通过环境变量覆盖（CI 里是仓库 Variables）：

| 目标 | 变量 | 默认 |
| --- | --- | --- |
| GitHub Pages | `GH_PAGES_HOST` | `example.github.io` |
| Cloudflare Pages | `CF_PAGES_HOST` | `example.pages.dev` |
| Vercel | `VERCEL_HOST` | `example.vercel.app` |

## 2. 矩阵

| 项 | GitHub Pages | Cloudflare Pages | Vercel |
| --- | --- | --- | --- |
| 构建命令 | `pnpm build:ci` | 同左 | 同左（`vercel.json` 的 `buildCommand` 显式指定） |
| 构建期差异 | `SITE_URL` | 同左 | 同左 |
| base path | `/` | `/` | `/` |
| 产物目录 | `dist` | `dist` | `dist`（`outputDirectory`） |
| 缓存能力 | **无**（Pages 不支持自定义响应头） | 强（`public/_headers`） | 中（`vercel.json` `headers`） |
| 301 能力 | 无（只能构建期 meta-refresh 桩） | `public/_redirects` | `vercel.json` `redirects` |
| 本次是否部署 | 否 | 否 | 否 |

三目标产物**结构相同**：`dist/_headers`、`dist/_redirects`、`dist/tag/<tag>/index.html`
桩都在，因为它们是源码层适配层（`public/` 与 `astro.config.mjs`），不是平台项目配置；
平台只会解释自己认得的那一部分，其余当静态文件（无害）。

## 3. `/tag/:tag` → `/tags/:tag/` 的三套实现

规范地址是 `/tags/<tag>/`，`/tag/<tag>/` 是历史入口。三个平台的能力差异在这里最明显：

1. **GitHub Pages**：没有任何服务端跳转能力。`astro.config.mjs` 的 `tagRedirectStubs`
   集成在 `astro:build:done` 后读取已产出的 `dist/tags/<tag>/`，为每个标签写一份
   `dist/tag/<tag>/index.html`（`<meta http-equiv="refresh">` + `rel=canonical` +
   `robots=noindex`）。桩不在 sitemap 里、也不进 pagefind 索引。
2. **Cloudflare Pages**：`public/_redirects`，4 条规则，`301`。
3. **Vercel**：`vercel.json` 的 `redirects`，同一组 4 条规则，`301`。

**一致性由门禁强制**（`verify-deploy-artifacts.mjs`）：

- `_redirects` 与 `vercel.json` 的规则逐条比对（源、目标、状态码，归一化尾斜杠后）；
- 任何一条规则的目标不得再被任何规则命中 —— 否则是双跳（两次 301）；
- 每个标签的桩必须存在，且 `url=/tags/<tag>/`、`noindex`、`canonical` 指向注入域名；
- 标签规则的目标地址抽样落盘检查（避免规则指到 404）。

> 语义差别（必须知道）：HTTP 301 是搜索引擎认可的永久迁移；meta-refresh 只是页面级
> 跳转提示，权重传递弱得多。GH Pages 上的 `/tag/*` 就是这个下限，接受它或不用 GH Pages。

## 4. 必须文档化的平台限制

### 4.1 只支持根路径部署（不支持 `user.github.io/repo/` 子路径）

静态链接是**根绝对路径**写法，没有走 Astro 的 `BASE_URL`：

```bash
grep -rn 'import.meta.env.BASE_URL' src | wc -l   # 实测 0
grep -rn 'href="/' src --include=*.astro | wc -l  # 实测 46（随主题演进变化）
grep -rn 'url("/' src --include=*.css | wc -l     # 实测 4
```

要支持子路径需要把这 50 处左右改成 `BASE_URL` 拼接，并重跑构建/axe/视觉基线；
M3 明确不做（D-D 决策①）。门禁里有一条 `无 <base href>` 的断言，防止有人以为改了
`base` 配置就能用 —— 那只会让站内绝对链接全部错位。

GH Pages 生产走自定义域、CF Pages 与 Vercel 都是根域，所以子路径不是任何真实目标的前提。

### 4.2 GitHub Pages 没有响应头也没有 301

- `dist/_headers` 会被原样发布，但 GH Pages **不解释**它：`/assets/*` 的
  `immutable` 长缓存、HTML 的 `must-revalidate` 在 GH Pages 上都不生效。
- `/tag/*` 只能靠桩（见 §3），`/blog`、`/en/blog` 同样靠 `astro.config.redirects`
  生成的 meta-refresh 桩。
- 结论：GH Pages 只是「能打开」的目标，不是「缓存/跳转最优」的目标。

### 4.3 Waline 评论仍在 Vercel

评论是运行时跨域请求（`@waline/client` 直连 Vercel 上的 waline 服务），与静态产物无关：
换托管目标不需要迁评论服务，也不会因为三目标构建而多出三份评论数据。

## 5. 门禁检查项（`verify-deploy-artifacts.mjs`）

```
node scripts/gates/verify-deploy-artifacts.mjs dist --target gh-pages|cloudflare|vercel \
     [--expect-site https://host] [--repo .]
```

| 组 | 断言 |
| --- | --- |
| A0 | `dist/index.html` 存在 |
| A1 | canonical origin 与注入的 `SITE_URL` 一致；`sitemap-index.xml` 同 origin；产物无残留默认域名 |
| A2 | `_redirects` 可解析、无 `/*` 兜底、全 301、与 `vercel.json` 逐条一致、无链式跳转 |
| A3 | `/tag/*/` 桩数量 = 标签页数量，内容（目标 / noindex / canonical）逐条正确；规则目标抽样落盘 |
| A4 | `astro.config.redirects` 的 `/blog`、`/en/blog` meta-refresh 桩存在且目标正确 |
| A5 | `dist/_headers`：`/assets/*`、`/_astro/*` immutable，HTML must-revalidate |
| A6 | 无 `<base href>`（root-only 前提） |
| A7 | 目标专属：GH Pages → `404.html` + 桩全覆盖；CF → `_redirects` 4 条 + `_headers`；Vercel → `buildCommand`/`outputDirectory`/`NODE_OPTIONS`/`headers`/4 条 `redirects` |

任一 ✗ → exit 1；最后一行是 `RESULT PASS|FAIL target=... site=... stubs=n/m fails=n`。

## 6. CI

`.github/workflows/deploy-matrix.yml`：`matrix.target: [gh-pages, cloudflare, vercel]`，
每个 job 只跑自己那一个目标（`--target`），所以成功时打印 `1/1 target PASS`；三个 job
全绿即「三目标矩阵成立」。`fail-fast: false`，一个平台红不影响另外两个的结论。

成本：单次构建实测 ~74s，三个 job 并行 ≈ 4 分钟；`paths` 只放会改变产物的输入
（`src/**`、`packages/**`、`apps/**`、`public/**`、`astro.config.mjs`、`vercel.json`、
依赖清单、本卡两个脚本），纯文档改动不触发（R-49）。

已知限制：内容在私有仓 `Smart-Chou/zcblog-articles`，job 需要 `ARTICLES_PAT`。
fork PR 拿不到 secret，会在 checkout 阶段红 —— 本仓的 PR 都来自分支而非 fork，暂不处理。

## 7. 已知缺口（不在本卡范围）

1. `/en/tags/<tag>/` 详情页目前不产出（英文标签只有索引页），所以 `/en/tag/:tag` 的
   两条规则目标暂时指向 404。规则保留是为了与历史 URL 对齐；补英文标签页是内容侧工作。
2. Vercel 的 `headers` 只写了 HTML `must-revalidate`（计划口径「M3 只写这一条」）。
   把 `/assets/*`、`/_astro/*` 的 immutable 也搬到 Vercel 属平台调优，另开卡。
3. 平台侧项目设置（构建命令、环境变量、域名）一律不在此仓自动化：本卡不碰 CF/Vercel
   项目设置，也不做任何实际部署。
4. `<link rel="sitemap" href="https://marxchou.com/sitemap-index.xml">` 目前硬编码在布局
   组件（`src/` 层），不受 `SITE_URL` 覆盖；文章里的 `https://marxchou.com/cdn-cgi/image/...`
   同理是内容侧 CDN 资源。两者都不影响「产物能否在三个目标上成立」，但换自定义域后
   sitemap 链接会指回生产域 —— 属 `src/` 层的后续卡，不在本卡文件边界内。
