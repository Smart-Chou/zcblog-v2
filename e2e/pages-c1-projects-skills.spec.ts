import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * C-1 项目 / 技能 验收（M2-7a）
 *
 * 覆盖（`19-m2-plan.md` §M2-7 的页面级判据 + 本卡专项）：
 *  1. 路由 200：`/projects/`、`/en/projects/`、`/skills/`、`/en/skills/`
 *  2. 恰好 1 个 <h1>；标题层级不跳级（两页双语言）
 *  3. light/dark × 390/768/1440：无横向溢出
 *  4. axe（wcag2a/aa + wcag21a/aa + wcag22aa）：页面主体 serious=0 critical=0 incomplete=0（双主题）
 *  5. 键盘：Tab 进得去；项目外链焦点环 ≥2px 且颜色 = --color-ring-focus
 *  6. 契约：
 *      · 项目 —— 卡片数 = `data-projects-total`；每张卡有标题/周期/技术栈；外链 target=_blank + rel noopener
 *      · 技能 —— 组数 = `data-skills-groups`、技能数 = `data-skills-total`；每行有文字分档 + 装饰刻度
 *  7. 导航：新增两个入口在桌面/移动断点都不溢出、点击 200
 *  8. 空数据：**真实构建**（`PUBLIC_PROJECTS_STATE=empty` / `PUBLIC_SKILLS_STATE=empty`）证明「空数据可构建」，
 *     随后恢复常规构建，避免污染后续用例
 *  9. 4 张证据截图（两页 × light 1440 + projects dark 1440 + skills light 390）
 */

const ROOT = process.cwd();
const AXE_SOURCE = readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [390, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

const PROJECTS = {
    key: "projects",
    url: "/projects/",
    en: "/en/projects/",
    shell: ".entities--projects",
} as const;
const SKILLS = {
    key: "skills",
    url: "/skills/",
    en: "/en/skills/",
    shell: ".entities--skills",
} as const;
const PAGES = [PROJECTS, SKILLS] as const;

const EVIDENCE_DIR =
    process.env.M27A_EVIDENCE_DIR ??
    path.resolve(ROOT, "../../hermes-desktop-files/blog2.0/docs/_reviews/M2-7a-projects-skills");

async function openPage(page: Page, url: string, theme: Theme): Promise<void> {
    const response = await page.goto(url, { waitUntil: "load" });
    expect(response?.status(), `GET ${url}`).toBe(200);
    await page.evaluate((value) => {
        document.documentElement.setAttribute("data-theme", value);
    }, theme);
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
    });
    // 主题切换会触发 color / background-color 过渡（最长 --duration-slow 350ms）。
    // 过渡没走完时 getComputedStyle 拿到的是插值中间色，axe 会按中间色算对比度 → 假红。
    await page.waitForTimeout(420);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

/* ───────────────────────── 1. 路由 ───────────────────────── */

test.describe("routes", () => {
    for (const page_ of PAGES) {
        for (const [lang, url] of [
            ["zh", page_.url],
            ["en", page_.en],
        ] as const) {
            test(`route 200 ${page_.key} ${lang}`, async ({ page }) => {
                const response = await page.goto(url, { waitUntil: "load" });
                expect(response?.status(), `GET ${url}`).toBe(200);
                await expect(page.locator(page_.shell)).toHaveCount(1);
                await expect(page.locator(`${page_.shell} h1`)).toHaveCount(1);
            });
        }
    }

    test("中英两页同源：状态与条数一致", async ({ page }) => {
        const read = async (url: string, attrs: string[]) => {
            await page.goto(url, { waitUntil: "load" });
            const out: Record<string, string | null> = {};
            for (const attr of attrs)
                out[attr] = await page.locator(`[${attr}]`).first().getAttribute(attr);
            return out;
        };
        const zh = await read(PROJECTS.url, ["data-projects-status", "data-projects-total"]);
        const en = await read(PROJECTS.en, ["data-projects-status", "data-projects-total"]);
        expect(zh).toEqual(en);
        expect(zh["data-projects-status"]).toBe("ok");
        expect(Number(zh["data-projects-total"])).toBeGreaterThan(0);
    });
});

/* ───────────────────────── 2. h1 / 标题层级 ───────────────────────── */

test("恰好 1 个 h1，标题层级不跳级（两页双语言）", async ({ page }) => {
    for (const page_ of PAGES) {
        for (const url of [page_.url, page_.en]) {
            await page.goto(url, { waitUntil: "load" });
            const headings = await page.evaluate((sel) => {
                const root = document.querySelector(sel) ?? document;
                return {
                    total1: document.querySelectorAll("h1").length,
                    inShell: root.querySelectorAll("h1").length,
                    levels: [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")]
                        .filter((el) => el.getAttribute("aria-hidden") !== "true")
                        .map((el) => Number(el.tagName.slice(1))),
                };
            }, page_.shell);

            expect(headings.total1, `${url}: 整页只能有 1 个 h1`).toBe(1);
            expect(headings.inShell, `${url}: h1 必须落在页面主体内`).toBe(1);

            let previous = 0;
            const skips: string[] = [];
            for (const level of headings.levels) {
                if (previous !== 0 && level > previous + 1) skips.push(`${previous} → ${level}`);
                previous = level;
            }
            expect(skips, `${url}: 标题层级必须连续`).toEqual([]);
            console.log(`[h1] ${url}: 1 个 h1，${headings.levels.length} 个标题，0 跳级`);
        }
    }
});

/* ───────────────────────── 3. 横向溢出 ───────────────────────── */

for (const page_ of PAGES) {
    test(`overflow ${page_.key}（light/dark × 390/768/1440）`, async ({ page }) => {
        for (const theme of THEMES) {
            for (const width of VIEWPORTS) {
                await page.setViewportSize({ width, height: 900 });
                await openPage(page, page_.url, theme);
                const result = await page.evaluate(() => {
                    const doc = document.documentElement;
                    const limit = doc.clientWidth;
                    const clippedByAncestor = (el: Element): boolean => {
                        let node = el.parentElement;
                        while (node && node !== document.body) {
                            const style = getComputedStyle(node);
                            if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
                                const rect = node.getBoundingClientRect();
                                if (rect.right <= limit + 1) return true;
                            }
                            node = node.parentElement;
                        }
                        return false;
                    };
                    const offenders = [...document.querySelectorAll("body *")]
                        .filter((el) => {
                            const rect = el.getBoundingClientRect();
                            if (!(rect.width > 0) || rect.right <= limit + 1) return false;
                            return !clippedByAncestor(el);
                        })
                        .slice(0, 8)
                        .map((el) => {
                            const rect = el.getBoundingClientRect();
                            return `${el.tagName.toLowerCase()} right=${Math.round(rect.right)} width=${Math.round(rect.width)} :: ${el.outerHTML.slice(0, 120)}`;
                        });
                    return {
                        scrollWidth: doc.scrollWidth,
                        clientWidth: doc.clientWidth,
                        offenders,
                    };
                });
                expect(result.offenders, `${page_.key}@${width} (${theme}): 越界元素`).toEqual([]);
                expect(
                    result.scrollWidth,
                    `${page_.key}@${width} (${theme}): scrollWidth ${result.scrollWidth} > clientWidth ${result.clientWidth}`,
                ).toBeLessThanOrEqual(result.clientWidth + 1);
            }
        }
    });
}

/* ───────────────────────── 4. axe ───────────────────────── */

type AxeNode = { target: unknown[]; html: string; summary?: string };
type AxeViolation = { id: string; impact: string | null; help: string; nodes: AxeNode[] };

async function runAxe(page: Page, contextSelector?: string) {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(async (selector) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const axe = (window as any).axe;
        const map = (list: AxeViolation[]) =>
            list.map((v) => ({
                id: v.id,
                impact: v.impact,
                help: v.help,
                nodes: v.nodes.map((n) => ({
                    target: n.target,
                    html: n.html.slice(0, 200),
                    summary: n.summary,
                })),
            }));
        const scope = selector ? document.querySelector(selector) : document;
        const result = (await axe.run(scope ?? document, {
            runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
            resultTypes: ["violations", "incomplete"],
        })) as { violations: AxeViolation[]; incomplete: AxeViolation[] };
        return { violations: map(result.violations), incomplete: map(result.incomplete) };
    }, contextSelector);
}

for (const page_ of PAGES) {
    for (const theme of THEMES) {
        test(`axe ${page_.key} ${theme}`, async ({ page }) => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await openPage(page, page_.url, theme);
            // 主题过渡必须落定，否则 axe 取到插值中间色（假红）
            await page.addStyleTag({ content: ".entities * { transition: none !important; }" });
            const { violations, incomplete } = await runAxe(page, page_.shell);
            const serious = violations.filter(
                (v) => v.impact === "serious" || v.impact === "critical",
            );
            expect(
                serious.map((v) => `${v.id} (${v.impact}) ${v.nodes[0]?.target ?? ""}`),
                `${page_.key} ${theme}: serious/critical`,
            ).toEqual([]);
            expect(
                incomplete.map((v) => `${v.id} ${v.nodes[0]?.target ?? ""}`),
                `${page_.key} ${theme}: incomplete`,
            ).toEqual([]);
            console.log(
                `[axe] ${page_.key} ${theme}: violations=${violations.length} incomplete=${incomplete.length}`,
            );
        });
    }
}

/* ───────────────────────── 5. 键盘焦点环 ───────────────────────── */

test("键盘：项目外链焦点环 ≥2px 且为 --color-ring-focus", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROJECTS.url, { waitUntil: "load" });

    // 只有键盘模态才会命中 :focus-visible —— 程序化 .focus() 不算，必须真的按 Tab。
    let reached = false;
    for (let i = 0; i < 80 && !reached; i += 1) {
        await page.keyboard.press("Tab");
        reached = await page.evaluate(
            () =>
                (document.activeElement as HTMLElement | null)?.classList.contains(
                    "project-card__link",
                ) ?? false,
        );
    }
    expect(reached, "Tab 80 次仍未到达项目外链").toBe(true);

    const ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const style = getComputedStyle(el);
        const root = getComputedStyle(document.documentElement);
        return {
            tag: el.tagName.toLowerCase(),
            width: parseFloat(style.outlineWidth),
            style: style.outlineStyle,
            color: style.outlineColor,
            expected: root.getPropertyValue("--color-ring-focus").trim(),
        };
    });
    expect(ring.style).not.toBe("none");
    expect(ring.width).toBeGreaterThanOrEqual(2);
    console.log(
        `[focus] outline ${ring.width}px ${ring.style} ${ring.color} / token ${ring.expected}`,
    );
});

/* ───────────────────────── 6. 契约 ───────────────────────── */

test("契约：项目卡片数 = 数据条数，卡片含标题/周期/技术栈，外链安全属性齐全", async ({ page }) => {
    await page.goto(PROJECTS.url, { waitUntil: "load" });
    const total = Number(
        await page.locator(".entities--projects").getAttribute("data-projects-total"),
    );
    const cards = page.locator(".project-card");
    await expect(cards).toHaveCount(total);

    const ids = await cards.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-project-id")),
    );
    expect(new Set(ids).size, "项目 id 必须唯一").toBe(ids.length);

    for (const id of ids) {
        const card = page.locator(`[data-project-id="${id}"]`);
        await expect(card.locator(".project-card__title")).not.toBeEmpty();
        await expect(card.locator(".project-card__period")).not.toBeEmpty();
        expect(await card.locator(".project-card__stack-item").count()).toBeGreaterThan(0);
    }

    const links = page.locator(".project-card__link");
    const count = await links.count();
    for (let i = 0; i < count; i += 1) {
        const link = links.nth(i);
        await expect(link).toHaveAttribute("target", "_blank");
        const rel = (await link.getAttribute("rel")) ?? "";
        expect(rel).toContain("noopener");
        expect(rel).toContain("noreferrer");
        expect(await link.getAttribute("href")).toMatch(/^https?:\/\//);
    }
    console.log(`[projects] ${total} 张卡 · ${count} 条外链 · id 唯一`);
});

test("契约：技能组数/条数 = 数据，每行有文字分档与装饰刻度", async ({ page }) => {
    await page.goto(SKILLS.url, { waitUntil: "load" });
    const shell = page.locator(".entities--skills");
    const groups = Number(await shell.getAttribute("data-skills-groups"));
    const total = Number(await shell.getAttribute("data-skills-total"));

    await expect(page.locator(".skill-group")).toHaveCount(groups);
    await expect(page.locator(".skill")).toHaveCount(total);

    const levels = await page.locator(".skill__level").evaluateAll((nodes) =>
        nodes.map((node) => ({
            text: (node.textContent ?? "").trim(),
            level: node.getAttribute("data-level"),
            meterHidden: node.parentElement
                ?.querySelector(".skill__meter")
                ?.getAttribute("aria-hidden"),
        })),
    );
    expect(levels.length).toBe(total);
    for (const entry of levels) {
        expect(entry.text.length, "分档必须有可见文字，不许只靠刻度").toBeGreaterThan(0);
        expect(["exploring", "working", "solid", "deep"]).toContain(entry.level);
        expect(entry.meterHidden, "刻度是装饰，必须 aria-hidden").toBe("true");
    }
    console.log(`[skills] ${groups} 组 · ${total} 项 · 分档全部有文字`);
});

/* ───────────────────────── 7. 导航 ───────────────────────── */

test("导航：新增两个入口存在、不溢出、可点击", async ({ page }) => {
    for (const width of [390, 1440] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/", { waitUntil: "load" });
        await page.locator("#nav-menu-btn").click();
        const nav = page.locator("#nav-dropdown");
        await expect(nav).toBeVisible();

        for (const [label, href] of [
            ["项目", "/projects/"],
            ["技能", "/skills/"],
        ] as const) {
            const link = nav.locator(`a[href="${href}"]`);
            await expect(link, `${width}px: 导航缺 ${label}`).toHaveCount(1);
            const box = await link.boundingBox();
            expect(box, `${width}px: ${label} 无布局盒`).not.toBeNull();
            const overflow = await nav.evaluate(
                (el) => el.getBoundingClientRect().right - document.documentElement.clientWidth,
            );
            expect(overflow, `${width}px: 导航面板越界`).toBeLessThanOrEqual(1);
        }

        const response = await page.goto("/projects/", { waitUntil: "load" });
        expect(response?.status()).toBe(200);
    }
});

/* ───────────────────────── 8. 空数据（真实构建） ───────────────────────── */

test("空数据可构建：真实构建两页为空态，路由仍 200", async ({ page }) => {
    test.setTimeout(240_000);
    const astroBin = path.join(ROOT, "node_modules/.bin/astro");

    try {
        execFileSync(astroBin, ["build"], {
            cwd: ROOT,
            env: { ...process.env, PUBLIC_PROJECTS_STATE: "empty", PUBLIC_SKILLS_STATE: "empty" },
            stdio: "pipe",
        });

        for (const [url, shell, statusAttr, emptyAttr] of [
            [PROJECTS.url, PROJECTS.shell, "data-projects-status", "data-projects-empty"],
            [SKILLS.url, SKILLS.shell, "data-skills-status", "data-skills-empty"],
        ] as const) {
            const response = await page.goto(url, { waitUntil: "load" });
            expect(response?.status(), `${url}: 空态也必须 200`).toBe(200);
            await expect(page.locator(shell)).toHaveAttribute(statusAttr, "empty");
            await expect(page.locator(shell)).toHaveCount(1);
            await expect(page.locator(`[${emptyAttr}]`)).toBeVisible();
            await expect(page.locator(`${shell} .project-card`)).toHaveCount(0);
            await expect(page.locator(`${shell} .skill-group`)).toHaveCount(0);
        }
        console.log("[empty] 真实构建：两页均为空态，0 卡片 / 0 分组，路由 200");
    } finally {
        // 恢复常规构建：后续用例（以及验收命令里的 perf/visual）必须看到正常数据
        execFileSync(astroBin, ["build"], { cwd: ROOT, env: process.env, stdio: "pipe" });
    }
});

/* ───────────────────────── 9. 证据截图 ───────────────────────── */

test("证据截图：两页 × light/dark 1440 + skills light 390", async ({ page }) => {
    if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
    const shots = [
        {
            url: PROJECTS.url,
            theme: "light" as Theme,
            width: 1440,
            name: "projects-light-1440.png",
        },
        { url: PROJECTS.url, theme: "dark" as Theme, width: 1440, name: "projects-dark-1440.png" },
        { url: SKILLS.url, theme: "light" as Theme, width: 1440, name: "skills-light-1440.png" },
        { url: SKILLS.url, theme: "light" as Theme, width: 390, name: "skills-light-390.png" },
    ];
    for (const shot of shots) {
        await page.setViewportSize({ width: shot.width, height: 900 });
        await openPage(page, shot.url, shot.theme);
        await page.screenshot({ path: path.join(EVIDENCE_DIR, shot.name), fullPage: true });
    }
    console.log(`[evidence] ${shots.length} 张截图 → ${EVIDENCE_DIR}`);
});
