import { createOgImageRoute } from "@marxchou/dogeared-og-image";

// 与 probe/render.mjs 同一份 fixture：三条出图路径（裸 Node / Astro 预渲染 / esbuild 打包）
// 必须产出逐字节相同的 PNG，才能把「satori 升级」与「打包方式」两件事分开归因。
const posts = [
    {
        slug: "hello",
        title: "第三方干净安装验收",
        tags: ["release", "packaging"],
        pubDate: new Date("2026-11-06T00:00:00Z"),
        description:
            "Three Dogeared packages installed from local tarballs into an empty Astro project, then built.",
    },
    {
        slug: "cjk-long",
        title: "升级之后重新测量三条出图路径是否逐字节一致以及中文是否出现豆腐块",
        tags: ["og", "cjk"],
        pubDate: new Date("2026-11-06T00:00:00Z"),
        description: "中文标题截断边界与省略号位置",
    },
    {
        slug: "latin",
        title: "Satori upgrade changes text measurement, so every glyph advance matters here",
        tags: ["og", "latin"],
        pubDate: new Date("2026-11-06T00:00:00Z"),
        description:
            "Latin line breaking and letter spacing sanity check for the Dogeared OG card renderer.",
    },
];

export const GET = createOgImageRoute({
    posts,
    site: {
        title: "Dogeared Consumer",
        author: "Third Party",
        url: "https://consumer.example.com",
        description: "Clean install smoke test",
    },
    theme: { background: "#0d1117", foreground: "#f0f0f0", accent: "#d4a040" },
});

export const getStaticPaths = () => posts.map((post) => ({ params: { og: post.slug } }));
