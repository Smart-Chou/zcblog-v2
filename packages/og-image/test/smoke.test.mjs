#!/usr/bin/env node
/**
 * 包内 smoke 测试（M4-6 · F6）：把 M4-3 消费者侧的 13 条 direct-call 断言固化进包。
 *
 *   pnpm --filter ./packages/og-image test
 *
 * 被测对象是**发布物**（`dist/` 的构建产物），不是 `src/`——这样测试和消费者看到的是同一份代码。
 * 出图断言需要真实字体文件：按 `DOGEARED_OG_FONT_DIR` → 仓库 `.astro/fonts` 的顺序找，
 * 找不到就整组 SKIP（CI 干净检出没有字体缓存，不能让发布链因此变红），并在输出里写明原因。
 *
 * 固定输入 + 固定字体 → PNG 与 M4-3 消费者验证逐字节相同（sha256 写死在 GOLDEN 里）。
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const distEntry = path.join(pkgRoot, "dist", "index.js");

const pkg = await import(distEntry);
const pkgJson = JSON.parse(readFileSync(path.join(pkgRoot, "package.json"), "utf8"));

/* ───────────────────────── 固定输入（与 M4-3 消费者 fixture 完全一致）───────────────────────── */

const POST = {
    slug: "hello-dogeared",
    title: "折角测试：OG 图从 tarball 里长出来",
    tags: ["fixture", "og-image"],
    pubDate: new Date("2026-11-06T00:00:00Z"),
    description: "这条摘要是固定输入，用来验证 satori 排版与 sharp 出图在干净消费者里一致。",
};
const SITE = {
    title: "Dogeared Fixture",
    author: "Fixture Author",
    url: "https://dogeared-fixture.test",
    description: "M4-3 消费者验证用站点身份。",
};
const THEME = { background: "#0d1117", foreground: "#f0f0f0", accent: "#d4a040" };

/** M4-3 在干净消费者里量到的 PNG：字节数 + sha256。改版式/字体/依赖版本都会让它变。 */
const GOLDEN = {
    bytes: 49283,
    sha256: "8e6c490ec799784d2270f7699491c107a683916854e91251d09461aea4f47b17",
};

/**
 * 字体来源：显式 env → 仓库 `.astro/fonts`（构建缓存，未提交）。返回 null = 跳过出图断言。
 */
function resolveFonts() {
    const candidates = [
        process.env.DOGEARED_OG_FONT_DIR,
        path.resolve(pkgRoot, "..", "..", ".astro", "fonts"),
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

const route = pkg.createOgImageRoute({
    posts: [POST],
    site: SITE,
    theme: THEME,
    ...(fonts ? { fonts: { regular: fonts.regular, bold: fonts.bold } } : {}),
    fontCacheDir: path.join(os.tmpdir(), "dogeared-og-image-test-fonts"),
});

/* ───────────────────────── 1. 发布物形状 ───────────────────────── */

test("exports: 包自引用解析到 dist，不是 src", () => {
    const resolved = import.meta.resolve(pkgJson.name);
    assert.ok(
        resolved.endsWith("/dist/index.js"),
        `exports["."] 应指向 dist/index.js，实际 ${resolved}`,
    );
});

test("exports: 只暴露运行期函数 createOgImageRoute", () => {
    assert.equal(typeof pkg.createOgImageRoute, "function");
    assert.deepEqual(Object.keys(pkg), ["createOgImageRoute"]);
});

test("exports: main / types 指向 dist 且文件存在", () => {
    assert.equal(pkgJson.main, "./dist/index.js");
    assert.equal(pkgJson.types, "./dist/index.d.ts");
    assert.ok(existsSync(path.join(pkgRoot, pkgJson.main)));
    assert.ok(existsSync(path.join(pkgRoot, pkgJson.types)));
    assert.equal("module" in pkgJson, false, "module 字段已删除（对现代解析器只是误导）");
});

test("factory: 返回 callable 的 APIRoute", () => {
    assert.equal(typeof route, "function");
});

/* ───────────────────────── 2. 缺必填项 → 立即抛错（不需要字体）───────────────────────── */

test("factory: 缺必填项抛错并列出缺失键", () => {
    assert.throws(
        () => pkg.createOgImageRoute({ posts: [], site: { title: "t" }, theme: {} }),
        (error) => {
            assert.match(error.message, /site\.url/);
            assert.match(error.message, /theme\.accent/);
            return true;
        },
    );
});

/* ───────────────────────── 3. 未知 slug → 404（在加载字体之前返回）───────────────────────── */

test("route: 未知 slug 返回 404 纯文本，不抛错", async () => {
    const res = await route({ params: { og: "nope" } });
    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
    assert.match(await res.text(), /未知文章 slug/);
});

/* ───────────────────────── 4. 出图（需要字体）───────────────────────── */

test("route: 1200x630 PNG，与 M4-3 消费者逐字节相同", { skip: needsFonts }, async () => {
    const res = await route({ params: { og: POST.slug } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.match(res.headers.get("cache-control") ?? "", /immutable/);

    const body = Buffer.from(await res.arrayBuffer());
    // PNG 签名 + IHDR 尺寸（不引第三方图像库）
    assert.deepEqual(
        [...body.subarray(0, 8)],
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        "PNG 签名",
    );
    assert.equal(body.subarray(12, 16).toString("latin1"), "IHDR", "首个 chunk 必须是 IHDR");
    assert.equal(body.readUInt32BE(16), 1200, "宽");
    assert.equal(body.readUInt32BE(20), 630, "高");
    assert.equal(body.length, GOLDEN.bytes, `字节数与 M4-3 不一致（${body.length}）`);
    assert.equal(
        createHash("sha256").update(body).digest("hex"),
        GOLDEN.sha256,
        "PNG 与 M4-3 消费者验证不再逐字节相同（版式/字体/依赖版本有漂移）",
    );
});

test("route: rest 参数为数组时同样解析", { skip: needsFonts }, async () => {
    const res = await route({ params: { og: [POST.slug] } });
    assert.equal(res.status, 200);
});

/* ───────────────────────── 5. 依赖方向（包内不读站点）───────────────────────── */

test("package: 运行期只依赖 satori/sharp，astro 是 optional peer", () => {
    assert.deepEqual(Object.keys(pkgJson.dependencies), ["satori", "sharp"]);
    assert.deepEqual(Object.keys(pkgJson.peerDependencies), ["astro"]);
    assert.equal(pkgJson.peerDependenciesMeta?.astro?.optional, true);
});

test("package: engines 覆盖当前 Node（不再 EBADENGINE）", () => {
    assert.equal(pkgJson.engines.node, ">=22");
    const major = Number(process.versions.node.split(".")[0]);
    assert.ok(major >= 22, `当前 Node ${process.versions.node}`);
});
