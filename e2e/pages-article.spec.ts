import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * P-02 文章详情验收（M2-3）——`19-m2-plan.md` §3.0 的 8 条页面级判据 + 文章页专项。
 *
 * 覆盖：
 *  1. 路由 200（`/article/bitwarden/` 与 `/en/article/blog-seo-practice/`）
 *  2. 恰好 1 个 <h1>；标题层级不跳级
 *  3. light/dark × 390/768/1440 无横向溢出
 *  4. axe（wcag2a/aa + wcag21a/aa + wcag22aa）：`.post` 与 `.toc.post-toc` 内
 *     serious=0 critical=0 incomplete=0（双主题）
 *  5. Tab 顺序 = DOM 顺序；`.post` / `.toc` 内每个可聚焦元素焦点环 ≥2px 且颜色 = --color-ring-focus
 *  6. prefers-reduced-motion：0 运行中动画、区块位移 <0.5px
 *  7. 页面级 CLS（load 后 2s）≤ 0.05
 *  8. 关闭态：分享弹层未打开时 0 额外网络请求（二维码是构建期内联 SVG）
 *
 * 专项（本卡证据）：
 *  · D-0082 TOC 构建期渲染：直接读 `dist/article/<slug>/index.html`，断言目录节点与锚点
 *  · 目录链接可跳：JS 打开 / 关闭两种情况下点目录链接都能落在对应标题
 *  · D-0089 阅读进度：滚动后 `.reading-progress` 的 scaleX 递增（0 → >0.1）
 *  · D-0090 浏览量：`.waline-pageview-count[data-path="/article/bitwarden/"]` 存在
 *  · 分享 / 版权 / 相关三块在 390/1440、light/dark 的截图（ARTICLE_SHOTS=1 时落盘）
 */

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);

const ARTICLE = "/article/bitwarden/";
const ARTICLE_EN = "/en/article/blog-seo-practice/";
/** 构建产物里的同一篇文章（D-0082 的静态证据） */
const ARTICLE_FILE = path.join(process.cwd(), "dist", "article", "bitwarden", "index.html");

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [390, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

const EVIDENCE_DIR =
    process.env.ARTICLE_EVIDENCE_DIR ??
    path.resolve(process.cwd(), "../../hermes-desktop-files/blog2.0/docs/_reviews/M2-3-article");

async function openArticle(page: Page, theme: Theme, url = ARTICLE): Promise<void> {
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
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator(".post")).toHaveCount(1);
}

/* ───────────────────────── 1. 路由 ───────────────────────── */

test.describe("routes", () => {
    test("route-zh 200", async ({ page }) => {
        const response = await page.goto(ARTICLE, { waitUntil: "load" });
        expect(response?.status(), `GET ${ARTICLE}`).toBe(200);
        await expect(page.locator(".post")).toHaveCount(1);
        await expect(page.locator(".post-sheet")).toHaveCount(1);
    });

    test("route-en 200", async ({ page }) => {
        // 内容仓目前 0 篇 `lang: en` 的文章（89 篇全中文），/en/article/* 的路由集合为空：
        // 拿不到可测的 EN 文章页 → 这条按「无内容可验」跳过，并在报告里记明原因。
        // 一旦加入英文文章（lang: en），这里会自动变成真断言。
        const enDir = path.join(process.cwd(), "dist", "en", "article");
        const hasEnArticles = existsSync(enDir);
        test.skip(!hasEnArticles, "内容仓没有 lang: en 的文章：/en/article/* 路由为空");

        const response = await page.goto(ARTICLE_EN, { waitUntil: "load" });
        expect(response?.status(), `GET ${ARTICLE_EN}`).toBe(200);
        await expect(page.locator(".post-sheet")).toHaveCount(1);
    });
});

/* ───────────────────────── 2. h1 / 标题层级 ───────────────────────── */

test("恰好 1 个 h1，标题层级不跳级", async ({ page }) => {
    await page.goto(ARTICLE, { waitUntil: "load" });
    const headings = await page.evaluate(() => ({
        h1: [...document.querySelectorAll("h1")].map((el) => (el.textContent ?? "").trim()),
        // 只算真正进大纲的标题：remark-aside 的 `:::tip` 标题是 <h5 aria-hidden="true">，
        // 由 markdown 扩展生成、不参与文档层级（读屏也读不到），不属于本页版式。
        levels: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
            .filter((el) => el.getAttribute("aria-hidden") !== "true")
            .map((el) => Number(el.tagName.slice(1))),
        hiddenAsideHeadings: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(
            (el) => el.getAttribute("aria-hidden") === "true",
        ).length,
    }));
    expect(headings.h1, "exactly one h1").toHaveLength(1);
    expect(headings.h1[0]).not.toBe("");

    let previous = 0;
    const skips: string[] = [];
    for (const level of headings.levels) {
        if (previous !== 0 && level > previous + 1) skips.push(`${previous} → ${level}`);
        previous = level;
    }
    expect(skips, "heading levels must not skip").toEqual([]);
    console.log(
        `[h1] 1 个 h1，${headings.levels.length} 个进大纲的标题，0 处跳级（另有 ${headings.hiddenAsideHeadings} 个 aria-hidden 的 aside 标题）`,
    );
});

/* ───────────────────────── 3. 横向溢出 ───────────────────────── */

test.describe("no horizontal overflow", () => {
    for (const width of VIEWPORTS) {
        for (const theme of THEMES) {
            test(`overflow-${theme}-${width}`, async ({ page }) => {
                await page.setViewportSize({ width, height: 900 });
                await openArticle(page, theme);

                const result = await page.evaluate(() => {
                    const doc = document.documentElement;
                    const limit = doc.clientWidth;
                    // 被祖先 overflow 容器裁掉的元素（代码块的横向滚动、卡片内的
                    // 长 URL）不算「页面溢出」：它们由容器自己滚，不会撑开文档宽度。
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
                            return `${el.tagName.toLowerCase()} right=${Math.round(rect.right)} width=${Math.round(rect.width)} :: ${el.outerHTML.slice(0, 160)}`;
                        });
                    return {
                        scrollWidth: doc.scrollWidth,
                        clientWidth: doc.clientWidth,
                        offenders,
                    };
                });

                expect(result.offenders, `elements past the ${width}px viewport`).toEqual([]);
                expect(
                    result.scrollWidth,
                    `scrollWidth ${result.scrollWidth} > clientWidth ${result.clientWidth}`,
                ).toBeLessThanOrEqual(result.clientWidth + 1);
            });
        }
    }
});

/* ───────────────────────── 4. axe ───────────────────────── */

type AxeNode = { target: unknown[]; html: string; failureSummary?: string };
type AxeViolation = {
    id: string;
    impact: string | null;
    help: string;
    helpUrl: string;
    nodes: AxeNode[];
};

async function runAxe(
    page: Page,
    contextSelector?: string,
): Promise<{ violations: AxeViolation[]; incomplete: AxeViolation[] }> {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(async (selector) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const axe = (window as any).axe;
        const map = (list: AxeViolation[]) =>
            list.map((v) => ({
                id: v.id,
                impact: v.impact,
                help: v.help,
                helpUrl: v.helpUrl,
                nodes: v.nodes.map((n) => ({
                    target: n.target,
                    html: n.html.slice(0, 220),
                    summary: n.failureSummary,
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

test.describe("axe (WCAG 2.x A/AA)", () => {
    for (const theme of THEMES) {
        test(`axe-${theme}-1440`, async ({ page }) => {
            test.setTimeout(90_000);
            await page.setViewportSize({ width: 1440, height: 900 });
            await openArticle(page, theme);

            // 三次扫描：
            //  · .post        本卡交付的文章主体（页头 + 纸面 + 分享/版权/相关）
            //  · .toc.post-toc 本卡交付的目录框
            //  · document     含共享 Header/Footer「⌘K」/Footer 存量问题 → 只记录
            const postScope = await runAxe(page, ".post");
            const tocScope = await runAxe(page, ".toc.post-toc");
            const docScope = await runAxe(page);

            await test.info().attach(`axe-${theme}-1440.json`, {
                body: JSON.stringify(
                    { post: postScope, toc: tocScope, document: docScope },
                    null,
                    2,
                ),
                contentType: "application/json",
            });
            const axeDir = path.join(process.cwd(), "test-results", "axe-article");
            if (!existsSync(axeDir)) mkdirSync(axeDir, { recursive: true });
            writeFileSync(
                path.join(axeDir, `${theme}-1440.json`),
                JSON.stringify({ post: postScope, toc: tocScope, document: docScope }, null, 2),
            );

            const seriousOf = (result: { violations: AxeViolation[] }) =>
                result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");

            for (const [label, result] of [
                ["文章主体 .post", postScope],
                ["目录 .toc", tocScope],
                ["整页 document", docScope],
            ] as const) {
                console.log(
                    `[axe] ${theme}@1440 ${label}: serious/critical=${seriousOf(result).length} moderate=${result.violations.filter((v) => v.impact === "moderate").length} minor=${result.violations.filter((v) => v.impact === "minor").length} incomplete=${result.incomplete.length}`,
                );
                for (const v of [...result.violations, ...result.incomplete])
                    console.log(`[axe]   ${v.impact} ${v.id} × ${v.nodes.length} — ${v.help}`);
            }

            for (const [label, result] of [
                ["文章主体 .post", postScope],
                ["目录 .toc", tocScope],
            ] as const) {
                expect(
                    seriousOf(result).map((v) => `${v.id} (${v.nodes.length} node(s))`),
                    `serious/critical axe violations in ${label} at ${theme}`,
                ).toEqual([]);
                expect(
                    result.incomplete.map((v) => `${v.id} (${v.nodes.length} node(s))`),
                    `axe could not finish on ${label} at ${theme}`,
                ).toEqual([]);
            }
        });
    }
});

/* ───────────────────────── 5. 键盘 ───────────────────────── */

type RingProbe = {
    tag: string;
    label: string;
    scope: "post" | "toc" | "chrome";
    ring: { style: string; width: string; color: string } | null;
};

const ringProbe = (): RingProbe => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return { tag: "none", label: "", scope: "chrome", ring: null };
    const style = getComputedStyle(el);
    const width = parseFloat(style.outlineWidth);
    const visible = style.outlineStyle !== "none" && width >= 2;
    return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40),
        scope: el.closest(".post") ? "post" : el.closest(".toc.post-toc") ? "toc" : "chrome",
        ring: visible
            ? { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor }
            : null,
    };
};

test("Tab 顺序 + 焦点环", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openArticle(page, "light");
    // pagefind 搜索触发器是懒加载占位：等它定型，避免 Tab 序列半途变动
    await page
        .waitForFunction(
            () => {
                const el = document.querySelector("pagefind-modal-trigger");
                return !el || el.matches(":defined");
            },
            undefined,
            { timeout: 5000 },
        )
        .catch(() => undefined);
    await page.waitForTimeout(300);

    const expected = await page.evaluate(() => {
        // summary 是浏览器原生 tab stop（<details> 的展开开关），不在 a/button/input 里，
        // 漏掉它会让后面每一步的序号整体错位。
        const selector = "a[href], button, input, select, textarea, summary, [tabindex]";
        const nodes = [...document.querySelectorAll<HTMLElement>(selector)].filter(
            (node) =>
                ((node as HTMLElement & { checkVisibility?: (o?: object) => boolean })
                    .checkVisibility
                    ? (
                          node as HTMLElement & { checkVisibility: (o?: object) => boolean }
                      ).checkVisibility({ checkVisibilityCSS: true })
                    : node.offsetParent !== null || node.getClientRects().length > 0) &&
                !node.hasAttribute("disabled") &&
                node.tabIndex >= 0 &&
                node.getAttribute("aria-hidden") !== "true" &&
                !node.closest("[inert]"),
        );
        nodes.forEach((node, i) => node.setAttribute("data-kbd", String(i)));
        return nodes.map((node) => ({
            i: node.getAttribute("data-kbd") ?? "",
            tag: node.tagName.toLowerCase(),
            cls: String(node.className).slice(0, 60),
            text: (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().slice(0, 40),
        }));
    });
    expect(expected.length, "focusable elements").toBeGreaterThan(30);

    const visited: string[] = [];
    const ringProblems: string[] = [];
    const ringSamples: RingProbe[] = [];
    const chromeSamples: RingProbe[] = [];
    const colorOffenders: string[] = [];

    const ringToken = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.outlineColor = "var(--color-ring-focus)";
        document.body.append(probe);
        const value = getComputedStyle(probe).outlineColor;
        probe.remove();
        return value;
    });

    for (let step = 0; step < expected.length; step += 1) {
        await page.keyboard.press("Tab");
        const probe = await page.evaluate(ringProbe);
        const index = await page.evaluate(
            () => (document.activeElement as HTMLElement | null)?.getAttribute("data-kbd") ?? null,
        );
        if (index === null) {
            const missed = expected[step];
            ringProblems.push(
                `Tab #${step + 1} 落在页面外（${probe.tag}）；DOM 里第 ${step + 1} 个可聚焦元素是 <${missed?.tag} class="${missed?.cls}"> "${missed?.text}"，Tab 无法到达`,
            );
            break;
        }
        visited.push(index);
        if (!probe.ring) {
            ringProblems.push(`${probe.tag} "${probe.label}" 没有焦点环`);
            continue;
        }
        if (probe.scope === "chrome") {
            if (chromeSamples.length < 6) chromeSamples.push(probe);
            continue;
        }
        if (ringSamples.length < 8) ringSamples.push(probe);
        if (probe.ring.color !== ringToken) {
            colorOffenders.push(`${probe.scope} ${probe.tag} "${probe.label}" ${probe.ring.color}`);
        }
    }

    const unreachable = expected.filter((entry) => !visited.includes(entry.i));
    console.log(
        `[kbd] visited=${visited.length}/${expected.length} unreachable=${JSON.stringify(
            unreachable.map((entry) => `${entry.i}:${entry.tag}.${entry.cls} "${entry.text}"`),
        )}`,
    );
    console.log(
        `[kbd] 页面内焦点环 samples=${ringSamples.length} 颜色偏差=${colorOffenders.length} ｜ chrome（共享 Header/Footer）samples=${chromeSamples
            .map((sample) => `${sample.tag}:${sample.ring?.color}`)
            .join(", ")}`,
    );

    expect(ringProblems, "每个获得焦点的元素都要有 ≥2px 的焦点环").toEqual([]);
    expect(colorOffenders, "页面内容（.post / .toc）的焦点环颜色必须 = --color-ring-focus").toEqual(
        [],
    );
    expect(visited, "Tab 顺序必须与 DOM 顺序一致").toEqual(expected.map((entry) => entry.i));

    for (const sample of ringSamples) {
        expect(sample.ring?.style, `outline-style for ${sample.tag}`).toBe("solid");
        expect(sample.ring?.color, `outline-color for ${sample.tag}`).toBe(ringToken);
    }

    await test.info().attach("keyboard-tab-order.json", {
        body: JSON.stringify(
            {
                expected: expected.length,
                visited: visited.length,
                ringToken,
                ringSamples,
                chromeSamples,
            },
            null,
            2,
        ),
        contentType: "application/json",
    });
});

/* ───────────────────────── 6. reduced-motion ───────────────────────── */

test.describe("prefers-reduced-motion", () => {
    test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

    test("0 动画 / 位移 <0.5px", async ({ page }) => {
        await page.goto(ARTICLE, { waitUntil: "load" });
        await page.evaluate(async () => {
            await document.fonts.ready;
        });

        const selector =
            ".post-masthead, .post-sheet, .post-cover, .post-footer, .post-sheet .share-bar, .post-nav, .related-posts, .toc.post-toc";
        const snapshot = () =>
            page.evaluate(
                (sel) =>
                    [...document.querySelectorAll(sel)].map((el) => {
                        const rect = el.getBoundingClientRect();
                        return {
                            top: rect.top,
                            left: rect.left,
                            width: rect.width,
                            height: rect.height,
                        };
                    }),
                selector,
            );

        const probes = await snapshot();
        await page.waitForTimeout(1500);
        const after = await snapshot();

        const running = await page.evaluate(() =>
            document
                .getAnimations()
                .filter((animation) => animation.playState === "running")
                .map((animation) => {
                    const effect = animation.effect as unknown as { target?: Element } | null;
                    return `${animation.constructor.name}:${String(effect?.target?.className ?? "?")}`;
                }),
        );
        expect(running, "reduced-motion 下不能有运行中的动画").toEqual([]);

        const drift: string[] = [];
        probes.forEach((before, index) => {
            const now = after[index];
            for (const key of ["top", "left", "width", "height"] as const) {
                if (Math.abs(before[key] - now[key]) >= 0.5) {
                    drift.push(`#${index}.${key} ${before[key]} → ${now[key]}`);
                }
            }
        });
        expect(drift, "区块位移必须 <0.5px").toEqual([]);
        console.log(`[motion] 探针 ${probes.length} 个，运行中动画 0，位移 0`);
    });
});

/* ───────────────────────── 7. CLS ───────────────────────── */

test("CLS ≤ 0.05（load 后 2s）", async ({ page }) => {
    await page.addInitScript(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__cls = 0;
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as unknown as Array<{
                value: number;
                hadRecentInput: boolean;
            }>) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (!entry.hadRecentInput) (window as any).__cls += entry.value;
            }
        }).observe({ type: "layout-shift", buffered: true });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ARTICLE, { waitUntil: "load" });
    await page.waitForTimeout(2000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cls = await page.evaluate(() => (window as any).__cls as number);
    console.log(`[cls] article @1440 = ${cls.toFixed(4)}`);
    expect(cls).toBeLessThanOrEqual(0.05);
});

/* ───────────────────────── 8. 关闭态 0 额外请求 ───────────────────────── */

test("分享弹层关闭态：0 额外网络请求（二维码点击时本地生成）", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(ARTICLE, { waitUntil: "load" });
    await page.waitForTimeout(600);

    // 二维码不再内联进 HTML（单篇 10.4KB），改成点「微信」时 await import("uqr") 本地渲染。
    // 判据仍是「零第三方 QR 服务」：任何 qr 服务请求都是失败（本地 chunk 是同源 /_astro/*.js）。
    // 同源按 page.url() 的 origin 判定：baseURL 是 127.0.0.1，只排 localhost 会让同源
    // chunk 里偶然带 "qr" 的哈希（如 feature.DkFqrIlh.js）被误判成第三方服务。
    const origin = new URL(page.url()).origin;
    const qrRequests = requests.filter(
        (url) => !url.startsWith(origin) && /qr|qrcode|chart\.googleapis|api\.qrserver/i.test(url),
    );
    expect(qrRequests, "分享二维码必须本地生成，不能请求第三方 QR 服务").toEqual([]);

    // 微信弹层默认关闭：aria-hidden，且视觉上完全透明（opacity:0 不算 hidden，这里量计算值）
    const pop = page.locator(".share-wechat-wrap .share-pop").first();
    if ((await pop.count()) > 0) {
        await expect(pop).toHaveAttribute("aria-hidden", "true");
        const style = await pop.evaluate((el) => {
            const computed = getComputedStyle(el as HTMLElement);
            return { opacity: Number(computed.opacity), pointerEvents: computed.pointerEvents };
        });
        expect(style.opacity, "未点击时二维码弹层必须透明").toBe(0);
        expect(style.pointerEvents, "未点击时弹层不吃鼠标事件").toBe("none");

        // 关闭态二维码容器必须是空的：HTML 里不再携带 QR path 数据
        const qrItems = await pop
            .locator("[data-share-qr]")
            .evaluateAll((nodes) => nodes.map((node) => node.childElementCount));
        expect(qrItems, "关闭态 HTML 不应内联二维码").toEqual(qrItems.map(() => 0));
    }

    // 站外分享链接在构建期就写进 href（无 JS 也能用）
    const hrefs = await page.$$eval(".share-icon[data-share-platform]", (nodes) =>
        nodes.map((node) => node.getAttribute("href") ?? ""),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href.startsWith("http")).toBe(true);

    console.log(`[share] 关闭态请求 ${requests.length} 个，第三方 QR 相关 0`);
});

test("徽标 sprite：图标走 /icons.svg 且全部解析出图形（无缺图）", async ({ page }) => {
    const spriteRequests: { url: string; status: number }[] = [];
    page.on("response", (response) => {
        if (response.url().includes("/icons.svg")) {
            spriteRequests.push({ url: response.url(), status: response.status() });
        }
    });

    await page.goto(ARTICLE, { waitUntil: "load" });
    await page.waitForTimeout(800);

    // head 里有 preload，实际请求必须 200（404 会让所有图标静默消失）
    expect(spriteRequests.length, "文章页必须请求一次 /icons.svg").toBeGreaterThan(0);
    for (const req of spriteRequests) expect(req.status, req.url).toBe(200);
    expect(spriteRequests[0].url, "sprite URL 必须带内容哈希查询串").toMatch(/\?v=[0-9a-f]{8}#?/);

    const report = await page.evaluate(async () => {
        const spriteHref = document
            .querySelector('link[rel="preload"][as="image"]')
            ?.getAttribute("href");
        const doc = await fetch(spriteHref ?? "/icons.svg").then((r) => r.text());
        const ids = new Set([...doc.matchAll(/<g id="([^"]+)"/g)].map((m) => m[1]));
        const uses = [...document.querySelectorAll("svg > use")]
            .map((u) => u.getAttribute("href") ?? "")
            // 只统计跨文档 sprite 引用；内联回退图标（logos:telegram / mingcute:github-line）
            // 自带同文档 `<use href="#...">`，那不是 sprite 缺图，不能误判。
            .filter((href) => href.includes("/icons.svg"));
        const missing: string[] = [];
        const invisible: string[] = [];
        let zeroBox = 0;
        for (const href of uses) {
            const id = href.split("#")[1] ?? "";
            if (!ids.has(id)) missing.push(id);
            const use = document.querySelector(`use[href="${CSS.escape(href)}"]`);
            // 主题切换 / 分享抽屉里的图标默认隐藏，零尺寸是预期；只对可见图标要求非零。
            if (use && !use.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
                invisible.push(id);
                continue;
            }
            const box = use?.getBoundingClientRect();
            if (!box || box.width < 1 || box.height < 1) zeroBox++;
        }
        return { total: uses.length, missing, zeroBox, invisible, spriteG: ids.size };
    });

    console.log(
        `[sprite] ${report.total} 个 <use> 实例，sprite 内 ${report.spriteG} 个 <g>，缺 id ${report.missing.length}，零尺寸 ${report.zeroBox}（隐藏 ${report.invisible.length}）`,
    );
    expect(report.total, "文章页图标实例数应 > 20").toBeGreaterThan(20);
    expect(report.missing, "所有 <use> 的 id 都必须在 sprite 里（缺一个 = 少一个图标）").toEqual(
        [],
    );
    expect(report.zeroBox, "所有图标都必须渲染出非零尺寸").toBe(0);
});

/* ───────────────────────── D-0082 · TOC 构建产物 ───────────────────────── */
test("D-0082：TOC 目录写在构建产物里", async () => {
    expect(existsSync(ARTICLE_FILE), `missing build artifact ${ARTICLE_FILE}`).toBe(true);
    const html = readFileSync(ARTICLE_FILE, "utf8");

    // 结构：目录框 + 列表 + 至少 3 个锚点链接（tocbot 只做增强，不做首次渲染）
    expect(html).toContain('class="toc post-toc"');
    expect(html).toContain('class="toc-list"');
    const links = [...html.matchAll(/<a href="#([^"]+)" class="toc-link"/g)].map((m) => m[1]);
    expect(links.length, "构建产物里的目录条目数").toBeGreaterThanOrEqual(3);

    // 每个目录锚点都要在正文里找得到同名 id
    const missing = links.filter((slug) => !html.includes(`id="${slug}"`));
    expect(missing, "目录锚点在正文里缺少对应标题 id").toEqual([]);

    // 目录标题也在构建期（不依赖 JS）
    expect(html).toMatch(/class="post-toc__title">(目录|Contents)</);

    const nested = (html.match(/class="toc-list-item is-collapsible"/g) ?? []).length;
    console.log(`[toc] 构建产物：${links.length} 个目录锚点，${nested} 个可折叠一级项，0 个缺 id`);
});

test("目录链接可跳（1440，tocbot 接管后）", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openArticle(page, "light");

    const firstTocLink = page.locator(".toc.post-toc .toc-link").first();
    await expect(firstTocLink).toBeVisible();
    const hash = await firstTocLink.getAttribute("href");
    expect(hash).toMatch(/^#.+/);

    await firstTocLink.click();
    // tocbot 的 `scrollSmoothDuration` 是 420ms，固定 400ms 会在滚动途中量到落点
    // （实测 mid-scroll = 333px，误判成「跑太远」）。改为等 scrollY 稳定。
    await page.waitForFunction(
        () =>
            new Promise<boolean>((resolve) => {
                const start = window.scrollY;
                let ticks = 0;
                const step = () => {
                    if (window.scrollY === start) {
                        if (++ticks >= 2) return resolve(true);
                    } else {
                        ticks = 0;
                    }
                    requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
            }),
        undefined,
        { timeout: 3000 },
    );

    const target = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        return el ? el.getBoundingClientRect().top : null;
    }, hash ?? "#");

    expect(target, `anchor ${hash} 目标不存在`).not.toBeNull();
    // tocbot 的 scrollSmoothOffset 是 -100px，标题落点 = 固定页头高度 + 偏移，
    // 判据定为「在页头下方，且不超过页头 + 160px」——既不被页头盖住，也不跑太远。
    const headerHeight = await page.evaluate(
        () => document.querySelector("header")?.getBoundingClientRect().height ?? 0,
    );
    expect(target as number, "点击目录后标题必须落在固定页头下方").toBeGreaterThan(headerHeight);
    expect(target as number, "点击目录后标题应靠近视口顶部").toBeLessThan(headerHeight + 160);
    // location.hash 会把中文锚点百分号编码，比对前统一解码
    expect(await page.evaluate(() => decodeURIComponent(location.hash))).toBe(
        decodeURIComponent(hash ?? ""),
    );
    console.log(
        `[toc] 点击 ${hash} → 标题 top=${(target as number).toFixed(1)}px（页头 ${headerHeight.toFixed(1)}px）`,
    );
});

test.describe("无 JS：目录仍渲染且可跳（D-0082）", () => {
    test.use({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });

    test("目录可见 + 锚点跳转生效", async ({ page }) => {
        const response = await page.goto(ARTICLE, { waitUntil: "load" });
        expect(response?.status()).toBe(200);

        const toc = page.locator(".toc.post-toc");
        await expect(toc).toBeVisible();
        await expect(page.locator(".toc.post-toc .post-toc__title")).toHaveText(/目录|Contents/);

        const links = page.locator(".toc.post-toc .toc-link");
        const count = await links.count();
        expect(count, "无 JS 时的目录条目").toBeGreaterThanOrEqual(3);

        const href = await links.nth(1).getAttribute("href");
        expect(href).toMatch(/^#.+/);
        await links.nth(1).click();
        await page.waitForTimeout(300);

        const target = await page.evaluate((selector) => {
            const el = document.querySelector(selector);
            return el ? el.getBoundingClientRect().top : null;
        }, href ?? "#");
        expect(target).not.toBeNull();
        expect(Math.abs(target as number)).toBeLessThan(160);
        console.log(`[toc] no-js：${count} 个目录链接，点击 ${href} 命中标题`);
    });
});

/* ───────────────────── M6-3 · 移动目录抽屉（390） ───────────────────── */

test.describe("M6-3：移动目录抽屉", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("静态目录卡隐藏 + 抽屉 Esc 关闭且焦点回填", async ({ page }) => {
        await page.goto(ARTICLE, { waitUntil: "load" });
        await page.waitForTimeout(400);

        // 390：右栏的静态目录卡不再占位（否则同一份目录在窄屏出现两次）
        const tocBox = await page.evaluate(() => {
            const toc = document.querySelector(".toc.post-toc");
            if (!toc) return null;
            const rect = toc.getBoundingClientRect();
            const style = getComputedStyle(toc);
            return {
                w: Math.round(rect.width),
                h: Math.round(rect.height),
                display: style.display,
                visibility: style.visibility,
            };
        });
        expect(tocBox, "目录节点必须仍在 HTML 里（构建期渲染）").not.toBeNull();
        expect(
            tocBox!.w === 0 || tocBox!.display === "none" || tocBox!.visibility === "hidden",
            `移动端静态目录卡必须不可见，实测 ${JSON.stringify(tocBox)}`,
        ).toBe(true);

        const trigger = page.locator(".post-toc-trigger");
        await expect(trigger).toBeVisible();
        await expect(trigger).toHaveAttribute("popovertarget", "post-toc-drawer");
        expect((await trigger.innerText()).trim().length).toBeGreaterThan(0);

        await trigger.click();
        await page.waitForTimeout(250);
        const isOpen = () =>
            page.evaluate(
                () => document.getElementById("post-toc-drawer")?.matches(":popover-open") ?? false,
            );
        expect(await isOpen(), "点击「目录」后抽屉必须打开").toBe(true);

        const drawerLinks = page.locator("#post-toc-drawer .toc-link");
        const linkCount = await drawerLinks.count();
        expect(linkCount, "抽屉里的目录条目").toBeGreaterThanOrEqual(3);

        // 抽屉必须贴右侧滑出（不是居中小窗）
        const drawerBox = await page.evaluate(() => {
            const el = document.getElementById("post-toc-drawer");
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return {
                x: Math.round(rect.x),
                right: Math.round(rect.right),
                clientWidth: document.documentElement.clientWidth,
            };
        });
        expect(drawerBox).not.toBeNull();
        expect(drawerBox!.x, "抽屉左边缘应留出遮罩").toBeGreaterThan(0);
        // headless Chromium 用经典滚动条（15px）：抽屉贴的是"可用视口"右沿，不是 clientWidth
        // 右沿 —— 真机 overlay 滚动条下这个差值是 0，这里按滚动条宽度放宽到 16px。
        expect(drawerBox!.clientWidth - drawerBox!.right, "抽屉应贴右边缘").toBeLessThanOrEqual(16);

        await page.keyboard.press("Escape");
        await page.waitForTimeout(250);
        expect(await isOpen(), "Esc 必须关闭抽屉").toBe(false);
        const focused = await page.evaluate(() => document.activeElement?.className ?? "");
        expect(focused, "关闭后焦点必须回到触发按钮").toContain("post-toc-trigger");

        // 点遮罩（抽屉左侧空白）light-dismiss
        await trigger.click();
        await page.waitForTimeout(200);
        await page.mouse.click(6, 420);
        await page.waitForTimeout(250);
        expect(await isOpen(), "点遮罩必须关闭抽屉").toBe(false);

        console.log(
            `[toc] 移动抽屉：${linkCount} 条目录，x=${drawerBox!.x}，Esc/遮罩关闭 + 焦点回填`,
        );
    });
});

test.describe("无 JS：移动目录抽屉仍可用（声明式 popover）", () => {
    test.use({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });

    test("抽屉可开 + 锚点跳转生效", async ({ page }) => {
        const response = await page.goto(ARTICLE, { waitUntil: "load" });
        expect(response?.status()).toBe(200);

        const trigger = page.locator(".post-toc-trigger");
        await expect(trigger).toBeVisible();
        await trigger.click();
        await page.waitForTimeout(400);

        const links = page.locator("#post-toc-drawer .toc-link");
        const count = await links.count();
        expect(count, "无 JS 时抽屉里的目录条目").toBeGreaterThanOrEqual(3);

        const href = await links.nth(1).getAttribute("href");
        expect(href).toMatch(/^#.+/);
        await links.nth(1).click();
        await page.waitForTimeout(400);

        const target = await page.evaluate(
            (selector) => document.querySelector(selector)?.getBoundingClientRect().top ?? null,
            href ?? "#",
        );
        expect(target, "无 JS 点目录必须跳到标题").not.toBeNull();
        expect(Math.abs(target as number)).toBeLessThan(160);
        console.log(`[toc] 移动 no-js：${count} 条目录，点击 ${href} → top=${target}`);
    });
});

/* ───────────────────────── D-0089 · 阅读进度 ───────────────────────── */

test("D-0089：阅读进度条随滚动推进", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ARTICLE, { waitUntil: "load" });
    await page.waitForTimeout(400);

    const readScale = () =>
        page.evaluate(() => {
            const bar = document.querySelector(".reading-progress") as HTMLElement | null;
            if (!bar) return null;
            const transform = getComputedStyle(bar).transform;
            if (transform === "none") return 0;
            const match = transform.match(/matrix\(([^)]+)\)/);
            return match ? Number(match[1].split(",")[0]) : 0;
        });

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    const atTop = await readScale();
    expect(atTop).not.toBeNull();
    expect(atTop as number).toBeLessThan(0.1);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.5));
    await page.waitForTimeout(500);
    const mid = await readScale();
    expect(mid as number, "滚动到一半时进度条应推进").toBeGreaterThan(0.1);
    expect(mid as number).toBeLessThanOrEqual(1);

    console.log(`[progress] scaleX: top=${atTop} mid=${mid}`);
});

/* ───────────────────────── D-0090 · 浏览量 ───────────────────────── */

test("D-0090：浏览量占位带 data-path", async ({ page }) => {
    await page.goto(ARTICLE, { waitUntil: "load" });
    const counter = page.locator('.waline-pageview-count[data-path="/article/bitwarden/"]');
    await expect(counter).toHaveCount(1);
    // 页面进入时是「—」；数字由 Waline 接口回填（不在静态断言里等它的网络）
    expect((await counter.textContent())?.trim().length).toBeGreaterThan(0);
});

/* ───────────────────────── 分享 / 版权 / 相关三块 ───────────────────────── */

test("分享 / 版权 / 相关三块齐备（双端可见）", async ({ page }) => {
    for (const width of [390, 1440] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(ARTICLE, { waitUntil: "load" });

        const share = page.locator(".post-share");
        const license = page.locator(".post-license");
        const related = page.locator(".related-posts");

        await expect(share, `share @${width}`).toHaveCount(1);
        await expect(license, `license @${width}`).toHaveCount(1);
        await expect(related, `related @${width}`).toHaveCount(1);

        await expect(share).toBeVisible();
        await expect(license).toBeVisible();
        await expect(related).toBeVisible();
        await expect(page.locator(".related-posts-item").first()).toBeVisible();

        // 相关文章卡片是链到站内的
        const href = await page.locator(".related-posts-link").first().getAttribute("href");
        expect(href).toMatch(/^\/article\//);
    }
});

/* ───────────────────────── 证据截图（默认跳过） ───────────────────────── */

test.describe("evidence screenshots", () => {
    test.skip(process.env.ARTICLE_SHOTS !== "1", "set ARTICLE_SHOTS=1 to capture");

    const shot = async (page: Page, file: string) => {
        if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
        const target = path.join(EVIDENCE_DIR, file);
        await page.screenshot({ path: target, fullPage: true, animations: "disabled" });
        console.log(`[shot] ${target}`);
        expect(existsSync(target)).toBe(true);
        return target;
    };

    const blockShot = async (page: Page, selector: string, file: string) => {
        if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
        const target = path.join(EVIDENCE_DIR, file);
        await page.locator(selector).first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);
        await page.locator(selector).first().screenshot({ path: target, animations: "disabled" });
        console.log(`[shot] ${target}`);
        expect(existsSync(target)).toBe(true);
        return target;
    };

    for (const theme of THEMES) {
        for (const width of [390, 1440] as const) {
            test(`full-${theme}-${width}`, async ({ page }) => {
                test.setTimeout(120_000);
                await page.setViewportSize({ width, height: 900 });
                await openArticle(page, theme);
                // 滚动一遍触发 lazy 图，再回到顶部
                await page.evaluate(async () => {
                    const step = window.innerHeight;
                    for (let y = 0; y < document.body.scrollHeight; y += step) {
                        window.scrollTo(0, y);
                        await new Promise((resolve) => setTimeout(resolve, 60));
                    }
                    window.scrollTo(0, 0);
                });
                await page.waitForTimeout(300);
                await shot(page, `article-${theme}-${width}.png`);

                await blockShot(page, ".post-share", `share-${theme}-${width}.png`);
                await blockShot(page, ".post-license", `license-${theme}-${width}.png`);
                await blockShot(page, ".related-posts", `related-${theme}-${width}.png`);
                if (width === 1440)
                    await blockShot(page, ".toc.post-toc", `toc-${theme}-${width}.png`);

                // 正文首屏（标题 + 元信息 + 封面）
                await blockShot(page, ".post-masthead", `masthead-${theme}-${width}.png`);
            });
        }
    }
});
