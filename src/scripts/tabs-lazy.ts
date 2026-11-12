/**
 * tabs 渲染器的按需引导（M8-9）
 *
 * 背景：`tabs.ts` 无条件被文章模板 import，等于每篇文章首屏都白付 572B gz。
 * 实测 85 篇文章里 0 篇用到 `.tabs-container`（remark-tabs 插件的产物），
 * 这份代码在绝大多数页面上永远不会执行。
 *
 * 判据用构建期已渲染出来的 DOM 标记：只有真存在容器才去拉渲染器。
 * 与 `~/scripts/fancybox-album` 同一套纪律（见 BaseLayout），
 * 也复用 ShortcutHelp 的「轻引导 + 重模块」二分法。
 */
import { onPageReady } from "../utils/page-lifecycle";

let loaded = false;

function loadTabs(): void {
    if (loaded) return;
    if (!document.querySelector(".tabs-container")) return;
    loaded = true;
    void import("./tabs");
}

onPageReady(loadTabs);
