#!/usr/bin/env node
// M4-4 · changeset 闭环验证（在临时 monorepo 里跑，**不碰仓库、不碰 registry**）
//
//   node scripts/release/verify-changeset-loop.mjs [--keep] [--json]
//
// 验的是：changeset 配置能驱动「加 changeset → status → version（三包 lockstep）→ pack（private 常开后）→ publish-plan（三包齐）」
// 这一整条链。临时副本里会把三包 private 翻成 false，证明翻转后链路能真正产出 tarball 与发布计划；
// 真仓库是否 public 由发布卡决定（当前 tokens/og-image 可发布、ui 仍 private）。
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT, loadPackages, makeCollector, pnpmEnv, report, runSync } from "./lib.mjs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const keep = argv.includes("--keep");

const c = makeCollector();
const tmp = path.join(os.tmpdir(), `dogeared-changeset-loop-${process.pid}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const changedDir = "packages/ui"; // 改动落在 ui 上，验「fixed 组会带着另外两个一起 bump」

const cli = path.join(REPO_ROOT, "node_modules", "@changesets", "cli", "bin.js");
const { env: pnpmPathEnv, cleanup } = pnpmEnv();
// changesets v3 的 add/version/pack/publish-plan 都会内部 spawn `pnpm`；
// 本机没装 pnpm 时用 corepack shim 垫一层 PATH（CI 里有 pnpm action，是 no-op）
const runCli = (args) =>
    runSync("node", [cli, ...args], { cwd: tmp, env: pnpmPathEnv, allowFail: true });

try {
    if (!existsSync(cli)) {
        c.fail("L0", `找不到 changesets CLI：${cli}`, "先 pnpm install");
        report("changeset 闭环", c.results, { json });
        process.exit(1);
    }

    // ---- 1. 造临时 monorepo（只拷 metadata + 包内容，不拷 node_modules）----
    // L6 只验 changesets 的 pack/publish-plan 链；包构建由 build-packages.mjs 与包自身
    // test 覆盖。prepack 需要 workspace 根的 tsc，而副本故意不带 node_modules；因此：
    //   1) 先在真仓确保 dist 存在（缺了就 build 一次）；
    //   2) 拷进副本后去掉 prepack，只 pack 已构建的 dist。
    const requiredDist = [
        ["packages/tokens", "tokens.css"],
        ["packages/ui", "dist/index.js"],
        ["packages/og-image", "dist/index.js"],
    ];
    const missingDist = requiredDist.filter(
        ([dir, file]) => !existsSync(path.join(REPO_ROOT, dir, file)),
    );
    if (missingDist.length) {
        const built = runSync(
            process.execPath,
            [path.join(REPO_ROOT, "scripts/release/build-packages.mjs")],
            {
                cwd: REPO_ROOT,
                allowFail: true,
            },
        );
        if (built.code !== 0) {
            c.fail(
                "L1",
                "包 dist 不存在且 build-packages 失败，无法验证 pack",
                built.combined.slice(-800),
            );
            report("changeset 闭环", c.results, { json });
            process.exit(1);
        }
    }
    cpSync(path.join(REPO_ROOT, "pnpm-workspace.yaml"), path.join(tmp, "pnpm-workspace.yaml"));
    mkdirSync(path.join(tmp, ".changeset"), { recursive: true });
    cpSync(
        path.join(REPO_ROOT, ".changeset", "config.json"),
        path.join(tmp, ".changeset", "config.json"),
    );
    for (const dir of ["packages/tokens", "packages/ui", "packages/og-image"]) {
        cpSync(path.join(REPO_ROOT, dir), path.join(tmp, dir), {
            recursive: true,
            filter: (src) => !src.includes("/node_modules"),
        });
        // 副本里去掉 prepack：没有 node_modules，prepack 会 ELIFECYCLE；dist 已由真仓拷入。
        const manifestPath = path.join(tmp, dir, "package.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        if (manifest.scripts?.prepack) {
            delete manifest.scripts.prepack;
            writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
        }
    }
    writeFileSync(
        path.join(tmp, "package.json"),
        JSON.stringify(
            { name: "dogeared-release-loop", version: "0.0.0", private: true, type: "module" },
            null,
            4,
        ),
    );
    const git = (...a) =>
        runSync("git", ["-c", "user.email=loop@local", "-c", "user.name=loop", ...a], {
            cwd: tmp,
            allowFail: true,
        });
    git("init", "-q");
    git("add", "-A");
    const commit = git("commit", "-q", "-m", "loop: baseline");
    if (commit.code !== 0)
        c.warn(
            "L1",
            "git commit 失败（changesets version 可能需要干净工作区）",
            commit.combined.slice(0, 400),
        );
    else c.pass("L1", `临时 monorepo 就绪（${tmp}）`);

    // ---- 2. 加 changeset（只提一个包，fixed 组应把三个都带上）----
    const added = runCli(["--patch", "@marxchou/dogeared-ui", "-m", "M4-4 loop: lockstep smoke"]);
    const files = existsSync(path.join(tmp, ".changeset"))
        ? readdirSync(path.join(tmp, ".changeset")).filter((f) => f.endsWith(".md"))
        : [];
    if (added.code === 0 && files.length > 0)
        c.pass("L2", `changeset add 产出 ${files.join(", ")}`);
    else c.fail("L2", "changeset add 没产出 changeset 文件", added.combined.slice(0, 800));

    // ---- 3. status 能读出来 ----
    const st = runCli(["status", "--verbose"]);
    if (st.code === 0)
        c.pass(
            "L3",
            "changeset status 可运行",
            st.combined.split("\n").filter(Boolean).slice(-6).join("\n"),
        );
    else c.fail("L3", "changeset status 失败", st.combined.slice(0, 600));

    // ---- 4. version：三包 lockstep 一起到 2.1.1 + CHANGELOG ----
    const ver = runCli(["version"]);
    const after = ["packages/tokens", "packages/ui", "packages/og-image"].map((dir) => ({
        dir,
        pkg: JSON.parse(readFileSync(path.join(tmp, dir, "package.json"), "utf8")),
    }));
    const versions = [...new Set(after.map((p) => p.pkg.version))];
    if (ver.code === 0 && versions.length === 1 && versions[0] !== "2.1.0")
        c.pass(
            "L4",
            `version 后三包仍 lockstep，一起到 ${versions[0]}`,
            after.map((p) => `${p.pkg.name}@${p.pkg.version}`).join("\n"),
        );
    else
        c.fail(
            "L4",
            "version 后版本没有 lockstep 前进",
            `${ver.combined.slice(-600)}\n版本：${JSON.stringify(versions)}`,
        );

    const changelogs = after.filter((p) => existsSync(path.join(tmp, p.dir, "CHANGELOG.md")));
    if (changelogs.length === after.length)
        c.pass("L5", `三包都生成了 CHANGELOG.md（${after.length}/${after.length}）`);
    else c.warn("L5", `只有 ${changelogs.length}/${after.length} 个包生成 CHANGELOG.md`);

    // ---- 5. 翻转 private 后：pack 产出三包 tarball、publish-plan 列出三包 ----
    for (const p of after) {
        p.pkg.private = false;
        writeFileSync(path.join(tmp, p.dir, "package.json"), JSON.stringify(p.pkg, null, 4));
    }
    git("add", "-A");
    git("commit", "-q", "-m", "loop: flip private");

    const packDir = path.join(tmp, "pack-out");
    const pack = runCli(["pack", "--out-dir", packDir]);
    const tgz = existsSync(packDir)
        ? readdirSync(packDir, { recursive: true })
              .filter((f) => String(f).endsWith(".tgz"))
              .map(String)
        : [];
    if (pack.code === 0 && tgz.length === 3)
        c.pass("L6", `changeset pack 产出 ${tgz.length} 个 tarball`, tgz.join("\n"));
    else
        c.fail(
            "L6",
            "changeset pack 没产出三包 tarball",
            `${tgz.join("\n")}\n${pack.combined.slice(-600)}`,
        );

    const planPath = path.join(tmp, "plan.json");
    const plan = runCli(["publish-plan", "--output", planPath]);
    let planJson = null;
    if (existsSync(planPath)) planJson = JSON.parse(readFileSync(planPath, "utf8"));
    // changesets v3 的 plan 是「分组数组」：plan: [[{kind,name,version,access,tag}, ...]]
    const flat = (Array.isArray(planJson?.plan) ? planJson.plan : []).flat();
    const publishes = flat.filter((e) => e && e.kind === "publish");
    const tanames = publishes.map((e) => e.name);
    const expect = [
        "@marxchou/dogeared-tokens",
        "@marxchou/dogeared-ui",
        "@marxchou/dogeared-og-image",
    ];
    const covered = expect.every((n) => tanames.includes(n));
    if (plan.code === 0 && publishes.length === 3 && covered)
        c.pass(
            "L7",
            `publish-plan 列出全部 ${publishes.length} 个待发布包（含 registry 存在性检查）`,
            JSON.stringify(flat).slice(0, 900),
        );
    else
        c.fail(
            "L7",
            "publish-plan 没列全三包（发布链会空转）",
            `${JSON.stringify(planJson).slice(0, 600)}\n${tanames.join(", ")}\n${plan.combined.slice(-400)}`,
        );

    // ---- 6. 真仓库配置未被改动（临时目录里做的一切都不回流）----
    const real = loadPackages();
    const realVersionsOk = real.every((p) => p.version === "2.1.0");
    const uiStillPrivate = real.find((p) => p.name === "@marxchou/dogeared-ui")?.private === true;
    if (realVersionsOk && uiStillPrivate)
        c.pass("L8", "真仓库仍 2.1.0；ui 仍 private（临时副本的改动没有回流）");
    else
        c.fail(
            "L8",
            "真仓库版本或 ui 的 private 状态被改动",
            real.map((p) => `${p.name}@${p.version} private=${p.private}`).join("\n"),
        );

    report("changeset 闭环（临时 monorepo）", c.results, {
        json,
        extra: {
            tmp,
            bumpedTo: versions[0] ?? null,
            packages: after.map((p) => p.pkg.name),
            tarballs: tgz,
            publishPlanEntries: publishes.length,
            planNames: tanames,
        },
    });
} finally {
    cleanup();
    if (!keep) rmSync(tmp, { recursive: true, force: true });
    else console.log(`\n临时目录保留：${tmp}`);
}

process.exit(c.results.some((r) => r.level === "FAIL") ? 1 : 0);
