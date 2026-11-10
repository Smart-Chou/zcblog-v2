import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * M8-3c 相册灯箱（相册第三刀）
 * ------------------------------------------------------------------
 * 契约（`blog2.0/docs/28-m8-card-split.md` §5.3 M8-3c）：
 *  1. 桌面（1440）：灯箱居中、最大视口 92%；底部缩略条可横向滚动。
 *  2. 移动（390）：全屏 sheet（图贴边、遮罩取主题底色、无箭头浮标）。
 *  3. 键盘：←/→ 切图、Esc 关闭；Tab 焦点陷阱；关闭后焦点回到被点的那一张。
 *  4. 语义：`role=dialog` + `aria-modal=true` + 可读标题（随换图刷新）。
 *  5. reduced-motion：灯箱内 0 个运行中动画（与 M7 modal 同口径）。
 *  6. 触摸：移动端左右滑动切图（真 CDP touch 序列，不是鼠标模拟）。
 *  7. 0 横向溢出（1440 / 390，灯箱打开态）。
 *  8. axe light/dark：serious/critical = 0。
 *  9. 证据截图 → `docs/_reviews/M8-3c/screens/`。
 *
 * 图片一律 route 成 1600×1200 的 SVG：灯箱是「按原图比例 contain」，
 * 用 1×1 PNG 量出来的盒子只有 1px，等于什么都没测。
 */

const ROOT = process.cwd();
const DETAIL = "/albums/shenzhen_feng-huang-shan/";
const GRID = "[data-album-grid]";
const ITEM = ".album-grid__item";
const TOTAL = 12;
const DIALOG = "dialog.fancybox__dialog";
const READY = ".fancybox__container.is-ready";

const SCREENS = process.env.M83C_EVIDENCE_DIR ?? path.resolve(ROOT, "docs/_reviews/M8-3c/screens");
const AXE_SOURCE = readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#c1440e"/></svg>`;

type Theme = "light" | "dark";

async function stubImages(page: Page): Promise<void> {
    await page.route("https://marxchou.com/cdn-cgi/image/**", (route) =>
        route.fulfill({ status: 200, contentType: "image/svg+xml", body: SVG }),
    );
    await page.route("https://pic-api.marxchou.com/**", (route) =>
        route.fulfill({ status: 200, contentType: "image/svg+xml", body: SVG }),
    );
}

async function openDetail(
    page: Page,
    theme: Theme = "light",
    width = 1440,
    height = 900,
): Promise<void> {
    await page.setViewportSize({ width, height });
    await stubImages(page);
    const response = await page.goto(DETAIL, { waitUntil: "load" });
    expect(response?.status(), `GET ${DETAIL}`).toBe(200);
    await page.evaluate((value) => {
        document.documentElement.setAttribute("data-theme", value);
    }, theme);
    await page.evaluate(async () => {
        await document.fonts.ready;
    });
    // 灯箱是异步 import + bind：脚本自己置位，比 sleep 靠谱
    await page.locator(`${GRID}[data-lightbox-ready="1"]`).waitFor({ timeout: 15_000 });
}

async function openLightbox(page: Page, index = 0): Promise<void> {
    const item = page.locator(ITEM).nth(index);
    await item.scrollIntoViewIfNeeded();
    await item.click();
    await page.locator(READY).waitFor({ timeout: 15_000 });
    expect(page.url(), "点缩略图不能导航走，必须由灯箱接手").toContain(DETAIL);
    await expect
        .poll(
            async () =>
                page
                    .locator(".fancybox__slide.is-selected .f-panzoom__content")
                    .first()
                    .evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0),
            { timeout: 10_000 },
        )
        .toBe(true);
}

const counter = (page: Page) =>
    page.locator(".fancybox--album .f-counter").innerText().then((text) => text.replace(/\s+/g, ""));

const ariaLabel = (page: Page) => page.locator(DIALOG).getAttribute("aria-label");

/** 灯箱几何：视口、dialog、选中图、幻灯片盒、缩略条。 */
function geometry(page: Page) {
    return page.evaluate(() => {
        const rect = (el: Element | null) => {
            if (!el) return null;
            const box = el.getBoundingClientRect();
            return {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                right: box.right,
                bottom: box.bottom,
                centerX: box.x + box.width / 2,
                centerY: box.y + box.height / 2,
            };
        };
        const dialog = document.querySelector("dialog.fancybox__dialog");
        const container = document.querySelector(".fancybox--album");
        const slide = document.querySelector(".fancybox__slide.is-selected");
        const image = slide?.querySelector(".f-panzoom__content") ?? null;
        const caption = slide?.querySelector(".f-caption") ?? null;
        const thumbs = document.querySelector(".fancybox__thumbs");
        const viewport = document.querySelector(".f-thumbs__viewport");
        const selected = viewport?.querySelector(".f-thumbs__slide.is-selected") ?? null;
        // 「92% 视口」是盒子上限；图必须在这个上限内**尽量大**（contain 到极限），
        // 所以按幻灯片内容盒算一个期望尺寸，逐像素对账。
        let expectFit: { width: number; height: number } | null = null;
        let slidePadding: number[] = [];
        if (slide && image) {
            const cs = getComputedStyle(slide);
            const padY = parseFloat(cs.paddingTop);
            const padX = parseFloat(cs.paddingLeft);
            slidePadding = [padY, padX];
            const box = slide.getBoundingClientRect();
            const captionHeight = caption ? caption.getBoundingClientRect().height : 0;
            const availW = box.width - padX * 2;
            const availH = box.height - padY * 2 - captionHeight;
            const natural = image as HTMLImageElement;
            const scale = Math.min(availW / natural.naturalWidth, availH / natural.naturalHeight);
            expectFit = {
                width: natural.naturalWidth * scale,
                height: natural.naturalHeight * scale,
            };
        }
        // 「图 + 说明」作为一个整体垂直居中（图单独居中会让说明压到图上看不见）
        const figure = (() => {
            const img = rect(image);
            const cap = rect(caption);
            if (!img) return null;
            const top = img.y;
            const bottom = cap ? Math.max(img.bottom, cap.bottom) : img.bottom;
            return { y: top, bottom, height: bottom - top, centerY: (top + bottom) / 2 };
        })();
        return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            docClient: {
                width: document.documentElement.clientWidth,
                height: document.documentElement.clientHeight,
            },
            dialog: rect(dialog),
            container: rect(container),
            slide: rect(slide),
            image: rect(image),
            expectFit,
            figure,
            caption: rect(caption),
            imageRatio: image
                ? (image as HTMLImageElement).naturalWidth /
                  (image as HTMLImageElement).naturalHeight
                : 0,
            slidePadding,
            thumbs: rect(thumbs),
            thumbsScroll: viewport
                ? {
                      overflowX: getComputedStyle(viewport).overflowX,
                      scrollWidth: viewport.scrollWidth,
                      clientWidth: viewport.clientWidth,
                      scrollLeft: viewport.scrollLeft,
                  }
                : null,
            thumbCount: document.querySelectorAll(".f-thumbs__slide").length,
            selectedThumb: rect(selected),
            arrowDisplay: Array.from(document.querySelectorAll(".f-button.is-arrow")).map(
                (el) => getComputedStyle(el).display,
            ),
            backdropColor: getComputedStyle(document.querySelector(".fancybox__backdrop")!).backgroundColor,
            docOverflow: {
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
            },
            dialogOverflow: dialog
                ? { scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth }
                : null,
        };
    });
}

/* ───────────────────── 1. 桌面：92% 居中 + 底部缩略条 ───────────────────── */

test("1440 · 打开：图片 ≤92% 视口且居中 · 底部缩略条可横向滚动", async ({ page }) => {
    await openDetail(page, "light", 1440, 900);
    await openLightbox(page, 0);
    const geo = await geometry(page);
    const image = geo.image!;

    // 92%：宽高都不越界（±1px 亚像素）
    expect(image.width, "灯箱图宽 ≤ 92vw").toBeLessThanOrEqual(geo.viewport.width * 0.92 + 1);
    expect(image.height, "灯箱图高 ≤ 92vh").toBeLessThanOrEqual(geo.viewport.height * 0.92 + 1);
    // 但不能是小图：必须把「幻灯片内容盒」吃到极限（contain 的极限尺寸 = 期望尺寸）
    expect(image.width, "图宽吃到 slide 内容盒极限").toBeCloseTo(geo.expectFit!.width, 0);
    expect(image.height, "图高吃到 slide 内容盒极限").toBeCloseTo(geo.expectFit!.height, 0);
    // 原图 4:3 必须按比例 contain（不是拉变形）
    expect(Math.abs(image.width / image.height - 4 / 3)).toBeLessThan(0.02);

    // 居中：水平对灯箱自身居中；垂直按「图 + 说明」整组对轮播区居中
    expect(Math.abs(image.centerX - geo.dialog!.centerX), "水平居中").toBeLessThanOrEqual(2);
    expect(
        Math.abs(geo.figure!.centerY - geo.slide!.centerY),
        "图 + 说明整组垂直居中",
    ).toBeLessThanOrEqual(2);

    // 缩略条：在底部、满宽、12 张、原生横向滚动
    expect(geo.thumbCount, "缩略条必须列出全部 12 张").toBe(TOTAL);
    expect(geo.thumbs!.width, "缩略条满宽（与灯箱等宽）").toBeGreaterThan(geo.dialog!.width - 2);
    expect(geo.thumbs!.y, "缩略条在图片下方").toBeGreaterThan(geo.slide!.bottom - 1);
    expect(geo.thumbs!.bottom, "缩略条不越出视口").toBeLessThanOrEqual(geo.viewport.height + 1);
    expect(geo.thumbsScroll!.overflowX, "缩略条横向滚动容器").toBe("auto");

    // 语义：role/aria-modal/可读标题
    await expect(page.locator(DIALOG)).toHaveAttribute("role", "dialog");
    await expect(page.locator(DIALOG)).toHaveAttribute("aria-modal", "true");
    const label = await ariaLabel(page);
    expect(label, "可读标题要带照片描述与位置").toMatch(/1\/12$/);
    expect(label!.length, "可读标题不能为空").toBeGreaterThan(4);

    // 0 横向溢出
    expect(geo.docOverflow.scrollWidth, "文档 0 横向溢出").toBeLessThanOrEqual(
        geo.docOverflow.clientWidth + 1,
    );
    expect(geo.dialogOverflow!.scrollWidth, "dialog 0 横向溢出").toBeLessThanOrEqual(
        geo.dialogOverflow!.clientWidth + 1,
    );

    expect(await counter(page)).toBe("1/12");
    console.log(`[1440] 图 ${Math.round(image.width)}×${Math.round(image.height)} · 缩略条 ${geo.thumbCount} 张 · ${label}`);
});

/* ───────────────────── 2. 键盘切图 + 选中跟随 ───────────────────── */

test("1440 · →/← 切图：计数、aria 标题、主图、选中缩略图同步", async ({ page }) => {
    await openDetail(page, "light", 1440, 900);
    await openLightbox(page, 0);

    const second = await page.locator(ITEM).nth(1).getAttribute("href");
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => counter(page), { timeout: 5_000 }).toBe("2/12");
    await expect.poll(async () => ariaLabel(page), { timeout: 5_000 }).toMatch(/2\/12$/);

    const selected = await page.evaluate(() => {
        const slide = document.querySelector(".fancybox__slide.is-selected");
        return {
            src: slide?.querySelector(".f-panzoom__content")?.getAttribute("src") ?? "",
            thumbIndex: document
                .querySelector(".f-thumbs__slide.is-selected")
                ?.getAttribute("index"),
        };
    });
    expect(selected.src, "主图必须换成第 2 张的原图").toBe(second);
    expect(selected.thumbIndex, "缩略条选中项必须跟到第 2 张").toBe("1");

    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => counter(page), { timeout: 5_000 }).toBe("1/12");
    console.log("[keyboard] → 2/12 → ← 1/12：主图与缩略条选中项同步");
});

/* ───────────────────── 3. 三种关闭方式 + 焦点回填 ───────────────────── */

for (const how of ["Esc", "关闭键", "遮罩"] as const) {
    test(`1440 · ${how} 关闭 → 焦点回到被点的那一张`, async ({ page }) => {
        await openDetail(page, "light", 1440, 900);
        const target = page.locator(ITEM).nth(2);
        await target.scrollIntoViewIfNeeded();
        await target.focus();
        await target.click();
        await page.locator(READY).waitFor({ timeout: 15_000 });

        if (how === "Esc") {
            await page.keyboard.press("Escape");
        } else if (how === "关闭键") {
            await page.locator(`${READY} .f-carousel__toolbar [data-fancybox-close]`).click();
        } else {
            // 遮罩点击：点在图片左侧的空白遮罩上（图本身占中间，点图是缩放不是关闭）
            await page
                .locator(".fancybox__slide.is-selected")
                .click({ position: { x: 24, y: 300 } });
        }

        await expect(page.locator(DIALOG)).toHaveCount(0, { timeout: 10_000 });
        await expect(target, `[${how}] 关闭后焦点必须回到触发照片`).toBeFocused();
        console.log(`[close] ${how} → dialog 已销毁 · 焦点回 a[data-photo-index="2"]`);
    });
}

/* ───────────────────── 4. Tab 焦点陷阱 ───────────────────── */

test("1440 · Tab / Shift+Tab 焦点陷阱：后台内容 inert，焦点只在灯箱与浏览器 UI 之间", async ({
    page,
}) => {
    await openDetail(page, "light", 1440, 900);
    await openLightbox(page, 0);

    /**
     * 原生 <dialog>.showModal() 的「陷阱」真实口径：页面其余部分是 inert，
     * 任何页面元素都拿不到焦点；Tab 走到最后一个可聚焦元素后交给浏览器 UI，
     * 此时 document.activeElement 落回 <body>（这是浏览器行为，不是漏焦点）。
     * 所以判据是「绝不落在灯箱外的页面元素上」，而不是「永远停在 dialog 里」。
     */
    const probe = () =>
        page.evaluate(() => {
            const dialog = document.querySelector("dialog.fancybox__dialog");
            const active = document.activeElement as HTMLElement | null;
            const inDialog = !!(dialog && active && dialog.contains(active));
            const isChrome = !active || active === document.body || active === document.documentElement;
            return {
                inDialog,
                isChrome,
                outsidePageElement: !inDialog && !isChrome,
                tag: active?.tagName ?? "",
                label: (active?.getAttribute("aria-label") ?? active?.className ?? "").toString().slice(0, 40),
            };
        });

    const visited = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
        await page.keyboard.press("Tab");
        const state = await probe();
        expect(
            state.outsidePageElement,
            `第 ${i + 1} 次 Tab 焦点落在灯箱外的页面元素上（${state.tag}.${state.label}）`,
        ).toBe(false);
        if (state.inDialog) visited.add(`${state.tag}.${state.label}`);
    }
    for (let i = 0; i < 10; i += 1) {
        await page.keyboard.press("Shift+Tab");
        const state = await probe();
        expect(state.outsidePageElement, `第 ${i + 1} 次 Shift+Tab 焦点跑到后台`).toBe(false);
    }
    expect(visited.size, "焦点陷阱里要有多个可聚焦目标（不是死钉在一个元素上）").toBeGreaterThan(2);

    // 直接 focus 后台链接也必须失败：inert 是焦点陷阱的底层保证
    const stolen = await page.evaluate(() => {
        const link = document.querySelector<HTMLElement>(".album-grid__item");
        link?.focus();
        return document.activeElement === link;
    });
    expect(stolen, "灯箱打开时后台缩略图不得夺焦（inert）").toBe(false);

    console.log(
        `[focus] Tab×30 + Shift+Tab×10：0 次落到后台页面元素 · ${visited.size} 个不同焦点目标 · 后台 inert`,
    );
});

/* ───────────────────── 5. 390 全屏 sheet ───────────────────── */

for (const theme of ["light", "dark"] as const) {
    test(`390 · ${theme}：全屏 sheet（贴边/遮罩不透明/缩略条可横向滚动/无箭头）`, async ({ page }) => {
        await openDetail(page, theme, 390, 844);
        await openLightbox(page, 0);
        const geo = await geometry(page);

        // 满屏 sheet：dialog 左上角贴 0，尺寸 = 视口（headless 的 15px 经典滚动条不算缺）
        expect(geo.dialog!.x, "sheet 贴左").toBe(0);
        expect(geo.dialog!.y, "sheet 贴上").toBe(0);
        expect(geo.dialog!.width, "sheet 满宽").toBeGreaterThanOrEqual(geo.docClient.width - 16);
        expect(geo.dialog!.height, "sheet 满高").toBeGreaterThanOrEqual(geo.docClient.height - 1);
        expect(geo.slide!.width, "sheet 内图片区无左右留白").toBe(geo.dialog!.width);
        expect(geo.slidePadding, "sheet 图片贴边（slide padding 0）").toEqual([0, 0]);
        expect(geo.image!.width, "390 下图片铺满可用宽").toBeGreaterThan(geo.dialog!.width - 12);
        expect(geo.backdropColor, "遮罩必须是纯色主题底（不是 0.95 浮层）").toMatch(
            /^rgb\(|^color\(/,
        );
        expect(geo.backdropColor.includes("rgba"), "遮罩不能半透明").toBe(false);

        // 缩略条：12 张、横向可滚动（内容宽 > 视口宽）
        expect(geo.thumbCount).toBe(TOTAL);
        expect(geo.thumbsScroll!.scrollWidth, "缩略条内容必须超出容器才能横滚").toBeGreaterThan(
            geo.thumbsScroll!.clientWidth + 20,
        );

        // 触摸端不保留左右箭头
        expect(geo.arrowDisplay.length, "箭头存在但被隐藏").toBeGreaterThan(0);
        expect(new Set(geo.arrowDisplay), "箭头 display:none").toEqual(new Set(["none"]));

        // 0 横向溢出
        expect(geo.docOverflow.scrollWidth).toBeLessThanOrEqual(geo.docOverflow.clientWidth + 1);
        expect(geo.dialogOverflow!.scrollWidth).toBeLessThanOrEqual(
            geo.dialogOverflow!.clientWidth + 1,
        );

        // 换到第 12 张：选中缩略图必须被滚进可视区（不然横滚条是死的）
        for (let i = 0; i < 11; i += 1) await page.keyboard.press("ArrowRight");
        await expect.poll(async () => counter(page), { timeout: 5_000 }).toBe("12/12");
        const after = await geometry(page);
        expect(after.selectedThumb!.x, "选中缩略图左边界在条带内").toBeGreaterThanOrEqual(
            after.thumbs!.x - 1,
        );
        expect(after.selectedThumb!.right, "选中缩略图右边界在条带内").toBeLessThanOrEqual(
            after.thumbs!.right + 1,
        );
        expect(after.thumbsScroll!.scrollLeft, "条带自己滚了").toBeGreaterThan(0);

        console.log(
            `[390/${theme}] sheet 390×844 · 图 ${Math.round(geo.image!.width)}×${Math.round(geo.image!.height)} · 条带 ${geo.thumbsScroll!.scrollWidth}>${geo.thumbsScroll!.clientWidth} · scrollLeft=${Math.round(after.thumbsScroll!.scrollLeft)}`,
        );
    });
}

/* ───────────────────── 6. 触摸左右滑动切图 ───────────────────── */

test("390 · 真触摸序列左滑切图（CDP Input.dispatchTouchEvent）", async ({ page, context }) => {
    await openDetail(page, "light", 390, 844);
    await openLightbox(page, 0);

    const client = await context.newCDPSession(page);
    const startY = 400;
    const from = 320;
    const to = 60;

    const touch = async (type: "touchStart" | "touchMove" | "touchEnd", x: number) => {
        await client.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: type === "touchEnd" ? [] : [{ x, y: startY, id: 1 }],
        });
    };

    await touch("touchStart", from);
    for (let step = 1; step <= 6; step += 1) {
        await touch("touchMove", from + ((to - from) * step) / 6);
        await page.waitForTimeout(16);
    }
    await touch("touchEnd", to);

    await expect
        .poll(async () => counter(page), { timeout: 8_000 })
        .toBe("2/12");
    console.log("[touch] 左滑 260px → 2/12（同一套 pointer/gesture，无第二套灯箱代码）");
});

/* ───────────────────── 7. reduced-motion：0 个运行中动画 ───────────────────── */

async function openReduced(
    context: BrowserContext,
    viewport: { width: number; height: number },
): Promise<Page> {
    const page = await context.newPage();
    await openDetail(page, "light", viewport.width, viewport.height);
    await openLightbox(page, 0);
    return page;
}

test("reduced-motion：1440 / 390 打开与切图后灯箱内 0 个运行中动画", async ({ browser }) => {
    for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
    ]) {
        const context = await browser.newContext({ reducedMotion: "reduce", viewport });
        const page = await openReduced(context, viewport);

        const running = async () =>
            page.evaluate(() => {
                const dialog = document.querySelector("dialog.fancybox__dialog");
                if (!dialog) return { total: -1, running: ["<no dialog>"] };
                const animations = dialog.getAnimations({ subtree: true });
                return {
                    total: animations.length,
                    running: animations
                        .filter((a) => a.playState !== "finished" && a.playState !== "idle")
                        .map((a) => {
                            const target = (a as unknown as { effect?: { target?: Element } }).effect
                                ?.target;
                            return `${a.playState}:${target?.className ?? target?.tagName ?? "?"}`;
                        }),
                };
            });

        const atOpen = await running();
        expect(atOpen.running, `${viewport.width} 打开后灯箱内 0 动画`).toEqual([]);

        await page.keyboard.press("ArrowRight");
        await expect.poll(async () => counter(page), { timeout: 5_000 }).toBe("2/12");
        const afterSwitch = await running();
        expect(afterSwitch.running, `${viewport.width} 切图后灯箱内 0 动画`).toEqual([]);

        // 功能不能因为关动画而丢
        await page.keyboard.press("Escape");
        await expect(page.locator(DIALOG)).toHaveCount(0, { timeout: 10_000 });
        await context.close();
        console.log(
            `[reduced-motion ${viewport.width}] 打开 ${atOpen.total} 个动画对象 / 运行 0 · 切图后运行 0`,
        );
    }
});

/* ───────────────────── 8. axe（灯箱打开态，双主题） ───────────────────── */

type AxeViolation = { id: string; impact: string | null; help: string; nodes: { target: unknown[] }[] };

async function runAxe(page: Page, selector: string) {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(async (scope) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const axe = (window as any).axe;
        const result = await axe.run(document.querySelector(scope) ?? document, {
            runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
            resultTypes: ["violations"],
        });
        return (result.violations as AxeViolation[]).map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            target: v.nodes[0]?.target ?? [],
        }));
    }, selector);
}

for (const theme of ["light", "dark"] as const) {
    test(`axe ${theme} · 灯箱打开态 serious/critical = 0`, async ({ page }) => {
        await openDetail(page, theme, 1440, 900);
        await openLightbox(page, 0);
        const violations = await runAxe(page, DIALOG);
        const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(
            serious.map((v) => `${v.id} (${v.impact}) ${JSON.stringify(v.target)}`),
            `${theme}: serious/critical`,
        ).toEqual([]);
        console.log(
            `[axe] lightbox ${theme}: violations=${violations.length}${
                violations.length ? ` → ${violations.map((v) => v.id).join(",")}` : ""
            }`,
        );
    });
}

/* ───────────────────── 9. 证据截图 ───────────────────── */

test("证据截图：1440/390 × light/dark 打开态 + 缩略条特写", async ({ page }) => {
    mkdirSync(SCREENS, { recursive: true });
    for (const shot of [
        { theme: "light" as Theme, width: 1440, height: 900 },
        { theme: "dark" as Theme, width: 1440, height: 900 },
        { theme: "light" as Theme, width: 390, height: 844 },
        { theme: "dark" as Theme, width: 390, height: 844 },
    ]) {
        await openDetail(page, shot.theme, shot.width, shot.height);
        await openLightbox(page, 2);
        await page.screenshot({
            path: path.join(SCREENS, `lightbox-${shot.theme}-${shot.width}.png`),
        });
        // 缩略条特写：证明「底部横条 + 选中态」长这样
        await page.locator(".fancybox__thumbs").screenshot({
            path: path.join(SCREENS, `thumbs-${shot.theme}-${shot.width}.png`),
        });
    }
    console.log(`[evidence] 8 张截图 → ${SCREENS}`);
});
