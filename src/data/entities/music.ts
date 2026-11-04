/**
 * 音乐实体数据（M2-8b）
 * -----------------------------------------------------------------
 * 手写 typed 数据，schema 见 `src/types/entities.ts`（musicSpec）。
 *
 * 数据诚实性：四条作品不是编出来的歌单，全部来自站点已有的豆瓣音乐快照
 * （`src/data/douban.json` 里 `type: "music"` 的 4 条），专辑名 / 表演者 / 发行年 /
 * 豆瓣评分都对照豆瓣条目页核对过（2026-05 快照，`note` 里注明人数）：
 *   绝代风华 2018 · 30385142 · 9.1（2065 人）
 *   素颜     2010 · 5064190  · 8.4（14195 人）
 *   寻雾启示 2010 · 4913704  · 8.5（9131 人）
 *   自定义   2009 · 3711014  · 8.8（18439 人）
 * 封面是快照里已经下载到 `public/images/douban/` 的同一张图，不额外抓图。
 *
 * 关于 `audio`：**四条都没有**。M2 的边界是不接 Meting / 网易云 API、不自托管音频，
 * 所以这段关系只有外链（去豆瓣条目看）。缺 `audio` 直接决定页面上不会出现 `<audio>`、
 * 不产生任何音频请求 —— 播放器只在有人真的点了「试听」、且条目带源时才按需加载。
 * 将来要加试听源，只在该条加 `audio: "https://…"`（必须是 http(s) 绝对地址，门禁会拦相对路径）。
 *
 * 新加作品 = 追加一个对象，按发行年降序摆放（页面按本文件顺序渲染，不自己排序）。
 * `id` 是稳定键，不要随标题改。
 */
import type { EntityMeta, MusicTrack } from "~/types/entities";

export const musicMeta: EntityMeta = {
    updated: "2026-11-04",
    owner: "MarxChou",
    // 手抄自豆瓣音乐快照（douban.json）+ 豆瓣条目页核对，非第三方 API 导入。
    source: "manual · douban music snapshot (douban.json) + music.douban.com subject pages",
};

export const music: MusicTrack[] = [
    {
        id: "jue-dai-feng-hua",
        title: "绝代风华",
        artist: "许嵩",
        format: "single",
        year: "2018",
        cover: "/images/douban/30385142.webp",
        note: {
            zh: "2018 年的单曲，豆瓣 9.1（2065 人评价，2026-05 快照）。四张里最晚的一张。",
            en: "A 2018 single, rated 9.1 on Douban (2,065 ratings, May 2026 snapshot) — the newest of the four.",
        },
        links: [{ label: "Douban", href: "https://music.douban.com/subject/30385142/" }],
        updated: "2026-11-04",
    },
    {
        id: "su-yan",
        title: "素颜",
        artist: "许嵩 / 何曼婷",
        format: "single",
        year: "2010",
        cover: "/images/douban/5064190.webp",
        note: {
            zh: "2010 年的对唱单曲，豆瓣 8.4（14195 人评价）。",
            en: "A 2010 duet single, rated 8.4 on Douban (14,195 ratings).",
        },
        links: [{ label: "Douban", href: "https://music.douban.com/subject/5064190/" }],
        updated: "2026-11-04",
    },
    {
        id: "xun-wu-qi-shi",
        title: "寻雾启示",
        artist: "许嵩 / VAE",
        format: "album",
        year: "2010",
        cover: "/images/douban/4913704.webp",
        note: {
            zh: "2010 年的专辑，豆瓣 8.5（9131 人评价）。",
            en: "A 2010 album, rated 8.5 on Douban (9,131 ratings).",
        },
        links: [{ label: "Douban", href: "https://music.douban.com/subject/4913704/" }],
        updated: "2026-11-04",
    },
    {
        id: "zi-ding-yi",
        title: "自定义",
        artist: "许嵩 / Vae",
        format: "album",
        year: "2009",
        cover: "/images/douban/3711014.webp",
        note: {
            zh: "2009 年的首张专辑，豆瓣 8.8（18439 人评价）。四张里最早的一张。",
            en: "The 2009 debut album, rated 8.8 on Douban (18,439 ratings) — the earliest of the four.",
        },
        links: [{ label: "Douban", href: "https://music.douban.com/subject/3711014/" }],
        updated: "2026-11-04",
    },
];
