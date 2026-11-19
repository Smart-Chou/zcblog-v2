// 功能开关配置

/**
 * 网站功能配置
 */
export interface FeaturesConfig {
    lang: string; // 默认网站语言 en | zh-CN
    PageSize: number; // 文章页面上的文章数
    codeFoldingStartLines: number; // 代码折叠起始行数
    ga: string | false; // 如果您想与Google Analytics进行集成，只需在此处输入您的GA-ID即可
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
    paypalUrl: string; // PayPal 捐赠地址
}

/**
 * Waline评论功能配置
 */
export interface WalineConfig {
    enable: boolean; // 是否启用
    serverUrl: string; // 评论服务器地址
    lang: string; // 评论语言
    pageSize: number; // 评论分页大小
    reaction: string[]; // 是否开启表情
    search: boolean; // 是否开启搜索
    whiteList: string[]; // 白名单 总是开启
}

/**
 * 评论 provider 标识。
 *
 * 为什么单独一个类型、而不是把 provider 塞进 `WalineConfig`：三个 provider 的配置
 * 形状完全不同（Waline/Twikoo 要 serverUrl、Giscus 要 repo+category），塞进去会让
 * 「provider=giscus 时 serverUrl 该填什么」变成无解的必填项。provider 是**选路**，
 * 具体配置留在各自的块里。
 *
 * 当前只实现 `none` / `waline`。`twikoo` / `giscus` 见挂起事项登记 H-12：
 * 两者都要求放宽 CSP（Twikoo 走 CDN、Giscus 要 `frame-src`），需 PO 单独批准。
 */
export type CommentProvider = "none" | "waline";

/**
 * 评论系统选路配置。
 *
 * 与 `WalineConfig` 分开的原因见上方 `CommentProvider` 注释。
 */
export interface CommentsConfig {
    provider: CommentProvider;
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
    ga: "G-NNFT48RCHH",
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
    enable: true,
    tip: "赞赏金额将全部用于开源项目维护，以及服务器、域名及各类云服务的开销",
    wechatQRCode: "../assets/qr/wechat-pay.png",
    alipayQRCode: "../assets/qr/alipay.jpg",
    paypalQRCode: "../assets/qr/paypal.png",
    paypalUrl: "https://paypal.me/zcily",
};

/**
 * 评论系统配置
 *
 * `provider` 是唯一选路依据。`waline.enable` 保留但**由 provider 派生**：
 * 存量代码（`MarkdownLayout` / `FriendsContent` / `TalksContent` / `DonateContent`
 * 四处）都在读 `waline.enable`，直接改成读 provider 会给每处都加一次解引用。
 * 派生之后「provider=none 却忘关 waline.enable」这种自相矛盾的配置在结构上不可能存在。
 */
export const comments: CommentsConfig = {
    // 构建期覆盖，沿用 `PUBLIC_DONATE_STATE` / `PUBLIC_TALKS_STATE` 的既有约定：
    // 验收脚本要产出「provider=none 的产物」才能验证零请求，否则只能测「开着的」
    // 一侧。不设时默认 waline，生产行为不变。
    provider: (import.meta.env.PUBLIC_COMMENTS_PROVIDER as CommentProvider) || "waline",
};

export const waline: WalineConfig = {
    enable: comments.provider === "waline",
    serverUrl: "https://waline.marxchou.com",
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
    enable: true,
    umamiBaseUrl: "https://umami.marxchou.com",
    umamiId: "73b29141-fccf-4d54-9c2f-f7d0d146f86b",
    shareSlug: "EIlCDPZqKiANCpuO",
};

/**
 * 热门文章配置
 */
export const popular: PopularConfig = {
    enable: true,
    limit: 5,
};

export const notice: NoticeConfig = {
    enable: true,
    title: "AI 辅助写作声明",
    content: "本博客部分内容采用 AI 辅助写作，请自行决定是否继续阅读。",
    path: "",
    key: "notice-ai-writing",
    showOnce: true,
    confirm: true,
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
