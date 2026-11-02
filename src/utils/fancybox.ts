/// <reference types="astro/client" />

/**
 * Fancybox 工具模块
 * 提供统一的图片画廊初始化功能，支持动态扫描和静态画廊两种模式
 */

import fancyboxCssUrl from "@fancyapps/ui/dist/fancybox/fancybox.css?url";

/**
 * 灯箱样式按需注入（D-0057）
 * 原来在 MarkdownLayout / 相册 / Talks 里静态 import，导致 85 篇文章页
 * 都背着一个 1.35s 的阻塞样式表——而它只在用户真正点开图片时才有用。
 */
function ensureFancyboxCss(): void {
    if (typeof document === "undefined") return;
    if (document.querySelector(`link[href="${fancyboxCssUrl}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = fancyboxCssUrl;
    document.head.appendChild(link);
}

/**
 * 检测当前是否为生产环境
 */
function isProduction(): boolean {
    if (typeof import.meta !== "undefined" && import.meta.env) {
        return import.meta.env.PROD === true;
    }
    if (typeof process !== "undefined" && (process as any).env) {
        return (process as any).env.NODE_ENV === "production";
    }
    return false;
}

interface FancyboxOptions {
    /** 画廊容器选择器 */
    gallerySelector: string;
    /** 是否启用键盘导航 */
    keyboard?: boolean;
    /** 背景透明度 (0-1) */
    backdropOpacity?: number;
    /** 是否显示关闭按钮 */
    closeButton?: boolean;
    /** 是否显示计数器 */
    counter?: boolean;
    /** 动画类型 */
    animationEffect?: "slide" | "zoom" | "fade" | false;
    /** 过渡动画时长 */
    transitionDuration?: number;
    /** 是否启用调试模式 */
    debug?: boolean;
}

const DEFAULT_OPTIONS: FancyboxOptions = {
    gallerySelector: "#fancybox-gallery",
    keyboard: true,
    backdropOpacity: 0.9,
    closeButton: true,
    counter: true,
    animationEffect: "slide",
    transitionDuration: 300,
};

interface DynamicInitOptions extends Partial<FancyboxOptions> {
    /**
     * 文章模式：图片容器改为块级（可承载渐隐遮罩/提示徽章），
     * 并检测被 max-height 截断的长图，标记 img-collapse 以便显示"点击查看完整图片"。
     */
    articleMode?: boolean;
}

/** 判断图片是否被 CSS max-height 截断，是则给容器加 img-collapse 类 */
function markIfCropped(img: HTMLImageElement, link: HTMLAnchorElement): void {
    const evaluate = () => {
        if (!img.naturalWidth || !img.naturalHeight) return;
        const box = img.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) return;
        const uncappedHeight = (box.width / img.naturalWidth) * img.naturalHeight;
        const tolerance = Math.max(12, box.height * 0.05); // 微小截断（<5%）不提示
        const cropped = uncappedHeight - box.height > tolerance;
        link.classList.toggle("img-collapse", cropped);
    };

    if (img.complete && img.naturalWidth) {
        evaluate();
    } else {
        img.addEventListener("load", evaluate, { once: true });
    }
}

/** 窗口尺寸变化时重新评估折叠状态（视口高度变化会影响 60vh 截断） */
let _collapseResizeBound = false;
function bindCollapseResizeHandler(): void {
    if (_collapseResizeBound || typeof window === "undefined") return;
    _collapseResizeBound = true;
    let timer: number | undefined;
    window.addEventListener("resize", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
            document
                .querySelectorAll<HTMLImageElement>(".post-content a.img-link > img")
                .forEach((img) => {
                    const link = img.closest("a.img-link");
                    if (link) markIfCropped(img, link as HTMLAnchorElement);
                });
        }, 150);
    });
}

/**
 * 初始化动态扫描模式的 Fancybox
 */
async function initDynamicFancybox(
    contentSelector: string = ".post-content",
    options: DynamicInitOptions = {},
): Promise<void> {
    const debug = options.debug ?? !isProduction();

    try {
        if (debug) console.log("初始化动态扫描模式 Fancybox");

        const content = document.querySelector(contentSelector);
        if (!content) return;

        const images = content.querySelectorAll<HTMLImageElement>("img");
        if (images.length === 0) return;

        if (debug) console.log(`找到 ${images.length} 张图片`);

        images.forEach((img) => {
            if (img.closest("a")) return;
            if (img.classList.contains("plantuml-image")) return;

            img.style.cursor = "zoom-in";

            const link = document.createElement("a");
            link.href = img.src;
            link.setAttribute("data-fancybox", "gallery");
            // 图片的优化产物是同源 /assets URL，swup 会把它当站内链接截走，
            // 在 Fancybox 的 click 处理器之前导航到图片本身。标记为 no-swup，
            // 让点击留给灯箱处理。
            link.setAttribute("data-no-swup", "");
            link.setAttribute("data-caption", img.alt || "");
            if (options.articleMode) {
                link.classList.add("img-link");
            } else {
                link.style.display = "contents";
            }

            img.parentNode?.insertBefore(link, img);
            link.appendChild(img);

            if (options.articleMode) markIfCropped(img, link);
        });

        if (options.articleMode) bindCollapseResizeHandler();

        ensureFancyboxCss();
        const { Fancybox } = await import("@fancyapps/ui");
        Fancybox.bind(contentSelector + " img[src]", {
            groupAll: true,
            Carousel: { transition: "slide" },
        });

        if (debug) console.log("Fancybox 绑定完成");
    } catch (error) {
        console.error("初始化动态 Fancybox 时出错:", error);
    }
}

/**
 * 初始化静态画廊模式的 Fancybox
 */
async function initStaticFancybox(options: Partial<FancyboxOptions> = {}): Promise<void> {
    const debug = options.debug ?? !isProduction();
    const config = { ...DEFAULT_OPTIONS, ...options, debug };

    try {
        if (debug) console.log("初始化静态画廊模式 Fancybox");

        const gallery = document.querySelector(config.gallerySelector);
        if (!gallery) return;

        ensureFancyboxCss();
        const { Fancybox } = await import("@fancyapps/ui");

        Fancybox.bind(`${config.gallerySelector} a[href]`, {
            groupAll: true,
            Carousel: { transition: config.animationEffect as any },
        });

        if (debug) console.log("Fancybox 静态画廊初始化完成");
    } catch (error) {
        console.error("初始化静态 Fancybox 时出错:", error);
    }
}

/**
 * 注册一个 Fancybox 初始化函数，自动处理 SSR、astro:page-load 和首屏加载。
 *
 * 防泄漏设计：
 * 1. 只注册一次 astro:page-load 监听器（_bound flag）
 * 2. 每次切换时先取消上一次的操作（AbortController）
 * 3. 自动检测当前页面是否匹配 selector，不匹配则跳过
 */
let _fancyboxController: AbortController | null = null;
const _registeredSelectors = new Set<string>();

function registerFancybox(selector: string, fn: () => Promise<void>): void {
    if (typeof document === "undefined") return;

    // 每个 handler 自己持有 page-load 监听。之前用一个全局 _fancyboxBound，
    // 只有第一个注册的 handler 能收到 swup 换页后的 astro:page-load；
    // 从首页 swup 进入文章页时，文章 handler 的监听根本没挂上，灯箱就不工作。
    if (_registeredSelectors.has(selector)) return;
    _registeredSelectors.add(selector);

    const init = async () => {
        // 检查当前页面是否包含目标选择器，不匹配则跳过
        if (!document.querySelector(selector)) return;

        // 取消上一次的操作
        _fancyboxController?.abort();
        _fancyboxController = new AbortController();

        await fn();
    };

    document.addEventListener("astro:page-load", () => void init());

    // 首屏加载；脚本可能晚于 astro:page-load 才加载，补一帧
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => void init(), { once: true });
    } else {
        requestAnimationFrame(() => void init());
    }
}

export const initEssayFancybox = () =>
    registerFancybox(".essay-images", () => initDynamicFancybox(".essay-images", { debug: false }));

export const initArticleFancybox = () =>
    registerFancybox(".post-content:not([data-fancybox-off])", () =>
        initDynamicFancybox(".post-content:not([data-fancybox-off])", {
            debug: false,
            articleMode: true,
        }),
    );

export const initAlbumFancybox = () =>
    registerFancybox("#fancybox-gallery", () => initStaticFancybox({ debug: false }));
