/**
 * `/poster/[...slug].png` —— 文章竖版分享海报（3:4，1200×1600）的**构建期静态资产**。
 *
 * M7-3b-1 在包里加了 `poster?: boolean`（同一 Satori 模板切 3:4），本文件把它接到站点：
 *   1. `getStaticPaths()` 枚举全部文章 —— 与 `/og/[...og].png` 用同一份列表
 *      （`buildOgImageOptions()` 的 `posts`），因此两边的 slug 集合天然一致；
 *   2. `GET` 复用同一份 options，只多传 `poster: true`。
 *
 * 只在构建期跑（`output: "static"` 下预渲染成 `dist/poster/<slug>.png`）：
 * satori/sharp 留在 Node 侧，浏览器包不引入任何东西；分享弹层（M7-3c）只需
 * `<img src="/poster/<slug>.png">`，不要再回退成运行期动态请求。
 */
import type { APIContext, APIRoute, GetStaticPaths } from "astro";
import { createOgImageRoute } from "../../../packages/og-image/src/index";
import { buildOgImageOptions } from "~/integrations/og-image-route";

/** options 只组装一次，`getStaticPaths` 与 `GET` 共享（与 `/og/` 路由壳同构）。 */
const prepared = (async () => {
    const options = await buildOgImageOptions();
    return {
        posts: options.posts,
        route: createOgImageRoute({ ...options, poster: true }),
    };
})();

export const getStaticPaths = (async () => {
    const { posts } = await prepared;
    return posts.map((post) => ({ params: { slug: post.slug } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async (context) => {
    const { route } = await prepared;
    // factory 沿用 `/og/[...og].png` 的 slug 读取实现（读 `params.og`）；本端点的
    // rest 段按约定叫 `slug`，在这里做一次参数名映射 —— 包内源码不动。
    //
    // 只传 `params`：factory 全程只解构 `{ params }`（包内 route.ts），而展开整个
    // `APIContext` 会碰到 `clientAddress` 等 getter —— 在 prerender 阶段直接抛
    // `PrerenderClientAddressNotAvailable`。
    const adapted = { params: { og: context.params.slug } } as unknown as APIContext;
    return route(adapted);
};
