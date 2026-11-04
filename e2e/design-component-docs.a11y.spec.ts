import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * a11y + 结构门禁 for the 12 legacy UI docs pages — M2-10a.
 *
 * 与 `design-atom-docs.a11y.spec.ts` 同一套判据，但**示例区例外**：
 *
 *   1. 7 个必填 section 都在（purpose/props/slots/states/a11y/tokens/example）
 *   2. 没有空表（`<tr>` < 2 视为空）
 *   3. 示例区至少有一个画框（真实组件实例）
 *   4. 文档版式 0 运行时 JS：没有 hydration island；内联 `<script>` 只允许来自被展示的组件
 *      （12 个里只有 TypewriterText 自带脚本）
 *   5. light + dark 两个主题各跑一次 axe：
 *      · **`#example` 之外**（文档版式本身）＝ 0 serious/critical，且 0 条 color-contrast incomplete
 *      · **`#example` 之内**（旧组件实物）＝ 允许 color-contrast 违规（本组组件的对比度债就写在这里，
 *        文档正文的对比度表已逐条记账），但结构/标签/ARIA 类违规照样不许有
 *   6. 390px 宽度下页面没有横向溢出（宽表自己滚动）
 *
 * 每页的 axe 报告落 `test-results/axe-component-docs/<slug>-<theme>.json`，示例区的债也在里面。
 */

const DOCS = [
    "badge",
    "ui-button",
    "ui-card",
    "ui-pagination",
    "archive",
    "pageheader",
    "typewritertext",
    "cardgrid",
    "qrcard",
    "friendpill",
    "donatorslist",
    "author",
] as const;

/** 自带 `<script>` 的组件（其余页面必须 0 内联脚本）。 */
const COMPONENTS_WITH_SCRIPT = new Set<string>(["typewritertext"]);

/**
 * 示例区例外登记表（对应 DESIGN.md §6.2 的「只许登记后违规，不许默默违规」）。
 *
 * 只登记**在文档页这个环境里修不掉**的违规，并写清原因与修法；数量是精确值——
 * 组件修好之后这里必须同步收紧（多了红，少了也红）。对比度债不在此列：那是本组组件的
 * 真实债务，逐条写在文档正文的对比度表里，`#example` 内一律放行。
 */
const DEMO_EXCEPTIONS: Record<string, Record<string, { count: number; why: string }>> = {
    "ui-pagination": {
        "aria-prohibited-attr": {
            count: 1,
            why: "边界箭头是没有 href 的 <a>（不可点击），`aria-disabled` 在这种 generic 锚点上被 ARIA-in-HTML 判为禁止属性。组件在 M2-10a 的文件边界之外；修法是改成 <span aria-disabled> 或 <button disabled>。",
        },
    },
    author: {
        "target-size": {
            count: 9,
            why: "图标链接 34×34 的命中区来自 `src/styles/article.css` 的 `.author` 规则，而文档页不加载页面级 CSS —— 这个环境里命中区就是图标本身。生产页面上 34px ≥ 24px（WCAG 2.2 AA 达标），属环境差异而不是组件缺陷。",
        },
    },
};

const SECTIONS = ["purpose", "props", "slots", "states", "a11y", "tokens", "example"] as const;
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);
const AXE_DIR = path.join(process.cwd(), "test-results", "axe-component-docs");

async function openDoc(page: Page, slug: string, theme: Theme): Promise<void> {
    const response = await page.goto(`/design/components/${slug}/`, { waitUntil: "load" });
    expect(response?.status(), `GET /design/components/${slug}/`).toBe(200);
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

type AxeNode = { target: unknown[]; html: string; failureSummary?: string; summary?: string };
type AxeViolation = {
    id: string;
    impact: string | null;
    help: string;
    helpUrl: string;
    nodes: AxeNode[];
};

/**
 * `context` 采用 axe 的 include / exclude 语法：
 *   严格面 = `{ exclude: [["#example"]] }`；示例面 = `["#example"]`。
 */
async function runAxe(
    page: Page,
    context: { exclude: string[][] } | string[],
): Promise<{ violations: AxeViolation[]; incomplete: AxeViolation[] }> {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(async (target) => {
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
        const result = (await axe.run(target, {
            runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
            resultTypes: ["violations", "incomplete"],
        })) as { violations: AxeViolation[]; incomplete: AxeViolation[] };
        return { violations: map(result.violations), incomplete: map(result.incomplete) };
    }, context);
}

test.describe("legacy UI docs · structure", () => {
    test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

    for (const slug of DOCS) {
        test(`${slug} · 7 sections / no empty table / 0 doc-authored JS`, async ({ page }) => {
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
                        inlineScripts: [...document.querySelectorAll("script:not([src])")].map(
                            (script) => script.textContent ?? "",
                        ),
                        islands: document.querySelectorAll("astro-island").length,
                        headings: sectionIds.map(
                            (id) => document.querySelector(`#${id} h2`)?.textContent?.trim() ?? "",
                        ),
                        indexLinks: document.querySelectorAll(".doc-index__link").length,
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
            expect(structure.islands, "文档页没有 hydration island").toBe(0);
            expect(structure.indexLinks, "页脚索引列出全部 12 个文档").toBe(DOCS.length);
            for (const heading of structure.headings) {
                expect(heading, "每个 section 都有 h2").not.toBe("");
            }

            if (COMPONENTS_WITH_SCRIPT.has(slug)) {
                // 组件自带的脚本：必须是 TypewriterText 的那一段，且只有一段。
                expect(
                    structure.inlineScripts.length,
                    "typewritertext 只有组件自带的一段脚本",
                ).toBeLessThanOrEqual(1);
                for (const script of structure.inlineScripts) {
                    // Astro 会压缩内联脚本（类名被改成单字母），所以断言标记而不是类名：
                    // `__typewriterInstance` 是组件脚本独有的接管标记。
                    expect(script, "内联脚本必须属于 TypewriterText").toContain(
                        "__typewriterInstance",
                    );
                }
            } else {
                expect(structure.inlineScripts, `${slug} 文档页没有内联脚本`).toEqual([]);
            }
        });
    }
});

test.describe("legacy UI docs · axe (WCAG 2.x A/AA)", () => {
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

                // ① 文档版式（#example 之外）：严格。
                const shell = await runAxe(page, { exclude: [["#example"]] });
                // ② 示例区：结构类违规照样不许，对比度债允许（正文已逐条记账）。
                const demo = await runAxe(page, ["#example"]);

                writeFileSync(
                    path.join(AXE_DIR, `${slug}-${theme}.json`),
                    JSON.stringify({ shell, demo }, null, 2),
                );

                const seriousShell = shell.violations.filter(
                    (v) => v.impact === "serious" || v.impact === "critical",
                );
                const contrastShell = shell.incomplete.filter((v) => v.id === "color-contrast");
                const demoContrast = demo.violations.filter((v) => v.id === "color-contrast");
                const allowed = DEMO_EXCEPTIONS[slug] ?? {};
                const demoProblems: string[] = [];
                for (const violation of demo.violations) {
                    if (violation.id === "color-contrast") continue;
                    const registered = allowed[violation.id];
                    if (!registered) {
                        demoProblems.push(
                            `${violation.id} (${violation.nodes.length} node(s)) —— 未登记的示例区违规`,
                        );
                        continue;
                    }
                    if (registered.count !== violation.nodes.length) {
                        demoProblems.push(
                            `${violation.id} 数量变了：登记 ${registered.count}，实测 ${violation.nodes.length} —— 收紧后请同步登记表`,
                        );
                    }
                }
                for (const rule of Object.keys(allowed)) {
                    if (!demo.violations.some((violation) => violation.id === rule)) {
                        demoProblems.push(
                            `登记表里的 ${rule} 已不再违规 —— 从 DEMO_EXCEPTIONS 删掉`,
                        );
                    }
                }

                console.log(
                    `[axe] ${slug} ${theme}: shell violations=${shell.violations.length} serious=${seriousShell.length} contrast-incomplete=${contrastShell.length} · demo contrast=${demoContrast.length} registered=${Object.keys(allowed).length} other=${demoProblems.length}`,
                );
                for (const v of [...shell.violations, ...shell.incomplete, ...demo.violations]) {
                    console.log(`[axe]   ${v.impact} ${v.id} × ${v.nodes.length} — ${v.help}`);
                }

                expect(
                    seriousShell.map((v) => `${v.id} (${v.nodes.length} node(s))`),
                    `serious/critical axe violations in doc shell at ${slug} ${theme}`,
                ).toEqual([]);
                expect(
                    contrastShell.map((v) => `contrast incomplete × ${v.nodes.length}`),
                    `axe could not determine contrast in doc shell at ${slug} ${theme}`,
                ).toEqual([]);
                expect(
                    demoProblems,
                    `示例区只有对比度债与登记过的例外（${slug} ${theme}）`,
                ).toEqual([]);
            }
        });
    }
});

test.describe("legacy UI docs · 390px", () => {
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

test.describe("legacy UI docs · 互链", () => {
    test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

    test("12 页的页脚索引 + prev/next + 返回链接全部指向已存在页面", async ({ page, request }) => {
        const seen = new Set<string>();
        for (const slug of DOCS) {
            await page.goto(`/design/components/${slug}/`, { waitUntil: "load" });
            const hrefs = await page.evaluate(() => [
                ...[...document.querySelectorAll(".doc-nav__link, .doc-index__link")].map(
                    (anchor) => anchor.getAttribute("href") ?? "",
                ),
            ]);
            for (const href of hrefs) {
                expect(href, `${slug} 的导航链接不能为空`).not.toBe("");
                if (seen.has(href)) continue;
                seen.add(href);
                const response = await request.get(href, { maxRedirects: 0 });
                expect(response.status(), `GET ${href}（来自 ${slug}）`).toBe(200);
            }
        }
        // 12 个同级文档 + 1 个「← atom 文档」返回链接。
        expect(seen.size, "去重后的导航目标数").toBe(DOCS.length + 1);
    });
});
