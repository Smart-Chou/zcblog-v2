#!/usr/bin/env node
/**
 * build-tokens.mjs — tokens.json → tokens.css（零依赖 · Node ESM）
 *
 * 位置：本文件属 tokens 包（packages/tokens/scripts/），
 *       tokens.json / tokens.css 同在包根，包**零运行时依赖**。
 *
 * 用法：
 *   node packages/tokens/scripts/build-tokens.mjs           # 生成 / 更新 tokens.css
 *   node packages/tokens/scripts/build-tokens.mjs --check    # 只校验磁盘上的 tokens.css 是否与 JSON 一致
 *   node packages/tokens/scripts/build-tokens.mjs --help
 *
 * 退出码：0 = 成功 / 一致；1 = 不一致或数据不合法；2 = 用法错误
 *
 * ── 输出顺序（DESIGN.md §3.12.2，固定不变，diff 才可读）────────────────────
 *   :root{palette} → :root{primitive} → :root{semantic.light}
 *   → [data-theme="dark"]{semantic.dark} → @media{responsive}
 *
 * ── designDoc 解析规则（tokens.json.designDoc = "docs/DESIGN.md"）──────────
 *   1. 只接受**仓库内相对路径**；绝对路径或含 `..` 逃逸 → 直接报错。
 *      （不允许把博客作者本机的 blog2.0 工作区路径写进仓库来源文件）
 *   2. 默认以仓库根解析，仓库根 = 包根向上两级（packages/tokens → 仓库根）。
 *      包被装进 `node_modules` 时向上两级是 `node_modules`，此时继续向上找
 *      `pnpm-workspace.yaml`（最多 4 层）作为仓库根；`TOKENS_REPO_ROOT` 可显式指定。
 *   3. 环境变量 `TOKENS_DESIGN_DOC` 可覆盖（相对仓库根，或绝对路径），
 *      供开发机临时指向 blog2.0 工作区的真源 DESIGN.md。
 *   4. 候选路径依次为：env → <repoRoot>/docs/DESIGN.md → <repoRoot>/DESIGN.md；
 *      全都不存在则报错并列出尝试过的路径。
 *   `DESIGN.md` 不进包（179KB 设计文档属仓库 docs/），所以解析必须落到仓库根。
 *   仓库内 `docs/DESIGN.md` 是 blog2.0 真源文档的逐字节同步快照，
 *   来源与校验值记在 `docs/DESIGN.vendor.json`（门禁 G-S6 校验 md5）。
 */

import { createHash } from "node:crypto";
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 包根（packages/tokens/scripts → packages/tokens）：tokens.json / tokens.css 的住所 */
export const packageRoot = path.resolve(HERE, "..");
export const tokensPath = path.join(packageRoot, "tokens.json");
export const cssPath = path.join(packageRoot, "tokens.css");
/** 仓库相对路径，写进生成物头部（不用绝对路径，换机器 diff 不变） */
export const tokensRel = "packages/tokens/tokens.json";
export const cssRel = "packages/tokens/tokens.css";

/**
 * 仓库根。默认 = 包根向上两级（packages/tokens → 仓库根，计划 §3.1 口径）。
 * 包被安装进 node_modules 时（向上两级是 node_modules），继续向上找
 * `pnpm-workspace.yaml` 作为仓库根；`TOKENS_REPO_ROOT` 可显式覆盖。
 * 只用于解析 `docs/DESIGN.md`（不进包）与门禁 G-T4 的站点目录扫描。
 */
function resolveRepoRoot() {
    const env = (process.env.TOKENS_REPO_ROOT ?? "").trim();
    if (env) return path.resolve(env);
    const direct = path.resolve(packageRoot, "../..");
    if (existsSync(path.join(direct, "pnpm-workspace.yaml"))) return direct;
    let dir = direct;
    for (let i = 0; i < 4; i += 1) {
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
        if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    }
    return direct;
}

export const repoRoot = resolveRepoRoot();

/** v1.0 只允许这一个 token 使用 responsive 覆盖（DESIGN.md §3.12.1 约束 5） */
const RESPONSIVE_ALLOWED_TOKENS = new Set(["--layout-header-height"]);

/* ─────────────────────────── 工具 ─────────────────────────── */

export function sha256(buf) {
    return createHash("sha256").update(buf).digest("hex");
}

export function md5(buf) {
    return createHash("md5").update(buf).digest("hex");
}

/** 行数按 `wc -l` 口径（结尾换行不算多一行） */
export function lineCount(text) {
    const s = String(text);
    const breaks = s.split("\n").length;
    return s.endsWith("\n") ? breaks - 1 : breaks;
}

/** palette 的 step：全为数字时按数值升序（0→950），否则保留 JSON 里的书写顺序 */
function orderedSteps(group) {
    const keys = Object.keys(group);
    const allNumeric = keys.every((k) => /^\d+$/.test(k));
    return allNumeric ? [...keys].sort((a, b) => Number(a) - Number(b)) : keys;
}

/* ─────────────────────────── 载入 / 校验 ─────────────────────────── */

export function loadTokens(file = tokensPath) {
    const raw = readFileSync(file);
    return { tokens: JSON.parse(raw.toString("utf8")), raw };
}

const PALETTE_VAR = /^var\(--palette-[a-z0-9-]+\)$/;
const COLOR_MIX =
    /^color-mix\(\s*in oklab,\s*var\(--palette-[a-z0-9-]+\)\s+\d+(?:\.\d+)?%,\s*var\(--palette-[a-z0-9-]+\)\s*\)$/;
const LITERAL_COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\([^()]*\)|hsla?\([^()]*\))$/i;

/**
 * responsive 段解析（渲染与门禁共用）
 * 返回 { groups: [{ bp, px, bpToken, decls: [[token, value]] }], problems }
 * 只有 `max-<bp>` 会输出成 @media；`base` 必须与 primitive 同值，不重复输出。
 */
export function parseResponsive(tokens) {
    const problems = [];
    const buckets = new Map(); // px -> bucket
    const primitive = tokens.primitive ?? {};
    const responsive = tokens.responsive ?? {};

    for (const [tokenName, entry] of Object.entries(responsive)) {
        if (!RESPONSIVE_ALLOWED_TOKENS.has(tokenName)) {
            problems.push(
                `${tokenName}: v1.0 responsive 只允许 --layout-header-height（§3.12.1 约束 5）`,
            );
            continue;
        }
        if (!(tokenName in primitive)) {
            problems.push(`${tokenName}: primitive 里没有该键，无处可覆盖`);
            continue;
        }
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            problems.push(`${tokenName}: 值必须是 { base?, max-<bp>: value } 对象`);
            continue;
        }
        for (const [key, value] of Object.entries(entry)) {
            if (key === "base") {
                if (value !== primitive[tokenName]) {
                    problems.push(
                        `${tokenName}.base = ${value}，但 primitive = ${primitive[tokenName]}（base 必须与 primitive 同值）`,
                    );
                }
                continue;
            }
            const m = /^max-([a-z0-9]+)$/.exec(key);
            if (!m) {
                problems.push(`${tokenName}.${key}: 只允许 base 或 max-<bp>`);
                continue;
            }
            const bpToken = `--bp-${m[1]}`;
            const pxRaw = primitive[bpToken];
            if (pxRaw === undefined) {
                problems.push(`${tokenName}.${key}: primitive 里没有 ${bpToken}`);
                continue;
            }
            const px = Number.parseInt(String(pxRaw), 10);
            if (!Number.isFinite(px) || px <= 0) {
                problems.push(`${tokenName}.${key}: ${bpToken} = ${pxRaw} 不是可用的 px 数值`);
                continue;
            }
            if (typeof value !== "string" || value.trim() === "") {
                problems.push(`${tokenName}.${key}: 值为空`);
                continue;
            }
            if (!buckets.has(px)) buckets.set(px, { px, bpName: m[1], bpToken, decls: [] });
            buckets.get(px).decls.push([tokenName, value.trim()]);
        }
    }

    // 宽断点先、窄断点后：窄屏覆盖宽屏（上限语义，与 §3.10 一致）
    const groups = [...buckets.values()].sort((a, b) => b.px - a.px);
    return { groups, problems };
}

/**
 * 结构 / schema 校验（DESIGN.md §3.12.1 六条约束 + §3.4 值语法）
 * 返回 [{ id, title, ok, detail, problems }]
 */
export function structureChecks(tokens) {
    const results = [];
    const light = tokens.semantic?.light ?? {};
    const dark = tokens.semantic?.dark ?? {};
    const palette = tokens.palette ?? {};
    const primitive = tokens.primitive ?? {};

    // G-T2 深浅键对齐
    {
        const lk = new Set(Object.keys(light));
        const dk = new Set(Object.keys(dark));
        const missingInDark = [...lk].filter((k) => !dk.has(k));
        const extraInDark = [...dk].filter((k) => !lk.has(k));
        results.push({
            id: "G-T2",
            title: "深浅键对齐",
            ok: missingInDark.length === 0 && extraInDark.length === 0,
            detail: `light ${lk.size} / dark ${dk.size}`,
            problems: [
                ...missingInDark.map((k) => `dark 缺 ${k}`),
                ...extraInDark.map((k) => `dark 多 ${k}`),
            ],
        });
    }

    // G-S1 palette 值域：全是 hex（约束 2）
    {
        const problems = [];
        let count = 0;
        for (const [hue, group] of Object.entries(palette)) {
            for (const [step, value] of Object.entries(group)) {
                count += 1;
                if (!/^#[0-9a-fA-F]{6}$/.test(String(value))) {
                    problems.push(`--palette-${hue}-${step} = ${value}（palette 只允许 6 位 hex）`);
                }
            }
        }
        results.push({
            id: "G-S1",
            title: "palette 值域",
            ok: problems.length === 0,
            detail: `${count} 键 · 全 hex`,
            problems,
        });
    }

    // G-S2 primitive 键名自带 --（约束 3）
    {
        const bad = Object.keys(primitive).filter((k) => !k.startsWith("--"));
        results.push({
            id: "G-S2",
            title: "primitive 键名",
            ok: bad.length === 0,
            detail: `${Object.keys(primitive).length} 键 · 均以 -- 开头`,
            problems: bad.map((k) => `${k}: primitive 键必须已带 --`),
        });
    }

    // G-S3 semantic 值语法（约束 4）+ palette 引用完整性
    {
        const paletteNames = new Set();
        for (const [hue, group] of Object.entries(palette)) {
            for (const step of Object.keys(group)) paletteNames.add(`--palette-${hue}-${step}`);
        }
        const problems = [];
        let count = 0;
        for (const [theme, group] of [
            ["light", light],
            ["dark", dark],
        ]) {
            for (const [key, value] of Object.entries(group)) {
                count += 1;
                const v = String(value).trim();
                if (v.includes("--color-")) {
                    problems.push(`${theme}.${key}: 引用了另一个语义键（禁止语义互相引用）`);
                    continue;
                }
                if (!(PALETTE_VAR.test(v) || COLOR_MIX.test(v) || LITERAL_COLOR.test(v))) {
                    problems.push(`${theme}.${key}: 值不符合允许形式 ${v}`);
                    continue;
                }
                for (const ref of v.matchAll(/var\((--palette-[a-z0-9-]+)\)/g)) {
                    if (!paletteNames.has(ref[1]))
                        problems.push(`${theme}.${key}: 引用了不存在的 ${ref[1]}`);
                }
            }
        }
        results.push({
            id: "G-S3",
            title: "semantic 值语法",
            ok: problems.length === 0,
            detail: `${count} 键 · 只引用 palette`,
            problems,
        });
    }

    // G-S4 responsive 键合法（约束 5）
    {
        const { problems, groups } = parseResponsive(tokens);
        results.push({
            id: "G-S4",
            title: "responsive 键",
            ok: problems.length === 0,
            detail: `${groups.length} 个断点块 · ${Object.keys(tokens.responsive ?? {}).length} token`,
            problems,
        });
    }

    return results;
}

/* ─────────────────────────── 渲染 ─────────────────────────── */

function declList(pairs, indent) {
    return pairs.map(([k, v]) => `${indent}${k}: ${v};`);
}

export function renderCss(tokens, { sourceSha = "", sourceRel = tokensRel } = {}) {
    const { groups, problems } = parseResponsive(tokens);
    if (problems.length > 0) throw new Error(`responsive 不合法：\n  - ${problems.join("\n  - ")}`);

    const out = [];
    out.push("/* ==========================================================================");
    out.push("   tokens.css — GENERATED FILE, DO NOT EDIT BY HAND");
    out.push(`   source : ${sourceRel}`);
    out.push(`   version: ${tokens.version ?? "n/a"}`);
    out.push(`   sha256 : ${sourceSha}`);
    out.push("   build  : node packages/tokens/scripts/build-tokens.mjs");
    out.push("   order  : :root{palette} → :root{primitive} → :root{semantic.light}");
    out.push('            → [data-theme="dark"]{semantic.dark} → @media{responsive}');
    out.push("   ========================================================================== */");
    out.push("");

    // 1. palette
    out.push("/* ---------- L0 · palette（只允许 tokens.css 自身引用 --palette-*） ---------- */");
    out.push(":root {");
    for (const [hue, group] of Object.entries(tokens.palette ?? {})) {
        out.push(`  /* ${hue} */`);
        for (const step of orderedSteps(group)) {
            out.push(...declList([[`--palette-${hue}-${step}`, group[step]]], "  "));
        }
    }
    out.push("}");
    out.push("");

    // 2. primitive
    out.push("/* ---------- L2 · primitive（度量 / 字族，键名即 CSS 变量名） ---------- */");
    out.push(":root {");
    for (const [key, value] of Object.entries(tokens.primitive ?? {})) {
        out.push(...declList([[key, value]], "  "));
    }
    out.push("}");
    out.push("");

    // 3. semantic.light
    out.push("/* ---------- L1 · semantic · light（组件唯一的颜色来源） ---------- */");
    out.push(":root {");
    out.push(...declList(Object.entries(tokens.semantic?.light ?? {}), "  "));
    out.push("}");
    out.push("");

    // 4. semantic.dark
    out.push("/* ---------- L1 · semantic · dark（键集合与 light 完全相等） ---------- */");
    out.push('[data-theme="dark"] {');
    out.push(...declList(Object.entries(tokens.semantic?.dark ?? {}), "  "));
    out.push("}");
    out.push("");

    // 5. responsive
    if (groups.length > 0) {
        out.push(
            "/* ---------- responsive（§3.10 上限语义：width <= Npx 即 max-width: Npx） ---------- */",
        );
        for (const g of groups) {
            out.push(`/* ${g.bpToken} = ${g.px}px（含等号，与 --bp-* 的「到 N 为止」一致） */`);
            out.push(`@media (width <= ${g.px}px) {`);
            out.push("  :root {");
            out.push(...declList(g.decls, "    "));
            out.push("  }");
            out.push("}");
            out.push("");
        }
    }

    // 恰好一个结尾换行
    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    return `${out.join("\n")}\n`;
}

/* ─────────────────────────── 生成物自检 ─────────────────────────── */

function expectedDeclarations(tokens) {
    const expected = new Map();
    const bump = (name) => expected.set(name, (expected.get(name) ?? 0) + 1);
    for (const [hue, group] of Object.entries(tokens.palette ?? {})) {
        for (const step of orderedSteps(group)) bump(`--palette-${hue}-${step}`);
    }
    for (const key of Object.keys(tokens.primitive ?? {})) bump(key);
    for (const key of Object.keys(tokens.semantic?.light ?? {})) bump(key);
    for (const key of Object.keys(tokens.semantic?.dark ?? {})) bump(key);
    for (const g of parseResponsive(tokens).groups) for (const [key] of g.decls) bump(key);
    return expected;
}

/** 声明守恒：生成物里的每个 --x: 出现次数必须与 JSON 期望完全相等（不多不少） */
export function declarationCheck(tokens, css) {
    const actual = new Map();
    for (const m of css.matchAll(/^[ \t]+(--[a-z0-9-]+)\s*:/gm)) {
        actual.set(m[1], (actual.get(m[1]) ?? 0) + 1);
    }
    const expected = expectedDeclarations(tokens);
    const problems = [];
    for (const [name, want] of expected) {
        const got = actual.get(name) ?? 0;
        if (got !== want) problems.push(`${name}: 期望 ${want} 次，实际 ${got} 次`);
    }
    for (const [name, got] of actual) {
        if (!expected.has(name)) problems.push(`${name}: 生成物多出 ${got} 次`);
    }
    const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
    return { ok: problems.length === 0, total: sum(actual), expected: sum(expected), problems };
}

/* ─────────────────────────── designDoc 解析 ─────────────────────────── */

export function designDocCandidates(tokens, root = repoRoot) {
    const raw = typeof tokens.designDoc === "string" ? tokens.designDoc.trim() : "";
    if (!raw) return { error: "tokens.json.designDoc 缺失或不是字符串", candidates: [] };
    if (path.isAbsolute(raw)) {
        return {
            error: `designDoc 不允许绝对路径：${raw}（仓库内文件不能用本机绝对路径）`,
            candidates: [],
        };
    }
    if (raw.split(/[\\/]/).includes("..")) {
        return { error: `designDoc 不允许 .. 逃逸仓库：${raw}`, candidates: [] };
    }
    const candidates = [];
    const env = (process.env.TOKENS_DESIGN_DOC ?? "").trim();
    if (env) candidates.push(path.isAbsolute(env) ? env : path.resolve(root, env));
    candidates.push(path.resolve(root, raw));
    candidates.push(path.resolve(root, "DESIGN.md"));
    return { candidates };
}

/** 返回 { ok, path?, candidates, error? }，找不到文件时不抛异常，交由调用方决定怎么报 */
export function resolveDesignDoc(tokens, root = repoRoot) {
    const { candidates, error } = designDocCandidates(tokens, root);
    if (error) return { ok: false, candidates: [], error };
    const hit = candidates.find((p) => existsSync(p) && p.endsWith(".md"));
    if (!hit) {
        return {
            ok: false,
            candidates,
            error: `找不到 tokens.json.designDoc 指向的文件；尝试过：\n  - ${candidates.join("\n  - ")}`,
        };
    }
    return { ok: true, path: hit, candidates };
}

/* ─────────────────────────── 差异定位 ─────────────────────────── */

export function firstDiff(expected, actual) {
    const len = Math.min(expected.length, actual.length);
    let offset = 0;
    while (offset < len && expected[offset] === actual[offset]) offset += 1;
    const atEnd = offset === len && expected.length === actual.length;
    if (atEnd) return null;

    const slice = expected.subarray(0, offset);
    const text = slice.toString("utf8");
    const line = text.split("\n").length;
    // 注意：offset 是**字节**偏移，而字符串下标是 UTF-16 码元；含中文注释时两者不等。
    // 列号必须在同一坐标系里算，否则（3 字节字符）会报出偏移量级的假列号。
    const col = text.length - (text.lastIndexOf("\n") + 1) + 1;

    const expLines = expected.toString("utf8").split("\n");
    const actLines = actual.toString("utf8").split("\n");
    const expLine = expLines[line - 1] ?? "(文件已结束)";
    const actLine = actLines[line - 1] ?? "(文件已结束)";

    let differing = 0;
    const max = Math.max(expLines.length, actLines.length);
    for (let i = 0; i < max; i += 1) if (expLines[i] !== actLines[i]) differing += 1;

    return {
        offset,
        line,
        col,
        expectedLine: expLine,
        actualLine: actLine,
        differing,
        expectedTotal: expLines.length,
    };
}

/* ─────────────────────────── CLI ─────────────────────────── */

const USAGE = `tokens.json → tokens.css

  node packages/tokens/scripts/build-tokens.mjs            生成 / 更新 tokens.css
  node packages/tokens/scripts/build-tokens.mjs --check     校验磁盘 tokens.css 是否与 JSON 逐字节一致
  node packages/tokens/scripts/build-tokens.mjs --help

环境变量：
  TOKENS_DESIGN_DOC   覆盖 designDoc 解析（相对仓库根或绝对路径），默认 docs/DESIGN.md
  TOKENS_REPO_ROOT    覆盖仓库根探测（包被安装进 node_modules 时用）`;

export function build({ check = false, log = console.log } = {}) {
    const { tokens, raw } = loadTokens();
    const sourceSha = sha256(raw);

    const checks = structureChecks(tokens);
    const failed = checks.filter((c) => !c.ok);
    for (const c of checks) {
        const mark = c.ok ? "[OK]  " : "[FAIL]";
        log(`${mark} ${c.id} ${c.title} — ${c.detail}`);
        if (!c.ok) for (const p of c.problems.slice(0, 10)) log(`         ${p}`);
    }
    if (failed.length > 0) {
        log(`[FAIL] 结构校验未通过（${failed.length}/${checks.length}），拒绝生成 tokens.css`);
        return 1;
    }

    const doc = resolveDesignDoc(tokens);
    if (!doc.ok) {
        log(`[FAIL] designDoc — ${doc.error}`);
        return 1;
    }
    log(`[OK]   designDoc — ${path.relative(repoRoot, doc.path)}`);

    const css = renderCss(tokens, { sourceSha });
    const decl = declarationCheck(tokens, css);
    if (!decl.ok) {
        log(`[FAIL] G-S5 声明守恒 — ${decl.total} 条（期望 ${decl.expected}）`);
        for (const p of decl.problems.slice(0, 10)) log(`         ${p}`);
        return 1;
    }
    log(`[OK]   G-S5 声明守恒 — ${decl.total} 条声明`);

    if (!check) {
        const before = existsSync(cssPath) ? readFileSync(cssPath) : null;
        if (before && before.equals(Buffer.from(css, "utf8"))) {
            log(
                `[SKIP] ${cssRel} 已是最新（${before.length} bytes · sha256 ${sha256(before).slice(0, 12)}…）`,
            );
            return 0;
        }
        writeFileSync(cssPath, css);
        const buf = readFileSync(cssPath);
        log(`[WRITE] ${cssRel} — ${buf.length} bytes · sha256 ${sha256(buf).slice(0, 12)}…`);
        if (before) log(`         覆盖前 ${before.length} bytes`);
        return 0;
    }

    // --check：真写临时文件再逐字节比对（走一次磁盘，连编码问题一起验）
    if (!existsSync(cssPath)) {
        log(
            `[FAIL] G-T1 生成物一致 — ${cssRel} 不存在；先运行 node packages/tokens/scripts/build-tokens.mjs`,
        );
        return 1;
    }
    const dir = mkdtempSync(path.join(tmpdir(), "tokens-check-"));
    const tmpFile = path.join(dir, "tokens.css");
    try {
        writeFileSync(tmpFile, css);
        const fresh = readFileSync(tmpFile);
        const onDisk = readFileSync(cssPath);
        if (fresh.equals(onDisk)) {
            log(
                `[OK]   G-T1 生成物一致 — ${cssRel} ${onDisk.length} bytes · sha256 ${sha256(onDisk).slice(0, 12)}…`,
            );
            return 0;
        }
        const d = firstDiff(fresh, onDisk);
        log(`[FAIL] G-T1 生成物一致 — ${cssRel} 与 tokens.json 不一致`);
        log(
            `       首个差异：第 ${d.line} 行 第 ${d.col} 列（字节偏移 ${d.offset}，共 ${d.differing} 行不同）`,
        );
        log(`         生成应为: ${d.expectedLine.trim() || "(空行)"}`);
        log(`         磁盘实际: ${d.actualLine.trim() || "(空行)"}`);
        log(`       修法：node packages/tokens/scripts/build-tokens.mjs`);
        return 1;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

const invokedDirectly = (() => {
    if (process.argv[1] === undefined) return false;
    try {
        // realpath 两侧都解析：macOS 的 /var → /private/var、符号链接目录下运行都能正确判定
        return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
})();

if (invokedDirectly) {
    const args = process.argv.slice(2);
    if (args.includes("--help") || args.includes("-h")) {
        console.log(USAGE);
        process.exit(0);
    }
    const unknown = args.filter((a) => a !== "--check");
    if (unknown.length > 0) {
        console.error(`未知参数：${unknown.join(" ")}\n\n${USAGE}`);
        process.exit(2);
    }
    process.exit(build({ check: args.includes("--check") }));
}
