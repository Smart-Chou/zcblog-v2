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
        const talksEn = await read(TALKS.en, TALKS.shell, ["data-talks-status", "data-talks-total"]);
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
                    .map((node) => `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 40)}`),
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
            if (!probe.hasRing) problems.push(`${page_.key}: ${probe.tag} "${probe.text}" 无 ≥2px 焦点环`);
            else if (probe.color !== ringToken)
                problems.push(`${page_.key}: ${probe.tag} "${probe.text}" 焦点环 ${probe.color} ≠ ${ringToken}`);
        }

        console.log(
            `[kbd] ${page_.key}: 壳内可聚焦 ${focusables.length} 个，逐个 Tab 检查 ${visited.length} 个`,
        );
        expect(entered, `${page_.key}: Tab 必须能进入页面主体`).toBe(true);
        expect(
            visited.length,
            `${page_.key}: 至少走到正文内链`,
        ).toBeGreaterThanOrEqual(page_.key === "talks" ? 3 : 1);
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
    expect(accounts, "注入点有 3 种收款方式").toBe(3);
    expect(total, "账本应读到站点数据").toBeGreaterThan(0);

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

    const emptySrc = await page.evaluate(() =>
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

for (const state of ["empty", "error"] as const) {
    test(`随笔 ${state} 态：整页构建成功，页面主体仍在（zh + en）`, async () => {
        test.setTimeout(600_000);
        const outDir = buildFixture("talks", state);

        for (const route of ["talks", "en/talks"]) {
            const html = readBuilt(outDir, route);
            expect(html, `${route}: 状态必须是 ${state}`).toContain(
                `data-talks-status="${state}"`,
            );
            expect(html, `${route}: 一条随笔都不许渲染`).not.toContain('class="essay-card"');
            expect(html, `${route}: h1 必须在`).toMatch(/<h1[^>]*class="talks-title"/);
        }

        const zh = readBuilt(outDir, "talks");
        if (state === "empty") {
            expect(zh, "空态块").toContain("data-talks-empty");
            expect(zh, "空态文案").toContain("还没有随笔");
            expect(zh, "空态不渲染话题云").not.toContain("talks-topics");
        } else {
            expect(zh, "错误态块").toContain("data-talks-error");
            expect(zh, "错误态用 Alert（warning）").toContain("alert--warning");
            expect(zh, "错误态给出原因代码").toContain("talks-state__hint");
            expect(zh, "错误态不渲染空态块").not.toContain("data-talks-empty");
        }
        console.log(`[fixture] talks-${state}: dist 产出 ${outDir}，zh/en 双路由 200-ready`);
    });

    test(`赞赏 ${state} 态：整页构建成功，收款方式为 0 时不出现任何码图（zh + en）`, async () => {
        test.setTimeout(600_000);
        const outDir = buildFixture("donate", state);

        for (const route of ["donate", "en/donate"]) {
            const html = readBuilt(outDir, route);
            expect(html, `${route}: 状态必须是 ${state}`).toContain(
                `data-donate-status="${state}"`,
            );
            expect(html, `${route}: 没有注入收款方式`).toContain('data-donate-accounts="0"');
            expect(html, `${route}: 一名支持者都不许渲染`).not.toContain('class="donator"');
            expect(html, `${route}: 收款方式容器不许出现`).not.toContain("donations-methods");
            expect(html, `${route}: 空 src 一律不许`).not.toContain('src=""');
            expect(html, `${route}: h1 必须在`).toMatch(/<h1[^>]*class="donations-title"/);
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
            expect(zh, "错误态给出原因代码").toContain("donations-state__hint");
            expect(zh, "错误态不渲染空态块").not.toContain("data-donate-empty");
        }
        console.log(`[fixture] donate-${state}: dist 产出 ${outDir}，zh/en 双路由 200-ready`);
    });
}

/* ───────────────────────── 11. 证据截图 ───────────────────────── */

for (const page_ of PAGES) {
    test(`证据截图 ${page_.key}：light/dark 1440 + light 390`, async ({ page }) => {
        test.setTimeout(90_000);
        if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

        const shots = [
            { name: `${page_.key}-light-1440.png`, theme: "light" as Theme, width: 1440 },
            { name: `${page_.key}-dark-1440.png`, theme: "dark" as Theme, width: 1440 },
            { name: `${page_.key}-light-390.png`, theme: "light" as Theme, width: 390 },
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
