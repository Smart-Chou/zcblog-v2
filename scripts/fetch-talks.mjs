/**
 * fetch-talks.mjs
 * 从 Blinko REST API 抓取公开笔记，生成 talks.json
 *
 * 环境变量: BLINKO_API_URL   (Blinko 服务地址，如 https://memos.example.com)
 *            BLINKO_API_TOKEN (Blinko 设置 → API Token)
 * 用法:      node scripts/fetch-talks.mjs
 */

import { writeFile } from "node:fs/promises";
import { loadEnvFile } from "./lib/env.mjs";
import { failFetch, okFetch, skipFetch } from "./lib/fetch-status.mjs";

// Blinko 服务地址在 main() 中根据 BLINKO_API_URL 初始化
// （模块顶层先于 .env 加载执行，不能在此直接读取环境变量）
let BLINKO_BASE = "";
let BLINKO_API = "";
const OUTPUT = "src/data/talks.json";

// ── 工具函数 ──

function relativeTime(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "刚刚";
    const units = [
        [3600, 60, "分钟"],
        [86400, 3600, "小时"],
        [2592000, 86400, "天"],
        [31104000, 2592000, "个月"],
        [Infinity, 31104000, "年"],
    ];
    for (const [max, div, unit] of units) {
        if (diff < max) return `${Math.floor(diff / div)}${unit}前`;
    }
}

function formatDate(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 补全协议 + 补全域名 */
const fullUrl = (raw) => {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
        return raw.replace(/^http:/, "https:");
    }
    return BLINKO_BASE + (raw.startsWith("/") ? "" : "/") + raw;
};

/** 从笔记中提取所有图片 URL */
function extractImages(note) {
    const urls = [];

    // 结构化附件
    for (const a of note.attachments || []) {
        if (
            a.mimeType?.startsWith("image/") ||
            /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(a.fileName || a.path || "")
        ) {
            urls.push(fullUrl(a.url || a.path));
        }
    }

    // Markdown 兜底
    for (const [, url] of (note.content || "").matchAll(/!\[.*?\]\(([^)\s]+)\)/g)) {
        urls.push(fullUrl(url));
    }

    return [...new Set(urls)];
}

// ── 主逻辑 ──

async function main() {
    loadEnvFile();

    BLINKO_BASE = (process.env.BLINKO_API_URL ?? "").replace(/\/+$/, "");
    BLINKO_API = `${BLINKO_BASE}/api/v1/note/list`;

    const TOKEN = process.env.BLINKO_API_TOKEN;
    if (!TOKEN || !BLINKO_BASE) {
        skipFetch(OUTPUT, "未设置 BLINKO_API_URL 或 BLINKO_API_TOKEN 环境变量");
    }

    // 分页拉取所有公开笔记
    const allNotes = [];
    let page = 1;
    const PAGE_SIZE = 50;

    try {
        while (true) {
            const res = await fetch(BLINKO_API, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${TOKEN}`,
                },
                body: JSON.stringify({
                    isShare: true,
                    isRecycle: false,
                    isArchived: false,
                    orderBy: "desc",
                    size: PAGE_SIZE,
                    page,
                }),
                signal: AbortSignal.timeout(10000),
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const pageData = await res.json();

            if (!Array.isArray(pageData) || pageData.length === 0) break;
            allNotes.push(...pageData);

            if (pageData.length < PAGE_SIZE) break;
            page++;
        }
    } catch (err) {
        failFetch(OUTPUT, `无法获取 Blinko API: ${err.message}`);
        process.exit(0);
    }

    if (allNotes.length === 0) {
        failFetch(OUTPUT, "API 返回格式异常（未取到任何笔记）");
        process.exit(0);
    }

    // 只保留真正公开的笔记（无密码、未过期）
    const publicNotes = allNotes.filter(
        (n) =>
            n.isShare &&
            !n.sharePassword &&
            (!n.shareExpiryDate || new Date(n.shareExpiryDate) > new Date()),
    );

    if (publicNotes.length === 0) {
        failFetch(OUTPUT, "无有效公开笔记");
        process.exit(0);
    }

    const items = publicNotes.map((n) => {
        const iso = n.createdAt || n.updatedAt;
        const images = extractImages(n);

        return {
            datetime: formatDate(iso),
            display: relativeTime(iso),
            url: `${BLINKO_BASE}/share/${n.shareEncryptedUrl || n.id}`,
            content: n.content || "",
            sortDate: new Date(iso).toISOString(),
            ...(images.length > 0 && { images }),
        };
    });

    items.sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());

    // 移除仅用于排序的内部字段
    for (const item of items) delete item.sortDate;

    await writeFile(OUTPUT, JSON.stringify(items, null, 2) + "\n", "utf-8");
    okFetch(OUTPUT, `${items.length} 条`);
    console.log(`✅ talks.json 已更新 (${items.length} 条)`);
}

main();
