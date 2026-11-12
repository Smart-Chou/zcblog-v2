#!/usr/bin/env node
/**
 * probe-radio-empty.mjs — 「0 个电台」的构建期回归探针（M8-4 / D-0172）
 *
 * 守的是这条契约：**`radioStations = []` 是合法状态**。曾经 `radio.ts` 里
 * `radioDefaultStation = radioStations[0].id` 在空数组下抛
 * `TypeError: Cannot read properties of undefined (reading 'id')`，
 * 让 `astro build` 在**配置模块求值阶段**整站崩掉 —— 不是「无源时整块不渲染」，
 * 而是「站点构建失败」。三周后没人记得怎么验，所以固化成脚本。
 *
 * 为什么不是 `verify-build.mjs` 里的一条断言：那条链跑在 dist 上，验的是
 * 「有数据时的产物」。空数据这一格必须**换一份数据再构建一次**才能验，
 * 成本是整次 build，不能塞进每次 CI 的 dist 断言里。所以单独一个探针。
 *
 * 做四件事：
 *   1. 用 `PUBLIC_RADIO_STATE=empty` 真实构建一次（不 type-check，是真 build）
 *   2. `dist/` 全站 grep `site-player`（HTML）= 0 文件
 *   3. 播放器 chunk 没有任何页面引用（0 字节播放器）
 *   4. `/radio/` 与 `/en/radio/`：有空态、**没有** `data-radio-open` 按钮、
 *      没有 `data-radio-station`、没有 `data-radio-list` 的空栅格
 *
 * 用法:
 *   node scripts/probe-radio-empty.mjs              # 完整（含一次真实 build，约 2 分钟）
 *   node scripts/probe-radio-empty.mjs --no-build   # 只验已有 dist（先用 PUBLIC_RADIO_STATE=empty 构建过）
 *   node scripts/probe-radio-empty.mjs --keep-dist  # 验完保留 dist（默认保留，如实说明）
 *
 * 退出码: 0 = 全过；1 = 有失败项（构建崩溃也算）
 *
 * 注意：本脚本**不改仓库里的任何源文件**。空态由 `radio.ts` 里与 games / culture
 * 同款的构建期钩子 `import.meta.env.PUBLIC_RADIO_STATE` 提供，所以不需要
 * 「临时改文件 → 验完还原」那套（那套在被打断时会留下脏工作区）。
 * 验完请用 `pnpm build` 重建回正常 dist。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const SKIP_BUILD = process.argv.includes("--no-build");

let failed = 0;
const pass = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => {
    failed++;
    console.log(`  ✗ ${msg}`);
};
const skip = (msg) => console.log(`  – ${msg}`);

/* ───────────────────────── 1. 真实构建 ───────────────────────── */

console.log("E1 `PUBLIC_RADIO_STATE=empty` 真实构建");
if (SKIP_BUILD) {
    skip("--no-build：跳过构建，只验现有 dist");
    if (!existsSync(join(DIST, "radio", "index.html"))) {
        fail("dist/radio/index.html 不存在 —— 先用 PUBLIC_RADIO_STATE=empty pnpm build:ci");
    }
} else {
    const started = Date.now();
    const build = spawnSync("pnpm", ["exec", "astro", "build"], {
        cwd: ROOT,
        env: { ...process.env, PUBLIC_RADIO_STATE: "empty" },
        encoding: "utf-8",
        // 构建日志可能很长，只在失败时回放尾部
        maxBuffer: 64 * 1024 * 1024,
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    if (build.status === 0) {
        const pages = /(\d+)\s+page\(s\)\s+built/.exec(build.stdout ?? "")?.[1];
        pass(`astro build 成功（${seconds}s${pages ? ` · ${pages} 页` : ""}）`);
        // 之前就是这个箭头：空数组在配置模块求值阶段抛 TypeError
        if (/Cannot read properties of undefined/.test(build.stderr ?? "")) {
            fail(
                "构建日志里出现 `Cannot read properties of undefined` —— 又有派生值对空数组解引用了",
            );
        }
    } else {
        fail(`astro build 失败（exit ${build.status}，${seconds}s）—— 空数组仍是致命错误`);
        const tail = `${build.stdout ?? ""}\n${build.stderr ?? ""}`.trim().split("\n").slice(-25);
        console.log(tail.map((line) => `      │ ${line}`).join("\n"));
        console.log(`\n❌ 「0 个电台」不再可构建（${failed} 项失败）`);
        process.exit(1);
    }
}

/* ───────────────────────── 遍历 dist ───────────────────────── */

function walk(dir, out = []) {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

const allFiles = walk(DIST);
const htmlFiles = allFiles.filter((file) => file.endsWith(".html"));

/* ─────────────────── 2. 全站 0 个 site-player ─────────────────── */

console.log("E2 dist 全站无 site-player（S0 的「不是隐藏，是不存在」）");
/* 只认真实 DOM 形态，不认裸字符串。
 *
 * 起因：`SitePlayerCopy.astro` 这类组件名/变量名里含 `site-player`，用
 * `.includes("site-player")` 会把 439 个页面全判成「还在渲染播放器」，
 * 而实际 `<site-player` 元素与 `class="*site-player*"` 节点都是 0。
 * 判据要盯「页面里有没有这个节点」，不是「产物里有没有这个词」。 */
const PLAYER_NODE = /<site-player[\s>]|class="[^"]*\bsite-player\b[^"]*"|id="[^"]*\bsite-player\b/;
const withPlayer = htmlFiles.filter((file) => PLAYER_NODE.test(readFileSync(file, "utf-8")));
if (withPlayer.length === 0) {
    pass(`${htmlFiles.length} 个 HTML 文件里 0 个渲染 site-player 节点`);
} else {
    fail(`${withPlayer.length} 个 HTML 文件仍渲染 site-player 节点：`);
    for (const file of withPlayer.slice(0, 8)) console.log(`      · ${relative(DIST, file)}`);
}

/* ─────────────────── 3. 播放器 chunk 0 引用 ─────────────────── */

console.log("E3 播放器 chunk 无人引用");
const chunks = allFiles.filter(
    (file) => file.endsWith(".js") && /site-player/i.test(file) && file.includes("_astro"),
);
if (chunks.length === 0) {
    pass("_astro 下没有 site-player chunk（摇树摇干净了）");
} else {
    // chunk 本身还在磁盘上不致命（只要没人引用就不会被下载），但更干净的是不产出
    const referencedBy = htmlFiles.filter((file) => {
        const html = readFileSync(file, "utf-8");
        return chunks.some((chunk) => html.includes(chunk.split("/").pop()));
    });
    if (referencedBy.length === 0) {
        pass(`${chunks.length} 个 chunk 在磁盘上但 0 个页面引用（HTTP 上不可达）`);
    } else {
        fail(`${referencedBy.length} 个页面仍在引用播放器 chunk`);
    }
}

/* ─────────────────── 4. /radio/ 空态 ─────────────────── */

console.log("E4 `/radio/` 与 `/en/radio/` 渲染空态、无唤起按钮");
for (const [route, lang] of [
    [["radio", "index.html"], "zh"],
    [["en", "radio", "index.html"], "en"],
]) {
    const file = join(DIST, ...route);
    const label = `/${route.slice(0, -1).join("/")}/`;
    if (!existsSync(file)) {
        fail(`${label} 产物缺失`);
        continue;
    }
    const html = readFileSync(file, "utf-8");
    const checks = [
        [/<button[^>]*\bdata-radio-open\b/, 0, "唤起按钮不渲染（点了没反应的东西不该存在）"],
        [/<button[^>]*\bdata-radio-station=/g, 0, "选台按钮不渲染（无台可切）"],
        [/<ul[^>]*class="radio-page__stations"/, 0, "没有 0 项电台栅格"],
        [/\bdata-radio-empty\b/, 1, "空态容器存在"],
        [/\bdata-state--empty\b/, 1, "复用 DataState 的 empty 形态，未新造组件"],
    ];
    for (const [pattern, expected, why] of checks) {
        const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
        const actual = [...html.matchAll(new RegExp(pattern.source, flags))].length;
        const ok = expected === 0 ? actual === 0 : actual >= expected;
        if (ok) pass(`${label} ${why}`);
        else
            fail(
                `${label} /${pattern.source}/ 命中 ${actual} 次，期望 ${expected === 0 ? "0" : `≥${expected}`}`,
            );
    }
    // 状态行不能还是「0 stations」这种把空集当数据的说法
    if (/0\s*stations/.test(html)) fail(`${label} 仍渲染「0 stations」统计（空集不是 0 个台）`);
    else pass(`${label} 不渲染「0 stations」统计`);
    if (lang === "zh" && !html.includes("暂时没有电台在播")) fail(`${label} 缺中文空态标题`);
    if (lang === "en" && !html.includes("No station is on air")) fail(`${label} 缺英文空态标题`);
}

/* ───────────────────────── 汇总 ───────────────────────── */

if (failed > 0) {
    console.log(`\n❌ 「0 个电台」探针失败 ${failed} 项`);
    process.exit(1);
}
console.log("\n✅ 空数组 = 合法停播状态：构建通过、0 个播放器节点、页面渲染空态");
console.log("   验完记得 `pnpm build` 重建回正常 dist（现在 dist 是空态产物）");
