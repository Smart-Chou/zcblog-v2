/**
 * talks adapter —— 随笔数据的唯一入口（M2-6b · P-06）
 *
 * 职责边界（D-0101-1「产品内置页 + 数据适配器」）：
 * - 只做形状归一化与状态判定，**不抛异常**：构建期任何脏数据都退化成 status，
 *   页面因此永远能出 200（空态/错误态是页面状态，不是构建失败）。
 * - 不含任何站点/私人数据：站点把抓取产物放在 `src/data/<talksPage.dataFile>`
 *   （默认 `talks.json`），由 `loadSiteTalks()` 按槽位取用；槽位缺失 = 空态。
 * - 兼容 Blinko / memos 家族的三种历史形状：
 *     · 列表：`[ { datetime, content, images[], url } ]`（当前站点抓取产物）
 *     · 包裹：`{ items: [...] }` / `{ data: [...] }` / `{ notes: [...] }`
 *     · API 原样：`{ id, content, createdAt, attachments: [{ url }] }`
 *
 * 为什么状态是「三态」而不是「有/无」：错误态必须与空态视觉可分（运维能看出是数据坏了，
 * 而不是作者还没写随笔），但两者都不许影响页面其余部分（标签云、评论区照常）。
 */

/** 一条随笔（adapter 归一化后的最小契约，页面只消费这些字段）。 */
export interface TalkEntry {
    /** 稳定 id：优先用数据源 id，否则由「时间 + 正文」哈希得到（用于锚点与去重）。 */
    id: string;
    /** ISO 时间；时间无法解析时保留原始字符串（页面原样显示，不猜）。 */
    time: string;
    /** 解析出的毫秒时间戳；null = 时间不可解析（排序时排到最后）。 */
    ts: number | null;
    /** 正文（话题标签已剔除）。 */
    text: string;
    /** 话题标签（`#四处逛逛/深圳` 保留层级与顺序，去重）。 */
    tags: string[];
    /** 配图：绝对 http(s) 或站点内绝对路径；其他形状丢弃。 */
    images: string[];
    /** 原文链接（Blinko 分享页）；非 http(s) 丢弃。 */
    url?: string;
}

export type TalksStatus = "ok" | "empty" | "error";

/** 机器可读的状态原因（页面按 code 选文案与日志排查，不直接展示英文/堆栈）。 */
export type TalksIssueCode =
    "slot-disabled" | "source-missing" | "source-empty" | "source-not-array" | "no-valid-entries";

/** 标签云里的一项（计数排序后交给页面）。 */
export interface TalksTag {
    name: string;
    count: number;
}

export interface TalksFeed {
    status: TalksStatus;
    items: TalkEntry[];
    /** 可用条目数（= items.length，方便模板不重复取长度）。 */
    total: number;
    /** 被丢弃的条目数（缺正文 / 时间非法 / 重复）。 */
    dropped: number;
    /** 标签聚合（count 降序、同名升序）。 */
    tags: TalksTag[];
    /** 最新一条的时间（ISO）；空态为 null。 */
    newest: string | null;
    /** 非 ok 时的原因，供页面选文案与日志排查。 */
    issue?: { code: TalksIssueCode; detail?: string };
}

/** 站点数据槽位文件名（`src/data/` 下）。构建期只登记这一个槽位。 */
export const TALKS_SLOT = "talks.json";

/** 构建期只登记站点随笔这一个槽位：glob 是静态的，不能按运行时字符串扩张。 */
const SITE_SLOTS = import.meta.glob<{ default: unknown }>("../talks.json", { eager: true });

const SLOT_PREFIX = "../";
const LIST_KEYS = ["default", "items", "data", "notes", "talks", "list", "results"] as const;
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const HASHTAG_RE = /#([^\s#]+)/g;

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

/** 配图可以是远程图或站点内绝对路径；`data:` 与相对路径一律丢弃（会渲染成空图）。 */
function toImageSource(value: string | undefined): string | undefined {
    if (!value) return undefined;
    if (value.startsWith("/") && !value.startsWith("//")) return value;
    return toHttpUrl(value);
}

/**
 * 时间解析：先按「年月日 + 可选时分秒」手解（`2026/6/21 19:58:48` 这类非 ISO 写法
 * 在 V8 里依赖引擎宽容度，不能指望），失败再退 `Date.parse`（ISO / RFC）。
 * 返回 ts=null 表示不可解析——条目仍保留，只是排到最后、原样显示。
 */
function parseTalkTime(value: unknown): { ts: number | null; text: string } {
    if (value instanceof Date) {
        const ts = value.getTime();
        return Number.isFinite(ts) ? { ts, text: value.toISOString() } : { ts: null, text: "" };
    }

    if (typeof value === "number") {
        if (!Number.isFinite(value) || value <= 0) return { ts: null, text: "" };
        // 秒级时间戳（memos/部分 Blinko 导出）与毫秒级都接受
        const ts = value < 1e11 ? value * 1000 : value;
        return { ts, text: new Date(ts).toISOString() };
    }

    const raw = readText(value);
    if (!raw) return { ts: null, text: "" };

    const parts = raw.match(
        /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
    );
    if (parts) {
        const date = new Date(
            Number(parts[1]),
            Number(parts[2]) - 1,
            Number(parts[3]),
            Number(parts[4] ?? 0),
            Number(parts[5] ?? 0),
            Number(parts[6] ?? 0),
        );
        const ts = date.getTime();
        if (Number.isFinite(ts)) return { ts, text: date.toISOString() };
    }

    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return { ts: parsed, text: new Date(parsed).toISOString() };
    return { ts: null, text: raw };
}

/** 稳定 id：djb2 变异体，够短够稳（同一份数据构建两次必须命中同一锚点）。 */
function hashId(input: string): string {
    let hash = 5381;
    for (let index = 0; index < input.length; index += 1) {
        hash = ((hash << 5) + hash + input.charCodeAt(index)) >>> 0;
    }
    return `talk-${hash.toString(36)}`;
}

/** 抽 `#话题`：保留层级（`#四处逛逛/深圳`），去重且保序。 */
function extractTags(text: string): string[] {
    const tags: string[] = [];
    for (const match of text.matchAll(HASHTAG_RE)) {
        const tag = match[1]?.replace(/[)）\]】,，。.!！?？:：;；"']+$/u, "").trim();
        if (!tag) continue;
        if (!tags.includes(tag)) tags.push(tag);
    }
    return tags;
}

/** 剔除话题标签后的正文：压掉多余空行，避免卡片里出现大片空白。 */
function stripTags(text: string): string {
    return text
        .replace(HASHTAG_RE, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/** 配图字段可能是字符串数组、也可能是 `{ url }` / `{ path }` / `{ src }` 对象数组。 */
function readImages(record: Record<string, unknown>): string[] {
    const raw =
        record.images ??
        record.attachments ??
        record.files ??
        record.photos ??
        record.media ??
        null;
    if (!raw) return [];

    const list = Array.isArray(raw) ? raw : [raw];
    const images: string[] = [];
    for (const entry of list) {
        let candidate: string | undefined;
        if (typeof entry === "string") candidate = entry;
        else if (entry && typeof entry === "object") {
            const item = entry as Record<string, unknown>;
            candidate =
                readText(item.url) ??
                readText(item.src) ??
                readText(item.path) ??
                readText(item.preview) ??
                readText(item.name);
        }
        const image = toImageSource(candidate);
        if (image && !images.includes(image)) images.push(image);
    }
    return images;
}

/** 显式 tags 字段（字符串或 `{ name }`）与正文话题合并。 */
function readExplicitTags(record: Record<string, unknown>): string[] {
    const raw = record.tags ?? record.tag ?? null;
    if (!raw) return [];
    const list = Array.isArray(raw) ? raw : [raw];
    const tags: string[] = [];
    for (const entry of list) {
        const candidate =
            typeof entry === "string"
                ? entry
                : entry && typeof entry === "object"
                  ? readText((entry as Record<string, unknown>).name)
                  : undefined;
        const tag = candidate?.replace(/^#/, "").trim();
        if (tag && !tags.includes(tag)) tags.push(tag);
    }
    return tags;
}

/**
 * 单条归一化：缺正文 → null（由调用方计入 dropped）。
 * 时间缺失不算致命：保留条目、排到最后，总比静默吞掉一条随笔好。
 */
export function normalizeTalk(raw: unknown, index = 0): TalkEntry | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;

    const content =
        readText(record.content) ??
        readText(record.text) ??
        readText(record.body) ??
        readText(record.note);
    if (!content) return null;

    const rawTime =
        record.datetime ??
        record.createdAt ??
        record.created_at ??
        record.time ??
        record.date ??
        record.publishedAt ??
        record.pubDate;
    const { ts, text: time } = parseTalkTime(rawTime);

    const tags = [...readExplicitTags(record)];
    for (const tag of extractTags(content)) if (!tags.includes(tag)) tags.push(tag);

    const text = stripTags(content) || content.trim();
    const id =
        readText(record.id) ??
        readText(record.key) ??
        readText(record.slug) ??
        hashId(`${time}|${text}|${index}`);

    const url = toHttpUrl(
        readText(record.url) ??
            readText(record.shareUrl) ??
            readText(record.link) ??
            readText(record.sourceUrl) ??
            "",
    );

    return {
        id,
        time,
        ts,
        text,
        tags,
        images: readImages(record),
        ...(url ? { url } : {}),
    };
}

type ListRead = { list: unknown[]; code?: undefined } | { list: null; code: TalksIssueCode | null };

/** 拆包裹：数组直接用；对象按 default/items/data/... 找一个数组。 */
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
        // 空对象 / 认不出的对象：视为「站点还没抓数据」，不是错误
        return { list: null, code: null };
    }
    return { list: null, code: "source-not-array" };
}

/** 标签聚合：count 降序，同 count 按名字升序（构建结果稳定，不吃引擎 sort 差异）。 */
function summarizeTags(items: TalkEntry[]): TalksTag[] {
    const counts = new Map<string, number>();
    for (const item of items) {
        for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function emptyFeed(code: TalksIssueCode = "source-missing"): TalksFeed {
    return {
        status: "empty",
        items: [],
        total: 0,
        dropped: 0,
        tags: [],
        newest: null,
        issue: { code },
    };
}

function errorFeed(code: TalksIssueCode, detail?: string): TalksFeed {
    return {
        status: "error",
        items: [],
        total: 0,
        dropped: 0,
        tags: [],
        newest: null,
        issue: { code, ...(detail ? { detail } : {}) },
    };
}

/**
 * 纯函数入口：吃站点注入的任意值，吐出三态之一。永不抛异常。
 *
 * @param raw 站点数据（通常是 JSON 模块的 default）
 * @param options.minItems 低于该条数按空态处理（默认 1）
 */
export function loadTalks(raw: unknown, options: { minItems?: number } = {}): TalksFeed {
    const minItems = options.minItems ?? 1;
    const { list, code } = readList(raw);

    if (code) return errorFeed(code, `expected an array, got ${typeof raw}`);
    if (!list) return emptyFeed("source-missing");
    if (list.length === 0) return emptyFeed("source-empty");

    const seen = new Set<string>();
    const items: TalkEntry[] = [];
    let dropped = 0;

    list.forEach((entry, index) => {
        const talk = normalizeTalk(entry, index);
        if (!talk) {
            dropped += 1;
            return;
        }
        if (seen.has(talk.id)) {
            dropped += 1;
            return;
        }
        seen.add(talk.id);
        items.push(talk);
    });

    if (items.length === 0) {
        return errorFeed(
            "no-valid-entries",
            `${list.length} entr${list.length === 1 ? "y" : "ies"} rejected`,
        );
    }
    if (items.length < minItems) return emptyFeed("source-empty");

    // 时间倒序；不可解析时间的条目沉底，但保持输入顺序（稳定排序）
    const sorted = items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            if (a.item.ts === null && b.item.ts === null) return a.index - b.index;
            if (a.item.ts === null) return 1;
            if (b.item.ts === null) return -1;
            return b.item.ts - a.item.ts || a.index - b.index;
        })
        .map((entry) => entry.item);

    const newest = sorted.find((item) => item.ts !== null)?.time ?? null;

    return {
        status: "ok",
        items: sorted,
        total: sorted.length,
        dropped,
        tags: summarizeTags(sorted),
        newest,
    };
}

/** 构建期 fixture：CI/验收要预览空态与错误态，但不许改站点数据。 */
export function staticFeed(state: "empty" | "error"): TalksFeed {
    return state === "error"
        ? errorFeed("no-valid-entries", "PUBLIC_TALKS_STATE=error（构建期 fixture）")
        : emptyFeed("source-empty");
}

/**
 * 构建期状态开关（验收/预览用）：`PUBLIC_TALKS_STATE=empty|error`。
 * 只影响页面状态，不改数据文件，所以两种态都能在真实构建里被截图/跑 axe。
 */
function previewState(): "empty" | "error" | null {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    const value = env?.PUBLIC_TALKS_STATE;
    return value === "empty" || value === "error" ? value : null;
}

/**
 * 按站点配置的槽位取数：
 * - `file` 为空串 → 槽位未启用（空态），构建照常通过；
 * - 槽位文件缺失（glob 未命中）→ 空态，构建照常通过；
 * - 文件存在但内容坏 → 错误态。
 */
export function loadSiteTalks(file: string | undefined = TALKS_SLOT): TalksFeed {
    const forced = previewState();
    if (forced) return staticFeed(forced);
    if (!file) return emptyFeed("slot-disabled");

    const module = SITE_SLOTS[`${SLOT_PREFIX}${file}`];
    return loadTalks(module?.default);
}
