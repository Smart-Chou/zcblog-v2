/**
 * OG 图片生成集成：把 `packages/og-image` 的 route factory 挂到 `/og/[...og].png`。
 *
 * 本文件被 `astro.config.mjs` 在「配置加载」阶段 import，因此这里**不能**出现
 * `astro:content` 一类只能在 Vite 图里解析的模块（`~/utils/article-stats` 会拉
 * `astro:content`，配置阶段直接报 "Cannot find module 'astro:content'"）。
 * 所以「组装 options」放在路由壳 `og-image-route.ts` —— 那才是渲染期的主题侧。
 */
import type { AstroIntegration } from "astro";

export default function ogImageIntegration(): AstroIntegration {
    return {
        name: "og-image",
        hooks: {
            "astro:config:setup": ({ injectRoute }) => {
                injectRoute({
                    pattern: "/og/[...og].png",
                    entrypoint: "./src/integrations/og-image-route.ts",
                });
            },
        },
    };
}
