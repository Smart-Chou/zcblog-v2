import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * M8-3b 相册详情网格（相册第二刀）
 * ------------------------------------------------------------------
 * 契约（`blog2.0/docs/28-m8-card-split.md` §5.3 M8-3b）：
 *  1. 列数与索引页**同一口径**：< 768 → 1 列 · 768 → 2 列 · ≥ 1280 → 3 列。
 *     断点两侧都断（767/768、1279/1280），证明列数是 CSS 断点决定的，不是碰巧。
 *  2. 比例锁：每个瓦片 `aspect-ratio` 恒定 4/3（三档视口、双主题），
 *     同一行瓦片等宽等高、行内顶部对齐 —— 网格不该有瀑布流的错落。
 *  3. **0 布局偏移**（本卡核心）：先把所有图片请求卡住不响应，量一遍布局；
 *     放行后再量一遍 —— 瓦片的位置/尺寸必须逐像素一致。数据里没有宽高，
 *     所以这条只有在「盒子的高度不依赖图片」时才可能绿。
 *  4. 375 / 768 / 1280 × light / dark：0 横向溢出（整页 scrollWidth + 越界元素两路）。
 *  5. 灯箱不受影响（M8-3c 接手前不得回退）：点照片 → Fancybox 打开且主视图是**原图**；
 *     Esc 关闭后焦点回到被点的那一张。
 *  6. 缩略图 / 原图分离不回退：`a[href]` = `img[src]` = photos.length，缩略图仍是 width=640。
 *  7. 证据截图 → `docs/_reviews/M8-3b/screens/`（3 视口 × 2 主题 + 灯箱打开态）。
 *
 * 图片一律 route 成 1×1 PNG：图床与站点 /cdn-cgi/image 都是外网域名，
 * 本卡要证明的是版式与布局稳定性，不是图床今天是否在线。
 */

const ROOT = process.cwd();

const DETAIL = "/albums/shenzhen_feng-huang-shan/";
const GRID = "[data-album-grid]";
const ITEM = ".album-grid__item";
const IMAGE = ".album-grid__image";

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [375, 768, 1280] as const;
const COLUMNS: Record<number, number> = { 375: 1, 768: 2, 1280: 3 };
type Theme = (typeof THEMES)[number];

/** 比例锁的数值口径：4/3 = 1.3333，允许亚像素误差。 */
const RATIO_MIN = 1.28;
const RATIO_MAX = 1.38;

const SCREENS = process.env.M83B_EVIDENCE_DIR ?? path.resolve(ROOT, "docs/_reviews/M8-3b/screens");

const THUMB = /^https:\/\/marxchou\.com\/cdn-cgi\/image\/[^/]*width=(\d+)[^/]*\//;
const ORIGINAL = /^https:\/\/pic-api\.marxchou\.com\/api\/pic\//;

const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/wFz0q1kAAAAAElFTkSuQmCC",
    "base64",
);

async function stubImages(page: Page): Promise<void> {
    await page.route("https://marxchou.com/cdn-cgi/image/**", (route) =>
        route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }),
    );
    await page.route("https://pic-api.marxchou.com/**", (route) =>
        route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }),
    );
}

async function openDetail(page: Page, theme: Theme, width: number, url = DETAIL): Promise<void> {
    await page.setViewportSize({ width, height: 900 });
    await stubImages(page);
    const response = await page.goto(url, { waitUntil: "load" });
    expect(response?.status(), `GET ${url} @${width}`).toBe(200);
    await page.evaluate((value) => {
        document.documentElement.setAttribute("data-theme", value);
    }, theme);
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
    });
    // 主题过渡最长 --duration-slow：没落定就量，量到的是插值中间态
    await page.waitForTimeout(420);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

/** 网格几何：列数、瓦片比例、行对齐。 */
async function gridReport(page: Page) {
    return page.evaluate(
        ({ gridSel, itemSel, imageSel }) => {
            const grid = document.querySelector(gridSel) as HTMLElement | null;
            const style = grid ? getComputedStyle(grid) : null;
            const items = [...document.querySelectorAll(itemSel)] as HTMLElement[];
            const tiles = items.map((item) => {
                const rect = item.getBoundingClientRect();
                const image = item.querySelector(imageSel) as HTMLElement | null;
                const imageRect = image?.getBoundingClientRect() ?? null;
                return {
                    w: rect.width,
                    h: rect.height,
                    x: rect.x,
                    y: rect.y,
                    ratio: rect.width / rect.height,
                    aspect: getComputedStyle(item).aspectRatio,
                    objectFit: image ? getComputedStyle(image).objectFit : "",
                    imageCovers: imageRect
                        ? Math.abs(imageRect.width - rect.width) < 1 &&
                          Math.abs(imageRect.height - rect.height) < 1
                        : false,
                };
            });
            return {
                display: style?.display ?? null,
                tracks: style
                    ? style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length
                    : 0,
                columns: style?.gridTemplateColumns ?? "",
                gap: style?.gap ?? "",
                declared: grid?.getAttribute("data-album-tile-ratio") ?? "",
                declaredPhotos: Number(grid?.getAttribute("data-album-photo-count") ?? -1),
                tiles,
            };
        },
        { gridSel: GRID, itemSel: ITEM, imageSel: IMAGE },
    );
}

/** 页面级横向溢出：整页 scrollWidth + 越界元素（祖先已有裁剪的不算）。 */
async function overflowReport(page: Page) {
    return page.evaluate(() => {
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
            .slice(0, 6)
            .map(
                (el) =>
                    `${el.tagName.toLowerCase()}.${el.className} right=${Math.round(el.getBoundingClientRect().right)}`,
            );
        return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders };
    });
}

/**
 * 文档坐标下的布局快照（offset* 与滚动位置无关，才是「页面推没推」的证据）。
 * 取瓦片与页脚的总高度：图片到货后若撑高任何一块，这里立刻不等。
 */
async function layoutSnapshot(page: Page) {
    return page.evaluate((itemSel) => {
        const items = [...document.querySelectorAll(itemSel)] as HTMLElement[];
        return {
            height: document.documentElement.scrollHeight,
            tiles: items.map((item) => ({
                left: item.offsetLeft,
                top: item.offsetTop,
                width: item.offsetWidth,
                height: item.offsetHeight,
            })),
        };
    }, ITEM);
}

/* ───────────────────────── 1. 列数契约（双主题 × 三视口） ───────────────────────── */

for (const theme of THEMES) {
    test(`列数契约 ${theme}：375 → 1、768 → 2、1280 → 3，0 横向溢出`, async ({ page }) => {
        for (const width of VIEWPORTS) {
            await openDetail(page, theme, width);
            const grid = await gridReport(page);
            const over = await overflowReport(page);

            expect(grid.display, `${width}px (${theme}): 照片网格必须是 grid`).toBe("grid");
            expect(grid.tracks, `${width}px (${theme}): 列数（${grid.columns}）`).toBe(
                COLUMNS[width],
            );
            expect(grid.tiles.length, `${width}px (${theme}): 瓦片数不该为 0`).toBeGreaterThan(0);
            expect(grid.tiles.length, "瓦片数必须等于 data-album-photo-count").toBe(
                grid.declaredPhotos,
            );

            const ratios = grid.tiles.map((tile) => tile.ratio);
            expect(
                Math.min(...ratios),
                `${width}px (${theme}): 比例锁失效（最小）`,
            ).toBeGreaterThan(RATIO_MIN);
            expect(Math.max(...ratios), `${width}px (${theme}): 比例锁失效（最大）`).toBeLessThan(
                RATIO_MAX,
            );
            expect(
                grid.tiles.every((tile) => tile.objectFit === "cover"),
                `${width}px (${theme}): 图片必须 object-fit: cover（否则瓦片里留底色）`,
            ).toBe(true);
            expect(
                grid.tiles.every((tile) => tile.imageCovers),
                `${width}px (${theme}): 图片必须撑满瓦片`,
            ).toBe(true);

            // 行对齐：每行瓦片顶部 y 相同、宽度相同（瀑布流的错落在网格里是缺陷）
            const rows = new Map<number, number[]>();
            for (const tile of grid.tiles) {
                const key = Math.round(tile.y);
                rows.set(key, [...(rows.get(key) ?? []), tile.w]);
            }
            for (const [top, widths] of rows) {
                expect(
                    Math.max(...widths) - Math.min(...widths),
                    `${width}px (${theme}): 行 y=${top} 内瓦片不等宽 ${widths.map((w) => Math.round(w))}`,
                ).toBeLessThanOrEqual(1);
            }

            expect(over.offenders, `${width}px (${theme}): 越界元素`).toEqual([]);
            expect(
                over.scrollWidth,
                `${width}px (${theme}): scrollWidth ${over.scrollWidth} > clientWidth ${over.clientWidth}`,
            ).toBeLessThanOrEqual(over.clientWidth + 1);

            console.log(
                `[grid] ${theme} ${width}px → ${grid.tracks} 列 · gap ${grid.gap} · ` +
                    `${grid.tiles.length} 瓦片 · 瓦片 ${Math.round(grid.tiles[0].w)}×${Math.round(grid.tiles[0].h)} · ` +
                    `比例 ${Math.min(...ratios).toFixed(2)}–${Math.max(...ratios).toFixed(2)} · ` +
                    `行 ${rows.size} · scroll ${over.scrollWidth}/${over.clientWidth}`,
            );
        }
    });
}

/* ───────────────────────── 2. 断点两侧（列数不是碰巧） ───────────────────────── */

test("断点两侧：767 → 1、768 → 2、1279 → 2、1280 → 3", async ({ page }) => {
    const cases: [number, number][] = [
        [375, 1],
        [767, 1],
        [768, 2],
        [1023, 2],
        [1279, 2],
        [1280, 3],
        [1440, 3],
    ];
    for (const [width, expected] of cases) {
        await openDetail(page, "light", width);
        const grid = await gridReport(page);
        expect(grid.tracks, `${width}px: 列数（${grid.columns}）`).toBe(expected);
        console.log(`[breakpoint] ${width}px → ${grid.tracks} 列（${grid.columns}）`);
    }
});

/* ───────────────────────── 3. 0 布局偏移（核心） ───────────────────────── */

test("0 布局偏移：图片卡住时与到货后，瓦片位置尺寸逐像素一致", async ({ page }) => {
    for (const width of VIEWPORTS) {
        await page.setViewportSize({ width, height: 900 });

        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        const hold = async (route: import("@playwright/test").Route) => {
            await gate;
            await route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
        };
        await page.route("https://marxchou.com/cdn-cgi/image/**", hold);
        await page.route("https://pic-api.marxchou.com/**", hold);

        const response = await page.goto(DETAIL, { waitUntil: "domcontentloaded" });
        expect(response?.status(), `GET ${DETAIL} @${width}`).toBe(200);
        await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            );
        });

        // 图片一张都没到：这时铺出来的就是「没有图片高度信息」时的布局
        const before = await layoutSnapshot(page);
        const beforeLoaded = await page.evaluate(
            () => [...document.images].filter((img) => img.complete && img.naturalWidth > 0).length,
        );
        expect(before.tiles.length, "瓦片不该为 0").toBeGreaterThan(0);
        const beforeHeight = (await page.locator(ITEM).first().boundingBox())!.height;
        expect(
            beforeHeight,
            `${width}px: 图片未到货时瓦片高度不该为 0（必须由比例锁撑开）`,
        ).toBeGreaterThan(40);

        // 放行：图片陆续到货
        release();
        await page.waitForFunction(
            () =>
                [...document.images]
                    .filter((img) => img.loading !== "lazy")
                    .every((img) => img.complete),
            undefined,
            { timeout: 15_000 },
        );
        // 滚到底再回顶：把 loading="lazy" 的那批也逼出来（懒加载在视口内才请求）
        await page.evaluate(async () => {
            const step = window.innerHeight / 2;
            for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
                window.scrollTo(0, y);
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            }
            window.scrollTo(0, 0);
        });
        await page.waitForFunction(
            () => [...document.images].every((img) => img.complete && img.naturalWidth > 0),
            undefined,
            { timeout: 20_000 },
        );
        await page.waitForTimeout(300);

        const after = await layoutSnapshot(page);
        const afterLoaded = await page.evaluate(
            () => [...document.images].filter((img) => img.complete && img.naturalWidth > 0).length,
        );

        expect(afterLoaded, "放行后所有图片都应加载完成").toBeGreaterThan(beforeLoaded);
        expect(after.tiles.length, "图片到货不该改变瓦片数量").toBe(before.tiles.length);
        expect(
            after.height,
            `${width}px: 图片到货后页面总高变了（${before.height} → ${after.height}）`,
        ).toBe(before.height);
        for (let i = 0; i < before.tiles.length; i += 1) {
            expect(
                after.tiles[i],
                `${width}px: 第 ${i + 1} 张瓦片位置/尺寸在图片到货后变了（布局偏移）`,
            ).toEqual(before.tiles[i]);
        }

        console.log(
            `[cls] ${width}px: 图片 ${beforeLoaded}/${before.tiles.length} → ${afterLoaded}/${after.tiles.length} · ` +
                `页高 ${before.height} → ${after.height} · ${before.tiles.length} 瓦片偏移 0`,
        );

        await page.unroute("https://marxchou.com/cdn-cgi/image/**");
        await page.unroute("https://pic-api.marxchou.com/**");
    }
});

/* ───────────────────────── 4. 灯箱不回退 ───────────────────────── */

test("灯箱仍能打开：主视图是原图，Esc 关闭后焦点回到被点的那一张", async ({ page }) => {
    await openDetail(page, "light", 1280);

    const first = page.locator(ITEM).first();
    const original = await first.getAttribute("href");
    expect(original, "照片必须有原图地址").not.toBeNull();

    await first.focus();
    await expect(first).toBeFocused();
    await first.click();

    const container = page.locator(".fancybox__container");
    await expect(container).toBeVisible({ timeout: 10_000 });

    const mainSrcs = await page
        .locator(".fancybox__container .f-panzoom__content")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src") ?? ""));
    expect(mainSrcs.length, "灯箱主视图必须有图片").toBeGreaterThan(0);
    expect(
        mainSrcs.every((src) => ORIGINAL.test(src)),
        "灯箱主视图必须全部是图床原图（不是缩略图）",
    ).toBe(true);
    expect(
        mainSrcs.some((src) => src === original),
        "灯箱主视图必须就是被点的那张原图",
    ).toBe(true);

    await page.keyboard.press("Escape");
    await expect(container).toHaveCount(0, { timeout: 10_000 });
    await expect(first, "关闭灯箱后焦点必须回到触发照片").toBeFocused();

    console.log(`[lightbox] 主视图 ${mainSrcs.length} 条原图 · Esc 关闭 → 焦点归还`);
});

/* ───────────────────────── 5. 缩略图 / 原图分离不回退 ───────────────────────── */

test("缩略图与原图分离不回退：数量对账 + width=640 缩略图", async ({ page }) => {
    await openDetail(page, "light", 1280);

    const grid = page.locator(GRID);
    const declared = Number(await grid.getAttribute("data-album-photo-count"));
    const photos = await page.locator(ITEM).evaluateAll((nodes) =>
        nodes.map((node) => ({
            href: node.getAttribute("href") ?? "",
            src: node.querySelector("img")?.getAttribute("src") ?? "",
        })),
    );

    expect(photos.length, "a[href] 数量必须等于 photos.length").toBe(declared);
    expect(await page.locator(IMAGE).count(), "img[src] 数量必须等于 photos.length").toBe(declared);
    for (const photo of photos) {
        expect(photo.href, "原图必须是图床地址").toMatch(ORIGINAL);
        expect(photo.href, "原图不该带宽度参数").not.toMatch(THUMB);
        expect(THUMB.exec(photo.src)?.[1], "缩略图宽度必须是 640").toBe("640");
    }
    console.log(`[split] ${declared} 张：原图走图床 · 缩略图 width=640`);
});

/* ───────────────────────── 6. 证据截图 ───────────────────────── */

test("证据截图：375 / 768 / 1280 × light / dark + 灯箱打开态 → docs/_reviews/M8-3b/screens/", async ({
    page,
}) => {
    mkdirSync(SCREENS, { recursive: true });
    let shots = 0;
    for (const theme of THEMES) {
        for (const width of VIEWPORTS) {
            await openDetail(page, theme, width);
            await page.screenshot({
                path: path.join(SCREENS, `album-detail-${theme}-${width}.png`),
                fullPage: true,
            });
            shots += 1;
        }
    }

    await openDetail(page, "light", 1280);
    await page.locator(ITEM).first().click();
    await expect(page.locator(".fancybox__container")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({
        path: path.join(SCREENS, "album-detail-lightbox-1280.png"),
        fullPage: false,
    });
    shots += 1;

    console.log(`[evidence] ${shots} 张截图 → ${SCREENS}`);
});
