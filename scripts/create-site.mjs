#!/usr/bin/env node
/**
 * create-site.mjs — M3-6 站点装配器（主题 T + overlay O → 一个能构建的站点）
 *
 * 依据 `blog2.0/docs/21-m3-plan.md` §4.4（最小可运行目录树）+ §6.2（P1 可安装）+ D-E ①
 * （`theme-template/` 降级为「示例 overlay 基线」，由本工具取代 `snapshot-theme.mjs`）。
 *
 * 用法
 *   node scripts/create-site.mjs --overlay apps/demo --out /tmp/zcd --build
 *   node scripts/create-site.mjs --overlay apps/demo --out /tmp/zcd --build --install
 *   node scripts/create-site.mjs --check-overlay apps/demo
 *
 * `--install` 会按 `pnpm` → `corepack pnpm` 探测包管理器；只有 corepack 的机器不需要手动 enable。
 *
 * 装配分层（自下而上，后者逐文件覆盖前者，全部按相对路径落盘）
 *   1 theme     `site.manifest.json` 分类为 T 的文件，跳过 NON_RUNTIME（文档 / e2e / CI / 基线快照）
 *   2 baseline  `theme-template/{src,public}` —— 占位 overlay 基线（40 文件，D-E ①）
 *   3 shim      `src/data/{adapters,entities}/**` —— 主题页面直接 import，清单归 O 但没有基线副本；
 *               缺了构建必挂，所以从仓库根取一份（偏差已在本卡评论登记）
 *   4 overlay   `--overlay <dir>`（apps/demo）：站点身份，优先级最高
 *
 * 分类真值只有一份：T 文件列表来自 `scripts/gates/verify-overlay.mjs` 的分类器（与 theme-sync 同口径），
 * 本工具不重复实现通配语义（R-47）。overlay 字段完整性同样复用该模块的 `validateOverlay()`。
 *
 * 退出码：0 = 装配（+ 构建）成功；1 = overlay 不合格 / 装配或构建失败；2 = 参数错误。
 * 汇总行：`RESULT PASS  out=<dir> html=<n> …`，供卡验收 / CI 直接 grep。
 */

import { execFileSync } from "node:child_process";
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    classifyWith,
    compileManifest,
    loadManifest,
    readTrackedFiles,
    validateOverlay,
} from "./gates/verify-overlay.mjs";

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const argValue = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
};
const has = (flag) => argv.includes(flag);

const die = (code, lines) => {
    console.error([].concat(lines).join("\n"));
    process.exit(code);
};

/* ───────────────────────── 装配策略（唯一一份，改这里就是改语义）───────────────────────── */

/** theme 层里不进站点运行时的路径：文档、e2e 基线、CI、主题分发快照。 */
const NON_RUNTIME = [
    "e2e/",
    "theme-template/",
    "docs/",
    ".github/",
    "playwright.config.ts",
    "vitest.config.ts",
];

/** `theme-template/` 里属于分发说明、不属于站点树的文件（装配时丢弃）。 */
const BASELINE_DROP = [
    "package.json",
    "README.md",
    ".gitignore",
    "docs/",
    "screenshots/",
    ".github/",
];

/** overlay 目录里不装配的文件：README 是 overlay 的说明，不是站点文件。 */
const OVERLAY_DROP = ["README.md"];

/**
 * 主题页面直接 import、但清单归 O 的路径（形状实现 / 实体清单）。
 * 没有基线副本可用，必须从仓库根取一份，否则 `src/pages/{projects,skills,devices,games,music,timeline}`
 * 与 `src/config/ui.ts` 的 `~/data/adapters` 引用会在构建期解析失败。
 */
const SHIM_RULES = [/^src\/data\/(?:adapters|entities)\//];

/* ───────────────────────── 工具 ───────────────────────── */

const toPosix = (value) => value.replaceAll(path.sep, "/");

function walkFiles(root, relBase = "") {
    const out = [];
    for (const entry of readdirSync(path.join(root, relBase), { withFileTypes: true })) {
        const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
        if (entry.isDirectory()) out.push(...walkFiles(root, rel));
        else if (entry.isFile()) out.push(rel);
    }
    return out;
}

const isDropped = (rel, dropList) =>
    dropList.some((drop) => (drop.endsWith("/") ? rel.startsWith(drop) : rel === drop));

function slugOf(dir) {
    return path
        .basename(dir)
        .replace(/[^a-z0-9-]/gi, "-")
        .toLowerCase();
}

/* ───────────────────────── 分层 ───────────────────────── */

function buildLayers({ overlayRel }) {
    const loaded = loadManifest(scriptRoot);
    if (!loaded.ok)
        die(1, [`site.manifest.json 不可用：`, ...loaded.problems.map((p) => `  ${p}`)]);
    const manifest = loaded.manifest;
    const compiled = compileManifest(manifest);
    if (compiled.overrideConflicts.length) die(1, compiled.overrideConflicts);
    const tracked = readTrackedFiles(scriptRoot);
    if (!tracked.ok) die(1, `git ls-files 失败：${tracked.error}`);

    const classOf = (file) => classifyWith(compiled, file).classes;

    const theme = [];
    const shim = [];
    const baseline = [];
    for (const file of tracked.files) {
        const classes = classOf(file);
        if (classes.length !== 1) continue; // 未分类 / 歧义由 verify-overlay 判红，这里只跳过
        const cls = classes[0];
        if (cls === "T") {
            // `theme-template/**` 是「示例 overlay 基线」（D-E ①），不是站点运行时文件：
            // 去掉前缀后作为 baseline 层落盘（只取 src/ 与 public/）。
            if (file.startsWith("theme-template/")) {
                const rel = file.slice("theme-template/".length);
                if (!rel.startsWith("src/") && !rel.startsWith("public/")) continue;
                if (isDropped(rel, BASELINE_DROP)) continue;
                baseline.push({ from: path.join(scriptRoot, file), to: rel });
                continue;
            }
            if (isDropped(file, NON_RUNTIME)) continue;
            theme.push({ from: path.join(scriptRoot, file), to: file });
            continue;
        }
        if (cls === "O" && SHIM_RULES.some((re) => re.test(file)))
            shim.push({ from: path.join(scriptRoot, file), to: file });
    }

    const overlayAbs = path.join(scriptRoot, overlayRel);
    const overlay = walkFiles(overlayAbs)
        .filter((rel) => !isDropped(rel, OVERLAY_DROP))
        .map((rel) => ({ from: path.join(overlayAbs, rel), to: rel }));

    return {
        manifest,
        layers: [
            { name: "theme", entries: theme },
            { name: "baseline", entries: baseline },
            { name: "shim", entries: shim },
            { name: "overlay", entries: overlay },
        ],
    };
}

/* ───────────────────────── 装配 ───────────────────────── */

function prepareOut(outDir, force) {
    if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
        return "created";
    }
    const marker = path.join(outDir, ".zcd-site.json");
    const empty = readdirSync(outDir).length === 0;
    if (!force && !empty && !existsSync(marker)) {
        die(1, [
            `输出目录已存在且不是 create-site 产物：${outDir}`,
            "  拒绝删除（可能是别人的目录）。换一个 --out，或人工确认后加 --force。",
        ]);
    }
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    return "recreated";
}

function assemble(outDir, layers) {
    const written = new Map(); // 目标相对路径 → 层名（最后一次写入者）
    for (const layer of layers) {
        for (const entry of layer.entries) {
            const dest = path.join(outDir, entry.to);
            mkdirSync(path.dirname(dest), { recursive: true });
            copyFileSync(entry.from, dest);
            written.set(entry.to, layer.name);
        }
    }
    const stats = {};
    for (const layer of layers) stats[layer.name] = layer.entries.length;
    stats.unique = written.size;
    stats.overridden = layers.reduce((sum, l) => sum + l.entries.length, 0) - written.size;
    return stats;
}

function retagPackageJson(outDir, { overlayRel, overlayName, manifest }) {
    const file = path.join(outDir, "package.json");
    if (!existsSync(file)) return null;
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    const themeBase = String(pkg.name ?? "site")
        .split("/")
        .pop();
    const base = overlayName ? slugOf(overlayName) : slugOf(overlayRel);
    pkg.name = `${themeBase}-${base}`;
    pkg.description = `${overlayRel} 装配产物（theme ${manifest.theme?.name ?? "?"} ${manifest.theme?.version ?? "?"}）`;
    writeFileSync(file, `${JSON.stringify(pkg, null, 4)}\n`);
    return pkg.name;
}

function writeMarker(outDir, { overlayRel, manifest, stats }) {
    const marker = {
        generatedBy: "scripts/create-site.mjs",
        assembledAt: new Date().toISOString(),
        theme: {
            name: manifest.theme?.name ?? null,
            version: manifest.theme?.version ?? null,
            ref: manifest.theme?.ref ?? null,
        },
        overlay: overlayRel,
        layers: stats,
    };
    writeFileSync(path.join(outDir, ".zcd-site.json"), `${JSON.stringify(marker, null, 4)}\n`);
    return marker;
}

/* ───────────────────────── 依赖 + 构建 ───────────────────────── */

function pnpmInvocation() {
    // 干净机器可能只有 corepack（pnpm 由 `corepack enable` 提供，或根本没 enable）。
    // 直接 spawnSync("pnpm") 会 ENOENT；这里按 pnpm → corepack pnpm 顺序探测。
    for (const [command, prefix] of [
        ["pnpm", []],
        ["corepack", ["pnpm"]],
    ]) {
        try {
            execFileSync(command, [...prefix, "--version"], { stdio: "ignore" });
            return { command, prefix };
        } catch {
            // 继续探测下一候选
        }
    }
    die(1, "找不到 pnpm（也不是可用的 corepack）：先运行 `corepack enable`，或安装 pnpm 后重试。");
}

function ensureDeps(outDir, { install }) {
    const outModules = path.join(outDir, "node_modules");
    if (existsSync(outModules)) return "present";
    const repoModules = path.join(scriptRoot, "node_modules");
    if (!install && existsSync(repoModules)) {
        symlinkSync(repoModules, outModules, "dir");
        return "symlink → 仓库 node_modules（--install 可改为真装）";
    }
    const pnpm = pnpmInvocation();
    execFileSync(pnpm.command, [...pnpm.prefix, "install", "--frozen-lockfile"], {
        cwd: outDir,
        stdio: "inherit",
    });
    return `${[pnpm.command, ...pnpm.prefix].join(" ")} install --frozen-lockfile`;
}

function runBuild(outDir) {
    const astro = path.join(outDir, "node_modules/astro/bin/astro.mjs");
    if (!existsSync(astro)) die(1, `找不到 ${astro}（依赖未就绪）`);
    execFileSync(process.execPath, [astro, "build"], { cwd: outDir, stdio: "inherit" });
    const collapse = path.join(outDir, "scripts/postbuild/collapse-html-whitespace.mjs");
    if (existsSync(collapse))
        execFileSync(process.execPath, [collapse, "dist"], { cwd: outDir, stdio: "inherit" });
}

const countHtml = (dir) =>
    existsSync(dir) ? walkFiles(dir).filter((file) => file.endsWith(".html")).length : 0;

/** 从 overlay 的 site.ts 取标题（只用于「overlay 是否真的生效」的产物断言）。 */
function overlayTitle(overlayRel) {
    const file = path.join(scriptRoot, overlayRel, "src/config/site.ts");
    if (!existsSync(file)) return null;
    const source = readFileSync(file, "utf8");
    const block = source.match(/export const site[\s\S]*?=\s*\{([\s\S]*?)\n\};/);
    const title = (block?.[1] ?? "").match(/\btitle:\s*"([^"]+)"/);
    return title?.[1] ?? null;
}

/* ───────────────────────── 主流程 ───────────────────────── */

function main() {
    const overlayArg = argValue("--overlay") ?? argValue("--check-overlay");
    if (!overlayArg) die(2, "缺 --overlay <dir>（例：--overlay apps/demo）");

    const overlayAbs = path.resolve(scriptRoot, overlayArg);
    const overlayRel = toPosix(path.relative(scriptRoot, overlayAbs));
    if (!existsSync(overlayAbs)) die(2, `overlay 不存在：${overlayAbs}`);

    /* 0. overlay 字段完整性（与 verify-overlay O7 同一份判据） */
    const validated = validateOverlay(scriptRoot, overlayRel);
    console.log("create-site · 装配器（主题 T + overlay O）");
    console.log(`overlay: ${overlayRel}`);
    console.log("");
    console.log(`overlay 字段校验：${validated.ok ? "PASS" : "FAIL"}`);
    for (const line of validated.info) console.log(`  · ${line}`);
    for (const problem of validated.problems) console.log(`  - ${problem}`);
    if (!validated.ok) die(1, "RESULT FAIL  overlay 字段不完整（先修 overlay 再装配）");
    if (has("--check-overlay") && !has("--out")) {
        console.log("");
        console.log(
            `RESULT PASS  overlay=${overlayRel} configs=4 articles=${validated.summary.articles} data=${validated.summary.data} files=${validated.summary.files}`,
        );
        process.exit(0);
    }

    /* 1. 分层 */
    const { manifest, layers } = buildLayers({ overlayRel });
    const outArg = argValue("--out");
    if (!outArg) die(2, "缺 --out <dir>（例：--out /tmp/zcd）");
    const outDir = path.resolve(outArg);
    if (outDir === scriptRoot || outDir === path.dirname(scriptRoot))
        die(2, `--out 不能是仓库根或其父目录：${outDir}`);

    /* 2. 落盘 */
    const outState = prepareOut(outDir, has("--force"));
    const stats = assemble(outDir, layers);
    const overlayName = existsSync(path.join(overlayAbs, "package.json"))
        ? JSON.parse(readFileSync(path.join(overlayAbs, "package.json"), "utf8")).name
        : null;
    const siteName = retagPackageJson(outDir, { overlayRel, overlayName, manifest });
    writeMarker(outDir, { overlayRel, manifest, stats });

    console.log("");
    console.log(`out: ${outDir}（${outState}）`);
    for (const layer of layers)
        console.log(`  ${layer.name.padEnd(9)} ${String(stats[layer.name]).padStart(4)} 文件`);
    console.log(
        `  ${"total".padEnd(9)} ${String(stats.unique).padStart(4)} 文件（覆盖 ${stats.overridden} 次）`,
    );
    console.log(`  site name: ${siteName ?? "（无 package.json）"}`);

    if (!has("--build")) {
        console.log("");
        console.log(`RESULT PASS  out=${outDir} mode=assemble-only files=${stats.unique}`);
        process.exit(0);
    }

    /* 3. 依赖 + 构建 */
    const deps = ensureDeps(outDir, { install: has("--install") });
    console.log(`  node_modules: ${deps}`);
    const startedAt = Date.now();
    runBuild(outDir);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    /* 4. 产物断言 */
    const dist = path.join(outDir, "dist");
    const html = countHtml(dist);
    const minHtml = Number(argValue("--min-html") ?? 8);
    const title = overlayTitle(overlayRel);
    const indexHtml = path.join(dist, "index.html");
    const hits =
        title && existsSync(indexHtml)
            ? readFileSync(indexHtml, "utf8").split(title).length - 1
            : 0;

    console.log("");
    console.log("产物");
    console.log(`  dist HTML: ${html}（阈值 ${minHtml}）`);
    console.log(`  首页含 overlay 标题「${title ?? "?"}」：${hits} 次`);
    console.log(`  构建耗时: ${elapsed}s`);

    const failures = [];
    if (html < minHtml) failures.push(`dist HTML=${html} < ${minHtml}`);
    if (!existsSync(indexHtml)) failures.push("dist/index.html 不存在");
    if (title && hits < 1)
        failures.push(`dist/index.html 未出现 overlay 标题「${title}」（overlay 没生效）`);

    console.log("");
    if (failures.length) {
        for (const failure of failures) console.log(`  - ${failure}`);
        die(1, `RESULT FAIL  out=${outDir} html=${html} build=${elapsed}s`);
    }
    console.log(
        `RESULT PASS  out=${outDir} html=${html} overlay=${overlayRel} title_hits=${hits} build=${elapsed}s layers=theme:${stats.theme}/baseline:${stats.baseline}/shim:${stats.shim}/overlay:${stats.overlay}`,
    );
    process.exit(0);
}

main();
