#!/usr/bin/env node
/**
 * M7-3b-1 · 3:4 分享海报（1200×1600）渲染变体测试。
 *
 *   node --test test/poster.test.mjs
 *
 * 说明：`package.json` 的 `test` 脚本仍 `node --test test/smoke.test.mjs`（本卡禁止改
 * package.json），所以这条用例要单独跑；`pnpm --filter ./packages/og-image test`
 * 依旧只跑 smoke（默认 OG 的 golden 基线在那条链上）。
 *
 * 被测对象是**发布物** `dist/`，与 smoke 一致。出图断言需要真实字体：
 * `DOGEARED_OG_FONT_DIR` → 仓库 `.astro/fonts`，找不到整组 SKIP。
 *
 * 断言分三层：
 *   1. 尺寸/基线：默认分支仍是 1200×630，且与 smoke 的 golden sha256 逐字节相同；
 *   2. 变体：`poster: true` 是 1200×1600，严格 3:4；
 *   3. 像素结构（sharp 解码后扫行/列）：页脚在底部留白内、文字不越右留白、
 *      顶部留白干净、中间存在 flexGrow 空档（说明没有块被挤/被裁）、tags 胶囊行存在。
 *
 * 同时把 poster.png / og-1200x630.png 写到 `docs/_reviews/M7-3b-1/`，并打印
 * `POSTER_METRICS`（耗时 / RSS / 字节数 / sha256），供 report.md 引用。
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pkgRoot, "..", "..");
const outDir = path.join(repoRoot, "docs", "_reviews", "M7-3b-1");

const pkg = await import(path.join(pkgRoot, "dist", "index.js"));
const { default: sharp } = await import("sharp");

/* ───────────────────────── 固定输入 ───────────────────────── */

const SITE = {
    title: "Dogeared Fixture",
    author: "Fixture Author",
    url: "https://dogeared-fixture.test",
    description: "M4-3 消费者验证用站点身份。",
};
const THEME = { background: "#0d1117", foreground: "#f0f0f0", accent: "#d4a040" };

/** 与 smoke 完全一致的输入 —— 用来证明默认分支的像素基线没被这次重构动过。 */
const SMOKE_POST = {
    slug: "hello-dogeared",
    title: "折角测试：OG 图从 tarball 里长出来",
    tags: ["fixture", "og-image"],
    pubDate: new Date("2026-11-06T00:00:00Z"),
    description: "这条摘要是固定输入，用来验证 satori 排版与 sharp 出图在干净消费者里一致。",
};

/** smoke 里的 golden（`test/smoke.test.mjs` 的 GOLDEN 常量，保持同源）。 */
const GOLDEN = {
    bytes: 49574,
    sha256: "6b9d876220aa74daa856580e668ba1ed10f397df386752a5cba000d733f38329",
};

/**
 * 海报的**最坏情况**输入：标题长到必须截断（38 字预算）、摘要长到必须截断
 * （220 字预算 ≈ 7 行）、tags 多到必须换行。放得下才算版式成立。
 */
const LONG_POST = {
    slug: "poster-worst-case",
    title: "折角海报：把一篇长文章压进一张 3:4 的纸——从构建期 Satori 渲染到微信扫码分享的全链路取舍与像素预算复盘",
    tags: ["Engineering", "Astro", "AI-Pair", "Systems", "Longform", "Satori"],
    pubDate: new Date("2026-11-09T00:00:00Z"),
    description:
        "一张竖版海报要把标题、摘要、标签、站点标识四样东西同时塞进 3:4 的画面，而浏览器不该为此打包 satori" +
        "。所以渲染留在构建期，站点只下载生成好的 PNG。这条 fixture 故意把标题写到必须截断、把摘要写到必" +
        "须截断、把 tags 写到必须换行，用来证明最坏情况下页脚仍然在自己的底部留白里，文字既不撞边也不溢出" +
        "画布；同时也证明默认的 1200×630 OG 图没有被这次变体重构动到任何一个像素。",
};

/* ───────────────────────── 字体 ───────────────────────── */

function resolveFonts() {
    const candidates = [
        process.env.DOGEARED_OG_FONT_DIR,
        path.join(repoRoot, ".astro", "fonts"),
    ].filter(Boolean);
    for (const dir of candidates) {
        const regular = path.join(dir, "NotoSansSC-Regular.otf");
        const bold = path.join(dir, "NotoSansSC-Bold.otf");
        if (existsSync(regular) && existsSync(bold)) return { regular, bold, dir };
    }
    return null;
}

const fonts = resolveFonts();
const needsFonts = fonts
    ? false
    : "没有本地字体（DOGEARED_OG_FONT_DIR 或仓库 .astro/fonts）——出图断言跳过";

const common = {
    posts: [SMOKE_POST, LONG_POST],
    site: SITE,
    theme: THEME,
    ...(fonts ? { fonts: { regular: fonts.regular, bold: fonts.bold } } : {}),
    fontCacheDir: path.join(pkgRoot, ".astro", "test-font-cache"),
};

const ogRoute = pkg.createOgImageRoute(common);
const ogExplicitRoute = pkg.createOgImageRoute({ ...common, poster: false });
const posterRoute = pkg.createOgImageRoute({ ...common, poster: true });

const render = async (route, slug) => {
    const res = await route({ params: { og: slug } });
    return { res, body: Buffer.from(await res.arrayBuffer()) };
};

/* ───────────────────────── 1. 包形状（不需要字体）───────────────────────── */

test("exports: poster 是 options 上的可选开关，没有新增运行期导出", () => {
    assert.deepEqual(Object.keys(pkg), ["createOgImageRoute"], "顶层导出必须保持只有 factory");
    assert.equal(typeof pkg.createOgImageRoute, "function");
    // poster 走 options，不进第二条 factory：证明「同一模板 + 开关」而不是「第二套模板」
    assert.equal(pkg.createOgImageRoute.length, 1);
});

test("dist: satori/sharp 只出现在 route 模块（构建期依赖不外溢到入口之外）", () => {
    const distDir = path.join(pkgRoot, "dist");
    const files = readdirSync(distDir).filter((f) => f.endsWith(".js"));
    const importsOf = (needle) =>
        files.filter((f) => readFileSync(path.join(distDir, f), "utf8").includes(needle));
    assert.deepEqual(importsOf('from "satori"'), ["route.js"]);
    assert.deepEqual(importsOf('from "sharp"'), ["route.js"]);
});

/* ───────────────────────── 2. 尺寸与默认基线（需要字体）───────────────────────── */

test("默认分支：1200×630，与 smoke golden 逐字节相同", { skip: needsFonts }, async () => {
    const { res, body } = await render(ogRoute, SMOKE_POST.slug);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.equal(body.readUInt32BE(16), 1200, "宽");
    assert.equal(body.readUInt32BE(20), 630, "高");
    assert.equal(body.length, GOLDEN.bytes, `字节数漂移（${body.length}）`);
    assert.equal(
        createHash("sha256").update(body).digest("hex"),
        GOLDEN.sha256,
        "默认 OG 图与 smoke golden 不再逐字节相同（版式重构改变了默认分支）",
    );
});

test("poster:false 与不传 poster 完全等价", { skip: needsFonts }, async () => {
    const a = await render(ogRoute, LONG_POST.slug);
    const b = await render(ogExplicitRoute, LONG_POST.slug);
    const [ha, hb] = [a, b].map((r) => createHash("sha256").update(r.body).digest("hex"));
    assert.equal(ha, hb, "显式 poster:false 应与缺省走同一条渲染树");
});

test("poster:true：1200×1600，严格 3:4", { skip: needsFonts }, async () => {
    const { res, body } = await render(posterRoute, LONG_POST.slug);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    // PNG 签名 + IHDR
    assert.deepEqual(
        [...body.subarray(0, 8)],
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        "PNG 签名",
    );
    assert.equal(body.subarray(12, 16).toString("latin1"), "IHDR");
    const width = body.readUInt32BE(16);
    const height = body.readUInt32BE(20);
    assert.equal(width, 1200, "宽");
    assert.equal(height, 1600, "高");
    assert.equal(width * 4, height * 3, "宽高比必须是 3:4");
});

/* ───────────────────────── 3. 像素结构（不裁字 / 不溢出）───────────────────────── */

/** 版式常量（与 src/route.ts 的 POSTER_LAYOUT 对齐；变了这条测试会先叫）。 */
const P = { width: 1200, height: 1600, paddingX: 96, paddingBottom: 80, borderLeft: 6 };

test(
    "海报像素结构：页脚在底部留白内、文字不越右留白、tags 行存在",
    { skip: needsFonts },
    async () => {
        const { body } = await render(posterRoute, LONG_POST.slug);
        const { data, info } = await sharp(body)
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        assert.equal(info.width, 1200);
        assert.equal(info.height, 1600);
        assert.equal(info.channels, 3, "removeAlpha 之后必须是 RGB 三通道");
        const { width, height } = info;
        const at = (x, y) => data[(y * width + x) * 3];
        const px = (x, y) => {
            const i = (y * width + x) * 3;
            return [data[i], data[i + 1], data[i + 2]];
        };

        // 底色取画布左上角内侧（避开 6px 左侧强调竖条与顶部装饰圆）
        const bg = at(400, 10);
        const isInk = (x, y) => at(x, y) > bg + 45; // 字形/强调色远亮于底；7% 装饰圆只有 +10

        // (a) 底部留白干净：最后 30 行不得有任何字形（页脚被挤出画布时会先撞这里）
        let bottomInk = 0;
        for (let y = height - 30; y < height; y++) {
            for (let x = P.borderLeft; x < width; x++) if (isInk(x, y)) bottomInk++;
        }
        assert.equal(bottomInk, 0, `底部留白出现 ${bottomInk} 个墨点：页脚溢出/被裁`);

        // (b) 右侧留白干净（y > 320 避开右上装饰圆）：文字撞右边界时这里会先出现墨点
        let rightInk = 0;
        for (let y = 320; y < height; y++) {
            for (let x = width - 30; x < width; x++) if (isInk(x, y)) rightInk++;
        }
        assert.equal(rightInk, 0, `右侧留白出现 ${rightInk} 个墨点：内容溢出右边界`);

        // (c) 行/列墨迹profile：页脚必须落在底部留白之上，顶部又必须真的画了东西。
        // 列范围收窄到 x < width-130：右下的强调色装饰点是刻意的（与 OG 同构），
        // 不该被当成「文字溢出」，所以把它钉在留白内单独考（见 (a) 与 lastInkRow 的容差）。
        const rowInk = new Array(height).fill(0);
        const colInk = new Array(width).fill(0);
        for (let y = 0; y < height; y++) {
            for (let x = P.borderLeft; x < width - 130; x++) {
                if (isInk(x, y)) {
                    rowInk[y]++;
                    colInk[x]++;
                }
            }
        }
        const firstInkRow = rowInk.findIndex((n) => n > 0);
        const lastInkRow = height - 1 - [...rowInk].reverse().findIndex((n) => n > 0);
        const lastInkCol = width - 1 - [...colInk].reverse().findIndex((n) => n > 0);

        assert.ok(firstInkRow >= 60, `顶部留白不足（首个墨点在第 ${firstInkRow} 行）`);
        assert.ok(firstInkRow <= 130, `首个墨点在第 ${firstInkRow} 行：顶部元信息/标题上移异常`);
        const footerBottom = height - P.paddingBottom;
        assert.ok(
            lastInkRow <= footerBottom + 2,
            `最后墨点在第 ${lastInkRow} 行，越过页脚底边 ${footerBottom}：页脚溢出留白`,
        );
        assert.ok(
            lastInkRow >= footerBottom - 60,
            `最后墨点在第 ${lastInkRow} 行，页脚没贴到底部区域（${footerBottom}）`,
        );
        assert.ok(
            lastInkCol <= width - P.paddingX + 4,
            `最后墨点在第 ${lastInkCol} 列，越过右留白`,
        );

        // (d) 中间必须有 flexGrow 空档：说明摘要/tags 没有被页脚挤到重叠
        const bandStart = Math.round(height * 0.72);
        const bandEnd = footerBottom - 40;
        let best = 0;
        let run = 0;
        for (let y = bandStart; y < bandEnd; y++) {
            run = rowInk[y] === 0 ? run + 1 : 0;
            best = Math.max(best, run);
        }
        assert.ok(best >= 24, `摘要与页脚之间没有空档（最长空白 ${best} 行）：版式已被内容撑满`);

        // (e) tags 胶囊行真的画了：强调色底(14%)的横向色块，整行 >= 300 px 才会命中
        const chipRow = (y) => {
            let n = 0;
            for (let x = P.borderLeft; x < width; x++) {
                const [r, g, b] = px(x, y);
                if (r >= 35 && r - b >= 8) n++;
            }
            return n;
        };
        let chipRows = 0;
        let chipFirst = -1;
        for (let y = 0; y < footerBottom; y++) {
            if (chipRow(y) >= 300) {
                chipRows++;
                if (chipFirst < 0) chipFirst = y;
            }
        }
        assert.ok(chipRows >= 24, `tags 胶囊行没画出来（命中 ${chipRows} 行）`);
        assert.ok(
            chipFirst > height * 0.6,
            `tags 行出现在第 ${chipFirst} 行：应落在底部轨道（>${Math.round(height * 0.6)}）`,
        );
        assert.ok(
            chipFirst < lastInkRow - 40,
            `tags 行（${chipFirst}）与页脚（${lastInkRow}）重叠或顺序错了`,
        );
    },
);

/* ───────────────────────── 4. 产出物 + 指标 ───────────────────────── */

test("产出 poster.png / og-1200x630.png 并打印耗时与内存", { skip: needsFonts }, async () => {
    mkdirSync(outDir, { recursive: true });

    const measure = async (route) => {
        await render(route, LONG_POST.slug); // 预热：字体只加载一次，第二次才是纯渲染成本
        const rss0 = process.memoryUsage().rss;
        const t0 = performance.now();
        const { body } = await render(route, LONG_POST.slug);
        const ms = performance.now() - t0;
        const rss1 = process.memoryUsage().rss;
        return {
            ms: Math.round(ms),
            rssDeltaMB: Number(((rss1 - rss0) / 1048576).toFixed(1)),
            rssMB: Number((rss1 / 1048576).toFixed(1)),
            bytes: body.length,
            sha256: createHash("sha256").update(body).digest("hex").slice(0, 16),
            body,
        };
    };

    const og = await measure(ogRoute);
    const poster = await measure(posterRoute);

    writeFileSync(path.join(outDir, "poster.png"), poster.body);
    writeFileSync(path.join(outDir, "og-1200x630.png"), og.body);

    console.log(
        `POSTER_METRICS ${JSON.stringify({
            generatedAt: new Date().toISOString(),
            node: process.version,
            fixture: {
                slug: LONG_POST.slug,
                titleChars: LONG_POST.title.length,
                descChars: LONG_POST.description.length,
                tags: LONG_POST.tags.length,
            },
            og: {
                size: "1200x630",
                ms: og.ms,
                rssDeltaMB: og.rssDeltaMB,
                rssMB: og.rssMB,
                bytes: og.bytes,
                sha256_16: og.sha256,
            },
            poster: {
                size: "1200x1600",
                ms: poster.ms,
                rssDeltaMB: poster.rssDeltaMB,
                rssMB: poster.rssMB,
                bytes: poster.bytes,
                sha256_16: poster.sha256,
            },
        })}`,
    );

    assert.ok(og.bytes > 4096 && poster.bytes > 4096, "产物不该是空图");
    assert.ok(poster.bytes > og.bytes, "1200×1600 的 PNG 应明显大于 1200×630");
});
