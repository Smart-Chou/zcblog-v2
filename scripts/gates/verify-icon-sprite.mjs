#!/usr/bin/env node
/**
 * verify-icon-sprite.mjs — 图标 sprite 与清单的漂移门禁（M5-10 / N-3）
 *
 * 背景：图标图形本体已从每页 HTML 挪到构建期生成的 `public/icons.svg`，
 * `DynamicIcon` 只输出 `<use href="/icons.svg?v=<hash>#id">`。于是有了两处
 * 必须始终一致的生成物 —— sprite 文件与清单模块 `src/components/Icons/sprite.ts`
 * （SPRITE_VERSION / ICON_VIEWBOXES / ICON_INLINE_ONLY）。改动图标引用后忘了跑
 * `node scripts/generate-icons.js`，症状是「线上缺图」或「缓存不失效」，而且构建不报错。
 *
 * 判据
 *   S1 public/icons.svg 存在，且内容是 `<svg>` 根 + 若干 `<g id="...">`
 *   S2 SPRITE_VERSION = sha256(icons.svg) 前 8 位（改 sprite 不更新版本 = 缓存不失效）
 *   S3 清单里每个图标（非 inlineOnly）在 sprite 里有同名 `<g id>`
 *   S4 sprite 里每个 `<g id>` 都能在清单里查到（孤儿 = 清单过期）
 *   S5 清单 id 唯一、不含 ':'（`<use href="#a:b">` 的 fragment 语义容易踩坑）
 *   S6 ICON_INLINE_ONLY 里的图标不在 sprite 里（它们必须走内联回退）
 *   S7 _headers 有 `/icons.svg` 的 immutable 规则
 *
 * 用法: node scripts/gates/verify-icon-sprite.mjs [--json]
 * 退出码: 0 = 全 PASS；1 = 有 FAIL
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SPRITE = path.join(ROOT, "public/icons.svg");
const MANIFEST = path.join(ROOT, "src/components/Icons/sprite.ts");
const HEADERS = path.join(ROOT, "public/_headers");

const checks = [];
const add = (id, ok, detail) => checks.push({ id, ok, detail });

/* S1 */
const sprite = existsSync(SPRITE) ? readFileSync(SPRITE, "utf-8") : "";
add(
    "S1 sprite 文件存在",
    sprite.trim().length > 0,
    `${path.relative(ROOT, SPRITE)} ${sprite.length} B`,
);
const gIds = [...sprite.matchAll(/<g id="([^"]+)"/g)].map((m) => m[1]);
add(
    "S1 sprite 是 SVG 根 + <g id> 列表",
    /^<svg[\s>]/.test(sprite) && gIds.length > 0,
    `${gIds.length} 个 <g>`,
);

/* S2 */
const manifestSrc = existsSync(MANIFEST) ? readFileSync(MANIFEST, "utf-8") : "";
const version = (manifestSrc.match(/SPRITE_VERSION\s*=\s*"([^"]+)"/) ?? [])[1] ?? "";
const actual = createHash("sha256").update(sprite).digest("hex").slice(0, 8);
add(
    "S2 SPRITE_VERSION = sprite 内容哈希",
    version === actual,
    `manifest=${version || "缺失"} actual=${actual}`,
);

/* 解析清单 */
const manifestBlock = (manifestSrc.match(/ICON_VIEWBOXES[^{]*\{([\s\S]*?)\n\};/) ?? [])[1] ?? "";
const manifestIds = [...manifestBlock.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => ({
    name: m[1],
    viewBox: m[2],
}));
const inlineBlock = (manifestSrc.match(/ICON_INLINE_ONLY[^[]*\[([\s\S]*?)\];/) ?? [])[1] ?? "";
const inlineOnly = [...inlineBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

/* S3 */
const spriteSet = new Set(gIds);
const sid = (name) => name.replace(/[:/]/g, "-");
const missing = manifestIds.filter(
    (m) => !inlineOnly.includes(m.name) && !spriteSet.has(sid(m.name)),
);
add(
    "S3 清单图标都在 sprite 里",
    missing.length === 0,
    missing.map((m) => m.name).join(", ") || "全部命中",
);

/* S4 */
const known = new Set(manifestIds.map((m) => sid(m.name)));
const orphans = gIds.filter((id) => !known.has(id));
add("S4 sprite 无孤儿 <g>", orphans.length === 0, orphans.join(", ") || "无");

/* S5 */
const dupes = gIds.filter((id, i) => gIds.indexOf(id) !== i);
add(
    "S5 id 唯一且不含 ':'",
    dupes.length === 0 && !gIds.some((id) => id.includes(":")),
    dupes.join(", ") || "OK",
);

/* S6 */
const wronglyInSprite = inlineOnly.filter((name) => spriteSet.has(sid(name)));
add(
    "S6 inlineOnly 图标不在 sprite 里",
    wronglyInSprite.length === 0,
    `inlineOnly=[${inlineOnly.join(", ")}]`,
);

/* S7 */
const headers = existsSync(HEADERS) ? readFileSync(HEADERS, "utf-8") : "";
const headerOk = /^\/icons\.svg\n\s+Cache-Control:.*immutable/m.test(headers);
add("S7 _headers 有 /icons.svg immutable", headerOk, headerOk ? "命中" : "缺少规则");

/* 报告 */
const json = process.argv.includes("--json");
let failed = 0;
for (const c of checks) {
    if (!c.ok) failed++;
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id} — ${c.detail}`);
}
if (json) {
    console.log(JSON.stringify({ checks, failed }, null, 2));
}
console.log(`\n${checks.length - failed}/${checks.length} PASS${failed ? " ❌" : " ✅"}`);
process.exitCode = failed === 0 ? 0 : 1;
