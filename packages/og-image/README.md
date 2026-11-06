# Dogeared OG Image

OG image route factory for the **Dogeared** (折角) Astro blog theme. Renders 1200×630 PNGs
with Satori (HTML → SVG) and Sharp (SVG → PNG).

The package knows nothing about your site: posts, site identity, palette and fonts are
passed in as options. That keeps it reusable across themes and free of imports from site
code.

> Status: **published** as `@marxchou/dogeared-og-image@2.1.2` (2026-11-06; `latest` dist-tag).
> Authoritative version is the registry — check with `npm view @marxchou/dogeared-og-image version`
> or, in the theme repo, `pnpm verify:registry`. Upgrade/rollback steps live in
> [`docs/npm-consumer.md`](../../docs/npm-consumer.md) 的 §5（升级）/ §6（回滚）。

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

## Install

The package is published under its own npm scope:

```bash
npm install @marxchou/dogeared-og-image
```

## Usage

```ts
// src/pages/og/[...slug].png.ts
import { createOgImageRoute } from "@marxchou/dogeared-og-image";
import type { OgImageTheme } from "@marxchou/dogeared-og-image";

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

## Dependency and audit notes

- `satori` is pinned to `^0.63.2`. The floor matters: a `0.x` caret only allows patch bumps, so
  the declared floor is what consumers actually install. Version 0.26.0 (the earlier floor) sits
  inside the range of GHSA-wx4j-mvgx-mqwp (improper SVG escaping, affected `0.0.27`–`0.33.4`)
  where npm reports **no fix available**; `0.33.5` is the first release outside it. The package
  therefore requires `>=0.63.2` — do not override it downwards.
- Rendering parity across that jump was verified image-by-image (layout bands, decoration
  geometry, CJK glyph coverage). The one behavioural change satori made is that from `0.27` the
  root box uses CSS-default `content-box`; the package sets `boxSizing: "border-box"` explicitly
  so the 1200×630 canvas keeps its padding instead of growing to 1382×758 and clipping the footer.
- `satori` pins `fflate@0.7.3` exactly, and GHSA-px8p-9vwx-vf98 (`unzipSync`, malformed ZIP64)
  covers `<0.7.5`, so `npm audit` reports one **moderate** on a freshly installed project even
  though satori only imports `inflateSync` (WOFF-1 table decompression of the font buffers you
  pass in). To silence it, add to your app's `package.json` — nothing else changes, verified
  byte-identical output:

  ```json
  {
    "overrides": {
      "satori": { "fflate": "^0.7.5" }
    }
  }
  ```

  The override only affects `fflate` under `satori`; do **not** override it globally — other
  dependencies (e.g. `@iconify/tools`) legitimately require `fflate@^0.8.3`, and a global
  override would downgrade them. `fflate` 0.7.5 is a patch release in the same minor line as
  satori's 0.7.3; the package's rendered PNGs are byte-identical with and without it.

  For pnpm, put the scoped override in `package.json`:

  ```json
  { "pnpm": { "overrides": { "satori>fflate": "^0.7.5" } } }
  ```

  or in `pnpm-workspace.yaml` for a workspace root:

  ```yaml
  overrides:
      satori>fflate: "^0.7.5"
  ```

  For Yarn:

  ```json
  { "resolutions": { "satori/fflate": "^0.7.5" } }
  ```

  If your CI runs `npm audit --audit-level=moderate`, add one of the overrides above; otherwise
  the install will report this known, unreachable advisory on every clean install.

## Usage outside Astro

The factory returns a plain `(context) => Promise<Response>` handler — nothing Astro-specific
happens at runtime, so any HTTP server or prerender script can call it:

```js
import { createOgImageRoute } from "@marxchou/dogeared-og-image";

const GET = createOgImageRoute({ posts, site, theme });
const response = await GET({ params: { og: "my-post" } }); // 200 + image/png
```

## License

MIT. See `LICENSE`. Attribution notes for prior art live in `NOTICE`.
