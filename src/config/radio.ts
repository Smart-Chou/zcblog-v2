/**
 * 电台数据（M8-4 SitePlayer 的唯一数据源）
 *
 * 规格要求「源必须是数据，组件内硬编码 URL 即违规」（26-m8-4-player-spec §1.4）。
 * 这里就是那份数据：新增电台只改这个文件，组件与脚本都不出现字面量 URL。
 *
 * `live: true` = 无限流（无 duration、不可 seek）。播放器据此**不渲染进度条**
 * ——spec §4.3 的进度条契约只对有长度的曲目成立。
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

export const radioStations: RadioStation[] = [
    {
        id: "radioparadise",
        name: "Radio Paradise",
        detail: "Human-curated · Main Mix",
        note: "人工策展、无广告，公开的 128 kbps 流本来就是给这类播放器用的。",
        url: "https://stream.radioparadise.com/mp3-128",
        home: "https://radioparadise.com/music/what-is-playing",
        live: true,
    },
    {
        id: "nightride",
        name: "Nightride FM",
        detail: "Synthwave · 24/7",
        note: "Synthwave 子频道 + 现场 DJ，适合从阅读切到写作的时候。",
        url: "https://stream.nightride.fm/nightride.mp3",
        home: "https://nightride.fm/",
        live: true,
    },
];

export const radioDefaultStation = radioStations[0].id;
