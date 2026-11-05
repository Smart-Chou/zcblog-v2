# Dogeared OG Image

OG image route factory for the **Dogeared** (折角) Astro blog theme. Renders 1200×630 PNGs
with Satori (HTML → SVG) and Sharp (SVG → PNG).

The package knows nothing about your site: posts, site identity, palette and fonts are
passed in as options. That keeps it reusable across themes and free of imports from site
code.

> Status: **private, not published yet.** Install instructions below are forward-looking;
> the package stays `"private": true` until the release card flips it.

## API

```ts
createOgImageRoute(options: {
    posts: Array<{ slug: string; title: string; tags: string[]; pubDate: Date; description?: string }>;
    site: { title: string; author: string; url: string; description?: string };
    theme: {
        background: string;
        foreground: string;
        accent: string;
        muted?: string;
        subtle?: string;
        divider?: string;
        gradient?: string;
    };
    fonts?: { regular: string; bold: string };  // http(s) URL or local path
    fontCacheDir?: string;                      // default `<cwd>/.astro/fonts`
}): APIRoute
```

All four top-level keys are required. Optional fields only change the parts they name —
omitting them reproduces the theme's default layout exactly.

## Install (after publish)

The package name is declared in `package.json` (`name`); substitute its scope for
`<npm-scope>` below. `@<npm-scope>` is a **placeholder on purpose** — the package boundary gate
(B2) forbids writing the organisation identity into package files, so the scope is filled in
after the first publish.

```bash
npm install @<npm-scope>/dogeared-og-image
```

## Usage

```ts
// src/pages/og/[...slug].png.ts
import { createOgImageRoute } from "@<npm-scope>/dogeared-og-image";
import type { OgImageTheme } from "@<npm-scope>/dogeared-og-image";

const theme: OgImageTheme = {
    background: "#0d1117",
    foreground: "#f0f0f0",
    accent: "#d4a040",
};

// Your own article collection — the package never reads site data itself.
const posts: Array<{ id: string; title: string; tags: string[]; pubDate: Date; description?: string }> = [];

export const GET = createOgImageRoute({
    posts: posts.map((post) => ({
        slug: post.id,
        title: post.title,
        tags: post.tags,
        pubDate: post.pubDate,
        description: post.description,
    })),
    site: { title: "Dogeared", author: "Author", url: "https://example.com" },
    theme,
});

// Pre-render one image per post (site knowledge stays on your side).
export const getStaticPaths = () => posts.map((post) => ({ params: { slug: post.id } }));
```

Fonts default to Noto Sans SC downloaded from a CDN and cached under `.astro/fonts`.
Offline or locked-down builds should pass `fonts` with local files — the package fails
loudly rather than rendering without a font.

## Requirements

- Node.js `>=22` (ESM only). No native build step on your side.
- Dependencies: `satori`, `sharp` (both installed automatically; `sharp` ships prebuilt binaries
  for common platforms).
- Peer `astro` `^7.3.6` is declared **optional** (`peerDependenciesMeta`): no Astro code is
  loaded at runtime — only the `APIRoute` return type comes from it. Install `astro` yourself if
  you want full type checking in an Astro project; npm will not pull it in for you.
- The published entry is **compiled ESM** (`dist/index.js` + `dist/index.d.ts`), not TypeScript
  source: bare Node, `tsx`, bundlers and Astro all resolve it. `dist/` is rebuilt by
  `npm run build` (also wired to `prepack`), so a git/tarball install without `dist/` only needs
  one `npm run build` inside the package.

## Usage outside Astro

The factory returns a plain `(context) => Promise<Response>` handler — nothing Astro-specific
happens at runtime, so any HTTP server or prerender script can call it:

```js
import { createOgImageRoute } from "@<npm-scope>/dogeared-og-image";

const GET = createOgImageRoute({ posts, site, theme });
const response = await GET({ params: { og: "my-post" } }); // 200 + image/png
```

## License

MIT. See `LICENSE`. Attribution notes for prior art live in `NOTICE`.
