import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * M7-3a · 分享入口条 + 微信二维码弹层（视觉换壳，行为不变）
 *
 * 本卡只换皮：平台数量/顺序/链接、QR 懒加载、复制链接、外点/Esc、焦点归还全部沿用
 * src/scripts/share.ts（本卡未改）。因此这里的断言分四组：
 *   1. 结构契约：10 个钩子节点顺序不变、站外链接仍指向真正的分享域名；
 *   2. 懒加载口径：关闭态 0 个 [data-overlay] / 0 个 QR pack 请求 / [data-share-qr] 空；
 *   3. 打开态：1 个 [data-overlay="share"]、axe serious/critical=0（双主题）、外点 + Esc
 *      关闭后焦点回填触发按钮；
 *   4. 双断点：390 无横向溢出、同一 DOM 可用、弹层贴底可关闭。
 *
 * 口径与 e2e/overlays.spec.ts 一致（那边判的是六件套的全量，本文件只判分享一件），
 * 两个文件互不 import：spec 之间的 helper 复用会拖进对方的 test 收集。
 */

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const ARTICLE = "/article/blog-as-a-product/";
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

/** 与 src/config/feature.ts 的 share.sites 同序；native 在桌面隐藏但仍在 DOM 里 */
const EXPECTED_ORDER = [
    "wechat",
    "weibo",
    "qzone",
    "douban",
    "x",
    "telegram",
    "facebook",
    "reddit",
    "copy",
    "native",
];

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

/** QR pack（uqr chunk）与 overlay 基座：关闭态一个都不该出现 */
const COLD_ASSET = /\/_astro\/(?:overlay|dist)\.[\w-]+\.js/;

const count = (page: Page) =>
    page.evaluate(() => document.querySelectorAll("[data-overlay]").length);

/* ───────────── 1. 结构契约：数量 / 顺序 / 链接 / 关闭态 ───────────── */

test("1440 关闭态：10 个分享钩子顺序不变、站外链接仍带真实分享域名、0 节点 / 0 QR 请求", async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    await page.goto(ARTICLE, { waitUntil: "load" });
    await settle(page);
    await page.waitForTimeout(400); // 给懒加载/预取一个窗口

    const bar = page.locator("[data-post-share]");
    await expect(bar).toHaveCount(1);
    await expect(bar).toBeVisible();
    // 换壳后仍是同一根骨：.share-bar.post-share
    await expect(bar).toHaveClass(/share-bar/);
    await expect(bar).toHaveClass(/post-share/);

    // 顺序：微信 / 微博 / Qzone / 豆瓣 / X / Telegram / Facebook / Reddit / 复制 / 系统分享
    const order = await page.$$eval("[data-post-share] .share-icons > *", (nodes) =>
        nodes.map((node) => {
            const el = node as HTMLElement;
            if (el.matches(".share-wechat-wrap")) return "wechat";
            return (
                el.getAttribute("data-share-platform") ??
                el.getAttribute("data-share-action") ??
                "unknown"
            );
        }),
    );
    expect(order, "平台数量/顺序不能随换壳变化").toEqual(EXPECTED_ORDER);

    // 站外分享链接在构建期就写进 href（无 JS 也能用）
    const hrefs = await page.$$eval("[data-post-share] .share-icon[data-share-platform]", (ns) =>
        ns.map((n) => n.getAttribute("href") ?? ""),
    );
    expect(hrefs).toHaveLength(8);
    expect(hrefs[0]).toMatch(/^https:\/\/service\.weibo\.com\/share\/share\.php\?/);
    expect(hrefs[3]).toMatch(/^https:\/\/www\.douban\.com\/share\/service\?/);
    expect(hrefs[5]).toMatch(/^https:\/\/t\.me\/share\/url\?/);
    for (const href of hrefs) expect(href).toMatch(/^https?:\/\//);

    // 关闭态：弹层 aria-hidden、透明、不吃事件、QR 容器为空
    const pop = page.locator('.share-pop').first();
    await expect(pop).toHaveAttribute("aria-hidden", "true");
    const cold = await pop.evaluate((el) => {
        const s = getComputedStyle(el as HTMLElement);
        return {
            opacity: Number(s.opacity),
            pointerEvents: s.pointerEvents,
            visibility: s.visibility,
            qrChildren: el.querySelector("[data-share-qr]")?.childElementCount ?? -1,
        };
    });
    expect(cold.opacity, "关闭态弹层必须透明").toBe(0);
    expect(cold.pointerEvents).toBe("none");
    expect(cold.visibility).toBe("hidden");
    expect(cold.qrChildren, "关闭态 HTML 不内联二维码").toBe(0);

    expect(await count(page), "关闭态 0 个 [data-overlay]").toBe(0);
    expect(
        requests.filter((url) => COLD_ASSET.test(url)),
        "关闭态不该下载 overlay 基座 / QR pack",
    ).toEqual([]);

    // 换壳后的视觉锚点：赤陶竖条 + 等宽计数 + surface 托盘，都是纯 CSS（不新节点请求）
    const skin = await bar.evaluate((el) => {
        const icons = el.querySelector(".share-icons") as HTMLElement;
        const label = el.querySelector(".share-label") as HTMLElement;
        const count = el.querySelector(".share-count") as HTMLElement;
        return {
            accentRule: getComputedStyle(el, "::before").width,
            iconsBg: getComputedStyle(icons).backgroundColor,
            labelFont: getComputedStyle(label).fontFamily,
            countText: count.textContent?.trim() ?? "",
        };
    });
    expect(skin.accentRule).toBe("2px");
    expect(skin.iconsBg, "桌面图标托盘必须是 surface（不是透明）").not.toBe("rgba(0, 0, 0, 0)");
    expect(skin.labelFont.toLowerCase()).toMatch(/mono|jetbrains/);
    expect(skin.countText).toBe("10");
});

/* ───────────── 2. 打开态 × 双主题：axe + 懒加载 QR + Esc 回焦 ───────────── */

for (const theme of THEMES) {
    test(`${theme}：打开微信弹层 → 1 个标记 / QR 本地渲染 / axe serious=0 / Esc 关闭并回焦`, async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        const requests: string[] = [];
        page.on("request", (req) => requests.push(req.url()));

        await page.goto(ARTICLE, { waitUntil: "load" });
        await setTheme(page, theme);
        await settle(page);

        const trigger = page.locator("[data-share-action='wechat']");
        await trigger.click();
        await expect(page.locator('[data-overlay="share"]')).toHaveCount(1);
        await expect(trigger).toHaveAttribute("aria-expanded", "true");

        // QR 仍是懒加载：点开才画出 svg，且必须同源（不许第三方 QR 服务）
        const qr = page.locator('[data-overlay="share"] [data-share-qr]');
        await expect(qr.locator("svg")).toHaveCount(1);
        const origin = new URL(page.url()).origin;
        expect(
            requests.filter(
                (url) => !url.startsWith(origin) && /qr|qrcode|chart\.googleapis/i.test(url),
            ),
            "二维码必须本地生成",
        ).toEqual([]);

        // 换壳后的卡片结构（selection §4.17 的壳：眉标 / 标题 / 取景框 / 帮助 / 脚注）
        for (const sel of [
            ".share-card",
            ".share-card-head",
            ".share-eyebrow",
            ".share-qr",
            ".share-qr-title",
            ".share-qr-img",
            ".share-qr-help",
            ".share-url",
        ]) {
            await expect(
                page.locator(`[data-overlay="share"] ${sel}`),
                `卡片缺 ${sel}`,
            ).toHaveCount(1);
        }
        // 二维码取景框在双主题下都必须是浅底（深色主题反色会扫不出来）
        const qrBg = await page
            .locator('[data-overlay="share"] .share-qr-img')
            .evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(qrBg).toBe("rgb(255, 255, 255)");

        await page.evaluate(() =>
            document
                .querySelectorAll("[data-overlay]")
                .forEach((node) => node.getAnimations({ subtree: true }).forEach((a) => a.finish())),
        );
        await page.waitForTimeout(120);

        const axe = await axeShare(page);
        console.log(`[axe] share @${theme} serious=${axe.serious} ${JSON.stringify(axe)}`);
        expect(axe.serious, `axe serious: ${JSON.stringify(axe.seriousDetail)}`).toBe(0);

        await page.keyboard.press("Escape");
        await expect(page.locator('[data-overlay="share"]')).toHaveCount(0);
        expect(await count(page)).toBe(0);
        expect(
            await page.evaluate(() =>
                document.activeElement?.matches("[data-share-action='wechat']"),
            ),
            "关闭后焦点回到微信触发按钮",
        ).toBe(true);
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await expect(page.locator(".share-pop")).toHaveAttribute("aria-hidden", "true");
    });
}

test("外点遮罩关闭：点卡片外部收起弹层，焦点同样回填", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ARTICLE, { waitUntil: "load" });
    await settle(page);
    const trigger = page.locator("[data-share-action='wechat']");
    await trigger.click();
    await expect(page.locator('[data-overlay="share"]')).toHaveCount(1);

    await page.mouse.click(30, 400); // 遮罩左上角，卡片之外
    await expect(page.locator('[data-overlay="share"]')).toHaveCount(0);
    expect(
        await page.evaluate(() => document.activeElement?.matches("[data-share-action='wechat']")),
    ).toBe(true);
});

/* ───────────── 3. 复制链接：行为不变（写剪贴板 + 反馈签） ───────────── */

test("复制链接：写入当前文章 URL，按钮出现 .copied 与反馈签", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ARTICLE, { waitUntil: "load" });
    await settle(page);

    const copy = page.locator("[data-share-action='copy']");
    await expect(copy).toBeVisible();
    await copy.click();
    await expect(copy).toHaveClass(/copied/);
    await expect(copy.locator(".share-copied-chip")).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain("/article/blog-as-a-product/");
});

/* ───────────── 4. 390：同一 DOM 窄版可用、无横向溢出、sheet 可关 ───────────── */

test("390：入口条换网格、无横向溢出；二维码 sheet 可开可关并回焦", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ARTICLE, { waitUntil: "load" });
    await settle(page);

    const bar = page.locator("[data-post-share]");
    await expect(bar).toBeVisible();

    // 同一套 DOM：10 个钩子一个不少（窄版只是换形态）
    const order = await page.$$eval("[data-post-share] .share-icons > *", (nodes) =>
        nodes.map((node) => {
            const el = node as HTMLElement;
            if (el.matches(".share-wechat-wrap")) return "wechat";
            return (
                el.getAttribute("data-share-platform") ??
                el.getAttribute("data-share-action") ??
                "unknown"
            );
        }),
    );
    expect(order).toEqual(EXPECTED_ORDER);

    // 窄版形态：2 行 5 列网格（不是桌面那枚托盘）
    const layout = await page.evaluate(() => {
        const icons = document.querySelector("[data-post-share] .share-icons") as HTMLElement;
        const s = getComputedStyle(icons);
        const first = icons.firstElementChild?.getBoundingClientRect();
        return {
            display: s.display,
            columns: s.gridTemplateColumns,
            tileWidth: first?.width ?? 0,
        };
    });
    expect(layout.display).toBe("grid");
    expect(layout.columns.split(" ").length).toBe(5);
    expect(layout.tileWidth).toBeGreaterThan(40);

    // 无横向溢出
    const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth, "390 不允许横向溢出").toBeLessThanOrEqual(overflow.innerWidth + 1);

    // sheet：贴底、满宽、可关闭、焦点回填
    const trigger = page.locator("[data-share-action='wechat']");
    await trigger.click();
    await expect(page.locator('[data-overlay="share"]')).toHaveCount(1);
    await expect(page.locator('[data-overlay="share"] [data-share-qr] svg')).toHaveCount(1);
    const sheet = await page.locator('[data-overlay="share"] .share-card').evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, width: rect.width, bottom: rect.bottom, viewport: innerWidth };
    });
    expect(sheet.width).toBeGreaterThanOrEqual(sheet.viewport - 1);
    expect(Math.round(sheet.bottom)).toBeGreaterThanOrEqual(843);

    await page.locator("[data-overlay='share'] [data-share-close]").click();
    await expect(page.locator('[data-overlay="share"]')).toHaveCount(0);
    expect(
        await page.evaluate(() => document.activeElement?.matches("[data-share-action='wechat']")),
    ).toBe(true);
});

/* ───────────── 5. 证据截图（SHARE_SHOTS=1 才跑） ───────────── */

const SHOT_DIR = path.resolve(process.cwd(), "docs/_reviews/M7-3a/screens");

test.describe("分享换壳证据截图", () => {
    test.skip(process.env.SHARE_SHOTS !== "1", "set SHARE_SHOTS=1 to capture");
    test.use({ viewport: { width: 1440, height: 900 } });

    for (const theme of THEMES) {
        test(`${theme}：1440 入口条 + 打开态`, async ({ page }) => {
            if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
            await page.goto(ARTICLE, { waitUntil: "load" });
            await setTheme(page, theme);
            await settle(page);
            await page.locator("[data-post-share]").scrollIntoViewIfNeeded();
            await page.waitForTimeout(250);
            await page
                .locator("[data-post-share]")
                .screenshot({ path: path.join(SHOT_DIR, `bar-${theme}-1440.png`) });

            await page.locator("[data-share-action='wechat']").click();
            await expect(page.locator('[data-overlay="share"] [data-share-qr] svg')).toHaveCount(1);
            await page.waitForTimeout(300);
            await page.screenshot({ path: path.join(SHOT_DIR, `modal-${theme}-1440.png`) });
        });

        test(`${theme}：390 入口条 + 打开态`, async ({ page }) => {
            await page.setViewportSize({ width: 390, height: 844 });
            if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
            await page.goto(ARTICLE, { waitUntil: "load" });
            await setTheme(page, theme);
            await settle(page);
            await page.locator("[data-post-share]").scrollIntoViewIfNeeded();
            await page.waitForTimeout(250);
            await page
                .locator("[data-post-share]")
                .screenshot({ path: path.join(SHOT_DIR, `bar-${theme}-390.png`) });

            await page.locator("[data-share-action='wechat']").click();
            await expect(page.locator('[data-overlay="share"] [data-share-qr] svg')).toHaveCount(1);
            await page.waitForTimeout(300);
            await page.screenshot({ path: path.join(SHOT_DIR, `sheet-${theme}-390.png`) });
        });
    }
});
