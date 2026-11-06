import { onPageReady } from "../utils/page-lifecycle";
// 只取功能开关子模块，不走 ~/config 桶文件：桶文件里的 `export const {site, author, …}` 与
// `export * from "./site"` 会让站点文案（title/description/keywords…）落进客户端 chunk，
// 每个列表页首屏多背 3.9KB gz（R-44）。这里真正需要的只有 redirect / 两个 class 名单。
import { config } from "~/config/feature";
import {
    REDIRECT_PAGE,
    toUrlSafeBase64,
    isExternalUrl,
    appendExternalLinkIcon,
} from "~/utils/redirect-utils";

function initRedirectHandler() {
    try {
        if (!config.redirect) return;

        const { redirectIncludeClass: includeClass, redirectExcludeClass: excludeClass } = config;

        const hasClassInTree = (element: HTMLElement): boolean => {
            let current: HTMLElement | null = element;
            while (current) {
                if (includeClass.some((c) => current!.classList.contains(c))) return true;
                current = current.parentElement;
            }
            return false;
        };

        const isExcluded = (element: HTMLElement): boolean => {
            let current: HTMLElement | null = element;
            while (current) {
                if (excludeClass.some((c) => current!.classList.contains(c))) return true;
                current = current.parentElement;
            }
            return false;
        };

        const currentHost = window.location.host;
        const links = [...document.getElementsByTagName("a")];
        if (links.length === 0) return;

        for (const link of links) {
            if (isExcluded(link)) continue;
            if (!hasClassInTree(link)) continue;

            // 图片链接（fancybox 灯箱 / 图链）：不做外链重定向、不加图标
            if (link.querySelector("img")) continue;

            const href = link.getAttribute("href");
            if (!href || href.includes(REDIRECT_PAGE)) continue;
            if (!isExternalUrl(href, currentHost)) continue;

            link.setAttribute("original-href", href);
            link.setAttribute("href", `${REDIRECT_PAGE}${toUrlSafeBase64(href)}`);
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener noreferrer");

            appendExternalLinkIcon(link);
        }
    } catch (error) {
        console.error("处理链接时出错：", error);
    }
}

// 确保 View Transitions 跨页面导航时只注册一次监听器
let _redirectBound = false;
if (!_redirectBound) {
    _redirectBound = true;
    onPageReady(initRedirectHandler);
}
