import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * M7-3d-2 · 文章选中文字 → 金句卡弹层
 *
 * 判据分五组：
 *   1. 选中态：正文里选一段 → 工具条出现在选区附近且不越出视口；
 *      导航 / 标题 / 分享条里的选区、空选区一律不出工具条；
 *   2. 打开态：点「做成金句卡」→ `[data-overlay="quote"]` 打开、canvas 固有 1080×1440、
 *      CSS 比例 3:4、下载链接是 blob 且点下去拿到真 PNG；
 *   3. 关闭态：Esc / 遮罩 / 关闭键三条路径 → overlay 清空、焦点回正文、selection 清空；
 *   4. 懒加载：选中前 0 个 quote-* 请求；打开前不请求 quote-card；0 个第三方请求；
 *   5. axe：工具条态与弹层打开态 serious/critical = 0（light/dark）。
 *
 * 截图（docs/_reviews/M7-3d-2/screens）默认跳过，`QUOTE_SELECTION_SHOTS=1` 才落盘。
 */

const ARTICLE = "/article/blog-as-a-product/";
const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const TOOLBAR = "[data-quote-toolbar]";
const TRIGGER = '[data-quote-action="create"]';
const DIALOG = "[data-quote-dialog]";
const CANVAS = "[data-quote-canvas]";
const DOWNLOAD = "[data-quote-download]";

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
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    });
}

/** 在正文第一段里选中 30 个字（程序化选区同样会触发 selectionchange）。 */
async function selectBodyText(page: Page): Promise<string> {
    await page.locator("#post-content .article-content").scrollIntoViewIfNeeded();
    await page.waitForTimeout(120); // 让 scroll 监听把上一次的工具条收掉
    const text = await page.evaluate(() => {
        const host = document.querySelector("#post-content .article-content");
        if (!host) throw new Error("找不到正文容器");
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        let node: Text | null = null;
        while (walker.nextNode()) {
            const candidate = walker.currentNode as Text;
            if (candidate.data.trim().length >= 40) {
                node = candidate;
                break;
            }
        }
        if (!node) throw new Error("正文里找不到够长的文本节点");
        const start = node.data.search(/\S/u);
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, Math.min(start + 30, node.data.length));
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        return selection.toString();
    });
    expect(text.trim().length).toBeGreaterThan(8);
    await expect(page.locator(TOOLBAR)).toBeVisible();
    return text;
}

/** 选中任意元素里的文字（用于判「非正文不出工具条」）。 */
async function selectIn(page: Page, selector: string): Promise<void> {
    await page.evaluate((sel) => {
        const host = document.querySelector(sel);
        if (!host) throw new Error(`找不到 ${sel}`);
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        let node: Text | null = null;
        while (walker.nextNode()) {
            const candidate = walker.currentNode as Text;
            if (candidate.data.trim().length >= 2) {
                node = candidate;
                break;
            }
        }
        if (!node) throw new Error(`${sel} 里没有文本`);
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(node, Math.min(2, node.data.length));
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
    }, selector);
    await page.waitForTimeout(150);
}

async function openCard(page: Page): Promise<void> {
    await selectBodyText(page);
    await page.locator(TRIGGER).click();
    const dialog = page.locator(DIALOG);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-overlay", "quote");
    await expect(dialog).toHaveAttribute("data-quote-state", "ready", { timeout: 20000 });
}

async function axeIn(page: Page, selector: string) {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(
        async ([sel, tags]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (window as any).axe.run(sel, {
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
        [selector, TAGS],
    );
}

/* ───────────── 1. 选中态：工具条贴着选区，且不越界 ───────────── */

for (const viewport of [
    { width: 1440, height: 900, tag: "1440" },
    { width: 390, height: 844, tag: "390" },
]) {
    test(`${viewport.tag}：选中正文 → 工具条落在选区附近且不越出视口`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(ARTICLE, { waitUntil: "load" });
        await settle(page);
        await expect(page.locator(TOOLBAR)).toBeHidden();

        await selectBodyText(page);

        const geo = await page.evaluate(() => {
            const toolbar = document.querySelector("[data-quote-toolbar]")!.getBoundingClientRect();
            const range = window.getSelection()!.getRangeAt(0);
            const selection = range.getBoundingClientRect();
            const last = range.getClientRects()[range.getClientRects().length - 1];
            return {
                toolbar: {
                    x: toolbar.x,
                    y: toolbar.y,
                    w: toolbar.width,
                    h: toolbar.height,
                    bottom: toolbar.bottom,
                    right: toolbar.right,
                },
                selection: { x: selection.x, y: selection.y, w: selection.width, h: selection.height },
                lastLine: { x: last.x, w: last.width, right: last.right, bottom: last.bottom },
                viewport: { w: window.innerWidth, h: window.innerHeight },
            };
        });

        /* 不越出视口 */
        expect(geo.toolbar.x).toBeGreaterThanOrEqual(0);
        expect(geo.toolbar.y).toBeGreaterThanOrEqual(0);
        expect(geo.toolbar.right).toBeLessThanOrEqual(geo.viewport.w + 1);
        expect(geo.toolbar.bottom).toBeLessThanOrEqual(geo.viewport.h + 1);

        /* 贴着选区：垂直距离 < 120px，水平与最后一行的右缘相接 */
        const vertical = Math.min(
            Math.abs(geo.toolbar.y - geo.lastLine.bottom),
            Math.abs(geo.toolbar.bottom - geo.selection.y),
        );
        expect(vertical, `工具条离选区 ${vertical}px`).toBeLessThan(120);
        expect(geo.toolbar.right).toBeGreaterThan(geo.selection.x + 1);
        expect(geo.toolbar.x).toBeLessThan(geo.selection.x + geo.selection.w);

        /* 工具条只有一条：不许在页面别处长出第二个 */
        await expect(page.locator(TOOLBAR)).toHaveCount(1);
    });
}

/* ───────────── 2. 打开态 → 1080×1440 + 下载 PNG ───────────── */

test("点亮工具条 → 弹层打开、canvas 1080×1440、下载是真 PNG", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ARTICLE, { waitUntil: "load" });
    await settle(page);
    await openCard(page);

    const box = await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>("[data-quote-canvas]")!;
        const rect = canvas.getBoundingClientRect();
        const dialog = document.querySelector("[data-quote-dialog]")!;
        return {
            intrinsic: [canvas.width, canvas.height],
            css: [rect.width, rect.height],
            ratio: Number((rect.width / rect.height).toFixed(3)),
            role: dialog.getAttribute("role"),
            modal: dialog.getAttribute("aria-modal"),
            labelled: dialog.getAttribute("aria-labelledby"),
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
    });
    expect(box.intrinsic).toEqual([1080, 1440]);
    expect(box.ratio).toBeCloseTo(0.75, 2);
    expect(box.role).toBe("dialog");
    expect(box.modal).toBe("true");
    expect(box.labelled).toBe("quote-dialog-title");
    expect(box.overflow, "打开弹层不允许横向滚动").toBe(false);

    /* 引文来自用户选中的那段正文，不是文章标题 */
    const label = await page.locator(CANVAS).getAttribute("aria-label");
    expect(label).toContain("1080×1440");
    await expect(page.locator("[data-quote-status]")).toContainText("1080 × 1440");

    /* 下载：blob + 文件名 + 真 PNG 字节 */
    const link = page.locator(DOWNLOAD);
    const href = await link.getAttribute("href");
    expect(href?.startsWith("blob:"), `下载链接必须指向 blob（实际 ${href}）`).toBe(true);
    expect(await link.getAttribute("download")).toMatch(/quote.*\.png$/);

    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    const file = await download.path();
    expect(file).toBeTruthy();
    const bytes = readFileSync(file as string);
    expect(bytes.subarray(0, 8).toString("hex"), "PNG magic").toBe("89504e470d0a1a0a");
    expect(bytes.length).toBeGreaterThan(20_000);
    expect(download.suggestedFilename()).toContain("quote");
});

/* ───────────── 3. 三条关闭路径 ───────────── */

for (const how of ["esc", "scrim", "button"] as const) {
    test(`关闭（${how}）：overlay 清空、焦点回正文、selection 清空`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(ARTICLE, { waitUntil: "load" });
        await settle(page);
        await openCard(page);

        if (how === "esc") {
            await page.keyboard.press("Escape");
        } else if (how === "scrim") {
            await page.locator(".ovl__scrim").click({ position: { x: 6, y: 6 } });
        } else {
            await page.locator(`${DIALOG} [data-quote-action="close"]`).first().click();
        }

        await expect(page.locator(DIALOG)).toBeHidden();
        await expect(page.locator('[data-overlay="quote"]')).toHaveCount(0);
        await expect(page.locator(TOOLBAR)).toBeHidden();

        const after = await page.evaluate(() => {
            const active = document.activeElement as HTMLElement | null;
            return {
                selection: window.getSelection()?.toString() ?? "",
                tag: active?.tagName ?? "",
                inBody: Boolean(active?.closest("#post-content .article-content")),
                htmlOverflow: document.documentElement.style.overflow,
            };
        });
        expect(after.selection, "关闭后选区必须清空").toBe("");
        expect(after.inBody, "焦点要回到选区所在的正文段落").toBe(true);
        expect(after.htmlOverflow, "遮罩锁滚要释放").toBe("");
    });
}

/* ───────────── 4. 非正文选区 / 空选区 → 不出工具条 ───────────── */

test("标题 / 分享条里的选区、空选区 → 不出现工具条", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ARTICLE, { waitUntil: "load" });
    await settle(page);

    await selectIn(page, ".post-title-text");
    await expect(page.locator(TOOLBAR)).toBeHidden();

    await selectIn(page, "[data-post-share] .share-label");
    await expect(page.locator(TOOLBAR)).toBeHidden();

    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.waitForTimeout(150);
    await expect(page.locator(TOOLBAR)).toBeHidden();

    /* 再回到正文：工具条还能正常出现，说明不是被永久关死 */
    await selectBodyText(page);
});

/* ───────────── 5. 懒加载 + 0 第三方请求 ───────────── */

test("懒加载：选中前 0 请求、打开前不拉 quote-card、0 第三方资源", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const requests: string[] = [];
    const errors: string[] = [];
    page.on("request", (req) => requests.push(req.url()));
    page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    await page.goto(ARTICLE, { waitUntil: "load" });
    await settle(page);

    const foreignOf = (urls: string[]) =>
        urls.filter((url) => !/^(http:\/\/127\.0\.0\.1|http:\/\/localhost|blob:|data:)/u.test(url));
    /** 文章页本来就有 umami / waline / gtag；金句卡只许多出同源 chunk，不许多出任何域 */
    const baseline = new Set(foreignOf(requests));

    const quoteRequests = () => requests.filter((url) => /quote-(selection|card)[.-]/u.test(url));
    expect(quoteRequests(), "没选过字之前不许请求金句卡相关脚本").toEqual([]);
    await expect(page.locator("[data-overlay]")).toHaveCount(0);

    await selectBodyText(page);
    expect(
        quoteRequests().some((url) => /quote-selection[.-]/u.test(url)),
        "选中后才拉交互模块",
    ).toBe(true);
    expect(
        quoteRequests().some((url) => /quote-card[.-]/u.test(url)),
        "打开弹层之前不许拉渲染器",
    ).toBe(false);

    await page.locator(TRIGGER).click();
    await expect(page.locator(DIALOG)).toHaveAttribute("data-quote-state", "ready", {
        timeout: 20000,
    });
    expect(
        quoteRequests().some((url) => /quote-card[.-]/u.test(url)),
        "打开弹层后才拉渲染器",
    ).toBe(true);

    const added = foreignOf(requests).filter((url) => !baseline.has(url));
    expect(added, "金句卡不许带来任何新的第三方请求").toEqual([]);
    expect(errors, "控制台不允许有 error").toEqual([]);
});

/* ───────────── 6. axe：工具条态 + 打开态 ───────────── */

for (const theme of THEMES) {
    test(`axe @${theme}：工具条态 / 弹层打开态 serious-critical = 0`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(ARTICLE, { waitUntil: "load" });
        await setTheme(page, theme);
        await settle(page);

        await selectBodyText(page);
        const toolbar = await axeIn(page, "[data-quote-selection]");
        console.log(`[axe] quote-selection toolbar @${theme} ${JSON.stringify(toolbar)}`);
        expect(toolbar.serious, `工具条 axe: ${JSON.stringify(toolbar.detail)}`).toBe(0);

        await page.locator(TRIGGER).click();
        await expect(page.locator(DIALOG)).toHaveAttribute("data-quote-state", "ready", {
            timeout: 20000,
        });
        const open = await axeIn(page, "[data-quote-dialog]");
        console.log(`[axe] quote-selection dialog @${theme} ${JSON.stringify(open)}`);
        expect(open.serious, `弹层 axe: ${JSON.stringify(open.detail)}`).toBe(0);
    });
}

/* ───────────── 7. 证据截图（QUOTE_SELECTION_SHOTS=1 才跑） ───────────── */

const SHOT_DIR = path.resolve(process.cwd(), "docs/_reviews/M7-3d-2/screens");

test.describe("金句卡弹层证据截图", () => {
    test.skip(process.env.QUOTE_SELECTION_SHOTS !== "1", "set QUOTE_SELECTION_SHOTS=1 to capture");

    for (const theme of THEMES) {
        for (const viewport of [
            { width: 1440, height: 900, tag: "1440" },
            { width: 390, height: 844, tag: "390" },
        ]) {
            test(`${theme}：${viewport.tag} 工具条 + 打开态`, async ({ page }) => {
                if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                await page.goto(ARTICLE, { waitUntil: "load" });
                await setTheme(page, theme);
                await settle(page);

                await selectBodyText(page);
                await page.waitForTimeout(180);
                await page.screenshot({
                    path: path.join(SHOT_DIR, `toolbar-${theme}-${viewport.tag}.png`),
                });

                await page.locator(TRIGGER).click();
                await expect(page.locator(DIALOG)).toHaveAttribute("data-quote-state", "ready", {
                    timeout: 20000,
                });
                await page.waitForTimeout(200);
                await page.screenshot({
                    path: path.join(SHOT_DIR, `dialog-${theme}-${viewport.tag}.png`),
                });
            });
        }
    }
});
