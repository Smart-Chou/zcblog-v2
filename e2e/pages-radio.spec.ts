import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * M8-4 · Dogeared Radio / SitePlayer 验收（确定性部分）
 *
 * 覆盖：
 *  1. 路由 200：`/radio/`、`/en/radio/`
 *  2. 导航入口：主菜单有「电台」→ `/radio/`（en 为 `/en/radio/`），点击 200
 *  3. **arm-on-play**：冷访客（无 localStorage）在首页 0 个 `.site-player` 节点，
 *     且不请求播放器 chunk、不发 media 请求（spec §2.2 S0「不是隐藏，是不存在」）
 *  4. `/radio/` 页自带唤起按钮 → 该页挂载播放器
 *  5. 折叠/展开、Esc 收起、关闭即卸载（关闭后 0 节点 + 标记清除）
 *  6. ARIA 契约：播放键名称随状态翻转、**不带** `aria-pressed`；静音键 `aria-pressed` 翻转
 *  7. light/dark × 390/768/1440 无横向溢出；播放器不与 BottomTabs 相交（≤640）
 *  8. axe（wcag2a/aa + wcag21a/aa + wcag22aa）：serious/critical = 0
 *
 * 真·出声（`readyState` / `currentTime` 单调增 / swup 跨页不断播）需要连外部广播流，
 * 在 CI 上不确定，所以由 `docs/_reviews/radio-dock/site-player-check.cjs` 在本地跑，
 * 或本次用 `RADIO_LIVE=1 pnpm exec playwright test e2e/pages-radio.spec.ts` 打开。
 */

const ROOT = process.cwd();
const AXE_SOURCE = readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
const LIVE = process.env.RADIO_LIVE === "1";

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [390, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

const PLAYER = ".site-player";

async function setTheme(page: Page, theme: Theme) {
    // 只写 data-theme 不触发 html.dark 规则（同 pages.visual.spec.ts 的既有注释）
    await page.evaluate((value) => {
        const root = document.documentElement;
        root.setAttribute("data-theme", value);
        root.classList.toggle("dark", value === "dark");
    }, theme);
}

async function axeSerious(page: Page) {
    await page.addScriptTag({ content: AXE_SOURCE });
    const result = await page.evaluate(async () => {
        const axe = (
            window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<unknown> } }
        ).axe;
        return (await axe.run(document, {
            runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
        })) as { violations: Array<{ id: string; impact?: string | null; nodes: unknown[] }> };
    });
    return result.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
}

/* ─────────────────── 1. 路由与导航 ─────────────────── */

test("`/radio/` 与 `/en/radio/` 都是 200，各恰好 1 个 h1", async ({ page }) => {
    for (const url of ["/radio/", "/en/radio/"]) {
        const response = await page.goto(url);
        expect(response?.status(), url).toBe(200);
        await expect(page.locator("h1")).toHaveCount(1);
    }
});

test("主导航有「电台」入口，中英各自指向对应路由", async ({ page }) => {
    await page.goto("/");
    await page.locator("#nav-menu-btn").click();
    const zh = page.locator('#nav-dropdown a[href="/radio/"]');
    await expect(zh).toHaveCount(1);
    await expect(zh).toHaveText("电台");

    await page.goto("/en/");
    await page.locator("#nav-menu-btn").click();
    const en = page.locator('#nav-dropdown a[href="/en/radio/"]');
    await expect(en).toHaveCount(1);
    await expect(en).toHaveText("Radio");
});

test("导航入口真的可点：跟随链接后 200 且落地页有播放器唤起按钮", async ({ page }) => {
    await page.goto("/");
    await page.locator("#nav-menu-btn").click();
    await page.locator('#nav-dropdown a[href="/radio/"]').click();
    await page.waitForURL("**/radio/");
    expect((await page.request.get("/radio/")).status()).toBe(200);
    await expect(page.locator("[data-radio-open]")).toBeVisible();
});

/* ─────────────────── 2. arm-on-play：冷访客零节点零请求 ─────────────────── */

test("冷访客在首页：0 个播放器节点、0 条 media 请求、不加载播放器 chunk", async ({ page }) => {
    const media: string[] = [];
    page.on("request", (request) => {
        if (request.resourceType() === "media") media.push(request.url());
    });

    // 首页有第三方请求（一言/统计/友链头像），`networkidle` 在 preview 下可能永不成立
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await expect(page.locator(PLAYER)).toHaveCount(0);
    expect(media).toEqual([]);

    const chunkLoaded = await page.evaluate(() =>
        performance
            .getEntriesByType("resource")
            .some((entry) => entry.name.includes("site-player")),
    );
    expect(chunkLoaded).toBe(false);
});

test("`/radio/` 页自带唤起按钮 → 该页挂载播放器（折叠态）", async ({ page }) => {
    await page.goto("/radio/");
    await expect(page.locator(PLAYER)).toHaveCount(1);
    await expect(page.locator(PLAYER)).toHaveAttribute("data-state", "idle");
});

/* ─────────────────── 3. 交互契约（不需要真出声） ─────────────────── */

test("折叠 / 展开 / Esc 收起 / 关闭卸载", async ({ page }) => {
    await page.goto("/radio/");
    const player = page.locator(PLAYER);
    const toggle = page.locator("[data-player-toggle]");
    const close = page.locator("[data-player-close]");

    await expect(player).toHaveAttribute("data-state", "idle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(player).toHaveAttribute("data-state", "expanded");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(player).toHaveAttribute("data-state", "idle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await close.click();
    await expect(page.locator(PLAYER)).toHaveCount(0);
    const armed = await page.evaluate(() => localStorage.getItem("dogeared-radio-armed"));
    expect(armed).toBeNull();
});

test("播放键名称随状态翻转且不带 aria-pressed；静音键 aria-pressed 翻转", async ({ page }) => {
    await page.goto("/radio/");
    const play = page.locator("[data-player-play]");
    const mute = page.locator("[data-player-mute]");

    // §4.2 A2/A3：名称是动词 + 电台名，不是 toggle button
    await expect(play).toHaveAttribute("aria-label", /^播放：/);
    await expect(play).not.toHaveAttribute("aria-pressed", /.+/);

    // §4.2 A4：真正的 toggle 只有静音键
    await expect(mute).toHaveAttribute("aria-pressed", "false");
    const muteName = await mute.getAttribute("aria-label");
    await mute.click();
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    expect(await mute.getAttribute("aria-label")).toBe(muteName);
});

test("关闭按钮与静音键都有可读名称（button-name）", async ({ page }) => {
    await page.goto("/radio/");
    for (const selector of ["[data-player-play]", "[data-player-mute]", "[data-player-close]"]) {
        const label = await page.locator(selector).getAttribute("aria-label");
        expect(label?.trim().length ?? 0, selector).toBeGreaterThan(0);
    }
});

/**
 * M8-4 后续 · 文案 10-locale（DESIGN §5.7.1 禁止第 11 条 G1）。
 *
 * 播放器的 UI 文案由 `BaseHead/SitePlayerCopy.astro` 按页 locale 服务端输出到
 * `<script type="application/json" id="site-player-copy">`，脚本读取、缺块回落 zh。
 * 这里断言「页面上真正读到的 a11y 名称」——不是断言那个 JSON 的字面内容：
 * 文案最终要挂在控件的 `aria-label` / `title` 上才算数。
 */
test("文案随页面语言：en 页播放器全部英文，zh 页全部中文", async ({ page }) => {
    const read = async (url: string) => {
        await page.goto(url);
        return page.evaluate(() => {
            const player = document.querySelector(".site-player");
            const pick = (selector: string) =>
                document.querySelector(selector)?.getAttribute("aria-label") ?? null;
            return {
                region: player?.getAttribute("aria-label") ?? null,
                play: pick("[data-player-play]"),
                mute: pick("[data-player-mute]"),
                close: pick("[data-player-close]"),
                volume: pick("[data-player-volume]"),
                toggleTitle: document.querySelector("[data-player-toggle]")?.getAttribute("title"),
            };
        });
    };

    const en = await read("/en/radio/");
    // 播放键名 = 动词 + 电台名，冒号沿用站内全角（中文排版约定），动词必须是英文
    expect(en.play).toMatch(/^(Play|Pause)：/);
    expect(en.region).toBe("Radio player");
    expect(en.mute).toBe("Mute");
    expect(en.close).toBe("Close player");
    expect(en.volume).toBe("Volume");
    expect(en.toggleTitle).toBe("Expand player");
    // 反向护栏：英文页上不许再出现中文字符
    for (const [key, value] of Object.entries(en)) {
        expect(value, `${key} 不应含中文`).not.toMatch(/[\u4e00-\u9fff]/);
    }

    const zh = await read("/radio/");
    expect(zh.play).toMatch(/^(播放|暂停)：/);
    expect(zh.region).toBe("电台播放器");
    expect(zh.mute).toBe("静音");
    expect(zh.close).toBe("关闭播放器");
    expect(zh.volume).toBe("音量");
    expect(zh.toggleTitle).toBe("展开播放器");
});

test("跨语种换页（swup）后播放器文案跟着换，不重建节点", async ({ page }) => {
    await page.goto("/radio/");
    const en = page.locator("[data-player-play]");
    await expect(en).toHaveAttribute("aria-label", /^播放：/);

    await page.evaluate(async () => {
        const swup = (window as unknown as { swup?: { navigate: (url: string) => Promise<void> } })
            .swup;
        if (swup) await swup.navigate("/en/radio/");
    });
    await page.waitForURL("**/en/radio/");

    // 节点是同一个（跨页单例），文案换了
    await expect(page.locator(PLAYER)).toHaveCount(1);
    await expect(en).toHaveAttribute("aria-label", /^(Play|Pause)：/);
});

/* ─────────────────── 4. 布局与 a11y ─────────────────── */

test("light/dark × 390/768/1440：无横向溢出", async ({ page }) => {
    for (const width of VIEWPORTS) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of THEMES) {
            await page.goto("/radio/");
            await setTheme(page, theme);
            const overflow = await page.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            );
            expect(overflow, `${width}px ${theme}`).toBeLessThanOrEqual(1);
        }
    }
});

test("≤640：播放器不与底部导航相交", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/radio/");
    const layout = await page.evaluate(() => {
        const player = document.querySelector(".site-player")?.getBoundingClientRect();
        const tabs = document.querySelector(".bottom-tabs")?.getBoundingClientRect();
        if (!player || !tabs) return null;
        return {
            gap: tabs.top - player.bottom,
            overlap: !(
                player.right < tabs.left ||
                player.left > tabs.right ||
                player.bottom < tabs.top ||
                player.top > tabs.bottom
            ),
        };
    });
    expect(layout).not.toBeNull();
    expect(layout?.overlap).toBe(false);
    expect(layout?.gap ?? 0).toBeGreaterThan(0);
});

test("axe：双主题 serious/critical = 0（播放器内容不引入新违规）", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const theme of THEMES) {
        await page.goto("/radio/");
        await setTheme(page, theme);
        const serious = await axeSerious(page);
        // 站点壳层（搜索占位、菜单标签、页脚统计）在浅色下已有 4.4:1 的既有欠账，
        // 与本卡无关；这里只要求「播放器自身」不出现在违规节点里。
        const playerTargets: string[] = [];
        for (const violation of serious) {
            for (const node of violation.nodes as Array<{ target?: unknown }>) {
                const target = Array.isArray(node.target) ? node.target.join(" ") : "";
                if (target.includes("site-player"))
                    playerTargets.push(`${violation.id} → ${target}`);
            }
        }
        expect(playerTargets, `${theme}`).toEqual([]);
    }
});

/* ─────────────────── 5. 真·出声（可选） ─────────────────── */

test.describe("真·出声（RADIO_LIVE=1 才跑）", () => {
    test.skip(!LIVE, "需要连外部广播流，CI 不确定；本地用 RADIO_LIVE=1 打开");

    test("播放 → readyState 达标；swup 换页不断播；关闭后节点消失", async ({ page }) => {
        await page.goto("/radio/");
        await page.locator("[data-radio-open]").click();
        await page.waitForTimeout(3500);

        const playing = await page.evaluate(() => {
            const audio = document.querySelector(".site-player audio") as HTMLAudioElement | null;
            return {
                state: document.querySelector(".site-player")?.getAttribute("data-state"),
                paused: audio?.paused,
                readyState: audio?.readyState,
                currentTime: audio?.currentTime,
            };
        });
        expect(playing.state).toBe("expanded");
        expect(playing.paused).toBe(false);
        expect(playing.readyState ?? 0).toBeGreaterThanOrEqual(2);

        await page.evaluate(async () => {
            const swup = (
                window as unknown as { swup?: { navigate: (url: string) => Promise<void> } }
            ).swup;
            if (swup) await swup.navigate("/archives/");
        });
        await page.waitForTimeout(2500);

        const after = await page.evaluate(() => {
            const audio = document.querySelector(".site-player audio") as HTMLAudioElement | null;
            return {
                nodes: document.querySelectorAll(".site-player").length,
                paused: audio?.paused,
                currentTime: audio?.currentTime,
            };
        });
        expect(after.nodes).toBe(1);
        expect(after.paused).toBe(false);
        expect(after.currentTime ?? 0).toBeGreaterThan(playing.currentTime ?? 0);

        await page.locator("[data-player-close]").click();
        await expect(page.locator(PLAYER)).toHaveCount(0);
    });
});
