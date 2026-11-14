# 内容契约（content-contract）

> 本文管：frontmatter 到底允许哪些键、每个键的类型与默认值、v1 旧键怎么被归一化、以及 A2/A2b/A3 三道内容门禁各自的盲区。
> **必读时机**：改 `src/content.config.ts`、改 `scripts/normalize-frontmatter.mjs`、往内容仓加字段、或构建报 `InvalidContentEntryDataError`。
> 与 `rules/ci-gates.md` §3.12 分工：那边说门禁怎么跑，这边说契约长什么样、为什么这么长。
> 真源：`src/content.config.ts`（契约本体，schema 叫 v6）+ `scripts/normalize-frontmatter.mjs`（v1 → v2 的转换器）。

---

## 1. 契约有 18 个键，`.strict()` 意味着第 19 个键就让构建失败

| 键 | 类型 / 取值 | 默认 | 备注 |
|---|---|---|---|
| `title` | `string` `.min(1)` | 必填 | 只保证非空；60 字上限是**软规范**，归 lint，不归构建。<!-- D-0035 --> |
| `description` | `string` `.min(1).max(200)` | 必填 | 60–160 是软规范；`max(200)` 是硬上限。 |
| `pubDate` | `z.coerce.date()` | 必填 | 字符串日期会被 coerce。 |
| `tags` | `string[]`，每个非空，**最多 6** | `[]` | 上限 6 是模板既有约束。 |
| `summary` | `string` `.max(300)` | 无 | 导语，渲染在正文开头与列表卡。 |
| `upDate` | `z.coerce.date()` | 无 | 视觉 fixture **必须**带它，否则基线编码构建当天。 |
| `series` | ASCII 小写 kebab，≤48 | 无 | 值是 **URL slug**，展示名由 slug 派生。<!-- D-0145 --> |
| `seriesOrder` | `int 0..999` | 无 | 缺省 = 排在已编号文章之后；重复编号不炸，回落 `pubDate`。 |
| `category` | ASCII 小写 kebab，≤24 | 无 | 可选，默认不出现；零分类不生成 `/categories/` 路由。<!-- D-0162 --> |
| `lang` | `"zh" \| "en"` | `"zh"` | 英文用 `<slug>-en.md`，**禁用** `.en.md`（内容层吞句点）。 |
| `image` | `{ url?, alt }`，`url` 可为空串 | 无 | 空串由 `preprocess` 变 `undefined`（57 篇 `url: ""` 必须合法）；相对路径**合法**。<!-- D-0029 --> |
| `features` | `("mermaid"\|"mathjax"\|"katex"\|"plantuml"\|"chart"\|"markmap")[]` | `[]` | 需要额外渲染器才写；空数组 = 全关。 |
| `draft` | `boolean` | `false` | 草稿不计入文章数与产物期望值。 |
| `sticky` | `int ≥0` | `0` | v1 遗留字段，收进 schema 供 `blog-paths` 排序，不在归一化里删。 |
| `waline` | `boolean` | `true` | 单篇评论开关。 |
| `toc` | `boolean` | `true` | **不能删**：模板用 `frontmatter.toc && <Toc/>` 真值判断。<!-- D-0020 --> |
| `donate` | `boolean` | `true` | 同上。 |
| `author` | `boolean` | `true` | 同上。 |

`.strict()` 只加在**最外层** `z.object` 上：上表 18 个键之外多写一个 → `InvalidContentEntryDataError: Unrecognized keys` → 构建直接失败。`image` 内层是普通 `z.object`，多写的键被 zod 静默 strip（不会炸）——所以 A2b 只看顶层键，拦内层就是假红。<!-- content.config.ts · check-content-contract.py 末段 -->

`pages` 集合是另一套宽松 schema（`title` + 可空 `description`，无 `.strict()`），别把文章契约套到页面上。

## 2. 归一化只吃 6 个旧键，`sticky` 与 `category` 是例外

`scripts/normalize-frontmatter.mjs` 的 `FEATURE_KEYS` = `mermaid` / `mathjax` / `katex` / `plantuml` / `chart` / `markmap`。规则：

- `xxx: true` → 合并进 `features: [...]`（去重、按 schema 固定顺序输出，保证 diff 可读）；
- 六个布尔键**一律删除**（默认模式），因为 `.strict()` 不认它们；
- `sticky` **保留**（schema 里有同名字段，`blog-paths` 用它排序）；
- `category`：合法的 v2 slug 原样保留；旧站的中文值（如 `日常`）在 v2 构建里**丢弃**，且不做自动映射——映射会凭空多出一个 `/tags/日常/` 页面；
- `--add-only`：只补 `features`、不删任何旧键，用于「旧站还在跑、两边共存」的迁移期。

**幂等是硬要求**：跑两遍第二遍必须 `改写 0 篇`，验证时就是这么验的。<!-- D-0174 补记 实测 90 篇改 4 篇 → 第二遍 0 篇 -->

## 3. `normalize:content` 在 build 的最前面，且必须硬失败

```
pnpm build     = normalize:content → (fetch:all || true) → (fetch:verify || true) → astro build → 压 HTML
pnpm build:ci  = normalize:content → astro build → 压 HTML
```

- **normalize 不许加 `|| true`**：它守的是内容格式契约，静默失败等于把 schema 错误推迟到 `astro build` 才暴露。只有两个 `fetch:*` 被显式括号容忍。
- 顺序不能换：normalize 之后跑 A2b 就看不见「内容仓写了 v1 旧键」这一类（旧键已被删掉）。所以 **A2b 在 deploy.yml 里排在 normalize 之前**。<!-- D-0179 · deploy.yml -->
- `src/content/article/` 是 gitignored 的构建缓存：内容仓 checkout → normalize → build。手工改缓存目录没有意义，下次部署会被覆盖。

## 4. 三道内容门禁，盲区各不相同

| 门 | 脚本 | 它答什么问题 | 盲区 |
|---|---|---|---|
| A2 | `check-legacy-keys.py` | 内容里有没有**已知**的旧键（14 个 `LEGACY`） | 对「从没见过的新字段」天生失明——手抄清单一定会过期 |
| A2b | `check-content-contract.py` | 内容里有没有 schema **不认识**的键 | 只校验**键是否存在**，不校验值的类型与范围（那是 zod 的事） |
| A3 | `check-relative-assets.py` | 有没有相对路径图片引用 | 只管路径形态，不管文件是否真能解析（要加 `--verify`） |

A2b 的判据值得记住：允许键 = `content.config.ts` 里 article schema 声明的 18 个 **∪** normalize 消费的 6 个 = **24 个**；两个集合都**从源文件解析**，不在门禁里抄一份。退出码三档：`0` 全认识 / `1` 有未知键（部署应中断）/ `2` 门禁自身故障（含**空内容目录**——「内容没同步」不能算绿）。

A3 的三种形态都要查：Markdown `![](...)`、HTML `<img src>`、frontmatter `image.url`。判据是「不是 `http(s)://`、不以 `/` 开头、不是 `#` / `data:`」；`--expect 22` 把处数钉死（22 = 封面 16 + 正文 6），新增相对引用必须先想清楚是不是该改绝对路径。<!-- D-0029 · D-0022 -->

## 5. 为什么不能手改 v1 键（这坑花过 4 天）

`.strict()` + 内容仓带 v1 键 = 生产构建连续失败 4 天，站点内容冻结，而 CI 全绿——因为 CI 用固定 fixture 构建，从不碰真实内容仓。<!-- D-0166 -->

三条理由，任一条单独成立都不能手改：

1. **手改不持久**：真源是私有内容仓，下次 checkout + 覆盖，「修好」的缓存文件就没了。
2. **手改掩盖契约分叉**：把 `mermaid: true` 手写成 `features: ["mermaid"]` 只是让这一次构建通过；内容仓仍在教下一个人写 v1 键。
3. **删除 ≠ 等价**：六个布尔键里少数 `true` 是有含义的，丢弃等于「该渲染 mermaid 的文章静默不再渲染」。

**同理不要做的两件事**：把 `.strict()` 改成 `.passthrough()`（以后真正写错的字段也会静默通过）；回滚内容仓的字段（v2 的 `/series/` 依赖它）。<!-- D-0166「不做的」 -->

## 6. 契约演进史（改契约前先读这段）

- **v3**：恢复 `toc`/`donate`/`author` 并启用 `.strict()`——按「使用率 0」删可选字段会让用 `&&` 判断的消费方全站关闭。<!-- D-0020 -->
- **v4**：`features[]` 落地，v1 六个布尔键改由 normalize 转换。<!-- D-0045 -->
- **v5**：增补可选 `series` / `seriesOrder`，只做契约兼容、当期不建 `/series/` 路由。<!-- D-0145 -->
- **v6**：增补可选 `category`，不要求存量回填。<!-- D-0162 -->

**加法优先**：新字段一律可选 + 有默认值 + 不要求回填；删字段前先 `grep` 消费方，区分「`&&` 真值判断」与「`!== false`」两类写法——前者删掉就是全站关闭。<!-- D-0020 · pitfalls §2.4 -->

## 7. 加字段的检查清单

1. `src/content.config.ts` 里按加法加（可选 + 默认值 + 明确正则/范围）。
2. 若内容仓已经在写这个键——先加契约，再加功能（先止血，再谈路由）。
3. `check-content-contract.py` 跑一遍，确认 `--show-keys` 的键数从 24 变成 25 且内容是 `0 未知键`。
4. 若涉及渲染开关，检查模板是 `&&` 还是 `!== false`，别让默认值把页面关掉。
5. 视觉 fixture（`e2e/fixtures/pages-visual/content/article/*.md`）不受新契约影响，除非新字段会改变渲染——改了就要两平台重出基线。
6. 写进 `decision-log.md`：契约变更必须有 D 号，否则下一个人会把「计划」读成「事实」。
