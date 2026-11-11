const { chromium } = require("@playwright/test");
const fs = require("node:fs");

(async () => {
    const out = "docs/_reviews/radio-dock/shots";
    fs.mkdirSync(out, { recursive: true });
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const logs = [];
    page.on("console", (message) => logs.push(`console:${message.type()}:${message.text()}`));
    page.on("pageerror", (error) => logs.push(`pageerror:${error.message}`));

    await page.goto("http://127.0.0.1:4321/radio/", { waitUntil: "networkidle" });
    await page.screenshot({ path: `${out}/radio-1440-light.png`, fullPage: false });

    const mobilePage = await context.newPage();
    await mobilePage.setViewportSize({ width: 375, height: 812 });
    await mobilePage.goto("http://127.0.0.1:4321/radio/", { waitUntil: "networkidle" });
    await mobilePage.screenshot({ path: `${out}/radio-375-collapsed.png`, fullPage: false });
    const mobileCollapsed = await mobilePage.evaluate(() => {
        const dock = document.querySelector("[data-radio-dock]")?.getBoundingClientRect();
        const tabs = document.querySelector(".bottom-tabs")?.getBoundingClientRect();
        return {
            dock: dock && { top: dock.top, bottom: dock.bottom, left: dock.left, right: dock.right },
            tabs: tabs && { top: tabs.top, bottom: tabs.bottom },
            gap: dock && tabs ? tabs.top - dock.bottom : null,
            overflowX:
                document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
    });
    await mobilePage.close();

    await page.click("[data-radio-open]");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/radio-dock-expanded-1440.png`, fullPage: false });

    await page.click("[data-radio-play]");
    await page.waitForTimeout(3500);
    const first = await page.evaluate(() => {
        const audio = document.querySelector("[data-radio-audio]");
        const root = document.querySelector("[data-radio-dock]");
        return {
            rootState: root?.getAttribute("data-state"),
            playing: root?.getAttribute("data-playing"),
            status: document.querySelector("[data-radio-status]")?.textContent,
            src: audio?.currentSrc || audio?.src,
            readyState: audio?.readyState,
            paused: audio?.paused,
            currentTime: audio?.currentTime,
            error: audio?.error ? { code: audio.error.code, message: audio.error.message } : null,
        };
    });
    await page.screenshot({ path: `${out}/radio-dock-playing-1440.png`, fullPage: false });

    await page.click('[data-radio-station="nightride"]');
    await page.waitForTimeout(4500);
    const second = await page.evaluate(() => {
        const audio = document.querySelector("[data-radio-audio]");
        return {
            name: document.querySelector("[data-radio-name]")?.textContent,
            status: document.querySelector("[data-radio-status]")?.textContent,
            src: audio?.currentSrc || audio?.src,
            paused: audio?.paused,
        };
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/radio-dock-375.png`, fullPage: false });

    const mobile = await page.evaluate(() => {
        const dock = document.querySelector("[data-radio-dock]")?.getBoundingClientRect();
        const tabs = document.querySelector(".bottom-tabs")?.getBoundingClientRect();
        return {
            dock: dock && { top: dock.top, bottom: dock.bottom, left: dock.left, right: dock.right },
            tabs: tabs && { top: tabs.top, bottom: tabs.bottom },
            gap: dock && tabs ? tabs.top - dock.bottom : null,
            overflowX:
                document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
    });

    console.log(JSON.stringify({ first, second, mobileCollapsed, mobile, logs }, null, 2));
    await browser.close();
})();
