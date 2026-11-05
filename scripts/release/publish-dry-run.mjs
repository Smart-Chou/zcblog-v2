#!/usr/bin/env node
// M4-4 · 发布命令的 dry-run 证据（**绝不写 registry**）
//
//   node scripts/release/publish-dry-run.mjs [--out <dir>] [--json]
//
// 做法：npm pack 出真 tarball → 对同一批 tarball 跑 `npm publish --dry-run`。
// dry-run 不会发起写入请求；这里只证明「发布命令能跑通、发的是哪些文件、多大」。
// 真 `changeset publish` 需要 npm 登录态与 registry 写入，本卡不做（见 docs/release.md）。
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPackages, makeCollector, report, runSync } from "./lib.mjs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const getArg = (name) => {
    const inline = argv.find((a) => a.startsWith(`${name}=`));
    if (inline) return inline.slice(name.length + 1);
    const i = argv.indexOf(name);
    return i === -1 ? null : (argv[i + 1] ?? null);
};
const outDir = path.resolve(getArg("--out") ?? path.join(os.tmpdir(), "dogeared-publish-dryrun"));

const c = makeCollector();
const packages = loadPackages();
mkdirSync(outDir, { recursive: true });

const evidence = [];
for (const p of packages) {
    const pkgDir = path.join(path.dirname(p.pkgPath));
    const dest = path.join(outDir, p.dir.replace("/", "-"));
    mkdirSync(dest, { recursive: true });

    // 1) 真打包（dry-run 的输入必须是真 tarball，而不是目录）
    const pack = runSync("npm", ["pack", "--pack-destination", dest, "--ignore-scripts"], {
        cwd: pkgDir,
        allowFail: true,
    });
    const tgzName = pack.out.trim().split("\n").filter(Boolean).pop() ?? "";
    const tgz = path.join(dest, tgzName);
    const packed = pack.code === 0 && tgzName.endsWith(".tgz") && readFileSync(tgz).length > 0;
    if (!packed) {
        c.fail(`D0:${p.name}`, `npm pack 失败`, pack.combined.slice(0, 800));
        continue;
    }
    const bytes = readFileSync(tgz);
    const sha512 = createHash("sha512").update(bytes).digest("base64");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    c.pass(
        `D0:${p.name}`,
        `npm pack 产出 ${tgzName}（${bytes.length} B, sha256 ${sha256.slice(0, 12)}…）`,
    );

    // 2a) 包目录里直接 publish --dry-run（M4-3 提醒：private 时它 exit 0 也不报 EPRIVATE）
    const inDir = runSync("npm", ["publish", "--dry-run", "--ignore-scripts"], {
        cwd: pkgDir,
        allowFail: true,
    });
    // 2b) 对 tarball 显式 publish --dry-run（带 access/tag，等价 CI 里 changeset 调用的 npm 参数）
    const fromTgz = runSync(
        "npm",
        ["publish", tgz, "--dry-run", "--access", "public", "--tag", "latest", "--ignore-scripts"],
        { cwd: pkgDir, allowFail: true },
    );

    const variants = [
        { variant: "in-dir", r: inDir, cmd: "npm publish --dry-run" },
        {
            variant: "tarball",
            r: fromTgz,
            cmd: "npm publish <tgz> --dry-run --access public --tag latest",
        },
    ];
    const record = {
        name: p.name,
        version: p.version,
        tgz: tgzName,
        bytes: bytes.length,
        sha256,
        sha512,
        variants: [],
    };
    let anyOk = false;
    for (const v of variants) {
        const ok = v.r.code === 0 && !/npm (err|ERR)/i.test(v.r.combined);
        const publishLine =
            (v.r.combined.match(/npm notice Publishing to .*/g) ?? []).join("\n") ||
            (v.r.combined.match(/^\+ .*/gm) ?? []).join("\n") ||
            "";
        record.variants.push({ variant: v.variant, cmd: v.cmd, exit: v.r.code, ok, publishLine });
        if (ok) anyOk = true;
        else
            c.warn(
                `D1:${p.name}:${v.variant}`,
                `${v.cmd} exit ${v.r.code}（该变体不可作为发布证据）`,
                v.r.combined
                    .split("\n")
                    .filter((l) => /err|EPRIVATE|E404|ENEEDAUTH/i.test(l))
                    .slice(0, 4)
                    .join("\n"),
            );
    }
    if (anyOk)
        c.pass(
            `D1:${p.name}`,
            `至少一个 publish --dry-run 变体成功（${record.variants
                .filter((v) => v.ok)
                .map((v) => v.variant)
                .join(", ")}）`,
            record.variants
                .map(
                    (v) =>
                        `${v.variant}: exit ${v.exit}${v.publishLine ? ` | ${v.publishLine.split("\n")[0]}` : ""}`,
                )
                .join("\n"),
        );
    else c.fail(`D1:${p.name}`, "所有 publish --dry-run 变体都失败，发布命令不可用");

    // 3) 证明「没有真的发出去」：dry-run 输出里必须出现 dry-run 字样，且不存在真实上传成功的 201/200 回执
    const allOut = variants.map((v) => v.r.combined).join("\n");
    if (/\+ (?:@|)(?:marxchou\/)?[a-z-]+@\d+\.\d+\.\d+/.test(allOut) && /dry-run/i.test(allOut))
        c.pass(
            `D2:${p.name}`,
            "输出含 dry-run 回执（+ pkg@version + dry-run 标记），无 registry 写入",
        );
    else
        c.info(
            `D2:${p.name}`,
            "dry-run 回执文本不完整，已原样留档",
            allOut.split("\n").slice(-6).join("\n"),
        );

    evidence.push(record);
}
report("publish --dry-run（不写 registry）", c.results, { json, extra: { outDir, evidence } });
writeFileSync(
    path.join(outDir, "dry-run-evidence.json"),
    JSON.stringify({ outDir, evidence }, null, 2),
);
console.log(`\n证据落盘：${path.join(outDir, "dry-run-evidence.json")}`);
process.exit(c.results.some((r) => r.level === "FAIL") ? 1 : 0);
