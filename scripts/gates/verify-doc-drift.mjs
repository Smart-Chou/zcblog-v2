#!/usr/bin/env node
/**
 * verify-doc-drift.mjs — R-40：DESIGN.md §5.6 ↔ 组件文档数据的漂移门禁
 *
 * 判定 `blog2.0/docs/19-m2-plan.md` §7.2 / §3 M2-1：
 * 改 DESIGN.md §5.6（props / states / 对比度）而未同步 `_docs/data/*.json` 即红；
 * 本卡只校验**可机器判定的部分**：对比度数字与 token 名，不校验文案语义（语义靠 M2-10 评审）。
 *
 * 判据
 *   D1 spec 可解析：每份 JSON 的 `spec` 指向 DESIGN.md 的 §5.6.N，且小节标题与 `name` 一致
 *   D2 source 一致：`data.source` 文件存在，且目录层（atom / molecule）与 `layer` 一致
 *   D3 对比度数字：每条 light / dark 的数字必须在 §5.6.13-B 表的实测列里（含「≥」的门槛值走门槛列）；
 *      「—」/「不适用」是显式豁免；标注决策号（D-XXXX）的收敛值不在 §5.6.13-B 记账，单列豁免
 *   D4 token 名：JSON 的 token 白名单必须能在对应 §5.6 小节里找到（支持 `--space-1 / 3 / 4`
 *      紧凑写法与 `--color-status-{info|success}-{bg|fg}` 花括号展开）；已知缺口冻结在 FROZEN_TOKEN_GAPS，
 *      新增缺口即红，缺口消解后打印「可收紧」
 *
 * 用法
 *   node scripts/gates/verify-doc-drift.mjs
 *   node scripts/gates/verify-doc-drift.mjs --root <dir>   # 对临时副本跑（负向测试用）
 *
 * 退出码：0 = 全 PASS；1 = 有 FAIL
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
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
const rel = (p) => path.relative(repoRoot, p);

const DESIGN_REL = "docs/DESIGN.md";
const DATA_DIR_REL = "src/pages/design/_docs/data";

/**
 * 2026-11-04 实测的 token 名缺口（JSON 写了、DESIGN.md 小节没逐字写）。
 * 这些是 M2-10 重写 23 份文档时顺手补 DESIGN.md 的活；本卡边界不允许改 DESIGN.md。
 * 只减不增：新增一条即 FAIL；消解后从本表删掉（脚本会提示）。
 */
const FROZEN_TOKEN_GAPS = {
    "breadcrumb.json": ["--ease-standard"],
    "button.json": ["--space-11"],
    "card.json": ["--leading-snug", "--ease-standard"],
    "input.json": ["--font-weight-regular", "--ease-standard"],
    "link.json": ["--space-1", "--space-2"],
    "pagination.json": ["--ease-standard"],
    "skeleton.json": ["--font-sans"],
    "tag.json": ["--color-fg-muted", "--font-sans", "--ease-standard"],
};

/** 标注决策号的对比度行（数值来自 decision-log，不在 §5.6.13-B 表）。冻结 1 条。 */
const FROZEN_DECISION_ROWS = 1;

/**
 * 只在 §5.6 正文、没进 §5.6.13-B 表的实测值（2026-11-04 实测 6 个）。
 * 表是「规格实际引用到的行」，正文补测的行暂时只在正文记账；M2-10 重写文档时补齐表。
 * 只减不增：新增一个「表里没有、正文才有」的值即 FAIL。
 */
const FROZEN_SECTION_ONLY = 4;

/* ───────────────────────── 工具 ───────────────────────── */

const problems = [];
const rows = [];
const addCheck = (id, title, ok, detail, detailProblems = []) => {
    rows.push({ id, title, ok, detail, problems: detailProblems });
    if (!ok) problems.push(...detailProblems.map((problem) => `${id} ${problem}`));
};

const designPath = path.join(repoRoot, DESIGN_REL);
if (!existsSync(designPath)) {
    console.error(`FATAL 缺 ${DESIGN_REL}（root=${repoRoot}）`);
    process.exit(1);
}
const design = readFileSync(designPath, "utf8");

/* ───────────────────────── 解析 DESIGN.md ───────────────────────── */

const sectionRe = /^#### 5\.6\.(\d+) ([^\n]+)$/gm;
const starts = [];
let match;
while ((match = sectionRe.exec(design)) !== null)
    starts.push({ n: Number(match[1]), name: match[2].trim(), index: match.index });
const sections = new Map();
for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].index : design.length;
    sections.set(starts[i].n, { ...starts[i], text: design.slice(starts[i].index, end) });
}

const tableStart = design.indexOf("**B · 对比度实测");
const tableEnd = design.indexOf("**C · 机器门禁", tableStart);
if (tableStart < 0 || tableEnd < 0) {
    console.error(
        "FATAL DESIGN.md 里找不到 §5.6.13-B 的对比度表（**B · 对比度实测** … **C · 机器门禁**）",
    );
    process.exit(1);
}
const tableText = design.slice(tableStart, tableEnd);
const tableRows = tableText
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|"))
    .filter((line) => !/^\|\s*:?-+/.test(line))
    .map((line) =>
        line
            .split("|")
            .slice(1, -1)
            .map((cell) => cell.trim()),
    )
    .filter((cells) => cells.length >= 5 && cells[0] !== "场景");

const measuredNumbers = new Set();
const thresholdNumbers = new Set();
for (const cells of tableRows) {
    for (const number of `${cells[1]} ${cells[2]}`.match(/\d+\.\d+/g) ?? [])
        measuredNumbers.add(number);
    for (const number of cells[3].match(/\d+(?:\.\d+)*/g) ?? []) thresholdNumbers.add(number);
}

/** 从一段文本里抽 token：花括号展开 + 紧凑数字写法 + 普通写法。 */
function extractTokens(text) {
    const out = new Set();
    for (const brace of text.matchAll(/--[a-z][a-z0-9-]*(?:\{[^{}\n]+\}[a-z0-9-]*)+/g)) {
        let forms = [brace[0]];
        let changed = true;
        while (changed) {
            changed = false;
            const next = [];
            for (const form of forms) {
                const block = form.match(/\{([^{}]+)\}/);
                if (!block) {
                    next.push(form);
                    continue;
                }
                changed = true;
                for (const alternative of block[1].split("|")) {
                    next.push(
                        form.slice(0, block.index) +
                            alternative +
                            form.slice(block.index + block[0].length),
                    );
                }
            }
            forms = next;
        }
        for (const form of forms) out.add(form);
    }
    for (const line of text.split(/\r?\n/)) {
        const compact = /(--[a-z][a-z0-9-]*?-)(\d+(?:\.\d+)?)((?:\s*\/\s*\d+(?:\.\d+)?)+)/g;
        let compactMatch;
        while ((compactMatch = compact.exec(line)) !== null) {
            out.add(compactMatch[1] + compactMatch[2]);
            for (const number of compactMatch[3]
                .split("/")
                .map((value) => value.trim())
                .filter(Boolean)) {
                out.add(compactMatch[1] + number);
            }
        }
        for (const token of line.match(/(?<![\w{-])--[a-z][a-z0-9-]*/g) ?? []) {
            if (!token.endsWith("-")) out.add(token);
        }
    }
    return out;
}

/* ───────────────────────── D1–D4 ───────────────────────── */

const dataDir = path.join(repoRoot, DATA_DIR_REL);
if (!existsSync(dataDir)) {
    console.error(`FATAL 缺 ${DATA_DIR_REL}（root=${repoRoot}）`);
    process.exit(1);
}
const dataFiles = readdirSync(dataDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

const specProblems = [];
const sourceProblems = [];
const numberProblems = [];
const tokenProblems = [];
const decisionRows = [];
const sectionOnly = [];
const visitedGaps = new Set();
const rowsSummary = [];

let mismatch = 0;

for (const file of dataFiles) {
    const data = JSON.parse(readFileSync(path.join(dataDir, file), "utf8"));
    const specMatch = /§5\.6\.(\d+)/.exec(data.spec ?? "");
    const section = specMatch ? sections.get(Number(specMatch[1])) : undefined;

    if (!section) {
        specProblems.push(`${file}: spec "${data.spec}" 解析不到 §5.6.N`);
        mismatch += 1;
        continue;
    }
    if (section.name.toLowerCase() !== String(data.name).toLowerCase()) {
        specProblems.push(
            `${file}: spec 指向 §5.6.${section.n} ${section.name}，但 name=${data.name}`,
        );
        mismatch += 1;
    }
    const sourcePath = path.join(repoRoot, data.source ?? "");
    if (!data.source || !existsSync(sourcePath)) {
        sourceProblems.push(`${file}: source 文件不存在 ${data.source}`);
        mismatch += 1;
    } else {
        const expectedLayer = data.source.includes("/atom/")
            ? "atom"
            : data.source.includes("/molecule/")
              ? "molecule"
              : null;
        if (expectedLayer && data.layer !== expectedLayer) {
            sourceProblems.push(
                `${file}: layer=${data.layer}，但 source 在 /${expectedLayer}/ 目录`,
            );
            mismatch += 1;
        }
    }

    const sectionTokens = extractTokens(section.text);
    const sectionNumbers = new Set(section.text.match(/\d+\.\d+/g) ?? []);

    let contrastRows = 0;
    for (const row of data.a11y?.contrast ?? []) {
        contrastRows += 1;
        if (/\bD-\d{4}\b/.test(row.threshold ?? "")) {
            decisionRows.push(`${file}: [${row.pair}]（${row.threshold}）`);
            continue;
        }
        for (const key of ["light", "dark"]) {
            const raw = String(row[key] ?? "");
            if (raw.trim().length === 0) {
                numberProblems.push(`${file}: [${row.pair}] ${key} 为空`);
                continue;
            }
            if (/[—–]|不适用|未单独测量/.test(raw) && !/\d/.test(raw)) continue;
            const numbers = raw.match(/\d+\.\d+/g) ?? [];
            const isThreshold = /[≥≤<>]/.test(raw);
            for (const number of numbers) {
                const inTable = isThreshold
                    ? thresholdNumbers.has(number)
                    : measuredNumbers.has(number);
                if (inTable) continue;
                if (sectionNumbers.has(number)) {
                    sectionOnly.push(
                        `${file}: [${row.pair}] ${key}="${raw}" → ${number}（只在 §5.6.${section.n} 正文）`,
                    );
                    continue;
                }
                numberProblems.push(
                    `${file}: [${row.pair}] ${key}="${raw}" → ${number} 不在 §5.6.13-B ${isThreshold ? "门槛" : "实测"}列，也不在 §5.6.${section.n} 正文`,
                );
            }
        }
    }

    const declared = [
        ...(data.tokens?.color ?? []),
        ...(data.tokens?.metric ?? []),
        ...(data.tokens?.other ?? []),
    ];
    const gaps = declared.filter((token) => !sectionTokens.has(token));
    const frozen = new Set(FROZEN_TOKEN_GAPS[file] ?? []);
    for (const token of gaps) {
        visitedGaps.add(`${file}:${token}`);
        if (!frozen.has(token))
            tokenProblems.push(
                `${file}: ${token} 不在 §5.6.${section.n} 的 token 白名单里（新漂移）`,
            );
    }
    for (const token of frozen) {
        if (!gaps.includes(token))
            tokenProblems.push(
                `${file}: 冻结缺口 ${token} 已消解 —— 从 FROZEN_TOKEN_GAPS 删掉（基线只减不增）`,
            );
    }

    rowsSummary.push(
        `${file.replace(/\.json$/, "").padEnd(11)} §5.6.${String(section.n).padStart(2, "0")} contrast=${String(contrastRows).padStart(2)} tokens=${String(declared.length).padStart(2)} gaps=${gaps.length}`,
    );
}

mismatch += numberProblems.length + tokenProblems.length + specProblems.length;

addCheck(
    "D1",
    "spec ↔ §5.6.N 小节一一对应",
    specProblems.length === 0,
    `${dataFiles.length} 份文档 · §5.6 小节 ${sections.size} 个`,
    specProblems,
);
addCheck(
    "D2",
    "source 文件存在且层与目录一致",
    sourceProblems.length === 0,
    `${dataFiles.length} 份文档`,
    sourceProblems,
);
const sectionOnlyProblems =
    sectionOnly.length > FROZEN_SECTION_ONLY
        ? sectionOnly.map((row) => `新增「只在正文」的值：${row}`)
        : [];
addCheck(
    "D3",
    "对比度数字全部能在 §5.6.13-B / §5.6 正文找到",
    numberProblems.length === 0 && sectionOnlyProblems.length === 0,
    `实测列 ${measuredNumbers.size} 个值 · 门槛列 ${thresholdNumbers.size} 个值 · 只在正文 ${sectionOnly.length}/${FROZEN_SECTION_ONLY} · 决策号豁免 ${decisionRows.length} 行`,
    [...numberProblems, ...sectionOnlyProblems],
);
addCheck(
    "D4",
    "token 名不漂移（冻结缺口只减不增）",
    tokenProblems.length === 0,
    `冻结缺口 ${Object.values(FROZEN_TOKEN_GAPS).flat().length} 条 · 命中 ${visitedGaps.size} 条`,
    tokenProblems,
);
if (decisionRows.length > FROZEN_DECISION_ROWS) {
    addCheck(
        "D5",
        "决策号豁免行数不增长",
        false,
        `${decisionRows.length} 行 > 冻结 ${FROZEN_DECISION_ROWS}`,
        decisionRows.map((row) => `新增决策号行：${row}`),
    );
}

/* ───────────────────────── 输出 ───────────────────────── */

console.log("R-40 文档漂移门禁（DESIGN.md §5.6 ↔ _docs/data/*.json）");
console.log(`root: ${repoRoot}`);
console.log(
    `§5.6.13-B 表 ${tableRows.length} 行 · 实测值 ${measuredNumbers.size} 个 · 门槛值 ${thresholdNumbers.size} 个`,
);
console.log("");
for (const line of rowsSummary) console.log(`  ${line}`);
console.log("");
const pad = (text, width) => {
    const visual = [...text].reduce((sum, char) => sum + (/[\u4e00-\u9fff]/.test(char) ? 2 : 1), 0);
    return text + " ".repeat(Math.max(0, width - visual));
};
for (const row of rows) {
    console.log(
        `${row.id.padEnd(4)} ${pad(row.title, 46)} ${row.ok ? "PASS" : "FAIL"}  ${row.detail}`,
    );
    for (const problem of row.problems) console.log(`     - ${problem}`);
}
if (sectionOnly.length) {
    console.log("");
    console.log("只在 §5.6 正文、未进 §5.6.13-B 表的实测值（M2-10 补齐）：");
    for (const row of sectionOnly) console.log(`  · ${row}`);
}
if (decisionRows.length) {
    console.log("");
    console.log("决策号豁免（数值来自 decision-log，不在 §5.6.13-B）：");
    for (const row of decisionRows) console.log(`  · ${row}`);
}

const failed = rows.filter((row) => !row.ok);
console.log("");
if (failed.length) {
    console.log(`RESULT FAIL  mismatch=${mismatch}`);
    process.exit(1);
}
console.log(
    `RESULT PASS  mismatch=0  文档=${dataFiles.length} 对比度行=${rowsSummary.reduce((sum, line) => sum + Number(/contrast=\s*(\d+)/.exec(line)?.[1] ?? 0), 0)}`,
);
