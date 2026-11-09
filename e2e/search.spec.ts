import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

// 注：搜索 UI 已迁移到 Pagefind Component UI（pagefind-modal-* Web Components）。
// 2026-10 审计更新选择器：旧版 button[data-open-modal] / dialog / .pagefind-ui__result 均已失效。
//
// M7-1a（2026-11-09）：本文件新增「spotlight 视觉 + 断点形态 + axe + 证据截图」四组用例。
// 既有 8 条行为用例（入口 / 打开 / Esc / 输入出结果 / 关闭态 0 请求 / 关闭后 0 新请求 / ⌘K）
// 原样保留 —— 本卡只换外壳，Pagefind 行为一行未动。

test("搜索按钮存在于页面", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("pagefind-modal-trigger")).toBeVisible();
});

test("点击按钮打开搜索弹窗", async ({ page }) => {
    await page.goto("/");
    const dialog = page.locator("pagefind-modal dialog");
    await expect(dialog).toBeHidden();
    await page.locator("pagefind-modal-trigger").click();
    await expect(dialog).toBeVisible();
});

test("Escape 关闭搜索弹窗", async ({ page }) => {
    await page.goto("/");
    await page.locator("pagefind-modal-trigger").click();
    const dialog = page.locator("pagefind-modal dialog");
    await expect(dialog).toBeVisible();
    // 先点输入框让它聚焦，再按 Escape
    await page.locator("pagefind-modal input").first().click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
});

test("搜索弹窗中有输入框", async ({ page }) => {
    await page.goto("/");
    await page.locator("pagefind-modal-trigger").click();
    const input = page.locator("pagefind-modal input").first();
    await expect(input).toBeVisible({ timeout: 10000 });
});

test("输入搜索词后有结果", async ({ page }) => {
    await page.goto("/");
    await page.locator("pagefind-modal-trigger").click();
    const input = page.locator("pagefind-modal input").first();
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill("bitwarden");
    const results = page.locator(".custom-result-item");
    await expect(results.first()).toBeVisible({ timeout: 15000 });
});

/* ───────── M2-5：搜索 spotlight 接进 overlay 基座 ───────── */

test("关闭态：0 个 [data-overlay]，且不下载 pagefind / overlay 模块", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (req) => requested.push(req.url()));
    await page.goto("/", { waitUntil: "load" });
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => document.querySelectorAll("[data-overlay]").length)).toBe(0);
    expect(requested.filter((u) => /pagefind-component-ui|\/overlay[\w-]*\./.test(u))).toEqual([]);
});

test("打开 → 关闭：标记归零、焦点回到触发按钮、关闭后 0 新请求", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.locator("pagefind-modal-trigger").click();
    await expect(page.locator('[data-overlay="search"]')).toHaveCount(1);
    await expect(page.locator('[data-overlay="search"]')).toHaveAttribute("role", "dialog");
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-overlay="search"]')).toHaveCount(0);
    expect(
        await page.evaluate(() => document.activeElement?.matches("pagefind-modal-trigger button")),
        "焦点回到触发按钮",
    ).toBe(true);
    const closed = await page.evaluate(() =>
        performance
            .getEntriesByType("resource")
            .map((e) => e.name)
            .filter((n) => /pagefind|overlay[\w-]*\./.test(n)),
    );
    await page.waitForTimeout(600);
    expect(
        await page.evaluate(() =>
            performance
                .getEntriesByType("resource")
                .map((e) => e.name)
                .filter((n) => /pagefind|overlay[\w-]*\./.test(n)),
        ),
        "关闭态 600ms 内不再拉 pagefind / overlay 资源",
    ).toEqual(closed);
});

test("mod+k 在模块未加载时也能打开（热身钩子）", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForTimeout(300);
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.locator('[data-overlay="search"]')).toHaveCount(1, { timeout: 8000 });
});

/* ───────── M7-1a：spotlight 视觉（桌面命令面板 / 移动窄版）───────── */

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);
const SCREENS_DIR = path.join(process.cwd(), "docs/_reviews/M7-1a/screens");
const SHOTS = process.env.M71A_SHOTS === "1";
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const VIEWPORTS = {
    desktop: { width: 1440, height: 900 },
    mobile: { width: 390, height: 844 },
} as const;

/** 打开弹层并跑一次真实查询（结果由 Pagefind 本地索引产出，不 mock） */
async function openSearch(
    page: Page,
    opts: { theme: Theme; viewport: { width: number; height: number }; query?: string },
) {
    await page.setViewportSize(opts.viewport);
    await page.goto("/", { waitUntil: "load" });
    await page.evaluate((theme) => {
        // 主题切换前先关掉过渡：站点给 color/background-color 配了 --duration-fast，
        // 立刻取色会拿到「前景已换、底色还在路上」的半截状态（axe 会误报对比度）。
        const style = document.createElement("style");
        style.textContent =
            "*,*::before,*::after{transition:none !important;animation:none !important}";
        document.head.appendChild(style);
        document.documentElement.setAttribute("data-theme", theme);
    }, opts.theme);
    await page.evaluate(() => document.fonts.ready);
    await page.locator("pagefind-modal-trigger").click();
    const input = page.locator("pagefind-modal input").first();
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.fill(opts.query ?? "服务器");
    await expect(page.locator(".custom-result-item").first()).toBeVisible({ timeout: 20000 });
    await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
}

test("1440：命令面板形态（680px / 圆角 12 / 首条高亮 + 左侧赤陶条 / 关闭键可见）", async ({
    page,
}) => {
    await openSearch(page, { theme: "light", viewport: VIEWPORTS.desktop });
    const dialog = page.locator("dialog.pf-modal");
    const box = await dialog.boundingBox();
    expect(box, "弹层已渲染").not.toBeNull();
    expect(Math.round(box!.width), "桌面命令面板宽 680px").toBe(680);
    // 水平居中：对话框 margin auto 居中，打开时针不变，而 overlay 打开后 html 的
    // overflow:hidden 会抽掉滚动条宽度（≈15px）—— 所以按「滚动条以内」判居中
    expect(
        Math.abs(Math.round(box!.x) - (1440 - 680) / 2),
        "水平居中（允许滚动条 15px 误差）",
    ).toBeLessThanOrEqual(16);

    const shell = await page.evaluate(() => {
        const d = document.querySelector<HTMLElement>("dialog.pf-modal")!;
        const cs = getComputedStyle(d);
        const first = document.querySelector<HTMLElement>(".custom-result-item")!;
        const firstCs = getComputedStyle(first);
        return {
            radius: cs.borderTopLeftRadius,
            top: Math.round(d.getBoundingClientRect().top),
            firstBg: firstCs.backgroundColor,
            firstShadow: firstCs.boxShadow,
            closeVisible: !!document.querySelector(".pf-modal-close")?.getClientRects().length,
            statusVisible: !!document.querySelector(".search-head-status")?.getClientRects().length,
            inputFont: getComputedStyle(document.querySelector<HTMLElement>(".pf-input")!).fontSize,
        };
    });
    expect(shell.radius, "弹层圆角走 --search-modal-radius").toBe("12px");
    expect(shell.top, "顶部 12vh（900 × 0.12）").toBe(108);
    expect(shell.firstBg, "首条结果（最佳匹配）有暖底").not.toBe("rgba(0, 0, 0, 0)");
    expect(shell.firstShadow, "首条结果左侧赤陶细条").toContain("inset");
    expect(shell.closeVisible, "桌面也露出关闭键").toBe(true);
    expect(shell.statusVisible, "桌面显示索引状态芯片").toBe(true);
    expect(shell.inputFont, "输入字号走 --text-xl").toBe("20px");
});

test("390：同一弹层的窄版（全屏 / 无横向溢出 / 状态芯片收起 / 关闭键可见）", async ({ page }) => {
    await openSearch(page, { theme: "light", viewport: VIEWPORTS.mobile });
    const box = await page.locator("dialog.pf-modal").boundingBox();
    expect(Math.round(box!.width), "移动 = 全宽").toBe(390);
    expect(Math.round(box!.height), "移动 = 全高").toBe(844);

    const mobile = await page.evaluate(() => {
        const d = document.querySelector<HTMLElement>("dialog.pf-modal")!;
        const doc = document.documentElement;
        return {
            radius: getComputedStyle(d).borderTopLeftRadius,
            overflow: Math.max(0, doc.scrollWidth - doc.clientWidth),
            statusVisible: !!document.querySelector(".search-head-status")?.getClientRects().length,
            closeVisible: !!document.querySelector(".pf-modal-close")?.getClientRects().length,
            excerptClamp: (
                getComputedStyle(
                    document.querySelector<HTMLElement>(".custom-excerpt")!,
                ) as unknown as {
                    webkitLineClamp: string;
                }
            ).webkitLineClamp,
        };
    });
    expect(mobile.radius, "窄版不保留桌面圆角").toBe("0px");
    expect(mobile.overflow, "390 无横向溢出").toBeLessThanOrEqual(1);
    expect(mobile.statusVisible, "窄版收起索引状态芯片").toBe(false);
    expect(mobile.closeVisible, "窄版保留关闭键").toBe(true);
    expect(mobile.excerptClamp, "窄版摘要收两行").toBe("2");
});

for (const theme of THEMES) {
    test(`axe（${theme}）：弹层打开态 serious/critical = 0`, async ({ page }) => {
        await openSearch(page, { theme, viewport: VIEWPORTS.desktop });
        await page.addScriptTag({ content: AXE_SOURCE });
        const result = await page.evaluate(async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const axe = (window as any).axe;
            const surface = document.querySelector(".pf-modal") as HTMLElement;
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
            `[search:${theme}] axe ${result.violations.length} violations（serious/critical = ${blocking.length}）`,
        );
        for (const v of blocking) console.log(`  · ${v.id} — ${v.help} (${v.nodes.length})`);
        expect(blocking, `${theme} 无 serious/critical`).toHaveLength(0);
    });
}

test("证据截图：1440 / 390 × light / dark", async ({ page }) => {
    test.skip(!SHOTS, "设置 M71A_SHOTS=1 才写 docs/_reviews/M7-1a/screens/");
    mkdirSync(SCREENS_DIR, { recursive: true });
    for (const [label, viewport] of Object.entries(VIEWPORTS)) {
        for (const theme of THEMES) {
            await openSearch(page, { theme, viewport });
            await page.screenshot({
                path: path.join(SCREENS_DIR, `search-${label}-${theme}.png`),
                fullPage: false,
            });
        }
    }
});
