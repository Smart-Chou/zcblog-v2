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
`<npm-scope>` below.

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

- Peer dependency: `astro` `^7.3.6` (the components are `.astro` files resolved by Astro's
  Vite pipeline; they are not compiled to plain JS).
- No runtime dependencies.

## License

MIT. See `LICENSE`. Attribution notes for prior art live in `NOTICE`.
