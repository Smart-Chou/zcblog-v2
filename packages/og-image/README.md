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
`<npm-scope>` below.

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

- Peer dependency: `astro` `^7.3.6` (route handlers are `APIRoute`).
- Dependencies: `satori`, `sharp` (both installed automatically; `sharp` ships prebuilt
  binaries for common platforms).
- Node.js 22 or 24.

## License

MIT. See `LICENSE`. Attribution notes for prior art live in `NOTICE`.
