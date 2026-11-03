import { defineConfig } from "astro/config";
import os from "node:os";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";
import mdx from "@astrojs/mdx";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm"; // GitHub Flavored Markdown
import rehypeSlug from "rehype-slug"; // 标题添加ID
import rehypeAutolinkHeadings from "rehype-autolink-headings"; // 标题添加锚点
import rehypeComponents from "rehype-components"; /* Render the custom directive content */
import { remarkCodeBlocks } from "./src/remark-plugin/remark-code-blocks.ts";
import { remarkInlineSyntax } from "./src/remark-plugin/remark-inline-syntax.ts";
import { remarkAsides } from "./src/remark-plugin/remark-asides.ts";
import { remarkImageGrid } from "./src/remark-plugin/remark-image-grid.ts";
import { remarkGithubCard } from "./src/remark-plugin/remark-github-card.ts";
import { GithubCardComponent } from "./src/rehype-plugin/rehype-github-card.ts";
import { remarkTabs } from "./src/remark-plugin/remark-tabs.ts";
import { remarkAlign } from "./src/remark-plugin/remark-align.ts";
import { remarkInclude } from "./src/remark-plugin/remark-include.ts";
import { site as siteCfg } from "./src/config/site.ts";
import { loadEnvFile } from "./scripts/lib/env.mjs";

// 将 .env 载入 process.env（本地开发/构建供 remark-encrypted 等读取；CI 无 .env 时静默跳过）
loadEnvFile();
import { remarkEncrypted } from "./src/remark-plugin/remark-encrypted.ts";
import { rehypeEncrypted } from "./src/remark-plugin/rehype-encrypted.ts";
import expressiveCode from "astro-expressive-code";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";
import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import redirectAttributeByLink from "./src/integrations/redirect.ts";
import { searchPagefind } from "./src/integrations/pagefind.ts";
import ogImage from "./src/integrations/og-image.ts";
import { pagefindConfig } from "./src/schemas/pagefind";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import rehypeCallouts from "rehype-callouts";
import astroVtBot from "astro-vtbot";
import { VitePWA } from "vite-plugin-pwa";
import swup from "@swup/astro";

// ── PWA ──────────────────────────────────────────────────────────────────────
// Astro 7（Vite 7 环境模型）下，vite-plugin-pwa 自身的 closeBundle 不会在 client
// 构建中执行，导致 sw.js 从不生成（而 registerSW.js 仍被注入注册 → 线上 404）。
// 这里在 astro:build:done 阶段显式调用插件的 api.generateSW() 补上生成步骤；
// 该 integration 放在 integrations 末尾，确保 precache 清单收录 pagefind/og 等
// 构建收尾产物。2026-10-03 修复。
// 预览构建（PREVIEW_BUILD=1）不装 Service Worker：
// SW 会预缓存全部 HTML（400+ 页），一旦重新部署换了资源 hash，
// 旧 HTML 引用的 CSS 已不在新部署里 → 页面白屏无样式（实测踩到）。
const isPreviewBuild = process.env.PREVIEW_BUILD === "1";

const pwaPlugins = isPreviewBuild
    ? []
    : VitePWA({
          registerType: "autoUpdate",
          workbox: {
              // ⚠️ HTML 不进预缓存（R-26 / D-0062）：
              // 每次部署 hashed 资源全换，预缓存里的旧 HTML 会引用已删除的 CSS，
              // 已装 SW 的访客看到的是「页面没有任何样式」。
              // 现在 HTML 一律走网络（见下方 navigate 规则 NetworkFirst），
              // 预缓存只保留构建产物里 hash 稳定的静态资源。
              globPatterns: ["**/*.{js,css,woff2,woff,svg,ico}"],
              // 必须显式关掉：插件默认会注册
              // NavigationRoute(createHandlerBoundToURL("index.html"))，
              // 而 index.html 已不在预缓存清单里 → Workbox 在 SW 启动时抛
              // non-precached-url，整个 SW 装不上（比样式丢失更难查）。
              navigateFallback: null,
              cleanupOutdatedCaches: true,
              runtimeCaching: [
                  {
                      // 页面导航：先走网络，4s 超时才回退缓存（离线可读最近访问的页面）。
                      // 原规则是 StaleWhileRevalidate 且匹配全站同源请求，
                      // 等于所有 HTML 先返回缓存——部署换 hash 后就露馅。
                      urlPattern: ({ request }) => request.mode === "navigate",
                      handler: "NetworkFirst",
                      options: {
                          cacheName: "pages-cache",
                          networkTimeoutSeconds: 4,
                          expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
                      },
                  },
                  {
                      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
                      handler: "CacheFirst",
                      options: {
                          cacheName: "images-cache",
                          expiration: { maxEntries: 200, maxAgeSeconds: 2592000 },
                      },
                  },
                  {
                      urlPattern: /\.(?:woff2?|ttf|otf|eot)$/,
                      handler: "CacheFirst",
                      options: {
                          cacheName: "fonts-cache",
                          expiration: { maxEntries: 50, maxAgeSeconds: 2592000 },
                      },
                  },
              ],
          },
          manifest: {
              name: siteCfg.title,
              short_name: siteCfg.shortName ?? siteCfg.title,
              description: siteCfg.pwaDescription ?? siteCfg.description,
              theme_color: "#c2413b",
              background_color: "#ffffff",
              display: "standalone",
              icons: [
                  {
                      src: "/favicon.svg",
                      sizes: "any",
                      type: "image/svg+xml",
                  },
              ],
          },
      });

const pwaServiceWorker = {
    name: "pwa-service-worker",
    hooks: {
        "astro:build:done": async ({ dir, logger }) => {
            if (isPreviewBuild) {
                // 预览构建写一个「自毁 SW」：浏览器每次导航都会取一次 sw.js，
                // 拿到新脚本就会安装→激活→清空所有 cache→自我注销→重载窗口。
                // 不写这个文件的话，已装旧 SW 的浏览器会一直拿缓存里的旧 HTML
                // （旧 CSS hash 已随新部署消失 = 页面没样式），且永远等不到更新。
                await writeFile(
                    new URL("sw.js", dir),
                    `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
            await self.registration.unregister();
            const clients = await self.clients.matchAll({ type: "window" });
            clients.forEach((c) => c.navigate(c.url));
        })(),
    );
});
`,
                );
                logger.info("PWA: 预览构建，已写入自毁 sw.js");
                return;
            }
            const main = pwaPlugins.find((p) => p && p.name === "vite-plugin-pwa");
            const api = main?.api;
            if (!api) {
                logger.warn("PWA: vite-plugin-pwa api 未找到，sw.js 未生成");
                return;
            }
            await api.generateSW();
            logger.info("PWA: service worker (sw.js) generated");
        },
    },
};

// ── Sitemap 预览样式 ──────────────────────────────────────────────────────────
// @astrojs/sitemap 的 xslURL 只会输出 text/xsl（XSLT 已被各浏览器弃用），
// 这里在构建收尾统一注入显式 type="text/css" 的预览样式处理指令（与 feed 预览同款方案）。
// 必须排在 integrations 中 sitemap() 之后：其写盘发生在 astro:build:done。
const sitemapPreviewStylesheet = {
    name: "sitemap-preview-stylesheet",
    hooks: {
        "astro:build:done": async ({ dir, logger }) => {
            const distDir = fileURLToPath(dir);
            const pi = '<?xml-stylesheet href="/assets/rss/styles.css" type="text/css"?>';
            let patched = 0;
            for (const name of await readdir(distDir)) {
                if (!/^sitemap(-\d+)?\.xml$/.test(name) && name !== "sitemap-index.xml") continue;
                const file = join(distDir, name);
                const xml = await readFile(file, "utf8");
                if (xml.includes("xml-stylesheet")) continue;
                await writeFile(file, xml.replace(/(<\?xml[^>]*\?>)/, `$1${pi}`));
                patched += 1;
            }
            if (patched > 0) logger.info(`sitemap 预览样式：已注入 ${patched} 个文件`);
        },
    },
};

// https://astro.build/config
export default defineConfig({
    site: siteCfg.url,
    // /blog 与 /en/blog 本身无页面（规范入口为 /blog/1/）：加跳转兜底，避免历史外链 404（2026-10 审计）
    redirects: {
        "/blog": "/blog/1/",
        "/en/blog": "/en/blog/1/",
    },
    prefetch: {
        defaultStrategy: "hover",
    },
    // i18n 配置
    i18n: {
        defaultLocale: "zh",
        locales: ["zh", "en"],
        routing: {
            prefixDefaultLocale: false, // 默认语言(中文)不带前缀
        },
    },
    markdown: {
        processor: unified({
            remarkPlugins: [
                [remarkMath, { singleDollarTextMath: false }],
                remarkInlineSyntax,
                remarkCodeBlocks,
                remarkDirective,
                remarkInclude,
                remarkAlign,
                remarkAsides({}),
                remarkGfm,
                remarkImageGrid,
                remarkGithubCard,
                remarkTabs,
                remarkEncrypted,
            ],
            rehypePlugins: [
                rehypeKatex,
                rehypeCallouts,
                rehypeSlug, // 标题添加ID
                [rehypeAutolinkHeadings, { behavior: "append" }], // 标题添加锚点
                [rehypeComponents, { components: { github: GithubCardComponent } }],
                rehypeEncrypted,
            ],
        }),
    },
    integrations: [
        redirectAttributeByLink(),
        // 站内导航过渡（D-0049）：swup core 9.0KB gz + scroll-plugin 3.8KB gz，
        // 替代已移除的 ClientRouter（98.5KB gz）。容器取 <main>，导航/页脚不动。
        swup({
            // 不用 fade 主题（D-0084）：@swup/astro 的默认值就是 "fade"，必须显式 false 才关得掉。：它把「淡出 → 替换内容 → 淡入」串成一条链，
            // swup 必须等淡出跑完才换内容。本地实测 content:replace 落在
            // 0s→46ms、0.2s→831ms、0.4s→673ms、1s→2403ms —— 换页慢的主因在这里，
            // 不在网络。@swup/astro 的 theme 默认值就是 "fade"，所以必须显式传 false 才真的关掉；
            // 改用「先替换、再用 CSS 播 0.18s 淡入」的写法（page-lifecycle.ts + base.css）。
            theme: false,
            containers: ["main"],
            cache: true,
            // 预取：悬停 + 进入视口的链接（默认只开 hover，visible 要显式开）
            // visible 会在链接进视口 500ms 后抓 HTML 进 swup cache，点导航就命中缓存、不再等网络
            preload: { hover: true, visible: true },
            accessibility: true,
            smoothScrolling: true,
            // awaitAssets:true —— 等新页样式表加载完再替换内容：宁可多等几十毫秒，也不要「裸样式一闪」；
            // persistAssets:false —— **必须**在换页时移除旧页面的样式表。曾经为了「不闪裸页」设成 true，
            //   结果首页的 HomeContent.css 一直留在 head 里，它的
            //   `.post-card-title{font-size:var(--text-lg);font-weight:400}` 会命中文档页的同名元素，
            //   把列表页标题从 30px/600 压成 18px/400 —— 也就是「文章卡片样式不对，刷新之后才正常」。
            updateHead: { awaitAssets: true, persistAssets: false },
            // 顶栏进度条：慢链路下有反馈，不至于「点了没反应」
            progress: true,
            reloadScripts: true,
            loadOnIdle: false,
            globalInstance: true,
        }),
        ogImage(),
        sitemap({
            // 多语言站点地图配置
            i18n: {
                defaultLocale: "zh",
                locales: {
                    zh: "zh-CN",
                    en: "en-US",
                },
            },
            // 过滤不需要收录的页面
            filter: (page) => {
                // 设计实验页不进 sitemap（16-m1-brief §3.4：不放进主导航；不参与 sitemap）
                if (page.includes("/design/")) {
                    return false;
                }
                // 排除跳转中转页
                if (page === `${siteCfg.url}/redirect/` || page === `${siteCfg.url}/en/redirect/`) {
                    return false;
                }
                // 英文文章页（/en/article/）：仅当文章确实为 lang: en 时才会生成该路由，
                // 故不再排除；hreflang 配对由页面内 SeoLinks 显式计算（2026-10 双语完整化）
                // 排除标签页（已设置 noindex）
                if (page.includes("/tags/")) {
                    return false;
                }
                // 排除博客分页
                if (/\/blog\/\d+\/$/.test(page)) {
                    return false;
                }
                // 排除薄内容页
                const thinPages = [
                    "/albums/",
                    "/en/albums/",
                    "/bangumi/",
                    "/en/bangumi/",
                    "/talks/",
                    "/en/talks/",
                    "/donate/",
                    "/en/donate/",
                    "/cookies/",
                    "/en/cookies/",
                    "/copyright/",
                    "/en/copyright/",
                    "/friends/",
                    "/en/friends/",
                ];
                if (thinPages.some((p) => page.includes(p))) {
                    return false;
                }
                return true;
            },
        }),
        icon(),
        expressiveCode({
            plugins: [pluginLineNumbers(), pluginCollapsibleSections()],
            themes: ["github-dark"],
            useDarkModeMediaQuery: false,
            // 启用复制按钮
            enableCopyButton: true,
            // 显示语言标识
            showLanguage: true,
            // 优化渲染性能
            renderInPlace: true,
        }),
        mdx(),
        {
            name: "pagefind-integration",
            hooks: {
                "astro:build:done": async ({ dir, logger }) => {
                    await searchPagefind({ dir, logger, pagefindConfig });
                },
            },
        },
        astroVtBot({
            viewTransitionsFallback: "animate",
        }),
        pwaServiceWorker,
        sitemapPreviewStylesheet,
    ],
    image: {
        layout: "constrained",
        responsiveStyles: true,
        domains: ["avatars.githubusercontent.com"],
        remotePatterns: [
            {
                protocol: "https",
                hostname: "avatars.githubusercontent.com",
            },
        ],
        service: {
            entrypoint: "astro/assets/services/sharp",
            config: {
                limitInputPixels: false,
            },
        },
    },
    trailingSlash: "always",
    output: "static",
    // 构建输出配置
    build: {
        concurrency: Number(process.env.BUILD_CONCURRENCY) || os.cpus().length,
    },
    vite: {
        plugins: [...pwaPlugins],
        // 预览构建整段编译掉 SW 注册（预览写的是自毁 sw.js，注册会无限重载）
        define: {
            __PWA_ENABLED__: JSON.stringify(!isPreviewBuild),
        },
        build: {
            // esbuild 比 terser 内存占用更低，适合内存受限的 CI 构建环境
            minify: "esbuild",
            // 静态资源哈希，用于缓存失效
            assetsDir: "assets",
            rollupOptions: {
                output: {
                    entryFileNames: "assets/[name].[hash].js",
                    chunkFileNames: "assets/[name].[hash].js",
                    assetFileNames: "assets/[name].[hash].[ext]",
                    // 代码分割：按模块拆分JS
                    manualChunks(id) {
                        if (id.includes("node_modules")) {
                            // pageview 单独成 chunk（文章/列表页浏览计数会静态引入，
                            // 避免把整个 @waline/client 主包连带提前加载；主包仅在
                            // 用户首次展开评论时按需加载）2026-10-03
                            if (id.includes("@waline")) {
                                // ?url 资源模块（waline.css?url）不能并入懒加载主包，
                                // 否则按需 import 的 URL 字符串会把整个主包拖成同步依赖
                                if (id.includes("?") || id.endsWith(".css")) return undefined;
                                if (id.includes("pageview")) return "waline-pv";
                                return "waline";
                            }
                            if (id.includes("astro-icon")) return "icons";
                            // 不再兜底塞 "vendor"：懒加载专用包（fancybox / vue / marked /
                            // recaptcha）与首屏包被并进同一 chunk 后，Rollup 只能让首屏
                            // 整块加载，动态 import 等于白做（D-0052）。交给 Rollup 自动切分。
                        }
                    },
                },
            },
        },
        // CSS 优化
        cssCodeSplit: true,
        cssMinify: "esbuild",
        assetsInlineLimit: 4096,
        // 构建性能优化
        cacheDir: ".vite-cache",
        optimizeDeps: {
            include: ["astro-icon", "@waline/client"],
            exclude: [],
        },
    },
});
