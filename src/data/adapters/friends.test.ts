/**
 * friends adapter 三态契约（M2-6a · P-05）
 *
 * 三组 fixture 就是页面能看到的全部世界：
 *   normal —— 站点 JSON 的历史形状（id/link/avatar/style）+ 通用形状 + 去重
 *   empty  —— 站点没交朋友：undefined / null / [] / {} / { items: [] }
 *   error  —— 数据在但坏了：非数组、整批条目全废
 *
 * 判据里最重要的是「永不抛异常」：adapter 抛一次，构建就少一页（P-05 的验收是
 * 「删掉站点配置后空态仍 200」，等价于任何输入都必须能走到一个状态）。
 */
import { describe, expect, it } from "vitest";
import {
    FRIENDS_SLOT,
    loadFriends,
    loadSiteFriends,
    normalizeFriend,
    staticFeed,
    type FriendsFeed,
} from "./friends";

const legacySiteData = [
    {
        id: "@Felinae",
        link: "https://code.felinae98.cn/",
        avatar: "https://avatars.githubusercontent.com/u/23295345",
        style: "color: #fff; background-color: #473922",
    },
    {
        id: "@agnoCJY",
        link: "https://jychuuu.com/",
        avatar: "https://avatars.githubusercontent.com/u/46088026",
        style: "color: #fff; background-color: #191919",
    },
];

const genericData = {
    items: [
        {
            name: "秋葵笔记",
            url: "https://qiukui-note.happy365.day/",
            description: "记录一点东西",
        },
        { name: "宗宗酱", url: "//ygz.ink/", avatar: "/avatar/zzj.png" },
    ],
};

/** 页面渲染只依赖这三件事：状态、条目、总数。断言里统一复用。 */
function invariant(feed: FriendsFeed, label: string) {
    expect(Number.isInteger(feed.total), `${label}: total 必须是整数`).toBe(true);
    expect(feed.total, `${label}: total = items.length`).toBe(feed.items.length);
    expect(feed.dropped, `${label}: dropped 非负`).toBeGreaterThanOrEqual(0);
    expect(["ok", "empty", "error"], `${label}: status 闭集`).toContain(feed.status);
    if (feed.status === "ok") expect(feed.items.length, `${label}: ok 必须有条目`).toBeGreaterThan(0);
    if (feed.status === "empty") expect(feed.items, `${label}: empty 必须无条目`).toEqual([]);
    if (feed.status === "error") {
        expect(feed.items, `${label}: error 必须无条目`).toEqual([]);
        expect(feed.issue?.code, `${label}: error 必须带 code`).toBeTruthy();
    }
    // 页面会把 feed 直接塞进 data-* 属性与 JSON 日志：必须是可序列化的纯数据
    expect(JSON.parse(JSON.stringify(feed)), `${label}: feed 必须可序列化`).toEqual(feed);
}

describe("friends adapter · 正常态", () => {
    it("历史站点形状（id/link）归一化成 name/url，style 不再进入渲染层", () => {
        const feed = loadFriends(legacySiteData);
        invariant(feed, "legacy");
        expect(feed.status).toBe("ok");
        expect(feed.total).toBe(2);
        expect(feed.items[0]).toEqual({
            name: "@Felinae",
            url: "https://code.felinae98.cn/",
            avatar: "https://avatars.githubusercontent.com/u/23295345",
        });
        // 关键回归：旧的内联配色不许透传到页面（会绕过主题与对比度）
        expect(JSON.stringify(feed)).not.toContain("background-color");
    });

    it("通用形状（name/url/description）+ { items } 包裹 + 协议相对 URL 补 https", () => {
        const feed = loadFriends(genericData);
        invariant(feed, "generic");
        expect(feed.status).toBe("ok");
        expect(feed.total).toBe(2);
        expect(feed.items[0].description).toBe("记录一点东西");
        expect(feed.items[0].avatar).toBeUndefined();
        expect(feed.items[1].url).toBe("https://ygz.ink/");
        expect(feed.items[1].avatar).toBe("/avatar/zzj.png");
    });

    it("去重按 host+path：结尾斜杠与大小写不产生重复卡片", () => {
        const feed = loadFriends([
            { name: "A", url: "https://Example.com/blog/" },
            { name: "B", url: "https://example.com/blog" },
            { name: "C", url: "https://example.com/other" },
        ]);
        invariant(feed, "dedupe");
        expect(feed.status).toBe("ok");
        expect(feed.total).toBe(2);
        expect(feed.dropped).toBe(1);
        expect(feed.items.map((item) => item.name)).toEqual(["A", "C"]);
    });

    it("坏条目被丢弃但整体仍是 ok（一条坏友链不许拖垮整页）", () => {
        const feed = loadFriends([
            { name: "好站点", url: "https://good.example/" },
            { name: "缺链接" },
            { url: "https://no-name.example/" },
            { name: "脚本注入", url: "javascript:alert(1)" },
            { name: "data URL", url: "data:text/html,hi" },
            { name: "非法协议", url: "mailto:hi@example.com" },
            "字符串条目",
            42,
        ]);
        invariant(feed, "partial");
        expect(feed.status).toBe("ok");
        expect(feed.total).toBe(1);
        expect(feed.dropped).toBe(7);
    });
});

describe("friends adapter · 空态", () => {
    const emptyInputs = [
        ["undefined（槽位文件缺失）", undefined],
        ["null", null],
        ["空数组", []],
        ["空对象", {}],
        ["{ items: [] }", { items: [] }],
        ["{ items: null }", { items: null }],
    ] as const;

    for (const [label, input] of emptyInputs) {
        it(`${label} → empty，且不抛异常`, () => {
            const feed = loadFriends(input);
            invariant(feed, label);
            expect(feed.status).toBe("empty");
            expect(feed.issue?.code).toBeTruthy();
        });
    }

    it("minItems 门槛没到也按空态处理", () => {
        const feed = loadFriends([{ name: "唯一友人", url: "https://solo.example/" }], {
            minItems: 3,
        });
        expect(feed.status).toBe("empty");
        expect(feed.issue?.code).toBe("source-empty");
    });
});

describe("friends adapter · 错误态", () => {
    const errorInputs = [
        ["字符串", "not-json"],
        ["数字", 42],
        ["布尔", true],
        ["{ items: 字符串 }", { items: "oops" }],
        ["{ friends: 数字 }", { friends: 7 }],
        ["整批条目都非法", [{}, { url: "javascript:void(0)" }, "x"]],
    ] as const;

    for (const [label, input] of errorInputs) {
        it(`${label} → error（不是空态，也不是构建失败）`, () => {
            expect(() => loadFriends(input)).not.toThrow();
            const feed = loadFriends(input);
            invariant(feed, label);
            expect(feed.status).toBe("error");
            expect(feed.issue?.code).toBeTruthy();
        });
    }

    it("错误态条目数为 0，页面仍能渲染申请入口", () => {
        const feed = loadFriends({ items: "oops" });
        expect(feed.items).toEqual([]);
        expect(feed.total).toBe(0);
    });
});

describe("friends adapter · 槽位与构建期 fixture", () => {
    it("槽位未启用（空串）→ 空态，不读任何文件", () => {
        const feed = loadSiteFriends("");
        expect(feed.status).toBe("empty");
        expect(feed.issue?.code).toBe("slot-disabled");
    });

    it("槽位文件名不在登记的 glob 里 → 空态（等同文件缺失）", () => {
        const feed = loadSiteFriends("does-not-exist.json");
        expect(feed.status).toBe("empty");
        expect(feed.issue?.code).toBe("source-missing");
    });

    it("默认槽位能读到站点数据（文件存在时应为 ok 或空，永不为 error）", () => {
        const feed = loadSiteFriends();
        expect(FRIENDS_SLOT).toBe("friends.json");
        expect(["ok", "empty"]).toContain(feed.status);
        invariant(feed, "site-slot");
    });

    it("staticFeed 产出可渲染的空态/错误态", () => {
        expect(staticFeed("empty").status).toBe("empty");
        expect(staticFeed("error").status).toBe("error");
        expect(staticFeed("error").items).toEqual([]);
    });

    it("缺名字/缺 URL 的单条返回 null", () => {
        expect(normalizeFriend(null)).toBeNull();
        expect(normalizeFriend("https://a.example/")).toBeNull();
        expect(normalizeFriend({ url: "https://a.example/" })).toBeNull();
        expect(normalizeFriend({ name: "A" })).toBeNull();
        expect(normalizeFriend({ name: "A", url: "ftp://a.example/" })).toBeNull();
        expect(normalizeFriend({ name: "A", url: "https://a.example/" })).toMatchObject({
            name: "A",
            url: "https://a.example/",
        });
    });
});
