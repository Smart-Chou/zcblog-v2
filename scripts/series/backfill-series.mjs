#!/usr/bin/env node
/**
 * 系列 frontmatter 回填（M5-13 · N-1b）
 *
 * 内容仓（`Smart-Chou/zcblog-articles`）里 0 篇文章写过 `series` —— N-1a 的
 * `/series/` 路由因此不存在。本脚本按 `scripts/series/series-map.json` 的编辑计划
 * 给指定文章补 `series` / `seriesOrder` 两个键。
 *
 * 四条硬规则：
 *  1. **默认 dry-run**：不加 `--apply` 只打印计划，不碰磁盘。
 *  2. **幂等**：已写且值一致 = `noop`；第二次跑必须 0 变更（脚本自己会再验一遍）。
 *  3. **永不覆盖**：已有 `series`/`seriesOrder` 且与计划不一致 → `conflict`，
 *     只报告不修改，进程以 1 退出（人工判断，别让脚本替你决定文章归属）。
 *  4. **只动 frontmatter**：插入两行，正文、其余键、键序都不变。
 *
 * 用法
 *   node scripts/series/backfill-series.mjs <内容目录>                 # dry-run
 *   node scripts/series/backfill-series.mjs <内容目录> --apply         # 写盘
 *   node scripts/series/backfill-series.mjs <目录> --map <map.json>    # 换计划
 *
 * 退出码：0 = 全部 add/noop；1 = 有 conflict / missing / 写盘后二次校验不幂等；2 = 用法错误。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SERIES_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const args = process.argv.slice(2);
let mapPath = join(ROOT, "scripts/series/series-map.json");
const mapFlagIndex = args.indexOf("--map");
if (mapFlagIndex !== -1) {
    mapPath = resolve(args[mapFlagIndex + 1] ?? "");
}
const mapValueIndex = mapFlagIndex === -1 ? -1 : mapFlagIndex + 1;
const positional = args.filter((arg, index) => !arg.startsWith("--") && index !== mapValueIndex);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const dirArg = positional[0];

if (!dirArg || flags.has("--help") || flags.has("-h")) {
    console.error(
        "用法: node scripts/series/backfill-series.mjs <内容目录> [--apply] [--map <map.json>]",
    );
    process.exit(2);
}

const APPLY = flags.has("--apply");
const DIR = resolve(dirArg);

/* ───────────────────────── 计划校验 ───────────────────────── */

const map = JSON.parse(readFileSync(mapPath, "utf8"));
const plan = new Map(); // fileBase → { slug, order, series }

for (const entry of map.series ?? []) {
    const slug = String(entry.slug ?? "");
    if (!SERIES_SLUG_RE.test(slug)) {
        console.error(`✗ 计划里的 series slug 不合法（需 ASCII 小写 kebab）：${slug}`);
        process.exit(2);
    }
    for (const [article, order] of Object.entries(entry.articles ?? {})) {
        if (!Number.isInteger(order) || order < 0 || order > 999) {
            console.error(`✗ ${slug}/${article}: seriesOrder 必须是 0–999 的整数，收到 ${order}`);
            process.exit(2);
        }
        if (plan.has(article)) {
            console.error(
                `✗ ${article} 在计划里出现了两次（${plan.get(article).slug} / ${slug}）——` +
                    "一篇文章只能属于一个系列，先改计划",
            );
            process.exit(2);
        }
        plan.set(article, { slug, order });
    }
}

/* ───────────────────────── frontmatter 读写 ───────────────────────── */

/** 与 scripts/normalize-frontmatter.mjs 同一套切分：head 到结束分隔符前一行，rest 从 "\n---" 起 */
function splitFrontmatter(text) {
    if (!text.startsWith("---")) return null;
    const end = text.indexOf("\n---", 3);
    if (end === -1) return null;
    return { head: text.slice(0, end), rest: text.slice(end) };
}

/** 取 head 里某个顶层键的原始值（只支持单行 `key: value`，够用且不会误伤正文） */
function readKey(lines, key) {
    const pattern = new RegExp(`^${key}:\\s*(.*)$`);
    for (const line of lines) {
        const match = line.match(pattern);
        if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    }
    return null;
}

/** 插在 `upDate:` 之后（没有就 `pubDate:` 之后，都没有就 head 末尾），保持读者熟悉的键序 */
function insertKeys(lines, slug, order) {
    const added = [`series: ${slug}`, `seriesOrder: ${order}`];
    for (const anchor of ["upDate", "pubDate"]) {
        const index = lines.findIndex((line) => new RegExp(`^${anchor}:`).test(line));
        if (index !== -1) {
            lines.splice(index + 1, 0, ...added);
            return lines;
        }
    }
    lines.push(...added);
    return lines;
}

function planFile(article) {
    const target = plan.get(article);
    const candidates = [`${article}.md`, `${article}.mdx`];
    const file = candidates.map((name) => join(DIR, name)).find((path) => existsSync(path));
    if (!file) return { article, status: "missing", target };

    const raw = readFileSync(file, "utf8");
    const parts = splitFrontmatter(raw);
    if (!parts) return { article, file, status: "no-frontmatter", target };

    const lines = parts.head.split("\n");
    const currentSeries = readKey(lines, "series");
    const currentOrder = readKey(lines, "seriesOrder");

    // 已写：值一致 = noop；不一致 = conflict（绝不覆盖）
    if (currentSeries !== null || currentOrder !== null) {
        const same =
            currentSeries === target.slug &&
            (currentOrder === null ? false : String(target.order) === String(Number(currentOrder)));
        return {
            article,
            file,
            status: same ? "noop" : "conflict",
            target,
            current: { series: currentSeries, seriesOrder: currentOrder },
        };
    }

    const nextHead = insertKeys(lines, target.slug, target.order).join("\n");
    const next = nextHead + parts.rest;
    return { article, file, status: "add", target, next, raw };
}

/* ───────────────────────── 执行 ───────────────────────── */

const results = [...plan.keys()].sort().map(planFile);

const width = Math.max(...results.map((row) => row.article.length), 8);
console.log(`▶ 系列回填 ${APPLY ? "APPLY（写盘）" : "DRY-RUN（不写盘）"} · ${DIR}`);
console.log(`  计划：${mapPath}`);
for (const row of results) {
    const detail =
        row.status === "add"
            ? `series=${row.target.slug} seriesOrder=${row.target.order}`
            : row.status === "conflict"
              ? `现有 series=${row.current.series ?? "∅"} seriesOrder=${row.current.seriesOrder ?? "∅"} ≠ 计划 ${row.target.slug}/${row.target.order}`
              : row.status === "noop"
                ? "已是计划值"
                : "内容目录里找不到这个文件";
    console.log(`  ${row.article.padEnd(width)}  ${row.status.padEnd(7)}  ${detail}`);
}

const count = (status) => results.filter((row) => row.status === status).length;
const summary = `add=${count("add")} noop=${count("noop")} conflict=${count("conflict")} missing=${count("missing")}`;
console.log(`  汇总：${summary}`);

let failed = count("conflict") > 0 || count("missing") > 0;

if (APPLY) {
    for (const row of results) {
        if (row.status !== "add") continue;
        writeFileSync(row.file, row.next);
        // 幂等自证：写完立刻重算一遍，必须变成 noop（否则说明插入位置/取值写错）
        const again = planFile(row.article);
        if (again.status !== "noop") {
            console.error(`✗ 幂等校验失败：${row.article} 二次计算得到 ${again.status}`);
            failed = true;
        }
    }
    // 第二次全量干跑：应 0 add
    const rerun = [...plan.keys()].sort().map(planFile);
    const stillAdd = rerun.filter((row) => row.status === "add").length;
    console.log(`  幂等复核：二次 dry-run add=${stillAdd}（必须为 0）`);
    if (stillAdd !== 0) failed = true;
}

if (failed) {
    console.error("✗ 有 conflict / missing / 幂等失败，人工处理后再跑");
    process.exit(1);
}
console.log("✅ 完成");
