import zh from "~/data/i18n/zh.json";
import en from "~/data/i18n/en.json";
import zhTW from "~/data/i18n/zh-TW.json";
import ja from "~/data/i18n/ja.json";
import ko from "~/data/i18n/ko.json";
import fr from "~/data/i18n/fr.json";
import de from "~/data/i18n/de.json";
import es from "~/data/i18n/es.json";
import ptBR from "~/data/i18n/pt-BR.json";
import ru from "~/data/i18n/ru.json";

/**
 * i18n registry（M2-11a 建 · M2-11b 收口 10 语言）
 * ------------------------------------------------------------------
 * 这一层只做两件事：**语言注册表** + **缺词回退**，不碰任何文案内容。
 *
 * 1. registry：`locales` 是唯一的语言清单。新增一门语言 = 加一个 JSON + 一行
 *    import；页面路由、语言切换器、门禁（verify-i18n.mjs）全部从它派生，
 *    不允许任何地方再硬编码 `zh | en`。
 * 2. fallback：词典按 `[locale, "zh"]` 依次查找。没翻到的键回落到中文
 *    （`defaultLocale` = zh，它的 HTML 语言标签就是 `zh-CN`），中文也没有才返回
 *    key 本身（老行为，便于红队发现漏词）。因此**部分翻译是合法状态**：新接
 *    的语言可以只翻「路由关键键」，其余先吃中文兜底，`coverage()` 会把比例
 *    报出来，门禁按「关键键 100% + 总量报数」判。
 *
 * 路由边界（重要）：
 * - `en` 有自己手写的静态路由（src/pages/en/**，既有卡维护），`[locale]`
 *   模板不接管它，否则同一 URL 两个来源；
 * - `defaultLocale`（zh）不建前缀，`prefixDefaultLocale: false`；
 * - 因此 `templateLocales()` = enabled(k) - {zh, en}，只有它会被
 *   `src/pages/[locale]/**` 的 getStaticPaths 消费。
 *
 * 构建开关：`I18N_LOCALES=all`（或逗号清单，如 `I18N_LOCALES=ja,ko`）
 * 才把新语言写进 dist；未设置时仍然只构建 zh/en —— 新语言的正文还没有，
 * 先不让它们进生产产物，`dist` 页数保持不变（本卡不改变线上页数）。
 */

export const defaultLocale = "zh";

/** 语言注册表：顺序 = 语言切换器里的展示顺序。 */
export const locales = ["zh", "en", "zh-TW", "ja", "ko", "fr", "de", "es", "pt-BR", "ru"] as const;
export type Locale = (typeof locales)[number];

/** 有独立正文的语言（文章集合的 `lang` 字段取值范围）。 */
export const contentLocales = ["zh", "en"] as const;
export type ContentLocale = (typeof contentLocales)[number];

/** 未设置 I18N_LOCALES 时构建的路由集：与引入本卡之前完全一致。 */
const defaultBuildLocales = ["zh", "en"] as const;

interface LocaleMeta {
    /** 语言切换器里的短标签 */
    label: string;
    /** `<html lang>` 用的 BCP-47 标签 */
    tag: string;
    /** hreflang 用的标签（沿用站点既有口径：中文写 `zh` 而非 `zh-CN`） */
    hreflang: string;
    /** AT 朗读用的语言名（aria-label） */
    name: string;
}

export const localeMeta: Record<Locale, LocaleMeta> = {
    zh: { label: "中文", tag: "zh-CN", hreflang: "zh", name: "简体中文" },
    en: { label: "EN", tag: "en", hreflang: "en", name: "English" },
    "zh-TW": { label: "繁中", tag: "zh-Hant-TW", hreflang: "zh-Hant-TW", name: "繁體中文" },
    ja: { label: "日本語", tag: "ja", hreflang: "ja", name: "日本語" },
    ko: { label: "한국어", tag: "ko", hreflang: "ko", name: "한국어" },
    fr: { label: "FR", tag: "fr", hreflang: "fr", name: "Français" },
    de: { label: "DE", tag: "de", hreflang: "de", name: "Deutsch" },
    es: { label: "ES", tag: "es", hreflang: "es", name: "Español" },
    "pt-BR": { label: "PT", tag: "pt-BR", hreflang: "pt-BR", name: "Português (Brasil)" },
    ru: { label: "RU", tag: "ru", hreflang: "ru", name: "Русский" },
};

type Dict = typeof zh;
type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]>;
};

/** 词典：新语言允许部分翻译（DeepPartial），缺的键走 fallback 链。 */
const translations: Record<Locale, DeepPartial<Dict>> = {
    zh,
    en,
    "zh-TW": zhTW,
    ja,
    ko,
    fr,
    de,
    es,
    "pt-BR": ptBR,
    ru,
};

/* ─────────────────── 构建开关 ─────────────────── */

function readLocalesEnv(): string {
    try {
        return String(process.env?.I18N_LOCALES ?? "").trim();
    } catch {
        return "";
    }
}

/**
 * 本次构建启用的语言（路由生成、切换器、hreflang 共用这一个出处）。
 * - 未设置 → ["zh", "en"]（线上现状）
 * - `all` → 全部 6 个
 * - 逗号清单 → 清单内且在注册表里的语言；一个都不认识时退回默认集
 */
export function enabledLocales(): Locale[] {
    const raw = readLocalesEnv();
    if (!raw) return [...defaultBuildLocales];
    if (raw.toLowerCase() === "all") return [...locales];
    const wanted = raw
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    const picked = locales.filter((locale) =>
        wanted.includes(locale.toLowerCase() as Lowercase<Locale>),
    );
    return picked.length > 0 ? picked : [...defaultBuildLocales];
}

/**
 * `src/pages/[locale]/**` 接管的语言。
 * `en` 已有独立静态路由（src/pages/en/**），`zh` 无前缀，二者都排除。
 */
export function templateLocales(): Locale[] {
    return enabledLocales().filter((locale) => locale !== defaultLocale && locale !== "en");
}

/* ─────────────────── 解析 / 回退 ─────────────────── */

/** 严格匹配注册表（大小写不敏感）；不是已知语言返回 null。 */
export function matchLocale(value: string | undefined | null): Locale | null {
    if (!value) return null;
    const probe = value.trim().toLowerCase();
    return locales.find((locale) => locale.toLowerCase() === probe) ?? null;
}

/** 语言标签 → 注册表语言；未知一律回落到默认语言（老行为）。 */
export function getLocale(locale: string | undefined | null): Locale {
    return matchLocale(locale) ?? defaultLocale;
}

/** 回退链：语言本身 → 默认語言（zh）。 */
export function fallbackChain(locale: Locale): Locale[] {
    return locale === defaultLocale ? [defaultLocale] : [locale, defaultLocale];
}

/** 语言对应的正文语言：还没有该语言正文时回落到 zh。 */
export function contentLocaleOf(locale: Locale): ContentLocale {
    return locale === "en" ? "en" : "zh";
}

/** 该语言的页面是否只有回退正文（= 需要 noindex 的重复内容页）。 */
export function isFallbackContent(locale: Locale): boolean {
    return contentLocaleOf(locale) !== locale;
}

/** `<html lang>`：注册表里唯一的 BCP-47 出口。 */
export function htmlLangOf(locale: Locale): string {
    return localeMeta[locale].tag;
}

/** hreflang 标签（中文沿用 `zh`，不写 `zh-CN`，与既有 head 输出一致）。 */
export function hreflangOf(locale: Locale): string {
    return localeMeta[locale].hreflang;
}

/** 语言切换器里的短标签。 */
export function localeLabelOf(locale: Locale): string {
    return localeMeta[locale].label;
}

/* ─────────────────── 路由能力 ─────────────────── */

/**
 * 本卡建好的 5 个 `[locale]` 模板路由：`/`、`/blog/N/`、`/archives/`、
 * `/tags/`、`/culture/`。语言切换器与 hreflang 都用它判断「目标语言有没有
 * 这一页」，避免把用户送进 404。
 */
export function hasLocaleRoute(path: string): boolean {
    const clean = (path.split(/[?#]/)[0] || "/").replace(/\/{2,}/g, "/");
    if (clean === "/" || clean === "") return true;
    if (clean === "/archives/" || clean === "/tags/" || clean === "/culture/") return true;
    if (/^\/blog\/\d+\/$/.test(clean)) return true;
    if (clean === "/blog/") return true;
    return false;
}

/** 从路径里剥掉任一已知语言的 URL 前缀（`/ja/blog/1/` → `/blog/1/`）。 */
export function stripLocalePrefix(path: string): string {
    const prefixed = locales
        .filter((locale) => locale !== defaultLocale)
        .sort((a, b) => b.length - a.length)
        .map((locale) => `/${locale}`)
        .find((prefix) => path === `${prefix}/` || path.startsWith(`${prefix}/`));
    if (!prefixed) return path || "/";
    const rest = path.slice(prefixed.length);
    return rest === "" ? "/" : rest;
}

/** 给路径套上语言前缀（默认语言不带前缀）。 */
export function getLocalePath(locale: Locale, path: string = ""): string {
    const suffix = path && path !== "/" ? (path.startsWith("/") ? path : `/${path}`) : "/";
    if (locale === defaultLocale) {
        return suffix;
    }
    return `/${locale}${suffix === "/" ? "/" : suffix}`;
}

/* ─────────────────── 取词 ─────────────────── */

function lookup(dict: unknown, keys: string[]): unknown {
    let value: unknown = dict;
    for (const key of keys) {
        if (value && typeof value === "object" && key in (value as Record<string, unknown>)) {
            value = (value as Record<string, unknown>)[key];
        } else {
            return undefined;
        }
    }
    return value;
}

function format(template: string, params?: Record<string, string | number>): string {
    if (!params) return template;
    return template.replace(
        /\{\{?(\w+)\}\}?/g,
        (_, paramKey) => params[paramKey]?.toString() ?? `{${paramKey}}`,
    );
}

/**
 * 取词：按 fallbackChain 逐个词典查找，全都缺才返回 key 本身。
 * 空字符串是**合法译文**（例如 friends.subtitle），不会被当成缺词。
 */
export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
    const keys = key.split(".");
    for (const candidate of fallbackChain(locale)) {
        const value = lookup(translations[candidate], keys);
        if (typeof value === "string") {
            return format(value, params);
        }
    }
    return key;
}

/** 该键最终由哪个语言提供（门禁/排查用；null = 三处都没有）。 */
export function tSource(locale: Locale, key: string): Locale | null {
    const keys = key.split(".");
    for (const candidate of fallbackChain(locale)) {
        if (typeof lookup(translations[candidate], keys) === "string") return candidate;
    }
    return null;
}

/* ─────────────────── 词典体检（门禁消费） ─────────────────── */

function flatten(dict: unknown, prefix = ""): string[] {
    if (!dict || typeof dict !== "object") return [];
    return Object.entries(dict as Record<string, unknown>).flatMap(([key, value]) =>
        typeof value === "object" && value !== null
            ? flatten(value, `${prefix}${key}.`)
            : [`${prefix}${key}`],
    );
}

/** 默认语言词典的全部键（基准集）。 */
export const allKeys: string[] = flatten(zh);

/** 某语言直接翻译了的键（不含 fallback）。 */
export function translatedKeys(locale: Locale): string[] {
    return flatten(translations[locale]);
}

/** 某语言缺失的键（= 走 fallback 的键）。 */
export function missingKeys(locale: Locale): string[] {
    const own = new Set(translatedKeys(locale));
    return allKeys.filter((key) => !own.has(key));
}

/** 覆盖率（相对默认语言）。 */
export function coverage(locale: Locale): { translated: number; total: number; ratio: number } {
    const total = allKeys.length;
    const translated = allKeys.length - missingKeys(locale).length;
    return { translated, total, ratio: total === 0 ? 1 : translated / total };
}

/** 词典里出现了基准集没有的键（拼错 / 过期），门禁必红。 */
export function unknownKeys(locale: Locale): string[] {
    const base = new Set(allKeys);
    return translatedKeys(locale).filter((key) => !base.has(key));
}
