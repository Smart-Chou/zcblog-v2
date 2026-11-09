import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * M7-3c · 分享弹层接海报预览 + 下载 / 短链降级
 *
 * 判的是「接进去以后没把懒加载和 a11y 弄丢」：
 *   1. 关闭态：`/poster/*.png` 0 请求、`<img>` 无 src、overlay 基座仍不下载；
 *   2. 1440 打开：左 3:4 海报（naturalWidth/Height = 1200/1600）+ 右 QR/平台；
 *      下载链接指向当前 slug 且带 download；
 *   3. 390 打开：单列 sheet、海报不横向溢出、关闭后焦点回填触发按钮；
 *   4. 「复制短链」没有后端：复制 canonical URL，状态行明说降级（不伪造短链）；
 *   5. axe 打开态 serious/critical = 0（双主题）。
 *
 * 截图（docs/_reviews/M7-3c/screens）默认跳过，`SHARE_POSTER_SHOTS=1` 才落盘。
 * 口径与 e2e/share.spec.ts 一致；两个文件互不 import（避免互相拖进 test 收集）。
 */

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const ARTICLE = "/article/blog-as-a-product/";
const SLUG = "blog-as-a-product";
const POSTER = `/poster/${SLUG}.png`;
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const POSTER_REQ = /\/poster\/[\w.-]+\.png/;
const OVERLAY_ASSET = /\/_astro\/(?:overlay|overlay-sheets)[\w-]*\.[\w-]+\.js/;

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

/** 海报是 1200×1600 的真图 —— 等它 decode 完再量尺寸，别量到 0×0 */
async function openShare(page: Page): Promise<void> {
    await page.locator("[data-share-action='wechat']").click();
    await expect(page.locator('[data-overlay="share"]')).toHaveCount(1);
    await expect
        .poll(
            () =>
                page.evaluate(() => {
                    const img = document.querySelector<HTMLImageElement>("[data-share-poster]");
                    return img ? img.naturalWidth : 0;
                }),
            { timeout: 20000, message: "海报预览没有加载出真实像素" },
        )
        .toBe(1200);
}

async function axeShare(page: Page) {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(
        async ([selector, tags]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (window as any).axe.run(selector, {
                runOnly: { type: "tag", values: tags },
            });
            const serious = result.violations.filter(
                (v: { impact?: string }) => v.impact === "serious" || v.impact === "critical",
            );
            return {
                serious: serious.length,
                violations: result.violations.map((v: { id: string }) => v.id),
                seriousDetail: serious.map((v: { id: string; nodes: unknown[] }) => ({
                    id: v.id,
                    nodes: v.nodes.length,
                })),
            };
        },
        ['[data-overlay="share"]', TAGS],
    );
}

/* ───────────── 1. 关闭态：0 请求 ───────────── */

test("1440 关闭态：不请求 /poster/*.png、<img> 无 src、overlay 基座不下载", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const requests: { url: string; type: string }[] = [];
    page.on("request", (req) => requests.push({ url: req.url(), type: req.resourceType() }));

    await page.goto(ARTICLE, { waitUntil: "load" });
    await settle(page);
    await page.waitForTimeout(500); // 懒加载 / 预取窗口

    const img = page.locator("[data-share-poster]");
    await expect(img).toHaveCount(1);
    // 预览图在 HTML 里只有 slug，没有 src —— 这是「关闭态 0 请求」的根因
    expect(await img.getAttribute("data-share-poster")).toBe(SLUG);
    expect(await img.getAttribute("src"), "关闭态 <img> 不能带 src").toBeNull();

    // 下载链接是静态 href（属性不触发请求）
    const dl = page.locator("[data-share-download]");
    await expect(dl).toHaveCount(1);
    expect(await dl.getAttribute("href")).toBe(POSTER);
    await expect(dl).toHaveAttribute("download", /\.png$/);

    expect(
        requests.filter((r) => POSTER_REQ.test(r.url)),
        "关闭态不该请求海报 PNG",
    ).toEqual([]);
    expect(
        requests.filter((r) => OVERLAY_ASSET.test(r.url)),
        "关闭态不该下载 overlay 基座",
    ).toEqual([]);

    // 弹层仍按旧口径关闭（aria-hidden + 透明 + 不吃事件）
    const pop = page.locator(".share-pop").first();
    await expect(pop).toHaveAttribute("aria-hidden", "true");
    const cold = await pop.evaluate((el) => {
        const s = getComputedStyle(el as HTMLElement);
        return { opacity: Number(s.opacity), pe: s.pointerEvents };
    });
    expect(cold.opacity).toBe(0);
    expect(cold.pe).toBe("none");
});

/* ───────────── 2. 1440 打开：海报 + QR/平台 + 下载 ───────────── */

for (const theme of THEMES) {
    test(`${theme}：1440 打开 → 左 3:4 海报 1200×1600、右 QR/平台、下载指向当前 slug、axe=0`, async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        const posterReqs: string[] = [];
        page.on("request", (req) => {
            if (POSTER_REQ.test(req.url())) posterReqs.push(req.url());
        });

        await page.goto(ARTICLE, { waitUntil: "load" });
        await setTheme(page, theme);
        await settle(page);
        expect(posterReqs, "打开之前 0 个海报请求").toEqual([]);

        await openShare(page);
        expect(posterReqs.length, "打开后按需拉了一次海报").toBeGreaterThanOrEqual(1);

        const layout = await page.evaluate(() => {
            const img = document.querySelector<HTMLImageElement>("[data-share-poster]")!;
            const frame = img.closest(".share-poster-frame")!.getBoundingClientRect();
            const card = document.querySelector(".share-card")!.getBoundingClientRect();
            const panel = document.querySelector(".share-panel")!.getBoundingClientRect();
            return {
                nat: [img.naturalWidth, img.naturalHeight],
                ratio: Number((frame.width / frame.height).toFixed(3)),
                frame: [Math.round(frame.width), Math.round(frame.height)],
                card: [Math.round(card.width), Math.round(card.height)],
                // 左海报 / 右面板：面板必须整体在预览右边
                panelLeft: Math.round(panel.left),
                frameRight: Math.round(frame.right),
            };
        });
        expect(layout.nat).toEqual([1200, 1600]);
        expect(layout.ratio, "预览框必须是 3:4").toBeCloseTo(0.75, 2);
        expect(layout.panelLeft, "右栏必须落在海报右侧（两栏）").toBeGreaterThan(layout.frameRight);
        // 卡片不能顶出视口
        expect(layout.card[1]).toBeLessThanOrEqual(900);

        // 右栏：微信 QR（本地生成）+ 平台直链
        await expect(page.locator('[data-overlay="share"] [data-share-qr] svg')).toHaveCount(1);
        await expect(page.locator('[data-overlay="share"] .share-platforms .share-platform')).toHaveCount(7);

        const dl = page.locator('[data-overlay="share"] [data-share-download]');
        expect(await dl.getAttribute("href")).toBe(POSTER);
        const download = await dl.getAttribute("download");
        expect(download, "下载必须带 download 属性").toBeTruthy();
        expect(download).toMatch(/\.png$/);

        await page.evaluate(() =>
            document
                .querySelectorAll("[data-overlay]")
                .forEach((node) =>
                    node.getAnimations({ subtree: true }).forEach((a) => a.finish()),
                ),
        );
        await page.waitForTimeout(150);

        const axe = await axeShare(page);
        console.log(`[axe] share-poster @${theme} serious=${axe.serious} ${JSON.stringify(axe)}`);
        expect(axe.serious, `axe serious: ${JSON.stringify(axe.seriousDetail)}`).toBe(0);
    });
}

/* ───────────── 3. 390：单列 sheet、不溢出、关闭回焦 ───────────── */

test("390：单列 sheet、海报不溢出、关闭后焦点回填", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ARTICLE, { waitUntil: "load" });
    await settle(page);

    const trigger = page.locator("[data-share-action='wechat']");
    await trigger.click();
    await expect(page.locator('[data-overlay="share"]')).toHaveCount(1);
    await expect
        .poll(
            () =>
                page.evaluate(() => {
                    const img = document.querySelector<HTMLImageElement>("[data-share-poster]");
                    return img ? img.naturalWidth : 0;
                }),
            { timeout: 20000 },
        )
        .toBe(1200);

    const mobile = await page.evaluate(() => {
        const card = document.querySelector(".share-card")!;
        const img = document.querySelector<HTMLImageElement>("[data-share-poster]")!;
        const r = card.getBoundingClientRect();
        const ir = img.getBoundingClientRect();
        const frame = img.closest(".share-poster-frame")!.getBoundingClientRect();
        const s = getComputedStyle(document.querySelector(".share-modal")!);
        return {
            columns: s.gridTemplateColumns.split(" ").length,
            card: [Math.round(r.left), Math.round(r.width), Math.round(r.bottom)],
            frameRatio: Number((frame.width / frame.height).toFixed(3)),
            imgOverflowX: ir.right > r.right + 1 || ir.left < r.left - 1,
            pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
    });
    expect(mobile.columns, "390 必须是单列").toBe(1);
    expect(mobile.frameRatio, "海报仍是 3:4").toBeCloseTo(0.75, 2);
    expect(mobile.imgOverflowX, "海报不能横向溢出卡片").toBe(false);
    expect(mobile.pageOverflow, "390 页面不允许横向滚动").toBe(false);
    // sheet 贴底、满宽（减去 scrollbar-gutter 的 15px）
    expect(mobile.card[1]).toBeGreaterThanOrEqual(390 - 20);
    expect(mobile.card[2]).toBeGreaterThanOrEqual(843);

    await page.locator('[data-overlay="share"] [data-share-close]').click();
    await expect(page.locator('[data-overlay="share"]')).toHaveCount(0);
    expect(
        await page.evaluate(() => document.activeElement?.matches("[data-share-action='wechat']")),
        "关闭后焦点回到触发按钮",
    ).toBe(true);
});

/* ───────────── 4. 复制短链：降级不静默 ───────────── */

test("复制短链：无短链服务时复制 canonical URL + 显示降级文案", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ARTICLE, { waitUntil: "load" });
    await settle(page);
    await openShare(page);

    const note = page.locator('[data-overlay="share"] [data-share-note]');
    await expect(note).toHaveText("");

    const btn = page.locator('[data-overlay="share"] [data-share-action="shortlink"]');
    await btn.click();

    // 复制的是 canonical URL（不是伪造的短链）
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toMatch(/^https?:\/\//);
    expect(clip).toContain(ARTICLE);
    expect(clip, "不能伪造短链域名").not.toMatch(/\/s\/|t\.cn|bit\.ly|dwz\.cn/i);

    // 降级文案必须出现且明确提到短链不可用
    await expect(note).toHaveAttribute("data-tone", "degraded");
    await expect(note).toBeVisible();
    const text = (await note.textContent())?.trim() ?? "";
    expect(text.length).toBeGreaterThan(8);
    expect(text).toMatch(/短链|short link/i);
    await expect(btn).toHaveClass(/copied/, { timeout: 2000 });
});

/* ───────────── 5. 证据截图（SHARE_POSTER_SHOTS=1 才跑） ───────────── */

const SHOT_DIR = path.resolve(process.cwd(), "docs/_reviews/M7-3c/screens");

test.describe("海报弹层证据截图", () => {
    test.skip(process.env.SHARE_POSTER_SHOTS !== "1", "set SHARE_POSTER_SHOTS=1 to capture");

    for (const theme of THEMES) {
        test(`${theme}：1440 打开态`, async ({ page }) => {
            if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.goto(ARTICLE, { waitUntil: "load" });
            await setTheme(page, theme);
            await settle(page);
            await openShare(page);
            await page.waitForTimeout(300);
            await page.screenshot({ path: path.join(SHOT_DIR, `modal-${theme}-1440.png`) });
        });

        test(`${theme}：390 打开态`, async ({ page }) => {
            if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
            await page.setViewportSize({ width: 390, height: 844 });
            await page.goto(ARTICLE, { waitUntil: "load" });
            await setTheme(page, theme);
            await settle(page);
            await openShare(page);
            await page.waitForTimeout(300);
            await page.screenshot({ path: path.join(SHOT_DIR, `sheet-${theme}-390.png`) });
        });
    }
});
