import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * P-04 · 404 单页视觉验收（M6-5a · Stitch v2 · 404_2 桌面 / 404_1 移动）
 *
 * 判据（卡面 §验收）：
 *  1. `/404/` 200；恰好 1 个 <h1>，标题层级不跳级
 *  2. 1440 / 1024 / 390 × light/dark：无横向溢出（scrollWidth ≤ clientWidth）
 *  3. axe（wcag2a/aa + wcag21a/aa + wcag22aa）：serious = 0、critical = 0
 *  4. 零 JS 可读：终端诊断文案 + 3 个航标 + 返回首页 / 归档 / 检索提示 都在
 *  5. 零位图：404 页不加载任何 <img>
 *  6. prefers-reduced-motion：运行中动画 0（终端光标呼吸只在允许动效时存在）
 *  7. 断点分形态：≥1025 航标 3 列；≤640 404 变成标题背后的水印（absolute）
 *
 * 截图（默认跳过，`NF404_SHOTS=1` 时写入 docs/_reviews/M6-5a/screens/）。
 */

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [
    { width: 1440, height: 900 },
    { width: 1024, height: 900 },
    { width: 390, height: 844 },
] as const;
type Theme = (typeof THEMES)[number];

const SCREENS_DIR = path.join(process.cwd(), "docs/_reviews/M6-5a/screens");

async function open404(page: Page, theme: Theme, viewport?: { width: number; height: number }) {
    if (viewport) await page.setViewportSize(viewport);
    const response = await page.goto("/404/", { waitUntil: "load" });
    expect(response?.status(), "GET /404/").toBe(200);
    await page.evaluate((value) => {
        document.documentElement.setAttribute("data-theme", value);
    }, theme);
    await page.evaluate(() => document.fonts.ready);
}

async function overflowPx(page: Page): Promise<number> {
    return page.evaluate(() => {
        const doc = document.documentElement;
        return Math.max(0, doc.scrollWidth - doc.clientWidth);
    });
}

test.describe("404 · 结构与可读性", () => {
    test("恰好 1 个 h1，标题层级不跳级", async ({ page }) => {
        await open404(page, "light", VIEWPORTS[0]);
        await expect(page.locator(".not-found")).toHaveCount(1);
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.locator(".nf-code")).toHaveText("404");

        const levels = await page.evaluate(() =>
            [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
                .filter((node) => !node.closest("[inert]"))
                .map((node) => Number(node.tagName.slice(1))),
        );
        for (let i = 1; i < levels.length; i += 1) {
            expect(
                levels[i] - levels[i - 1],
                `标题层级跳级：${levels.join(" → ")}`,
            ).toBeLessThanOrEqual(1);
        }
    });

    test("零 JS 可读：终端文案 + 3 个航标 + 三条恢复路径", async ({ browser }) => {
        const context = await browser.newContext({ javaScriptEnabled: false });
        const page = await context.newPage();
        const response = await page.goto("/404/", { waitUntil: "load" });
        expect(response?.status()).toBe(200);

        await expect(page.locator(".nf-terminal__body")).toContainText("HTTP/2 404");
        await expect(page.locator(".nf-beacons__item")).toHaveCount(3);
        await expect(page.locator(".nf-button--primary")).toHaveAttribute("href", "/");
        await expect(page.locator(".nf-button--secondary")).toHaveAttribute("href", "/archives/");
        // 检索入口：页头 pagefind trigger 的静态占位（全站单实例）
        await expect(page.locator("header pagefind-modal-trigger")).toHaveCount(1);
        await expect(page.locator(".nf-hint__search")).toContainText("⌘K");
        await expect(page.locator(".not-found img")).toHaveCount(0);
        await context.close();
    });

    test("断点分形态：桌面 3 列航标 / 移动 404 水印", async ({ page }) => {
        await open404(page, "light", { width: 1440, height: 900 });
        const desktop = await page.evaluate(() => {
            const list = document.querySelector(".nf-beacons__list") as HTMLElement;
            const code = document.querySelector(".nf-code") as HTMLElement;
            return {
                columns: getComputedStyle(list).gridTemplateColumns.split(" ").length,
                codePosition: getComputedStyle(code).position,
            };
        });
        expect(desktop.columns, "1440 航标应为 3 列").toBe(3);
        expect(desktop.codePosition, "桌面 404 编号在文档流内").toBe("static");

        await open404(page, "light", { width: 390, height: 844 });
        const mobile = await page.evaluate(() => {
            const list = document.querySelector(".nf-beacons__list") as HTMLElement;
            const code = document.querySelector(".nf-code") as HTMLElement;
            return {
                columns: getComputedStyle(list).gridTemplateColumns.split(" ").length,
                codePosition: getComputedStyle(code).position,
            };
        });
        expect(mobile.columns, "390 航标应为单列").toBe(1);
        expect(mobile.codePosition, "移动 404 编号应成为水印（absolute）").toBe("absolute");
    });
});

test.describe("404 · 版面与可访问性", () => {
    for (const theme of THEMES) {
        test(`无横向溢出 + axe（${theme}）`, async ({ page }) => {
            for (const viewport of VIEWPORTS) {
                await open404(page, theme, viewport);
                const overflow = await overflowPx(page);
                console.log(`[404:${theme}] ${viewport.width}px 横向溢出 = ${overflow}px`);
                expect(overflow, `${viewport.width}px · ${theme} 无横向溢出`).toBeLessThanOrEqual(1);
            }

            // axe 在 1440 跑一次（同一份 DOM，断点只改排版）。
            // 作用域 = 页面主体 `.not-found`：外壳 header 的搜索占位/菜单标签在浅色下
            // 是 4.4:1（--color-fg-muted on --color-bg-canvas），属于 M6-1 的共享外壳，
            // 不在本卡 3 文件边界内 —— 已在 report.md 记为遗留。
            await open404(page, theme, VIEWPORTS[0]);
            await page.addScriptTag({ content: AXE_SOURCE });
            const result = await page.evaluate(async () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const axe = (window as any).axe;
                const surface = document.querySelector(".not-found") as HTMLElement;
                return axe.run(surface, {
                    runOnly: {
                        type: "tag",
                        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
                    },
                });
            });
            const blocking = result.violations.filter(
                (v: { impact?: string }) => v.impact === "serious" || v.impact === "critical",
            );
            console.log(
                `[404:${theme}] axe ${result.violations.length} violations（serious/critical = ${blocking.length}）`,
            );
            expect(blocking, JSON.stringify(blocking, null, 2)).toHaveLength(0);
        });
    }

    test("prefers-reduced-motion：运行中动画 0", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await open404(page, "light", VIEWPORTS[0]);
        const running = await page.evaluate(
            () => document.getAnimations().filter((a) => a.playState === "running").length,
        );
        console.log(`[404] reduced-motion 运行中动画 = ${running}`);
        expect(running).toBe(0);
    });
});

test.describe("404 · 证据截图", () => {
    test.skip(process.env.NF404_SHOTS !== "1", "set NF404_SHOTS=1 to capture");

    for (const theme of THEMES) {
        for (const viewport of VIEWPORTS) {
            test(`404-${theme}-${viewport.width}`, async ({ page }) => {
                await open404(page, theme, viewport);
                if (!existsSync(SCREENS_DIR)) mkdirSync(SCREENS_DIR, { recursive: true });
                const target = path.join(SCREENS_DIR, `404-${theme}-${viewport.width}.png`);
                await page.screenshot({ path: target, fullPage: true, animations: "disabled" });
                console.log(`[shot] ${target}`);
                expect(existsSync(target)).toBe(true);
            });
        }
    }
});
