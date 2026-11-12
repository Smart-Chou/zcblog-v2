/**
 * 电台数据（M8-4 SitePlayer 的唯一数据源）
 *
 * 规格要求「源必须是数据，组件内硬编码 URL 即违规」（26-m8-4-player-spec §1.4）。
 * 这里就是那份数据：新增电台只改这个文件，组件与脚本都不出现字面量 URL。
 *
 * `live: true` = 无限流（无 duration、不可 seek）。播放器据此**不渲染进度条**
 * ——spec §4.3 的进度条契约只对有长度的曲目成立。
 *
 * **空数组是合法状态**：`radioStations = []` 表示全站不渲染播放器（合规停播、
 * 或暂时没有可授权播放的台）。此时 `astro build` 必须照常成功：`/radio/` 渲染
 * 空态、全站 0 个 `site-player` 节点、播放器 chunk 一次都不请求。
 * 因此本文件导出的**任何派生值都不得对空数组解引用**（`radioStations[0].id` 曾在
 * 空数组下抛 `TypeError`，让整站构建在配置模块阶段挂掉 —— D-0172）。
 *
 * 构建期预览空态：`PUBLIC_RADIO_STATE=empty pnpm build`（与 games / culture 同款
 * 构建期钩子；数据集不变，只用于验收与截图）。回归探针：`pnpm probe:radio-empty`。
 */

export interface RadioStation {
    /** 稳定 id（localStorage 与 API 都用它，不随展示名变化）。 */
    id: string;
    /** 展示名。 */
    name: string;
    /** 一行副标题（示于展开态）。 */
    detail: string;
    /** 说明文案（示于 /radio/ 页面）。 */
    note: string;
    /** 直播流地址，必须是 https 绝对地址（CSP 白名单同步）。 */
    url: string;
    /** 电台自己的页面，供「官方站点」外链降级。 */
    home: string;
    /** 无限流。 */
    live: boolean;
}

/** 数据集本体。**不要直接 import 这个**——用下方的 `radioStations`（它带着构建期空态钩子）。 */
const ALL_STATIONS: RadioStation[] = [
    {
        id: "radioparadise",
        name: "Radio Paradise",
        detail: "Human-curated · Main Mix",
        note: "人工策展、无广告，公开的 128 kbps 流本来就是给这类播放器用的。",
        url: "https://stream.radioparadise.com/mp3-128",
        home: "https://radioparadise.com/music/what-is-playing",
        live: true,
    },
];

export const radioStations: RadioStation[] =
    import.meta.env.PUBLIC_RADIO_STATE === "empty" ? [] : ALL_STATIONS;

/**
 * 是否有可播的台。给**门控脚本**用：空列表时连播放器 chunk 都不 import
 * （S0 的「0 字节播放器」由此从数据事实升级成代码保证）。
 *
 * 刻意只导出布尔而不是数组：门控脚本会被内联进每一页，导出数组会把流地址
 * 一起带进全站 HTML。构建期这个三元式与 `ALL_STATIONS` 都会被常量折叠/摇掉。
 */
export const radioHasStations = radioStations.length > 0;

// Nightride FM 已移除（D-0170 / D-0169）：该站查无任何授权文本可援引
// —— /terms、/tos、/terms-of-use、/about 全部返回同一份 31,011 字节首页，
// 旧条款页 nightridefm.creator-spring.com/terms-of-use 已 HTTP 410 Gone。
// 「流可达」不等于「有权播」，故不进数据源，CSP 也同步收窄到只剩 RP 一个 origin。
// 要加新电台：先在 decision-log 落一条批准（origin 必须精确，禁止 `*` 与宽泛 `https:`）。

/**
 * 默认台 id；**空列表时为 `null`**（不是 `undefined`，也不是非空断言）。
 *
 * 契约：调用方拿到 `null` 就当「没有可播的台」处理 —— 播放器不挂载、`/radio/`
 * 渲染空态。永远不要在这里用 `radioStations[0]!` 抹掉这一格（D-0172）。
 */
export const radioDefaultStation: string | null = radioStations[0]?.id ?? null;
