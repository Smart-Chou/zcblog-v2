import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * C-2 文化聚合入口 验收（M2-9）
 *
 * 覆盖（本卡判据 + 页面级通用判据）：
 *  1. 路由 200：`/culture/`、`/en/culture/`
 *  2. 中英同源：入口 id / 条数 / 去重口径完全一致；en 页 h1 是英文，入口链到 `/en/…`
 *  3. 恰好 1 个 <h1>；标题层级不跳级（h1 → h2 → h3）
 *  4. light/dark × 390/768/1440：无横向溢出
 *  5. axe（wcag2a/aa + wcag21a/aa + wcag22aa）：serious/critical=0、incomplete=0（双主题）
 *  6. **契约**：每张卡有来源 / 标题 / 一句说明 / 3 个统计 / 分类构成；卡内只有 1 个链接
 *     （整卡热区是 stretched link，不是同一目标两个 Tab 停靠点）；raw = 三卡之和，
 *     unique = raw − overlap，overlap ≤ 歌单条数
 *  7. **只链接已存在路由**：每个入口 `maxRedirects:0` 请求必须 200，页面内站内链接
 *     不出现 404
 *  8. **旧路由保留**：`/bangumi/`、`/douban/`、`/music/` 200 且无 301/302
 *  9. 导航：新增「文化」入口在桌面/移动断点都不溢出、点击 200
 * 10. **条件渲染**（本卡核心）：真实构建 `PUBLIC_CULTURE_OMIT=music` → 音乐入口整张卡
 *     不渲染、`dist` 里 0 条卡片链接，其余两卡与去重口径不变；随后恢复常规构建
 * 11. 证据截图（light/dark 1440 + light 390），供评审卡引用
 */

const ROOT = process.cwd();
const AXE_SOURCE = readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [390, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

const CULTURE = {
    url: "/culture/",
    en: "/en/culture/",
    shell: ".entities--culture",
    grid: ".culture-grid",
    card: ".culture-card",
} as const;

/** 固定顺序：番剧 → 豆瓣 → 歌单。顺序变了就是产品变更，不是随机。 */
const ORDER = ["bangumi", "douban", "music"] as const;

/** 旧路由：本卡只加聚合入口，不搬正文、不做 301。 */
const LEGACY_ROUTES = ["/bangumi/", "/douban/", "/music/"] as const;

const EVIDENCE_DIR =
    process.env.M2_9_EVIDENCE_DIR ??
    path.resolve(ROOT, "../../hermes-desktop-files/blog2.0/docs/_reviews/M2-9-culture");

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
    // 主题切换会触发颜色过渡（最长 --duration-slow 350ms）：过渡没走完时
    // getComputedStyle 拿到的是插值中间色，axe 会按中间色算对比度 → 假红。
    await page.waitForTimeout(420);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

type CardSnapshot = {
    id: string;
    count: number;
    href: string;
    index: string;
    kicker: string;
    title: string;
    note: string;
    stats: Array<{ label: string; value: string }>;
    breakdown: string[];
    links: string[];
};

const readRoot = async (page: Page) => {
    const shell = page.locator(CULTURE.shell);
    return {
        status: await shell.getAttribute("data-culture-status"),
        entries: Number(await shell.getAttribute("data-culture-entries")),
        raw: Number(await shell.getAttribute("data-culture-raw")),
        unique: Number(await shell.getAttribute("data-culture-unique")),
        overlap: Number(await shell.getAttribute("data-culture-overlap")),
        hidden: (await shell.getAttribute("data-culture-hidden")) ?? "",
        h1: (await page.locator(`${CULTURE.shell} h1`).innerText()).trim(),
    };
};

const readCards = async (page: Page): Promise<CardSnapshot[]> =>
    page.locator(CULTURE.card).evaluateAll((nodes) =>
        nodes.map((node) => ({
            id: node.getAttribute("data-culture-entry") ?? "",
            count: Number(node.getAttribute("data-culture-count") ?? "0"),
            href: node.getAttribute("data-culture-href") ?? "",
            index: (node.querySelector(".culture-card__index")?.textContent ?? "").trim(),
            kicker: (node.querySelector(".culture-card__kicker")?.textContent ?? "").trim(),
            title: (node.querySelector(".culture-card__title-link")?.textContent ?? "").trim(),
            note: (node.querySelector(".culture-card__note")?.textContent ?? "").trim(),
            stats: [...node.querySelectorAll(".culture-card__stat")].map((stat) => ({
                label: (stat.querySelector(".culture-card__stat-label")?.textContent ?? "").trim(),
                value: (stat.querySelector(".culture-card__stat-value")?.textContent ?? "").trim(),
            })),
            breakdown: [...node.querySelectorAll(".culture-card__breakdown-item")].map((item) =>
                (item.textContent ?? "").trim(),
            ),
            links: [...node.querySelectorAll("a")].map((link) => link.getAttribute("href") ?? ""),
        })),
    );

/* ───────────────────────── 1. 路由 ───────────────────────── */

for (const [lang, url] of [
    ["zh", CULTURE.url],
    ["en", CULTURE.en],
] as const) {
    test(`route 200 culture ${lang}`, async ({ page }) => {
        const response = await page.goto(url, { waitUntil: "load" });
        expect(response?.status(), `GET ${url}`).toBe(200);
        await expect(page.locator(CULTURE.shell)).toHaveCount(1);
        await expect(page.locator(`${CULTURE.shell} h1`)).toHaveCount(1);
        await expect(page.locator(`${CULTURE.grid} ${CULTURE.card}`)).toHaveCount(3);
    });
}

/* ───────────────────────── 2. 中英同源 ───────────────────────── */

test("中英两页同源：入口 / 计数 / 去重口径一致，en 页链到 /en/ 路由", async ({ page }) => {
    await page.goto(CULTURE.url, { waitUntil: "load" });
    const zhRoot = await readRoot(page);
    const zhCards = await readCards(page);

    await page.goto(CULTURE.en, { waitUntil: "load" });
    const enRoot = await readRoot(page);
    const enCards = await readCards(page);

    expect(enRoot.entries).toBe(zhRoot.entries);
    expect(enRoot.raw).toBe(zhRoot.raw);
    expect(enRoot.unique).toBe(zhRoot.unique);
    expect(enRoot.overlap).toBe(zhRoot.overlap);
    expect(enCards.map((card) => card.id)).toEqual(zhCards.map((card) => card.id));
    expect(enCards.map((card) => card.count)).toEqual(zhCards.map((card) => card.count));
    expect(zhRoot.status).toBe("ok");

    // en 是英文正文，且每条都指向 en 路由（不是把人送回中文页）
    expect(zhRoot.h1).not.toEqual(enRoot.h1);
    expect(enRoot.h1).toMatch(/^[A-Za-z][A-Za-z\s&]*$/);
    for (const card of enCards)
        expect(card.href.startsWith("/en/"), `${card.id}: ${card.href}`).toBe(true);
    for (const card of zhCards) expect(card.href.startsWith("/en/")).toBe(false);

    console.log(
        `[i18n] ${zhRoot.h1} / ${enRoot.h1} · entries ${zhRoot.entries} · raw ${zhRoot.raw} · unique ${zhRoot.unique} · overlap ${zhRoot.overlap}`,
    );
});

/* ───────────────────────── 3. h1 / 标题层级 ───────────────────────── */

test("恰好 1 个 h1，标题层级不跳级（双语言）", async ({ page }) => {
    for (const url of [CULTURE.url, CULTURE.en]) {
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
        }, CULTURE.shell);

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

test("overflow culture（light/dark × 390/768/1440）", async ({ page }) => {
    for (const theme of THEMES) {
        for (const width of VIEWPORTS) {
            await page.setViewportSize({ width, height: 900 });
            await openPage(page, CULTURE.url, theme);
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
            expect(result.offenders, `culture@${width} (${theme}): 越界元素`).toEqual([]);
            expect(
                result.scrollWidth,
                `culture@${width} (${theme}): scrollWidth ${result.scrollWidth} > clientWidth ${result.clientWidth}`,
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
    test(`axe culture ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await openPage(page, CULTURE.url, theme);
        // 主题过渡必须落定，否则 axe 取到插值中间色（假红）
        await page.addStyleTag({
            content: `${CULTURE.shell} * { transition: none !important; }`,
        });
        const { violations, incomplete } = await runAxe(page, CULTURE.shell);
        const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(
            serious.map((v) => `${v.id} (${v.impact}) ${v.nodes[0]?.target ?? ""}`),
            `culture ${theme}: serious/critical`,
        ).toEqual([]);
        expect(
            incomplete.map((v) => `${v.id} ${v.nodes[0]?.target ?? ""}`),
            `culture ${theme}: incomplete`,
        ).toEqual([]);
        console.log(
            `[axe] culture ${theme}: violations=${violations.length} incomplete=${incomplete.length}`,
        );
    });
}

/* ───────────────────────── 6. 入口契约 ───────────────────────── */

test("契约：每卡有来源/标题/说明/3 统计/构成，卡内 1 个链接，raw − overlap = unique", async ({
    page,
}) => {
    await page.goto(CULTURE.url, { waitUntil: "load" });
    const root = await readRoot(page);
    const cards = await readCards(page);

    expect(cards.length, "入口数应等于 data-culture-entries").toBe(root.entries);
    expect(
        cards.map((card) => card.id),
        "顺序必须固定：番剧 → 豆瓣 → 歌单",
    ).toEqual([...ORDER]);
    expect(new Set(cards.map((card) => card.id)).size, "入口 id 不能重复").toBe(cards.length);

    cards.forEach((card, position) => {
        expect(card.index, `${card.id}: 序号必须按渲染顺序连续`).toBe(
            String(position + 1).padStart(2, "0"),
        );
        expect(card.count, `${card.id}: 0 条的卡根本不该渲染`).toBeGreaterThan(0);
        expect(card.kicker.length, `${card.id}: 缺来源说明`).toBeGreaterThan(0);
        expect(card.title.length, `${card.id}: 缺标题`).toBeGreaterThan(0);
        expect(card.note.length, `${card.id}: 缺一句说明`).toBeGreaterThanOrEqual(20);
        expect(card.href.startsWith("/"), `${card.id}: 入口必须是站内路由`).toBe(true);

        expect(card.stats.length, `${card.id}: 统计项应为 3 个`).toBe(3);
        for (const stat of card.stats) {
            expect(stat.label.length, `${card.id}: 统计项缺名称`).toBeGreaterThan(0);
            expect(stat.value.length, `${card.id}: 统计项缺值`).toBeGreaterThan(0);
        }

        expect(card.breakdown.length, `${card.id}: 缺分类构成`).toBeGreaterThan(0);
        for (const part of card.breakdown) {
            expect(part, `${card.id}: 构成项格式应为「名称 + 数字」`).toMatch(/^\S.*\s\d+$/);
        }

        // 整卡热区是 stretched link：一张卡只有一个链接、一个 Tab 停靠点
        expect(card.links, `${card.id}: 卡内只该有 1 个链接`).toEqual([card.href]);
    });

    // 顺序说明只点在场入口的名（缺来源时不能把不在场的也写进去）
    const listMeta = (await page.locator(".section-head__meta").first().innerText()).trim();
    for (const card of cards) expect(listMeta, `顺序说明漏了 ${card.id}`).toContain(card.title);
    console.log(`[contract] 顺序说明：${listMeta}`);

    // 计数只有一个出处：卡上数字之和 = 原始总数；去重后 = 原始 − 同源
    expect(
        cards.reduce((sum, card) => sum + card.count, 0),
        "data-culture-raw 必须等于三卡之和",
    ).toBe(root.raw);
    expect(root.unique, "unique 必须等于 raw − overlap").toBe(root.raw - root.overlap);

    const music = cards.find((card) => card.id === "music");
    expect(root.overlap, "同源条数不可能超过歌单条数").toBeLessThanOrEqual(music?.count ?? 0);

    console.log(
        `[contract] ${cards.length} 个入口 · raw ${root.raw} − overlap ${root.overlap} = unique ${root.unique}`,
    );
});

/* ───────────────────────── 7. 只链接已存在路由 ───────────────────────── */

test("只链接已存在路由：每个入口 200 且无重定向，页面内站内链接无 404", async ({
    page,
    request,
}) => {
    await page.goto(CULTURE.url, { waitUntil: "load" });
    const cards = await readCards(page);

    for (const card of cards) {
        const response = await request.get(card.href, { maxRedirects: 0 });
        expect(response.status(), `GET ${card.href}（maxRedirects:0）`).toBe(200);
    }

    const internal = await page
        .locator(`${CULTURE.shell} a[href^="/"]`)
        .evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute("href") ?? ""))]);

    for (const href of internal) {
        if (href === "" || href === "#") continue;
        const response = await request.get(href, { maxRedirects: 0 });
        expect(response.status(), `页面内链接 GET ${href}（maxRedirects:0）`).toBe(200);
    }

    console.log(`[routes] ${cards.length} 个入口 + ${internal.length} 条站内链接全部 200`);
});

/* ───────────────────────── 8. 旧路由保留 ───────────────────────── */

test("旧路由保留：/bangumi/ /douban/ /music/ 200 且没有 301/302", async ({ page, request }) => {
    for (const route of LEGACY_ROUTES) {
        // maxRedirects:0：3xx 会原样返回状态码，所以 200 就证明「没有被 301 搬走」
        const head = await request.get(route, { maxRedirects: 0 });
        expect(head.status(), `GET ${route}（maxRedirects:0）`).toBe(200);

        const response = await page.goto(route, { waitUntil: "load" });
        expect(response?.status(), `GET ${route}`).toBe(200);
        expect(response?.request().redirectedFrom(), `${route} 不该有重定向`).toBeNull();
        expect(new URL(page.url()).pathname, `${route} 应该原地渲染`).toBe(route);
    }
    console.log(`[legacy] ${LEGACY_ROUTES.join(" ")} · 全部 200 · 0 重定向`);
});

/* ───────────────────────── 9. 导航 ───────────────────────── */

test("导航：文化入口存在、不溢出、可点击", async ({ page }) => {
    for (const width of [390, 1440] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/", { waitUntil: "load" });
        await page.locator("#nav-menu-btn").click();
        const nav = page.locator("#nav-dropdown");
        await expect(nav).toBeVisible();

        const link = nav.locator('a[href="/culture/"]');
        await expect(link, `${width}px: 导航缺文化入口`).toHaveCount(1);
        const box = await link.boundingBox();
        expect(box, `${width}px: 文化入口无布局盒`).not.toBeNull();
        const overflow = await nav.evaluate(
            (el) => el.getBoundingClientRect().right - document.documentElement.clientWidth,
        );
        expect(overflow, `${width}px: 导航面板越界`).toBeLessThanOrEqual(1);

        await link.click();
        await page.waitForURL("**/culture/");
        await expect(page.locator(CULTURE.shell)).toHaveCount(1);
        console.log(`[nav] ${width}px: 文化入口可点击 → ${page.url()}`);
    }
});

/* ───────────────────────── 10. 条件渲染（真实构建） ───────────────────────── */

test("条件渲染：真实构建 PUBLIC_CULTURE_OMIT=music → 音乐入口不渲染，其余不受影响", async ({
    page,
    browser,
}) => {
    test.setTimeout(900_000);
    const astroBin = path.join(ROOT, "node_modules/.bin/astro");
    if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

    // 构建前：三个入口都在。截图留作「条件渲染前」的证据。
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPage(page, CULTURE.url, "light");
    await expect(page.locator(CULTURE.card)).toHaveCount(3);
    await page.screenshot({
        path: path.join(EVIDENCE_DIR, "culture-conditional-before-1440.png"),
        fullPage: true,
    });

    try {
        execFileSync(astroBin, ["build"], {
            cwd: ROOT,
            env: { ...process.env, PUBLIC_CULTURE_OMIT: "music" },
            stdio: "pipe",
        });

        // 产物层：卡片链接必须 0 次；导航里的 /music/ 是全局导航，不在本卡范围内
        const html = readFileSync(path.join(ROOT, "dist/culture/index.html"), "utf8");
        const cardLinks = html.match(/data-culture-link="music"/g) ?? [];
        const hrefOccurrences = html.match(/href="\/music\/"/g) ?? [];
        expect(cardLinks.length, "dist 里不该再有音乐入口卡").toBe(0);
        expect(hrefOccurrences.length, "产物里只剩全局导航那一条 /music/").toBe(1);
        console.log(
            `[conditional] dist/culture/index.html: data-culture-link="music" 0 次；href="/music/" ${hrefOccurrences.length} 次（全局导航）`,
        );

        // 页面层：新上下文（禁用 service worker），避免读到上一次构建的缓存
        const context = await browser.newContext({ serviceWorkers: "block" });
        const fresh = await context.newPage();
        try {
            await fresh.setViewportSize({ width: 1440, height: 900 });
            const response = await fresh.goto(CULTURE.url, { waitUntil: "load" });
            expect(response?.status(), "缺实体时路由也必须 200").toBe(200);

            await expect(fresh.locator(CULTURE.card)).toHaveCount(2);
            await expect(fresh.locator(`${CULTURE.card}[data-culture-entry="music"]`)).toHaveCount(
                0,
            );
            await expect(fresh.locator(`${CULTURE.grid} a[href="/music/"]`)).toHaveCount(0);
            await expect(fresh.locator(`${CULTURE.card}[data-culture-entry="douban"]`)).toHaveCount(
                1,
            );

            const root = await readRoot(fresh);
            expect(root.status).toBe("ok");
            expect(root.entries).toBe(2);
            expect(root.raw, "少一张卡，原始数也要跟着少").toBe(41);
            expect(root.unique, "只剩两卡时没有可比的同源").toBe(41);
            expect(root.overlap).toBe(0);
            expect(root.hidden, "被剔除的来源要写在页面属性上").toContain("music");

            // 顺序说明也不许点在场的来源：缺音乐时只能写「番剧 → 豆瓣」
            const visibleCards = await readCards(fresh);
            const listMeta = (
                await fresh.locator(".section-head__meta").first().innerText()
            ).trim();
            for (const card of visibleCards) expect(listMeta).toContain(card.title);
            expect(listMeta, "音乐入口不渲染，顺序说明里也不该出现歌单").not.toContain("歌单");

            await fresh.evaluate(() => {
                document.documentElement.setAttribute("data-theme", "light");
            });
            await fresh.waitForTimeout(420);
            await fresh.screenshot({
                path: path.join(EVIDENCE_DIR, "culture-conditional-after-1440.png"),
                fullPage: true,
            });

            console.log(
                `[conditional] 页面：2 张卡 · raw ${root.raw} · unique ${root.unique} · overlap ${root.overlap} · 音乐入口 0`,
            );
        } finally {
            await context.close();
        }
    } finally {
        // 恢复常规构建：后续用例与 perf / visual 门禁必须看到完整页面
        execFileSync(astroBin, ["build"], { cwd: ROOT, env: process.env, stdio: "pipe" });
    }
});

/* ───────────────────────── 11. 证据截图 ───────────────────────── */

test("证据截图：culture light/dark 1440 + light 390", async ({ page }) => {
    if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
    const shots = [
        { theme: "light" as Theme, width: 1440, name: "culture-light-1440.png" },
        { theme: "dark" as Theme, width: 1440, name: "culture-dark-1440.png" },
        { theme: "light" as Theme, width: 390, name: "culture-light-390.png" },
    ];
    for (const shot of shots) {
        await page.setViewportSize({ width: shot.width, height: 900 });
        await openPage(page, CULTURE.url, shot.theme);
        await page.screenshot({ path: path.join(EVIDENCE_DIR, shot.name), fullPage: true });
    }
    console.log(`[evidence] ${shots.length} 张截图 → ${EVIDENCE_DIR}`);
});

/* ═════════════ 12. M8-6-2 文化页重做（四段轨 / 豆瓣入账热力图 / 移动四段） ═════════════
 *
 * 本段是 M8-6-2 的专项判据（acceptance-standard §2.2 P2-06 + §3.4 M-01…M-16 中
 * 本页新增的部分）。上面 1–11 段是 M2-9 遗留的入口卡契约，改版后仍然成立
 * （`article.entities.entities--culture` + 3 张 `.culture-card` 是 P2-01…P2-05）。
 */

/** 四段轨的固定顺序：番剧 → 书架 → 电影 → 音乐。顺序变了是产品变更，不是随机。 */
const RAIL_ORDER = ["anime", "bookshelf", "cinema", "music"] as const;

/**
 * 热力图期望值：直接数 `douban.json` 的 `date`（口径就是这一句）。
 * 用 Node 侧真值对账，而不是在页面里再算一遍 —— 页面算错时这里必须红。
 */
const DOUBAN_ITEMS = JSON.parse(
    readFileSync(path.join(ROOT, "src/data/douban.json"), "utf8"),
) as Array<{ date?: string }>;
const DOUBAN_DAY_COUNTS = DOUBAN_ITEMS.reduce<Record<string, number>>((acc, item) => {
    const day = (item.date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return acc;
    acc[day] = (acc[day] ?? 0) + 1;
    return acc;
}, {});
const HEAT_DAYS = Object.keys(DOUBAN_DAY_COUNTS).length;
const HEAT_TOTAL = Object.values(DOUBAN_DAY_COUNTS).reduce((sum, count) => sum + count, 0);

test("M8-6-2 四段轨：anime/bookshelf/cinema/music 四段在场、每段有可访问标题、无空轨", async ({
    page,
}) => {
    await page.goto(CULTURE.url, { waitUntil: "load" });

    const rails = page.locator(`section.culture-rail[data-culture-rail]`);
    await expect(rails).toHaveCount(RAIL_ORDER.length);

    const ids = await rails.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-culture-rail") ?? ""),
    );
    expect(ids, "四段顺序固定：番剧 → 书架 → 电影 → 音乐").toEqual([...RAIL_ORDER]);

    for (const id of RAIL_ORDER) {
        const rail = page.locator(`section.culture-rail[data-culture-rail="${id}"]`);
        // 标题可访问：section 的 aria-labelledby 指向真实存在的标题，且文本非空
        const labelledBy = await rail.getAttribute("aria-labelledby");
        expect(labelledBy, `${id}: section 缺 aria-labelledby`).toBeTruthy();
        const heading = rail.locator(`#${labelledBy}`);
        await expect(heading, `${id}: 标题节点不存在`).toHaveCount(1);
        expect((await heading.innerText()).trim().length, `${id}: 标题为空`).toBeGreaterThan(0);

        // 无空轨：每段至少 1 张真实条目卡，且每张卡有外链
        const cells = rail.locator(".culture-media__cell");
        const cellCount = await cells.count();
        expect(cellCount, `${id}: 空轨（0 张卡）不该渲染`).toBeGreaterThan(0);
        expect(await rail.locator(".culture-media__link").count(), `${id}: 卡内无链接`).toBe(
            cellCount,
        );
    }

    // 条目卡不许编造观看进度：bangumi `ep_status` 全库为 0
    expect(await page.locator(".culture-media__cell progress").count()).toBe(0);
});

test("M8-6-2 热力图口径：只吃 douban.json 的 date，标题写「豆瓣入账日期」，计数与数据文件对账", async ({
    page,
}) => {
    await page.goto(CULTURE.url, { waitUntil: "load" });

    const heatmap = page.locator(".culture-heatmap");
    await expect(heatmap, "豆瓣入账热力图必须渲染").toHaveCount(1);

    const title = (await heatmap.locator(".culture-heatmap__title").innerText()).trim();
    expect(title, "标题必须写「豆瓣入账日期」口径").toContain("豆瓣入账日期");

    // 口径写死：天数 / 总数必须等于 douban.json 的 date 聚合结果
    expect(Number(await heatmap.getAttribute("data-culture-heatmap-days"))).toBe(HEAT_DAYS);
    expect(Number(await heatmap.getAttribute("data-culture-heatmap-total"))).toBe(HEAT_TOTAL);
    expect(
        Number(await heatmap.getAttribute("data-culture-heatmap")),
        "年份取豆瓣记录里最新的一条",
    ).toBe(Number(Object.keys(DOUBAN_DAY_COUNTS).sort().at(-1)!.slice(0, 4)));

    // 7 行 × N 列的整周对齐：格子数必须是 7 的倍数
    const cells = await heatmap.locator(".culture-heatmap__cell").count();
    expect(cells % 7, `格子数 ${cells} 不是 7 的倍数`).toBe(0);

    // 脚注必须自报口径（不许静默换数据源）：说明「只用 douban.json 的 date」，
    // 并明确写出不用 bangumi 抓取快照 —— 这段排除说明本身是口径的一部分。
    const footnote = (await heatmap.locator(".culture-heatmap__footnote").innerText()).trim();
    expect(footnote).toContain("douban.json");
    expect(footnote).toContain("date");
    expect(footnote, "脚注要说明为什么不用 bangumi 抓取时间").toContain("updated_at");

    // 色阶 0–4 全在（图例 5 个），且没有任何格子在 aria 树里冒充文本
    expect(await heatmap.locator(".culture-heatmap__swatch").count()).toBe(5);
    expect(await heatmap.locator('.culture-heatmap__grid [aria-hidden="true"]').count()).toBe(
        cells,
    );

    console.log(`[heatmap] ${HEAT_DAYS} 个入账日 / ${HEAT_TOTAL} 条 · ${cells} 格 · 「${title}」`);
});

test("M8-6-2 结构：无 error 态、culture-note 两个数都报、卡顶边 1px + hover shadow-3", async ({
    page,
}) => {
    await page.goto(CULTURE.url, { waitUntil: "load" });

    // 本页产品判据：只有 ok / empty，没有 error 分支（缺实体=整卡不渲染）
    const root = page.locator(CULTURE.shell);
    expect(["ok", "empty"]).toContain(await root.getAttribute("data-culture-status"));
    expect(await page.locator("[data-culture-error]").count()).toBe(0);
    expect(await page.locator('[data-culture-empty="error"]').count()).toBe(0);

    // 豆瓣/歌单同源去重：原始 / 去重后两个数都在 Hero 的计数条里（不是只报好看的那个）
    const meta = await readRoot(page);
    const heroText = (await page.locator(`${CULTURE.shell} .page-hero`).innerText()).trim();
    expect(heroText, "Hero 必须报去重后条数").toContain(String(meta.unique));
    expect(heroText, "Hero 必须报「去重后」口径").toContain("去重");
    if (meta.overlap > 0) {
        expect(heroText, "Hero 必须报原始条数").toContain(String(meta.raw));
        expect(heroText, "Hero 必须报「原始」口径").toContain("原始");
    }
    // 口径说明本身要留在页面上（不是只在数据属性里）
    const note = (await page.locator(".culture-note").first().innerText()).trim();
    expect(note.length, "culture-note 口径说明被删了").toBeGreaterThan(20);

    // 顶边：2px → 1px border-subtle（M8-6-2 视觉偏差修正）
    const edge = await page.locator(".culture-card").first().evaluate((node) => {
        const style = getComputedStyle(node);
        return {
            width: style.borderBlockStartWidth || style.borderTopWidth,
            color: style.borderBlockStartColor || style.borderTopColor,
            radius: style.borderRadius,
        };
    });
    expect(edge.width, "卡顶边必须是 1px").toBe("1px");
    expect(edge.radius, "卡有圆角时顶边不该是硬线").toBeTruthy();

    // hover 走 Card atom 的 shadow-3（CSSOM 里必须有这条规则，不能只写在注释里）
    const hoverShadows = await page.evaluate(() => {
        const found: string[] = [];
        const walk = (rules: CSSRuleList) => {
            for (const rule of [...rules]) {
                if (rule instanceof CSSMediaRule) walk(rule.cssRules);
                else if (rule instanceof CSSStyleRule) {
                    const text = rule.cssText;
                    if (text.includes(":hover") && text.includes("culture-card")) {
                        found.push(rule.style.boxShadow || "");
                    }
                }
            }
        };
        for (const sheet of [...document.styleSheets]) walk(sheet.cssRules);
        return found;
    });
    expect(hoverShadows.length, "culture-card:hover 规则不存在").toBeGreaterThan(0);
    expect(
        hoverShadows.some((shadow) => shadow.length > 0),
        "hover 必须带 box-shadow（shadow-3）",
    ).toBe(true);
});

test("M8-6-2 移动四段（375/390）：snap 生效、Tab 可达、高度不跳、不裁半张卡、0 横向溢出", async ({
    page,
}) => {
    for (const width of [375, 390] as const) {
        await page.setViewportSize({ width, height: 812 });
        await page.goto(CULTURE.url, { waitUntil: "load" });

        // M-02：375 也要进 overflow 门禁（上面 4 段只跑 390/768/1440）
        const doc = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
        }));
        expect(doc.scrollWidth, `culture@${width}: 横向溢出`).toBeLessThanOrEqual(
            doc.clientWidth + 1,
        );

        // 首屏有效（M-03）：h1 在首屏内
        const h1 = await page.locator("#culture-title").boundingBox();
        expect(h1, `culture@${width}: h1 不可见`).not.toBeNull();
        expect(h1!.y).toBeLessThan(812);

        const railsHeight = await page
            .locator(".culture-rails")
            .evaluate((node) => Math.round(node.getBoundingClientRect().height));

        for (const id of RAIL_ORDER) {
            const track = page.locator(`[data-culture-rail-track="${id}"]`);
            const snap = await track.evaluate((node) => getComputedStyle(node).scrollSnapType);
            expect(snap, `${id}@${width}: scroll-snap-type 未生效`).toContain("x");

            const geom = await track.evaluate((node) => {
                const box = node.getBoundingClientRect();
                const cells = [...node.querySelectorAll(".culture-media__cell")].map((cell) =>
                    cell.getBoundingClientRect(),
                );
                return {
                    clientWidth: node.clientWidth,
                    scrollWidth: node.scrollWidth,
                    boxWidth: Math.round(box.width),
                    widestCell: Math.round(Math.max(...cells.map((cell) => cell.width))),
                    cellCount: cells.length,
                };
            });

            // 不裁半张卡：单卡宽度不超过轨道可视宽（否则一屏永远看到半张）
            expect(
                geom.widestCell,
                `${id}@${width}: 卡宽 ${geom.widestCell} > 轨道 ${geom.clientWidth}`,
            ).toBeLessThanOrEqual(geom.clientWidth + 1);

            // 滑到终点时最后一张卡必须整张可见（不是被裁掉的半张）
            const tail = await track.evaluate((node) => {
                node.scrollLeft = node.scrollWidth;
                const box = node.getBoundingClientRect();
                const cells = [...node.querySelectorAll(".culture-media__cell")];
                const last = cells[cells.length - 1].getBoundingClientRect();
                return { overhang: Math.round(last.right - box.right), scrollLeft: node.scrollLeft };
            });
            expect(
                tail.overhang,
                `${id}@${width}: 终点裁掉最后一张卡 ${tail.overhang}px`,
            ).toBeLessThanOrEqual(1);
            expect(tail.scrollLeft, `${id}@${width}: 轨道不能横向滚动（数据量不足？）`).toBeGreaterThanOrEqual(0);

            // 触控滑动不与纵向滚动打架：轨道只吃 x（css scroll-snap-type 已断言）
            const overscroll = await track.evaluate(
                (node) => getComputedStyle(node).overscrollBehaviorX,
            );
            expect(overscroll, `${id}@${width}: 缺 overscroll-behavior-x`).toBe("contain");
        }

        // 高度不跳：横向滑动所有轨道后，容器高度必须一致
        for (const id of RAIL_ORDER) {
            await page
                .locator(`[data-culture-rail-track="${id}"]`)
                .evaluate((node) => {
                    node.scrollLeft = node.scrollWidth;
                });
        }
        const afterHeight = await page
            .locator(".culture-rails")
            .evaluate((node) => Math.round(node.getBoundingClientRect().height));
        expect(afterHeight, `culture@${width}: 横滑后高度跳动`).toBe(railsHeight);

        // Tab 可达：从入口区末尾按 Tab 走，四段各自的卡片链接都能停到
        await page.locator(`${CULTURE.card} a`).last().focus();
        const reached = new Set<string>();
        for (let i = 0; i < 80; i += 1) {
            await page.keyboard.press("Tab");
            const hit = await page.evaluate(() => {
                const active = document.activeElement as HTMLElement | null;
                const rail = active?.closest("[data-culture-rail]");
                return rail?.getAttribute("data-culture-rail") ?? null;
            });
            if (hit) reached.add(hit);
            if (reached.size === RAIL_ORDER.length) break;
        }
        expect(
            [...reached].sort(),
            `culture@${width}: Tab 到不了这四段里的某些卡片`,
        ).toEqual([...RAIL_ORDER].sort());

        console.log(`[mobile] ${width}: 四段 snap/Tab/高度/裁切 全部成立`);
    }
});

test("M8-6-2 axe 375：light/dark 下 serious+critical=0、incomplete=0（M-13）", async ({
    page,
}) => {
    for (const theme of THEMES) {
        await page.setViewportSize({ width: 375, height: 812 });
        await openPage(page, CULTURE.url, theme);
        await page.addStyleTag({
            content: `${CULTURE.shell} * { transition: none !important; }`,
        });
        const { violations, incomplete } = await runAxe(page, CULTURE.shell);
        const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(
            serious.map((v) => `${v.id} (${v.impact}) ${v.nodes[0]?.target ?? ""}`),
            `culture@375 ${theme}: serious/critical`,
        ).toEqual([]);
        expect(
            incomplete.map((v) => `${v.id} ${v.nodes[0]?.target ?? ""}`),
            `culture@375 ${theme}: incomplete`,
        ).toEqual([]);
        console.log(
            `[axe375] ${theme}: violations=${violations.length} incomplete=${incomplete.length}`,
        );
    }
});

test("M8-6-2 证据：1440 light/dark、390/375 light、四段起终截图", async ({ page }) => {
    const dir = path.resolve(ROOT, "docs/_reviews/M8-6/M8-6-2");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    for (const shot of [
        { theme: "light" as Theme, width: 1440, name: "culture-light-1440.png" },
        { theme: "dark" as Theme, width: 1440, name: "culture-dark-1440.png" },
        { theme: "light" as Theme, width: 390, name: "culture-light-390.png" },
        { theme: "light" as Theme, width: 375, name: "culture-light-375.png" },
    ]) {
        await page.setViewportSize({ width: shot.width, height: 900 });
        await openPage(page, CULTURE.url, shot.theme);
        await page.screenshot({ path: path.join(dir, shot.name), fullPage: true });
    }

    // 四段轨起点/终点：每段一张 start + 一张 end（375 下看得到 snap 的两头）
    await page.setViewportSize({ width: 375, height: 812 });
    await openPage(page, CULTURE.url, "light");
    for (const id of RAIL_ORDER) {
        const track = page.locator(`[data-culture-rail-track="${id}"]`);
        await track.evaluate((node) => {
            node.scrollLeft = 0;
        });
        await track.screenshot({ path: path.join(dir, `rail-${id}-375-start.png`) });
        await track.evaluate((node) => {
            node.scrollLeft = node.scrollWidth;
        });
        await page.waitForTimeout(120);
        await track.screenshot({ path: path.join(dir, `rail-${id}-375-end.png`) });
    }

    console.log(`[evidence] 4 张页级 + 8 张四段起终 → ${dir}`);
});
