import { test, expect, type Page } from "@playwright/test";

/**
 * i18n e2e（M2-11a 建 · M2-11b 收口 8 门模板语言）
 *
 * 两种运行形态，同一份断言：
 * - 默认构建（只有 zh/en）：新语言的用例 `test.skip`，前 5 条照旧跑；
 * - `I18N_LOCALES=all` 构建后再 `astro preview`：8 个新语言的 5 条模板路由
 *   逐条断言（/、/blog/1/、/archives/、/tags/、/culture/）。
 *
 * 判据全部落在**用户能感知的信号**上：`<html lang>`、页面标题、canonical /
 * hreflang、导航链接指向、切换器当前项 —— 不断言构建期内部实现。
 *
 * M2-11b 追加：de / ru 在 390 宽下的横向溢出断言（德语长复合词与西里尔长词
 * 是最容易把标题/导航撑破的两门语言，短标签语言看不出来的问题它们先炸）。
 */

const LOCALES = [
    { code: "zh-TW", htmlLang: "zh-Hant-TW", label: "繁中", archivesTitle: "歸檔" },
    { code: "ja", htmlLang: "ja", label: "日本語", archivesTitle: "アーカイブ" },
    { code: "ko", htmlLang: "ko", label: "한국어", archivesTitle: "아카이브" },
    { code: "fr", htmlLang: "fr", label: "FR", archivesTitle: "Archives" },
    { code: "de", htmlLang: "de", label: "DE", archivesTitle: "Archiv" },
    { code: "es", htmlLang: "es", label: "ES", archivesTitle: "Archivo" },
    { code: "pt-BR", htmlLang: "pt-BR", label: "PT", archivesTitle: "Arquivo" },
    { code: "ru", htmlLang: "ru", label: "RU", archivesTitle: "Архив" },
];

/** 该语言是否已经落盘（默认构建里没有 → 整组用例跳过，而不是假红） */
async function localeBuilt(page: Page, code: string): Promise<boolean> {
    const res = await page.request.get(`/${code}/`);
    return res.ok();
}

test("中文首页使用默认语言", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});

test("英文首页有 lang=en", async ({ page }) => {
    await page.goto("/en/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("语言切换器存在", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".language-switcher-button")).toBeVisible();
});

test("切换到英文后跳转到 /en/", async ({ page }) => {
    await page.goto("/");
    // hover 展开下拉
    await page.locator(".language-switcher").hover();
    const enLink = page.locator('.language-switcher-link[hreflang="en"]');
    await expect(enLink).toBeVisible();
    await enLink.click();
    await expect(page).toHaveURL(/\/en\//);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("英文页面切换到中文", async ({ page }) => {
    await page.goto("/en/");
    await page.locator(".language-switcher").hover();
    const zhLink = page.locator('.language-switcher-link[hreflang="zh"]');
    await expect(zhLink).toBeVisible();
    await zhLink.click();
    await expect(page).toHaveURL("http://localhost:4321/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});

for (const locale of LOCALES) {
    const { code, htmlLang, label, archivesTitle } = locale;

    test(`[${code}] 首页 lang / 标题走该语言`, async ({ page }) => {
        test.skip(!(await localeBuilt(page, code)), `${code} 未构建（需 I18N_LOCALES=all）`);
        await page.goto(`/${code}/`);
        await expect(page.locator("html")).toHaveAttribute("lang", htmlLang);
        await expect(page.locator(".language-switcher-button .language-label")).toHaveText(label);
    });

    test(`[${code}] 5 条模板路由都可访问`, async ({ page }) => {
        test.skip(!(await localeBuilt(page, code)), `${code} 未构建（需 I18N_LOCALES=all）`);
        for (const path of ["/", "/blog/1/", "/archives/", "/tags/", "/culture/"]) {
            const res = await page.request.get(`/${code}${path}`);
            expect(res.status(), `/${code}${path}`).toBe(200);
        }
    });

    test(`[${code}] 归档页标题是该语言`, async ({ page }) => {
        test.skip(!(await localeBuilt(page, code)), `${code} 未构建（需 I18N_LOCALES=all）`);
        await page.goto(`/${code}/archives/`);
        await expect(page.locator("html")).toHaveAttribute("lang", htmlLang);
        await expect(page).toHaveTitle(new RegExp(archivesTitle));
    });

    test(`[${code}] 切换器列出全部语言且当前项高亮`, async ({ page }) => {
        test.skip(!(await localeBuilt(page, code)), `${code} 未构建（需 I18N_LOCALES=all）`);
        await page.goto(`/${code}/`);
        const links = page.locator(".language-switcher-link");
        await expect(links).toHaveCount(LOCALES.length + 2); // zh + en + 4
        const active = page.locator(".language-switcher-link.active");
        await expect(active).toHaveCount(1);
        await expect(active).toHaveAttribute("hreflang", code);
    });

    test(`[${code}] 导航只指向该语言真的有页面的路由`, async ({ page }) => {
        test.skip(!(await localeBuilt(page, code)), `${code} 未构建（需 I18N_LOCALES=all）`);
        await page.goto(`/${code}/`);
        const nav = page.locator("#nav-dropdown");
        // 模板建过的路由 → 带语言前缀
        await expect(nav.locator(`a[href="/${code}/archives/"]`)).toHaveCount(1);
        await expect(nav.locator(`a[href="/${code}/blog/1/"]`)).toHaveCount(1);
        // 没有建的语言页 → 留在中文路由（不造 /ja/talks/ 这种 404）
        await expect(nav.locator(`a[href="/${code}/talks/"]`)).toHaveCount(0);
        await expect(nav.locator('a[href="/talks/"]')).toHaveCount(1);
    });

    test(`[${code}] canonical 指回中文页（回退正文不重复收录）`, async ({ page }) => {
        test.skip(!(await localeBuilt(page, code)), `${code} 未构建（需 I18N_LOCALES=all）`);
        await page.goto(`/${code}/archives/`);
        const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
        expect(canonical).toContain("/archives/");
        expect(canonical).not.toContain(`/${code}/`);
    });
}

test("回退正文的语言不进 hreflang，canonical 指回中文页", async ({ page }) => {
    test.skip(!(await localeBuilt(page, "ja")), "ja 未构建（需 I18N_LOCALES=all）");
    await page.goto("/ja/");
    // 回退正文的语言页 canonical 指回中文页 → 按 hreflang 规范不能再被标注
    await expect(page.locator('link[rel="alternate"][hreflang="ja"]')).toHaveCount(0);
    await expect(page.locator('link[rel="alternate"][hreflang="ko"]')).toHaveCount(0);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).not.toContain("/ja/");
    // 中文页也不反过来指向这些回退页
    await page.goto("/");
    const zhHref = await page.locator('link[rel="alternate"][hreflang="zh"]').getAttribute("href");
    expect(zhHref).not.toContain("/ja/");
    await expect(page.locator('link[rel="alternate"][hreflang="ja"]')).toHaveCount(0);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(1);
});

test("从新语言切回中文", async ({ page }) => {
    test.skip(!(await localeBuilt(page, "ja")), "ja 未构建（需 I18N_LOCALES=all）");
    await page.goto("/ja/archives/");
    await page.locator(".language-switcher").hover();
    await page.locator('.language-switcher-link[hreflang="zh"]').click();
    await expect(page).toHaveURL("http://localhost:4321/archives/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});

test("从新语言切到另一门新语言", async ({ page }) => {
    test.skip(!(await localeBuilt(page, "ja")), "ja 未构建（需 I18N_LOCALES=all）");
    await page.goto("/ja/archives/");
    await page.locator(".language-switcher").hover();
    await page.locator('.language-switcher-link[hreflang="ko"]').click();
    await expect(page).toHaveURL(/\/ko\/archives\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
});

/* ───────────────── de / ru：390 宽下不许横向溢出 ───────────────── */

/**
 * 德语靠复合词、俄语靠长西里尔词，两者在 390 宽（iPhone 12/13/14 竖屏）
 * 最容易把 h1 / 统计数字 / 导航撑出视口 —— 这是模板复用同一套 CSS、只换文案
 * 时唯一真正会「看得见」的回归。判据与 pages-culture 的溢出用例同口径：
 * 越界元素（未被祖先 overflow 裁剪）+ documentElement.scrollWidth。
 */
for (const code of ["de", "ru"]) {
    test(`[${code}] 390 宽无横向溢出`, async ({ page }) => {
        test.skip(!(await localeBuilt(page, code)), `${code} 未构建（需 I18N_LOCALES=all）`);
        for (const theme of ["light", "dark"]) {
            for (const path of ["/", "/archives/", "/tags/"]) {
                await page.setViewportSize({ width: 390, height: 844 });
                await page.goto(`/${code}${path}`, { waitUntil: "load" });
                await page.evaluate((value) => {
                    document.documentElement.setAttribute("data-theme", value);
                }, theme);
                await page.evaluate(async () => {
                    await document.fonts.ready;
                });
                const result = await page.evaluate(() => {
                    const doc = document.documentElement;
                    const limit = doc.clientWidth;
                    const clippedByAncestor = (el: Element): boolean => {
                        let node = el.parentElement;
                        while (node && node !== document.body) {
                            const style = getComputedStyle(node);
                            if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
                                const rect = node.getBoundingClientRect();
                                if (rect.right <= limit + 1) return true;
                            }
                            node = node.parentElement;
                        }
                        return false;
                    };
                    const offenders = [...document.querySelectorAll("body *")]
                        .filter((el) => {
                            const rect = el.getBoundingClientRect();
                            if (!(rect.width > 0) || rect.right <= limit + 1) return false;
                            return !clippedByAncestor(el);
                        })
                        .slice(0, 8)
                        .map((el) => {
                            const rect = el.getBoundingClientRect();
                            return `${el.tagName.toLowerCase()} right=${Math.round(rect.right)} width=${Math.round(rect.width)} :: ${el.outerHTML.slice(0, 120)}`;
                        });
                    return {
                        scrollWidth: doc.scrollWidth,
                        clientWidth: doc.clientWidth,
                        offenders,
                    };
                });
                expect(result.offenders, `${code}${path}@390 (${theme}): 越界元素`).toEqual([]);
                expect(
                    result.scrollWidth,
                    `${code}${path}@390 (${theme}): scrollWidth ${result.scrollWidth} > clientWidth ${result.clientWidth}`,
                ).toBeLessThanOrEqual(result.clientWidth + 1);
            }
        }
    });
}
