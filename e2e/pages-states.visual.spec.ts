import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";
import { startStaticServer, type StaticServer } from "./_support/static-server";

/**
 * State-level visual baselines — M8-2 / §7.2.
 *
 * The page-level suite (`pages.visual.spec.ts`) only ever screenshots the `ok` branch. The
 * three C-1 entity pages each have a user-visible **empty** and **error** branch as well, and
 * until now they were only ever *described* (`docs/_reviews/M8-2-projects/states/` PNGs, no
 * gate), so a CSS change could break the empty state without anything turning red.
 *
 * 3 pages × 2 states × 2 themes × 3 viewports = 36 shots per platform:
 *
 *   /projects/  /devices/  /skills/   ×   empty | error
 *
 * ## Which states, and which are missing
 *
 * `EntityStatus` is `ok | empty | error` (`src/types/entities.ts`) — the contract defines no
 * `loading` value and the three templates have no loading branch, so there is no loading state
 * here to screenshot. §7.2 also lists `loading` and `filtered-empty`: both need code that lives
 * on the unmerged `m8-wip-20261110` branch (decision-log D-0156「未决」). Regenerating against
 * `main` would record the `ok` layout under those names, which is why they are absent instead
 * of faked. When that branch lands: add the state to `STATES` below, extend `STATES` in
 * `scripts/visual/build-state-baseline.mjs`, and regenerate — the matrix is derived, not
 * hand-listed.
 *
 * ## Where the pixels come from
 *
 * Those branches exist only in a build made with `PUBLIC_{PROJECTS,DEVICES,SKILLS}_STATE` set,
 * so `scripts/visual/build-state-baseline.mjs` builds one site per state into
 * `.visual-states/<state>/` (fixture article content, so the footer/article count is fixed —
 * same reasoning as the page-level suite). This spec serves those dirs itself on 4401+
 * (`PW_STATES_PORT_BASE` shifts them when another runner holds one) and never touches `dist/`
 * or `astro preview`.
 *
 * Regenerate:
 *   pnpm visual:build:states && pnpm exec playwright test e2e/pages-states.visual.spec.ts \
 *     --update-snapshots
 *
 * The no-JS/no-network/settle rules are the same as `pages.visual.spec.ts` (read its header
 * first); the helpers below are intentional copies — that spec is a landed gate with verified
 * baselines, and refactoring it to share them would have put those pixels at risk for no
 * behavioural gain.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATES_ROOT = path.join(ROOT, ".visual-states");

/** Port per state. Fixed so a leftover run fails loudly ("port in use") instead of mixing
 *  builds. Override the base when another runner on this machine already holds one of them:
 *  `PW_STATES_PORT_BASE=4411 pnpm test:visual:states`. */
const PORT_BASE = Number(process.env.PW_STATES_PORT_BASE ?? 4401);
const PORT_BY_STATE: Record<string, number> = {
    empty: PORT_BASE,
    error: PORT_BASE + 1,
};

const PAGES = [
    { name: "projects", path: "/projects/" },
    { name: "devices", path: "/devices/" },
    { name: "skills", path: "/skills/" },
] as const;

const STATES = ["empty", "error"] as const;
const VIEWPORTS = [375, 768, 1280] as const;
const THEMES = ["light", "dark"] as const;

type State = (typeof STATES)[number];
type Theme = (typeof THEMES)[number];
type PageSpec = (typeof PAGES)[number];

/** Same cap as the page-level suite: past ~3 screens it is the same stack repeating. */
const MAX_SHOT_HEIGHT = 3600;

const IMAGE_STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
const IMAGE_STUB_TYPE = "image/svg+xml";

const servers = new Map<State, StaticServer>();

test.beforeAll(async () => {
    // Fail before Playwright starts dozens of browsers, with a message that says what to run.
    const missing = STATES.filter(
        (state) => !existsSync(path.join(STATES_ROOT, state, "index.html")),
    );
    if (missing.length > 0) {
        throw new Error(
            `.visual-states 缺少构建：${missing.join(", ")} —— 先跑 ` +
                "`node scripts/visual/build-state-baseline.mjs`（pnpm visual:build:states）",
        );
    }

    for (const state of STATES) {
        servers.set(
            state,
            await startStaticServer(path.join(STATES_ROOT, state), PORT_BY_STATE[state]),
        );
    }
});

test.afterAll(async () => {
    await Promise.all([...servers.values()].map((server) => server.close()));
    servers.clear();
});

/** Answer/deny every non-localhost request (same contract as the page-level suite). */
async function stubThirdParty(page: Page): Promise<void> {
    await page.route("**/*", (route) => {
        const { hostname } = new URL(route.request().url());
        if (hostname === "localhost" || hostname === "127.0.0.1") return route.continue();
        if (route.request().resourceType() === "image") {
            return route.fulfill({ status: 200, contentType: IMAGE_STUB_TYPE, body: IMAGE_STUB });
        }
        return route.abort();
    });
}

/**
 * Load the state build, pin the theme, settle async render, and assert the state really
 * rendered. The last part is the point of the whole suite: if `PUBLIC_*_STATE` silently stopped
 * working, every shot would converge on the `ok` layout and the gate would happily record it.
 */
async function openStatePage(
    page: Page,
    spec: PageSpec,
    state: State,
    theme: Theme,
): Promise<void> {
    const server = servers.get(state);
    if (!server) throw new Error(`no server for state ${state}`);
    const url = `${server.origin}${spec.path}`;

    await stubThirdParty(page);

    const response = await page.goto(url, { waitUntil: "load" });
    expect(response?.status(), `GET ${url}`).toBe(200);

    await page.evaluate((value) => {
        const root = document.documentElement;
        root.classList.toggle("dark", value === "dark");
        root.setAttribute("data-theme", value);
        root.style.colorScheme = value;
    }, theme);

    await page.evaluate(async () => {
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
        await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
        await document.fonts.ready;
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
        window.scrollTo(0, 0);
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
    });

    // Waline (footer/nav can mount late) — same 600ms as the page-level suite so the two
    // suites settle identically.
    await page.waitForTimeout(600);

    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("h1").first()).toBeVisible();

    // The state attribute is the contract this suite exists to protect.
    await expect(
        page.locator(`[data-${spec.name}-status]`).first(),
        `${spec.name} renders the "${state}" branch`,
    ).toHaveAttribute(`data-${spec.name}-status`, state);

    // Both non-ok branches must keep the page header: §6 requires it for error, and an empty
    // list without a header would be a different (worse) page, not the same page with no rows.
    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "horizontal overflow (≤1px)").toBeLessThanOrEqual(1);
}

test.describe("state-level visual baseline", () => {
    // DPR=1 + reduced motion for every shot in this file.
    test.use({ deviceScaleFactor: 1, reducedMotion: "reduce" });

    for (const width of VIEWPORTS) {
        test.describe(`viewport ${width}`, () => {
            test.use({ viewport: { width, height: 900 } });

            for (const theme of THEMES) {
                test.describe(theme, () => {
                    test.use({ colorScheme: theme });

                    for (const state of STATES) {
                        for (const spec of PAGES) {
                            test(`${spec.name}-${state}-${theme}-${width}`, async ({ page }) => {
                                await openStatePage(page, spec, state, theme);

                                const height = await page.evaluate(
                                    () => document.documentElement.scrollHeight,
                                );
                                const shotHeight = Math.min(height, MAX_SHOT_HEIGHT);

                                await expect(page).toHaveScreenshot(
                                    `${spec.name}-${state}-${theme}-${width}.png`,
                                    {
                                        fullPage: true,
                                        clip: { x: 0, y: 0, width, height: shotHeight },
                                        animations: "disabled",
                                        caret: "hide",
                                        timeout: 60000,
                                    },
                                );
                            });
                        }
                    }
                });
            }
        });
    }
});
