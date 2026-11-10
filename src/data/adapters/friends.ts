/**
 * friends adapter —— 友链数据的唯一入口（M2-6a · P-05）
 *
 * 职责边界（D-0101-1「产品内置页 + 数据适配器」）：
 * - 只做形状归一化与状态判定，**不抛异常**：构建期任何脏数据都退化成 status，
 *   页面因此永远能出 200（空态/错误态是页面状态，不是构建失败）。
 * - 不含任何站点/私人数据：站点把自己的 JSON 放在 `src/data/<friendsPage.dataFile>`
 *   （默认 `friends.json`），由 `loadSiteFriends()` 按槽位取用；槽位缺失 = 空态。
 * - 兼容两种历史形状：
 *     · 站点友链：`{ id, link, avatar, style }`（style 是旧的内联配色，已废弃不读）
 *     · 通用/注入：`{ name, url, avatar?, description? }`，也接受 `{ items: [...] }` 包裹
 *
 * 为什么状态是「三态」而不是「有/无」：错误态必须与空态视觉可分（运维能看出是数据坏了，
 * 而不是站点还没交朋友），但两者都不许影响页面其余部分（申请入口、评论区照常渲染）。
 *
 * M8-5b 追加「友圈文章快照」（fetch-friends.mjs 产出的 `friends-articles.json`）的同一套口径：
 * 快照缺失/损坏/过期都不许炸构建，过期与失败退化为状态（详见文件末尾）。
 */

import { statSync } from "node:fs";
import { resolve } from "node:path";

/** 一条友链（adapter 归一化后的最小契约，页面只消费这些字段）。 */
export interface FriendLink {
    /** 站点名；历史数据里的 `id` 可能是 `@handle`，原样保留。 */
    name: string;
    /** 绝对 http(s) URL；协议相对写法会被补成 https。 */
    url: string;
    /** 头像：http(s) / data:image / 站点内绝对路径；非法值直接丢弃（页面回退首字母）。 */
    avatar?: string;
    /** 一句话简介；站点数据里通常没有，页面回退显示 host。 */
    description?: string;
}

export type FriendsStatus = "ok" | "empty" | "error";

/** 机器可读的状态原因（页面按 code 选文案，不直接展示英文/堆栈）。 */
export type FriendsIssueCode =
    "slot-disabled" | "source-missing" | "source-empty" | "source-not-array" | "no-valid-entries";

export interface FriendsFeed {
    status: FriendsStatus;
    items: FriendLink[];
    /** 可用条目数（= items.length，方便模板不重复取长度）。 */
    total: number;
    /** 被丢弃的条目数（缺字段 / 非 http(s) / 重复 URL）。 */
    dropped: number;
    /** 非 ok 时的原因，供页面选文案与日志排查。 */
    issue?: { code: FriendsIssueCode; detail?: string };
}

/** 站点数据槽位文件名（`src/data/` 下）。构建期只登记这一个槽位。 */
export const FRIENDS_SLOT = "friends.json";

/** 构建期只登记站点友链这一个槽位：glob 是静态的，不能按运行时字符串扩张。 */
const SITE_SLOTS = import.meta.glob<{ default: unknown }>("../friends.json", { eager: true });

const SLOT_PREFIX = "../";
const LIST_KEYS = ["default", "items", "friends", "list"] as const;
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

function readText(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
}

/** 只接受 http(s)；协议相对（`//host/x`）补 https，其余协议（javascript:/data:）一律拒绝。 */
function toHttpUrl(value: string): string | undefined {
    const candidate = value.startsWith("//") ? `https:${value}` : value;
    try {
        const parsed = new URL(candidate);
        if (!HTTP_PROTOCOLS.has(parsed.protocol)) return undefined;
        if (!parsed.hostname) return undefined;
        return parsed.toString();
    } catch {
        return undefined;
    }
}

/** 头像可以是远程图、内联 SVG（data:image/…）或站点内绝对路径；其他形状丢弃。 */
function toAvatar(value: string | undefined): string | undefined {
    if (!value) return undefined;
    if (value.startsWith("/") && !value.startsWith("//")) return value;
    if (/^data:image\/[a-z+.-]+[;,]/i.test(value)) return value;
    return toHttpUrl(value);
}

/** 去重键：host + path（忽略大小写与结尾斜杠），query/hash 不参与。 */
function dedupeKey(url: string): string {
    try {
        const parsed = new URL(url);
        const path = parsed.pathname.replace(/\/+$/, "");
        return `${parsed.host.toLowerCase()}${path.toLowerCase()}`;
    } catch {
        return url.toLowerCase();
    }
}

/**
 * 单条归一化：缺名字/缺 URL/非 http(s) → null（由调用方计入 dropped）。
 * 不读 `style`：旧数据的内联配色会绕过主题与对比度校验，P-05 起统一由 token 上色。
 */
export function normalizeFriend(raw: unknown): FriendLink | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;

    const name = readText(record.name) ?? readText(record.id) ?? readText(record.title);
    const rawUrl = readText(record.url) ?? readText(record.link);
    if (!name || !rawUrl) return null;

    const url = toHttpUrl(rawUrl);
    if (!url) return null;

    const avatar = toAvatar(
        readText(record.avatar) ?? readText(record.avatarUrl) ?? readText(record.image),
    );
    // title 已被名字回退用过，简介只认显式字段，避免 RSS 条目的文章标题变成简介
    const description =
        readText(record.description) ?? readText(record.desc) ?? readText(record.intro);

    return {
        name,
        url,
        ...(avatar ? { avatar } : {}),
        ...(description ? { description } : {}),
    };
}

type ListRead =
    { list: unknown[]; code?: undefined } | { list: null; code: FriendsIssueCode | null };

/** 拆包裹：数组直接用；对象按 default/items/friends/list 找一个数组。 */
function readList(raw: unknown): ListRead {
    if (raw === undefined || raw === null) return { list: null, code: null };
    if (Array.isArray(raw)) return { list: raw };
    if (typeof raw === "object") {
        const record = raw as Record<string, unknown>;
        for (const key of LIST_KEYS) {
            if (!(key in record)) continue;
            const value = record[key];
            if (Array.isArray(value)) return { list: value };
            if (value === undefined || value === null) return { list: null, code: null };
            return { list: null, code: "source-not-array" };
        }
        // 空对象 / 认不出的对象：视为「站点还没放数据」，不是错误
        return { list: null, code: null };
    }
    return { list: null, code: "source-not-array" };
}

function emptyFeed(code: FriendsIssueCode = "source-missing"): FriendsFeed {
    return { status: "empty", items: [], total: 0, dropped: 0, issue: { code } };
}

function errorFeed(code: FriendsIssueCode, detail?: string): FriendsFeed {
    return {
        status: "error",
        items: [],
        total: 0,
        dropped: 0,
        issue: { code, ...(detail ? { detail } : {}) },
    };
}

/**
 * 纯函数入口：吃站点注入的任意值，吐出三态之一。永不抛异常。
 *
 * @param raw 站点数据（通常是 JSON 模块的 default）
 * @param options.minItems 低于该条数按空态处理（默认 1）
 */
export function loadFriends(raw: unknown, options: { minItems?: number } = {}): FriendsFeed {
    const minItems = options.minItems ?? 1;
    const { list, code } = readList(raw);

    if (code) return errorFeed(code, `expected an array, got ${typeof raw}`);
    if (!list) return emptyFeed("source-missing");
    if (list.length === 0) return emptyFeed("source-empty");

    const seen = new Set<string>();
    const items: FriendLink[] = [];
    let dropped = 0;

    for (const entry of list) {
        const friend = normalizeFriend(entry);
        if (!friend) {
            dropped += 1;
            continue;
        }
        const key = dedupeKey(friend.url);
        if (seen.has(key)) {
            dropped += 1;
            continue;
        }
        seen.add(key);
        items.push(friend);
    }

    if (items.length === 0) {
        return errorFeed(
            "no-valid-entries",
            `${list.length} entr${list.length === 1 ? "y" : "ies"} rejected`,
        );
    }
    if (items.length < minItems) return emptyFeed("source-empty");

    return { status: "ok", items, total: items.length, dropped };
}

/** 构建期 fixture：CI/验收要预览空态与错误态，但不许改站点数据。 */
export function staticFeed(state: "empty" | "error"): FriendsFeed {
    return state === "error"
        ? errorFeed("no-valid-entries", "PUBLIC_FRIENDS_STATE=error（构建期 fixture）")
        : emptyFeed("source-empty");
}

/**
 * 构建期状态开关（验收/预览用）：`PUBLIC_FRIENDS_STATE=empty|error`。
 * 只影响页面状态，不改数据文件，所以两种态都能在真实构建里被截图/跑 axe。
 */
function previewState(): "empty" | "error" | null {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    const value = env?.PUBLIC_FRIENDS_STATE;
    return value === "empty" || value === "error" ? value : null;
}

/**
 * 按站点配置的槽位取数：
 * - `file` 为空串 → 槽位未启用（空态），构建照常通过；
 * - 槽位文件缺失（glob 未命中）→ 空态，构建照常通过；
 * - 文件存在但内容坏 → 错误态。
 */
export function loadSiteFriends(file: string | undefined = FRIENDS_SLOT): FriendsFeed {
    const forced = previewState();
    if (forced) return staticFeed(forced);
    if (!file) return emptyFeed("slot-disabled");

    const module = SITE_SLOTS[`${SLOT_PREFIX}${file}`];
    return loadFriends(module?.default);
}

/* ──────────────────────────── 友圈文章快照（M8-5b） ──────────────────────────── */

/** 一条友圈文章（`friends-articles.json` 归一化后的最小契约，与 FriendCard 的 props 同形）。 */
export interface FriendsArticle {
    site: string;
    title: string;
    url: string;
    updated: string;
    avatar?: string;
}

export type FriendsArticlesIssueCode =
    | "snapshot-missing"
    | "snapshot-empty"
    | "snapshot-corrupt"
    | "snapshot-not-array"
    | "no-valid-articles"
    | "snapshot-fallback";

export interface FriendsArticlesFeed {
    /** 三态口径与友链一致：ok=有可用条目（stale 也算有），empty=快照缺失/空，error=快照在但不可用。 */
    status: FriendsStatus;
    articles: FriendsArticle[];
    total: number;
    dropped: number;
    /** 数据本身仍可用但超出新鲜度阈值：照常渲染（last-known-good），不做成空壳。 */
    stale: boolean;
    /** 快照年龄（天）；拿不到时间戳时为 null（不做新鲜度判定）。 */
    ageDays: number | null;
    maxAgeDays: number;
    source: "snapshot" | "last-known-good" | "none";
    issue?: { code: FriendsArticlesIssueCode; detail?: string };
}

export const FRIENDS_ARTICLES_SLOT = "friends-articles.json";
/** 与 `scripts/verify-data.mjs` 的 `maxAgeDays` 同口径（7 天）。 */
export const FRIENDS_ARTICLES_MAX_AGE_DAYS = 7;
export const FRIENDS_ARTICLES_LIMIT = 6;

/**
 * `?raw` 而不是静态 JSON import：静态 import 在 JSON 语法坏掉时是**构建失败**，
 * 页面就拿不到「错误态」了；`?raw` 让损坏退化成字符串 → 由 loadFriendsArticles 判死。
 */
const ARTICLE_SLOTS = import.meta.glob<string>("../friends-articles.json", {
    eager: true,
    query: "?raw",
    import: "default",
});

/** 单条归一化：缺站名/标题/非 http(s) URL → null（丢弃，不展示半张卡）。 */
export function normalizeFriendsArticle(raw: unknown): FriendsArticle | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const site = readText(record.name) ?? readText(record.site);
    const title = readText(record.title);
    const url = toHttpUrl(readText(record.url) ?? "");
    if (!site || !title || !url) return null;
    const avatar = toAvatar(readText(record.avatar));
    const updated = readText(record.updated) ?? "";
    return { site, title, url, updated, ...(avatar ? { avatar } : {}) };
}

function articlesFeed(
    status: FriendsStatus,
    code: FriendsArticlesIssueCode,
    extra: Partial<FriendsArticlesFeed> = {},
): FriendsArticlesFeed {
    return {
        status,
        articles: [],
        total: 0,
        dropped: 0,
        stale: false,
        ageDays: null,
        maxAgeDays: FRIENDS_ARTICLES_MAX_AGE_DAYS,
        source: "none",
        issue: { code },
        ...extra,
    };
}

/** 快照年龄：文件 mtime（快照里只有「17 小时前」这种相对串，抓取后就不再刷新）。 */
function snapshotMtimeMs(): number | null {
    try {
        return statSync(resolve(process.cwd(), "src/data", FRIENDS_ARTICLES_SLOT)).mtimeMs;
    } catch {
        return null;
    }
}

/** 同进程内上一次通过的快照：本轮快照坏掉时拿它顶上，没有才是空态/错误态。 */
let articlesLastGood: FriendsArticlesFeed | null = null;

/**
 * 纯函数入口：吃快照原文（字符串或已解析的 JSON），吐出三态 + 新鲜度。永不抛异常。
 *
 * - 缺失 / 损坏 / 非数组 / 全条目非法 → 有 last-known-good 就沿用（source=last-known-good），
 *   否则返回明确空态或错误态；两种情况都不渲染空壳。
 * - 过期（ageDays > maxAgeDays）→ status 仍是 ok，`stale=true`，照常渲染。
 */
export function loadFriendsArticles(
    raw: unknown,
    options: { maxAgeDays?: number; now?: number; snapshotAt?: number | null; limit?: number } = {},
): FriendsArticlesFeed {
    const maxAgeDays = options.maxAgeDays ?? FRIENDS_ARTICLES_MAX_AGE_DAYS;
    const now = options.now ?? Date.now();
    const limit = options.limit ?? FRIENDS_ARTICLES_LIMIT;

    let value = raw;
    let code: FriendsArticlesIssueCode | null = null;
    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        } catch {
            code = "snapshot-corrupt";
        }
    }
    if (!code && (value === undefined || value === null)) code = "snapshot-missing";
    if (!code && !Array.isArray(value)) code = "snapshot-not-array";

    const seen = new Set<string>();
    const articles: FriendsArticle[] = [];
    let dropped = 0;
    let listLength = 0;

    if (!code) {
        const list = value as unknown[];
        listLength = list.length;
        if (listLength === 0) code = "snapshot-empty";
        for (const entry of list) {
            const article = normalizeFriendsArticle(entry);
            if (!article) {
                dropped += 1;
                continue;
            }
            const key = dedupeKey(article.url);
            if (seen.has(key)) {
                dropped += 1;
                continue;
            }
            seen.add(key);
            articles.push(article);
        }
        if (!code && articles.length === 0) code = "no-valid-articles";
    }

    if (code) {
        if (articlesLastGood) {
            return {
                ...articlesLastGood,
                source: "last-known-good",
                issue: { code: "snapshot-fallback", detail: code },
            };
        }
        const emptyish = code === "snapshot-missing" || code === "snapshot-empty";
        return articlesFeed(emptyish ? "empty" : "error", code, {
            maxAgeDays,
            ...(listLength > 0 ? { dropped } : {}),
        });
    }

    const snapshotAt = options.snapshotAt !== undefined ? options.snapshotAt : snapshotMtimeMs();
    const ageDays = snapshotAt ? Math.max(0, (now - snapshotAt) / 86_400_000) : null;
    const feed: FriendsArticlesFeed = {
        status: "ok",
        articles: articles.slice(0, limit),
        total: Math.min(articles.length, limit),
        dropped,
        stale: ageDays !== null && ageDays > maxAgeDays,
        ageDays,
        maxAgeDays,
        source: "snapshot",
    };
    articlesLastGood = feed;
    return feed;
}

/** 构建期 fixture（`PUBLIC_FRIENDS_ARTICLES_STATE=empty|error|stale`）：不改数据文件也能截图/跑 axe。 */
function articlesPreviewState(): "empty" | "error" | "stale" | null {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    const value = env?.PUBLIC_FRIENDS_ARTICLES_STATE;
    return value === "empty" || value === "error" || value === "stale" ? value : null;
}

/**
 * 页面唯一入口：读 `src/data/friends-articles.json` 快照。
 * 槽位缺失（glob 未命中）/ 构建期 fixture 都不会让 `/friends/` 失败。
 */
export function loadSnapshotArticles(
    options: { maxAgeDays?: number; now?: number; limit?: number } = {},
): FriendsArticlesFeed {
    const forced = articlesPreviewState();
    const maxAgeDays = options.maxAgeDays ?? FRIENDS_ARTICLES_MAX_AGE_DAYS;
    if (forced === "empty") return articlesFeed("empty", "snapshot-empty", { maxAgeDays });
    if (forced === "error") return articlesFeed("error", "snapshot-corrupt", { maxAgeDays });
    const slot = `${SLOT_PREFIX}${FRIENDS_ARTICLES_SLOT}`;
    if (forced === "stale") {
        const now = options.now ?? Date.now();
        return loadFriendsArticles(ARTICLE_SLOTS[slot], {
            ...options,
            now,
            snapshotAt: now - (maxAgeDays + 1) * 86_400_000,
        });
    }
    return loadFriendsArticles(ARTICLE_SLOTS[slot], options);
}
