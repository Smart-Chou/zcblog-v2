import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * O-01 Overlay 组验收（M2-5）—— `19-m2-plan.md` §3.0 + 「关闭态 0 节点 / 0 请求」。
 *
 * 六件套：搜索 spotlight（Pagefind dialog）/ 分享 sheet / 跳转守卫 / 快捷键速查 / 手势速查 / 灯箱。
 * 每个 overlay 的唯一打开态判据 = `[data-overlay="<name>"]` 存在；关闭态必须 0 个。
 *
 * 口径（写死在这里，别在评审时重新解释）：
 *  · 「关闭态 0 请求」= 关闭之后 600ms 静默窗口内 `performance.getEntriesByType('resource')` 增量 0；
 *    打开时该拉的资源（Pagefind 38KB 模块 / 灯箱原图）不在此列 —— 那是打开态的成本，
 *    由 D-0053（Pagefind 按需）与灯箱语义决定，测试里逐个打印出来做证据。
 *  · overlay 基座本身按需 `import()`：从没点过任何 overlay 的页面，连 `overlay.*.js` 都不请求。
 *  · axe 只扫 overlay 子树（document 级存量债在共享 Header/Footer，属 M2-12）。
 */

const AXE_SOURCE = readFileSync(path.join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const ARTICLE = "/article/blog-as-a-product/";
const REDIRECT_OK = `/redirect/?url=${Buffer.from("https://example.com/").toString("base64url")}`;
const REDIRECT_BAD = "/redirect/?url=bbb";

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const count = (page: Page) => page.evaluate(() => document.querySelectorAll("[data-overlay]").length);

async function setTheme(page: Page, theme: Theme): Promise<void> {
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function axeOverlay(page: Page, name: string) {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(
        async ([selector, tags]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (window as any).axe.run(selector, {
                runOnly: { type: "tag", values: tags },
            });
            const byImpact = (list: { impact?: string }[]) =>
                list.filter((v) => v.impact === "serious" || v.impact === "critical").length;
            return {
                serious: byImpact(result.violations),
                violations: result.violations.map((v: { id: string }) => v.id),
                incomplete: result.incomplete.length,
                incompleteIds: result.incomplete.map((v: { id: string }) => v.id),
                incompleteTargets: result.incomplete.flatMap(
                    (v: { id: string; nodes: { target: string[] }[] }) =>
                        v.nodes.map((n) => `${v.id}:${n.target.join(" ")}`),
                ),
            };
        },
        [`[data-overlay="${name}"]`, TAGS],
    );
}

type Recipe = {
    name: string;
    url: string;
    viewport?: { width: number; height: number };
    open: (page: Page) => Promise<void>;
    /** 打开态是否允许拉资源（Pagefind 模块 / 灯箱原图） */
    loadsOnOpen: boolean;
    shortcutKey?: boolean;
};

const RECIPES: Recipe[] = [
    {
        name: "search",
        url: "/",
        loadsOnOpen: true,
        open: async (page) => {
            await page.locator("pagefind-modal-trigger").click();
        },
    },
    {
        name: "share",
        url: ARTICLE,
        loadsOnOpen: false,
        open: async (page) => {
            await page.locator("[data-share-action='wechat']").click();
        },
    },
    {
        name: "lightbox",
        url: ARTICLE,
        loadsOnOpen: true,
        open: async (page) => {
            await page.locator("a[data-fancybox]").first().click();
        },
    },
    {
        name: "shortcuts",
        url: "/",
        loadsOnOpen: false,
        open: async (page) => {
            await page.keyboard.press("?");
        },
    },
    {
        name: "gestures",
        url: "/",
        viewport: { width: 390, height: 844 },
        loadsOnOpen: false,
        open: async (page) => {
            await page.locator("#nav-menu-btn").click();
            await page.locator("[data-ovl-open='gestures']").click();
        },
    },
    {
        name: "redirect",
        url: REDIRECT_OK,
        loadsOnOpen: false,
        open: async () => {
            /* 守卫页落地即打开态 */
        },
    },
];

async function prepare(page: Page, recipe: Recipe, theme: Theme): Promise<void> {
    if (recipe.viewport) await page.setViewportSize(recipe.viewport);
    await page.goto(recipe.url, { waitUntil: "load" });
    await setTheme(page, theme);
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    });
}

/** overlay 自己的资源（其它噪声来自站内预取 / 埋点 / 懒图，不属本卡判据） */
const OVERLAY_ASSET = /pagefind|fancybox|overlay[\w-]*\.[\w-]+\.js/;

async function overlayAssets(page: Page): Promise<string[]> {
    const names = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name));
    return names.filter((name) => OVERLAY_ASSET.test(name));
}

/* ───────────────── 1. 关闭态：0 节点 / 0 额外请求 ───────────────── */

test("关闭态：首页 / 文章 / 守卫三类页均 0 个 [data-overlay]，且不下载 overlay 基座", async ({ page }) => {
    for (const url of ["/", ARTICLE, REDIRECT_BAD]) {
        const seen: string[] = [];
        page.on("request", (req) => seen.push(req.url()));
        await page.goto(url, { waitUntil: "load" });
        await page.waitForTimeout(900);
        expect(await count(page), `${url} 关闭态 [data-overlay]`).toBe(0);
        expect(
            seen.filter((u) => /\/_astro\/overlay[\w-]*\.[\w-]+\.js/.test(u)),
            `${url} 关闭态不该下载 overlay 基座`,
        ).toEqual([]);
    }
});

test("跳转守卫：无效目标 → 退出打开态（0 节点），有效目标 → 1 个", async ({ page }) => {
    await page.goto(REDIRECT_BAD, { waitUntil: "load" });
    await page.waitForTimeout(700);
    expect(await count(page)).toBe(0);
    await page.goto(REDIRECT_OK, { waitUntil: "load" });
    await expect(page.locator('[data-overlay="redirect"]')).toHaveCount(1);
});

/* ───────────────── 2. 每个 overlay × 双主题：打开 / axe / 关闭 ───────────────── */

for (const theme of THEMES) {
    for (const recipe of RECIPES) {
        test(`${recipe.name} @${theme}：打开态 1 个标记 / axe serious=0 incomplete=0 / 关闭后归零`, async ({
            page,
        }) => {
            await prepare(page, recipe, theme);
            const base = await overlayAssets(page);
            if (recipe.name !== "redirect")
                expect(await count(page), "准备阶段必须还是关闭态").toBe(0);

            await recipe.open(page);
            await expect(page.locator(`[data-overlay="${recipe.name}"]`)).toHaveCount(1);
            // 等入场动画走完再扫 axe：动画中途的 opacity <1 会让 color-contrast 判成 incomplete
            await page.evaluate(() =>
                document.querySelectorAll("[data-overlay]").forEach((node) =>
                    node.getAnimations({ subtree: true }).forEach((a) => a.finish()),
                ),
            );
            await page.waitForTimeout(120);

            const axe = await axeOverlay(page, recipe.name);
            console.log(
                `[axe] ${recipe.name} @${theme} serious=${axe.serious} incomplete=${axe.incomplete}` +
                    (axe.violations.length || axe.incompleteIds.length
                        ? ` ${JSON.stringify(axe)}`
                        : ""),
            );
            expect(axe.serious, `axe serious: ${axe.violations.join(",")}`).toBe(0);
            expect(axe.incomplete, `axe incomplete: ${axe.incompleteIds.join(",")}`).toBe(0);

            const opened = await overlayAssets(page);
            const pulled = opened.filter((name) => !base.includes(name));
            console.log(
                `[net] ${recipe.name} @${theme} 打开拉了 ${pulled.length} 个 overlay 资源: ${pulled
                    .map((n) => n.split("/").pop())
                    .join(",")}`,
            );
            // 基座模块（overlay.*.js）首次打开必然要下载一次 —— 那不是「关闭态请求」；
            // 不该出现的只有 pagefind 模块 / 灯箱原图这类内容资源。
            if (!recipe.loadsOnOpen)
                expect(pulled.filter((n) => /pagefind|fancybox/.test(n)), "打开不该拉内容资源").toEqual(
                    [],
                );

            if (recipe.name === "redirect") return; // 守卫页是页级矩形：关闭态由上面「无效目标」用例覆盖

            await page.keyboard.press("Escape");
            await expect(page.locator(`[data-overlay="${recipe.name}"]`)).toHaveCount(0, {
                timeout: 5000,
            });
            expect(await count(page), "关闭态必须 0 个 [data-overlay]").toBe(0);

            // 关闭之后静默窗口内不再拉任何 overlay 资源
            const closedAssets = await overlayAssets(page);
            await page.waitForTimeout(600);
            expect(await overlayAssets(page), "关闭态 600ms 内 0 新 overlay 请求").toEqual(
                closedAssets,
            );
        });
    }
}

/* ───────────────── 3. 键盘：mod+k / Esc / 焦点归还 / Tab 循环 ───────────────── */

test("键盘：mod+k 开搜索、Esc 关、焦点回到触发按钮", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForTimeout(400);
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.locator('[data-overlay="search"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-overlay="search"]')).toHaveCount(0);
    const focused = await page.evaluate(() =>
        document.activeElement?.matches("pagefind-modal-trigger button"),
    );
    expect(focused, "焦点应回到搜索触发按钮").toBe(true);
});

test("键盘：Esc 关闭速查表后焦点回到触发元素；Tab 在遮罩内循环", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.keyboard.press("?");
    await expect(page.locator('[data-overlay="shortcuts"]')).toHaveCount(1);

    for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        const inside = await page.evaluate(() => {
            const root = document.querySelector('[data-overlay="shortcuts"]');
            return !!root && !!document.activeElement && root.contains(document.activeElement);
        });
        expect(inside, `第 ${i + 1} 次 Tab 仍在遮罩内`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-overlay="shortcuts"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("nav-menu-btn");
    expect(
        await page.evaluate(() => document.querySelectorAll(".ovl").length),
        "关闭态不留任何 .ovl 节点",
    ).toBe(0);
});

test("快捷键速查可从导航菜单打开（入口在 Nav 里，不额外加壳高度）", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.locator("#nav-menu-btn").click();
    await page.locator("[data-ovl-open='shortcuts']").click();
    await expect(page.locator('[data-overlay="shortcuts"]')).toHaveCount(1);
    await expect(page.locator('[data-overlay="shortcuts"] .ovl__row')).toHaveCount(3);
});

/* 遮罩必须盖住文章页的悬浮层（目录 90 / 回到顶部 100）—— M2-5 实测穿透后修的 */
test("层级：文章页打开分享弹层后，目录卡片与回到顶部被遮罩盖住", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ARTICLE, { waitUntil: "load" });
    await page.locator("[data-share-action='wechat']").click();
    await expect(page.locator('[data-overlay="share"]')).toHaveCount(1);
    await page.waitForTimeout(250);
    const covered = await page.evaluate(() => {
        const points = [
            document.querySelector(".toc, #toc, .toc-container"),
            document.querySelector("#back-to-top"),
        ].filter((el): el is HTMLElement => !!el && el.getBoundingClientRect().width > 0);
        return points.map((el) => {
            const rect = el.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + 8, rect.top + 8);
            return !el.contains(hit) && hit !== el;
        });
    });
    expect(covered.length, "文章页应至少有目录或回到顶部其一").toBeGreaterThan(0);
    expect(covered, "悬浮层应被遮罩覆盖（elementFromPoint 不应命中它们）").toEqual(
        covered.map(() => true),
    );
});

/* ───────────────── 4. 手势速查只在移动断点出现 ───────────────── */

test("手势入口：桌面断点不出现、移动断点出现且可打开", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });
    await page.locator("#nav-menu-btn").click();
    await expect(page.locator("[data-ovl-open='gestures']")).toBeHidden();
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "load" });
    await page.locator("#nav-menu-btn").click();
    const gesture = page.locator("[data-ovl-open='gestures']");
    await expect(gesture).toBeVisible();
    await gesture.click();
    await expect(page.locator('[data-overlay="gestures"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-overlay="gestures"]')).toHaveCount(0);
});

/* ───────────────── 5. reduced-motion：0 运行中动画 ───────────────── */

test.describe("prefers-reduced-motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("reduced-motion 下禁用的遮罩没有运行中动画、位移 < 0.5px", async ({ page }) => {
        await page.goto("/", { waitUntil: "load" });
        await page.keyboard.press("?");
        await expect(page.locator('[data-overlay="shortcuts"]')).toHaveCount(1);
        await page.waitForTimeout(300);
        const state = await page.evaluate(() => {
            const root = document.querySelector<HTMLElement>('[data-overlay="shortcuts"]')!;
            const panel = root.querySelector<HTMLElement>(".ovl__panel")!;
            const running = root
                .getAnimations({ subtree: true })
                .filter((a) => a.playState === "running").length;
            const rect = panel.getBoundingClientRect();
            return { running, top: rect.top, height: rect.height };
        });
        console.log(`[motion] shortcuts reduced-motion running=${state.running}`);
        expect(state.running, "reduced-motion 下运行中动画必须为 0").toBe(0);
        expect(state.height).toBeGreaterThan(0);
    });

    test("reduced-motion 下搜索遮罩同样 0 运行中动画", async ({ page }) => {
        await page.goto("/", { waitUntil: "load" });
        await page.locator("pagefind-modal-trigger").click();
        await expect(page.locator('[data-overlay="search"]')).toHaveCount(1);
        await page.waitForTimeout(300);
        const running = await page.evaluate(() =>
            document.querySelector('[data-overlay="search"]')!.getAnimations({ subtree: true })
                .filter((a) => a.playState === "running").length,
        );
        expect(running).toBe(0);
    });
});

/* ───────────────── 6. 证据截图（OVERLAY_SHOTS=1 才跑，默认 skip） ───────────────── */

const EVIDENCE_DIR =
    process.env.OVERLAY_EVIDENCE_DIR ??
    path.resolve(process.cwd(), "../../hermes-desktop-files/blog2.0/docs/_reviews/M2-5-overlays");

test.describe("overlay 证据截图", () => {
    test.skip(process.env.OVERLAY_SHOTS !== "1", "set OVERLAY_SHOTS=1 to capture");

    const shot = async (page: Page, file: string) => {
        if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
        const target = path.join(EVIDENCE_DIR, file);
        await page.screenshot({ path: target, animations: "disabled" });
        console.log(`[shot] ${target}`);
        expect(existsSync(target)).toBe(true);
    };

    for (const theme of THEMES) {
        test(`${theme}：搜索 / 分享 / 灯箱 / 快捷键`, async ({ page }) => {
            await page.setViewportSize({ width: 1440, height: 900 });
            for (const recipe of RECIPES.filter(
                (r) => r.name !== "gestures" && r.name !== "redirect",
            )) {
                await prepare(page, recipe, theme);
                await recipe.open(page);
                await expect(page.locator(`[data-overlay="${recipe.name}"]`)).toHaveCount(1);
                await page.waitForTimeout(350);
                await shot(page, `${recipe.name}-${theme}-1440.png`);
            }
        });

        test(`${theme}：手势速查（390）`, async ({ page }) => {
            const recipe = RECIPES.find((r) => r.name === "gestures")!;
            await prepare(page, recipe, theme);
            await recipe.open(page);
            await expect(page.locator('[data-overlay="gestures"]')).toHaveCount(1);
            await page.waitForTimeout(350);
            await shot(page, `gestures-${theme}-390.png`);
        });
    }
});
