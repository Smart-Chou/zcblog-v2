/**
 * 包 `dogeared-og-image` 的公开入口。
 *
 * 唯一的运行期出口是 `createOgImageRoute(options)`（§3.3 冻结）。
 *
 * 相对导入带 `.js` 扩展名（ESM 规范）：`tsc` 产出 dist 后，裸 Node 能直接解析产物；
 * 源码侧 bundler（Vite/Astro/rolldown）会把 `.js` 映射回同名的 `.ts`。
 */
export { createOgImageRoute } from "./route.js";
export type {
    OgImageFonts,
    OgImageOptions,
    OgImagePost,
    OgImageSite,
    OgImageTheme,
} from "./types.js";
