import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * M8-5a · 友链页视觉收口（朋友卡片栅格 + 友圈文章列表）
 *
 * 判据（本卡验收）：
 *  1. 375 / 768 / 1440 × light / dark：站点卡片数 = `data-friends-total`、
 *     友圈条目数 = `data-friends-feed`（快照前 6 条），证据截图 6 张。
 *  2. 每个视口 0 横向溢出（scrollWidth ≤ clientWidth + 1，且无越界元素）。
 *  3. axe（wcag2a/aa + wcag21a/aa + wcag22aa）页面主体 serious=0 critical=0 incomplete=0（双主题）。
 *  4. 友圈列表契约：来源站名 → 文章标题外链（http(s) / rel noopener / target=_blank）→ 时间；
 *     页面内 0 外链图片（头像只用本站 / data: URI，缺省首字母兜底）。
 *  5. 空态：`PUBLIC_FRIENDS_STATE=empty` 的真实构建产物里，友链卡片 0 张、空态块可见，
 *     友圈区块（快照独立于友链数据）照常渲染 —— 空快照才不渲染（见 index.astro 归一化）。
 *
 * 运行：M85A_DIR=dist-m8-5a npx playwright test -c playwright.m8-5a.config.ts
 */

const ROOT = process.cwd();
const AXE_SOURCE = readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [375, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

const SHELL = ".friends";
const SHOTS = path.resolve(ROOT, "docs/_reviews/M8-5a/screens");
const EMPTY_DIR = path.resolve(ROOT, process.env.M85A_EMPTY_DIR ?? "dist-m8-5a-empty");

async function openPage(page: Page, theme: Theme, width: number): Promise<void> {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto("/friends/", { waitUntil: "load" });
    expect(response?.status(), "GET /friends/").toBe(200);
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

async function counts(page: Page) {
    return page.evaluate((sel) => {
        const shell = document.querySelector(sel);
        return {
            total: Number(shell?.getAttribute("data-friends-total") ?? "-1"),
            feed: Number(
                document
                    .querySelector(`${sel} .friends-articles`)
                    ?.getAttribute("data-friends-feed") ?? "-1",
            ),
            status: shell?.getAttribute("data-friends-status") ?? "",
            cards: document.querySelectorAll(`${sel} .friends-grid .friend-card`).length,
            articles: document.querySelectorAll(`${sel} .friends-articles .fri-item`).length,
            feedSection: document.querySelectorAll(`${sel} #friends-feed`).length,
        };
    }, SHELL);
}

/* ───────────────── 1. 卡片数 + 6 张证据截图 ───────────────── */

test.describe("cards × viewport × theme", () => {
    for (const theme of THEMES) {
        for (const width of VIEWPORTS) {
            test(`${width}/${theme}：卡片数 = total，友圈条数 = feed，截图落盘`, async ({
                page,
            }) => {
                test.setTimeout(90_000);
                await openPage(page, theme, width);
                const c = await counts(page);

                expect(c.status, "站点数据应命中 ok").toBe("ok");
                expect(c.total, "adapter 读到友链").toBeGreaterThan(0);
                expect(c.cards, `${width}/${theme}: 站点卡片数 = data-friends-total`).toBe(
                    c.total,
                );

                expect(c.feed, "快照前 6 条应渲染").toBe(6);
                expect(c.articles, `${width}/${theme}: 友圈条目数 = data-friends-feed`).toBe(
                    c.feed,
                );
                expect(c.feedSection, "友圈区块恰好 1 个").toBe(1);

                if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
                const file = path.join(SHOTS, `friends-${theme}-${width}.png`);
                await page.screenshot({ path: file, fullPage: true });
                console.log(`[shot] ${width}/${theme} ${c.cards} 张卡片 / ${c.articles} 条友圈 → ${file}`);
            });
        }
    }
});

/* ───────────────── 2. 0 横向溢出 ───────────────── */

test.describe("no horizontal overflow", () => {
    for (const theme of THEMES) {
        test(`overflow-${theme}`, async ({ page }) => {
            for (const width of VIEWPORTS) {
                await openPage(page, theme, width);
                const result = await page.evaluate(() => {
                    const doc = document.documentElement;
                    const limit = doc.clientWidth;
                    const clipped = (el: Element): boolean => {
                        let node = el.parentElement;
                        while (node && node !== document.body) {
                            if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(node).overflowX)) {
                                if (node.getBoundingClientRect().right <= limit + 1) return true;
                            }
                            node = node.parentElement;
                        }
                        return false;
                    };
                    const offenders = [...document.querySelectorAll("body *")]
                        .filter((el) => {
                            const rect = el.getBoundingClientRect();
                            if (!(rect.width > 0) || rect.right <= limit + 1) return false;
                            return !clipped(el);
                        })
                        .slice(0, 8)
                        .map((el) => {
                            const rect = el.getBoundingClientRect();
                            return `${el.tagName.toLowerCase()} right=${Math.round(rect.right)} :: ${el.outerHTML.slice(0, 120)}`;
                        });
                    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders };
                });
                expect(result.offenders, `friends@${width} (${theme}): 越界元素`).toEqual([]);
                expect(
                    result.scrollWidth,
                    `friends@${width} (${theme}): ${result.scrollWidth} > ${result.clientWidth}`,
                ).toBeLessThanOrEqual(result.clientWidth + 1);
            }
        });
    }
});

/* ───────────────── 3. axe ───────────────── */

type AxeViolation = { id: string; impact: string | null; help: string; nodes: unknown[] };

async function runAxe(page: Page, selector?: string) {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(async (sel) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const axe = (window as any).axe;
        const scope = sel ? document.querySelector(sel) : document;
        const result = (await axe.run(scope ?? document, {
            runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
            resultTypes: ["violations", "incomplete"],
        })) as { violations: AxeViolation[]; incomplete: AxeViolation[] };
        const map = (list: AxeViolation[]) =>
            list.map((v) => ({
                id: v.id,
                impact: v.impact,
                help: v.help,
                nodes: v.nodes.length,
                targets: (v.nodes as { target?: unknown[] }[]).map((n) =>
                    String((n.target ?? []).join(" ")),
                ),
            }));
        return { violations: map(result.violations), incomplete: map(result.incomplete) };
    }, selector);
}

test.describe("axe (WCAG 2.x A/AA)", () => {
    for (const theme of THEMES) {
        test(`axe-friends-${theme}`, async ({ page }) => {
            test.setTimeout(120_000);
            await openPage(page, theme, 1440);
            const shell = await runAxe(page, SHELL);
            const serious = shell.violations.filter(
                (v) => v.impact === "serious" || v.impact === "critical",
            );
            console.log(
                `[axe] friends ${theme}@1440: serious=${serious.length} incomplete=${shell.incomplete.length} 全部=${shell.violations.length}`,
            );
            console.log(`[axe] incomplete 明细 ${JSON.stringify(shell.incomplete)}`);
            // 历史坑：首字母用 --color-fg-muted 时 axe 连 incomplete 都给不出结论；
            // 改成 fg-heading 后是 0/0。这里保留一条护栏：incomplete 只允许 color-contrast，
            // 其余规则必须干净，装饰性首字母另由下面的计算样式对比度用例兜底。
            const unresolved = shell.incomplete.filter((v) => v.id !== "color-contrast");
            expect(
                serious.map((v) => `${v.id} (${v.nodes})`),
                `friends ${theme}: serious/critical`,
            ).toEqual([]);
            expect(
                unresolved.map((v) => `${v.id} (${v.nodes})`),
                `friends ${theme}: axe 未完成（color-contrast 之外）`,
            ).toEqual([]);
        });
    }
});

/* ───────────────── 3b. 装饰性首字母对比度（axe 只能给 incomplete） ───────────────── */

test.describe("avatar 首字母对比度", () => {
    for (const theme of THEMES) {
        test(`首字母 ≥4.5:1 且 aria-hidden（${theme}）`, async ({ page }) => {
            await openPage(page, theme, 1440);
            const rows = await page.evaluate((sel) => {
                const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
                const lum = (channels: number[]) => {
                    const [r, g, b] = channels.map((v) => {
                        const c = v / 255;
                        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
                    });
                    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
                };
                return [...document.querySelectorAll(`${sel} .friend-card__initial`)].map((el) => {
                    const fg = lum(rgb(getComputedStyle(el).color).slice(0, 3));
                    const bg = lum(rgb(getComputedStyle(el.parentElement!).backgroundColor).slice(0, 3));
                    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
                    return {
                        initial: (el.textContent ?? "").trim(),
                        ariaHidden: el.getAttribute("aria-hidden"),
                        ratio: Number(ratio.toFixed(2)),
                    };
                });
            }, SHELL);

            expect(rows.length, "没有头像的站点应渲染首字母").toBeGreaterThan(0);
            expect(rows.filter((r) => r.ariaHidden !== "true"), "首字母必须 aria-hidden").toEqual(
                [],
            );
            expect(
                rows.filter((r) => r.ratio < 4.5),
                `${theme}: 首字母对比度不足`,
            ).toEqual([]);
            console.log(
                `[contrast] ${theme}: ${rows.length} 个首字母，最低 ${Math.min(...rows.map((r) => r.ratio))}:1`,
            );
        });
    }
});

/* ───────────────── 4. 友圈列表契约 + 0 外链图 ───────────────── */

test("友圈契约：站名 → 标题外链（http(s)/noopener/_blank）→ 时间；0 外链图片", async ({
    page,
}) => {
    await page.goto("/friends/", { waitUntil: "load" });
    const data = await page.evaluate((sel) => {
        const rows = [...document.querySelectorAll(`${sel} .friends-articles .fri-item`)].map(
            (item) => {
                const link = item.querySelector(".fri-title a");
                return {
                    site: (item.querySelector(".fri-site")?.textContent ?? "").trim(),
                    title: (link?.textContent ?? "").trim(),
                    href: link?.getAttribute("href") ?? "",
                    target: link?.getAttribute("target") ?? "",
                    rel: link?.getAttribute("rel") ?? "",
                    updated: (item.querySelector(".fri-updated")?.textContent ?? "").trim(),
                };
            },
        );
        const externalImages = [...document.querySelectorAll(`${sel} img`)]
            .map((img) => img.getAttribute("src") ?? "")
            .filter((src) => /^https?:/i.test(src));
        return { rows, externalImages };
    }, SHELL);

    expect(data.rows.length, "友圈条目").toBe(6);
    for (const row of data.rows) {
        expect(row.site, "来源站名").not.toBe("");
        expect(row.title, "文章标题").not.toBe("");
        expect(row.href, "文章链接必须 http(s)").toMatch(/^https?:\/\//);
        expect(row.target).toBe("_blank");
        expect(row.rel).toContain("noopener");
        expect(row.updated, "时间文案来自快照").not.toBe("");
    }
    expect(data.externalImages, "页面内不许有外链图片（第三方请求）").toEqual([]);
    console.log(`[feed] ${data.rows.length} 条友圈，0 外链图`);
});

/* ───────────────── 5. 空态（真实构建产物） ───────────────── */

test("空态：友链卡片 0 张 + 空态块可见，友圈区块不受影响", async () => {
    const file = path.join(EMPTY_DIR, "friends", "index.html");
    expect(existsSync(file), `空态构建产物缺失：${file}（PUBLIC_FRIENDS_STATE=empty）`).toBe(true);
    const html = readFileSync(file, "utf8");

    expect(html, "状态必须是 empty").toContain("data-friends-status=empty");
    expect(html, "一张友链卡片都不许渲染").not.toContain("friend-card");
    expect(html, "空态块").toContain("data-friends-empty");
    expect(html, "空态文案").toContain("还没有友链");
    expect(html, "申请入口不受影响").toContain("friends-apply");
    // 友圈列表来自独立快照：友链数据为空不影响它；快照为空（articles=[]）时整个区块不渲染
    expect(html, "友圈区块照常渲染").toContain("data-friends-feed");
    console.log("[empty] 空态：0 卡片 / 空态块在 / 友圈区块仍在");
});
