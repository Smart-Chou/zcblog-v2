/**
 * M8-6-6 证据采集（一次性脚本，不进构建）
 *
 * 产出（docs/_reviews/M8-6/M8-6-6/evidence/）：
 *  - 4 路由 × light/dark = 8 张 375×812（§2.6 证据要求）
 *  - 390×844 溢出日志（4 路由 × 2 主题，越界元素清单 + scrollWidth/clientWidth）
 *  - 375 双主题 axe（serious/critical/incomplete 计数）
 *  - 交互截图：TOC 开 / 关、灯箱开、四段横滑起 / 终
 *  - 底栏量测：4 入口命中区尺寸 + 相邻间距 + aria-current + body 底部留白
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:4321";
const OUT = path.resolve("docs/_reviews/M8-6/M8-6-6/evidence");
mkdirSync(OUT, { recursive: true });

const ROUTES = [
    ["home", "/"],
    ["article", "/article/beszel-server-monitoring-guide/"],
    ["albums", "/albums/"],
    ["culture", "/culture/"],
];
const THEMES = ["light", "dark"];
const AXE = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

const settle = async (page) => {
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
};

const setTheme = async (page, theme) => {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await settle(page);
};

const browser = await chromium.launch();
const log = [];

for (const [name, url] of ROUTES) {
    for (const theme of THEMES) {
        const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
        await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
        await setTheme(page, theme);
        await page.screenshot({ path: path.join(OUT, `${name}-375-${theme}.png`) });

        // axe 375 双主题（M-13）
        await page.addScriptTag({ content: AXE });
        const axe = await page.evaluate(async () => {
            const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
            const count = (impact) => r.violations.filter((v) => v.impact === impact).length;
            return {
                serious: count("serious"),
                critical: count("critical"),
                incomplete: r.incomplete.length,
                violations: r.violations.map((v) => `${v.impact}:${v.id}`),
            };
        });
        log.push({ route: name, theme, axe });
        await page.close();
    }

    // 390×844 溢出日志
    for (const theme of THEMES) {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
        await setTheme(page, theme);
        const overflow = await page.evaluate(() => {
            const de = document.documentElement;
            const out = [];
            for (const el of document.querySelectorAll("body *")) {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) continue;
                const cs = getComputedStyle(el);
                if (cs.position === "fixed" && r.right <= de.clientWidth + 1) continue;
                if (r.right > de.clientWidth + 1 || r.left < -1) {
                    out.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]} L${Math.round(r.left)} R${Math.round(r.right)}`);
                }
            }
            return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, offenders: out.slice(0, 15) };
        });
        log.push({ route: name, theme, overflow390: overflow });
        await page.close();
    }
}

/* ── 底栏量测（375 / 640 / 768） ─────────────────────────── */
for (const width of [375, 640, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 812 } });
    await page.goto(BASE + "/talks/", { waitUntil: "domcontentloaded" });
    await settle(page);
    const m = await page.evaluate(() => {
        const nav = document.querySelector(".bottom-tabs");
        const links = [...document.querySelectorAll(".bottom-tabs__link")];
        const rects = links.map((l) => l.getBoundingClientRect());
        const gaps = rects.slice(1).map((r, i) => Math.round(r.left - rects[i].right));
        return {
            display: nav ? getComputedStyle(nav).display : "absent",
            count: links.length,
            box: rects.map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`),
            minGap: gaps.length ? Math.min(...gaps) : null,
            current: links.filter((l) => l.getAttribute("aria-current") === "page").map((l) => l.getAttribute("data-tab")),
            bodyPadBottom: getComputedStyle(document.body).paddingBlockEnd,
            navPadBottom: nav ? getComputedStyle(nav).paddingBlockEnd : null,
        };
    });
    log.push({ bottomTabs: width, ...m });
    await page.close();
}

/* ── 交互截图 ─────────────────────────────────────────────── */
const shot = async (file, fn) => {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await fn(page);
    await page.screenshot({ path: path.join(OUT, file) });
    const info = await page.evaluate(() => ({
        open: (() => {
            const d = document.querySelector(".post-toc-drawer");
            return d ? d.matches(":popover-open") : null;
        })(),
        backdrop: (() => {
            const d = document.querySelector(".post-toc-drawer");
            if (!d) return null;
            return getComputedStyle(d, "::backdrop").backgroundColor;
        })(),
        active: document.activeElement ? document.activeElement.outerHTML.slice(0, 120) : null,
        scrollLock: document.body.style.overflow || getComputedStyle(document.body).overflow,
    }));
    log.push({ interaction: file, ...info });
    await page.close();
};

await shot("toc-open-375.png", async (page) => {
    await page.goto(BASE + "/article/beszel-server-monitoring-guide/", { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.click('button[popovertarget="post-toc-drawer"]');
    await settle(page);
});

await shot("toc-closed-375.png", async (page) => {
    await page.goto(BASE + "/article/beszel-server-monitoring-guide/", { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.keyboard.press("Escape");
});

await shot("albums-lightbox-375.png", async (page) => {
    await page.goto(BASE + "/albums/shenzhen_feng-huang-shan/", { waitUntil: "domcontentloaded" });
    await settle(page);
    const link = page.locator("#fancybox-gallery a").first();
    await link.click();
    await page.waitForFunction(
        () => {
            const img = document.querySelector(".fancybox__slide.is-selected img, .fancybox__image");
            return Boolean(img && img.complete && img.naturalWidth > 0);
        },
        undefined,
        { timeout: 8000 },
    ).catch(() => {});
    await page.waitForTimeout(400);
});

for (const [tag, side] of [["start", "start"], ["end", "end"]]) {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.goto(BASE + "/culture/", { waitUntil: "domcontentloaded" });
    await settle(page);
    const railInfo = await page.evaluate((where) => {
        const rails = [...document.querySelectorAll("[data-culture-rail-track]")].filter(
            (el) => el.scrollWidth > el.clientWidth + 1,
        );
        const rail = rails[0];
        if (!rail) return null;
        rail.scrollLeft = where === "end" ? rail.scrollWidth : 0;
        return {
            selector: rail.getAttribute("data-culture-rail-track"),
            scrollLeft: rail.scrollLeft,
            max: rail.scrollWidth - rail.clientWidth,
        };
    }, side);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `culture-rail-${tag}-375.png`) });
    log.push({ interaction: `culture-rail-${tag}`, railInfo });
    await page.close();
}

await browser.close();
writeFileSync(path.join(OUT, "measurements.json"), JSON.stringify(log, null, 2));
console.log(JSON.stringify(log.filter((l) => l.axe || l.overflow390 || l.bottomTabs), null, 2));
