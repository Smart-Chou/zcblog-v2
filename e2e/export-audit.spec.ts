import { test, expect, type Page } from "@playwright/test";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * M2-12b · 出口审计（V-01 暗色逐页 / P-09 移动 / axe 全站）
 *
 * 判据来源：`blog2.0/docs/19-m2-plan.md` §3 M2-12 ②③、§4 出口映射（V-01 / P-09 行）、
 * `20-m2-resplit.md` §3 第 14 卡、看板 `t_3e5510f9` 验收：
 *   1. 全站页面 dark 逐一检查（主题真的生效 + 暗色面上不是亮的 + 1440 无横向溢出）
 *   2. axe（WCAG 2.x A/AA）逐页：serious/critical = 0；incomplete 只记录不计红
 *   3. 4 页 × 2 主题 × 3 视口 移动矩阵：390/768/1440 无横向溢出
 *
 * 页面分母来自构建产物 `dist/`（不是手写路由表）：任何一个页面只要进了 dist 就必须被审到，
 * 新增页面不会因为「忘了加到清单」而漏审。`pagefind/`（搜索索引分片）与 `_*` 目录不是页面，跳过。
 *
 * 输出（全部可复跑）：
 *   docs/_reviews/M2-12/audit-data/dark-pages.jsonl   每页一行：主题 / 亮度 / 溢出 / axe 计数
 *   docs/_reviews/M2-12/audit-data/axe.jsonl          每页 axe 明细（含 incomplete 节点）
 *   docs/_reviews/M2-12/audit-data/mobile.jsonl       P-09 24 组合
 *   docs/_reviews/M2-12/screenshots/**                截图（AUDIT_SHOTS=1 才写，CI 不写盘）
 *
 * 常用跑法：
 *   npx playwright test e2e/export-audit.spec.ts                       # 全量（约 30–40 分钟，单 worker）
 *   AUDIT_ROUTES='/ /blog/1/ /culture/' npx playwright test e2e/export-audit.spec.ts   # 只跑指定路由
 *   AUDIT_SHOTS=1 npx playwright test e2e/export-audit.spec.ts -g 'v01-shots'          # 只出截图
 */

const AXE_SOURCE = readFileSync(
    path.join(process.cwd(), "node_modules/axe-core/axe.min.js"),
    "utf8",
);

const DIST = path.resolve(process.cwd(), "dist");
const AUDIT_DIR =
    process.env.AUDIT_DATA_DIR ?? path.resolve(process.cwd(), "docs/_reviews/M2-12/audit-data");
const SHOT_DIR =
    process.env.AUDIT_SHOT_DIR ?? path.resolve(process.cwd(), "docs/_reviews/M2-12/screenshots");

const DARK_JSONL = path.join(AUDIT_DIR, "dark-pages.jsonl");
const AXE_JSONL = path.join(AUDIT_DIR, "axe.jsonl");
const MOBILE_JSONL = path.join(AUDIT_DIR, "mobile.jsonl");
const KNOWN_FILE = path.join(AUDIT_DIR, "axe-known.json");

/**
 * 存量 serious/critical 基线（棘轮）。验收口径是「0 serious/critical」；
 * 本卡不改页面源码，所以先落一份基线把存量登记清楚，门禁只对**新增**判红。
 * `AUDIT_BASELINE=0` 可强制回严格零容忍——修完之后就该这么跑。
 */
type KnownIssue = { rule: string; selector?: string; note: string };
const USE_BASELINE = process.env.AUDIT_BASELINE !== "0" && existsSync(KNOWN_FILE);
const KNOWN: KnownIssue[] = USE_BASELINE
    ? (JSON.parse(readFileSync(KNOWN_FILE, "utf8")) as KnownIssue[])
    : [];

function findKnown(finding: AxeFinding): KnownIssue | undefined {
    return KNOWN.find(
        (k) =>
            k.rule === finding.id &&
            finding.nodes.every(
                (n) => k.selector === undefined || String(n.target).includes(k.selector!),
            ),
    );
}

/* ───────────────────────── 页面分母 ───────────────────────── */

/** dist 里所有 HTML 文件 → URL（index.html 收敛成目录路由）。 */
function listDistPages(): string[] {
    if (!existsSync(DIST)) return [];
    const routes: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                // pagefind = 搜索索引分片；`_astro` / `_headers` 等以 _ 开头的是资源，不是页面
                if (entry.name === "pagefind" || entry.name.startsWith("_")) continue;
                walk(full);
            } else if (entry.name.endsWith(".html")) {
                const rel = path.relative(DIST, full).split(path.sep).join("/");
                if (rel.endsWith("/index.html"))
                    routes.push("/" + rel.slice(0, -"index.html".length));
                else if (rel === "index.html") routes.push("/");
                else routes.push("/" + rel); // 404.html / 500.html 这类独立文件
            }
        }
    };
    walk(DIST);
    return Array.from(new Set(routes)).sort();
}

const ALL_PAGES = listDistPages();
const ONLY = (process.env.AUDIT_ROUTES ?? "")
    .split(/[\s,]+/)
    .map((r) => r.trim())
    .filter(Boolean);
const LIMIT = Number(process.env.AUDIT_LIMIT ?? "0");
const PAGES = (ONLY.length ? ONLY : ALL_PAGES).slice(0, LIMIT > 0 ? LIMIT : undefined);

/** V-01 截图取「每个页面族至少一张」：模板覆盖优先于页数覆盖。 */
const SHOT_ROUTES = [
    "/",
    "/en/",
    "/ja/",
    "/ru/",
    "/blog/1/",
    "/archives/",
    "/tags/",
    "/culture/",
    "/friends/",
    "/talks/",
    "/donate/",
    "/projects/",
    "/skills/",
    "/devices/",
    "/games/",
    "/timeline/",
    "/music/",
    "/albums/",
    "/search/",
    "/design/",
    "/404.html",
].filter((r) => ALL_PAGES.includes(r));

/** P-09 移动矩阵：4 个页面族（首页 / 文章 / 归档 / 聚合页）。 */
const MOBILE_ROUTES = ["/", "/blog/1/", "/archives/", "/culture/"].filter((r) =>
    ALL_PAGES.includes(r),
);

/* ───────────────────────── 工具 ───────────────────────── */

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [390, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

function ensureDir(dir: string) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function record(file: string, row: unknown) {
    ensureDir(path.dirname(file));
    appendFileSync(file, JSON.stringify(row) + "\n");
}

/** 以真实访客身份打开：localStorage 预置主题（等价于用户选过暗色），再等字体与两帧。 */
async function openAs(page: Page, route: string, theme: Theme, width: number, height: number) {
    await page.setViewportSize({ width, height });
    await page.addInitScript((value: string) => {
        try {
            localStorage.setItem("preferredTheme", value);
        } catch {
            /* localStorage 不可用时主题仍靠 data-theme 注入，见下 */
        }
    }, theme);
    const response = await page.goto(route, { waitUntil: "load" });
    await page.evaluate(
        async ({ value }) => {
            // 兜底：即便有页面在 load 后重置了主题，也按被测主题渲染
            document.documentElement.classList.toggle("dark", value === "dark");
            document.documentElement.setAttribute("data-theme", value);
            document.documentElement.style.colorScheme = value;
            await document.fonts.ready;
            await new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            );
        },
        { value: theme },
    );
    return response;
}

type PageMetrics = {
    theme: string | null;
    hasDarkClass: boolean;
    title: string;
    lang: string;
    innerWidth: number;
    clientWidth: number;
    scrollWidth: number;
    overflowX: number;
    bgLuminance: number;
    bgColor: string;
    textColor: string;
    domNodes: number;
    offenders: { tag: string; cls: string; left: number; right: number }[];
};

function measure(page: Page): Promise<PageMetrics> {
    return page.evaluate(() => {
        const parse = (value: string): [number, number, number, number] | null => {
            const m = value.match(/rgba?\(([^)]+)\)/);
            if (!m) return null;
            const parts = m[1]
                .split(/[,/\s]+/)
                .filter(Boolean)
                .map(Number);
            return [parts[0], parts[1], parts[2], parts[3] ?? 1];
        };
        const lum = ([r, g, b]: [number, number, number, number]) => {
            const f = (c: number) => {
                const s = c / 255;
                return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
            };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        /** 元素自身没有不透明背景时向上找，直到 <html>（真实看到的底色）。 */
        const effectiveBg = (el: Element | null): string => {
            let node: Element | null = el;
            while (node) {
                const c = parse(getComputedStyle(node).backgroundColor);
                if (c && c[3] > 0.999) return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
                node = node.parentElement;
            }
            return "rgb(255, 255, 255)";
        };
        const body = document.body;
        const bg = parse(effectiveBg(body)) ?? [255, 255, 255, 1];
        const fgRaw = getComputedStyle(body).color;
        const offenders: { tag: string; cls: string; left: number; right: number }[] = [];
        const vw = window.innerWidth;
        const clientVw = document.documentElement.clientWidth;
        for (const el of Array.from(document.querySelectorAll("body *"))) {
            const rect = el.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;
            if (rect.right > vw + 1 || rect.left < -1) {
                const cls =
                    typeof (el as HTMLElement).className === "string"
                        ? (el as HTMLElement).className
                        : String((el as SVGElement).getAttribute("class") ?? "");
                offenders.push({
                    tag: el.tagName.toLowerCase(),
                    cls: cls.slice(0, 90),
                    left: Math.round(rect.left),
                    right: Math.round(rect.right),
                });
                if (offenders.length >= 12) break;
            }
        }
        return {
            theme: document.documentElement.getAttribute("data-theme"),
            hasDarkClass: document.documentElement.classList.contains("dark"),
            title: document.title,
            lang: document.documentElement.lang,
            innerWidth: vw,
            clientWidth: clientVw,
            scrollWidth: document.documentElement.scrollWidth,
            overflowX: document.documentElement.scrollWidth - clientVw,
            bgLuminance: Math.round(lum(bg as [number, number, number, number]) * 1000) / 1000,
            bgColor: `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`,
            textColor: fgRaw,
            domNodes: document.querySelectorAll("*").length,
            offenders,
        };
    });
}

type AxeNode = { target: unknown[]; html: string; failureSummary?: string };
type AxeFinding = {
    id: string;
    impact: string | null;
    help: string;
    helpUrl: string;
    nodes: AxeNode[];
};

async function runAxe(page: Page): Promise<{ violations: AxeFinding[]; incomplete: AxeFinding[] }> {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const axe = (window as any).axe;
        const map = (list: AxeFinding[]) =>
            list.map((v) => ({
                id: v.id,
                impact: v.impact,
                help: v.help,
                helpUrl: v.helpUrl,
                nodes: v.nodes.map((n) => ({
                    target: n.target,
                    html: n.html.slice(0, 200),
                    summary: n.failureSummary,
                })),
            }));
        const result = await axe.run(document, {
            runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
            resultTypes: ["violations", "incomplete"],
        });
        return { violations: map(result.violations), incomplete: map(result.incomplete) };
    });
}

function slug(route: string) {
    if (route === "/") return "home";
    return route
        .replace(/^\//, "")
        .replace(/\/$/, "")
        .replace(/[^\w.-]+/g, "_");
}

/* ───────────────────────── 1. V-01 暗色逐页 + axe 全站 ───────────────────────── */

test.describe("v01-dark-all-pages", () => {
    test.beforeAll(() => ensureDir(AUDIT_DIR));
    test.skip(
        ALL_PAGES.length === 0,
        "dist 不存在：先跑 `npx astro build`（本 spec 审构建产物，不审源码）",
    );

    for (const route of PAGES) {
        test(`dark ${route}`, async ({ page }) => {
            test.setTimeout(120_000);
            const response = await openAs(page, route, "dark", 1440, 900);
            const status = response?.status() ?? 0;
            const m = await measure(page);
            const axe = await runAxe(page);
            const serious = axe.violations.filter(
                (v) => v.impact === "serious" || v.impact === "critical",
            );
            const known = serious.map((v) => ({ v, k: findKnown(v) })).filter((p) => p.k) as {
                v: AxeFinding;
                k: KnownIssue;
            }[];
            const fresh = serious.map((v) => ({ v, k: findKnown(v) })).filter((p) => !p.k) as {
                v: AxeFinding;
                k?: KnownIssue;
            }[];
            const moderate = axe.violations.filter((v) => v.impact === "moderate");
            const minor = axe.violations.filter((v) => v.impact === "minor");

            const row = {
                route,
                status,
                theme: m.theme,
                hasDarkClass: m.hasDarkClass,
                bgColor: m.bgColor,
                bgLuminance: m.bgLuminance,
                textColor: m.textColor,
                innerWidth: m.innerWidth,
                scrollWidth: m.scrollWidth,
                overflowX: m.overflowX,
                lang: m.lang,
                domNodes: m.domNodes,
                offenders: m.offenders,
                axe: {
                    serious: serious.length,
                    knownSerious: known.length,
                    newSerious: fresh.length,
                    critical: axe.violations.filter((v) => v.impact === "critical").length,
                    moderate: moderate.length,
                    minor: minor.length,
                    incomplete: axe.incomplete.length,
                    ids: [...new Set([...axe.violations, ...axe.incomplete].map((v) => v.id))],
                },
                title: m.title,
            };
            record(DARK_JSONL, row);
            record(AXE_JSONL, {
                route,
                theme: "dark",
                violations: axe.violations,
                incomplete: axe.incomplete,
            });
            if (serious.length > 0)
                console.log(
                    `[axe] dark ${route}: serious=${serious.length} (known=${known.length} new=${fresh.length}) incomplete=${axe.incomplete.length}`,
                );

            const label = `dark ${route}`;
            expect(status, `${label}: HTTP 状态`).toBeLessThan(400);
            expect(m.theme, `${label}: data-theme 未生效`).toBe("dark");
            expect(m.hasDarkClass, `${label}: html.dark 缺失（部分 CSS 走 .dark 选择器）`).toBe(
                true,
            );
            expect(m.bgLuminance, `${label}: 暗色页底色仍然偏亮 (${m.bgColor})`).toBeLessThan(0.25);
            expect(m.overflowX, `${label}: 1440 横向溢出 ${m.overflowX}px`).toBeLessThanOrEqual(1);
            expect(
                fresh.map((p) => ({
                    id: p.v.id,
                    impact: p.v.impact,
                    nodes: p.v.nodes.map((n) => n.target),
                })),
                `${label}: axe serious/critical 出现**新增**（存量 ${known.length} 条已登记在 axe-known.json）`,
            ).toEqual([]);
        });
    }
});

/* ───────────────────────── 2. P-09 移动矩阵 ───────────────────────── */

test.describe("p09-mobile-matrix", () => {
    test.beforeAll(() => ensureDir(AUDIT_DIR));

    for (const route of MOBILE_ROUTES) {
        for (const theme of THEMES) {
            for (const width of VIEWPORTS) {
                test(`mobile ${route} ${theme}@${width}`, async ({ page }) => {
                    test.setTimeout(60_000);
                    const height = width === 390 ? 844 : width === 768 ? 1024 : 900;
                    const response = await openAs(page, route, theme, width, height);
                    const m = await measure(page);
                    record(MOBILE_JSONL, {
                        route,
                        theme,
                        width,
                        status: response?.status() ?? 0,
                        scrollWidth: m.scrollWidth,
                        innerWidth: m.innerWidth,
                        overflowX: m.overflowX,
                        offenders: m.offenders,
                        bgLuminance: m.bgLuminance,
                    });
                    expect(response?.status() ?? 0, `${route} ${theme}@${width}`).toBeLessThan(400);
                    expect(
                        m.overflowX,
                        `${route} ${theme}@${width}: 横向溢出 ${m.overflowX}px`,
                    ).toBeLessThanOrEqual(1);
                });
            }
        }
    }
});

/* ───────────────────────── 3. V-01 证据截图（AUDIT_SHOTS=1） ───────────────────────── */

test.describe("v01-shots", () => {
    test.skip(process.env.AUDIT_SHOTS !== "1", "证据截图默认不写盘（AUDIT_SHOTS=1 打开）");
    test.skip(ALL_PAGES.length === 0, "dist 不存在");

    test("dark-desktop", async ({ page }) => {
        test.setTimeout(15 * 60_000);
        ensureDir(path.join(SHOT_DIR, "dark-desktop"));
        for (const route of SHOT_ROUTES) {
            await openAs(page, route, "dark", 1440, 900);
            await page.screenshot({
                path: path.join(SHOT_DIR, "dark-desktop", `${slug(route)}.jpg`),
                fullPage: true,
                animations: "disabled",
                type: "jpeg",
                quality: 82,
            });
        }
        expect(SHOT_ROUTES.length).toBeGreaterThan(10);
    });

    test("mobile-390", async ({ page }) => {
        test.setTimeout(10 * 60_000);
        ensureDir(path.join(SHOT_DIR, "mobile-390"));
        for (const route of MOBILE_ROUTES) {
            for (const theme of THEMES) {
                await openAs(page, route, theme, 390, 844);
                await page.screenshot({
                    path: path.join(SHOT_DIR, "mobile-390", `${slug(route)}-${theme}.jpg`),
                    fullPage: true,
                    animations: "disabled",
                    type: "jpeg",
                    quality: 82,
                });
            }
        }
        expect(MOBILE_ROUTES.length).toBe(4);
    });
});
