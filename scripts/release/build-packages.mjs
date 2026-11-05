#!/usr/bin/env node
// M4-4 · 包构建步骤（release 链里的 "build"，只构建 packages/*，不构站点）
//
//   node scripts/release/build-packages.mjs [--json]
//
// 站点构建（`pnpm build:ci`）不属于发布链：它依赖私有内容仓、产出的是 dist/ 静态站，
// 和 npm 包产物无关，由 deploy-matrix / deploy workflow 负责。发布链只关心「包里发了什么」。
//
// 当前三包都没有 build 脚本（只发源码），本脚本会显式说明这一点，
// 并校验每个 exports / main / types 目标在磁盘上真的存在——build 一旦落地（M4-6），这里自动开始跑构建。
import { existsSync } from "node:fs";
import path from "node:path";
import { loadPackages, makeCollector, pnpmEnv, report, runSync } from "./lib.mjs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");

const c = makeCollector();
const packages = loadPackages();
const { env, cleanup } = pnpmEnv();
const built = [];

try {
    for (const p of packages) {
        const buildScript = p.pkg.scripts?.build;
        if (!buildScript) {
            c.info(
                `B1:${p.name}`,
                "没有 build 脚本：按源码发布（publish 模式下由 preflight P4b 拦）",
            );
            continue;
        }
        const r = runSync("pnpm", ["run", "build"], {
            cwd: path.join(path.dirname(p.pkgPath)),
            env,
            allowFail: true,
        });
        if (r.code === 0) {
            built.push(p.name);
            c.pass(`B1:${p.name}`, `build 成功（${buildScript}）`);
        } else {
            c.fail(
                `B1:${p.name}`,
                `build 失败（${buildScript}），发布链在此停住`,
                r.combined.slice(-1200),
            );
        }
    }

    // exports / main / types 目标必须真实存在（build 产物对不上就在这里暴露，而不是发出去才知道）
    for (const p of packages) {
        const dir = path.dirname(p.pkgPath);
        const targets = new Set();
        const collect = (v) => {
            if (typeof v === "string") {
                if (v.startsWith("./")) targets.add(v);
            } else if (v && typeof v === "object") Object.values(v).forEach(collect);
        };
        collect(p.pkg.exports ?? {});
        for (const k of ["main", "module", "types"])
            if (typeof p.pkg[k] === "string") targets.add(p.pkg[k]);
        const missing = [...targets].filter((t) => !existsSync(path.join(dir, t)));
        if (missing.length)
            c.fail(
                `B2:${p.name}`,
                `声明入口在磁盘上不存在：${missing.join(", ")}`,
                `包目录 ${p.dir}`,
            );
        else
            c.pass(
                `B2:${p.name}`,
                `${targets.size} 个声明入口全部存在（${[...targets].slice(0, 3).join(", ")}${targets.size > 3 ? " …" : ""}）`,
            );
    }
} finally {
    cleanup();
}

report("包构建（packages/*）", c.results, { json, extra: { built } });
process.exit(c.results.some((r) => r.level === "FAIL") ? 1 : 0);
