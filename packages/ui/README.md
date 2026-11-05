# Dogeared UI

Zero-dependency UI primitives for the **Dogeared** (折角) Astro blog theme. Plain `.astro`
components with scoped styles; every visual value comes from CSS custom properties, so the
primitives inherit whatever token layer you load.

> Status: **private, not published yet.** Install instructions below are forward-looking;
> the package stays `"private": true` until the release card flips it.

## Components

### `Badge`

Inline status/label pill.

| Prop      | Type                                                                          | Default     |
| --------- | ----------------------------------------------------------------------------- | ----------- |
| `variant` | `"default" \| "note" \| "tip" \| "danger" \| "success" \| "warning"`            | `"default"` |
| `size`    | `"sm" \| "md" \| "lg"`                                                         | `"md"`      |

### `Button`

Link styled as a button (`<a>`, not `<button>`).

| Prop      | Type                          | Default     |
| --------- | ----------------------------- | ----------- |
| `href`    | `string` (required)           | —           |
| `variant` | `"primary" \| "secondary"`    | `"primary"` |
| `target`  | `string`                      | —           |
| `rel`     | `string`                      | —           |
| `class`   | `string`                      | —           |

## Install (after publish)

The package name is declared in `package.json` (`name`); substitute its scope for
`<npm-scope>` below. `@<npm-scope>` is a **placeholder on purpose** — the package boundary gate
(B2) forbids writing the organisation identity into package files, so the scope is filled in
after the first publish.

```bash
npm install @<npm-scope>/dogeared-ui
```

## Usage

```astro
---
import { Badge, Button } from "@<npm-scope>/dogeared-ui";
---

<Badge variant="tip" size="sm">New</Badge>
<Button href="/archives/" variant="secondary">Archive</Button>
```

Single components are also addressable directly:

```astro
import Button from "@<npm-scope>/dogeared-ui/Button.astro";
```

The components expect the theme's token variables on `:root` (`--radius-full`, `--text-sm`,
`--color-accent`, `--color-on-accent`, `--duration-slow`, `--ease-out`, …). Load
`@<npm-scope>/dogeared-tokens` first, or define equivalent variables yourself.

## Requirements

- **Astro / Vite only.** The published API is `.astro` components: Astro's compiler turns them
  into render functions at build time, so they **cannot** be imported by bare Node — `import`
  of the package entry fails on the `.astro` extension. This is by design, not a broken tarball:
  the entry (`dist/index.js`) is plain ESM, but every re-export target is an `.astro` file.
- What ships: `dist/` (the two components + `index.js` / `index.d.ts`) and `src/` (source of
  truth). Import them the way the Usage section shows, from inside an Astro project.
- Peer dependency: `astro` `^7.3.6` — declared **optional** (`peerDependenciesMeta`), because
  nothing is loaded from Astro at runtime; Astro is the compiler, not a runtime dependency.
- No runtime dependencies, no devDependencies. Node.js `>=22` only for the maintenance scripts
  (rebuilding `dist/` with `npm run build`).

## License

MIT. See `LICENSE`. Attribution notes for prior art live in `NOTICE`.
