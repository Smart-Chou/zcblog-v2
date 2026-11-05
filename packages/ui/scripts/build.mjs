#!/usr/bin/env node
// 包构建：src/ 的 `.astro` 组件 + TS 桶文件 → dist/
//
// 为什么要构建（M4-6 · F1）：`exports["."]` 指 `.ts` 源码时，裸 Node `import` 会报
// ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING。本包发布的组件是 `.astro`——它们只在
// Astro/Vite 流水线里编译，**永远**不能在裸 Node 里 import（README「Requirements」写明）。
// 构建做两件事：
//   1. 把 `src/*.astro` 原样复制进 `dist/`（组件本体，Astro 编译器读的就是它们）；
//   2. 用 tsc 把 `src/index.ts` 桶文件编译成 `dist/index.js` + `dist/index.d.ts`。
// 这样 `exports` 引用的都是真实文件，且没有一个入口是 `.ts`——「装了但 import 就炸」的
// 那种坏包不会静默发出去。
//
// 编译器来源：workspace 根的 devDependency `typescript`（本包不声明 devDependencies，
// 包边界白名单 B3 只允许运行期依赖）。
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(pkgRoot, "src");
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

// 1) 组件本体（.astro）原样进 dist：包的地基，缺一个组件包就废了
const components = readdirSync(src).filter((f) => f.endsWith(".astro"));
if (components.length === 0) fail("src/ 里没有 .astro 组件");
for (const file of components) {
    cpSync(path.join(src, file), path.join(dist, file), { preserveTimestamps: true });
}

// 2) 桶文件 → dist/index.js + dist/index.d.ts
const run = spawnSync(process.execPath, [tsc, "-p", path.join(pkgRoot, "tsconfig.build.json")], {
    cwd: pkgRoot,
    encoding: "utf8",
});
const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
if (out) console.log(out);
if (run.status !== 0) fail(`tsc 失败（exit ${run.status}）`);

// 3) 自证：manifest 里每个 exports 目标都必须真实存在（发布前就暴露对不上的入口）
const {
    exports: exportsMap = {},
    main,
    types,
} = JSON.parse(readFileSync(path.join(pkgRoot, "package.json"), "utf8"));
const targets = [];
const collect = (value) => {
    if (typeof value === "string") {
        if (value.startsWith("./")) targets.push(value);
    } else if (value && typeof value === "object") Object.values(value).forEach(collect);
};
collect(exportsMap);
for (const extra of [main, types]) if (typeof extra === "string") targets.push(extra);

const missing = targets.filter((t) => !existsSync(path.join(pkgRoot, t)));
if (missing.length) fail(`manifest 声明的入口不存在：${missing.join(", ")}`);

// 4) 桶文件必须真的指向 dist 里的组件（防止 tsc 把 .astro 静默擦掉）
const barrel = readFileSync(path.join(dist, "index.js"), "utf8");
const notReexported = components.filter(
    (file) => !barrel.includes(`./${file.replace(/\.astro$/, ".astro")}`),
);
if (notReexported.length) fail(`dist/index.js 没有重导出：${notReexported.join(", ")}`);

const size = (dir) =>
    readdirSync(dir, { recursive: true })
        .map((f) => path.join(dir, String(f)))
        .filter((f) => existsSync(f) && statSync(f).isFile())
        .reduce((sum, f) => sum + statSync(f).size, 0);

console.log(
    `BUILD_OK ${components.length} 个 .astro + 桶文件 · ${targets.length}/${targets.length} 入口存在 · ${size(dist)} B → ${path.relative(pkgRoot, dist)}/`,
);
