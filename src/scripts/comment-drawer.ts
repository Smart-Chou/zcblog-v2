/**
 * M7-2a：移动评论抽屉的交互层。
 *
 * 只在 ≤640 首次点击「展开评论」时被动态 import；桌面内联评论区不会下载这段代码。
 * 外壳、断点和 Waline 懒加载仍由 WalineComment.astro 持有，这里只负责开合、
 * 遮罩/Esc、滚动锁与恢复、焦点回填/陷阱。这样评论组件的首屏 JS 不因抽屉变大。
 */

const MOBILE_QUERY = "(max-width: 640px)";
const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface CommentDrawer {
    toggle: () => void;
    reset: () => void;
}

interface DrawerOptions {
    onShow: () => void;
    onHide: () => void;
}

export function initCommentDrawer(options: DrawerOptions): CommentDrawer | null {
    const drawer = document.getElementById("waline-drawer");
    if (!drawer) return null;

    let savedScrollY = 0;

    function setClosed() {
        drawer!.dataset.state = "closed";
        drawer!.removeAttribute("role");
        drawer!.removeAttribute("aria-modal");
        drawer!.removeAttribute("aria-labelledby");
        document.documentElement.classList.remove("comment-drawer-open");
    }

    function close(opts: { restoreFocus?: boolean; restoreScroll?: boolean } = {}) {
        const wasOpen = drawer!.dataset.state === "open";
        setClosed();
        options.onHide();
        if (!wasOpen) return;
        if (opts.restoreScroll !== false) window.scrollTo(0, savedScrollY);
        if (opts.restoreFocus !== false) {
            document.getElementById("waline-toggle")?.focus({ preventScroll: true });
        }
    }

    function open() {
        if (drawer!.dataset.state === "open") return;
        savedScrollY = window.scrollY;
        drawer!.dataset.state = "open";
        drawer!.setAttribute("role", "dialog");
        drawer!.setAttribute("aria-modal", "true");
        drawer!.setAttribute("aria-labelledby", "waline-drawer-title");
        document.documentElement.classList.add("comment-drawer-open");
        options.onShow();
        drawer!
            .querySelector<HTMLButtonElement>(".comment-drawer__close")
            ?.focus({ preventScroll: true });
    }

    drawer.querySelectorAll<HTMLElement>("[data-drawer-dismiss]").forEach((el) => {
        el.addEventListener("click", () => close());
    });

    // 焦点陷阱：Tab / Shift+Tab 在抽屉内循环。
    drawer.addEventListener("keydown", (event) => {
        if (event.key !== "Tab" || drawer.dataset.state !== "open") return;
        const focusables = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => el.offsetWidth > 0 || el.offsetHeight > 0,
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || drawer.dataset.state !== "open") return;
        event.preventDefault();
        close();
    });

    // 视口跨过断点：桌面不该残留 fixed 遮罩。
    window.matchMedia(MOBILE_QUERY).addEventListener("change", (event) => {
        if (!event.matches && drawer.dataset.state === "open") {
            close({ restoreFocus: false });
        }
    });

    return {
        toggle() {
            if (drawer.dataset.state === "open") close();
            else open();
        },
        reset() {
            setClosed();
        },
    };
}
