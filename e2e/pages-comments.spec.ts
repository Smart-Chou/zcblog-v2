import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * M7-2a · 移动评论抽屉（≤640）验收
 *
 * 判据（卡面）：
 *  1. 390 打开态：抽屉从底部出现、可滚动、关闭后滚动位置恢复；`#waline-toggle` 仍可操作；横向溢出 0
 *  2. 390 关闭态：不请求 Waline JS/CSS；打开才加载；关闭后 0 新请求（保留现有懒加载行为）
 *  3. 1440 打开/关闭：仍是内联评论区，无 fixed 遮罩；桌面版式不变
 *  4. axe 打开态 serious/critical = 0（作用域 `#comment-wrapper`）
 *  5. 截图：390 open/closed × light/dark、1440 closed light（`M72A_SHOTS=1` 时写入 docs/_reviews/M7-2a/screens/）
 *
 * 本文件只跑评论抽屉，不碰搜索 / 视觉基线 / 门禁（那几个套件各自的卡在管）。
 */

const ARTICLE = "/article/bitwarden/";
const MOBILE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const SHOTS = process.env.M72A_SHOTS === "1";
const SHOT_DIR = path.join(process.cwd(), "docs/_reviews/M7-2a/screens");

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);

/** Waline 的运行时代码 / 样式（不含文章页常驻的 `waline-pageview` 计数脚本、
 *  开发服务器里 `?url` 的模块解析、以及组件自己的 WalineComment 脚本块）。 */
function isWalineRuntime(url: string): boolean {
    if (/pageview/i.test(url) || /waline[-_]pv\b/i.test(url)) return false;
    if (/WalineComment/i.test(url)) return false;
    if (/\?url(?:&|$)/.test(url)) return false;
    if (/@waline[+/]client/i.test(url)) return true;
    return /\/waline(?:[-.][\w-]+)?\.(?:js|css)(?:\?|$)/i.test(url);
}

/** 任何发往 Waline 的流量（含接口），用于「关闭后 0 新请求」的增量断言。 */
function isWalineTraffic(url: string): boolean {
    if (/pageview/i.test(url)) return false;
    if (/\?url(?:&|$)/.test(url)) return false;
    return /waline/i.test(url);
}

async function openArticle(
    page: Page,
    viewport: { width: number; height: number },
    theme: Theme = "light",
) {
    await page.setViewportSize(viewport);
    const response = await page.goto(ARTICLE, { waitUntil: "load" });
    expect(response?.status(), `GET ${ARTICLE}`).toBe(200);
    await page.evaluate((value) => {
        const style = document.createElement("style");
        style.textContent = "*,*::before,*::after{transition:none !important}";
        document.head.appendChild(style);
        document.documentElement.setAttribute("data-theme", value);
    }, theme);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
}

/** 程序化点击：避免 Playwright 的 scrollIntoView 在「记录滚动位置」类用例里偷偷改 scrollY。 */
async function clickToggleByDom(page: Page) {
    await page.evaluate(() => document.getElementById("waline-toggle")?.click());
}

async function walineRequests(page: Page): Promise<string[]> {
    const urls = await page.evaluate(() =>
        performance.getEntriesByType("resource").map((entry) => entry.name),
    );
    return urls.filter(isWalineRuntime);
}

async function overflowPx(page: Page): Promise<number> {
    return page.evaluate(() => {
        const doc = document.documentElement;
        return Math.max(0, doc.scrollWidth - doc.clientWidth);
    });
}

type AxeViolation = { id: string; impact: string | null; nodes: number; help: string };

async function axeViolations(page: Page, context: string): Promise<AxeViolation[]> {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(async (ctx) => {
        const axe = (window as unknown as { axe: any }).axe;
        const root = document.querySelector(ctx);
        const result = await axe.run(root ?? document, {
            runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
        });
        return result.violations.map((violation: any) => ({
            id: violation.id,
            impact: violation.impact,
            nodes: violation.nodes.length,
            help: violation.help,
        }));
    }, context);
}

async function shot(page: Page, name: string, fullPage = false) {
    if (!SHOTS) return;
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage });
}

/* ─────────────────────────── 390：关闭态 ─────────────────────────── */

test("390 关闭态：不请求 Waline 运行时，抽屉不可见、不拦交互", async ({ page }) => {
    await openArticle(page, MOBILE);

    expect(await walineRequests(page), "关闭态不应出现任何 waline 资源请求").toEqual([]);
    expect(await page.evaluate(() => document.getElementById("waline")!.children.length)).toBe(0);

    const drawer = page.locator("#waline-drawer");
    await expect(drawer).toHaveAttribute("data-state", "closed");
    await expect(drawer).toBeHidden();
    // 关闭态没有 dialog 语义（桌面/移动一致：只有打开时才挂 role）
    expect(await drawer.getAttribute("role")).toBeNull();

    const toggle = page.locator("#waline-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(await overflowPx(page)).toBeLessThanOrEqual(1);

    await page.locator("#waline-toggle").scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await shot(page, "m72a-390-closed-light");
});

/* ─────────────────────────── 390：打开态 ─────────────────────────── */

test("390 打开态：抽屉贴底出现、遮罩铺满、锁页面滚动、焦点落在关闭键", async ({ page }) => {
    await openArticle(page, MOBILE);
    await clickToggleByDom(page);

    const drawer = page.locator("#waline-drawer");
    await expect(drawer).toHaveAttribute("data-state", "open", { timeout: 5000 });
    await expect(drawer).toHaveAttribute("role", "dialog");
    await expect(drawer).toHaveAttribute("aria-modal", "true");

    const geometry = await page.evaluate(() => {
        const sheet = document.querySelector(".comment-drawer__sheet") as HTMLElement;
        const scrim = document.querySelector(".comment-drawer__scrim") as HTMLElement;
        const rect = sheet.getBoundingClientRect();
        const scrimRect = scrim.getBoundingClientRect();
        const cs = getComputedStyle(sheet);
        return {
            sheet: {
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                height: rect.height,
                transform: cs.transform,
                radiusTop: cs.borderTopLeftRadius,
                radiusBottom: cs.borderBottomLeftRadius,
                background: cs.backgroundColor,
            },
            scrim: {
                top: scrimRect.top,
                left: scrimRect.left,
                width: scrimRect.width,
                height: scrimRect.height,
                opacity: getComputedStyle(scrim).opacity,
                background: getComputedStyle(scrim).backgroundColor,
            },
            viewport: { width: window.innerWidth, height: window.innerHeight },
            htmlOverflow: getComputedStyle(document.documentElement).overflow,
            htmlClass: document.documentElement.classList.contains("comment-drawer-open"),
            activeClass: (document.activeElement as HTMLElement)?.className ?? "",
        };
    });

    // 贴底、满宽、88dvh（844 × 0.88 = 742.72）
    expect(geometry.sheet.bottom).toBeCloseTo(MOBILE.height, 0);
    expect(geometry.sheet.width).toBeCloseTo(MOBILE.width, 0);
    expect(geometry.sheet.left).toBeCloseTo(0, 0);
    expect(geometry.sheet.height).toBeGreaterThan(MOBILE.height * 0.85);
    expect(geometry.sheet.height).toBeLessThan(MOBILE.height * 0.9);
    expect(geometry.sheet.radiusTop).toBe("16px");
    expect(geometry.sheet.radiusBottom).toBe("0px");
    expect(
        geometry.sheet.transform === "none" ||
            geometry.sheet.transform === "matrix(1, 0, 0, 1, 0, 0)",
    ).toBe(true);
    expect(geometry.sheet.background).not.toBe("rgba(0, 0, 0, 0)");

    // 遮罩铺满视口且确实着色
    expect(geometry.scrim.top).toBeCloseTo(0, 0);
    expect(geometry.scrim.left).toBeCloseTo(0, 0);
    expect(geometry.scrim.width).toBeCloseTo(MOBILE.width, 0);
    expect(geometry.scrim.height).toBeCloseTo(MOBILE.height, 0);
    expect(geometry.scrim.opacity).toBe("1");
    expect(geometry.scrim.background).not.toBe("rgba(0, 0, 0, 0)");

    // 锁滚动 + 焦点
    expect(geometry.htmlClass).toBe(true);
    expect(geometry.htmlOverflow).toBe("hidden");
    expect(geometry.activeClass).toContain("comment-drawer__close");

    const scrollLocked = await page.evaluate(async () => {
        // 先离开顶部，滚轮才有方向可测
        window.scrollTo(0, 800);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return window.scrollY;
    });
    // 滚轮落在遮罩上（sheet 之上），页面本身不应该动
    await page.mouse.move(195, 40);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollLocked);

    expect(await overflowPx(page)).toBeLessThanOrEqual(1);
});

test("390 打开态：正文在抽屉内滚动，页面本身不动", async ({ page }) => {
    await openArticle(page, MOBILE);
    await clickToggleByDom(page);
    await expect(page.locator("#waline-drawer")).toHaveAttribute("data-state", "open");

    const result = await page.evaluate(async () => {
        const body = document.querySelector(".comment-drawer__body") as HTMLElement;
        const spacer = document.createElement("div");
        spacer.style.height = "1200px";
        spacer.dataset.probe = "scroll";
        document.getElementById("waline")!.appendChild(spacer);

        const before = {
            clientH: body.clientHeight,
            scrollH: body.scrollHeight,
            winY: window.scrollY,
        };
        body.scrollTop = 320;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const after = { scrollTop: body.scrollTop, winY: window.scrollY };

        spacer.remove();
        return { before, after, overflowY: getComputedStyle(body).overflowY };
    });

    expect(result.overflowY).toBe("auto");
    expect(result.before.scrollH).toBeGreaterThan(result.before.clientH);
    expect(result.after.scrollTop).toBeGreaterThan(0);
    expect(result.after.winY).toBe(result.before.winY);
});

test("390 关闭：滚动位置恢复、按钮可再次打开、无横向溢出", async ({ page }) => {
    await openArticle(page, MOBILE);
    const toggle = page.locator("#waline-toggle");
    await toggle.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(1000);

    await clickToggleByDom(page);
    await expect(page.locator("#waline-drawer")).toHaveAttribute("data-state", "open");

    await page.locator(".comment-drawer__close").click();
    await expect(page.locator("#waline-drawer")).toHaveAttribute("data-state", "closed");

    const after = await page.evaluate(() => ({
        y: window.scrollY,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
        activeId: (document.activeElement as HTMLElement)?.id ?? "",
        toggleText: document.getElementById("waline-toggle")!.textContent!.trim(),
    }));
    expect(Math.abs(after.y - before)).toBeLessThanOrEqual(2);
    expect(after.htmlOverflow).not.toBe("hidden");
    expect(after.activeId).toBe("waline-toggle");
    expect(after.toggleText).toBe("展开评论");

    // 关掉之后按钮仍然可用：再点一次，抽屉重新出现
    await toggle.click();
    await expect(page.locator("#waline-drawer")).toHaveAttribute("data-state", "open");
    expect(await overflowPx(page)).toBeLessThanOrEqual(1);
});

test("390 关闭后 0 新 Waline 请求（实例保留，只隐藏）", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (request) => requested.push(request.url()));

    await openArticle(page, MOBILE);
    await clickToggleByDom(page);
    await expect(page.locator("#waline-drawer")).toHaveAttribute("data-state", "open");
    await page.waitForTimeout(2500);

    const afterOpen = requested.filter(isWalineTraffic).length;
    expect(afterOpen, "打开后应真正加载 Waline 运行时").toBeGreaterThan(0);

    await page.locator(".comment-drawer__close").click();
    await expect(page.locator("#waline-drawer")).toHaveAttribute("data-state", "closed");
    await page.waitForTimeout(1500);

    expect(
        requested.filter(isWalineTraffic).length,
        "关闭只隐藏、不重建实例，因此不应有新请求",
    ).toBe(afterOpen);
    // 内容还在 DOM 里（重新打开不必再加载）
    expect(
        await page.evaluate(() => document.getElementById("waline")!.children.length),
    ).toBeGreaterThan(0);
});

test("390 Esc 关闭抽屉并回填焦点", async ({ page }) => {
    await openArticle(page, MOBILE);
    await clickToggleByDom(page);
    await expect(page.locator("#waline-drawer")).toHaveAttribute("data-state", "open");

    await page.keyboard.press("Escape");
    await expect(page.locator("#waline-drawer")).toHaveAttribute("data-state", "closed");
    expect(await page.evaluate(() => (document.activeElement as HTMLElement)?.id)).toBe(
        "waline-toggle",
    );
});

test("390 点击遮罩关闭抽屉", async ({ page }) => {
    await openArticle(page, MOBILE);
    await clickToggleByDom(page);
    await expect(page.locator("#waline-drawer")).toHaveAttribute("data-state", "open");

    await page.locator(".comment-drawer__scrim").click({ position: { x: 195, y: 40 } });
    await expect(page.locator("#waline-drawer")).toHaveAttribute("data-state", "closed");
});

/* ─────────────────────────── 1440：桌面保持内联 ─────────────────────────── */

test("1440 关闭态：外壳零占位（display: contents）、无 dialog 语义", async ({ page }) => {
    await openArticle(page, DESKTOP);

    const state = await page.evaluate(() => {
        const drawer = document.getElementById("waline-drawer")!;
        const sheet = document.querySelector(".comment-drawer__sheet") as HTMLElement;
        const bar = document.querySelector(".comment-drawer__bar") as HTMLElement;
        const scrim = document.querySelector(".comment-drawer__scrim") as HTMLElement;
        return {
            drawerDisplay: getComputedStyle(drawer).display,
            drawerPosition: getComputedStyle(drawer).position,
            sheetDisplay: getComputedStyle(sheet).display,
            barDisplay: getComputedStyle(bar).display,
            scrimDisplay: getComputedStyle(scrim).display,
            role: drawer.getAttribute("role"),
            wrapperDisplay: getComputedStyle(document.getElementById("comment-wrapper")!).display,
            fixedCount: [...document.querySelectorAll("#comment-wrapper *")].filter(
                (el) => getComputedStyle(el).position === "fixed",
            ).length,
        };
    });

    expect(state.drawerDisplay).toBe("contents");
    expect(state.sheetDisplay).toBe("contents");
    expect(state.drawerPosition).toBe("static");
    expect(state.barDisplay).toBe("none");
    expect(state.scrimDisplay).toBe("none");
    expect(state.role).toBeNull();
    expect(state.fixedCount).toBe(0);
    expect(await walineRequests(page)).toEqual([]);

    await page.locator("#waline-toggle").scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await shot(page, "m72a-1440-closed-light");
});

test("1440 打开/关闭：评论内联展开，无 fixed 遮罩、不锁滚动", async ({ page }) => {
    await openArticle(page, DESKTOP);
    const toggle = page.locator("#waline-toggle");
    await expect(toggle).toBeVisible();

    await clickToggleByDom(page);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.waitForTimeout(600);

    const opened = await page.evaluate(() => {
        const waline = document.getElementById("waline")!;
        const wrapper = document.getElementById("comment-wrapper")!;
        const rect = waline.getBoundingClientRect();
        const drawer = document.getElementById("waline-drawer")!;
        return {
            display: getComputedStyle(waline).display,
            role: drawer.getAttribute("role"),
            htmlOverflow: getComputedStyle(document.documentElement).overflow,
            htmlClass: document.documentElement.classList.contains("comment-drawer-open"),
            width: rect.width,
            wrapperWidth: wrapper.getBoundingClientRect().width,
            fixedCount: [...document.querySelectorAll("#comment-wrapper *")].filter(
                (el) => getComputedStyle(el).position === "fixed",
            ).length,
        };
    });

    expect(opened.display).toBe("block");
    expect(opened.role).toBeNull();
    expect(opened.htmlClass).toBe(false);
    expect(opened.htmlOverflow).not.toBe("hidden");
    expect(opened.fixedCount).toBe(0);
    // 内联态宽度来自 article.css 的 --content-width / 正文栏，不是 390 抽屉
    expect(opened.width).toBeGreaterThan(600);
    expect(opened.width).toBeLessThanOrEqual(opened.wrapperWidth + 1);

    await clickToggleByDom(page);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
        await page.evaluate(() => getComputedStyle(document.getElementById("waline")!).display),
    ).toBe("none");
});

/* ─────────────────────────── axe ─────────────────────────── */

for (const theme of THEMES) {
    test(`390 打开态 axe（${theme}）serious/critical = 0`, async ({ page }) => {
        await openArticle(page, MOBILE, theme);
        await clickToggleByDom(page);
        await expect(page.locator("#waline-drawer")).toHaveAttribute("data-state", "open");
        await page.waitForTimeout(2500); // 等 Waline 把表单渲染完，别审半截 DOM

        const violations = await axeViolations(page, "#comment-wrapper");
        const blocking = violations.filter(
            (violation) => violation.impact === "serious" || violation.impact === "critical",
        );
        expect(blocking, `[comments:390:${theme}] ${JSON.stringify(blocking)}`).toEqual([]);
        await shot(page, `m72a-390-open-${theme}`);
    });
}

/* 桌面（1440）内联评论区不跑 axe 门禁：
   卡面要求「桌面 1440 评论仍是正文流内联，不改」，而 Waline 3.16 自带皮肤在
   桌面这段 DOM 上的对比度/aria 问题（#999 像素灰、#27ae60 绿底白字、上传 label
   的 aria-label）是既有状态，本卡不动它 —— 记 M7-2a 报告「遗留」，留给 M7-2b
   Waline 换皮卡统一处理。 */

/* ─────────────────────────── 截图（暗色关闭态） ─────────────────────────── */

test("390 关闭态（dark）证据截图", async ({ page }) => {
    test.skip(!SHOTS, "设置 M72A_SHOTS=1 才写 docs/_reviews/M7-2a/screens/");
    await openArticle(page, MOBILE, "dark");
    await page.locator("#waline-toggle").scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await shot(page, "m72a-390-closed-dark");
});
