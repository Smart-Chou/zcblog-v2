import type { CollectionEntry } from "astro:content";
import { articleSlug, filterByLang, type ArticleLang } from "~/utils/article-url";

/**
 * 系列 / 专栏的数据层（M5-12 · D-0145）
 *
 * 契约（只有两个 frontmatter 字段，见 `src/content.config.ts`）：
 *   · `series`      = URL slug，ASCII 小写 kebab；**不是展示名**
 *   · `seriesOrder` = 系列内升序编号，缺省排在已编号文章之后
 *
 * 展示名从 slug 派生（`seriesNameOf`）：不给站点层加“系列注册表”配置，
 * 也不给内容仓加第三个字段——回填 89 篇文章时，字段越少越不容易写错。
 *
 * 三条硬规则：
 *  1. **零 series = 零系列**：`collectSeries` 只返回有文章的分组，空数组的上游
 *     （`getStaticPaths`）直接返回 `[]`，所以没写 series 的站点不会多出任何路由/空壳。
 *  2. **草稿不进系列**：`draft: true` 的文章既不计数也不排序（与列表页口径一致）。
 *  3. **排序稳定**：`seriesOrder` → pubDate 升序 → slug 字典序，三档兜底，
 *     重复编号不会让两次构建产出不同顺序（视觉基线才不会抖）。
 */

/** 与 `content.config.ts` 的 zod 正则同源；改一处必须改另一处。 */
export const SERIES_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ArticleEntry = CollectionEntry<"article">;

/** 文章的系列 slug；没写 / 空串 → null（空串在 schema 里已不合法，这里只做防御）。 */
export function seriesSlugOf(post: Pick<ArticleEntry, "data">): string | null {
    const value = post.data.series;
    if (typeof value !== "string") return null;
    const slug = value.trim();
    return slug.length > 0 ? slug : null;
}

/**
 * slug → 展示名：`self-hosted` → `Self Hosted`。
 * 纯数字段原样保留（`astro-7` → `Astro 7`）；中文不在 slug 契约内，无需处理。
 */
export function seriesNameOf(slug: string): string {
    return slug
        .split("-")
        .filter((word) => word.length > 0)
        .map((word) => (/^\d+$/.test(word) ? word : word[0].toUpperCase() + word.slice(1)))
        .join(" ");
}

/** `seriesOrder` 的排序键：缺省 = 已编号文章之后（不参与 Infinity 减法）。 */
function orderKeyOf(post: ArticleEntry): number {
    const value = post.data.seriesOrder;
    return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

/**
 * 系列内排序：seriesOrder 升序 → pubDate 升序（先写先读）→ slug 字典序。
 * 不用 `a - b`：两个缺省值的差是 `Infinity - Infinity = NaN`，`sort` 会退化成实现相关顺序。
 */
export function sortSeriesPosts(posts: ArticleEntry[]): ArticleEntry[] {
    return [...posts].sort((a, b) => {
        const orderA = orderKeyOf(a);
        const orderB = orderKeyOf(b);
        if (orderA !== orderB) return orderA < orderB ? -1 : 1;

        const timeA = a.data.pubDate.getTime();
        const timeB = b.data.pubDate.getTime();
        if (timeA !== timeB) return timeA - timeB;

        return articleSlug(a).localeCompare(articleSlug(b));
    });
}

export interface SeriesGroup {
    /** URL slug（= frontmatter 的 series 值） */
    slug: string;
    /** 展示名（由 slug 派生） */
    name: string;
    /** 系列内文章，已按 `sortSeriesPosts` 排序 */
    posts: ArticleEntry[];
    /** 系列内最新 pubDate，用于索引页的“最近更新” */
    latest: Date;
}

/**
 * 从文章集合里聚合系列。
 * - 只保留至少有 1 篇非草稿文章的系列（索引页因此不需要空态分支）
 * - 系列之间按展示名字典序（稳定，且与计数/时间无关，索引页不会因为发了新文章而整体重排）
 */
export function collectSeries(posts: ArticleEntry[]): SeriesGroup[] {
    const buckets = new Map<string, ArticleEntry[]>();

    for (const post of posts) {
        if (post.data.draft) continue;
        const slug = seriesSlugOf(post);
        if (!slug) continue;
        const bucket = buckets.get(slug);
        if (bucket) bucket.push(post);
        else buckets.set(slug, [post]);
    }

    const groups: SeriesGroup[] = [];
    for (const [slug, bucket] of buckets) {
        const sorted = sortSeriesPosts(bucket);
        const latest = sorted.reduce(
            (max, post) => (post.data.pubDate.getTime() > max.getTime() ? post.data.pubDate : max),
            sorted[0].data.pubDate,
        );
        groups.push({ slug, name: seriesNameOf(slug), posts: sorted, latest });
    }

    return groups.sort(
        (a, b) => a.name.localeCompare(b.name, "en") || a.slug.localeCompare(b.slug),
    );
}

/** 某语言的系列（zh / en 各自独立；en 无系列时返回空数组 → 该语言不产出 /series/ 路由）。 */
export function collectSeriesByLang(posts: ArticleEntry[], lang: ArticleLang): SeriesGroup[] {
    return collectSeries(filterByLang(posts, lang));
}

/** 系列页 URL（zh 无前缀，en 带 `/en`）。 */
export function seriesHref(locale: ArticleLang, slug?: string): string {
    const prefix = locale === "en" ? "/en/series" : "/series";
    return slug ? `${prefix}/${slug}/` : `${prefix}/`;
}

/** 系列索引页 URL */
export function seriesIndexHref(locale: ArticleLang): string {
    return seriesHref(locale);
}

/**
 * 系列里“第几篇”用的两位序号（`01`）。索引从 1 起，与页面上展示的 STEP 数字一致。
 * 当前系列的成员数量上限是构建期数据，不需要处理 >99 的补齐。
 */
export function seriesStepLabel(index: number): string {
    return String(index + 1).padStart(2, "0");
}
