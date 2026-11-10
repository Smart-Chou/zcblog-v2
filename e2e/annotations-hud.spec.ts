import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * M7-4c · 批注 HUD（列表 / 跳转 / 删除）
 *
 * 判据分五组：
 *   A. **关闭态**：无批注 → 入口按钮不渲染、0 个 annotation-hud JS 请求；
 *   B. **列表**：有批注时入口带条数 → 打开列出「文本摘要 + 时间」，条目顺序按段落；
 *      点条目 → 面板关闭、滚到对应高亮并短暂强调；
 *   C. **删除**：删一条 → 列表与高亮同步消失、刷新不复现；全部删完 → 空态 +
 *      入口消失 + 刷新后仍是 0 请求；
 *   D. **桌面 1440**：右侧浮层不与正文主栏水平重叠；Esc / 关闭键都能关，焦点回填入口；
 *   E. **移动 390**：抽屉贴底、遮罩可见、滚动锁在关闭后恢复且回到原滚动位置、
 *      点遮罩关闭、焦点回填、无横向溢出；axe serious = 0（light/dark）。
 *
 * 截图（docs/_reviews/M7-4c/screens）默认跳过，`ANNOTATIONS_HUD_SHOTS=1` 才落盘。
 */

const ARTICLE = "/article/blog-as-a-product/";
const HUD = "[data-annotation-hud]";
const TRIGGER = "[data-annotation-hud-trigger]";
const BADGE = "[data-annotation-hud-count]";
const PANEL = "[data-annotation-hud-panel]";
const LIST = "[data-annotation-hud-list]";
const ITEM = "[data-annotation-hud-item]";
const JUMP = "[data-annotation-hud-jump]";
const DELETE = "[data-annotation-hud-delete]";
const EMPTY = "[data-annotation-hud-empty]";
const SCRIM = ".annotation-hud__scrim";
const LAYER = "[data-annotation-layer]";
const TOOLBAR = "[data-annotation-toolbar]";
const ACTION = '[data-annotation-action="toggle"]';
const MARK = "mark.annotation-mark";
const CONTENT = "#post-content .article-content";

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const SHOTS = process.env.ANNOTATIONS_HUD_SHOTS === "1";
const SHOT_DIR = path.join("docs", "_reviews", "M7-4c", "screens");

async function resetStorage(page: Page): Promise<void> {
    await page.goto(ARTICLE, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
        try {
            localStorage.removeItem("zcblog:annotations:v1");
        } catch {
            /* 无痕模式没有 storage：用例退化到内存，仍然成立 */
        }
    });
    await page.reload({ waitUntil: "load" });
}

async function setTheme(page: Page, theme: Theme): Promise<void> {
    await page.evaluate(
        (value) => document.documentElement.setAttribute("data-theme", value),
        theme,
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function settle(page: Page): Promise<void> {
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
    });
}

/** 在正文第 `blockIndex` 段里选中 `length` 个字符（从第一个非空白字符起）。 */
async function selectParagraph(page: Page, blockIndex = 0, length = 20): Promise<string> {
    await page.locator(CONTENT).scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const text = await page.evaluate(
        ([index, want]) => {
            const host = document.querySelector("#post-content .article-content");
            if (!host) throw new Error("找不到正文容器");
            const block = host.querySelectorAll("p")[index as number];
            if (!block) throw new Error(`第 ${index} 段不存在`);
            block.scrollIntoView({ block: "center" });
            const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
            let node: Text | null = null;
            while (walker.nextNode()) {
                const candidate = walker.currentNode as Text;
                if (candidate.data.trim().length >= 20) {
                    node = candidate;
                    break;
                }
            }
            if (!node) throw new Error("段落里找不到够长的文本节点");
            const start = node.data.search(/\S/u);
            const end = Math.min(start + (want as number), node.data.length);
            const range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, end);
            const selection = window.getSelection()!;
            selection.removeAllRanges();
            selection.addRange(range);
            document.dispatchEvent(new Event("selectionchange"));
            return node.data.slice(start, end);
        },
        [blockIndex, length] as const,
    );
    await expect(page.locator(TOOLBAR)).toBeVisible();
    return text;
}

async function addHighlight(page: Page, blockIndex = 0, length = 20): Promise<string> {
    const selected = await selectParagraph(page, blockIndex, length);
    await page.waitForTimeout(80);
    await page.locator(ACTION).click();
    await expect(page.locator(MARK).nth(blockIndex)).toBeVisible();
    return selected;
}

async function openPanel(page: Page): Promise<void> {
    await page.locator(TRIGGER).click();
    await expect(page.locator(PANEL)).toBeVisible();
}

async function axe(
    page: Page,
    context = "body",
): Promise<{ serious: number; total: number; detail: unknown[] }> {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(
        async ([tags, ctx]) => {
            const result = await (window as unknown as { axe: { run: Function } }).axe.run(ctx, {
                runOnly: { type: "tag", values: tags },
            });
            const serious = result.violations.filter(
                (v: { impact?: string }) => v.impact === "serious" || v.impact === "critical",
            );
            return {
                serious: serious.length,
                total: result.violations.length,
                detail: serious.map((v: { id: string; nodes: { target: string[] }[] }) => ({
                    id: v.id,
                    nodes: v.nodes.map((node) => node.target.join(" ")),
                })),
            };
        },
        [TAGS, context] as const,
    );
}

async function shot(page: Page, name: string): Promise<void> {
    if (!SHOTS) return;
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: false });
}

test.describe("M7-4c · 批注 HUD", () => {
    test.beforeEach(async ({ page }) => {
        page.on("pageerror", (error) => console.log("[pageerror]", error.message));
        page.on("console", (message) => {
            if (message.type() === "error") console.log("[console]", message.text());
        });
        await resetStorage(page);
    });

    test("关闭态：入口不渲染，0 个 HUD 请求", async ({ page }) => {
        const requests: string[] = [];
        page.on("request", (request) => {
            const url = request.url();
            if (/annotation-hud[^/]*\.js/u.test(url)) requests.push(url);
        });

        await page.reload({ waitUntil: "load" });
        await settle(page);

        await expect(page.locator(HUD)).toHaveCount(1);
        await expect(page.locator(TRIGGER)).toBeHidden();
        await expect(page.locator(PANEL)).toBeHidden();
        expect(requests, `关闭态不该发 HUD 请求：${requests.join(", ")}`).toHaveLength(0);
    });

    test("加两条 → 入口计数 2 → 列表带摘要与时间 → 点条目滚到高亮并强调", async ({ page }) => {
        const first = await addHighlight(page, 0, 18);
        const second = await addHighlight(page, 1, 18);

        await expect(page.locator(LAYER)).toHaveAttribute("data-annotation-count", "2");
        await expect(page.locator(TRIGGER)).toBeVisible();
        await expect(page.locator(BADGE)).toHaveText("2");
        await expect(page.locator(TRIGGER)).toHaveAttribute("aria-expanded", "false");

        await openPanel(page);
        await expect(page.locator(TRIGGER)).toHaveAttribute("aria-expanded", "true");
        await expect(page.locator(ITEM)).toHaveCount(2);

        const quotes = await page.locator(`${LIST} .annotation-hud__quote`).allTextContents();
        expect(quotes[0]).toBe(first);
        expect(quotes[1]).toBe(second);

        const time = page.locator(`${ITEM}`).first().locator("time");
        await expect(time).not.toHaveText("");
        await expect(time).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/u);

        // 跳回第一条：面板关闭、滚到它、短暂强调
        await page.locator(JUMP).first().click();
        await expect(page.locator(PANEL)).toBeHidden();
        await expect(page.locator(TRIGGER)).toHaveAttribute("aria-expanded", "false");

        const mark = page.locator(MARK).first();
        await expect(mark).toHaveClass(/is-annotation-focus/u);
        const box = await mark.boundingBox();
        const viewport = page.viewportSize()!;
        expect(box).not.toBeNull();
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
        await expect(mark).toHaveText(first);
        await shot(page, "jump-emphasis-1440-light");

        // 强调是「短暂」的：1.6s 之后自己退掉
        await expect(mark).not.toHaveClass(/is-annotation-focus/u, { timeout: 4000 });
    });

    test("删一条：列表与高亮同步消失、刷新不复现；删完显示空态", async ({ page }) => {
        await addHighlight(page, 0, 18);
        await addHighlight(page, 1, 18);
        await openPanel(page);
        await expect(page.locator(ITEM)).toHaveCount(2);

        await page.locator(DELETE).first().click();
        await expect(page.locator(ITEM)).toHaveCount(1);
        await expect(page.locator(MARK)).toHaveCount(1);
        await expect(page.locator(LAYER)).toHaveAttribute("data-annotation-count", "1");
        await expect(page.locator(BADGE)).toHaveText("1");
        await shot(page, "panel-after-delete-1440-light");

        const stored = await page.evaluate(() => {
            const raw = localStorage.getItem("zcblog:annotations:v1");
            return raw ? JSON.parse(raw) : null;
        });
        expect(stored.records).toHaveLength(1);
        expect(stored.records[0].blockIndex).toBe(1);

        await page.reload({ waitUntil: "load" });
        await settle(page);
        await expect(page.locator(MARK)).toHaveCount(1);
        await expect(page.locator(TRIGGER)).toBeVisible();
        await expect(page.locator(BADGE)).toHaveText("1");

        // 最后一条也删掉：空态、入口消失、正文无残留
        await openPanel(page);
        await page.locator(DELETE).first().click();
        await expect(page.locator(ITEM)).toHaveCount(0);
        await expect(page.locator(EMPTY)).toBeVisible();
        await expect(page.locator(MARK)).toHaveCount(0);
        await expect(page.locator(LAYER)).toHaveAttribute("data-annotation-count", "0");
        await expect(page.locator(TRIGGER)).toBeHidden();
        await shot(page, "empty-state-1440-light");

        await page.locator(PANEL).locator("[data-annotation-hud-close]").first().click();
        await expect(page.locator(PANEL)).toBeHidden();

        await page.reload({ waitUntil: "load" });
        await settle(page);
        await expect(page.locator(MARK)).toHaveCount(0);
        await expect(page.locator(TRIGGER)).toBeHidden();
    });

    test("1440 桌面：右侧浮层不压正文主栏；Esc / 关闭键关闭并回填焦点", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.reload({ waitUntil: "load" });
        await addHighlight(page, 0, 18);

        await openPanel(page);
        await shot(page, "panel-1440-light");

        const panel = await page.locator(PANEL).boundingBox();
        const content = await page.locator(CONTENT).boundingBox();
        expect(panel).not.toBeNull();
        expect(content).not.toBeNull();
        const overlapX =
            panel!.x < content!.x + content!.width && panel!.x + panel!.width > content!.x;
        expect(overlapX, "浮层不该压到正文主栏").toBe(false);

        await page.keyboard.press("Escape");
        await expect(page.locator(PANEL)).toBeHidden();
        await expect(page.locator(TRIGGER)).toBeFocused();

        // 关闭键（panel 内）
        await openPanel(page);
        await page.locator(PANEL).locator("[data-annotation-hud-close]").first().click();
        await expect(page.locator(PANEL)).toBeHidden();
        await expect(page.locator(TRIGGER)).toBeFocused();
    });

    test("390 抽屉：贴底 / 滚动锁与恢复 / 遮罩与 Esc 关闭 / 焦点回填 / 无横向溢出", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload({ waitUntil: "load" });
        await addHighlight(page, 0, 16);

        // 先滚到正文中部，验证关闭后回到原位置
        const scrolled = await page.evaluate(() => {
            window.scrollTo(0, Math.round(window.innerHeight * 1.2));
            return window.scrollY;
        });
        await page.waitForTimeout(120);

        await openPanel(page);
        const panel = await page.locator(PANEL).boundingBox();
        const box = await page.evaluate(() => ({
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
        }));
        expect(panel).not.toBeNull();
        expect(panel!.x).toBeLessThanOrEqual(1);
        // 抽屉满宽贴底；经典滚动条在视口里可能占 15px，这里允许这个量级
        expect(panel!.width).toBeGreaterThanOrEqual(box.width - 16);
        expect(Math.abs(panel!.y + panel!.height - box.height)).toBeLessThanOrEqual(16);

        await expect(page.locator(SCRIM)).toBeVisible();
        const locked = await page.evaluate(() => ({
            html: document.documentElement.style.overflow,
            body: document.body.style.position,
        }));
        expect(locked.html).toBe("hidden");
        expect(locked.body).toBe("fixed");
        await shot(page, "drawer-390-light");

        await page.keyboard.press("Escape");
        await expect(page.locator(PANEL)).toBeHidden();
        await expect(page.locator(TRIGGER)).toBeFocused();
        const unlocked = await page.evaluate(() => ({
            html: document.documentElement.style.overflow,
            body: document.body.style.position,
            y: window.scrollY,
        }));
        expect(unlocked.html).toBe("");
        expect(unlocked.body).toBe("");
        expect(Math.abs(unlocked.y - scrolled)).toBeLessThanOrEqual(2);

        // 点遮罩关闭
        await openPanel(page);
        await page.locator(SCRIM).click({ position: { x: 195, y: 60 } });
        await expect(page.locator(PANEL)).toBeHidden();
        await expect(page.locator(TRIGGER)).toBeFocused();

        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(overflow, "390 下不该出现横向溢出").toBe(false);
    });

    for (const theme of THEMES) {
        test(`axe：HUD 打开态 serious = 0（${theme}）`, async ({ page }) => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.reload({ waitUntil: "load" });
            await setTheme(page, theme);
            await addHighlight(page, 0, 18);
            await openPanel(page);
            await settle(page);

            const content = await axe(page, "article.post");
            expect(content.serious, `正文：${JSON.stringify(content.detail)}`).toBe(0);
            const hud = await axe(page, HUD);
            expect(hud.serious, `HUD：${JSON.stringify(hud.detail)}`).toBe(0);
            await shot(page, `panel-1440-${theme}`);
        });
    }
});
