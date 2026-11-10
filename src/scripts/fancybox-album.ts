/**
 * 相册灯箱（M8-3c · 第三刀）
 * ------------------------------------------------------------------
 * 依赖仍然只有 `@fancyapps/ui` 6.1.15 一套（卡片明确禁止引第二套灯箱库）。
 * 本卡把相册灯箱收口成「桌面大图 + 底部缩略条 / 移动全屏 sheet」，
 * 并把键盘 · 焦点 · reduced-motion 三件事写死在这一处。
 *
 * 为什么相册不再走 `~/utils/fancybox.ts` 的 `initStaticFancybox`：
 * 那个入口是给文章/随笔共用的，只暴露 transition/counter 这类旧选项；
 * 相册要的 Thumbs(scrollable 横向条)、dialog aria 装饰、reduced-motion 分支
 * 全带上之后，会让文章灯箱一起背这些行为。所以相册自己 bind 一次，
 * 公共模块一行未改（`initAlbumFancybox` 保留但不再被本页调用）。
 *
 * 四个验收点的实现位置：
 *  1. 版式（92% 视口 / 缩略条 / 移动 sheet）全在 `fancybox-overrides.css`，
 *     作用域 `.fancybox--album`，文章灯箱的样式不受影响。
 *  2. 键盘 ←/→/Esc 用 fancybox 内建 keyboard 表（这里显式写死口径，不吃默认值）；
 *     容器是 `div.fancybox__container[tabindex=0]`，不是原生 `<dialog>`；本文件补
 *     `role="dialog"` / `aria-modal` / 可读名，并在打开后把焦点移入容器，键盘表才生效。
 *  3. 关闭后焦点回缩略图：fancybox 的 `placeFocusBack`（默认 true）会 focus 回
 *     当前 slide 的 triggerEl，也就是被点的那张 `<a>`；本文件不改这条路径。
 *  4. reduced-motion：bind 时一次性判断，关掉 fade/zoom/show/hide 与轮播过渡，
 *     配合 CSS 的 animation/transition:none，灯箱内 0 个运行中动画（M7 modal 同口径）。
 *
 * 缩略条的横向滚动用 `type:"scrollable"` + CSS 覆盖成原生 `overflow-x:auto`
 * 的横向条（默认 scrollable 是竖排侧栏）。fancybox 6.1.15 的 Thumbs 在换图时按
 * `scrollLeft` 算目标位置（只对竖排成立），横向条会算错，所以这里自己补一次
 * 「选中项居中滚动」—— 不重复实现缩略条，只修滚哪一格。
 */

/** 相册网格容器（AlbumGrid.astro 挂着这个 id，`a[href]` 全组进灯箱）。 */
const GALLERY = "#fancybox-gallery";
const TRIGGER = `${GALLERY} a[href]`;
const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

/** fancybox 只用到这几个成员；不引它的类型（深路径 d.ts 链在项目里没被纳入）。 */
type LightboxApi = {
    getContainer: () => HTMLElement | undefined;
    getCarousel: () =>
        | {
              getPageIndex: () => number;
              getPages: () => unknown[];
              on: (event: string, fn: () => void) => unknown;
          }
        | undefined;
    getSlide: () => { triggerEl?: HTMLElement } | undefined;
};

const prefersReducedMotion = (): boolean =>
    typeof window !== "undefined" && window.matchMedia(REDUCE_QUERY).matches;

const isZh = (): boolean => (document.documentElement.lang || "").toLowerCase().startsWith("zh");

/** 灯箱样式按需注入（D-0057）：与 utils/fancybox.ts 同一份 css，同 href 只插一次。 */
async function ensureFancyboxCss(): Promise<void> {
    const { default: fancyboxCssUrl } =
        await import("@fancyapps/ui/dist/fancybox/fancybox.css?url");
    if (document.querySelector(`link[href="${fancyboxCssUrl}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = fancyboxCssUrl;
    document.head.appendChild(link);
}

/** 相册名（页面 h1）。取不到返回空串，由调用方兜底。 */
function albumTitle(): string {
    const heading = document.querySelector("h1");
    return (heading?.textContent || "").trim();
}

/**
 * 把当前选中项的缩略图滚到条带中间。
 * 只读两边的 getBoundingClientRect 做差分，不依赖 offsetLeft（grid 里不可靠）。
 */
function centerSelectedThumb(api: LightboxApi, behavior: ScrollBehavior): void {
    const viewport = api.getContainer()?.querySelector<HTMLElement>(".f-thumbs__viewport");
    const current = viewport?.querySelector<HTMLElement>(".f-thumbs__slide.is-selected");
    if (!viewport || !current) return;
    const box = viewport.getBoundingClientRect();
    const item = current.getBoundingClientRect();
    const delta = item.left - box.left - (box.width - item.width) / 2;
    if (Math.abs(delta) < 1) return;
    viewport.scrollTo({ left: viewport.scrollLeft + delta, behavior });
}

/**
 * 给灯箱容器补可访问名与角色，并在换图时刷新标题。
 * Fancybox 6 的 DOM 是 `<dialog class="fancybox__dialog">` 包着
 * `<div class="fancybox__container" tabindex="0">`；可读名要同时落到两层
 * （内层是焦点容器，外层是读屏/axe 认定的 dialog），否则会读到 fancybox 自带
 * 的默认「图片灯箱」。焦点陷阱由 fancybox 的容器焦点管理负责。
 */
function decorateDialog(api: LightboxApi): void {
    const container = api.getContainer();
    if (!container) return;
    const modal = container.closest("dialog") ?? container;
    const targets = modal === container ? [container] : [container, modal];
    for (const target of targets) {
        target.setAttribute("role", "dialog");
        target.setAttribute("aria-modal", "true");
    }

    const refresh = () => {
        // 不依赖 fancybox 的 carousel API（ready 时实例可能还没挂好；
        // 直接数 DOM 更稳，也让换图事件的刷新与 a11y 断言同源）。
        const slides = Array.from(container.querySelectorAll<HTMLElement>(".fancybox__slide"));
        const selected = slides.find((slide) => slide.classList.contains("is-selected"));
        const index = Number(selected?.getAttribute("index") ?? 0);
        const total = document.querySelectorAll(TRIGGER).length;
        const caption = albumTitle() || (isZh() ? "相册大图" : "Photo");
        for (const target of targets) {
            target.setAttribute(
                "aria-label",
                total > 0 ? `${caption} · ${index + 1}/${total}` : caption,
            );
        }

        // fancybox 给 slide 挂了 aria-labelledby，但 div 没有 role，axe 会判
        // aria-prohibited-attr；补一个合法的 group 角色，让标签有归属。
        for (const slide of slides) slide.setAttribute("role", "group");

        try {
            centerSelectedThumb(api, "auto");
        } catch {
            // 缩略条滚动是增强；取不到容器/选中项时不影响灯箱可用性。
        }
    };

    refresh();
    // fancybox 在 ready 之后还会把 mainTpl 的占位 `aria-label="{{MODAL}}"` 落成空值，
    // 同步设置会被它覆盖；下一帧再落一次，确保最终 DOM 上是我们算出的可读名。
    window.requestAnimationFrame(refresh);
    window.setTimeout(refresh, 0);
    window.setTimeout(refresh, 120);
    // 打开时把焦点移入灯箱容器（tabindex=0）；否则焦点还停在缩略图 <a> 上，
    // fancybox 的 ←/→ 键盘表不生效，键盘用户只能 Esc 关闭。
    window.requestAnimationFrame(() => container.focus({ preventScroll: true }));
    // fancybox 在 ready 后会把焦点放回触发缩略图；120ms 后再夺回一次，
    // 与 aria-label 的第二次落值同一拍（此时过渡/渲染已稳定）。
    window.setTimeout(() => container.focus({ preventScroll: true }), 120);
    // carousel 的 `change` 事件在 ready 时还订阅不到（getCarousel() 尚未就绪），
    // 但换图一定会改 slide 的 class；用 MutationObserver 兜住键盘/点击/滑动三条路径。
    const carousel = container.querySelector(".fancybox__carousel");
    if (carousel) {
        const observer = new MutationObserver(() => window.setTimeout(refresh, 0));
        observer.observe(carousel, { subtree: true, attributes: true, attributeFilter: ["class"] });
    }
    api.getCarousel?.()?.on?.("change", refresh);
}

async function initAlbumLightbox(): Promise<void> {
    const gallery = document.querySelector<HTMLElement>(GALLERY);
    // 灯箱只在相册详情页存在；找不到容器直接退出（其余页面 0 开销）
    if (!gallery || !gallery.querySelector("a[href]")) return;

    await ensureFancyboxCss();
    const [{ Fancybox }, { zh_CN }, { en_EN }] = await Promise.all([
        import("@fancyapps/ui"),
        import("@fancyapps/ui/dist/fancybox/l10n/zh_CN.js"),
        import("@fancyapps/ui/dist/fancybox/l10n/en_EN.js"),
    ]);

    const reduce = prefersReducedMotion();

    Fancybox.bind(TRIGGER, {
        mainClass: "fancybox--album",
        groupAll: true,
        // 深色遮罩是该站既定口径（文章灯箱同色），不跟站点 light/dark 走
        theme: "dark",
        backdropClick: "close",
        dragToClose: true,
        // reduced-motion：进出场 fade / 从缩略图放大的 spring tween 全关。
        // 只留 CSS 静态布局，否则「0 个运行中动画」这条过不去。
        fadeEffect: !reduce,
        zoomEffect: !reduce,
        showClass: reduce ? false : "f-zoomInUp",
        hideClass: reduce ? false : "f-fadeOut",
        l10n: isZh() ? zh_CN : en_EN,
        // 显式写死键盘口径（默认表里还有 Delete/Backspace/PageUp，收敛掉）
        keyboard: {
            Escape: "close",
            ArrowLeft: "prev",
            ArrowRight: "next",
        },
        Carousel: {
            transition: reduce ? false : "slide",
            // scrollable：CSS 里被改成横向原生滚动条（fancybox 默认是竖排侧栏）
            Thumbs: { type: "scrollable", showOnStart: true, minCount: 2 },
            // 相册不需要自动播放/全屏按钮，只留计数 + 缩略条开关 + 关闭
            Toolbar: {
                display: { left: ["counter"], middle: [], right: ["thumbs", "close"] },
            },
        },
        on: {
            ready: (api: unknown) => decorateDialog(api as LightboxApi),
        },
    });

    // 测试钩子：绑定完成才置位（e2e 靠它判断「可以点了」，不靠 sleep）
    gallery.setAttribute("data-lightbox-ready", "1");
}

/** swup 换页后 body 不重建、脚本不重跑；每个 page-load 重新 bind 一次同组选择器。 */
let pageLoadBound = false;

export function registerAlbumLightbox(): void {
    if (document.querySelector(GALLERY)) void initAlbumLightbox();

    if (pageLoadBound) return;
    pageLoadBound = true;
    document.addEventListener("astro:page-load", () => {
        if (document.querySelector(GALLERY)) void initAlbumLightbox();
    });
}

registerAlbumLightbox();
