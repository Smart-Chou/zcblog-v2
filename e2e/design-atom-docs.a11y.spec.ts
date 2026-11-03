import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * a11y + 结构门禁 for the 12 atom docs pages — M1-6.
 *
 * 与 design-atoms.a11y.spec.ts 同一套判据（axe WCAG 2.x A/AA + 0 serious/critical +
 * 对比度不可判定也算红），但作用对象是 `/design/atoms/<slug>/`：
 *   1. 7 个必填 section 都在（purpose/props/slots/states/a11y/tokens/example）
 *   2. 没有空表（<tr> < 2 视为空）
 *   3. 示例区至少有一个画框（真实组件实例）
 *   4. 文档页 0 运行时 JS（没有 <script>）
 *   5. light + dark 两个主题各跑一次 axe
 *   6. 390px 宽度下页面没有横向溢出（宽表自己滚动）
 *
 * 报告落 test-results/axe-atom-docs/<slug>-<theme>.json，便于复核。
 */

const DOCS = [
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

const SECTIONS = ["purpose", "props", "slots", "states", "a11y", "tokens", "example"] as const;
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);
const AXE_DIR = path.join(process.cwd(), "test-results", "axe-atom-docs");

async function openDoc(page: Page, slug: string, theme: Theme): Promise<void> {
    const response = await page.goto(`/design/atoms/${slug}/`, { waitUntil: "load" });
    expect(response?.status(), `GET /design/atoms/${slug}/`).toBe(200);
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

type AxeNode = { target: unknown[]; html: string; failureSummary?: string };
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
        return { violations: map(result.violations), incomplete: map(result.incomplete) };
    });
}

test.describe("atom docs · structure", () => {
    test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

    for (const slug of DOCS) {
        test(`${slug} · 7 sections / no empty table / 0 JS`, async ({ page }) => {
            await openDoc(page, slug, "light");

            for (const id of SECTIONS) {
                await expect(page.locator(`#${id}`), `section #${id}`).toHaveCount(1);
            }

            const structure = await page.evaluate(
                (sectionIds) => {
                    const tables = [...document.querySelectorAll("table")];
                    const example = document.querySelector("#example");
                    return {
                        emptyTables: tables.filter((table) => table.rows.length < 2).length,
                        tableCount: tables.length,
                        exampleFrames: example
                            ? example.querySelectorAll("figure.frame, .frame").length
                            : 0,
                        // 站点级集成（astro-vtbot / page-lifecycle）会给每个页面注入一个
                        // 外链 module script；文档页自身不得有内联脚本或 island。
                        inlineScripts: document.querySelectorAll("script:not([src])").length,
                        islands: document.querySelectorAll("astro-island").length,
                        headings: sectionIds.map(
                            (id) => document.querySelector(`#${id} h2`)?.textContent?.trim() ?? "",
                        ),
                    };
                },
                SECTIONS as unknown as string[],
            );

            expect(
                structure.tableCount,
                "至少 4 张表（props/slots/states/contrast）",
            ).toBeGreaterThanOrEqual(4);
            expect(structure.emptyTables, "空表数量").toBe(0);
            expect(structure.exampleFrames, "示例画框数量").toBeGreaterThan(0);
            expect(structure.inlineScripts, "文档页没有内联脚本").toBe(0);
            expect(structure.islands, "文档页没有 hydration island").toBe(0);
            for (const heading of structure.headings) {
                expect(heading, "每个 section 都有 h2").not.toBe("");
            }
        });
    }
});

test.describe("atom docs · axe (WCAG 2.x A/AA)", () => {
    test.use({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
    });

    for (const slug of DOCS) {
        test(`${slug} · axe light + dark`, async ({ page }) => {
            mkdirSync(AXE_DIR, { recursive: true });
            for (const theme of THEMES) {
                await openDoc(page, slug, theme);
                const { violations, incomplete } = await runAxe(page);

                writeFileSync(
                    path.join(AXE_DIR, `${slug}-${theme}.json`),
                    JSON.stringify({ violations, incomplete }, null, 2),
                );

                const serious = violations.filter(
                    (v) => v.impact === "serious" || v.impact === "critical",
                );
                const contrastIncomplete = incomplete.filter((v) => v.id === "color-contrast");

                console.log(
                    `[axe] ${slug} ${theme}: violations=${violations.length} serious=${serious.length} incomplete=${incomplete.length} contrast=${contrastIncomplete.length}`,
                );
                for (const v of [...violations, ...incomplete]) {
                    console.log(`[axe]   ${v.impact} ${v.id} × ${v.nodes.length} — ${v.help}`);
                }

                expect(
                    serious.map((v) => `${v.id} (${v.nodes.length} node(s))`),
                    `serious/critical axe violations at ${slug} ${theme}`,
                ).toEqual([]);
                expect(
                    contrastIncomplete.map((v) => `contrast incomplete × ${v.nodes.length}`),
                    `axe could not determine contrast at ${slug} ${theme}`,
                ).toEqual([]);
            }
        });
    }
});

test.describe("atom docs · 390px", () => {
    test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

    for (const slug of DOCS) {
        test(`${slug} · 无横向溢出`, async ({ page }) => {
            await openDoc(page, slug, "light");
            const overflow = await page.evaluate(() => ({
                scrollWidth: document.documentElement.scrollWidth,
                innerWidth: window.innerWidth,
            }));
            expect(
                overflow.scrollWidth,
                `documentElement.scrollWidth=${overflow.scrollWidth} innerWidth=${overflow.innerWidth}`,
            ).toBeLessThanOrEqual(overflow.innerWidth + 1);
        });
    }
});
