import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * M8-5c · 友链申请弹层（步骤 / 复制 / issue 模板）
 *
 * 判据：
 *  1. 打开：点「通过 GitHub 申请」→ 原生 dialog 打开（`[hidden]` 摘掉 + `data-overlay`），
 *     焦点移入关闭按钮；1440 居中、390 贴底 sheet。
 *  2. 关闭三条路：关闭按钮 / Esc / 点 backdrop；三条都必须把焦点还给触发链接。
 *  3. 复制两条路（stub navigator.clipboard）：成功有可见「已复制」；失败有可见失败文案
 *     且源文本被选中（不静默）。「复制全部」得到 4 行。
 *  4. 0 横向溢出（弹层打开态，1440 / 390）。
 *  5. axe：弹层自身 serious/critical = 0（light + dark × 1440 / 390）。
 *  6. 前端不持 token、不调 API：CTA 只指向 .github/ISSUE_TEMPLATE/friend-link.yml，
 *     整个交互 0 外部请求。
 *
 * 运行：npx playwright test -c playwright.m8-5c.config.ts
 */

const ROOT = process.cwd();
const AXE_SOURCE = readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
const SHOTS = path.resolve(ROOT, "docs/_reviews/M8-5c/screens");
const TEMPLATE_URL = "https://github.com/Smart-Chou/zcblog/issues/new?template=friend-link.yml";

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const TRIGGER = ".friends-gh";
const DIALOG = "#friend-apply";

async function openPage(page: Page, theme: Theme, width: number): Promise<void> {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto("/friends/", { waitUntil: "load" });
    expect(response?.status(), "GET /friends/").toBe(200);
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
}

async function shot(page: Page, name: string): Promise<void> {
    if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
    const file = path.join(SHOTS, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(`[shot] ${name} → ${file}`);
}

/** 弹层矩形 + 顶层面板内边距（用于判断居中 / 贴底） */
async function geometry(page: Page) {
    return page.evaluate((sel) => {
        const el = document.querySelector<HTMLDialogElement>(sel);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
            open: el.open,
            hidden: el.hasAttribute("hidden"),
            display: style.display,
            overlay: el.getAttribute("data-overlay"),
            role: el.getAttribute("role"),
            modal: el.getAttribute("aria-modal"),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
            radiusTop: style.borderTopLeftRadius,
            radiusBottom: style.borderBottomLeftRadius,
            viewportW: document.documentElement.clientWidth,
            /** body 宽 = 去掉 scrollbar-gutter 后的可用宽度（base.css 桌面端 stable 常驻 15px） */
            usableW: document.body.clientWidth,
            viewportH: window.innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
        };
    }, DIALOG);
}

test.describe("open / close / focus", () => {
    for (const theme of THEMES) {
        test(`1440 ${theme}：居中 + 焦点移入 + Esc 回填`, async ({ page }) => {
            await openPage(page, theme, 1440);
            await expect(page.locator(DIALOG)).toBeHidden();

            await page.locator(TRIGGER).click();
            await expect(page.locator(DIALOG)).toBeVisible();

            const g = await geometry(page);
            expect(g).not.toBeNull();
            console.log(
                `[geometry-raw] innerWidth=${await page.evaluate(() => window.innerWidth)} ` +
                    `clientWidth=${g!.clientWidth} left=${g!.left} right=${g!.right} width=${g!.width} top=${g!.top} bottom=${g!.bottom}`,
            );
            expect(g!.open, "原生 dialog.open").toBe(true);
            expect(g!.hidden, "[hidden] 已摘掉").toBe(false);
            expect(g!.overlay, "data-overlay 标记（项目 overlay 约定）").toBe("friend-apply");
            expect(g!.modal).toBe("true");
            expect(g!.width, "桌面固定 34rem=544").toBe(544);
            // 左右留白差 ≤ 2px = 居中（参照 body 宽：桌面端 scrollbar-gutter 常驻 15px）
            expect(Math.abs(g!.left - (g!.usableW - g!.right))).toBeLessThanOrEqual(2);
            expect(Math.abs(g!.top - (g!.viewportH - g!.bottom))).toBeLessThanOrEqual(2);
            console.log(
                `[geometry] 1440/${theme} ${g!.width}px left=${g!.left} top=${g!.top} usable=${g!.usableW}`,
            );

            await expect(page.locator(`${DIALOG} [data-fa-close]`)).toBeFocused();
            await shot(page, `apply-${theme}-1440`);

            await page.keyboard.press("Escape");
            await expect(page.locator(DIALOG)).toBeHidden();
            const after = await geometry(page);
            expect(after!.overlay, "关闭后标记摘除").toBeNull();
            expect(after!.display, "[hidden] 显式 display:none").toBe("none");
            await expect(page.locator(TRIGGER)).toBeFocused();
        });
    }

    test("390：贴底 sheet + 关闭按钮 + backdrop 关闭都回填焦点", async ({ page }) => {
        await openPage(page, "light", 390);
        await page.locator(TRIGGER).click();
        await expect(page.locator(DIALOG)).toBeVisible();

        const g = await geometry(page);
        expect(g!.width, "390 下满宽（= 可用宽度）").toBe(g!.usableW);
        expect(g!.left).toBe(0);
        expect(Math.abs(g!.bottom - g!.viewportH), "底边贴齐视口").toBeLessThanOrEqual(1);
        expect(g!.radiusTop, "顶部圆角").not.toBe("0px");
        expect(g!.scrollWidth, "弹层打开时 0 横向溢出").toBeLessThanOrEqual(g!.clientWidth + 1);
        console.log(`[geometry] 390 ${g!.width}×${g!.bottom - g!.top} bottom=${g!.bottom}/${g!.viewportH}`);
        await shot(page, "apply-light-390");

        await page.locator(`${DIALOG} [data-fa-close]`).click();
        await expect(page.locator(DIALOG)).toBeHidden();
        await expect(page.locator(TRIGGER)).toBeFocused();

        // backdrop：点 dialog 本体（内容层是 .fa__inner，左上角必落在 backdrop 区）
        await page.locator(TRIGGER).click();
        await expect(page.locator(DIALOG)).toBeVisible();
        await page.mouse.click(20, 20);
        await expect(page.locator(DIALOG)).toBeHidden();
        await expect(page.locator(TRIGGER)).toBeFocused();
    });
});

test.describe("copy paths（stub navigator.clipboard）", () => {
    async function stubClipboard(page: Page, mode: "ok" | "reject") {
        await page.evaluate((kind) => {
            const sink: string[] = [];
            (window as unknown as { __copied: string[] }).__copied = sink;
            Object.defineProperty(navigator, "clipboard", {
                configurable: true,
                value: {
                    writeText: (text: string) => {
                        if (kind === "reject") return Promise.reject(new Error("blocked"));
                        sink.push(text);
                        return Promise.resolve();
                    },
                },
            });
        }, mode);
    }

    test("成功：单字段 + 复制全部都有可见文案", async ({ page }) => {
        await openPage(page, "light", 390);
        await page.locator(TRIGGER).click();
        await stubClipboard(page, "ok");

        const status = page.locator("[data-fa-status]");
        await page.locator("[data-fa-copy]").first().click();
        await expect(status).toHaveText("已复制");
        await expect(status).toHaveAttribute("data-tone", "ok");
        await expect(status).toBeVisible();
        await shot(page, "copy-ok-390");

        const first = await page.evaluate(() => {
            const text = document.querySelector<HTMLElement>("[data-fa-value]")?.textContent?.trim() ?? "";
            return { text, copied: (window as unknown as { __copied: string[] }).__copied.slice() };
        });
        expect(first.copied[0], "写入剪贴板的就是该字段文本").toBe(first.text);

        await page.locator("[data-fa-copy-all]").click();
        await expect(status).toHaveText("已复制全部站点信息");
        const all = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied.at(-1) ?? "");
        expect(all.split("\n").length, "复制全部 = 4 行").toBe(4);
        expect(all.split("\n")[0]).toContain("：");
    });

    test("失败：可见文案 + 文本已选中（不静默）", async ({ page }) => {
        await openPage(page, "light", 390);
        await page.locator(TRIGGER).click();
        await stubClipboard(page, "reject");

        const status = page.locator("[data-fa-status]");
        await page.locator("[data-fa-copy]").first().click();
        await expect(status).toHaveAttribute("data-tone", "error");
        await expect(status).toContainText("复制失败");
        await expect(status).toBeVisible();
        // 失败文案是可见的（不是只给读屏）：对比度 / 尺寸都为正值
        const box = await status.boundingBox();
        expect(box!.height).toBeGreaterThan(8);
        await shot(page, "copy-fail-390");

        const sel = await page.evaluate(() => {
            const selected = window.getSelection()?.toString() ?? "";
            const text = document.querySelector<HTMLElement>("[data-fa-value]")?.textContent?.trim() ?? "";
            return { selected, text };
        });
        expect(sel.selected.trim(), "失败时源文本已选中").toBe(sel.text);
    });
});

/* ───────────────── axe ───────────────── */

type AxeViolation = { id: string; impact: string | null; nodes: unknown[] };

async function runAxe(page: Page, selector?: string) {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(async (sel) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const axe = (window as any).axe;
        const scope = sel ? document.querySelector(sel) : document;
        const result = (await axe.run(scope ?? document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
            resultTypes: ["violations", "incomplete"],
        })) as { violations: AxeViolation[]; incomplete: AxeViolation[] };
        const map = (list: AxeViolation[]) =>
            list.map((v) => ({
                id: v.id,
                impact: v.impact,
                nodes: v.nodes.length,
                targets: (v.nodes as { target?: unknown[] }[]).map((n) => String((n.target ?? []).join(" "))),
            }));
        return { violations: map(result.violations), incomplete: map(result.incomplete) };
    }, selector);
}

test.describe("axe（弹层打开态）", () => {
    for (const theme of THEMES) {
        for (const width of [1440, 390] as const) {
            test(`axe ${theme}@${width}`, async ({ page }) => {
                test.setTimeout(150_000);
                await openPage(page, theme, width);
                await page.locator(TRIGGER).click();
                await expect(page.locator(DIALOG)).toBeVisible();

                const scoped = await runAxe(page, DIALOG);
                const serious = scoped.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
                console.log(
                    `[axe] dialog ${theme}@${width}: serious=${serious.length} 全部=${scoped.violations.length} incomplete=${scoped.incomplete.length}`,
                );
                if (scoped.violations.length) console.log(`[axe] ${theme}@${width} ${JSON.stringify(scoped.violations)}`);
                expect(serious.map((v) => `${v.id}(${v.nodes})`), `弹层 ${theme}@${width}: serious/critical`).toEqual([]);

                const full = await runAxe(page);
                const fullSerious = full.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
                console.log(
                    `[axe] page ${theme}@${width}: serious=${fullSerious.length} ${JSON.stringify(
                        fullSerious.map((v) => ({ id: v.id, targets: v.targets.slice(0, 3) })),
                    )}`,
                );
            });
        }
    }
});

/* ───────────────── 溢出矩阵 + EN 页 ───────────────── */

test("0 横向溢出：375 / 768 / 1440 × 关 / 开", async ({ page }) => {
    for (const theme of THEMES) {
        for (const width of [375, 768, 1440] as const) {
            for (const state of ["closed", "open"] as const) {
                await openPage(page, theme, width);
                if (state === "open") await page.locator(TRIGGER).click();
                const result = await page.evaluate(() => {
                    const doc = document.documentElement;
                    const limit = doc.clientWidth;
                    const offenders = [...document.querySelectorAll("body *")]
                        .filter((el) => {
                            const rect = el.getBoundingClientRect();
                            return rect.width > 0 && rect.right > limit + 1;
                        })
                        .slice(0, 5)
                        .map((el) => `${el.tagName.toLowerCase()} right=${Math.round(el.getBoundingClientRect().right)}`);
                    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders };
                });
                expect(
                    result.scrollWidth,
                    `${width}/${theme}/${state}: ${result.scrollWidth} > ${result.clientWidth}`,
                ).toBeLessThanOrEqual(result.clientWidth + 1);
                expect(result.offenders, `${width}/${theme}/${state}: 越界元素`).toEqual([]);
            }
        }
    }
});

test("EN 页：同一套弹层 + 英文文案", async ({ page }) => {
    await page.goto("/en/friends/", { waitUntil: "load" });
    await page.locator(TRIGGER).click();
    await expect(page.locator(`${DIALOG} .fa__title`)).toHaveText("Apply for a friend link");
    await expect(page.locator(`${DIALOG} [data-fa-close]`)).toHaveAttribute("aria-label", "Close this sheet");
    await expect(page.locator(`${DIALOG} .fa__cta`)).toHaveAttribute("href", TEMPLATE_URL);
    await page.keyboard.press("Escape");
    await expect(page.locator(DIALOG)).toBeHidden();
});

/* ───────────────── 网络 / 模板链接契约 ───────────────── */

test("0 请求 + 只指向模板文件", async ({ page }) => {
    // 页面自带的第三方埋点（umami / GTM）与本卡无关：基线里就有，这里只关心
    // 「打开弹层 / 复制 / 点 CTA 有没有额外请求」，尤其不能碰 GitHub。
    const ANALYTICS = /(umami\.|googletagmanager\.com|google-analytics\.com)/;
    const outbound: string[] = [];
    page.on("request", (req) => {
        const url = req.url();
        if (!url.startsWith("http://127.0.0.1") && !ANALYTICS.test(url)) outbound.push(url);
    });

    await openPage(page, "light", 1440);
    await page.locator(TRIGGER).click();
    await expect(page.locator(DIALOG)).toBeVisible();

    const link = page.locator(`${DIALOG} .fa__cta`);
    await expect(link).toHaveAttribute("href", TEMPLATE_URL);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    // 触发入口本身仍是直链（无 JS 时功能不降级）
    await expect(page.locator(TRIGGER)).toHaveAttribute("href", TEMPLATE_URL);
    await expect(page.locator(TRIGGER)).toHaveAttribute("aria-haspopup", "dialog");

    // 弹层里 0 表单提交、0 token：DOM 上不存在 token 形态的字符串
    const html = await page.locator(DIALOG).evaluate((el) => el.outerHTML);
    expect(html).not.toMatch(/(token|secret|bearer|authorization)/i);
    expect(html).not.toContain("api.github.com");

    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(outbound, "打开弹层 + 交互不应产生任何外部请求").toEqual([]);
    expect(page.url(), "没被导航走").toContain("/friends/");
});
