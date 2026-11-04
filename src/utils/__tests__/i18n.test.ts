import { describe, it, expect } from "vitest";
import {
    coverage,
    getLocale,
    getLocalePath,
    hasLocaleRoute,
    matchLocale,
    stripLocalePrefix,
    t,
    tSource,
} from "../i18n";

describe("getLocale", () => {
    it("returns 'zh' for 'zh'", () => {
        expect(getLocale("zh")).toBe("zh");
    });

    it("returns 'en' for 'en'", () => {
        expect(getLocale("en")).toBe("en");
    });

    // M2-11a：注册表扩到 6 个语言，fr/ja/zh-TW 不再回落到 zh
    it("returns the new registry locales as-is", () => {
        expect(getLocale("fr")).toBe("fr");
        expect(getLocale("ja")).toBe("ja");
        expect(getLocale("ko")).toBe("ko");
        expect(getLocale("zh-TW")).toBe("zh-TW");
    });

    it("is case-insensitive but keeps the canonical form", () => {
        expect(getLocale("zh-tw")).toBe("zh-TW");
        expect(getLocale("JA")).toBe("ja");
        expect(matchLocale("zh-tw")).toBe("zh-TW");
    });

    it("returns defaultLocale for unknown locale", () => {
        expect(getLocale("de")).toBe("zh");
        expect(matchLocale("de")).toBeNull();
    });

    it("returns defaultLocale for empty string", () => {
        expect(getLocale("")).toBe("zh");
    });
});

describe("getLocalePath", () => {
    it("returns path without prefix for default locale (zh)", () => {
        expect(getLocalePath("zh", "/blog/")).toBe("/blog/");
    });

    it("returns '/' for empty path in default locale", () => {
        expect(getLocalePath("zh")).toBe("/");
    });

    it("adds locale prefix for non-default locale (en)", () => {
        expect(getLocalePath("en", "/blog/")).toBe("/en/blog/");
    });

    it("adds locale prefix for non-default locale with empty path", () => {
        expect(getLocalePath("en")).toBe("/en/");
    });

    it("handles the new locales without doubling slashes", () => {
        expect(getLocalePath("ja", "/blog/1/")).toBe("/ja/blog/1/");
        expect(getLocalePath("ja")).toBe("/ja/");
        expect(getLocalePath("zh-TW", "/")).toBe("/zh-TW/");
        expect(getLocalePath("fr", "archives/")).toBe("/fr/archives/");
    });
});

describe("stripLocalePrefix", () => {
    it("strips any registered locale prefix", () => {
        expect(stripLocalePrefix("/ja/blog/1/")).toBe("/blog/1/");
        expect(stripLocalePrefix("/en/")).toBe("/");
        expect(stripLocalePrefix("/zh-TW/culture/")).toBe("/culture/");
        expect(stripLocalePrefix("/blog/1/")).toBe("/blog/1/");
    });

    it("longest prefix wins so /zh-TW/ is not mistaken for /zh/", () => {
        expect(stripLocalePrefix("/zh-TW/archives/")).toBe("/archives/");
    });
});

describe("hasLocaleRoute", () => {
    it("accepts the five template routes", () => {
        expect(hasLocaleRoute("/")).toBe(true);
        expect(hasLocaleRoute("/blog/1/")).toBe(true);
        expect(hasLocaleRoute("/blog/")).toBe(true);
        expect(hasLocaleRoute("/archives/")).toBe(true);
        expect(hasLocaleRoute("/tags/")).toBe(true);
        expect(hasLocaleRoute("/culture/")).toBe(true);
    });

    it("rejects routes the template set does not build", () => {
        expect(hasLocaleRoute("/talks/")).toBe(false);
        expect(hasLocaleRoute("/article/foo/")).toBe(false);
        expect(hasLocaleRoute("/douban/")).toBe(false);
    });
});

describe("fallback chain", () => {
    it("uses the locale's own dictionary when it has the key", () => {
        expect(t("ja", "blog.title")).toBe("ブログ");
        expect(t("fr", "blog.title")).toBe("Blog");
        expect(t("ko", "archives.title")).toBe("아카이브");
        expect(tSource("ja", "blog.title")).toBe("ja");
    });

    it("falls back to zh for keys the locale has not translated", () => {
        // friends.* 不在本卡翻译范围（门禁按「关键键全译 + 覆盖率报数」判）
        expect(t("ja", "friends.title")).toBe(t("zh", "friends.title"));
        expect(tSource("ja", "friends.title")).toBe("zh");
    });

    it("returns the key itself when even zh has nothing", () => {
        expect(t("ja", "no.such.key")).toBe("no.such.key");
        expect(tSource("ja", "no.such.key")).toBeNull();
    });

    it("keeps empty strings as valid translations", () => {
        expect(t("fr", "friends.subtitle")).toBe(t("zh", "friends.subtitle"));
    });

    it("interpolates params", () => {
        expect(t("fr", "archives.postCount", { count: 12 })).toContain("12");
    });

    it("reports coverage per locale", () => {
        expect(coverage("zh").ratio).toBe(1);
        expect(coverage("en").ratio).toBe(1);
        for (const locale of ["zh-TW", "ja", "ko", "fr"] as const) {
            const { translated, total, ratio } = coverage(locale);
            expect(total).toBeGreaterThan(100);
            expect(translated).toBeGreaterThan(50);
            expect(ratio).toBeGreaterThan(0.3);
            expect(ratio).toBeLessThanOrEqual(1);
        }
    });
});
