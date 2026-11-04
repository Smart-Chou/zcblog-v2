/**
 * rehype-task-list-a11y —— 给 Markdown 任务列表的 checkbox 补可访问名（M2-13b）。
 *
 * GFM（remark-gfm）把 `- [ ] 文本` 渲染成：
 *   <li class="task-list-item"><input type="checkbox" disabled> 文本…</li>
 * 这个 input 既没有 <label> 也没有 aria-label，读屏只会念「复选框」而不说是哪一项，
 * axe `label` 规则判 critical（1 篇文章 × 8 个节点）。
 *
 * 这里只在 AST 上补一个 aria-label = 该列表项的文本（压空白 + 截断），
 * 不改结构、不改样式、不改 checked/disabled 状态，也不影响任何构建产物里的视觉。
 */

interface HastNode {
    type: string;
    tagName?: string;
    value?: string;
    properties?: Record<string, unknown>;
    children?: HastNode[];
}

/** 读屏念完整段长文本没有意义，取前 80 个字符足够识别「哪一项」。 */
const MAX_LABEL_LENGTH = 80;
/** 列表项没有任何文本（例如只有图片）时的兜底名。 */
const FALLBACK_LABEL = "任务列表项";

function classNames(node: HastNode): string[] {
    const raw = node.properties?.className;
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === "string") return raw.split(/\s+/).filter(Boolean);
    return [];
}

/** 收集节点下的纯文本；块级边界补空格，避免「上一段下一段」粘成一个词。 */
function textOf(node: HastNode, out: string[] = []): string[] {
    if (node.type === "text") {
        if (node.value) out.push(node.value);
        return out;
    }
    if (node.tagName === "br") {
        out.push(" ");
        return out;
    }
    for (const child of node.children ?? []) textOf(child, out);
    return out;
}

function labelOf(item: HastNode): string {
    const text = textOf(item)
        .join("")
        .replace(/[\s\u00a0]+/g, " ")
        .trim();
    if (!text) return FALLBACK_LABEL;
    return text.length > MAX_LABEL_LENGTH ? `${text.slice(0, MAX_LABEL_LENGTH - 1)}…` : text;
}

function findCheckbox(node: HastNode): HastNode | undefined {
    for (const child of node.children ?? []) {
        if (
            child.type === "element" &&
            child.tagName === "input" &&
            String(child.properties?.type) === "checkbox"
        )
            return child;
        const nested = findCheckbox(child);
        if (nested) return nested;
    }
    return undefined;
}

function walk(node: HastNode): void {
    if (
        node.type === "element" &&
        node.tagName === "li" &&
        classNames(node).includes("task-list-item")
    ) {
        const input = findCheckbox(node);
        const props = input?.properties;
        if (input && props && !props["aria-label"] && !props["aria-labelledby"]) {
            input.properties = { ...props, "aria-label": labelOf(node) };
        }
    }
    for (const child of node.children ?? []) walk(child);
}

/** Astro `markdown.processor` 的 rehype 插件（unified attacher）。 */
export function rehypeTaskListA11y() {
    return (tree: HastNode): void => walk(tree);
}
