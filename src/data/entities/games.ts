/**
 * 游戏实体数据（M2-7b；M8-6-1 数据收口）
 * ------------------------------------------------------------------
 * 手写 typed 数据，schema 见 `src/types/entities.ts`（gameSpec）。
 *
 * M8-6-1 起为**真实空态**：原先 4 条 `sample-*`（标题含「（示例）」、
 * `meta.source = seed`）是结构样例，会让页面在 G-08 上直接判死。既然只有站点所有者
 * 知道自己玩过什么，这里就留空，让页面走设计内的空态分支，而不是用假记录把页面填满。
 *
 * 补真实记录时逐条加 `title` / `platforms` / `status` / `note`；
 * `hours` / `rating` / `year` 没统计就**删掉字段**，不要填 0（0 是一个假事实）。
 */
import type { EntityMeta, Game } from "~/types/entities";

export const gamesMeta: EntityMeta = {
    updated: "2026-11-11",
    owner: "MarxChou",
    source: "manual",
};

export const games: Game[] = [];
