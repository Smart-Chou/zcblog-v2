import { createOgImageRoute } from "@marxchou/dogeared-og-image";

const posts = [
    {
        slug: "hello",
        title: "第三方干净安装验收",
        tags: ["release", "packaging"],
        pubDate: new Date("2026-11-06T00:00:00Z"),
        description:
            "Three Dogeared packages installed from local tarballs into an empty Astro project, then built.",
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
    theme: {
        background: "#0d1117",
        foreground: "#f0f0f0",
        accent: "#d4a040",
    },
});

export const getStaticPaths = () => posts.map((post) => ({ params: { og: post.slug } }));
