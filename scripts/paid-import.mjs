#!/usr/bin/env node
/**
 * 把 paid-codes.mjs 生成的 CSV 导入本地 dev KV（workers/paid-gateway/dev-kv.json）。
 * 只用于本地联调；上线时改用 Cloudflare KV bulk API（后续再接）。
 *
 *   node scripts/paid-import.mjs --file paid-keys/demo.csv
 */
import fs from "node:fs";
import path from "node:path";

function arg(name, fallback = "") {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const file = arg("file");
if (!file) {
    console.error("用法：node scripts/paid-import.mjs --file paid-keys/<batch>.csv");
    process.exit(1);
}

const kvPath = path.resolve("workers/paid-gateway/dev-kv.json");
const csv = fs.readFileSync(path.resolve(file), "utf8").trim().split(/\r?\n/);
const header = csv.shift();
if (!header || !header.startsWith("code,hash,slugs,max,batch")) {
    console.error("CSV 表头不符合预期");
    process.exit(1);
}

const kv = fs.existsSync(kvPath) ? JSON.parse(fs.readFileSync(kvPath, "utf8")) : {};
let imported = 0;

for (const line of csv) {
    if (!line.trim()) continue;
    // code,hash,"slug1 slug2",max,batch
    const m = line.match(/^([^,]+),([0-9a-f]{64}),"([^"]*)",(\d+),(.+)$/);
    if (!m) {
        console.warn(`跳过无法解析的行：${line.slice(0, 40)}…`);
        continue;
    }
    const [, , hash, slugsRaw, maxRaw, batch] = m;
    const slugs = slugsRaw === "*" ? "*" : slugsRaw.split(/\s+/).filter(Boolean);
    kv[`code:${hash}`] = JSON.stringify({
        v: 1,
        slugs,
        max: Number(maxRaw),
        batch,
        revoked: false,
        createdAt: Math.floor(Date.now() / 1000),
    });
    imported += 1;
}

fs.writeFileSync(kvPath, JSON.stringify(kv, null, 2) + "\n");
console.log(`已导入 ${imported} 条到 ${path.relative(process.cwd(), kvPath)}`);
