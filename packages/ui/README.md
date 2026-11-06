# Dogeared UI

Zero-dependency UI primitives for the **Dogeared** (折角) Astro blog theme. Plain `.astro`
components with scoped styles; every visual value comes from CSS custom properties, so the
primitives inherit whatever token layer you load.

> Status: **publishable** (`"private": false`, `publishConfig.access = "public"`).
> Version **2.1.2** is the first version cut from this package; whether it is installable from
> the registry is a registry fact, not a repo fact — check it instead of trusting this file:
>
> ```bash
> npm view @marxchou/dogeared-ui version    # 404 = 首发尚未执行（M5-8，需 PO 批准）
> ```

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

## Install

```bash
npm install @marxchou/dogeared-ui@2.1.2
npm install @marxchou/dogeared-tokens@2.1.2   # 视觉值来源，见下节
```

## Usage

```astro
---
import { Badge, Button } from "@marxchou/dogeared-ui";
---

<Badge variant="tip" size="sm">New</Badge>
<Button href="/archives/" variant="secondary">Archive</Button>
```

Single components are also addressable directly (subpath exports, no barrel needed):

```astro
import Button from "@marxchou/dogeared-ui/Button.astro";
import Badge from "@marxchou/dogeared-ui/Badge.astro";
```

The components expect the theme's token variables on `:root` (`--radius-full`, `--text-sm`,
`--color-accent`, `--color-on-accent`, `--duration-slow`, `--ease-out`, …). Load
`@marxchou/dogeared-tokens` first, or define equivalent variables yourself:

```astro
---
import "@marxchou/dogeared-tokens/variables.css";
import "@marxchou/dogeared-tokens/tokens.css";
---
```

The package does **not** depend on `dogeared-tokens`: the components only read custom properties,
so any equivalent token layer works, and no version is forced on you.

## Requirements

- **Astro / Vite only.** The published API is `.astro` components: Astro's compiler turns them
  into render functions at build time, so they **cannot** be imported by bare Node — `import`
  of the package entry fails on the `.astro` extension. This is by design, not a broken tarball:
  the entry (`dist/index.js`) is plain ESM, but every re-export target is an `.astro` file.
- What ships: `dist/` (the two components + `index.js` / `index.d.ts`), `src/` (source of
  truth), `README.md`, `CHANGELOG.md`, `LICENSE`, `NOTICE`. Import them the way the Usage
  section shows, from inside an Astro project.
- Peer dependency: `astro` `^7.3.6` — declared **optional** (`peerDependenciesMeta`), because
  nothing is loaded from Astro at runtime; Astro is the compiler, not a runtime dependency.
  The range is kept identical to the theme's own `devDependencies.astro` (the package can only
  be exercised against the Astro version the theme builds with); `packages/ui/test/smoke.test.mjs`
  asserts the two stay in sync.
- No runtime dependencies, no devDependencies. Node.js `>=22` only for the maintenance scripts
  (rebuilding `dist/` with `npm run build`).

## Versioning

All three Dogeared packages (`tokens`, `ui`, `og-image`) move in lockstep — same version number,
fixed changesets group. Within a `minor`, nothing breaks; breaking changes ship with the `minor`
and are called out in `CHANGELOG.md`.

## License

MIT. See `LICENSE`. Attribution notes for prior art live in `NOTICE`.
