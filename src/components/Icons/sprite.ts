/**
 * 自动生成的图标 sprite 清单
 * 由 scripts/generate-icons.js 在构建时生成
 * 请勿手动编辑此文件
 *
 * SPRITE_VERSION = public/icons.svg 的内容哈希（前 8 位）。它拼进 <use> 的 href 查询串，
 * 让 _headers 里的 immutable 缓存不会把旧 sprite 钉在浏览器里。
 */

export const SPRITE_URL = "/icons.svg";

export const SPRITE_VERSION = "ed9ed282";

/** 图标名 → viewBox；键集合同时是「这个图标存在」的闭集。 */
export const ICON_VIEWBOXES: Record<string, string> = {
    "logos:telegram": "0 0 256 256",
    "logos:twitter": "0 0 256 209",
    "mingcute:alipay-line": "0 0 24 24",
    "mingcute:arrow-up-circle-fill": "0 0 24 24",
    "mingcute:book-3-line": "0 0 24 24",
    "mingcute:github-line": "0 0 24 24",
    "mingcute:hand-heart-line": "0 0 24 24",
    "mingcute:mail-send-line": "0 0 24 24",
    "mingcute:paypal-fill": "0 0 24 24",
    "mingcute:wechat-fill": "0 0 24 24",
    "mingcute:wechat-pay-line": "0 0 24 24",
    "mingcute:world-2-fill": "0 0 24 24",
    "tabler:alert-triangle": "0 0 24 24",
    "tabler:alert-triangle-filled": "0 0 24 24",
    "tabler:archive": "0 0 24 24",
    "tabler:archive-filled": "0 0 24 24",
    "tabler:arrow-up-right": "0 0 24 24",
    "tabler:bolt": "0 0 24 24",
    "tabler:brain": "0 0 24 24",
    "tabler:brand-alipay": "0 0 24 24",
    "tabler:brand-blogger": "0 0 24 24",
    "tabler:brand-douban": "0 0 24 24",
    "tabler:brand-facebook": "0 0 24 24",
    "tabler:brand-github": "0 0 24 24",
    "tabler:brand-paypal": "0 0 24 24",
    "tabler:brand-qq": "0 0 24 24",
    "tabler:brand-reddit": "0 0 24 24",
    "tabler:brand-telegram": "0 0 24 24",
    "tabler:brand-wechat": "0 0 24 24",
    "tabler:brand-weibo": "0 0 24 24",
    "tabler:brand-x": "0 0 24 24",
    "tabler:check": "0 0 24 24",
    "tabler:chevron-left": "0 0 24 24",
    "tabler:chevron-right": "0 0 24 24",
    "tabler:chevrons-left": "0 0 24 24",
    "tabler:chevrons-right": "0 0 24 24",
    "tabler:circle-check": "0 0 24 24",
    "tabler:clock": "0 0 24 24",
    "tabler:copy": "0 0 24 24",
    "tabler:cpu": "0 0 24 24",
    "tabler:creative-commons": "0 0 24 24",
    "tabler:device-gamepad-2": "0 0 24 24",
    "tabler:devices": "0 0 24 24",
    "tabler:external-link": "0 0 24 24",
    "tabler:flame": "0 0 24 24",
    "tabler:focus-centered": "0 0 24 24",
    "tabler:folders": "0 0 24 24",
    "tabler:gauge": "0 0 24 24",
    "tabler:heart-handshake": "0 0 24 24",
    "tabler:info-circle": "0 0 24 24",
    "tabler:library-photo": "0 0 24 24",
    "tabler:loader-2": "0 0 24 24",
    "tabler:map-pin-filled": "0 0 24 24",
    "tabler:message-chatbot": "0 0 24 24",
    "tabler:message-chatbot-filled": "0 0 24 24",
    "tabler:moon-stars": "0 0 24 24",
    "tabler:movie": "0 0 24 24",
    "tabler:photo": "0 0 24 24",
    "tabler:point-filled": "0 0 24 24",
    "tabler:rss": "0 0 24 24",
    "tabler:server": "0 0 24 24",
    "tabler:share-2": "0 0 24 24",
    "tabler:stack-2": "0 0 24 24",
    "tabler:sun": "0 0 24 24",
    "tabler:tags": "0 0 24 24",
    "tabler:tool": "0 0 24 24",
    "tabler:tools": "0 0 24 24",
    "tabler:trophy": "0 0 24 24",
    "tabler:user-circle": "0 0 24 24",
    "tabler:users": "0 0 24 24",
    "tabler:world": "0 0 24 24",
    "tabler:x": "0 0 24 24",
};

/**
 * 图标自带 url(#id) / href("#id") 内部引用，跨文档 <use> 在宿主文档里解析不到，
 * 因此这几个图标继续内联输出（见 icon-markup.ts）。
 */
export const ICON_INLINE_ONLY: string[] = ["logos:telegram", "mingcute:github-line"];
