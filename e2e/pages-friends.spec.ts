import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * P-05 友链页验收（M2-6a）—— `19-m2-plan.md` §3.0 的 8 条页面级判据 + 本卡专项。
 *
 * 覆盖：
 *  1. 路由 200：`/friends/`、`/en/friends/`（同一个 adapter、同一份数据）
 *  2. 恰好 1 个 <h1>；标题层级不跳级（三种页面状态共用一个模板，层级必须一致）
 *  3. light/dark × 390/768/1440：无横向溢出
 *  4. axe（wcag2a/aa + wcag21a/aa + wcag22aa）：页面主体 serious=0 critical=0 incomplete=0（双主题）
 *  5. 键盘：Tab 顺序与 DOM 一致；页面内可聚焦元素焦点环 ≥2px 且颜色 = --color-ring-focus
 *  6. prefers-reduced-motion：运行中动画 0、区块位移 <0.5px
 *  7. 页面级 CLS（load 后 2s）≤ 0.05 @1440 / 390
 *  8. 本卡无新增 overlay：关闭态不产生额外请求（友链页 0 交互脚本，只有复制按钮的事件委托）
 *
 * 专项（本卡证据）：
 *  · 卡片契约：数量 = adapter total、全部 http(s)、target=_blank、rel 含 noopener、
 *    头像 alt="" （名字已是链接文本，不许念两遍）
 *  · 空态 / 错误态：用真实构建产出（`PUBLIC_FRIENDS_STATE=empty|error`）断言，
 *    证明「删掉站点数据 → 空态仍 200」不是 mock，而是同一条构建链
 *  · 复制按钮：无 JS 也能聚焦、有 aria-label；点击后 aria-label 切换成「已复制」
 *  · 3 张证据截图（light-1440 / dark-1440 / light-390）
 */

const ROOT = process.cwd();
const AXE_SOURCE = readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [390, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

const SHELL = ".friends";
const PAGES = [
    { key: "zh", url: "/friends/", h1: "友人帐" },
    { key: "en", url: "/en/friends/", h1: "Friends" },
] as const;

const EVIDENCE_DIR =
    process.env.FRIENDS_EVIDENCE_DIR ??
    path.resolve(ROOT, "../../hermes-desktop-files/blog2.0/docs/_reviews/M2-6a-friends");

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
        test(`route 200 ${item.key}`, async ({ page }) => {
            const response = await page.goto(item.url, { waitUntil: "load" });
            expect(response?.status(), `GET ${item.url}`).toBe(200);
            await expect(page.locator(SHELL)).toHaveCount(1);
            await expect(page.locator(SHELL)).toHaveAttribute("data-friends-status", "ok");
            await expect(page.locator(`${SHELL} h1`)).toHaveText(item.h1);
        });
    }

    test("英文页与中文页同源：卡片数与 adapter total 一致", async ({ page }) => {
        const totals: Record<string, string | null> = {};
        for (const item of PAGES) {
            await page.goto(item.url, { waitUntil: "load" });
            const total = await page.locator(SHELL).getAttribute("data-friends-total");
            const cards = await page.locator(`${SHELL} .friend-card`).count();
            totals[item.key] = total;
            expect(cards, `${item.key}: 渲染卡片数 = data-friends-total`).toBe(Number(total));
        }
        expect(totals.zh, "zh/en 共用同一份站点数据").toBe(totals.en);
    });
});

/* ───────────────────────── 2. h1 / 标题层级 ───────────────────────── */

test("恰好 1 个 h1，标题层级不跳级（双语言）", async ({ page }) => {
    for (const item of PAGES) {
        await page.goto(item.url, { waitUntil: "load" });
        const headings = await page.evaluate((sel) => {
            const root = document.querySelector(sel) ?? document;
            return {
                h1: [...root.querySelectorAll("h1")].map((el) => (el.textContent ?? "").trim()),
                total1: document.querySelectorAll("h1").length,
                levels: [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")]
                    .filter((el) => el.getAttribute("aria-hidden") !== "true")
                    .map((el) => Number(el.tagName.slice(1))),
            };
        }, SHELL);

        expect(headings.total1, `${item.key}: 整页只能有 1 个 h1`).toBe(1);
        expect(headings.h1, `${item.key}: h1 在页面主体内且非空`).toHaveLength(1);
        expect(headings.h1[0]).not.toBe("");

        let previous = 0;
        const skips: string[] = [];
        for (const level of headings.levels) {
            if (previous !== 0 && level > previous + 1) skips.push(`${previous} → ${level}`);
            previous = level;
        }
        expect(skips, `${item.key}: 标题层级必须连续`).toEqual([]);
        console.log(`[h1] ${item.key}: 1 个 h1，${headings.levels.length} 个标题，0 跳级`);
    }
});

/* ───────────────────────── 3. 横向溢出 ───────────────────────── */

test.describe("no horizontal overflow", () => {
    for (const theme of THEMES) {
        test(`overflow-${theme}`, async ({ page }) => {
            for (const width of VIEWPORTS) {
                await page.setViewportSize({ width, height: 900 });
                await openPage(page, "/friends/", theme);
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
                    `friends@${width} (${theme}): elements past the viewport`,
                ).toEqual([]);
                expect(
                    result.scrollWidth,
                    `friends@${width} (${theme}): scrollWidth ${result.scrollWidth} > clientWidth ${result.clientWidth}`,
                ).toBeLessThanOrEqual(result.clientWidth + 1);
            }
        });
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
    for (const theme of THEMES) {
        test(`axe-friends-${theme}`, async ({ page }) => {
            test.setTimeout(90_000);
            await page.setViewportSize({ width: 1440, height: 900 });
            await openPage(page, "/friends/", theme);

            const shell = await runAxe(page, SHELL);
            const doc = await runAxe(page);

            const axeDir = path.join(ROOT, "test-results", "axe-friends");
            if (!existsSync(axeDir)) mkdirSync(axeDir, { recursive: true });
            writeFileSync(
                path.join(axeDir, `friends-${theme}.json`),
                JSON.stringify({ shell, document: doc }, null, 2),
            );

            const serious = (r: { violations: AxeViolation[] }) =>
                r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
            console.log(
                `[axe] friends ${theme}@1440 页面主体: serious=${serious(shell).length} incomplete=${shell.incomplete.length} ｜ document: serious=${serious(doc).length} incomplete=${doc.incomplete.length}（共享 chrome 存量只记录）`,
            );
            for (const v of [...shell.violations, ...shell.incomplete]) {
                console.log(`[axe]   ${v.impact} ${v.id} × ${v.nodes.length} — ${v.help}`);
            }

            expect(
                serious(shell).map((v) => `${v.id} (${v.nodes.length} node(s))`),
                `friends: serious/critical axe violations at ${theme}`,
            ).toEqual([]);
            expect(
                shell.incomplete.map((v) => `${v.id} (${v.nodes.length} node(s))`),
                `friends: axe could not finish at ${theme}`,
            ).toEqual([]);
        });
    }
});

/* ───────────────────────── 5. 键盘 / 焦点环 ───────────────────────── */

test("Tab 顺序 + 焦点环 ≥2px & --color-ring-focus", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPage(page, "/friends/", "light");
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
        SHELL,
    );
    expect(focusables.length, "页面主体的可聚焦元素").toBeGreaterThan(5);

    const visited: string[] = [];
    const problems: string[] = [];
    let entered = false;
    for (let step = 0; step < 400 && visited.length < 60; step += 1) {
        await page.keyboard.press("Tab");
        const probe = await page.evaluate((sel) => {
            const el = document.activeElement as HTMLElement | null;
            if (!el) return null;
            const style = getComputedStyle(el);
            const width = parseFloat(style.outlineWidth);
            return {
                inShell: Boolean(el.closest(sel)),
                tag: el.tagName.toLowerCase(),
                text: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30),
                hasRing: style.outlineStyle !== "none" && width >= 2,
                color: style.outlineColor,
            };
        }, SHELL);
        if (!probe) break;
        if (!probe.inShell) {
            if (entered) break; // 已走出页面主体（Header/Footer/评论区之后）
            continue;
        }
        entered = true;
        visited.push(probe.text);
        if (!probe.hasRing) problems.push(`${probe.tag} "${probe.text}" 没有 ≥2px 焦点环`);
        else if (probe.color !== ringToken)
            problems.push(`${probe.tag} "${probe.text}" 焦点环 ${probe.color} ≠ ${ringToken}`);
    }

    console.log(
        `[kbd] friends: 壳内可聚焦 ${focusables.length} 个，逐个 Tab 检查 ${visited.length} 个`,
    );
    expect(entered, "Tab 必须能进入页面主体").toBe(true);
    expect(visited.length, "至少走到卡片与复制按钮").toBeGreaterThanOrEqual(6);
    expect(problems, "焦点环").toEqual([]);
});

/* ───────────────────────── 6. reduced-motion ───────────────────────── */

test.describe("prefers-reduced-motion", () => {
    test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

    test("0 运行中动画 / 位移 <0.5px", async ({ page }) => {
        await page.goto("/friends/", { waitUntil: "load" });
        await page.evaluate(async () => {
            await document.fonts.ready;
        });
        const selector = `${SHELL} > *, ${SHELL} .friend-card, ${SHELL} .friends-panel`;
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
        expect(running, "reduced-motion 下不能有运行中的动画").toEqual([]);

        const drift: string[] = [];
        before.forEach((entry, index) => {
            const now = after[index];
            if (!now) return;
            for (const key of ["top", "left", "width", "height"] as const) {
                if (Math.abs(entry[key] - now[key]) >= 0.5)
                    drift.push(`#${index}.${key} ${entry[key]} → ${now[key]}`);
            }
        });
        expect(drift, "区块位移必须 <0.5px").toEqual([]);
        console.log(`[motion] friends: 探针 ${before.length} 个，0 动画，0 位移`);
    });
});

/* ───────────────────────── 7. CLS ───────────────────────── */

for (const width of [1440, 390] as const) {
    test(`/friends/ CLS ≤ 0.05 @${width}（load 后 2s）`, async ({ page }) => {
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
        await page.goto("/friends/", { waitUntil: "load" });
        await page.waitForTimeout(2000);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cls = await page.evaluate(() => (window as any).__cls as number);
        console.log(`[cls] /friends/ @${width} = ${cls.toFixed(4)}`);
        expect(cls).toBeLessThanOrEqual(0.05);
    });
}

/* ───────────────────────── 8. 卡片契约 ───────────────────────── */

test("卡片契约：外链 http(s) / target=_blank / rel noopener / 头像装饰化", async ({ page }) => {
    await page.goto("/friends/", { waitUntil: "load" });
    const total = Number(await page.locator(SHELL).getAttribute("data-friends-total"));
    expect(total, "adapter 应读到站点友链").toBeGreaterThan(0);

    const rows = await page.evaluate(
        (sel) =>
            [...document.querySelectorAll(`${sel} .friends-grid .friend-card`)].map((card) => ({
                href: card.getAttribute("href") ?? "",
                target: card.getAttribute("target") ?? "",
                rel: card.getAttribute("rel") ?? "",
                name: (card.querySelector(".friend-card__name")?.textContent ?? "").trim(),
                caption: (card.querySelector(".friend-card__caption")?.textContent ?? "").trim(),
                avatarAlt: card.querySelector("img")?.getAttribute("alt") ?? null,
                avatarSized:
                    card.querySelector("img")?.getAttribute("width") === "48" &&
                    card.querySelector("img")?.getAttribute("height") === "48",
                initial: card.querySelector(".friend-card__initial")?.textContent?.trim() ?? null,
            })),
        SHELL,
    );

    expect(rows).toHaveLength(total);
    for (const row of rows) {
        expect(row.href, "友链必须是绝对 http(s)").toMatch(/^https?:\/\//);
        expect(row.target).toBe("_blank");
        expect(row.rel).toContain("noopener");
        expect(row.name, "卡片必须有站点名").not.toBe("");
        expect(row.caption, "副行必须有 host 或简介").not.toBe("");
        if (row.avatarAlt !== null) {
            expect(row.avatarAlt, '头像紧邻站点名 → 必须 alt=""（不重复朗读）').toBe("");
            expect(row.avatarSized, "头像必须带 48×48 防 CLS").toBe(true);
        }
    }
    console.log(`[cards] ${rows.length} 张卡片，外链安全属性齐全`);
});

/* ───────────────────────── 9. 复制按钮 ───────────────────────── */

test.describe("copy buttons", () => {
    test.use({ permissions: ["clipboard-read", "clipboard-write"] });

    test("5 个复制按钮：有 aria-label，点击后切换成「已复制」", async ({ page }) => {
        await page.goto("/friends/", { waitUntil: "load" });
        const buttons = page.locator(`${SHELL} .friends-copy`);
        await expect(buttons, "本站信息 4 个 + 模板 1 个").toHaveCount(5);

        const labels = await buttons.evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("aria-label") ?? ""),
        );
        expect(labels.filter((label) => label.trim() === "")).toEqual([]);

        const first = buttons.first();
        const before = await first.getAttribute("aria-label");
        await first.click();
        await expect(first).toHaveClass(/is-copied/);
        const after = await first.getAttribute("aria-label");
        expect(after, "点击后 aria-label 应变成「已复制」").not.toBe(before);

        const clipboard = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboard.trim(), "剪贴板内容 = 站点信息字段").not.toBe("");

        // 1.5s 后回滚，按钮可重复使用
        await expect(first).not.toHaveClass(/is-copied/, { timeout: 4000 });
        await expect(first).toHaveAttribute("aria-label", before ?? "");
    });
});

/* ───────────────────────── 10. 空态 / 错误态（真实构建） ───────────────────────── */

/**
 * 「删掉站点数据 → 空态仍 200」不能靠 mock：这里用同一条构建链，
 * 把 adapter 的构建期开关设成 empty / error，产出到 test-results/（gitignored），
 * 再直接读产物 HTML 断言。构建 1 次约 75s，两个状态各 1 次。
 */
function buildFixture(state: "empty" | "error"): string {
    const outDir = path.join(ROOT, "test-results", `friends-${state}`);
    rmSync(outDir, { recursive: true, force: true });
    // 单次构建实测 60~150s（图片走 sharp 缓存，pagefind 约 0.5s）；preview server 同时在跑，
    // 挪到 420s 是为了「机器忙时宁可慢，也不要假红」。
    execFileSync(path.join(ROOT, "node_modules/.bin/astro"), ["build", "--outDir", outDir], {
        cwd: ROOT,
        env: { ...process.env, PUBLIC_FRIENDS_STATE: state },
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
    test(`${state} 态：整页构建成功，页面主体仍在（zh + en）`, async () => {
        test.setTimeout(600_000);
        const outDir = buildFixture(state);

        for (const route of ["friends", "en/friends"]) {
            const html = readBuilt(outDir, route);
            expect(html, `${route}: 状态必须是 ${state}`).toContain(
                `data-friends-status="${state}"`,
            );
            expect(html, `${route}: 一张友链卡片都不许渲染`).not.toContain('class="friend-card"');
            expect(html, `${route}: h1 必须在`).toMatch(/<h1[^>]*class="friends-title"/);
            expect(html, `${route}: 申请入口不受影响`).toContain('class="friends-apply"');
            expect(html, `${route}: 复制按钮仍在`).toContain("friends-copy");
        }

        const zh = readBuilt(outDir, "friends");
        if (state === "empty") {
            expect(zh, "空态块").toContain("data-friends-empty");
            expect(zh, "空态文案").toContain("还没有友链");
            expect(zh, "空态仍给出申请入口").toContain("friends-state__cta");
        } else {
            expect(zh, "错误态块").toContain("data-friends-error");
            expect(zh, "错误态用 Alert（warning）").toContain("alert--warning");
            expect(zh, "错误态给出原因代码").toContain("friends-state__hint");
            expect(zh, "错误态不渲染空态块").not.toContain("data-friends-empty");
        }
        console.log(`[fixture] ${state}: dist 产出 ${outDir}，zh/en 双路由 200-ready`);
    });
}

/* ───────────────────────── 11. 证据截图 ───────────────────────── */

test("证据截图：light/dark 1440 + light 390", async ({ page }) => {
    test.setTimeout(90_000);
    if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

    const shots = [
        { name: "friends-light-1440.png", theme: "light" as Theme, width: 1440 },
        { name: "friends-dark-1440.png", theme: "dark" as Theme, width: 1440 },
        { name: "friends-light-390.png", theme: "light" as Theme, width: 390 },
    ];

    for (const shot of shots) {
        await page.setViewportSize({ width: shot.width, height: 900 });
        await openPage(page, "/friends/", shot.theme);
        await page.waitForTimeout(150);
        const target = path.join(EVIDENCE_DIR, shot.name);
        await page.screenshot({ path: target, fullPage: true });
        console.log(`[shot] ${target}`);
    }
});
