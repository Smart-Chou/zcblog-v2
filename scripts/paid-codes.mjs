#!/usr/bin/env node
/**
 * 生成付费激活码（本地）。
 *
 *   node scripts/paid-codes.mjs --count 20 --slugs paid-demo-local --max 3 --batch demo
 *
 * 输出：
 *   paid-keys/<batch>.csv         code/hash/slugs/max/batch（自己留底）
 *   paid-keys/<batch>.paste.txt   纯码，每行一个（粘贴到爱发电「自动回复」）
 *
 * 不会把码打印到终端，避免进 shell 历史。
 */
import fs from "node:fs";
import path from "node:path";
import {
    generateCode,
    formatCode,
    sha256Hex,
    normalizeCode,
} from "../workers/paid-gateway/src/codes.js";

function arg(name, fallback = "") {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const count = Number(arg("count", "1"));
const slugsRaw = arg("slugs", "");
const max = Number(arg("max", "3"));
const batch = arg("batch", new Date().toISOString().slice(0, 10));
const outDir = path.resolve(arg("out", "paid-keys"));

if (!Number.isInteger(count) || count < 1 || count > 5000) {
    console.error("--count 必须是 1..5000 的整数");
    process.exit(1);
}
if (!slugsRaw) {
    console.error("缺少 --slugs（逗号分隔的 slug，或 * 表示全站）");
    process.exit(1);
}

const slugs =
    slugsRaw === "*"
        ? "*"
        : slugsRaw
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
fs.mkdirSync(outDir, { recursive: true });

const csvPath = path.join(outDir, `${batch}.csv`);
const pastePath = path.join(outDir, `${batch}.paste.txt`);
const rows = ["code,hash,slugs,max,batch"];
const paste = [];

for (let i = 0; i < count; i += 1) {
    const code = formatCode(generateCode());
    const hash = await sha256Hex(normalizeCode(code));
    rows.push(
        `${code},${hash},"${Array.isArray(slugs) ? slugs.join(" ") : slugs}",${max},${batch}`,
    );
    paste.push(code);
}

fs.writeFileSync(csvPath, rows.join("\n") + "\n");
fs.writeFileSync(pastePath, paste.join("\n") + "\n");
fs.chmodSync(csvPath, 0o600);
fs.chmodSync(pastePath, 0o600);

console.log(`已生成 ${count} 条码`);
console.log(`CSV:   ${path.relative(process.cwd(), csvPath)}`);
console.log(`粘贴:  ${path.relative(process.cwd(), pastePath)}`);
console.log(`授权:  ${Array.isArray(slugs) ? slugs.join(",") : slugs}；每码设备上限 ${max}`);
