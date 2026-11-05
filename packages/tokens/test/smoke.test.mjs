#!/usr/bin/env node
/**
 * 包内 smoke 测试（M4-6 · F6 / M4-2 F1）
 *
 *   pnpm --filter ./packages/tokens test
 *
 * 本包卖的是**文件**（CSS + JSON），没有运行期代码，所以断言集中在两件事：
 *   1. `exports` 的每个入口都指向真实文件，且 `.` 解析到 `tokens.css`（不再是
 *      ERR_PACKAGE_PATH_NOT_EXPORTED）；
 *   2. `tokens.css` 与 `tokens.json` 编译出的结果**逐字节一致**（生成物不漂移）。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const pkgJson = JSON.parse(readFileSync(path.join(pkgRoot, "package.json"), "utf8"));

/* ───────────────────────── 1. exports 形状 ───────────────────────── */

test("exports: `.` 指向 tokens.css（裸 import 不再 PACKAGE_PATH_NOT_EXPORTED）", () => {
    assert.equal(pkgJson.exports["."], "./tokens.css");
    const resolved = import.meta.resolve(pkgJson.name);
    assert.ok(resolved.endsWith("/tokens.css"), `实际解析到 ${resolved}`);
});

test("exports: 每个入口都是真实文件，且根入口不是假 JS", () => {
    const targets = [];
    const collect = (value) => {
        if (typeof value === "string") {
            if (value.startsWith("./")) targets.push(value);
        } else if (value && typeof value === "object") Object.values(value).forEach(collect);
    };
    collect(pkgJson.exports);
    assert.ok(targets.length >= 4);
    for (const t of targets) {
        assert.ok(existsSync(path.join(pkgRoot, t)), `exports 目标不存在：${t}`);
    }
    // 根入口必须是样式/数据文件：本包没有可运行的 JS API，不能拿一个空 JS 文件糊弄解析器
    assert.doesNotMatch(
        pkgJson.exports["."],
        /\.(js|mjs|cjs|ts)$/,
        `根入口不该是 JS/TS：${pkgJson.exports["."]}`,
    );
    assert.equal("main" in pkgJson, false, "不该声明 main：没有 JS 入口");
    assert.equal("module" in pkgJson, false, "不该声明 module：没有 JS 入口");
});

test("exports: tokens.json 可被 Node 按子路径解析", () => {
    const resolved = import.meta.resolve(`${pkgJson.name}/tokens.json`);
    assert.ok(resolved.endsWith("/tokens.json"), `实际解析到 ${resolved}`);
});

/* ───────────────────────── 2. 生成物一致 ───────────────────────── */

test("tokens.css 与 tokens.json 逐字节一致（编译器 --check 通过）", () => {
    const run = spawnSync(
        process.execPath,
        [path.join(pkgRoot, "scripts", "build-tokens.mjs"), "--check"],
        {
            cwd: pkgRoot,
            encoding: "utf8",
        },
    );
    assert.equal(run.status, 0, `--check 失败：\n${run.stdout}${run.stderr}`);
    const css = readFileSync(path.join(pkgRoot, "tokens.css"));
    assert.ok(css.length > 1000, `tokens.css 只有 ${css.length} B，疑似残缺`);
    assert.match(css.toString("utf8"), /:root/);
});

test("tokens.json：结构可用（palette / primitive / semantic 三块）", () => {
    const tokens = JSON.parse(readFileSync(path.join(pkgRoot, "tokens.json"), "utf8"));
    for (const key of ["palette", "primitive", "semantic"]) {
        assert.equal(typeof tokens[key], "object", `tokens.json 缺 ${key}`);
    }
    assert.ok(Object.keys(tokens.semantic.light ?? {}).length > 0, "semantic.light 为空");
});

/* ───────────────────────── 3. 包形状 ───────────────────────── */

test("package: 零依赖、CSS 标记 sideEffects、engines 覆盖当前 Node", () => {
    assert.equal(pkgJson.dependencies ?? undefined, undefined);
    assert.equal(pkgJson.peerDependencies ?? undefined, undefined);
    assert.deepEqual(pkgJson.sideEffects, ["**/*.css"]);
    assert.equal(pkgJson.engines.node, ">=22");
    assert.ok(Number(process.versions.node.split(".")[0]) >= 22);
});

test("package: 三个交付文件都在 files 白名单里", () => {
    for (const f of ["tokens.json", "tokens.css", "variables.css", "LICENSE", "NOTICE"]) {
        assert.ok(pkgJson.files.includes(f), `files 白名单缺 ${f}`);
        assert.ok(existsSync(path.join(pkgRoot, f)), `${f} 不存在`);
    }
});

test("sha256 记录（tarball 对比用）", () => {
    const digest = (rel) =>
        createHash("sha256")
            .update(readFileSync(path.join(pkgRoot, rel)))
            .digest("hex");
    console.log(
        `SHA256 tokens.css=${digest("tokens.css")} variables.css=${digest("variables.css")} tokens.json=${digest("tokens.json")}`,
    );
});
