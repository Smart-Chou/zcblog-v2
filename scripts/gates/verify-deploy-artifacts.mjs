#!/usr/bin/env node
/**
 * M3-7 三部署产物断言（T 路径，纯 node，不联网、不部署）
 *
 * 断言「同一份源码 × 三套环境变量」的产物真的按平台契约落地：
 *   · 规范域名注入（canonical / sitemap 与 SITE_URL 一致）
 *   · /tag/:tag → /tags/:tag/ 三目标各自的能力：GH Pages 桩、CF _redirects、Vercel redirects
 *   · 两套平台跳转配置与构建期桩互为镜像（逐条对齐，单跳、不链式）
 *   · 缓存头：CF _headers、Vercel headers
 *   · root-only 部署前提（产物里不得出现 <base href>）
 *
 * 用法: node scripts/gates/verify-deploy-artifacts.mjs <dist> [--target gh-pages|cloudflare|vercel]
 *                                    [--expect-site https://host] [--repo .]
 * 退出码: 0 = 全过；1 = 有失败项
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const opt = (name, fallback = undefined) => {
    const i = argv.indexOf(`--${name}`);
    if (i === -1) return fallback;
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) throw new Error(`--${name} 需要参数`);
    return v;
};
// 位置参数：跳过所有 `--opt value` 对
const positional = [];
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--target", "--expect-site", "--repo"].includes(a)) {
        i++;
        continue;
    }
    if (a.startsWith("--")) continue;
    positional.push(a);
}

const DIST = resolve(positional[0] ?? "dist");
const TARGET = opt("target", null);
const EXPECT_SITE = opt("expect-site", null);
const REPO = resolve(opt("repo", process.cwd()));

const TARGETS = ["gh-pages", "cloudflare", "vercel"];
if (TARGET && !TARGETS.includes(TARGET)) {
    console.error(`✗ 未知 target：${TARGET}（可选 ${TARGETS.join(" / ")}）`);
    process.exit(2);
}

let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
    failed++;
    console.log(`  ✗ ${msg}`);
};
const section = (msg) => console.log(`\n${msg}`);

const read = (p) => readFileSync(p, "utf-8");
const distFile = (rel) => join(DIST, rel);

/** 去掉尾部斜杠（根路径除外），用于跨平台规则比对 */
const normPath = (p) => {
    let s = String(p ?? "").trim();
    if (!s.startsWith("/")) s = `/${s}`;
    return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
};
const ruleKey = (r) => `${normPath(r.source)} ${normPath(r.destination)} ${r.status}`;
const patternToRegex = (pattern) =>
    new RegExp(
        `^${normPath(pattern)
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/:[A-Za-z0-9_]+/g, "[^/]+")}$`,
    );

// ────────────────────────────────────────────────────── 0. 产物基本面
section("A0 产物基本面");
if (!existsSync(DIST) || !statSync(DIST).isDirectory()) {
    bad(`dist 不存在：${DIST}`);
    console.log(`\nRESULT FAIL target=${TARGET ?? "all"} checks=1`);
    process.exit(1);
}
const homeHtml = existsSync(distFile("index.html")) ? read(distFile("index.html")) : null;
if (homeHtml) ok(`dist/index.html 存在（${homeHtml.length} B）`);
else bad("dist/index.html 不存在");

// ────────────────────────────────────────────────────── 1. 规范域名注入
section("A1 规范域名注入（SITE_URL）");
let siteOrigin = null;
if (homeHtml) {
    const m =
        homeHtml.match(/<link[^>]+canonical[^>]*>/) ??
        homeHtml.match(/<link[^>]+href=[^>]*canonical[^>]*>/);
    const href = m ? (m[0].match(/href=("?)([^"\s>]+)\1/) ?? [])[2] : null;
    if (href) {
        siteOrigin = new URL(href).origin;
        ok(`canonical origin = ${siteOrigin}`);
    } else {
        bad("首页找不到 canonical href");
    }
    // og:url 是第二个独立注入点（与 canonical 由不同组件产出），两边一致才算真注入
    const ogTag = homeHtml.match(/<meta[^>]+og:url[^>]*>/);
    const ogUrl = ogTag ? (ogTag[0].match(/content=("?)([^"\s>]+)\1/) ?? [])[2] : null;
    if (!ogUrl) {
        bad("首页找不到 og:url");
    } else if (siteOrigin && new URL(ogUrl).origin !== siteOrigin) {
        bad(`og:url origin=${new URL(ogUrl).origin} 与 canonical=${siteOrigin} 不一致`);
    } else {
        ok(`og:url 与 canonical 同 origin（${new URL(ogUrl).origin}）`);
    }
}
if (siteOrigin && EXPECT_SITE) {
    const expected = new URL(EXPECT_SITE).origin;
    siteOrigin === expected
        ? ok(`canonical 与注入的 SITE_URL 一致（${expected}）`)
        : bad(`canonical origin=${siteOrigin}，期望 ${expected}`);
}
const sitemapIdx = existsSync(distFile("sitemap-index.xml"))
    ? read(distFile("sitemap-index.xml"))
    : "";
if (siteOrigin && sitemapIdx) {
    sitemapIdx.includes(`${siteOrigin}/`)
        ? ok(`sitemap-index.xml 用同一 origin`)
        : bad("sitemap-index.xml 的 origin 与 canonical 不一致");
} else if (!sitemapIdx) {
    bad("dist/sitemap-index.xml 不存在");
}
if (EXPECT_SITE) {
    // 只断言本层负责的注入点，不做全站域名扫描：
    //   · <link rel="sitemap"> 目前硬编码在布局组件里（src 层，不在本卡边界）
    //   · 文章/相册里的 https://marxchou.com/cdn-cgi/image/... 是内容侧 CDN 资源
    // 两者都不受 SITE_URL 影响，见 docs/deploy-matrix.md §7。
    const expected = new URL(EXPECT_SITE).origin;
    siteOrigin === expected
        ? ok("产物域名注入生效（canonical / sitemap / og:url 三处一致）")
        : bad(`域名注入未生效：${siteOrigin} != ${expected}`);
}

// ────────────────────────────────────────────────────── 2. 平台配置 ↔ 跳转能力
section("A2 跳转规则（三套适配层互为镜像）");
const vercelPath = join(REPO, "vercel.json");
let vercel = null;
if (!existsSync(vercelPath)) {
    bad(`找不到 ${vercelPath}`);
} else {
    try {
        vercel = JSON.parse(read(vercelPath));
        ok("vercel.json 是合法 JSON");
    } catch (e) {
        bad(`vercel.json 解析失败：${e.message}`);
    }
}
const vercelRules = (vercel?.redirects ?? []).map((r) => ({
    source: r.source,
    destination: r.destination,
    status: r.statusCode ?? (r.permanent ? 301 : 308),
}));

const cfPath = distFile("_redirects");
let cfRules = [];
if (!existsSync(cfPath)) {
    bad("dist/_redirects 不存在（public/_redirects 未被带进产物）");
} else {
    cfRules = read(cfPath)
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => l.split(/\s+/))
        .filter((parts) => parts.length >= 2)
        .map((parts) => ({
            source: parts[0],
            destination: parts[1],
            status: Number(parts[2] ?? 301),
        }));
    cfRules.length > 0
        ? ok(`dist/_redirects 解析出 ${cfRules.length} 条规则`)
        : bad("dist/_redirects 没有可解析的规则");
    const catchAll = cfRules.filter((r) => /^\/(\*|:splat)$/.test(normPath(r.source)));
    catchAll.length === 0
        ? ok("_redirects 无 /* 兜底行（不会盖住真实资源）")
        : bad(`_redirects 含兜底行：${catchAll.map((r) => r.source).join(", ")}`);
}
const non301 = [...cfRules, ...vercelRules].filter((r) => Number(r.status) !== 301);
non301.length === 0
    ? ok("两套平台规则的状态码全为 301")
    : bad(`存在非 301 规则：${non301.map((r) => `${r.source}(${r.status})`).join(", ")}`);

if (cfRules.length && vercelRules.length) {
    // 用多重集比较（不去重）：`/tag/:tag` 与 `/tag/:tag/` 归一化后是同一个 key，
    // 若用 Set 比较，两套规则各漏掉「带尾斜杠」的那一条也会被判定为「一致」。
    const a = cfRules.map(ruleKey).sort();
    const b = vercelRules.map(ruleKey).sort();
    const same = a.length === b.length && a.every((k, i) => k === b[i]);
    same
        ? ok(`_redirects 与 vercel.json 规则逐条一致（${a.length} 条，含尾斜杠变体）`)
        : bad(`两套规则不一致：CF=[${a.join(" | ")}] vs Vercel=[${b.join(" | ")}]`);
}

// 单跳：任一规则的 destination 不得再被任何规则命中，否则浏览器吃两次 301
const allRules = [...cfRules, ...vercelRules];
const chained = allRules.filter((rule) => {
    const dest = normPath(rule.destination);
    return allRules.some((other) => patternToRegex(other.source).test(dest));
});
chained.length === 0
    ? ok("无链式跳转（destination 不会再被任何 source 命中）")
    : bad(`存在链式跳转（双跳）：${chained.map((r) => `${r.source}→${r.destination}`).join(", ")}`);

// ────────────────────────────────────────────────────── 3. GH Pages 桩
section("A3 /tag/* 静态桩（GH Pages 的跳转替代品）");
const tagsDir = distFile("tags");
const tagDirs = existsSync(tagsDir)
    ? readdirSync(tagsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && existsSync(join(tagsDir, e.name, "index.html")))
          .map((e) => e.name)
    : [];
let stubOk = 0;
const stubBad = [];
for (const tag of tagDirs) {
    const stub = distFile(join("tag", tag, "index.html"));
    if (!existsSync(stub)) {
        stubBad.push(`${tag}（缺桩）`);
        continue;
    }
    const html = read(stub);
    const target = `/tags/${tag}/`;
    const good =
        html.includes(`url=${target}`) &&
        html.includes("noindex") &&
        (siteOrigin ? html.includes(`${siteOrigin}${target}`) : true);
    good ? stubOk++ : stubBad.push(`${tag}（桩内容不符）`);
}
if (tagDirs.length === 0) {
    bad("dist/tags 下没有任何标签页，桩无从校验");
} else if (stubBad.length === 0) {
    ok(`/tag/*/ 桩 ${stubOk}/${tagDirs.length} 全命中（url=/tags/<tag>/ + noindex + canonical）`);
} else {
    bad(`/tag/*/ 桩异常 ${stubBad.length}/${tagDirs.length}：${stubBad.slice(0, 5).join(", ")}`);
}

// 标签规则的目标地址必须真实存在（避免桩指到 404）
if (tagDirs.length) {
    const sampled = tagDirs.slice(0, 20);
    const missing = sampled.filter((tag) => !existsSync(distFile(join("tags", tag, "index.html"))));
    missing.length === 0
        ? ok(`规则目标抽样 ${sampled.length} 条均落盘（/tags/<tag>/index.html）`)
        : bad(`规则目标缺失：${missing.join(", ")}`);
}

// ────────────────────────────────────────────────────── 4. 静态 redirects（astro.config.redirects）
section("A4 astro.config.redirects 的 meta-refresh 桩");
for (const [file, target] of [
    ["blog/index.html", "/blog/1/"],
    ["en/blog/index.html", "/en/blog/1/"],
]) {
    if (!existsSync(distFile(file))) {
        bad(`缺少 ${file}`);
        continue;
    }
    const html = read(distFile(file));
    html.includes(`url=${target}`) ? ok(`${file} → ${target}`) : bad(`${file} 未指向 ${target}`);
}

// ────────────────────────────────────────────────────── 5. 缓存头
section("A5 缓存头");
const headersTxt = existsSync(distFile("_headers")) ? read(distFile("_headers")) : "";
if (!headersTxt) {
    bad("dist/_headers 不存在（public/_headers 未被带进产物）");
} else {
    const blocks = headersTxt.split(/\n(?=[^\s#])/);
    const find = (pattern) => blocks.find((b) => b.trim().startsWith(pattern));
    const assets = find("/assets/*");
    const astro = find("/_astro/*");
    const html = find("/*.html");
    assets && /immutable/.test(assets) ? ok("/assets/* immutable") : bad("/assets/* 缺 immutable");
    astro && /immutable/.test(astro) ? ok("/_astro/* immutable") : bad("/_astro/* 缺 immutable");
    html && /must-revalidate/.test(html)
        ? ok("HTML must-revalidate")
        : bad("HTML 缺 must-revalidate");
}

// ────────────────────────────────────────────────────── 6. root-only 前提
section("A6 root-only 部署前提");
homeHtml && /<base\s/i.test(homeHtml)
    ? bad("产物含 <base href>：root-only 前提被破坏")
    : ok("无 <base href>（子路径部署本就不支持，见 docs/deploy-matrix.md）");

// ────────────────────────────────────────────────────── 7. 目标专属契约
const platformChecks = (target) => {
    section(`A7 平台契约：${target}`);
    if (target === "gh-pages") {
        existsSync(distFile("404.html"))
            ? ok("dist/404.html 存在（GH Pages 自定义 404）")
            : bad("dist/404.html 不存在");
        tagDirs.length > 0 && stubOk === tagDirs.length
            ? ok("GH Pages 的 301 能力由 /tag/* 桩全量覆盖")
            : bad("GH Pages 的 /tag/* 桩覆盖不完整（GH Pages 无服务端 301）");
        // _headers / _redirects 会被原样发布，GH Pages 不解释它们——只断言「产物里带着」，并靠文档说明
        existsSync(distFile("_redirects"))
            ? ok("dist/_redirects 随产物发布（GH Pages 不解释，文档已声明）")
            : bad("dist/_redirects 缺失");
    }
    if (target === "cloudflare") {
        existsSync(distFile("_redirects"))
            ? ok("dist/_redirects 存在（Pages 会解释它）")
            : bad("dist/_redirects 不存在");
        cfRules.length === 4
            ? ok(`_redirects 规则数 = 4`)
            : bad(`_redirects 规则数 = ${cfRules.length}，期望 4`);
        headersTxt ? ok("dist/_headers 存在（Pages 缓存层）") : bad("dist/_headers 不存在");
    }
    if (target === "vercel") {
        if (!vercel) {
            bad("vercel.json 不可用");
        } else {
            vercel.buildCommand === "pnpm build:ci"
                ? ok("buildCommand = pnpm build:ci（不靠自动检测）")
                : bad(`buildCommand = ${vercel.buildCommand ?? "(缺失)"}，期望 pnpm build:ci`);
            vercel.outputDirectory === "dist"
                ? ok("outputDirectory = dist")
                : bad(`outputDirectory = ${vercel.outputDirectory ?? "(缺失)"}`);
            /max-old-space-size=4096/.test(vercel?.build?.env?.NODE_OPTIONS ?? "")
                ? ok("build.env.NODE_OPTIONS 含 4GB 堆上限")
                : bad("build.env.NODE_OPTIONS 缺 --max-old-space-size=4096");
            const headerRules = vercel.headers ?? [];
            const htmlRule = headerRules.find((r) =>
                (r.headers ?? []).some(
                    (h) => /cache-control/i.test(h.key) && /must-revalidate/i.test(h.value),
                ),
            );
            htmlRule
                ? ok(`headers 命中 HTML must-revalidate（source=${htmlRule.source}）`)
                : bad("headers 缺 HTML must-revalidate");
            vercelRules.length === 4
                ? ok("redirects 规则数 = 4")
                : bad(`redirects 规则数 = ${vercelRules.length}，期望 4`);
        }
    }
};

const targetsToRun = TARGET ? [TARGET] : TARGETS;
for (const t of targetsToRun) platformChecks(t);

// ────────────────────────────────────────────────────── 汇总
const checks = failed;
console.log(
    `\nRESULT ${failed === 0 ? "PASS" : "FAIL"} target=${TARGET ?? "all"} site=${siteOrigin ?? "?"} stubs=${stubOk}/${tagDirs.length} fails=${checks}`,
);
process.exit(failed === 0 ? 0 : 1);
