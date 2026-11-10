/**
 * 批注数据层（M7-4a）
 *
 * 只做「数据」，不碰 DOM：选区怎么来、mark 怎么画，都是 M7-4b 的事。这里给的是
 * 一个可以独立测试、也可以被任何页面复用的稳定契约：
 *
 *   · **存储**：`localStorage` 里一个带版本号的 key（`zcblog:annotations:v1`），
 *     值是一个信封 `{ schema, version, updatedAt, records }`。读的时候任何一环不对
 *     （非 JSON、版本不匹配、records 不是数组）都当成「没有批注」并**主动清理**
 *     —— 坏数据留在盘上只会让 M7-4b 每次都陪着它出错。
 *   · **定位**：一条批注记的是 `docId + blockIndex + [start, end)`，偏移单位是
 *     **UTF-16 code unit**，和 `Selection` / `String.prototype.slice` 完全同一套口径，
 *     所以从选区拿到偏移、再用偏移切回原文不需要换算。`quote` 同时存一份，用来在
 *     偏移失效时（正文被改过）重新定位：只有「原文里唯一命中」才认，命中多处或零处
 *     一律判为失联 —— 宁可少画一条高亮，也不能把高亮画到别的句子上。
 *   · **不写脏数据**：空白选区、零长度、越界、与已有批注重叠、重复同一条，都在
 *     `add()` 里被挡下来并给出 `reason`，调用方不用自己再判一遍。
 *   · **上限**：每篇最多 `ANNOTATIONS_MAX_PER_DOC` 条，超了返回 `limit`，不静默丢。
 *
 * 默认存储不可用（Safari 无痕模式、配额满、SSR）时自动退化成进程内内存，API 不变
 * —— 页面不会因为读一次 localStorage 抛异常就白屏。
 */

/* ───────────────────────── 常量 ───────────────────────── */

/** 存储 schema 版本。改结构就 +1：老版本数据会被当成不可识别并清理。 */
export const ANNOTATIONS_SCHEMA_VERSION = 1;

/** 版本化 key：`…:v1`。M7-4b 只认这一个，不要再读无版本号的裸 key。 */
export const ANNOTATIONS_STORAGE_KEY = `zcblog:annotations:v${ANNOTATIONS_SCHEMA_VERSION}`;

/** 历史上出现过的无版本/旧版本 key，读第一笔时顺手清掉（验收「旧版本安全忽略并清理」）。 */
export const ANNOTATIONS_LEGACY_KEYS = ["zcblog:annotations", "zcblog:annotations:v0"] as const;

/** 每篇文档的批注上限。 */
export const ANNOTATIONS_MAX_PER_DOC = 200;

/** 信封里的具名标记，防止「别的站点也在同一个 key 上放了 JSON 数组」这类串味。 */
export const ANNOTATIONS_SCHEMA_NAME = "zcblog.annotations";

/* ───────────────────────── 类型 ───────────────────────── */

/** 一条批注。`id` 由 `docId` / `blockIndex` / 区间确定，可重复推理，不做持久化序号。 */
export interface AnnotationRecord {
    id: string;
    docId: string;
    blockIndex: number;
    /** 段落文本内的起始偏移（含），UTF-16 code unit。 */
    start: number;
    /** 段落文本内的结束偏移（不含）。 */
    end: number;
    /** 被划线的那段原文。用来在偏移失效时重新定位，也是取消高亮时的核对依据。 */
    quote: string;
    createdAt: number;
}

/** `add()` 的入参：`text` 是段落原文（可选但强烈建议给，给了才会做越界/一致性校验）。 */
export interface AnnotationInput {
    docId: string;
    blockIndex: number;
    start: number;
    end: number;
    quote?: string;
    text?: string;
}

/** 拒绝原因。`duplicate` 不算失败，见 `AddResult.duplicate`。 */
export type AnnotationRejection =
    | "invalid-target"
    | "invalid-span"
    | "blank"
    | "overflow"
    | "quote-mismatch"
    | "overlap"
    | "limit";

export interface AddResult {
    ok: boolean;
    record?: AnnotationRecord;
    /** `ok: true` 但没写入新记录：同一条已经在库里了。 */
    duplicate?: boolean;
    reason?: AnnotationRejection;
}

/** 只依赖这三个方法，所以 Node / 测试里塞一个假对象就能跑。 */
export interface AnnotationStorageDevice {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface AnnotationStoreOptions {
    storage?: AnnotationStorageDevice | null;
    key?: string;
    max?: number;
    now?: () => number;
}

export interface AnnotationStore {
    readonly key: string;
    readonly version: number;
    list(docId?: string): AnnotationRecord[];
    get(id: string): AnnotationRecord | undefined;
    add(input: AnnotationInput): AddResult;
    remove(id: string): boolean;
    clear(docId?: string): number;
    findOverlap(input: AnnotationInput): AnnotationRecord | undefined;
}

interface AnnotationEnvelope {
    schema: string;
    version: number;
    updatedAt: number;
    records: AnnotationRecord[];
}

/* ───────────────────────── 纯函数：偏移 ───────────────────────── */

/** 空白选区（只选了空格/换行）不算批注。 */
export function isBlankText(text: string): boolean {
    return text.trim().length === 0;
}

/** `[start, end)` 是否是一个可用的区间；给了 `total` 时还要在范围内。 */
export function isValidSpan(start: number, end: number, total?: number): boolean {
    if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
    if (start < 0) return false;
    if (end <= start) return false;
    if (typeof total === "number" && end > total) return false;
    return true;
}

/** 用偏移切回原文；区间不合法时返回空串（调用方据此判空，而不是抛异常）。 */
export function sliceQuote(text: string, start: number, end: number): string {
    if (!isValidSpan(start, end, text.length)) return "";
    return text.slice(start, end);
}

/** 两个区间是否落在同一段且相交（端点相接不算相交）。 */
export function spansOverlap(
    a: { blockIndex: number; start: number; end: number },
    b: { blockIndex: number; start: number; end: number },
): boolean {
    if (a.blockIndex !== b.blockIndex) return false;
    return a.start < b.end && b.start < a.end;
}

/**
 * 在段落文本里找引文的第 `occurrence` 次出现。
 *
 * 只用于「偏移失效后的重定位」：调用方必须确认命中唯一，否则不要用它。
 */
export function findQuoteOffset(text: string, quote: string, occurrence = 0): number {
    if (!quote || occurrence < 0) return -1;
    let from = 0;
    let found = -1;
    for (let i = 0; i <= occurrence; i += 1) {
        found = text.indexOf(quote, from);
        if (found === -1) return -1;
        from = found + 1;
    }
    return found;
}

export interface ResolvedSpan {
    start: number;
    end: number;
    /** `exact` = 偏移仍然对得上；`relocated` = 靠唯一引文命中重新算出来的。 */
    mode: "exact" | "relocated";
}

/**
 * 把一条批注重新落到段落文本上。
 *
 * 1. 偏移处的原文还等于 `quote` → 直接认（`exact`）；
 * 2. 否则在段落里找 `quote`：**只出现一次**才认（`relocated`），出现多次说明这段
 *    文本重复度太高（比如「的」这种），画错的风险大于不画，返回 `null`。
 */
export function resolveSpan(
    text: string,
    record: Pick<AnnotationRecord, "start" | "end" | "quote">,
): ResolvedSpan | null {
    const { start, end, quote } = record;
    if (isValidSpan(start, end, text.length) && text.slice(start, end) === quote) {
        return { start, end, mode: "exact" };
    }
    if (!quote) return null;
    const first = text.indexOf(quote);
    if (first === -1) return null;
    if (text.indexOf(quote, first + 1) !== -1) return null;
    return { start: first, end: first + quote.length, mode: "relocated" };
}

/* ───────────────────────── 存储读写 ───────────────────────── */

function createMemoryStorage(): AnnotationStorageDevice {
    const cells = new Map<string, string>();
    return {
        getItem: (key) => cells.get(key) ?? null,
        setItem: (key, value) => {
            cells.set(key, value);
        },
        removeItem: (key) => {
            cells.delete(key);
        },
    };
}

function resolveDefaultStorage(): AnnotationStorageDevice {
    try {
        const candidate = (globalThis as { localStorage?: AnnotationStorageDevice }).localStorage;
        if (!candidate) return createMemoryStorage();
        // 无痕模式下 getItem 就可能抛，先探一次再决定用不用它。
        const probe = "__zcblog_annotations_probe__";
        candidate.setItem(probe, "1");
        candidate.removeItem(probe);
        return candidate;
    } catch {
        return createMemoryStorage();
    }
}

function safeGet(storage: AnnotationStorageDevice, key: string): string | null {
    try {
        return storage.getItem(key);
    } catch {
        return null;
    }
}

function safeSet(storage: AnnotationStorageDevice, key: string, value: string): void {
    try {
        storage.setItem(key, value);
    } catch {
        /* 配额满 / 被禁用：内存里那份仍然是权威，本次会话内行为不变 */
    }
}

function safeRemove(storage: AnnotationStorageDevice, key: string): void {
    try {
        storage.removeItem(key);
    } catch {
        /* ignore */
    }
}

function makeId(docId: string, blockIndex: number, start: number, end: number): string {
    return `${docId}#${blockIndex}:${start}-${end}`;
}

function isRecord(value: unknown): value is AnnotationRecord {
    if (!value || typeof value !== "object") return false;
    const r = value as Partial<AnnotationRecord>;
    return (
        typeof r.id === "string" &&
        r.id.length > 0 &&
        typeof r.docId === "string" &&
        r.docId.length > 0 &&
        Number.isInteger(r.blockIndex) &&
        (r.blockIndex as number) >= 0 &&
        isValidSpan(r.start as number, r.end as number) &&
        typeof r.quote === "string" &&
        (r.quote as string).length === (r.end as number) - (r.start as number) &&
        typeof r.createdAt === "number"
    );
}

/* ───────────────────────── store 工厂 ───────────────────────── */

/**
 * 建一个批注 store。页面用 `getAnnotationStore()` 拿单例；测试可以塞假 storage。
 *
 * 每次读写都从 storage 重新 hydrate —— 多标签页同时改同一篇时不会互相覆盖旧快照
 * （代价是一次 JSON.parse，批注量级最多 200 条，可以忽略）。
 */
export function createAnnotationStore(options: AnnotationStoreOptions = {}): AnnotationStore {
    const storage = options.storage ?? resolveDefaultStorage();
    const key = options.key ?? ANNOTATIONS_STORAGE_KEY;
    const max = options.max ?? ANNOTATIONS_MAX_PER_DOC;
    const now = options.now ?? (() => Date.now());

    /** 清掉历史 key。只在读路径上做，避免每次 add 都去摸别的 key。 */
    const cleanupLegacy = (): void => {
        for (const legacy of ANNOTATIONS_LEGACY_KEYS) {
            if (legacy !== key) safeRemove(storage, legacy);
        }
    };

    const save = (records: AnnotationRecord[]): void => {
        const envelope: AnnotationEnvelope = {
            schema: ANNOTATIONS_SCHEMA_NAME,
            version: ANNOTATIONS_SCHEMA_VERSION,
            updatedAt: now(),
            records,
        };
        safeSet(storage, key, JSON.stringify(envelope));
    };

    /**
     * 读盘 → 正常返回记录；任何异常形态都清 key 并返回空数组。
     * 自愈也在这里做：过滤掉坏记录、超上限截断后，如果和盘上不一致就写回去。
     */
    const load = (): AnnotationRecord[] => {
        const raw = safeGet(storage, key);
        cleanupLegacy();
        if (raw === null || raw === "") return [];

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            safeRemove(storage, key);
            return [];
        }

        if (!parsed || typeof parsed !== "object") {
            safeRemove(storage, key);
            return [];
        }

        const envelope = parsed as Partial<AnnotationEnvelope>;
        if (
            envelope.schema !== ANNOTATIONS_SCHEMA_NAME ||
            envelope.version !== ANNOTATIONS_SCHEMA_VERSION ||
            !Array.isArray(envelope.records)
        ) {
            // 旧版本 / 别的 schema / 结构不对：一律不可识别 → 清掉，绝不猜测迁移。
            safeRemove(storage, key);
            return [];
        }

        const valid = envelope.records.filter(isRecord);
        const seen = new Set<string>();
        const deduped: AnnotationRecord[] = [];
        for (const record of valid) {
            // id 是确定的，重复 id 只可能是外部写坏 —— 保留第一条。
            if (seen.has(record.id)) continue;
            seen.add(record.id);
            deduped.push(record);
            if (deduped.length >= max * 4) break; // 极端脏数据的保险丝
        }

        if (deduped.length !== envelope.records.length) save(deduped);
        return deduped;
    };

    const store: AnnotationStore = {
        key,
        version: ANNOTATIONS_SCHEMA_VERSION,

        list(docId) {
            const records = load();
            const scoped = docId === undefined ? records : records.filter((r) => r.docId === docId);
            // 稳定顺序：先按段落，再按区间起点 —— 渲染层不用自己排。
            return [...scoped].sort((a, b) =>
                a.blockIndex === b.blockIndex ? a.start - b.start : a.blockIndex - b.blockIndex,
            );
        },

        get(id) {
            return load().find((r) => r.id === id);
        },

        findOverlap(input) {
            return load().find(
                (r) =>
                    r.docId === input.docId &&
                    spansOverlap(r, {
                        blockIndex: input.blockIndex,
                        start: input.start,
                        end: input.end,
                    }),
            );
        },

        add(input) {
            const { docId, blockIndex, start, end } = input;
            if (
                typeof docId !== "string" ||
                docId.length === 0 ||
                !Number.isInteger(blockIndex) ||
                blockIndex < 0
            ) {
                return { ok: false, reason: "invalid-target" };
            }

            const total = typeof input.text === "string" ? input.text.length : undefined;
            if (typeof total === "number" && end > total) return { ok: false, reason: "overflow" };
            if (!isValidSpan(start, end, total)) return { ok: false, reason: "invalid-span" };

            const quote =
                input.quote ?? (typeof input.text === "string" ? input.text.slice(start, end) : "");
            if (isBlankText(quote)) return { ok: false, reason: "blank" };
            if (typeof input.text === "string" && input.text.slice(start, end) !== quote) {
                return { ok: false, reason: "quote-mismatch" };
            }

            const records = load();
            const id = makeId(docId, blockIndex, start, end);
            const existing = records.find((r) => r.id === id);
            if (existing) return { ok: true, record: existing, duplicate: true };

            const overlap = records.find(
                (r) => r.docId === docId && spansOverlap(r, { blockIndex, start, end }),
            );
            if (overlap) return { ok: false, reason: "overlap" };

            if (records.filter((r) => r.docId === docId).length >= max) {
                return { ok: false, reason: "limit" };
            }

            const record: AnnotationRecord = {
                id,
                docId,
                blockIndex,
                start,
                end,
                quote,
                createdAt: now(),
            };
            save([...records, record]);
            return { ok: true, record };
        },

        remove(id) {
            const records = load();
            const next = records.filter((r) => r.id !== id);
            if (next.length === records.length) return false;
            save(next);
            return true;
        },

        clear(docId) {
            const records = load();
            const next = docId === undefined ? [] : records.filter((r) => r.docId !== docId);
            const removed = records.length - next.length;
            if (removed > 0) save(next);
            return removed;
        },
    };

    return store;
}

let singleton: AnnotationStore | null = null;

/** 页面级单例。M7-4b 直接 `getAnnotationStore()`，不要再自己 new 一个。 */
export function getAnnotationStore(options: AnnotationStoreOptions = {}): AnnotationStore {
    if (!singleton) singleton = createAnnotationStore(options);
    return singleton;
}

/** 测试/换主题时把单例丢掉（下一次 `getAnnotationStore()` 重新 hydrate）。 */
export function resetAnnotationStore(): void {
    singleton = null;
}
