#!/usr/bin/env node
// M5-8 · 干净消费者验收（对 npm pack 出来的 tarball，不碰 registry）
//
//   node verify-consumer.mjs [--dist dist] [--root <consumer dir>]
//
// 判据：装的是 tarball 里的 2.1.2、发布元数据是 public、两页都真渲染出 Badge/Button、
// scoped 样式与 tokens 变量都进了产物。RESULT PASS/FAIL 汇总行供报告直接 grep。
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const opt = (name, fallback = null) => {
    const i = argv.indexOf(name);
    return i === -1 ? fallback : (argv[i + 1] ?? fallback);
};
const root = path.resolve(opt("--root", process.cwd()));
const dist = path.resolve(root, opt("--dist", "dist"));
const fails = [];
const oks = [];
const ok = (msg) => oks.push(msg);
const bad = (msg) => fails.push(msg);

// ---- 1. 装进 node_modules 的那份就是 tarball 内容 ----
const installed = path.join(root, "node_modules/@marxchou/dogeared-ui/package.json");
if (!existsSync(installed)) bad("node_modules 里没有 @marxchou/dogeared-ui");
else {
    const pkg = JSON.parse(readFileSync(installed, "utf8"));
    if (pkg.version === "2.1.2") ok(`installed version = ${pkg.version}`);
    else bad(`installed version = ${pkg.version}（期望 2.1.2）`);
    if (pkg.private === false) ok("installed private = false");
    else bad(`installed private = ${JSON.stringify(pkg.private)}`);
    if (pkg.publishConfig?.access === "public") ok("installed publishConfig.access = public");
    else bad("installed 缺 publishConfig.access=public");
    for (const f of [
        "dist/Badge.astro",
        "dist/Button.astro",
        "dist/index.js",
        "LICENSE",
        "NOTICE",
        "CHANGELOG.md",
    ]) {
        const p = path.join(root, "node_modules/@marxchou/dogeared-ui", f);
        if (existsSync(p)) ok(`tarball 内含 ${f}`);
        else bad(`tarball 缺 ${f}`);
    }
}

// ---- 2. 页面真渲染出组件 ----
const cssFiles = existsSync(path.join(dist, "_astro"))
    ? readdirSync(path.join(dist, "_astro"))
          .filter((f) => f.endsWith(".css"))
          .map((f) => path.join(dist, "_astro", f))
    : [];
const css = cssFiles.map((f) => readFileSync(f, "utf8")).join("\n");

const indexHtml = readFileSync(path.join(dist, "index.html"), "utf8");
const subHtml = readFileSync(path.join(dist, "subpath/index.html"), "utf8");

const badgeVariants = ["default", "note", "tip", "danger", "success", "warning"];
for (const v of badgeVariants) {
    if (indexHtml.includes(`badge badge--${v}`)) ok(`index 渲染 badge--${v}`);
    else bad(`index 缺 badge--${v}`);
}
for (const size of ["sm", "md", "lg"]) {
    if (indexHtml.includes(`badge--${size}`)) ok(`index 渲染 badge--${size}`);
    else bad(`index 缺 badge--${size}`);
}
if (indexHtml.includes("btn btn-primary")) ok("index 渲染 btn-primary");
else bad("index 缺 btn-primary");
if (indexHtml.includes("btn btn-secondary")) ok("index 渲染 btn-secondary");
else bad("index 缺 btn-secondary");
if (
    /<a href="https:\/\/example\.com\/"[^>]*class="[^"]*btn-secondary[^"]*"[^>]*target="_blank"/.test(
        indexHtml,
    )
)
    ok("Button 透传 href/target");
else bad("Button 没有把 href/target 透传到 <a>");

if (subHtml.includes("badge badge--tip") && subHtml.includes("btn btn-primary"))
    ok("subpath 页用子路径导出渲染成功");
else bad("subpath 页没有渲染出 Badge/Button（子路径导出坏了）");

// ---- 3. scoped 样式与 token 变量都进了产物 ----
for (const sel of [
    ".badge[data-astro-cid",
    ".badge--tip",
    ".btn-primary[data-astro-cid",
    ".btn-secondary",
]) {
    if (css.includes(sel)) ok(`产物 CSS 含 ${sel}`);
    else bad(`产物 CSS 缺 ${sel}`);
}
for (const v of ["--radius-full", "--color-accent"]) {
    if (css.includes(v)) ok(`产物 CSS 含 tokens 变量 ${v}`);
    else bad(`产物 CSS 缺 tokens 变量 ${v}（tokens 层没进构建）`);
}

console.log(`consumer root: ${root}`);
for (const line of oks) console.log(`  PASS  ${line}`);
for (const line of fails) console.log(`  FAIL  ${line}`);
console.log(
    `\nRESULT ${fails.length === 0 ? "PASS" : "FAIL"}  checks=${oks.length + fails.length} fails=${fails.length}`,
);
process.exit(fails.length === 0 ? 0 : 1);
