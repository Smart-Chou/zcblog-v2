import { test, expect, type Page } from "@playwright/test";

/**
 * Armed-visitor element baselines for the site-wide player — DESIGN.md §5.7.1.
 *
 * `pages.visual.spec.ts` deliberately does not cover the player: arm-on-play means a visitor
 * who never pressed play has **zero** `.site-player` nodes (`dist/` proves it: 0 of 151 built
 * HTML files contain the element). That reasoning only covers S0. A visitor who *has* pressed
 * play (or is on `/radio/`) sees one of three shapes, and until now none of them had pixels
 * under a gate — `docs/_reviews/radio-dock/shots/` are hand-taken screenshots, not assertions.
 *
 * 3 shapes × 2 themes × 2 viewports = 12 element shots per platform:
 *
 *   idle | expanded | error   ×   light | dark   ×   375 | 1440
 *
 * ## Why element-level, not page-level
 *
 * The player is a `position: fixed` overlay pinned to the bottom-right corner. A page-level
 * screenshot would be ~3600px tall to include a 46px pill, and every unrelated page change
 * (an article edit, a hero rotation) would redden the player gate. `expect(locator)` captures
 * exactly the box the component owns, so a red shot can only mean the component moved.
 *
 * ## Why 1440 and not 768
 *
 * 768 is the shape-switch boundary (`@media (max-width: 768px)` widens the pill to a bar) and
 * `pages-radio.spec.ts` already asserts the 375/768/1440 overflow + BottomTabs contracts
 * there. This suite is about pixels of the three shapes, so it takes one narrow phone width
 * (375, where the ≤640 BottomTabs offset applies) and one desktop width (1440).
 *
 * ## How each shape is forced (and what is deliberately *not* pinned)
 *
 * - **armed**: `localStorage["dogeared-radio-armed"] = "1"` via `addInitScript`, i.e. the
 *   same gate `SitePlayer.astro` reads, not a CSS override. The player really mounts itself.
 * - **station**: `localStorage["dogeared-radio-station"] = "radioparadise"` + the volume key,
 *   so the title, subtitle, LIVE badge and slider position are fixed. Without this the shot
 *   depends on whatever station/volume the previous run left behind.
 * - **`currentTime` is not pinned**: the stream is live (no duration, no progress bar), so
 *   there is no time-derived pixel in the box. Pinning it would need a real stream.
 * - **error**: `page.route("**://stream.radioparadise.com/**", abort)` — the request fails,
 *   `audio.error` fires, `setError()` runs. No CSP change, no network, no real stream.
 * - **playback is not started** for `expanded`: the toggle button expands the card without
 *   touching `audio`, so the shot never depends on a stream. `data-playing` stays `false` and
 *   the play icon stays a play triangle — that is deterministic, which is the point.
 *
 * ## Non-pixel assertions run alongside every shot (§5.3)
 *
 * 1. `data-state` agrees with `<audio>.paused` (a player that *looks* playing while the audio
 *    element is paused is the failure mode the icon cannot express).
 * 2. V1: the player rectangle does not intersect `#back-to-top`, with `--space-3` (12px) of
 *    clearance on one axis. `KNOWN_V1_OVERLAP` is a ratchet, not a whitelist: see below.
 * 3. No horizontal overflow (`scrollWidth - clientWidth ≤ 1`).
 *
 * ## `KNOWN_V1_OVERLAP` — an existing defect this suite found, recorded not hidden
 *
 * Measured on the fixture build (151 pages) at `≤640px`, the player **does** cover
 * `#back-to-top`: the CSS raises the button by `--space-4 + --space-3 + block-size` while the
 * player's own bottom offset at `≤640` is `60px (BottomTabs) + --space-6`, so the button lands
 * inside the player band. At 375 `expanded` the player is `[708,816]` and the button
 * `[722,764]` — 42px of vertical overlap, and `elementFromPoint` at the button's centre
 * resolves to the player's `<svg>`, i.e. it is covered *and* unclickable.
 *
 * Fixing it means changing `SitePlayer.astro`'s avoidance arithmetic, which is outside this
 * card (guard-rail only, no behaviour change). So the two failing cells are recorded here by
 * exact `state@width`, and the suite **fails if a recorded cell stops failing** — a fix
 * cannot silently leave a stale exemption behind.
 */

type Shape = "idle" | "expanded" | "error";
type Theme = "light" | "dark";

const SHAPES: Shape[] = ["idle", "expanded", "error"];
const THEMES: Theme[] = ["light", "dark"];
const VIEWPORTS = [375, 1440] as const;

const PLAYER = ".site-player";
const ARTICLE = "/article/beszel-server-monitoring-guide/";

/**
 * Cells where V1 is currently violated, keyed `shape@width`. Empty this map as the defect is
 * fixed; the suite reddens on any entry whose cell no longer overlaps, which forces removal.
 */
const KNOWN_V1_OVERLAP = new Set<string>(["expanded@375", "error@375"]);

const IMAGE_STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';

/**
 * Answer/deny every non-localhost request (same contract as `pages.visual.spec.ts`), then
 * fail the audio origin specifically. Registered before `goto` so the player's own chunk and
 * CSS still load normally from 127.0.0.1.
 */
async function stubNetwork(page: Page): Promise<void> {
    await page.route("**://stream.radioparadise.com/**", (route) => route.abort());
    await page.route("**/*", (route) => {
        const { hostname } = new URL(route.request().url());
        if (hostname === "localhost" || hostname === "127.0.0.1") return route.continue();
        if (route.request().resourceType() === "image") {
            return route.fulfill({ status: 200, contentType: "image/svg+xml", body: IMAGE_STUB });
        }
        return route.abort();
    });
}

/** Arm the player through the same localStorage gate the component reads. */
async function armPlayer(page: Page): Promise<void> {
    await page.addInitScript(() => {
        localStorage.setItem("dogeared-radio-armed", "1");
        localStorage.setItem("dogeared-radio-station", "radioparadise");
        localStorage.setItem("dogeared-radio-volume", "0.72");
    });
}

async function setTheme(page: Page, theme: Theme): Promise<void> {
    await page.evaluate((value) => {
        const root = document.documentElement;
        root.setAttribute("data-theme", value);
        root.classList.toggle("dark", value === "dark");
        root.style.colorScheme = value;
    }, theme);
}

/**
 * Wait until the player's own geometry stops moving.
 *
 * `trackHeight()` writes `--site-player-block-size` from a `ResizeObserver`, and the avoidance
 * rules read it back — so right after a state change the button position is one frame behind
 * the card. Screenshotting (or measuring) in that window produces a diff that has nothing to
 * do with the change under test. Wait for the variable to equal the real height and for both
 * rects to repeat across frames.
 */
async function settle(page: Page): Promise<void> {
    let stable = 0;
    let previous = "";
    for (let i = 0; i < 120 && stable < 3; i++) {
        const snapshot = await page.evaluate(() => {
            const player = document.querySelector(".site-player")?.getBoundingClientRect();
            const button = document.querySelector("#back-to-top")?.getBoundingClientRect();
            const declared = document.body.style.getPropertyValue("--site-player-block-size");
            return [
                Math.round(player?.height ?? 0),
                Math.round(player?.top ?? 0),
                Math.round(button?.top ?? 0),
                declared,
            ].join("|");
        });
        stable = snapshot === previous ? stable + 1 : 0;
        previous = snapshot;
        await page.waitForTimeout(60);
    }
    if (stable < 3) throw new Error("播放器几何在 7s 内没有稳定（ResizeObserver 抖动？）");
}

/**
 * Freeze whatever is *behind* the rounded corners.
 *
 * `expect(locator)` screenshots the bounding box, corners included — so the page under the
 * radius shows through and an article edit would redden the player gate. Hiding the siblings
 * (not the player, not the layout boxes the avoidance rules measure) leaves a flat backdrop
 * and keeps every rect untouched: `visibility` does not reflow.
 */
async function pinBackdrop(page: Page): Promise<void> {
    await page.evaluate(() => {
        const player = document.querySelector(".site-player");
        const app = document.getElementById("app");
        for (const sibling of Array.from(document.body.children)) {
            if (sibling === player || sibling === app) continue;
            (sibling as HTMLElement).style.visibility = "hidden";
        }
        if (app) app.style.visibility = "hidden";
        // The page canvas, read from the live cascade rather than hard-coded: this keeps the
        // backdrop correct in both themes without naming a color in the spec.
        document.body.style.background = getComputedStyle(document.body).backgroundColor;
    });
}

/** V1 + audio/state agreement + overflow, evaluated on the settled layout. */
async function assertInvariants(page: Page, shape: Shape, label: string): Promise<void> {
    const result = await page.evaluate(() => {
        const player = document.querySelector<HTMLElement>(".site-player")!;
        const audio = player.querySelector("audio");
        const backToTop = document.querySelector<HTMLElement>("#back-to-top");
        const p = player.getBoundingClientRect();
        const b = backToTop?.getBoundingClientRect();

        const clearance = b
            ? {
                  x: b.left - p.right,
                  y: b.top - p.bottom,
                  // "Not intersecting with ≥12px clearance on one axis" is the V1 contract:
                  // the pill clears the button sideways at phone widths and vertically on
                  // desktop, so demanding both would encode one layout as the rule.
                  separated:
                      b.left >= p.right + 12 ||
                      b.right + 12 <= p.left ||
                      b.top >= p.bottom + 12 ||
                      b.bottom + 12 <= p.top,
                  intersect: !(
                      p.right <= b.left ||
                      p.left >= b.right ||
                      p.bottom <= b.top ||
                      p.top >= b.bottom
                  ),
              }
            : null;

        return {
            state: player.dataset.state,
            playing: player.dataset.playing,
            paused: audio?.paused ?? null,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            clearance,
        };
    });

    // §5.3.4 — the icon must not claim playback the audio element is not doing. `idle` and
    // `error` are always paused; `expanded` here is expanded-but-not-started, also paused.
    expect(result.state, `${label}: data-state`).toBe(shape === "expanded" ? "expanded" : shape);
    expect(result.paused, `${label}: <audio>.paused 与 data-state 一致`).toBe(true);
    expect(result.playing, `${label}: data-playing 未播时必须是 false`).toBe("false");

    expect(result.overflow, `${label}: 横向溢出 ≤1px`).toBeLessThanOrEqual(1);

    if (!result.clearance) {
        // Only the article route carries `#back-to-top`; if the page under test loses it the
        // assertion would silently pass, so make its absence explicit instead.
        test.fail(true, `${label}: 页面上没有 #back-to-top，V1 无法判定`);
        return;
    }

    if (KNOWN_V1_OVERLAP.has(`${shape}@${page.viewportSize()!.width}`)) {
        // Recorded defect: it must still be broken, or the entry is stale and must be deleted.
        expect(
            result.clearance.intersect,
            `${label}: 已登记的 V1 违规已消失 —— 请从 KNOWN_V1_OVERLAP 删除 "${shape}@${page.viewportSize()!.width}"`,
        ).toBe(true);
        return;
    }
    expect(result.clearance.intersect, `${label}: V1 与 #back-to-top 相交`).toBe(false);
    expect(result.clearance.separated, `${label}: V1 间距不足 12px`).toBe(true);
}

/** Open the article, arm the player, and drive it into `shape`. */
async function openShape(page: Page, shape: Shape, theme: Theme): Promise<void> {
    await armPlayer(page);
    await stubNetwork(page);

    const response = await page.goto(ARTICLE, { waitUntil: "load" });
    expect(response?.status(), `GET ${ARTICLE}`).toBe(200);

    await setTheme(page, theme);

    // A cold article has the player but the page is not the reason the box is where it is;
    // scrolling puts `#back-to-top` into its raised position so V1 is measurable, and gives
    // the fixed overlay the same backdrop in every shot.
    await page.evaluate(() => window.scrollTo(0, 1200));

    await expect(page.locator(PLAYER)).toHaveCount(1);
    await expect(page.locator(PLAYER)).toHaveAttribute("data-state", "idle");

    if (shape === "expanded") {
        await page.locator("[data-player-toggle]").click();
        await expect(page.locator(PLAYER)).toHaveAttribute("data-state", "expanded");
    }

    if (shape === "error") {
        // Expanding first keeps the sequence identical to a real visitor's (press play from
        // the pill) and makes the transition `idle → expanded → error`, not a jumped state.
        await page.locator("[data-player-play]").click();
        await expect(page.locator(PLAYER)).toHaveAttribute("data-state", "error", {
            timeout: 10_000,
        });
        // `setError()` swaps the title to the error copy and hides the mute key; wait for both
        // so the shot cannot catch the half-applied state.
        await expect(page.locator(".site-player__title")).toHaveText("电台暂时无法播放");
        await expect(page.locator(".site-player__artist")).toHaveText("Radio Paradise");
    }

    await page.evaluate(() => document.fonts.ready);
    await settle(page);
}
test.describe("armed-player element baseline", () => {
    // DPR=1 + reduced motion for every shot: no window-size leakage, no spinner frame.
    test.use({ deviceScaleFactor: 1, reducedMotion: "reduce" });

    for (const width of VIEWPORTS) {
        test.describe(`viewport ${width}`, () => {
            test.use({ viewport: { width, height: 900 } });

            for (const theme of THEMES) {
                test.describe(theme, () => {
                    test.use({ colorScheme: theme });

                    for (const shape of SHAPES) {
                        test(`player-${shape}-${theme}-${width}`, async ({ page }) => {
                            await openShape(page, shape, theme);

                            const label = `${shape}-${theme}-${width}`;
                            // Order matters: invariants are measured on the real page, then
                            // the backdrop is pinned so the rounded corners cannot encode
                            // article content into the baseline.
                            await assertInvariants(page, shape, label);
                            await pinBackdrop(page);

                            await expect(page.locator(PLAYER)).toHaveScreenshot(
                                `player-${label}.png`,
                                {
                                    animations: "disabled",
                                    caret: "hide",
                                    timeout: 30000,
                                },
                            );
                        });
                    }
                });
            }
        });
    }
});
