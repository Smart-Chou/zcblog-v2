import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * M7-4a · 批注数据层 + 高亮渲染基础
 *
 * 本卡不接文章正文选中，所以判据全部落在两处：
 *   A. **数据层**（`src/scripts/annotations.ts`，纯逻辑、不依赖 DOM）—— 通过演示页
 *      挂出来的 `window.__annotations` 直接调：偏移/重定位、空白与越界拒绝、重叠拒绝、
 *      重复去重、上限、损坏 JSON 与旧版本的自愈清理、跨刷新的读写删；
 *   B. **演示页**（`/design/components/annotations/`）—— 点按钮加高亮 → `<mark>` 出现、
 *      文字一字不多不少、段落高度不变（零布局偏移）、刷新后仍在、深色下也看得见、
 *      清除后归零；页面 0 第三方请求、390/1440 无横向溢出、axe serious/critical = 0。
 *
 * 截图（docs/_reviews/M7-4a/screens）默认跳过，`ANNOTATIONS_SHOTS=1` 才落盘。
 */

const PAGE_PATH = "/design/components/annotations/";
const STORAGE_KEY = "zcblog:annotations:v1";
const DEMO_DOC_ID = "design/components/annotations";

const AXE_SOURCE = readFileSync(path.join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

/* 演示页 fixture 的第 1 段（与 annotations.astro 里的 BLOCKS[0] 同源）。
   这里只用来做「文字没被改动」的期望值，不参与定位计算 —— 定位由页面自己算。 */
const BLOCK0_PREFIX = "把批注当成一次对话";
const PRESET_QUOTES = [
    "把批注当成一次对话",
    "批注先落在你自己的浏览器里",
    "写过的段落会教你下次读到哪里该停下来",
];

async function open(page: Page): Promise<void> {
    await page.goto(PAGE_PATH, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as { __annotations?: unknown }).__annotations));
}

async function setTheme(page: Page, theme: Theme): Promise<void> {
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function addPreset(page: Page, index: number): Promise<void> {
    await page.locator("[data-annotation-add]").nth(index).click();
    await expect(page.locator("[data-annotation-demo]")).toHaveAttribute("data-annotation-state", "ready");
}

async function axe(page: Page): Promise<{ serious: number; total: number; detail: unknown[] }> {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(
        async ([tags]) => {
            const result = await (window as unknown as { axe: { run: Function } }).axe.run(document, {
                runOnly: { type: "tag", values: tags },
            });
            const serious = result.violations.filter(
                (v: { impact?: string }) => v.impact === "serious" || v.impact === "critical",
            );
            return {
                serious: serious.length,
                total: result.violations.length,
                detail: result.violations.map((v: { id: string; impact?: string; nodes: Array<{ target: unknown }> }) => ({
                    id: v.id,
                    impact: v.impact,
                    nodes: v.nodes.length,
                    targets: v.nodes.map((n) => n.target),
                })),
            };
        },
        [TAGS],
    );
}

/* ═════════════ A. 数据层 ═════════════ */

test("数据层：偏移切回原文、越界/空区间拒绝、重叠判定按段落隔离", async ({ page }) => {
    await open(page);
    const out = await page.evaluate((key) => {
        const a = (window as unknown as { __annotations: any }).__annotations;
        const text = a.texts[0] as string;
        const start = text.indexOf("批注当成一次对话");
        const end = start + "批注当成一次对话".length;

        return {
            key: a.store.key as string,
            schemaVersion: a.ANNOTATIONS_SCHEMA_VERSION as number,
            storageKey: key,
            slice: a.sliceQuote(text, start, end),
            sliceOutOfRange: a.sliceQuote(text, 0, text.length + 5),
            sliceReversed: a.sliceQuote(text, end, start),
            validSpan: a.isValidSpan(start, end, text.length),
            invalidOverflow: a.isValidSpan(0, text.length + 1, text.length),
            invalidZero: a.isValidSpan(start, start),
            invalidFraction: a.isValidSpan(0.5, 2),
            blank: a.isBlankText("  \n "),
            notBlank: a.isBlankText("批注"),
            overlapSameBlock: a.spansOverlap({ blockIndex: 0, start: 2, end: 8 }, { blockIndex: 0, start: 6, end: 9 }),
            touchOnly: a.spansOverlap({ blockIndex: 0, start: 2, end: 6 }, { blockIndex: 0, start: 6, end: 9 }),
            otherBlock: a.spansOverlap({ blockIndex: 0, start: 2, end: 8 }, { blockIndex: 1, start: 2, end: 8 }),
            findFirst: a.findQuoteOffset("甲-批注-乙-批注-丙", "批注"),
            findSecond: a.findQuoteOffset("甲-批注-乙-批注-丙", "批注", 1),
            findMissing: a.findQuoteOffset(text, "压根不存在的句子"),
            findThird: a.findQuoteOffset("甲-批注-乙-批注-丙", "批注", 2),
        };
    }, STORAGE_KEY);

    expect(out.key).toBe(STORAGE_KEY);
    expect(out.schemaVersion).toBe(1);
    expect(out.key).toBe(out.storageKey);
    expect(out.slice).toBe("批注当成一次对话");
    expect(out.sliceOutOfRange).toBe("");
    expect(out.sliceReversed).toBe("");
    expect(out.validSpan).toBe(true);
    expect(out.invalidOverflow).toBe(false);
    expect(out.invalidZero).toBe(false);
    expect(out.invalidFraction).toBe(false);
    expect(out.blank).toBe(true);
    expect(out.notBlank).toBe(false);
    expect(out.overlapSameBlock).toBe(true);
    expect(out.touchOnly).toBe(false);
    expect(out.otherBlock).toBe(false);
    expect(out.findFirst).toBeGreaterThan(0);
    expect(out.findSecond).toBeGreaterThan(out.findFirst);
    expect(out.findMissing).toBe(-1);
});

test("数据层：同一段落上偏移稳定，重定位只在引文唯一命中时成立", async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
        const a = (window as unknown as { __annotations: any }).__annotations;
        const text = a.texts[1] as string;
        const quote = "本地优先";
        const start = text.indexOf(quote);

        const exact = a.resolveSpan(text, { start, end: start + quote.length, quote });
        // 正文前面被插入一段 → 旧偏移失效，靠引文唯一命中重新算出来
        const shifted = `（新增的一句。）${text}`;
        const relocated = a.resolveSpan(shifted, { start, end: start + quote.length, quote });
        // 引文在段落里出现两次 → 不猜，直接判失联
        const twice = `${text}（再说一次：${quote}）`;
        const ambiguous = a.resolveSpan(twice, { start: 0, end: quote.length, quote });
        // 引文被删掉 → 失联
        const removed = a.resolveSpan(text.split(quote).join("同步后再说"), { start, end: start + quote.length, quote });

        return { start, exact, relocated, ambiguous, removed };
    });

    expect(out.start).toBeGreaterThan(-1);
    expect(out.exact).toEqual({ start: out.start, end: out.start + "本地优先".length, mode: "exact" });
    expect(out.relocated.mode).toBe("relocated");
    expect(out.relocated.start).toBe(out.start + "（新增的一句。）".length);
    expect(out.ambiguous).toBeNull();
    expect(out.removed).toBeNull();
});

test("数据层：空白/零长度/越界/引文不一致/重叠都不落盘，重复写入被去重", async ({ page }) => {
    await open(page);
    const out = await page.evaluate((docId) => {
        const a = (window as unknown as { __annotations: any }).__annotations;
        const store = a.store;
        store.clear(docId);

        const text = a.texts[0] as string;
        const padded = "   开头的空白";
        const quote = "把批注当成一次对话";
        const start = text.indexOf(quote);

        const results = {
            blank: store.add({ docId, blockIndex: 0, start: 0, end: 3, text: padded, quote: "   " }),
            zero: store.add({ docId, blockIndex: 0, start: 5, end: 5, quote: "" }),
            reversed: store.add({ docId, blockIndex: 0, start: 9, end: 4, text }),
            overflow: store.add({ docId, blockIndex: 0, start: text.length - 2, end: text.length + 6, text }),
            mismatch: store.add({ docId, blockIndex: 0, start, end: start + quote.length, quote: "对不上的引文", text }),
            noTarget: store.add({ docId: "", blockIndex: 0, start: 0, end: 3, quote: "abc" }),
        };

        const first = store.add({ docId, blockIndex: 0, start, end: start + quote.length, quote, text });
        const duplicate = store.add({ docId, blockIndex: 0, start, end: start + quote.length, quote, text });
        const overlapLeft = store.add({
            docId,
            blockIndex: 0,
            start,
            end: start + 3,
            quote: text.slice(start, start + 3),
            text,
        });
        const overlapRight = store.add({
            docId,
            blockIndex: 0,
            start: start + 2,
            end: start + 10,
            quote: text.slice(start + 2, start + 10),
            text,
        });
        const adjacent = store.add({
            docId,
            blockIndex: 0,
            start: start + quote.length,
            end: start + quote.length + 3,
            quote: text.slice(start + quote.length, start + quote.length + 3),
            text,
        });
        // 另一段同偏移不算重叠
        const otherBlock = store.add({
            docId,
            blockIndex: 1,
            start,
            end: start + 3,
            quote: (a.texts[1] as string).slice(start, start + 3),
            text: a.texts[1] as string,
        });

        const records = store.list(docId);
        return {
            results,
            first: { ok: first.ok, id: first.record?.id, quote: first.record?.quote },
            duplicate: { ok: duplicate.ok, duplicate: duplicate.duplicate === true, id: duplicate.record?.id },
            overlapLeft: overlapLeft.reason,
            overlapRight: overlapRight.reason,
            adjacent: { ok: adjacent.ok, reason: adjacent.reason },
            otherBlock: { ok: otherBlock.ok, reason: otherBlock.reason },
            count: records.length,
            ids: records.map((r: { id: string }) => r.id),
            sorted: records.every(
                (r: { blockIndex: number }, i: number) => i === 0 || records[i - 1].blockIndex <= r.blockIndex,
            ),
        };
    }, DEMO_DOC_ID);

    expect(out.results.blank.reason).toBe("blank");
    expect(out.results.zero.reason).toBe("invalid-span");
    expect(out.results.reversed.reason).toBe("invalid-span");
    expect(out.results.overflow.reason).toBe("overflow");
    expect(out.results.mismatch.reason).toBe("quote-mismatch");
    expect(out.results.noTarget.reason).toBe("invalid-target");

    expect(out.first.ok).toBe(true);
    expect(out.first.quote).toBe("把批注当成一次对话");
    expect(out.duplicate.duplicate).toBe(true);
    expect(out.duplicate.id).toBe(out.first.id);
    expect(out.overlapLeft).toBe("overlap");
    expect(out.overlapRight).toBe("overlap");
    expect(out.adjacent.ok).toBe(true);
    expect(out.otherBlock.ok).toBe(true);
    // 只有 3 条真的写进去：第一段 1 条 + 相邻 1 条 + 第二段 1 条
    expect(out.count).toBe(3);
    expect(out.sorted).toBe(true);
});

test("数据层：每篇上限生效，超限返回 limit 且不写第 N+1 条", async ({ page }) => {
    await open(page);
    const out = await page.evaluate(() => {
        const a = (window as unknown as { __annotations: any }).__annotations;
        const cells = new Map<string, string>();
        const storage = {
            getItem: (key: string) => cells.get(key) ?? null,
            setItem: (key: string, value: string) => void cells.set(key, value),
            removeItem: (key: string) => void cells.delete(key),
        };
        const store = a.createAnnotationStore({ storage, max: 2, key: "zcblog:annotations:test" });
        const text = "一二三四五六七八九十";

        const first = store.add({ docId: "d", blockIndex: 0, start: 0, end: 2, text });
        const second = store.add({ docId: "d", blockIndex: 1, start: 0, end: 2, text });
        const third = store.add({ docId: "d", blockIndex: 2, start: 0, end: 2, text });
        const otherDoc = store.add({ docId: "e", blockIndex: 0, start: 0, end: 2, text });

        return {
            max: a.ANNOTATIONS_MAX_PER_DOC,
            first: first.ok,
            second: second.ok,
            third: { ok: third.ok, reason: third.reason },
            otherDoc: otherDoc.ok,
            countD: store.list("d").length,
            countE: store.list("e").length,
            raw: cells.get("zcblog:annotations:test") ?? "",
        };
    });

    expect(out.max).toBe(200);
    expect(out.first).toBe(true);
    expect(out.second).toBe(true);
    expect(out.third).toEqual({ ok: false, reason: "limit" });
    expect(out.otherDoc).toBe(true);
    expect(out.countD).toBe(2);
    expect(out.countE).toBe(1);
    const envelope = JSON.parse(out.raw);
    expect(envelope.version).toBe(1);
    expect(envelope.schema).toBe("zcblog.annotations");
});

test("数据层：add → 刷新仍在；remove/clear 后刷新不在", async ({ page }) => {
    await open(page);
    const seeded = await page.evaluate((docId) => {
        const a = (window as unknown as { __annotations: any }).__annotations;
        const text = a.texts[0] as string;
        const quote = "划线本身不是目的";
        const start = text.indexOf(quote);
        const added = a.store.add({ docId, blockIndex: 0, start, end: start + quote.length, quote, text });
        return { id: added.record?.id, count: a.store.list(docId).length };
    }, DEMO_DOC_ID);
    expect(seeded.count).toBe(1);

    await page.reload({ waitUntil: "load" });
    const afterReload = await page.evaluate((docId) => {
        const a = (window as unknown as { __annotations: any }).__annotations;
        return { count: a.store.list(docId).length, quote: a.store.list(docId)[0]?.quote };
    }, DEMO_DOC_ID);
    expect(afterReload).toEqual({ count: 1, quote: "划线本身不是目的" });
    await expect(page.locator("mark.annotation-mark")).toHaveCount(1);

    const removed = await page.evaluate(
        ([docId, id]) => {
            const a = (window as unknown as { __annotations: any }).__annotations;
            return { removed: a.store.remove(id as string), count: a.store.list(docId as string).length };
        },
        [DEMO_DOC_ID, seeded.id as string],
    );
    expect(removed).toEqual({ removed: true, count: 0 });

    await page.reload({ waitUntil: "load" });
    await expect(page.locator("mark.annotation-mark")).toHaveCount(0);
    const afterRemoveReload = await page.evaluate((docId) => {
        const a = (window as unknown as { __annotations: any }).__annotations;
        return a.store.list(docId).length;
    }, DEMO_DOC_ID);
    expect(afterRemoveReload).toBe(0);
});

test("数据层：损坏 JSON / 旧版本 / 坏信封 → 安全忽略并清掉 key", async ({ page }) => {
    await open(page);

    const corrupt = await page.evaluate((key) => {
        localStorage.setItem(key, "{ 这不是 JSON");
        const a = (window as unknown as { __annotations: any }).__annotations;
        return { count: a.store.list().length, raw: localStorage.getItem(key) };
    }, STORAGE_KEY);
    expect(corrupt.count).toBe(0);
    expect(corrupt.raw).toBeNull();

    const oldVersion = await page.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({ schema: "zcblog.annotations", version: 0, records: [{ id: "x" }] }));
        const a = (window as unknown as { __annotations: any }).__annotations;
        return { count: a.store.list().length, raw: localStorage.getItem(key) };
    }, STORAGE_KEY);
    expect(oldVersion.count).toBe(0);
    expect(oldVersion.raw).toBeNull();

    const foreignShape = await page.evaluate((key) => {
        // 别的站点/别的功能在同一个 key 上放了裸数组：不可识别 → 清掉
        localStorage.setItem(key, JSON.stringify([{ id: "y", docId: "z" }]));
        const a = (window as unknown as { __annotations: any }).__annotations;
        return { count: a.store.list().length, raw: localStorage.getItem(key) };
    }, STORAGE_KEY);
    expect(foreignShape.count).toBe(0);
    expect(foreignShape.raw).toBeNull();

    const legacyCleaned = await page.evaluate((key) => {
        localStorage.setItem("zcblog:annotations", JSON.stringify({ old: true }));
        localStorage.setItem("zcblog:annotations:v0", JSON.stringify({ old: true }));
        const a = (window as unknown as { __annotations: any }).__annotations;
        a.store.list();
        return {
            unversioned: localStorage.getItem("zcblog:annotations"),
            v0: localStorage.getItem("zcblog:annotations:v0"),
            current: localStorage.getItem(key),
        };
    }, STORAGE_KEY);
    expect(legacyCleaned.unversioned).toBeNull();
    expect(legacyCleaned.v0).toBeNull();
    expect(legacyCleaned.current).toBeNull();

    // 坏记录混在合法信封里：被过滤，且自愈写回只剩合法那条
    const healed = await page.evaluate(
        ([key, docId, quote]) => {
            const a = (window as unknown as { __annotations: any }).__annotations;
            const text = a.texts[0] as string;
            const start = text.indexOf(quote as string);
            const good = {
                id: `${docId}#0:${start}-${start + 2}`,
                docId,
                blockIndex: 0,
                start,
                end: start + 2,
                quote: (quote as string).slice(0, 2),
                createdAt: 1,
            };
            localStorage.setItem(
                key as string,
                JSON.stringify({
                    schema: "zcblog.annotations",
                    version: 1,
                    updatedAt: 1,
                    records: [good, { id: "broken" }, null, { ...good, id: "wrong-length", end: good.end + 5 }],
                }),
            );
            const records = a.store.list(docId as string);
            return {
                count: records.length,
                ids: records.map((r: { id: string }) => r.id),
                expectedId: good.id,
                raw: localStorage.getItem(key as string),
            };
        },
        [STORAGE_KEY, DEMO_DOC_ID, BLOCK0_PREFIX],
    );
    expect(healed.count).toBe(1);
    expect(healed.ids).toEqual([healed.expectedId]);
    expect(JSON.parse(healed.raw ?? "{}").records).toHaveLength(1);
});

/* ═════════════ B. 演示页 ═════════════ */

test("演示页：添加高亮 → mark 出现、文字不变、段落高度不变；重复去重、重叠被拒", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page);

    const block = page.locator('[data-annotation-block="0"]');
    const textBefore = await block.evaluate((el) => el.textContent);
    const heightBefore = await block.evaluate((el) => el.getBoundingClientRect().height);

    await addPreset(page, 0);
    await expect(page.locator("mark.annotation-mark")).toHaveCount(1);
    await expect(block.locator("mark.annotation-mark")).toHaveText(PRESET_QUOTES[0]);
    await expect(page.locator("[data-annotation-demo]")).toHaveAttribute("data-annotation-count", "1");
    await expect(page.locator("[data-annotation-demo]")).toHaveAttribute("data-annotation-last", "added");

    // 高亮只包 mark：文字一字不多、一字不少
    expect(await block.evaluate((el) => el.textContent)).toBe(textBefore);
    // 零布局偏移：同样的字、同样的行高，段落高度必须一模一样
    expect(await block.evaluate((el) => el.getBoundingClientRect().height)).toBe(heightBefore);
    // 不靠 padding/margin 撑开，只有底色和 inset 阴影
    const markBox = await page.locator("mark.annotation-mark").first().evaluate((el) => {
        const style = getComputedStyle(el);
        return {
            padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join(" "),
            margin: [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft].join(" "),
            display: style.display,
        };
    });
    expect(markBox.padding).toBe("0px 0px 0px 0px");
    expect(markBox.margin).toBe("0px 0px 0px 0px");

    // 重复同一条 → 去重，不新增
    await addPreset(page, 3);
    await expect(page.locator("[data-annotation-demo]")).toHaveAttribute("data-annotation-last", "duplicate");
    await expect(page.locator("mark.annotation-mark")).toHaveCount(1);

    // 故意重叠 → 拒绝，mark 数量不变
    await addPreset(page, 4);
    await expect(page.locator("[data-annotation-demo]")).toHaveAttribute("data-annotation-last", "overlap");
    await expect(page.locator("mark.annotation-mark")).toHaveCount(1);
    await expect(page.locator("[data-annotation-status]")).toHaveAttribute("data-tone", "warn");

    // 第二段再加一条 → 两条都在，且各自落在正确的段落
    await addPreset(page, 1);
    await expect(page.locator("mark.annotation-mark")).toHaveCount(2);
    await expect(page.locator('[data-annotation-block="1"] mark.annotation-mark')).toHaveText(PRESET_QUOTES[1]);

    // 刷新后仍在（数据层 + 渲染都过一遍）
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("mark.annotation-mark")).toHaveCount(2);
    await expect(page.locator("[data-annotation-demo]")).toHaveAttribute("data-annotation-count", "2");
    await expect(page.locator('[data-annotation-block="1"] mark.annotation-mark')).toHaveText(PRESET_QUOTES[1]);

    // 清除 → 归零，且存储里也没有残留记录
    await page.locator("[data-annotation-clear]").click();
    await expect(page.locator("mark.annotation-mark")).toHaveCount(0);
    await expect(page.locator("[data-annotation-demo]")).toHaveAttribute("data-annotation-last", "cleared");
    const storedAfterClear = await page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        return raw === null ? [] : (JSON.parse(raw).records as unknown[]);
    }, STORAGE_KEY);
    expect(storedAfterClear).toEqual([]);
});

for (const theme of THEMES) {
    test(`演示页 @${theme}：高亮可见且不透明、深浅色可区分`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await open(page);
        await addPreset(page, 0);
        await setTheme(page, theme);

        const sample = await page.locator("mark.annotation-mark").first().evaluate((el) => {
            const style = getComputedStyle(el);
            return { background: style.backgroundColor, shadow: style.boxShadow, color: style.color };
        });
        expect(sample.background).not.toBe("rgba(0, 0, 0, 0)");
        expect(sample.background.length).toBeGreaterThan(0);
        expect(sample.shadow).not.toBe("none");

        // 同一页在另一主题下的底色必须不同（否则 dark 下靠「看不见」混过去了）
        await setTheme(page, theme === "dark" ? "light" : "dark");
        const other = await page.locator("mark.annotation-mark").first().evaluate(
            (el) => getComputedStyle(el).backgroundColor,
        );
        expect(other).not.toBe(sample.background);

        // 截图时换回本主题，保证证据与断言口径一致
        await setTheme(page, theme);
        const shot = await page.locator("[data-annotation-demo]").screenshot();
        expect(shot.byteLength).toBeGreaterThan(1000);
    });
}

test("演示页：0 网络请求（全部同源，只拿页面自己的 CSS/JS）", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await open(page);
    await addPreset(page, 0);
    await page.reload({ waitUntil: "load" });

    const base = new URL(page.url());
    const foreign = requests.filter((url) => {
        const parsed = new URL(url);
        if (parsed.origin !== base.origin) return true;
        // 同源但不该出现的东西：字体、图片、埋点、外部接口
        return /\.(woff2?|ttf|png|jpe?g|gif|svg|webp)$/i.test(parsed.pathname) || parsed.pathname.startsWith("/api/");
    });
    expect(foreign, `意外请求：${foreign.join(", ")}`).toEqual([]);
    expect(requests.length).toBeGreaterThan(0);
});

for (const width of [1440, 390] as const) {
    test(`演示页 @${width}：无横向溢出，mark 不撑破容器`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await open(page);
        await addPreset(page, 0);

        const metrics = await page.evaluate(() => {
            const root = document.documentElement;
            const demo = document.querySelector<HTMLElement>("[data-annotation-demo]");
            const mark = document.querySelector<HTMLElement>("mark.annotation-mark");
            return {
                scrollWidth: root.scrollWidth,
                clientWidth: root.clientWidth,
                demoRight: demo ? demo.getBoundingClientRect().right : 0,
                viewport: window.innerWidth,
                markWidth: mark ? mark.getBoundingClientRect().width : 0,
            };
        });
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
        expect(metrics.demoRight).toBeLessThanOrEqual(metrics.viewport + 1);
        expect(metrics.markWidth).toBeGreaterThan(0);
    });
}

for (const theme of THEMES) {
    test(`axe @${theme}：serious/critical = 0（空态 + 高亮态）`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await open(page);
        await setTheme(page, theme);

        const empty = await axe(page);
        console.log(`[axe] annotations 空态 @${theme} ${JSON.stringify(empty)}`);
        expect(empty.serious, `空态 axe serious/critical: ${JSON.stringify(empty.detail)}`).toBe(0);

        await addPreset(page, 0);
        const highlighted = await axe(page);
        console.log(`[axe] annotations 高亮态 @${theme} ${JSON.stringify(highlighted)}`);
        expect(highlighted.serious, `高亮态 axe serious/critical: ${JSON.stringify(highlighted.detail)}`).toBe(0);
    });
}

/* ═════════════ C. 证据截图（ANNOTATIONS_SHOTS=1 才跑） ═════════════ */

const SHOT_DIR = path.resolve(process.cwd(), "docs/_reviews/M7-4a/screens");

test.describe("批注证据截图", () => {
    test.skip(process.env.ANNOTATIONS_SHOTS !== "1", "set ANNOTATIONS_SHOTS=1 to capture");

    for (const theme of THEMES) {
        for (const width of [1440, 390] as const) {
            test(`screenshot ${theme} @${width}`, async ({ page }) => {
                mkdirSync(SHOT_DIR, { recursive: true });
                await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
                await open(page);
                await setTheme(page, theme);
                await addPreset(page, 0);
                await addPreset(page, 1);
                await page.evaluate(() => document.fonts.ready);
                await page.locator("[data-annotation-demo]").screenshot({
                    path: path.join(SHOT_DIR, `annotations-demo-${theme}-${width}.png`),
                });
                await page.screenshot({
                    path: path.join(SHOT_DIR, `annotations-page-${theme}-${width}.png`),
                    fullPage: true,
                });
            });
        }
    }
});
