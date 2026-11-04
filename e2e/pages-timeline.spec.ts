import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * C-2 时间线 验收（M2-8a）
 *
 * 覆盖（`19-m2-plan.md` §M2-8 的页面级判据 + 本卡专项）：
 *  1. 路由 200：`/timeline/`、`/en/timeline/`
 *  2. 中英同源：状态 / 条数 / 年份组数完全一致，且 en 页 h1 真的是英文（locale 接线没断）
 *  3. 恰好 1 个 <h1>；标题层级不跳级（h1 → h2 → h3 → h4）
 *  4. light/dark × 390/768/1440：无横向溢出
 *  5. axe（wcag2a/aa + wcag21a/aa + wcag22aa）：页面主体 serious=0 critical=0 incomplete=0（双主题）
 *  6. **排序契约**（本卡核心）：年份组严格降序；同一年内日期降序；同日按 id 升序兜底；
 *     年份标签与组内日期的年份一致；条目数 = `data-timeline-total`
 *  7. 契约：每条有标题 / 一句事实 / 合法 kind；`data-timeline-precision` 与日期长度一致；
 *     「只到月」的条目必须有读屏文字（精度差异不能只靠视觉格式表达）
 *  8. 装饰性元素（圆点）aria-hidden —— 语义由日期与标题承担
 *  9. 导航：新增入口在桌面/移动断点都不溢出、点击 200
 * 10. 空数据：**真实构建**（`PUBLIC_TIMELINE_STATE=empty`）证明「空数据可构建」，
 *     随后恢复常规构建，避免污染后续用例
 * 11. 证据截图（light/dark 1440 + light 390），供评审卡引用
 */

const ROOT = process.cwd();
const AXE_SOURCE = readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [390, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

const TIMELINE = {
    url: "/timeline/",
    en: "/en/timeline/",
    shell: ".entities--timeline",
    status: "data-timeline-status",
    total: "data-timeline-total",
    years: "data-timeline-years",
} as const;

const KINDS = ["build", "site", "infra", "life"] as const;

const EVIDENCE_DIR =
    process.env.M28A_EVIDENCE_DIR ??
    path.resolve(ROOT, "../../hermes-desktop-files/blog2.0/docs/_reviews/M2-8a-timeline");

/** 与 `src/types/entities.ts` 的 `timelineSortKey` 同口径：月精度补 `-00`。 */
const sortKey = (date: string): string => (date.length === 7 ? `${date}-00` : date);

async function openPage(page: Page, url: string, theme: Theme): Promise<void> {
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
    // 主题切换会触发颜色过渡（最长 --duration-slow 350ms）：过渡没走完时 getComputedStyle
    // 拿到的是插值中间色，axe 会按中间色算对比度 → 假红。
    await page.waitForTimeout(420);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

/* ───────────────────────── 1. 路由 ───────────────────────── */

for (const [lang, url] of [
    ["zh", TIMELINE.url],
    ["en", TIMELINE.en],
] as const) {
    test(`route 200 timeline ${lang}`, async ({ page }) => {
        const response = await page.goto(url, { waitUntil: "load" });
        expect(response?.status(), `GET ${url}`).toBe(200);
        await expect(page.locator(TIMELINE.shell)).toHaveCount(1);
        await expect(page.locator(`${TIMELINE.shell} h1`)).toHaveCount(1);
    });
}

/* ───────────────────────── 2. 中英同源 ───────────────────────── */

test("中英两页同源：状态 / 条数 / 年份组数一致，en 页 h1 是英文", async ({ page }) => {
    const read = async (url: string) => {
        await page.goto(url, { waitUntil: "load" });
        const shell = page.locator(TIMELINE.shell);
        return {
            status: await shell.getAttribute(TIMELINE.status),
            total: await shell.getAttribute(TIMELINE.total),
            years: await shell.getAttribute(TIMELINE.years),
            h1: (await page.locator(`${TIMELINE.shell} h1`).innerText()).trim(),
        };
    };

    const zh = await read(TIMELINE.url);
    const en = await read(TIMELINE.en);

    expect(en.status, "status 中英不一致").toEqual(zh.status);
    expect(en.total, "total 中英不一致").toEqual(zh.total);
    expect(en.years, "years 中英不一致").toEqual(zh.years);
    expect(zh.status).toBe("ok");
    expect(zh.h1).not.toEqual(en.h1);
    expect(en.h1).toMatch(/^[A-Za-z][A-Za-z\s&]*$/);
    console.log(`[i18n] ${zh.h1} / ${en.h1} · total ${zh.total} · years ${zh.years}`);
});

/* ───────────────────────── 3. h1 / 标题层级 ───────────────────────── */

test("恰好 1 个 h1，标题层级不跳级（双语言）", async ({ page }) => {
    for (const url of [TIMELINE.url, TIMELINE.en]) {
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
        }, TIMELINE.shell);

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

/* ───────────────────────── 4. 横向溢出 ───────────────────────── */

test("overflow timeline（light/dark × 390/768/1440）", async ({ page }) => {
    for (const theme of THEMES) {
        for (const width of VIEWPORTS) {
            await page.setViewportSize({ width, height: 900 });
            await openPage(page, TIMELINE.url, theme);
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
                return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders };
            });
            expect(result.offenders, `timeline@${width} (${theme}): 越界元素`).toEqual([]);
            expect(
                result.scrollWidth,
                `timeline@${width} (${theme}): scrollWidth ${result.scrollWidth} > clientWidth ${result.clientWidth}`,
            ).toBeLessThanOrEqual(result.clientWidth + 1);
        }
    }
});

/* ───────────────────────── 5. axe ───────────────────────── */

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
    test(`axe timeline ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await openPage(page, TIMELINE.url, theme);
        // 主题过渡必须落定，否则 axe 取到插值中间色（假红）
        await page.addStyleTag({
            content: `${TIMELINE.shell} * { transition: none !important; }`,
        });
        const { violations, incomplete } = await runAxe(page, TIMELINE.shell);
        const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(
            serious.map((v) => `${v.id} (${v.impact}) ${v.nodes[0]?.target ?? ""}`),
            `timeline ${theme}: serious/critical`,
        ).toEqual([]);
        expect(
            incomplete.map((v) => `${v.id} ${v.nodes[0]?.target ?? ""}`),
            `timeline ${theme}: incomplete`,
        ).toEqual([]);
        console.log(
            `[axe] timeline ${theme}: violations=${violations.length} incomplete=${incomplete.length}`,
        );
    });
}

/* ───────────────────────── 6. 排序契约（本卡核心） ───────────────────────── */

type Group = { year: string; items: Array<{ id: string; date: string }> };

const readGroups = async (page: Page): Promise<Group[]> =>
    page.locator(`${TIMELINE.shell} .timeline-year`).evaluateAll((sections) =>
        sections.map((section) => ({
            year: section.getAttribute("data-timeline-year") ?? "",
            items: [...section.querySelectorAll(".timeline-item")].map((node) => ({
                id: node.getAttribute("data-timeline-id") ?? "",
                date: node.getAttribute("data-timeline-date") ?? "",
            })),
        })),
    );

test("排序：年份降序、同年日期降序、同日按 id 升序、年标签与日期一致", async ({ page }) => {
    await page.goto(TIMELINE.url, { waitUntil: "load" });
    const shell = page.locator(TIMELINE.shell);
    const total = Number(await shell.getAttribute(TIMELINE.total));
    const years = Number(await shell.getAttribute(TIMELINE.years));
    const groups = await readGroups(page);

    expect(groups.length, "年份组数应等于 data-timeline-years").toBe(years);
    expect(
        groups.reduce((sum, group) => sum + group.items.length, 0),
        "条目总数应等于 data-timeline-total",
    ).toBe(total);
    await expect(page.locator(`${TIMELINE.shell} .timeline-item`)).toHaveCount(total);

    // 年份组严格降序
    const yearList = groups.map((group) => group.year);
    expect(yearList, `年份必须降序：${yearList.join(" → ")}`).toEqual(
        [...yearList].sort((a, b) => b.localeCompare(a)),
    );
    expect(new Set(yearList).size, "年份组不能重复").toBe(yearList.length);

    for (const group of groups) {
        const dates = group.items.map((item) => item.date);
        // 年份标签必须与组内日期年份一致（分组不能错位）
        for (const date of dates)
            expect(date.slice(0, 4), `${group.year} 组里出现 ${date}`).toBe(group.year);

        // 日期降序（月精度按 -00 补齐，同口径比较）
        const sorted = [...dates].sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
        expect(dates, `${group.year} 组内日期必须降序：${dates.join(" → ")}`).toEqual(sorted);

        // 同一天/同一月：按 id 升序兜底（顺序必须唯一确定，否则截图与断言不可复现）
        const seen = new Map<string, string[]>();
        for (const item of group.items) {
            const bucket = seen.get(item.date);
            if (bucket) bucket.push(item.id);
            else seen.set(item.date, [item.id]);
        }
        for (const [date, ids] of seen) {
            if (ids.length < 2) continue;
            expect(ids, `${date} 的同类条目必须按 id 升序`).toEqual(
                [...ids].sort((a, b) => a.localeCompare(b)),
            );
        }
    }

    // 重复构建也必须得到同一个顺序：顺序由数据唯一决定，不靠数据文件里的书写顺序
    await page.reload({ waitUntil: "load" });
    const again = await readGroups(page);
    expect(again, "两次加载的顺序必须一致（排序必须是数据决定的）").toEqual(groups);

    console.log(`[sort] ${yearList.join(" > ")} · ${total} 条 · 组内日期降序 · 同日 id 兜底`);
});

/* ───────────────────────── 7. 字段与精度契约 ───────────────────────── */

test("契约：每条有标题/事实/合法类别，日期精度与标注一致", async ({ page }) => {
    await page.goto(TIMELINE.url, { waitUntil: "load" });
    const items = await page.locator(`${TIMELINE.shell} .timeline-item`).evaluateAll((nodes) =>
        nodes.map((node) => ({
            id: node.getAttribute("data-timeline-id"),
            date: node.getAttribute("data-timeline-date") ?? "",
            kind: node.getAttribute("data-timeline-kind"),
            precision: node.getAttribute("data-timeline-precision"),
            title: (node.querySelector(".timeline-item__title")?.textContent ?? "").trim(),
            detail: (node.querySelector(".timeline-item__detail")?.textContent ?? "").trim(),
            kindText: (node.querySelector(".timeline-item__kind")?.textContent ?? "").trim(),
            datetime: node.querySelector("time")?.getAttribute("datetime") ?? "",
            dateText: (node.querySelector(".timeline-item__date")?.textContent ?? "").trim(),
            srOnly: (node.querySelector(".sr-only")?.textContent ?? "").trim(),
        })),
    );

    expect(items.length).toBeGreaterThan(0);
    expect(new Set(items.map((item) => item.id)).size, "条目 id 必须唯一").toBe(items.length);

    let monthOnly = 0;
    for (const item of items) {
        expect(item.title.length, `${item.id} 缺标题`).toBeGreaterThan(0);
        expect(item.detail.length, `${item.id} 缺一句事实`).toBeGreaterThan(0);
        expect(KINDS as readonly string[]).toContain(item.kind ?? "");
        expect(item.kindText.length, `${item.id} 类别必须有文字，不许只靠色点`).toBeGreaterThan(0);

        // 精度：日期 7 字符 = 到月，10 字符 = 到日；data 属性必须与事实一致
        const expectedPrecision = item.date.length === 7 ? "month" : "day";
        expect(item.precision, `${item.id} 精度标注与日期长度不符`).toBe(expectedPrecision);
        expect(item.datetime, `${item.id} <time datetime> 应等于原始日期`).toBe(item.date);
        expect(item.dateText.length, `${item.id} 左轨必须有日期文本`).toBeGreaterThan(0);

        if (expectedPrecision === "month") {
            monthOnly += 1;
            // 「只到月」必须补读屏文字：11 与 11.02 的差异不能只靠视觉格式表达
            expect(item.srOnly.length, `${item.id} 只到月，缺读屏说明`).toBeGreaterThan(0);
        } else {
            expect(item.srOnly, `${item.id} 到日，不该有多余的精度说明`).toBe("");
        }
    }

    expect(monthOnly, "样例数据里应同时有两种精度（否则月精度分支没被覆盖）").toBeGreaterThan(0);
    expect(monthOnly, "样例数据里也应有一天精度（否则日精度分支没被覆盖）").toBeLessThan(
        items.length,
    );
    console.log(`[contract] ${items.length} 条 · ${monthOnly} 条只到月 · 精度标注与日期一致`);
});

/* ───────────────────────── 8. 装饰性元素 aria-hidden ───────────────────────── */

test("装饰性元素 aria-hidden（圆点）", async ({ page }) => {
    await page.goto(TIMELINE.url, { waitUntil: "load" });
    const dots = page.locator(`${TIMELINE.shell} .timeline-item__dot`);
    const count = await dots.count();
    expect(count, "没有圆点可断言").toBeGreaterThan(0);
    const hidden = await dots.evaluateAll((nodes) =>
        nodes.every((node) => node.getAttribute("aria-hidden") === "true"),
    );
    expect(hidden, "圆点必须 aria-hidden（语义由日期与标题承担）").toBe(true);
    console.log(`[a11y] ${count} 个圆点均 aria-hidden`);
});

/* ───────────────────────── 9. 导航 ───────────────────────── */

test("导航：时间线入口存在、不溢出、可点击", async ({ page }) => {
    for (const width of [390, 1440] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/", { waitUntil: "load" });
        await page.locator("#nav-menu-btn").click();
        const nav = page.locator("#nav-dropdown");
        await expect(nav).toBeVisible();

        const link = nav.locator('a[href="/timeline/"]');
        await expect(link, `${width}px: 导航缺时间线`).toHaveCount(1);
        const box = await link.boundingBox();
        expect(box, `${width}px: 时间线入口无布局盒`).not.toBeNull();
        const overflow = await nav.evaluate(
            (el) => el.getBoundingClientRect().right - document.documentElement.clientWidth,
        );
        expect(overflow, `${width}px: 导航面板越界`).toBeLessThanOrEqual(1);

        await link.click();
        await page.waitForURL("**/timeline/");
        await expect(page.locator(TIMELINE.shell)).toHaveCount(1);
        console.log(`[nav] ${width}px: 时间线入口可点击 → ${page.url()}`);
    }
});

/* ───────────────────────── 10. 空数据（真实构建） ───────────────────────── */

test("空数据可构建：真实构建为空态，路由仍 200", async ({ page }) => {
    test.setTimeout(900_000);
    const astroBin = path.join(ROOT, "node_modules/.bin/astro");

    try {
        execFileSync(astroBin, ["build"], {
            cwd: ROOT,
            env: { ...process.env, PUBLIC_TIMELINE_STATE: "empty" },
            stdio: "pipe",
        });

        const response = await page.goto(TIMELINE.url, { waitUntil: "load" });
        expect(response?.status(), "空态也必须 200").toBe(200);
        await expect(page.locator(TIMELINE.shell)).toHaveAttribute(TIMELINE.status, "empty");
        await expect(page.locator("[data-timeline-empty]")).toBeVisible();
        await expect(page.locator(`${TIMELINE.shell} .timeline-item`)).toHaveCount(0);
        await expect(page.locator(`${TIMELINE.shell} .timeline-year`)).toHaveCount(0);
        // 页头仍在：空态是页面状态，不是异常
        await expect(page.locator(`${TIMELINE.shell} h1`)).toHaveCount(1);
        console.log("[empty] 真实构建：空态、0 条目、页头保留、路由 200");
    } finally {
        // 恢复常规构建：后续用例（以及验收命令里的 perf / visual）必须看到正常数据
        execFileSync(astroBin, ["build"], { cwd: ROOT, env: process.env, stdio: "pipe" });
    }
});

/* ───────────────────────── 11. 证据截图 ───────────────────────── */

test("证据截图：timeline light/dark 1440 + light 390", async ({ page }) => {
    if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
    const shots = [
        { theme: "light" as Theme, width: 1440, name: "timeline-light-1440.png" },
        { theme: "dark" as Theme, width: 1440, name: "timeline-dark-1440.png" },
        { theme: "light" as Theme, width: 390, name: "timeline-light-390.png" },
    ];
    for (const shot of shots) {
        await page.setViewportSize({ width: shot.width, height: 900 });
        await openPage(page, TIMELINE.url, shot.theme);
        await page.screenshot({ path: path.join(EVIDENCE_DIR, shot.name), fullPage: true });
    }
    console.log(`[evidence] ${shots.length} 张截图 → ${EVIDENCE_DIR}`);
});
