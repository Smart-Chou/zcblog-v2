#!/usr/bin/env node
/**
 * theme-sync.mjs — M3-5 主题升级工具（T 覆盖 / O 不动）
 *
 * 依据 `blog2.0/docs/21-m3-plan.md` §4.1（T/O/X 三类路径）+ §6.2（P3 可升级 / P10 客户零）。
 * 分类真值只有一份：`site.manifest.json`，由 `scripts/gates/verify-overlay.mjs` 编译后导入，
 * 本工具不重复实现通配语义 —— 门禁与工具口径不一致是 R-47 的直接成因。
 *
 * 用法
 *   node scripts/theme-sync.mjs --from v2.0.0 --to HEAD --dry-run
 *   node scripts/theme-sync.mjs --from v2.0.0 --to v2.1.0 --apply
 *   node scripts/theme-sync.mjs --from v2.0.0 --to drill/v2.1.0 --dry-run --overlay apps/demo
 *   node scripts/theme-sync.mjs --list theme|overlay|exclude
 *
 * 语义
 *   1. `git diff --name-status -M <from> <to>` 得到区间内所有变更路径，逐条按清单分类。
 *   2. `theme_changed` = 落在 T 的变更数（升级要覆盖的）；`overlay_changed` = 落在 O 的变更数。
 *   3. dry-run：只报告，不写盘。`overlay_changed>0` 视为**契约违反**（主题升级改了站点数据），
 *      退出码 1；`unclassified_changed>0` 同样退出 1（R-47：未分类不许静默放过）。
 *   4. apply：只把 T 侧变更从 `<to>` 的树写进工作区；动手前要求这些路径在本地无未提交改动。
 *      O 侧一个字节都不写 —— 工具不修改 `site.manifest.json` 本身（清单属 O），
 *      升级后需要改 `theme.ref` 时由人确认（工具只打印 NEXT）。
 *   5. `--overlay <dir>`：该目录整棵视为站点 overlay（M3-6 的 `apps/demo`），
 *      目录下的变更一律算 overlay_changed，不看清单规则。
 *
 * 退出码：0 = 通过 / 应用成功；1 = 契约违反或应用被拒；2 = 参数或 git ref 错误。
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    classifyWith,
    compileManifest,
    loadManifest,
    readTrackedFiles,
} from "./gates/verify-overlay.mjs";

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const argValue = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
};
const repoRoot = path.resolve(argValue("--root") ?? scriptRoot);
const has = (flag) => argv.includes(flag);

const die = (code, message) => {
    console.error(message);
    process.exit(code);
};

const git = (args, options = {}) =>
    execFileSync("git", args, {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        ...options,
    });

const gitBuffer = (args) =>
    execFileSync("git", args, { cwd: repoRoot, maxBuffer: 128 * 1024 * 1024 });

function resolveRef(ref) {
    try {
        return git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).trim();
    } catch {
        return null;
    }
}

/** `--overlay <dir>` 归一化成 `<dir>/` 前缀（相对仓库根，正斜杠）。 */
function overlayPrefix() {
    const dir = argValue("--overlay");
    if (!dir) return null;
    const abs = path.resolve(repoRoot, dir);
    const rel = path.relative(repoRoot, abs).replaceAll(path.sep, "/");
    if (rel.startsWith("..")) die(2, `--overlay ${dir} 不在仓库内（${abs}）`);
    if (!existsSync(abs)) die(2, `--overlay ${dir} 不存在：${abs}`);
    return rel === "." ? "" : `${rel}/`;
}

function loadClassifier() {
    const loaded = loadManifest(repoRoot);
    if (!loaded.ok)
        die(
            1,
            [`${loaded.file ?? "site.manifest.json"} 不可用：`, ...loaded.problems].join("\n  "),
        );
    const compiled = compileManifest(loaded.manifest);
    if (compiled.overrideConflicts.length) die(1, compiled.overrideConflicts.join("\n"));
    return { manifest: loaded.manifest, compiled };
}

/** 区间内变更：返回 [{status, path, fromPath?}]，状态字母取 A/M/D/R/C/T。 */
function diffRange(from, to) {
    const parts = git(["diff", "--name-status", "-z", "-M", from, to]).split("\0");
    const entries = [];
    for (let i = 0; i < parts.length; i += 1) {
        const status = parts[i];
        if (!status) continue;
        if (/^[RC]\d*$/.test(status)) {
            entries.push({ status: status[0], fromPath: parts[i + 1], path: parts[i + 2] });
            i += 2;
        } else {
            entries.push({ status: status[0], path: parts[i + 1] });
            i += 1;
        }
    }
    return entries;
}

/** 把区间变更按 T/O/X/未分类归档（--overlay 目录优先算 O）。 */
function bucket(entries, compiled, prefix) {
    const result = { T: [], O: [], X: [], "?": [] };
    for (const entry of entries) {
        const normalized = entry.path.replaceAll(path.sep, "/");
        const classes =
            prefix !== null && prefix !== "" && normalized.startsWith(prefix)
                ? ["O"]
                : classifyWith(compiled, normalized).classes;
        const cls = classes.length === 1 ? classes[0] : "?";
        result[cls].push(entry);
    }
    return result;
}

function listMode(flag) {
    const map = { theme: "T", overlay: "O", exclude: "X" };
    const cls = map[flag];
    if (!cls) die(2, `--list 只接受 theme|overlay|exclude（收到 ${flag}）`);
    const loaded = loadManifest(repoRoot);
    if (!loaded.ok) die(1, loaded.problems.join("\n"));
    const compiled = compileManifest(loaded.manifest);
    const tracked = readTrackedFiles(repoRoot);
    if (!tracked.ok) die(2, `git ls-files 失败：${tracked.error}`);
    const lines = tracked.files.filter((file) => {
        const classes = classifyWith(compiled, file).classes;
        return classes.length === 1 && classes[0] === cls;
    });
    process.stdout.write(`${lines.join("\n")}\n`);
    process.exit(0);
}

function describe(entry) {
    const detail = entry.fromPath ? ` → ${entry.path}` : "";
    return `  ${entry.status}  ${entry.fromPath ?? entry.path}${detail}`;
}

function main() {
    const listFlag = argValue("--list");
    if (listFlag) listMode(listFlag);

    const { manifest, compiled } = loadClassifier();
    const prefix = overlayPrefix();
    const fromRef = argValue("--from") ?? manifest.theme?.ref;
    const toRef = argValue("--to") ?? "HEAD";
    if (!fromRef) die(2, "缺 --from（清单里也没有 theme.ref 兜底）");

    const fromSha = resolveRef(fromRef);
    const toSha = resolveRef(toRef);
    if (!fromSha)
        die(
            2,
            [
                `git ref 不存在：${fromRef}`,
                `  可用标签：${git(["tag", "-l"]).trim().split("\n").filter(Boolean).join(" ") || "（无）"}`,
                `  若主题当前版本就是 ${manifest.theme?.version ?? "2.0.0"}，先打基线：git tag ${manifest.theme?.ref ?? "v2.0.0"} <commit>`,
            ].join("\n"),
        );
    if (!toSha) die(2, `git ref 不存在：${toRef}`);

    const dryRun = has("--dry-run");
    const apply = has("--apply");
    if (dryRun && apply) die(2, "--dry-run 与 --apply 互斥");
    if (!dryRun && !apply) {
        // 安全默认：不写盘。
        console.error("（未指定 --dry-run / --apply，按 --dry-run 处理）\n");
    }

    const entries = diffRange(fromSha, toSha);
    const buckets = bucket(entries, compiled, prefix);
    const themeChanged = buckets.T.length;
    const overlayChanged = buckets.O.length;
    const excludeChanged = buckets.X.length;
    const unclassifiedChanged = buckets["?"].length;

    console.log(
        `theme-sync · ${manifest.theme?.name ?? "theme"} ${manifest.theme?.version ?? "?"}`,
    );
    console.log(`from ${fromRef} @ ${fromSha.slice(0, 7)}`);
    console.log(`to   ${toRef} @ ${toSha.slice(0, 7)}`);
    if (prefix !== null) console.log(`overlay tree: ${prefix || "./（仓库根）"}`);
    console.log(`range files=${entries.length}`);
    console.log("");
    console.log(`theme_changed=${themeChanged}`);
    console.log(`overlay_changed=${overlayChanged}`);
    console.log(`exclude_changed=${excludeChanged}`);
    console.log(`unclassified_changed=${unclassifiedChanged}`);

    if (themeChanged) {
        console.log("");
        console.log("T · 主题（升级覆盖）");
        for (const entry of buckets.T) console.log(describe(entry));
    }
    if (overlayChanged) {
        console.log("");
        console.log("O · 站点 overlay（升级禁止触碰）");
        for (const entry of buckets.O) console.log(describe(entry));
    }
    if (unclassifiedChanged) {
        console.log("");
        console.log("? · 未分类（先补 site.manifest.json，再重跑）");
        for (const entry of buckets["?"]) console.log(`  ${entry.status}  ${entry.path}`);
    }

    const violating = overlayChanged > 0 || unclassifiedChanged > 0;
    if (violating) {
        console.log("");
        console.log(
            `RESULT FAIL  theme_changed=${themeChanged} overlay_changed=${overlayChanged} unclassified_changed=${unclassifiedChanged}`,
        );
        console.error(
            [
                "契约违反：区间里出现了 O 侧或未分类的变更。",
                "  · O 侧变更 = 这次「升级」不是纯主题升级（可能把站点数据一并改了），拒绝继续。",
                "  · 未分类 = site.manifest.json 漏了规则（R-47），先补规则再重跑，不要用参数绕过。",
            ].join("\n"),
        );
        process.exit(1);
    }

    if (apply) {
        const targets = buckets.T.filter((entry) => entry.path);
        const touched = [
            ...new Set(targets.flatMap((entry) => [entry.path, entry.fromPath].filter(Boolean))),
        ];
        const dirty = touched.length
            ? git(["status", "--porcelain", "-z", "--", ...touched])
                  .split("\0")
                  .filter(Boolean)
            : [];
        if (dirty.length) {
            console.error("");
            console.error("拒绝应用：以下 T 路径有未提交改动，先 commit / stash 再升级");
            for (const line of dirty) console.error(`  ${line}`);
            process.exit(1);
        }
        let written = 0;
        let removed = 0;
        for (const entry of targets) {
            const abs = path.join(repoRoot, entry.path);
            if (entry.fromPath) {
                const oldAbs = path.join(repoRoot, entry.fromPath);
                if (existsSync(oldAbs)) {
                    unlinkSync(oldAbs);
                    removed += 1;
                }
            }
            if (entry.status === "D") {
                if (existsSync(abs)) {
                    unlinkSync(abs);
                    removed += 1;
                }
                continue;
            }
            const buffer = gitBuffer(["show", `${toSha}:${entry.path}`]);
            mkdirSync(path.dirname(abs), { recursive: true });
            writeFileSync(abs, buffer);
            written += 1;
        }
        console.log("");
        console.log(`applied written=${written} removed=${removed}`);
    } else {
        console.log("");
        console.log("（dry-run：未写盘。加 --apply 才会覆盖 T 路径）");
    }

    console.log("");
    console.log(`RESULT PASS  theme_changed=${themeChanged} overlay_changed=${overlayChanged}`);
    if (apply) {
        console.log("");
        console.log("NEXT");
        console.log("  1. 复核 diff：git diff --stat（O 路径必须 0 行，T 侧允许任意）");
        console.log(
            "  2. 人工确认后把 site.manifest.json 的 theme.ref / version 改成新版本（清单属 O，工具不代写）",
        );
        console.log("  3. node scripts/gates/verify-overlay.mjs && pnpm build:ci");
    }
    process.exit(0);
}

main();
