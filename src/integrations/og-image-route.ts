/**
 * `/og/[...og].png` 的站点侧路由壳（渲染逻辑在 `packages/og-image`）。
 *
 * 本文件承担三件主题侧的事（21-m3-plan.md §3.3「由主题侧组装 options 注入」）：
 *   1. 调色板：`OG_IMAGE_THEME` —— 原路由里的字面量，逐字搬出，出图逐字节不变；
 *   2. `buildOgImageOptions()` —— 读站点身份（`~/config`）与文章集合
 *      （`~/utils/article-stats`），组装成 `createOgImageRoute()` 的入参，
 *      包内因此不再有 `~/` 依赖；
 *   3. `getStaticPaths()` —— 枚举要预渲染的 slug（站点知识，包不该知道）。
 *
 * options 只组装一次（模块级 Promise），`getStaticPaths` 与 `GET` 共享，
 * 避免每张图都重新读一遍文章集合。
 */
import type { APIRoute } from "astro";
import { createOgImageRoute } from "../../packages/og-image/src/index";
import type { OgImageOptions, OgImageTheme } from "../../packages/og-image/src/types";
import { author, site } from "~/config";
import { getAllArticles } from "~/utils/article-stats";

/** OG 图版式调色板。包不得依赖 `@marxchou/zcblog-tokens`（§3.4），颜色只能以值注入。 */
export const OG_IMAGE_THEME: OgImageTheme = {
    background: "#0d1117",
    foreground: "#f0f0f0",
    accent: "#d4a040",
    muted: "#8b949e",
    subtle: "#5c6370",
    divider: "rgba(255,255,255,0.08)",
    gradient: "linear-gradient(135deg, #0d1117 0%, #161b22 40%, #0f1419 100%)",
};

/**
 * 组装包所需的 options。字体不传 —— 用包默认的 CDN 地址 + `.astro/fonts` 缓存；
 * 受限网络（或 CI）下在这里补 `fonts: { regular, bold }` 指向本地文件即可覆盖。
 */
export async function buildOgImageOptions(): Promise<OgImageOptions> {
    const articles = await getAllArticles();
    return {
        posts: articles.map((entry) => ({
            slug: entry.id,
            title: entry.data.title,
            tags: entry.data.tags ?? [],
            pubDate: entry.data.pubDate,
            description: entry.data.description ?? "",
        })),
        site: {
            title: site.title,
            author: author.type ?? site.title,
            url: site.url,
            description: site.description,
        },
        theme: OG_IMAGE_THEME,
    };
}

const prepared = (async () => {
    const options = await buildOgImageOptions();
    return {
        posts: options.posts,
        route: createOgImageRoute(options),
    };
})();

export async function getStaticPaths() {
    const { posts } = await prepared;
    return posts.map((post) => ({ params: { og: post.slug } }));
}

export const GET: APIRoute = async (context) => {
    const { route } = await prepared;
    return route(context);
};
