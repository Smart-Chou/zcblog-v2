/**
 * 初始化文章内容图片的 Fancybox 支持。
 *
 * M2-5：灯箱也要挂上 overlay 基座的打开态标记 `[data-overlay="lightbox"]`。
 * 基座是**按需加载**的（关闭态 0 请求 / 0 初始化），所以这里用一个捕获期点击监听做热身：
 * 用户点图片时先 `import()` 基座，Fancybox 建好 <dialog> 后由 watchLightbox() 打标
 * （watchLightbox 自带「已打开则补标」的兜底，避免竞态）。
 */

import { initArticleFancybox } from "~/utils/fancybox";

initArticleFancybox();

document.addEventListener(
    "click",
    (event) => {
        const target = event.target as HTMLElement | null;
        if (!target?.closest("[data-fancybox]")) return;
        void import("./overlay").then((mod) => mod.watchLightbox());
    },
    true,
);
