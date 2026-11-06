#!/usr/bin/env node
// M5-6 · 消费者兼容矩阵汇总器
//
// 职责：
//   1. 用 prepare-next-minor-fixture.mjs 打「下一 minor」本地预演包（默认 2.2.0）
//   2. 在本机能找到的 Node 22 / 24 上跑 consumer-probe.mjs（每个 Node 一条时间线）
//   3. 合并外部采集的 cell JSON（`--include=`，例如 Linux 上 docker 里跑出来的），
//      校验每格的关键断言，输出 JSON + Markdown 表格（直接给 docs/npm-consumer.md 用）
//
// 本机没有的 Node 大版本不会假装跑过：脚本只跑找得到的，缺的格在输出里标 missing，
// 由 `--include=` 补进来。
//
// 用法：
//   node scripts/release/verify-consumer-matrix.mjs \
//     --out=docs/_reviews/M5-6/matrix.json \
//     --include=/tmp/m56-matrix/node22-linux.json \
//     --include=/tmp/m56-matrix/node24-linux.json

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(
    process.argv
        .slice(2)
        .filter((a) => a.startsWith("--"))
        .map((a) => {
            const [k, ...rest] = a.replace(/^--/, "").split("=");
            return [k, rest.join("=") || "true"];
        }),
);

const NEXT_VERSION = args["next-version"] || "2.2.0";
const outPath = path.resolve(args.out || path.join(repoRoot, "docs/_reviews/M5-6/matrix.json"));
const fixtureDir = path.resolve(args.fixtures || path.join(os.tmpdir(), "m56-next-minor-fixture"));
const runDir = path.resolve(args["run-dir"] || path.join(os.tmpdir(), "m56-matrix"));
const includes = process.argv
    .slice(2)
    .filter((a) => a.startsWith("--include="))
    .map((a) => path.resolve(a.slice("--include=".length)));
const majorWanted = (args.majors || "22,24").split(",").map((s) => Number(s.trim()));

mkdirSync(path.dirname(outPath), { recursive: true });
mkdirSync(runDir, { recursive: true });

// ---------------------------------------------------------------- fixture

const fx = spawnSync(
    process.execPath,
    [
        path.join(repoRoot, "scripts/release/prepare-next-minor-fixture.mjs"),
        `--version=${NEXT_VERSION}`,
        `--out=${fixtureDir}`,
    ],
    { encoding: "utf8" },
);
if (fx.status !== 0) {
    console.error(fx.stdout, fx.stderr);
    process.exit(1);
}
const fixture = JSON.parse(fx.stdout.slice(0, fx.stdout.lastIndexOf("}") + 1));
const nextTokens = fixture.tarballs.tokens.file;
const nextOg = fixture.tarballs["og-image"].file;
console.log(`fixture: ${NEXT_VERSION} → ${path.dirname(nextTokens)}`);

// ---------------------------------------------------------------- local node discovery

function findLocalNode(major) {
    const candidates = [];
    const nvmRoot = path.join(os.homedir(), ".nvm", "versions", "node");
    if (existsSync(nvmRoot)) {
        for (const dir of readdirSync(nvmRoot)) {
            if (dir.startsWith(`v${major}.`))
                candidates.push(path.join(nvmRoot, dir, "bin", "node"));
        }
    }
    if (Number(process.versions.node.split(".")[0]) === major) candidates.push(process.execPath);
    candidates.sort().reverse();
    return candidates.find((c) => existsSync(c)) || null;
}

const cells = [];
for (const major of args["skip-local"] === "true" ? [] : majorWanted) {
    if (args.docker === "true") {
        const cell = `node${major}-linux`;
        const cellOut = path.join(runDir, `${cell}.json`);
        const image = process.env.CONSUMER_MATRIX_IMAGE_NODE || `node:${major}-bookworm-slim`;
        console.log(`[docker] ${image} → ${cell}`);
        const res = spawnSync(
            "docker",
            [
                "run",
                "--rm",
                "-v",
                `${path.join(repoRoot, "scripts/release")}:/probe:ro`,
                "-v",
                `${path.dirname(nextTokens)}:/fx:ro`,
                "-v",
                `${runDir}:/out`,
                image,
                "node",
                "/probe/consumer-probe.mjs",
                `--cell=${cell}`,
                `--next-tokens=/fx/${path.basename(nextTokens)}`,
                `--next-og=/fx/${path.basename(nextOg)}`,
                `--out=/out/${cell}.json`,
            ],
            { encoding: "utf8", stdio: "inherit", timeout: 30 * 60 * 1000 },
        );
        if (res.status !== 0) console.error(`[FAIL] ${cell} docker exit=${res.status}`);
        if (existsSync(cellOut)) cells.push(JSON.parse(readFileSync(cellOut, "utf8")));
        else cells.push({ cell, ok: false, node: null, error: `docker probe exit ${res.status}` });
        continue;
    }
    const nodeBin = findLocalNode(major);
    if (!nodeBin) {
        console.log(`[SKIP] node${major}: 本机没有该大版本的可执行文件`);
        cells.push({
            cell: `node${major}-${process.platform}`,
            node: null,
            ok: false,
            missing: true,
        });
        continue;
    }
    const cell = `node${major}-${process.platform}`;
    const cellOut = path.join(runDir, `${cell}.json`);
    const res = spawnSync(
        nodeBin,
        [
            path.join(repoRoot, "scripts/release/consumer-probe.mjs"),
            `--cell=${cell}`,
            `--next-tokens=${nextTokens}`,
            `--next-og=${nextOg}`,
            `--out=${cellOut}`,
        ],
        { encoding: "utf8", stdio: "inherit" },
    );
    if (res.status !== 0) {
        console.error(`[FAIL] ${cell} exit=${res.status}`);
    }
    if (existsSync(cellOut)) cells.push(JSON.parse(readFileSync(cellOut, "utf8")));
    else cells.push({ cell, ok: false, node: null, error: `probe exit ${res.status}` });
}

// ---------------------------------------------------------------- merge external cells

for (const file of includes) {
    if (!existsSync(file)) {
        console.error(`[FAIL] include 不存在：${file}`);
        process.exitCode = 1;
        continue;
    }
    const ext = JSON.parse(readFileSync(file, "utf8"));
    const list = Array.isArray(ext) ? ext : [ext];
    for (const item of list) {
        const dup = cells.findIndex((c) => c.cell === item.cell);
        if (dup >= 0) cells[dup] = item;
        else cells.push(item);
        console.log(`include: ${item.cell} ok=${item.ok}`);
    }
}

// ---------------------------------------------------------------- validate + render

const STAGE_ASSERT = {
    "install-2.1.1": (s) => s.versions.tokens === "2.1.1" && s.versions.ogImage === "2.1.1",
    "build-2.1.1": (s) => s.verify?.ok === true,
    "upgrade-2.1.2": (s) => s.versions.tokens === "2.1.2" && s.versions.ogImage === "2.1.2",
    "build-2.1.2": (s) => s.verify?.ok === true,
    "next-minor-rehearsal": (s) => s.versions.tokens === NEXT_VERSION,
    "build-next-minor": (s) => s.verify?.ok === true,
    "rollback-pin-2.1.2": (s) => s.versions.tokens === "2.1.2",
    "build-rollback-pin": (s) => s.verify?.ok === true,
    "rollback-lockfile-ci": (s) => s.versions.tokens === "2.1.2",
    "build-rollback-lock": (s) => s.verify?.ok === true,
};

const problems = [];
const rendered = [];
for (const cell of cells) {
    if (cell.missing) {
        problems.push(`${cell.cell}: 缺该 Node 大版本，未跑`);
        continue;
    }
    if (!cell.ok) problems.push(`${cell.cell}: probe ok=false`);
    for (const [name, assert] of Object.entries(STAGE_ASSERT)) {
        const stage = (cell.stages || []).find((s) => s.name === name);
        if (!stage) {
            problems.push(`${cell.cell}: 缺阶段 ${name}`);
            continue;
        }
        if (!stage.ok) problems.push(`${cell.cell}: 阶段 ${name} 失败`);
        else if (!assert(stage)) problems.push(`${cell.cell}: 阶段 ${name} 断言不满足`);
    }
    rendered.push(cell);
}

const table = [
    "| Cell | Node | npm | OS | 首装 `2.1.1` (s) | 升级 `2.1.2` (s) | minor 预演 (s) | pin 回滚 (s) | lockfile 回滚 (s) | peer 警告 | 其它 npm 警告 | 结果 |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
];
for (const c of rendered) {
    const ms = c.installMs || {};
    const s = (k) => ((ms[k] || 0) / 1000).toFixed(1);
    table.push(
        `| \`${c.cell}\` | ${c.node} | ${c.npm} | ${c.platform} ${c.osRelease} | ${s("install-2.1.1")} | ` +
            `${s("upgrade-2.1.2")} | ${s("next-minor-rehearsal")} | ${s("rollback-pin-2.1.2")} | ` +
            `${s("rollback-lockfile-ci")} | ${(c.peerWarnings || []).length} | ` +
            `${(c.otherWarnings || []).length} | ${c.ok ? "PASS" : "FAIL"} |`,
    );
}

const summary = {
    card: "M5-6",
    generatedAt: new Date().toISOString(),
    registry: {
        base: "2.1.1",
        current: "2.1.2",
        nextMinorRehearsal: NEXT_VERSION,
        note: `registry 上不存在 ${NEXT_VERSION}：该列用本地打包的同源 tarball 预演`,
    },
    fixture,
    ok: problems.length === 0,
    problems,
    cells: rendered,
    markdown: table.join("\n"),
};

writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n");
console.log(`\n${table.join("\n")}\n`);
console.log(`MATRIX ${summary.ok ? "PASS" : "FAIL"}  cells=${rendered.length}  → ${outPath}`);
if (problems.length) {
    for (const p of problems) console.error(` - ${p}`);
}
process.exit(summary.ok ? 0 : 1);
