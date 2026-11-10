/**
 * M7-5a：快捷键速查 dialog 的交互层。
 *
 * 只在首次按 `?` / `Ctrl-Cmd + /` 时被 `import()`（见 ShortcutHelp.astro 的常驻监听），
 * 关闭态既不下载本 chunk、也不下载 overlay 基座。
 *
 * 生命周期复用 M2-5 的 overlay 基座（passive 模式）：标记 `[data-overlay="shortcuts"]`、
 * `aria-modal`、关闭广播 `ovl:close`、焦点回填都由基座处理；dialog 原生提供
 * Esc / Tab 循环 / `::backdrop`，本模块只管开合、滚动锁与首次聚焦。
 */

import { open as openOverlay, close as closeOverlay } from "./overlay";

const DIALOG_ID = "shortcut-help";
const FALLBACK_OPENER_ID = "nav-menu-btn";

let wired = false;
let savedOverflow: string | null = null;

function getDialog(): HTMLDialogElement | null {
    const el = document.getElementById(DIALOG_ID);
    return el instanceof HTMLDialogElement ? el : null;
}

/** 焦点归还目标：打开前的活动元素；页面刚落地时活动元素是 body，退回导航菜单按钮（与旧速查入口一致） */
function resolveOpener(): HTMLElement | null {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && active.id !== DIALOG_ID)
        return active;
    return document.getElementById(FALLBACK_OPENER_ID);
}

function wire(dialog: HTMLDialogElement): void {
    if (wired) return;
    wired = true;

    dialog.querySelectorAll<HTMLElement>("[data-shortcut-close]").forEach((button) => {
        button.addEventListener("click", () => dialog.close());
    });

    // 遮罩点击：::backdrop 上的点击会重定向到 dialog 本身（面板是它的子节点，不算）
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
    });

    // 原生 Esc（cancel → close）和上面三种显式关闭都收敛到这里：摘标记 + 归还焦点 + 解滚动锁
    dialog.addEventListener("close", () => {
        closeOverlay(dialog);
        if (savedOverflow !== null) {
            document.documentElement.style.overflow = savedOverflow;
            savedOverflow = null;
        }
    });
}

function focusFirst(dialog: HTMLDialogElement): void {
    const target =
        dialog.querySelector<HTMLElement>("[data-shortcut-close]") ?? dialog;
    target.focus({ preventScroll: true });
}

export function openShortcutHelp(): void {
    const dialog = getDialog();
    if (!dialog || dialog.open) return;
    wire(dialog);

    const opener = resolveOpener();
    savedOverflow = document.documentElement.style.overflow;
    dialog.showModal();
    // passive：基座只打标记 / 记归还元素，遮罩、滚动、焦点由 dialog 与本模块负责
    openOverlay(dialog, "shortcuts", { passive: true, returnTo: opener });
    document.documentElement.style.overflow = "hidden";
    focusFirst(dialog);
}

export function closeShortcutHelp(): void {
    const dialog = getDialog();
    if (dialog?.open) dialog.close();
}
