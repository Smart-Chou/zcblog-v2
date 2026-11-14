/**
 * fetch-douban.mjs
 * 从豆瓣 RSS Feed (RSS 2.0) 抓取书影音动态，解析后生成本地 JSON 数据文件。
 *
 * 环境变量: DOUBAN_USER_ID  (豆瓣用户 ID，见 .env)
 * 用法:      node scripts/fetch-douban.mjs
 */

import { writeFile, mkdir, readdir, unlink, access } from "node:fs/promises";
import sharp from "sharp";
import { loadEnvFile } from "./lib/env.mjs";
import { failFetch, okFetch, skipFetch } from "./lib/fetch-status.mjs";

const RSS_URL = (userId) => `https://www.douban.com/feed/people/${userId}/interests`;

const OUTPUT_DIR = "src/data";
const DATA_FILE = "src/data/douban.json";
const COVER_DIR = "public/images/douban";
const COVER_WIDTH = 300;
const FETCH_TIMEOUT = 10000;
const UA = "zcblog/1.0";

// ── 状态前缀 → status 映射 ──

const STATUS_PREFIXES = [
    { prefix: "想读", status: "wish", type: "book" },
    { prefix: "在读", status: "reading", type: "book" },
    { prefix: "读过", status: "read", type: "book" },
    { prefix: "想看", status: "wish", type: "movie" },
    { prefix: "在看", status: "watching", type: "movie" },
    { prefix: "看过", status: "watched", type: "movie" },
    { prefix: "想听", status: "wish", type: "music" },
    { prefix: "在听", status: "listening", type: "music" },
    { prefix: "听过", status: "listened", type: "music" },
];

/** 豆瓣评分文案 → 星级 */
const RATING_MAP = {
    力荐: 5,
    推荐: 4,
    还行: 3,
    较差: 2,
    很差: 1,
};

// ── 工具函数 ──

function extractSubjectId(url) {
    const m = url?.match(/\/subject\/(\d+)/);
    return m?.[1] ?? null;
}

function getType(url) {
    if (url.includes("movie.douban.com")) return "movie";
    if (url.includes("book.douban.com")) return "book";
    if (url.includes("music.douban.com")) return "music";
    return "unknown";
}

/** 从标题中提取状态和纯标题 */
function parseTitle(rawTitle, linkType) {
    for (const { prefix, status, type } of STATUS_PREFIXES) {
        if (rawTitle.startsWith(prefix) && type === linkType) {
            return {
                status,
                title: rawTitle.slice(prefix.length),
            };
        }
    }
    // fallback: 按链接类型给默认状态
    return { status: "", title: rawTitle };
}

/** 从 description HTML 中提取评分、短评、封面图 */
function parseDescription(descHtml) {
    // CDATA 内容已经是 HTML 片段
    const imgMatch = descHtml.match(/<img[^>]+src="([^"]+)"/);
    const coverUrl = imgMatch?.[1] ?? "";

    // 评分: "推荐: 推荐"
    const ratingMatch = descHtml.match(/推荐:\s*([^<\s]+)/);
    let rating = 0;
    if (ratingMatch) {
        rating = RATING_MAP[ratingMatch[1]] ?? 0;
    }

    // 短评: "备注: xxx"
    const commentMatch = descHtml.match(/备注:\s*([\s\S]+?)(?:<\/p>|$)/);
    let comment = "";
    if (commentMatch) {
        comment = commentMatch[1].replace(/<[^>]+>/g, "").trim();
    }

    return { coverUrl, rating, comment };
}

/** 解析 RSS <item> */
function parseItem(itemXml) {
    try {
        const linkMatch = itemXml.match(/<link>([^<]+)<\/link>/);
        const titleMatch = itemXml.match(/<title>([^<]+)<\/title>/);
        const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
        const dateMatch = itemXml.match(/<pubDate>([^<]+)<\/pubDate>/);

        const url = linkMatch?.[1]?.trim() ?? "";
        const subjectId = extractSubjectId(url);
        const type = getType(url);

        if (!subjectId || type === "unknown") return null;

        const rawTitle = titleMatch?.[1]?.trim() ?? "";
        const { status, title } = parseTitle(rawTitle, type);

        let rawCoverUrl = "";
        let rating = 0;
        let comment = "";
        if (descMatch?.[1]) {
            const parsed = parseDescription(descMatch[1]);
            rawCoverUrl = parsed.coverUrl;
            rating = parsed.rating;
            comment = parsed.comment;
        }

        const date = dateMatch?.[1] ? new Date(dateMatch[1]).toISOString() : "";

        return {
            title,
            url,
            subjectId,
            rawCoverUrl,
            cover: "",
            rating,
            status,
            tags: [],
            comment,
            type,
            date,
        };
    } catch {
        return null;
    }
}

// ── 封面下载 ──

async function downloadCover(imageUrl, subjectId) {
    await mkdir(COVER_DIR, { recursive: true });
    const filePath = `${COVER_DIR}/${subjectId}.webp`;
    const publicPath = `/images/douban/${subjectId}.webp`;

    // 已存在则跳过
    try {
        await access(filePath);
        return publicPath;
    } catch {
        /* 文件不存在，继续下载 */
    }

    try {
        const res = await fetch(imageUrl, {
            headers: { Referer: "https://www.douban.com", "User-Agent": UA },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return "";

        const buffer = Buffer.from(await res.arrayBuffer());
        await sharp(buffer).resize(COVER_WIDTH).webp({ quality: 80 }).toFile(filePath);

        return publicPath;
    } catch {
        return "";
    }
}

// ── 清理孤儿封面 ──

async function cleanOrphanCovers(validSubjectIds) {
    const idSet = new Set(validSubjectIds);
    try {
        const files = await readdir(COVER_DIR);
        for (const f of files) {
            const id = f.replace(/\.webp$/, "");
            if (!idSet.has(id)) {
                await unlink(`${COVER_DIR}/${f}`);
            }
        }
    } catch {
        /* 目录不存在则忽略 */
    }
}

// ── 写 JSON ──

async function writeJson(filename, data) {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(`${OUTPUT_DIR}/${filename}`, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// ── 主逻辑 ──

async function main() {
    loadEnvFile();

    const userId = process.env.DOUBAN_USER_ID;
    if (!userId) {
        skipFetch(DATA_FILE, "未设置 DOUBAN_USER_ID 环境变量");
    }

    // 1. 拉取 RSS
    const rssUrl = RSS_URL(userId);
    let xml;
    try {
        const res = await fetch(rssUrl, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(FETCH_TIMEOUT),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        xml = await res.text();
    } catch (err) {
        failFetch(DATA_FILE, `RSS 获取失败: ${err.message}`);
        process.exit(0);
    }

    // 2. 解析 items（RSS 2.0 用 <item>，不是 Atom <entry>）
    const raw = [];
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const entry = parseItem(m[1]);
        if (entry) raw.push(entry);
    }

    if (raw.length === 0) {
        failFetch(DATA_FILE, "未解析到有效条目");
        process.exit(0);
    }

    // 3. 按类型分桶
    const movies = raw.filter((e) => e.type === "movie");
    const books = raw.filter((e) => e.type === "book");
    const music = raw.filter((e) => e.type === "music");

    // 4. 下载封面（已有则跳过）
    let downloaded = 0;
    for (const e of raw) {
        if (e.rawCoverUrl) {
            e.cover = await downloadCover(e.rawCoverUrl, e.subjectId);
            if (e.cover) downloaded++;
        }
    }

    // 5. 清理孤儿封面
    await cleanOrphanCovers(raw.map((e) => e.subjectId));

    // 6. 去除内部字段后合并为单一文件
    const clean = (arr) => arr.map(({ subjectId, rawCoverUrl, ...rest }) => rest);

    const sortByDate = (arr) => arr.sort((a, b) => (b.date > a.date ? 1 : -1));

    const all = sortByDate([...clean(books), ...clean(movies), ...clean(music)]);

    await writeJson("douban.json", all);
    okFetch(DATA_FILE, `书:${books.length} 影:${movies.length} 音:${music.length}`);

    // 7. 统计
    console.log(
        `✅ 豆瓣数据已更新 (书:${books.length} 影:${movies.length} 音:${music.length} | 封面:${downloaded}/${raw.length})`,
    );
}

main();
