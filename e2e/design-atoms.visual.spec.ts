import { test, expect, type Page } from "@playwright/test";

/**
 * Visual regression baseline for /design/atoms — DESIGN.md §5.6.
 *
 * 12 specimens × 3 viewports × 2 themes = 72 baselines, stored at
 *   e2e/__screenshots__/design-atoms/<name>-<theme>-<width>.png
 * (path convention from DESIGN.md §5.6 / §5.2 「视觉基线」).
 *
 * Rules encoded here (DESIGN.md §5.6.0 + M1-4 card):
 *  - production build served by `astro preview` (playwright.config webServer), never the dev server
 *  - element screenshots of each `[data-specimen]`, never a full-page screenshot
 *  - fixed viewport + DPR=1, no window-size randomness
 *  - `document.fonts.ready` awaited before every shot
 *  - animations disabled twice: `animations: "disabled"` + `prefers-reduced-motion: reduce`
 *  - the diff threshold is NOT set here: it lives in playwright.config.ts per project
 *    (macOS keeps M1-4's maxDiffPixelRatio 0.01; the Linux CI project demands maxDiffPixels 0)
 *
 * Baselines are platform-specific (the fixture loads no @font-face, so glyph metrics come
 * from the OS font stack), so each platform has its own set and its own Playwright project:
 *
 *   macOS → e2e/__screenshots__/design-atoms/*.png       (project `chromium`, generated locally)
 *   Linux → e2e/__screenshots__/design-atoms-linux/*.png (project `chromium-linux`, generated
 *           inside mcr.microsoft.com/playwright:v1.63.0-noble — the same image CI uses)
 *
 * Regenerate the Linux set only inside that image:
 *   docker run --rm -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.63.0-noble \
 *     bash -lc 'corepack pnpm i --frozen-lockfile && corepack pnpm exec astro build && \
 *               corepack pnpm exec playwright test e2e/design-atoms.visual.spec.ts --update-snapshots'
 */

const SPECIMENS = [
    "button",
    "link",
    "tag",
    "input",
    "card",
    "icon",
    "avatar",
    "divider",
    "breadcrumb",
    "pagination",
    "alert",
    "skeleton",
] as const;

const VIEWPORTS = [390, 768, 1440] as const;
const THEMES = ["light", "dark"] as const;

type Theme = (typeof THEMES)[number];

/** Load the fixture, force the theme, and settle fonts + layout before any screenshot. */
async function openFixture(page: Page, theme: Theme): Promise<void> {
    const response = await page.goto("/design/atoms/", { waitUntil: "load" });
    expect(response?.status(), "GET /design/atoms/").toBe(200);

    // The page ships a light-only toggle fixture; baselines need the attribute, not a click.
    await page.evaluate((value) => {
        document.documentElement.setAttribute("data-theme", value);
    }, theme);

    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
    });

    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    // Dark must actually repaint the canvas, otherwise the "dark" shot is a duplicate of light.
    const canvas = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--color-bg-canvas").trim(),
    );
    expect(canvas, "--color-bg-canvas resolves").not.toBe("");
}

test.describe("design/atoms visual baseline", () => {
    // DPR=1 + reduced motion for every shot in this file (no local-Chrome window size leakage).
    test.use({ deviceScaleFactor: 1, reducedMotion: "reduce" });

    for (const width of VIEWPORTS) {
        test.describe(`viewport ${width}`, () => {
            test.use({ viewport: { width, height: 900 } });

            for (const theme of THEMES) {
                test.describe(theme, () => {
                    test.use({ colorScheme: theme });

                    for (const specimen of SPECIMENS) {
                        test(`${specimen}-${theme}-${width}`, async ({ page }) => {
                            await openFixture(page, theme);

                            const element = page.locator(`[data-specimen="${specimen}"]`);
                            await expect(element).toHaveCount(1);
                            await expect(element).toBeVisible();

                            // Threshold comes from playwright.config.ts (per project):
                            // macOS 1% ratio, Linux CI 0 diff pixels.
                            await expect(element).toHaveScreenshot(
                                `${specimen}-${theme}-${width}.png`,
                                {
                                    animations: "disabled",
                                    caret: "hide",
                                },
                            );
                        });
                    }
                });
            }
        });
    }
});
