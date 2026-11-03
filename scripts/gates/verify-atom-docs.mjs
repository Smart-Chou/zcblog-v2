#!/usr/bin/env node
/**
 * verify-atom-docs.mjs — M1-6 组件文档门禁
 *
 * 判定 16-m1-brief §5 第 5 项（12 个 atom 文档页：props/slots/states/a11y/示例）
 * 与 M1-6 卡片的验收条款。纯 node + 仓库内文件，不需要浏览器：
 *
 *   D1  12 份文档数据都在（src/pages/design/_docs/data/<slug>.json）
 *   D2  七项字段齐全且非空：用途/何时不用、Props、Slots、States、a11y、token 白名单、示例
 *   D3  12 个文档页都在（src/pages/design/atoms/<slug>.astro），且都用 <AtomDoc> + <DemoFrame>
 *   D4  token 名全部能在 tokens.json 解析（数据 + 文档页 + _docs 版式）
 *   D5  文档层没有 hex / rgb() / hsl() 字面颜色
 *   D6  文档层没有 Tailwind / @apply / @theme
 *   D7  文档层尺寸字面量只允许 0 / 1px / 2px / 百分比 / auto
 *   D8  若存在 dist（构建产物）：每个文档页都渲染了 7 个 section，且没有空表
 *
 * 用法：
 *   node scripts/gates/verify-atom-docs.mjs            # 源码门禁（CI test job 也用这条）
 *   node scripts/gates/verify-atom-docs.mjs --dist     # 额外校验构建产物（需先 astro build）
 *
 * 退出码：0 = 全 PASS；1 = 有 FAIL
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rel = (p) => path.relative(repoRoot, p);

const DATA_DIR = path.join(repoRoot, "src/pages/design/_docs/data");
const DOCS_DIR = path.join(repoRoot, "src/pages/design/atoms");
const LAYOUT_FILES = [
    "src/pages/design/atoms.astro",
    "src/pages/design/_docs/AtomDoc.astro",
    "src/pages/design/_docs/DemoFrame.astro",
    "src/pages/design/_docs/DocTable.astro",
    "src/pages/design/_docs/index.ts",
    "src/pages/design/_docs/rich.ts",
    "src/pages/design/_docs/types.ts",
];
const TOKENS_REL = "src/styles/tokens/tokens.json";

const SLUGS = [
    "button",
    "link",
    "tag",
    "input",
    "card",
    "icon",
    "avatar",
    "divider",
    "breadcrumb",
    "pagination",
    "alert",
    "skeleton",
];

const SECTION_IDS = ["purpose", "props", "slots", "states", "a11y", "tokens", "example"];

const results = [];
const add = (id, title, ok, detail, problems = []) =>
    results.push({ id, title, ok, detail, problems });

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const rowsComplete = (rows, columns) =>
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every((row) => columns.every((column) => nonEmpty(row?.[column])));

/* ───────────────────────── token 集合 ───────────────────────── */

const tokens = JSON.parse(readFileSync(path.join(repoRoot, TOKENS_REL), "utf8"));
const tokenKeys = new Set([
    ...Object.keys(tokens.semantic?.light ?? {}),
    ...Object.keys(tokens.semantic?.dark ?? {}),
    ...Object.keys(tokens.primitive ?? {}),
    ...Object.keys(tokens.responsive ?? {}),
]);

/** 与 verify-atoms.mjs 同口径：展开 `--space-2 / 3 / 4` 紧凑写法，跳过 `--color-*` 通配。 */
function extractTokens(text) {
    const out = new Set();
    for (const line of text.split(/\r?\n/)) {
        let rest = line;
        const compact = /(--[a-z][a-z0-9-]*?-)(\d+(?:\.\d+)?)((?:\s*\/\s*\d+(?:\.\d+)?)+)/g;
        let match;
        while ((match = compact.exec(line)) !== null) {
            const [, prefix, first, tail] = match;
            out.add(prefix + first);
            for (const num of tail
                .split("/")
                .map((s) => s.trim())
                .filter(Boolean)) {
                out.add(prefix + num);
            }
            rest = rest.replace(match[0], " ");
        }
        for (const token of rest.match(/(?<![\w-])--[a-z][a-z0-9-]*/g) ?? []) {
            if (token.endsWith("-")) continue;
            out.add(token);
        }
    }
    return out;
}

/* ───────────────────────── 读取文档数据 ───────────────────────── */

const docs = [];
const dataProblems = [];

for (const slug of SLUGS) {
    const file = path.join(DATA_DIR, `${slug}.json`);
    if (!existsSync(file)) {
        dataProblems.push(`缺数据文件：${rel(file)}`);
        continue;
    }
    try {
        const data = JSON.parse(readFileSync(file, "utf8"));
        docs.push({ slug, file, data });
    } catch (error) {
        dataProblems.push(`${rel(file)} 不是合法 JSON：${error.message}`);
    }
}

const extraFiles = existsSync(DATA_DIR)
    ? readdirSync(DATA_DIR).filter(
          (name) => name.endsWith(".json") && !SLUGS.includes(name.replace(/\.json$/, "")),
      )
    : [];
if (extraFiles.length > 0) {
    dataProblems.push(`data/ 下有多余 JSON（未注册到 12 份文档）：${extraFiles.join(", ")}`);
}

add(
    "D1",
    "12 份文档数据都在",
    dataProblems.length === 0,
    `src/pages/design/_docs/data/*.json 找到 ${docs.length}/12`,
    dataProblems,
);

/* ───────────────────────── D2 字段齐全性 ───────────────────────── */

const fieldProblems = [];
const fieldRows = [];

for (const { slug, data } of docs) {
    const before = fieldProblems.length;

    if (data.slug !== slug)
        fieldProblems.push(`${slug}: slug 字段是 "${data.slug}"，应为 "${slug}"`);
    for (const key of ["name", "cn", "spec", "source", "purpose"]) {
        if (!nonEmpty(data[key])) fieldProblems.push(`${slug}: ${key} 为空`);
    }
    if (!["atom", "molecule"].includes(data.layer)) {
        fieldProblems.push(`${slug}: layer 必须是 atom / molecule，实际 "${data.layer}"`);
    }
    if (
        !rowsComplete(
            data.notFor?.map((item) => ({ item })),
            ["item"],
        )
    ) {
        fieldProblems.push(`${slug}: 用途/何时不用 至少 1 条`);
    }
    if (!rowsComplete(data.props, ["name", "type", "default", "values", "notes"])) {
        fieldProblems.push(`${slug}: Props 表为空或缺列（名称/类型/默认/取值/说明）`);
    }
    if (!rowsComplete(data.slots, ["name", "required", "notes"])) {
        fieldProblems.push(`${slug}: Slots 表为空或缺列（名称/必需/说明）`);
    }
    if (!rowsComplete(data.states, ["state", "trigger", "visual", "aria"])) {
        fieldProblems.push(`${slug}: States 表为空或缺列（状态/触发/视觉/ARIA）`);
    }
    const a11y = data.a11y ?? {};
    for (const key of ["semantics", "keyboard", "aria", "focusRing", "target", "reducedMotion"]) {
        if (!nonEmpty(a11y[key])) fieldProblems.push(`${slug}: a11y.${key} 为空`);
    }
    if (!rowsComplete(a11y.contrast, ["pair", "light", "dark", "threshold"])) {
        fieldProblems.push(`${slug}: 对比度表为空或缺列（色对/light/dark/门槛）`);
    }
    const tokenDoc = data.tokens ?? {};
    const hasColor = Array.isArray(tokenDoc.color) && tokenDoc.color.length > 0;
    if (!hasColor && !nonEmpty(tokenDoc.none)) {
        fieldProblems.push(`${slug}: token 颜色白名单为空且没有 tokens.none 说明`);
    }
    if (!Array.isArray(tokenDoc.metric) || tokenDoc.metric.length === 0) {
        fieldProblems.push(`${slug}: token 度量白名单为空`);
    }
    if (data.forbidden && (!Array.isArray(data.forbidden) || data.forbidden.length === 0)) {
        fieldProblems.push(`${slug}: forbidden 存在但是空数组`);
    }

    fieldRows.push(
        [
            slug.padEnd(11),
            `props=${data.props?.length ?? 0}`,
            `slots=${data.slots?.length ?? 0}`,
            `states=${data.states?.length ?? 0}`,
            `contrast=${a11y.contrast?.length ?? 0}`,
            `tokens=${tokenDoc.color?.length ?? 0}+${tokenDoc.metric?.length ?? 0}`,
            before === fieldProblems.length ? "OK" : "FAIL",
        ].join(" "),
    );
}

add(
    "D2",
    "七项字段齐全且非空",
    fieldProblems.length === 0 && docs.length === 12,
    fieldRows.join(" | "),
    fieldProblems,
);

/* ───────────────────────── D3 文档页存在且可交互 ───────────────────────── */

const pageProblems = [];
const pageRows = [];

for (const { slug, data } of docs) {
    const file = path.join(DOCS_DIR, `${slug}.astro`);
    if (!existsSync(file)) {
        pageProblems.push(`缺文档页：${rel(file)}`);
        continue;
    }
    const source = readFileSync(file, "utf8");
    if (!source.includes("<AtomDoc")) pageProblems.push(`${slug}: 没有用 <AtomDoc> 版式`);
    if (!source.includes("<DemoFrame")) pageProblems.push(`${slug}: 没有 <DemoFrame> 示例区`);
    if (!source.includes(`bySlug("${slug}")`)) {
        pageProblems.push(`${slug}: 没有通过 bySlug("${slug}") 读取文档数据`);
    }
    const componentFile = data.source
        .split("/")
        .pop()
        ?.replace(/\.astro$/, "");
    if (componentFile && !new RegExp(`/${componentFile}\\.astro`).test(source)) {
        pageProblems.push(`${slug}: 示例没有引用真实组件 ${data.source}`);
    }
    pageRows.push(`${slug}: ${rel(file)}`);
}

const layoutMissing = LAYOUT_FILES.filter((file) => !existsSync(path.join(repoRoot, file)));
if (layoutMissing.length > 0) pageProblems.push(`缺版式文件：${layoutMissing.join(", ")}`);

add(
    "D3",
    "12 个文档页都在且用真实组件",
    pageProblems.length === 0 && pageRows.length === 12,
    `src/pages/design/atoms/*.astro 找到 ${pageRows.length}/12`,
    pageProblems,
);

/* ───────────────────────── D4–D7 文本层扫描 ───────────────────────── */

const scanTargets = [
    ...docs.map(({ file }) => file),
    ...LAYOUT_FILES.map((file) => path.join(repoRoot, file)),
    ...SLUGS.map((slug) => path.join(DOCS_DIR, `${slug}.astro`)),
].filter((file) => existsSync(file));

const tokenProblems = [];
const colorProblems = [];
const tailwindProblems = [];
const sizeProblems = [];
const tokenHits = new Set();

for (const file of scanTargets) {
    const text = readFileSync(file, "utf8");
    for (const token of extractTokens(text)) {
        tokenHits.add(token);
        if (!tokenKeys.has(token)) tokenProblems.push(`${rel(file)}: tokens.json 里没有 ${token}`);
    }
    text.split(/\r?\n/).forEach((line, i) => {
        if (/#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/.test(line)) {
            colorProblems.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
        }
        if (/tailwind|@apply|@theme/.test(line)) {
            tailwindProblems.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
        }
        for (const literal of line.match(/\d+(?:\.\d+)?(?:px|rem|em)\b/g) ?? []) {
            if (!["1px", "2px"].includes(literal)) {
                sizeProblems.push(`${rel(file)}:${i + 1}: ${literal}`);
            }
        }
    });
}

add(
    "D4",
    "token 名都能在 tokens.json 解析",
    tokenProblems.length === 0,
    `扫描 ${scanTargets.length} 个文件 · 去重 token ${tokenHits.size} 个 · 未解析 ${tokenProblems.length}`,
    tokenProblems,
);
add(
    "D5",
    "没有 hex / rgb() / hsl()",
    colorProblems.length === 0,
    `字面颜色命中 ${colorProblems.length}`,
    colorProblems,
);
add(
    "D6",
    "没有 Tailwind / @apply / @theme",
    tailwindProblems.length === 0,
    `语法命中 ${tailwindProblems.length}`,
    tailwindProblems,
);
add(
    "D7",
    "尺寸字面量只剩 1px / 2px",
    sizeProblems.length === 0,
    `白名单外命中 ${sizeProblems.length}`,
    sizeProblems,
);

/* ───────────────────────── D8 构建产物（可选） ───────────────────────── */

const wantDist = process.argv.includes("--dist") || existsSync(path.join(repoRoot, "dist"));
const distDir = path.join(repoRoot, "dist");

if (wantDist && existsSync(distDir)) {
    const distProblems = [];
    const distRows = [];
    for (const slug of SLUGS) {
        const htmlFile = path.join(distDir, "design/atoms", slug, "index.html");
        if (!existsSync(htmlFile)) {
            distProblems.push(`缺构建产物：${rel(htmlFile)}`);
            continue;
        }
        const html = readFileSync(htmlFile, "utf8");
        const missing = SECTION_IDS.filter((id) => !html.includes(`id="${id}"`));
        if (missing.length > 0) distProblems.push(`${slug}: 缺 section ${missing.join(", ")}`);
        const tables = html.match(/<table\b[\s\S]*?<\/table>/g) ?? [];
        const empty = tables.filter((table) => (table.match(/<tr\b/g) ?? []).length < 2).length;
        if (empty > 0) distProblems.push(`${slug}: 有 ${empty} 个空表`);
        distRows.push(
            `${slug}(sections=${SECTION_IDS.length - missing.length}/7, tables=${tables.length})`,
        );
    }
    add(
        "D8",
        "构建产物：7 个 section + 无空表",
        distProblems.length === 0,
        distRows.join(" "),
        distProblems,
    );
} else {
    add("D8", "构建产物检查", true, "跳过（没有 dist；先 astro build 或传 --dist）", []);
}

/* ───────────────────────── 输出 ───────────────────────── */

let failed = 0;
console.log("\nComponent docs gate (M1-6 · 16-m1-brief §5 #5)\n");
for (const result of results) {
    const mark = result.ok ? "PASS" : "FAIL";
    if (!result.ok) failed += 1;
    console.log(`${mark}  ${result.id}  ${result.title}`);
    console.log(`      ${result.detail}`);
    for (const problem of result.problems.slice(0, 20)) console.log(`      - ${problem}`);
    if (result.problems.length > 20) {
        console.log(`      … 另有 ${result.problems.length - 20} 条`);
    }
}
console.log(`\n${results.length - failed}/${results.length} PASS\n`);

process.exit(failed === 0 ? 0 : 1);
