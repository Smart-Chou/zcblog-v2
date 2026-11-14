/**
 * fetch-bangumi.mjs
 * 从 Bangumi API 抓取用户收藏数据，生成本地 JSON 缓存。
 *
 * 环境变量: BANGUMI_USER_ID (Bangumi 用户 ID；未设置时跳过获取)
 * 用法: node scripts/fetch-bangumi.mjs
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { loadEnvFile } from "./lib/env.mjs";
import { failFetch, okFetch, skipFetch } from "./lib/fetch-status.mjs";

const API_BASE = "https://api.bgm.tv";
const OUTPUT = "src/data/bangumi.json";
const FETCH_TIMEOUT = 15000;
const RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const UA = "zcblog/1.0";

const CATEGORIES = [
    { key: "anime", name: "动漫", subjectType: 2 },
    { key: "book", name: "书籍", subjectType: 1 },
    { key: "music", name: "音乐", subjectType: 3 },
    { key: "game", name: "游戏", subjectType: 4 },
    { key: "tv", name: "电视剧", subjectType: 6 },
];

// ── 工具函数 ──

async function fetchWithRetry(url, retries, retryDelayMs) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        try {
            return await fetch(url, {
                headers: { "User-Agent": UA, Accept: "application/json" },
                signal: controller.signal,
            });
        } catch (err) {
            lastError = err;
            if (attempt < retries) {
                await new Promise((r) => setTimeout(r, retryDelayMs));
            }
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastError;
}

async function fetchCategory(subjectType, userId) {
    const limit = 50;
    let offset = 0;
    let allData = [];

    while (true) {
        if (allData.length >= 1000) break;

        const url = `${API_BASE}/v0/users/${userId}/collections?subject_type=${subjectType}&limit=${limit}&offset=${offset}`;

        const res = await fetchWithRetry(url, RETRIES, RETRY_DELAY_MS);
        if (!res.ok) {
            // 首个请求即失败视为整体失败（交给上层保留旧数据）；分页中途失败保留已取数据
            if (allData.length === 0) throw new Error(`HTTP ${res.status}`);
            break;
        }

        const data = await res.json();
        const batch = data.data || [];

        if (batch.length > 0) {
            allData = allData.concat(batch);
            offset += limit;
            if (batch.length < limit) break;
        } else {
            break;
        }

        await new Promise((r) => setTimeout(r, 50));
    }

    return allData;
}

// ── 主逻辑 ──

async function main() {
    loadEnvFile();

    const BANGUMI_USER_ID = process.env.BANGUMI_USER_ID;
    if (!BANGUMI_USER_ID) {
        skipFetch(OUTPUT, "未设置 BANGUMI_USER_ID 环境变量");
    }

    // 读旧缓存，用于部分失败时合并
    let oldCache = {};
    try {
        const raw = await readFile(OUTPUT, "utf-8");
        oldCache = JSON.parse(raw);
    } catch {
        /* 旧缓存不存在 */
    }

    const bangumiData = {};
    let freshCount = 0;
    let failCount = 0;

    for (const cat of CATEGORIES) {
        try {
            const data = await fetchCategory(cat.subjectType, BANGUMI_USER_ID);
            bangumiData[cat.key] = data;
            freshCount++;
            console.log(`  ${cat.name}: ${data.length} 条`);
        } catch (err) {
            failCount++;
            console.warn(`  ⚠ ${cat.name} 获取失败: ${err.message}`);
        }
    }

    if (freshCount === 0) {
        failFetch(OUTPUT, "所有分类获取失败");
        process.exit(0);
    }

    // 部分失败时，用旧缓存补齐
    if (failCount > 0) {
        for (const cat of CATEGORIES) {
            if (!bangumiData[cat.key] || bangumiData[cat.key].length === 0) {
                bangumiData[cat.key] = oldCache[cat.key] || [];
            }
        }
    }

    await mkdir("src/data", { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(bangumiData, null, 2) + "\n", "utf-8");

    const total = Object.values(bangumiData).reduce((sum, arr) => sum + arr.length, 0);
    okFetch(OUTPUT, `${total} 条`);
    console.log(`✅ bangumi.json 已更新 (${total} 条)`);
}

main();
