#!/usr/bin/env node
/**
 * check-tokens.mjs — token 契约门禁（DESIGN.md §3.12.3 四道机器门禁 + schema 自检）
 *
 * 用法：
 *   node scripts/gates/check-tokens.mjs            跑全部 10 道门禁
 *   node scripts/gates/check-tokens.mjs --check    只跑 G-T1：tokens.css 与 tokens.json 逐字节一致
 *
 * 退出码：0 = 全 PASS；1 = 有 FAIL
 *
 * 门禁清单
 *   G-T1  生成物一致    node build-tokens.mjs --check 逐字节比对 tokens.css
 *   G-T2  深浅键对齐    semantic.light / dark 键集合相等
 *   G-T3  表—码一致     DESIGN.md §3.4 的 52 个 --color-* 行 = tokens.json semantic 键集合
 *   G-T4  无 palette 泄漏 src/components、src/pages、src/styles/*.css 里 --palette- 出现 0 次
 *   G-S1  palette 值域  全 6 位 hex（§3.12.1 约束 2）
 *   G-S2  primitive 键名 均以 -- 开头（约束 3）
 *   G-S3  semantic 值语法 只引用 palette，且引用都真实存在（约束 4）
 *   G-S4  responsive 键  base / max-<bp>，且只有 --layout-header-height（约束 5）
 *   G-S5  声明守恒      生成物里每条 --x: 的出现次数与 JSON 期望完全相等
 *   G-S6  designDoc 指针 仓库内相对路径、可解析、快照 md5 与 docs/DESIGN.vendor.json 一致
 *
 * 本脚本不依赖仓库外任何路径（CI 只 checkout 代码仓即可跑）。
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
    cssPath,
    cssRel,
    declarationCheck,
    lineCount,
    loadTokens,
    md5,
    renderCss,
    repoRoot,
    resolveDesignDoc,
    sha256,
    structureChecks,
    tokensRel,
} from "../../packages/tokens/scripts/build-tokens.mjs";

/** token 真源与编译器都在 `@marxchou/zcblog-tokens` 包内（M3-2 起）；门禁留在仓库。 */
const builderRel = "packages/tokens/scripts/build-tokens.mjs";
const vendorManifestRel = "docs/DESIGN.vendor.json";

const results = [];
const warnings = [];
const add = (r) => {
    results.push(r);
};

/* ───────────────────────── G-T1 生成物一致 ───────────────────────── */

function gateGenerateConsistency() {
    if (!existsSync(cssPath)) {
        return {
            id: "G-T1",
            title: "生成物一致",
            ok: false,
            detail: `${cssRel} 不存在`,
            problems: [`先运行 node ${builderRel}`],
        };
    }
    const run = spawnSync(process.execPath, [path.join(repoRoot, builderRel), "--check"], {
        cwd: repoRoot,
        encoding: "utf8",
    });
    const onDisk = readFileSync(cssPath);
    if (run.status === 0) {
        return {
            id: "G-T1",
            title: "生成物一致",
            ok: true,
            detail: `${cssRel} ${onDisk.length} bytes · sha256 ${sha256(onDisk).slice(0, 12)}…`,
            problems: [],
        };
    }
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`
        .trim()
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => l.replace(/^\[FAIL\]\s*/, ""));
    return {
        id: "G-T1",
        title: "生成物一致",
        ok: false,
        detail: `node ${builderRel} --check 退出码 ${run.status}`,
        problems: output.length > 0 ? output : ["build-tokens.mjs --check 失败（无输出）"],
    };
}

/* ───────────────────────── G-T3 表—码一致 ───────────────────────── */

/** 切出 DESIGN.md 的 §3.4 小节（从 `### 3.4` 到下一个 `### x` 之前） */
export function extractSection34(markdown) {
    const lines = markdown.split(/\r?\n/);
    const start = lines.findIndex((line) => /^###\s+3\.4\s/.test(line));
    if (start < 0) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
        if (/^###\s/.test(lines[i])) {
            end = i;
            break;
        }
    }
    return { lines: lines.slice(start, end), start, end };
}

/** §3.4 表格首列的 `--color-*` 键（文档即契约，DESIGN.md §3.12.3 的解析建议） */
export function designDocKeys(markdown) {
    const section = extractSection34(markdown);
    if (!section) return null;
    const keys = [];
    for (const line of section.lines) {
        const m = /^\|\s*`(--color-[a-z0-9-]+)`/.exec(line);
        if (m) keys.push(m[1]);
    }
    return keys;
}

function gateTableCode(tokens, docPath) {
    if (!docPath) {
        return {
            id: "G-T3",
            title: "表—码一致",
            ok: false,
            detail: "DESIGN.md 不可用",
            problems: ["G-S6 未通过：designDoc 解析失败，无法做表—码比对"],
        };
    }
    const md = readFileSync(docPath, "utf8");
    const keys = designDocKeys(md);
    if (keys === null) {
        return {
            id: "G-T3",
            title: "表—码一致",
            ok: false,
            detail: "parsed 0 keys",
            problems: [
                `${path.relative(repoRoot, docPath)} 里找不到 §3.4 小节（标题应为 "### 3.4 …"）`,
            ],
        };
    }
    const docSet = new Set(keys);
    const jsonSet = new Set(Object.keys(tokens.semantic?.light ?? {}));
    const missingInJson = [...docSet].filter((k) => !jsonSet.has(k));
    const missingInDoc = [...jsonSet].filter((k) => !docSet.has(k));
    const dupe = keys.filter((k, i) => keys.indexOf(k) !== i);
    const problems = [
        ...missingInJson.map((k) => `§3.4 有、tokens.json 缺：${k}`),
        ...missingInDoc.map((k) => `tokens.json 有、§3.4 缺：${k}`),
        ...dupe.map((k) => `§3.4 重复行：${k}`),
    ];
    return {
        id: "G-T3",
        title: "表—码一致",
        ok: problems.length === 0,
        detail: `§3.4 ${docSet.size} 键 / semantic ${jsonSet.size} 键 · 差集 ${missingInJson.length + missingInDoc.length}`,
        problems,
        extra: { docKeys: docSet.size, jsonKeys: jsonSet.size },
    };
}

/* ───────────────────────── G-T4 无 palette 泄漏 ───────────────────────── */

const SCANNED_EXT = new Set([
    ".css",
    ".astro",
    ".html",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".md",
    ".mdx",
    ".json",
    ".vue",
    ".svelte",
    ".scss",
    ".sass",
    ".less",
    ".svg",
]);
const SKIPPED_DIRS = new Set(["node_modules", "dist", ".git", ".astro"]);

function walkFiles(dir, out) {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            if (SKIPPED_DIRS.has(entry)) continue;
            // `packages/tokens/` 是 palette 唯一合法住所（生成物 + 真源），整目录跳过
            if (path.resolve(full) === path.resolve(repoRoot, "packages/tokens")) continue;
            walkFiles(full, out);
        } else if (SCANNED_EXT.has(path.extname(entry).toLowerCase())) {
            out.push(full);
        }
    }
    return out;
}

function gateNoPaletteLeak() {
    const files = [];
    walkFiles(path.join(repoRoot, "src/components"), files);
    walkFiles(path.join(repoRoot, "src/pages"), files);
    const stylesDir = path.join(repoRoot, "src/styles");
    if (existsSync(stylesDir)) {
        for (const entry of readdirSync(stylesDir)) {
            const full = path.join(stylesDir, entry);
            if (statSync(full).isFile() && entry.endsWith(".css")) files.push(full);
        }
    }
    // 生成物与 tokens.json 之外，tokens/ 目录是 palette 唯一合法住所（walk 已跳过 tokens/）
    const unique = [...new Set(files)].filter((f) => path.resolve(f) !== path.resolve(cssPath));

    const hits = [];
    for (const file of unique) {
        const text = readFileSync(file, "utf8");
        if (!text.includes("--palette-")) continue;
        text.split(/\r?\n/).forEach((line, i) => {
            if (line.includes("--palette-")) {
                hits.push(
                    `${path.relative(repoRoot, file)}:${i + 1}: ${line.trim().slice(0, 120)}`,
                );
            }
        });
    }
    return {
        id: "G-T4",
        title: "无 palette 泄漏",
        ok: hits.length === 0,
        detail: `扫描 ${unique.length} 文件 · --palette- 命中 ${hits.length}`,
        problems: hits,
    };
}

/* ───────────────────────── G-S6 designDoc 指针 ───────────────────────── */

function gateDesignDoc(tokens) {
    const resolved = resolveDesignDoc(tokens);
    if (!resolved.ok) {
        return {
            id: "G-S6",
            title: "designDoc 指针",
            ok: false,
            detail: "不可解析",
            problems: [resolved.error],
        };
    }
    const problems = [];
    const rel = path.relative(repoRoot, resolved.path);

    const vendorPath = path.join(repoRoot, vendorManifestRel);
    if (existsSync(vendorPath)) {
        const manifest = JSON.parse(readFileSync(vendorPath, "utf8"));
        const buf = readFileSync(resolved.path);
        const actual = md5(buf);
        if (manifest.md5 && manifest.md5 !== actual) {
            problems.push(
                `快照 md5 不符：清单 ${manifest.md5} / 实际 ${actual}（手改过快照，或忘了更新清单）`,
            );
        }
        if (manifest.lines && manifest.lines !== lineCount(buf.toString("utf8"))) {
            problems.push(
                `快照行数不符：清单 ${manifest.lines} / 实际 ${lineCount(buf.toString("utf8"))}`,
            );
        }
        const hint = typeof manifest.sourceHint === "string" ? manifest.sourceHint : "";
        if (hint) {
            const sourceAbs = path.resolve(repoRoot, hint);
            if (existsSync(sourceAbs)) {
                const sourceMd5 = md5(readFileSync(sourceAbs));
                if (sourceMd5 !== actual) {
                    warnings.push(
                        `DESIGN.md 快照已过期：真源 ${hint} 的 md5 为 ${sourceMd5}，仓库快照为 ${actual}。` +
                            ` 键名未变则不影响 G-T3；改过 §3.4 键集合请重同步（见 ${vendorManifestRel}.resyncCommand）。`,
                    );
                }
            }
        }
    } else {
        problems.push(`缺少 ${vendorManifestRel}（快照来源/校验值清单）`);
    }

    const buf = readFileSync(resolved.path);
    return {
        id: "G-S6",
        title: "designDoc 指针",
        ok: problems.length === 0,
        detail: `${rel} · ${lineCount(buf.toString("utf8"))} 行 · md5 ${md5(buf).slice(0, 12)}…`,
        problems,
    };
}

/* ───────────────────────── 主流程 ───────────────────────── */

function main() {
    // `--check`：只跑 G-T1（生成物逐字节一致），供卡验收 / 快速回归用
    if (process.argv.slice(2).includes("--check")) {
        const g = gateGenerateConsistency();
        console.log(`  ${g.ok ? "PASS" : "FAIL"}  ${g.id} ${g.title}  —  ${g.detail}`);
        for (const p of g.problems) console.log(`          · ${p}`);
        console.log("");
        if (!g.ok) {
            console.log("  结果：tokens.css 与 tokens.json 不一致（1 FAIL）");
            return 1;
        }
        console.log(`  结果：tokens.css 与 tokens.json 逐字节一致（${cssRel} · G-T1 PASS）`);
        return 0;
    }

    const { tokens, raw } = loadTokens();
    const sourceSha = sha256(raw);
    const semanticCount = Object.keys(tokens.semantic?.light ?? {}).length;
    const docResolved = resolveDesignDoc(tokens);

    const structure = structureChecks(tokens);
    const byId = new Map(structure.map((c) => [c.id, c]));

    add(gateGenerateConsistency());
    add(byId.get("G-T2"));
    add(gateTableCode(tokens, docResolved.ok ? docResolved.path : null));
    add(gateNoPaletteLeak());
    add(byId.get("G-S1"));
    add(byId.get("G-S2"));
    add(byId.get("G-S3"));
    add(byId.get("G-S4"));

    // G-S5 声明守恒：对内存渲染结果比对（磁盘一致性已由 G-T1 负责）
    const css = renderCss(tokens, { sourceSha });
    const decl = declarationCheck(tokens, css);
    add({
        id: "G-S5",
        title: "声明守恒",
        ok: decl.ok,
        detail: `${decl.total} 条声明（期望 ${decl.expected}）`,
        problems: decl.problems,
    });

    add(gateDesignDoc(tokens));

    const docLine = docResolved.ok
        ? `${path.relative(repoRoot, docResolved.path)} · ${lineCount(readFileSync(docResolved.path, "utf8"))} 行 · md5 ${md5(readFileSync(docResolved.path)).slice(0, 12)}…`
        : "（不可解析，见 G-S6）";
    const cssLine = existsSync(cssPath)
        ? `${cssRel} · ${readFileSync(cssPath).length} bytes · sha256 ${sha256(readFileSync(cssPath)).slice(0, 12)}…`
        : `${cssRel} · 缺失`;

    console.log("zcblog-v2 · token gates");
    console.log(`  repo        ${repoRoot}`);
    console.log(
        `  tokens.json ${tokensRel} · ${lineCount(raw.toString("utf8"))} 行 · sha256 ${sourceSha.slice(0, 12)}… · ${semanticCount} semantic keys`,
    );
    console.log(`  designDoc   ${docLine}`);
    console.log(`  tokens.css  ${cssLine}`);
    console.log("");

    for (const r of results) {
        const mark = r.ok ? "PASS" : "FAIL";
        console.log(`  ${mark}  ${r.id.padEnd(5)} ${r.title}  —  ${r.detail}`);
        if (!r.ok) for (const p of r.problems.slice(0, 12)) console.log(`          · ${p}`);
    }

    if (warnings.length > 0) {
        console.log("");
        for (const w of warnings) console.log(`  WARN  ${w}`);
    }

    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    console.log("");
    console.log(`  结果：${passed}/${results.length} PASS · ${failed} FAIL`);
    if (failed > 0) {
        console.log("  失败即 CI 红（DESIGN.md §3.12.3）。修数据或重生成后重跑本脚本。");
        return 1;
    }
    return 0;
}

process.exit(main());
