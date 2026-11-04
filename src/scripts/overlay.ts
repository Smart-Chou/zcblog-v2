/**
 * 统一 overlay 基座（M2-5 · O-01）
 *
 * 六件套共用同一套语义与生命周期，**关闭态 = 0 节点 / 0 请求 / 0 初始化**：
 *   搜索 spotlight（Pagefind dialog，标记式接入 watchSearch）
 *   分享 sheet（PostShare 弹层，标记式接入，见 ~/scripts/share）
 *   灯箱（Fancybox 容器，标记式接入 watchLightbox）
 *   跳转守卫（/redirect/ 页级矩形，见 redirect.astro）
 *   快捷键速查 / 手势速查（面板在 overlay-sheets.ts，按需二次 import）
 *
 * 约定：
 *   · 打开态必有 `[data-overlay="<name>"]`，关闭态必无 —— e2e 的唯一判据。
 *   · 焦点：记录触发元素 → 关闭时归还；Tab 在遮罩内循环（原生 dialog 交给浏览器）。
 *   · 滚动：非 passive 遮罩锁 html 滚动（base.css 的 scrollbar-gutter 保证不抖动）。
 *   · 关闭广播 `ovl:close`，宿主（如 share）据此同步自己的 class / aria。
 * 手写焦点陷阱（不引第三方 focus-trap 库）：见 trap()，13 行。
 */

type Opts = {
    /** 关闭后焦点归还的元素（缺省取打开前的 activeElement） */
    returnTo?: HTMLElement | null;
    /** 打开后聚焦的元素（缺省取第一个可聚焦元素） */
    focus?: HTMLElement | null;
    /** 生命周期由第三方接管（dialog / Fancybox）：只管标记与 aria，不碰焦点 / 滚动 / Esc */
    passive?: boolean;
    /** 无可访问名时补的 aria-label（第三方 dialog 常见） */
    label?: string;
};

const FOCUSABLE =
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let active: HTMLElement | null = null;
let restore: HTMLElement | null = null;

function focusables(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0,
    );
}

export function open(el: HTMLElement, name: string, opts: Opts = {}): void {
    if (active === el) return;
    if (active) close(active);
    restore = opts.returnTo ?? (document.activeElement as HTMLElement | null);
    active = el;
    el.dataset.overlay = name;
    if (!el.hasAttribute("role")) el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    if (opts.label && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby"))
        el.setAttribute("aria-label", opts.label);
    if (opts.passive) return;
    // 非 passive 遮罩自带 scrim（页内 sheet 用）；原生 dialog / Fancybox 有自己的 backdrop
    if (!el.querySelector(".ovl__scrim")) {
        const scrim = document.createElement("div");
        scrim.className = "ovl__scrim";
        scrim.dataset.ovlClose = "";
        el.prepend(scrim);
        el.dataset.ovlScrim = "1";
    }
    document.documentElement.style.overflow = "hidden";
    (opts.focus ?? focusables(el)[0] ?? el).focus({ preventScroll: true });
}

export function close(el: HTMLElement): void {
    if (!el.hasAttribute("data-overlay")) return;
    if (el.dataset.ovlScrim) {
        el.querySelector(".ovl__scrim")?.remove();
        delete el.dataset.ovlScrim;
    }
    if (active === el) {
        active = null;
        document.documentElement.style.overflow = "";
        restore?.focus({ preventScroll: true });
        restore = null;
    }
    el.removeAttribute("data-overlay");
    el.removeAttribute("aria-modal");
    el.dispatchEvent(new CustomEvent("ovl:close"));
}

/** 速查表面板在 overlay-sheets 里（文案表不进首开路径） */
export function openSheet(name: "shortcuts" | "gestures", opener: HTMLElement): void {
    void import("./overlay-sheets").then((mod) => mod.render(name, opener));
}

/* ─────────────────────── 键盘：Esc / Tab / ? ─────────────────────── */

function trap(event: KeyboardEvent, root: HTMLElement): void {
    const list = focusables(root);
    if (list.length === 0) return;
    const current = document.activeElement as HTMLElement | null;
    const inside = !!current && root.contains(current);
    if (event.shiftKey && (!inside || current === list[0])) {
        event.preventDefault();
        list[list.length - 1].focus();
    } else if (!event.shiftKey && (!inside || current === list[list.length - 1])) {
        event.preventDefault();
        list[0].focus();
    }
}

function onKeydown(event: KeyboardEvent): void {
    if (active) {
        if (event.key === "Tab") {
            if (!(active instanceof HTMLDialogElement)) trap(event, active);
            return;
        }
        if (event.key === "Escape" && !(active instanceof HTMLDialogElement)) {
            event.preventDefault();
            close(active);
        }
        return;
    }
    // 全局 `?` → 快捷键速查（输入框内、带修饰键时不抢）
    if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input,textarea,select,[contenteditable=true]")) return;
    const opener = document.getElementById("nav-menu-btn");
    if (!opener) return;
    event.preventDefault();
    openSheet("shortcuts", opener);
}

/* ─────────────────────── 标记式接入 ─────────────────────── */

/** Pagefind：trigger 内按钮的 aria-expanded 是权威开合信号（模块按需加载，故用 MutationObserver） */
export function watchSearch(): void {
    const host = document.querySelector<HTMLElement>("pagefind-modal-trigger");
    if (!host || host.dataset.ovlWatch) return;
    host.dataset.ovlWatch = "1";
    const sync = () => {
        const button = host.querySelector("button");
        // dialog 挂在 <pagefind-modal> 里（不是 trigger 里），且首次打开才创建
        const dialog = document.querySelector<HTMLDialogElement>("pagefind-modal dialog");
        if (!dialog) return;
        if (button?.getAttribute("aria-expanded") === "true")
            open(dialog, "search", {
                passive: true,
                returnTo: button,
                focus: dialog.querySelector<HTMLElement>(".pf-input"),
            });
        else close(dialog);
    };
    new MutationObserver(sync).observe(host, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-expanded"],
    });
    // 模块是本卡才改成按需加载的：如果加载完成时弹层已经开了，这里补一次
    sync();
}

/** Fancybox：v5 在 body 上挂一个 <dialog class="fancybox__dialog">，监听挂载/移除即可标记 */
export function watchLightbox(): void {
    const pick = (node: Node): HTMLElement | null =>
        node instanceof HTMLElement
            ? node.matches("dialog.fancybox__dialog")
                ? node
                : node.querySelector<HTMLElement>("dialog.fancybox__dialog")
            : null;
    const label = document.documentElement.lang.startsWith("en") ? "Image viewer" : "图片灯箱";
    const mark = (dialog: HTMLElement) => {
        open(dialog, "lightbox", { passive: true, label });
        // Fancybox 在容器 div 上挂 aria-label（无 role → aria-prohibited-attr），
        // 对话框本身已有名字，这里摘掉这条无效标注。
        dialog.querySelector(".fancybox__container")?.removeAttribute("aria-label");
    };
    new MutationObserver((records) => {
        for (const record of records) {
            for (const node of Array.from(record.addedNodes)) {
                const dialog = pick(node);
                if (dialog) mark(dialog);
            }
            for (const node of Array.from(record.removedNodes)) {
                const dialog = pick(node);
                if (dialog) close(dialog);
            }
        }
    }).observe(document.body, { childList: true });
    // 同上：模块按需加载，若灯箱已经打开则补标
    const opened = document.querySelector<HTMLElement>("dialog.fancybox__dialog");
    if (opened) mark(opened);
}

const guarded = window as unknown as { __ovlBound?: boolean; __ovlLoaded?: boolean };
if (!guarded.__ovlBound) {
    guarded.__ovlBound = true;
    guarded.__ovlLoaded = true;
    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener(
        "click",
        (event) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;
            if (target.closest("[data-ovl-close]") && active) {
                event.preventDefault();
                close(active);
                return;
            }
            const opener = target.closest<HTMLElement>("[data-ovl-open]");
            if (opener) {
                event.preventDefault();
                openSheet(opener.dataset.ovlOpen as "shortcuts" | "gestures", opener);
            }
        },
        true,
    );
    watchLightbox();
}
