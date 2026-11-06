# @marxchou/dogeared-ui

## 2.1.2

First published version of this package. It ships two primitives and nothing else:

- `Badge` — inline status/label pill. `variant`: `default` / `note` / `tip` / `danger` /
  `success` / `warning`; `size`: `sm` / `md` / `lg`.
- `Button` — link styled as a button (`<a>`, not `<button>`). `variant`: `primary` / `secondary`.

Shape of the release: no runtime dependencies, `astro` as an **optional** peer (`^7.3.6`), and
components that only read CSS custom properties — any compatible token layer works, with
`@marxchou/dogeared-tokens` as the reference implementation. `dist/` carries the two `.astro`
components plus the ESM barrel and its type declarations; `src/` carries the source of truth.

## Earlier version numbers

`2.1.0` and `2.1.1` were versions of the sibling packages (`@marxchou/dogeared-tokens`,
`@marxchou/dogeared-og-image`); this package stayed `private` through them and was never
published under those numbers. The three packages move in lockstep from `2.1.2` onward.
