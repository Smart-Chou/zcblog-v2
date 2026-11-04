/**
 * 速查表（快捷键 / 手势）—— overlay 基座的**按需子树**（M2-5 · O-01）
 *
 * 只在用户按 `?` 或点导航里的「快捷键 / 手势」时才被请求（`import()` 于 overlay.ts），
 * 因此关闭态 = 0 请求；模块自身不产生任何 DOM，面板关闭后 `root.remove()` 归零。
 * 拆分动机：基座（overlay.ts）要守住 <2KB gz 的行为预算，文案表不该压在首开路径上。
 */

import { open } from "./overlay";

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
