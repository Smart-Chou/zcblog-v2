#!/usr/bin/env node
/**
 * verify-atoms.mjs — DESIGN.md §5.6 自检门禁（P1–P10）+ 组件落地检查（A1–A8）
 *
 * 用法：
 *   node scripts/gates/verify-atoms.mjs
 *
 * 退出码：0 = 全 PASS；1 = 有 FAIL
 *
 * 文档门禁（DESIGN.md §5.6.13-C 的 P1–P10，全部在仓库内可复跑，不依赖 worker scratch）：
 *   P1  12 个组件小节都在
 *   P2  五个字段各 12 次
 *   P3  本节无字面颜色
 *   P4  本节无 palette 引用
 *   P5  token 名都来自 tokens.json
 *   P6  尺寸字面量只剩白名单（1px / 2px）
 *   P7  状态词是 §5.4 闭集（8 个词）
 *   P8  没有 Tailwind 语法（D-0100）
 *   P9  本节没有 utility 类名
 *   P10 白名单自洽（每组件非禁止段 token − 该组件白名单 = ∅）
 *
 * 组件门禁（M1-3 落地的 12 个组件，同样是 §5.6.0 的硬约束）：
 *   A1  12 个组件文件都在（10 atom + 2 molecule）
 *   A2  组件里 0 字面颜色（N1）
 *   A3  组件里 0 Tailwind 语法（N1/D-0100）
 *   A4  组件引用的 --token 都存在于 tokens.json
 *   A5  组件 0 JS（G8：无 <script>、无 client:* 指令）
 *   A6  交互组件都有统一焦点环（G4：outline 2px + ring-focus）
 *   A7  组件尺寸字面量只在白名单内（G3：0 / 1px / 2px / 百分比 / auto）
 *   A8  组件里没有硬编码自然语言（G1）
 *
 * 与 DESIGN.md 里那几条 shell 单行命令的差异（都是 doc bug，不是放水）：
 *   - P2：整篇 grep 得 13（§5.1 模板也有一组五个字段）；本脚本只数 §5.6.1–§5.6.12 → 12。
 *   - P4：整篇 grep 得 2，两处都是「禁止 palette」的规则原文（G2 行与 P4 自查行）；
 *         本脚本排除这两行，同时把 raw 计数一并打印，便于审计。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const designDocRel = "docs/DESIGN.md";
const tokensRel = "src/styles/tokens/tokens.json";

const ATOM_DIR = "src/components/UI/atom";
const MOLECULE_DIR = "src/components/UI/molecule";

const SPECS = [
    { n: 1, name: "Button", file: `${ATOM_DIR}/Button.astro` },
    { n: 2, name: "Link", file: `${ATOM_DIR}/Link.astro` },
    { n: 3, name: "Tag", file: `${ATOM_DIR}/Tag.astro` },
    { n: 4, name: "Input", file: `${ATOM_DIR}/Input.astro` },
    { n: 5, name: "Card", file: `${ATOM_DIR}/Card.astro` },
    { n: 6, name: "Icon", file: `${ATOM_DIR}/Icon.astro` },
    { n: 7, name: "Avatar", file: `${ATOM_DIR}/Avatar.astro` },
    { n: 8, name: "Divider", file: `${ATOM_DIR}/Divider.astro` },
    { n: 9, name: "Breadcrumb", file: `${MOLECULE_DIR}/Breadcrumb.astro` },
    { n: 10, name: "Pagination", file: `${MOLECULE_DIR}/Pagination.astro` },
    { n: 11, name: "Alert", file: `${ATOM_DIR}/Alert.astro` },
    { n: 12, name: "Skeleton", file: `${ATOM_DIR}/Skeleton.astro` },
];

const FIELDS = ["Props", "Slots", "States", "可访问性", "消费的 token"];
const STATE_WORDS = new Set([
    "default",
    "hover",
    "active",
    "focus-visible",
    "disabled",
    "loading",
    "selected",
    "invalid",
]);
const SIZE_WHITELIST = new Set(["1px", "2px"]);

const results = [];
const add = (r) => results.push(r);
const rel = (p) => path.relative(repoRoot, p);

/* ───────────────────────── 解析 DESIGN.md ───────────────────────── */

const md = readFileSync(path.join(repoRoot, designDocRel), "utf8");
const lines = md.split(/\r?\n/);

function headingIndex(re, from = 0) {
    for (let i = from; i < lines.length; i += 1) if (re.test(lines[i])) return i;
    return -1;
}

const start56 = headingIndex(/^###\s+5\.6\s/);
const end56 = start56 < 0 ? -1 : headingIndex(/^##\s+6\./, start56 + 1);
const section56 = start56 >= 0 ? lines.slice(start56, end56).join("\n") : "";

const startComponents = headingIndex(/^####\s+5\.6\.1\s/, start56);
const endComponents = headingIndex(/^####\s+5\.6\.13\s/, startComponents);
const componentRegion =
    startComponents >= 0 ? lines.slice(startComponents, endComponents).join("\n") : "";

/** 每个组件小节的正文（从自己的 #### 标题到下一个 #### 之前） */
function componentSlice(n) {
    const start = headingIndex(new RegExp(`^####\\s+5\\.6\\.${n}\\s`), start56);
    if (start < 0) return "";
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
        if (/^####\s+5\.6\.\d+\s/.test(lines[i]) || /^##\s+/.test(lines[i])) {
            end = i;
            break;
        }
    }
    return lines.slice(start, end).join("\n");
}

/* ───────────────────────── token 集合 ───────────────────────── */

const tokens = JSON.parse(readFileSync(path.join(repoRoot, tokensRel), "utf8"));
const tokenKeys = new Set([
    ...Object.keys(tokens.semantic?.light ?? {}),
    ...Object.keys(tokens.semantic?.dark ?? {}),
    ...Object.keys(tokens.primitive ?? {}),
    ...Object.keys(tokens.responsive ?? {}),
]);

/**
 * 抽取 token 名。按 §5.6.13 的紧凑写法约定展开 `--space-2 / 3 / 4`，
 * 并把反引号里的 `--color-*` 这类通配（只出现在 G2 规则行）排除在比对之外。
 */
function extractTokens(text) {
    const out = new Set();
    for (const line of text.split(/\r?\n/)) {
        let rest = line;
        const compact = /(--[a-z][a-z0-9-]*?-)(\d+(?:\.\d+)?)((?:\s*\/\s*\d+(?:\.\d+)?)+)/g;
        let m;
        while ((m = compact.exec(line)) !== null) {
            const [, prefix, first, tail] = m;
            out.add(prefix + first);
            for (const num of tail
                .split("/")
                .map((s) => s.trim())
                .filter(Boolean)) {
                out.add(prefix + num);
            }
            rest = rest.replace(m[0], " ");
        }
        for (const token of rest.match(/--[a-z][a-z0-9-]*/g) ?? []) {
            if (token.endsWith("-")) continue; // `--color-*` / `--shadow-*` 这类前缀通配
            out.add(token);
        }
    }
    return out;
}

/* ───────────────────────── P1–P10 ───────────────────────── */

function gateP1() {
    const found = [];
    const problems = [];
    for (const spec of SPECS) {
        const re = new RegExp(`^####\\s+5\\.6\\.${spec.n}\\s+${spec.name}\\s*$`);
        if (!lines.some((line) => re.test(line))) problems.push(`缺 §5.6.${spec.n} ${spec.name}`);
        else found.push(spec.n);
    }
    const count = section56
        .split(/\r?\n/)
        .filter((line) => /^####\s+5\.6\.(1|2|3|4|5|6|7|8|9|10|11|12)\s+/.test(line)).length;
    if (count !== 12) problems.push(`§5.6.1–§5.6.12 共 ${count} 个小节，期望 12`);
    return {
        id: "P1",
        title: "12 个小节都在",
        ok: problems.length === 0,
        detail: `找到 ${found.length}/12 个组件小节（§5.6 下 #### 共 ${count} 个）`,
        problems,
    };
}

function gateP2() {
    const counts = {};
    const problems = [];
    for (const field of FIELDS) {
        const c = componentRegion
            .split(/\r?\n/)
            .filter((line) => line.startsWith(`**${field}`)).length;
        counts[field] = c;
        if (c !== 12) problems.push(`**${field}** 出现 ${c} 次，期望 12`);
    }
    return {
        id: "P2",
        title: "五个字段各 12 次",
        ok: problems.length === 0,
        detail: FIELDS.map((f) => `${f}=${counts[f]}`).join(" · "),
        problems,
    };
}

function gateP3() {
    const hits = [];
    section56.split(/\r?\n/).forEach((line, i) => {
        if (/#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/.test(line)) {
            hits.push(`L${start56 + i + 1}: ${line.trim().slice(0, 100)}`);
        }
    });
    return {
        id: "P3",
        title: "本节无字面颜色",
        ok: hits.length === 0,
        detail: `§5.6 内 hex/rgb()/hsl() 命中 ${hits.length}`,
        problems: hits.slice(0, 10),
    };
}

function gateP4() {
    const raw = (section56.match(/--palette-/g) ?? []).length;
    const hits = [];
    section56.split(/\r?\n/).forEach((line, i) => {
        if (!line.includes("--palette-")) return;
        // 规则原文（G2 行、P4 自查行）是在说「禁止 palette」，不是引用
        if (/违规|本节无 palette 引用/.test(line)) return;
        hits.push(`L${start56 + i + 1}: ${line.trim().slice(0, 100)}`);
    });
    return {
        id: "P4",
        title: "本节无 palette 引用",
        ok: hits.length === 0,
        detail: `§5.6 内 --palette- 原始命中 ${raw}（其中 2 行是规则原文）· 实际引用 ${hits.length}`,
        problems: hits.slice(0, 10),
    };
}

function gateP5() {
    const used = extractTokens(componentRegion);
    const missing = [...used].filter((t) => !tokenKeys.has(t)).sort();
    return {
        id: "P5",
        title: "token 名都来自 tokens.json",
        ok: missing.length === 0,
        detail: `§5.6.1–§5.6.12 引用 ${used.size} 个 token · 差集 ${missing.length}`,
        problems: missing.map((t) => `tokens.json 里没有：${t}`),
    };
}

function gateP6() {
    const all = section56.match(/\d+(?:\.\d+)?(?:px|rem|em)\b/g) ?? [];
    const unexpected = [...new Set(all)].filter((v) => !SIZE_WHITELIST.has(v));
    const tally = {};
    for (const v of all) tally[v] = (tally[v] ?? 0) + 1;
    return {
        id: "P6",
        title: "尺寸字面量只剩白名单",
        ok: unexpected.length === 0,
        detail: Object.entries(tally)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([v, c]) => `${v}×${c}`)
            .join(" · "),
        problems: unexpected.map((v) => `白名单外的尺寸字面量：${v}`),
    };
}

function gateP7() {
    const seen = new Set();
    const problems = [];
    for (const spec of SPECS) {
        const body = componentSlice(spec.n);
        const at = body.split(/\r?\n/).findIndex((line) => line.startsWith("**States**"));
        if (at < 0) {
            problems.push(`§5.6.${spec.n} 找不到 **States** 段`);
            continue;
        }
        const rows = [];
        for (let i = at + 1; i < body.split(/\r?\n/).length; i += 1) {
            const line = body.split(/\r?\n/)[i];
            if (line.startsWith("|")) rows.push(line);
            else if (rows.length > 0 && line.trim() !== "") break;
        }
        for (const row of rows) {
            const first = row.split("|")[1]?.replace(/`/g, "").replace(/\s+/g, " ").trim();
            if (!first || /^-+$/.test(first) || first === "状态") continue;
            seen.add(first);
            if (!STATE_WORDS.has(first)) {
                problems.push(`§5.6.${spec.n} 状态词不在 §5.4 闭集：${first}`);
            }
        }
    }
    return {
        id: "P7",
        title: "状态词是 §5.4 闭集",
        ok: problems.length === 0,
        detail: `抽到 ${seen.size} 个状态词：${[...seen].sort().join(" / ")}`,
        problems,
    };
}

function gateP8() {
    const roots = ["src/components", "src/styles"].map((d) => path.join(repoRoot, d));
    const hits = [];
    const walk = (dir) => {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (["node_modules", "dist", ".astro"].includes(entry.name)) continue;
                walk(full);
            } else if (/\.(astro|css|scss|js|mjs|ts|tsx|jsx)$/.test(entry.name)) {
                const text = readFileSync(full, "utf8");
                text.split(/\r?\n/).forEach((line, i) => {
                    // 与 DESIGN.md 的单行命令同口径：大小写敏感，注释里的 "Tailwind" 不算语法
                    if (/tailwind|@apply|@theme/.test(line)) {
                        hits.push(`${rel(full)}:${i + 1}: ${line.trim().slice(0, 100)}`);
                    }
                });
            }
        }
    };
    roots.forEach(walk);
    return {
        id: "P8",
        title: "没有 Tailwind 语法",
        ok: hits.length === 0,
        detail: "扫描 src/components + src/styles（.astro/.css/.js/.ts）",
        problems: hits.slice(0, 10),
    };
}

const UTILITY_RE =
    /^(?:[-a-z0-9]+:)*(?:gap|gap-x|gap-y|px|py|pt|pb|pl|pr|p|mt|mb|ml|mr|mx|my|m|w|h|size|text|bg|border|rounded|font|leading|tracking|flex|grid|items|justify|space-x|space-y|divide|shadow|opacity|z|top|left|right|bottom|inset|overflow)-(?:\[[^\]]+\]|[a-z0-9./-]+)$/;

/** Tailwind 的取值形态：数字 / T 恤码 / 颜色-数字 / 分数。`bg-surface` 是色对简写，不是 utility。 */
const UTILITY_VALUES = [
    /^\d+(\.\d+)?$/,
    /^(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|base|full|screen|min|max|fit|none|auto|px|prose|tight|snug|normal|relaxed|loose)$/,
    /^[a-z]+-\d{2,3}$/,
    /^\d+\/\d+$/,
    /^\[.+\]$/,
];

function isUtilityName(fragment) {
    if (!UTILITY_RE.test(fragment)) return false;
    const value = fragment.slice(fragment.lastIndexOf("-") + 1);
    const full = fragment.replace(/^.*?:/, "");
    const valuePart = full.slice(full.indexOf("-") + 1);
    return UTILITY_VALUES.some((re) => re.test(valuePart) || re.test(value));
}

function gateP9() {
    const hits = [];
    componentRegion.split(/\r?\n/).forEach((line, i) => {
        for (const m of line.matchAll(/`([^`]+)`/g)) {
            const fragment = m[1].trim();
            if (fragment.startsWith("--")) continue;
            if (isUtilityName(fragment)) {
                hits.push(`L${startComponents + i + 1}: ${fragment}`);
            }
        }
    });
    return {
        id: "P9",
        title: "本节没有 utility 类名",
        ok: hits.length === 0,
        detail: `反引号片段里的 utility 名命中 ${hits.length}`,
        problems: hits.slice(0, 10),
    };
}

function gateP10() {
    const problems = [];
    const rows = [];
    for (const spec of SPECS) {
        const body = componentSlice(spec.n);
        const whitelistStart = body
            .split(/\r?\n/)
            .findIndex((line) => line.startsWith("**消费的 token"));
        if (whitelistStart < 0) {
            problems.push(`§5.6.${spec.n} 找不到消费 token 白名单段`);
            continue;
        }
        const bodyLines = body.split(/\r?\n/);
        let whitelistEnd = bodyLines.length;
        for (let i = whitelistStart + 1; i < bodyLines.length; i += 1) {
            if (bodyLines[i].startsWith("**")) {
                whitelistEnd = i;
                break;
            }
        }
        const whitelist = extractTokens(bodyLines.slice(whitelistStart, whitelistEnd).join("\n"));
        const allowed = new Set([...whitelist]);
        const used = new Set();
        // 「禁止（本组件专属）」是一整段编号列表，不是单个标题行
        const banStart = bodyLines.findIndex((line) => line.startsWith("**禁止"));
        const banEnd =
            banStart < 0
                ? -1
                : bodyLines.findIndex((line, i) => i > banStart && line.startsWith("**"));
        bodyLines.forEach((line, i) => {
            if (i >= whitelistStart && i < whitelistEnd) return;
            if (banStart >= 0 && i >= banStart && (banEnd < 0 || i < banEnd)) return;
            if (/不采用|不用|不能用|禁止|不要/.test(line)) return;
            for (const token of extractTokens(line)) used.add(token);
        });
        const extra = [...used].filter((t) => !allowed.has(t));
        rows.push(
            `${spec.name}: 白名单 ${whitelist.size} / 正文 ${used.size} / 超出 ${extra.length}`,
        );
        for (const token of extra)
            problems.push(`§5.6.${spec.n} ${spec.name} 用了白名单外 token：${token}`);
    }
    return {
        id: "P10",
        title: "白名单自洽",
        ok: problems.length === 0,
        detail: rows.join(" · "),
        problems: problems.slice(0, 20),
    };
}

/* ───────────────────────── A1–A8 ───────────────────────── */

function readComponent(file) {
    const abs = path.join(repoRoot, file);
    return existsSync(abs) ? readFileSync(abs, "utf8") : null;
}

function gateA1() {
    const problems = SPECS.filter((s) => !existsSync(path.join(repoRoot, s.file))).map(
        (s) => `缺文件：${s.file}`,
    );
    return {
        id: "A1",
        title: "12 个组件文件都在",
        ok: problems.length === 0,
        detail: `${SPECS.length - problems.length}/12（10 atom + 2 molecule）`,
        problems,
    };
}

function gateA2() {
    const hits = [];
    for (const spec of SPECS) {
        const text = readComponent(spec.file);
        if (text === null) continue;
        text.split(/\r?\n/).forEach((line, i) => {
            if (/^\s*(\*|\/\*|\/\/|<!--)/.test(line)) return; // 注释
            if (/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(line)) {
                hits.push(`${spec.file}:${i + 1}: ${line.trim().slice(0, 100)}`);
            }
        });
    }
    return {
        id: "A2",
        title: "组件里 0 字面颜色",
        ok: hits.length === 0,
        detail: `扫描 12 个组件 · hex/rgb()/hsl() 命中 ${hits.length}`,
        problems: hits.slice(0, 10),
    };
}

function gateA3() {
    const hits = [];
    for (const spec of SPECS) {
        const text = readComponent(spec.file);
        if (text === null) continue;
        text.split(/\r?\n/).forEach((line, i) => {
            if (/tailwind|@apply|@theme/.test(line)) {
                hits.push(`${spec.file}:${i + 1}: ${line.trim().slice(0, 100)}`);
            }
        });
    }
    return {
        id: "A3",
        title: "组件里 0 Tailwind 语法",
        ok: hits.length === 0,
        detail: `扫描 12 个组件 · 命中 ${hits.length}`,
        problems: hits.slice(0, 10),
    };
}

function gateA4() {
    const missing = new Map();
    for (const spec of SPECS) {
        const text = readComponent(spec.file);
        if (text === null) continue;
        // 只认真正的自定义属性用法：var(--x) 与 `--x: value` 声明。
        // BEM 修饰符 `button--loading` 里的 `--loading` 不是 token。
        const refs = new Set();
        for (const m of text.matchAll(/var\(\s*(--[a-z][a-z0-9-]*)/g)) refs.add(m[1]);
        for (const m of text.matchAll(/^\s*(--[a-z][a-z0-9-]*)\s*:/gm)) refs.add(m[1]);
        for (const token of refs) {
            if (!tokenKeys.has(token)) {
                if (!missing.has(token)) missing.set(token, []);
                missing.get(token).push(spec.file);
            }
        }
    }
    return {
        id: "A4",
        title: "组件引用的 token 都存在",
        ok: missing.size === 0,
        detail: `tokens.json 共 ${tokenKeys.size} 个键`,
        problems: [...missing].map(([t, files]) => `${t}（${files.join(", ")}）`),
    };
}

function gateA5() {
    const hits = [];
    for (const spec of SPECS) {
        const text = readComponent(spec.file);
        if (text === null) continue;
        text.split(/\r?\n/).forEach((line, i) => {
            if (/<script\b|client:(load|idle|visible|only|media)/.test(line)) {
                hits.push(`${spec.file}:${i + 1}: ${line.trim().slice(0, 100)}`);
            }
        });
    }
    return {
        id: "A5",
        title: "组件 0 JS",
        ok: hits.length === 0,
        detail: `扫描 12 个组件 · <script>/client:* 命中 ${hits.length}`,
        problems: hits.slice(0, 10),
    };
}

// Alert 没有自己的交互元素（dismiss 用嵌套 Button，焦点环由 Button 承担），不在本检查内。
const FOCUS_COMPONENTS = ["Button", "Link", "Tag", "Input", "Pagination"];

function gateA6() {
    const problems = [];
    const rows = [];
    for (const name of FOCUS_COMPONENTS) {
        const spec = SPECS.find((s) => s.name === name);
        const text = readComponent(spec.file);
        if (text === null) {
            problems.push(`缺文件：${spec.file}`);
            continue;
        }
        const style = text.slice(text.indexOf("<style>"));
        // Input 的环画在 .field__control 上（:focus-within），覆盖边框 + 前置图标，属等价替代
        const hasFocus = /:focus-visible|:focus-within/.test(style);
        const hasRing = /outline:\s*2px\s+solid\s+var\(--color-ring-focus\)/.test(style);
        rows.push(`${name}${hasFocus && hasRing ? "✓" : "✗"}`);
        if (!hasFocus) problems.push(`${name} 没有 :focus-visible / :focus-within 规则`);
        else if (!hasRing)
            problems.push(`${name} 的焦点环不是 outline 2px solid var(--color-ring-focus)`);
    }
    return {
        id: "A6",
        title: "交互组件统一焦点环",
        ok: problems.length === 0,
        detail: rows.join(" "),
        problems,
    };
}

function gateA7() {
    const whitelist = /^(?:0|1px|2px)$/;
    const hits = [];
    for (const spec of SPECS) {
        const text = readComponent(spec.file);
        if (text === null) continue;
        text.split(/\r?\n/).forEach((line, i) => {
            if (/^\s*(\*|\/\/)/.test(line)) return; // 注释
            for (const m of line.matchAll(/\b(\d+(?:\.\d+)?(?:px|rem|em))\b/g)) {
                if (!whitelist.test(m[1])) hits.push(`${spec.file}:${i + 1}: ${m[1]}`);
            }
        });
    }
    return {
        id: "A7",
        title: "组件尺寸字面量只在白名单内",
        ok: hits.length === 0,
        detail: `白名单 0 / 1px / 2px · 命中 ${hits.length}`,
        problems: hits.slice(0, 10),
    };
}

function gateA8() {
    const hits = [];
    for (const spec of SPECS) {
        const text = readComponent(spec.file);
        if (text === null) continue;
        text.split(/\r?\n/).forEach((line, i) => {
            if (/"[\u4e00-\u9fa5]|>[\u4e00-\u9fa5]/.test(line)) {
                hits.push(`${spec.file}:${i + 1}: ${line.trim().slice(0, 100)}`);
            }
        });
    }
    return {
        id: "A8",
        title: "组件里没有硬编码自然语言",
        ok: hits.length === 0,
        detail: `扫描 12 个组件 · 中文字面量命中 ${hits.length}`,
        problems: hits.slice(0, 10),
    };
}

/* ───────────────────────── 主流程 ───────────────────────── */

function main() {
    if (start56 < 0 || end56 < 0) {
        console.log(`FAIL  找不到 DESIGN.md §5.6 / §6 边界（${designDocRel}）`);
        return 1;
    }

    add(gateP1());
    add(gateP2());
    add(gateP3());
    add(gateP4());
    add(gateP5());
    add(gateP6());
    add(gateP7());
    add(gateP8());
    add(gateP9());
    add(gateP10());
    add(gateA1());
    add(gateA2());
    add(gateA3());
    add(gateA4());
    add(gateA5());
    add(gateA6());
    add(gateA7());
    add(gateA8());

    console.log("zcblog-v2 · atom gates（DESIGN.md §5.6.13 P1–P10 + 组件落地 A1–A8）");
    console.log(`  repo        ${repoRoot}`);
    console.log(`  designDoc   ${designDocRel} · §5.6 L${start56 + 1}–L${end56}`);
    console.log(`  tokens.json ${tokensRel} · ${tokenKeys.size} 个键`);
    console.log("");

    for (const r of results) {
        console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(4)} ${r.title}  —  ${r.detail}`);
        if (!r.ok) for (const p of r.problems.slice(0, 12)) console.log(`          · ${p}`);
    }

    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    console.log("");
    console.log(`  结果：${passed}/${results.length} PASS · ${failed} FAIL`);
    return failed === 0 ? 0 : 1;
}

process.exit(main());
