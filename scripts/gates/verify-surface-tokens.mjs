#!/usr/bin/env node
/**
 * verify-surface-tokens.mjs — P5 棘轮（页面严格 0 / 组件只减不增）
 *
 * 判定 `blog2.0/docs/19-m2-plan.md` §3 M2-1 的两级判据（「先量再定，不许凭空写 0」）：
 *
 *   P1–P3  `src/pages/**`：hex / rgb() / hsl() = 0；Tailwind 语法（tailwind / @apply / @theme）= 0；
 *          px 只允许 0 / 1px / 2px 与 @media 断点。
 *          2026-11-04 实测不是 0：3 个文件 7 条存量（albums / 500 / [...custom]），
 *          本卡文件边界不许改 `src/pages/**`，因此登记在 `pages_exempt` 里冻结；新增一条即 FAIL。
 *   C1     `src/components/**`（UI/atom、UI/molecule 由 verify-atoms 的 A2/A7 判）：
 *          颜色字面量必须出现在 `docs/surface-token-baseline.json`；新增一条即 FAIL；
 *          基线只减不增（清理后用 --update 收紧）。
 *   C2     组件里的 Tailwind 语法（P8）：= 0。
 *
 * 用法
 *   node scripts/gates/verify-surface-tokens.mjs            # 校验
 *   node scripts/gates/verify-surface-tokens.mjs --update   # 重写基线（拒绝变长）
 *   node scripts/gates/verify-surface-tokens.mjs --root <dir>  # 对临时副本跑（负向测试用）
 *
 * 退出码：0 = 全 PASS；1 = 有 FAIL
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ───────────────────────── 参数 ───────────────────────── */

const argv = process.argv.slice(2);
const argValue = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
};
const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(argValue("--root") ?? scriptRoot);
const update = argv.includes("--update");
const rel = (p) => path.relative(repoRoot, p);

const BASELINE_REL = "docs/surface-token-baseline.json";
/** 2026-11-04 冻结的组件颜色字面量总数。改这里 = 放宽棘轮，必须写进卡评论并走 review。 */
const FROZEN_COMPONENT_TOTAL = 84;
/** 2026-11-04 实测的页面存量条数（计划称 0，实测非 0）。 */
const FROZEN_PAGES_TOTAL = 7;

const SKIP_DIRS = new Set([
    "node_modules",
    "dist",
    ".git",
    ".astro",
    "test-results",
    "playwright-report",
    ".vite-cache",
    ".wrangler",
]);
const SOURCE_EXT = /\.(astro|ts|tsx|js|mjs|css)$/;

const PX_WHITELIST = new Set(["0px", "1px", "2px"]);
const HEX_RE = /(?<![-\w&])#[0-9a-fA-F]{3,8}\b/g;
const COLOR_FN_RE = /\b(?:rgba?|hsla?)\(/g;
const TAILWIND_RE = /\b(?:tailwind|@apply|@theme)\b/;
const PX_RE = /(?<![\w-])(\d+(?:\.\d+)?)px\b/g;

/* ───────────────────────── 工具 ───────────────────────── */

const problems = [];
const rows = [];
const addCheck = (id, title, ok, detail, detailProblems = []) => {
    rows.push({ id, title, ok, detail, problems: detailProblems });
    if (!ok) problems.push(...detailProblems.map((problem) => `${id} ${problem}`));
};

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (SOURCE_EXT.test(name)) out.push(full);
    }
    return out;
}

const toPosix = (p) => p.split(path.sep).join("/");

/** 生成物必须与 CI 的 `prettier --check .` 相容：写完就地格式化。 */
function formatWithPrettier(file) {
    const bin = path.join(repoRoot, "node_modules/.bin/prettier");
    if (!existsSync(bin)) return;
    const result = spawnSync(bin, ["--write", "--log-level", "warn", file], {
        cwd: repoRoot,
        stdio: "inherit",
    });
    if (result.status !== 0)
        console.error("prettier --write 失败：门禁值不受影响，但 CI 的 lint 会红");
}

/** 归一化颜色字面量：hex 小写、函数内空白压掉（rgba(0, 0, 0, .5) → rgba(0,0,0,.5)）。 */
function normalizeColor(literal) {
    if (literal.startsWith("#")) return literal.toLowerCase();
    const open = literal.indexOf("(");
    return `${literal.slice(0, open)}(${literal
        .slice(open + 1)
        .replace(/\s+/g, "")
        .replace(/\)$/, "")})`;
}

/** 抓一行里的颜色字面量；rgb()/hsl() 允许嵌套 var()，按括号配平截取。 */
function scanColors(line) {
    const hits = [];
    for (const match of line.matchAll(HEX_RE)) hits.push({ start: match.index, text: match[0] });
    COLOR_FN_RE.lastIndex = 0;
    let match;
    while ((match = COLOR_FN_RE.exec(line)) !== null) {
        let depth = 0;
        let end = match.index;
        for (let i = match.index + match[0].length - 1; i < line.length; i++) {
            if (line[i] === "(") depth++;
            else if (line[i] === ")") {
                depth--;
                if (depth === 0) {
                    end = i + 1;
                    break;
                }
            }
        }
        if (end > match.index)
            hits.push({ start: match.index, text: line.slice(match.index, end) });
    }
    return hits.map((hit) => normalizeColor(hit.text));
}

function scanFile(file) {
    const source = readFileSync(file, "utf8");
    const colors = [];
    const tailwind = [];
    const px = [];
    source.split(/\r?\n/).forEach((line, index) => {
        for (const literal of scanColors(line)) colors.push(literal);
        if (TAILWIND_RE.test(line))
            tailwind.push(`${rel(file)}:${index + 1}: ${line.trim().slice(0, 90)}`);
        if (/@media/.test(line)) return;
        for (const match of line.matchAll(PX_RE)) {
            const literal = `${match[1]}px`;
            if (PX_WHITELIST.has(literal)) continue;
            px.push({
                literal,
                where: `${rel(file)}:${index + 1}`,
                line: line.trim().slice(0, 90),
            });
        }
    });
    return { colors, tailwind, px };
}

const sortObject = (object) =>
    Object.fromEntries(
        Object.keys(object)
            .sort()
            .map((key) => [key, [...object[key]].sort()]),
    );

/* ───────────────────────── 扫描 ───────────────────────── */

const pagesDir = path.join(repoRoot, "src/pages");
const componentsDir = path.join(repoRoot, "src/components");
if (!existsSync(pagesDir) || !existsSync(componentsDir)) {
    console.error(`FATAL 找不到 src/pages 或 src/components（root=${repoRoot}）`);
    process.exit(1);
}

const pageFiles = walk(pagesDir);
const componentFiles = walk(componentsDir).filter(
    (file) => !toPosix(file).includes("/UI/atom/") && !toPosix(file).includes("/UI/molecule/"),
);

const pageColors = [];
const pageTailwind = [];
const pagePx = [];
for (const file of pageFiles) {
    const scan = scanFile(file);
    pageColors.push(...scan.colors.map((value) => ({ file: toPosix(rel(file)), value })));
    pageTailwind.push(...scan.tailwind);
    pagePx.push(
        ...scan.px.map((hit) => ({
            file: toPosix(rel(file)),
            value: hit.literal,
            where: hit.where,
            line: hit.line,
        })),
    );
}

const componentColors = {};
for (const file of componentFiles) {
    const scan = scanFile(file);
    if (scan.colors.length === 0) continue;
    componentColors[toPosix(rel(file))] = scan.colors;
}
const componentTailwind = [];
for (const file of componentFiles) componentTailwind.push(...scanFile(file).tailwind);

/* ───────────────────────── 基线 ───────────────────────── */

const baselinePath = path.join(repoRoot, BASELINE_REL);

function buildBaseline() {
    const totals = {
        files: Object.keys(componentColors).length,
        literals: Object.values(componentColors).reduce((sum, list) => sum + list.length, 0),
        hex6: Object.values(componentColors)
            .flat()
            .filter((value) => /^#[0-9a-f]{6}$/.test(value)).length,
        hex3: Object.values(componentColors)
            .flat()
            .filter((value) => /^#[0-9a-f]{3}$/.test(value)).length,
        color_function: Object.values(componentColors)
            .flat()
            .filter((value) => !value.startsWith("#")).length,
    };
    const pagesExempt = {};
    for (const file of new Set([
        ...pageColors.map((hit) => hit.file),
        ...pagePx.map((hit) => hit.file),
    ])) {
        pagesExempt[file] = [
            ...pageColors.filter((hit) => hit.file === file).map((hit) => `color:${hit.value}`),
            ...pagePx.filter((hit) => hit.file === file).map((hit) => `px:${hit.value}`),
        ].sort();
    }
    return {
        version: 1,
        generated_by: "node scripts/gates/verify-surface-tokens.mjs --update",
        rules: {
            pages: "src/pages/**：hex / rgb() / hsl() = 0，Tailwind = 0，px 只允许 0/1px/2px 与 @media 断点。存量登记在 pages_exempt，只减不增；新增即 FAIL。",
            components:
                "src/components/**（UI/atom、UI/molecule 由 verify-atoms 判）：颜色字面量必须在 components 基线内，新增即 FAIL；基线只减不增（清理后用 --update 收紧）。",
        },
        frozen_total: FROZEN_COMPONENT_TOTAL,
        totals,
        components: sortObject(componentColors),
        pages_exempt: sortObject(pagesExempt),
    };
}

const measured = buildBaseline();

if (update) {
    const previous = existsSync(baselinePath)
        ? JSON.parse(readFileSync(baselinePath, "utf8"))
        : null;
    const before = previous?.totals?.literals ?? 0;
    if (previous && measured.totals.literals > before) {
        console.error(
            `拒绝放宽基线：组件颜色字面量 ${before} → ${measured.totals.literals}。先清掉新增的字面量（用 token），再收紧基线。`,
        );
        process.exit(1);
    }
    const beforePages = previous ? Object.values(previous.pages_exempt ?? {}).flat().length : 0;
    const afterPages = Object.values(measured.pages_exempt).flat().length;
    if (previous && afterPages > beforePages) {
        console.error(`拒绝放宽页面基线：${beforePages} → ${afterPages}。pages 只许变短。`);
        process.exit(1);
    }
    writeFileSync(baselinePath, `${JSON.stringify(measured, null, 4)}\n`, "utf8");
    formatWithPrettier(baselinePath);
    console.log(`更新 ${BASELINE_REL}`);
    console.log(`  components: ${measured.totals.files} 文件 / ${measured.totals.literals} 条`);
    console.log(
        `  pages_exempt: ${afterPages} 条（${Object.keys(measured.pages_exempt).length} 文件）`,
    );
    process.exit(0);
}

if (!existsSync(baselinePath)) {
    console.error(
        `FATAL 缺 ${BASELINE_REL}；先跑 node scripts/gates/verify-surface-tokens.mjs --update`,
    );
    process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const baselineComponents = baseline.components ?? {};
const baselinePages = baseline.pages_exempt ?? {};

/* ───────────────────────── P1 页面颜色 ───────────────────────── */

const allowedPageColors = new Map();
for (const [file, values] of Object.entries(baselinePages)) {
    allowedPageColors.set(
        file,
        values
            .filter((value) => value.startsWith("color:"))
            .map((value) => value.slice("color:".length)),
    );
}
const pageColorProblems = [];
const usedPageColors = new Map();
for (const hit of pageColors) {
    const allowed = allowedPageColors.get(hit.file) ?? [];
    const pool = usedPageColors.get(hit.file) ?? [...allowed];
    const index = pool.indexOf(hit.value);
    if (index === -1) pageColorProblems.push(`${hit.file}: 新增字面颜色 ${hit.value}`);
    else {
        pool.splice(index, 1);
        usedPageColors.set(hit.file, pool);
    }
}
for (const [file, values] of allowedPageColors) {
    const left = usedPageColors.get(file) ?? [...values];
    for (const value of left)
        pageColorProblems.push(`${file}: 基线里的 ${value} 已不存在（收紧 pages_exempt）`);
}
addCheck(
    "P1",
    "src/pages/** 颜色字面量 = 0（存量冻结）",
    pageColorProblems.length === 0,
    `新增 ${pageColorProblems.filter((problem) => problem.includes("新增字面颜色")).length} · 基线存量 ${[...allowedPageColors.values()].flat().length}`,
    pageColorProblems,
);

/* ───────────────────────── P2 页面 Tailwind ───────────────────────── */

addCheck(
    "P2",
    "src/pages/** Tailwind / @apply / @theme = 0",
    pageTailwind.length === 0,
    `命中 ${pageTailwind.length}`,
    pageTailwind,
);

/* ───────────────────────── P3 页面 px ───────────────────────── */

const allowedPagePx = new Map();
for (const [file, values] of Object.entries(baselinePages)) {
    allowedPagePx.set(
        file,
        values.filter((value) => value.startsWith("px:")).map((value) => value.slice("px:".length)),
    );
}
const pagePxProblems = [];
const usedPagePx = new Map();
for (const hit of pagePx) {
    const pool = usedPagePx.get(hit.file) ?? [...(allowedPagePx.get(hit.file) ?? [])];
    const index = pool.indexOf(hit.value);
    if (index === -1) pagePxProblems.push(`${hit.where}: 白名单外尺寸 ${hit.value} :: ${hit.line}`);
    else {
        pool.splice(index, 1);
        usedPagePx.set(hit.file, pool);
    }
}
for (const [file, values] of allowedPagePx) {
    for (const value of usedPagePx.get(file) ?? values)
        pagePxProblems.push(`${file}: 基线里的 ${value} 已不存在（收紧 pages_exempt）`);
}
addCheck(
    "P3",
    "src/pages/** px 只允许 0/1px/2px（存量冻结）",
    pagePxProblems.length === 0,
    `新增 ${pagePxProblems.filter((problem) => problem.includes("白名单外尺寸")).length} · 基线存量 ${[...allowedPagePx.values()].flat().length}`,
    pagePxProblems,
);

/* ───────────────────────── C1 组件颜色棘轮 ───────────────────────── */

const componentProblems = [];
const currentFiles = Object.keys(componentColors);
for (const file of currentFiles) {
    const allowed = [...(baselineComponents[file] ?? [])];
    for (const value of componentColors[file]) {
        const index = allowed.indexOf(value);
        if (index === -1) componentProblems.push(`${file}: 新增字面颜色 ${value}`);
        else allowed.splice(index, 1);
    }
    for (const value of allowed)
        componentProblems.push(`${file}: 基线里的 ${value} 已不存在（用 --update 收紧）`);
}
for (const file of Object.keys(baselineComponents)) {
    if (!currentFiles.includes(file))
        componentProblems.push(`${file}: 基线文件已不存在（用 --update 收紧）`);
}
const currentTotal = measured.totals.literals;
if (currentTotal > FROZEN_COMPONENT_TOTAL) {
    componentProblems.push(`组件字面量总数 ${currentTotal} > 冻结上限 ${FROZEN_COMPONENT_TOTAL}`);
}
const baselineTotal = Object.values(baselineComponents).reduce((sum, list) => sum + list.length, 0);
addCheck(
    "C1",
    "src/components/** 颜色只减不增（基线棘轮）",
    componentProblems.length === 0,
    `${currentFiles.length} 文件 ${currentTotal} 条 · 基线 ${Object.keys(baselineComponents).length} 文件 ${baselineTotal} 条 · 上限 ${FROZEN_COMPONENT_TOTAL}`,
    componentProblems,
);

/* ───────────────────────── C2 组件 Tailwind ───────────────────────── */

addCheck(
    "C2",
    "src/components/** Tailwind / @apply / @theme = 0",
    componentTailwind.length === 0,
    `命中 ${componentTailwind.length}`,
    componentTailwind,
);

/* ───────────────────────── 输出 ───────────────────────── */

const pad = (text, width) => {
    const visual = [...text].reduce((sum, char) => sum + (/[\u4e00-\u9fff]/.test(char) ? 2 : 1), 0);
    return text + " ".repeat(Math.max(0, width - visual));
};

console.log("P5 棘轮门禁（surface tokens）");
console.log(`root: ${repoRoot}`);
console.log("");
for (const row of rows) {
    console.log(
        `${row.id.padEnd(4)} ${pad(row.title, 44)} ${row.ok ? "PASS" : "FAIL"}  ${row.detail}`,
    );
    for (const problem of row.problems) console.log(`     - ${problem}`);
}

const failed = rows.filter((row) => !row.ok);
const pagesHits = pageColors.length + pagePx.length;
const newPagesHits = pageColorProblems.length + pagePxProblems.length;
console.log("");
if (failed.length) {
    console.log(`RESULT FAIL  ${failed.length}/${rows.length} 项不通过`);
    process.exit(1);
}
console.log(
    `RESULT PASS  pages_hits=${pagesHits}(legacy frozen, new=0) new_hits=0 baseline=${currentTotal}/${FROZEN_COMPONENT_TOTAL}`,
);
