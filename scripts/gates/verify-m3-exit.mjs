#!/usr/bin/env node
/**
 * verify-m3-exit.mjs — M3 出口五项门禁（P1 可安装 / P2 可配置 / P3 可升级 / P7 质量 / P10 客户零）
 *
 * 依据 `blog2.0/docs/21-m3-plan.md` §6.2（出口项 → 可执行判据）+ §6.4（minor 升级演练）。
 * 本脚本只做判据，不实现主题/overlay 语义：分类真值来自 `site.manifest.json` +
 * `scripts/gates/verify-overlay.mjs`（与 theme-sync / create-site 同一份），装配与升级分别调用
 * `scripts/create-site.mjs` / `scripts/theme-sync.mjs`。
 *
 *   P1  可安装      assemble(theme + apps/demo) + 真实 `pnpm install --frozen-lockfile` + `astro build`
 *                   计时口径：新 out 目录（无 node_modules）→ 装依赖 → 构建，墙钟 ≤ 30:00；dist HTML ≥ 8。
 *   P2  可配置      overlay 的 site.ts 改标题/域名 → 再装配构建；`git status --porcelain -- src/components packages`
 *                   必须为空（主题 0 文件变化），且新标题出现在 dist/index.html。
 *   P3  可升级      ① dry-run：`theme-sync --from <drill-from> --to <drill-to>` 打印
 *                      `theme_changed>0 overlay_changed=0 unclassified_changed=0`；
 *                   ② 真实 apply：干净 clone 在 drill-from 上 `pnpm install` + `--apply` + `build:ci`
 *                      + check-tokens + perf-budget + verify-overlay，墙钟 ≤ 30:00；O 路径 `git diff` 0 行；
 *                      演练文案进产物；最后 `git reset --hard <drill-from>` 回滚并断言工作区干净。
 *   P7  质量        clean clone（`git clone file://<repo>`，0 篇文章）`pnpm install --frozen-lockfile`
 *                    + `pnpm build:ci` + verify-overlay + verify-package-boundary + check-tokens
 *                    + perf-budget，全部 exit 0。
 *   P10 客户零      `site.manifest.json` 的 `theme.ref`（发布 tag）必须存在；
 *                   ① `git diff <ref>..HEAD` 里 T 侧 0 个变更；
 *                   ② 装配产物的每个 T 文件与 `<ref>` 的 blob 逐字节相同
 *                      （package.json 例外：create-site 按设计改 name/description；符号链接按目标比不计入）。
 *
 * 用法
 *   node scripts/gates/verify-m3-exit.mjs --all                 # 五项全跑（等价于不带参数）
 *   node scripts/gates/verify-m3-exit.mjs P1 P7                 # 只跑指定项
 *   node scripts/gates/verify-m3-exit.mjs --all --work /tmp/x   # 临时目录（默认 os.tmpdir()/zcblog-m3-exit）
 *   node scripts/gates/verify-m3-exit.mjs --all --keep          # 保留临时目录便于取证
 *   node scripts/gates/verify-m3-exit.mjs P3 --drill-from drill/pre-upgrade --drill-to drill/v2.1.0
 *
 * 环境前提：`pnpm` 在 PATH（找不到时脚本会尝试 `~/.nvm/versions/node/<ver>/bin` 兜底并明确报错）；
 * 需要 `git` / `node` / `python3`。P3 需要 M3-8 演练留下的 drill refs（见 docs/upgrade.md §6）。
 *
 * 退出码：0 = 全部 PASS；1 = 有 FAIL（含单项失败）；2 = 参数错误。
 * 汇总行固定为 `RESULT PASS  p1=PASS p2=PASS p3=PASS p7=PASS p10=PASS`，供卡验收 / CI 直接 grep。
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    cpSync,
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyWith, compileManifest, loadManifest } from "./verify-overlay.mjs";

/* ───────────────────────── 参数 ───────────────────────── */

const argv = process.argv.slice(2);
const argValue = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
};
const has = (flag) => argv.includes(flag);

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(argValue("--root") ?? scriptRoot);

const CHECKS = ["P1", "P2", "P3", "P7", "P10"];
const selected = argv
    .filter((arg) => CHECKS.includes(arg.toUpperCase()))
    .map((a) => a.toUpperCase());
const wantAll = has("--all") || selected.length === 0;
const todo = wantAll ? CHECKS : CHECKS.filter((id) => selected.includes(id));
if (!todo.length) {
    console.error(`未知的选择项。可用：${CHECKS.join(" ")}（或不带参数 / --all 全跑）`);
    process.exit(2);
}

const TIMEOUT_MS = Number(argValue("--timeout") ?? 1800) * 1000;
const BUDGET_MS = Number(argValue("--budget") ?? 1800) * 1000;
const WORK = path.resolve(argValue("--work") ?? path.join(os.tmpdir(), "zcblog-m3-exit"));
const KEEP = has("--keep");
const DRILL_FROM = argValue("--drill-from") ?? "drill/pre-upgrade";
const DRILL_TO = argValue("--drill-to") ?? "drill/v2.1.0";
/** 演练分支里必须带上的一句文案（§6.4 步 1 的「1 个组件文案」），用于断言 to ref 的内容真的落地。 */
const DRILL_MARKER = "minor-drill";
/** P2 改 title/url 用的标记值 */
const P2_TITLE = "M3-EXIT-P2 配置演练站";
const P2_URL = "https://p2.example.test";

/* ───────────────────────── 工具 ───────────────────────── */

const toPosix = (value) => value.replaceAll(path.sep, "/");
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const mmss = (ms) => {
    const total = Math.round(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

function walkFiles(root, relBase = "") {
    const out = [];
    let entries;
    try {
        entries = readdirSync(path.join(root, relBase), { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
        if (entry.isDirectory()) out.push(...walkFiles(root, rel));
        else if (entry.isFile() || entry.isSymbolicLink()) out.push(rel);
    }
    return out;
}

const countHtml = (dir) => walkFiles(dir).filter((file) => file.endsWith(".html")).length;

let VERBOSE = has("--verbose");
function run(cmd, args, { cwd = repoRoot, timeout = TIMEOUT_MS, label = null } = {}) {
    const started = Date.now();
    const res = spawnSync(cmd, args, {
        cwd,
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
        timeout,
        env: process.env,
    });
    const ms = Date.now() - started;
    const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
    const code = res.status ?? 1;
    if (label) console.log(`  · ${label}  exit=${code} ${secs(ms)}`);
    if (VERBOSE || (code !== 0 && !VERBOSE)) {
        const lines = out.split("\n").filter(Boolean);
        const tail = lines.slice(-(code === 0 ? 6 : 24));
        for (const line of tail) console.log(`      ${line}`);
    }
    return { code, out, ms, error: res.error };
}

/** 从子进程输出里摘出「判据行」直接展示（RESULT / 结果：/ SUMMARY）。 */
function digest(out, limit = 6) {
    return out
        .split("\n")
        .filter((line) => /^RESULT |^\s*结果：|^SUMMARY /.test(line))
        .slice(0, limit);
}

/** `pnpm` 兜底：PATH 里没有时扫 nvm / homebrew / 常见目录，找到就前置进 PATH。 */
function ensurePnpm() {
    const probe = spawnSync("pnpm", ["-v"], { encoding: "utf8" });
    if (probe.status === 0) return probe.stdout.trim();
    const home = os.homedir();
    const dirs = [];
    const nvmRoot = path.join(home, ".nvm", "versions", "node");
    if (existsSync(nvmRoot)) {
        for (const version of readdirSync(nvmRoot).sort().reverse())
            dirs.push(path.join(nvmRoot, version, "bin"));
    }
    dirs.push("/opt/homebrew/bin", "/usr/local/bin", path.join(home, ".local/bin"), "/usr/bin");
    for (const dir of dirs) {
        if (!existsSync(path.join(dir, "pnpm"))) continue;
        process.env.PATH = `${dir}:${process.env.PATH ?? ""}`;
        const again = spawnSync("pnpm", ["-v"], { encoding: "utf8" });
        if (again.status === 0) return again.stdout.trim();
    }
    return null;
}

const git = (args, opts = {}) => run("git", args, opts);
const gitOut = (args) =>
    spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
        .stdout ?? "";

const sha1Blob = (buffer) =>
    createHash("sha1").update(`blob ${buffer.length}\0`).update(buffer).digest("hex");

function loadClassifier() {
    const loaded = loadManifest(repoRoot);
    if (!loaded.ok) return { ok: false, problems: loaded.problems };
    const compiled = compileManifest(loaded.manifest);
    if (compiled.overrideConflicts.length)
        return { ok: false, problems: compiled.overrideConflicts };
    return { ok: true, manifest: loaded.manifest, compiled };
}

const resetWork = (...parts) => {
    const dir = path.join(WORK, ...parts);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    return dir;
};

/* ───────────────────────── P1 可安装 ───────────────────────── */

function checkP1(pnpmVersion) {
    const problems = [];
    const info = [];
    const outDir = path.join(resetWork("p1"), "site");
    const res = run(
        process.execPath,
        [
            path.join(repoRoot, "scripts/create-site.mjs"),
            "--overlay",
            "apps/demo",
            "--out",
            outDir,
            "--build",
            "--install",
        ],
        { label: "create-site --overlay apps/demo --build --install（含真实装依赖）" },
    );
    const html = countHtml(path.join(outDir, "dist"));
    const modules = path.join(outDir, "node_modules");
    const realInstall = existsSync(modules) && !lstatSync(modules).isSymbolicLink();
    const resultLine = res.out.split("\n").find((line) => line.startsWith("RESULT PASS")) ?? "";

    info.push(
        `计时口径 rm -rf node_modules && time…：新 out 目录 + pnpm install(--frozen-lockfile) + astro build`,
    );
    info.push(
        `墙钟 ${secs(res.ms)}（预算 ${mmss(BUDGET_MS)}）· dist HTML=${html} · node_modules 真实安装=${realInstall}`,
    );
    info.push(`pnpm ${pnpmVersion ?? "?"} · out=${toPosix(path.relative(repoRoot, outDir))}`);
    if (resultLine) info.push(resultLine.trim());

    if (res.code !== 0) problems.push(`create-site 退出码 ${res.code}`);
    if (!realInstall) problems.push("node_modules 不是真实目录（说明没走真实安装）");
    if (html < 8) problems.push(`dist HTML=${html} < 8`);
    if (res.ms > BUDGET_MS) problems.push(`墙钟 ${secs(res.ms)} 超 30 分钟预算`);
    if (!/html=\d+/.test(resultLine)) problems.push("没拿到 create-site 的 RESULT PASS 行");
    return { problems, info, metrics: { ms: res.ms, html } };
}

/* ───────────────────────── P2 可配置 ───────────────────────── */

function checkP2(pnpmVersion) {
    const problems = [];
    const info = [];
    const work = resetWork("p2");
    const overlay = path.join(work, "overlay");
    cpSync(path.join(repoRoot, "apps/demo"), overlay, { recursive: true });

    /* 改 overlay 的 title / url（只动 overlay 副本，不碰仓库文件） */
    const siteConfig = path.join(overlay, "src/config/site.ts");
    const source = readFileSync(siteConfig, "utf8");
    const patched = source
        .replace(/title:\s*"[^"]*"/, `title: "${P2_TITLE}"`)
        .replace(/url:\s*"[^"]*"/, `url: "${P2_URL}"`);
    if (patched === source) {
        problems.push("没能在 overlay 的 site.ts 里替换 title/url（正则失配）");
        return { problems, info };
    }
    writeFileSync(siteConfig, patched);

    const outDir = path.join(work, "site");
    const res = run(
        process.execPath,
        [
            path.join(repoRoot, "scripts/create-site.mjs"),
            "--overlay",
            overlay,
            "--out",
            outDir,
            "--build",
            "--install",
        ],
        { label: "create-site 用改过 title/url 的 overlay 副本重新装配 + 构建" },
    );
    const indexHtml = path.join(outDir, "dist/index.html");
    const hits = existsSync(indexHtml)
        ? readFileSync(indexHtml, "utf8").split(P2_TITLE).length - 1
        : 0;
    const themeDirty = gitOut(["status", "--porcelain", "--", "src/components", "packages"])
        .split("\n")
        .filter(Boolean);
    const repoOverlayDirty = gitOut(["status", "--porcelain", "--", "apps/demo"])
        .split("\n")
        .filter(Boolean);

    info.push(`overlay 副本：title=「${P2_TITLE}」 url=${P2_URL}`);
    info.push(`主题侧 git status（src/components packages）：${themeDirty.length} 行`);
    info.push(`dist/index.html 命中新标题 ${hits} 次 · pnpm ${pnpmVersion ?? "?"}`);

    if (res.code !== 0) problems.push(`create-site 退出码 ${res.code}`);
    if (hits < 1) problems.push(`dist/index.html 未出现新标题（overlay 没生效）`);
    if (themeDirty.length) problems.push(`主题文件被改动：${themeDirty.join(" / ")}`);
    if (repoOverlayDirty.length)
        problems.push(`仓库里的 apps/demo 被改动：${repoOverlayDirty.join(" / ")}`);
    return { problems, info, metrics: { title_hits: hits } };
}

/* ───────────────────────── P3 可升级 ───────────────────────── */

function checkP3(pnpmVersion) {
    const problems = [];
    const info = [];
    const fromSha = gitOut(["rev-parse", "--verify", "--quiet", `${DRILL_FROM}^{commit}`]).trim();
    const toSha = gitOut(["rev-parse", "--verify", "--quiet", `${DRILL_TO}^{commit}`]).trim();
    if (!fromSha || !toSha) {
        problems.push(
            [
                `缺少演练 ref：${DRILL_FROM}=${fromSha ? "ok" : "缺失"} ${DRILL_TO}=${toSha ? "ok" : "缺失"}`,
                `  先跑 docs/upgrade.md §6 的演练（git tag ${DRILL_FROM} + 分支 ${DRILL_TO}），或传 --drill-from/--drill-to`,
            ].join("\n"),
        );
        return { problems, info };
    }
    info.push(
        `from ${DRILL_FROM} @ ${fromSha.slice(0, 7)} · to ${DRILL_TO} @ ${toSha.slice(0, 7)}`,
    );

    /* ① dry-run：契约判据（O 侧 0 变更、无未分类） */
    const dry = run(
        process.execPath,
        [
            path.join(repoRoot, "scripts/theme-sync.mjs"),
            "--from",
            DRILL_FROM,
            "--to",
            DRILL_TO,
            "--dry-run",
        ],
        { label: "theme-sync --dry-run（契约判据）" },
    );
    const num = (key) => Number((dry.out.match(new RegExp(`${key}=(\\d+)`)) ?? [])[1] ?? -1);
    const themeChanged = num("theme_changed");
    const overlayChanged = num("overlay_changed");
    const unclassifiedChanged = num("unclassified_changed");
    info.push(
        `dry-run: theme_changed=${themeChanged} overlay_changed=${overlayChanged} unclassified_changed=${unclassifiedChanged}`,
    );
    if (dry.code !== 0) problems.push(`dry-run 退出码 ${dry.code}（零变更或契约违反都算失败）`);
    if (!(themeChanged > 0))
        problems.push(`theme_changed=${themeChanged}，区间内没有主题变更（演练分支没造出来）`);
    if (overlayChanged !== 0)
        problems.push(`overlay_changed=${overlayChanged}，主题升级触碰了 overlay`);
    if (unclassifiedChanged !== 0)
        problems.push(`unclassified_changed=${unclassifiedChanged}（R-47 清单漏规则）`);

    /* ② 真实 apply：干净 clone（不带本地缓存/文章）上装依赖 + 应用 + 构建 + 门禁 */
    const work = resetWork("p3");
    const clone = path.join(work, "site");
    const cloned = run("git", ["clone", "--branch", DRILL_FROM, `file://${repoRoot}`, clone], {
        label: `git clone --branch ${DRILL_FROM}`,
    });
    if (cloned.code !== 0) {
        problems.push("clone 失败，跳过 apply 计时");
        return { problems, info };
    }
    /* 把 to ref 落成本地分支（clone 里只有 origin/*） */
    let toRef = DRILL_TO;
    if (
        spawnSync("git", ["rev-parse", "--verify", "--quiet", `${DRILL_TO}^{commit}`], {
            cwd: clone,
        }).status !== 0
    ) {
        const tracking = spawnSync(
            "git",
            ["rev-parse", "--verify", "--quiet", `origin/${DRILL_TO}^{commit}`],
            { cwd: clone, encoding: "utf8" },
        );
        if (tracking.status === 0) toRef = `origin/${DRILL_TO}`;
        else {
            problems.push(`clone 里找不到 ${DRILL_TO}（origin 也没有）`);
            return { problems, info };
        }
    }

    const t0 = Date.now();
    const install = run("pnpm", ["install", "--frozen-lockfile"], {
        cwd: clone,
        label: "pnpm install --frozen-lockfile",
    });
    const apply = run(
        process.execPath,
        [
            path.join(clone, "scripts/theme-sync.mjs"),
            "--from",
            DRILL_FROM,
            "--to",
            toRef,
            "--apply",
        ],
        { cwd: clone, label: `theme-sync --apply --to ${toRef}` },
    );
    const build = run("pnpm", ["build:ci"], { cwd: clone, label: "pnpm build:ci" });
    const tokens = run(process.execPath, [path.join(clone, "scripts/gates/check-tokens.mjs")], {
        cwd: clone,
        label: "check-tokens",
    });
    const perf = run("python3", [path.join(clone, "scripts/gates/perf-budget.py"), "dist"], {
        cwd: clone,
        label: "perf-budget dist",
    });
    const overlayGate = run(
        process.execPath,
        [path.join(clone, "scripts/gates/verify-overlay.mjs")],
        {
            cwd: clone,
            label: "verify-overlay",
        },
    );
    const elapsed = Date.now() - t0;

    const applied = (apply.out.match(/applied written=(\d+) removed=(\d+)/) ?? []).slice(1);
    const overlayDiff = spawnSync(
        "git",
        [
            "diff",
            "--stat",
            "--",
            "src/config",
            "src/content",
            "src/data",
            "src/assets",
            "public/assets/note",
            "public/images",
        ],
        { cwd: clone, encoding: "utf8" },
    )
        .stdout?.split("\n")
        .filter(Boolean);
    const distDir = path.join(clone, "dist");
    const html = countHtml(distDir);
    const markerHits = existsSync(distDir) ? grepDist(distDir, DRILL_MARKER) : 0;

    info.push(
        `apply 计时口径：rm -rf node_modules 的干净 clone → install + apply + build + 门禁 · 墙钟 ${secs(elapsed)}（预算 ${mmss(BUDGET_MS)}）`,
    );
    info.push(
        `applied written=${applied[0] ?? "?"} removed=${applied[1] ?? "?"} · 产物命中「${DRILL_MARKER}」${markerHits} 个 HTML · dist HTML=${html} · pnpm ${pnpmVersion ?? "?"}`,
    );
    info.push(
        `O 侧 git diff（src/config src/content src/data src/assets public/assets/note public/images）：${overlayDiff.length} 行`,
    );
    for (const line of digest(build.out)) info.push(line.trim());
    for (const line of digest(perf.out)) info.push(line.trim());

    if (install.code !== 0) problems.push(`install 退出码 ${install.code}`);
    if (apply.code !== 0) problems.push(`apply 退出码 ${apply.code}`);
    if (build.code !== 0) problems.push(`build 退出码 ${build.code}`);
    if (tokens.code !== 0) problems.push(`check-tokens 退出码 ${tokens.code}`);
    if (perf.code !== 0) problems.push(`perf-budget 退出码 ${perf.code}`);
    if (overlayGate.code !== 0) problems.push(`verify-overlay 退出码 ${overlayGate.code}`);
    if (overlayDiff.length)
        problems.push(`overlay 侧出现 ${overlayDiff.length} 行 diff（升级不许碰 O）`);
    if (markerHits < 1)
        problems.push(`产物里没有「${DRILL_MARKER}」，说明 to ref 的文案没真正落地`);
    if (elapsed > BUDGET_MS) problems.push(`升级墙钟 ${secs(elapsed)} 超 30 分钟预算`);

    /* ③ 回滚判据（§6.4 步 7）：reset 回 drill-from，工作区必须干净 */
    const reset = run("git", ["reset", "--hard", fromSha], {
        cwd: clone,
        label: "git reset --hard <drill-from>（回滚）",
    });
    const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: clone, encoding: "utf8" })
        .stdout?.split("\n")
        .filter(Boolean);
    info.push(`回滚后 git status：${dirty.length} 行`);
    if (reset.code !== 0) problems.push(`回滚退出码 ${reset.code}`);
    if (dirty.length) problems.push(`回滚后工作区不干净：${dirty.slice(0, 5).join(" / ")}`);

    return {
        problems,
        info,
        metrics: { ms: elapsed, theme_changed: themeChanged, overlay_changed: overlayChanged },
    };
}

/** 在目录里 grep 一个字面量，返回命中文件数。 */
function grepDist(dir, needle) {
    let hits = 0;
    for (const rel of walkFiles(dir)) {
        if (!rel.endsWith(".html")) continue;
        if (readFileSync(path.join(dir, rel), "utf8").includes(needle)) hits += 1;
    }
    return hits;
}

/* ───────────────────────── P7 质量 ───────────────────────── */

function checkP7() {
    const problems = [];
    const info = [];
    const work = resetWork("p7");
    const clone = path.join(work, "cc");
    const cloned = run("git", ["clone", "--depth", "1", `file://${repoRoot}`, clone], {
        label: "git clone --depth 1（clean clone）",
    });
    if (cloned.code !== 0) return { problems: ["clean clone 失败"], info };

    const articles = walkFiles(path.join(clone, "src/content/article")).length;
    const install = run("pnpm", ["install", "--frozen-lockfile"], {
        cwd: clone,
        label: "pnpm install --frozen-lockfile",
    });
    const build = run("pnpm", ["build:ci"], { cwd: clone, label: "pnpm build:ci（0 篇文章）" });
    const html = countHtml(path.join(clone, "dist"));
    const gates = [
        [
            "verify-overlay",
            process.execPath,
            [path.join(clone, "scripts/gates/verify-overlay.mjs")],
        ],
        [
            "verify-package-boundary",
            process.execPath,
            [path.join(clone, "scripts/gates/verify-package-boundary.mjs")],
        ],
        ["check-tokens", process.execPath, [path.join(clone, "scripts/gates/check-tokens.mjs")]],
        ["perf-budget", "python3", [path.join(clone, "scripts/gates/perf-budget.py"), "dist"]],
    ];
    const results = {};
    for (const [name, cmd, args] of gates) {
        const res = run(cmd, args, { cwd: clone, label: `${name}（clone 内）` });
        results[name] = res;
        for (const line of digest(res.out, 2)) info.push(line.trim());
        if (res.code !== 0) problems.push(`${name} 退出码 ${res.code}`);
    }

    info.push(
        `clean clone 文章数=${articles}（src/content/article 被 gitignore）· dist HTML=${html}`,
    );
    info.push(`install ${secs(install.ms)} · build ${secs(build.ms)}`);
    if (install.code !== 0) problems.push(`install 退出码 ${install.code}`);
    if (build.code !== 0)
        problems.push(`build 退出码 ${build.code}（0 篇文章也必须 exit 0，见计划 §6.3）`);
    if (html < 8) problems.push(`dist HTML=${html} < 8`);
    return { problems, info, metrics: { html, articles } };
}

/* ───────────────────────── P10 客户零 ───────────────────────── */

function checkP10(classifier) {
    const problems = [];
    const info = [];
    if (!classifier.ok)
        return {
            problems: [`site.manifest.json 不可用：${classifier.problems.join(" / ")}`],
            info,
        };
    const { manifest, compiled } = classifier;
    const ref = manifest.theme?.ref;
    if (!ref) return { problems: ["site.manifest.json 缺 theme.ref"], info };
    const refSha = gitOut(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).trim();
    if (!refSha) {
        problems.push(`发布 tag 不存在：${ref}（先 git tag ${ref} <release commit>）`);
        return { problems, info };
    }
    info.push(`发布基线 ${ref} @ ${refSha.slice(0, 7)}`);

    /* ① ref..HEAD 的 T 侧变更必须为 0 */
    const changed = gitOut(["diff", "--name-only", `${ref}..HEAD`])
        .split("\n")
        .filter(Boolean);
    const themeChanged = changed.filter((file) => {
        const classes = classifyWith(compiled, file).classes;
        return classes.length === 1 && classes[0] === "T";
    });
    info.push(`ref..HEAD 变更 ${changed.length} 个文件，其中 T 侧 ${themeChanged.length} 个`);
    if (themeChanged.length)
        problems.push(
            `主题文件在 ${ref} 之后又被改动（${themeChanged.length} 个）：${themeChanged.slice(0, 6).join(", ")}`,
        );

    /* ② 装配产物的 T 文件与 ref 的 blob 逐字节相同 */
    const outDir = path.join(resetWork("p10"), "site");
    const assemble = run(
        process.execPath,
        [path.join(repoRoot, "scripts/create-site.mjs"), "--overlay", "apps/demo", "--out", outDir],
        { label: "create-site 装配（不构建）" },
    );
    if (assemble.code !== 0) {
        problems.push(`装配失败，退出码 ${assemble.code}`);
        return { problems, info };
    }
    const tree = gitOut(["ls-tree", "-r", ref])
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const [meta, file] = line.split("\t");
            const [mode, , sha] = meta.split(/\s+/);
            return { mode, sha, file };
        });
    const byPath = new Map(tree.map((entry) => [entry.file, entry]));
    let compared = 0;
    let skippedSymlink = 0;
    let skippedRetag = 0;
    const mismatches = [];
    for (const rel of walkFiles(outDir)) {
        const entry = byPath.get(rel);
        if (!entry) continue;
        const classes = classifyWith(compiled, rel).classes;
        if (!(classes.length === 1 && classes[0] === "T")) continue;
        if (entry.mode === "120000") {
            skippedSymlink += 1;
            continue;
        }
        if (rel === "package.json") {
            /* create-site 按设计重写 name/description（§4.4），不能按字节比 */
            skippedRetag += 1;
            continue;
        }
        const abs = path.join(outDir, rel);
        const actual = sha1Blob(readFileSync(abs));
        compared += 1;
        if (actual !== entry.sha) mismatches.push(rel);
    }
    info.push(
        `装配产物 T 文件逐字节比对：compared=${compared} mismatch=${mismatches.length}（跳过符号链接 ${skippedSymlink}、package.json 重写 ${skippedRetag}）`,
    );
    if (compared < 100) problems.push(`比对样本只有 ${compared} 个 T 文件，装配产物不完整`);
    if (mismatches.length)
        problems.push(
            `与 ${ref} 不一致的 T 文件（${mismatches.length}）：${mismatches.slice(0, 6).join(", ")}`,
        );
    return { problems, info, metrics: { compared, mismatches: mismatches.length } };
}

/* ───────────────────────── 主流程 ───────────────────────── */

function main() {
    const pnpmVersion = ensurePnpm();
    console.log("M3 出口门禁（P1 可安装 / P2 可配置 / P3 可升级 / P7 质量 / P10 客户零）");
    console.log(`root: ${repoRoot}`);
    console.log(`work: ${WORK}${KEEP ? "（keep）" : ""}   pnpm: ${pnpmVersion ?? "未找到"}`);
    console.log(
        `head: ${gitOut(["rev-parse", "--short", "HEAD"]).trim()} · checks: ${todo.join(" ")}`,
    );
    console.log("");

    if (!pnpmVersion) {
        console.log(
            'RESULT FAIL  pnpm_not_found（把 pnpm 放进 PATH，例：export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"）',
        );
        process.exit(1);
    }
    mkdirSync(WORK, { recursive: true });

    const classifier = loadClassifier();
    const runners = {
        P1: () => checkP1(pnpmVersion),
        P2: () => checkP2(pnpmVersion),
        P3: () => checkP3(pnpmVersion),
        P7: () => checkP7(),
        P10: () => checkP10(classifier),
    };
    const titles = {
        P1: "可安装（装配 + 真实装依赖 + 构建 ≤30 分钟）",
        P2: "可配置（改 overlay 0 个主题文件变化）",
        P3: "可升级（minor 升级真实 apply ≤30 分钟、O 侧 0 变更）",
        P7: "质量（clean clone install+build+门禁全绿）",
        P10: "客户零（站点主题文件与发布 tag 逐字节相同）",
    };

    const results = {};
    for (const id of todo) {
        console.log(`── ${id} ${titles[id]}`);
        const started = Date.now();
        let result;
        try {
            result = runners[id]();
        } catch (error) {
            result = { problems: [`未捕获异常：${error?.stack ?? error}`], info: [] };
        }
        const state = result.problems.length === 0 ? "PASS" : "FAIL";
        results[id] = state;
        for (const line of result.info ?? []) console.log(`  · ${line}`);
        for (const problem of result.problems ?? []) console.log(`  - ${problem}`);
        console.log(`  ${state}  ${id}  ${secs(Date.now() - started)}`);
        console.log("");
    }

    const failed = Object.entries(results).filter(([, state]) => state !== "PASS");
    const line = todo.map((id) => `${id.toLowerCase()}=${results[id]}`).join(" ");
    if (failed.length) {
        console.log(`RESULT FAIL  ${line}`);
        console.log(`（临时目录保留在 ${WORK} 供取证；确认后自行删除）`);
        process.exit(1);
    }
    if (!KEEP) {
        rmSync(WORK, { recursive: true, force: true });
        console.log("临时目录已清理（--keep 保留）");
    } else {
        console.log(`临时目录保留在 ${WORK}（--keep）`);
    }
    console.log(`RESULT PASS  ${line}`);
    process.exit(0);
}

main();
