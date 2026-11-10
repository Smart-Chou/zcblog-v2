/**
 * verify-data.mjs
 * 在所有 fetch 脚本完成后验证数据文件内容。
 *
 * 规则（按数据源配置感知）：
 *   - 数据源已配置（对应环境变量齐全）且需要校验时：文件缺失/为空/JSON 损坏 → 报错（退出码 1）
 *   - 数据源未配置（或无需配置，如友链）：跳过检查（构建不依赖该数据源，适合主题用户/空配置场景）
 *   - 时效性检查为警告级（不阻断构建）
 *
 * 用法: node scripts/verify-data.mjs
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvFile } from "./lib/env.mjs";

loadEnvFile();

/** 数据目录根（默认 `src/data`）；验收注入三态时用 `VERIFY_DATA_ROOT` 指向 fixture 目录。 */
const DATA_ROOT = process.env.VERIFY_DATA_ROOT ?? "";

const DATA_FILES = [
    {
        path: "src/data/douban.json",
        label: "豆瓣",
        requires: ["DOUBAN_USER_ID"],
        maxAgeDays: 30,
    },
    {
        path: "src/data/talks.json",
        label: "Talks (Blinko)",
        requires: ["BLINKO_API_URL", "BLINKO_API_TOKEN"],
        maxAgeDays: 7,
    },
    {
        path: "src/data/friends-articles.json",
        label: "友链文章",
        requires: [],
        maxAgeDays: 7,
        /** M8-5b：形状按 adapter 口径校验；快照里只有「17 小时前」相对串，新鲜度看文件 mtime。 */
        shape: "friends-articles",
        freshnessFrom: "mtime",
    },
    {
        path: "src/data/bangumi.json",
        label: "Bangumi",
        requires: ["BANGUMI_USER_ID"],
        maxAgeDays: 7,
    },
    {
        path: "src/data/popular.json",
        label: "热门文章 (Umami)",
        requires: ["UMAMI_API_URL", "UMAMI_WEBSITE_ID", "UMAMI_USERNAME", "UMAMI_PASSWORD"],
        maxAgeDays: 7,
    },
];

/**
 * Extract the most recent timestamp from a JSON data file.
 * Supports common patterns: `date`, `pubDate`, `created`, `updated`, `time_stamp`, `timestamp`.
 */
function getLatestTimestamp(data) {
    // 对象形态数据文件：支持顶层同步时间戳（如 popular.json 的 syncedAt）
    if (data && !Array.isArray(data) && typeof data === "object") {
        for (const key of ["syncedAt", "updatedAt"]) {
            const raw = data[key];
            if (typeof raw === "string" || typeof raw === "number") {
                const d = new Date(raw);
                if (!isNaN(d.getTime())) return d;
            }
        }
    }
    const records = Array.isArray(data) ? data : data.data || data.items || [];
    if (records.length === 0) return null;

    let latest = null;
    for (const record of records) {
        const ts =
            record.date ||
            record.pubDate ||
            record.created ||
            record.updated ||
            record.time_stamp ||
            record.timestamp;
        if (!ts) continue;
        const d = new Date(ts);
        if (!isNaN(d.getTime()) && (!latest || d > latest)) {
            latest = d;
        }
    }
    return latest;
}

function getRecordCount(data) {
    if (Array.isArray(data)) return data.length;
    if (Array.isArray(data.data)) return data.data.length;
    if (Array.isArray(data.items)) return data.items.length;
    // If it's a record-style JSON (e.g., friends-articles.json with keyed entries)
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
        const keys = Object.keys(data);
        if (keys.length > 0) return keys.length;
    }
    return 0;
}

const isConfigured = (requires) => requires.every((key) => Boolean(process.env[key]));

/**
 * 友圈快照形状校验（M8-5b），与 `src/data/adapters/friends.ts` 的 normalizeFriendsArticle 同口径：
 * 顶层必须是数组；条目需有非空 name/title 且 url 是 http(s)，否则算「被丢弃」的脏条目。
 */
function validateFriendsArticles(data) {
    if (!Array.isArray(data)) {
        return { ok: false, total: 0, usable: 0, dropped: 0, reason: `顶层不是数组（${typeof data}）` };
    }
    const isText = (value) => typeof value === "string" && value.trim() !== "";
    const usable = data.filter(
        (row) =>
            row &&
            typeof row === "object" &&
            !Array.isArray(row) &&
            isText(row.name) &&
            isText(row.title) &&
            /^https?:\/\//i.test((row.url ?? "").trim()),
    ).length;
    return { ok: true, total: data.length, usable, dropped: data.length - usable, reason: "" };
}

const SHAPE_VALIDATORS = { "friends-articles": validateFriendsArticles };

let hasError = false;

for (const entry of DATA_FILES) {
    const { path: declaredPath, label, requires, maxAgeDays = 7, shape, freshnessFrom } = entry;
    const path = DATA_ROOT ? join(DATA_ROOT, declaredPath.split("/").pop()) : declaredPath;
    const configured = isConfigured(requires);
    // 仅「有必填环境变量 且 已配置」的数据源才做硬性校验；无约束的源（如友链）空数据只提示
    const strict = configured && requires.length > 0;
    const skip = (reason) => {
        if (strict) {
            console.warn(`❌ [fetch:verify] ${label} ${reason}（数据源已配置）: ${path}`);
            hasError = true;
        } else {
            console.log(
                `⏭️  [fetch:verify] ${label} ${reason}（未配置数据源或无需配置，跳过）: ${path}`,
            );
        }
    };

    let s;
    try {
        s = await stat(path);
    } catch {
        skip("数据文件缺失");
        continue;
    }

    if (s.size === 0) {
        skip("数据文件为空");
        continue;
    }

    let raw;
    try {
        raw = await readFile(path, "utf-8");
    } catch {
        skip("数据文件读取失败");
        continue;
    }

    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        console.warn(`❌ [fetch:verify] ${label} JSON 解析失败: ${path}`);
        hasError = true;
        continue;
    }

    const shapeResult = shape && SHAPE_VALIDATORS[shape] ? SHAPE_VALIDATORS[shape](data) : null;
    if (shapeResult) {
        if (!shapeResult.ok || shapeResult.usable === 0) {
            const detail = shapeResult.reason || `可用条目 0/${shapeResult.total}`;
            if (strict) {
                console.warn(`❌ [fetch:verify] ${label} 快照形状异常（数据源已配置）—— ${detail}: ${path}`);
                hasError = true;
            } else {
                console.warn(`⚠️  [fetch:verify] ${label} 快照形状异常（非阻断）—— ${detail}: ${path}`);
            }
            continue;
        }
        if (shapeResult.dropped > 0) {
            console.warn(
                `⚠️  [fetch:verify] ${label} 快照有 ${shapeResult.dropped}/${shapeResult.total} 条脏条目（页面会丢弃）: ${path}`,
            );
        }
        console.log(
            `🧪 [fetch:verify] ${label} 形状正常: 可用 ${shapeResult.usable}/${shapeResult.total} 条`,
        );
    }

    const count = getRecordCount(data);
    if (count === 0) {
        if (strict) {
            console.warn(`❌ [fetch:verify] ${label} 数据为空数组/对象（数据源已配置）: ${path}`);
            hasError = true;
        } else {
            console.log(
                `⏭️  [fetch:verify] ${label} 数据为空（未配置数据源或无需配置，跳过）: ${path}`,
            );
        }
        continue;
    }

    // 时效性检查：仅警告，不阻断
    let ageInfo = "";
    // 快照里的 updated 是「17 小时前」这类相对串（抓取那一刻冻结），解析不出绝对时间 →
    // 该数据源按文件 mtime 判新鲜度（快照多久没刷新 = 数据多久没更新）。
    let latest = getLatestTimestamp(data);
    if (!latest && freshnessFrom === "mtime") {
        latest = s.mtime;
        ageInfo = "，快照时间取文件 mtime";
    }
    if (latest) {
        const ageDays = (Date.now() - latest.getTime()) / (1000 * 60 * 60 * 24);
        ageInfo = `，最新数据: ${latest.toISOString().slice(0, 10)} (${ageDays.toFixed(1)} 天前)${ageInfo}`;
        if (ageDays > maxAgeDays) {
            console.warn(
                `⚠️  [fetch:verify] ${label} 数据过期 (>${maxAgeDays} 天)${ageInfo}: ${path}`,
            );
        }
    } else {
        ageInfo = "，无时间戳字段（跳过时效检查）";
    }

    console.log(
        `✅ [fetch:verify] ${label} 数据正常: ${count} 条记录 (${(s.size / 1024).toFixed(1)} KB)${ageInfo}`,
    );
}

if (hasError) {
    console.warn("⚠️  [fetch:verify] 存在「已配置数据源但未产出数据」的情况，请检查 fetch 脚本。");
    process.exit(1);
}

console.log("✅ [fetch:verify] 数据验证通过。");
process.exit(0);
