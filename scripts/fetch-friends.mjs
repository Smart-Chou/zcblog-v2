/**
 * fetch-friends.mjs
 * 从 RSSHub 的 foreverblog 路由抓取友圈文章，生成 friends-articles.json
 *
 * 环境变量（可选）:
 *   FOREVERBLOG_RSS_URL  — RSS 源地址，默认用 rsshub.rssforever.com
 * 用法: node scripts/fetch-friends.mjs
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { loadEnvFile } from "./lib/env.mjs";
import { failFetch, okFetch } from "./lib/fetch-status.mjs";

const DEFAULT_RSS = "https://rsshub.rssforever.com/foreverblog/feeds";
const OUTPUT = "src/data/friends-articles.json";
const FETCH_TIMEOUT = 15000;
const UA = "zcblog/1.0";
const MAX_ITEMS = 20;

// ── 相对时间 ──

function relativeTime(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "刚刚";
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(diff / 3600);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(diff / 86400);
    if (days < 30) return `${days} 天前`;
    const months = Math.floor(diff / 2592000);
    return `${months} 个月前`;
}

// ── 作者名 → 头像色（基于名字 hash）──

function avatarForName(name) {
    const hue = [...name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
    const initial = name.charAt(0);
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">` +
        `<rect width="48" height="48" rx="24" fill="hsl(${hue},55%,60%)"/>` +
        `<text x="24" y="32" text-anchor="middle" fill="white" font-size="22" font-family="sans-serif">${initial}</text>` +
        `</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// ── 解析 RSS <item> ──

function parseItem(itemXml) {
    try {
        const rawTitle =
            (itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) ||
                [])[1]?.trim() ?? "";
        const url =
            (itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/) ||
                [])[1]?.trim() ?? "";
        const dateStr =
            (itemXml.match(/<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/) ||
                [])[1]?.trim() ?? "";
        const date = dateStr ? new Date(dateStr).toISOString() : "";

        if (!rawTitle || !url) return null;

        // 标题格式: "作者名: 文章标题"
        const sepIdx = rawTitle.search(/[：:]\s/);
        let name = "";
        let title = rawTitle;
        if (sepIdx > 0) {
            name = rawTitle.slice(0, sepIdx).trim();
            title = rawTitle
                .slice(sepIdx + 1)
                .replace(/^[：:]\s*/, "")
                .trim();
        }

        return { name, title, url, date };
    } catch {
        return null;
    }
}

// ── 主逻辑 ──

async function main() {
    loadEnvFile();

    const rssUrl = process.env.FOREVERBLOG_RSS_URL || DEFAULT_RSS;

    // 读旧数据，构建 name → avatar 映射
    let oldAvatarMap = {};
    try {
        const oldRaw = await readFile(OUTPUT, "utf-8");
        const oldData = JSON.parse(oldRaw);
        for (const item of oldData) {
            if (item.name && item.avatar && !item.avatar.startsWith("data:")) {
                oldAvatarMap[item.name] = item.avatar;
            }
        }
    } catch {
        /* 旧数据不存在，从零开始 */
    }

    // 1. 拉取 RSS
    let xml;
    try {
        const res = await fetch(rssUrl, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(FETCH_TIMEOUT),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        xml = await res.text();
    } catch (err) {
        failFetch(OUTPUT, `RSS 获取失败: ${err.message}`);
        process.exit(0);
    }

    // 2. 解析 items
    const raw = [];
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const item = parseItem(m[1]);
        if (item) raw.push(item);
    }

    if (raw.length === 0) {
        failFetch(OUTPUT, "未解析到有效条目");
        process.exit(0);
    }

    // 3. 转为输出格式
    const items = raw.slice(0, MAX_ITEMS).map((item) => ({
        name: item.name,
        avatar: oldAvatarMap[item.name] || avatarForName(item.name),
        title: item.title,
        url: item.url,
        updated: relativeTime(item.date),
    }));

    // 4. 写 JSON
    await mkdir("src/data", { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(items, null, 4) + "\n", "utf-8");

    okFetch(OUTPUT, `${items.length} 条`);
    console.log(`✅ friends-articles.json 已更新 (${items.length} 条)`);
}

main();
