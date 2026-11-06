#!/usr/bin/env node
// M4-4 · release workflow 契约检查（解析 YAML，不执行 workflow）
//
//   node scripts/release/verify-workflow.mjs [--json]
//
// 回答四件事：
//   1. 触发面：只有 tag `v*` 和 workflow_dispatch，普通 push 进不来；
//   2. 真发布闸门：publish job 依赖 preflight、走 npm-publish environment、要求 dry_run=false；
//   3. 命令一致性：workflow 里的发布命令与 lib.mjs 的 PUBLISH_COMMAND 是同一个字面量（本地 dry-run 验过的就是 CI 跑的）；
//   4. 失败不静默：continue-on-error 只允许出现在 provenance 步骤，且必须有 ::warning:: 记录步骤。
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { PUBLISH_COMMAND, REPO_ROOT, makeCollector, report } from "./lib.mjs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const getArg = (name) => {
    const inline = argv.find((a) => a.startsWith(`${name}=`));
    if (inline) return inline.slice(name.length + 1);
    const i = argv.indexOf(name);
    return i === -1 ? null : (argv[i + 1] ?? null);
};
// --workflow 用于负向测试（拿改坏的副本喂进来，证明这些断言真的会红）
const wfPath = path.resolve(
    getArg("--workflow") ?? path.join(REPO_ROOT, ".github/workflows/release.yml"),
);
const raw = readFileSync(wfPath, "utf8");

const c = makeCollector();
let doc;
try {
    doc = parseYaml(raw);
    c.pass("W1", "release.yml YAML 可解析");
} catch (e) {
    c.fail("W1", `release.yml YAML 解析失败：${e.message}`);
    report("release workflow 契约", c.results, { json });
    process.exit(1);
}

const on = doc.on ?? doc.true ?? {};
const jobs = doc.jobs ?? {};
const stepsOf = (job) =>
    (jobs[job]?.steps ?? []).map((s) => ({ name: s.name ?? "", run: s.run ?? "", ...s }));
const runText = (job) =>
    stepsOf(job)
        .map((s) => s.run)
        .join("\n");

// ---- W2/W3/W4 触发面 ----
const triggers = Object.keys(on).sort();
if (triggers.length === 2 && triggers[0] === "push" && triggers[1] === "workflow_dispatch")
    c.pass("W2", `触发面只有 push + workflow_dispatch（${triggers.join(", ")}）`);
else
    c.fail("W2", `触发面超出预期：${triggers.join(", ")}`, "只允许 push:tags 与 workflow_dispatch");

const push = on.push ?? {};
if (
    !push.branches &&
    !push["branches-ignore"] &&
    Array.isArray(push.tags) &&
    push.tags.includes("v*")
)
    c.pass(
        "W3",
        `push 只按 tag 触发（tags: ${push.tags.join(", ")}），无 branches 过滤`,
        "普通 push（分支）不会触发本 workflow",
    );
else c.fail("W3", "push 触发面不是「仅 tag v*」", JSON.stringify(push));

const inputs = on.workflow_dispatch?.inputs ?? {};
if (inputs.dry_run?.type === "boolean" && inputs.dry_run?.default === true)
    c.pass("W4a", "dispatch 的 dry_run 默认 true（默认不真发）");
else c.fail("W4a", "dispatch 的 dry_run 不是默认 true 的 boolean", JSON.stringify(inputs.dry_run));
if (inputs.confirm_publish && inputs.provenance)
    c.pass("W4b", "dispatch 暴露 confirm_publish 与 provenance 输入");
else c.fail("W4b", "dispatch 缺 confirm_publish / provenance 输入", Object.keys(inputs).join(", "));

// ---- W5 job 结构 ----
for (const job of ["preflight", "dry-run", "publish"]) {
    if (jobs[job]) c.pass(`W5:${job}`, `job 存在（${jobs[job].name ?? job}）`);
    else c.fail(`W5:${job}`, "job 缺失");
}

// ---- W6 真发布闸门 ----
const publishIf = String(jobs.publish?.if ?? "");
const needs = [].concat(jobs.publish?.needs ?? []);
if (needs.includes("preflight")) c.pass("W6a", "publish 依赖 preflight");
else c.fail("W6a", "publish 没有 needs: preflight");
if (/dry_run\s*==\s*'false'/.test(publishIf))
    c.pass("W6b", "publish 只在 dry_run=false 时运行", publishIf.trim());
else c.fail("W6b", "publish 的 if 没有绑定 dry_run=false", publishIf.trim());

const preflightModeRun =
    stepsOf("preflight").find((s) => /Resolve publish mode/i.test(s.name))?.run ?? "";
// 只认「条件判断行」里的闸门：注释、echo 文案里提到 confirm_publish 不算
const gateLines = preflightModeRun
    .split("\n")
    .filter((l) => /^\s*(el)?if\s/.test(l))
    .join("\n");
if (/INPUT_CONFIRM/.test(gateLines) && /PUBLISH/.test(gateLines) && /INPUT_DRY_RUN/.test(gateLines))
    c.pass(
        "W6c",
        "dispatch 真发布需要 dry_run=false && confirm_publish=PUBLISH（条件行里同时校验）",
        gateLines.trim(),
    );
else
    c.fail(
        "W6c",
        "缺少 confirm_publish 人工确认逻辑（条件行里没有同时校验 confirm_publish=PUBLISH）",
        gateLines.trim(),
    );

const env = jobs.publish?.environment;
const envName = typeof env === "string" ? env : env?.name;
if (envName === "npm-publish")
    c.pass("W6d", "publish 走 npm-publish environment（可配 required reviewers）");
else c.fail("W6d", "publish 没有绑定 npm-publish environment", String(envName));

const perms = jobs.publish?.permissions ?? {};
if (perms["id-token"] === "write")
    c.pass("W6e", "publish 有 id-token: write（provenance 需要 OIDC）");
else c.fail("W6e", "publish 缺 id-token: write");

if ((doc.permissions ?? {}).contents === "read") c.pass("W6f", "workflow 默认权限只读（最小权限）");
else c.warn("W6f", "workflow 级 permissions 不是 contents: read");

// ---- W7 命令一致性 ----
const publishRuns = stepsOf("publish").filter((s) => s.run.includes(PUBLISH_COMMAND));
if (publishRuns.length >= 2)
    c.pass(
        "W7a",
        `publish 里有 ${publishRuns.length} 处 ${PUBLISH_COMMAND}（provenance + 降级路径），与 lib.mjs 的 PUBLISH_COMMAND 同一字面量`,
        publishRuns.map((s) => `${s.name}: ${s.run.trim()}`).join("\n"),
    );
else c.fail("W7a", `publish 里找不到 ${PUBLISH_COMMAND}（命令字面量与本地验证的不一致）`);

const dryRuns = runText("dry-run");
if (/publish-dry-run\.mjs/.test(dryRuns))
    c.pass("W7b", "dry-run job 跑 scripts/release/publish-dry-run.mjs（npm publish --dry-run）");
else c.fail("W7b", "dry-run job 没有跑 publish-dry-run.mjs");
if (!/changeset publish/.test(dryRuns))
    c.pass("W7c", "dry-run job 里没有任何真 publish 命令（不会误发）");
else c.fail("W7c", "dry-run job 里出现了 changeset publish");
if (/dry_run\s*==\s*'true'/.test(String(jobs["dry-run"]?.if ?? "")))
    c.pass("W7d", "dry-run job 只在 dry_run=true 时运行");
else c.fail("W7d", "dry-run job 的 if 没有绑定 dry_run=true");

// ---- W8 失败不静默 ----
const coe = stepsOf("publish").filter((s) => s["continue-on-error"] === true);
const badCoe = coe.filter((s) => !/provenance/i.test(s.name));
if (coe.length === 1 && badCoe.length === 0)
    c.pass("W8a", "continue-on-error 只出现在 provenance 步骤上");
else
    c.fail(
        "W8a",
        "continue-on-error 用在了非 provenance 步骤上（会静默吞失败）",
        coe.map((s) => s.name).join(", "),
    );

const provRecord = stepsOf("publish").find((s) => /Record provenance outcome/i.test(s.name));
if (provRecord && /::warning::/.test(provRecord.run) && /GITHUB_STEP_SUMMARY/.test(provRecord.run))
    c.pass("W8b", "provenance 失败会 ::warning:: + 写 step summary（显式记录）");
else c.fail("W8b", "provenance 失败没有显式记录步骤");

const fallbackSteps = stepsOf("publish").filter((s) => /without provenance/i.test(s.name));
const fallback = fallbackSteps.find((s) => /provenance_failed/.test(String(s.if ?? "")));
if (fallback && /changeset publish/.test(fallback.run))
    c.pass("W8c", "provenance 失败后有显式降级重发步骤（不是静默跳过）");
else c.fail("W8c", "缺少 provenance 失败后的降级重发步骤");

// provenance=false 时主发布步骤被 if 跳过，必须有另一条显式 publish 步骤；
// 否则 workflow 会“记录已关闭”但不写 registry（M4 真发布前实测踩到）。
const disabledPublish = stepsOf("publish").find((s) => /explicitly disabled/i.test(s.name));
if (
    disabledPublish &&
    /inputs\.provenance == false/.test(String(disabledPublish.if ?? "")) &&
    /changeset publish/.test(disabledPublish.run)
)
    c.pass("W8d", "provenance=false 时有显式 publish 步骤（不会只记录不发布）");
else c.fail("W8d", "provenance=false 时缺少显式 publish 步骤");

// ---- W9 认证（Trusted Publishing / OIDC）----
const oidc = stepsOf("publish").find((s) => /OIDC gate/i.test(s.name));
if (
    oidc &&
    /ACTIONS_ID_TOKEN_REQUEST_URL/.test(oidc.run) &&
    /ACTIONS_ID_TOKEN_REQUEST_TOKEN/.test(oidc.run) &&
    /NODE_AUTH_TOKEN/.test(oidc.run) &&
    /NPM_TOKEN/.test(oidc.run) &&
    /exit 1/.test(oidc.run)
)
    c.pass("W9a", "publish 前有 OIDC 闸门（URL+TOKEN 缺一即失败，且拒绝长期 token 环境变量）");
else c.fail("W9a", "缺少完整的 Trusted Publishing OIDC 闸门（URL/TOKEN 任一缺失都不算）");
const tokenRefsOutsideOidc = raw.replace(oidc?.run ?? "", "");
if (
    !/secrets\.NPM_TOKEN/.test(tokenRefsOutsideOidc) &&
    !/NODE_AUTH_TOKEN:\s*\$\{\{/.test(tokenRefsOutsideOidc)
)
    c.pass("W9b", "workflow 不再引用长期 NPM_TOKEN（Trusted Publishing 走 OIDC）");
else c.fail("W9b", "workflow 仍引用 NPM_TOKEN/NODE_AUTH_TOKEN，未完成 OIDC 迁移");
if (!/npm_[A-Za-z0-9]{20,}/.test(raw) && !/ghp_[A-Za-z0-9]{20,}/.test(raw))
    c.pass("W9c", "workflow 内无硬编码 token");
else c.fail("W9c", "workflow 里疑似硬编码了 token");
// setup-node 的 registry-url 写的是 ${NODE_AUTH_TOKEN} 占位（官方示例同样形态）；字面 token 必须被拦。
if (oidc && /_authToken/.test(oidc.run) && /\.npmrc/.test(oidc.run))
    c.pass("W9d", "OIDC 闸门会扫描 .npmrc 里的字面 _authToken（占位符放行）");
else c.fail("W9d", "OIDC 闸门没有检查 .npmrc 里的字面 token");
const npmFloor = stepsOf("publish").find((s) =>
    /npm CLI supports Trusted Publishing/i.test(s.name),
);
if (npmFloor && /11\.15\.0/.test(npmFloor.run))
    c.pass(
        "W9e",
        "publish job 保证 npm CLI >= 11.15.0（Trusted Publishing / --allow-publish 的硬要求）",
    );
else c.fail("W9e", "publish job 没有保证 npm CLI >= 11.15.0");

// ---- W10 preflight job 的实质步骤 ----
const pfRun = runText("preflight");
const required = [
    ["pnpm install --frozen-lockfile", /pnpm install --frozen-lockfile/],
    ["gates:all", /pnpm gates:all/],
    ["build-packages.mjs", /build-packages\.mjs/],
    ["verify-versions.mjs", /verify-versions\.mjs/],
    ["preflight.mjs", /preflight\.mjs/],
    ["verify-workflow.mjs", /verify-workflow\.mjs/],
    ["changeset pack", /changeset pack/],
];
const missing = required.filter(([, re]) => !re.test(pfRun)).map(([n]) => n);
if (missing.length === 0)
    c.pass("W10", `preflight 顺序覆盖：${required.map(([n]) => n).join(" → ")}`);
else c.fail("W10", `preflight 缺步骤：${missing.join(", ")}`);

report("release workflow 契约", c.results, {
    json,
    extra: {
        triggers,
        pushTags: push.tags ?? [],
        publishCommand: PUBLISH_COMMAND,
        publishIf: publishIf.trim(),
        environment: envName,
    },
});
process.exit(c.results.some((r) => r.level === "FAIL") ? 1 : 0);
