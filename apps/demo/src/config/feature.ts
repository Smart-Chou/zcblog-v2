// 功能开关配置（M3-6 示例 overlay：保持模板默认——外部服务全关，开箱即用零配置）

/**
 * 网站功能配置
 */
export interface FeaturesConfig {
    lang: string; // 默认网站语言 en | zh-CN
    PageSize: number; // 文章页面上的文章数
    codeFoldingStartLines: number; // 代码折叠起始行数
    ga: string | false; // 与Google Analytics集成：填入GA-ID即可启用；false = 关闭
    redirect: boolean; // 是否开启链接重定向
    redirectIncludeClass: string[]; // 链接重定向包含的类
    redirectExcludeClass: string[]; // 链接重定向排除的类
}

/**
 * 页面视图配置
 */
export interface ViewConfig {
    backtotop: boolean; // 返回顶部
    author: boolean; // 显示作者
}

/**
 * 捐赠配置
 */
export interface DonateConfig {
    enable: boolean; // 是否启用捐赠功能
    tip: string; // 捐赠提示
    wechatQRCode: string; // 微信二维码图片地址, 图片地址应该放在 public 目录下
    alipayQRCode: string; // 支付宝二维码图片地址, 图片地址应该放在 public 目录下
    paypalQRCode: string; // PayPal二维码图片地址, 图片地址应该放在 public 目录下
    paypalUrl: string; // PayPal 捐赠地址（留空则不显示 PayPal 卡片）
}

/**
 * Waline评论功能配置
 */
export interface WalineConfig {
    enable: boolean; // 是否启用
    serverUrl: string; // 评论服务器地址（启用时必填，如 https://waline.your-domain.com）
    lang: string; // 评论语言
    pageSize: number; // 评论分页大小
    reaction: string[]; // 是否开启表情
    search: boolean; // 是否开启搜索
    whiteList: string[]; // 白名单 总是开启
}

/**
 * 搜索功能配置
 */
export interface SearchConfig {
    enable: boolean; // pagefind 是否启用
}

/**
 * Umami统计配置
 */
export interface UmamiConfig {
    enable: boolean; // 是否启用
    umamiBaseUrl: string; // Umami服务器地址
    umamiId: string; // Umami网站ID
    shareSlug: string; // 公开 Share 链接 slug（页脚计数与统计入口；留空则页脚不显示）
}

/**
 * 热门文章配置（数据由 scripts/fetch-popular.mjs 从 Umami 拉取，构建期同步）
 */
export interface PopularConfig {
    enable: boolean; // 是否启用（数据缺失或为空时区块自动隐藏）
    limit: number; // 首页展示条数
}

/**
 * 公告栏配置
 */
export interface NoticeConfig {
    enable: boolean;
    title: string;
    content: string;
    path?: string; // 只在匹配路径显示，为空则全局显示
    key?: string; // localStorage 键名，用于关闭后不再显示
    showOnce?: boolean; // true: localStorage 持久关闭, false: sessionStorage 仅本次
    confirm?: boolean; // 是否需要确认按钮
    confirmText?: string; // 确认按钮文案
}

/**
 * 水印配置
 */
export interface WatermarkConfig {
    enable: boolean;
    content: string;
    fontSize: number;
    opacity: number;
    rotate: number;
    color: string;
    gapX: number;
    gapY: number;
}

/**
 * 文章分享配置
 */
export interface ShareConfig {
    enable: boolean; // 是否启用文章分享
    sites: string[]; // 显示的平台与顺序：wechat/weibo/qzone/douban/x/telegram/bluesky/facebook/linkedin/reddit/copy/native
}

/**
 * 网站功能配置
 */
export const config: FeaturesConfig = {
    lang: "zh-CN",
    PageSize: 9,
    codeFoldingStartLines: 16,
    ga: false,
    redirect: true,
    redirectIncludeClass: ["post-content"],
    redirectExcludeClass: ["modal-mask", "friends-container", "author"],
};

/**
 * 博客视图配置
 */
export const pageView: ViewConfig = {
    backtotop: true,
    author: true,
};

/**
 * 文章页视图配置
 */
export const postView: ViewConfig = {
    backtotop: true,
    author: true,
};

/**
 * 捐赠配置
 */
export const donate: DonateConfig = {
    enable: false,
    tip: "感谢支持！",
    wechatQRCode: "../assets/qr/wechat-pay.png",
    alipayQRCode: "../assets/qr/alipay.jpg",
    paypalQRCode: "../assets/qr/paypal.png",
    paypalUrl: "",
};

/**
 * 评论系统配置
 */
export const waline: WalineConfig = {
    enable: false,
    serverUrl: "", // 例如 "https://waline.your-domain.com"
    lang: "zh-CN",
    pageSize: 16,
    reaction: [],
    search: false,
    whiteList: ["/donate/", "/friends/"],
};

/**
 * 搜索功能配置
 */
export const search: SearchConfig = {
    enable: true,
};

/**
 * 统计配置
 */
export const umami: UmamiConfig = {
    enable: false,
    umamiBaseUrl: "",
    umamiId: "",
    shareSlug: "",
};

/**
 * 热门文章配置（可选：配置 UMAMI_* 环境变量后由 fetch 脚本生成数据，
 * 并把 enable 改为 true 即可在首页显示「近期热门」区块）
 */
export const popular: PopularConfig = {
    enable: false,
    limit: 5,
};

/**
 * 公告栏配置
 */
export const notice: NoticeConfig = {
    enable: false,
    title: "示例公告",
    content: "这是公告栏示例——在 src/config/feature.ts 中把 notice.enable 改为 true 即可启用。",
    path: "",
    key: "notice-demo",
    showOnce: true,
    confirm: false,
    confirmText: "知道了",
};

export const watermark: WatermarkConfig = {
    enable: false,
    content: "",
    fontSize: 16,
    opacity: 0.06,
    rotate: -20,
    color: "#000000",
    gapX: 200,
    gapY: 150,
};

/**
 * 文章分享配置
 */
export const share: ShareConfig = {
    enable: true,
    sites: [
        "wechat",
        "weibo",
        "qzone",
        "douban",
        "x",
        "telegram",
        "facebook",
        "reddit",
        "copy",
        "native",
    ],
};
