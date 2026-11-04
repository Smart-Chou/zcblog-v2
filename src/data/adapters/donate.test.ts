/**
 * donate adapter 三态契约（M2-6b · P-07）
 *
 * 与 P-06 同一套骨架，多一条硬判据：
 *   「收款二维码/账号只在注入时出现」—— 空串二维码、无链接的空壳条目、
 *   重复 id 都必须被归一化成「没有这个方式」，页面因此不会渲染空 <img>。
 */
import { describe, expect, it } from "vitest";
import {
    DONATE_SLOT,
    loadDonate,
    loadSiteDonate,
    normalizeAccount,
    normalizeAccounts,
    normalizeDonator,
    staticFeed,
    type DonateFeed,
} from "./donate";

/** 站点当前形状（src/data/donators.json）：{ donators: [...] }。 */
const siteLedger = {
    donators: [
        {
            id: "1",
            name: "张三",
            avatar: "",
            amount: 50,
            date: "2026-01-18",
            message: "感谢你的分享！",
        },
        { id: "2", name: "李四", avatar: "", amount: 100, date: "2026-01-20", message: "" },
        { id: "3", name: "吴十", avatar: "", amount: 40, date: "2026-02-05", message: "" },
    ],
};

/** 注入点形状（src/config/ui.ts · donatePage.accounts）。 */
const accounts = [
    {
        id: "wechat",
        kind: "qr",
        qr: "wechat-pay.png",
        label: "微信支付",
        icon: "mingcute:wechat-pay-line",
    },
    { id: "alipay", kind: "qr", qr: "alipay.jpg", label: "支付宝", icon: "mingcute:alipay-line" },
    {
        id: "paypal",
        kind: "link",
        href: "https://paypal.me/zcily",
        label: "PayPal",
        icon: "mingcute:paypal-fill",
        account: "pay@example.com",
    },
];

const expectStatus = (feed: DonateFeed, status: DonateFeed["status"], code?: string) => {
    expect(feed.status).toBe(status);
    if (code) expect(feed.issue?.code).toBe(code);
};

describe("normalizeDonator · 单条账本", () => {
    it("金额与日期归一：字符串金额、斜杠日期、空白 message 不产生空字段", () => {
        const donator = normalizeDonator({
            name: " 王五 ",
            amount: "￥ 66.50 ",
            date: "2026/2/9",
            message: "   ",
            avatar: "javascript:alert(1)",
        });
        expect(donator).toEqual({ name: "王五", amount: 66.5, date: "2026-02-09" });
    });

    it("缺名字 / 金额非法 / 负数 —— null；0 元保留但不显示金额", () => {
        expect(normalizeDonator({ amount: 10 })).toBeNull();
        expect(normalizeDonator({ name: "x", amount: "很多" })).toBeNull();
        expect(normalizeDonator({ name: "x", amount: -5 })).toBeNull();
        expect(normalizeDonator({ name: "x", amount: 0 })?.amount).toBe(0);
        expect(normalizeDonator("字符串")).toBeNull();
    });
});

describe("normalizeAccounts · 收款方式注入", () => {
    it("qr / link 两种形状都认，账号与说明按需带出", () => {
        const [wechat, alipay, paypal] = normalizeAccounts(accounts);
        expect(wechat.kind).toBe("qr");
        expect(wechat.qr).toBe("wechat-pay.png");
        expect(alipay.kind).toBe("qr");
        expect(paypal.kind).toBe("link");
        expect(paypal.href).toBe("https://paypal.me/zcily");
        expect(paypal.account).toBe("pay@example.com");
    });

    it("没有二维码也没有 http(s) 链接 → 不产生方式（页面因此没有空 <img>）", () => {
        expect(normalizeAccount({ id: "empty", qr: "   " })).toBeNull();
        expect(normalizeAccount({ id: "shell", kind: "qr" })).toBeNull();
        expect(normalizeAccount({ id: "bad-link", href: "javascript:alert(1)" })).toBeNull();
        expect(normalizeAccounts([{ id: "a", qr: "" }, { id: "b" }, null, "x"])).toEqual([]);
        expect(normalizeAccounts(undefined)).toEqual([]);
        expect(normalizeAccounts({ accounts: [] })).toEqual([]);
    });

    it("id 去重：同一种方式注入两次只渲染一次", () => {
        const deduped = normalizeAccounts([
            { id: "wechat", qr: "wechat-pay.png" },
            { id: "wechat", qr: "other.png" },
        ]);
        expect(deduped).toHaveLength(1);
        expect(deduped[0].qr).toBe("wechat-pay.png");
    });
});

describe("loadDonate · 三态", () => {
    it("ok：账本按日期倒序、合计两位小数以内、收款方式原样带出", () => {
        const feed = loadDonate(siteLedger, { accounts });
        expectStatus(feed, "ok");
        expect(feed.total).toBe(3);
        expect(feed.donators.map((donator) => donator.name)).toEqual(["吴十", "李四", "张三"]);
        expect(feed.amountTotal).toBe(190);
        expect(feed.currency).toBe("¥");
        expect(feed.accounts).toHaveLength(3);
        expect(feed.enabled).toBe(true);
    });

    it("只有账本、没有注入收款方式 → accounts=[] （验收「缺省不渲染」）", () => {
        const feed = loadDonate(siteLedger);
        expect(feed.accounts).toEqual([]);
        expectStatus(feed, "ok");
        const bare = staticFeed("no-accounts");
        expect(bare.accounts).toEqual([]);
        expect(bare.total).toBe(0);
    });

    it("裸数组与包裹形状都认得；enabled=false 只改开关不改数据", () => {
        const bare = loadDonate(siteLedger.donators);
        expectStatus(bare, "ok");
        expect(bare.total).toBe(3);
        const wrapped = loadDonate({ records: [{ name: "a", amount: 1 }] });
        expectStatus(wrapped, "ok");
        expect(loadDonate(siteLedger, { enabled: false }).enabled).toBe(false);
    });

    it("空态：undefined / null / [] / {} / { donators: null }", () => {
        for (const value of [undefined, null, [], {}, { donators: null }]) {
            expectStatus(loadDonate(value, { accounts }), "empty");
        }
        expect(loadDonate(undefined).issue?.code).toBe("source-missing");
        expect(loadDonate([]).issue?.code).toBe("source-empty");
    });

    it("错误态：非数组、包裹里不是数组、整批记录全废（收款方式仍带出）", () => {
        expectStatus(loadDonate("字符串"), "error", "source-not-array");
        expectStatus(loadDonate({ donators: "nope" }), "error", "source-not-array");
        expectStatus(
            loadDonate([{ name: 1 }, { amount: "x" }], { accounts }),
            "error",
            "no-valid-entries",
        );
        expect(loadDonate([{ name: 1 }], { accounts }).accounts).toHaveLength(3);
    });

    it("永不抛异常：脏输入都落到某个状态", () => {
        const dirty: unknown[] = [
            0,
            false,
            NaN,
            Symbol("x"),
            [[]],
            [{ name: "x", amount: {}, date: { y: 1 } }],
            { donators: [[]] },
        ];
        for (const value of dirty) {
            expect(() => loadDonate(value, { accounts })).not.toThrow();
            expect(["ok", "empty", "error"]).toContain(loadDonate(value, { accounts }).status);
        }
    });

    it("夹具与槽位：staticFeed 三态 + 空槽位/缺失槽位不抛", () => {
        expect(staticFeed("empty").status).toBe("empty");
        expect(staticFeed("error").status).toBe("error");
        expect(staticFeed("no-accounts").accounts).toEqual([]);
        expect(loadSiteDonate(DONATE_SLOT, { accounts }).status).toBeTypeOf("string");
        expect(loadSiteDonate("", { accounts }).issue?.code).toBe("slot-disabled");
        expect(loadSiteDonate("not-exist.json").status).toBe("empty");
    });
});
