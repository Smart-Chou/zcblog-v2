import { test, expect, type Page } from "@playwright/test";

/**
 * N-1a 系列页验收（M5-12 · D-0145）
 *
 * 跑法：`pnpm series:e2e`
 *  1. `scripts/series/build-e2e-fixture.mjs` 用 `e2e/fixtures/series/` 的 5 篇固定文章构建 dist
 *     （真实内容仓当前 0 篇写 `series`，回填属 M5-13）
 *  2. Playwright 的 webServer 起 `astro preview`，本文件对 4321 断言
 *
 * 覆盖验收清单：
 *  · 索引页只列出有文章的系列；列表页按 `seriesOrder` 排序（seriesOrder 优先于 pubDate）
 *  · 无 `series` 的文章不出现在任何系列面 → 「无 series 不渲染」
 *  · 双语：`/en/series/` 只含英文文章；zh-only 系列不产出 `/en/series/<slug>/`
 *  · hreflang 只在两侧都有同名系列时互标；语言切换器不造死链
 *  · 版式：恰好 1 个 h1、390 宽无横向溢出（`.series-step` 的 grid 在窄屏最易踩）
 */

const FIXTURE = {
    hub: "/series/",
    selfHosted: "/series/self-hosted/",
    astroNotes: "/series/astro-notes/",
    enHub: "/en/series/",
    enSelfHosted: "/en/series/self-hosted/",
} as const;

/** 夹具里三家文章的标题（与 e2e/fixtures/series/content/article/*.md 一一对应） */
const TITLES = {
    stepOne: "系列第 1 篇：把服务搬进自家机柜",
    stepTwo: "系列第 2 篇：异地备份与恢复演练",
    astroNotes: "另一个系列：Astro 内容层笔记",
    plain: "不属于任何系列的文章",
} as const;

async function open(page: Page, url: string): Promise<void> {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `GET ${url}`).toBe(200);
    // 本站有 Partytown / Pagefind 等懒加载资源，networkidle 会超时；等字体与两帧即可
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
    });
}

/* ───────────────────────── 1. 索引 ───────────────────────── */

test.describe("系列索引 /series/", () => {
    test("只列出有文章的系列，按展示名排序，链接与计数正确", async ({ page }) => {
        await open(page, FIXTURE.hub);
        await expect(page.locator(".series-hub")).toHaveCount(1);

        const items = page.locator(".series-list .series-item");
        // 夹具里 3 篇文章分属 2 个系列；第 4 篇没有 series → 不进任何系列，也不产生第 3 个条目
        await expect(items).toHaveCount(2);

        const rows = await items.evaluateAll((nodes) =>
            nodes.map((node) => ({
                href: node.querySelector("a")?.getAttribute("href") ?? "",
                name: (node.querySelector("a")?.textContent ?? "").trim(),
                meta: (node.querySelector(".series-meta-line")?.textContent ?? "")
                    .replace(/\s+/g, " ")
                    .trim(),
            })),
        );

        expect(rows.map((row) => row.name)).toEqual(["Astro Notes", "Self Hosted"]);
        expect(rows.map((row) => row.href)).toEqual([
            "/series/astro-notes/",
            "/series/self-hosted/",
        ]);
        // 计数来自各系列成员数：self-hosted 2 篇、astro-notes 1 篇
        expect(rows[0].meta).toContain("共 1 篇文章");
        expect(rows[1].meta).toContain("共 2 篇文章");
        // 索引头部统计：系列数 / 文章数
        const meta = (await page.locator(".series-hub .tags-meta").textContent()) ?? "";
        expect(meta.replace(/\s+/g, "")).toContain("共2个系列");
        expect(meta.replace(/\s+/g, "")).toContain("共3篇文章");
        console.log(`[series] 索引 ${rows.length} 个系列：${JSON.stringify(rows)}`);
    });
});

/* ───────────────────────── 2. 列表 ───────────────────────── */

test.describe("系列目录 /series/<slug>/", () => {
    test("按 seriesOrder 排序（优先于 pubDate），序号从 01 起", async ({ page }) => {
        await open(page, FIXTURE.selfHosted);
        await expect(page.locator(".series-detail")).toHaveCount(1);
        await expect(page.locator(".series-detail h1")).toHaveCount(1);
        await expect(page.locator(".series-detail h1")).toHaveText("Self Hosted");

        const steps = page.locator(".series-posts .series-step");
        await expect(steps).toHaveCount(2);

        const rows = await steps.evaluateAll((nodes) =>
            nodes.map((node) => ({
                marker: (node.querySelector(".series-step__marker")?.textContent ?? "").trim(),
                title: (node.querySelector(".post-card-link")?.getAttribute("aria-label") ?? "")
                    .replace("Read more: ", "")
                    .trim(),
                href: node.querySelector(".post-card-link")?.getAttribute("href") ?? "",
            })),
        );

        // 第 1 篇 seriesOrder=1 但 pubDate 更晚；第 2 篇 seriesOrder=2 但 pubDate 更早。
        // 顺序若按日期会反过来 —— 这条断言就是「seriesOrder 优先」的证据。
        expect(rows.map((row) => row.marker)).toEqual(["01", "02"]);
        expect(rows.map((row) => row.title)).toEqual([TITLES.stepOne, TITLES.stepTwo]);
        expect(rows.every((row) => row.href.startsWith("/article/"))).toBe(true);
        console.log(`[series] 目录顺序：${JSON.stringify(rows)}`);
    });

    test("单篇系列也能成页（缺省 seriesOrder 不阻断）", async ({ page }) => {
        await open(page, FIXTURE.astroNotes);
        await expect(page.locator(".series-posts .series-step")).toHaveCount(1);
        await expect(page.locator(".series-step__marker")).toHaveText("01");
        await expect(page.locator(".post-card-link")).toHaveAttribute(
            "aria-label",
            `Read more: ${TITLES.astroNotes}`,
        );
    });
});

/* ─────────────────── 3. 无 series = 不渲染 ─────────────────── */

test.describe("无 series 的文章零空壳", () => {
    test("对照组文章不出现在索引与任何系列目录里", async ({ page }) => {
        for (const url of [FIXTURE.hub, FIXTURE.selfHosted, FIXTURE.astroNotes]) {
            await open(page, url);
            const body = (await page.locator("main").textContent()) ?? "";
            expect(body, `${url} 不应出现无 series 的文章标题`).not.toContain(TITLES.plain);
            expect(body, `${url} 不应出现无 series 文章的首段`).not.toContain(
                "本站有系列，但这篇不属于任何系列",
            );
        }

        // 索引头部统计已经把「文章数」收敛到 3 篇（= 有 series 的篇数），排除对照文章
        await open(page, FIXTURE.hub);
        const meta = (await page.locator(".series-hub .tags-meta").textContent()) ?? "";
        expect(meta.replace(/\s+/g, "")).toContain("共3篇文章");
    });

    test("不存在的系列 slug 返回 404（不生成占位空页）", async ({ page }) => {
        const response = await page.goto("/series/not-a-real-series/", {
            waitUntil: "domcontentloaded",
        });
        expect(response?.status()).toBe(404);
    });
});

/* ─────────────────────── 4. 双语 / hreflang ─────────────────── */

test.describe("双语", () => {
    test("/en/series/ 只含英文文章；zh-only 系列没有 en 路由", async ({ page }) => {
        await open(page, FIXTURE.enHub);
        await expect(page.locator(".series-list .series-item")).toHaveCount(1);
        await expect(page.locator(".series-list a")).toHaveAttribute(
            "href",
            "/en/series/self-hosted/",
        );

        await open(page, FIXTURE.enSelfHosted);
        await expect(page.locator(".series-posts .series-step")).toHaveCount(1);
        await expect(page.locator(".post-card-link")).toHaveAttribute(
            "href",
            "/en/article/series-step-one/",
        );

        // astro-notes 只存在于中文（英文夹具里没有这篇），/en/series/astro-notes/ 必须 404
        const missing = await page.goto("/en/series/astro-notes/", {
            waitUntil: "domcontentloaded",
        });
        expect(missing?.status()).toBe(404);
    });

    test("hreflang 只在两侧都有同名系列时互标", async ({ page }) => {
        await open(page, FIXTURE.selfHosted);
        const paired = await page
            .locator('head link[rel="alternate"][hreflang]')
            .evaluateAll((nodes) =>
                nodes.map((node) => [
                    node.getAttribute("hreflang") ?? "",
                    node.getAttribute("href") ?? "",
                ]),
            );
        const pairedMap = Object.fromEntries(paired);
        expect(pairedMap.en, "有英文对照的系列必须输出 en alternate").toContain(
            "/en/series/self-hosted/",
        );

        await open(page, FIXTURE.astroNotes);
        const solo = await page
            .locator('head link[rel="alternate"][hreflang]')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("hreflang") ?? ""));
        expect(solo, "zh-only 系列不得输出 /en 死链").not.toContain("en");
        expect(solo).toContain("x-default");
        console.log(`[series] astro-notes hreflang=${JSON.stringify(solo)}`);
    });

    test("语言切换器不造死链：zh-only 系列 → /en/series/", async ({ page }) => {
        await open(page, FIXTURE.astroNotes);
        const enHref = await page
            .locator('.language-switcher-dropdown a[hreflang="en"]')
            .getAttribute("href");
        expect(enHref).toBe("/en/series/");

        await open(page, FIXTURE.enSelfHosted);
        const zhHref = await page
            .locator('.language-switcher-dropdown a[hreflang="zh"]')
            .getAttribute("href");
        expect(zhHref).toBe("/series/self-hosted/");
    });
});

/* ───────────────────────── 5. 版式 ───────────────────────── */

test.describe("版式", () => {
    for (const [key, url] of Object.entries({
        hub: FIXTURE.hub,
        detail: FIXTURE.selfHosted,
    })) {
        test(`${key}：恰好 1 个 h1、390 宽无横向溢出`, async ({ page }) => {
            for (const width of [390, 768, 1440]) {
                await page.setViewportSize({ width, height: 900 });
                await open(page, url);
                const probe = await page.evaluate(() => ({
                    h1: [...document.querySelectorAll("h1")].length,
                    scrollWidth: document.documentElement.scrollWidth,
                    clientWidth: document.documentElement.clientWidth,
                }));
                expect(probe.h1, `${key}@${width}: exactly one h1`).toBe(1);
                expect(
                    probe.scrollWidth,
                    `${key}@${width}: scrollWidth ${probe.scrollWidth} > clientWidth ${probe.clientWidth}`,
                ).toBeLessThanOrEqual(probe.clientWidth + 1);
            }
        });
    }
});
