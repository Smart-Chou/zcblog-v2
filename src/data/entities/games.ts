/**
 * 游戏实体数据（M2-7b）
 * ------------------------------------------------------------------
 * 手写 typed 数据，schema 见 `src/types/entities.ts`（gameSpec）。
 *
 * ⚠️ 当前条目是**结构样例**（meta.source = seed）：用来把页面、卡片、门禁跑通，
 * 具体玩过什么只有站点所有者知道。替换时逐条改 title / platforms / status / note 即可，
 * 页面与 schema 都不用动；`hours` / `rating` 没统计就删掉字段，不要填 0。
 */
import type { EntityMeta, Game } from "~/types/entities";

export const gamesMeta: EntityMeta = {
    updated: "2026-11-04",
    owner: "MarxChou",
    source: "seed（待替换为真实记录）",
};

export const games: Game[] = [
    {
        id: "sample-playing",
        title: { zh: "在玩的一场（示例）", en: "Currently playing (sample)" },
        platforms: ["pc"],
        status: "playing",
        note: {
            zh: "样例条目：换成你正在玩的游戏。状态为「在玩」的条目会排在最前面。",
            en: "Sample entry: replace with what you are playing. Entries with status playing are listed first.",
        },
        updated: "2026-11-04",
    },
    {
        id: "sample-finished",
        title: { zh: "通关的一部（示例）", en: "Finished title (sample)" },
        platforms: ["pc", "playstation"],
        status: "finished",
        year: "2025",
        hours: 40,
        rating: 5,
        note: {
            zh: "样例条目：带年份、小时数与评分，用来演示统计行与五星刻度怎么排。",
            en: "Sample entry: carries a year, hours and a rating to show how the stats row and the five-square scale lay out.",
        },
        updated: "2026-11-04",
    },
    {
        id: "sample-backlog",
        title: { zh: "待玩清单里的一部（示例）", en: "On the backlog (sample)" },
        platforms: ["switch"],
        status: "backlog",
        rating: 4,
        note: {
            zh: "样例条目：评分与游玩状态是两件事——待玩也能先有一个预期分数。",
            en: "Sample entry: rating and play state are separate things — a backlog item can still carry an expected score.",
        },
        updated: "2026-11-04",
    },
    {
        id: "sample-shelved",
        title: { zh: "搁置的一部（示例）", en: "Shelved title (sample)" },
        platforms: ["pc", "mobile"],
        status: "shelved",
        year: "2024",
        hours: 12,
        note: {
            zh: "样例条目：搁置不写「弃坑」——为什么停下，note 里说清楚比一个标签诚实。",
            en: "Sample entry: shelved rather than a “dropped” label — saying why it stopped in the note is more honest than a tag.",
        },
        updated: "2026-11-04",
    },
];
