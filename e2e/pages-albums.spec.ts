import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * C-2 相册 验收（M2-8c）
 *
 * 覆盖（`19-m2-plan.md` §M2-8 的页面级判据 + 本卡专项）：
 *  1. 路由 200：`/albums/`、`/en/albums/`、中文与英文相册详情
 *  2. 中英同源：状态 / 相册数 / 张数 / 地点数一致，en 页 h1 真的是英文
 *  3. 恰好 1 个 h1；标题层级不跳级（列表页 + 详情页）
 *  4. 数据顺序：页面顺序 = 数据文件顺序（SSR 决定），reload 后不变
 *  5. **缩略图 / 原图分离**（本卡核心）：`img[src]` 走站点 `/cdn-cgi/image/…width=640`，
 *     `a[href]` 走图床原图；两组数量都等于 photos.length，且没有一个地址两边通用
 *  6. **三视口列数**（本卡核心）：390 → 1、768 → 2、1440 → 3；
 *     列表页断 `grid-template-columns` 轨道数，详情页断 computed `column-count`
 *  7. **灯箱复用**（本卡核心）：点照片 → Fancybox 打开且显示的是**原图**；
 *     Esc 关闭 → 焦点回到点过的那一张（没有焦点返回，键盘用户就丢了位置）
 *  8. light/dark × 390/768/1440：无横向溢出（列表页 + 详情页）
 *  9. axe（wcag2a/aa + wcag21a/aa + wcag22aa）：serious/critical = 0、incomplete = 0（双主题）
 * 10. 空数据：**真实构建**（`PUBLIC_ALBUMS_STATE=empty`）证明可构建，随后恢复常规构建
 * 11. 导航：相册入口存在、不溢出、可点击
 * 12. 证据截图（列表页 light/dark 1440 + light 390，详情页 light 1440 + 灯箱打开态）
 *
 * 图片一律由 `route()` 兜住（1×1 PNG）：图床与站点 /cdn-cgi/image 都是外网域名，
 * 让 e2e 真去下载 12 张原图既不稳也没意义 —— 本卡要证明的是**地址形状与数量**，
 * 不是图床今天是否在线。
 */

const ROOT = process.cwd();
const AXE_SOURCE = readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [390, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

const ALBUMS = {
    url: "/albums/",
    en: "/en/albums/",
    shell: ".entities--albums",
    wall: "[data-albums-wall]",
    item: "[data-album-item]",
    status: "data-albums-status",
    total: "data-albums-total",
    photos: "data-albums-photos",
    places: "data-albums-places",
} as const;

/** 一本张数适中的相册：详情页断言用它（12 张，不是 70 张的那本）。 */
const ALBUM_ID = "shenzhen_feng-huang-shan";
const DETAIL = `/albums/${ALBUM_ID}/`;
const DETAIL_EN = `/en/albums/${ALBUM_ID}/`;

const GRID = {
    container: "[data-album-grid]",
    item: ".album-grid__item",
    image: ".album-grid__image",
} as const;

/** 站点边缘缩略图前缀（`getPicImageUrl(path, width)` 的产物）。 */
const THUMB = /^https:\/\/marxchou\.com\/cdn-cgi\/image\/[^/]*width=(\d+)[^/]*\//;
/** 图床原图前缀（不带宽度）。 */
const ORIGINAL = /^https:\/\/pic-api\.marxchou\.com\/api\/pic\//;

const EVIDENCE_DIR =
    process.env.M28C_EVIDENCE_DIR ??
    path.resolve(ROOT, "../../hermes-desktop-files/blog2.0/docs/_reviews/M2-8c-albums");

/** 1×1 透明 PNG：只要不是坏图，Fancybox 就会把它当图片渲染出来。 */
const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/wFz0q1kAAAAAElFTkSuQmCC",
    "base64",
);

/** 图床与站点缩略图都兜住：e2e 不依赖外网（见文件头）。 */
async function stubImages(page: Page): Promise<void> {
    await page.route("https://marxchou.com/cdn-cgi/image/**", (route) =>
        route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }),
    );
    await page.route("https://pic-api.marxchou.com/**", (route) =>
        route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }),
    );
}

async function openPage(page: Page, url: string, theme: Theme, width = 1440): Promise<void> {
    await page.setViewportSize({ width, height: 900 });
    await stubImages(page);
    const response = await page.goto(url, { waitUntil: "load" });
    expect(response?.status(), `GET ${url}`).toBe(200);
    await page.evaluate((value) => {
        document.documentElement.setAttribute("data-theme", value);
    }, theme);
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
    });
    // 主题切换有颜色过渡（最长 --duration-slow）：过渡没走完时 axe 取到的是插值中间色
    await page.waitForTimeout(420);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

/* ───────────────────────── 1. 路由 ───────────────────────── */

for (const [lang, url] of [
    ["zh", ALBUMS.url],
    ["en", ALBUMS.en],
] as const) {
    test(`route 200 albums ${lang}`, async ({ page }) => {
        await stubImages(page);
        const response = await page.goto(url, { waitUntil: "load" });
        expect(response?.status(), `GET ${url}`).toBe(200);
        await expect(page.locator(ALBUMS.shell)).toHaveCount(1);
        await expect(page.locator(`${ALBUMS.shell} h1`)).toHaveCount(1);
        await expect(page.locator(ALBUMS.item).first()).toBeVisible();
    });
}

test("route 200 album detail（zh + en）", async ({ page }) => {
    for (const url of [DETAIL, DETAIL_EN]) {
        await stubImages(page);
        const response = await page.goto(url, { waitUntil: "load" });
        expect(response?.status(), `GET ${url}`).toBe(200);
        await expect(page.locator(GRID.container)).toHaveCount(1);
        await expect(page.locator(`${ALBUMS.shell} h1`)).toHaveCount(1);
    }
});

/* ───────────────────────── 2. 中英同源 ───────────────────────── */

test("中英两页同源：状态 / 相册数 / 张数 / 地点数一致，en 页 h1 是英文", async ({ page }) => {
    const read = async (url: string) => {
        await stubImages(page);
        await page.goto(url, { waitUntil: "load" });
        const shell = page.locator(ALBUMS.shell);
        return {
            status: await shell.getAttribute(ALBUMS.status),
            total: await shell.getAttribute(ALBUMS.total),
            photos: await shell.getAttribute(ALBUMS.photos),
            places: await shell.getAttribute(ALBUMS.places),
            h1: (await page.locator(`${ALBUMS.shell} h1`).innerText()).trim(),
        };
    };

    const zh = await read(ALBUMS.url);
    const en = await read(ALBUMS.en);

    expect(zh.status, "示例数据应为 ok").toBe("ok");
    expect(en.status, "status 中英不一致").toEqual(zh.status);
    expect(en.total, "相册数中英不一致").toEqual(zh.total);
    expect(en.photos, "张数中英不一致").toEqual(zh.photos);
    expect(en.places, "地点数中英不一致").toEqual(zh.places);
    expect(zh.h1).not.toEqual(en.h1);
    expect(en.h1).toMatch(/^[A-Za-z][A-Za-z\s&·]*$/);
    console.log(
        `[i18n] ${zh.h1} / ${en.h1} · albums ${zh.total} · photos ${zh.photos} · places ${zh.places}`,
    );
});

/* ───────────────────────── 3. h1 / 标题层级 ───────────────────────── */

test("恰好 1 个 h1，标题层级不跳级（列表页 + 详情页，双语言）", async ({ page }) => {
    for (const url of [ALBUMS.url, ALBUMS.en, DETAIL, DETAIL_EN]) {
        await stubImages(page);
        await page.goto(url, { waitUntil: "load" });
        const headings = await page.evaluate((sel) => {
            const root = document.querySelector(sel) ?? document;
            return {
                total1: document.querySelectorAll("h1").length,
                inShell: root.querySelectorAll("h1").length,
                levels: [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")]
                    .filter((el) => el.getAttribute("aria-hidden") !== "true")
                    .map((el) => Number(el.tagName.slice(1))),
            };
        }, ALBUMS.shell);

        expect(headings.total1, `${url}: 整页只能有 1 个 h1`).toBe(1);
        expect(headings.inShell, `${url}: h1 必须落在页面主体内`).toBe(1);

        let previous = 0;
        const skips: string[] = [];
        for (const level of headings.levels) {
            if (previous !== 0 && level > previous + 1) skips.push(`${previous} → ${level}`);
            previous = level;
        }
        expect(skips, `${url}: 标题层级必须连续`).toEqual([]);
        console.log(`[h1] ${url}: 1 个 h1，${headings.levels.length} 个标题，0 跳级`);
    }
});

/* ───────────────────────── 4. 数据顺序 ───────────────────────── */

test("页面顺序 = 数据顺序，reload 后不变", async ({ page }) => {
    await stubImages(page);
    await page.goto(ALBUMS.url, { waitUntil: "load" });
    const order = await page
        .locator(ALBUMS.item)
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-album-item")));

    expect(order.length, "相册墙不该为空").toBeGreaterThan(0);
    expect(new Set(order).size, "data-album-item 必须唯一").toBe(order.length);

    const shell = page.locator(ALBUMS.shell);
    const declared = Number(await shell.getAttribute(ALBUMS.total));
    expect(order.length, "data-albums-total 必须等于墙上相册数").toBe(declared);

    // 详情页照片顺序同样来自数据文件：data-photo-index 必须是 0..n-1 的顺序
    const detailOrder = await (async () => {
        await page.goto(DETAIL, { waitUntil: "load" });
        return page
            .locator(GRID.item)
            .evaluateAll((nodes) =>
                nodes.map((node) => Number(node.getAttribute("data-photo-index"))),
            );
    })();
    expect(detailOrder, "照片顺序必须是数据顺序").toEqual(detailOrder.map((_, index) => index));

    await page.goto(ALBUMS.url, { waitUntil: "load" });
    await page.reload({ waitUntil: "load" });
    const again = await page
        .locator(ALBUMS.item)
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-album-item")));
    expect(again, "两次加载顺序必须一致").toEqual(order);

    console.log(`[order] ${order.length} 本相册 · 详情 ${detailOrder.length} 张 · reload 顺序不变`);
});

/* ───────────────────────── 4b. 地点筛选（复用 GalleryFilter） ───────────────────────── */

test("地点筛选：点某地点只留当地相册，点回「全部」全部回来", async ({ page }) => {
    await stubImages(page);
    await page.goto(ALBUMS.url, { waitUntil: "load" });

    const cards = page.locator(ALBUMS.item);
    const total = await cards.count();
    expect(total).toBeGreaterThan(1);

    // 每个筛选按钮对应一组卡片；断言「显示的卡片 data-tags 都含这个地点」
    const labels = await page
        .locator(".filter-tag")
        .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("data-tag") ?? "").filter((tag) => tag !== "all"),
        );
    expect(labels.length, "地点筛选按钮不该只有「全部」").toBeGreaterThan(0);

    for (const label of labels) {
        await page.locator(`.filter-tag[data-tag="${label}"]`).click();
        const visible = await page
            .locator(ALBUMS.item)
            .evaluateAll((nodes) =>
                nodes
                    .filter((node) => (node as HTMLElement).offsetParent !== null)
                    .map((node) => (node.getAttribute("data-tags") ?? "").split(",")),
            );
        expect(visible.length, `${label}: 筛完不该是空的`).toBeGreaterThan(0);
        expect(
            visible.every((tags) => tags.includes(label)),
            `${label}: 筛出了别的城市的相册`,
        ).toBe(true);
        console.log(`[filter] ${label}: ${visible.length}/${total} 本`);
    }

    await page.locator('.filter-tag[data-tag="all"]').click();
    const back = await page
        .locator(ALBUMS.item)
        .evaluateAll(
            (nodes) => nodes.filter((node) => (node as HTMLElement).offsetParent !== null).length,
        );
    expect(back, "点回「全部」必须全部显示").toBe(total);
});

/* ───────────────────────── 5. 缩略图 / 原图分离（核心） ───────────────────────── */

test("缩略图与原图分离：数量对账 + 地址形状互斥", async ({ page }) => {
    await openPage(page, DETAIL, "light");

    const grid = page.locator(GRID.container);
    const declared = Number(await grid.getAttribute("data-album-photo-count"));

    const photos = await page.locator(GRID.item).evaluateAll((nodes) =>
        nodes.map((node) => ({
            href: node.getAttribute("href") ?? "",
            src: node.querySelector("img")?.getAttribute("src") ?? "",
            alt: node.querySelector("img")?.getAttribute("alt") ?? "",
            caption: node.getAttribute("data-caption") ?? "",
            path: node.getAttribute("data-photo-path") ?? "",
        })),
    );

    expect(photos.length, "照片数量不该为 0").toBeGreaterThan(0);
    expect(photos.length, "a[href] 数量必须等于 photos.length").toBe(declared);
    expect(await page.locator(GRID.image).count(), "img[src] 数量必须等于 photos.length").toBe(
        declared,
    );

    for (const photo of photos) {
        expect(photo.href, `${photo.path}: 原图必须是图床地址`).toMatch(ORIGINAL);
        expect(photo.href, `${photo.path}: 原图不该带宽度参数`).not.toMatch(THUMB);
        const thumb = THUMB.exec(photo.src);
        expect(thumb, `${photo.path}: 缩略图必须是站点 /cdn-cgi/image 地址`).not.toBeNull();
        expect(thumb?.[1], `${photo.path}: 缩略图宽度必须是 640`).toBe("640");
        expect(photo.href, `${photo.path}: 缩略图与原图不能是同一个地址`).not.toEqual(photo.src);
        // 图床 key 出现在两边：这是同源同图的两个尺寸，不是两张图
        expect(photo.href).toContain(photo.path);
        expect(photo.src).toContain(photo.path);
        // alt / 灯箱说明必须写出来（空 alt 在有内容的图片上是 a11y 缺陷）
        expect(photo.alt.length, `${photo.path}: 缺 alt`).toBeGreaterThan(0);
        expect(photo.caption, `${photo.path}: 灯箱说明缺失`).toEqual(photo.alt);
    }

    const distinct = new Set(photos.map((photo) => photo.href));
    expect(distinct.size, "原图地址必须唯一（同一张图不该出现两次）").toBe(photos.length);

    // 缩略图数量对账：网格内每条 img 的 src 都是 640 宽缩略图（页头 og:image 那几条不算）
    const gridHtml = await page.locator(GRID.container).innerHTML();
    const thumbHits = gridHtml.match(/cdn-cgi\/image\/width=640/g) ?? [];
    expect(thumbHits.length, "网格里 640 宽缩略图必须恰好 N 条").toBe(declared);

    console.log(
        `[split] ${declared} 张：缩略图 ${thumbHits.length} 条（width=640）· 原图 ${distinct.size} 条（图床，无宽度）`,
    );
});

/* ───────────────────────── 6. 三视口列数（核心） ───────────────────────── */

test("三视口列数：390 → 1、768 → 2、1440 → 3（列表页 + 详情页）", async ({ page }) => {
    const expected: Record<number, number> = { 390: 1, 768: 2, 1440: 3 };

    for (const width of VIEWPORTS) {
        await openPage(page, ALBUMS.url, "light", width);
        const wall = await page.locator(ALBUMS.wall).evaluate((node) => {
            const style = getComputedStyle(node);
            return {
                display: style.display,
                tracks: style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
                value: style.gridTemplateColumns,
            };
        });
        expect(wall.display, `${width}px: 相册墙必须是 grid`).toBe("grid");
        expect(wall.tracks, `${width}px: 相册墙列数`).toBe(expected[width]);

        await openPage(page, DETAIL, "light", width);
        const grid = await page.locator(GRID.container).evaluate((node) => ({
            columnCount: getComputedStyle(node).columnCount,
        }));
        expect(Number(grid.columnCount), `${width}px: 照片瀑布流列数`).toBe(expected[width]);

        console.log(
            `[columns] ${width}px → 墙 ${wall.tracks} 列（${wall.value}）· 照片 ${grid.columnCount} 列`,
        );
    }
});

/* ───────────────────────── 7. 灯箱复用（核心） ───────────────────────── */

test("灯箱：点开显示原图，Esc 关闭后焦点回到被点的那一张", async ({ page }) => {
    await openPage(page, DETAIL, "light");

    const first = page.locator(GRID.item).first();
    const original = await first.getAttribute("href");
    expect(original, "照片必须有原图地址").not.toBeNull();

    await first.focus();
    await expect(first).toBeFocused();
    await first.click();

    const container = page.locator(".fancybox__container");
    await expect(container).toBeVisible({ timeout: 10_000 });

    // 灯箱里加载的必须是原图（不带 width 的图床地址），不是缩略图
    await expect
        .poll(
            async () =>
                page
                    .locator(".fancybox__container img")
                    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src") ?? "")),
            { timeout: 10_000 },
        )
        .toContain(original as string);
    // 主视图（f-panzoom__content）必须是原图；底部胶片条故意复用网格缩略图（省一次下载），
    // 所以「灯箱里出现了缩略图」本身不是缺陷 —— 缺陷是主视图拿了缩略图。
    const mainSrcs = await page
        .locator(".fancybox__container .f-panzoom__content")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src") ?? ""));
    expect(mainSrcs.length, "灯箱主视图必须有图片").toBeGreaterThan(0);
    expect(
        mainSrcs.every((src) => ORIGINAL.test(src)),
        "灯箱主视图必须全部是图床原图",
    ).toBe(true);
    expect(
        mainSrcs.some((src) => src === original),
        "灯箱主视图必须就是被点的那张原图",
    ).toBe(true);

    await page.keyboard.press("Escape");
    await expect(container).toHaveCount(0, { timeout: 10_000 });
    // 焦点必须回到打开灯箱的那一张：否则键盘/读屏用户关闭后落在 body 上，位置全丢
    await expect(first, "关闭灯箱后焦点必须回到触发照片").toBeFocused();

    console.log(
        `[lightbox] 打开 → 主视图 ${mainSrcs.length} 条原图 · Esc 关闭 → 焦点归还 a[data-photo-index="0"]`,
    );
});

/* ───────────────────────── 8. 横向溢出 ───────────────────────── */

test("overflow albums（light/dark × 390/768/1440，列表页 + 详情页）", async ({ page }) => {
    for (const url of [ALBUMS.url, DETAIL]) {
        for (const theme of THEMES) {
            for (const width of VIEWPORTS) {
                await openPage(page, url, theme, width);
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
                expect(result.offenders, `${url}@${width} (${theme}): 越界元素`).toEqual([]);
                expect(
                    result.scrollWidth,
                    `${url}@${width} (${theme}): scrollWidth ${result.scrollWidth} > clientWidth ${result.clientWidth}`,
                ).toBeLessThanOrEqual(result.clientWidth + 1);
            }
        }
    }
});

/* ───────────────────────── 9. axe ───────────────────────── */

type AxeNode = { target: unknown[]; html: string; summary?: string };
type AxeViolation = { id: string; impact: string | null; help: string; nodes: AxeNode[] };

async function runAxe(page: Page, contextSelector?: string) {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(async (selector) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const axe = (window as any).axe;
        const map = (list: AxeViolation[]) =>
            list.map((v) => ({
                id: v.id,
                impact: v.impact,
                help: v.help,
                nodes: v.nodes.map((n) => ({
                    target: n.target,
                    html: n.html.slice(0, 200),
                    summary: n.summary,
                })),
            }));
        const scope = selector ? document.querySelector(selector) : document;
        const result = (await axe.run(scope ?? document, {
            runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
            resultTypes: ["violations", "incomplete"],
        })) as { violations: AxeViolation[]; incomplete: AxeViolation[] };
        return { violations: map(result.violations), incomplete: map(result.incomplete) };
    }, contextSelector);
}

for (const theme of THEMES) {
    test(`axe albums ${theme}（列表页 + 详情页）`, async ({ page }) => {
        for (const url of [ALBUMS.url, DETAIL]) {
            await openPage(page, url, theme);
            // 主题过渡必须落定，否则 axe 取到插值中间色（假红）
            await page.addStyleTag({
                content: `${ALBUMS.shell} * { transition: none !important; }`,
            });
            const { violations, incomplete } = await runAxe(page, ALBUMS.shell);
            const serious = violations.filter(
                (v) => v.impact === "serious" || v.impact === "critical",
            );
            expect(
                serious.map((v) => `${v.id} (${v.impact}) ${v.nodes[0]?.target ?? ""}`),
                `${url} ${theme}: serious/critical`,
            ).toEqual([]);
            expect(
                incomplete.map((v) => `${v.id} ${v.nodes[0]?.target ?? ""}`),
                `${url} ${theme}: incomplete`,
            ).toEqual([]);
            console.log(
                `[axe] ${url} ${theme}: violations=${violations.length} incomplete=${incomplete.length}`,
            );
        }
    });
}

/* ───────────────────────── 10. 导航 ───────────────────────── */

test("导航：相册入口存在、不溢出、可点击", async ({ page }) => {
    for (const width of [390, 1440] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/", { waitUntil: "load" });
        await page.locator("#nav-menu-btn").click();
        const nav = page.locator("#nav-dropdown");
        await expect(nav).toBeVisible();

        const link = nav.locator('a[href="/albums/"]');
        await expect(link, `${width}px: 导航缺相册入口`).toHaveCount(1);
        const box = await link.boundingBox();
        expect(box, `${width}px: 相册入口无布局盒`).not.toBeNull();
        const overflow = await nav.evaluate(
            (el) => el.getBoundingClientRect().right - document.documentElement.clientWidth,
        );
        expect(overflow, `${width}px: 导航面板越界`).toBeLessThanOrEqual(1);

        await stubImages(page);
        await link.click();
        await page.waitForURL("**/albums/");
        await expect(page.locator(ALBUMS.shell)).toHaveCount(1);
        console.log(`[nav] ${width}px: 相册入口可点击 → ${page.url()}`);
    }
});

/* ───────────────────────── 11. 空数据（真实构建） ───────────────────────── */

test("空数据可构建：真实构建为空态，路由仍 200", async ({ page }) => {
    test.setTimeout(900_000);
    const astroBin = path.join(ROOT, "node_modules/.bin/astro");

    try {
        execFileSync(astroBin, ["build"], {
            cwd: ROOT,
            env: { ...process.env, PUBLIC_ALBUMS_STATE: "empty" },
            stdio: "pipe",
        });

        await stubImages(page);
        const response = await page.goto(ALBUMS.url, { waitUntil: "load" });
        expect(response?.status(), "空态也必须 200").toBe(200);
        await expect(page.locator(ALBUMS.shell)).toHaveAttribute(ALBUMS.status, "empty");
        await expect(page.locator("[data-albums-empty]")).toBeVisible();
        await expect(page.locator(ALBUMS.item)).toHaveCount(0);
        // 页头仍在：空态是页面状态，不是异常
        await expect(page.locator(`${ALBUMS.shell} h1`)).toHaveCount(1);
        console.log("[empty] 真实构建：空态、0 本相册、页头保留、路由 200");
    } finally {
        // 恢复常规构建：后续用例（以及验收命令里的 perf / visual）必须看到正常数据
        execFileSync(astroBin, ["build"], { cwd: ROOT, env: process.env, stdio: "pipe" });
    }
});

/* ───────────────────────── 12. 证据截图 ───────────────────────── */

test("证据截图：列表页 light/dark 1440 + light 390，详情页 + 灯箱打开态", async ({ page }) => {
    if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
    const shots = [
        {
            url: ALBUMS.url,
            theme: "light" as Theme,
            width: 1440,
            name: "albums-wall-light-1440.png",
        },
        { url: ALBUMS.url, theme: "dark" as Theme, width: 1440, name: "albums-wall-dark-1440.png" },
        { url: ALBUMS.url, theme: "light" as Theme, width: 390, name: "albums-wall-light-390.png" },
        { url: DETAIL, theme: "light" as Theme, width: 1440, name: "album-detail-light-1440.png" },
        { url: DETAIL, theme: "light" as Theme, width: 390, name: "album-detail-light-390.png" },
    ];
    for (const shot of shots) {
        await openPage(page, shot.url, shot.theme, shot.width);
        await page.screenshot({ path: path.join(EVIDENCE_DIR, shot.name), fullPage: true });
    }

    // 灯箱打开态也留一张：灯箱是复用组件，没有可视化基线，靠这张图评审
    await openPage(page, DETAIL, "light", 1440);
    await page.locator(GRID.item).first().click();
    await expect(page.locator(".fancybox__container")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({
        path: path.join(EVIDENCE_DIR, "album-lightbox-open-1440.png"),
        fullPage: false,
    });

    console.log(`[evidence] ${shots.length + 1} 张截图 → ${EVIDENCE_DIR}`);
});
