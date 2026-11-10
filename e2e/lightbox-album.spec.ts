import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * M8-3c · 相册灯箱验收（与 pages-albums 的基础灯箱用例互补）
 *
 * 覆盖本卡新增的四件事：桌面/移动版式、底部缩略条、键盘切图与焦点陷阱、
 * reduced-motion 0 动画。基础用例（原图 / Esc / 焦点归还）留在 pages-albums.spec.ts。
 */

const ROOT = process.cwd();
const AXE_SOURCE = readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
const DETAIL = "/albums/shenzhen_feng-huang-shan/";
const DETAIL_MANY = "/albums/shenzhen_lian-hua-shan/";
const TRIGGER = "#fancybox-gallery a[href]";

const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/wFz0q1kAAAAAElFTkSuQmCC",
    "base64",
);

async function openLightbox(
    page: Page,
    width: number,
    theme: "light" | "dark",
    url: string = DETAIL,
): Promise<void> {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.route("https://marxchou.com/cdn-cgi/image/**", (route) =>
        route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }),
    );
    await page.route("https://pic-api.marxchou.com/**", (route) =>
        route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }),
    );
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(
        (value) => document.documentElement.setAttribute("data-theme", value),
        theme,
    );
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
    });
    await expect(page.locator("#fancybox-gallery")).toHaveAttribute("data-lightbox-ready", "1", {
        timeout: 15_000,
    });

    await page.locator(TRIGGER).first().click();
    const dialog = page.locator(".fancybox__container").first();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".fancybox__thumbs")).toBeVisible({ timeout: 15_000 });
}

test("1440：桌面大图 + 底部缩略条，缩略条可横向滚动", async ({ page }) => {
    await openLightbox(page, 1440, "light", DETAIL_MANY);

    const dialog = page.locator(".fancybox__container").first();
    const box = await dialog.boundingBox();
    expect(box, "灯箱必须有尺寸").not.toBeNull();
    expect(
        (
            await dialog.evaluate((el) =>
                getComputedStyle(el).getPropertyValue("--f-carousel-slide-padding"),
            )
        ).trim(),
        "桌面大图必须留 4% 视口边距",
    ).toBe("4vh 4vw");

    const thumbs = page.locator(".fancybox__thumbs .f-thumbs__slide");
    await expect(thumbs.first()).toBeVisible();
    expect(await thumbs.count()).toBeGreaterThan(1);

    const viewport = page.locator(".fancybox__thumbs .f-thumbs__viewport");
    const scroll = await viewport.evaluate((el) => ({
        overflowX: getComputedStyle(el).overflowX,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
    }));
    expect(scroll.overflowX).toBe("auto");
    expect(scroll.scrollWidth).toBeGreaterThan(scroll.clientWidth);

    console.log(
        `[lightbox] 1440 缩略条 ${await thumbs.count()} 张 · scrollWidth=${scroll.scrollWidth}`,
    );
});

test("390：全屏 sheet，横向溢出为 0", async ({ page }) => {
    await openLightbox(page, 390, "light");

    const dialog = page.locator(".fancybox__container").first();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    const viewport = await page.evaluate(() => ({
        width: Math.min(document.documentElement.clientWidth, document.body.clientWidth),
        height: window.innerHeight,
    }));
    expect(box!.width, "移动 sheet 必须铺满可视宽度").toBeGreaterThanOrEqual(viewport.width - 1);
    expect(box!.height, "移动 sheet 必须铺满可视高度").toBeGreaterThanOrEqual(viewport.height - 1);
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);

    await expect(page.locator(".fancybox__thumbs .f-thumbs__slide").first()).toBeVisible();
});

test("键盘：→ 切图、Esc 关闭、焦点回到触发照片", async ({ page }) => {
    await openLightbox(page, 1440, "light");

    const dialog = page.locator(".fancybox__container").first();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("role", "dialog");
    await expect
        .poll(() => dialog.getAttribute("aria-label"), { timeout: 5_000 })
        .toMatch(/1\/\d+/);
    await page.keyboard.press("ArrowRight");
    await expect
        .poll(() => dialog.getAttribute("aria-label"), { timeout: 5_000 })
        .toMatch(/2\/\d+/);
    await expect
        .poll(() =>
            page.evaluate(() => {
                const el = document.activeElement as HTMLElement | null;
                return el?.classList.contains("fancybox__container") === true;
            }),
        )
        .toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator(TRIGGER).nth(1)).toBeFocused();
});

test("reduced-motion：打开态 0 个运行中动画", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openLightbox(page, 1440, "light");

    const running = await page.evaluate(
        () =>
            document
                .getAnimations({ subtree: true })
                .filter((animation) => animation.playState === "running").length,
    );
    expect(running).toBe(0);
});

for (const theme of ["light", "dark"] as const) {
    test(`axe ${theme}：灯箱打开态 serious=0 incomplete=0`, async ({ page }) => {
        await openLightbox(page, 1440, theme);
        await page.addScriptTag({ content: AXE_SOURCE });
        const result = await page.evaluate(async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const axe = (window as any).axe;
            const scope = document.querySelector(".fancybox__container");
            const run = await axe.run(scope ?? document, {
                runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
                resultTypes: ["violations", "incomplete"],
            });
            return { violations: run.violations, incomplete: run.incomplete };
        });
        const serious = result.violations.filter(
            (v: { impact: string | null }) => v.impact === "serious" || v.impact === "critical",
        );
        console.log(
            `[axe-lightbox] ${theme} incomplete=${JSON.stringify(
                result.incomplete.map(
                    (v: { id: string; nodes: { target: unknown[]; html: string }[] }) => ({
                        id: v.id,
                        nodes: v.nodes.map((n) => ({
                            target: n.target,
                            html: n.html.slice(0, 160),
                        })),
                    }),
                ),
            )}`,
        );
        expect(
            serious.map((v: { id: string }) => v.id),
            `${theme}: serious/critical`,
        ).toEqual([]);
        expect(
            result.incomplete.map((v: { id: string }) => v.id),
            `${theme}: incomplete`,
        ).toEqual([]);
    });
}
