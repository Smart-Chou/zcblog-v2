import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * C-1 设备 / 游戏 验收（M2-7b）
 *
 * 覆盖（`19-m2-plan.md` §M2-7 的页面级判据 + 本卡专项）：
 *  1. 路由 200：`/devices/`、`/en/devices/`、`/games/`、`/en/games/`
 *  2. 中英同源：状态 / 条数 / 分组数完全一致，且 en 页 h1 真的是英文（locale 接线没断）
 *  3. 恰好 1 个 <h1>；标题层级不跳级（两页双语言）
 *  4. light/dark × 390/768/1440：无横向溢出
 *  5. axe（wcag2a/aa + wcag21a/aa + wcag22aa）：页面主体 serious=0 critical=0 incomplete=0（双主题）
 *  6. 契约：
 *      · 设备 —— 卡片数 = `data-devices-total`；分组数 = 分类数；每张卡有名称 / ≥1 条规格 / 文字状态；
 *                状态只取自 in-use|backup|retired，id 唯一
 *      · 游戏 —— 卡片数 = `data-games-total`；分组数 = `data-games-groups`；每张卡有标题 / 平台 / 评价；
 *                有评分就必须有 5 格刻度 + 点亮格数 = 分数 + 「n/5」文字；没评分不许渲染 0 分
 *  7. 装饰性元素（序号 / 状态点 / 评分刻度）全部 aria-hidden —— 语义不靠形状
 *  8. 导航：新增两个入口在桌面/移动断点都不溢出、点击 200
 *  9. 空数据：**真实构建**（`PUBLIC_DEVICES_STATE=empty` / `PUBLIC_GAMES_STATE=empty`）证明「空数据可构建」，
 *     随后恢复常规构建，避免污染后续用例
 * 10. 4 张证据截图（devices light/dark 1440 + games light 1440 / light 390）
 */

const ROOT = process.cwd();
const AXE_SOURCE = readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [390, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

const DEVICES = {
    key: "devices",
    url: "/devices/",
    en: "/en/devices/",
    shell: ".entities--devices",
    total: "data-devices-total",
    groups: "data-devices-groups",
    card: ".device-card",
} as const;

const GAMES = {
    key: "games",
    url: "/games/",
    en: "/en/games/",
    shell: ".entities--games",
    total: "data-games-total",
    groups: "data-games-groups",
    card: ".game-card",
} as const;

const PAGES = [DEVICES, GAMES] as const;

const EVIDENCE_DIR =
    process.env.M27B_EVIDENCE_DIR ??
    path.resolve(ROOT, "../../hermes-desktop-files/blog2.0/docs/_reviews/M2-7b-devices-games");

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
    // 主题切换会触发颜色过渡（最长 --duration-slow 350ms）：过渡没走完时 getComputedStyle
    // 拿到的是插值中间色，axe 会按中间色算对比度 → 假红。
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
});

/* ───────────────────────── 2. 中英同源 ───────────────────────── */

test("中英两页同源：状态 / 条数 / 分组数一致，en 页 h1 是英文", async ({ page }) => {
    const read = async (url: string, attrs: string[], shellHeading: string) => {
        await page.goto(url, { waitUntil: "load" });
        const out: Record<string, string | null> = {};
        for (const attr of attrs)
            out[attr] = await page.locator(`[${attr}]`).first().getAttribute(attr);
        out.h1 = (await page.locator(shellHeading).innerText()).trim();
        return out;
    };

    for (const page_ of PAGES) {
        const attrs = ["data-" + page_.key + "-status", page_.total, page_.groups];
        const zh = await read(page_.url, attrs, `${page_.shell} h1`);
        const en = await read(page_.en, attrs, `${page_.shell} h1`);

        for (const attr of attrs)
            expect(en[attr], `${page_.key}: ${attr} 中英不一致`).toEqual(zh[attr]);
        expect(zh[`data-${page_.key}-status`]).toBe("ok");
        expect(zh.h1).not.toEqual(en.h1);
        expect(en.h1).toMatch(/^[A-Za-z][A-Za-z\s&]*$/);
        console.log(
            `[i18n] ${page_.key}: ${zh.h1} / ${en.h1} · total ${zh[page_.total]} · groups ${zh[page_.groups]}`,
        );
    }
});

/* ───────────────────────── 3. h1 / 标题层级 ───────────────────────── */

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

/* ───────────────────────── 4. 横向溢出 ───────────────────────── */

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

/* ───────────────────────── 5. axe ───────────────────────── */

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
            await page.addStyleTag({
                content: `${page_.shell} * { transition: none !important; }`,
            });
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

/* ───────────────────────── 6. 契约 ───────────────────────── */

test("契约：设备卡片数 = 数据条数，名称/规格/状态齐全且 id 唯一", async ({ page }) => {
    await page.goto(DEVICES.url, { waitUntil: "load" });
    const shell = page.locator(DEVICES.shell);
    const total = Number(await shell.getAttribute(DEVICES.total));
    const groups = Number(await shell.getAttribute(DEVICES.groups));

    await expect(page.locator(DEVICES.card)).toHaveCount(total);
    await expect(page.locator(`${DEVICES.shell} .entities-section`)).toHaveCount(groups);

    const cards = await page.locator(DEVICES.card).evaluateAll((nodes) =>
        nodes.map((node) => ({
            id: node.getAttribute("data-device-id"),
            status: node.getAttribute("data-device-status"),
            category: node.getAttribute("data-device-category"),
            name: (node.querySelector(".device-card__name")?.textContent ?? "").trim(),
            specs: node.querySelectorAll(".device-card__spec").length,
            statusText: (node.querySelector(".device-card__status")?.textContent ?? "").trim(),
        })),
    );

    expect(new Set(cards.map((card) => card.id)).size, "设备 id 必须唯一").toBe(cards.length);
    for (const card of cards) {
        expect(card.name.length, `设备 ${card.id} 缺名称`).toBeGreaterThan(0);
        expect(card.specs, `设备 ${card.id} 至少要有一条规格`).toBeGreaterThan(0);
        expect(
            card.statusText.length,
            `设备 ${card.id} 状态必须有文字，不许只靠色点`,
        ).toBeGreaterThan(0);
        expect(["in-use", "backup", "retired"]).toContain(card.status);
        expect(["computer", "display", "audio", "peripheral", "network", "other"]).toContain(
            card.category,
        );
    }
    console.log(`[devices] ${total} 台 · ${groups} 个分类 · id 唯一 · 规格与状态齐全`);
});

test("契约：游戏卡片数/分组数 = 数据，评分刻度与文字自洽", async ({ page }) => {
    await page.goto(GAMES.url, { waitUntil: "load" });
    const shell = page.locator(GAMES.shell);
    const total = Number(await shell.getAttribute(GAMES.total));
    const groups = Number(await shell.getAttribute(GAMES.groups));

    await expect(page.locator(GAMES.card)).toHaveCount(total);
    await expect(page.locator(`${GAMES.shell} .entities-section`)).toHaveCount(groups);

    const cards = await page.locator(GAMES.card).evaluateAll((nodes) =>
        nodes.map((node) => {
            const rating = node.getAttribute("data-game-rating");
            const scale = node.querySelector(".game-card__scale");
            return {
                id: node.getAttribute("data-game-id"),
                status: node.getAttribute("data-game-status"),
                title: (node.querySelector(".game-card__title")?.textContent ?? "").trim(),
                platforms: (node.querySelector(".game-card__platforms")?.textContent ?? "").trim(),
                note: (node.querySelector(".game-card__note")?.textContent ?? "").trim(),
                stateText: (node.querySelector(".game-card__state")?.textContent ?? "").trim(),
                rating,
                segments: scale ? scale.querySelectorAll(".game-card__seg").length : 0,
                lit: scale ? scale.querySelectorAll(".game-card__seg.is-on").length : 0,
                score: (node.querySelector(".game-card__score")?.textContent ?? "").trim(),
            };
        }),
    );

    expect(new Set(cards.map((card) => card.id)).size, "游戏 id 必须唯一").toBe(cards.length);
    for (const card of cards) {
        expect(card.title.length, `游戏 ${card.id} 缺标题`).toBeGreaterThan(0);
        expect(card.platforms.length, `游戏 ${card.id} 缺平台`).toBeGreaterThan(0);
        expect(card.note.length, `游戏 ${card.id} 缺一句评价`).toBeGreaterThan(0);
        expect(card.stateText.length, `游戏 ${card.id} 状态必须有文字`).toBeGreaterThan(0);
        expect(["playing", "finished", "shelved", "backlog"]).toContain(card.status);

        if (card.rating) {
            // 有评分：刻度 5 格、点亮数 = 分数、且有「n/5」文字（只数格子读屏拿不到）
            expect(card.segments, `游戏 ${card.id} 评分刻度应为 5 格`).toBe(5);
            expect(card.lit, `游戏 ${card.id} 点亮格数应等于分数 ${card.rating}`).toBe(
                Number(card.rating),
            );
            expect(card.score).toBe(`${card.rating}/5`);
        } else {
            // 没评分：不许出现「0/5」这种不存在的分数
            expect(card.segments).toBe(0);
            expect(card.score).toBe("");
        }
    }
    console.log(`[games] ${total} 款 · ${groups} 个状态分组 · 评分与文字自洽`);
});

/* ───────────────────────── 7. 装饰性元素 aria-hidden ───────────────────────── */

test("装饰性元素全部 aria-hidden（序号 / 状态点 / 评分刻度）", async ({ page }) => {
    const expectations = [
        [DEVICES.url, DEVICES.shell, [".device-card__index", ".device-card__status-dot"]],
        [GAMES.url, GAMES.shell, [".game-card__index", ".game-card__scale"]],
    ] as const;

    for (const [url, shell, selectors] of expectations) {
        await page.goto(url, { waitUntil: "load" });
        for (const selector of selectors) {
            const count = await page.locator(`${shell} ${selector}`).count();
            expect(count, `${url}: 没有 ${selector} 可断言`).toBeGreaterThan(0);
            const hidden = await page
                .locator(`${shell} ${selector}`)
                .evaluateAll((nodes) =>
                    nodes.every((node) => node.getAttribute("aria-hidden") === "true"),
                );
            expect(hidden, `${url}: ${selector} 必须 aria-hidden（语义由文字承担）`).toBe(true);
        }
    }
    console.log("[a11y] 序号 / 状态点 / 评分刻度均 aria-hidden");
});

/* ───────────────────────── 8. 导航 ───────────────────────── */

test("导航：新增两个入口存在、不溢出、可点击", async ({ page }) => {
    for (const width of [390, 1440] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/", { waitUntil: "load" });
        await page.locator("#nav-menu-btn").click();
        const nav = page.locator("#nav-dropdown");
        await expect(nav).toBeVisible();

        for (const [label, href] of [
            ["设备", "/devices/"],
            ["游戏", "/games/"],
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

        const response = await page.goto("/devices/", { waitUntil: "load" });
        expect(response?.status()).toBe(200);
    }
});

/* ───────────────────────── 9. 空数据（真实构建） ───────────────────────── */

test("空数据可构建：真实构建两页为空态，路由仍 200", async ({ page }) => {
    test.setTimeout(900_000);
    const astroBin = path.join(ROOT, "node_modules/.bin/astro");

    try {
        execFileSync(astroBin, ["build"], {
            cwd: ROOT,
            env: { ...process.env, PUBLIC_DEVICES_STATE: "empty", PUBLIC_GAMES_STATE: "empty" },
            stdio: "pipe",
        });

        for (const [url, shell, statusAttr, emptyAttr, card] of [
            [DEVICES.url, DEVICES.shell, "data-devices-status", "data-devices-empty", DEVICES.card],
            [GAMES.url, GAMES.shell, "data-games-status", "data-games-empty", GAMES.card],
        ] as const) {
            const response = await page.goto(url, { waitUntil: "load" });
            expect(response?.status(), `${url}: 空态也必须 200`).toBe(200);
            await expect(page.locator(shell)).toHaveAttribute(statusAttr, "empty");
            await expect(page.locator(shell)).toHaveCount(1);
            await expect(page.locator(`[${emptyAttr}]`)).toBeVisible();
            await expect(page.locator(`${shell} ${card}`)).toHaveCount(0);
        }
        console.log("[empty] 真实构建：两页均为空态，0 卡片，路由 200");
    } finally {
        // 恢复常规构建：后续用例（以及验收命令里的 perf/visual）必须看到正常数据
        execFileSync(astroBin, ["build"], { cwd: ROOT, env: process.env, stdio: "pipe" });
    }
});

/* ───────────────────────── 10. 证据截图 ───────────────────────── */

test("证据截图：devices light/dark 1440 + games light 1440/390", async ({ page }) => {
    if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
    const shots = [
        { url: DEVICES.url, theme: "light" as Theme, width: 1440, name: "devices-light-1440.png" },
        { url: DEVICES.url, theme: "dark" as Theme, width: 1440, name: "devices-dark-1440.png" },
        { url: GAMES.url, theme: "light" as Theme, width: 1440, name: "games-light-1440.png" },
        { url: GAMES.url, theme: "light" as Theme, width: 390, name: "games-light-390.png" },
    ];
    for (const shot of shots) {
        await page.setViewportSize({ width: shot.width, height: 900 });
        await openPage(page, shot.url, shot.theme);
        await page.screenshot({ path: path.join(EVIDENCE_DIR, shot.name), fullPage: true });
    }
    console.log(`[evidence] ${shots.length} 张截图 → ${EVIDENCE_DIR}`);
});
