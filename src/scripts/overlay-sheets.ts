/**
 * 速查表（快捷键 / 手势）—— overlay 基座的**按需子树**（M2-5 · O-01）
 *
 * 只在用户按 `?` 或点导航里的「快捷键 / 手势」时才被请求（`import()` 于 overlay.ts），
 * 因此关闭态 = 0 请求；模块自身不产生任何 DOM，面板关闭后 `root.remove()` 归零。
 * 拆分动机：基座（overlay.ts）要守住 <2KB gz 的行为预算，文案表不该压在首开路径上。
 */

import { close, open } from "./overlay";

type Row = readonly [label: string, value: string, isKey: boolean];

const isApple = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/** 关闭图标用 SVG 而不是文字「×」：可见文本会让 axe 的 label-content-name-mismatch 变成 incomplete */
const CLOSE_ICON =
    '<svg class="ovl__icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5 5 15M5 5l10 10"></path></svg>';

const COPY = {
    zh: {
        shortcuts: "键盘快捷键",
        gestures: "手势速查",
        close: "关闭",
        k1: "搜索",
        k2: "关闭弹层",
        k3: "打开本表",
        g1: "打开灯箱",
        g2: "上一张 / 下一张",
        g3: "缩放图片",
    },
    en: {
        shortcuts: "Keyboard shortcuts",
        gestures: "Gestures",
        close: "Close",
        k1: "Search",
        k2: "Close overlay",
        k3: "Open this sheet",
        g1: "Open lightbox",
        g2: "Previous / next",
        g3: "Zoom image",
    },
};

const SHEETS: Record<"shortcuts" | "gestures", Row[]> = {
    shortcuts: [
        ["k1", "mod+k", true],
        ["k2", "Esc", true],
        ["k3", "?", true],
    ],
    gestures: [
        ["g1", "点按", false],
        ["g2", "左右滑动", false],
        ["g3", "双指捏合", false],
    ],
};

export function render(name: "shortcuts" | "gestures", opener: HTMLElement): void {
    // 同一次交互被两个入口（基座监听 + 页面内联转发）各调一次时，只开一个面板
    if (document.querySelector(`[data-overlay="${name}"]`)) return;
    const en = (opener.dataset.ovlLocale ?? document.documentElement.lang).startsWith("en");
    const copy = en ? COPY.en : COPY.zh;
    // 组合键留在一个 <kbd> 里、键与键之间空一格（"⌘ K"）：
    // 拆成单字符 kbd 会被 axe 的「短文本」启发式判成 color-contrast incomplete（实测 kbd:nth-child(1)）
    const keys = (value: string) =>
        `<kbd class="ovl__kbd">${value
            .split("+")
            .map((key) => (key === "mod" ? (isApple ? "⌘" : "Ctrl") : key))
            .join(" ")}</kbd>`;
    const rows = SHEETS[name]
        .map(
            ([label, value, isKey]) =>
                `<div class="ovl__row"><dt>${copy[label as keyof typeof copy]}</dt><dd>${
                    isKey ? keys(value) : value
                }</dd></div>`,
        )
        .join("");
    const root = document.createElement("div");
    root.className = `ovl ovl--${name}`;
    root.innerHTML =
        `<div class="ovl__scrim" data-ovl-close></div>` +
        `<section class="ovl__panel" tabindex="-1">` +
        `<h2 class="ovl__title" id="ovl-${name}-title">${copy[name]}</h2>` +
        `<button type="button" class="ovl__close" data-ovl-close aria-label="${copy.close}">${CLOSE_ICON}</button>` +
        `<dl class="ovl__rows">${rows}</dl></section>`;
    root.setAttribute("aria-labelledby", `ovl-${name}-title`);
    root.addEventListener("ovl:close", () => root.remove(), { once: true });
    document.body.appendChild(root);
    open(root, name, { returnTo: opener, focus: root.querySelector<HTMLElement>(".ovl__close") });
}

/* ───────────────── 友链申请弹层（M8-5c） ─────────────────
 *
 * 原生 `<dialog>`：Esc 关闭、Tab 焦点陷阱、`::backdrop` 全交给浏览器；
 * 本模块只补三件浏览器不给的事：
 *   1. 打开 / 关闭 + 滚动锁（`[hidden]` 显式隐藏，见 friends.css）
 *   2. 焦点归还：关闭后回到触发链接（overlay 基座 passive 模式 + 本地 returnTo 双保险）
 *   3. 复制：clipboard API → 失败降级「选中文本 + 可见文案」，绝不静默
 * 全部走文档级委托：swup 换页换了 DOM 也不用重新绑定。
 * 边界：不持 token、不调 GitHub API —— CTA 只是指向 .github/ISSUE_TEMPLATE/friend-link.yml。
 */

const FA = { dialog: "#friend-apply", opener: ".friends-gh", status: "[data-fa-status]" } as const;

const FA_COPY = {
    zh: {
        copied: "已复制",
        copiedAll: "已复制全部站点信息",
        failed: "复制失败：当前环境禁用剪贴板，文本已选中，请按 ⌘/Ctrl + C 手动复制。",
    },
    en: {
        copied: "Copied",
        copiedAll: "All site info copied",
        failed: "Copy failed — the clipboard is blocked here. The text is selected: press ⌘/Ctrl + C.",
    },
} as const;

/** 关闭后焦点的落点；只在打开时赋值，关闭后清空 */
let faReturn: HTMLElement | null = null;

function faSay(dialog: HTMLElement, message: string, tone: "ok" | "error"): void {
    const status = dialog.querySelector<HTMLElement>(FA.status);
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
}

async function faCopy(
    dialog: HTMLDialogElement,
    source: HTMLElement | null,
    text: string,
    okText: string,
): Promise<void> {
    const copy = FA_COPY[document.documentElement.lang.startsWith("en") ? "en" : "zh"];
    try {
        if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
        await navigator.clipboard.writeText(text);
        faSay(dialog, okText || copy.copied, "ok");
        return;
    } catch {
        // 降级：选中源文本，让用户手动复制（选中失败也要有文案）
        if (source) {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(source);
            selection?.removeAllRanges();
            selection?.addRange(range);
        }
        faSay(dialog, copy.failed, "error");
    }
}

function faClose(dialog: HTMLDialogElement): void {
    if (dialog.open) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
    }
    // 统一收口：Esc（原生 close）与按钮关闭都落到这里
    dialog.setAttribute("hidden", "");
    if (dialog.hasAttribute("data-overlay")) close(dialog);
    document.documentElement.style.overflow = "";
    faReturn?.focus({ preventScroll: true });
    faReturn = null;
}

function faOpen(dialog: HTMLDialogElement, opener: HTMLElement): void {
    if (dialog.open) return;
    faReturn = opener;
    dialog.removeAttribute("hidden");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    // 只在 ≤640（贴底 sheet）锁滚动：那里滚动条是覆盖层，锁掉不改变布局宽度；
    // 桌面锁 html overflow 会让滚动条消失 → 视口宽 +15px，居中卡片瞬移（实测 441→448）。
    if (window.matchMedia("(max-width: 640px)").matches) {
        document.documentElement.style.overflow = "hidden";
    }
    // 基座 passive：只管标记 / aria / 焦点归还，Esc 与陷阱仍由原生 dialog 负责
    open(dialog, "friend-apply", { passive: true, returnTo: opener });
    dialog.querySelector<HTMLElement>("[data-fa-close]")?.focus({ preventScroll: true });
    if (!dialog.dataset.faBound) {
        dialog.dataset.faBound = "1";
        // cancel（Esc）同步触发，close 是排队的任务：状态要在 cancel 这一帧就收口，
        // 否则会出现「原生 dialog 已不可见、data-overlay 标记还挂着」（e2e 实测到的 race）
        dialog.addEventListener("cancel", () => faClose(dialog));
        dialog.addEventListener("close", () => faClose(dialog));
    }
}

/** 幂等：首次调用绑事件，之后每次调用只补齐新 DOM 的 aria（swup 换页后再次调用） */
export function mountFriendApply(): void {
    document
        .querySelectorAll<HTMLElement>(FA.opener)
        .forEach((link) => link.setAttribute("aria-haspopup", "dialog"));

    const guarded = window as unknown as { __faBound?: boolean };
    if (guarded.__faBound) return;
    guarded.__faBound = true;

    document.addEventListener(
        "click",
        (event) => {
            const node = event.target as HTMLElement | null;
            const dialog = document.querySelector<HTMLDialogElement>(FA.dialog);
            if (!node || !dialog) return;

            // 关闭：按钮，或点到 dialog 本体（= backdrop 区域，内容层是 .fa__inner）
            if (node.closest("[data-fa-close]") || node === dialog) {
                event.preventDefault();
                faClose(dialog);
                return;
            }

            const opener = node.closest<HTMLElement>(FA.opener);
            if (opener) {
                event.preventDefault();
                faOpen(dialog, opener);
                return;
            }

            const field = node.closest<HTMLElement>("[data-fa-copy]");
            if (field) {
                const value =
                    field.closest("[data-fa-field]")?.querySelector<HTMLElement>("[data-fa-value]") ?? null;
                const text = value?.textContent?.trim() ?? "";
                if (text) void faCopy(dialog, value, text, "");
                return;
            }

            if (node.closest("[data-fa-copy-all]")) {
                const lines = Array.from(dialog.querySelectorAll("[data-fa-field]"))
                    .map((row) => {
                        const label = row.querySelector("dt")?.textContent?.trim() ?? "";
                        const value = row.querySelector("[data-fa-value]")?.textContent?.trim() ?? "";
                        return `${label}：${value}`;
                    })
                    .filter(Boolean);
                if (!lines.length) return;
                const copy = FA_COPY[document.documentElement.lang.startsWith("en") ? "en" : "zh"];
                void faCopy(dialog, null, lines.join("\n"), copy.copiedAll);
            }
        },
        true,
    );
}
