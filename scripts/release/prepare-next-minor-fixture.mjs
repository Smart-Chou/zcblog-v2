#!/usr/bin/env node
// M5-6 · 「下一 minor」升级预演包（本地打包，不入 registry）
//
// registry 上目前只有 2.1.0 / 2.1.1 / 2.1.2；下一 minor（2.2.0）还没发。
// 为了证明升级文档里的步骤在「minor 升级」上不是纸面承诺，本脚本把仓库里的两个包
// 复制到临时目录、只把 version 改成目标 minor、`npm pack --ignore-scripts` 打成本地
// tarball，供 consumer-probe.mjs 以 `npm install <tgz>` 的方式走一遍真实升级。
//
// 边界：不写 packages/**（复制到临时目录再改），不 publish，不改仓库里的版本号。
//
// 用法：
//   node scripts/release/prepare-next-minor-fixture.mjs --version=2.2.0 --out=/tmp/fx
// 输出（stdout JSON + 末行 INSTALL 命令）：
//   {"version":"2.2.0","tarballs":{...}}

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(
    process.argv
        .slice(2)
        .filter((a) => a.startsWith("--"))
        .map((a) => {
            const [k, ...rest] = a.replace(/^--/, "").split("=");
            return [k, rest.join("=")];
        }),
);

const version = args.version || "2.2.0";
const outDir = path.resolve(args.out || path.join(repoRoot, ".tmp-next-minor"));
if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`version 必须是 x.y.z：${version}`);
    process.exit(2);
}

const packages = [
    { dir: "tokens", name: "@marxchou/dogeared-tokens", tarName: "tokens" },
    { dir: "og-image", name: "@marxchou/dogeared-og-image", tarName: "og-image" },
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const tarballs = {};
for (const p of packages) {
    const src = path.join(repoRoot, "packages", p.dir);
    const dst = path.join(outDir, "src", p.dir);
    cpSync(src, dst, { recursive: true, filter: (s) => !s.includes(`${path.sep}node_modules`) });

    const pkgPath = path.join(dst, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const from = pkg.version;
    pkg.version = version;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + "\n");

    // og-image 的 dist 必须已经在仓库里构建过（scripts/build.mjs 依赖仓库根 typescript，
    // 复制出去就跑不了），--ignore-scripts 直接打现成产物。
    if (p.dir === "og-image" && !existsSync(path.join(dst, "dist", "index.js"))) {
        console.error(
            "packages/og-image/dist 缺失：请先在仓库根跑 `pnpm --filter @marxchou/dogeared-og-image build`",
        );
        process.exit(2);
    }

    const res = spawnSync("npm", ["pack", "--ignore-scripts", "--pack-destination", outDir], {
        cwd: dst,
        encoding: "utf8",
    });
    if (res.status !== 0) {
        console.error(res.stdout, res.stderr);
        process.exit(1);
    }
    const file = path.join(outDir, res.stdout.trim().split("\n").pop().trim());
    const packed = spawnSync("tar", ["-xzOf", file, "package/package.json"], { encoding: "utf8" });
    const packedVersion = packed.status === 0 ? JSON.parse(packed.stdout).version : null;
    if (packedVersion !== version) {
        console.error(`tarball 内版本不符：${file} → ${packedVersion}`);
        process.exit(1);
    }
    tarballs[p.tarName] = { package: p.name, from, file, bytes: readFileSync(file).length };
}

const result = { version, tarballs };
console.log(JSON.stringify(result, null, 2));
console.log(`INSTALL ${tarballs.tokens.file} ${tarballs["og-image"].file}`);
