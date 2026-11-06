#!/usr/bin/env node
/**
 * verify-package-boundary.mjs — M3-1 包边界门禁
 *
 * 把 `blog2.0/docs/21-m3-plan.md` §3.4 的四条禁令（B1–B4）从文档变成可运行判据，
 * 外加 W0（骨架前提）：workspace 声明、三个包的 manifest 与版本 lockstep。
 *
 *   W0  workspace 骨架：`pnpm-workspace.yaml` 有 `packages:`；三个包目录都在成员里；
 *       `package.json` 的 name / version（与主题 lockstep）/ 发布状态合规
 *       （tokens/og-image 可发布 + publishConfig.access=public；ui 仍 private）。
 *   B1  包内不得出现 `~/` 别名 import（包不能反向读站点代码）。
 *   B2  包内不得出现站点身份串（marxchou / mcc.im / zcily / 73b29141）。
 *       唯一豁免：`package.json` 的 `"name"` 值（npm scope 是包的身份，不是站点身份）。
 *   B3  包不得声明白名单外的 dependency；站内互相引用必须是 `workspace:*`。
 *   B4  站点私有数据不得进包：`src/data`、`src/config`、`src/assets/qr`、
 *       `public/assets/note`（抽样 10 个）逐文件 sha256，包内任一文件命中即 FAIL。
 *
 * 用法
 *   node scripts/gates/verify-package-boundary.mjs                # 校验
 *   node scripts/gates/verify-package-boundary.mjs --root <dir>   # 对临时副本跑（负向测试）
 *
 * 退出码：0 = 全 PASS；1 = 有违反。
 * 汇总行固定为 `RESULT PASS  packages=N violations=0`，供 CI / 卡验收直接 grep。
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ───────────────────────── 参数与常量 ───────────────────────── */

const argv = process.argv.slice(2);
const argValue = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
};
const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(argValue("--root") ?? scriptRoot);
const rel = (p) => path.relative(repoRoot, p) || ".";

/** 三个包：目录名 → 期望的 package.json name。M3 §3.1–§3.3 冻结。 */
const REQUIRED = new Map([
    ["tokens", "@marxchou/dogeared-tokens"],
    ["ui", "@marxchou/dogeared-ui"],
    ["og-image", "@marxchou/dogeared-og-image"],
]);

/** M4 首发发布清单（D-0120）：其余包保持 private。 */
const RELEASE_PACKAGES = new Set(["tokens", "og-image"]);

/**
 * B3 白名单：来自 §3.4 的依赖方向（tokens 叶节点零依赖；ui 只把 astro 当 peer；
 * og-image 只允许 satori/sharp 出图 + astro 当 peer，且不得依赖 tokens/ui）。
 */
const DEP_WHITELIST = {
    tokens: {
        dependencies: [],
        devDependencies: [],
        peerDependencies: [],
        optionalDependencies: [],
    },
    ui: {
        dependencies: [],
        devDependencies: [],
        peerDependencies: ["astro"],
        optionalDependencies: [],
    },
    "og-image": {
        dependencies: ["satori", "sharp"],
        devDependencies: [],
        peerDependencies: ["astro"],
        optionalDependencies: [],
    },
};
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

/** B2 站点身份串（与 scripts/check-personalization.mjs 的口径一致 + umami 站点 id）。 */
const IDENTITY_PATTERNS = [
    { id: "marxchou", re: /marxchou/i },
    { id: "mcc.im", re: /mcc\.im/i },
    { id: "zcily", re: /zcily/i },
    { id: "73b29141", re: /73b29141/i },
];

/** B4 站点私有数据源（相对仓库根）。数组 = 整目录；数字 = 抽样前 N 个（按路径排序）。 */
const PRIVATE_SOURCES = [
    { dir: "src/data", sample: 0, note: "整目录" },
    { dir: "src/config", sample: 0, note: "整目录" },
    { dir: "src/assets/qr", sample: 0, note: "整目录" },
    { dir: "public/assets/note", sample: 10, note: "抽样 10" },
];
/** B4 路径禁令：包内不得出现这些目录（站点私有数据的家）。 */
const FORBIDDEN_DIR_SUFFIXES = ["src/data", "src/config", "public/assets/note", "src/assets/qr"];

const SKIP_DIRS = new Set([
    "node_modules",
    "dist",
    ".git",
    ".astro",
    ".vite-cache",
    "test-results",
    "playwright-report",
]);
const TEXT_EXT = /\.(astro|ts|tsx|js|mjs|cjs|json|css|md|yaml|yml|txt)$/;

/* ───────────────────────── 工具 ───────────────────────── */

function walk(dir, out = []) {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walk(path.join(dir, entry.name), out);
        } else {
            out.push(path.join(dir, entry.name));
        }
    }
    return out;
}

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** 只解析 `packages:` 这一段的块状序列；不引 yaml 依赖（仓库没有直接依赖 yaml）。 */
function parseWorkspaceMembers(text) {
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex((line) => /^packages\s*:/.test(line));
    if (start < 0)
        return { ok: false, reason: "`packages:` 字段不存在（仓库仍是单包）", globs: [] };
    if (lines[start].replace(/^packages\s*:/, "").trim())
        return { ok: false, reason: "`packages:` 用了行内数组，判据脚本只认块状序列", globs: [] };

    const globs = [];
    for (let i = start + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        if (/^\S/.test(line)) break; // 下一段顶层键
        const match = /^\s+-\s+(.+)$/.exec(line);
        if (!match) continue;
        globs.push(
            match[1]
                .replace(/\s+#.*$/, "")
                .replace(/^["']|["']$/g, "")
                .trim(),
        );
    }
    if (!globs.length) return { ok: false, reason: "`packages:` 为空", globs: [] };
    return { ok: true, globs };
}

/** 只支持 `<dir>/*`：显式拒绝其它形式，避免「看起来支持了其实没展开」。 */
function expandGlob(glob) {
    const match = /^([^"']*?)\/\*$/.exec(glob);
    if (!match) return { ok: false, dirs: [], glob };
    const base = match[1];
    const abs = path.join(repoRoot, base);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) return { ok: true, dirs: [], glob, base };
    const dirs = readdirSync(abs, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => existsSync(path.join(abs, entry.name, "package.json")))
        .map((entry) => path.join(base, entry.name))
        .sort();
    return { ok: true, dirs, glob, base };
}

function readJson(file) {
    try {
        return { ok: true, value: JSON.parse(readFileSync(file, "utf8")) };
    } catch (error) {
        return { ok: false, error: String(error.message ?? error) };
    }
}

/* ───────────────────────── W0 骨架 ───────────────────────── */

const checks = [];
const addCheck = (id, title, problems) => checks.push({ id, title, problems });

const workspaceFile = path.join(repoRoot, "pnpm-workspace.yaml");
const w0 = [];

if (!existsSync(workspaceFile)) {
    w0.push("pnpm-workspace.yaml 不存在");
} else {
    const parsed = parseWorkspaceMembers(readFileSync(workspaceFile, "utf8"));
    if (!parsed.ok) w0.push(parsed.reason);
    else {
        const members = [];
        for (const glob of parsed.globs) {
            const expanded = expandGlob(glob);
            if (!expanded.ok) {
                w0.push(`不支持的 glob「${glob}」（判据脚本只支持 <dir>/*）`);
                continue;
            }
            members.push(...expanded.dirs);
        }
        const names = new Set(members.map((m) => path.basename(m)));
        for (const pkg of REQUIRED.keys()) {
            if (!names.has(pkg))
                w0.push(
                    `packages/${pkg} 不是 workspace 成员（未被 ${parsed.globs.join(" ")} 覆盖）`,
                );
        }
        for (const extra of names) {
            if (!REQUIRED.has(extra))
                w0.push(`packages/${extra} 不在 M3 冻结的三包内（新增包须先走 decision-log）`);
        }
    }
}

const themeManifest = readJson(path.join(repoRoot, "package.json"));
const themeVersion = themeManifest.ok ? themeManifest.value.version : null;
if (!themeVersion) w0.push("根 package.json 读不到 version（版本 lockstep 无法判定）");

const packageDirs = [];
for (const pkg of REQUIRED.keys()) {
    const dir = path.join(repoRoot, "packages", pkg);
    const manifestPath = path.join(dir, "package.json");
    if (!existsSync(manifestPath)) {
        w0.push(`packages/${pkg}/package.json 缺失`);
        continue;
    }
    packageDirs.push(dir);
    const manifest = readJson(manifestPath);
    if (!manifest.ok) {
        w0.push(`packages/${pkg}/package.json 不是合法 JSON：${manifest.error}`);
        continue;
    }
    const value = manifest.value;
    if (value.name !== REQUIRED.get(pkg))
        w0.push(`packages/${pkg} name=${value.name}，期望 ${REQUIRED.get(pkg)}`);
    if (themeVersion && value.version !== themeVersion)
        w0.push(`packages/${pkg} version=${value.version}，与主题 ${themeVersion} 不 lockstep`);
    // M4 发布口径（D-0120）：tokens/og-image 可发布，ui 仍 private。
    // M3 的「三包一律 private / 不得有 publishConfig」已随发布卡失效，不能继续当门禁。
    if (RELEASE_PACKAGES.has(pkg)) {
        if (value.private !== false)
            w0.push(`packages/${pkg} 应声明 "private": false（M4 首发发布清单）`);
        if (value.publishConfig?.access !== "public")
            w0.push(`packages/${pkg} 缺少 publishConfig.access="public"`);
    } else {
        if (value.private !== true)
            w0.push(`packages/${pkg} 应声明 "private": true（D-0120 暂不发布）`);
        if ("publishConfig" in value) w0.push(`packages/${pkg} 不应声明 publishConfig（暂不发布）`);
    }
}

addCheck("W0", "workspace 骨架（packages: / 三包 manifest / lockstep）", w0);

/* ───────────────────────── B1 ~ B4 ───────────────────────── */

const packageFiles = packageDirs.flatMap((dir) => walk(dir));

// B1 —— 包内 `~/` 别名 import；相对路径不得逃出包目录
const b1 = [];
const SPECIFIER_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;
for (const file of packageFiles) {
    if (!TEXT_EXT.test(file)) continue;
    const pkgRoot = packageDirs.find((dir) => file.startsWith(dir + path.sep));
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
        for (const match of line.matchAll(SPECIFIER_RE)) {
            const specifier = match[1];
            if (specifier.startsWith("~/"))
                b1.push(`${rel(file)}:${index + 1}  别名 import ${specifier}（包不得读站点代码）`);
            if (!specifier.startsWith(".")) continue;
            const resolved = path.resolve(path.dirname(file), specifier);
            if (pkgRoot && resolved !== pkgRoot && !resolved.startsWith(pkgRoot + path.sep))
                b1.push(
                    `${rel(file)}:${index + 1}  相对路径 ${specifier} 逃出包目录 → ${rel(resolved)}`,
                );
        }
    });
}
addCheck("B1", "包内 `~/` 别名 import = 0、相对路径不越界", b1);

// B2 —— 包内站点身份串（package.json 里包自身的身份串豁免）
const b2 = [];
for (const file of packageFiles) {
    if (!TEXT_EXT.test(file)) continue;
    let text = readFileSync(file, "utf8");
    if (path.basename(file) === "package.json") {
        text = text.replace(/("name"\s*:\s*)"[^"]*"/, '$1"<scope-exempt>"');
        for (const pkgName of REQUIRED.values())
            text = text.split(pkgName).join("<pkg-identity-exempt>");
    }
    text.split(/\r?\n/).forEach((line, index) => {
        for (const { id, re } of IDENTITY_PATTERNS) {
            if (!re.test(line)) continue;
            b2.push(`${rel(file)}:${index + 1}  [${id}] ${line.trim().slice(0, 100)}`);
        }
    });
}
addCheck("B2", "包内站点身份串（marxchou/mcc.im/zcily/73b29141）= 0", b2);

// B3 —— 依赖白名单 + workspace: 协议
const b3 = [];
for (const pkg of REQUIRED.keys()) {
    const manifestPath = path.join(repoRoot, "packages", pkg, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = readJson(manifestPath);
    if (!manifest.ok) continue;
    const allowed = DEP_WHITELIST[pkg];
    for (const field of DEP_FIELDS) {
        const declared = manifest.value[field] ?? {};
        if (typeof declared !== "object" || Array.isArray(declared)) {
            b3.push(`packages/${pkg}: "${field}" 不是对象`);
            continue;
        }
        for (const [name, specifier] of Object.entries(declared)) {
            if (!allowed[field].includes(name))
                b3.push(
                    `packages/${pkg}: ${field}.${name}=${specifier} 不在白名单 [${allowed[field].join(", ") || "空"}]`,
                );
            if (/^@marxchou\/zcblog-/.test(name) && !String(specifier).startsWith("workspace:"))
                b3.push(
                    `packages/${pkg}: ${field}.${name}=${specifier}，站内引用必须是 workspace:*`,
                );
        }
    }
    if (pkg === "og-image") {
        for (const banned of ["@marxchou/dogeared-tokens", "@marxchou/dogeared-ui"]) {
            for (const field of DEP_FIELDS) {
                const declared = manifest.value[field] ?? {};
                if (declared[banned])
                    b3.push(`packages/og-image: 不得依赖 ${banned}（§3.4 依赖方向）`);
            }
        }
    }
}
addCheck("B3", "依赖 ⊆ 白名单 + 站内引用 workspace:*", b3);

// B4 —— 站点私有数据不进包
const b4 = [];
const privateHashes = new Map();
for (const source of PRIVATE_SOURCES) {
    const abs = path.join(repoRoot, source.dir);
    if (!existsSync(abs)) continue;
    let files = walk(abs).sort();
    if (source.sample > 0) files = files.slice(0, source.sample);
    for (const file of files) {
        if (statSync(file).size === 0) continue;
        privateHashes.set(sha256(file), rel(file));
    }
}
for (const file of packageFiles) {
    if (statSync(file).size === 0) continue;
    const digest = sha256(file);
    if (privateHashes.has(digest))
        b4.push(`${rel(file)} 与站点私有文件 ${privateHashes.get(digest)} 内容相同（sha256 命中）`);
    const normalized = rel(file).replaceAll(path.sep, "/");
    for (const banned of FORBIDDEN_DIR_SUFFIXES) {
        if (normalized.includes(`/${banned}/`)) b4.push(`${rel(file)} 位于禁用目录 ${banned}/`);
    }
}
if (!privateHashes.size) b4.push("站点私有数据源一个都读不到（B4 判定为空转，拒绝通过）");
addCheck("B4", `站点私有数据不进包（sha256 ${privateHashes.size} 个样本）`, b4);

/* ───────────────────────── 输出 ───────────────────────── */

const pad = (text, width) => {
    const visual = [...text].reduce((sum, char) => sum + (/[\u4e00-\u9fff]/.test(char) ? 2 : 1), 0);
    return text + " ".repeat(Math.max(0, width - visual));
};

const packages = packageDirs.length;
const violations = checks.reduce((sum, check) => sum + check.problems.length, 0);

console.log("M3-1 包边界门禁（packages/*）");
console.log(`root: ${repoRoot}`);
console.log("");
for (const check of checks) {
    const state = check.problems.length === 0 ? "PASS" : "FAIL";
    console.log(
        `${check.id.padEnd(3)} ${pad(check.title, 46)} ${state}  ${check.problems.length} 项`,
    );
    for (const problem of check.problems) console.log(`    - ${problem}`);
}

console.log("");
if (violations > 0) {
    console.log(`RESULT FAIL  packages=${packages} violations=${violations}`);
    process.exit(1);
}
console.log(
    `RESULT PASS  packages=${packages} violations=0${themeVersion ? ` theme_version=${themeVersion}` : ""}`,
);
process.exit(0);
