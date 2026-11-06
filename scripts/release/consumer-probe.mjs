#!/usr/bin/env node
// M5-6 · 消费者升级演练探针（单格）
//
// 在一个临时目录里从零搭一个最小 Astro 消费者，按发布文档的顺序走完整生命周期：
//   1. install  : 安装 2.1.1（`npm install` 显式版本）
//   2. build    : `npm run build`，断言 tokens CSS 变量 + OG PNG
//   3. upgrade  : `npm install` 升到 2.1.2（同一等价的最小版本升级动作）
//   4. build    : 再断言
//   5. next     : 安装本地打包的「下一 minor」(默认 2.2.0) 预演包，走动升级路径
//   6. build    : 再断言
//   7. rollback : 从预演版本回到 registry 2.1.2（pin 回滚）
//   8. build    : 再断言
//   9. lockroll : 用备份的 package.json / package-lock.json 还原后 `npm ci`（锁文件回滚）
//  10. build    : 再断言
//
// 只读 registry，不写任何发布状态。输出一份 JSON（stdout + --out 文件），
// 由 verify-consumer-matrix.mjs 汇总成文档用的矩阵表。
//
// 用法：
//   node scripts/release/consumer-probe.mjs --cell=node22-darwin \
//     --next-tokens=/tmp/fx/tokens-2.2.0.tgz --next-og=/tmp/fx/og-image-2.2.0.tgz \
//     --out=/tmp/matrix/node22-darwin.json
//
// 退出码：0 = 全阶段 PASS；1 = 有阶段失败；2 = 参数/环境错误。

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const BASE_VERSION = "2.1.1"; // 上一 patch：升级起点（已在 registry 上）
const CURRENT_VERSION = "2.1.2"; // 当前 latest：升级终点（已在 registry 上）
const ASTRO_RANGE = "^7.3.6"; // og-image 的 peer 约束

const args = Object.fromEntries(
    process.argv
        .slice(2)
        .filter((a) => a.startsWith("--"))
        .map((a) => {
            const [k, ...rest] = a.replace(/^--/, "").split("=");
            return [k, rest.join("=") || "true"];
        }),
);

const cell = args.cell || `node${process.versions.node.split(".")[0]}-${process.platform}`;
const outPath = args.out || path.join(os.tmpdir(), `consumer-probe-${cell}.json`);
const workDir = args.dir || path.join(os.tmpdir(), `dogeared-consumer-${cell}`);
const nextTokens = args["next-tokens"]; // 本地 2.2.0 预演 tarball（可选）
const nextOg = args["next-og"];
const keep = args.keep === "true";

const nodeBinDir = path.dirname(process.execPath);
const env = {
    ...process.env,
    PATH: `${nodeBinDir}:${process.env.PATH}`,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_progress: "false",
    npm_config_update_notifier: "false",
    // 保证每次都真实走 registry/本地 tarball，不读用户级缓存以外的私有 registry 配置
    npm_config_registry: process.env.npm_config_registry || "https://registry.npmjs.org/",
};

const stages = [];
let failures = 0;

function sh(cmd, argv, opts = {}) {
    const started = performance.now();
    const res = spawnSync(cmd, argv, {
        cwd: opts.cwd || workDir,
        env,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        timeout: opts.timeout || 10 * 60 * 1000,
    });
    const ms = Math.round(performance.now() - started);
    const stdout = res.stdout || "";
    const stderr = res.stderr || "";
    return {
        ms,
        status: res.status,
        stdout,
        stderr,
        error: res.error ? String(res.error.message || res.error) : null,
    };
}

function classifyWarnings(stderr) {
    const lines = stderr
        .split("\n")
        .filter((l) => /npm (warn|error)|ERESOLVE|peer dep|deprecated/i.test(l))
        .map((l) => l.trim())
        .filter((l) => !/New major version of npm|Unknown project config/i.test(l));
    const peer = lines.filter((l) => /ERESOLVE|peer dep|peerDependencies?/i.test(l));
    const deprecations = lines.filter((l) => /deprecated/i.test(l));
    const other = lines.filter((l) => !peer.includes(l) && !deprecations.includes(l));
    return { peer, deprecations, other };
}

function record(name, kind, cmdLabel, res, extra = {}) {
    const warn = classifyWarnings(res.stderr);
    const entry = {
        name,
        kind,
        command: cmdLabel,
        ok: res.status === 0,
        ms: res.ms,
        versions: installedVersions(),
        peerWarnings: warn.peer,
        deprecationWarnings: warn.deprecations,
        otherWarnings: warn.other,
        ...extra,
    };
    if (!entry.ok) {
        failures += 1;
        entry.stdoutTail = res.stdout.split("\n").slice(-25).join("\n");
        entry.stderrTail = res.stderr.split("\n").slice(-25).join("\n");
    }
    stages.push(entry);
    console.log(
        `[${entry.ok ? "PASS" : "FAIL"}] ${name.padEnd(18)} ${String(entry.ms).padStart(6)}ms  ` +
            `${entry.versions.tokens || "?"}/${entry.versions.ogImage || "?"}` +
            `  peer=${entry.peerWarnings.length} other-warn=${entry.otherWarnings.length}`,
    );
    return entry;
}

function installedVersions() {
    const read = (p) => {
        try {
            return JSON.parse(
                readFileSync(path.join(workDir, "node_modules", p, "package.json"), "utf8"),
            ).version;
        } catch {
            return null;
        }
    };
    return {
        tokens: read("@marxchou/dogeared-tokens"),
        ogImage: read("@marxchou/dogeared-og-image"),
        astro: read("astro"),
    };
}

function writeConsumerFixture() {
    mkdirSync(path.join(workDir, "src", "pages", "og"), { recursive: true });
    writeFileSync(
        path.join(workDir, "package.json"),
        JSON.stringify(
            {
                name: `dogeared-consumer-${cell}`,
                private: true,
                type: "module",
                scripts: { build: "astro build" },
                dependencies: {
                    astro: ASTRO_RANGE,
                    "@marxchou/dogeared-tokens": BASE_VERSION,
                    "@marxchou/dogeared-og-image": BASE_VERSION,
                },
            },
            null,
            4,
        ) + "\n",
    );
    writeFileSync(
        path.join(workDir, "astro.config.mjs"),
        'import { defineConfig } from "astro/config";\nexport default defineConfig({});\n',
    );
    writeFileSync(
        path.join(workDir, "src", "pages", "index.astro"),
        `---
import "@marxchou/dogeared-tokens/variables.css";
import "@marxchou/dogeared-tokens/tokens.css";
---
<html lang="en">
    <head><title>consumer probe</title></head>
    <body style="background: var(--color-bg); color: var(--color-fg)">
        <h1 style="color: var(--color-accent)">dogeared consumer probe</h1>
    </body>
</html>
`,
    );
    writeFileSync(
        path.join(workDir, "src", "pages", "og", "[...og].png.ts"),
        `import { createOgImageRoute } from "@marxchou/dogeared-og-image";

const posts = [
    {
        id: "hello",
        title: "Hello Dogeared",
        tags: ["demo"],
        pubDate: new Date("2026-11-06"),
        description: "A minimal OG image",
    },
];

export const getStaticPaths = () => posts.map((post) => ({ params: { og: post.id } }));

export const GET = createOgImageRoute({
    posts: posts.map((p) => ({
        slug: p.id,
        title: p.title,
        tags: p.tags,
        pubDate: p.pubDate,
        description: p.description,
    })),
    site: {
        title: "My Site",
        author: "Me",
        url: "https://example.com",
        description: "A site using Dogeared",
    },
    theme: { background: "#FDF9F2", foreground: "#121316", accent: "#C84B31" },
});
`,
    );
}

function pngSize(file) {
    const buf = readFileSync(file);
    const isPng = buf
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (!isPng) return { isPng: false };
    return { isPng: true, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function verifyArtifacts() {
    const html = existsSync(path.join(workDir, "dist", "index.html"))
        ? readFileSync(path.join(workDir, "dist", "index.html"), "utf8")
        : "";
    const cssVars = ["--color-bg", "--color-accent", "--color-fg"].filter((v) => html.includes(v));
    const ogFile = path.join(workDir, "dist", "og", "hello.png");
    const png = existsSync(ogFile) ? pngSize(ogFile) : { isPng: false };
    return {
        html: html.length,
        cssVars,
        og: png,
        ok:
            html.length > 0 &&
            cssVars.length === 3 &&
            png.isPng &&
            png.width === 1200 &&
            png.height === 630,
    };
}

function readJson(p) {
    return JSON.parse(readFileSync(p, "utf8"));
}

// ---------------------------------------------------------------- lifecycle

rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });
if (!existsSync(nodeBinDir)) {
    console.error(`找不到 node bin 目录：${nodeBinDir}`);
    process.exit(2);
}

const base = {
    cell,
    node: process.versions.node,
    npm: (spawnSync("npm", ["-v"], { env, encoding: "utf8" }).stdout || "").trim(),
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    registry: env.npm_config_registry,
    nextMinorFixture: nextTokens && nextOg ? { tokens: nextTokens, ogImage: nextOg } : null,
};

writeConsumerFixture();

let res = sh("npm", [
    "install",
    `astro@${ASTRO_RANGE}`,
    `@marxchou/dogeared-tokens@${BASE_VERSION}`,
    `@marxchou/dogeared-og-image@${BASE_VERSION}`,
]);
record("install-2.1.1", "install", `npm install astro@${ASTRO_RANGE} …@${BASE_VERSION}`, res);

res = sh("npm", ["run", "build"]);
record("build-2.1.1", "build", "npm run build", res, { verify: verifyArtifacts() });

res = sh("npm", [
    "install",
    `@marxchou/dogeared-tokens@${CURRENT_VERSION}`,
    `@marxchou/dogeared-og-image@${CURRENT_VERSION}`,
]);
record("upgrade-2.1.2", "install", `npm install …@${CURRENT_VERSION}`, res);

res = sh("npm", ["run", "build"]);
record("build-2.1.2", "build", "npm run build", res, { verify: verifyArtifacts() });

let lockSnapshot = null;
if (nextTokens && nextOg) {
    // 锁文件快照：回滚时还原 package.json + package-lock.json 再 npm ci
    lockSnapshot = {
        pkg: readFileSync(path.join(workDir, "package.json"), "utf8"),
        lock: readFileSync(path.join(workDir, "package-lock.json"), "utf8"),
    };

    res = sh("npm", ["install", nextTokens, nextOg]);
    record(
        "next-minor-rehearsal",
        "install",
        "npm install <tokens-2.2.0.tgz> <og-image-2.2.0.tgz>",
        res,
        {
            note: "本地打包的下一 minor 预演包；registry 上不存在该版本",
        },
    );

    res = sh("npm", ["run", "build"]);
    record("build-next-minor", "build", "npm run build", res, { verify: verifyArtifacts() });

    res = sh("npm", [
        "install",
        `@marxchou/dogeared-tokens@${CURRENT_VERSION}`,
        `@marxchou/dogeared-og-image@${CURRENT_VERSION}`,
    ]);
    record("rollback-pin-2.1.2", "install", `npm install …@${CURRENT_VERSION}`, res);

    res = sh("npm", ["run", "build"]);
    record("build-rollback-pin", "build", "npm run build", res, { verify: verifyArtifacts() });

    writeFileSync(path.join(workDir, "package.json"), lockSnapshot.pkg);
    writeFileSync(path.join(workDir, "package-lock.json"), lockSnapshot.lock);
    res = sh("npm", ["ci"]);
    record("rollback-lockfile-ci", "install", "npm ci（还原升级前的 package.json + lock）", res);

    res = sh("npm", ["run", "build"]);
    record("build-rollback-lock", "build", "npm run build", res, { verify: verifyArtifacts() });
}

const ok = failures === 0 && stages.every((s) => s.kind !== "build" || s.verify?.ok !== false);
const summary = {
    ...base,
    startedAt: new Date().toISOString(),
    ok,
    failures,
    installMs: Object.fromEntries(
        stages.filter((s) => s.kind === "install").map((s) => [s.name, s.ms]),
    ),
    peerWarnings: stages.flatMap((s) => s.peerWarnings.map((line) => ({ stage: s.name, line }))),
    deprecationWarnings: stages.flatMap((s) =>
        s.deprecationWarnings.map((line) => ({ stage: s.name, line })),
    ),
    otherWarnings: stages.flatMap((s) => s.otherWarnings.map((line) => ({ stage: s.name, line }))),
    stages,
    workDir: keep ? workDir : null,
};

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n");

const finalVersions = installedVersions();
console.log(
    `\nRESULT ${ok ? "PASS" : "FAIL"}  cell=${cell} node=${base.node} npm=${base.npm} ` +
        `platform=${base.platform} final=${finalVersions.tokens}/${finalVersions.ogImage}`,
);
console.log(`OUT ${outPath}`);
if (!keep) rmSync(workDir, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
