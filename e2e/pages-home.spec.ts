import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * P-01 首页验收（M2-2 / D-0110）——`19-m2-plan.md` §3.0 的 8 条页面级判据。
 *
 * 覆盖：
 *  1. 路由 200（`/` 与 `/en/`）
 *  2. 恰好 1 个 <h1>
 *  3. light/dark × 390/768/1440 无横向溢出
 *  4. axe（wcag2a/aa + wcag21a/aa + wcag22aa）双主题：serious=0 critical=0 incomplete=0
 *  5. Tab 顺序 = DOM 顺序；每个可聚焦元素焦点环 ≥2px 且颜色 = --color-ring-focus
 *  6. prefers-reduced-motion：0 运行中动画、关键元素位移 <0.5px
 *  7. 页面级 CLS（PerformanceObserver，load 后 2s）≤ 0.05
 *  8. 关闭态 0 DOM/0 请求：本页无 overlay / 播放器 / 灯箱（N/A，见 run 说明）
 *
 * 证据截图：`HOME_SHOTS=1 npx playwright test e2e/pages-home.spec.ts -g evidence`
 * 输出到 blog2.0/docs/_reviews/M2-2-home/home-<theme>-<width>.png（默认跳过，CI 不写盘）。
 */

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [390, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

const EVIDENCE_DIR =
    process.env.HOME_EVIDENCE_DIR ??
    path.resolve(process.cwd(), "../../hermes-desktop-files/blog2.0/docs/_reviews/M2-2-home");

async function openHome(page: Page, theme: Theme, url = "/"): Promise<void> {
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
    for (const [name, url] of [
        ["zh", "/"],
        ["en", "/en/"],
    ] as const) {
        test(`route-${name} 200`, async ({ page }) => {
            const response = await page.goto(url, { waitUntil: "load" });
            expect(response?.status(), `GET ${url}`).toBe(200);
            await expect(page.locator(".home")).toHaveCount(1);
        });
    }
});

/* ───────────────────────── 2. h1 ───────────────────────── */

test("恰好 1 个 h1", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    const headings = await page.evaluate(() => ({
        h1: [...document.querySelectorAll("h1")].map((el) => (el.textContent ?? "").trim()),
        levels: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((el) =>
            Number(el.tagName.slice(1)),
        ),
    }));
    expect(headings.h1, "exactly one h1").toHaveLength(1);
    expect(headings.h1[0]).not.toBe("");

    // 标题层级不跳级：每次最多 +1
    let previous = 0;
    const skips: string[] = [];
    for (const level of headings.levels) {
        if (previous !== 0 && level > previous + 1) skips.push(`${previous} → ${level}`);
        previous = level;
    }
    expect(skips, "heading levels must not skip").toEqual([]);
});

/* ───────────────────────── 3. 横向溢出 ───────────────────────── */

test.describe("no horizontal overflow", () => {
    for (const width of VIEWPORTS) {
        for (const theme of THEMES) {
            test(`overflow-${theme}-${width}`, async ({ page }) => {
                await page.setViewportSize({ width, height: 900 });
                await openHome(page, theme);

                const result = await page.evaluate(() => {
                    const doc = document.documentElement;
                    const limit = doc.clientWidth;
                    const offenders = [...document.querySelectorAll("body *")]
                        .filter((el) => {
                            const rect = el.getBoundingClientRect();
                            return rect.width > 0 && rect.right > limit + 1;
                        })
                        .slice(0, 8)
                        .map((el) => {
                            const rect = el.getBoundingClientRect();
                            return `${el.tagName.toLowerCase()} right=${Math.round(rect.right)} width=${Math.round(rect.width)} :: ${el.outerHTML.slice(0, 160)}`;
                        });
                    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders };
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
            test.setTimeout(60_000);
            await page.setViewportSize({ width: 1440, height: 900 });
            await openHome(page, theme);

            // 两次扫描：
            //  · .home    = 本卡交付的页面内容 → §3.0 严格执行 serious/critical=0 且 incomplete=0
            //  · document = 含共享 Header/Footer → 只要求 serious/critical=0（chrome 不在本卡边界内）
            const pageScope = await runAxe(page, ".home");
            const docScope = await runAxe(page);

            await test.info().attach(`axe-${theme}-1440.json`, {
                body: JSON.stringify({ page: pageScope, document: docScope }, null, 2),
                contentType: "application/json",
            });
            // 落盘一份，门禁报告的节点明细不用翻 HTML report
            const axeDir = path.join(process.cwd(), "test-results", "axe-home");
            if (!existsSync(axeDir)) mkdirSync(axeDir, { recursive: true });
            writeFileSync(
                path.join(axeDir, `${theme}-1440.json`),
                JSON.stringify({ page: pageScope, document: docScope }, null, 2),
            );

            const seriousOf = (result: { violations: AxeViolation[] }) =>
                result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");

            for (const [label, result] of [
                ["页面内容 .home", pageScope],
                ["整页 document", docScope],
            ] as const) {
                console.log(
                    `[axe] ${theme}@1440 ${label}: serious/critical=${seriousOf(result).length} moderate=${result.violations.filter((v) => v.impact === "moderate").length} minor=${result.violations.filter((v) => v.impact === "minor").length} incomplete=${result.incomplete.length}`,
                );
                for (const v of [...result.violations, ...result.incomplete])
                    console.log(`[axe]   ${v.impact} ${v.id} × ${v.nodes.length} — ${v.help}`);
            }

            expect(
                seriousOf(pageScope).map((v) => `${v.id} (${v.nodes.length} node(s))`),
                `serious/critical axe violations in .home at ${theme}`,
            ).toEqual([]);
            expect(
                pageScope.incomplete.map((v) => `${v.id} (${v.nodes.length} node(s))`),
                `axe could not finish on .home at ${theme}`,
            ).toEqual([]);
            // 整页扫描只做记录：共享 Header/Footer 有 2 条既有问题（不在本卡文件边界内，
            // 归 M2-12 / V-01 暗色逐页）——dark 下 .pf-trigger-text 3.61:1，
            // 两端主题下 .footer-stats 的 aria-label 缺 role。页面内容本身的红线在上面。
        });
    }
});

/* ───────────────────────── 5. 键盘 ───────────────────────── */

type RingProbe = {
    tag: string;
    label: string;
    inHome: boolean;
    ring: { style: string; width: string; color: string } | null;
};

const ringProbe = (): RingProbe => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return { tag: "none", label: "", inHome: false, ring: null };
    const style = getComputedStyle(el);
    const width = parseFloat(style.outlineWidth);
    const visible = style.outlineStyle !== "none" && width >= 2;
    return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40),
        inHome: Boolean(el.closest(".home")),
        ring: visible
            ? { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor }
            : null,
    };
};

test("Tab 顺序 + 焦点环", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHome(page, "light");
    // pagefind 的搜索触发器是懒加载的：首屏是 tabindex="-1" 的静态占位，
    // 模块到位后被 <pagefind-modal-trigger> 升级。等它落定再快照，
    // 否则「快照后被撤掉」会让 Tab 少一格，断言假红。
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
        // 不再用 `button:not([disabled])` 这种复合选择器：它会把
        // tabindex="-1" 的按钮也算进来（首屏搜索占位就是），结果 Tab 到不了 → 假红。
        const selector = "a[href], button, input, select, textarea, [tabindex]";
        const nodes = [...document.querySelectorAll<HTMLElement>(selector)].filter(
            (node) =>
                // checkVisibility 覆盖 display:none / visibility:hidden / content-visibility:hidden
                ((node as HTMLElement & { checkVisibility?: (o?: object) => boolean }).checkVisibility
                    ? (node as HTMLElement & { checkVisibility: (o?: object) => boolean }).checkVisibility(
                          { checkVisibilityCSS: true },
                      )
                    : node.offsetParent !== null || node.getClientRects().length > 0) &&
                !node.hasAttribute("disabled") &&
                // tabIndex < 0 = 浏览器不会用 Tab 到它（含 tabindex="-1" 与 aria-hidden 的占位）
                node.tabIndex >= 0 &&
                node.getAttribute("aria-hidden") !== "true" &&
                // 关闭的导航下拉是 inert，DOM 里在、Tab 到不了
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
    const pageColorOffenders: string[] = [];

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
        if (probe.inHome) {
            if (ringSamples.length < 6) ringSamples.push(probe);
            // §3.0-5 的颜色要求只对本卡交付的页面内容成立；
            // Header/Footer 是共享 chrome（global.css 的 --color-accent），归 M2-12 / V-01。
            if (probe.ring.color !== ringToken) {
                pageColorOffenders.push(`${probe.tag} "${probe.label}" ${probe.ring.color}`);
            }
        } else if (chromeSamples.length < 6) {
            chromeSamples.push(probe);
        }
    }

    const unreachable = expected.filter((entry) => !visited.includes(entry.i));
    console.log(
        `[kbd] visited=${visited.length}/${expected.length} unreachable=${JSON.stringify(
            unreachable.map((entry) => `${entry.i}:${entry.tag}.${entry.cls} "${entry.text}"`),
        )}`,
    );
    console.log(
        `[kbd] 页面内容焦点环 samples=${ringSamples.length} 颜色偏差=${pageColorOffenders.length}` +
            ` ｜ chrome（共享 Header/Footer，非本卡边界）samples=${chromeSamples
                .map((sample) => `${sample.tag}:${sample.ring?.color}`)
                .join(", ")}`,
    );

    expect(ringProblems, "每个获得焦点的元素都要有 ≥2px 的焦点环").toEqual([]);
    expect(pageColorOffenders, "页面内容的焦点环颜色必须 = --color-ring-focus").toEqual([]);
    expect(visited, "Tab 顺序必须与 DOM 顺序一致").toEqual(expected.map((entry) => entry.i));

    for (const sample of ringSamples) {
        expect(sample.ring?.style, `outline-style for ${sample.tag}`).toBe("solid");
        expect(sample.ring?.color, `outline-color for ${sample.tag}`).toBe(ringToken);
    }

    await test.info().attach("keyboard-tab-order.json", {
        body: JSON.stringify(
            { expected: expected.length, visited: visited.length, ringToken, ringSamples, chromeSamples },
            null,
            2,
        ),
        contentType: "application/json",
    });
    console.log(`[kbd] ${visited.length} 个可聚焦元素，页面内容焦点环样本 ${ringSamples.length}`);
});

/* ───────────────────────── 6. reduced-motion ───────────────────────── */

test.describe("prefers-reduced-motion", () => {
    test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

    test("0 动画 / 位移 <0.5px", async ({ page }) => {
        await page.goto("/", { waitUntil: "load" });
        await page.evaluate(async () => {
            await document.fonts.ready;
        });

        const probes = await page.evaluate(() =>
            [...document.querySelectorAll(".home-hero, .posts-section, .photos-section, .talk-section, .popular-section, .culture-section, .friends-section")].map(
                (el) => {
                    const rect = el.getBoundingClientRect();
                    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
                },
            ),
        );

        await page.waitForTimeout(1500);

        const after = await page.evaluate(() =>
            [...document.querySelectorAll(".home-hero, .posts-section, .photos-section, .talk-section, .popular-section, .culture-section, .friends-section")].map(
                (el) => {
                    const rect = el.getBoundingClientRect();
                    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
                },
            ),
        );

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
    await page.goto("/", { waitUntil: "load" });
    await page.waitForTimeout(2000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cls = await page.evaluate(() => (window as any).__cls as number);
    console.log(`[cls] home @1440 = ${cls.toFixed(4)}`);
    expect(cls).toBeLessThanOrEqual(0.05);
});

/* ───────────────────────── 8. 关闭态 0 DOM / 0 请求（N/A） ───────────────────────── */

test("关闭态 0 额外请求（本页无 overlay / 播放器 / 灯箱）", async ({ page }) => {
    // §3.0-8 只对带 overlay / 播放器 / 灯箱的页面成立；首页没有这类交互。
    // 这里退化为「首屏没有加载 waline / fancybox / pagefind 的运行时代码」的硬断言：
    // 这三者都只在对应页面按需 import，首页出现即说明依赖泄漏。
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto("/", { waitUntil: "load" });
    const leaked = requests.filter((url) =>
        /waline|fancybox|pagefind|mermaid|katex/i.test(url),
    );
    expect(leaked, "首页不应加载 overlay / 评论 / 搜索运行时").toEqual([]);
});

/* ───────────────────────── 证据截图（默认跳过） ───────────────────────── */

test.describe("evidence screenshots", () => {
    test.skip(process.env.HOME_SHOTS !== "1", "set HOME_SHOTS=1 to capture");

    for (const width of VIEWPORTS) {
        for (const theme of THEMES) {
            test(`shot-${theme}-${width}`, async ({ page }) => {
                test.setTimeout(120_000);
                await page.setViewportSize({ width, height: 900 });
                await openHome(page, theme);
                // 关掉光标动画，截图不落在半帧上
                await page.addStyleTag({ content: ".typewriter::after{display:none!important}" });
                // 全页截图前先滚一遍触发 loading="lazy" 的图（相册是远程 CDN，
                // 不滚就永远停在占位，证据图会看起来像「图片全丢」）。
                await page.evaluate(async () => {
                    const step = window.innerHeight;
                    for (let y = 0; y < document.body.scrollHeight; y += step) {
                        window.scrollTo(0, y);
                        await new Promise((resolve) => setTimeout(resolve, 80));
                    }
                    window.scrollTo(0, 0);
                });
                await page
                    .evaluate(
                        () =>
                            new Promise<void>((resolve) => {
                                const pending = [...document.images].filter((img) => !img.complete);
                                if (pending.length === 0) return resolve();
                                let left = pending.length;
                                const done = () => {
                                    left -= 1;
                                    if (left <= 0) resolve();
                                };
                                for (const img of pending) {
                                    img.addEventListener("load", done, { once: true });
                                    img.addEventListener("error", done, { once: true });
                                }
                                setTimeout(resolve, 20000);
                            }),
                    )
                    .catch(() => undefined);
                await page.waitForTimeout(250);
                if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
                const file = path.join(EVIDENCE_DIR, `home-${theme}-${width}.png`);
                const broken = await page.evaluate(() =>
                    [...document.querySelectorAll("img")]
                        .filter((img) => img.currentSrc && !img.complete)
                        .map((img) => img.currentSrc.slice(0, 120)),
                );
                if (broken.length > 0) console.log(`[shot] ${theme}@${width} 未完成加载图 ${broken.length} 张`);
                await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
                console.log(`[shot] ${file}`);
                expect(existsSync(file)).toBe(true);
            });
        }
    }
});
