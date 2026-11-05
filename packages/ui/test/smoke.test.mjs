#!/usr/bin/env node
/**
 * 包内 smoke 测试（M4-6 · F6）：锁住「发布的到底是哪些文件」和「裸 Node 不能 import」这条
 * 已文档化的限制。
 *
 *   pnpm --filter ./packages/ui test
 *
 * 本包的可见 API 是 `.astro` 组件，只有 Astro/Vite 的编译器能消费它们——没有「编译成普通 JS」
 * 这回事。所以这里的断言分两类：
 *   1. 发布形状：manifest 里每个入口都指向 dist 里的真实文件，组件本体（.astro）确实在包内；
 *   2. 限制自证：裸 Node import 桶文件会因为 `.astro` 扩展名失败（这正是 README
 *      「Requirements」写明的那条）——测试把这条限制钉住，防止哪天有人以为它能跑而静默发坏包。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const pkgJson = JSON.parse(readFileSync(path.join(pkgRoot, "package.json"), "utf8"));
const read = (rel) => readFileSync(path.join(pkgRoot, rel), "utf8");
const COMPONENTS = ["Badge.astro", "Button.astro"];

/* ───────────────────────── 1. 发布形状 ───────────────────────── */

test("package: 入口全部指向 dist，没有一个指向 .ts", () => {
    assert.equal(pkgJson.main, "./dist/index.js");
    assert.equal(pkgJson.types, "./dist/index.d.ts");
    assert.equal("module" in pkgJson, false, "module 字段已删除（对现代解析器只是误导）");

    const targets = [];
    const collect = (value) => {
        if (typeof value === "string") {
            if (value.startsWith("./")) targets.push(value);
        } else if (value && typeof value === "object") Object.values(value).forEach(collect);
    };
    collect(pkgJson.exports);
    for (const t of targets) {
        assert.ok(!t.endsWith(".ts") || t.endsWith(".d.ts"), `exports 里还有 .ts 源码入口：${t}`);
        assert.ok(existsSync(path.join(pkgRoot, t)), `exports 目标不存在：${t}`);
    }
});

test("package: 包自引用解析到 dist/index.js", () => {
    const resolved = import.meta.resolve(pkgJson.name);
    assert.ok(resolved.endsWith("/dist/index.js"), `实际解析到 ${resolved}`);
    assert.ok(
        import.meta.resolve(`${pkgJson.name}/Badge.astro`).endsWith("/dist/Badge.astro"),
        "子路径 Badge.astro 应指向 dist",
    );
});

test("package: 两个组件本体都在 dist 与 src 里（不多不少）", () => {
    for (const file of COMPONENTS) {
        assert.ok(existsSync(path.join(pkgRoot, "dist", file)), `dist/${file} 缺失`);
        assert.ok(existsSync(path.join(pkgRoot, "src", file)), `src/${file} 缺失`);
        assert.equal(read(`dist/${file}`), read(`src/${file}`), `dist/${file} 与源码不一致`);
    }
});

test("package: 桶文件重导出全部组件（且是纯 ESM，没有 TS 语法）", () => {
    const barrel = read("dist/index.js");
    for (const file of COMPONENTS) assert.match(barrel, new RegExp(`from "./${file}"`));
    assert.doesNotMatch(barrel, /:\s*[A-Z][A-Za-z<>\[\]|\s]*[=;,)]/, "桶文件里疑似残留类型标注");
});

/* ───────────────────────── 2. 组件契约 ───────────────────────── */

test("components: 每个 .astro 有 Props 接口 + scoped style", () => {
    for (const file of COMPONENTS) {
        const text = read(`src/${file}`);
        assert.match(text, /^---[\s\S]*?---/, `${file} 缺 frontmatter`);
        assert.match(text, /interface Props/, `${file} 缺 Props 接口`);
        assert.match(text, /<style[^>]*>/, `${file} 缺 scoped style`);
        assert.doesNotMatch(text, /from\s+["']~\//, `${file} 不得 import 站点别名 ~/`);
    }
});

/* ───────────────────────── 3. 已文档化的限制（裸 Node 不能 import）───────────────────────── */

test("限制: 裸 Node import 桶文件因 .astro 失败（README 已写明，不是坏包）", async () => {
    const entry = path.join(pkgRoot, "dist", "index.js");
    await assert.rejects(
        () => import(entry),
        (error) => {
            // 两种合法失败态都算「按文档失败」：
            //   ERR_UNKNOWN_FILE_EXTENSION  —— node 不认识 .astro
            //   ERR_MODULE_NOT_FOUND        —— 解析器把它当普通模块找不到
            assert.match(
                String(error.code),
                /ERR_UNKNOWN_FILE_EXTENSION|ERR_MODULE_NOT_FOUND/,
                `意外错误码 ${error.code}：${error.message}`,
            );
            return true;
        },
    );
});

test("限制: README「Requirements」明确写了只在 Astro/Vite 里可用", () => {
    const readme = read("README.md");
    const section = readme.split(/^## Requirements$/m)[1] ?? "";
    assert.ok(section.length > 0, "README 缺 Requirements 段");
    const requirements = section.split(/^## /m)[0];
    assert.match(requirements, /Astro/);
    assert.match(requirements, /裸 Node|bare Node/, "必须明说不支持裸 Node");
    assert.match(requirements, /\.astro/, "必须说明组件是 .astro 文件");
});

/* ───────────────────────── 4. 依赖归属 ───────────────────────── */

test("package: 零运行期依赖，astro 是 optional peer，无 devDependencies", () => {
    assert.equal(pkgJson.dependencies ?? undefined, undefined);
    assert.deepEqual(Object.keys(pkgJson.peerDependencies), ["astro"]);
    assert.equal(pkgJson.peerDependenciesMeta?.astro?.optional, true);
    assert.equal(pkgJson.devDependencies ?? undefined, undefined);
});

test("package: engines 覆盖当前 Node（不再 EBADENGINE）", () => {
    assert.equal(pkgJson.engines.node, ">=22");
    assert.ok(Number(process.versions.node.split(".")[0]) >= 22);
});
