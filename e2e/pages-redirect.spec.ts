import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * P-RD · 跳转守卫单页视觉验收（M6-5b · Stitch v2 · redirect_guard_modal 桌面 / redirect_guard 移动）
 *
 * 判据（卡面 §验收）：
 *  1. `/redirect/` 200；恰好 1 个 <h1>，标题层级不跳级
 *  2. 有效目标：`[data-overlay="redirect"]` 存在 1 个，倒计时芯片出现，CTA 可点
 *  3. 黑名单目标：CTA disabled，判定牌 = 黑名单
 *  4. 解析失败：不白屏 —— 退出打开态（0 个 [data-overlay]）、兜底面板可见、标题仍在
 *  5. 零 JS：标题 + 「留在本站」链接 + noscript 说明可读，CTA 不出场（死按钮 = 骗点击）
 *  6. 键盘：Esc / 关闭键都能取消并停表，焦点回填到「返回首页」
 *  7. 1440 / 1024 / 390 × light/dark：无横向溢出，axe serious/critical = 0
 *  8. prefers-reduced-motion：运行中动画 0
 *
 * 截图默认跳过（`RG_SHOTS=1` 时写入 docs/_reviews/M6-5b/screens/）。
 */

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);

const b64 = (url: string) => Buffer.from(url).toString("base64url");

const TRUSTED = `/redirect/?url=${b64("https://github.com/Smart-Chou/zcblog")}`;
const BLACKLISTED = `/redirect/?url=${b64("https://item.taobao.com/item.htm?id=1")}`;
const UNLISTED = `/redirect/?url=${b64("https://example.com/some/path")}`;
const BROKEN = "/redirect/?url=bbb";

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [
    { width: 1440, height: 900 },
    { width: 1024, height: 900 },
    { width: 390, height: 844 },
] as const;
type Theme = (typeof THEMES)[number];

const SCREENS_DIR = path.join(process.cwd(), "docs/_reviews/M6-5b/screens");

async function open(
    page: Page,
    url: string,
    theme: Theme = "light",
    viewport?: { width: number; height: number },
) {
    if (viewport) await page.setViewportSize(viewport);
    const response = await page.goto(url, { waitUntil: "load" });
    expect(response?.status(), `GET ${url}`).toBe(200);
    await page.evaluate((value) => {
        /**
         * 主题切换必须先关掉 transition：站点给 color / background-color 配了
         * --duration-fast 过渡，setAttribute 之后立刻取色会拿到半截状态，
         * axe 会据此报出真实页面不存在的配色组合。
         */
        const style = document.createElement("style");
        style.textContent = "*,*::before,*::after{transition:none !important}";
        document.head.appendChild(style);
        document.documentElement.setAttribute("data-theme", value);
    }, theme);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
}

async function overflowPx(page: Page): Promise<number> {
    return page.evaluate(() => {
        const doc = document.documentElement;
        return Math.max(0, doc.scrollWidth - doc.clientWidth);
    });
}

test.describe("redirect · 结构与协议", () => {
    test("恰好 1 个 h1，标题层级不跳级", async ({ page }) => {
        await open(page, TRUSTED, "light", VIEWPORTS[0]);
        await expect(page.locator(".rg")).toHaveCount(1);
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.locator(".rg__title")).toContainText("即将离开");

        const levels = await page.evaluate(() =>
            [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((node) =>
                Number(node.tagName.slice(1)),
            ),
        );
        for (let i = 1; i < levels.length; i += 1) {
            expect(
                levels[i] - levels[i - 1],
                `标题层级跳级：${levels.join(" → ")}`,
            ).toBeLessThanOrEqual(1);
        }
    });

    test("白名单目标：打开态 + 5 秒倒计时 + CTA 可点", async ({ page }) => {
        await open(page, TRUSTED, "light", VIEWPORTS[0]);
        await expect(page.locator('[data-overlay="redirect"]')).toHaveCount(1);
        await expect(page.locator("#url")).toHaveText("https://github.com/Smart-Chou/zcblog");
        await expect(page.locator("#rg-host")).toHaveText("github.com");
        await expect(page.locator("#rg-verdict")).toHaveText("已验证");
        await expect(page.locator("#site-info")).toContainText("信任网址");

        // 倒计时芯片：从 5 开始逐秒递减（只断言「出现且是数字」，避免和 CI 慢机器抢时间）
        await expect(page.locator("#rg-count")).toBeVisible();
        await expect(page.locator("#rg-count")).toHaveText(/^\d+s$/);
        const first = await page.locator("#rg-count").textContent();
        await expect(page.locator("#jump-button")).toBeEnabled();

        // 停表，别让 5 秒后真的导航走掉
        await page.keyboard.press("Escape");
        await expect(page.locator('[data-overlay="redirect"]')).toHaveCount(0);
        expect(first).toMatch(/^\d+s$/);
    });

    test("黑名单目标：CTA disabled 且判定牌为黑名单", async ({ page }) => {
        await open(page, BLACKLISTED, "light", VIEWPORTS[0]);
        await expect(page.locator('[data-overlay="redirect"]')).toHaveCount(1);
        await expect(page.locator("#rg-verdict")).toHaveText("黑名单");
        await expect(page.locator("#site-info")).toContainText("黑名单");
        await expect(page.locator("#jump-button")).toBeDisabled();
        await expect(page.locator("#rg-count")).toBeHidden();
        await expect(page.locator(".rg")).toHaveAttribute("data-state", "danger");
    });

    test("非白非黑：可点但不自动跳（无倒计时芯片）", async ({ page }) => {
        await open(page, UNLISTED, "light", VIEWPORTS[0]);
        await expect(page.locator('[data-overlay="redirect"]')).toHaveCount(1);
        await expect(page.locator("#rg-verdict")).toHaveText("未验证");
        await expect(page.locator("#jump-button")).toBeEnabled();
        await expect(page.locator("#rg-count")).toBeHidden();
    });

    test("解析失败：不白屏，退出打开态并露出兜底面板", async ({ page }) => {
        await open(page, BROKEN, "light", VIEWPORTS[0]);
        await expect(page.locator("[data-overlay]")).toHaveCount(0);
        await expect(page.locator(".rg")).toHaveAttribute("data-state", "error");
        await expect(page.locator(".rg__title")).toHaveText("这个跳转地址无法解析");
        await expect(page.locator(".rg__fallback--error")).toBeVisible();
        await expect(page.locator("#rg-fallback-home")).toBeVisible();
        await expect(page.locator("#rg-fallback-home")).toBeFocused();
        // 兜底态不该还挂着一个可点的「继续前往」
        await expect(page.locator("#jump-button")).toBeHidden();
        // 页面不是白的：主体仍有可读文本
        expect((await page.locator(".rg").innerText()).length).toBeGreaterThan(80);
    });

    test("零 JS：标题 / 留在本站 / noscript 说明可读，CTA 不出场", async ({ browser }) => {
        const context = await browser.newContext({ javaScriptEnabled: false });
        const page = await context.newPage();
        const response = await page.goto(TRUSTED, { waitUntil: "load" });
        expect(response?.status()).toBe(200);

        await expect(page.locator("h1")).toContainText("即将离开");
        await expect(page.locator(".rg__lede")).not.toBeEmpty();
        await expect(page.locator("#rg-stay")).toBeVisible();
        await expect(page.locator("#rg-stay")).toHaveAttribute("href", "/");
        await expect(page.locator(".rg__notes-list li")).toHaveCount(3);
        await expect(page.locator(".rg__noscript")).toContainText("JavaScript");
        // CTA 带 hidden：零 JS 时「继续前往」不会出现（否则是个点不动的按钮）
        await expect(page.locator("#jump-button")).toBeHidden();
        await context.close();
    });
});

test.describe("redirect · 键盘与焦点", () => {
    test("Esc：取消跳转、停表、焦点回填到返回首页", async ({ page }) => {
        await open(page, TRUSTED, "light", VIEWPORTS[0]);
        await expect(page.locator("#rg-count")).toBeVisible();
        await page.keyboard.press("Escape");

        await expect(page.locator("[data-overlay]")).toHaveCount(0);
        await expect(page.locator(".rg")).toHaveAttribute("data-state", "dismissed");
        await expect(page.locator(".rg__title")).toHaveText("已留在本站");
        await expect(page.locator(".rg__fallback--dismissed")).toBeVisible();
        const focusedId = await page.evaluate(() => document.activeElement?.id ?? "");
        expect(focusedId, "焦点应回填到取消态的首页链接").toBe("rg-fallback-home-dismissed");

        // 停表：再过 6 秒也不该导航走（页面仍在 /redirect/）
        await page.waitForTimeout(6000);
        expect(new URL(page.url()).pathname).toContain("/redirect/");
    });

    test("关闭键与 Esc 等价", async ({ page }) => {
        await open(page, UNLISTED, "light", VIEWPORTS[0]);
        await page.locator("#rg-close").click();
        await expect(page.locator(".rg")).toHaveAttribute("data-state", "dismissed");
        await expect(page.locator("#rg-fallback-home-dismissed")).toBeFocused();
    });
});

test.describe("redirect · 版面与可访问性", () => {
    for (const theme of THEMES) {
        test(`无横向溢出 + axe（${theme}）`, async ({ page }) => {
            for (const viewport of VIEWPORTS) {
                await open(page, UNLISTED, theme, viewport);
                const overflow = await overflowPx(page);
                console.log(`[redirect:${theme}] ${viewport.width}px 横向溢出 = ${overflow}px`);
                expect(overflow, `${viewport.width}px · ${theme} 无横向溢出`).toBeLessThanOrEqual(
                    1,
                );
            }

            // axe 作用域 = 守卫卡 `.rg`：外壳 header/footer 的对比度与品牌块属 M6-1 共享层，
            // 不在本卡 3 文件边界内（M6-5a 同口径）。
            await open(page, UNLISTED, theme, VIEWPORTS[0]);
            await page.addScriptTag({ content: AXE_SOURCE });
            const result = await page.evaluate(async () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const axe = (window as any).axe;
                const surface = document.querySelector(".rg") as HTMLElement;
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
                `[redirect:${theme}] axe ${result.violations.length} violations（serious/critical = ${blocking.length}）`,
            );
            expect(blocking, JSON.stringify(blocking, null, 2)).toHaveLength(0);
        });
    }

    test("解析失败态同样无 serious/critical（兜底面板）", async ({ page }) => {
        await open(page, BROKEN, "light", VIEWPORTS[0]);
        await page.addScriptTag({ content: AXE_SOURCE });
        const result = await page.evaluate(async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const axe = (window as any).axe;
            const surface = document.querySelector(".rg") as HTMLElement;
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
        expect(blocking, JSON.stringify(blocking, null, 2)).toHaveLength(0);
    });

    test("prefers-reduced-motion：运行中动画 0", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await open(page, UNLISTED, "light", VIEWPORTS[0]);
        const running = await page.evaluate(
            () =>
                document
                    .querySelector(".rg")!
                    .getAnimations({ subtree: true })
                    .filter((a) => a.playState === "running").length,
        );
        console.log(`[redirect] reduced-motion 运行中动画 = ${running}`);
        expect(running).toBe(0);
    });
});

test.describe("redirect · 证据截图", () => {
    test.skip(process.env.RG_SHOTS !== "1", "set RG_SHOTS=1 to capture");

    for (const theme of THEMES) {
        for (const viewport of VIEWPORTS) {
            test(`redirect-${theme}-${viewport.width}`, async ({ page }) => {
                await open(page, UNLISTED, theme, viewport);
                // 截图前停表，避免 5 秒后自动跳走
                await page.evaluate(() => {
                    document
                        .querySelectorAll<HTMLElement>("#jump-button")
                        .forEach((el) => el.blur());
                });
                if (!existsSync(SCREENS_DIR)) mkdirSync(SCREENS_DIR, { recursive: true });
                const target = path.join(SCREENS_DIR, `redirect-${theme}-${viewport.width}.png`);
                await page.screenshot({ path: target, fullPage: true, animations: "disabled" });
                console.log(`[shot] ${target}`);
                expect(existsSync(target)).toBe(true);
            });
        }
    }

    // 两个非默认态也要有证据：解析失败（兜底面板）与用户取消（焦点回填后的样子）
    for (const [name, url, action] of [
        ["error", BROKEN, async () => {}],
        ["dismissed", UNLISTED, async (page: Page) => page.keyboard.press("Escape")],
    ] as const) {
        test(`redirect-${name}-light-1440`, async ({ page }) => {
            await open(page, url, "light", VIEWPORTS[0]);
            await action(page);
            if (!existsSync(SCREENS_DIR)) mkdirSync(SCREENS_DIR, { recursive: true });
            const target = path.join(SCREENS_DIR, `redirect-${name}-light-1440.png`);
            await page.screenshot({ path: target, fullPage: true, animations: "disabled" });
            console.log(`[shot] ${target}`);
            expect(existsSync(target)).toBe(true);
        });
    }
});
