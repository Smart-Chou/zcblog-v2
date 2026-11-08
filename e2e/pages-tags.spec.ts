import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * M6-4 · `/tags/` + `/tags/<tag>/` 验收（archives_tags_1 右栏 + archives_tags_2 Matrix）。
 *
 * 与 `e2e/pages-archives.spec.ts` 的分工：归档卡校验时间轴 / 热力图 / 年份折叠；
 * 本文件只盯标签侧：
 *   1. 路由 200（zh / en / 单标签），恰好 1 个 h1
 *   2. 272 级标签全量渲染、每个胶囊都指向 /tags/<tag>/、计数与统计行一致
 *   3. 纯 CSS 分列（computed column-count：1440 多列 / 390 单列），不引入 JS 图谱
 *   4. 390/768/1440 × light/dark 无文档级横向溢出
 *   5. axe（wcag2a/aa + wcag21a/aa + wcag22aa）页面主体 serious/critical/incomplete = 0
 *   6. 移动胶囊（<1024 显示、≥1024 隐藏）与 aria-current
 *   7. 无 JS 可读（关闭 JS 后 272 个链接仍在、可点）
 *   8. prefers-reduced-motion 下无运行中动画
 */

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [390, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

async function openPage(page: Page, url: string, theme: Theme): Promise<void> {
    const response = await page.goto(url, { waitUntil: "load" });
    expect(response?.status(), `GET ${url}`).toBe(200);
    await page.evaluate((value) => {
        const root = document.documentElement;
        root.classList.toggle("dark", value === "dark");
        root.setAttribute("data-theme", value);
        root.style.colorScheme = value;
    }, theme);
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
    });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

/* ───────────────────────── 1. 路由 / 标题 ───────────────────────── */

test.describe("routes", () => {
    for (const url of ["/tags/", "/tags/DOCKER/"] as const) {
        test(`route-zh 200 ${url}`, async ({ page }) => {
            const response = await page.goto(url, { waitUntil: "load" });
            expect(response?.status(), `GET ${url}`).toBe(200);
        });
    }

    test("route-en 200 /en/tags/", async ({ page }) => {
        const response = await page.goto("/en/tags/", { waitUntil: "load" });
        expect(response?.status()).toBe(200);
        await expect(page.locator(".tags-hub")).toHaveCount(1);
    });

    test("标签首页 / 单标签页各恰好 1 个 h1，层级不跳级", async ({ page }) => {
        for (const sel of [".tags-hub", ".tag-detail"]) {
            await page.goto(sel === ".tags-hub" ? "/tags/" : "/tags/DOCKER/", {
                waitUntil: "load",
            });
            const data = await page.evaluate((scope) => {
                const root = document.querySelector(scope) ?? document;
                return {
                    h1: [...document.querySelectorAll("h1")].map((el) =>
                        (el.textContent ?? "").trim(),
                    ),
                    levels: [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")]
                        .filter((el) => el.getAttribute("aria-hidden") !== "true")
                        .map((el) => Number(el.tagName.slice(1))),
                };
            }, sel);
            expect(data.h1, `${sel}: exactly one h1`).toHaveLength(1);
            expect(data.h1[0]).not.toBe("");
            let previous = 0;
            const skips: string[] = [];
            for (const level of data.levels) {
                if (previous !== 0 && level > previous + 1) skips.push(`${previous} → ${level}`);
                previous = level;
            }
            expect(skips, `${sel}: heading levels`).toEqual([]);
        }
    });
});

/* ───────────────────────── 2. 全量标签 ───────────────────────── */

test("272+ 标签全量渲染：链接指向 /tags/<tag>/、计数自洽", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/tags/", { waitUntil: "load" });

    const data = await page.evaluate(() => {
        const items = [...document.querySelectorAll(".tag-cloud__item")];
        const links = items.map((item) => item.querySelector("a"));
        const meta = (document.querySelector(".tags-meta")?.textContent ?? "").trim();
        const sumCounts = items.reduce((sum, item) => {
            const raw = item.querySelector(".tag-cloud__count")?.textContent ?? "0";
            return sum + Number(raw.trim());
        }, 0);
        return {
            items: items.length,
            badLinks: links
                .map((a) => a?.getAttribute("href") ?? "")
                .filter((href) => !href.startsWith("/tags/"))
                .slice(0, 5),
            emptyNames: items.filter((item) => {
                const link = item.querySelector(".tag-cloud__link");
                const name = (link?.textContent ?? "").replace(/\d+\s*$/, "").trim();
                return !name;
            }).length,
            meta,
            weights: items.map((item) => item.getAttribute("data-weight")),
            sumCounts,
            columnCount: getComputedStyle(document.querySelector(".tag-cloud--tail") as Element)
                .columnCount,
            columnWidth: Number.parseFloat(
                getComputedStyle(document.querySelector(".tag-cloud--tail") as Element).columnWidth,
            ),
            columnBoxWidth: (document.querySelector(".tag-cloud--tail") as HTMLElement).clientWidth,
        };
    });

    console.log(
        `[tags] ${data.items} 个标签 · 计数和 ${data.sumCounts} · 列数 ${data.columnCount} · meta "${data.meta}"`,
    );
    expect(data.items, "标签数应与统计行一致").toBe(Number((data.meta.match(/^(\d+)/) ?? [])[1]));
    expect(data.items).toBeGreaterThanOrEqual(200);
    expect(data.badLinks, "每个胶囊都指向 /tags/<tag>/").toEqual([]);
    expect(data.emptyNames, "标签名不能为空").toBe(0);
    expect(data.weights.filter((w) => w === "3")).toHaveLength(12);
    expect(data.weights.filter((w) => w === "1").length).toBeGreaterThan(0);
    // 纯 CSS 分列：`columns: 15rem` 的 computed columnCount 是 auto，按实际列宽估算
    const estimatedColumns =
        Number(data.columnCount) ||
        (data.columnWidth > 0 ? Math.floor(data.columnBoxWidth / data.columnWidth) : 0);
    expect(estimatedColumns, "桌面至少 3 列").toBeGreaterThanOrEqual(3);
});

test("390 宽单列（columns: 1），不是脚本布的图", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tags/", { waitUntil: "load" });
    const columnCount = await page.evaluate(
        () => getComputedStyle(document.querySelector(".tag-cloud--tail") as Element).columnCount,
    );
    expect(Number(columnCount)).toBe(1);
});

test("标签首页不加载图谱脚本（JS 增量 0 的落点）", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
        if (request.resourceType() === "script") requests.push(request.url());
    });
    await page.goto("/tags/", { waitUntil: "load" });
    // 站点外壳的 umami 埋点是存量，不算图谱脚本；只拦 d3 / graph / force 类 CDN。
    const graphish = requests.filter((url) =>
        /(?:^|\/)(?:d3|graph|force|tag-cloud)(?:[.\/-]|$)/i.test(new URL(url).pathname),
    );
    expect(graphish, "不得引入标签图谱脚本").toEqual([]);
});

/* ───────────────────────── 3. 横向溢出 ───────────────────────── */

test.describe("no horizontal overflow", () => {
    for (const theme of THEMES) {
        for (const url of ["/tags/", "/tags/DOCKER/"] as const) {
            test(`overflow ${url} ${theme}`, async ({ page }) => {
                for (const width of VIEWPORTS) {
                    await page.setViewportSize({ width, height: 900 });
                    await openPage(page, url, theme);
                    const result = await page.evaluate(() => {
                        const doc = document.documentElement;
                        const limit = doc.clientWidth;
                        return {
                            scrollWidth: doc.scrollWidth,
                            clientWidth: doc.clientWidth,
                            offenders: [...document.querySelectorAll("body *")]
                                .filter((el) => {
                                    const rect = el.getBoundingClientRect();
                                    return rect.width > 0 && rect.right > limit + 1;
                                })
                                .slice(0, 5)
                                .map(
                                    (el) =>
                                        `${el.tagName.toLowerCase()} right=${Math.round(el.getBoundingClientRect().right)}`,
                                ),
                        };
                    });
                    expect(result.offenders, `${url}@${width}: 越界元素`).toEqual([]);
                    expect(
                        result.scrollWidth,
                        `${url}@${width}: scrollWidth ${result.scrollWidth} > clientWidth ${result.clientWidth}`,
                    ).toBeLessThanOrEqual(result.clientWidth + 1);
                }
            });
        }
    }
});

/* ───────────────────────── 4. axe ───────────────────────── */

type AxeNode = { target: unknown[]; html: string; failureSummary?: string };
type AxeViolation = { id: string; impact: string | null; help: string; nodes: AxeNode[] };

async function runAxe(
    page: Page,
    contextSelector: string,
): Promise<{ violations: AxeViolation[]; incomplete: AxeViolation[] }> {
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
                    html: n.html.slice(0, 160),
                    summary: n.failureSummary,
                })),
            }));
        const scope = document.querySelector(selector) ?? document;
        const result = (await axe.run(scope, {
            runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
            resultTypes: ["violations", "incomplete"],
        })) as { violations: AxeViolation[]; incomplete: AxeViolation[] };
        return { violations: map(result.violations), incomplete: map(result.incomplete) };
    }, contextSelector);
}

test.describe("axe (WCAG 2.x A/AA)", () => {
    for (const [url, shell] of [
        ["/tags/", ".tags-hub"],
        ["/tags/DOCKER/", ".tag-detail"],
    ] as const) {
        for (const theme of THEMES) {
            test(`axe ${url} ${theme}`, async ({ page }) => {
                test.setTimeout(120_000);
                await page.setViewportSize({ width: 1440, height: 900 });
                await openPage(page, url, theme);
                const result = await runAxe(page, shell);
                const serious = result.violations.filter(
                    (v) => v.impact === "serious" || v.impact === "critical",
                );
                console.log(
                    `[axe] ${url} ${theme}: serious=${serious.length} incomplete=${result.incomplete.length}`,
                );
                for (const v of [...serious, ...result.incomplete]) {
                    console.log(`[axe]   ${v.impact} ${v.id} × ${v.nodes.length} — ${v.help}`);
                }
                expect(
                    serious.map((v) => `${v.id} (${v.nodes.length})`),
                    `${url} ${theme}: serious/critical 必须为 0`,
                ).toEqual([]);
                expect(
                    result.incomplete.map((v) => `${v.id} (${v.nodes.length})`),
                    `${url} ${theme}: axe 不能留 incomplete`,
                ).toEqual([]);
            });
        }
    }
});

/* ───────────────────────── 5. 移动胶囊 ───────────────────────── */

test("胶囊：<1024 显示 / ≥1024 隐藏，aria-current 指当前视图", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tags/", { waitUntil: "load" });
    const capsule = page.locator(".tags-switch");
    await expect(capsule).toBeVisible();

    const items = capsule.locator(".tags-switch__item");
    await expect(items).toHaveCount(2);
    await expect(items.nth(1)).toHaveAttribute("aria-current", "page");
    await expect(items.nth(0)).not.toHaveAttribute("aria-current", "page");
    // 「编年时空」指向既有的 /archives/（不是新建的移动路由）
    await expect(items.nth(0)).toHaveAttribute("href", "/archives/");

    const box = await capsule.boundingBox();
    console.log(`[capsule] 390: ${Math.round(box?.width ?? 0)}×${Math.round(box?.height ?? 0)}`);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);

    // 反向：/archives/ 的胶囊把 Matrix 指回 /tags/
    await page.goto("/archives/", { waitUntil: "load" });
    const archivesItems = page.locator(".archives-switch .archives-switch__item");
    await expect(archivesItems).toHaveCount(2);
    await expect(archivesItems.nth(0)).toHaveAttribute("aria-current", "page");
    await expect(archivesItems.nth(1)).toHaveAttribute("href", "/tags/");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/tags/", { waitUntil: "load" });
    await expect(page.locator(".tags-switch")).toBeHidden();
});

/* ───────────────────────── 6. 无 JS 可读 ───────────────────────── */

test.describe("zero-JS", () => {
    test.use({ javaScriptEnabled: false });

    test("/tags/ 无 JS：272 个链接与统计仍在", async ({ page }) => {
        await page.goto("/tags/", { waitUntil: "load" });
        const count = await page.locator(".tag-cloud__item a").count();
        expect(count).toBeGreaterThan(200);
        await expect(page.locator(".tags-meta")).toContainText("个标签");
        const href = await page.locator(".tag-cloud__item a").first().getAttribute("href");
        expect(href?.startsWith("/tags/")).toBe(true);
    });

    test("/tags/<tag>/ 无 JS：文章卡片可点", async ({ page }) => {
        await page.goto("/tags/DOCKER/", { waitUntil: "load" });
        const cards = page.locator(".tag-detail__posts .post-card");
        expect(await cards.count()).toBeGreaterThan(0);
        const links = await page
            .locator(".tag-detail__posts .post-card-link")
            .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href") ?? ""));
        expect(links.every((href) => href.startsWith("/article/"))).toBe(true);
    });
});

/* ───────────────────────── 7. reduced-motion ───────────────────────── */

test.describe("prefers-reduced-motion", () => {
    test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

    test("0 动画（标签首页 + 单标签页）", async ({ page }) => {
        for (const url of ["/tags/", "/tags/DOCKER/"] as const) {
            await page.goto(url, { waitUntil: "load" });
            await page.evaluate(async () => {
                await document.fonts.ready;
            });
            await page.waitForTimeout(800);
            const running = await page.evaluate(() =>
                document
                    .getAnimations()
                    .filter((animation) => animation.playState === "running")
                    .map((animation) => animation.constructor.name),
            );
            expect(running, `${url}: reduced-motion 下不能有运行中的动画`).toEqual([]);
        }
    });
});
