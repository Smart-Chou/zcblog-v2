/**
 * M7-3d-2 · 文章选中文字 → 金句卡弹层（行为）
 *
 * 本模块由 `QuoteSelection.astro` 的内联 bootstrap 在**正文里第一次出现非空选区**
 * 之后才 `import()`；渲染器 `~/scripts/quote-card` 再晚一步 —— 只有点了
 * 「做成金句卡」才加载。因此：
 *   · 关闭态：0 个 `[data-overlay]`、0 个 quote-card 请求；
 *   · 选中态：只多一个本模块 + overlay 基座（~2KB gz）；
 *   · 打开态：才拉渲染器。
 *
 * 只在正文里工作：选区必须完整落在 `#post-content .article-content` 内，
 * 导航 / 目录 / 评论 / 分享条 / 弹层自身的选区一律忽略。
 *
 * 弹层开合交给 `overlay.ts`（[data-overlay="quote"] 标记、Tab 循环、遮罩锁滚、
 * Esc、焦点归还）；这里只做「选区 → 文案 → canvas → 下载」这条业务线，
 * 以及关闭后把焦点落回选区所在段落（比工具栏按钮更接近用户原来的位置）。
 */

import { open as openOverlay } from "./overlay";

/** 正文容器：与 MarkdownLayout 的 `#post-content > .article-content` 对齐。 */
const BODY_SELECTOR = "#post-content .article-content";

/** 选区所在块级元素：关闭弹层后把焦点还给它（tabindex=-1，不进 Tab 序列）。 */
const BLOCK_SELECTOR = "p, li, h2, h3, h4, h5, blockquote, pre, td, figcaption";

interface SelectionInfo {
    text: string;
    range: Range;
    block: HTMLElement;
}

interface Roots {
    root: HTMLElement;
    toolbar: HTMLElement;
    trigger: HTMLButtonElement;
    dialog: HTMLElement;
    canvas: HTMLCanvasElement;
    status: HTMLElement;
    download: HTMLAnchorElement;
}

let objectUrl: string | null = null;

function roots(): Roots | null {
    const root = document.querySelector<HTMLElement>("[data-quote-selection]");
    if (!root) return null;
    const toolbar = root.querySelector<HTMLElement>("[data-quote-toolbar]");
    const trigger = root.querySelector<HTMLButtonElement>('[data-quote-action="create"]');
    const dialog = root.querySelector<HTMLElement>("[data-quote-dialog]");
    const canvas = root.querySelector<HTMLCanvasElement>("[data-quote-canvas]");
    const status = root.querySelector<HTMLElement>("[data-quote-status]");
    const download = root.querySelector<HTMLAnchorElement>("[data-quote-download]");
    if (!toolbar || !trigger || !dialog || !canvas || !status || !download) return null;
    return { root, toolbar, trigger, dialog, canvas, status, download };
}

/** 当前选区；不合法（空 / 不在正文）一律返回 null。 */
function currentSelection(): SelectionInfo | null {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

    const range = selection.getRangeAt(0);
    const body = document.querySelector(BODY_SELECTOR);
    if (!body) return null;
    if (!body.contains(range.commonAncestorContainer)) return null;

    const text = selection
        .toString()
        .replace(/[\s\u00a0]+/gu, " ")
        .trim();
    if (!text) return null;

    const start =
        range.startContainer instanceof HTMLElement
            ? range.startContainer
            : range.startContainer.parentElement;
    const block =
        start?.closest<HTMLElement>(BLOCK_SELECTOR) ?? (body instanceof HTMLElement ? body : null);
    if (!block) return null;

    return { text, range, block };
}

function hideToolbar(ui: Roots): void {
    ui.toolbar.hidden = true;
}

/**
 * 把工具条摆到选区附近。
 *
 * 默认贴最后一行的下方（右缘对齐），视口下方放不下时才翻到第一行上方；
 * 左右各留 8px，窄屏也不会被切掉。
 */
function showToolbar(ui: Roots, range: Range): void {
    const rects = Array.from(range.getClientRects()).filter(
        (rect) => rect.width > 1 && rect.height > 1,
    );
    if (rects.length === 0) {
        hideToolbar(ui);
        return;
    }

    ui.toolbar.hidden = false;
    const first = rects[0] as DOMRect;
    const last = rects[rects.length - 1] as DOMRect;
    const width = ui.toolbar.offsetWidth;
    const height = ui.toolbar.offsetHeight;
    const edge = 8;

    let top = last.bottom + 10;
    if (top + height > window.innerHeight - edge) top = first.top - height - 10;
    if (top < edge) top = Math.max(edge, last.bottom + 10 - height);

    let left = last.right - width;
    left = Math.min(Math.max(edge, left), Math.max(edge, window.innerWidth - width - edge));

    ui.toolbar.style.top = `${Math.round(top)}px`;
    ui.toolbar.style.left = `${Math.round(left)}px`;
}

function announce(ui: Roots, text: string, tone: "ok" | "error" = "ok"): void {
    ui.status.textContent = text;
    ui.status.dataset.tone = tone;
}

function resetDownload(ui: Roots): void {
    if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
    }
    ui.download.removeAttribute("href");
    ui.download.removeAttribute("download");
}

async function paint(ui: Roots, quote: string): Promise<void> {
    const title = ui.root.dataset.quoteTitle ?? "";
    const author = ui.root.dataset.quoteAuthor ?? "";
    const downloadName = ui.root.dataset.quoteDownloadName ?? "quote-card-1080x1440.png";

    ui.dialog.dataset.quoteState = "busy";
    announce(ui, ui.root.dataset.quotePending ?? "");

    try {
        const card = await import("~/scripts/quote-card");
        await document.fonts.ready;

        const metrics = card.renderQuoteCard(ui.canvas, { quote, title, author });
        ui.canvas.dataset.quoteMetrics = JSON.stringify(metrics);
        ui.canvas.dataset.quoteRender = String(Number(ui.canvas.dataset.quoteRender ?? "0") + 1);
        ui.canvas.setAttribute(
            "aria-label",
            `金句卡：${quote} —— 出自《${title}》${author ? `，${author}` : ""}。` +
                `1080×1440，引文 ${metrics.quote.lines.length} 行。`,
        );

        const blob = await card.quoteCardBlob(ui.canvas);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(blob);
        ui.download.href = objectUrl;
        ui.download.setAttribute("download", downloadName);

        ui.dialog.dataset.quoteState = "ready";
        announce(
            ui,
            `已生成 1080 × 1440 · 引文 ${metrics.quote.lines.length} 行 / ` +
                `${metrics.quote.fontSize}px · ${(blob.size / 1024).toFixed(0)} KB PNG`,
        );
    } catch (error) {
        ui.dialog.dataset.quoteState = "error";
        announce(ui, `生成失败：${error instanceof Error ? error.message : "未知错误"}`, "error");
    }
}

/** 打开弹层：先清选区（工具条随之收起），再把焦点交给弹层。 */
function openDialog(ui: Roots, info: SelectionInfo): void {
    hideToolbar(ui);
    document.getSelection()?.removeAllRanges();

    resetDownload(ui);
    ui.dialog.hidden = false;
    ui.dialog.removeAttribute("aria-hidden");
    ui.dialog.dataset.quoteState = "busy";

    // 焦点归还目标：选区所在段落（tabindex=-1 不进 Tab 序列，但可被脚本聚焦）
    info.block.tabIndex = -1;
    openOverlay(ui.dialog, "quote", {
        returnTo: info.block,
        focus: ui.dialog.querySelector<HTMLElement>("[data-ovl-close]"),
        label: ui.root.querySelector<HTMLElement>("#quote-dialog-title")?.textContent?.trim(),
    });

    void paint(ui, info.text);
}

function closeDialog(ui: Roots): void {
    ui.dialog.hidden = true;
    ui.dialog.setAttribute("aria-hidden", "true");
    ui.dialog.dataset.quoteState = "idle";
    resetDownload(ui);
    announce(ui, ui.root.dataset.quotePending ?? "");
    document.getSelection()?.removeAllRanges();
    hideToolbar(ui);
}

/* ───────────────────────── 事件 ───────────────────────── */

let frame = 0;

/** 弹层关闭广播（Esc / 遮罩 / 关闭键）→ 本模块收尾。View Transition 换 DOM 后要重绑。 */
function bindClose(): void {
    const ui = roots();
    if (!ui || ui.dialog.dataset.quoteCloseBound === "1") return;
    ui.dialog.dataset.quoteCloseBound = "1";
    ui.dialog.addEventListener("ovl:close", () => {
        const current = roots();
        if (current) closeDialog(current);
    });
}

function onSelectionChange(): void {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
        const ui = roots();
        if (!ui) return;
        bindClose();
        if (!ui.dialog.hidden) return; // 弹层开着时不管页面选区
        const info = currentSelection();
        if (info) showToolbar(ui, info.range);
        else hideToolbar(ui);
    });
}

function onPointerDown(event: Event): void {
    const ui = roots();
    if (!ui || ui.toolbar.hidden) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (ui.toolbar.contains(target) || ui.dialog.contains(target)) return;
    hideToolbar(ui);
}

function onViewportChange(): void {
    const ui = roots();
    if (ui) hideToolbar(ui);
}

function onClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const create = target.closest<HTMLElement>('[data-quote-action="create"]');
    if (!create) return;
    event.preventDefault();

    const ui = roots();
    if (!ui) return;
    const info = currentSelection();
    if (!info) {
        hideToolbar(ui);
        return;
    }
    openDialog(ui, info);
}

export function initQuoteSelection(): void {
    const guarded = window as unknown as { __quoteSelectionBound?: boolean };
    if (!roots()) return;

    if (guarded.__quoteSelectionBound) {
        // 事件已在 document 上，只补一次「新 DOM 的绑定与当前选区」
        bindClose();
        onSelectionChange();
        return;
    }
    guarded.__quoteSelectionBound = true;
    bindClose();

    document.addEventListener("selectionchange", onSelectionChange, { passive: true });
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        const current = roots();
        if (current) hideToolbar(current);
    });
    window.addEventListener("scroll", onViewportChange, { passive: true, capture: true });
    window.addEventListener("resize", onViewportChange, { passive: true });
    document.addEventListener("astro:page-load", onSelectionChange);

    onSelectionChange();
}
