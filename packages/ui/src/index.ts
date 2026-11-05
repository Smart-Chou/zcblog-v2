/**
 * zcblog UI 包入口（包身份串只出现在 package.json 的 name 里，B2 口径）。
 *
 * M3 只装两个零依赖原语（21-m3-plan.md §3.2）：Badge（M3-3a）、Button（M3-3b）。
 * 进包判据：不 import `~/config` / `~/data` / `~/assets` / `./Icons`；包内 `grep -c "~/"` = 0。
 */
export { default as Badge } from "./Badge.astro";
export { default as Button } from "./Button.astro";
