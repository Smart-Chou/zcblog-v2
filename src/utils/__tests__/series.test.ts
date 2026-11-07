import { describe, expect, it } from "vitest";
import type { CollectionEntry } from "astro:content";
import {
    collectSeries,
    collectSeriesByLang,
    seriesHref,
    seriesIndexHref,
    seriesContextOf,
    seriesNameOf,
    seriesSlugOf,
    seriesStepLabel,
    seriesTotalLabel,
    sortSeriesPosts,
} from "../series";

/**
 * 系列数据层（M5-12 · D-0145）。
 * 这些断言就是契约本身：slug → 展示名、排序三档兜底、零 series 零分组。
 */

type Article = CollectionEntry<"article">;

function post(
    id: string,
    data: Omit<Partial<Article["data"]>, "pubDate"> & { pubDate: string },
    lang: "zh" | "en" = "zh",
): Article {
    return {
        id,
        collection: "article",
        data: { lang, draft: false, ...data, pubDate: new Date(data.pubDate) },
    } as unknown as Article;
}

describe("seriesNameOf", () => {
    it("kebab slug 转成标题式展示名", () => {
        expect(seriesNameOf("self-hosted")).toBe("Self Hosted");
        expect(seriesNameOf("astro")).toBe("Astro");
    });

    it("数字段原样保留", () => {
        expect(seriesNameOf("astro-7")).toBe("Astro 7");
    });
});

describe("seriesSlugOf", () => {
    it("未写 series → null", () => {
        expect(seriesSlugOf({ data: {} } as Pick<Article, "data">)).toBeNull();
    });

    it("空白串按未写处理（防御，schema 已禁止空串）", () => {
        expect(seriesSlugOf({ data: { series: "   " } } as Pick<Article, "data">)).toBeNull();
    });

    it("正常 slug 原样返回", () => {
        expect(seriesSlugOf({ data: { series: "homelab" } } as Pick<Article, "data">)).toBe(
            "homelab",
        );
    });
});

describe("sortSeriesPosts", () => {
    it("按 seriesOrder 升序", () => {
        const posts = [
            post("c", { pubDate: "2026-01-03", series: "s", seriesOrder: 3 }),
            post("a", { pubDate: "2026-01-01", series: "s", seriesOrder: 1 }),
            post("b", { pubDate: "2026-01-02", series: "s", seriesOrder: 2 }),
        ];
        expect(sortSeriesPosts(posts).map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    });

    it("缺 seriesOrder 的排在已编号之后，并按 pubDate 升序", () => {
        const posts = [
            post("late", { pubDate: "2026-03-01", series: "s" }),
            post("first", { pubDate: "2026-01-01", series: "s", seriesOrder: 1 }),
            post("early-no-order", { pubDate: "2026-02-01", series: "s" }),
        ];
        expect(sortSeriesPosts(posts).map((entry) => entry.id)).toEqual([
            "first",
            "early-no-order",
            "late",
        ]);
    });

    it("重复编号回落 pubDate，再回落 slug（顺序稳定）", () => {
        const posts = [
            post("z", { pubDate: "2026-01-02", series: "s", seriesOrder: 1 }),
            post("a", { pubDate: "2026-01-02", series: "s", seriesOrder: 1 }),
            post("older", { pubDate: "2026-01-01", series: "s", seriesOrder: 1 }),
        ];
        expect(sortSeriesPosts(posts).map((entry) => entry.id)).toEqual(["older", "a", "z"]);
    });

    it("不改动入参数组", () => {
        const posts = [
            post("b", { pubDate: "2026-01-02", series: "s", seriesOrder: 2 }),
            post("a", { pubDate: "2026-01-01", series: "s", seriesOrder: 1 }),
        ];
        sortSeriesPosts(posts);
        expect(posts.map((entry) => entry.id)).toEqual(["b", "a"]);
    });
});

describe("collectSeries", () => {
    const posts = [
        post("a1", { pubDate: "2026-01-01", series: "self-hosted", seriesOrder: 2 }),
        post("a0", { pubDate: "2026-01-05", series: "self-hosted", seriesOrder: 1 }),
        post("b1", { pubDate: "2026-02-01", series: "astro" }),
        post("plain", { pubDate: "2026-03-01" }),
        post("draft", { pubDate: "2026-04-01", series: "astro", draft: true }),
    ];

    it("只返回有文章的系列，无 series 的文章不进任何组", () => {
        const groups = collectSeries(posts);
        expect(groups.map((group) => group.slug)).toEqual(["astro", "self-hosted"]);
        expect(groups.flatMap((group) => group.posts.map((entry) => entry.id))).not.toContain(
            "plain",
        );
    });

    it("草稿不计入系列（不计数、不排序、不影响 latest）", () => {
        const astro = collectSeries(posts).find((group) => group.slug === "astro");
        expect(astro?.posts.map((entry) => entry.id)).toEqual(["b1"]);
        expect(astro?.latest.toISOString().slice(0, 10)).toBe("2026-02-01");
    });

    it("组内按 seriesOrder 排序，组间按展示名排序", () => {
        const groups = collectSeries(posts);
        expect(groups.map((group) => group.name)).toEqual(["Astro", "Self Hosted"]);
        expect(groups[1].posts.map((entry) => entry.id)).toEqual(["a0", "a1"]);
    });

    it("零 series 的站点返回空数组（上游据此不产出任何路由）", () => {
        expect(collectSeries([post("plain", { pubDate: "2026-03-01" })])).toEqual([]);
    });
});

describe("collectSeriesByLang", () => {
    it("zh / en 各自独立聚合", () => {
        const posts = [
            post("zh-1", { pubDate: "2026-01-01", series: "homelab" }, "zh"),
            post("en-1", { pubDate: "2026-01-01", series: "homelab" }, "en"),
            post("en-2", { pubDate: "2026-01-02", series: "notes" }, "en"),
        ];
        expect(collectSeriesByLang(posts, "zh").map((group) => group.slug)).toEqual(["homelab"]);
        expect(collectSeriesByLang(posts, "en").map((group) => group.slug)).toEqual([
            "homelab",
            "notes",
        ]);
    });
});

describe("seriesContextOf（文章页上下文 · M5-13）", () => {
    const posts = [
        post("plain", { pubDate: "2026-04-01" }),
        post("s3", { pubDate: "2026-01-03", series: "self-hosted", seriesOrder: 3 }),
        post("s1", { pubDate: "2026-01-01", series: "self-hosted", seriesOrder: 1 }),
        post("s2", { pubDate: "2026-01-02", series: "self-hosted", seriesOrder: 2 }),
    ];

    it("无 series 的文章 → null（调用方据此不渲染任何 DOM）", () => {
        expect(seriesContextOf(posts, "plain")).toBeNull();
    });

    it("集合里没有这篇 → null", () => {
        expect(seriesContextOf(posts, "not-in-collection")).toBeNull();
    });

    it("第一篇：无上一篇，下一篇按 seriesOrder 取第 2 篇", () => {
        const context = seriesContextOf(posts, "s1");
        expect(context?.index).toBe(0);
        expect(context?.total).toBe(3);
        expect(context?.prev).toBeNull();
        expect(context?.next?.id).toBe("s2");
    });

    it("中间篇：上下篇都有，且顺序来自 seriesOrder 而不是 pubDate", () => {
        // s3 的 pubDate 最晚但 seriesOrder=3；中间的必须是它自己的前后，不是日期邻居
        const context = seriesContextOf(posts, "s2");
        expect(context?.index).toBe(1);
        expect(context?.prev?.id).toBe("s1");
        expect(context?.next?.id).toBe("s3");
    });

    it("最后一篇：无下一篇", () => {
        const context = seriesContextOf(posts, "s3");
        expect(context?.index).toBe(2);
        expect(context?.prev?.id).toBe("s2");
        expect(context?.next).toBeNull();
    });

    it("单篇系列：上下篇都为 null（不产出空的翻页区）", () => {
        const solo = [post("only", { pubDate: "2026-02-01", series: "solo" })];
        const context = seriesContextOf(solo, "only");
        expect(context?.total).toBe(1);
        expect(context?.prev).toBeNull();
        expect(context?.next).toBeNull();
    });

    it("分组与列表页同一份：名称/成员与 collectSeries 一致", () => {
        const context = seriesContextOf(posts, "s2");
        const group = collectSeries(posts)[0];
        // 每次调用都会新建分组对象，只能比对内容 —— 关键是顺序与成员完全同源
        expect(context?.group.slug).toBe(group.slug);
        expect(context?.group.name).toBe("Self Hosted");
        expect(context?.group.posts.map((entry) => entry.id)).toEqual(
            group.posts.map((entry) => entry.id),
        );
    });
});

describe("URL / 序号", () => {
    it("zh 无前缀，en 带 /en", () => {
        expect(seriesIndexHref("zh")).toBe("/series/");
        expect(seriesHref("zh", "homelab")).toBe("/series/homelab/");
        expect(seriesIndexHref("en")).toBe("/en/series/");
        expect(seriesHref("en", "homelab")).toBe("/en/series/homelab/");
    });

    it("STEP 序号从 01 起两位补零", () => {
        expect(seriesStepLabel(0)).toBe("01");
        expect(seriesStepLabel(9)).toBe("10");
    });

    it("总数同样两位补零（避免「第 03 / 3 篇」）", () => {
        expect(seriesTotalLabel(3)).toBe("03");
        expect(seriesTotalLabel(12)).toBe("12");
    });
});
