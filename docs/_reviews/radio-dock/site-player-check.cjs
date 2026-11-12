const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

/**
 * M8-4 SitePlayer 站级验收（真跑，不做 mock）。
 *
 * 覆盖：
 *  A 未 arm 的访客：全站 0 个 .site-player、0 条 media 请求（spec §2.2 S0）
 *  B /radio/ 页点播放 → 展开态 + 真音频 readyState
 *  C swup 换页后不断播（currentTime 单调增、节点身份不变）
 *  D 关闭 = 停播 + 断源 + 卸载（spec §1.4 第 4 条）
 *  E 375 移动端：不与 BottomTabs 相交
 *  F 回到顶部不被遮挡（spec §3.3 V1）
 */
const BASE = "http://127.0.0.1:4321";
const OUT = path.resolve(__dirname, "shots");

const log = (label, value) => console.log(`${label}: ${JSON.stringify(value)}`);

async function mediaRequests(page, sink) {
    page.on("request", (request) => {
        if (request.resourceType() === "media") sink.push(request.url());
    });
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();

    /* ── A：未 arm 访客 ───────────────────────────────────── */
    {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        const media = [];
        await mediaRequests(page, media);
        await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
        const count = await page.locator(".site-player").count();
        const chunk = await page.evaluate(() =>
            performance
                .getEntriesByType("resource")
                .some((entry) => entry.name.includes("site-player")),
        );
        log("A.cold-visit.playerNodes", count);
        log("A.cold-visit.playerChunkLoaded", chunk);
        log("A.cold-visit.mediaRequests", media.length);
        await context.close();
    }

    /* ── B/C/D：/radio/ 播放 → 换页不断播 → 关闭 ───────────── */
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const media = [];
    await mediaRequests(page, media);

    await page.goto(`${BASE}/radio/`, { waitUntil: "networkidle" });
    log("B.mountOnRadioPage", await page.locator(".site-player").count());
    await page.click("[data-radio-open]");
    await page.waitForTimeout(3500);
    const playing = await page.evaluate(() => {
        const root = document.querySelector(".site-player");
        const audio = root?.querySelector("audio");
        return {
            state: root?.getAttribute("data-state"),
            playing: root?.getAttribute("data-playing"),
            title: root?.querySelector("[data-player-title]")?.textContent,
            playName: root?.querySelector("[data-player-play]")?.getAttribute("aria-label"),
            hasAriaPressedOnPlay: root
                ?.querySelector("[data-player-play]")
                ?.hasAttribute("aria-pressed"),
            readyState: audio?.readyState,
            paused: audio?.paused,
            currentTime: audio?.currentTime,
            armed: localStorage.getItem("dogeared-radio-armed"),
        };
    });
    log("B.afterPlay", playing);
    await page.screenshot({ path: `${OUT}/site-player-1440-expanded.png` });

    const before = await page.evaluate(() => {
        const audio = document.querySelector(".site-player audio");
        return {
            t: audio?.currentTime ?? 0,
            node: window.__sitePlayer?.root?.isConnected ?? false,
        };
    });

    // swup 换页：走站点的全局实例（与用户点导航同一条链路，不刷新页面）
    await page.evaluate(async () => {
        const swup = window.swup;
        if (swup) await swup.navigate("/archives/");
        else location.href = "/archives/";
    });
    await page.waitForTimeout(3500);
    const after = await page.evaluate(() => {
        const root = document.querySelector(".site-player");
        const audio = root?.querySelector("audio");
        return {
            url: location.pathname,
            nodes: document.querySelectorAll(".site-player").length,
            state: root?.getAttribute("data-state"),
            playing: root?.getAttribute("data-playing"),
            paused: audio?.paused,
            currentTime: audio?.currentTime,
            sameNode:
                (window.__sitePlayer?.root?.isConnected ?? false) &&
                root === window.__sitePlayer?.root,
        };
    });
    log("C.beforeNavigate", before);
    log("C.afterNavigate", after);
    await page.screenshot({ path: `${OUT}/site-player-after-swup.png` });

    await page.click("[data-player-close]");
    await page.waitForTimeout(600);
    log(
        "D.afterClose",
        await page.evaluate(() => ({
            nodes: document.querySelectorAll(".site-player").length,
            armed: localStorage.getItem("dogeared-radio-armed"),
        })),
    );
    log("D.mediaRequests", media);

    /* ── F：回到顶部避让 ─────────────────────────────────── */
    {
        const p2 = await context.newPage();
        // 先 arm（D 步骤把标记清掉了），再 swup 换到文章页量避让
        await p2.goto(`${BASE}/radio/`, { waitUntil: "domcontentloaded" });
        await p2.waitForTimeout(1200);
        await p2.click("[data-radio-open]");
        await p2.waitForTimeout(2000);
        await p2.evaluate(async () => {
            const swup = window.swup;
            if (swup) await swup.navigate("/article/beszel-server-monitoring-guide/");
            else location.href = "/article/beszel-server-monitoring-guide/";
        });
        await p2.waitForTimeout(2500);
        await p2.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await p2.waitForTimeout(600);
        const rects = await p2.evaluate(() => {
            const player = document.querySelector(".site-player")?.getBoundingClientRect();
            const top = document.getElementById("back-to-top")?.getBoundingClientRect();
            const overlap =
                player && top
                    ? !(
                          top.right < player.left ||
                          top.left > player.right ||
                          top.bottom < player.top ||
                          top.top > player.bottom
                      )
                    : null;
            return {
                player: player && {
                    top: player.top,
                    bottom: player.bottom,
                    left: player.left,
                    right: player.right,
                },
                backToTop: top && {
                    top: top.top,
                    bottom: top.bottom,
                    left: top.left,
                    right: top.right,
                },
                overlap,
            };
        });
        log("F.backToTopOverlap", rects);
        await p2.close();
    }

    await context.close();

    /* ── E：375 移动端避让 ───────────────────────────────── */
    {
        const mobile = await browser.newContext({ viewport: { width: 375, height: 812 } });
        const mp = await mobile.newPage();
        await mp.goto(`${BASE}/radio/`, { waitUntil: "domcontentloaded" });
        await mp.waitForTimeout(1500);
        await mp.click("[data-radio-open]");
        await mp.waitForTimeout(2500);
        const layout = await mp.evaluate(() => {
            const player = document.querySelector(".site-player")?.getBoundingClientRect();
            const tabs = document.querySelector(".bottom-tabs")?.getBoundingClientRect();
            return {
                player: player && {
                    top: player.top,
                    bottom: player.bottom,
                    left: player.left,
                    right: player.right,
                },
                tabs: tabs && { top: tabs.top, bottom: tabs.bottom },
                gap: player && tabs ? tabs.top - player.bottom : null,
                overflowX:
                    document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
        });
        log("E.mobile375", layout);
        await mp.screenshot({ path: `${OUT}/site-player-375-expanded.png` });
        await mobile.close();
    }

    await browser.close();
})();
