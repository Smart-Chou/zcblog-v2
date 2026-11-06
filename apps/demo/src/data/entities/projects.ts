/**
 * 示例站项目实体（overlay O）
 *
 * 真实站点把自己的项目数据放在这里；主题的 `src/data/entities/projects.ts`
 * 是作者数据，覆盖它即可去掉作者身份，不需要改主题代码。
 */
import type { EntityMeta, Project } from "~/types/entities";

export const projectsMeta: EntityMeta = {
    updated: "2026-11-06",
    owner: "Dogeared Demo",
    source: "manual",
};

export const projects: Project[] = [
    {
        id: "dogeared-demo",
        title: { zh: "Dogeared 示例站", en: "Dogeared demo site" },
        summary: {
            zh: "由主题 + apps/demo overlay 装配出来的最小站点：配置、内容、项目数据都在 overlay，升级主题时不会被覆盖。",
            en: "A minimal site assembled from the Dogeared theme plus the apps/demo overlay. Config, content and project data live in the overlay and survive theme upgrades.",
        },
        status: "active",
        started: "2026-11",
        ended: null,
        role: { zh: "示例消费方", en: "Example consumer" },
        stack: ["Astro", "TypeScript", "Dogeared"],
        highlights: [
            {
                zh: "一条命令完成 theme + overlay 装配与构建",
                en: "One command assembles and builds theme + overlay",
            },
            {
                zh: "overlay 文件在升级时保持不动",
                en: "Overlay files are untouched by theme upgrades",
            },
        ],
        links: [{ label: "demo.example.com", href: "https://demo.example.com" }],
        updated: "2026-11-06",
    },
    {
        id: "dogeared-packages",
        title: { zh: "Dogeared npm 包", en: "Dogeared npm packages" },
        summary: {
            zh: "已发布的 tokens 与 og-image 包：消费者可以只装包，不 fork 主题仓库。",
            en: "Published tokens and og-image packages: consumers can install them without forking the theme repository.",
        },
        status: "active",
        started: "2026-11",
        ended: null,
        role: { zh: "包消费者", en: "Package consumer" },
        stack: ["npm", "CSS", "Satori", "Sharp"],
        highlights: [
            {
                zh: "tokens 提供 CSS 变量与 tokens.json",
                en: "tokens ships CSS variables and tokens.json",
            },
            {
                zh: "og-image 提供 createOgImageRoute",
                en: "og-image exposes createOgImageRoute",
            },
        ],
        links: [
            {
                label: "@marxchou/dogeared-tokens",
                href: "https://www.npmjs.com/package/@marxchou/dogeared-tokens",
            },
        ],
        updated: "2026-11-06",
    },
];
