import { test, expect } from "@playwright/test";

// 注：搜索 UI 已迁移到 Pagefind Component UI（pagefind-modal-* Web Components）。
// 2026-10 审计更新选择器：旧版 button[data-open-modal] / dialog / .pagefind-ui__result 均已失效。

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
