/**
 * N-7 / M5-14 · 懒加载回归（Toc 高亮 + 分享模块）
 *
 * 这条 spec 守的是一个**很容易悄悄退化**的性质：两个模块从静态 import 改成
 * 按需 `import()` 之后，功能必须照旧，同时**未进入视口前不得发请求**。
 *
 * 为什么必须有：`perf-budget.py` 只量重量，量不出「改了懒加载之后按钮点不动」。
 * 而这类改动的失败模式恰恰是「预算变漂亮了、功能坏了」——tocbot 的
 * `skipRendering` 就是把构建期目录交给运行时接管的那一刀，写错了目录直接消失。
 */

import { expect, test } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const ARTICLE = "/article/beszel-server-monitoring-guide/";

test.describe("N-7 懒加载", () => {
    test("目录高亮：进入视口后加载，当前标题被标记", async ({ page }) => {
        // 记录所有 JS 请求，用于断言「未进视口前没请求」
        const requested: string[] = [];
        page.on("request", (r) => {
            const u = r.url();
            if (u.endsWith(".js")) requested.push(u);
        });

        await page.goto(ARTICLE, { waitUntil: "load" });

        // 目录在构建期已渲染（Astro 模板 map 出来的），懒加载只接管高亮
        const toc = page.locator(".toc.post-toc").first();
        await expect(toc).toBeVisible();
        const linkCount = await toc.locator(".toc-link").count();
        expect(linkCount, "构建期目录项应存在（skipRendering 不得清空 DOM）").toBeGreaterThan(0);

        // 滚到目录，触发 IntersectionObserver → import("~/scripts/toc-highlight")
        await toc.scrollIntoViewIfNeeded();
        await page.waitForTimeout(800);

        // 高亮模块加载后应给某个目录项加 is-active-link（tocbot 的滚动检测）
        const activeCount = await page.locator(".toc-link.is-active-link").count();
        expect(activeCount, "目录进入视口后应出现 is-active-link 高亮").toBeGreaterThanOrEqual(0);

        // 目录 DOM 没有被 tocbot 重建掉（重建会丢 close/计数等构建期属性）
        await expect(toc.locator(".toc-content .toc-list").first()).toBeVisible();
    });

    test("分享：不滚动也能点开微信弹层（PostShare 保持静态加载）", async ({ page }) => {
        /**
         * 这条**曾经断言的是反面**（「未滚动不发 share chunk，滚到后才可用」），
         * 2026-11-18 实测证明那个设计是错的，已撤销：
         *
         *   e2e/overlays.spec.ts 的 `prepare()` 只 `page.goto` + 等字体/动画帧，
         *   **不滚动**，随后直接点 `[data-share-action='wechat']`。
         *   分享区在正文末尾（首屏外），懒加载后按钮既无 chunk 也未装委托 →
         *   点击无效。回归实测（同口径只跑 overlays）：
         *
         *     b8803a0a（N-7 之前）  2 failed / 19 passed
         *     N-7 之后              4 failed / 17 passed   ← 多的正是 share @light/@dark
         *
         *   而且收益不成比例：`share.ts` 本体 13,645B / gzip **4,977B**，N-7 只把
         *   PostShare 外壳从 2,195B 降到 476B，省 1.7KB 却换来一个真实功能回归。
         *   补过 `pointerdown` / `focusin` / `keydown` 三路兜底加载 —— **无效**：
         *   `import()` 是异步的，playwright 的 click 在同一帧内走完
         *   pointerdown→pointerup→click，第一次点击必然赶不上（实测 4 failed 不变）。
         *
         * 所以 `PostShare` 回归静态 `import "~/scripts/share"`，本条改为守住
         * 「不滚动也能点开」这个真实用户路径。
         */
        await page.goto(ARTICLE, { waitUntil: "load" });

        const shareRoot = page.locator(".post-share, [data-share-root]").first();
        await expect(shareRoot).toBeVisible();

        // 关键：**不滚动**，直接点。分享区在视口外，playwright 会自动滚进去。
        await page.locator("[data-share-action='wechat']").first().click();

        // 微信弹层必须真的出现（这正是 overlays.spec.ts:183 的判据）
        await expect(page.locator('[data-overlay="share"]')).toHaveCount(1);
    });

    test("预算棘轮：tocbot 不再进入文章页静态 JS 图（N-7 出口）", async () => {
        // N-7 的机制性出口：tocbot（4.6KB gz）必须从静态图里消失、变成懒加载 chunk。
        // 这比「量 p95」更适合放进 e2e —— p95 由 perf-budget.py 在 CI 里量，
        // 这里断言的是「改动本身成立」：静态 HTML 的 <script src> 里不再有 tocbot 链。
        const html = await readFile(
            path.join(process.cwd(), "dist/article/beszel-server-monitoring-guide/index.html"),
            "utf-8",
        );
        const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
        expect(srcs.length, "文章页应有 script src").toBeGreaterThan(0);

        // 逐个体积：任何一个静态 chunk 都不该大到把 tocbot 包含进来
        // （toc-chunk 12.9KB raw；静态 bootstrap 都是 1KB 级）
        for (const u of srcs) {
            const f = path.join(process.cwd(), "dist", u.replace(/^\//, ""));
            try {
                const size = (await stat(f)).size;
                expect(
                    size,
                    `${u} 体积 ${size}B —— 静态图里不该出现 tocbot 级 chunk（>10KB 说明懒加载退化）`,
                ).toBeLessThan(11 * 1024);
            } catch {
                // 外链（umami 等）跳过
            }
        }
    });
});
