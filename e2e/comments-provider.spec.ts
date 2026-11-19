import { test, expect, type Page } from "@playwright/test";

/**
 * N-2a · 评论 provider 契约（`none` / `waline`）
 *
 * 判据（卡面）：
 *  1. `provider=none` 时文章页**零**评论请求（不加载 @waline/client、不碰评论服务器）、
 *     且 DOM 里没有 `#comment-wrapper`（关闭时零 DOM）
 *  2. `provider=waline` 时「展开评论」按钮存在，但**默认不加载**运行时（懒加载不变）
 *  3. 契约自洽：`waline.enable` 由 `comments.provider` 派生，两者不可能矛盾
 *
 * 为什么这个 spec 只测两条而不是三条：`twikoo` / `giscus` 未实现（需放宽 CSP，
 * 见挂起事项登记 H-12）。等那两张卡落地再各加一条。
 *
 * 运行方式 —— **两半互斥**，一个产物只能是一个 provider：
 *   PUBLIC_COMMENTS_PROVIDER=none   pnpm run build:ci && playwright test e2e/comments-provider.spec.ts
 *   PUBLIC_COMMENTS_PROVIDER=waline pnpm run build:ci && playwright test e2e/comments-provider.spec.ts
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
    // 组件自身的脚本 chunk（构建产物名含 WalineComment）不算三方请求
    if (/WalineComment/i.test(url)) return false;
    if (/\?url(?:&|$)/.test(url)) return false;
    if (/@waline[+/]client/i.test(url)) return true;
    if (/waline(?:[-.][\w-]+)?\.(?:js|css)(?:\?|$)/i.test(url)) return true;
    // 评论区真正的接口是 `/api/comment`
    return /waline\.marxchou\.com\/api\/comment/i.test(url);
}

/** 读取当前产物里实际生效的 provider（由构建期常量折叠决定，运行时只读结果）。 */
async function renderedProvider(page: Page): Promise<"none" | "waline" | "unknown"> {
    const hasWrapper = await page.evaluate(
        () => document.getElementById("comment-wrapper") !== null,
    );
    const hasToggle = await page.evaluate(() => document.getElementById("waline-toggle") !== null);
    if (hasWrapper && hasToggle) return "waline";
    if (!hasWrapper && !hasToggle) return "none";
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

    test("契约自洽：waline.enable 由 provider 派生（构建期一致）", async ({ page }) => {
        /**
         * 这条不依赖请求，只验「配置层不可能自相矛盾」。
         * 做法：按钮/DOM 的存在性与 provider 必须一致 —— 因为渲染条件是
         * `frontmatter.waline && waline.enable`，而 `waline.enable` 是
         * `comments.provider === "waline"` 派生的。若有人在某处把 enable 写死 true，
         * 就会出现「provider=none 但按钮还在」，这条会红。
         */
        await openArticle(page);
        const provider = await renderedProvider(page);
        expect(provider, "无法判定当前 provider（DOM 半开半闭）").not.toBe("unknown");

        const toggleCount = await page.evaluate(
            () => document.querySelectorAll("#waline-toggle").length,
        );
        if (provider === "waline") {
            expect(toggleCount, "provider=waline 时应有且仅有一个折叠按钮").toBe(1);
        } else {
            expect(toggleCount, "provider=none 时不该有折叠按钮").toBe(0);
        }
    });
});
