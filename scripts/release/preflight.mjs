#!/usr/bin/env node
// M4-4 · 发布前检查（只读，不写 registry、不改包内容）
//
//   node scripts/release/preflight.mjs                      # 检查模式：已知阻断项降级为 WARN
//   node scripts/release/preflight.mjs --mode=publish        # 发布模式：private / 阻断项 / publish-plan 为空 → 硬失败
//   node scripts/release/preflight.mjs --tag v2.1.0 --json
//
// 判据来源：M4-1（元数据/法务）、M4-2（tokens 消费）、M4-3（og-image 消费）。
// 注意：本脚本不改 packages/**——发现阻断只报告，修复是包卡的事。
import { readFileSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    REPO_ROOT,
    checkVersions,
    exists,
    fileSize,
    loadPackages,
    makeCollector,
    npmPackDryRun,
    pnpmEnv,
    report,
    runSync,
} from "./lib.mjs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const getArg = (name) => {
    const inline = argv.find((a) => a.startsWith(`${name}=`));
    if (inline) return inline.slice(name.length + 1);
    const i = argv.indexOf(name);
    return i === -1 ? null : (argv[i + 1] ?? null);
};
const mode = getArg("--mode") ?? "check";
const tag = getArg("--tag");

if (!["check", "publish"].includes(mode)) {
    console.error(`--mode 只能是 check 或 publish，收到：${mode}`);
    process.exit(2);
}

const c = makeCollector();
const isPublish = mode === "publish";
// 阻断项：publish 模式下硬失败，check 模式下只降级为 WARN（让 PR 门禁不被已知缺口卡住）
const blocker = (id, msg, detail) =>
    isPublish ? c.fail(id, msg, detail) : c.warn(id, msg, detail);
// 建议项：任何模式下都只是 WARN
const advisory = (id, msg, detail) => c.warn(id, msg, detail);

const packages = loadPackages();

// ---------------------------------------------------------------- V: 版本 / 配置
checkVersions(c, { packages, tag });

// ---------------------------------------------------------------- P: private 闸门
for (const p of packages) {
    if (p.private) {
        if (isPublish)
            c.fail(
                "P1",
                `${p.name} 仍是 private:true，禁止发布`,
                "翻转 private 是发布卡的事；private 下 changeset publish 会静默空转",
            );
        else c.info("P1", `${p.name} private:true（检查模式允许；发布前需翻转）`);
    } else {
        c.pass("P1", `${p.name} private:false，可发布`);
    }
}

// ---------------------------------------------------------------- P2: LICENSE / NOTICE
for (const p of packages) {
    const dir = path.join(REPO_ROOT, p.dir);
    for (const f of ["LICENSE", "NOTICE"]) {
        const fp = path.join(dir, f);
        if (!exists(fp)) {
            c.fail(`P2:${p.name}`, `缺 ${f}`, p.dir);
            continue;
        }
        const size = fileSize(fp);
        if (size < 200) c.warn(`P2:${p.name}`, `${f} 只有 ${size} B，疑似占位/残缺`);
        else c.pass(`P2:${p.name}`, `${f} 存在（${size} B）`);
        const body = readFileSync(fp, "utf8");
        if (
            /<[^>\n]*(year|name|copyright holder)[^>\n]*>/i.test(body) ||
            /\bTODO\b|\bFIXME\b|\bplaceholder\b|<占位>/i.test(body)
        )
            c.warn(`P2:${p.name}`, `${f} 里仍有占位符，发布前人工确认`);
    }
    if (!(p.pkg.files ?? []).includes("LICENSE") || !(p.pkg.files ?? []).includes("NOTICE"))
        c.warn(
            `P2:${p.name}`,
            `files 字段未显式列出 LICENSE/NOTICE（靠 npm 默认规则，pack 清单会兜底）`,
        );
}

// ---------------------------------------------------------------- P3: npm pack 清单
const packResults = [];
for (const p of packages) {
    const { ok, meta, error, raw } = npmPackDryRun(p.dir);
    if (!ok || !meta) {
        c.fail(`P3:${p.name}`, "npm pack --dry-run 失败", error ?? raw ?? "");
        continue;
    }
    const files = (meta.files ?? []).map((f) => f.path);
    packResults.push({
        name: meta.name ?? p.name,
        version: meta.version ?? p.version,
        filename: meta.filename,
        size: meta.size,
        unpackedSize: meta.unpackedSize,
        fileCount: files.length,
        files,
    });
    const required = ["package.json", "README.md", "LICENSE", "NOTICE"];
    const missing = required.filter((f) => !files.includes(f));
    if (missing.length)
        c.fail(`P3:${p.name}`, `pack 清单缺文件：${missing.join(", ")}`, files.join("\n"));
    else
        c.pass(
            `P3:${p.name}`,
            `pack 清单完整（${files.length} 文件 / ${meta.size} B packed / ${meta.unpackedSize} B 解包）`,
            files.join("\n"),
        );

    const forbidden = [
        [/node_modules\//, "node_modules"],
        [/(^|\/)\.env($|\.)/, ".env"],
        [/(^|\/)\.git\//, ".git"],
        [/^\/Users\//, "本机绝对路径"],
        [/\.tgz$/, "嵌套 tarball"],
        [/(^|\/)test(s)?\//, "测试目录"],
        [/\.(spec|test)\.[cm]?[jt]s$/, "测试文件"],
    ];
    const hits = files.flatMap((f) =>
        forbidden.filter(([re]) => re.test(f)).map(([, label]) => `${label} → ${f}`),
    );
    if (hits.length) c.fail(`P3b:${p.name}`, `pack 清单含不该发布的路径`, hits.join("\n"));
    else c.pass(`P3b:${p.name}`, "pack 清单无 node_modules/.env/测试/本机路径");

    // 内容级：禁止本机绝对路径泄漏（只扫文本类文件，二进制跳过）
    const leaks = [];
    for (const f of (meta.files ?? []).filter((f) =>
        /\.(md|json|css|mjs|js|ts|astro|txt)$/.test(f.path),
    )) {
        if (!exists(path.join(REPO_ROOT, p.dir, f.path))) continue; // npm 已打包的合成文件
        const body = readFileSync(path.join(REPO_ROOT, p.dir, f.path), "utf8");
        const m = /\/Users\/[A-Za-z0-9._-]+/.exec(body);
        if (m) leaks.push(`${f.path}: ${m[0]}`);
    }
    if (leaks.length) c.fail(`P3c:${p.name}`, "packed 文本里有本机绝对路径", leaks.join("\n"));
    else c.pass(`P3c:${p.name}`, "packed 文本无本机绝对路径");
}

// ---------------------------------------------------------------- P4: 发布阻断项（M4-2/M4-3 findings）
for (const p of packages) {
    const exportsMap = p.pkg.exports ?? {};
    const dot = exportsMap["."];
    const dotImport = typeof dot === "string" ? dot : (dot?.import ?? dot?.default);
    const hasBuild = Boolean(p.pkg.scripts?.build);

    if (!dot) {
        blocker(
            `P4a:${p.name}`,
            `exports 没有 "." 入口：裸 import 会 ERR_PACKAGE_PATH_NOT_EXPORTED（M4-2 F1）`,
            "修法：补最小的 CSS/JSON 入口或明确文档只支持子路径",
        );
    } else if (typeof dotImport === "string" && dotImport.endsWith(".ts") && !hasBuild) {
        blocker(
            `P4b:${p.name}`,
            `"exports[\\".\\"]" 指向 TS 源码（${dotImport}）且无 build 脚本：裸 Node import 必报 ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING（M4-3 F1）`,
            "修法：加 build 产出 dist/*.js + d.ts 并让 exports 指 dist；或 README 明确「仅 bundler 环境」",
        );
    } else {
        c.pass(
            `P4b:${p.name}`,
            `入口 ${dotImport ?? "(非字符串)"} 可被裸 Node 解析${hasBuild ? "（有 build 脚本）" : ""}`,
        );
    }

    // engines 覆盖当前 Node？
    const range = p.pkg.engines?.node;
    if (range) {
        const cur = Number(process.versions.node.split(".")[0]);
        // 支持常见的 `>=22`、`^22 || ^24`、`22` 写法；只判断 major，用于发布前提醒。
        const covers = String(range)
            .split("||")
            .some((part) => {
                const s = part.trim();
                const m = s.match(/^(>=|>|<=|<|\^|~)?\s*v?(\d+)/);
                if (!m) return false;
                const op = m[1] ?? "";
                const major = Number(m[2]);
                if (op === ">=") return cur >= major;
                if (op === ">") return cur > major;
                if (op === "<=") return cur <= major;
                if (op === "<") return cur < major;
                // `^22` / `~22` / 裸 `22`：本工具的用途是「当前 major 是否落在区间内」，
                // 不做完整 semver 求解；需要精确判断时交给 npm/engines 本身。
                return cur === major;
            });
        if (!covers)
            advisory(
                `P4c:${p.name}`,
                `engines.node="${range}" 不含当前 Node ${cur}，消费者每次安装都会刷 EBADENGINE（M4-3 F2）`,
                '修法：放宽为 ">=22"（与 M4-2 F4 同一决策）',
            );
        else c.pass(`P4c:${p.name}`, `engines.node="${range}" 覆盖当前 Node ${cur}`);
    } else {
        c.info(`P4c:${p.name}`, "无 engines 字段（可用，但建议声明 >=22）");
    }

    if (p.pkg.bin) {
        c.info(
            `P4d:${p.name}`,
            `随包 bin：${Object.keys(p.pkg.bin).join(", ")}（消费者机器上依赖仓内文件时可能直接 exit 1，M4-2 F2）`,
        );
    }
    if (p.pkg.peerDependencies && !p.pkg.peerDependenciesMeta) {
        c.info(
            `P4e:${p.name}`,
            `peer ${Object.keys(p.pkg.peerDependencies).join(", ")} 未标 optional（M4-3 F5）`,
        );
    }
    if (p.pkg.main?.endsWith(".ts") || p.pkg.module?.endsWith(".ts"))
        advisory(`P4f:${p.name}`, "main/module 指向 .ts，对非 bundler 消费者是误导（M4-3 F3）");
}

// ---------------------------------------------------------------- P5: changeset publish-plan（静默空转闸门）
let planJson = null;
{
    const { env, cleanup } = pnpmEnv();
    try {
        const r = runSync(
            "npx",
            [
                "changeset",
                "publish-plan",
                "--output",
                path.join(os.tmpdir(), "dogeared-publish-plan.json"),
            ],
            {
                env,
                allowFail: true,
            },
        );
        const planPath = path.join(os.tmpdir(), "dogeared-publish-plan.json");
        planJson = exists(planPath) ? JSON.parse(readFileSync(planPath, "utf8")) : null;
        // 判据以 publish-plan JSON 为准：plan 数组为空 = 这次发布不会有包进 registry
        const planned = Array.isArray(planJson?.plan) ? planJson.plan : null;
        const empty = planned
            ? planned.length === 0
            : /No projects to publish or tag/i.test(r.combined);
        if (mode === "publish") {
            if (empty)
                c.fail(
                    "P5",
                    "changeset publish-plan 为空：这次发布不会有任何包进 registry（典型原因：三包仍 private，或没有待发布的 changeset）",
                    `plan=${JSON.stringify(planJson ?? null).slice(0, 300)}\n这正是「静默空转」场景，release 链路必须在这里停住`,
                );
            else
                c.pass(
                    "P5",
                    `publish-plan 有 ${planned?.length ?? "?"} 项，发布不会空转`,
                    JSON.stringify(planJson ?? {}).slice(0, 800),
                );
        } else if (empty) {
            c.warn(
                "P5",
                "publish-plan 为空（三包 private 或没有待发布 changeset）；检查模式下不拦",
                r.combined.split("\n").filter(Boolean).slice(0, 4).join("\n"),
            );
        } else {
            c.pass(
                "P5",
                `publish-plan 有 ${planned?.length ?? "?"} 项`,
                JSON.stringify(planJson ?? {}).slice(0, 800),
            );
        }
    } catch (e) {
        c.warn("P5", `publish-plan 执行异常：${e.message.split("\n")[0]}`);
    } finally {
        cleanup();
    }
}

// ---------------------------------------------------------------- 汇总
const ok = report(
    isPublish ? "发布前检查（publish 模式）" : "发布前检查（check 模式）",
    c.results,
    {
        json,
        extra: {
            mode,
            tag,
            version: packages[0]?.version ?? null,
            pack: packResults.map((p) => ({
                name: p.name,
                version: p.version,
                filename: p.filename,
                size: p.size,
                fileCount: p.fileCount,
            })),
            publishPlan: planJson,
        },
    },
);
process.exit(ok ? 0 : 1);
