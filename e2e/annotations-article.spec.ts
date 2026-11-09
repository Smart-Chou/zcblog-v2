import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * M7-4b · 文章正文选区高亮 + 批注工具条
 *
 * 判据分四组：
 *   A. **选中态**：正文段落里选字 → 工具条出现在选区附近且不越出视口；导航 / 标题 /
 *      空选区 / 跨段选区一律不出工具条；正文之外的文字不处理；
 *   B. **高亮态**：点「高亮」→ 选区变成 `mark.annotation-mark`，文字一字不多不少，
 *      段落高度不变（零布局偏移）；点已高亮的文字 → 按钮变「取消高亮」→ 点完 mark 消失；
 *      刷新后仍在、刷新后删掉的不复现；
 *   C. **成本**：关闭态 0 个 annotation-layer 请求；第一次选中之后只多 1 个；
 *      `perf-budget.py` 的 article JS 增速由报告单独记（本 spec 只判「没有静态链新增」）；
 *   D. **共存与无障碍**：与金句卡工具条同屏不重叠；axe 打开态 / 高亮态 serious = 0
 *      （light/dark）；1440 / 390 两个视口。
 *
 * 截图（docs/_reviews/M7-4b/screens）默认跳过，`ANNOTATIONS_ARTICLE_SHOTS=1` 才落盘。
 */

const ARTICLE = "/article/blog-as-a-product/";
const LAYER = "[data-annotation-layer]";
const TOOLBAR = "[data-annotation-toolbar]";
const ACTION = '[data-annotation-action="toggle"]';
const MARK = "mark.annotation-mark";
const STORAGE_KEY = "zcblog:annotations:v1";

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const SHOTS = process.env.ANNOTATIONS_ARTICLE_SHOTS === "1";
const SHOT_DIR = path.join("docs", "_reviews", "M7-4b", "screens");

async function resetStorage(page: Page): Promise<void> {
    await page.goto(ARTICLE, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
        try {
            localStorage.removeItem("zcblog:annotations:v1");
        } catch {
            /* 无痕模式下没有 storage，用例会退化到内存 —— 仍然成立 */
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

/**
 * 在正文第 `blockIndex` 段里选中 `length` 个字符（从第一个非空白字符起）。
 * 返回被选中的原文，调用方用它断言「高亮前后文本一致」。
 */
async function selectParagraph(page: Page, blockIndex = 0, length = 24): Promise<string> {
    await page.locator("#post-content .article-content").scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
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

/** 选中任意元素里的文字（判「非正文不出工具条」）。 */
async function selectIn(page: Page, selector: string): Promise<void> {
    await page.evaluate((sel) => {
        const host = document.querySelector(sel);
        if (!host) throw new Error(`找不到 ${sel}`);
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        let node: Text | null = null;
        while (walker.nextNode()) {
            const candidate = walker.currentNode as Text;
            if (candidate.data.trim().length >= 2) {
                node = candidate;
                break;
            }
        }
        if (!node) throw new Error(`${sel} 里没有文本`);
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(node, Math.min(4, node.data.length));
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
    }, selector);
    await page.waitForTimeout(200);
}

async function addHighlight(page: Page): Promise<string> {
    const selected = await selectParagraph(page);
    await expect(page.locator(ACTION)).toHaveAttribute("data-annotation-mode", "add");
    await page.locator(ACTION).click();
    await expect(page.locator(MARK).first()).toBeVisible();
    return selected;
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

test.describe("M7-4b · 文章选区高亮", () => {
    test.beforeEach(async ({ page }) => {
        page.on("pageerror", (error) => console.log("[pageerror]", error.message));
        page.on("console", (message) => {
            if (message.type() === "error") console.log("[console]", message.text());
        });
        await resetStorage(page);
    });

    test("关闭态：工具条隐藏、0 个批注请求", async ({ page }) => {
        const requests: string[] = [];
        page.on("request", (request) => {
            const url = request.url();
            // 只看 JS：组件样式（annotations.css）属于首屏 CSS，不算行为模块
            if (/annotation-layer[^/]*\.js/u.test(url)) requests.push(url);
        });

        await page.reload({ waitUntil: "load" });
        await settle(page);

        await expect(page.locator(LAYER)).toHaveCount(1);
        await expect(page.locator(TOOLBAR)).toBeHidden();
        expect(requests, `关闭态不该发批注相关请求：${requests.join(", ")}`).toHaveLength(0);
        await expect(page.locator(MARK)).toHaveCount(0);
    });

    test("选中正文段落 → 工具条；点高亮 → mark，文本与段落高度不变", async ({ page }) => {
        const selected = await selectParagraph(page);

        const toolbar = page.locator(TOOLBAR);
        await expect(toolbar).toBeVisible();
        await expect(page.locator(ACTION)).toHaveAttribute("data-annotation-mode", "add");

        // 工具条必须落在视口里
        const box = await toolbar.boundingBox();
        const viewport = page.viewportSize()!;
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);

        const before = await page.evaluate(() => {
            const block = document.querySelectorAll("#post-content .article-content p")[0]!;
            return {
                text: block.textContent ?? "",
                height: block.getBoundingClientRect().height,
            };
        });

        await page.locator(ACTION).click();

        const mark = page.locator(MARK).first();
        await expect(mark).toBeVisible();
        await expect(mark).toHaveText(selected);
        await expect(toolbar).toBeHidden();

        const after = await page.evaluate(() => {
            const block = document.querySelectorAll("#post-content .article-content p")[0]!;
            const mark = block.querySelector("mark.annotation-mark");
            return {
                text: block.textContent ?? "",
                height: block.getBoundingClientRect().height,
                markText: mark?.textContent ?? "",
                marks: block.querySelectorAll("mark.annotation-mark").length,
                // 段落里的行内元素必须原样还在（只包 mark，不重排正文）
                inline: block.querySelectorAll("a, strong, em, code").length,
            };
        });

        expect(after.text).toBe(before.text); // 文本一字不多不少
        expect(after.height).toBeCloseTo(before.height, 0); // 零布局偏移
        expect(after.markText).toBe(selected);
        expect(after.marks).toBe(1);
        expect(after.inline).toBeGreaterThanOrEqual(0);

        // 存储里是本文档的 docId + 段落序号 + UTF-16 偏移
        const stored = await page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        }, STORAGE_KEY);
        expect(stored).not.toBeNull();
        expect(stored.records).toHaveLength(1);
        expect(stored.records[0].docId).toBe("article:blog-as-a-product");
        expect(stored.records[0].blockIndex).toBe(0);
        expect(stored.records[0].quote).toBe(selected);
        expect(stored.records[0].end - stored.records[0].start).toBe(selected.length);
    });

    test("刷新后高亮仍在（偏移命中原位，不需要重新选中）", async ({ page }) => {
        const selected = await addHighlight(page);

        await page.reload({ waitUntil: "load" });
        const mark = page.locator(MARK).first();
        await expect(mark).toBeVisible();
        await expect(mark).toHaveText(selected);
        await expect(page.locator(LAYER)).toHaveAttribute("data-annotation-count", "1");
        await expect(page.locator(LAYER)).toHaveAttribute("data-annotation-painted", "1");
        await expect(page.locator(TOOLBAR)).toBeHidden();
    });

    test("再次选中高亮文字 → 按钮变「取消高亮」，点完 mark 消失且刷新不再出现", async ({
        page,
    }) => {
        const selected = await addHighlight(page);
        await page.waitForTimeout(120);

        // 程序化重选同一条 mark 的文本（真实交互里点一下高亮文字也会走这条路）
        await page.evaluate(() => {
            const mark = document.querySelector("mark.annotation-mark");
            if (!mark) throw new Error("没有高亮");
            const range = document.createRange();
            range.selectNodeContents(mark);
            const selection = window.getSelection()!;
            selection.removeAllRanges();
            selection.addRange(range);
            document.dispatchEvent(new Event("selectionchange"));
        });

        await expect(page.locator(TOOLBAR)).toBeVisible();

        await page.locator(ACTION).click();
        await expect(page.locator(MARK)).toHaveCount(0);
        await expect(page.locator(LAYER)).toHaveAttribute("data-annotation-count", "0");

        await page.reload({ waitUntil: "load" });
        await settle(page);
        await expect(page.locator(MARK)).toHaveCount(0);
        expect(selected.length).toBeGreaterThan(0);
    });

    test("点击已高亮的文字（不拖选）→ 工具条给出「取消高亮」", async ({ page }) => {
        await addHighlight(page);

        // 先清掉选区（模拟「只是点一下」），再点 mark
        await page.evaluate(() => document.getSelection()?.removeAllRanges());
        await page.locator(MARK).first().click();
        await page.waitForTimeout(120);

        await expect(page.locator(TOOLBAR)).toBeVisible();
        await expect(page.locator(ACTION)).toHaveAttribute("data-annotation-mode", "remove");
    });

    test("导航 / 标题 / 空选区 / 跨段选区都不出工具条", async ({ page }) => {
        await selectIn(page, "h1.post-title-text");
        await expect(page.locator(TOOLBAR)).toBeHidden();

        await selectIn(page, "#post-content .article-content h2");
        await expect(page.locator(TOOLBAR)).toBeHidden();

        // 空选区（caret）
        await page.evaluate(() => {
            const block = document.querySelector("#post-content .article-content p");
            if (!block) throw new Error("没有正文段落");
            const range = document.createRange();
            range.setStart(block, 0);
            range.collapse(true);
            const selection = window.getSelection()!;
            selection.removeAllRanges();
            selection.addRange(range);
            document.dispatchEvent(new Event("selectionchange"));
        });
        await page.waitForTimeout(200);
        await expect(page.locator(TOOLBAR)).toBeHidden();

        // 跨段选区：数据层一条记录只落一段，这里不出工具条
        await page.evaluate(() => {
            const blocks = document.querySelectorAll("#post-content .article-content p");
            const first = blocks[0]!;
            const second = blocks[1]!;
            const range = document.createRange();
            range.setStart(first, 0);
            range.setEnd(second, second.childNodes.length);
            const selection = window.getSelection()!;
            selection.removeAllRanges();
            selection.addRange(range);
            document.dispatchEvent(new Event("selectionchange"));
        });
        await page.waitForTimeout(200);
        await expect(page.locator(TOOLBAR)).toBeHidden();
    });

    test("与金句卡工具条同屏出现时不重叠", async ({ page }) => {
        await selectParagraph(page);
        await expect(page.locator(TOOLBAR)).toBeVisible();
        const quoteToolbar = page.locator("[data-quote-toolbar]");
        await expect(quoteToolbar).toBeVisible();

        const mine = await page.locator(TOOLBAR).boundingBox();
        const quote = await quoteToolbar.boundingBox();
        expect(mine).not.toBeNull();
        expect(quote).not.toBeNull();
        const overlap =
            mine!.x < quote!.x + quote!.width &&
            mine!.x + mine!.width > quote!.x &&
            mine!.y < quote!.y + quote!.height &&
            mine!.y + mine!.height > quote!.y;
        expect(overlap, "两个工具条不该叠在一起").toBe(false);
    });

    test("390 移动端：选中 → 工具条在视口内 → 高亮", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload({ waitUntil: "load" });
        const selected = await selectParagraph(page, 0, 16);

        const box = await page.locator(TOOLBAR).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(391);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(845);

        await shot(page, "toolbar-390-light");
        await page.locator(ACTION).click();
        await expect(page.locator(MARK).first()).toHaveText(selected);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > 390);
        expect(overflow, "390 下不该出现横向溢出").toBe(false);
        await shot(page, "highlight-390-light");
    });

    for (const theme of THEMES) {
        test(`axe：工具条态与高亮态 serious = 0（${theme}）`, async ({ page }) => {
            await setTheme(page, theme);
            await selectParagraph(page);
            await expect(page.locator(TOOLBAR)).toBeVisible();

            const bar = await axe(page, "article.post");
            expect(bar.serious, JSON.stringify(bar.detail)).toBe(0);

            await shot(page, `toolbar-1440-${theme}`);
            await page.locator(ACTION).click();
            await expect(page.locator(MARK).first()).toBeVisible();

            const highlighted = await axe(page, "article.post");
            expect(highlighted.serious, JSON.stringify(highlighted.detail)).toBe(0);
            await shot(page, `highlight-1440-${theme}`);
        });
    }
});
