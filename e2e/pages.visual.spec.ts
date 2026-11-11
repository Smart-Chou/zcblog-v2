import { test, expect, type Page } from "@playwright/test";

/**
 * Page-level visual baselines — M5-11 (V-0).
 *
 * 6 pages × 2 themes × 3 viewports = 36 shots per platform (M6-6a adds `/404/` → 42):
 *   /                                     home
 *   /article/beszel-server-monitoring-guide/  long-form representative
 *   /archives/  /albums/  /culture/  /projects/  /404/
 *
 * Stored at `e2e/__screenshots__/pages{,-linux}/<page>-<theme>-<width>.png`
 * (the dir is chosen by the Playwright project in `playwright.config.ts`).
 *
 * ## Why the shots are reproducible (read before adding a page)
 *
 * 1. **Fixed content.** The preview server is built from `e2e/fixtures/pages-visual/`
 *    (`pnpm visual:build:pages`), not from the private content repo. Otherwise adding one
 *    article to `zcblog-articles` would shift `/`, `/archives/` and every list on the page
 *    and turn the visual gate red for reasons that have nothing to do with the theme.
 *    Every fixture article must carry `upDate` — without it the build falls back to
 *    `new Date()` and the baseline encodes the day it was generated.
 * 2. **Third-party traffic is stubbed.** Any request leaving localhost is either answered
 *    with a 1×1 PNG (images: R2/CF image resizing, random cover API, friend avatars) or
 *    aborted (umami, Waline API, hitokoto, mermaid from cdn.bootcdn.net). Remote photos and
 *    CDN scripts are not part of this theme's contract, and they are the #1 source of
 *    "same code, different pixels".
 * 3. **Self-running JS is frozen.** The home hero rotates its motto with a JS timer
 *    (`TypewriterText`), which `animations: "disabled"` does not stop — the spec destroys
 *    the instance and restores the build-time first sentence.
 * 4. **Lazy images are forced.** `loading="lazy"` below the fold would otherwise render as
 *    blank boxes depending on scroll timing; the spec flips them to eager and waits.
 * 5. **Shot height is capped** at 3600 CSS px. The long article is ~19k px tall; beyond a
 *    few screens it is the same prose stack repeated, so the cap keeps the baseline set
 *    reviewable without losing the regions where layout/typography regressions show.
 *
 * Thresholds live in `playwright.config.ts` per project (macOS 0.1% ratio, Linux 0 px).
 * Regenerate with:
 *   pnpm visual:build:pages && pnpm exec playwright test e2e/pages.visual.spec.ts --update-snapshots
 */

const PAGES = [
    { name: "home", path: "/" },
    { name: "article", path: "/article/beszel-server-monitoring-guide/" },
    { name: "archives", path: "/archives/" },
    { name: "albums", path: "/albums/" },
    { name: "culture", path: "/culture/" },
    { name: "projects", path: "/projects/" },
    // M6-6a: the 404 shell is a user-visible page, so it gets the same baseline treatment.
    { name: "404", path: "/404/" },
] as const;

const VIEWPORTS = [375, 768, 1280] as const;
const THEMES = ["light", "dark"] as const;

type Theme = (typeof THEMES)[number];
type PageSpec = (typeof PAGES)[number];

/** Same reasoning as the article `max-height: 60vh` cap: after ~3 screens the page is a
 *  repeating stack. Keep this in sync with the README recipe. */
const MAX_SHOT_HEIGHT = 3600;

/**
 * The archives/albums/projects heatmap derives its 52/26-week window from `new Date()`.
 * Without a frozen clock, a baseline captured on 2026-11-09 fails on 2026-11-10 even though
 * no CSS moved (the week offset shifts the month labels and active cells by one day).
 * Keep this date in sync with the committed Linux baselines; bump it only with a baseline
 * regeneration commit.
 */
const FROZEN_NOW = "2026-11-09T12:00:00.000Z";

async function freezePageClock(page: Page): Promise<void> {
    await page.addInitScript((iso) => {
        const NativeDate = Date;
        const fixed = NativeDate.parse(iso);
        class FrozenDate extends NativeDate {
            constructor(...args: unknown[]) {
                if (args.length === 0) super(fixed);
                else super(...(args as [value: string | number]));
            }
            static now(): number {
                return fixed;
            }
        }
        window.Date = FrozenDate as unknown as DateConstructor;
    }, FROZEN_NOW);
}

/**
 * Known, pre-existing horizontal overflow (px of document-level scrollWidth extra).
 *
 * Empty since M6-3: the article page's long tables/wide code now scroll inside their own
 * `overflow-x: auto` box, so the document no longer exceeds the viewport at 375. Every page
 * and viewport must therefore stay ≤ 1px. (M5-11 had frozen `article@375: 16` as a known
 * responsive gap; M6-3 removed it instead of re-freezing it.)
 */
const KNOWN_OVERFLOW: Record<string, number> = {};

/**
 * Deterministic stand-in for every off-site image. An SVG (not a PNG) on purpose: it can be
 * inlined as a string, so the spec needs no Buffer/`@types/node` globals, and it scales to
 * whatever box the CSS gives the `<img>`.
 */
const IMAGE_STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
const IMAGE_STUB_TYPE = "image/svg+xml";

/**
 * Answer/deny every non-localhost request so two runs of the same build can never differ
 * because of the network. Registered before `page.goto`.
 */
async function stubThirdParty(page: Page): Promise<void> {
    await page.route("**/*", (route) => {
        const { hostname } = new URL(route.request().url());
        if (hostname === "localhost" || hostname === "127.0.0.1") return route.continue();
        if (route.request().resourceType() === "image") {
            return route.fulfill({ status: 200, contentType: IMAGE_STUB_TYPE, body: IMAGE_STUB });
        }
        // umami (partytown), Waline API, hitokoto, mermaid CDN, CF image worker HTML, …
        return route.abort();
    });
}

/** Load the page, pin the theme, settle every async render, and return to the top. */
async function openPage(page: Page, spec: PageSpec, theme: Theme): Promise<void> {
    await stubThirdParty(page);
    await freezePageClock(page);

    const response = await page.goto(spec.path, { waitUntil: "load" });
    expect(response?.status(), `GET ${spec.path}`).toBe(200);

    // The real toggle writes both the class and the attribute (ToggleTheme.astro);
    // writing only `data-theme` leaves `html.dark` rules inactive.
    await page.evaluate((value) => {
        const root = document.documentElement;
        root.classList.toggle("dark", value === "dark");
        root.setAttribute("data-theme", value);
        root.style.colorScheme = value;
    }, theme);

    await page.evaluate(async () => {
        // 1. stop the home hero's JS typewriter on its build-time sentence
        document.querySelectorAll(".typewriter").forEach((el) => {
            const typed = el as HTMLElement & {
                __typewriterInstance?: { destroy?: () => void };
            };
            typed.__typewriterInstance?.destroy?.();
            const raw = typed.dataset.text ?? "";
            let first = raw;
            try {
                const parsed: unknown = JSON.parse(raw);
                first = Array.isArray(parsed) ? String(parsed[0] ?? "") : raw;
            } catch {
                /* plain string payload */
            }
            typed.textContent = first;
        });

        // 2. force lazy images, then wait for every image to settle
        document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((img) => {
            img.loading = "eager";
        });
        await Promise.all(
            [...document.images].map((img) =>
                img.complete
                    ? Promise.resolve()
                    : new Promise<void>((resolve) => {
                          img.onload = () => resolve();
                          img.onerror = () => resolve();
                      }),
            ),
        );
        // `complete` can be true for a lazy image that has not actually decoded yet
        // (naturalWidth 0); decode() closes that gap or rejects harmlessly for stubs.
        await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));

        // 3. fonts, then a scroll pass for anything that initialises on visibility
        await document.fonts.ready;
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
        window.scrollTo(0, 0);
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
    });

    // Waline mounts its comment box asynchronously even when its API is blocked.
    await page.waitForTimeout(600);

    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("h1").first()).toBeVisible();

    // The conveyor of "renders but invisible" bugs: assert the theme really repainted.
    const canvas = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--color-bg-canvas").trim(),
    );
    expect(canvas, "--color-bg-canvas resolves").not.toBe("");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    if (theme === "dark") {
        expect(bg, "dark canvas is not painted dark").not.toBe("rgba(0, 0, 0, 0)");
    }

    // Baseline invariants that a broken layout would violate before any pixel diff runs.
    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    const allowed = KNOWN_OVERFLOW[`${spec.name}@${page.viewportSize()?.width}`] ?? 1;
    expect(overflow, `horizontal overflow (≤${allowed}px)`).toBeLessThanOrEqual(allowed);
}

test.describe("page-level visual baseline", () => {
    // DPR=1 + reduced motion for every shot in this file (no local-Chrome window size leakage).
    test.use({ deviceScaleFactor: 1, reducedMotion: "reduce" });

    for (const width of VIEWPORTS) {
        test.describe(`viewport ${width}`, () => {
            test.use({ viewport: { width, height: 900 } });

            for (const theme of THEMES) {
                test.describe(theme, () => {
                    test.use({ colorScheme: theme });

                    for (const spec of PAGES) {
                        test(`${spec.name}-${theme}-${width}`, async ({ page }) => {
                            await openPage(page, spec, theme);

                            const height = await page.evaluate(
                                () => document.documentElement.scrollHeight,
                            );
                            const shotHeight = Math.min(height, MAX_SHOT_HEIGHT);

                            // Threshold comes from playwright.config.ts (per project):
                            // macOS 0.1% ratio, Linux CI 0 diff pixels.
                            await expect(page).toHaveScreenshot(
                                `${spec.name}-${theme}-${width}.png`,
                                {
                                    // `clip` needs `fullPage` to be able to reach below the fold;
                                    // without it Playwright silently caps the clip at the viewport.
                                    fullPage: true,
                                    clip: { x: 0, y: 0, width, height: shotHeight },
                                    animations: "disabled",
                                    caret: "hide",
                                    timeout: 60000,
                                },
                            );
                        });
                    }
                });
            }
        });
    }
});
