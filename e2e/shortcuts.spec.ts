import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * M7-5a 验收：全站快捷键速查 dialog（`?` / Ctrl-Cmd + /）。
 *
 * 口径（写死，评审时别重新解释）：
 *  · 打开态唯一判据 = `[data-overlay="shortcuts"]` 存在且是 `#shortcut-help` 这个原生 dialog；
 *  · 「关闭态 0 请求」= 落地后 900ms 静默窗口内没有 `_astro/(overlay|shortcuts)*.js` 请求；
 *  · 「0 布局偏移」= PerformanceObserver 的 layout-shift 累计（排除 recentInput）< 0.01；
 *  · axe 扫打开态子树，serious/critical = 0 且 incomplete = 0（浮层缺陷只有开着才扫得到）。
 */

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SHOTS = path.join(process.cwd(), "docs/_reviews/M7-5a/screens");
const DIALOG = "#shortcut-help";
const OPEN = '[data-overlay="shortcuts"]';
const CHUNK = /\/_astro\/(overlay|shortcuts)[\w-]*\.[\w-]+\.js/;

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

async function watchCls(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const w = window as unknown as { __cls?: number };
        w.__cls = 0;
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as PerformanceEntry[]) {
                const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
                if (!shift.hadRecentInput) w.__cls = (w.__cls ?? 0) + shift.value;
            }
        }).observe({ type: "layout-shift", buffered: true });
    });
}

const cls = (page: Page) =>
    page.evaluate(() => (window as unknown as { __cls?: number }).__cls ?? 0);

async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function axeOpenState(page: Page) {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(
        async ([selector, tags]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (window as any).axe.run(selector, {
                runOnly: { type: "tag", values: tags },
            });
            const hard = (list: { impact?: string }[]) =>
                list.filter((v) => v.impact === "serious" || v.impact === "critical").length;
            return {
                serious: hard(result.violations),
                violations: result.violations.map((v: { id: string }) => v.id),
                incomplete: result.incomplete.length,
                incompleteIds: result.incomplete.map((v: { id: string }) => v.id),
                incompleteTargets: result.incomplete.flatMap(
                    (v: { id: string; nodes: { target: string[] }[] }) =>
                        v.nodes.map((n) => `${v.id}:${n.target.join(" ")}`),
                ),
            };
        },
        [OPEN, TAGS] as const,
    );
}

const isOpen = (page: Page) =>
    page.evaluate(() => {
        const dialog = document.getElementById("shortcut-help") as HTMLDialogElement | null;
        return !!dialog?.open;
    });

/* ───────────────── 1. 关闭态：0 请求 / 0 标记 / 0 偏移 ───────────────── */

test("关闭态：dialog 关闭、0 个 [data-overlay]、不下载 shortcuts/overlay chunk、CLS=0", async ({
    page,
}) => {
    await watchCls(page);
    const seen: string[] = [];
    page.on("request", (request) => seen.push(request.url()));
    await page.goto("/", { waitUntil: "load" });
    await page.waitForTimeout(900);

    expect(await page.locator("[data-overlay]").count()).toBe(0);
    expect(await page.locator(DIALOG).isVisible()).toBe(false);
    expect(seen.filter((url) => CHUNK.test(url)), "关闭态不该下载速查 chunk").toEqual([]);
    expect(await cls(page), "关闭态 0 布局偏移").toBeLessThan(0.01);

    await page.screenshot({ path: path.join(SHOTS, "shortcuts-closed-1440.png") });
});

/* ───────────────── 2. `?` 打开 / 结构 / 焦点 / Esc 回焦 ───────────────── */

test("1440：`?` 打开 dialog（role/aria、焦点入内、0 偏移），Esc 关闭并回焦", async ({ page }) => {
    await watchCls(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });
    await page.locator("#nav-menu-btn").focus();
    await page.keyboard.press("?");

    await expect(page.locator(DIALOG)).toBeVisible();
    expect(await isOpen(page)).toBe(true);
    await expect(page.locator(OPEN)).toHaveAttribute("aria-modal", "true");
    await expect(page.locator(DIALOG)).toHaveAttribute("role", "dialog");
    await expect(page.locator(DIALOG)).toHaveAttribute("aria-labelledby", "shortcut-help-title");
    expect(
        await page.evaluate(() => {
            const dialog = document.getElementById("shortcut-help")!;
            return !!document.activeElement && dialog.contains(document.activeElement);
        }),
        "打开后焦点必须在 dialog 内",
    ).toBe(true);
    expect(await page.locator(`${DIALOG} .ovl__row`).count()).toBeGreaterThanOrEqual(5);
    // 快捷键条目必须是键帽，而不是纯文本
    expect(await page.locator(`${DIALOG} kbd.ovl__kbd`).count()).toBeGreaterThanOrEqual(5);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, "shortcuts-1440-light.png") });

    await page.keyboard.press("Escape");
    await expect(page.locator(OPEN)).toHaveCount(0);
    expect(await isOpen(page)).toBe(false);
    expect(await page.evaluate(() => document.activeElement?.id), "焦点回填到触发按钮").toBe(
        "nav-menu-btn",
    );
    expect(await cls(page), "开合全过程 0 布局偏移").toBeLessThan(0.01);
});

/* ───────────────── 3. Ctrl/Cmd + / ───────────────── */

test("1440：Ctrl/Cmd + / 也能打开，且与 `?` 不会同时开出两块面板", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });
    await page.keyboard.press("ControlOrMeta+/");
    await expect(page.locator(DIALOG)).toBeVisible();
    await expect(page.locator(OPEN)).toHaveCount(1);
    // 旧速查 sheet（overlay-sheets.ts）也带 [data-overlay="shortcuts"] —— 只能有一块
    expect(await page.locator(".ovl:not(#shortcut-help)").count()).toBe(0);

    await page.keyboard.press("Escape");
    await expect(page.locator(OPEN)).toHaveCount(0);

    await page.keyboard.press("?");
    await expect(page.locator(OPEN)).toHaveCount(1);
    expect(await page.locator(".ovl").count(), "窗口捕获层已截断 overlay.ts 的 `?` 分支").toBe(0);
});

/* ───────────────── 4. 三条关闭路径都回焦 ───────────────── */

for (const how of ["esc", "close", "scrim"] as const) {
    test(`关闭路径 ${how}：关闭 dialog 并把焦点还给触发元素`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("/", { waitUntil: "load" });
        await page.locator("[data-share-action='wechat']").count();
        await page.evaluate(() => document.getElementById("nav-menu-btn")?.focus());
        await page.keyboard.press("?");
        await expect(page.locator(DIALOG)).toBeVisible();

        if (how === "esc") await page.keyboard.press("Escape");
        if (how === "close") await page.locator("[data-shortcut-close]").click();
        if (how === "scrim") await page.mouse.click(8, 8);

        await expect(page.locator(OPEN)).toHaveCount(0);
        expect(await isOpen(page)).toBe(false);
        expect(await page.evaluate(() => document.activeElement?.id)).toBe("nav-menu-btn");
        expect(
            await page.evaluate(() => document.documentElement.style.overflow),
            "滚动锁已解除",
        ).toBe("");
    });
}

/* ───────────────── 5. 输入框内不抢键 ───────────────── */

test("输入框内输入 `?` 不打开 dialog（input / textarea / contenteditable / 站内搜索框）", async ({
    page,
}) => {
    await page.goto("/", { waitUntil: "load" });
    await page.evaluate(() => {
        const host = document.createElement("div");
        host.id = "probe-host";
        host.style.cssText = "position:fixed;inset:40px auto auto 40px;z-index:99999;background:#fff";
        host.innerHTML =
            '<input id="probe-input" type="text" aria-label="probe input">' +
            '<textarea id="probe-textarea" aria-label="probe textarea"></textarea>' +
            '<div id="probe-editable" contenteditable="true" role="textbox" aria-label="probe editable" style="min-height:20px;border:1px solid #000"></div>';
        document.body.appendChild(host);
    });

    for (const selector of ["#probe-input", "#probe-textarea", "#probe-editable"]) {
        await page.locator(selector).click();
        await page.keyboard.type("?");
        await expect(page.locator(DIALOG)).not.toBeVisible();
        expect(
            await page.evaluate((sel) => {
                const el = document.querySelector(sel) as HTMLElement;
                return el.isContentEditable ? el.textContent : (el as HTMLInputElement).value;
            }, selector),
            `${selector} 应完整收到 "?"`,
        ).toBe("?");
        await page.keyboard.press("Backspace");
    }

    // 站内搜索框（Pagefind）：先开搜索弹层再在输入框里打 `?`
    await page.locator("pagefind-modal-trigger button").click();
    const searchInput = page.locator("pagefind-modal .pf-input");
    await expect(searchInput).toBeVisible();
    await searchInput.click();
    await page.keyboard.type("?");
    expect(await isOpen(page), "搜索框内 `?` 不该开速查").toBe(false);
});

/* ───────────────── 6. 390 移动断点 ───────────────── */

test("390：`?` 打开贴底全宽 sheet，关闭后回到关闭态", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "load" });
    await page.keyboard.press("?");
    await expect(page.locator(DIALOG)).toBeVisible();
    const box = await page.locator(`${DIALOG} .shortcut-help__panel`).boundingBox();
    expect(box).not.toBeNull();
    // 视口宽要扣掉经典滚动条，所以拿 clientWidth 比
    const layoutWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.round(box!.width), "移动端面板应吃满视口宽").toBeGreaterThanOrEqual(
        layoutWidth - 1,
    );
    expect(Math.round(box!.y + box!.height), "面板贴底").toBeGreaterThanOrEqual(842);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, "shortcuts-390-light.png") });

    await page.keyboard.press("Escape");
    await expect(page.locator(OPEN)).toHaveCount(0);
});

/* ───────────────── 7. axe：打开态 serious/critical/incomplete 全 0 ───────────────── */

for (const theme of ["light", "dark"] as const) {
    test(`axe @${theme}：打开态 serious=0 incomplete=0`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("/", { waitUntil: "load" });
        await setTheme(page, theme);
        await page.keyboard.press("?");
        await expect(page.locator(DIALOG)).toBeVisible();
        await page.evaluate(() =>
            document
                .querySelectorAll("[data-overlay]")
                .forEach((node) => node.getAnimations({ subtree: true }).forEach((a) => a.finish())),
        );
        await page.waitForTimeout(120);
        const result = await axeOpenState(page);
        console.log(`[axe] shortcuts ${theme} ${JSON.stringify(result)}`);
        expect(result.serious, `serious: ${result.violations.join(",")}`).toBe(0);
        expect(result.incomplete, `incomplete: ${result.incompleteIds.join(",")}`).toBe(0);
        await page.screenshot({ path: path.join(SHOTS, `shortcuts-1440-${theme}.png`) });
    });
}

/* ───────────────── 8. reduced-motion：无运行中动画 ───────────────── */

test.describe("prefers-reduced-motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("reduced-motion：打开态 0 个运行中动画", async ({ page }) => {
        await page.goto("/", { waitUntil: "load" });
        await page.keyboard.press("?");
        await expect(page.locator(DIALOG)).toBeVisible();
        await page.waitForTimeout(300);
        const running = await page.evaluate(() => {
            const dialog = document.getElementById("shortcut-help")!;
            return dialog.getAnimations({ subtree: true }).filter((a) => a.playState === "running")
                .length;
        });
        console.log(`[motion] shortcuts dialog running=${running}`);
        expect(running, "reduced-motion 下运行中动画必须为 0").toBe(0);
    });
});
