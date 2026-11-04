/**
 * talks adapter 三态契约（M2-6b · P-06）
 *
 * 三组 fixture 就是页面能看到的全部世界：
 *   normal —— 站点抓取产物的历史形状 + Blinko/memos API 原样 + 包裹形状
 *   empty  —— 还没抓过：undefined / null / [] / {} / { items: [] }
 *   error  —— 数据在但坏了：非数组、整批条目全废
 *
 * 判据里最重要的是「永不抛异常」：adapter 抛一次，构建就少一页（P-06 的验收是
 * 「删掉站点数据后空态仍 200」，等价于任何输入都必须能走到一个状态）。
 */
import { describe, expect, it } from "vitest";
import {
    TALKS_SLOT,
    loadSiteTalks,
    loadTalks,
    normalizeTalk,
    staticFeed,
    type TalksFeed,
} from "./talks";

/** 站点当前的真实形状（src/data/talks.json）：datetime + content + images + url。 */
const siteData = [
    {
        datetime: "2026/6/21 19:58:48",
        display: "21小时前",
        url: "https://memos.marxchou.com/share/lcnr822q",
        content: "早上6点跑去珠海玩\n\n#四处逛逛 #四处逛逛/珠海 #旅行",
        images: [
            "https://memos.marxchou.com/api/file/a.jpg",
            "https://memos.marxchou.com/api/file/b.jpg",
        ],
    },
    {
        datetime: "2026/6/19 15:46:39",
        url: "https://memos.marxchou.com/share/qpnhxt0p",
        content: "深圳这几天雨下的我发霉了\n\n#休闲/放空 #天气/下雨",
    },
];

/** Blinko / memos API 原样：createdAt(ISO) + attachments 对象数组，没有 url。 */
const apiShape = {
    items: [
        {
            id: "note-1",
            content: "随手记一条 #想法",
            createdAt: "2026-05-01T10:00:00.000Z",
            attachments: [{ url: "https://blinko.example/file/1.png" }],
        },
    ],
};

const expectStatus = (feed: TalksFeed, status: TalksFeed["status"], code?: string) => {
    expect(feed.status).toBe(status);
    if (code) expect(feed.issue?.code).toBe(code);
};

describe("normalizeTalk · 单条归一化", () => {
    it("站点形状：抽话题、剔话题、保留配图与外链，时间解析成 ISO", () => {
        const talk = normalizeTalk(siteData[0]);
        expect(talk).not.toBeNull();
        expect(talk?.text).toBe("早上6点跑去珠海玩");
        expect(talk?.tags).toEqual(["四处逛逛", "四处逛逛/珠海", "旅行"]);
        expect(talk?.images).toHaveLength(2);
        expect(talk?.url).toBe("https://memos.marxchou.com/share/lcnr822q");
        expect(talk?.ts).toBeTypeOf("number");
        expect(talk?.time.endsWith("Z")).toBe(true);
    });

    it("API 形状：createdAt + attachments[{url}]，无 url 时不产生空字段", () => {
        const talk = normalizeTalk((apiShape.items as unknown[])[0] as Record<string, unknown>);
        expect(talk?.id).toBe("note-1");
        expect(talk?.tags).toEqual(["想法"]);
        expect(talk?.images).toEqual(["https://blinko.example/file/1.png"]);
        expect("url" in (talk ?? {})).toBe(false);
    });

    it("脏字段：非 http 外链、data: 配图、空白正文 —— 该丢的丢，不该丢的留", () => {
        const talk = normalizeTalk({
            content: "正文 #a",
            url: "javascript:alert(1)",
            images: ["data:image/png;base64,AAA", "  ", "https://ok.example/x.jpg"],
        });
        expect(talk?.url).toBeUndefined();
        expect(talk?.images).toEqual(["https://ok.example/x.jpg"]);
        expect(talk?.text).toBe("正文");
    });

    it("时间不可解析：条目保留、ts=null、原文时间不丢", () => {
        const talk = normalizeTalk({ content: "没有时间", datetime: "某个下午" });
        expect(talk).not.toBeNull();
        expect(talk?.ts).toBeNull();
        expect(talk?.time).toBe("某个下午");
    });

    it("缺正文 / 非对象 / 数组 —— 一律 null（由调用方计 dropped）", () => {
        expect(normalizeTalk({ datetime: "2026-01-01" })).toBeNull();
        expect(normalizeTalk({ content: "   " })).toBeNull();
        expect(normalizeTalk("一条字符串")).toBeNull();
        expect(normalizeTalk([])).toBeNull();
        expect(normalizeTalk(null)).toBeNull();
    });
});

describe("loadTalks · 三态", () => {
    it("ok：时间倒序、去重、标签计数排序、newest = 最新一条", () => {
        const feed = loadTalks(siteData);
        expectStatus(feed, "ok");
        expect(feed.total).toBe(2);
        expect(feed.dropped).toBe(0);
        expect(feed.items[0].text).toContain("珠海");
        expect(feed.items[1].text).toContain("深圳");
        expect(feed.newest).toBe(feed.items[0].time);
        // 每个话题各出现 1 次 → 同 count 按名字排序，这里只判「聚合对、计数对」
        expect(feed.tags).toHaveLength(5);
        expect(feed.tags.every((tag) => tag.count === 1)).toBe(true);
        expect(feed.tags.map((tag) => tag.name)).toContain("四处逛逛");
        expect(feed.tags.map((tag) => tag.name)).toContain("天气/下雨");
    });

    it("包裹形状：{ items } / { data } / { notes } 都认得", () => {
        for (const key of ["items", "data", "notes", "talks"]) {
            const feed = loadTalks({ [key]: [{ content: `来自 ${key} #t` }] });
            expectStatus(feed, "ok");
            expect(feed.total).toBe(1);
        }
    });

    it("id 稳定 + 同 id 去重：同一份数据构建两次锚点不变", () => {
        const duplicate = [
            { id: "same", content: "第一条" },
            { id: "same", content: "重复" },
            { content: "无 id 的一条", datetime: "2026-01-02" },
        ];
        const first = loadTalks(duplicate);
        const second = loadTalks(duplicate);
        expect(first.items.map((item) => item.id)).toEqual(second.items.map((item) => item.id));
        expect(first.total).toBe(2);
        expect(first.dropped).toBe(1);
    });

    it("空态：undefined / null / [] / {} / { items: [] }", () => {
        for (const value of [undefined, null, [], {}, { items: [] }, { data: null }]) {
            expectStatus(loadTalks(value), "empty");
        }
        expect(loadTalks(undefined).issue?.code).toBe("source-missing");
        expect(loadTalks([]).issue?.code).toBe("source-empty");
    });

    it("错误态：非数组、包裹里不是数组、整批条目全废", () => {
        expectStatus(loadTalks("字符串"), "error", "source-not-array");
        expectStatus(loadTalks({ items: "nope" }), "error", "source-not-array");
        expectStatus(loadTalks([{ foo: 1 }, { bar: 2 }]), "error", "no-valid-entries");
        expect(loadTalks([{ foo: 1 }]).dropped).toBe(0);
    });

    it("永不抛异常：任意脏输入都落到某个状态", () => {
        const dirty: unknown[] = [
            0,
            false,
            NaN,
            Symbol("x"),
            () => undefined,
            [[]],
            [{ content: { nested: true } }],
            [{ content: "ok", images: 42, tags: { weird: true } }],
            [{ content: "ok", datetime: { y: 2026 } }],
            [{ content: "ok", createdAt: 1700000000 }],
        ];
        for (const value of dirty) {
            expect(() => loadTalks(value)).not.toThrow();
            expect(["ok", "empty", "error"]).toContain(loadTalks(value).status);
        }
        // 秒级时间戳要认成秒（×1000），不能落到 1970
        const seconds = loadTalks([{ content: "秒级", createdAt: 1700000000 }]);
        expect(seconds.items[0].ts).toBe(1700000000000);
    });

    it("不可解析时间的条目沉底但不丢，输入顺序稳定", () => {
        const feed = loadTalks([
            { content: "无时间 A" },
            { content: "有时间", datetime: "2026-03-01" },
            { content: "无时间 B" },
        ]);
        expectStatus(feed, "ok");
        expect(feed.items.map((item) => item.text)).toEqual(["有时间", "无时间 A", "无时间 B"]);
        expect(feed.newest).toBe(feed.items[0].time);
    });

    it("槽位：PUBLIC_TALKS_STATE fixture 与静态空/错误态", () => {
        expect(staticFeed("empty").status).toBe("empty");
        expect(staticFeed("error").status).toBe("error");
        // 未设置环境变量时按站点槽位读：真实数据 → ok 或空态，且永远不抛
        const feed = loadSiteTalks(TALKS_SLOT);
        expect(["ok", "empty", "error"]).toContain(feed.status);
        expect(loadSiteTalks("").issue?.code).toBe("slot-disabled");
        expect(loadSiteTalks("not-exist.json").status).toBe("empty");
    });
});
