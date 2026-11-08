/**
 * 目录树（M6-3）
 *
 * markdown 的 `headings` 是一维序列，这里折成「h2 一级 + h3 挂在上一节下」的两级树。
 * 为什么要单独一个模块：桌面目录卡（`Toc.astro`）和移动端「目录 N」触发按钮
 * （`MarkdownLayout.astro`）必须显示**同一个数**，否则两处各算一份，数字一对不上
 * 就会被当成内容错误（M6-3 复核时已踩到：条款 29 vs 目录卡 11）。
 */

export interface TocHeading {
    depth: number;
    slug: string;
    text: string;
}

export interface TocNode {
    slug: string;
    text: string;
    children: TocNode[];
}

/** 只认 h2 / h3；h3 归到最近的 h2 下，没有前置 h2 时自己当一级 */
export function tocNodes(headings: TocHeading[] = []): TocNode[] {
    const nodes: TocNode[] = [];
    for (const h of headings) {
        if (h.depth !== 2 && h.depth !== 3) continue;
        if (h.depth === 3 && nodes.length > 0) {
            nodes[nodes.length - 1].children.push({ slug: h.slug, text: h.text, children: [] });
        } else {
            nodes.push({ slug: h.slug, text: h.text, children: [] });
        }
    }
    return nodes;
}

/** 目录卡与移动触发按钮共用的节数（= 一级条目数） */
export function tocCount(headings: TocHeading[] = []): number {
    return tocNodes(headings).length;
}
