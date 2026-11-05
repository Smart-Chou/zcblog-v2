#!/usr/bin/env node
/**
 * verify-og.mjs — M3-4 OG 图产物的可执行判据
 *
 * 背景：OG 图渲染从 `src/integrations/og-image-route.ts` 抽进 `packages/og-image`
 * （route factory）。抽取的验收不能只看「构建没报错」——OG 图是**静态产物**，
 * 真相在 `dist/`：每篇文章都得有一张自己的 PNG，而且这张 PNG 得被文章页的
 * `og:image` 指到。所以这里以产物为准，外加两条接口契约的行为探针。
 *
 * 判据：
 *   O1  dist 产物计数：`dist/og/*.png` 数 == `dist/article/<slug>/index.html` 数（png==article_pages）
 *   O2  slug 集合双向一致：有文章没图、有图没文章都要列出来
 *   O3  每张图是**真 PNG** 且 1200×630（IHDR 读宽高；0 字节/截断即红）
 *   O4  每篇文章页的 `og:image` 指向自己的 `/og/<slug>.png`
 *   O5  包内 `~/` 别名 import = 0（§3.3「必须切断的耦合」在包侧的判据）
 *   O6  字体契约（行为探针，真 import 包源码）：
 *         a) `fonts` 传本地文件 → 能出 1200×630 PNG（可覆盖，不依赖 CDN）
 *         b) `fonts` 指向不存在的文件 → 必须**抛错**且错误信息给出覆盖提示（不静默降级）
 *   O7  未知 slug → 404（而不是把别篇文章的图吐出来 / 500）
 *
 * 用法
 *   node scripts/gates/verify-og.mjs [dist 目录]     # 默认 dist
 *
 * 退出码：0 全绿 / 1 有红。汇总行 `RESULT PASS  png==article_pages 85/85`。
 */
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(ROOT, process.argv[2] ?? "dist");
const OG_DIR = path.join(DIST, "og");
const ARTICLE_DIR = path.join(DIST, "article");
const PKG_DIR = path.join(ROOT, "packages", "og-image");
const EXPECTED_WIDTH = 1200;
const EXPECTED_HEIGHT = 630;

const results = [];
const record = (id, title, pass, detail, problems = []) =>
    results.push({ id, title, pass, detail, problems });

/* ───────────────────────── 工具 ───────────────────────── */

const subdirs = (dir) =>
    existsSync(dir)
        ? readdirSync(dir, { withFileTypes: true })
              .filter((entry) => entry.isDirectory())
              .map((entry) => entry.name)
              .sort()
        : [];

const pngSlugs = () =>
    existsSync(OG_DIR)
        ? readdirSync(OG_DIR)
              .filter((name) => name.endsWith(".png"))
              .map((name) => name.slice(0, -4))
              .sort()
        : [];
const articleSlugs = () =>
    subdirs(ARTICLE_DIR).filter((slug) => existsSync(path.join(ARTICLE_DIR, slug, "index.html")));

/** PNG 头：8 字节签名 + IHDR（宽高在第 16–23 字节）。 */
function pngMeta(file) {
    const size = statSync(file).size;
    if (size < 24) return { ok: false, reason: `${size} B，不足一个 PNG 头` };
    const head = readFileSync(file).subarray(0, 24);
    const signature = head.subarray(0, 8).toString("hex");
    if (signature !== "89504e470d0a1a0a")
        return { ok: false, reason: `签名不是 PNG（${signature}）` };
    return {
        ok: true,
        width: head.readUInt32BE(16),
        height: head.readUInt32BE(20),
        size,
    };
}

/** 从 HTML 里取 og:image 的 content（容忍 HTML 折叠后的无引号属性）。 */
function ogImageOf(html) {
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
        if (!/property\s*=\s*["']?og:image["']?(?![:\w-])/i.test(tag)) continue;
        const content = /content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
        if (content) return (content[1] ?? content[2] ?? content[3] ?? "").trim();
    }
    return null;
}

/* ───────────────────────── O1 ~ O4：产物 ───────────────────────── */

const pngs = pngSlugs();
const articles = articleSlugs();

if (!existsSync(OG_DIR) || !existsSync(ARTICLE_DIR)) {
    record("O1", "dist 产物计数（png == article_pages）", false, "目录缺失", [
        `${!existsSync(OG_DIR) ? "dist/og 不存在" : ""} ${!existsSync(ARTICLE_DIR) ? "dist/article 不存在" : ""}`.trim(),
    ]);
} else {
    record(
        "O1",
        "dist 产物计数（png == article_pages）",
        pngs.length === articles.length && pngs.length > 0,
        `png=${pngs.length} article_pages=${articles.length} → ${pngs.length}/${articles.length}`,
        pngs.length === 0 ? ["dist/og 下没有 PNG"] : [],
    );
}

/* O2 —— slug 集合双向一致 */
if (existsSync(OG_DIR) && existsSync(ARTICLE_DIR)) {
    const pngSet = new Set(pngs);
    const articleSet = new Set(articles);
    const missing = articles.filter((slug) => !pngSet.has(slug));
    const orphan = pngs.filter((slug) => !articleSet.has(slug));
    record(
        "O2",
        "slug 集合双向一致（缺图 / 孤儿图）",
        missing.length === 0 && orphan.length === 0,
        `缺图=${missing.length} 孤儿=${orphan.length}`,
        [
            ...missing.slice(0, 10).map((slug) => `文章无 OG 图：${slug}`),
            ...orphan.slice(0, 10).map((slug) => `OG 图无文章：${slug}`),
        ],
    );

    /* O3 —— 真 PNG + 1200×630 */
    const bad = [];
    for (const slug of pngs) {
        const file = path.join(OG_DIR, `${slug}.png`);
        const meta = pngMeta(file);
        if (!meta.ok) bad.push(`${slug}.png: ${meta.reason}`);
        else if (meta.width !== EXPECTED_WIDTH || meta.height !== EXPECTED_HEIGHT)
            bad.push(
                `${slug}.png: ${meta.width}×${meta.height}，期望 ${EXPECTED_WIDTH}×${EXPECTED_HEIGHT}`,
            );
    }
    record(
        "O3",
        `每张图为真 PNG 且 ${EXPECTED_WIDTH}×${EXPECTED_HEIGHT}`,
        bad.length === 0,
        `检查 ${pngs.length} 张`,
        bad.slice(0, 10),
    );

    /* O4 —— 文章页 og:image 指向自己的图 */
    const mismatched = [];
    let checked = 0;
    for (const slug of articles) {
        const html = readFileSync(path.join(ARTICLE_DIR, slug, "index.html"), "utf8");
        const image = ogImageOf(html);
        checked += 1;
        if (!image) {
            mismatched.push(`${slug}: 无 og:image`);
            continue;
        }
        let pathname = image;
        try {
            pathname = new URL(image, "https://example.invalid").pathname;
        } catch {
            /* 相对路径原样比较 */
        }
        if (pathname !== `/og/${slug}.png`) mismatched.push(`${slug}: og:image=${image}`);
    }
    record(
        "O4",
        "文章页 og:image 指向 /og/<slug>.png",
        mismatched.length === 0 && checked > 0,
        `检查 ${checked} 个文章页`,
        mismatched.slice(0, 10),
    );
}

/* ───────────────────────── O5：包内 `~/` 别名 ───────────────────────── */

const ALIAS_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](~\/[^"']+)["']/g;
const aliasHits = [];
const walkTs = (dir, out = []) => {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules") continue;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walkTs(abs, out);
        else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry.name)) out.push(abs);
    }
    return out;
};
for (const file of walkTs(PKG_DIR)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(ALIAS_RE))
        aliasHits.push(`${path.relative(ROOT, file)}  ${match[1]}`);
}
record(
    "O5",
    "包内 `~/` 别名 import = 0（§3.3 切断耦合）",
    aliasHits.length === 0,
    `${walkTs(PKG_DIR).length} 个源文件`,
    aliasHits.slice(0, 10),
);

/* ───────────────────────── O6 / O7：行为探针 ───────────────────────── */

const FONT_REGULAR = path.join(ROOT, ".astro", "fonts", "NotoSansSC-Regular.otf");
const FONT_BOLD = path.join(ROOT, ".astro", "fonts", "NotoSansSC-Bold.otf");
const PROBE_DIR = path.join(ROOT, ".astro", "og-probe");

/**
 * 包内源码是 TS + 无扩展名相对 import（Vite/tsc 的 bundler 解析），Node 直接 import
 * 需要补扩展名 —— 复制一份到 `.astro/og-probe` 再改，不动源文件（verify-i18n 同法）。
 */
function prepareProbeModule() {
    const srcDir = path.join(PKG_DIR, "src");
    const files = walkTs(srcDir).filter((file) => file.endsWith(".ts"));
    rmSync(PROBE_DIR, { recursive: true, force: true });
    mkdirSync(PROBE_DIR, { recursive: true });
    for (const file of files) {
        const text = readFileSync(file, "utf8").replace(
            /(from\s+|import\s*\(\s*)["'](\.\/[^"']+?)["']/g,
            (whole, lead, specifier) =>
                /\.[a-z]+$/.test(specifier) ? whole : `${lead}"${specifier}.ts"`,
        );
        writeFileSync(path.join(PROBE_DIR, path.basename(file)), text, "utf8");
    }
    return pathToFileURL(path.join(PROBE_DIR, "index.ts")).href;
}

const PROBE_THEME = {
    background: "#0d1117",
    foreground: "#f0f0f0",
    accent: "#d4a040",
    muted: "#8b949e",
    subtle: "#5c6370",
    divider: "rgba(255,255,255,0.08)",
    gradient: "linear-gradient(135deg, #0d1117 0%, #161b22 40%, #0f1419 100%)",
};
const PROBE_SITE = {
    title: "og-image gate",
    author: "gate",
    url: "https://example.invalid",
    description: "probe",
};
const PROBE_POSTS = [
    {
        slug: "probe",
        title: "字体覆盖探针：本地 OTF 直接出图",
        tags: ["gate"],
        pubDate: new Date("2026-01-01T00:00:00Z"),
        description: "O6 用本地字体文件渲染，证明 fonts 可覆盖、不依赖 CDN。",
    },
];

async function probeFonts() {
    if (!existsSync(FONT_REGULAR) || !existsSync(FONT_BOLD)) {
        record(
            "O6",
            "字体契约（可覆盖 / 失败明确报错）",
            true,
            "SKIP：.astro/fonts 无本地字体，跳过行为探针",
        );
        return;
    }
    const href = prepareProbeModule();
    const mod = await import(href);
    const problems = [];
    let unknownStatus = null;

    try {
        const route = mod.createOgImageRoute({
            posts: PROBE_POSTS,
            site: PROBE_SITE,
            theme: PROBE_THEME,
            fonts: { regular: FONT_REGULAR, bold: FONT_BOLD },
        });
        const response = await route({ params: { og: "probe" } });
        if (!(response instanceof Response)) problems.push("a) GET 未返回 Response");
        else if (response.status !== 200) problems.push(`a) 本地字体渲染状态码 ${response.status}`);
        else {
            const buffer = Buffer.from(await response.arrayBuffer());
            const head = buffer.subarray(0, 24);
            if (head.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
                problems.push("a) 本地字体渲染产物不是 PNG");
            else if (
                head.readUInt32BE(16) !== EXPECTED_WIDTH ||
                head.readUInt32BE(20) !== EXPECTED_HEIGHT
            )
                problems.push(`a) 产物尺寸 ${head.readUInt32BE(16)}×${head.readUInt32BE(20)}`);
            else if (!/image\/png/.test(response.headers.get("content-type") ?? ""))
                problems.push("a) Content-Type 不是 image/png");
        }

        const badRoute = mod.createOgImageRoute({
            posts: PROBE_POSTS,
            site: PROBE_SITE,
            theme: PROBE_THEME,
            fonts: {
                regular: path.join(PROBE_DIR, "missing-regular.otf"),
                bold: path.join(PROBE_DIR, "missing-bold.otf"),
            },
        });
        let thrown = null;
        try {
            await badRoute({ params: { og: "probe" } });
        } catch (error) {
            thrown = error;
        }
        if (!thrown) problems.push("b) 字体文件不存在时未抛错（静默降级）");
        else {
            const message = String(thrown.message ?? thrown);
            if (!/字体/.test(message)) problems.push(`b) 错误信息未指出字体：${message}`);
            if (!/options\.fonts/.test(message))
                problems.push(`b) 错误信息未给出覆盖提示（options.fonts）：${message}`);
        }

        const unknown = await route({ params: { og: "no-such-post" } });
        unknownStatus = unknown.status;
    } catch (error) {
        problems.push(`探针执行失败：${String(error?.message ?? error)}`);
    }

    record(
        "O6",
        "字体契约（可覆盖 / 失败明确报错）",
        problems.length === 0,
        problems.length === 0 ? "本地 OTF 出 1200×630 + 缺失字体抛错" : "有违反",
        problems,
    );
    record(
        "O7",
        "未知 slug → 404",
        unknownStatus === 404,
        unknownStatus === null ? "未测" : `status=${unknownStatus}`,
        unknownStatus === null || unknownStatus === 404 ? [] : [`期望 404，实际 ${unknownStatus}`],
    );
}

try {
    await probeFonts();
} finally {
    rmSync(PROBE_DIR, { recursive: true, force: true });
}

/* ───────────────────────── 输出 ───────────────────────── */

const pad = (text, width) => {
    const visual = [...text].reduce((sum, char) => sum + (/[\u4e00-\u9fff]/.test(char) ? 2 : 1), 0);
    return text + " ".repeat(Math.max(0, width - visual));
};

console.log("M3-4 OG 图门禁（packages/og-image + dist 产物）");
console.log(`  root ${ROOT}`);
console.log(`  dist ${DIST}`);
console.log("");
for (const result of results) {
    console.log(
        `${result.pass ? "PASS" : "FAIL"}  ${result.id}  ${pad(result.title, 44)} ${result.detail}`,
    );
    for (const problem of result.problems) console.log(`        · ${problem}`);
}

const failed = results.filter((result) => !result.pass).length;
console.log("");
if (failed > 0) {
    console.log(`RESULT FAIL  gates=${results.length - failed}/${results.length} fail=${failed}`);
    process.exit(1);
}
console.log(
    `RESULT PASS  png==article_pages ${pngs.length}/${articles.length} · gates=${results.length}/${results.length}`,
);
process.exit(0);
