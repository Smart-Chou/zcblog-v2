// Third-party probe: resolve every documented entry from an installed tarball,
// then exercise the og-image route with bare Node (no Astro runtime).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const entries = [
    "@marxchou/dogeared-tokens",
    "@marxchou/dogeared-tokens/tokens.css",
    "@marxchou/dogeared-tokens/variables.css",
    "@marxchou/dogeared-tokens/tokens.json",
    "@marxchou/dogeared-ui",
    "@marxchou/dogeared-ui/Badge.astro",
    "@marxchou/dogeared-ui/Button.astro",
    "@marxchou/dogeared-og-image",
];

for (const entry of entries) {
    try {
        console.log(
            `resolve OK  ${entry} -> ${require.resolve(entry).replace(process.cwd(), ".")}`,
        );
    } catch (error) {
        console.log(`resolve FAIL ${entry} -> ${error.code || error.message}`);
    }
}

const og = await import("@marxchou/dogeared-og-image");
console.log("og-image exports:", Object.keys(og).join(", "));

const GET = og.createOgImageRoute({
    posts: [{ slug: "bare", title: "Bare Node 渲染", tags: [], pubDate: new Date() }],
    site: { title: "Bare", author: "Nobody", url: "https://example.com" },
    theme: { background: "#111111", foreground: "#ffffff", accent: "#d4a040" },
});

const ok = await GET({ params: { og: "bare" } });
const body = await ok.arrayBuffer();
console.log(
    "bare GET /og/bare ->",
    ok.status,
    ok.headers.get("content-type"),
    body.byteLength,
    "bytes",
);

const miss = await GET({ params: { og: "nope" } });
console.log("bare GET /og/nope ->", miss.status, (await miss.text()).slice(0, 60));

try {
    await import("@marxchou/dogeared-ui");
    console.log("ui bare import -> UNEXPECTED SUCCESS");
} catch (error) {
    console.log("ui bare import -> expected failure:", error.code || error.message);
}
