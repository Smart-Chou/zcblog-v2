#!/usr/bin/env node
// M4-4 · 负向自检：证明这些闸门真的会红（不是只写了不生效的断言）
//
//   node scripts/release/verify-guards.mjs [--json]
//
// 每个用例都拿「改坏的副本」喂给同一个脚本，断言它 exit != 0。
// 全部在临时目录里做，真仓库只读。
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT, makeCollector, report, runSync } from "./lib.mjs";

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
    uiPkg.version = "2.1.1"; // 只有 ui 前进 → lockstep 破
    writeFileSync(uiPkgPath, JSON.stringify(uiPkg, null, 4));

    expectFail(
        "G2",
        "只有 ui 前进到 2.1.1（lockstep 破裂）",
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

// ---- G4 publish 模式在三包 private 时必须拒绝 ----
expectFail(
    "G4a",
    "preflight --mode=publish（三包仍 private）",
    runSync("node", [realPreflight, "--mode=publish", "--tag", "v2.1.0"], { allowFail: true }),
    /private/,
);
expectFail(
    "G4b",
    "preflight --mode=publish（publish-plan 为空 → 静默空转）",
    runSync("node", [realPreflight, "--mode=publish", "--tag", "v2.1.0"], { allowFail: true }),
    /publish-plan 为空/,
);
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
            "            - name: Install dependencies\n              run: pnpm install --frozen-lockfile\n\n            - name: Download pack dir",
            "            - name: Install dependencies\n              continue-on-error: true\n              run: pnpm install --frozen-lockfile\n\n            - name: Download pack dir",
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
            "                  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}",
            `                  NODE_AUTH_TOKEN: ${fakeToken}`,
        ),
        mustMention: /硬编码/,
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
report("负向自检（闸门必须真的会红）", c.results, { json, extra: { cases: mutations.length + 8 } });
process.exit(c.results.some((r) => r.level === "FAIL") ? 1 : 0);
