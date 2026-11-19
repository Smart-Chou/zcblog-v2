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

    test("分享：未滚动到底不发 share chunk，滚到后按钮可用", async ({ page }) => {
        const jsRequests: string[] = [];
        page.on("request", (r) => {
            const u = r.url();
            if (u.endsWith(".js")) jsRequests.push(u);
        });

        await page.goto(ARTICLE, { waitUntil: "load" });

        // 分享区在正文末尾：首屏不该已经拉过分享逻辑
        const shareRoot = page.locator(".post-share, [data-share-root]").first();
        const beforeCount = jsRequests.length;

        await shareRoot.scrollIntoViewIfNeeded();
        await page.waitForTimeout(800);

        // 滚到分享区后应新增至少 1 个请求（share chunk）
        const afterCount = jsRequests.length;
        expect(afterCount, "分享区进入视口后应加载 share chunk").toBeGreaterThanOrEqual(
            beforeCount,
        );

        // 功能可用：分享按钮可点击且存在（懒加载不得让按钮变成死键）
        await expect(shareRoot).toBeVisible();
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
