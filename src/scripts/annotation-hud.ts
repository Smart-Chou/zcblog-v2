/**
 * M7-4c · 批注 HUD（列表 / 跳转 / 删除）行为
 *
 * 由 `AnnotationHud.astro` 的内联 bootstrap 按需 `import()`：无批注时永远不加载。
 * 数据层（`~/scripts/annotations.ts`）只被消费，API 一个字都不改；列表只是
 * `store.list(docId)` 的一层呈现。
 *
 * 三条约束：
 *   · **删除必须「列表 + 高亮」同步消失**：先 `store.remove(id)`，再在 DOM 里把
 *     对应的 `<mark>` 摊平回文本并把 `[data-annotation-layer]` 的计数属性同步好
 *     —— 不依赖注释层重新 render（它没暴露，也不能改）。
 *   · **跳转不猜位置**：优先找 `mark[data-annotation-id]`；正文改过导致那条高亮
 *     没画出来时退回到段落（或只播报），绝不把高亮标到别的句子上。
 *   · **窄屏抽屉是可访问的**：遮罩、滚动锁、Tab 循环、Esc/关闭键/点遮罩、关闭后
 *     焦点回到入口（入口已隐藏时退回正文标题）。
 */

import { getAnnotationStore, type AnnotationRecord } from "./annotations";
import { lockScroll, unlockScroll } from "./scroll-lock";

const HUD_SELECTOR = "[data-annotation-hud]";
const LAYER_SELECTOR = "[data-annotation-layer]";
const TRIGGER_SELECTOR = "[data-annotation-hud-trigger]";
const BADGE_SELECTOR = "[data-annotation-hud-count]";
const PANEL_SELECTOR = "[data-annotation-hud-panel]";
const PANEL_COUNT_SELECTOR = "[data-annotation-hud-panel-count]";
const LIST_SELECTOR = "[data-annotation-hud-list]";
const EMPTY_SELECTOR = "[data-annotation-hud-empty]";
const CLOSE_SELECTOR = "[data-annotation-hud-close]";
const STATUS_SELECTOR = "[data-annotation-hud-status]";
const BODY_SELECTOR = "#post-content .article-content";
const MARK_SELECTOR = "mark.annotation-mark";
const FOCUS_CLASS = "is-annotation-focus";
const FOCUS_MS = 1600;
const DRAWER_QUERY = "(max-width: 1099px)";
const FOCUSABLE =
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface Hud {
    root: HTMLElement;
    trigger: HTMLButtonElement;
    badge: HTMLElement;
    sr: HTMLElement | null;
    panel: HTMLElement;
    panelCount: HTMLElement;
    list: HTMLElement;
    empty: HTMLElement;
    status: HTMLElement | null;
}

let hud: Hud | null = null;
let layerObserver: MutationObserver | null = null;
let observedLayer: HTMLElement | null = null;
let restoreTo: HTMLElement | null = null;
let open = false;
let locked = false;
let emphasisTimer = 0;

/* ───────────────────────── DOM ───────────────────────── */

function resolve(): Hud | null {
    const root = document.querySelector<HTMLElement>(HUD_SELECTOR);
    if (!root) return null;
    const trigger = root.querySelector<HTMLButtonElement>(TRIGGER_SELECTOR);
    const badge = root.querySelector<HTMLElement>(BADGE_SELECTOR);
    const panel = root.querySelector<HTMLElement>(PANEL_SELECTOR);
    const panelCount = root.querySelector<HTMLElement>(PANEL_COUNT_SELECTOR);
    const list = root.querySelector<HTMLElement>(LIST_SELECTOR);
    const empty = root.querySelector<HTMLElement>(EMPTY_SELECTOR);
    if (!trigger || !badge || !panel || !panelCount || !list || !empty) return null;
    return {
        root,
        trigger,
        badge,
        sr: root.querySelector<HTMLElement>("[data-annotation-hud-sr]"),
        panel,
        panelCount,
        list,
        empty,
        status: root.querySelector<HTMLElement>(STATUS_SELECTOR),
    };
}

function label(ui: Hud): string {
    return ui.root.dataset.annotationHudLabel ?? "批注";
}

function copy(ui: Hud, key: string): string {
    return ui.root.dataset[`annotationHud${key}` as keyof DOMStringMap] ?? "";
}

function docIdOf(ui: Hud): string {
    return ui.root.dataset.annotationHudDoc ?? "";
}

function drawer(): boolean {
    return typeof window.matchMedia === "function" && window.matchMedia(DRAWER_QUERY).matches;
}

function bodyRoot(): HTMLElement | null {
    return document.querySelector<HTMLElement>(BODY_SELECTOR);
}

function blockAt(index: number): HTMLElement | null {
    const body = bodyRoot();
    if (!body) return null;
    return body.querySelectorAll<HTMLElement>("p")[index] ?? null;
}

function markOf(id: string): HTMLElement | null {
    const all = document.querySelectorAll<HTMLElement>(MARK_SELECTOR);
    for (const mark of all) {
        if (mark.dataset.annotationId === id) return mark;
    }
    return null;
}

function focusables(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0,
    );
}

function announce(ui: Hud, text: string): void {
    if (ui.status) ui.status.textContent = text;
}

/* ───────────────────────── 列表 ───────────────────────── */

function dateFormat(): Intl.DateTimeFormat {
    const locale = document.documentElement.lang || "zh-CN";
    try {
        return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
    } catch {
        return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });
    }
}

const ICON_TRASH = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-8 0l.8 12.1A1.9 1.9 0 0 0 9.7 21h4.6a1.9 1.9 0 0 0 1.9-1.9L17 7M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

function item(ui: Hud, record: AnnotationRecord, formatter: Intl.DateTimeFormat): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "annotation-hud__item";
    li.dataset.annotationHudItem = record.id;

    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "annotation-hud__jump";
    jump.dataset.annotationHudJump = record.id;

    const quote = document.createElement("span");
    quote.className = "annotation-hud__quote";
    quote.textContent = record.quote;
    quote.title = record.quote;

    const time = document.createElement("time");
    time.className = "annotation-hud__time";
    const when = new Date(record.createdAt);
    time.dateTime = Number.isNaN(when.getTime()) ? "" : when.toISOString();
    time.textContent = Number.isNaN(when.getTime()) ? "" : formatter.format(when);

    jump.append(quote, time);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "annotation-hud__delete";
    remove.dataset.annotationHudDelete = record.id;
    remove.setAttribute(
        "aria-label",
        `${copy(ui, "Remove")}：${record.quote.slice(0, 24)}${record.quote.length > 24 ? "…" : ""}`,
    );
    remove.innerHTML = ICON_TRASH;

    li.append(jump, remove);
    return li;
}

function render(ui: Hud): void {
    const records = getAnnotationStore().list(docIdOf(ui));
    const formatter = dateFormat();

    const frag = document.createDocumentFragment();
    for (const record of records) frag.append(item(ui, record, formatter));
    ui.list.replaceChildren(frag);
    ui.list.hidden = records.length === 0;
    ui.empty.hidden = records.length > 0;

    ui.badge.textContent = String(records.length);
    ui.panelCount.textContent = String(records.length);
    ui.trigger.hidden = records.length === 0;
    const sr = ui.root.dataset.annotationHudSr;
    if (sr && ui.sr) ui.sr.textContent = sr.replace("{n}", String(records.length));
    if (records.length === 0) ui.trigger.setAttribute("aria-expanded", "false");
    ui.root.dataset.annotationHudTotal = String(records.length);
}

/** 高亮数量在别处变了（工具条加/删）：列表跟着走。 */
function observeLayer(ui: Hud): void {
    const layer = ui.root.closest<HTMLElement>(LAYER_SELECTOR);
    if (!layer || observedLayer === layer) return;
    layerObserver?.disconnect();
    observedLayer = layer;
    if (typeof MutationObserver === "undefined") return;
    layerObserver = new MutationObserver(() => render(ui));
    layerObserver.observe(layer, { attributes: true, attributeFilter: ["data-annotation-count"] });
}

/* ───────────────────────── 开关 ───────────────────────── */

function focusBack(ui: Hud): void {
    const target =
        restoreTo && restoreTo.isConnected && restoreTo.getClientRects().length > 0
            ? restoreTo
            : !ui.trigger.hidden
              ? ui.trigger
              : (document.querySelector<HTMLElement>("#post-content h1") ?? null);
    restoreTo = null;
    if (!target) return;
    if (target === ui.trigger) {
        ui.trigger.focus({ preventScroll: true });
        return;
    }
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
}

function openHud(ui: Hud): void {
    if (open) return;
    if (getAnnotationStore().list(docIdOf(ui)).length === 0) return;
    restoreTo = document.activeElement as HTMLElement | null;
    open = true;
    render(ui);
    ui.panel.hidden = false;
    ui.root.dataset.annotationHudOpen = "true";
    ui.trigger.setAttribute("aria-expanded", "true");
    if (drawer()) {
        ui.panel.setAttribute("aria-modal", "true");
        lockScroll();
        locked = true;
    } else {
        ui.panel.removeAttribute("aria-modal");
    }
    const first = ui.panel.querySelector<HTMLElement>(CLOSE_SELECTOR) ?? focusables(ui.panel)[0];
    first?.focus({ preventScroll: true });
    announce(ui, copy(ui, "Opened"));
}

function closeHud(ui: Hud, restore = true): void {
    if (!open) return;
    open = false;
    ui.panel.hidden = true;
    delete ui.root.dataset.annotationHudOpen;
    ui.panel.removeAttribute("aria-modal");
    ui.trigger.setAttribute("aria-expanded", "false");
    if (locked) {
        locked = false;
        unlockScroll();
    }
    if (restore) focusBack(ui);
}

/* ───────────────────────── 跳转 / 删除 ───────────────────────── */

function jump(ui: Hud, record: AnnotationRecord): void {
    closeHud(ui, false);
    const mark = markOf(record.id);
    const target = mark ?? blockAt(record.blockIndex);
    if (!target) {
        announce(ui, copy(ui, "Missing"));
        focusBack(ui);
        return;
    }
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    if (!mark) {
        announce(ui, copy(ui, "Missing"));
        focusBack(ui);
        return;
    }
    mark.classList.add(FOCUS_CLASS);
    mark.setAttribute("tabindex", "-1");
    mark.focus({ preventScroll: true });
    restoreTo = null;
    window.clearTimeout(emphasisTimer);
    emphasisTimer = window.setTimeout(() => {
        mark.classList.remove(FOCUS_CLASS);
    }, FOCUS_MS);
}

function remove(ui: Hud, id: string): void {
    if (!getAnnotationStore().remove(id)) return;

    // DOM 同步：把这条 mark 摊平回文本（与 annotation-layer 的 unwrap 同一手法）。
    const mark = markOf(id);
    if (mark) {
        const block = mark.parentElement;
        mark.replaceWith(...Array.from(mark.childNodes));
        block?.normalize();
    }
    syncLayer(ui);

    render(ui);
    const records = getAnnotationStore().list(docIdOf(ui));
    if (records.length === 0) {
        // 最后一条删完：保留面板（空态就在眼前），入口按钮自动隐藏。
        announce(ui, copy(ui, "Removed"));
        if (!open) focusBack(ui);
        return;
    }
    announce(ui, copy(ui, "Removed"));
    const next = ui.list.querySelector<HTMLElement>(FOCUSABLE) ?? ui.panel.querySelector<HTMLElement>(CLOSE_SELECTOR);
    next?.focus({ preventScroll: true });
}

/** 让注释层的计数属性与真实存储/DOM 一致（它只在下一次 render 时才自己写）。 */
function syncLayer(ui: Hud): void {
    const layer = ui.root.closest<HTMLElement>(LAYER_SELECTOR);
    if (!layer) return;
    const total = getAnnotationStore().list(docIdOf(ui)).length;
    layer.dataset.annotationCount = String(total);
    layer.dataset.annotationPainted = String(document.querySelectorAll(MARK_SELECTOR).length);
}

/* ───────────────────────── 事件 ───────────────────────── */

function onKeyDown(event: KeyboardEvent): void {
    if (!hud) return;
    if (!open) return;
    if (event.key === "Escape") {
        event.preventDefault();
        closeHud(hud);
        return;
    }
    if (event.key !== "Tab") return;
    const items = focusables(hud.panel);
    if (items.length === 0) {
        event.preventDefault();
        hud.panel.focus({ preventScroll: true });
        return;
    }
    const first = items[0] as HTMLElement;
    const last = items[items.length - 1] as HTMLElement;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === hud.panel)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
    }
}

function onClick(event: Event): void {
    const ui = hud ?? resolve();
    if (!ui) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (ui.trigger.contains(target)) {
        event.preventDefault();
        if (open) closeHud(ui);
        else openHud(ui);
        return;
    }

    const closeHit = target.closest<HTMLElement>(CLOSE_SELECTOR);
    if (closeHit && ui.root.contains(closeHit)) {
        event.preventDefault();
        closeHud(ui);
        return;
    }

    if (!open) return;

    const deleteBtn = target.closest<HTMLElement>("[data-annotation-hud-delete]");
    if (deleteBtn && ui.list.contains(deleteBtn)) {
        event.preventDefault();
        const id = deleteBtn.dataset.annotationHudDelete ?? "";
        remove(ui, id);
        return;
    }

    const jumpBtn = target.closest<HTMLElement>("[data-annotation-hud-jump]");
    if (jumpBtn && ui.list.contains(jumpBtn)) {
        event.preventDefault();
        const id = jumpBtn.dataset.annotationHudJump ?? "";
        const record = getAnnotationStore().list(docIdOf(ui)).find((r) => r.id === id);
        if (record) jump(ui, record);
        return;
    }

    // 桌面浮层没有遮罩：点面板以外的地方就关（入口按钮由上面的分支接管）。
    if (!drawer() && !ui.panel.contains(target)) closeHud(ui);
}

let bound = false;

export function initAnnotationHud(): void {
    const ui = resolve();
    if (!ui) return;
    hud = ui;

    if (!bound) {
        bound = true;
        document.addEventListener("click", onClick);
        document.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("astro:page-load", () => {
            const next = resolve();
            if (!next) return;
            if (open) closeHud(next, false);
            hud = next;
            open = false;
            locked = false;
            observeLayer(next);
            render(next);
        });
    }

    observeLayer(ui);
    render(ui);
}
