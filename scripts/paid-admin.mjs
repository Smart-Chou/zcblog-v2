#!/usr/bin/env node
/**
 * 本地码管理：list / revoke / export。
 *
 *   node scripts/paid-admin.mjs list
 *   node scripts/paid-admin.mjs revoke --hash <64位hash>
 *   node scripts/paid-admin.mjs export --out paid-keys/export.json
 *
 * 注意：KV 里只有码的哈希，没有明文码；明文只在 paid-keys/*.csv 里。
 */
import fs from "node:fs";
import path from "node:path";

const kvPath = path.resolve("workers/paid-gateway/dev-kv.json");

function arg(name, fallback = "") {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function load() {
    if (!fs.existsSync(kvPath)) {
        console.error(`找不到 ${path.relative(process.cwd(), kvPath)}（先跑 paid-import.mjs）`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(kvPath, "utf8"));
}

function save(kv) {
    fs.writeFileSync(kvPath, JSON.stringify(kv, null, 2) + "\n");
}

const cmd = process.argv[2] || "list";
const kv = load();

if (cmd === "list") {
    const codes = Object.entries(kv).filter(([k]) => k.startsWith("code:"));
    console.log(`共 ${codes.length} 条码`);
    for (const [key, raw] of codes) {
        const r = JSON.parse(raw);
        const hash = key.slice(5);
        console.log(
            `${hash.slice(0, 10)}…  ${r.revoked ? "REVOKED" : "active "}  ` +
                `slugs=${Array.isArray(r.slugs) ? r.slugs.join("|") : r.slugs}  ` +
                `max=${r.max}  batch=${r.batch || "-"}`,
        );
    }
} else if (cmd === "revoke") {
    const hash = arg("hash");
    if (!hash || hash.length !== 64) {
        console.error("需要 --hash <64 位 SHA-256>");
        process.exit(1);
    }
    const key = `code:${hash}`;
    if (!kv[key]) {
        console.error("找不到这条码");
        process.exit(1);
    }
    const record = JSON.parse(kv[key]);
    kv[key] = JSON.stringify({ ...record, revoked: true });
    save(kv);
    console.log(`已吊销 ${hash.slice(0, 10)}…`);
} else if (cmd === "export") {
    const out = path.resolve(arg("out", "paid-keys/export.json"));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(kv, null, 2) + "\n");
    fs.chmodSync(out, 0o600);
    console.log(`已导出 ${path.relative(process.cwd(), out)}`);
} else {
    console.error("用法：node scripts/paid-admin.mjs <list|revoke|export>");
    process.exit(1);
}
