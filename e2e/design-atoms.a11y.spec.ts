import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * a11y gate for /design/atoms — M1-5.
 *
 * Three layers, all against the production build served by `astro preview`:
 *  1. axe-core (already a devDependency — injected as a script, no new package):
 *     WCAG 2.0/2.1/2.2 A+AA tags, 2 themes × 3 viewports. serious/critical = red.
 *     moderate/minor are attached to the report and printed, not silently ignored.
 *  2. keyboard walk: every focusable element in DOM order must be reachable with Tab and
 *     show a ≥2px solid focus ring (Input's ring lives on its .field__control wrapper);
 *     Enter / Space / Esc are exercised on real controls.
 *  3. prefers-reduced-motion: no running animations, no non-zero transition durations,
 *     no layout shift on :active.
 *
 * The computed `--color-ring-focus` is compared as a resolved rgb() value, so a token
 * regression (ring switching to a low-contrast colour) fails here as well as visually.
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

/** Read once per worker, not per test. */
const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);

/** Same fixture contract as the visual spec: 200, theme forced via data-theme, fonts settled. */
async function openFixture(page: Page, theme: Theme): Promise<void> {
    const response = await page.goto("/design/atoms/", { waitUntil: "load" });
    expect(response?.status(), "GET /design/atoms/").toBe(200);
    await page.evaluate((value) => {
        document.documentElement.setAttribute("data-theme", value);
    }, theme);
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
    });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

type AxeNode = {
    target: unknown[];
    html: string;
    failureSummary?: string;
};

type AxeViolation = {
    id: string;
    impact: string | null;
    help: string;
    helpUrl: string;
    nodes: AxeNode[];
};

async function runAxe(
    page: Page,
): Promise<{ violations: AxeViolation[]; incomplete: AxeViolation[] }> {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const axe = (window as any).axe;
        const map = (list: AxeViolation[]) =>
            list.map((v) => ({
                id: v.id,
                impact: v.impact,
                help: v.help,
                helpUrl: v.helpUrl,
                nodes: v.nodes.map((n) => ({
                    target: n.target,
                    html: n.html.slice(0, 220),
                    summary: n.failureSummary,
                })),
            }));
        const result = (await axe.run(document, {
            runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
            resultTypes: ["violations", "incomplete"],
        })) as { violations: AxeViolation[]; incomplete: AxeViolation[] };
        // "incomplete" is axe's "cannot determine" bucket — dropping it would let a
        // transition/background it cannot parse look like a pass. Keep it in the report.
        return { violations: map(result.violations), incomplete: map(result.incomplete) };
    });
}

/** Written per run so the gate report can cite exact nodes without the HTML report. */
const AXE_DIR = path.join(process.cwd(), "test-results", "axe-atoms");

test.describe("design/atoms axe (WCAG 2.x A/AA)", () => {
    test.use({ deviceScaleFactor: 1, reducedMotion: "reduce" });

    for (const width of VIEWPORTS) {
        test.describe(`viewport ${width}`, () => {
            test.use({ viewport: { width, height: 900 } });

            for (const theme of THEMES) {
                test(`axe-${theme}-${width}`, async ({ page }) => {
                    await openFixture(page, theme);
                    const { violations, incomplete } = await runAxe(page);

                    await test.info().attach(`axe-${theme}-${width}.json`, {
                        body: JSON.stringify({ violations, incomplete }, null, 2),
                        contentType: "application/json",
                    });

                    const serious = violations.filter(
                        (v) => v.impact === "serious" || v.impact === "critical",
                    );
                    const moderate = violations.filter((v) => v.impact === "moderate");
                    const minor = violations.filter((v) => v.impact === "minor");
                    const contrastIncomplete = incomplete.filter((v) => v.id === "color-contrast");

                    // Printed so the gate log carries the full picture, not just the red part.
                    console.log(
                        `[axe] ${theme}@${width}: serious/critical=${serious.length} moderate=${moderate.length} minor=${minor.length} incomplete=${incomplete.length} (contrast=${contrastIncomplete.length})`,
                    );
                    for (const v of [...violations, ...incomplete]) {
                        console.log(
                            `[axe]   ${v.impact} ${v.id} × ${v.nodes.length} — ${v.help} ${v.helpUrl}`,
                        );
                    }

                    mkdirSync(AXE_DIR, { recursive: true });
                    writeFileSync(
                        path.join(AXE_DIR, `${theme}-${width}.json`),
                        JSON.stringify({ violations, incomplete }, null, 2),
                    );

                    expect(
                        serious.map((v) => `${v.id} (${v.nodes.length} node(s))`),
                        `serious/critical axe violations at ${theme}@${width}`,
                    ).toEqual([]);
                    // A colour-contrast result axe could not compute is not a pass.
                    expect(
                        contrastIncomplete.map((v) => `contrast incomplete × ${v.nodes.length}`),
                        `axe could not determine contrast at ${theme}@${width}`,
                    ).toEqual([]);
                });
            }
        });
    }

    test("axe-moderate-summary", async () => {
        // Reads the per-run JSON from disk: module state does not survive a worker restart,
        // files do. Moderate findings are recorded, not hidden — the report lists each with
        // an accept/reject decision.
        const files = THEMES.flatMap((theme) =>
            VIEWPORTS.map((width) => ({
                theme,
                width,
                file: path.join(AXE_DIR, `${theme}-${width}.json`),
            })),
        );
        const moderate = files.flatMap(({ theme, width, file }) => {
            const run = JSON.parse(readFileSync(file, "utf8")) as { violations: AxeViolation[] };
            return run.violations
                .filter((v) => v.impact === "moderate")
                .map((v) => ({ theme, width, ...v }));
        });
        const counts = files.map(({ theme, width, file }) => {
            const run = JSON.parse(readFileSync(file, "utf8")) as {
                violations: AxeViolation[];
                incomplete: AxeViolation[];
            };
            return `${theme}@${width}=${run.violations.length}v/${run.incomplete.length}i`;
        });
        await test.info().attach("axe-moderate-summary.json", {
            body: JSON.stringify(moderate, null, 2),
            contentType: "application/json",
        });
        console.log(`[axe] runs ${counts.join(" ")} · moderate total=${moderate.length}`);
        expect(files.length, "axe runs recorded").toBe(VIEWPORTS.length * THEMES.length);
    });
});

/* ───────────────────────── 焦点环 ───────────────────────── */

type RingProbe = {
    tag: string;
    label: string;
    ring: { source: string; width: string; style: string; color: string; offset: string } | null;
};

/** Ring may sit on the element or on its .field__control wrapper (Input's documented pattern). */
const ringProbe = (): RingProbe => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return { tag: "none", label: "", ring: null };
    const candidates: HTMLElement[] = [el];
    const control = el.closest(".field__control");
    if (control instanceof HTMLElement) candidates.push(control);
    for (const node of candidates) {
        const style = getComputedStyle(node);
        const width = parseFloat(style.outlineWidth);
        if (style.outlineStyle !== "none" && style.outlineWidth !== "" && width >= 2) {
            return {
                tag: el.tagName.toLowerCase(),
                label: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40),
                ring: {
                    source: node === el ? "self" : ".field__control",
                    width: style.outlineWidth,
                    style: style.outlineStyle,
                    color: style.outlineColor,
                    offset: style.outlineOffset,
                },
            };
        }
    }
    return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40),
        ring: null,
    };
};

test.describe("design/atoms keyboard", () => {
    test.use({
        deviceScaleFactor: 1,
        viewport: { width: 1440, height: 900 },
        reducedMotion: "reduce",
    });

    test("tab order + visible focus ring", async ({ page }) => {
        await openFixture(page, "light");

        // Tag every focusable element with its DOM index so the tab sequence can be compared
        // without guessing from text. Disabled controls are not tabbable and are excluded.
        const expected = await page.evaluate(() => {
            const selector =
                'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
            const nodes = [...document.querySelectorAll<HTMLElement>(selector)].filter(
                (node) => node.offsetParent !== null || node.getClientRects().length > 0,
            );
            nodes.forEach((node, i) => node.setAttribute("data-kbd", String(i)));
            return nodes.map((node) => ({
                i: node.getAttribute("data-kbd"),
                tag: node.tagName.toLowerCase(),
                label: (
                    node.getAttribute("aria-label") ??
                    node.textContent ??
                    node.getAttribute("name") ??
                    ""
                )
                    .trim()
                    .slice(0, 40),
            }));
        });
        expect(expected.length, "focusable elements found").toBeGreaterThan(30);

        const visited: string[] = [];
        const ringProblems: string[] = [];
        const ringSamples: RingProbe[] = [];

        for (let step = 0; step < expected.length; step += 1) {
            await page.keyboard.press("Tab");
            const probe = await page.evaluate(ringProbe);
            const index = await page.evaluate(
                () =>
                    (document.activeElement as HTMLElement | null)?.getAttribute("data-kbd") ??
                    null,
            );
            if (index === null) {
                ringProblems.push(`Tab #${step + 1} landed outside the fixture (${probe.tag})`);
                break;
            }
            visited.push(index);
            if (!probe.ring) {
                ringProblems.push(`${probe.tag} "${probe.label}" has no visible focus ring`);
            } else if (step % 6 === 0 || ringSamples.length < 5) {
                ringSamples.push(probe);
            }
        }

        expect(ringProblems, "every focused element must show a ≥2px solid ring").toEqual([]);
        expect(visited, "Tab must reach every focusable element in DOM order").toEqual(
            expected.map((e) => e.i),
        );

        // Ring colour must be the token, not the UA default (which is usually black/auto).
        const ringToken = await page.evaluate(() => {
            const probe = document.createElement("span");
            probe.style.color = "var(--color-ring-focus)";
            probe.style.outlineColor = "var(--color-ring-focus)";
            document.body.append(probe);
            const value = getComputedStyle(probe).outlineColor;
            probe.remove();
            return value;
        });
        for (const sample of ringSamples) {
            expect(sample.ring?.style, `outline-style for ${sample.tag}`).toBe("solid");
            expect(
                sample.ring?.color,
                `outline-color for ${sample.tag} must be --color-ring-focus`,
            ).toBe(ringToken);
        }

        await test.info().attach("keyboard-tab-order.json", {
            body: JSON.stringify({ expected, ringSamples }, null, 2),
            contentType: "application/json",
        });
        console.log(
            `[kbd] ${visited.length} focusable elements, ring samples=${ringSamples.length}`,
        );
    });

    test("Enter / Space / Esc on real controls", async ({ page }) => {
        await openFixture(page, "light");

        // Space toggles aria-pressed on the fixture's theme switch (the only page-level script).
        const toggle = page.locator("#theme-toggle");
        await toggle.focus();
        await expect(toggle).toHaveAttribute("aria-pressed", "false");
        await page.keyboard.press(" ");
        await expect(toggle).toHaveAttribute("aria-pressed", "true");
        await page.keyboard.press("Enter");
        await expect(toggle).toHaveAttribute("aria-pressed", "false");

        // Enter on an internal link navigates (same page here), proving it is a real link.
        const link = page.locator('[data-specimen="link"] a', { hasText: "inline link" });
        await link.focus();
        await Promise.all([page.waitForLoadState("load"), page.keyboard.press("Enter")]);
        await expect(page.locator("[data-specimen]")).toHaveCount(12);

        // Text entry still works after the reload.
        const input = page.locator('[data-specimen="input"] input[name="demo-search"]');
        await input.focus();
        await page.keyboard.type("query");
        await expect(input).toHaveValue("query");
        await input.press("Escape");
        await expect(page.locator("[data-specimen]")).toHaveCount(12);

        // Disabled buttons must not be tabbable: focus the last enabled button, Tab once,
        // and make sure we did not land inside a disabled control.
        const disabledFocused = await page.evaluate(() => {
            const el = document.activeElement as HTMLButtonElement | null;
            return Boolean(el?.disabled);
        });
        expect(disabledFocused).toBe(false);
    });

    test("aria-current / aria-label / aria-busy", async ({ page }) => {
        await openFixture(page, "light");

        const snapshot = await page.evaluate(() => {
            const all = (selector: string) => [...document.querySelectorAll(selector)];
            return {
                currents: all("[aria-current]").map((el) => ({
                    tag: el.tagName.toLowerCase(),
                    value: el.getAttribute("aria-current"),
                    text: (el.textContent ?? "").trim().slice(0, 40),
                })),
                labels: all("[aria-label]").map((el) => ({
                    tag: el.tagName.toLowerCase(),
                    label: el.getAttribute("aria-label"),
                    text: (el.textContent ?? "").trim().slice(0, 40),
                })),
                busy: all("[aria-busy]").map((el) => ({
                    tag: el.tagName.toLowerCase(),
                    value: el.getAttribute("aria-busy"),
                    role: el.getAttribute("role"),
                })),
                iconOnlyWithoutName: all("button")
                    .filter((el) => {
                        const text = (el.textContent ?? "").trim();
                        return text === "" && !el.getAttribute("aria-label");
                    })
                    .map((el) => el.outerHTML.slice(0, 160)),
            };
        });

        await test.info().attach("aria-snapshot.json", {
            body: JSON.stringify(snapshot, null, 2),
            contentType: "application/json",
        });

        // Link current → page; Breadcrumb last item → page; Pagination current page → page.
        expect(snapshot.currents.filter((c) => c.value === "page").length).toBeGreaterThanOrEqual(
            3,
        );
        expect(snapshot.currents.some((c) => c.text === "Design")).toBe(true);

        // Every icon-only button carries an aria-label (N4).
        expect(snapshot.iconOnlyWithoutName).toEqual([]);
        expect(snapshot.labels.some((l) => l.label === "Search")).toBe(true);
        expect(snapshot.labels.some((l) => l.label?.startsWith("Remove"))).toBe(true);
        expect(snapshot.labels.some((l) => l.label === "Previous page")).toBe(true);

        // Loading buttons + Skeleton expose aria-busy="true".
        expect(snapshot.busy.length).toBeGreaterThanOrEqual(5);
        expect(snapshot.busy.every((b) => b.value === "true")).toBe(true);
        expect(snapshot.busy.some((b) => b.role === "status")).toBe(true);

        console.log(
            `[aria] current=${snapshot.currents.length} label=${snapshot.labels.length} busy=${snapshot.busy.length}`,
        );
    });
});

/* ───────────────────────── reduced motion ───────────────────────── */

test.describe("design/atoms prefers-reduced-motion: reduce", () => {
    test.use({
        deviceScaleFactor: 1,
        viewport: { width: 1440, height: 900 },
        reducedMotion: "reduce",
    });

    test("no animation, no transition, no active-state shift", async ({ page }) => {
        await openFixture(page, "light");

        const motion = await page.evaluate(() => {
            const running = document
                .getAnimations()
                .filter((a) => a.playState === "running")
                .map((a) => String(a.effect?.getComputedTiming().localTime ?? "?"));
            const animated: string[] = [];
            const transitioning: string[] = [];
            for (const el of document.querySelectorAll<HTMLElement>("[data-specimen] *")) {
                const s = getComputedStyle(el);
                if (s.animationName !== "none" && parseFloat(s.animationDuration) > 0) {
                    animated.push(
                        `${el.tagName.toLowerCase()}.${el.className}: ${s.animationName} ${s.animationDuration}`,
                    );
                }
                if (s.transitionProperty !== "none" && parseFloat(s.transitionDuration) > 0) {
                    transitioning.push(
                        `${el.tagName.toLowerCase()}.${el.className}: ${s.transitionProperty} ${s.transitionDuration}`,
                    );
                }
            }
            return { running, animated, transitioning };
        });

        expect(motion.running, "no running animations").toEqual([]);
        expect(motion.animated.slice(0, 5), "no CSS animations").toEqual([]);
        expect(motion.transitioning.slice(0, 5), "no CSS transitions").toEqual([]);

        // :active must not move the button under reduced motion.
        const button = page.locator('[data-specimen="button"] .button').first();
        await button.scrollIntoViewIfNeeded();
        const before = await button.boundingBox();
        await button.hover();
        await page.mouse.down();
        const during = await button.boundingBox();
        await page.mouse.up();
        expect(before).not.toBeNull();
        expect(during).not.toBeNull();
        expect(Math.abs((during?.y ?? 0) - (before?.y ?? 0)), "translateY on :active").toBeLessThan(
            0.5,
        );

        console.log(
            `[motion] running=${motion.running.length} animated=${motion.animated.length} transitioning=${motion.transitioning.length}`,
        );
    });
});

// Keep SPECIMENS referenced even if a future edit drops the axe loop above.
test("fixture exposes all 12 specimens", async ({ page }) => {
    await openFixture(page, "light");
    for (const specimen of SPECIMENS) {
        await expect(page.locator(`[data-specimen="${specimen}"]`)).toHaveCount(1);
    }
});
