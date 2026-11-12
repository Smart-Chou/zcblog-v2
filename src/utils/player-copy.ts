import { getLocale, t } from "~/utils/i18n";

/**
 * SitePlayer 的 UI 文案（服务端取词，M8-4 / DESIGN §5.7.1 禁止第 11 条）。
 *
 * 为什么要有这一层：
 *  1. 播放器的静态文案必须来自 i18n 词典，不能写死在组件里（G1）；解释见
 *     `blog2.0/docs/decision-log.md` 的 D-0172。
 *  2. **不能在客户端 chunk 里 import 词典**（`src/scripts/site-player.ts` 是按需
 *     import 的懒加载块，塞 10 份词典会顶穿 §7 登记的 4KB gz 预算），所以词在
 *     服务端取好，以 13+1 个键的 JSON 形式写到页面的挂载标记上，脚本读。
 *  3. 与 `music-player.ts` 的 `data-copy-*` 是同一套思路（页面给文案、模块与语种
 *     无关），只是这里整份 14 键一次给完，省掉 14 个属性。
 *
 * 键集合与 `docs/26-m8-4-player-spec.md` §7 第 9 项一致；`seek` 目前没有消费方
 * （直播流不渲染进度条），先留着给未来的点播源。
 *
 * 只在服务端（构建期）执行：被 `SitePlayerCopy.astro` 的 frontmatter 引用，
 * 不进任何客户端 bundle。
 */
export const playerCopyKeys = [
    "player",
    "play",
    "pause",
    "seek",
    "volume",
    "mute",
    "unmute",
    "close",
    "collapse",
    "expand",
    "error",
    "playing",
    "paused",
    "ended",
] as const;

export type PlayerCopy = Record<(typeof playerCopyKeys)[number], string>;

/** 按 locale 取 14 个键；未知/缺译由 `t()` 的回退链落到 zh（与站点其余文案一致）。 */
export function playerCopy(locale: string | undefined): PlayerCopy {
    const resolved = getLocale(locale);
    const entries = playerCopyKeys.map((key) => [key, t(resolved, `player.${key}`)] as const);
    return Object.fromEntries(entries) as PlayerCopy;
}
