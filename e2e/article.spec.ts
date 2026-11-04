import { test, expect } from "@playwright/test";

test("文章页有内容标题", async ({ page }) => {
    await page.goto("/article/bitwarden/");
    await expect(page.locator(".post-title-text")).toBeVisible();
});

test("返回顶部按钮滚动后出现", async ({ page }) => {
    await page.goto("/article/bitwarden/");
    const backToTop = page.locator("#back-to-top");
    await expect(backToTop).not.toHaveClass(/active/);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await expect(backToTop).toHaveClass(/active/);
});

test("点击返回顶部按钮后页面向上滚动", async ({ page }) => {
    await page.goto("/article/bitwarden/");
    // 滚动到底部
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(300);
    // 点击回到顶部
    await page.locator("#back-to-top.active").click();
    // 等 Lenis 平滑滚动完成
    await page.waitForTimeout(3000);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    // 确保向上滚动了
    expect(scrollAfter).toBeLessThan(scrollBefore);
});

test("Waline 评论切换按钮", async ({ page }) => {
    await page.goto("/article/bitwarden/");
    const toggleBtn = page.locator("#waline-toggle");
    if ((await toggleBtn.count()) === 0) {
        test.skip();
    }
    await expect(toggleBtn).toBeVisible();
});

test("文章页标签存在", async ({ page }) => {
    await page.goto("/article/bitwarden/");
    const tags = page.locator(".post-tags-link");
    const count = await tags.count();
    expect(count).toBeGreaterThan(0);
});

/* ─────────────────────────────────────────────────────────────
   M2-3（P-02）追加：本卡只加断言，上面 5 条原用例一个字未改。
   文章页改版后的结构/行为回归网：目录、分享、版权、相关、进度条。
   ───────────────────────────────────────────────────────────── */

test("文章页结构与设计系统类名就位", async ({ page }) => {
    await page.goto("/article/bitwarden/");
    await expect(page.locator(".post")).toHaveCount(1);
    await expect(page.locator(".post-masthead .post-title-text")).toHaveCount(1);
    await expect(page.locator(".post-sheet #post-content")).toHaveCount(1);
    await expect(page.locator(".post-sheet .article-content")).toHaveCount(1);
    // 元信息仍带浏览量锚点（D-0090）
    await expect(page.locator('.waline-pageview-count[data-path="/article/bitwarden/"]')).toHaveCount(1);
});

test("目录（TOC）构建期渲染且可跳转", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/article/bitwarden/");
    const links = page.locator(".toc.post-toc .toc-link");
    expect(await links.count()).toBeGreaterThanOrEqual(3);

    const href = await links.first().getAttribute("href");
    expect(href).toMatch(/^#.+/);
    await links.first().click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => decodeURIComponent(location.hash))).toBe(
        decodeURIComponent(href ?? ""),
    );
});

test("分享 / 版权 / 相关三块齐备", async ({ page }) => {
    await page.goto("/article/bitwarden/");
    await expect(page.locator("[data-post-share]")).toHaveCount(1);
    await expect(page.locator(".post-license")).toHaveCount(1);
    await expect(page.locator(".related-posts")).toHaveCount(1);
    // 站外分享链接构建期就有 href（无 JS 也能用）
    const platformHrefs = await page.$$eval(".share-icon[data-share-platform]", (nodes) =>
        nodes.map((node) => node.getAttribute("href") ?? ""),
    );
    expect(platformHrefs.length).toBeGreaterThan(0);
    for (const href of platformHrefs) expect(href).toMatch(/^https?:\/\//);
});

test("阅读进度条（D-0089）随滚动推进", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/article/bitwarden/");
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.5));
    await page.waitForTimeout(500);
    const scaleX = await page.evaluate(() => {
        const bar = document.querySelector(".reading-progress") as HTMLElement | null;
        if (!bar) return -1;
        const match = getComputedStyle(bar).transform.match(/matrix\(([^)]+)\)/);
        return match ? Number(match[1].split(",")[0]) : -1;
    });
    expect(scaleX).toBeGreaterThan(0.1);
});
