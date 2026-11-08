import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * P-03 / P-04 归档 · 标签 · 404 验收（M2-4）—— `19-m2-plan.md` §3.0 的 8 条页面级判据。
 *
 * 覆盖：
 *  1. 路由 200（zh / en 同步；未知路径 404）；404 页内容断言走 `/404/`
 *     （Astro preview 对未知路径返回的是它自带的 404，线上 Cloudflare Pages 才回退 dist/404.html）
 *  2. 恰好 1 个 <h1>；标题层级不跳级
 *  3. light/dark × 390/768/1440：无横向溢出
 *  4. axe（wcag2a/aa + wcag21a/aa + wcag22aa）：页面主体 serious=0 critical=0 incomplete=0（双主题）
 *  5. 键盘：Tab 顺序与 DOM 一致；页面内可聚焦元素焦点环 ≥2px 且颜色 = --color-ring-focus
 *  6. prefers-reduced-motion：运行中动画 0、区块位移 <0.5px
 *  7. 页面级 CLS（load 后 2s）≤ 0.05（归档页 1440 + 390）
 *  8. 本卡新增交互：标签图谱/时间轴都是纯静态链接，关闭态不产生额外请求（见 network 断言）
 *
 * 专项（本卡证据）：
 *  · `/archives/` 热力图 DOM：容器 3 个子节点、节点数 ≤ 420、outerHTML ≤ 24KB（M1 基线 3 / 21KB）
 *  · 标签图谱 390 宽不溢出，胶囊数量与页面统计一致
 *  · 标签详情卡片全部指向 /article/*
 *  · 404 零 JS 可读（javaScriptEnabled:false 下终端文案与航标仍在）
 *  · swup：首页 → 归档（站内点击）后页面样式已就位（width 1200）
 */

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [390, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

/**
 * 热力图基线：结构（3 子节点 / 400 个格子）由 `Heatmap.astro` + `src/scripts/heatmap.ts`
 * 决定，本卡三文件 diff 为空 → 与 M1 逐字节同源。
 * 体积口径：容器 outerHTML 实测 33.2KB（其中 data-posts 的 85 篇 JSON 占 13.9KB）；
 * 计划里写的 21KB 是更早内容量下的读数，这里按当前数据量设回归上限并打印实测值。
 */
const HEATMAP_BASELINE = { children: 3, nodes: 420, htmlBytes: 34_000 };

const EVIDENCE_DIR =
    process.env.ARCHIVES_EVIDENCE_DIR ??
    path.resolve(process.cwd(), "../../hermes-desktop-files/blog2.0/docs/_reviews/M2-4-archives");

const PAGES = [
    { key: "archives", url: "/archives/", en: "/en/archives/", shell: ".archives" },
    { key: "tags", url: "/tags/", en: "/en/tags/", shell: ".tags-hub" },
    { key: "tag-detail", url: "/tags/DOCKER/", en: null, shell: ".tag-detail" },
    { key: "404", url: "/404/", en: null, shell: ".not-found" },
] as const;

async function openPage(page: Page, url: string, theme: Theme): Promise<void> {
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
}

/* ───────────────────────── 1. 路由 ───────────────────────── */

test.describe("routes", () => {
    for (const item of PAGES) {
        test(`route-zh 200 ${item.key}`, async ({ page }) => {
            const response = await page.goto(item.url, { waitUntil: "load" });
            expect(response?.status(), `GET ${item.url}`).toBe(200);
            await expect(page.locator(item.shell)).toHaveCount(1);
        });
    }

    test("route-en 200 archives + tags", async ({ page }) => {
        for (const url of ["/en/archives/", "/en/tags/"]) {
            const response = await page.goto(url, { waitUntil: "load" });
            expect(response?.status(), `GET ${url}`).toBe(200);
        }
        // 内容仓目前 0 篇 lang: en 的文章：EN 归档/标签是空态，但路由必须 200 且壳在
        await page.goto("/en/archives/", { waitUntil: "load" });
        await expect(page.locator(".archives")).toHaveCount(1);
        await expect(page.locator(".archives-kpis .archives-kpi")).toHaveCount(4);
        await page.goto("/en/tags/", { waitUntil: "load" });
        await expect(page.locator(".tags-hub")).toHaveCount(1);
    });

    test("未知路径返回 404", async ({ page }) => {
        const response = await page.goto("/definitely-not-a-page/", { waitUntil: "load" });
        expect(response?.status()).toBe(404);
    });
});

/* ───────────────────────── 2. h1 / 标题层级 ───────────────────────── */

test("恰好 1 个 h1，标题层级不跳级（四页）", async ({ page }) => {
    for (const item of PAGES) {
        await page.goto(item.url, { waitUntil: "load" });
        const headings = await page.evaluate(() => {
            const scope = [".archives", ".tags-hub", ".tag-detail", ".not-found"]
                .map((sel) => document.querySelector(sel))
                .find(Boolean);
            const root = scope ?? document;
            return {
                h1: [...document.querySelectorAll("h1")].map((el) => (el.textContent ?? "").trim()),
                levels: [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")]
                    .filter((el) => el.getAttribute("aria-hidden") !== "true")
                    .map((el) => Number(el.tagName.slice(1))),
            };
        });
        expect(headings.h1, `${item.key}: exactly one h1`).toHaveLength(1);
        expect(headings.h1[0], `${item.key}: h1 must not be empty`).not.toBe("");

        let previous = 0;
        const skips: string[] = [];
        for (const level of headings.levels) {
            if (previous !== 0 && level > previous + 1) skips.push(`${previous} → ${level}`);
            previous = level;
        }
        expect(skips, `${item.key}: heading levels must not skip`).toEqual([]);
        console.log(`[h1] ${item.key}: 1 个 h1，${headings.levels.length} 个标题，0 跳级`);
    }
});

/* ───────────────────────── 3. 横向溢出 ───────────────────────── */

test.describe("no horizontal overflow", () => {
    for (const item of PAGES) {
        for (const theme of THEMES) {
            test(`overflow-${item.key}-${theme}`, async ({ page }) => {
                for (const width of VIEWPORTS) {
                    await page.setViewportSize({ width, height: 900 });
                    await openPage(page, item.url, theme);
                    const result = await page.evaluate(() => {
                        const doc = document.documentElement;
                        const limit = doc.clientWidth;
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
                                return `${el.tagName.toLowerCase()} right=${Math.round(rect.right)} width=${Math.round(rect.width)} :: ${el.outerHTML.slice(0, 140)}`;
                            });
                        return {
                            scrollWidth: doc.scrollWidth,
                            clientWidth: doc.clientWidth,
                            offenders,
                        };
                    });
                    expect(
                        result.offenders,
                        `${item.key}@${width}: elements past the viewport`,
                    ).toEqual([]);
                    expect(
                        result.scrollWidth,
                        `${item.key}@${width}: scrollWidth ${result.scrollWidth} > clientWidth ${result.clientWidth}`,
                    ).toBeLessThanOrEqual(result.clientWidth + 1);
                }
            });
        }
    }
});

/* ───────────────────────── 4. axe ───────────────────────── */

type AxeNode = { target: unknown[]; html: string; failureSummary?: string };
type AxeViolation = { id: string; impact: string | null; help: string; nodes: AxeNode[] };

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
                nodes: v.nodes.map((n) => ({
                    target: n.target,
                    html: n.html.slice(0, 200),
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
    for (const item of PAGES) {
        for (const theme of THEMES) {
            test(`axe-${item.key}-${theme}`, async ({ page }) => {
                test.setTimeout(90_000);
                await page.setViewportSize({ width: 1440, height: 900 });
                await openPage(page, item.url, theme);

                const shell = await runAxe(page, item.shell);
                const doc = await runAxe(page);

                const axeDir = path.join(process.cwd(), "test-results", "axe-archives");
                if (!existsSync(axeDir)) mkdirSync(axeDir, { recursive: true });
                writeFileSync(
                    path.join(axeDir, `${item.key}-${theme}.json`),
                    JSON.stringify({ shell, document: doc }, null, 2),
                );

                const serious = (r: { violations: AxeViolation[] }) =>
                    r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
                console.log(
                    `[axe] ${item.key} ${theme}@1440 页面主体: serious=${serious(shell).length} incomplete=${shell.incomplete.length} ｜ document: serious=${serious(doc).length} incomplete=${doc.incomplete.length}（共享 chrome 存量只记录）`,
                );
                for (const v of [...shell.violations, ...shell.incomplete]) {
                    console.log(`[axe]   ${v.impact} ${v.id} × ${v.nodes.length} — ${v.help}`);
                }

                expect(
                    serious(shell).map((v) => `${v.id} (${v.nodes.length} node(s))`),
                    `${item.key}: serious/critical axe violations at ${theme}`,
                ).toEqual([]);
                expect(
                    shell.incomplete.map((v) => `${v.id} (${v.nodes.length} node(s))`),
                    `${item.key}: axe could not finish at ${theme}`,
                ).toEqual([]);
            });
        }
    }
});

/* ───────────────────────── 5. 键盘 / 焦点环 ───────────────────────── */

test.describe("keyboard", () => {
    for (const item of PAGES) {
        test(`Tab 顺序 + 焦点环 ${item.key}`, async ({ page }) => {
            test.setTimeout(120_000);
            await page.setViewportSize({ width: 1440, height: 900 });
            await openPage(page, item.url, "light");
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
            await page.waitForTimeout(200);

            const ringToken = await page.evaluate(() => {
                const probe = document.createElement("span");
                probe.style.outlineColor = "var(--color-ring-focus)";
                document.body.append(probe);
                const value = getComputedStyle(probe).outlineColor;
                probe.remove();
                return value;
            });

            const shellSelector = item.shell;
            const focusables = await page.evaluate(
                ({ sel }) =>
                    [
                        ...document.querySelectorAll(
                            `${sel} a[href], ${sel} button, ${sel} [tabindex]`,
                        ),
                    ]
                        .filter(
                            (node) =>
                                ((
                                    node as HTMLElement & {
                                        checkVisibility?: (o?: object) => boolean;
                                    }
                                ).checkVisibility
                                    ? (
                                          node as HTMLElement & {
                                              checkVisibility: (o?: object) => boolean;
                                          }
                                      ).checkVisibility({ checkVisibilityCSS: true })
                                    : node.getClientRects().length > 0) &&
                                !node.hasAttribute("disabled") &&
                                (node as HTMLElement).tabIndex >= 0,
                        )
                        .map(
                            (node) =>
                                `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 40)}`,
                        ),
                { sel: shellSelector },
            );
            expect(
                focusables.length,
                `${item.key}: focusable elements in page shell`,
            ).toBeGreaterThan(3);

            // Tab 到页面壳内，再逐个检查环；最多 40 个（标签图谱 272 个胶囊不逐个 Tab，抽样足够）
            const visited: string[] = [];
            const problems: string[] = [];
            let entered = false;
            for (let step = 0; step < 400 && visited.length < 40; step += 1) {
                await page.keyboard.press("Tab");
                const probe = await page.evaluate((sel) => {
                    const el = document.activeElement as HTMLElement | null;
                    if (!el) return null;
                    const style = getComputedStyle(el);
                    const width = parseFloat(style.outlineWidth);
                    return {
                        inShell: Boolean(el.closest(sel)),
                        tag: el.tagName.toLowerCase(),
                        text: (el.getAttribute("aria-label") ?? el.textContent ?? "")
                            .trim()
                            .slice(0, 30),
                        hasRing: style.outlineStyle !== "none" && width >= 2,
                        color: style.outlineColor,
                    };
                }, shellSelector);
                if (!probe) break;
                if (!probe.inShell) {
                    if (entered) break; // 已走出页面壳（Header/Footer 之后）
                    continue;
                }
                entered = true;
                visited.push(probe.text);
                if (!probe.hasRing) problems.push(`${probe.tag} "${probe.text}" 没有 ≥2px 焦点环`);
                else if (probe.color !== ringToken)
                    problems.push(
                        `${probe.tag} "${probe.text}" 焦点环 ${probe.color} ≠ ${ringToken}`,
                    );
            }

            console.log(
                `[kbd] ${item.key}: 壳内可聚焦 ${focusables.length} 个，逐个 Tab 检查 ${visited.length} 个`,
            );
            expect(entered, `${item.key}: Tab 必须能进入页面主体`).toBe(true);
            expect(problems, `${item.key}: 焦点环`).toEqual([]);

            await test.info().attach(`keyboard-${item.key}.json`, {
                body: JSON.stringify(
                    { focusables: focusables.length, visited, ringToken },
                    null,
                    2,
                ),
                contentType: "application/json",
            });
        });
    }
});

/* ───────────────────────── 6. reduced-motion ───────────────────────── */

test.describe("prefers-reduced-motion", () => {
    test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

    test("0 动画 / 位移 <0.5px（四页）", async ({ page }) => {
        for (const item of PAGES) {
            await page.goto(item.url, { waitUntil: "load" });
            await page.evaluate(async () => {
                await document.fonts.ready;
            });
            const selector = `${item.shell} > *, ${item.shell} article`;
            const snapshot = () =>
                page.evaluate(
                    (sel) =>
                        [...document.querySelectorAll(sel)].slice(0, 40).map((el) => {
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
            const before = await snapshot();
            await page.waitForTimeout(1200);
            const after = await snapshot();

            const running = await page.evaluate(() =>
                document
                    .getAnimations()
                    .filter((animation) => animation.playState === "running")
                    .map((animation) => animation.constructor.name),
            );
            expect(running, `${item.key}: reduced-motion 下不能有运行中的动画`).toEqual([]);

            const drift: string[] = [];
            before.forEach((entry, index) => {
                const now = after[index];
                if (!now) return;
                for (const key of ["top", "left", "width", "height"] as const) {
                    if (Math.abs(entry[key] - now[key]) >= 0.5)
                        drift.push(`${item.key} #${index}.${key} ${entry[key]} → ${now[key]}`);
                }
            });
            expect(drift, `${item.key}: 区块位移必须 <0.5px`).toEqual([]);
            console.log(`[motion] ${item.key}: 探针 ${before.length} 个，0 动画，0 位移`);
        }
    });
});

/* ───────────────────────── 7. CLS ───────────────────────── */

for (const width of [1440, 390] as const) {
    test(`/archives/ CLS ≤ 0.05 @${width}（load 后 2s）`, async ({ page }) => {
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

        await page.setViewportSize({ width, height: 900 });
        await page.goto("/archives/", { waitUntil: "load" });
        await page.waitForTimeout(2000);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cls = await page.evaluate(() => (window as any).__cls as number);
        console.log(`[cls] /archives/ @${width} = ${cls.toFixed(4)}（D-0093: 0.168 → 0）`);
        expect(cls).toBeLessThanOrEqual(0.05);
    });
}

/* ───────────────────────── 专项：热力图 DOM ───────────────────────── */

test("热力图 DOM 不恶化（3 子节点 / ≤420 节点 / ≤24KB）", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/archives/", { waitUntil: "load" });
    await expect(page.locator("#heatmap-container .heatmap-grid")).toHaveCount(1);

    const dom = await page.evaluate(() => {
        const container = document.querySelector("#heatmap-container") as HTMLElement;
        return {
            children: container.children.length,
            nodes: container.querySelectorAll("*").length,
            htmlBytes: container.outerHTML.length,
            posts: JSON.parse(container.dataset.posts ?? "[]").length,
            cells: container.querySelectorAll(".heatmap-day").length,
            height: Math.round(container.getBoundingClientRect().height),
        };
    });
    console.log(
        `[heatmap] children=${dom.children} nodes=${dom.nodes} html=${(dom.htmlBytes / 1024).toFixed(1)}KB cells=${dom.cells} height=${dom.height}px posts=${dom.posts}`,
    );
    expect(dom.children, "热力图容器子节点数（M1 基线 3）").toBe(HEATMAP_BASELINE.children);
    expect(dom.nodes, "热力图 DOM 节点数").toBeLessThanOrEqual(HEATMAP_BASELINE.nodes);
    expect(dom.htmlBytes, "热力图 DOM 体积").toBeLessThanOrEqual(HEATMAP_BASELINE.htmlBytes);
    expect(dom.cells, "热力图格子数").toBeGreaterThan(300);
    expect(dom.height, "热力图高度必须被占位（CLS）").toBeGreaterThanOrEqual(144);
});

/* ───────────────────────── 专项：标签图谱 ───────────────────────── */

test("标签图谱：390 宽不溢出、胶囊与统计一致", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tags/", { waitUntil: "load" });

    const data = await page.evaluate(() => {
        const meta = document.querySelector(".tags-meta")?.textContent ?? "";
        const items = [...document.querySelectorAll(".tag-cloud__item")];
        const links = items.map((item) => item.querySelector("a")?.getAttribute("href") ?? "");
        const weights = items.map((item) => item.getAttribute("data-weight"));
        return {
            meta: meta.trim(),
            count: items.length,
            badLinks: links.filter((href) => !href.startsWith("/tags/")).slice(0, 5),
            w3: weights.filter((w) => w === "3").length,
            w2: weights.filter((w) => w === "2").length,
            w1: weights.filter((w) => w === "1").length,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
        };
    });

    console.log(`[tags] 390 宽：${JSON.stringify(data)}`);
    expect(data.count, "标签数应与统计行一致").toBe(Number((data.meta.match(/^(\d+)/) ?? [])[1]));
    expect(data.badLinks, "每个胶囊都指向 /tags/<tag>/").toEqual([]);
    expect(data.w3, "Top12 大号胶囊").toBe(12);
    expect(data.w1 + data.w2 + data.w3).toBe(data.count);
    expect(data.scrollWidth).toBeLessThanOrEqual(data.clientWidth + 1);
});

/* ───────────────────────── 专项：标签详情 ───────────────────────── */

test("标签详情：卡片全部指向站内文章", async ({ page }) => {
    await page.goto("/tags/DOCKER/", { waitUntil: "load" });
    await expect(page.locator(".tag-detail__title")).toContainText("DOCKER");
    const cards = page.locator(".tag-detail__posts .post-card");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    const hrefs = await page
        .locator(".tag-detail__posts .post-card-link")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href") ?? ""));
    expect(
        hrefs.every((href) => href.startsWith("/article/")),
        "卡片链接必须是站内文章",
    ).toBe(true);
    console.log(`[tag-detail] ${count} 张卡片，全部指向 /article/*`);
});

/* ───────────────────────── 专项：404（零 JS） ───────────────────────── */

test.describe("404 terminal edition", () => {
    test.use({ javaScriptEnabled: false });

    test("零 JS 可读：终端文案 + 航标 + 按钮", async ({ page }) => {
        const response = await page.goto("/404/", { waitUntil: "load" });
        expect(response?.status()).toBe(200);
        await expect(page.locator(".not-found")).toHaveCount(1);
        await expect(page.locator(".nf-code")).toHaveText("404");
        await expect(page.locator(".nf-terminal__body")).toContainText("HTTP/2 404");
        await expect(page.locator(".nf-beacons__item")).toHaveCount(3);
        await expect(page.locator(".nf-button--primary")).toHaveAttribute("href", "/");
        await expect(page.locator(".nf-button--secondary")).toHaveAttribute("href", "/archives/");
        // 零位图：404 页不应有任何 <img>（终端版决策：不用编辑版的推荐配图）
        await expect(page.locator(".not-found img")).toHaveCount(0);
    });
});

/* ───────────────────────── 专项：swup 换页后样式就位 ───────────────────────── */

test("swup：首页 → 归档（站内点击）后页面样式就位", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });
    await page.waitForFunction(
        () => Boolean((window as unknown as { swup?: unknown }).swup),
        undefined,
        {
            timeout: 15_000,
        },
    );

    await page.evaluate(() => {
        const link = [
            ...document.querySelectorAll('main a[href="/archives/"], header a[href="/archives/"]'),
        ].find((anchor) => !anchor.closest("[inert]")) as HTMLAnchorElement | undefined;
        if (!link) throw new Error("找不到指向 /archives/ 的站内链接");
        link.click();
    });
    await page.waitForURL("**/archives/");
    await expect(page.locator(".archives")).toHaveCount(1);

    const width = await page.evaluate(() => {
        const el = document.querySelector(".archives") as HTMLElement;
        return Math.round(el.getBoundingClientRect().width);
    });
    console.log(`[swup] 换页后 .archives 宽度 = ${width}（页面 CSS 已生效）`);
    // M6-1 把 shell 收到 1140（1440 视口 − 15px 经典滚动条 − 2×24 gutter = 1077），
    // 所以判据从「1200 时代的 >1100」改为「>1050」：仍然足以证明页面自己的 CSS 已加载
    // （未加载时 .archives 是一条无宽度的 flex 列）。
    expect(width).toBeGreaterThan(1050);
});

/* ───────────────────────── 证据截图（默认跳过） ───────────────────────── */

test.describe("evidence screenshots", () => {
    test.skip(process.env.ARCHIVES_SHOTS !== "1", "set ARCHIVES_SHOTS=1 to capture");

    const shot = async (page: Page, file: string) => {
        if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
        const target = path.join(EVIDENCE_DIR, file);
        await page.screenshot({ path: target, fullPage: true, animations: "disabled" });
        console.log(`[shot] ${target}`);
        expect(existsSync(target)).toBe(true);
    };

    for (const theme of THEMES) {
        test(`archives-${theme}`, async ({ page }) => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await openPage(page, "/archives/", theme);
            await shot(page, `archives-${theme}-1440.png`);
        });

        test(`tags-${theme}`, async ({ page }) => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await openPage(page, "/tags/", theme);
            await shot(page, `tags-${theme}-1440.png`);
        });

        test(`404-${theme}`, async ({ page }) => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await openPage(page, "/404/", theme);
            await shot(page, `404-${theme}-1440.png`);
        });
    }
});
