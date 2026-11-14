#!/usr/bin/env node
/**
 * S4 构建断言（CI 门禁）：A1 / A11 / A13 + pagefind 产物完整性
 *
 * 为什么单独一个脚本：`astro build` 成功 ≠ 产物对。曾经出现过「构建成功但
 * 文章数少 4 篇」「features 消费方缺失导致 mermaid 静默消失」两类问题，
 * 都只有扫产物才能发现。
 *
 * 用法: node scripts/verify-build.mjs [dist] [contentDir]
 * 退出码: 0 = 全过；1 = 有失败项
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = process.argv[2] ?? "dist";
const CONTENT = process.argv[3] ?? "src/content/article";

// 期望值随内容仓走：改内容时同步改这里，或通过环境变量覆盖（CI 里就是常量）
const EXPECT_ARTICLES = Number(process.env.EXPECT_ARTICLES ?? 85);
const EXPECT_CONTENT = Number(process.env.EXPECT_CONTENT ?? 89);

let failed = 0;
const pass = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => {
    failed++;
    console.log(`  ✗ ${msg}`);
};

/** A13 抽样：页面 → 必须出现的渲染标记（出现次数下限） */
const FEATURE_SAMPLES = [
    ["beszel-server-monitoring-guide", { mermaid: 1 }],
    ["expressive-code", { mermaid: 1, katex: 1 }],
    ["blog-feature-demo", { mermaid: 1, katex: 1, plantuml: 1, chart: 1, markmap: 1 }],
];

function count(haystack, needle) {
    let n = 0;
    let i = haystack.indexOf(needle);
    while (i !== -1) {
        n++;
        i = haystack.indexOf(needle, i + needle.length);
    }
    return n;
}

// ---------------------------------------------------------------- A1
console.log("A1 文章全量产出");
const articleRoot = join(DIST, "article");
const articleDirs = existsSync(articleRoot)
    ? readdirSync(articleRoot).filter((d) => {
          const p = join(articleRoot, d);
          return statSync(p).isDirectory() && existsSync(join(p, "index.html"));
      })
    : [];
if (articleDirs.length === EXPECT_ARTICLES) {
    pass(`dist/article 产出 ${articleDirs.length} 篇（期望 ${EXPECT_ARTICLES}）`);
} else {
    fail(`dist/article 产出 ${articleDirs.length} 篇，期望 ${EXPECT_ARTICLES}`);
}
if (articleDirs.includes("paid-demo-local")) {
    fail("产物里出现 paid-demo-local（付费 demo 泄漏）");
} else {
    pass("无 paid-demo-local");
}

// --------------------------------------------------------------- A11
console.log("A11 schema 全量兼容（内容篇数）");
const mdFiles = existsSync(CONTENT)
    ? readdirSync(CONTENT).filter((f) => f.endsWith(".md") || f.endsWith(".mdx"))
    : [];
if (mdFiles.length === EXPECT_CONTENT) {
    pass(`内容仓 ${mdFiles.length} 篇全部参与校验（期望 ${EXPECT_CONTENT}）`);
} else {
    fail(`内容仓 ${mdFiles.length} 篇，期望 ${EXPECT_CONTENT}`);
}

// --------------------------------------------------------------- A13
// 抽样是「内容仓里存在的这几篇」而不是「仓库里必须有这几篇」：外部 PR 拿不到私有仓，
// 走 fixture 兜底时这 3 篇不会全在。因此在场的才校验，缺席的跳过。
// 但要有下限：一篇都没抽到时判红，避免「抽样空转」被当成通过。
// 生产构建（deploy.yml）另设 A13_REQUIRE_ALL=1，要求 3 篇全在——真实内容仓本来就都有，
// 缺任何一篇说明内容链路出问题，不能被"跳过"掩盖。
const REQUIRE_ALL = process.env.A13_REQUIRE_ALL === "1";
console.log(
    `A13 features 渲染等价（抽样 ${FEATURE_SAMPLES.length} 篇${REQUIRE_ALL ? "，要求全在" : ""}）`,
);
let sampled = 0;
for (const [slug, markers] of FEATURE_SAMPLES) {
    const file = join(DIST, "article", slug, "index.html");
    if (!existsSync(file)) {
        if (REQUIRE_ALL) fail(`${slug}: 产物缺失（生产构建要求全在）`);
        else console.log(`  - ${slug}: 不在本次内容中，跳过`);
        continue;
    }
    sampled += 1;
    const html = readFileSync(file, "utf-8").toLowerCase();
    const missing = Object.entries(markers)
        .filter(([marker, min]) => count(html, marker) < min)
        .map(([marker]) => marker);
    if (missing.length === 0) {
        pass(`${slug}: ${Object.keys(markers).join(" / ")} 均在`);
    } else {
        fail(`${slug}: 缺 ${missing.join(" / ")}`);
    }
}
if (REQUIRE_ALL && sampled < FEATURE_SAMPLES.length) {
    fail(`A13 只抽到 ${sampled}/${FEATURE_SAMPLES.length} 篇，生产构建要求全部到位`);
} else if (sampled === 0) {
    fail(
        `A13 抽样全部缺席（${FEATURE_SAMPLES.map(([s]) => s).join(" / ")}）——一篇都没抽到，A13 未被真正验证`,
    );
} else {
    pass(`A13 实际抽到 ${sampled} 篇`);
}

// ------------------------------------------------------- pagefind 产物
console.log("pagefind 索引");
const pfEntry = join(DIST, "pagefind", "pagefind-entry.json");
const fragDir = join(DIST, "pagefind", "fragment");
if (existsSync(pfEntry)) {
    pass("pagefind-entry.json 存在");
} else {
    fail("pagefind-entry.json 缺失（搜索会空）");
}
const frags = existsSync(fragDir) ? readdirSync(fragDir).length : 0;
if (frags > 0) {
    pass(`fragment 分片 ${frags} 个`);
} else {
    fail("fragment 目录为空（索引未生成）");
}

// -------------------------------------------------- A17 全局样式链完整
// 2026-10-30：`:root` 块被写到 global.css 的 @import 之前，导致其后 8 个样式文件
// 整份没进构建（BaseLayout CSS 从 106KB 掉到 34KB），构建不报错、请求不 404，
// 表现成「组件样式没了」。用三条最朴素的特征守住这个静默失败。
console.log("A17 全局样式链完整");
const cssDir = join(DIST, "assets");
const cssFiles = existsSync(cssDir) ? readdirSync(cssDir).filter((f) => f.endsWith(".css")) : [];
const cssBlob = cssFiles.map((f) => readFileSync(join(cssDir, f), "utf-8")).join("");
const cssTotal = cssBlob.length;
if (cssTotal > 60_000) {
    pass(`CSS 合计 ${(cssTotal / 1024).toFixed(1)}KB（阈值 60KB）`);
} else {
    fail(`CSS 合计只有 ${(cssTotal / 1024).toFixed(1)}KB，global.css 的 @import 链可能整段失效`);
}
for (const [marker, label] of [
    ["--color-bg:", "主题变量（variables.css）"],
    ["--pf-", "pagefind 变量（@pagefind/component-ui/css）"],
    ["--search-text-subtle", "搜索样式（search-global.css）"],
]) {
    if (cssBlob.includes(marker)) {
        pass(`${label} 已进入构建`);
    } else {
        fail(`${label} 缺失 —— 检查 global.css 里 @import 是否被普通规则挡在后面`);
    }
}

// ---------------------------------------------------------------- 汇总
if (failed > 0) {
    console.log(`\n❌ 构建断言失败 ${failed} 项`);
    process.exit(1);
}
console.log("\n✅ 构建断言全部通过");
