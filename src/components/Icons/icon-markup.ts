/**
 * 图标输出（sprite 引用 + 内联回退）
 *
 * 每个 UI 图标实例输出一段 `<svg viewBox><use href="/icons.svg?v=<hash>#id"></use></svg>`，
 * 图形本体只在 `public/icons.svg` 里存一份（构建期由 scripts/generate-icons.js 生成），
 * 因此每页 HTML 从「每个图标 300~1200 字节」降到「每个实例约 110 字节」。
 *
 * 三个必须保留的语义：
 *   - `class` / `style` / `width` / `height` 透传到外层 `<svg>`（与原 DynamicIcon 一致）
 *   - 颜色：sprite 里图形用的 `currentColor` 由 `<use>` 继承宿主 `color`，换色逻辑不变
 *   - 像素：外层 `<svg viewBox>` 复刻原来的坐标系 → 与内联渲染逐像素一致（见 generate-icons.js 注释）
 *
 * 少数图标自身带 `url(#id)` / `href="#id"` 内部引用（渐变、自引 <use>），跨文档 `<use>`
 * 时这些引用在宿主文档里解析不到，这类图标回退成内联 SVG（清单见 ICON_INLINE_ONLY）。
 */

import { SPRITE_URL, SPRITE_VERSION, ICON_VIEWBOXES, ICON_INLINE_ONLY } from "./sprite";
import { getIconSvg } from "./index";

/** sprite 文档地址（带内容哈希查询串，配合 `_headers` 的 immutable 缓存） */
export const spriteDocUrl = `${SPRITE_URL}?v=${SPRITE_VERSION}`;

/** 图标名 → sprite 里的元素 id（`tabler:rss` → `tabler-rss`） */
export function spriteId(iconName: string): string {
    return iconName.replace(/[:/]/g, "-");
}

/** 图标名 → `<use>` 的完整 href（含 sprite 版本） */
export function spriteHref(iconName: string): string {
    return `${spriteDocUrl}#${spriteId(iconName)}`;
}

/** 这个图标名是否在闭集里（决定渲染图标还是 `?` 兜底） */
export function hasIcon(iconName: string): boolean {
    return Object.prototype.hasOwnProperty.call(ICON_VIEWBOXES, iconName);
}

export interface IconMarkupOptions {
    class?: string;
    width?: number | string;
    height?: number | string;
    style?: string;
}

/**
 * 生成一个图标实例的 HTML。
 *
 * @returns 图标 HTML；图标名不在闭集里时返回 ""（调用方渲染 `?` 兜底）
 */
export function iconMarkup(iconName: string, options: IconMarkupOptions = {}): string {
    const viewBox = ICON_VIEWBOXES[iconName];
    if (!viewBox) return "";

    // 内联回退：sprite 无法表达「图标内部自引用」，保持原样输出
    if (ICON_INLINE_ONLY.includes(iconName)) {
        return injectAttrs(getIconSvg(iconName), options);
    }

    const attrs = [
        `width="${options.width ?? "1em"}"`,
        `height="${options.height ?? "1em"}"`,
        `viewBox="${viewBox}"`,
    ];
    if (options.class) attrs.push(`class="${options.class}"`);
    if (options.style) attrs.push(`style="${options.style}"`);

    return `<svg ${attrs.join(" ")}><use href="${spriteHref(iconName)}"></use></svg>`;
}

/** 内联回退路径用：把 class/width/height/style 注入到原 SVG 的根元素 */
function injectAttrs(svg: string, options: IconMarkupOptions): string {
    if (!svg) return "";
    const additions: string[] = [];
    if (options.class) additions.push(`class="${options.class}"`);
    if (options.width) additions.push(`width="${options.width}"`);
    if (options.height) additions.push(`height="${options.height}"`);
    if (options.style) additions.push(`style="${options.style}"`);
    if (additions.length === 0) return svg;

    return svg.replace(/<svg([^>]*)>/, (_full: string, existing: string) => {
        let clean = existing;
        if (options.width) clean = clean.replace(/\s+width="[^"]*"/g, "");
        if (options.height) clean = clean.replace(/\s+height="[^"]*"/g, "");
        return `<svg${clean} ${additions.join(" ")}>`;
    });
}
