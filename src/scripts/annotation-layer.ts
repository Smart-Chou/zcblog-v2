/**
 * M7-4b · 文章选区高亮 + 批注工具条（行为）
 *
 * 本模块由 `AnnotationLayer.astro` 的内联 bootstrap 按需 `import()`：有历史批注、
 * 或正文里第一次出现非空选区时才加载。数据层（`~/scripts/annotations.ts`）只被消费，
 * API 一个字都不改。
 *
 * 几条不可退让的约束：
 *   · **只认正文段落**（`#post-content .article-content` 里的 `<p>`）：导航、目录、
 *     分享条、评论、工具条自身的选区一律不处理；跨段选区也不处理 —— 一条批注只能
 *     落在一段里，跨段说明用户想做的事不是「高亮」。
 *   · **不改文本**：偏移用 `Range` 从段落起点量到选区端点（UTF-16 code unit，与
 *     `Selection` / `slice` 同一口径），渲染时只 `extractContents()` 后包一层
 *     `<mark>`，不 `replaceChildren`、不重排原文，段落里的链接/强调/代码块原样保留。
 *   · **零布局偏移**：`<mark>` 是行内元素，外观（底色 + 内阴影）来自
 *     `mark.annotation-mark`，不动 padding/margin/font。
 *   · **可撤销**：选区与已有批注相交时，同一个按钮变成「取消高亮」；点已经高亮的
 *     文字会把它重新选中并给出取消按钮（不直接删，避免误触）。
 */

import {
    getAnnotationStore,
    resolveSpan,
    spansOverlap,
    type AnnotationRecord,
} from "./annotations";

/** 正文容器：与 MarkdownLayout 的 `#post-content > .article-content` 对齐。 */
const BODY_SELECTOR = "#post-content .article-content";
const LAYER_SELECTOR = "[data-annotation-layer]";
const TOOLBAR_SELECTOR = "[data-annotation-toolbar]";
const ACTION_SELECTOR = '[data-annotation-action="toggle"]';
const LABEL_SELECTOR = "[data-annotation-label]";
const STATUS_SELECTOR = "[data-annotation-status]";
const MARK_SELECTOR = "mark.annotation-mark";
/** 只处理段落：标题、列表、引用的选区不进这条链路（`p` 里包含的行内标记照常工作）。 */
const BLOCK_SELECTOR = "p";

const GAP = 10;
const EDGE = 8;

interface Roots {
    root: HTMLElement;
    toolbar: HTMLElement;
    button: HTMLButtonElement;
    label: HTMLElement;
    status: HTMLElement | null;
}

/** 一次「待执行」的批注动作：从选区算出来，点按钮时才落盘。 */
interface Pending {
    block: HTMLElement;
    blockIndex: number;
    start: number;
    end: number;
    mode: "add" | "remove";
    ids: string[];
}

let pending: Pending | null = null;
/** 鼠标按在工具条上时不要因为选区塌掉就把工具条收了。 */
let holding = false;
let frame = 0;

/* ───────────────────────── DOM 定位 ───────────────────────── */

function roots(): Roots | null {
    const root = document.querySelector<HTMLElement>(LAYER_SELECTOR);
    if (!root) return null;
    const toolbar = root.querySelector<HTMLElement>(TOOLBAR_SELECTOR);
    const button = root.querySelector<HTMLButtonElement>(ACTION_SELECTOR);
    const label = root.querySelector<HTMLElement>(LABEL_SELECTOR);
    if (!toolbar || !button || !label) return null;
    return { root, toolbar, button, label, status: root.querySelector<HTMLElement>(STATUS_SELECTOR) };
}

function bodyRoot(): HTMLElement | null {
    return document.querySelector<HTMLElement>(BODY_SELECTOR);
}

function docIdOf(ui: Roots): string {
    return ui.root.dataset.annotationDoc ?? "";
}

function copy(ui: Roots, key: string): string {
    return ui.root.dataset[`annotationMsg${key}` as keyof DOMStringMap] ?? "";
}

function elementOf(node: Node | null): HTMLElement | null {
    if (!node) return null;
    return node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
}

function blocksOf(body: HTMLElement): HTMLElement[] {
    return Array.from(body.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
}

/** 段落文本内的偏移：从段落起点量到 `(node, offset)`，单位 UTF-16 code unit。 */
function offsetIn(block: HTMLElement, node: Node, offset: number): number {
    const range = document.createRange();
    range.selectNodeContents(block);
    try {
        range.setEnd(node, offset);
    } catch {
        return -1;
    }
    return range.toString().length;
}

/* ───────────────────────── 选区 → 批注 ───────────────────────── */

function currentSelection(ui: Roots): Pending | null {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

    const body = bodyRoot();
    if (!body) return null;
    const range = selection.getRangeAt(0);
    if (!body.contains(range.commonAncestorContainer)) return null;

    const block = elementOf(range.startContainer)?.closest<HTMLElement>(BLOCK_SELECTOR) ?? null;
    if (!block || !body.contains(block)) return null;
    // 跨段：数据层一条记录只落在一段里，宁可不出工具条。
    if (elementOf(range.endContainer)?.closest<HTMLElement>(BLOCK_SELECTOR) !== block) return null;

    const text = block.textContent ?? "";
    let start = offsetIn(block, range.startContainer, range.startOffset);
    let end = offsetIn(block, range.endContainer, range.endOffset);
    if (start < 0 || end < 0 || end <= start) return null;

    // 去掉选区两端的空白（整段选中时常见），坐标仍然落在原文上。
    while (start < end && /\s/u.test(text[start] ?? "")) start += 1;
    while (end > start && /\s/u.test(text[end - 1] ?? "")) end -= 1;
    if (end <= start) return null;
    if (text.slice(start, end).trim().length === 0) return null;

    const blocks = blocksOf(body);
    const blockIndex = blocks.indexOf(block);
    if (blockIndex < 0) return null;

    const hits = getAnnotationStore()
        .list(docIdOf(ui))
        .filter(
            (record) =>
                record.blockIndex === blockIndex &&
                spansOverlap(record, { blockIndex, start, end }),
        );

    return {
        block,
        blockIndex,
        start,
        end,
        mode: hits.length > 0 ? "remove" : "add",
        ids: hits.map((record) => record.id),
    };
}

/* ───────────────────────── 渲染 ───────────────────────── */

/** 把已有 `<mark>` 摊平回文本（不 merge 相邻元素，`normalize()` 负责收拢文本节点）。 */
function unwrap(block: HTMLElement): void {
    const marks = Array.from(block.querySelectorAll(MARK_SELECTOR));
    if (marks.length === 0) return;
    for (const mark of marks) mark.replaceWith(...Array.from(mark.childNodes));
    block.normalize();
}

/**
 * 在一段里把 `[start, end)` 包成 `<mark>`。
 *
 * 用 `Range.extractContents()` 而不是「把段落拆成纯文本 + 重排」：段落里的
 * `<a>` / `<strong>` / `<code>` 必须原样留在 `<mark>` 里，正文的结构不能因为高亮
 * 被抹平。区间跨元素时 `extractContents()` 会自动切分边界节点。
 */
function wrap(
    block: HTMLElement,
    record: AnnotationRecord,
    start: number,
    end: number,
    mode: string,
): boolean {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let position = 0;
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const length = node.data.length;
        if (!startNode && start < position + length) {
            startNode = node;
            startOffset = start - position;
        }
        if (end <= position + length) {
            endNode = node;
            endOffset = end - position;
            break;
        }
        position += length;
    }

    if (!startNode || !endNode) return false;

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const mark = document.createElement("mark");
    mark.className = "annotation-mark";
    mark.dataset.annotationId = record.id;
    mark.dataset.annotationMode = mode;
    mark.append(range.extractContents());
    range.insertNode(mark);
    return true;
}

function render(ui: Roots): void {
    const body = bodyRoot();
    if (!body) return;

    const records = getAnnotationStore().list(docIdOf(ui));
    const blocks = blocksOf(body);
    for (const block of blocks) unwrap(block);

    const byBlock = new Map<number, AnnotationRecord[]>();
    for (const record of records) {
        const list = byBlock.get(record.blockIndex) ?? [];
        list.push(record);
        byBlock.set(record.blockIndex, list);
    }

    let painted = 0;
    for (const [index, list] of byBlock) {
        const block = blocks[index];
        if (!block) continue;
        const text = block.textContent ?? "";
        list.sort((a, b) => a.start - b.start);
        let cursor = 0;
        for (const record of list) {
            // 偏移失效时靠唯一引文命中重定位；命中多处/零处就跳过这一条，
            // 宁可少画一条，也不把高亮画到别的句子上。
            const span = resolveSpan(text, record);
            if (!span || span.start < cursor) continue;
            if (wrap(block, record, span.start, span.end, span.mode)) {
                cursor = span.end;
                painted += 1;
            }
        }
    }

    ui.root.dataset.annotationCount = String(records.length);
    ui.root.dataset.annotationPainted = String(painted);
}

/* ───────────────────────── 工具条 ───────────────────────── */

function announce(ui: Roots, text: string): void {
    if (ui.status) ui.status.textContent = text;
}

function hide(ui: Roots): void {
    ui.toolbar.hidden = true;
    pending = null;
}

/**
 * 把工具条摆到选区附近：默认贴第一行**上方**、左缘对齐；上方放不下时翻到选区
 * 下方。金句卡工具条（默认下方、右缘对齐）同时可见时再错开一格，两个工具条
 * 不会叠在一起。
 */
function place(ui: Roots, range: Range): void {
    const rects = Array.from(range.getClientRects()).filter(
        (rect) => rect.width > 1 && rect.height > 1,
    );
    if (rects.length === 0) {
        hide(ui);
        return;
    }

    ui.toolbar.hidden = false;
    const first = rects[0] as DOMRect;
    const last = rects[rects.length - 1] as DOMRect;
    const width = ui.toolbar.offsetWidth;
    const height = ui.toolbar.offsetHeight;

    let top = first.top - height - GAP;
    if (top < EDGE) top = last.bottom + GAP;

    const left = Math.min(
        Math.max(EDGE, first.left),
        Math.max(EDGE, window.innerWidth - width - EDGE),
    );

    const quote = document.querySelector<HTMLElement>("[data-quote-toolbar]");
    if (quote && !quote.hidden) {
        const box = quote.getBoundingClientRect();
        const overlaps =
            left < box.right + 4 &&
            left + width > box.left - 4 &&
            top < box.bottom + 4 &&
            top + height > box.top - 4;
        if (overlaps) top = box.top - height - GAP;
    }

    top = Math.min(Math.max(EDGE, top), Math.max(EDGE, window.innerHeight - height - EDGE));

    ui.toolbar.style.top = `${Math.round(top)}px`;
    ui.toolbar.style.left = `${Math.round(left)}px`;
}

function update(ui: Roots): void {
    const info = currentSelection(ui);
    if (!info) {
        hide(ui);
        return;
    }
    const range = document.getSelection()?.getRangeAt(0);
    if (!range) {
        hide(ui);
        return;
    }

    pending = info;
    ui.button.dataset.annotationMode = info.mode;
    ui.label.textContent =
        info.mode === "remove"
            ? (ui.root.dataset.annotationLabelRemove ?? "")
            : (ui.root.dataset.annotationLabelAdd ?? "");
    place(ui, range);
}

/* ───────────────────────── 动作 ───────────────────────── */

function apply(ui: Roots): void {
    if (!pending) return;
    const store = getAnnotationStore();
    const docId = docIdOf(ui);

    if (pending.mode === "add") {
        const text = pending.block.textContent ?? "";
        const quote = text.slice(pending.start, pending.end);
        const result = store.add({
            docId,
            blockIndex: pending.blockIndex,
            start: pending.start,
            end: pending.end,
            quote,
            text,
        });
        announce(
            ui,
            result.ok
                ? (result.duplicate ? copy(ui, "Duplicate") : copy(ui, "Added"))
                : copy(ui, "Rejected"),
        );
    } else {
        const removed = pending.ids.filter((id) => store.remove(id)).length;
        announce(ui, removed > 0 ? copy(ui, "Removed") : copy(ui, "Idle"));
    }

    document.getSelection()?.removeAllRanges();
    hide(ui);
    render(ui);
}

/** 点一条已经高亮的文字：把它重新选中，工具条自动变成「取消高亮」（不直接删）。 */
function selectMark(mark: HTMLElement): void {
    const range = document.createRange();
    range.selectNodeContents(mark);
    const selection = document.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
    // 程序化选区在部分浏览器/无头环境里不会立刻派发 selectionchange；这里补一次，
    // 用户视角没有差别（工具条本来就该出现在这次选中之后）。
    document.dispatchEvent(new Event("selectionchange"));
}

/* ───────────────────────── 事件 ───────────────────────── */

function onSelectionChange(): void {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
        const ui = roots();
        if (!ui) return;
        if (holding) return;
        update(ui);
    });
}

function onPointerDown(event: Event): void {
    const ui = roots();
    if (!ui || ui.toolbar.hidden) return;
    const target = event.target as Node | null;
    if (!target) return;
    holding = ui.toolbar.contains(target);
    if (!holding) hide(ui);
}

function onPointerUp(): void {
    holding = false;
}

function onClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (target.closest(ACTION_SELECTOR)) {
        event.preventDefault();
        const ui = roots();
        if (ui) apply(ui);
        return;
    }

    const mark = target.closest<HTMLElement>(MARK_SELECTOR);
    if (!mark) return;
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed) return; // 正在拖选，别抢
    selectMark(mark);
}

function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    const ui = roots();
    if (ui) hide(ui);
}

function onViewportChange(): void {
    const ui = roots();
    if (ui) hide(ui);
}

export function initAnnotationLayer(): void {
    const ui = roots();
    if (!ui) return;

    const guarded = window as unknown as { __annotationLayerBound?: boolean };
    if (!guarded.__annotationLayerBound) {
        guarded.__annotationLayerBound = true;
        document.addEventListener("selectionchange", onSelectionChange, { passive: true });
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("pointerup", onPointerUp, true);
        document.addEventListener("click", onClick);
        document.addEventListener("keydown", onKeyDown);
        window.addEventListener("scroll", onViewportChange, { passive: true, capture: true });
        window.addEventListener("resize", onViewportChange, { passive: true });
        document.addEventListener("astro:page-load", onPageLoad);
    }

    render(ui);
    // 模块通常是在「已经存在的选区」之后才被 import 进来的，那次 selectionchange
    // 已经过去了 —— 初始化时补算一次，否则第一次选中看不到工具条。
    onSelectionChange();
}

function onPageLoad(): void {
    const ui = roots();
    if (!ui) return;
    render(ui);
    onSelectionChange();
}
