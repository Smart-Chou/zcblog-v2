/**
 * 目录高亮（N-7 / M5-14）
 *
 * 由 `Toc.astro` 的内联 bootstrap 按需 `import()`：
 *   - 目录在首屏外且从未进入视口 → **永不加载**，0 请求；
 *   - 目录进入视口（或 UA 不支持 IntersectionObserver）→ 加载本模块。
 *
 * 为什么值得搬：原来 `import tocbot from "tocbot"` 是静态 import，tocbot
 * 未压缩 44KB / 打包后 4.6KB gz，**永远**计入文章页 JS 图，而它在这里只干
 * 两件事：① 滚动时给当前标题加 `is-active-link`；② 点目录链接时改写
 * `history.pushState`（见下）。目录结构本身是构建期渲染的（`<ol class="toc-list">`
 * 已带 `is-collapsible`），tocbot 默认还会 `innerHTML = ""` 把它清掉重建一遍。
 *
 * 行为与搬移前**完全等价**：tocbot.init 的参数一个没改、没加。
 * （一度想用 `skipRendering: true` 保住构建期 DOM，但实测它会让 tocbot 直接
 * `return this`，高亮全丢 —— 见下方 init 处注释。）
 */

import { onPageReady } from "~/utils/page-lifecycle";
import tocbot from "tocbot";

let tocAbortController: AbortController | null = null;

/** 是否已经初始化过（swup 换页会重置模块作用域，用 window 上的标记兜住） */
type HighlightState = { ready: boolean };
const w = window as unknown as { __tocHighlight?: HighlightState };

export function initTocHighlight(): void {
    onPageReady(() => {
        const state: HighlightState = (w.__tocHighlight ??= { ready: false });

        requestAnimationFrame(() => {
            const tocRoot = document.querySelector<HTMLElement>(".toc.post-toc");
            const tocContent = tocRoot?.querySelector<HTMLElement>(".toc-content");
            if (!tocRoot || !tocContent) return;

            // ⚠️ 这里**不能**用 `skipRendering: true`。虽然本站目录是构建期渲染的，
            // 但 tocbot 源码里 skipRendering 的语义是「跳过渲染**并直接 return**」：
            //   } else { // No need to attach listeners if skipRendering is true
            //     return this
            //   }
            // （tocbot.js:692-697）——高亮/滚动监听一并被跳过，目录变成死的。
            // 实测：设为 true 后 `is-active-link` 恒为 0，滚到任何位置都不更新。
            //
            // 所以保持默认（false，它会清空并按 #post-content 重建一次目录）。
            // 本卡的收益来自「tocbot 不再进入静态 JS 图」，不依赖 skipRendering。

            tocbot.init({
                tocSelector: ".toc-content",
                contentSelector: "#post-content",
                headingSelector: "h2, h3",
                headingsOffset: 100,
                scrollSmoothOffset: -100,
                scrollSmooth: false,
                enableUrlHashUpdateOnScroll: false,
                collapseDepth: 2,
                includeTitleTags: false,
                ignoreSelector: ".toc-ignore",
            });

            // tocbot 点击 TOC 链接时用 pushState 更新 hash，会产生历史记录
            // 拦截后改用 replaceState，确保点击多个目录项也只保留一条历史
            const _push = history.pushState.bind(history);
            history.pushState = function (state, title, url) {
                if (typeof url === "string" && url.startsWith("#")) {
                    return history.replaceState(state, title, url);
                }
                return _push(state, title, url);
            };

            // 页面切换时恢复原始 pushState，避免与其他库冲突
            document.addEventListener("astro:after-swap", function restore() {
                history.pushState = _push;
                document.removeEventListener("astro:after-swap", restore);
            });

            // ---- 激活路径管理：只高亮当前激活标题及其祖先 ----
            // M6-3 起目录改用 CSS sticky（不再由脚本算 fixed/absolute 贴底）：
            // 布局归样式表，脚本只管状态，SPA 换页也不再需要清 inline style。
            function updateActivePath() {
                const activeLink = tocRoot?.querySelector(".is-active-link") as HTMLElement | null;

                // 清除所有旧路径
                tocRoot?.querySelectorAll(".is-active-path").forEach((el) => {
                    el.classList.remove("is-active-path");
                });

                if (!activeLink) return;

                // 从激活链接向上遍历，标记所有祖先 .toc-list-item
                let el: HTMLElement | null = activeLink;
                while (el && el !== tocRoot) {
                    if (el.classList.contains("toc-list-item")) {
                        el.classList.add("is-active-path");
                    }
                    el = el.parentElement;
                }
            }

            // 首次加载：强制 tocbot 检测当前滚动位置的激活标题
            tocbot.refresh();
            // 等 tocbot 刷新完 DOM 后再更新路径
            requestAnimationFrame(() => {
                updateActivePath();
            });

            if (tocAbortController) {
                tocAbortController.abort();
            }
            tocAbortController = new AbortController();

            // ---- Hover 时阻止页面滚动，只滚目录 ----
            tocContent.addEventListener(
                "wheel",
                (e) => {
                    if (!tocRoot.matches(":hover")) return;
                    const { scrollTop, scrollHeight, clientHeight } = tocContent;
                    const atTop = scrollTop === 0;
                    const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

                    if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
                        // 已经到边界，让页面接管滚动
                        return;
                    }
                    e.preventDefault();
                    tocContent.scrollTop += e.deltaY;
                },
                { passive: false, signal: tocAbortController.signal },
            );

            let ticking = false;
            window.addEventListener(
                "scroll",
                () => {
                    if (ticking) return;
                    ticking = true;
                    requestAnimationFrame(() => {
                        updateActivePath();
                        ticking = false;
                    });
                },
                { passive: true, signal: tocAbortController.signal },
            );

            state.ready = true;
        });
    });
}
