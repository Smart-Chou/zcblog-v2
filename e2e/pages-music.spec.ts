import { test, expect, type Page, type Request } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * C-2 音乐 验收（M2-8b）
 *
 * 覆盖（`19-m2-plan.md` §M2-8 的页面级判据 + 本卡专项）：
 *  1. 路由 200：`/music/`、`/en/music/`
 *  2. 中英同源：状态 / 条数 / 艺人 / 年代跨度一致，en 页 h1 真的是英文
 *  3. 恰好 1 个 h1；标题层级不跳级
 *  4. light/dark × 390/768/1440：无横向溢出
 *  5. axe（wcag2a/aa + wcag21a/aa + wcag22aa）：主体 serious/critical=0、incomplete=0（双主题）
 *  6. **关闭态 0 请求**（本卡核心）：页面在后加载窗口里既没有播放器 chunk，也没有音频请求，
 *     DOM 里没有 `<audio>`；`performance` 资源时间线里同样干净
 *  7. **按需加载**：点某一条「试听」后，播放器 chunk 恰好请求 1 次（模块缓存），
 *     无源条目仍然 0 音频请求，面板给出「没有试听源」+ 外链；Esc 关闭并归还焦点
 *  8. **有源路径**：把音频地址注入条目（生产数据没有源 —— 本站不自托管音频），
 *     点击后才出现 1 个音频请求；关闭后 `<audio>` 与缓冲一起断掉，不再新增请求
 *  9. 无 JS：列表、外链、说明都在 SSR HTML 里，页面不含 `<audio>`
 * 10. 空数据：**真实构建**（`PUBLIC_MUSIC_STATE=empty`）证明可构建，随后恢复常规构建
 * 11. 导航：新增入口存在、不溢出、可点击
 * 12. 证据截图（light/dark 1440 + light 390）
 *
 * 为什么第 8 条要注入源：M2 边界是「不接 Meting/网易云、不自托管音频」，示例数据四条
 * 都没有 `audio`。要证明「点击后才请求」这条链路，只能在浏览器里给同一条目补一个
 * 测试地址（由 route() 兜住，不出网），走的仍是生产代码读取 `data-music-audio` 的同一条路径。
 * 地址故意用**同源**（`/fixture/…`）：站点 CSP 是 `default-src 'self'` 且没有 `media-src`，
 * 跨域音频会被浏览器直接拦掉（实测会走到 error 态）。所以「外链试听源」要真正可用，
 * 得由平台侧给 CSP 补 `media-src` —— 那是 M3 的事，本卡不碰 CSP，只把边界记进数据注释。
 * 生产数据加源 = 只改数据文件（外加那条 CSP 决定）。
 */

const ROOT = process.cwd();
const AXE_SOURCE = readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [390, 768, 1440] as const;
type Theme = (typeof THEMES)[number];

const MUSIC = {
    url: "/music/",
    en: "/en/music/",
    shell: ".entities--music",
    status: "data-music-status",
    total: "data-music-total",
    artists: "data-music-artists",
    span: "data-music-span",
    sources: "data-music-audio-sources",
    mount: "[data-music-player-mount]",
    body: "[data-music-player-body]",
    notice: "[data-music-player-notice]",
} as const;

/** 播放器 chunk：动态 import 的产物，名字里带 music-player（首屏不该有）。 */
const PLAYER_CHUNK = /\/music-player\.[\w-]+\.js$/;
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;
/** 同源测试音频：CSP 是 default-src 'self'，跨域音频会被拦（见文件头说明）。 */
const FIXTURE_PATH = "/fixture/m2-8b-tone.wav";

const EVIDENCE_DIR =
    process.env.M28B_EVIDENCE_DIR ??
    path.resolve(ROOT, "../../hermes-desktop-files/blog2.0/docs/_reviews/M2-8b-music");

/** 一段 0.25s 的 8kHz 单声道 WAV：够 Chromium 认出来，不需要任何外部素材。 */
function wavBuffer(): Buffer {
    const sampleRate = 8000;
    const samples = Math.floor(sampleRate * 0.25);
    const dataSize = samples * 2;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);
    return buffer;
}

const isPlayerChunk = (url: string): boolean => PLAYER_CHUNK.test(new URL(url).pathname);
const isAudioRequest = (request: Request): boolean =>
    request.resourceType() === "media" || AUDIO_EXT.test(new URL(request.url()).pathname);

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
    // 主题切换有颜色过渡（最长 --duration-slow）：过渡没走完时 axe 取到的是插值中间色
    await page.waitForTimeout(420);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

/* ───────────────────────── 1. 路由 ───────────────────────── */

for (const [lang, url] of [
    ["zh", MUSIC.url],
    ["en", MUSIC.en],
] as const) {
    test(`route 200 music ${lang}`, async ({ page }) => {
        const response = await page.goto(url, { waitUntil: "load" });
        expect(response?.status(), `GET ${url}`).toBe(200);
        await expect(page.locator(MUSIC.shell)).toHaveCount(1);
        await expect(page.locator(`${MUSIC.shell} h1`)).toHaveCount(1);
    });
}

/* ───────────────────────── 2. 中英同源 ───────────────────────── */

test("中英两页同源：状态 / 条数 / 艺人 / 跨度一致，en 页 h1 是英文", async ({ page }) => {
    const read = async (url: string) => {
        await page.goto(url, { waitUntil: "load" });
        const shell = page.locator(MUSIC.shell);
        return {
            status: await shell.getAttribute(MUSIC.status),
            total: await shell.getAttribute(MUSIC.total),
            artists: await shell.getAttribute(MUSIC.artists),
            span: await shell.getAttribute(MUSIC.span),
            h1: (await page.locator(`${MUSIC.shell} h1`).innerText()).trim(),
        };
    };

    const zh = await read(MUSIC.url);
    const en = await read(MUSIC.en);

    expect(zh.status, "示例数据应为 ok").toBe("ok");
    expect(en.status, "status 中英不一致").toEqual(zh.status);
    expect(en.total, "total 中英不一致").toEqual(zh.total);
    expect(en.artists, "艺人数字中英不一致").toEqual(zh.artists);
    expect(en.span, "年代跨度中英不一致").toEqual(zh.span);
    expect(zh.h1).not.toEqual(en.h1);
    expect(en.h1).toMatch(/^[A-Za-z][A-Za-z\s&]*$/);
    console.log(`[i18n] ${zh.h1} / ${en.h1} · total ${zh.total} · span ${zh.span}`);
});

/* ───────────────────────── 3. h1 / 标题层级 ───────────────────────── */

test("恰好 1 个 h1，标题层级不跳级（双语言）", async ({ page }) => {
    for (const url of [MUSIC.url, MUSIC.en]) {
        await page.goto(url, { waitUntil: "load" });
        const headings = await page.evaluate((sel) => {
            const root = document.querySelector(sel) ?? document;
            return {
                total1: document.querySelectorAll("h1").length,
                inShell: root.querySelectorAll("h1").length,
                levels: [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")]
                    .filter((el) => el.getAttribute("aria-hidden") !== "true")
                    .map((el) => Number(el.tagName.slice(1))),
            };
        }, MUSIC.shell);

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
});

/* ───────────────────────── 4. 横向溢出 ───────────────────────── */

test("overflow music（light/dark × 390/768/1440）", async ({ page }) => {
    for (const theme of THEMES) {
        for (const width of VIEWPORTS) {
            await page.setViewportSize({ width, height: 900 });
            await openPage(page, MUSIC.url, theme);
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
                return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders };
            });
            expect(result.offenders, `music@${width} (${theme}): 越界元素`).toEqual([]);
            expect(
                result.scrollWidth,
                `music@${width} (${theme}): scrollWidth ${result.scrollWidth} > clientWidth ${result.clientWidth}`,
            ).toBeLessThanOrEqual(result.clientWidth + 1);
        }
    }
});

/* ───────────────────────── 5. axe ───────────────────────── */

type AxeNode = { target: unknown[]; html: string; summary?: string };
type AxeViolation = { id: string; impact: string | null; help: string; nodes: AxeNode[] };

async function runAxe(page: Page, contextSelector?: string) {
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
                    summary: n.summary,
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

for (const theme of THEMES) {
    test(`axe music ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await openPage(page, MUSIC.url, theme);
        // 主题过渡必须落定，否则 axe 取到插值中间色（假红）
        await page.addStyleTag({ content: `${MUSIC.shell} * { transition: none !important; }` });
        const { violations, incomplete } = await runAxe(page, MUSIC.shell);
        const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(
            serious.map((v) => `${v.id} (${v.impact}) ${v.nodes[0]?.target ?? ""}`),
            `music ${theme}: serious/critical`,
        ).toEqual([]);
        expect(
            incomplete.map((v) => `${v.id} ${v.nodes[0]?.target ?? ""}`),
            `music ${theme}: incomplete`,
        ).toEqual([]);
        console.log(
            `[axe] music ${theme}: violations=${violations.length} incomplete=${incomplete.length}`,
        );
    });
}

/* ─────────── 5b. axe：播放器面板（打开态 / 错误态，2026-11 对比度修复的回归口） ───────────
 *
 * 关闭态页面上根本没有面板节点，所以 5 的 axe 从来扫不到 `.music-player__body`：
 * 深色下 `fg-muted`(4.02) / `border-default`(2.59) 落在 `bg-raised` 上的缺陷就是这么漏出去的。
 * 这里把面板的两种落地状态都扫一遍，锁住：
 *   - 无源态：`__label` 用 fg-subtle、`__close` 边界用 border-strong（≥3:1）、notice 可达；
 *   - 错误态：danger-bg 上的文案（danger-border 是装饰性 hairline，不在此断言）。
 */

for (const theme of THEMES) {
    test(`axe music player panel ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await openPage(page, MUSIC.url, theme);
        await page.addStyleTag({ content: `${MUSIC.shell} * { transition: none !important; }` });

        const assertClean = async (state: string) => {
            const { violations, incomplete } = await runAxe(page, MUSIC.mount);
            expect(
                violations.map((v) => `${v.id} (${v.impact}) ${v.nodes[0]?.target ?? ""}`),
                `player ${state} ${theme}: violations`,
            ).toEqual([]);
            expect(
                incomplete.map((v) => `${v.id} ${v.nodes[0]?.target ?? ""}`),
                `player ${state} ${theme}: incomplete（颜色没判定出来 = 没测到）`,
            ).toEqual([]);
        };

        // ① 无源态：label / notice / 关闭按钮 同屏
        await page.locator(".music-track").first().locator("[data-music-play]").click();
        await expect(page.locator(MUSIC.mount)).toHaveAttribute(
            "data-music-player-state",
            "no-source",
        );
        await expect(page.locator(MUSIC.body)).toBeVisible();
        await assertClean("no-source");

        // ② 错误态：切到另一条并注入一个必然失败的源（同源、不出网）
        const second = page.locator(".music-track").nth(1);
        await second.evaluate((node) =>
            node.setAttribute("data-music-audio", "/fixture/m8-1-missing-tone.wav"),
        );
        await second.locator("[data-music-play]").click();
        await expect(page.locator(MUSIC.mount)).toHaveAttribute("data-music-player-state", "error");
        await expect(page.locator(MUSIC.notice)).toBeVisible();
        await assertClean("error");

        console.log(
            `[axe] player panel ${theme}: no-source + error 均 0 violations / 0 incomplete`,
        );
    });
}

/* ───────────────────────── 6. 关闭态 0 请求（本卡核心） ───────────────────────── */

test("关闭态：0 个播放器 chunk、0 个音频请求、0 个 <audio>", async ({ page }) => {
    const requests: Array<{ url: string; type: string }> = [];
    page.on("request", (request) =>
        requests.push({ url: request.url(), type: request.resourceType() }),
    );

    await page.goto(MUSIC.url, { waitUntil: "load" });
    // 给懒加载/预取留出窗口：真有请求，这段时间足够露头
    await page.waitForTimeout(1200);

    const chunks = requests.filter((entry) => isPlayerChunk(entry.url));
    const audio = requests.filter(
        (entry) => entry.type === "media" || AUDIO_EXT.test(new URL(entry.url).pathname),
    );

    expect(
        chunks.map((entry) => entry.url),
        "首屏不该请求播放器 chunk",
    ).toEqual([]);
    expect(
        audio.map((entry) => entry.url),
        "首屏不该有音频请求",
    ).toEqual([]);

    const perf = await page.evaluate(() =>
        performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter(
                (name) =>
                    /music-player\.[\w-]+\.js$/.test(name) ||
                    /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)(\?|$)/i.test(name),
            ),
    );
    expect(perf, "performance 资源时间线里也不该有播放器/音频").toEqual([]);

    await expect(page.locator("audio, video, source")).toHaveCount(0);
    await expect(page.locator(MUSIC.mount)).toHaveAttribute("data-music-player-state", "closed");
    await expect(page.locator(MUSIC.body)).toHaveCount(0);
    // 生产数据里没有任何试听源（本站不自托管音频）：这个数字是 0，页面也必须如实报 0
    await expect(page.locator(MUSIC.shell)).toHaveAttribute(MUSIC.sources, "0");

    console.log(`[closed] ${requests.length} 个请求 · 0 播放器 chunk · 0 音频 · 0 <audio>`);
});

/* ───────────────────────── 7. 按需加载（无源条目） ───────────────────────── */

test("点『试听』才加载播放器 chunk；无源条目 0 音频请求，Esc 关闭并归还焦点", async ({ page }) => {
    const requests: Array<{ url: string; type: string }> = [];
    page.on("request", (request) =>
        requests.push({ url: request.url(), type: request.resourceType() }),
    );

    await page.goto(MUSIC.url, { waitUntil: "load" });
    const firstTrack = page.locator(".music-track").first();
    const playButton = firstTrack.locator("[data-music-play]");
    await expect(playButton).toBeVisible();
    expect(
        requests.filter((entry) => isPlayerChunk(entry.url)),
        "点击之前不该有播放器 chunk",
    ).toEqual([]);

    await playButton.click();
    await expect(page.locator(MUSIC.body)).toBeVisible();
    await expect(page.locator(MUSIC.mount)).toHaveAttribute("data-music-player-state", "no-source");
    await expect(page.locator(MUSIC.notice)).toBeVisible();
    await expect(page.locator("[data-music-player-close]")).toBeFocused();
    await expect(page.locator("audio")).toHaveCount(0);

    // 模块只下载一次（第二次点击走缓存）
    const secondPlayButton = page.locator(".music-track").nth(1).locator("[data-music-play]");
    await secondPlayButton.click();
    await page.waitForTimeout(400);
    const chunks = requests.filter((entry) => isPlayerChunk(entry.url));
    expect(chunks.length, "播放器 chunk 只该请求 1 次（模块缓存）").toBe(1);

    const audio = requests.filter(
        (entry) => entry.type === "media" || AUDIO_EXT.test(new URL(entry.url).pathname),
    );
    expect(
        audio.map((entry) => entry.url),
        "没有源就不该发音频请求",
    ).toEqual([]);

    // 切到第二条后标题跟着换（面板复用，不重建）
    const title = (await page.locator("[data-music-now-title]").innerText()).trim();
    expect(title.length).toBeGreaterThan(0);

    const beforeClose = requests.length;
    await page.keyboard.press("Escape");
    await expect(page.locator(MUSIC.mount)).toHaveAttribute("data-music-player-state", "closed");
    await expect(page.locator(MUSIC.body)).toHaveCount(0);
    await expect(page.locator("[data-music-player-idle]")).toBeVisible();
    // 焦点归还给「最后打开的那一条」的按钮
    await expect(secondPlayButton).toBeFocused();
    await page.waitForTimeout(400);
    expect(requests.length, "关闭后不该再产生请求").toBe(beforeClose);

    console.log(`[lazy] chunk=1 · audio=0 · 面板状态 no-source · Esc 归还焦点`);
});

/* ───────────────────────── 8. 有源路径（测试注入） ───────────────────────── */

test("有源条目：点击后 1 个音频请求，关闭后断源且不再请求", async ({ page }) => {
    const audioRequests: string[] = [];
    await page.route(`**${FIXTURE_PATH}`, async (route) => {
        audioRequests.push(route.request().url());
        await route.fulfill({
            status: 200,
            headers: { "content-type": "audio/wav", "accept-ranges": "bytes" },
            body: wavBuffer(),
        });
    });

    await page.goto(MUSIC.url, { waitUntil: "load" });
    const fixtureAudio = new URL(FIXTURE_PATH, page.url()).href;
    const firstTrack = page.locator(".music-track").first();
    // 生产数据没有源；这里给同一个条目补一个测试地址 —— 播放器读的仍是 data-music-audio
    await firstTrack.evaluate((node, audio) => {
        node.setAttribute("data-music-audio", audio);
    }, fixtureAudio);

    expect(audioRequests, "注入地址本身不该触发请求").toEqual([]);

    await firstTrack.locator("[data-music-play]").click();
    await expect(page.locator("audio[data-music-audio-element]")).toHaveCount(1);
    await expect(page.locator("audio[data-music-audio-element]")).toHaveAttribute(
        "src",
        fixtureAudio,
    );
    await expect(page.locator(MUSIC.mount)).not.toHaveAttribute(
        "data-music-player-state",
        "closed",
    );
    await expect.poll(() => audioRequests.length, { timeout: 5000 }).toBe(1);
    expect(audioRequests[0]).toBe(fixtureAudio);

    // 关闭 = 断源：元素移出 DOM，再等一段时间也不会补发请求
    await page.locator("[data-music-player-close]").click();
    await expect(page.locator(MUSIC.mount)).toHaveAttribute("data-music-player-state", "closed");
    await expect(page.locator("audio")).toHaveCount(0);
    await page.waitForTimeout(800);
    expect(audioRequests.length, "关闭后不该再请求音频").toBe(1);

    console.log(`[source] 1 个音频请求 · 关闭后 audio=0 · 无补发`);
});

/* ───────────────────────── 9. 无 JS ───────────────────────── */

test("无 JS：列表 / 外链 / 说明都在 HTML 里，页面不含 <audio>", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    try {
        const response = await page.goto(MUSIC.url, { waitUntil: "load" });
        expect(response?.status(), "无 JS 也要 200").toBe(200);

        const total = Number(await page.locator(MUSIC.shell).getAttribute(MUSIC.total));
        expect(total).toBeGreaterThan(0);
        await expect(page.locator(".music-track")).toHaveCount(total);
        await expect(page.locator(".music-track__link")).toHaveCount(total);
        await expect(page.locator("audio, video, source")).toHaveCount(0);
        await expect(page.locator("[data-music-player-state]")).toHaveAttribute(
            "data-music-player-state",
            "closed",
        );
        // 关闭态说明也在 SSR 里：不靠 JS 也知道「播放器还没打开」
        await expect(page.locator("[data-music-player-idle]")).toBeVisible();

        console.log(`[no-js] ${total} 条作品 · ${total} 个外链 · 0 <audio>`);
    } finally {
        await context.close();
    }
});

/* ───────────────────────── 10. 数据契约 ───────────────────────── */

test("契约：每条有标题/表演者/年份，id 唯一，年份按数据顺序降序，有源标记自洽", async ({
    page,
}) => {
    await page.goto(MUSIC.url, { waitUntil: "load" });
    const rows = await page.locator(".music-track").evaluateAll((nodes) =>
        nodes.map((node) => ({
            id: node.getAttribute("data-music-id") ?? "",
            year: node.getAttribute("data-music-year") ?? "",
            audio: node.getAttribute("data-music-audio") ?? "",
            hasAudio: node.getAttribute("data-music-has-audio"),
            title: (node.querySelector(".music-track__title")?.textContent ?? "").trim(),
            artist: (node.querySelector(".music-track__artist")?.textContent ?? "").trim(),
            note: (node.querySelector(".music-track__note")?.textContent ?? "").trim(),
            hint: (node.querySelector(".music-track__hint")?.textContent ?? "").trim(),
            linkTarget: node.querySelector(".music-track__link")?.getAttribute("target") ?? "",
            linkRel: node.querySelector(".music-track__link")?.getAttribute("rel") ?? "",
            cover: node.querySelector(".music-track__cover img")?.getAttribute("alt") ?? null,
        })),
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((row) => row.id)).size, "id 必须唯一").toBe(rows.length);

    const shell = page.locator(MUSIC.shell);
    const declaredSources = Number(await shell.getAttribute(MUSIC.sources));
    expect(
        rows.filter((row) => row.audio !== "").length,
        "data-music-audio-sources 必须与真实带源条目数一致",
    ).toBe(declaredSources);

    for (const row of rows) {
        expect(row.title.length, `${row.id} 缺标题`).toBeGreaterThan(0);
        expect(row.artist.length, `${row.id} 缺表演者`).toBeGreaterThan(0);
        expect(row.note.length, `${row.id} 缺说明`).toBeGreaterThan(0);
        expect(row.year, `${row.id} 年份必须是 YYYY`).toMatch(/^\d{4}$/);
        // 有源 ⇔ data-music-audio 非空；无源必须写出「无试听源」，不能只靠按钮样式
        expect(row.hasAudio, `${row.id} 有源标记与 data-music-audio 不一致`).toBe(
            String(row.audio !== ""),
        );
        if (row.audio === "")
            expect(row.hint.length, `${row.id} 无源却没写说明`).toBeGreaterThan(0);
        if (row.audio !== "") expect(row.hint, `${row.id} 有源不该显示「无源」`).toBe("");
        expect(row.linkTarget, `${row.id} 外链必须新窗口打开`).toBe("_blank");
        expect(row.linkRel, `${row.id} 外链必须带 noopener`).toContain("noopener");
        // 封面是装饰（标题就在旁边）：alt 必须是空串，不许重复标题
        if (row.cover !== null) expect(row.cover, `${row.id} 封面 alt 应为空`).toBe("");
    }

    // 数据文件顺序 = 页面顺序，且契约是发行年降序
    const years = rows.map((row) => row.year);
    expect(years, `年份必须降序：${years.join(" → ")}`).toEqual(
        [...years].sort((a, b) => b.localeCompare(a)),
    );

    // 重载后顺序不变（顺序由数据决定，不靠客户端排序）
    await page.reload({ waitUntil: "load" });
    const again = await page
        .locator(".music-track")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-music-id")));
    expect(again, "两次加载顺序必须一致").toEqual(rows.map((row) => row.id));

    console.log(
        `[contract] ${rows.length} 条 · ${declaredSources} 条带源 · 年份降序 · 外链安全属性齐`,
    );
});

/* ───────────────────────── 11. 导航 ───────────────────────── */

test("导航：音乐入口存在、不溢出、可点击", async ({ page }) => {
    for (const width of [390, 1440] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/", { waitUntil: "load" });
        await page.locator("#nav-menu-btn").click();
        const nav = page.locator("#nav-dropdown");
        await expect(nav).toBeVisible();

        const link = nav.locator('a[href="/music/"]');
        await expect(link, `${width}px: 导航缺音乐入口`).toHaveCount(1);
        const box = await link.boundingBox();
        expect(box, `${width}px: 音乐入口无布局盒`).not.toBeNull();
        const overflow = await nav.evaluate(
            (el) => el.getBoundingClientRect().right - document.documentElement.clientWidth,
        );
        expect(overflow, `${width}px: 导航面板越界`).toBeLessThanOrEqual(1);

        await link.click();
        await page.waitForURL("**/music/");
        await expect(page.locator(MUSIC.shell)).toHaveCount(1);
        console.log(`[nav] ${width}px: 音乐入口可点击 → ${page.url()}`);
    }
});

/* ───────────────────────── 12. 空数据（真实构建） ───────────────────────── */

test("空数据可构建：真实构建为空态，路由仍 200", async ({ page }) => {
    test.setTimeout(900_000);
    const astroBin = path.join(ROOT, "node_modules/.bin/astro");

    try {
        execFileSync(astroBin, ["build"], {
            cwd: ROOT,
            env: { ...process.env, PUBLIC_MUSIC_STATE: "empty" },
            stdio: "pipe",
        });

        const response = await page.goto(MUSIC.url, { waitUntil: "load" });
        expect(response?.status(), "空态也必须 200").toBe(200);
        await expect(page.locator(MUSIC.shell)).toHaveAttribute(MUSIC.status, "empty");
        await expect(page.locator("[data-music-empty]")).toBeVisible();
        await expect(page.locator(`${MUSIC.shell} .music-track`)).toHaveCount(0);
        // 页头与播放器挂载点仍在：空态是页面状态，不是异常
        await expect(page.locator(`${MUSIC.shell} h1`)).toHaveCount(1);
        await expect(page.locator(MUSIC.mount)).toHaveAttribute(
            "data-music-player-state",
            "closed",
        );
        await expect(page.locator("audio")).toHaveCount(0);
        console.log("[empty] 真实构建：空态、0 条目、页头与播放器保留、路由 200");
    } finally {
        // 恢复常规构建：后续用例（以及验收命令里的 perf / visual）必须看到正常数据
        execFileSync(astroBin, ["build"], { cwd: ROOT, env: process.env, stdio: "pipe" });
    }
});

/* ───────────────────────── 13. 证据截图 ───────────────────────── */

test("证据截图：music light/dark 1440 + light 390（含播放器关闭态）", async ({ page }) => {
    if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
    const shots = [
        { theme: "light" as Theme, width: 1440, name: "music-light-1440.png" },
        { theme: "dark" as Theme, width: 1440, name: "music-dark-1440.png" },
        { theme: "light" as Theme, width: 390, name: "music-light-390.png" },
    ];
    for (const shot of shots) {
        await page.setViewportSize({ width: shot.width, height: 900 });
        await openPage(page, MUSIC.url, shot.theme);
        await page.screenshot({ path: path.join(EVIDENCE_DIR, shot.name), fullPage: true });
    }

    // 播放器面板打开态也留一张：面板样式没有单独的可视化基线，靠这张图评审
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPage(page, MUSIC.url, "light");
    await page.locator(".music-track").first().locator("[data-music-play]").click();
    await expect(page.locator(MUSIC.body)).toBeVisible();
    await page.screenshot({
        path: path.join(EVIDENCE_DIR, "music-player-open-1440.png"),
        fullPage: true,
    });

    console.log(`[evidence] ${shots.length + 1} 张截图 → ${EVIDENCE_DIR}`);
});
