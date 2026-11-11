#!/usr/bin/env node
/**
 * 把 v1 遗留的前置字段归一成 v2 schema 的写法（构建期一次性，不动内容仓）。
 *
 * 背景：内容仓 `Smart-Chou/zcblog-articles` 里 78/86 篇还带着 v1 的布尔开关
 * （`mathjax` / `mermaid` / `plantuml` / `katex` / `chart` / `markmap`）和 `sticky`。
 * v2 的 content schema 是 `.strict()`（D-0020），这些键会被判为未知字段直接构建失败；
 * 而其中少数 `true` 是有含义的 —— 丢掉就等于「该渲染 mermaid 的文章静默不再渲染」（D-0045）。
 *
 * 做法：
 *   - `xxx: true` → 合并进 `features: [...]`（去重、按 v2 的固定顺序）
 *   - 六个布尔键一律删除
 *   - `sticky` 保留（schema 里已有同名字段，用于置顶排序）
 * 幂等：跑两遍结果一致。
 *
 * 用法: node scripts/normalize-frontmatter.mjs <内容目录>
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FEATURE_KEYS = ["mermaid", "mathjax", "katex", "plantuml", "chart", "markmap"];
const DIR = process.argv[2];
// --add-only：只把布尔键补成 features，不删除任何遗留键。
// 用于「内容仓迁移」场景：旧站 schema 仍声明了这六个布尔键，删了会让旧站丢特性，
// 而旧站对未知键是「strip」而不是报错，所以两边可以共存（先加 features，切流后再删布尔键）。
const ADD_ONLY = process.argv.includes("--add-only");

if (!DIR) {
    console.error("用法: node scripts/normalize-frontmatter.mjs <内容目录>");
    process.exit(2);
}

/** 只处理第一个 frontmatter 块，正文原样返回 */
function splitFrontmatter(text) {
    if (!text.startsWith("---")) return null;
    const end = text.indexOf("\n---", 3);
    if (end === -1) return null;
    return {
        // head 从开头的 `---` 到结束分隔符前一行（不带结尾换行），rest 从 "\n---" 开始
        head: text.slice(0, end),
        rest: text.slice(end),
    };
}

function mergeFeatures(existing, added) {
    const set = new Set(existing);
    for (const f of added) set.add(f);
    // 按 schema 里的固定顺序输出，方便 diff
    return FEATURE_KEYS.filter((k) => set.has(k));
}

function normalizeFile(path) {
    const raw = readFileSync(path, "utf8");
    const parts = splitFrontmatter(raw);
    if (!parts) return false;

    const lines = parts.head.split("\n");
    const enabled = [];
    const kept = [];

    for (const line of lines) {
        const m = line.match(/^([A-Za-z0-9_-]+):\s*(\S*)\s*$/);
        if (m && FEATURE_KEYS.includes(m[1])) {
            if (m[2] === "true") enabled.push(m[1]);
            if (ADD_ONLY) kept.push(line); // 迁移模式：保留原键，旧站还要用
            continue; // 默认（CI 拷贝）六个布尔键全部删除
        }
        // v1 的单值分类：v2 从 M8-7a 起把 `category` 收进 schema（可选 kebab slug）。
        // 合法的 v2 slug 原样保留；旧站的中文值（如 `日常`）在 v2 构建里丢弃 ——
        // 映射成 tag 会凭空多出一个 `/tags/日常/` 页面，属于 V1 不该发生的变化。
        // `--add-only` 是旧站迁移模式，未知值原样保留。
        if (/^category:/.test(line)) {
            const value = line
                .replace(/^category:\s*/, "")
                .trim()
                .replace(/^["']|["']$/g, "");
            if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 24) {
                kept.push(`category: ${value}`);
            } else if (ADD_ONLY) {
                kept.push(line);
            }
            continue;
        }
        kept.push(line);
    }

    // 找出已有的 features 写法（flow 或 block）
    let featuresIdx = kept.findIndex((l) => /^features:/.test(l));
    let existing = [];
    if (featuresIdx !== -1) {
        const inline = kept[featuresIdx].replace(/^features:\s*/, "").trim();
        if (inline.startsWith("[")) {
            existing = inline
                .replace(/^\[|\]$/g, "")
                .split(",")
                .map((s) => s.trim().replace(/^["']|["']$/g, ""))
                .filter(Boolean);
            kept.splice(featuresIdx, 1);
            featuresIdx = -1;
        } else {
            // block 风格：吃掉紧随其后的 "  - xxx" 行
            let j = featuresIdx + 1;
            while (j < kept.length && /^\s*-\s*\S/.test(kept[j])) {
                existing.push(kept[j].replace(/^\s*-\s*/, "").trim());
                j++;
            }
            kept.splice(featuresIdx, j - featuresIdx);
            featuresIdx = -1;
        }
    }

    const merged = mergeFeatures(existing, enabled);
    if (merged.length) {
        // 去掉末尾空行后再追加，保证 features 是 frontmatter 的最后一行
        while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
        kept.push(`features: [${merged.join(", ")}]`);
    }

    const out = `${kept.join("\n")}${parts.rest}`;
    if (out === raw) return false;
    writeFileSync(path, out, "utf8");
    return true;
}

let changed = 0;
let scanned = 0;
for (const name of readdirSync(DIR)) {
    if (!/\.(md|mdx)$/.test(name)) continue;
    const p = join(DIR, name);
    if (!statSync(p).isFile()) continue;
    scanned++;
    if (normalizeFile(p)) changed++;
}
console.log(`归一化完成：扫描 ${scanned} 篇，改写 ${changed} 篇（目录 ${DIR}）`);
