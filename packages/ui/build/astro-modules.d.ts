/**
 * 构建期用的 `.astro` 模块声明。
 *
 * 本包的可见 API 是 `.astro` 组件（Badge / Button），它们的 props 类型写在各自文件的
 * frontmatter 里，只有 Astro 的语言服务能读。这个 `.d.ts` 只服务于 `index.ts` 的桶文件编译：
 * 让 `tsc` 能把 `export { default as Badge } from "./Badge.astro"` 编译成 dist 里的 ESM，
 * 而不是报「找不到模块」。消费者侧的类型仍由 Astro 自己生成的 `*.astro` 声明提供。
 *
 * 不进 `files` 白名单（只在打包时被 tsc 读取，不发布）。
 */
declare module "*.astro" {
    const component: any;
    export default component;
}
