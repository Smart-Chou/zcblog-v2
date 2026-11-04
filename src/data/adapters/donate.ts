/**
 * donate adapter —— 赞赏页数据的唯一入口（M2-6b · P-07）
 *
 * 职责边界（D-0101-1「产品内置页 + 数据适配器」）：
 * - 只做形状归一化与状态判定，**不抛异常**：脏数据退化成 status，页面永远 200。
 * - 两类输入、同一份契约：
 *     · 账本（账本槽位 `src/data/<donatePage.dataFile>`，默认 `donators.json`）
 *       —— 站点自己的赞赏记录，形状 `{ donators: [...] }` 或裸数组
 *     · 收款方式（注入点 `donatePage.accounts`，见 src/config/ui.ts）
 *       —— 账号 / 二维码描述；**没有注入就没有收款方式**，页面不会渲染空 <img>
 * - 收款二维码只传「文件名」（如 `wechat-pay.png`），由页面用 astro:assets 解析成
 *   ImageMetadata。adapter 不 import 图片，因此可以在 vitest（node）里直接跑。
 *
 * 为什么「有没有二维码」由 adapter 判而不是模板判：模板判断只能靠 `qr && <img>`，
 * 一旦上游给了空串/单空格就会漏出一张破图；这里统一把不可用字段变成缺省。
 */

/** 一种收款方式（归一化后的最小契约；页面只消费这些字段）。 */
export interface DonateAccount {
    /** 稳定键：i18n 文案回退与去重都用它（`wechat` / `alipay` / `paypal`…）。 */
    id: string;
    /** `qr` = 扫码（渲染图像）；`link` = 跳转（渲染外链）。 */
    kind: "qr" | "link";
    /** 展示名；缺省时页面按 id 查 i18n，再退 id 本身。 */
    label?: string;
    /** Iconify 图标名（闭集，由页面白名单保证可渲染）。 */
    icon?: string;
    /** 二维码文件名（`src/assets/qr/` 下）；页面解析失败 = 该方式不渲染。 */
    qr?: string;
    /** link 型的跳转目标（绝对 http(s)）；qr 型也可带，用于「无图时给链接」。 */
    href?: string;
    /** 账号文本（如邮箱）；缺省不渲染这一行，不留空标签。 */
    account?: string;
    /** 一句说明（到账方式、时效等）；缺省不渲染。 */
    note?: string;
}

/** 收款方式的注入形状（配置里写的就是它，全部字段可选）。 */
export interface DonateAccountConfig {
    id?: string;
    label?: string;
    icon?: string;
    kind?: "qr" | "link";
    qr?: string;
    href?: string;
    account?: string;
    note?: string;
}

/** 一条赞赏记录。 */
export interface Donator {
    name: string;
    /** 金额（元）；0 表示「心意已收、未记账」，页面不渲染金额。 */
    amount: number;
    /** YYYY-MM-DD；不可解析为空串（页面不渲染时间，而不是显示 Invalid Date）。 */
    date: string;
    message?: string;
    /** 头像：绝对 http(s) 或站点内绝对路径；非法值丢弃（页面回退首字）。 */
    avatar?: string;
}

export type DonateStatus = "ok" | "empty" | "error";

export type DonateIssueCode =
    | "slot-disabled"
    | "source-missing"
    | "source-empty"
    | "source-not-array"
    | "no-valid-entries"
    | "disabled";

export interface DonateFeed {
    status: DonateStatus;
    /** 站点是否开启赞赏（`donate.enable`）；false 时页面走「暂未开放」，不渲染收款方式。 */
    enabled: boolean;
    accounts: DonateAccount[];
    donators: Donator[];
    /** 记录条数（= donators.length）。 */
    total: number;
    /** 金额合计（元，两位小数以内）。 */
    amountTotal: number;
    /** 币种符号（页面显示用；账本默认人民币）。 */
    currency: string;
    issue?: { code: DonateIssueCode; detail?: string };
}

/** 站点数据槽位文件名（`src/data/` 下）。构建期只登记这一个槽位。 */
export const DONATE_SLOT = "donators.json";

/** 构建期只登记账本这一个槽位：glob 是静态的，不能按运行时字符串扩张。 */
const SITE_SLOTS = import.meta.glob<{ default: unknown }>("../donators.json", { eager: true });

const SLOT_PREFIX = "../";
const LIST_KEYS = ["default", "donators", "items", "list", "records", "data"] as const;
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

function readText(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
}

/** 只接受 http(s)；协议相对补 https，其余协议（javascript:/data:）一律拒绝。 */
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

function toAvatar(value: string | undefined): string | undefined {
    if (!value) return undefined;
    if (value.startsWith("/") && !value.startsWith("//")) return value;
    return toHttpUrl(value);
}

/** 金额：数字或数字字符串；负数/NaN/空一律 null（宁可丢一条，不可显示 -¥3）。 */
function toAmount(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
    if (typeof value !== "string") return null;
    const cleaned = value.replace(/[¥￥,\s]/g, "").replace(/元$/, "");
    if (cleaned === "") return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** 日期归一成 YYYY-MM-DD；解析不出来就当没有日期（不显示 Invalid Date）。 */
function toDate(value: unknown): string {
    if (value instanceof Date) {
        const ts = value.getTime();
        return Number.isFinite(ts) ? value.toISOString().slice(0, 10) : "";
    }
    const raw = readText(value) ?? (typeof value === "number" ? String(value) : undefined);
    if (!raw) return "";
    const direct = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (direct) {
        const month = direct[2].padStart(2, "0");
        const day = direct[3].padStart(2, "0");
        return `${direct[1]}-${month}-${day}`;
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}

/**
 * 单条收款方式归一化：
 * - 有二维码 → kind=qr（解码扫码；`href` 可同时存在，作为无图时的退路）
 * - 只有 http(s) 链接 → kind=link
 * - 两者都没有 → null（页面因此不会出现空卡片、空 <img>）
 */
export function normalizeAccount(raw: unknown, index = 0): DonateAccount | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;

    const qr = readText(record.qr) ?? readText(record.qrCode) ?? readText(record.image);
    const href = toHttpUrl(readText(record.href) ?? readText(record.url) ?? "");
    const label = readText(record.label) ?? readText(record.name) ?? readText(record.title);
    const id = readText(record.id) ?? label ?? `account-${index + 1}`;

    const declared = record.kind === "qr" || record.kind === "link" ? record.kind : undefined;
    const kind: DonateAccount["kind"] | null = qr ? "qr" : href ? "link" : declared ?? null;
    if (!kind) return null;
    if (kind === "qr" && !qr) return null;
    if (kind === "link" && !href && !qr) return null;

    const icon = readText(record.icon);
    const account = readText(record.account) ?? readText(record.accountId);
    const note = readText(record.note) ?? readText(record.desc);

    return {
        id,
        kind,
        ...(label ? { label } : {}),
        ...(icon ? { icon } : {}),
        ...(qr ? { qr } : {}),
        ...(href ? { href } : {}),
        ...(account ? { account } : {}),
        ...(note ? { note } : {}),
    };
}

/** 单条赞赏记录归一化：缺名字或金额非法 → null（由调用方计入 dropped）。 */
export function normalizeDonator(raw: unknown): Donator | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;

    const name = readText(record.name) ?? readText(record.nickname) ?? readText(record.from);
    if (!name) return null;

    const amount = toAmount(record.amount ?? record.total ?? record.money);
    if (amount === null) return null;

    const message = readText(record.message) ?? readText(record.note) ?? readText(record.comment);
    const avatar = toAvatar(readText(record.avatar) ?? readText(record.avatarUrl));

    return {
        name,
        amount: Math.round(amount * 100) / 100,
        date: toDate(record.date ?? record.createdAt ?? record.time),
        ...(message ? { message } : {}),
        ...(avatar ? { avatar } : {}),
    };
}

type ListRead =
    | { list: unknown[]; code?: undefined }
    | { list: null; code: DonateIssueCode | null };

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
        return { list: null, code: null };
    }
    return { list: null, code: "source-not-array" };
}

/** 收款方式列表归一化：接受数组或 `{ accounts }` 包裹；供页面/测试直接调用。 */
export function normalizeAccounts(raw: unknown): DonateAccount[] {
    if (!raw) return [];
    const list = Array.isArray(raw)
        ? raw
        : typeof raw === "object"
          ? ((raw as Record<string, unknown>).accounts as unknown[] | undefined) ?? []
          : [];

    const seen = new Set<string>();
    const accounts: DonateAccount[] = [];
    list.forEach((entry, index) => {
        const account = normalizeAccount(entry, index);
        if (!account) return;
        if (seen.has(account.id)) return;
        seen.add(account.id);
        accounts.push(account);
    });
    return accounts;
}

export interface LoadDonateOptions {
    /** 收款方式注入（`donatePage.accounts`）；缺省 = 一种都不渲染。 */
    accounts?: unknown;
    /** 站点是否开启赞赏；false = 页面走「暂未开放」（status 仍按数据判定）。 */
    enabled?: boolean;
    /** 低于该条数按空态处理（默认 1；0 允许「只有收款方式、没有记录」）。 */
    minItems?: number;
}

function buildFeed(
    status: DonateStatus,
    parts: {
        enabled: boolean;
        accounts: DonateAccount[];
        donators: Donator[];
        issue?: { code: DonateIssueCode; detail?: string };
    },
): DonateFeed {
    const amountTotal =
        Math.round(parts.donators.reduce((sum, donator) => sum + donator.amount, 0) * 100) / 100;
    return {
        status,
        enabled: parts.enabled,
        accounts: parts.accounts,
        donators: parts.donators,
        total: parts.donators.length,
        amountTotal,
        currency: "¥",
        ...(parts.issue ? { issue: parts.issue } : {}),
    };
}

/**
 * 纯函数入口：吃账本 + 收款方式注入，吐出三态。永不抛异常。
 *
 * 状态只描述「账本」，收款方式独立渲染：
 * - 账本坏 → status=error（页面在名单区给警示块），收款方式照常显示；
 * - 账本空/缺失 → status=empty（页面给空态），收款方式照常显示；
 * - 只有账本没有收款方式 → status=ok，accounts=[]（页面不渲染任何 <img>）。
 */
export function loadDonate(raw: unknown, options: LoadDonateOptions = {}): DonateFeed {
    const enabled = options.enabled ?? true;
    const minItems = options.minItems ?? 1;
    const accounts = normalizeAccounts(options.accounts);
    const { list, code } = readList(raw);

    if (code) {
        return buildFeed("error", {
            enabled,
            accounts,
            donators: [],
            issue: { code, detail: `expected an array, got ${typeof raw}` },
        });
    }
    if (!list) {
        return buildFeed("empty", {
            enabled,
            accounts,
            donators: [],
            issue: { code: "source-missing" },
        });
    }
    if (list.length === 0) {
        return buildFeed("empty", {
            enabled,
            accounts,
            donators: [],
            issue: { code: "source-empty" },
        });
    }

    const seen = new Set<string>();
    const donators: Donator[] = [];
    for (const entry of list) {
        const donator = normalizeDonator(entry);
        if (!donator) continue;
        const key = `${donator.name}|${donator.date}|${donator.amount}`;
        if (seen.has(key)) continue;
        seen.add(key);
        donators.push(donator);
    }

    if (donators.length === 0) {
        return buildFeed("error", {
            enabled,
            accounts,
            donators: [],
            issue: {
                code: "no-valid-entries",
                detail: `${list.length} entr${list.length === 1 ? "y" : "ies"} rejected`,
            },
        });
    }
    if (donators.length < minItems) {
        return buildFeed("empty", {
            enabled,
            accounts,
            donators: [],
            issue: { code: "source-empty" },
        });
    }

    // 时间倒序（无日期的沉底，保持输入顺序）
    const sorted = donators
        .map((donator, index) => ({ donator, index }))
        .sort((a, b) => {
            if (!a.donator.date && !b.donator.date) return a.index - b.index;
            if (!a.donator.date) return 1;
            if (!b.donator.date) return -1;
            return a.donator.date < b.donator.date ? 1 : a.donator.date > b.donator.date ? -1 : 0;
        })
        .map((entry) => entry.donator);

    return buildFeed("ok", { enabled, accounts, donators: sorted });
}

/**
 * 构建期 fixture：
 * - `empty`        —— 没有账本也没有收款方式
 * - `error`        —— 账本坏了（警示块）
 * - `no-accounts`  —— 有账本、没有注入收款方式：验收「不渲染空 <img>」
 */
export function staticFeed(state: "empty" | "error" | "no-accounts"): DonateFeed {
    if (state === "error") {
        return buildFeed("error", {
            enabled: true,
            accounts: [],
            donators: [],
            issue: { code: "no-valid-entries", detail: "PUBLIC_DONATE_STATE=error（构建期 fixture）" },
        });
    }
    if (state === "no-accounts") {
        return buildFeed("empty", {
            enabled: true,
            accounts: [],
            donators: [],
            issue: { code: "source-empty" },
        });
    }
    return buildFeed("empty", {
        enabled: true,
        accounts: [],
        donators: [],
        issue: { code: "source-empty" },
    });
}

/**
 * 构建期状态开关（验收/预览用）：`PUBLIC_DONATE_STATE=empty|error|no-accounts`。
 * 只影响页面状态，不改数据文件，所以三种态都能在真实构建里被断言。
 */
function previewState(): "empty" | "error" | "no-accounts" | null {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    const value = env?.PUBLIC_DONATE_STATE;
    return value === "empty" || value === "error" || value === "no-accounts" ? value : null;
}

/**
 * 按站点配置的槽位取数：
 * - `file` 为空串 → 槽位未启用（空态），构建照常通过；
 * - 槽位文件缺失（glob 未命中）→ 空态，构建照常通过；
 * - 文件存在但内容坏 → 错误态（收款方式照常渲染）。
 */
export function loadSiteDonate(
    file: string | undefined = DONATE_SLOT,
    options: LoadDonateOptions = {},
): DonateFeed {
    const forced = previewState();
    if (forced) return staticFeed(forced);
    if (!file) {
        return buildFeed("empty", {
            enabled: options.enabled ?? true,
            accounts: normalizeAccounts(options.accounts),
            donators: [],
            issue: { code: "slot-disabled" },
        });
    }

    const module = SITE_SLOTS[`${SLOT_PREFIX}${file}`];
    return loadDonate(module?.default, options);
}
