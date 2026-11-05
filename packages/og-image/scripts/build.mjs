#!/usr/bin/env node
// 包构建：src/*.ts → dist/*.js + dist/*.d.ts
//
// 为什么要构建（M4-6 · F1）：`exports["."]` 指 .ts 源码时，裸 Node `import` 会报
// ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING（node 只剥自己源码树里的类型，不剥 node_modules）。
// 产出 dist 后 `exports`/`main`/`types` 指 dist，裸 Node、bundler、tsc 三条路都能解析。
//
// 编译器来源：workspace 根的 devDependency `typescript`（按 Node 解析规则向上找，
// 不写死路径）。本包不声明 devDependencies —— 包边界白名单（verify-package-boundary B3）只允许运行期依赖。
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(pkgRoot, "dist");

function fail(message) {
    console.error(`[build] ${message}`);
    process.exit(1);
}

let tsc;
try {
    tsc = createRequire(path.join(pkgRoot, "package.json")).resolve("typescript/bin/tsc");
} catch {
    fail("找不到 typescript：请在仓库根运行 `pnpm install`（本包不自带 devDependencies）");
}

rmSync(dist, { recursive: true, force: true });

const run = spawnSync(process.execPath, [tsc, "-p", path.join(pkgRoot, "tsconfig.build.json")], {
    cwd: pkgRoot,
    encoding: "utf8",
});
const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
if (out) console.log(out);
if (run.status !== 0) fail(`tsc 失败（exit ${run.status}）`);

// 产物自证：入口与类型声明必须在，且不能是空文件
const required = ["index.js", "index.d.ts", "route.js", "route.d.ts", "types.d.ts"];
const missing = required.filter((f) => !existsSync(path.join(dist, f)));
const empty = required.filter(
    (f) => existsSync(path.join(dist, f)) && statSync(path.join(dist, f)).size === 0,
);
if (missing.length) fail(`dist 产物缺失：${missing.join(", ")}`);
if (empty.length) fail(`dist 产物是空文件：${empty.join(", ")}`);

const total = readdirSync(dist, { recursive: true })
    .map((f) => path.join(dist, String(f)))
    .filter((f) => existsSync(f) && statSync(f).isFile())
    .reduce((sum, f) => sum + statSync(f).size, 0);

console.log(
    `BUILD_OK ${required.length}/${required.length} 必需产物 · ${readdirSync(dist, { recursive: true }).length} 个条目 · ${total} B → ${path.relative(pkgRoot, dist)}/`,
);
