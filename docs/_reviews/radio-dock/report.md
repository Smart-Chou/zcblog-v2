# Dogeared Radio · `/radio/` dock prototype

> 2026-11-12 · scope: one page, one page-scoped dock. Not the M8-4 site-wide player.
> Route: `/radio/` (zh) · `/en/radio/` (en) · `noindex`

## 1. What is running

| Station | Stream | Why |
|---|---|---|
| **Radio Paradise · Main Mix** (default) | `https://stream.radioparadise.com/mp3-128` | Human-curated, no ads, public stream links intended for third-party players |
| **Nightride FM** (fallback) | `https://stream.nightride.fm/nightride.mp3` | Synthwave/cyberpunk community station, 24/7 live |

`Devs.fm` was the intended second station, but its current client is stuck on the boot animation (`Performing system diagnostics...`) and exposes no audio source in the page or its JS chunks. Nightride replaces it rather than shipping a dead button.

CSP: `media-src 'self' https://stream.radioparadise.com https://stream.nightride.fm` — exact origins, no wildcard.

## 2. Interaction contract

- Collapsed by default; the bar's play button starts Radio Paradise and opens the panel.
- Station switch stops the current element, clears `src`, reloads, and resumes if already playing.
- Volume is persisted in `localStorage` (`dogeared-radio-volume`); station in `dogeared-radio-station`.
- Pause does not clear the source; leaving `/radio/` removes the audio element and stops playback.
- No now-playing API: Radio Paradise's endpoint has no CORS header, so the dock only claims a truthful `LIVE` state and links to the station's own now-playing page.
- No JS on page load beyond the dock module (loaded conditionally by BaseLayout when `[data-radio-dock]` exists).

## 3. Measured

Playwright / Chromium (local preview, `127.0.0.1:4321`):

| Check | Result |
|---|---|
| Radio Paradise play | `readyState=4`, `paused=false`, status `Live · Radio Paradise` |
| Nightride play after switch | `readyState=4`, status `Live · Nightride FM` |
| 375 closed dock | `bottom=728` vs bottom tabs `top=751` → **23px gap** |
| 375 open dock | `bottom=728`, tabs `751` → **23px gap** |
| Horizontal overflow | none (`scrollWidth < clientWidth` in Chromium) |
| axe 375 light/dark | serious/critical **0** |
| axe 1440 dark | serious/critical **0** |
| axe 1440 light | only the pre-existing shell labels (`pf-trigger-text`, `nav-menu-btn-label`, 4.4:1) — not radio content |

Shots: `docs/_reviews/radio-dock/shots/` (`radio-1440-light.png`, `radio-375-collapsed.png`, `radio-dock-playing-1440.png`, `radio-dock-375.png`).

## 4. Files

- `src/pages/radio/index.astro` / `src/pages/en/radio/index.astro` — page shells
- `src/components/Radio/RadioPageContent.astro` — page copy/layout (outside `Pages/` so it does not add page-organism debt)
- `src/components/Layout/RadioDock.astro` — dock markup + scoped CSS
- `src/scripts/radio-dock.ts` — page-scoped state machine
- `src/styles/pages/radio.css` — page rhythm/typography
- `src/components/BaseHead/ContentSecurityPolicy.astro` — `media-src` additions
- `src/layouts/BaseLayout.astro` — conditional dock loader

## 5. Deliberately not done

- No nav entry, no sitemap priority, no visual baselines for `/radio/` (noindex prototype).
- Not site-wide; no swup singleton; no cross-page playback.
- No station directory, no HLS, no metadata polling.
