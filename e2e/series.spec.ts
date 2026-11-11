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
 *  · M5-13（N-1b）文章页系列导航：`.series-nav` 的进度、目录当前篇、
 *    上下篇边界（第一篇无上一篇 / 最后一篇无下一篇 / 单篇系列无翻页区），
 *    以及无 `series` 的文章**零 DOM**（不是隐藏，是根本没渲染）
 */

const FIXTURE = {
    hub: "/series/",
    selfHosted: "/series/self-hosted/",
    astroNotes: "/series/astro-notes/",
    enHub: "/en/series/",
    enSelfHosted: "/en/series/self-hosted/",
} as const;

/** 夹具文章页（M5-13 起断言文章页系列导航） */
const ARTICLE = {
    stepOne: "/article/series-step-one/",
    stepTwo: "/article/series-step-two/",
    astroNotes: "/article/series-astro-notes/",
    plain: "/article/series-less-article/",
    enStepOne: "/en/article/series-step-one/",
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
        // 索引头部统计（M8-6-5 结构：PageHero meta = 文章总数，SectionHead meta = 系列数）
        const heroMeta = (await page.locator(".series-hub .page-hero__meta").textContent()) ?? "";
        expect(heroMeta.replace(/\s+/g, "")).toContain("共3篇文章");
        const sectionMeta =
            (await page.locator(".series-hub .section-head__meta").textContent()) ?? "";
        expect(sectionMeta.replace(/\s+/g, "")).toContain("共2个系列");
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
        const meta = (await page.locator(".series-hub .page-hero__meta").textContent()) ?? "";
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

/* ──────────────── 5. 文章页系列导航（M5-13 · N-1b）─────────────── */

test.describe("文章页系列导航", () => {
    test("第一篇：进度、目录标当前篇、只有「下一篇」，系列目录可达", async ({ page }) => {
        await open(page, ARTICLE.stepOne);

        // 直接挂在页脚后面（`.post-footer + .series-nav`）——证明没有空壳包装元素
        const nav = page.locator(".post-sheet .post-footer + .series-nav");
        await expect(nav).toHaveCount(1);
        await expect(nav).toHaveAttribute("data-series", "self-hosted");

        const seriesLink = nav.locator(".series-nav__series-link");
        await expect(seriesLink).toHaveText("Self Hosted");
        await expect(seriesLink).toHaveAttribute("href", FIXTURE.selfHosted);
        await expect(nav.locator(".series-nav__progress")).toHaveText("第 01 / 02 篇");

        const items = nav.locator(".series-nav__list .series-nav__item");
        await expect(items).toHaveCount(2);

        const rows = await items.evaluateAll((nodes) =>
            nodes.map((node) => ({
                marker: (node.querySelector(".series-nav__marker")?.textContent ?? "").trim(),
                current: node.classList.contains("is-current"),
                ariaCurrent:
                    node.querySelector("[aria-current]")?.getAttribute("aria-current") ?? "",
                href: node.querySelector("a")?.getAttribute("href") ?? "",
                label: (node.querySelector(".series-nav__label")?.textContent ?? "").trim(),
            })),
        );

        // 顺序 = seriesOrder（第 1 篇的 pubDate 反而更晚），当前篇是第 1 项且不可点
        expect(rows.map((row) => row.marker)).toEqual(["01", "02"]);
        expect(rows.map((row) => row.current)).toEqual([true, false]);
        expect(rows[0].ariaCurrent).toBe("page");
        expect(rows[0].href).toBe("");
        expect(rows[0].label).toBe(TITLES.stepOne);
        expect(rows[1].href).toBe(ARTICLE.stepTwo);

        // 边界：第一篇没有「系列上一篇」，有「系列下一篇」
        await expect(nav.locator(".series-nav__pager-link.prev")).toHaveCount(0);
        await expect(nav.locator(".series-nav__pager-link.next")).toHaveAttribute(
            "href",
            ARTICLE.stepTwo,
        );

        // 系列目录链接可达（走真实点击 = 同时覆盖 swup 换页；冷启动 preview 首跳会慢，
        // 给 15s —— 默认 5s 在本机偶发超时，会把「链接可达」测成假红）
        await seriesLink.click();
        await page.waitForURL(`**${FIXTURE.selfHosted}`, { timeout: 15000 });
        await expect(page.locator(".series-detail")).toBeVisible({ timeout: 15000 });
        await expect(page.locator(".series-detail h1")).toHaveText("Self Hosted");
        console.log(`[series] 文章页导航 → 系列目录可达：${rows.map((r) => r.label).join(" | ")}`);
    });

    test("最后一篇：有「上一篇」但无「下一篇」，当前篇是第 2 项", async ({ page }) => {
        await open(page, ARTICLE.stepTwo);

        const nav = page.locator(".series-nav[data-series='self-hosted']");
        await expect(nav).toHaveCount(1);
        await expect(nav.locator(".series-nav__progress")).toHaveText("第 02 / 02 篇");

        const current = nav.locator(".series-nav__item.is-current");
        await expect(current).toHaveCount(1);
        await expect(current).toHaveAttribute("data-position", "02");
        await expect(current.locator("[aria-current='page']")).toHaveText(TITLES.stepTwo);

        await expect(nav.locator(".series-nav__pager-link.prev")).toHaveAttribute(
            "href",
            ARTICLE.stepOne,
        );
        await expect(nav.locator(".series-nav__pager-link.next")).toHaveCount(0);
    });

    test("单篇系列：目录只有 1 项、当前篇即它，且不渲染翻页区", async ({ page }) => {
        await open(page, ARTICLE.astroNotes);

        const nav = page.locator(".series-nav[data-series='astro-notes']");
        await expect(nav).toHaveCount(1);
        await expect(nav.locator(".series-nav__progress")).toHaveText("第 01 / 01 篇");
        await expect(nav.locator(".series-nav__list .series-nav__item")).toHaveCount(1);
        await expect(nav.locator(".series-nav__item.is-current [aria-current='page']")).toHaveText(
            TITLES.astroNotes,
        );
        // 上下篇都不存在 → 整个 .series-nav__pager 不输出（不是渲染一个空 div）
        await expect(nav.locator(".series-nav__pager")).toHaveCount(0);
    });

    test("无 series 的文章：`.series-nav` 与 `[data-series]` 都是零 DOM", async ({ page }) => {
        await open(page, ARTICLE.plain);

        await expect(page.locator(".series-nav")).toHaveCount(0);
        await expect(page.locator(".series-nav__pager")).toHaveCount(0);
        await expect(page.locator("[data-series]")).toHaveCount(0);
        // 页脚后面没有残留的空壳/占位元素
        await expect(page.locator(".post-sheet .post-footer + .series-nav")).toHaveCount(0);
        // 正文照常渲染（系列导航不改变文章渲染）；`.post-content` 首个 h2 是
        // sr-only 标题（aid），要看正文真正的第一个小节
        await expect(page.locator(".post-content .article-content h2").first()).toContainText(
            "没有 series 的文章",
        );
    });

    test("英文文章页用英文标签", async ({ page }) => {
        await open(page, ARTICLE.enStepOne);

        const nav = page.locator(".series-nav[data-series='self-hosted']");
        await expect(nav).toHaveCount(1);
        await expect(nav.locator(".series-nav__progress")).toHaveText("Part 01 of 01");
        await expect(nav.locator(".series-nav__series-link")).toHaveAttribute(
            "href",
            FIXTURE.enSelfHosted,
        );
        await expect(nav.locator(".series-nav__pager")).toHaveCount(0);
    });
});

/* ───────────────────────── 6. 版式 ───────────────────────── */

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
