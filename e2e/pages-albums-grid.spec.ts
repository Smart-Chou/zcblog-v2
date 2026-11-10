import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * M8-3a 相册索引栅格（相册第一刀）
 * ------------------------------------------------------------------
 * 契约（`blog2.0/docs/28-m8-card-split.md` §5.3 M8-3a）：
 *  1. 列数：< 768 → 1 列 · 768 → 2 列 · ≥ 1280 → 3 列（**不是 auto-fill**，
 *     列数由断点决定，断出来的数字才有契约意义）。
 *  2. 375 / 768 / 1280 × light / dark：0 横向溢出（整页 scrollWidth 与越界元素两路）。
 *  3. 筛选后卡片数正确：点每个地点按钮，可见卡片数 = 全量卡片里 data-tags 含该地点的数量；
 *     点「全部」（重置）全部回来 —— 筛选不因栅格改动回退。
 *  4. 卡片几何锁定：封面 4:3、同一面墙所有卡片等高、标题 2 行 / 元信息 1 行截断后
 *     卡片高度不变（用长标题 + 长地名压一遍，证明截断是真的在工作，不是碰巧数据短）。
 *  5. 空态：空数据构建（`PUBLIC_ALBUMS_STATE=empty`）下 `[data-albums-empty]` 可见、
 *     0 张卡片、页头保留。空态是构建期状态，所以用 `ALBUMS_BUILD=empty` 单独跑一遍
 *     指向空态产物的 runner（不在测试里再 build，省 4 分钟）。
 *  6. 证据截图 → `docs/_reviews/M8-3a/screens/`。
 *
 * 图片一律 route 成 1×1 PNG：图床是外网域名，本卡证明的是版式而不是图床今天是否在线。
 */

const ROOT = process.cwd();
const VARIANT = process.env.ALBUMS_BUILD ?? "full"; // full | empty

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [375, 768, 1280] as const;
const COLUMNS: Record<number, number> = { 375: 1, 768: 2, 1280: 3 };
type Theme = (typeof THEMES)[number];

const URL_ALBUMS = "/albums/";
const WALL = "[data-albums-wall]";
const CARD = "[data-album-item]";
const FILTER = ".gallery-filter";
const TAG = ".filter-tag";

const SCREENS = process.env.M83A_EVIDENCE_DIR ?? path.resolve(ROOT, "docs/_reviews/M8-3a/screens");

const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwB/wFz0q1kAAAAASUVORK5CYII=",
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

async function openAlbums(page: Page, theme: Theme, width: number): Promise<void> {
    await page.setViewportSize({ width, height: 900 });
    await stubImages(page);
    const response = await page.goto(URL_ALBUMS, { waitUntil: "load" });
    expect(response?.status(), `GET ${URL_ALBUMS} @${width}`).toBe(200);
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

/** 栅格 + 卡片几何：列数、封面比例、卡片等高、筛选条是否越界。 */
async function gridReport(page: Page) {
    return page.evaluate(
        ({ wallSel, cardSel, filterSel }) => {
            const wall = document.querySelector(wallSel) as HTMLElement | null;
            const filter = document.querySelector(filterSel) as HTMLElement | null;
            const doc = document.documentElement;
            const cards = [...document.querySelectorAll(cardSel)] as HTMLElement[];
            const style = wall ? getComputedStyle(wall) : null;
            const ratios = cards.map((card) => {
                const cover = card.querySelector(".album-card__cover") as HTMLElement;
                const rect = cover.getBoundingClientRect();
                return rect.width / rect.height;
            });
            const heights = cards.map((card) => card.getBoundingClientRect().height);
            const namesBeyond = cards.filter((card) => {
                const name = card.querySelector(".album-card__name") as HTMLElement;
                return name.scrollWidth > name.clientWidth + 1;
            }).length;
            return {
                display: style?.display ?? null,
                tracks: style
                    ? style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length
                    : 0,
                columns: style?.gridTemplateColumns ?? "",
                gap: style?.gap ?? "",
                cards: cards.length,
                ratioMin: ratios.length ? Math.min(...ratios) : 0,
                ratioMax: ratios.length ? Math.max(...ratios) : 0,
                heightMin: heights.length ? Math.min(...heights) : 0,
                heightMax: heights.length ? Math.max(...heights) : 0,
                namesBeyond,
                filterRect: filter ? filter.getBoundingClientRect().toJSON() : null,
                clientWidth: doc.clientWidth,
            };
        },
        { wallSel: WALL, cardSel: CARD, filterSel: FILTER },
    );
}

/* ───────────────────────── 1. 列数 + 几何 + 溢出（双主题 × 三视口） ───────────────────────── */

for (const theme of THEMES) {
    test(`栅格契约 ${theme}：375 → 1、768 → 2、1280 → 3 列，0 横向溢出`, async ({ page }) => {
        for (const width of VIEWPORTS) {
            await openAlbums(page, theme, width);
            const grid = await gridReport(page);
            const over = await overflowReport(page);

            expect(grid.display, `${width}px (${theme}): 相册墙必须是 grid`).toBe("grid");
            expect(grid.tracks, `${width}px (${theme}): 列数（${grid.columns}）`).toBe(
                COLUMNS[width],
            );
            expect(grid.cards, `${width}px (${theme}): 卡片数不该为 0`).toBeGreaterThan(0);

            // 封面 4:3 比例锁：任何列数都不改比例
            expect(grid.ratioMin, `${width}px (${theme}): 封面比例过小`).toBeGreaterThan(1.28);
            expect(grid.ratioMax, `${width}px (${theme}): 封面比例过大`).toBeLessThan(1.38);

            // 卡片高度锁定：同一面墙所有卡片等高（行高 1fr + 卡片撑满）
            expect(
                grid.heightMax - grid.heightMin,
                `${width}px (${theme}): 卡片不等高 ${grid.heightMin}–${grid.heightMax}`,
            ).toBeLessThanOrEqual(1);

            // 筛选条整条在视口内（左右都不越界）
            expect(grid.filterRect, `${width}px (${theme}): 筛选条缺失`).not.toBeNull();
            const box = grid.filterRect!;
            expect(box.x, `${width}px (${theme}): 筛选条左边越界 ${box.x}`).toBeGreaterThanOrEqual(
                -1,
            );
            expect(
                box.x + box.width,
                `${width}px (${theme}): 筛选条右边越界 ${Math.round(box.x + box.width)} > ${grid.clientWidth}`,
            ).toBeLessThanOrEqual(grid.clientWidth + 1);

            // 0 横向溢出：整页 + 逐元素两路
            expect(over.offenders, `${width}px (${theme}): 越界元素`).toEqual([]);
            expect(
                over.scrollWidth,
                `${width}px (${theme}): scrollWidth ${over.scrollWidth} > clientWidth ${over.clientWidth}`,
            ).toBeLessThanOrEqual(over.clientWidth + 1);

            console.log(
                `[grid] ${theme} ${width}px → ${grid.tracks} 列 · gap ${grid.gap} · ` +
                    `${grid.cards} 卡 · 高 ${Math.round(grid.heightMin)}–${Math.round(grid.heightMax)} · ` +
                    `比例 ${grid.ratioMin.toFixed(2)}–${grid.ratioMax.toFixed(2)} · scroll ${over.scrollWidth}/${over.clientWidth}`,
            );
        }
    });
}

/* ───────────────────────── 2. 筛选（三个视口都要数对） ───────────────────────── */

for (const width of VIEWPORTS) {
    test(`筛选 @${width}：每个地点按钮的可见卡片数 = data-tags 命中数，「全部」= 重置`, async ({
        page,
    }) => {
        await openAlbums(page, "light", width);

        const cards = page.locator(CARD);
        const total = await cards.count();
        expect(total, "示例数据应有相册").toBeGreaterThan(1);

        // 期望值从 DOM 自己算：不写死数字，数据变了断言也不假红
        const expected = await cards.evaluateAll((nodes) =>
            Object.fromEntries(
                [...document.querySelectorAll(".filter-tag")]
                    .map((btn) => btn.getAttribute("data-tag") ?? "")
                    .filter((tag) => tag !== "all")
                    .map((tag) => [
                        tag,
                        nodes.filter((node) =>
                            (node.getAttribute("data-tags") ?? "").split(",").includes(tag),
                        ).length,
                    ]),
            ),
        );
        const tags = Object.keys(expected);
        expect(tags.length, "筛选按钮不该只有「全部」").toBeGreaterThan(0);

        const visibleCount = () =>
            cards.evaluateAll(
                (nodes) => nodes.filter((node) => node.getBoundingClientRect().height > 0).length,
            );

        for (const tag of tags) {
            await page.locator(`${TAG}[data-tag="${tag}"]`).click();
            await expect(page.locator(`${TAG}[data-tag="${tag}"]`)).toHaveAttribute(
                "aria-pressed",
                "true",
            );
            expect(await visibleCount(), `${tag}: 筛选后卡片数`).toBe(expected[tag]);

            // 筛完之后栅格列数不变、仍然 0 溢出（列数由 CSS 决定，不是 JS 算的）
            const grid = await gridReport(page);
            expect(grid.tracks, `${tag} @${width}: 栅格列数不该被筛选改掉`).toBe(COLUMNS[width]);
            const over = await overflowReport(page);
            expect(over.offenders, `${tag} @${width}: 筛选后出现越界元素`).toEqual([]);
            expect(over.scrollWidth).toBeLessThanOrEqual(over.clientWidth + 1);

            console.log(`[filter] @${width} ${tag}: ${expected[tag]}/${total} 张卡片`);
        }

        // 「全部」= 重置按钮：不新增控件，点回全部就是重置
        await page.locator(`${TAG}[data-tag="all"]`).click();
        await expect(page.locator(`${TAG}[data-tag="all"]`)).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(await visibleCount(), "点回「全部」必须全部回来（重置）").toBe(total);
    });
}

/* ───────────────────────── 3. 截断稳定性（长标题 + 长地名） ───────────────────────── */

test("长标题 / 长地名：2 行 + 1 行截断，卡片高度不变且不撑破栅格", async ({ page }) => {
    for (const width of VIEWPORTS) {
        await openAlbums(page, "light", width);
        const before = await gridReport(page);

        // 把第一张卡改成极端内容：长相册名 + 长地名 + 长描述（数据里没有，所以现场改 DOM）
        await page
            .locator(CARD)
            .first()
            .evaluate((card) => {
                const name = card.querySelector(".album-card__name")!;
                name.textContent =
                    "浙江省杭州市西湖区灵隐寺飞来峰造像与北高峰索道往返（2024 年国庆长焦扫街合集）";
                const place = card.querySelector(".album-card__place-text");
                if (place)
                    place.textContent = "中华人民共和国浙江省杭州市西湖区灵隐街道法云弄 18 号";
                const desc = card.querySelector(".album-card__desc");
                if (desc) {
                    desc.textContent =
                        "这一段只是为了让说明区触发两行截断，验证过长文本不会把卡片顶高。".repeat(
                            3,
                        );
                }
            });

        const after = await gridReport(page);

        // 标题 2 行截断：盒内不出现横向滚动，且高度不超过 2 行
        const name = await page
            .locator(CARD)
            .first()
            .locator(".album-card__name")
            .evaluate((el) => {
                const line = parseFloat(getComputedStyle(el).lineHeight);
                return {
                    h: el.getBoundingClientRect().height,
                    scrollW: el.scrollWidth,
                    clientW: el.clientWidth,
                    line,
                };
            });
        expect(name.scrollW, `${width}px: 长标题溢出卡片宽度`).toBeLessThanOrEqual(
            name.clientW + 1,
        );
        expect(name.h, `${width}px: 长标题超过 2 行（${name.h}px）`).toBeLessThanOrEqual(
            name.line * 2 + 1,
        );

        // 元信息锁一行：地点被省略，不换行、不越界
        const meta = await page
            .locator(CARD)
            .first()
            .locator(".album-card__meta")
            .evaluate((el) => ({
                h: el.getBoundingClientRect().height,
                scrollW: el.scrollWidth,
                clientW: el.clientWidth,
            }));
        expect(meta.h, `${width}px: 元信息换行了`).toBeLessThanOrEqual(24);
        expect(meta.scrollW, `${width}px: 元信息溢出`).toBeLessThanOrEqual(meta.clientW + 1);

        // 卡片高度仍然锁定（等高），且墙面没有因长文本变宽/溢出
        expect(
            after.heightMax - after.heightMin,
            `${width}px: 长文本后卡片不等高 ${after.heightMin}–${after.heightMax}`,
        ).toBeLessThanOrEqual(1);
        const over = await overflowReport(page);
        expect(over.offenders, `${width}px: 长文本撑出横向溢出`).toEqual([]);
        expect(over.scrollWidth).toBeLessThanOrEqual(over.clientWidth + 1);

        console.log(
            `[clamp] ${width}px: 标题 ${Math.round(name.h)}px / 元信息 ${Math.round(meta.h)}px · ` +
                `卡片 ${Math.round(before.heightMin)}–${Math.round(before.heightMax)} → ${Math.round(after.heightMin)}–${Math.round(after.heightMax)}`,
        );
    }
});

/* ───────────────────────── 4. 空态（只在空态产物上跑） ───────────────────────── */

test(`空态：0 张卡片、空态文案可见、页头保留（ALBUMS_BUILD=${VARIANT}）`, async ({ page }) => {
    test.skip(VARIANT !== "empty", "本用例只在空数据构建上运行（ALBUMS_BUILD=empty）");

    await openAlbums(page, "light", 1280);
    await expect(page.locator("[data-albums-status]")).toHaveAttribute(
        "data-albums-status",
        "empty",
    );
    await expect(page.locator("[data-albums-empty]")).toBeVisible();
    await expect(page.locator(CARD)).toHaveCount(0);
    await expect(page.locator(WALL)).toHaveCount(0);
    // 空态是页面状态，不是异常：页头 / h1 必须还在
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(FILTER)).toHaveCount(0);

    const over = await overflowReport(page);
    expect(over.offenders, "空态：越界元素").toEqual([]);
    expect(over.scrollWidth).toBeLessThanOrEqual(over.clientWidth + 1);

    mkdirSync(SCREENS, { recursive: true });
    await page.screenshot({
        path: path.join(SCREENS, "albums-empty-light-1280.png"),
        fullPage: true,
    });

    console.log("[empty] 0 张卡片 · 空态可见 · h1 保留 · 0 溢出");
});

test("满态守卫：非空构建里空态不出现", async ({ page }) => {
    test.skip(VARIANT !== "full", "只在常规构建上运行");
    await openAlbums(page, "light", 1280);
    await expect(page.locator("[data-albums-status]")).toHaveAttribute("data-albums-status", "ok");
    await expect(page.locator("[data-albums-empty]")).toHaveCount(0);
    await expect(page.locator(CARD).first()).toBeVisible();
});

/* ───────────────────────── 5. 证据截图 ───────────────────────── */

test("证据截图：375 / 768 / 1280 × light / dark → docs/_reviews/M8-3a/screens/", async ({
    page,
}) => {
    test.skip(VARIANT !== "full", "截图只在常规构建上跑（空态另有 1 张）");
    mkdirSync(SCREENS, { recursive: true });
    let shots = 0;
    for (const theme of THEMES) {
        for (const width of VIEWPORTS) {
            await openAlbums(page, theme, width);
            await page.screenshot({
                path: path.join(SCREENS, `albums-${theme}-${width}.png`),
                fullPage: true,
            });
            shots += 1;
        }
    }
    console.log(`[evidence] ${shots} 张截图 → ${SCREENS}`);
});
