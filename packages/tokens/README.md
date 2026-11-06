# Dogeared Tokens

Design tokens for the **Dogeared** (折角) Astro blog theme. One JSON source of truth, one
byte-verified generated stylesheet, and a hand-authored primitive layer. Zero runtime
dependencies, no PostCSS/Sass build step.

> Status: **published** as `@marxchou/dogeared-tokens@2.1.1` (2026-11-06).

## What's inside

| File                     | Role                                                                         |
| ------------------------ | ---------------------------------------------------------------------------- |
| `tokens.json`            | Single source of truth: palette, primitives, semantic light/dark, responsive |
| `tokens.css`             | Generated output (`@layer`-friendly `:root` / `[data-theme="dark"]` blocks)  |
| `variables.css`          | Hand-authored primitives and palette, kept as variables                      |
| `scripts/build-tokens.mjs` | Zero-dependency compiler, `--check` mode for CI                            |

`tokens.css` is generated — never edit it by hand. Change `tokens.json`, then rebuild.

## Install

The package is published under its own npm scope:

```bash
npm install @marxchou/dogeared-tokens
```

## Usage

Import the stylesheets from your global CSS. Order matters: primitives first, then the
generated token block, in the same cascade layer.

```css
@layer variables;

@import "@marxchou/dogeared-tokens/variables.css" layer(variables);
@import "@marxchou/dogeared-tokens/tokens.css" layer(variables);
```

The package root (`@marxchou/dogeared-tokens`) resolves to `tokens.css`, so a single
side-effect import works in bundlers that accept a CSS entry: `import "@marxchou/dogeared-tokens";`
— it does **not** create the `variables.css` primitive layer, so load that one first (as above)
unless you define the primitives yourself. There is no JavaScript entry: Node can only read the
files (`./tokens.json`, `./tokens.css`), which is why everything is exported by path.

Read the raw source when tooling needs the values (dashboards, docs, generators):

```js
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tokens = JSON.parse(await readFile(require.resolve("@marxchou/dogeared-tokens/tokens.json"), "utf8"));
```

## Regenerate / verify

```bash
npx dogeared-tokens-build          # tokens.json → tokens.css
npx dogeared-tokens-build --check  # exit 1 if tokens.css drifted from tokens.json
```

## Requirements

- Node.js `>=22` (only for the compiler; the stylesheets themselves are plain CSS).
- No runtime dependencies, no peer dependencies.

## License

MIT. See `LICENSE`. Attribution notes for prior art live in `NOTICE`.
