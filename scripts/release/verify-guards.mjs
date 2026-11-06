#!/usr/bin/env node
// M4-4 · 负向自检：证明这些闸门真的会红（不是只写了不生效的断言）
//
//   node scripts/release/verify-guards.mjs [--json]
//
// 每个用例都拿「改坏的副本」喂给同一个脚本，断言它 exit != 0。
// 全部在临时目录里做，真仓库只读。
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PACKAGE_DIRS, PUBLISH_DIRS, REPO_ROOT, makeCollector, report, runSync } from "./lib.mjs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const c = makeCollector();
const tmpRoot = path.join(os.tmpdir(), `dogeared-guards-${process.pid}`);
rmSync(tmpRoot, { recursive: true, force: true });
mkdirSync(tmpRoot, { recursive: true });

const realVerify = path.join(REPO_ROOT, "scripts/release/verify-versions.mjs");
const realPreflight = path.join(REPO_ROOT, "scripts/release/preflight.mjs");
const realWorkflowCheck = path.join(REPO_ROOT, "scripts/release/verify-workflow.mjs");
const realWf = path.join(REPO_ROOT, ".github/workflows/release.yml");

const expectFail = (id, label, res, mustMention) => {
    const mentioned = mustMention ? mustMention.test(res.combined) : true;
    if (res.code !== 0 && mentioned) c.pass(id, `${label} → exit ${res.code}（闸门生效）`);
    else if (res.code === 0)
        c.fail(id, `${label} → exit 0（闸门没拦住！）`, res.combined.slice(-800));
    else c.fail(id, `${label} → 红了但报错文本没命中 ${mustMention}`, res.combined.slice(-800));
};

// ---- G1 tag 与版本不一致 ----
expectFail(
    "G1",
    "tag v9.9.9 与三包版本 2.1.0 不一致",
    runSync("node", [realVerify, "--tag", "v9.9.9"], { allowFail: true }),
    /不一致/,
);

// ---- G2 版本 lockstep 破了 ----
{
    const dir = path.join(tmpRoot, "drift");
    mkdirSync(path.join(dir, "scripts"), { recursive: true });
    cpSync(path.join(REPO_ROOT, "scripts/release"), path.join(dir, "scripts/release"), {
        recursive: true,
    });
    cpSync(path.join(REPO_ROOT, "package.json"), path.join(dir, "package.json"));
    mkdirSync(path.join(dir, ".changeset"), { recursive: true });
    cpSync(
        path.join(REPO_ROOT, ".changeset/config.json"),
        path.join(dir, ".changeset/config.json"),
    );
    for (const p of ["tokens", "ui", "og-image"]) {
        mkdirSync(path.join(dir, "packages", p), { recursive: true });
        cpSync(
            path.join(REPO_ROOT, "packages", p, "package.json"),
            path.join(dir, "packages", p, "package.json"),
        );
    }
    const uiPkgPath = path.join(dir, "packages/ui/package.json");
    const uiPkg = JSON.parse(readFileSync(uiPkgPath, "utf8"));
    const baseVersion = JSON.parse(
        readFileSync(path.join(dir, "packages/tokens/package.json"), "utf8"),
    ).version;
    const [major, minor, patch] = baseVersion.split(".").map(Number);
    uiPkg.version = `${major}.${minor}.${patch + 1}`; // 只有 ui 前进 → lockstep 破
    writeFileSync(uiPkgPath, JSON.stringify(uiPkg, null, 4));

    expectFail(
        "G2",
        `只有 ui 前进到 ${uiPkg.version}（lockstep 破裂）`,
        runSync("node", [path.join(dir, "scripts/release/verify-versions.mjs")], {
            allowFail: true,
        }),
        /不一致/,
    );

    // ---- G3 fixed 组被删 ----
    const cfgPath = path.join(dir, ".changeset/config.json");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    cfg.fixed = [];
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 4));
    expectFail(
        "G3",
        ".changeset/config.json 的 fixed 组被清空",
        runSync("node", [path.join(dir, "scripts/release/verify-versions.mjs")], {
            allowFail: true,
        }),
        /fixed/,
    );
}

// ---- G4 发布清单（PUBLISH_DIRS）语义：清单内 private 必拒 / 清单外 private 放行 ----
// 用临时 workspace 造状态，不依赖真仓库当前是 private 还是已经发布过；
// 否则真发布完成后（版本已在 registry）这些负向用例会失效。
{
    const check = runSync("node", [realPreflight], { allowFail: true });
    if (check.code === 0) c.pass("G4c", "同一套判据在 check 模式下放行（exit 0），阻断项只报 WARN");
    else
        c.fail(
            "G4c",
            "check 模式被 known-blocker 拦住了（会挡住 PR 门禁）",
            check.combined.slice(-600),
        );
}

// ---- G4d/G4e 临时 workspace：发布态（tokens/og-image private:false + ui private:true + 有 pending changeset）----
// 这是 M4 真正要跑发布的状态；D-0120 下它必须整体放行，且 publish-plan 里不能出现 ui。
const p1Lines = (out) =>
    out
        .split("\n")
        .filter((l) => /^\[(PASS|FAIL|WARN|INFO|SKIP)\]\s+P1\s/.test(l))
        .map((l) => l.trim());

const buildPublishWorkspace = (
    name,
    { flipPrivate = [], unflip = [], privatize = [], version = null } = {},
) => {
    const ws = path.join(tmpRoot, name);
    mkdirSync(path.join(ws, "scripts"), { recursive: true });
    cpSync(path.join(REPO_ROOT, "scripts/release"), path.join(ws, "scripts/release"), {
        recursive: true,
    });
    for (const f of ["package.json", "pnpm-workspace.yaml", "LICENSE", "NOTICE"]) {
        cpSync(path.join(REPO_ROOT, f), path.join(ws, f));
    }
    mkdirSync(path.join(ws, ".changeset"), { recursive: true });
    cpSync(path.join(REPO_ROOT, ".changeset/config.json"), path.join(ws, ".changeset/config.json"));
    for (const dir of PACKAGE_DIRS) {
        cpSync(path.join(REPO_ROOT, dir), path.join(ws, dir), {
            recursive: true,
            filter: (src) => !src.includes("/node_modules"),
        });
    }
    // node_modules 走软链：副本里的 `npx changeset` 解析到本仓已装的 CLI，不联网装包
    symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(ws, "node_modules"), "dir");
    for (const dir of [...flipPrivate, ...unflip, ...privatize]) {
        const p = path.join(ws, dir, "package.json");
        const pkg = JSON.parse(readFileSync(p, "utf8"));
        if (flipPrivate.includes(dir)) pkg.private = false;
        else if (unflip.includes(dir)) delete pkg.private;
        else pkg.private = true;
        writeFileSync(p, `${JSON.stringify(pkg, null, 4)}\n`);
    }
    // publish-plan 会按 registry 上的现有版本过滤；真实发布态要模拟「下一版尚未上 registry」。
    if (version) {
        for (const p of [
            path.join(ws, "package.json"),
            ...PACKAGE_DIRS.map((dir) => path.join(ws, dir, "package.json")),
        ]) {
            const pkg = JSON.parse(readFileSync(p, "utf8"));
            pkg.version = version;
            writeFileSync(p, `${JSON.stringify(pkg, null, 4)}\n`);
        }
    }
    return ws;
};
const flipTargets = [...PUBLISH_DIRS];
const uiDir = PACKAGE_DIRS.find((dir) => !PUBLISH_DIRS.includes(dir));

// G4a：清单内的包仍 private → publish 模式必拒（用副本，不依赖真仓状态）。
{
    const ws = buildPublishWorkspace("private-block", {
        privatize: flipTargets,
        version: "2.1.1",
    });
    expectFail(
        "G4a",
        "preflight --mode=publish（发布清单内的包仍 private）",
        runSync("node", [path.join(ws, "scripts/release/preflight.mjs"), "--mode=publish"], {
            allowFail: true,
        }),
        /仍是 private:true，禁止发布/,
    );
}

// G4b：清单内已翻转，但版本已经在 registry（2.1.0）且没有待发布 changeset
// → publish-plan 为空，必须停住，避免「看起来成功、其实没发包」。
{
    const ws = buildPublishWorkspace("empty-plan", {
        flipPrivate: flipTargets,
        version: "2.1.0",
    });
    expectFail(
        "G4b",
        "preflight --mode=publish（publish-plan 为空 → 静默空转）",
        runSync("node", [path.join(ws, "scripts/release/preflight.mjs"), "--mode=publish"], {
            allowFail: true,
        }),
        /publish-plan 为空/,
    );
}

const releaseWs = buildPublishWorkspace("publish-set", {
    flipPrivate: flipTargets,
    // 用一个永远不会上 registry 的版本，避免真发 2.1.1 后 G4e 又因“版本已存在”变成空 plan。
    version: "9.9.9",
});
writeFileSync(
    path.join(releaseWs, ".changeset/pending-release.md"),
    `---\n"@marxchou/dogeared-tokens": patch\n---\n\nguards: pending changeset for publish mode\n`,
);
const releaseWsRun = runSync(
    "node",
    [path.join(releaseWs, "scripts/release/preflight.mjs"), "--mode=publish"],
    { allowFail: true },
);
{
    const p1 = p1Lines(releaseWsRun.out);
    const fails = p1.filter((l) => l.startsWith("[FAIL]"));
    const uiLine = p1.find((l) => l.includes("@marxchou/dogeared-ui")) ?? "";
    if (fails.length === 0 && /^\[INFO\]/.test(uiLine) && /D-0120/.test(uiLine))
        c.pass(
            "G4d",
            `发布态（${flipTargets.join(" + ")} 已翻转、ui 留 private）→ P1 全绿，ui 落 INFO（${
                p1.length
            } 条 P1）`,
            p1.join("\n"),
        );
    else
        c.fail(
            "G4d",
            "发布态下 P1 仍有 FAIL，或 ui 没有落到 INFO/D-0120（ui 留 private 会重新卡住首发）",
            `${p1.join("\n")}\n${releaseWsRun.combined.slice(-800)}`,
        );

    const summaryLine = releaseWsRun.out
        .split("\n")
        .reverse()
        .find((l) => l.startsWith("RELEASE_SUMMARY "));
    let summary = null;
    try {
        summary = summaryLine ? JSON.parse(summaryLine.slice("RELEASE_SUMMARY ".length)) : null;
    } catch {
        summary = null;
    }
    const planNames = (Array.isArray(summary?.publishPlan?.plan) ? summary.publishPlan.plan : [])
        .flat()
        .map((e) => e?.name)
        .filter(Boolean);
    const expectNames = flipTargets.map((dir) => {
        const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, dir, "package.json"), "utf8"));
        return pkg.name;
    });
    const uiName = JSON.parse(
        readFileSync(path.join(REPO_ROOT, "packages/ui/package.json"), "utf8"),
    ).name;
    const onlyTwo =
        planNames.length === expectNames.length && expectNames.every((n) => planNames.includes(n));
    if (releaseWsRun.code === 0 && onlyTwo && !planNames.includes(uiName))
        c.pass(
            "G4e",
            `preflight --mode=publish exit 0，publish-plan 只含 ${planNames.length} 包（不含 ui）`,
            `plan=${JSON.stringify(planNames)}`,
        );
    else
        c.fail(
            "G4e",
            "发布态下 preflight 没放行，或 publish-plan 不是「只含发布清单内的包」",
            `exit=${releaseWsRun.code}\nplan=${JSON.stringify(planNames)}\nui=${uiName}\n${releaseWsRun.combined.slice(
                -900,
            )}`,
        );
}

// ---- G4f 清单外的包被翻成 private:false → WARN（疑似误翻转，不能静默通过）----
{
    const ws = buildPublishWorkspace("misflip", { unflip: [uiDir] });
    const run = runSync(
        "node",
        [path.join(ws, "scripts/release/preflight.mjs"), "--mode=publish"],
        {
            allowFail: true,
        },
    );
    const uiLine = p1Lines(run.out).find((l) => l.includes("@marxchou/dogeared-ui")) ?? "";
    if (/^\[WARN\]/.test(uiLine) && /疑似误翻转/.test(uiLine))
        c.pass("G4f", `清单外的包被误翻成 private:false → WARN（${uiLine}）`);
    else
        c.fail(
            "G4f",
            "清单外的包被翻成 private:false 时没有 WARN（会静默多发一个包）",
            `${p1Lines(run.out).join("\n")}\n${run.combined.slice(-600)}`,
        );
}

// ---- G5 workflow 契约的负向用例 ----
// 造一个「形如 token」的字符串用于变异测试：拼出来的，避免仓库里出现 token 字面量（密钥扫描会误报）
const fakeToken = `npm_${"A".repeat(36)}`;
const wfRaw = readFileSync(realWf, "utf8");
const mutations = [
    {
        id: "G5a",
        label: "给 push 加上 branches: [main]（普通 push 就能进发布链）",
        text: wfRaw.replace(
            '    push:\n        tags: ["v*"]',
            '    push:\n        branches: [main]\n        tags: ["v*"]',
        ),
        mustMention: /push 触发面/,
    },
    {
        id: "G5b",
        label: "把发布命令换成 npm publish（与本地验证的字面量不一致）",
        text: wfRaw.replaceAll("changeset publish --from-pack-dir", "npm publish"),
        mustMention: /命令字面量|找不到 changeset publish/,
    },
    {
        id: "G5c",
        label: "给非 provenance 步骤加 continue-on-error（静默吞失败）",
        text: wfRaw.replace(
            "            - name: Download pack dir",
            "            - name: Download pack dir\n              continue-on-error: true",
        ),
        mustMention: /continue-on-error/,
    },
    {
        id: "G5d",
        label: "去掉 confirm_publish 人工确认（dispatch 可直接真发）",
        text: wfRaw.replace(
            'elif [ "$INPUT_DRY_RUN" = "false" ] && [ "$INPUT_CONFIRM" = "PUBLISH" ]; then',
            "elif true; then",
        ),
        mustMention: /confirm_publish/,
    },
    {
        id: "G5e",
        label: "把 token 直接写进 workflow",
        text: wfRaw.replace(
            "            - name: OIDC gate",
            `            - name: OIDC gate\n              env:\n                  LEAK_TOKEN: ${fakeToken}`,
        ),
        mustMention: /硬编码/,
    },
    {
        id: "G5f",
        label: "删掉 OIDC 闸门里对 .npmrc 字面 token 的扫描",
        text: wfRaw.replaceAll("_authToken", "auth-token"),
        mustMention: /没有检查 \.npmrc/,
    },
    {
        id: "G5g",
        label: "把 npm CLI 下限从 11.15.0 降下来（Trusted Publishing 会静默失效）",
        text: wfRaw.replace("                  NEED=11.15.0", "                  NEED=11.0.0"),
        mustMention: /11\.15\.0/,
    },
];
for (const m of mutations) {
    const p = path.join(tmpRoot, `mut-${m.id}.yml`);
    writeFileSync(p, m.text);
    if (m.text === wfRaw) {
        c.fail(m.id, `${m.label} → 变异没生效（替换串没匹配上），该用例无效`);
        continue;
    }
    expectFail(
        m.id,
        m.label,
        runSync("node", [realWorkflowCheck, "--workflow", p], { allowFail: true }),
        m.mustMention,
    );
}

// ---- G6 dry-run 脚本里每个 npm publish 都必须带 --dry-run ----
{
    const src = readFileSync(path.join(REPO_ROOT, "scripts/release/publish-dry-run.mjs"), "utf8");
    const publishCalls = src.match(/\["publish"[^\]]*\]/g) ?? [];
    const unprotected = publishCalls.filter((call) => !call.includes("--dry-run"));
    if (publishCalls.length >= 2 && unprotected.length === 0)
        c.pass(
            "G6",
            `publish-dry-run.mjs 里 ${publishCalls.length} 处 publish 调用全部带 --dry-run`,
        );
    else
        c.fail(
            "G6",
            "publish-dry-run.mjs 里有不带 --dry-run 的 publish 调用",
            unprotected.join("\n"),
        );
}

rmSync(tmpRoot, { recursive: true, force: true });
report("负向自检（闸门必须真的会红）", c.results, { json, extra: { cases: c.results.length } });
process.exit(c.results.some((r) => r.level === "FAIL") ? 1 : 0);
