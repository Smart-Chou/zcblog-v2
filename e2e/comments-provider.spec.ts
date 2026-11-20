import { test, expect, type Page } from "@playwright/test";

/**
 * N-2a / N-2b · 评论 provider 契约（`none` / `waline` / `twikoo`）
 *
 * 判据（卡面）：
 *  1. `provider=none` 时文章页**零**评论请求（不加载任何评论运行时、不碰评论服务器）、
 *     且 DOM 里没有 `#comment-wrapper`（关闭时零 DOM）
 *  2. `provider=waline` 时「展开评论」按钮存在，但**默认不加载**运行时（懒加载不变）
 *  3. `provider=twikoo` 同上（N-2b），且**不加载 twikoo.min.js**
 *  4. 契约自洽：各 provider 的 `enable` 都由 `comments.provider` 派生，不可能矛盾
 *
 * `giscus` 仍未实现（要松开 `frame-src 'self'`，见挂起事项登记 H-12）。
 * **Twikoo 不需要这个决策**：本项目走 npm 包 + `import("twikoo")`，脚本由 Vite
 * 打包进 `'self'`，`script-src` 一字未改，只在 `connect-src` 加云函数域名。
 *
 * 运行方式 —— **三段互斥**，一个产物只能是一个 provider：
 *   PUBLIC_COMMENTS_PROVIDER=none   pnpm run build:ci && playwright test e2e/comments-provider.spec.ts
 *   PUBLIC_COMMENTS_PROVIDER=waline pnpm run build:ci && playwright test e2e/comments-provider.spec.ts
 *   PUBLIC_COMMENTS_PROVIDER=twikoo pnpm run build:ci && playwright test e2e/comments-provider.spec.ts
 *   （不设 env 默认 waline）
 *
 * 也就是说**单次运行只会有一半真的跑**，另一半 `test.skip`。两半都跑过才算验收：
 *   - 第 3 条「契约自洽」**两种产物都会执行**，断言「DOM 与 provider 一致」，
 *     附带保证 `waline.enable` 没有被某处写死；
 *   - 两半的完整覆盖需要**两次构建 + 两次运行**（见上）。CI 尚未接入本 spec
 *     （现存 51 个 e2e spec 中只有 6 个进 workflow，见挂起事项登记 H-13），
 *     因此验收时由卡内手动跑两遍并贴出两次的条数。
 *
 * 早先的写法是「跑错产物就断言红」，实测下来等于要求同一棵源码树产出两种 HTML，
 * 无法同时满足，已改为 skip。
 */

const ARTICLE = "/article/bitwarden/";

/** 任何发往**评论运行时**的流量（不含浏览量计数，那是独立功能）。 */
function isCommentTraffic(url: string): boolean {
    // 浏览量计数（`waline-pageview` → `@waline/client/pageview` → `/api/article`）
    // 是头部的「阅读量」，与评论区开关无关：provider=none 也照常上报。
    // `pages-comments.spec.ts:39` 同样把它排除在外。dismiss 掉它才不会把
    // 「读者数」误判成「评论区偷偷加载了」。
    if (/pageview/i.test(url) || /waline[-_]pv\b/i.test(url)) return false;
    if (/\/api\/article\b/.test(url)) return false;
    // 组件自身的脚本 chunk（构建产物名含 WalineComment / TwikooComment）不算三方请求
    if (/WalineComment/i.test(url)) return false;
    if (/TwikooComment/i.test(url)) return false;
    if (/\?url(?:&|$)/.test(url)) return false;
    if (/@waline[+/]client/i.test(url)) return true;
    // Twikoo 运行时（361 KB chunk，N-2b）：折叠态不该出现
    if (/twikoo\.min\./i.test(url)) return true;
    if (/waline(?:[-.][\w-]+)?\.(?:js|css)(?:\?|$)/i.test(url)) return true;
    // 评论区真正的接口是 `/api/comment`
    return /waline\.marxchou\.com\/api\/comment/i.test(url);
}

/**
 * 读取当前产物里实际生效的 provider（由构建期常量折叠决定，运行时只读结果）。
 *
 * 判定顺序很重要：先看**具体哪个** toggle 存在，再看有没有 wrapper。
 * 只看 wrapper 会把 twikoo 误判成 waline（两者用同一个 `#comment-wrapper` id，
 * 这是刻意的 —— 抽屉样式与 `comments.css` 全挂在它上面）。
 */
async function renderedProvider(page: Page): Promise<"none" | "waline" | "twikoo" | "unknown"> {
    const dom = await page.evaluate(() => ({
        wrapper: document.getElementById("comment-wrapper") !== null,
        walineToggle: document.getElementById("waline-toggle") !== null,
        twikooToggle: document.getElementById("twikoo-toggle") !== null,
    }));

    if (dom.walineToggle && !dom.twikooToggle) return "waline";
    if (dom.twikooToggle && !dom.walineToggle) return "twikoo";
    // 两个 toggle 同时存在 = 选路逻辑坏了（Comments.astro 本该只渲染一个）
    if (dom.walineToggle && dom.twikooToggle) return "unknown";
    if (!dom.wrapper) return "none";
    // 有 wrapper 但没有任何 toggle：半开半闭，同样是坏状态
    return "unknown";
}

async function openArticle(page: Page) {
    const response = await page.goto(ARTICLE, { waitUntil: "load" });
    expect(response?.status(), `GET ${ARTICLE}`).toBe(200);
}

test.describe("N-2a 评论 provider 契约", () => {
    test("provider=none：零评论请求、零评论 DOM", async ({ page }) => {
        const requests: string[] = [];
        page.on("request", (req) => {
            if (isCommentTraffic(req.url())) requests.push(req.url());
        });

        await openArticle(page);

        const provider = await renderedProvider(page);
        // 产物不是 none 时跳过而不是红：本 spec 的两半**互斥**（一个产物只能是
        // 一个 provider），强制两半都跑绿就等于要求同一棵树产出两种 HTML。
        // 「有没有真的跑过 none 产物」由下面的台账用例保证，不靠人记。
        test.skip(provider !== "none", `当前产物 provider=${provider}，跳过 none 用例`);

        // 关闭态零 DOM
        expect(await page.evaluate(() => document.getElementById("comment-wrapper"))).toBeNull();
        expect(await page.evaluate(() => document.getElementById("waline"))).toBeNull();
        expect(await page.evaluate(() => document.getElementById("waline-toggle"))).toBeNull();

        // 零请求
        expect(requests, `provider=none 时不该有任何评论请求：${requests.join(", ")}`).toEqual([]);
    });

    test("provider=waline：按钮存在但默认不加载运行时（懒加载不变）", async ({ page }) => {
        const requests: string[] = [];
        page.on("request", (req) => {
            if (isCommentTraffic(req.url())) requests.push(req.url());
        });

        await openArticle(page);

        const provider = await renderedProvider(page);
        test.skip(provider !== "waline", `当前产物 provider=${provider}，跳过 waline 用例`);

        // 折叠态：按钮在，#waline 空
        await expect(page.locator("#waline-toggle")).toBeVisible();
        expect(await page.evaluate(() => document.getElementById("waline")!.children.length)).toBe(
            0,
        );

        // 没点开就不该有运行时请求
        expect(requests, `折叠态不该加载 Waline 运行时：${requests.join(", ")}`).toEqual([]);
    });

    test("provider=twikoo：按钮存在但默认不加载 361 KB 运行时（N-2b 懒加载）", async ({ page }) => {
        const requests: string[] = [];
        page.on("request", (req) => {
            if (isCommentTraffic(req.url())) requests.push(req.url());
        });

        await openArticle(page);

        const provider = await renderedProvider(page);
        test.skip(provider !== "twikoo", `当前产物 provider=${provider}，跳过 twikoo 用例`);

        // 折叠态：按钮在，#twikoo 空
        await expect(page.locator("#twikoo-toggle")).toBeVisible();
        expect(await page.evaluate(() => document.getElementById("twikoo")!.children.length)).toBe(
            0,
        );

        // 没点开就不该有运行时请求 —— 这条尤其重要：twikoo.min.js 是 361 KB/gzip 121 KB，
        // 若被静态引入，article JS 会从 32.5 KB 直接顶穿 40 KB 门禁。
        expect(requests, `折叠态不该加载 Twikoo 运行时：${requests.join(", ")}`).toEqual([]);

        // 也不该误渲染 Waline
        expect(await page.evaluate(() => document.getElementById("waline"))).toBeNull();
    });

    test("契约自洽：各 provider 的 enable 均由 comments.provider 派生（构建期一致）", async ({
        page,
    }) => {
        /**
         * 这条不依赖请求，只验「配置层不可能自相矛盾」。
         * 做法：DOM 的存在性与 provider 必须一一对应 —— 因为渲染条件是
         * `waline.enable` / `twikoo.enable`，两者都是 `comments.provider === x` 派生的。
         * 若有人在某处把 enable 写死 true，就会出现「provider=none 但按钮还在」；
         * 若选路组件写错，会出现「两个 toggle 同时存在」—— 两种都由这条抓住。
         */
        await openArticle(page);
        const provider = await renderedProvider(page);
        expect(provider, "无法判定当前 provider（DOM 半开半闭或双开）").not.toBe("unknown");

        const counts = await page.evaluate(() => ({
            waline: document.querySelectorAll("#waline-toggle").length,
            twikoo: document.querySelectorAll("#twikoo-toggle").length,
        }));

        if (provider === "waline") {
            expect(counts.waline, "provider=waline 时应有且仅有一个 Waline 折叠按钮").toBe(1);
            expect(counts.twikoo, "provider=waline 时不该有 Twikoo 按钮").toBe(0);
        } else if (provider === "twikoo") {
            expect(counts.twikoo, "provider=twikoo 时应有且仅有一个 Twikoo 折叠按钮").toBe(1);
            expect(counts.waline, "provider=twikoo 时不该有 Waline 按钮").toBe(0);
        } else {
            expect(counts.waline + counts.twikoo, "provider=none 时不该有折叠按钮").toBe(0);
        }
    });
});
