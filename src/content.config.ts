/**
 * 内容模型契约 v4（G2 定稿，来源：blog2.0/docs/schema/article.schema.ts，D-0045）
 */
import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

const FEATURE = ["mermaid", "mathjax", "katex", "plantuml", "chart", "markmap"] as const;

/**
 * 内容目录可覆盖（M5-11）：页面级视觉基线必须跑在**固定内容**上，
 * 否则私有内容仓一加文章，home/archives/popular 的渲染就整体变化，
 * 视觉门禁会红在与主题无关的地方。视觉运行用
 * `CONTENT_ARTICLE_BASE=e2e/fixtures/pages-visual/content/article` 构建，
 * 常规构建/部署不设置该变量，行为完全不变。
 */
const ARTICLE_BASE = process.env.CONTENT_ARTICLE_BASE || "./src/content/article";

export const article = defineCollection({
    loader: glob({ pattern: "**/*.{md,mdx}", base: ARTICLE_BASE }),
    schema: ({ image }) =>
        z
            .object({
                /* ── 必填 ───────────────────────────────────────────── */

                // 现状 0 篇超 60。上限 60 是 SERP 截断线，超过只是不好看，不该炸构建。
                /** 硬约束只管「非空」。60 字是质量规范（SEO/OG 截断），交给 lint —— D-0035 */
                title: z.string().min(1),

                /**
                 * 硬约束 1–200：只保证「非空、不炸」。
                 * 软规范 60–160 由 `scripts/lint-frontmatter.mjs` 检查（**脚本已就位**，G4 接进 CI 时以 warning 执行）。
                 * v2 曾写 min(20)，实测 7 篇只有 4–13 字（reset-network 4、live2d 5、
                 * initialize-cloud-disk 6、vps-command 8、meilisearch 11、php-random-picture 11、
                 * handsome-beautify-record 13）——那是把内容债搬进构建约束，不是降级到 lint。
                 */
                description: z.string().min(1).max(200),

                pubDate: z.coerce.date(),

                /** 0..6。现状被模板钉死为 6；放开上限，不设下限（单篇 tag 页是薄内容）。 */
                tags: z.array(z.string().min(1)).max(6).default([]),

                /* ── 可选（默认值不落盘）───────────────────────────── */

                /** 导语，渲染在正文开头与列表卡。现状 74 篇有，5 篇超 200（最长 278）。 */
                summary: z.string().max(300).optional(),

                upDate: z.coerce.date().optional(),

                /**
                 * 双语机制不变：`<slug>-en.md` + lang:en → /en/article/<slug>/，
                 * 禁用 `.en.md`（Astro 内容层吞句点）。全缺省 = 还没写翻译。
                 */
                lang: z.enum(["zh", "en"]).default("zh"),

                /**
                 * 封面。现状：57 篇 `url: ""`、3 篇无 image、16 篇相对路径、10 篇远程。
                 * 空串必须合法（否则 60 篇直接炸），由代码回退站点默认图；
                 * 相对路径**合法**（D-0029：V1 保留 22 处，靠构建断言兜底；新增相对图才该红）。
                 */
                image: z
                    .object({
                        url: z.preprocess(
                            (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
                            z.union([image(), z.string().url()]).optional(),
                        ),
                        alt: z.string().default(""),
                    })
                    .optional(),

                /** 需要额外渲染器时才写。空数组 = 全部关闭（等同现状的 false）。 */
                features: z.array(z.enum(FEATURE)).default([]),

                draft: z.boolean().default(false),
                // 置顶权重（v1 遗留字段，内容仓 77 篇带着 sticky: 0）。blog-paths 用它排序，
                // 所以收进 schema 而不是在归一化时删掉（见 scripts/normalize-frontmatter.mjs）。
                sticky: z.number().int().min(0).default(0),

                /** 现状：72 篇显式 `true`、1 篇显式 `false`（expressive-code），共 73 篇含键；默认 true，保留为单篇覆盖开关。 */
                waline: z.boolean().default(true),

                /*
                 * ── 渲染开关：必须保留 ────────────────────────────────
                 * v2 以「实测使用率 0」为由删掉了这三个，这是错的：
                 * 没人显式写 ≠ 默认没生效。模板用的是真值判断
                 * （MarkdownLayout.astro:169-172 `frontmatter.toc && <Toc/>`），
                 * 字段一旦 undefined，86 篇文章页会同时失去目录 / 赞赏 / 作者卡。
                 */
                toc: z.boolean().default(true),
                donate: z.boolean().default(true),
                author: z.boolean().default(true),
            })
            .strict(),
});

const pages = defineCollection({
    loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/pages" }),
    schema: z.object({
        title: z.string(),
        description: z.string().optional(),
    }),
});

export const collections = { article, pages };
