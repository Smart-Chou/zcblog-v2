import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * P-06 随笔 / P-07 赞赏 验收（M2-6b）
 *
 * 覆盖（`19-m2-plan.md` §3.0 的页面级判据 + 本卡专项）：
 *  1. 路由 200：`/talks/`、`/en/talks/`、`/donate/`、`/en/donate/`
 *  2. 恰好 1 个 <h1>；标题层级不跳级（两页、双语言）
 *  3. light/dark × 390/768/1440：无横向溢出
 *  4. axe（wcag2a/aa + wcag21a/aa + wcag22aa）：页面主体 serious=0 critical=0 incomplete=0（双主题）
 *  5. 键盘：Tab 能进页面主体；壳内可聚焦元素焦点环 ≥2px 且颜色 = --color-ring-focus
 *  6. prefers-reduced-motion：运行中动画 0、区块位移 <0.5px
 *  7. 页面级 CLS（load 后 2s）≤ 0.05 @1440 / 390
 *  8. 契约：
 *      · 随笔 —— 卡片数 = adapter total；原文外链 target=_blank + rel noopener；配图带尺寸
 *      · 赞赏 —— 收款方式数 = 注入数且每张码图都有 alt/src；页面里 0 个空 src
 *  9. 空态 / 错误态：用真实构建产出（`PUBLIC_TALKS_STATE` / `PUBLIC_DONATE_STATE`）断言，
 *     证明「数据缺失/损坏 → 仍 200」不是 mock，而是同一条构建链
 * 10. 6 张证据截图（两页 × light/dark 1440 + light 390）
 */

const ROOT = process.cwd();
const AXE_SOURCE = readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [390, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

const TALKS = { key: "talks", url: "/talks/", en: "/en/talks/", shell: ".talks" } as const;
const DONATE = { key: "donate", url: "/donate/", en: "/en/donate/", shell: ".donations" } as const;
const PAGES = [TALKS, DONATE] as const;

const EVIDENCE_DIR =
    process.env.M26B_EVIDENCE_DIR ??
    path.resolve(ROOT, "../../hermes-desktop-files/blog2.0/docs/_reviews/M2-6b-talks-donate");

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
    // 主题切换会触发元素上的 color / background-color 过渡（最长 --duration-slow 350ms）。
    // 过渡没走完时 getComputedStyle 返回的是**插值中间色**，axe 会按中间色算对比度 →
    // 假红（实测偶发 2.89 / 1.5 这种「浅底深字/深底浅字」混色）。等过渡落定再测。
    await page.waitForTimeout(420);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

/* ───────────────────────── 1. 路由 + 状态属性 ───────────────────────── */

test.describe("routes", () => {
    for (const page_ of PAGES) {
        for (const [lang, url] of [
            ["zh", page_.url],
            ["en", page_.en],
        ] as const) {
            test(`route 200 ${page_.key} ${lang}`, async ({ page }) => {
                const response = await page.goto(url, { waitUntil: "load" });
                expect(response?.status(), `GET ${url}`).toBe(200);
                await expect(page.locator(page_.shell)).toHaveCount(1);
                await expect(page.locator(`${page_.shell} h1`)).toHaveCount(1);
            });
        }
    }

    test("两页的中英文档同源：状态与条数一致", async ({ page }) => {
        const read = async (url: string, shell: string, attrs: string[]) => {
            await page.goto(url, { waitUntil: "load" });
            const out: Record<string, string | null> = {};
            for (const attr of attrs) out[attr] = await page.locator(shell).getAttribute(attr);
            return out;
        };
        const talksZh = await read(TALKS.url, TALKS.shell, [
            "data-talks-status",
            "data-talks-total",
        ]);
        const talksEn = await read(TALKS.en, TALKS.shell, [
            "data-talks-status",
            "data-talks-total",
        ]);
        expect(talksZh["data-talks-total"]).toBe(talksEn["data-talks-total"]);
        expect(talksZh["data-talks-status"]).toBe("ok");

        const donateZh = await read(DONATE.url, DONATE.shell, [
            "data-donate-status",
            "data-donate-total",
            "data-donate-accounts",
        ]);
        const donateEn = await read(DONATE.en, DONATE.shell, [
            "data-donate-status",
            "data-donate-total",
            "data-donate-accounts",
        ]);
        expect(donateZh).toEqual(donateEn);
        expect(donateZh["data-donate-accounts"]).toBe("3");
    });
});

/* ───────────────────────── 2. h1 / 标题层级 ───────────────────────── */

test("恰好 1 个 h1，标题层级不跳级（两页双语言）", async ({ page }) => {
    for (const page_ of PAGES) {
        for (const url of [page_.url, page_.en]) {
            await page.goto(url, { waitUntil: "load" });
            const headings = await page.evaluate((sel) => {
                const root = document.querySelector(sel) ?? document;
                return {
                    total1: document.querySelectorAll("h1").length,
                    inShell: [...root.querySelectorAll("h1")].length,
                    levels: [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")]
                        .filter((el) => el.getAttribute("aria-hidden") !== "true")
                        .map((el) => Number(el.tagName.slice(1))),
                };
            }, page_.shell);

            expect(headings.total1, `${url}: 整页只能有 1 个 h1`).toBe(1);
            expect(headings.inShell, `${url}: h1 必须落在页面主体内`).toBe(1);

            let previous = 0;
            const skips: string[] = [];
            for (const level of headings.levels) {
                if (previous !== 0 && level > previous + 1) skips.push(`${previous} → ${level}`);
                previous = level;
            }
            expect(skips, `${url}: 标题层级必须连续`).toEqual([]);
            console.log(`[h1] ${url}: 1 个 h1，${headings.levels.length} 个标题，0 跳级`);
        }
    }
});

/* ───────────────────────── 3. 横向溢出 ───────────────────────── */

for (const page_ of PAGES) {
    test(`overflow ${page_.key}（light/dark × 390/768/1440）`, async ({ page }) => {
        for (const theme of THEMES) {
            for (const width of VIEWPORTS) {
                await page.setViewportSize({ width, height: 900 });
                await openPage(page, page_.url, theme);
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
                            return `${el.tagName.toLowerCase()} right=${Math.round(rect.right)} width=${Math.round(rect.width)} :: ${el.outerHTML.slice(0, 120)}`;
                        });
                    return {
                        scrollWidth: doc.scrollWidth,
                        clientWidth: doc.clientWidth,
                        offenders,
                    };
                });
                expect(result.offenders, `${page_.key}@${width} (${theme}): 越界元素`).toEqual([]);
                expect(
                    result.scrollWidth,
                    `${page_.key}@${width} (${theme}): scrollWidth ${result.scrollWidth} > clientWidth ${result.clientWidth}`,
                ).toBeLessThanOrEqual(result.clientWidth + 1);
            }
        }
    });
}

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

for (const page_ of PAGES) {
    test(`axe ${page_.key}（页面主体 serious=0 / incomplete=0，双主题）`, async ({ page }) => {
        test.setTimeout(120_000);
        const axeDir = path.join(ROOT, "test-results", "axe-m26b");
        if (!existsSync(axeDir)) mkdirSync(axeDir, { recursive: true });

        for (const theme of THEMES) {
            await page.setViewportSize({ width: 1440, height: 900 });
            await openPage(page, page_.url, theme);

            // 对比度是静态属性：把过渡/动画关掉再量，避免拿到插值中间色（见 openPage 注释）。
            await page.addStyleTag({
                content:
                    "*, *::before, *::after { transition: none !important; animation: none !important; }",
            });

            const shell = await runAxe(page, page_.shell);
            const doc = await runAxe(page);

            writeFileSync(
                path.join(axeDir, `${page_.key}-${theme}.json`),
                JSON.stringify({ shell, document: doc }, null, 2),
            );

            const serious = (r: { violations: AxeViolation[] }) =>
                r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
            console.log(
                `[axe] ${page_.key} ${theme}@1440 页面主体: serious=${serious(shell).length} incomplete=${shell.incomplete.length} ｜ document: serious=${serious(doc).length} incomplete=${doc.incomplete.length}（共享 chrome 存量只记录）`,
            );
            for (const v of [...shell.violations, ...shell.incomplete]) {
                console.log(`[axe]   ${v.impact} ${v.id} × ${v.nodes.length} — ${v.help}`);
                for (const node of v.nodes.slice(0, 3)) console.log(`[axe]     ${node.html}`);
            }

            expect(
                serious(shell).map((v) => `${v.id} (${v.nodes.length} node(s))`),
                `${page_.key}: serious/critical axe violations at ${theme}`,
            ).toEqual([]);
            expect(
                shell.incomplete.map((v) => `${v.id} (${v.nodes.length} node(s))`),
                `${page_.key}: axe could not finish at ${theme}`,
            ).toEqual([]);
        }
    });
}

/* ───────────────────────── 5. 键盘 / 焦点环 ───────────────────────── */

test("Tab 顺序 + 焦点环 ≥2px 且 = --color-ring-focus（两页）", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const page_ of PAGES) {
        await openPage(page, page_.url, "light");
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

        const focusables = await page.evaluate(
            (sel) =>
                [...document.querySelectorAll(`${sel} a[href], ${sel} button, ${sel} [tabindex]`)]
                    .filter(
                        (node) =>
                            ((node as HTMLElement & { checkVisibility?: (o?: object) => boolean })
                                .checkVisibility
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
            page_.shell,
        );
        const minFocusables = page_.key === "talks" ? 5 : 1;
        expect(focusables.length, `${page_.key}: 页面主体的可聚焦元素`).toBeGreaterThanOrEqual(
            minFocusables,
        );

        const visited: string[] = [];
        const problems: string[] = [];
        let entered = false;
        for (let step = 0; step < 400 && visited.length < 60; step += 1) {
            await page.keyboard.press("Tab");
            const probe = await page.evaluate((sel) => {
                const el = document.activeElement as HTMLElement | null;
                if (!el) return null;
                const style = getComputedStyle(el);
                return {
                    inShell: Boolean(el.closest(sel)),
                    tag: el.tagName.toLowerCase(),
                    text: (el.getAttribute("aria-label") ?? el.textContent ?? "")
                        .trim()
                        .slice(0, 30),
                    hasRing: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2,
                    color: style.outlineColor,
                };
            }, page_.shell);
            if (!probe) break;
            if (!probe.inShell) {
                if (entered) break; // 已走出页面主体（Header/Footer/评论区之后）
                continue;
            }
            entered = true;
            visited.push(probe.text);
            if (!probe.hasRing)
                problems.push(`${page_.key}: ${probe.tag} "${probe.text}" 无 ≥2px 焦点环`);
            else if (probe.color !== ringToken)
                problems.push(
                    `${page_.key}: ${probe.tag} "${probe.text}" 焦点环 ${probe.color} ≠ ${ringToken}`,
                );
        }

        console.log(
            `[kbd] ${page_.key}: 壳内可聚焦 ${focusables.length} 个，逐个 Tab 检查 ${visited.length} 个`,
        );
        expect(entered, `${page_.key}: Tab 必须能进入页面主体`).toBe(true);
        expect(visited.length, `${page_.key}: 至少走到正文内链`).toBeGreaterThanOrEqual(
            page_.key === "talks" ? 3 : 1,
        );
        expect(problems, `${page_.key}: 焦点环`).toEqual([]);
    }
});

/* ───────────────────────── 6. reduced-motion ───────────────────────── */

test.describe("prefers-reduced-motion", () => {
    test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

    test("0 运行中动画 / 位移 <0.5px（两页）", async ({ page }) => {
        for (const page_ of PAGES) {
            await page.goto(page_.url, { waitUntil: "load" });
            await page.evaluate(async () => {
                await document.fonts.ready;
            });
            const selector = `${page_.shell} > *, ${page_.shell} .essay-card, ${page_.shell} .qr-card, ${page_.shell} .donator`;
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
            expect(running, `${page_.key}: reduced-motion 下不能有运行中的动画`).toEqual([]);

            const drift: string[] = [];
            before.forEach((entry, index) => {
                const now = after[index];
                if (!now) return;
                for (const key of ["top", "left", "width", "height"] as const) {
                    if (Math.abs(entry[key] - now[key]) >= 0.5)
                        drift.push(`${page_.key} #${index}.${key} ${entry[key]} → ${now[key]}`);
                }
            });
            expect(drift, `${page_.key}: 区块位移必须 <0.5px`).toEqual([]);
            console.log(`[motion] ${page_.key}: 探针 ${before.length} 个，0 动画，0 位移`);
        }
    });
});

/* ───────────────────────── 7. CLS ───────────────────────── */

for (const page_ of PAGES) {
    for (const width of [1440, 390] as const) {
        test(`${page_.url} CLS ≤ 0.05 @${width}（load 后 2s）`, async ({ page }) => {
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
            await page.goto(page_.url, { waitUntil: "load" });
            await page.waitForTimeout(2000);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cls = await page.evaluate(() => (window as any).__cls as number);
            console.log(`[cls] ${page_.url} @${width} = ${cls.toFixed(4)}`);
            expect(cls).toBeLessThanOrEqual(0.05);
        });
    }
}

/* ───────────────────────── 8. 随笔卡片契约 ───────────────────────── */

test("随笔契约：卡片数 = adapter total / 外链安全属性 / 配图带尺寸与 alt", async ({ page }) => {
    await page.goto(TALKS.url, { waitUntil: "load" });
    const total = Number(await page.locator(TALKS.shell).getAttribute("data-talks-total"));
    expect(total, "adapter 应读到站点随笔").toBeGreaterThan(0);

    const rows = await page.evaluate((sel) => {
        return [...document.querySelectorAll(`${sel} .essay-card`)].map((card) => {
            const source = card.querySelector(".essay-card__source");
            return {
                id: card.getAttribute("data-talk-id") ?? "",
                text: (card.querySelector(".essay-card__text")?.textContent ?? "").trim(),
                tags: [...card.querySelectorAll(".essay-card__tag")].map((el) =>
                    (el.textContent ?? "").trim(),
                ),
                href: source?.getAttribute("href") ?? null,
                target: source?.getAttribute("target") ?? null,
                rel: source?.getAttribute("rel") ?? null,
                images: [...card.querySelectorAll(".essay-card__image")].map((img) => ({
                    src: img.getAttribute("src") ?? "",
                    alt: img.getAttribute("alt"),
                    width: img.getAttribute("width"),
                    height: img.getAttribute("height"),
                })),
            };
        });
    }, TALKS.shell);

    expect(rows).toHaveLength(total);
    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size, "随笔 id 必须唯一（锚点/去重）").toBe(ids.length);

    for (const row of rows) {
        expect(row.text, "正文不能为空").not.toBe("");
        expect(row.text.includes("#"), "话题标签已从正文剔除").toBe(false);
        if (row.href !== null) {
            expect(row.href).toMatch(/^https?:\/\//);
            expect(row.target).toBe("_blank");
            expect(row.rel).toContain("noopener");
        }
        for (const image of row.images) {
            expect(image.src).toMatch(/^(https?:\/\/|\/assets\/)/);
            expect(image.alt, "配图必须有可读 alt").toBeTruthy();
            expect(image.width, "配图带显式宽度（防 CLS）").toBeTruthy();
            expect(image.height).toBeTruthy();
        }
    }
    console.log(
        `[cards] ${rows.length} 条随笔，${rows.reduce((sum, row) => sum + row.images.length, 0)} 张配图，id 唯一`,
    );
});

/* ───────────────────────── 9. 赞赏契约（含「不渲染空图」） ───────────────────────── */

test("赞赏契约：收款方式 = 注入数，每张码图有 src+alt，页面 0 个空 src", async ({ page }) => {
    const response = await page.goto(DONATE.url, { waitUntil: "load" });
    expect(response?.status()).toBe(200);

    const accounts = Number(await page.locator(DONATE.shell).getAttribute("data-donate-accounts"));
    const total = Number(await page.locator(DONATE.shell).getAttribute("data-donate-total"));
    const status = await page.locator(DONATE.shell).getAttribute("data-donate-status");
    expect(accounts, "注入点有 3 种收款方式").toBe(3);
    // M8-6-4：账本里的 4 条占位人名（张三/李四/吴十/郑十一）已按验收清空 → 默认构建走真实空态。
    // 这里不再假设「账本一定有数据」，而是按 status 分支断言（ok 必须有条目，empty 必须 total=0）。
    if (status === "ok") {
        expect(total, "ok 态：账本必须真的有条目").toBeGreaterThan(0);
    } else {
        expect(status, "非 ok 态只能是 empty（账本为空，不编造记录）").toBe("empty");
        expect(total, "空态 total 必须是 0").toBe(0);
        await expect(page.locator(`${DONATE.shell} [data-donate-empty]`)).toHaveCount(1);
    }

    const methods = await page.evaluate((sel) => {
        return [...document.querySelectorAll(`${sel} .qr-card`)].map((card) => {
            const img = card.querySelector("img");
            return {
                name: (card.querySelector(".qr-card__name")?.textContent ?? "").trim(),
                src: img?.getAttribute("src") ?? null,
                alt: img?.getAttribute("alt") ?? null,
                width: img?.getAttribute("width") ?? null,
                href: card.querySelector(".qr-card__action")?.getAttribute("href") ?? null,
            };
        });
    }, DONATE.shell);

    expect(methods).toHaveLength(accounts);
    for (const method of methods) {
        expect(method.name, "每种方式都有可读名称").not.toBe("");
        if (method.src !== null) {
            expect(method.src).not.toBe("");
            expect(method.src).toMatch(/^(\/|https?:)/);
            expect(method.alt, "二维码 alt 描述用途").toBeTruthy();
            expect(method.width).toBe("200");
        } else {
            // 没有码图的方式必须是外链型（PayPal），否则就是一个空壳卡片
            expect(method.href, "无码图时必须有 http(s) 目标").toMatch(/^https?:\/\//);
        }
    }

    const emptySrc = await page.evaluate(
        () =>
            [...document.querySelectorAll("img")].filter((img) => !img.getAttribute("src")).length,
    );
    expect(emptySrc, "整页不允许出现空 src 的 <img>").toBe(0);

    const donators = await page.locator(`${DONATE.shell} .donator`).count();
    expect(donators, "名单条目数 = adapter total").toBe(total);
    console.log(`[donate] ${methods.length} 种方式 / ${donators} 位支持者 / 0 空 src`);
});

/* ───────────────────────── 9b. 图标闭集 ───────────────────────── */

test("图标全部来自闭集：页面主体内 0 个 ? 兜底", async ({ page }) => {
    for (const page_ of PAGES) {
        await page.goto(page_.url, { waitUntil: "load" });
        const fallbacks = await page.evaluate(
            (sel) =>
                [...document.querySelectorAll(`${sel} .icon > span`)]
                    .map((el) => (el.textContent ?? "").trim())
                    .filter((text) => text === "?"),
            page_.shell,
        );
        expect(fallbacks, `${page_.key}: DynamicIcon 找不到图标名时会渲染 ? 兜底`).toEqual([]);
    }
});

/* ───────────────── 9c. M8-6-4 赞助页结构契约（P4-01…P4-06） ───────────────── */

test("P4-01/02：容器属性齐全，h1.donations-title#donate-title 恰好 1 个", async ({ page }) => {
    const response = await page.goto(DONATE.url, { waitUntil: "load" });
    expect(response?.status()).toBe(200);

    await expect(page.locator("article.donations")).toHaveCount(1);
    for (const attr of [
        "data-donate-status",
        "data-donate-total",
        "data-donate-accounts",
        "data-donate-enabled",
    ]) {
        expect(await page.locator(DONATE.shell).getAttribute(attr), `缺少 ${attr}`).not.toBeNull();
    }

    // M8-6-4 把页头换成 PageHero：h1 的语义类由 titleClass 追加，id 由 id 传入 →
    // 旧契约选择器 `h1.donations-title#donate-title` 原样成立。
    await expect(page.locator("h1.donations-title#donate-title")).toHaveCount(1);
    await expect(page.locator(`${DONATE.shell} .page-hero__title`)).toHaveCount(1);
    await expect(page.locator(DONATE.shell)).toHaveAttribute("aria-labelledby", "donate-title");

    // 分区头统一走 SectionHead（收款方式 / 账本 / 芳名录 / 答疑），空态走 DataState。
    const heads = await page.locator(`${DONATE.shell} .section-head`).count();
    expect(heads, "四个分区头都必须是 SectionHead").toBeGreaterThanOrEqual(4);
    expect(
        await page.locator(`${DONATE.shell} [data-donate-empty] .data-state`).count(),
        "空态必须由 DataState 渲染",
    ).toBe(1);
});

test("P4-03：3 列支付卡，码图有 alt/src，PayPal 外链是 http(s)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(DONATE.url, { waitUntil: "load" });

    const cards = await page.evaluate((sel) => {
        const root = document.querySelector(sel) as HTMLElement;
        return {
            tracks: getComputedStyle(
                root.querySelector(".donations-methods") as HTMLElement,
            ).gridTemplateColumns
                .split(" ")
                .filter(Boolean).length,
            cards: [...root.querySelectorAll(".qr-card")].map((card) => {
                const img = card.querySelector("img");
                const action = card.querySelector(".qr-card__action") as HTMLElement | null;
                const rect = action?.getBoundingClientRect();
                return {
                    name: (card.querySelector(".qr-card__name")?.textContent ?? "").trim(),
                    src: img?.getAttribute("src") ?? null,
                    alt: img?.getAttribute("alt") ?? null,
                    width: img?.getAttribute("width") ?? null,
                    href: action?.getAttribute("href") ?? null,
                    target: action?.getAttribute("target") ?? null,
                    rel: action?.getAttribute("rel") ?? null,
                    actionHeight: rect?.height ?? 0,
                    actionWidth: rect?.width ?? 0,
                };
            }),
        };
    }, DONATE.shell);

    expect(cards.tracks, "≥1024 必须是 3 列").toBe(3);
    expect(cards.cards).toHaveLength(3);
    expect(cards.cards.map((card) => card.name)).toEqual(["微信支付", "支付宝", "PayPal"]);

    for (const card of cards.cards) {
        expect(card.src, `${card.name}: 码图必须有 src`).toBeTruthy();
        expect(card.src, `${card.name}: src 不能是空串`).not.toBe("");
        expect(card.alt, `${card.name}: alt 必须可读`).toBeTruthy();
        expect(card.width, `${card.name}: 带显式宽度`).toBe("200");
    }

    const paypal = cards.cards.find((card) => card.name === "PayPal");
    expect(paypal?.href, "PayPal 必须是真实外链").toMatch(/^https?:\/\//);
    expect(paypal?.target).toBe("_blank");
    expect(paypal?.rel).toContain("noopener");
    expect(paypal?.actionHeight, "外链按钮命中区 ≥44").toBeGreaterThanOrEqual(44);
    expect(paypal?.actionWidth, "外链按钮命中区 ≥44").toBeGreaterThanOrEqual(44);
});

test("P4-06：年度账本 = table + caption + th[scope]，且零金额零进度", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(DONATE.url, { waitUntil: "load" });

    const ledger = page.locator(`${DONATE.shell} [data-donate-ledger]`);
    await expect(ledger).toHaveCount(1);
    await expect(ledger.locator("table")).toHaveCount(1);

    const caption = (await ledger.locator("caption").innerText()).trim();
    expect(caption.length, "caption 必须有实质文案").toBeGreaterThan(8);
    expect(await ledger.locator('th[scope="col"]').count()).toBeGreaterThanOrEqual(2);
    expect(await ledger.locator('th[scope="row"]').count()).toBeGreaterThanOrEqual(1);
    expect(
        await ledger.locator("tbody tr").first().evaluate((el) => getComputedStyle(el).display),
    ).toBe("table-row");

    const text = await ledger.innerText();
    // 无真实数据 → 不渲染金额、不渲染覆盖进度、不写 0、不抄设计稿样稿数字
    expect(text, "账本里不许出现金额").not.toMatch(/[¥￥$]\s?\d/);
    expect(text, "账本里不许出现百分比进度").not.toMatch(/\d\s?%/);
    expect(text).not.toContain("1,420");
    expect(text).not.toContain("68%");
    expect(
        await page.locator(`${DONATE.shell} [role="progressbar"], ${DONATE.shell} progress`).count(),
        "未提供真实数据时不许出现进度条",
    ).toBe(0);
});

test("P4-04/05：芳名录条数 = total，答疑 3 条非空，致谢恒在", async ({ page }) => {
    await page.goto(DONATE.url, { waitUntil: "load" });

    const total = Number(await page.locator(DONATE.shell).getAttribute("data-donate-total"));
    expect(await page.locator(`${DONATE.shell} .donator`).count(), "芳名录条数").toBe(total);

    const faq = await page.evaluate((sel) => {
        const root = document.querySelector(sel) as HTMLElement;
        return [...root.querySelectorAll(".donations-faq__item")].map((item) => ({
            q: (item.querySelector(".donations-faq__q")?.textContent ?? "").trim(),
            a: (item.querySelector(".donations-faq__a")?.textContent ?? "").trim(),
            foot: (item.querySelector(".donations-faq__foot")?.textContent ?? "").trim(),
        }));
    }, DONATE.shell);

    expect(faq, "赞助答疑必须恰好 3 条").toHaveLength(3);
    for (const item of faq) {
        expect(item.q.length, "问题不得为空").toBeGreaterThan(4);
        expect(item.a.length, "答案不得为空").toBeGreaterThan(20);
        expect(item.foot.length, "脚注不得为空").toBeGreaterThan(4);
        expect(item.q).not.toContain("待补充");
        expect(item.a).not.toContain("待补充");
    }
    expect(faq.map((item) => item.q)).toEqual([
        "赞助款项会用到哪里？",
        "赞助后如何登上芳名录？",
        "可以完全保持匿名吗？",
    ]);

    await expect(page.locator(`${DONATE.shell} .donations-thanks`)).toHaveCount(1);
});

test("G-08：页面主体 0 处占位假数据（含已清空的 4 条人名）", async ({ page }) => {
    const patterns = [
        "示例",
        "样例",
        "sample-",
        "placeholder",
        "Lorem",
        "待替换",
        "待补充",
        "seed（",
        "TODO",
        "FIXME",
        "张三",
        "李四",
        "王五",
        "赵六",
        "吴十",
        "郑十一",
        "测试用户",
    ];

    for (const url of [DONATE.url, DONATE.en]) {
        await page.goto(url, { waitUntil: "load" });
        const html = (await page.locator(DONATE.shell).innerHTML()).toLowerCase();
        const hits = patterns.filter((pattern) => html.includes(pattern.toLowerCase()));
        expect(hits, `${url}: 占位/假数据`).toEqual([]);
        const emptySrc = await page.evaluate(
            () => [...document.querySelectorAll("img")].filter((img) => !img.getAttribute("src")).length,
        );
        expect(emptySrc, `${url}: 空 src 的 <img>`).toBe(0);
    }
});

test("移动（375 / 390）：支付卡与答疑单列、账本卡片化、0 横向溢出、命中区 ≥44", async ({
    page,
}) => {
    test.setTimeout(90_000);

    for (const width of [375, 390] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(DONATE.url, { waitUntil: "load" });
        await page.evaluate(async () => {
            await document.fonts.ready;
        });

        const probe = await page.evaluate((sel) => {
            const root = document.querySelector(sel) as HTMLElement;
            const tracks = (selector: string) =>
                getComputedStyle(root.querySelector(selector) as HTMLElement)
                    .gridTemplateColumns.split(" ")
                    .filter(Boolean).length;
            const table = root.querySelector(".donations-ledger__table") as HTMLElement;
            const row = root.querySelector("tbody tr") as HTMLElement;
            const actions = [...root.querySelectorAll(".qr-card__action")].map((node) => {
                const rect = node.getBoundingClientRect();
                return {
                    text: (node.textContent ?? "").trim(),
                    width: rect.width,
                    height: rect.height,
                };
            });
            return {
                methods: tracks(".donations-methods"),
                faq: tracks(".donations-faq__list"),
                rowDisplay: getComputedStyle(row).display,
                tableOverflow: table.scrollWidth - table.clientWidth,
                docOverflow:
                    document.documentElement.scrollWidth - document.documentElement.clientWidth,
                actions,
            };
        }, DONATE.shell);

        expect(probe.methods, `${width}: 支付卡必须单列`).toBe(1);
        expect(probe.faq, `${width}: 答疑必须单列`).toBe(1);
        expect(probe.rowDisplay, `${width}: 账本行必须改成卡片块`).toBe("block");
        expect(probe.tableOverflow, `${width}: 账本表不许横向滚动`).toBeLessThanOrEqual(1);
        expect(probe.docOverflow, `${width}: 页面不许横向溢出`).toBeLessThanOrEqual(1);
        for (const action of probe.actions) {
            expect(action.height, `${width}: ${action.text} 命中区高`).toBeGreaterThanOrEqual(44);
            expect(action.width, `${width}: ${action.text} 命中区宽`).toBeGreaterThanOrEqual(44);
        }
        console.log(
            `[donate-mobile] ${width}: 单列支付/答疑，账本 ${probe.rowDisplay}，0 溢出，${probe.actions.length} 个外链按钮 ≥44`,
        );
    }
});

/* ───────────────── 9d. M8-6-3 随笔页结构契约（P3-01…P3-07） ───────────────── */

test("P3-01/02：容器属性齐全，h1.talks-title#talks-title 恰好 1 个", async ({ page }) => {
    const response = await page.goto(TALKS.url, { waitUntil: "load" });
    expect(response?.status()).toBe(200);

    await expect(page.locator("article.talks")).toHaveCount(1);
    for (const attr of ["data-talks-status", "data-talks-total"]) {
        expect(await page.locator(TALKS.shell).getAttribute(attr), `缺少 ${attr}`).not.toBeNull();
    }

    // M8-6-3 把页头换成 PageHero：h1 的语义类由 titleClass 追加、id 由 id 传入 →
    // 旧契约选择器 `h1.talks-title#talks-title` 原样成立。
    await expect(page.locator("h1.talks-title#talks-title")).toHaveCount(1);
    await expect(page.locator(`${TALKS.shell} .page-hero__title`)).toHaveCount(1);
    await expect(page.locator(TALKS.shell)).toHaveAttribute("aria-labelledby", "talks-title");
});

test("P3-03：Hero chip —— 条数恒在，标签数 / 最近时间按数据条件渲染", async ({ page }) => {
    await page.goto(TALKS.url, { waitUntil: "load" });
    const total = Number(await page.locator(TALKS.shell).getAttribute("data-talks-total"));

    const probe = await page.evaluate((sel) => {
        const root = document.querySelector(sel) as HTMLElement;
        return {
            chips: [...root.querySelectorAll(".page-hero__meta .page-hero__chip")].map((chip) => ({
                text: (chip.textContent ?? "").trim(),
                quiet: chip.classList.contains("page-hero__chip--quiet"),
            })),
            topics: root.querySelectorAll(".talks-topics .talks-topic").length,
        };
    }, TALKS.shell);

    expect(probe.chips.length, "条数 chip 恒在").toBeGreaterThanOrEqual(1);
    expect(probe.chips[0]?.text, "第一枚 chip 是条数").toContain(String(total));

    const tagChips = probe.chips.filter((chip) => /\d+\s*(个话题|topics)/.test(chip.text));
    expect(tagChips.length, "标签数 chip 仅当 tags>0").toBe(probe.topics > 0 ? 1 : 0);

    const newestChips = probe.chips.filter((chip) => /\d{4}/.test(chip.text));
    expect(newestChips.length, "最近时间 chip 至多一枚").toBeLessThanOrEqual(1);
    if (newestChips.length === 1) expect(newestChips[0].quiet, "最近时间 chip 走 quiet 档").toBe(true);

    expect(probe.chips.length, "chip 总数 = 条数(+标签数)(+最近时间)").toBe(
        1 + (probe.topics > 0 ? 1 : 0) + newestChips.length,
    );
});

test("P3-04/05：时间流是 <ol>，卡片数 = total，正文/外链契约", async ({ page }) => {
    await page.goto(TALKS.url, { waitUntil: "load" });
    const total = Number(await page.locator(TALKS.shell).getAttribute("data-talks-total"));

    const probe = await page.evaluate((sel) => {
        const root = document.querySelector(sel) as HTMLElement;
        const list = root.querySelector(".talks-timeline");
        return {
            tag: list?.tagName ?? "",
            cards: root.querySelectorAll(".essay-card").length,
            ids: [...root.querySelectorAll(".essay-card")].map(
                (el) => el.getAttribute("data-talk-id") ?? "",
            ),
            texts: [...root.querySelectorAll(".essay-card__text")].map((el) =>
                (el.textContent ?? "").trim(),
            ),
            links: [...root.querySelectorAll(".essay-card__source")].map((el) => ({
                href: el.getAttribute("href") ?? "",
                target: el.getAttribute("target"),
                rel: el.getAttribute("rel") ?? "",
            })),
        };
    }, TALKS.shell);

    expect(probe.tag, "时间流必须是 <ol>").toBe("OL");
    expect(probe.cards, "卡片数 = data-talks-total").toBe(total);
    expect(total, "adapter 应读到站点随笔").toBeGreaterThan(0);
    expect(new Set(probe.ids).size, "随笔 id 必须唯一（锚点/去重）").toBe(probe.ids.length);

    for (const text of probe.texts) {
        expect(text, "正文不能为空").not.toBe("");
        expect(text.includes("#"), "话题标签已从正文剔除").toBe(false);
    }
    for (const link of probe.links) {
        expect(link.href).toMatch(/^https?:\/\//);
        expect(link.target).toBe("_blank");
        expect(link.rel).toContain("noopener");
    }
    console.log(`[P3] ${probe.cards} 张卡片 / ol / id 唯一 / ${probe.links.length} 条外链合格`);
});

test("P3-06：≥1024 左栏 sticky 常驻；768–1023 降级为顶部横滑不挤压正文", async ({ page }) => {
    test.setTimeout(120_000);

    const probeLayout = (sel: string) =>
        page.evaluate((s) => {
            const root = document.querySelector(s) as HTMLElement;
            const layout = root.querySelector(".talks-layout") as HTMLElement;
            const aside = root.querySelector(".talks-filters") as HTMLElement | null;
            const main = root.querySelector(".talks-main") as HTMLElement;
            const topics = root.querySelector(".talks-topics") as HTMLElement | null;
            if (!aside || !topics) return null;
            const track = (node: HTMLElement) =>
                getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length;
            return {
                position: getComputedStyle(aside).position,
                columns: track(layout),
                overflowX: getComputedStyle(topics).overflowX,
                ratio: aside.getBoundingClientRect().width / layout.getBoundingClientRect().width,
                asideTop: aside.getBoundingClientRect().top,
                mainTop: main.getBoundingClientRect().top,
                scrollY: window.scrollY,
            };
        }, sel);

    // ≥1024：两栏 + sticky
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(TALKS.url, { waitUntil: "load" });
    await page.evaluate(async () => {
        await document.fonts.ready;
    });

    const desktop = await probeLayout(TALKS.shell);
    expect(desktop, "1440 必须有筛选栏 + 话题云").not.toBeNull();
    expect(desktop!.columns, "≥1024 两栏").toBe(2);
    expect(desktop!.position, "≥1024 左栏 sticky").toBe("sticky");
    expect(desktop!.ratio, "左栏 ≈ 3.5/12 栅（下限）").toBeGreaterThan(0.2);
    expect(desktop!.ratio, "左栏 ≈ 3.5/12 栅（上限）").toBeLessThan(0.4);

    // sticky 生效：滚动后左栏仍在视口内（非 sticky 时它已经被卷走）
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(150);
    const scrolled = await probeLayout(TALKS.shell);
    expect(scrolled!.scrollY, "页面确实滚动了").toBeGreaterThan(400);
    expect(scrolled!.asideTop, "左栏仍停在页头之下").toBeGreaterThanOrEqual(0);
    expect(scrolled!.asideTop, "左栏仍停在页头之下").toBeLessThan(200);
    console.log(
        `[P3-06] 1440: 两栏，左栏 ${(desktop!.ratio * 100).toFixed(1)}%，sticky（滚动 500 后 top=${Math.round(scrolled!.asideTop)}）`,
    );

    // 768–1023：单列 + 非 sticky + 筛选在正文上方 + 话题云横滑 + 不挤压正文
    for (const width of [768, 900, 1023] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(TALKS.url, { waitUntil: "load" });
        await page.evaluate(async () => {
            await document.fonts.ready;
        });
        const tablet = await probeLayout(TALKS.shell);
        expect(tablet, `${width}: 必须有筛选栏 + 话题云`).not.toBeNull();
        expect(tablet!.columns, `${width}: 必须降级单列`).toBe(1);
        expect(tablet!.position, `${width}: 不许 sticky`).not.toBe("sticky");
        expect(tablet!.asideTop, `${width}: 筛选必须在正文上方`).toBeLessThan(tablet!.mainTop);
        expect(tablet!.ratio, `${width}: 筛选不被挤压（占满一行）`).toBeGreaterThan(0.9);
        expect(["auto", "scroll"], `${width}: 话题云必须横滑`).toContain(tablet!.overflowX);
    }
});

test("P3-07：话题云走 Tag atom（neutral/sm），ok 态才渲染", async ({ page }) => {
    await page.goto(TALKS.url, { waitUntil: "load" });

    await expect(page.locator(`${TALKS.shell} .talks-topics`)).toHaveCount(1);
    await expect(page.locator(`${TALKS.shell} .section-head`)).not.toHaveCount(0);

    const tags = await page.evaluate(
        (sel) =>
            [...document.querySelectorAll(`${sel} .talks-topics .tag`)].map((el) => ({
                cls: el.className,
                text: (el.textContent ?? "").trim(),
            })),
        TALKS.shell,
    );
    expect(tags.length, "话题云非空").toBeGreaterThan(0);
    for (const tag of tags) {
        expect(tag.cls, "Tag 必须是 neutral").toContain("tag--neutral");
        expect(tag.cls, "Tag 必须是 sm").toContain("tag--sm");
        expect(tag.text.startsWith("#"), "话题以 # 开头").toBe(true);
    }
    console.log(`[P3-07] ${tags.length} 个话题走 Tag atom（neutral/sm）`);
});

test("随笔移动（375/390）：单列、0 横向溢出、外链命中区 ≥44", async ({ page }) => {
    test.setTimeout(120_000);

    for (const width of [375, 390] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(TALKS.url, { waitUntil: "load" });
        await page.evaluate(async () => {
            await document.fonts.ready;
        });

        const probe = await page.evaluate((sel) => {
            const root = document.querySelector(sel) as HTMLElement;
            const layout = root.querySelector(".talks-layout") as HTMLElement;
            const entry = root.querySelector(".talks-entry") as HTMLElement;
            const topics = root.querySelector(".talks-topics") as HTMLElement | null;
            const box = (node: Element | null) => {
                const rect = node?.getBoundingClientRect();
                return rect ? { width: rect.width, height: rect.height } : null;
            };
            const tracks = (node: HTMLElement) =>
                getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length;
            return {
                columns: tracks(layout),
                entryColumns: tracks(entry),
                dayAlign: getComputedStyle(
                    root.querySelector(".talks-entry__day") as HTMLElement,
                ).textAlign,
                railDisplay: getComputedStyle(root.querySelector(".talks-rail") as HTMLElement)
                    .display,
                topicsOverflow: topics ? getComputedStyle(topics).overflowX : null,
                source: box(root.querySelector(".talks-source")),
                cardSources: [...root.querySelectorAll(".essay-card__source")]
                    .slice(0, 3)
                    .map(box),
                docOverflow:
                    document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
        }, TALKS.shell);

        expect(probe.columns, `${width}: 页面单列`).toBe(1);
        expect(probe.entryColumns, `${width}: 日期折到卡片上方`).toBe(1);
        expect(probe.dayAlign, `${width}: 日期左对齐`).toBe("start");
        expect(probe.railDisplay, `${width}: 移动隐藏轨道`).toBe("none");
        expect(["auto", "scroll"], `${width}: 话题云横滑`).toContain(probe.topicsOverflow);
        expect(probe.docOverflow, `${width}: 页面不许横向溢出`).toBeLessThanOrEqual(1);

        expect(probe.source!.height, `${width}: 页头来源外链命中区高`).toBeGreaterThanOrEqual(44);
        for (const [index, source] of probe.cardSources.entries()) {
            expect(source!.height, `${width}: 卡片 #${index + 1} 外链命中区高`).toBeGreaterThanOrEqual(44);
            expect(source!.width, `${width}: 卡片 #${index + 1} 外链命中区宽`).toBeGreaterThanOrEqual(44);
        }
        console.log(
            `[talks-mobile] ${width}: 单列 / 0 溢出 / 外链 ${probe.cardSources.length} 个 ≥44`,
        );
    }
});

/* ───────────────────────── 10. 空态 / 错误态（真实构建） ───────────────────────── */

/**
 * 「删掉站点数据 → 空态仍 200」不能靠 mock：这里用同一条构建链，
 * 把 adapter 的构建期开关设成 empty / error，产出到 test-results/（gitignored），
 * 再直接读产物 HTML 断言。单次构建实测 40~150s（sharp 走缓存）。
 */
function buildFixture(kind: "talks" | "donate", state: string): string {
    const outDir = path.join(ROOT, "test-results", `m26b-${kind}-${state}`);
    rmSync(outDir, { recursive: true, force: true });
    const env =
        kind === "talks"
            ? { ...process.env, PUBLIC_TALKS_STATE: state }
            : { ...process.env, PUBLIC_DONATE_STATE: state };
    execFileSync(path.join(ROOT, "node_modules/.bin/astro"), ["build", "--outDir", outDir], {
        cwd: ROOT,
        env,
        stdio: "pipe",
        timeout: 420_000,
    });
    return outDir;
}

function readBuilt(outDir: string, route: string): string {
    const file = path.join(outDir, route, "index.html");
    expect(existsSync(file), `${route} 必须构建出来：${file}`).toBe(true);
    return readFileSync(file, "utf8");
}

/**
 * 产物 HTML 上的属性断言必须 **quote-agnostic**（QA §5.5-4）：
 * `postbuild/collapse-html-whitespace.mjs` 会把 `data-x="ok"` 折成 `data-x=ok`
 * （`class`/`id`/`href`/`src`/`rel` 等语义属性保留引号），写成字面 `data-x="ok"` 会假红。
 */
function hasAttr(html: string, name: string, value: string): boolean {
    return new RegExp(`\\s${name}=["']?${value}["']?(?=[\\s>])`).test(html);
}

function expectAttr(html: string, name: string, value: string, label = `${name}=${value}`) {
    expect(hasAttr(html, name, value), `缺少 ${label}`).toBe(true);
}

for (const state of ["empty", "error"] as const) {
    test(`随笔 ${state} 态：整页构建成功，页面主体仍在（zh + en）`, async () => {
        test.setTimeout(600_000);
        const outDir = buildFixture("talks", state);

        for (const route of ["talks", "en/talks"]) {
            const html = readBuilt(outDir, route);
            expectAttr(html, "data-talks-status", state, `${route}: 状态必须是 ${state}`);
            expect(html, `${route}: 一条随笔都不许渲染`).not.toContain('class="essay-card"');
            expect(html, `${route}: h1 必须在`).toMatch(/<h1[^>]*class="[^"]*talks-title/);
        }

        const zh = readBuilt(outDir, "talks");
        if (state === "empty") {
            expect(zh, "空态块").toContain("data-talks-empty");
            expect(zh, "空态文案").toContain("还没有随笔");
            expect(zh, "空态不渲染话题云").not.toContain("talks-topics");
            expect(zh, "空态不渲染筛选栏").not.toContain("talks-filters");
        } else {
            expect(zh, "错误态块").toContain("data-talks-error");
            expect(zh, "错误态用 Alert（warning）").toContain("alert--warning");
            expect(zh, "错误态给出原因代码").toContain("data-state__code");
            expect(zh, "错误态不渲染空态块").not.toContain("data-talks-empty");
            expect(zh, "错误态不渲染话题云").not.toContain("talks-topics");
        }
        console.log(`[fixture] talks-${state}: dist 产出 ${outDir}，zh/en 双路由 200-ready`);
    });

    test(`赞赏 ${state} 态：整页构建成功，收款方式为 0 时不出现任何码图（zh + en）`, async () => {
        test.setTimeout(600_000);
        const outDir = buildFixture("donate", state);

        for (const route of ["donate", "en/donate"]) {
            const html = readBuilt(outDir, route);
            expectAttr(html, "data-donate-status", state, `${route}: 状态必须是 ${state}`);
            expectAttr(html, "data-donate-accounts", "0", `${route}: 没有注入收款方式`);
            expect(html, `${route}: 一名支持者都不许渲染`).not.toContain('class="donator"');
            expect(html, `${route}: 收款方式容器不许出现`).not.toContain("donations-methods");
            expect(html, `${route}: 空 src 一律不许`).not.toContain('src=""');
            expect(html, `${route}: h1 必须在`).toMatch(/<h1[^>]*class="[^"]*donations-title/);
            expect(html, `${route}: h1 的 id 必须是 donate-title`).toMatch(/<h1[^>]*id="donate-title"/);
            expect(html, `${route}: 致谢段仍在`).toContain("donations-thanks");
        }

        const zh = readBuilt(outDir, "donate");
        if (state === "empty") {
            expect(zh, "空态块").toContain("data-donate-empty");
            expect(zh, "空态文案").toContain("还没有赞赏记录");
            expect(zh, "未配置收款方式的提示").toContain("data-donate-no-methods");
        } else {
            expect(zh, "错误态块").toContain("data-donate-error");
            expect(zh, "错误态用 Alert（warning）").toContain("alert--warning");
            expect(zh, "错误态给出原因代码").toContain("data-state__code");
            expect(zh, "错误态不渲染空态块").not.toContain("data-donate-empty");
        }
        console.log(`[fixture] donate-${state}: dist 产出 ${outDir}，zh/en 双路由 200-ready`);
    });
}

/* ───────────────────────── 10b. 无收款方式态（第五态） ───────────────────────── */

test("赞赏 no-accounts 态（第五态）：构建成功，0 码图、0 空图", async () => {
    test.setTimeout(600_000);
    const outDir = buildFixture("donate", "no-accounts");

    for (const route of ["donate", "en/donate"]) {
        const html = readBuilt(outDir, route);
        // 当前 fixture 同时把账本置空 → status=empty、accounts=0（QA §2.4 明确这一限制）
        expectAttr(html, "data-donate-status", "empty", `${route}: no-accounts 的 status`);
        expectAttr(html, "data-donate-accounts", "0", `${route}: 一种收款方式都不许渲染`);
        expect(html, `${route}: 不许出现任何码图`).not.toContain('class="qr-card"');
        expect(html, `${route}: 空 src 一律不许`).not.toContain('src=""');
        expect(html, `${route}: 未配置提示块`).toContain("data-donate-no-methods");
        expect(html, `${route}: 未开放提示块走另一条分支`).not.toContain("data-donate-closed");
        expect(html, `${route}: 致谢段仍在`).toContain("donations-thanks");
        expect(html, `${route}: 账本结构不受收款方式影响`).toContain("donations-ledger__table");
    }
    console.log(`[fixture] donate-no-accounts: dist 产出 ${outDir}，0 码图 0 空图`);
});

/* ───────────────────────── 11. 证据截图 ───────────────────────── */

for (const page_ of PAGES) {
    test(`证据截图 ${page_.key}：light/dark 1440 + light 390`, async ({ page }) => {
        test.setTimeout(90_000);
        if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

        const shots = [
            { name: `${page_.key}-light-1440.png`, theme: "light" as Theme, width: 1440 },
            { name: `${page_.key}-dark-1440.png`, theme: "dark" as Theme, width: 1440 },
            { name: `${page_.key}-light-390.png`, theme: "light" as Theme, width: 390 },
            // M8-6-3 / M8-6-4 起两页都要 375 证据（QA §3.5 移动最低限度）
            { name: `${page_.key}-light-375.png`, theme: "light" as Theme, width: 375 },
        ];

        for (const shot of shots) {
            await page.setViewportSize({ width: shot.width, height: 900 });
            await openPage(page, page_.url, shot.theme);
            await page.waitForTimeout(150);
            const target = path.join(EVIDENCE_DIR, shot.name);
            await page.screenshot({ path: target, fullPage: true });
            console.log(`[shot] ${target}`);
        }
    });
}
