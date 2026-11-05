// 服务页面配置（M3-6 示例 overlay：服务项沿用占位内容，联系方式换成示例值）

/**
 * 定价模式
 */
export type PricingMode = "fixed" | "negotiable";

/**
 * 交付方式
 */
export type DeliveryMode = "consult" | "hands-on";

/**
 * 服务项配置
 */
export interface ServiceItem {
    id: string;
    title: string;
    icon: string; // iconify 图标名
    description: string;
    deliveryMode: DeliveryMode;
    deliveryLabel: string;
    pricing: PricingMode;
    priceLabel: string; // fixed 时显示价格（如 "¥500 起"），negotiable 时显示（如 "私聊议价"）
}

/**
 * 中文服务数据
 */
export const servicesZh: ServiceItem[] = [
    {
        id: "example-a",
        title: "示例服务 A",
        icon: "tabler:brand-blogger",
        description:
            "在这里写你的服务说明。把 servicesZh / servicesEn 替换成真实内容，或清空数组让页面显示空态。",
        deliveryMode: "hands-on",
        deliveryLabel: "远程交付",
        pricing: "fixed",
        priceLabel: "¥100 起",
    },
    {
        id: "example-b",
        title: "示例服务 B",
        icon: "tabler:message-chatbot",
        description: "第二个示例服务。定价模式支持 fixed（固定价）或 negotiable（议价）。",
        deliveryMode: "consult",
        deliveryLabel: "远程咨询",
        pricing: "negotiable",
        priceLabel: "私聊议价",
    },
];

/**
 * 联系方式配置
 */
export interface ContactInfo {
    wechat: string;
    telegram: string;
    telegramUrl: string;
    email: string;
}

/**
 * 中文联系方式
 */
export const contactZh: ContactInfo = {
    wechat: "demo-wechat",
    telegram: "@dogeared_demo",
    telegramUrl: "https://t.me/dogeared_demo",
    email: "demo@example.com",
};

/**
 * 英文联系方式
 */
export const contactEn: ContactInfo = {
    wechat: "demo-wechat",
    telegram: "@dogeared_demo",
    telegramUrl: "https://t.me/dogeared_demo",
    email: "demo@example.com",
};

/**
 * 英文服务数据
 */
export const servicesEn: ServiceItem[] = [
    {
        id: "example-a",
        title: "Example Service A",
        icon: "tabler:brand-blogger",
        description:
            "Describe your service here. Replace servicesEn / servicesZh with real content, or empty the arrays to show the empty state.",
        deliveryMode: "hands-on",
        deliveryLabel: "Remote",
        pricing: "fixed",
        priceLabel: "From ¥100",
    },
    {
        id: "example-b",
        title: "Example Service B",
        icon: "tabler:message-chatbot",
        description: "Second example service. Pricing modes: fixed or negotiable.",
        deliveryMode: "consult",
        deliveryLabel: "Remote Consult",
        pricing: "negotiable",
        priceLabel: "DM for pricing",
    },
];
