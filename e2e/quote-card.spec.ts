import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * M7-3d-1 · 金句卡 Canvas 渲染器 + 内部演示页
 *
 * 这一刀不接文章选中，所以判据全部落在演示页 `/design/components/quote-card/` 上：
 *   1. 生成态：canvas 固有 1080×1440、CSS 比例 3:4、metrics 说没截断也没越界；
 *      引文逐行落回原文（`lines.join("")` === 归一化后的 quote）——「不裁字」的机器判据；
 *   2. 引文区右边缘不许有墨迹：这条专治「ctx.font 被上一个块的 132px 引号覆盖」那类
 *      量得对、画得错的 bug（实测过：measureText 840px，fillText 却冲到画布外）；
 *   3. 下载：`<a download>` 的 href 是 blob:，文件名含 `quote`，点下去真的能拿到 PNG
 *      （字节以 \x89PNG 开头，不是空 blob）；
 *   4. 0 第三方请求、0 控制台报错、0 canvas 污染（getImageData 不抛 SecurityError）；
 *   5. 390/1440 无横向溢出；axe serious/critical = 0（light/dark）。
 *
 * 截图（docs/_reviews/M7-3d-1/screens）默认跳过，`QUOTE_CARD_SHOTS=1` 才落盘。
 */

const PAGE_PATH = "/design/components/quote-card/";
const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const CARD_W = 1080;
const CARD_H = 1440;
/** 版心右边界（见 quote-card.ts：1080 − 88），右侧 8px 容差留给装饰点/抗锯齿。 */
const CONTENT_RIGHT = 992;

async function setTheme(page: Page, theme: Theme): Promise<void> {
    await page.evaluate(
        (value) => document.documentElement.setAttribute("data-theme", value),
        theme,
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function settle(page: Page): Promise<void> {
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
    });
}

interface Metrics {
    width: number;
    height: number;
    theme: Theme;
    quote: {
        fontSize: number;
        lines: string[];
        lineWidths: number[];
        maxLineWidth: number;
        top: number;
        bottom: number;
    };
    title: { lines: string[]; maxLineWidth: number };
    truncated: boolean;
    overflow: boolean;
}

function normalize(text: string): string {
    return text.replace(/\s+/gu, "");
}

/** 等生成态，返回 canvas 上的 metrics；顺带把状态行文案带回来。 */
async function generate(page: Page, options: { regenerate?: boolean } = {}): Promise<Metrics> {
    const root = page.locator("[data-quote-card-root]");
    const canvas = page.locator("[data-quote-card]");
    await expect(root).toHaveAttribute("data-quote-state", "ready", { timeout: 20000 });

    if (options.regenerate) {
        /* 主题切换后必须重画：页面进站时已经画过一张（light），不重画就量的是旧的。
           `data-quote-render` 是渲染序号，等到它变了才算这一版画完。 */
        const before = await canvas.getAttribute("data-quote-render");
        await page.locator("[data-quote-generate]").click();
        await expect
            .poll(() => canvas.getAttribute("data-quote-render"), { timeout: 20000 })
            .not.toBe(before);
        await expect(root).toHaveAttribute("data-quote-state", "ready", { timeout: 20000 });
    }

    const raw = await canvas.getAttribute("data-quote-metrics");
    expect(raw, "canvas 必须挂 data-quote-metrics").toBeTruthy();
    return JSON.parse(raw as string) as Metrics;
}

async function axe(page: Page) {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(
        async ([tags]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (window as any).axe.run(document, {
                runOnly: { type: "tag", values: tags },
            });
            const serious = result.violations.filter(
                (v: { impact?: string }) => v.impact === "serious" || v.impact === "critical",
            );
            return {
                serious: serious.length,
                total: result.violations.length,
                detail: result.violations.map(
                    (v: { id: string; impact?: string; nodes: unknown[] }) => ({
                        id: v.id,
                        impact: v.impact,
                        nodes: v.nodes.length,
                    }),
                ),
            };
        },
        [TAGS],
    );
}

/* ───────────── 1. 1440 生成态：尺寸 / 不裁字 / 不越界 ───────────── */

for (const theme of THEMES) {
    test(`${theme}：1440 生成态 → 1080×1440、3:4、不裁字、引文不出右边界`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(PAGE_PATH, { waitUntil: "load" });
        await setTheme(page, theme);
        await settle(page);
        // 主题切换后必须重画这一版（页面进站时已经画过 light 的一张）
        const metrics = await generate(page, { regenerate: true });

        /* 画布固有尺寸 + 页面上的显示比例 */
        const box = await page.evaluate(() => {
            const canvas = document.querySelector<HTMLCanvasElement>("[data-quote-card]")!;
            const rect = canvas.getBoundingClientRect();
            return {
                intrinsic: [canvas.width, canvas.height],
                css: [Math.round(rect.width), Math.round(rect.height)],
                pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            };
        });
        expect(box.intrinsic, "canvas 固有尺寸必须是 1080×1440").toEqual([CARD_W, CARD_H]);
        expect(metrics.width).toBe(CARD_W);
        expect(metrics.height).toBe(CARD_H);
        expect(box.css[0] / box.css[1], "显示比例必须是 3:4").toBeCloseTo(0.75, 2);
        expect(box.pageOverflow, "1440 不允许横向滚动").toBe(false);
        expect(metrics.theme).toBe(theme);

        /* 不裁字：每一行都是原文的一部分，拼起来 = 原文；没有被 scale 缩到下限以下 */
        expect(metrics.truncated, "fixture 文案不该被截断").toBe(false);
        expect(metrics.overflow, "没有任何块越出安全区").toBe(false);
        expect(normalize(metrics.quote.lines.join(""))).toBe(
            normalize(
                (await page.locator("[data-quote-card-root]").getAttribute("data-quote")) ?? "",
            ),
        );
        expect(metrics.quote.fontSize).toBeGreaterThanOrEqual(36);
        expect(metrics.quote.lines.length).toBeGreaterThanOrEqual(2);

        /* 不越界：每行实测宽度 ≤ 版心宽 */
        expect(metrics.quote.maxLineWidth).toBeLessThanOrEqual(CONTENT_RIGHT - 108);
        for (const width of metrics.quote.lineWidths) {
            expect(width).toBeLessThanOrEqual(CONTENT_RIGHT - 108);
        }
        expect(metrics.title.maxLineWidth).toBeLessThanOrEqual(CONTENT_RIGHT - 108);

        /* 「量得对、画得错」的回归闸门：引文区右边缘不许有墨迹 */
        const ink = await page.evaluate(
            ([right, top, bottom]) => {
                const canvas = document.querySelector<HTMLCanvasElement>("[data-quote-card]")!;
                const ctx = canvas.getContext("2d")!;
                const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
                // 参考底色取自引文区右侧的空白处（light 是纸色、dark 是墨色，都跟着主题走），
                // 不能写死纸色 —— 否则 dark 主题下整张画布都会被判成「墨迹」。
                const refY = Math.min(height - 1, bottom + 260);
                const ref = (() => {
                    const i = (refY * width + (width - 20)) * 4;
                    return [data[i], data[i + 1], data[i + 2]];
                })();
                let hits = 0;
                let maxX = 0;
                for (let y = top; y <= bottom; y++) {
                    for (let x = right; x < width; x++) {
                        const i = (y * width + x) * 4;
                        const diff =
                            Math.abs(data[i] - ref[0]) +
                            Math.abs(data[i + 1] - ref[1]) +
                            Math.abs(data[i + 2] - ref[2]);
                        if (diff > 60) {
                            hits += 1;
                            if (x > maxX) maxX = x;
                        }
                    }
                }
                return { hits, maxX, ref, canvasWidth: width };
            },
            [CONTENT_RIGHT + 8, 340, 900],
        );
        expect(ink.hits, `引文区在 x>${CONTENT_RIGHT + 8} 处仍有墨迹（最远 x=${ink.maxX}）`).toBe(
            0,
        );

        /* 标题/引文/作者都在 */
        await expect(page.locator("dl.fixture dd").first()).not.toHaveText("");
        await expect(page.locator("[data-quote-status]")).toContainText("1080 × 1440");
        expect(metrics.title.lines.join("")).toContain("把博客当成一个产品来做");
    });
}

/* ───────────── 2. 下载：blob + 真 PNG 字节 ───────────── */

test("下载：href 是 blob、文件名含 quote、点下去拿到的是真 PNG", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(PAGE_PATH, { waitUntil: "load" });
    await settle(page);
    await generate(page);

    const link = page.locator("[data-quote-download]");
    const href = await link.getAttribute("href");
    expect(href?.startsWith("blob:"), `下载链接必须指向 blob（实际 ${href}）`).toBe(true);
    const filename = await link.getAttribute("download");
    expect(filename, "download 属性必须带文件名").toContain("quote");
    expect(filename).toMatch(/\.png$/);
    await expect(link).not.toHaveAttribute("aria-disabled", "true");

    /* 真点一次：Playwright 必须收到 download 事件，且落盘字节以 PNG magic 开头 */
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    expect(download.suggestedFilename()).toContain("quote");
    const file = await download.path();
    expect(file).toBeTruthy();
    const bytes = readFileSync(file as string);
    expect(bytes.subarray(0, 8).toString("hex"), "PNG magic").toBe("89504e470d0a1a0a");
    expect(bytes.length).toBeGreaterThan(20_000);

    /* 再点一次「重新生成」：canvas 仍能画、blob 换新，不报错 */
    await generate(page, { regenerate: true });
    expect(await link.getAttribute("href")).not.toBe(href);
});

/* ───────────── 3. 0 第三方请求 / 0 控制台报错 / 无 canvas 污染 ───────────── */

test("0 外部请求、0 控制台报错、canvas 未被污染", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const requests: string[] = [];
    const failures: string[] = [];
    const errors: string[] = [];
    page.on("request", (req) => requests.push(req.url()));
    page.on("requestfailed", (req) => failures.push(`${req.url()} · ${req.failure()?.errorText}`));
    page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    await page.goto(PAGE_PATH, { waitUntil: "load" });
    await settle(page);
    await generate(page);
    await generate(page, { regenerate: true });
    await settle(page);

    const foreign = requests.filter(
        (url) => !/^(http:\/\/127\.0\.0\.1|http:\/\/localhost|blob:|data:)/.test(url),
    );
    expect(foreign, "演示页不许有任何跨域请求").toEqual([]);
    expect(errors, "控制台不允许有 error（含 canvas 污染）").toEqual([]);
    expect(failures, "不允许有失败请求").toEqual([]);

    /* 污染会让 getImageData 抛 SecurityError —— 能读回像素就是没污染 */
    const readable = await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>("[data-quote-card]")!;
        try {
            const { data } = canvas.getContext("2d")!.getImageData(0, 0, 4, 4);
            return { ok: true, first: data[0] };
        } catch (error) {
            return { ok: false, message: String(error) };
        }
    });
    expect(
        readable.ok,
        `canvas 被污染：${readable && "message" in readable ? readable.message : ""}`,
    ).toBe(true);
});

/* ───────────── 4. 390：无横向溢出 ───────────── */

test("390：卡片不溢出、页面不横向滚动、仍能生成与下载", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PAGE_PATH, { waitUntil: "load" });
    await settle(page);
    const metrics = await generate(page, { regenerate: true });

    const mobile = await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>("[data-quote-card]")!;
        const rect = canvas.getBoundingClientRect();
        return {
            canvas: [Math.round(rect.left), Math.round(rect.width), Math.round(rect.height)],
            ratio: Number((rect.width / rect.height).toFixed(3)),
            pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            scrollWidth: document.documentElement.scrollWidth,
        };
    });
    expect(mobile.pageOverflow, `390 页面横向溢出（scrollWidth=${mobile.scrollWidth}）`).toBe(
        false,
    );
    expect(mobile.ratio).toBeCloseTo(0.75, 2);
    expect(mobile.canvas[0]).toBeGreaterThanOrEqual(0);
    expect(mobile.canvas[0] + mobile.canvas[1]).toBeLessThanOrEqual(390 + 1);
    expect(metrics.truncated).toBe(false);

    const link = page.locator("[data-quote-download]");
    expect(await link.getAttribute("href")).toMatch(/^blob:/);
});

/* ───────────── 5. axe：serious/critical 0 ───────────── */

for (const theme of THEMES) {
    test(`axe @${theme}：serious/critical = 0`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(PAGE_PATH, { waitUntil: "load" });
        await setTheme(page, theme);
        await settle(page);
        await generate(page, { regenerate: true });

        const result = await axe(page);
        console.log(`[axe] quote-card @${theme} ${JSON.stringify(result)}`);
        expect(result.serious, `axe serious/critical: ${JSON.stringify(result.detail)}`).toBe(0);
    });
}

/* ───────────── 6. 证据截图（QUOTE_CARD_SHOTS=1 才跑） ───────────── */

const SHOT_DIR = path.resolve(process.cwd(), "docs/_reviews/M7-3d-1/screens");

test.describe("金句卡证据截图", () => {
    test.skip(process.env.QUOTE_CARD_SHOTS !== "1", "set QUOTE_CARD_SHOTS=1 to capture");

    for (const theme of THEMES) {
        for (const viewport of [
            { width: 1440, height: 1000, tag: "1440" },
            { width: 390, height: 844, tag: "390" },
        ]) {
            test(`${theme}：${viewport.tag} 生成态 + 卡片原图`, async ({ page }) => {
                if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                await page.goto(PAGE_PATH, { waitUntil: "load" });
                await setTheme(page, theme);
                await settle(page);
                await generate(page, { regenerate: true });
                await page.waitForTimeout(200);
                await page.screenshot({
                    path: path.join(SHOT_DIR, `page-${theme}-${viewport.tag}.png`),
                    fullPage: viewport.tag === "390",
                });

                /* 卡片本体按 1080×1440 原尺寸落盘，评审不必从缩略图里猜 */
                const dataUrl = await page.evaluate(() =>
                    document
                        .querySelector<HTMLCanvasElement>("[data-quote-card]")!
                        .toDataURL("image/png"),
                );
                const base64 = dataUrl.split(",")[1] ?? "";
                const { writeFileSync } = await import("node:fs");
                writeFileSync(
                    path.join(SHOT_DIR, `card-${theme}-1080x1440.png`),
                    Buffer.from(base64, "base64"),
                );
            });
        }
    }
});
