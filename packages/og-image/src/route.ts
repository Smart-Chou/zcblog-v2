/**
 * OG 图 route factory（Satori → SVG → Sharp → PNG）。
 *
 * 抽取自 `src/integrations/og-image-route.ts`（M3-4）。与原实现的差别**只有依赖方向**：
 * 文章列表、站点身份、调色板不再 `import` 站点代码（`src/config`、`src/utils/article-stats`），
 * 全部由主题侧以 `options` 注入（§3.3）。渲染树、字号、间距、缓存头逐字保留，
 * 抽取前后同一篇文章产出的 PNG 逐字节一致。
 *
 * 字体：`options.fonts` 可覆盖（URL 或本地路径）。CDN 失败**抛错**并提示覆盖方式，
 * 不静默降级成无字体渲染。
 */
import type { APIRoute } from "astro";
import satori from "satori";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import type { OgImageFonts, OgImageOptions, OgImagePost } from "./types.js";

const DEFAULT_FONT_URLS: OgImageFonts = {
    regular:
        "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf",
    bold: "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf",
};

/** 版式默认值：与抽取前 `og-image-route.ts` 的字面量一一对应。 */
const DEFAULT_MUTED = "#8b949e";
const DEFAULT_SUBTLE = "#5c6370";
const DEFAULT_DIVIDER = "rgba(255,255,255,0.08)";
const FONT_FAMILY = "Noto Sans SC";
const DEFAULT_FONT_CACHE = path.join(process.cwd(), ".astro", "fonts");
const OVERRIDE_HINT = "可传 options.fonts 指向本地字体文件（离线构建）";

/* ───────────────────────── 颜色 ───────────────────────── */

/**
 * 由强调色派生半透明版本（装饰圆用）。
 * 只解析 `#rgb` / `#rrggbb`；其它写法（`rgba()`、`hsl()`）原样返回，不做猜测。
 */
function withAlpha(color: string, alpha: number): string {
    const hex = color.trim();
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
    if (!match) return hex;
    const digits = match[1];
    const full =
        digits.length === 3
            ? digits
                  .split("")
                  .map((char) => char + char)
                  .join("")
            : digits;
    const r = Number.parseInt(full.slice(0, 2), 16);
    const g = Number.parseInt(full.slice(2, 4), 16);
    const b = Number.parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ───────────────────────── 字体 ───────────────────────── */

const isRemote = (source: string) => /^https?:\/\//i.test(source);

/**
 * 缓存文件名：取 URL 的 basename（与抽取前的 `.astro/fonts/NotoSansSC-*.otf` 同名，
 * 命中已有缓存，不重复下载），旁边写一个 `<name>.source` 记录来源 URL；
 * 同名的不同来源不能互相冒充，冲突时改用带 hash 的文件名。
 */
function cacheTarget(cacheDir: string, source: string): string {
    const base = path.basename(new URL(source).pathname) || "font.otf";
    const plain = path.join(cacheDir, base);
    const sidecar = `${plain}.source`;
    if (!fs.existsSync(plain)) return plain;
    if (!fs.existsSync(sidecar)) {
        // 抽取前的历史缓存：来源未知但确由默认 CDN 写入，直接认领，避免重复下载 6MB。
        fs.writeFileSync(sidecar, source, "utf8");
        return plain;
    }
    if (fs.readFileSync(sidecar, "utf8").trim() === source) return plain;
    const digest = Buffer.from(source).toString("base64url").slice(-12);
    const ext = path.extname(base);
    return path.join(cacheDir, `${path.basename(base, ext)}-${digest}${ext}`);
}

async function fetchFont(url: string, dest: string, label: string): Promise<Buffer> {
    let response: Response;
    try {
        response = await fetch(url);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
            `[og-image] 字体下载失败（${label}）：${reason}。源=${url}；${OVERRIDE_HINT}。`,
            { cause: error },
        );
    }
    if (!response.ok) {
        throw new Error(
            `[og-image] 字体下载失败（${label}）：HTTP ${response.status}。源=${url}；${OVERRIDE_HINT}。`,
        );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
        throw new Error(
            `[og-image] 字体下载失败（${label}）：响应为空。源=${url}；${OVERRIDE_HINT}。`,
        );
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buffer);
    if (isRemote(url)) fs.writeFileSync(`${dest}.source`, url, "utf8");
    return buffer;
}

async function loadFont(source: string, label: string, cacheDir: string): Promise<Buffer> {
    if (!isRemote(source)) {
        const local = path.resolve(source);
        if (!fs.existsSync(local)) {
            throw new Error(`[og-image] 字体文件不存在（${label}）：${local}；${OVERRIDE_HINT}。`);
        }
        return fs.readFileSync(local);
    }
    const dest = cacheTarget(cacheDir, source);
    if (fs.existsSync(dest)) {
        try {
            return fs.readFileSync(dest);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`[og-image] 字体缓存不可读（${label}）：${dest} — ${reason}。`);
        }
    }
    return fetchFont(source, dest, label);
}

/* ───────────────────────── 入口 ───────────────────────── */

function assertOptions(options: OgImageOptions): void {
    const missing: string[] = [];
    if (!Array.isArray(options?.posts)) missing.push("posts[]");
    if (!options?.site?.title) missing.push("site.title");
    if (!options?.site?.url) missing.push("site.url");
    if (!options?.theme?.background) missing.push("theme.background");
    if (!options?.theme?.foreground) missing.push("theme.foreground");
    if (!options?.theme?.accent) missing.push("theme.accent");
    if (missing.length) {
        throw new Error(`[og-image] createOgImageRoute 缺少必填选项：${missing.join(", ")}。`);
    }
}

/** 从 `context.params.og` 取 slug（`/og/[...og].png` 的 rest 参数）。 */
function readSlug(
    params: Record<string, string | string[] | undefined> | undefined,
): string | null {
    const raw = params?.og;
    if (typeof raw === "string" && raw.length > 0) return raw;
    if (Array.isArray(raw) && raw.length > 0) return raw.join("/");
    return null;
}

/**
 * 建一个 `/og/[...og].png` 的 `APIRoute`。
 *
 * 站点侧仍需自己导出 `getStaticPaths()`（静态构建的枚举属于主题侧知识），
 * 并在 `props`/`params` 里把 slug 传进来 —— 与 `options.posts[].slug` 对齐。
 */
export function createOgImageRoute(options: OgImageOptions): APIRoute {
    assertOptions(options);

    const posts = new Map<string, OgImagePost>();
    for (const post of options.posts) posts.set(post.slug, post);

    const fonts = options.fonts ?? DEFAULT_FONT_URLS;
    const cacheDir = options.fontCacheDir ?? DEFAULT_FONT_CACHE;
    const theme = options.theme;
    const background =
        theme.gradient ??
        `linear-gradient(135deg, ${theme.background} 0%, ${theme.background} 40%, ${theme.background} 100%)`;
    const muted = theme.muted ?? DEFAULT_MUTED;
    const subtle = theme.subtle ?? DEFAULT_SUBTLE;
    const divider = theme.divider ?? DEFAULT_DIVIDER;
    const siteUrl = options.site.url.replace("https://", "");

    // 一个 factory 只下载一次字体；并发请求共享同一个 Promise（失败也共享，直接抛错）
    let fontPromise: Promise<{ regular: Buffer; bold: Buffer }> | null = null;
    const loadFonts = () => {
        fontPromise ??= Promise.all([
            loadFont(fonts.regular, "regular", cacheDir),
            loadFont(fonts.bold, "bold", cacheDir),
        ]).then(([regular, bold]) => ({ regular, bold }));
        return fontPromise;
    };

    return async ({ params }) => {
        const slug = readSlug(params);
        const post = slug ? posts.get(slug) : undefined;
        if (!post) {
            return new Response(`og-image: 未知文章 slug「${slug ?? ""}」`, {
                status: 404,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
        }

        const { regular, bold } = await loadFonts();

        const title = post.title || "Article";
        const description = post.description || options.site.description || "";

        // CJK 字符约 2x 拉丁字符宽度，1200px 容器 80px 字号约放 12-14 个 CJK 字
        const isCJK = /[一-鿿㐀-䶿]/.test(title);
        const maxLen = isCJK ? 14 : 42;
        const displayTitle = title.length > maxLen ? title.slice(0, maxLen) + "…" : title;
        const displayDesc =
            description.length > 100 ? description.slice(0, 100) + "…" : description;

        const svg = await satori(
            {
                type: "div",
                props: {
                    style: {
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        // satori 0.27+ 把默认盒模型从 border-box 改成 CSS 默认的 content-box：
                        // 不显式声明时，1200×630 画布会被 padding(88/72/56)+borderLeft(6) 撑成
                        // 1382×758，页脚行与右下装饰点被挤出画布裁掉。显式 border-box 在 0.26 上
                        // 是空操作（出图与升级前逐字节一致，见 docs/_reviews/M4-9/report.md）。
                        boxSizing: "border-box",
                        padding: "72px 88px 56px",
                        backgroundImage: background,
                        borderLeftWidth: "6px",
                        borderLeftStyle: "solid",
                        borderLeftColor: theme.accent,
                        position: "relative",
                    },
                    children: [
                        {
                            type: "div",
                            props: {
                                style: {
                                    position: "absolute",
                                    top: "-60px",
                                    right: "-60px",
                                    width: "280px",
                                    height: "280px",
                                    borderRadius: "50%",
                                    backgroundColor: withAlpha(theme.accent, 0.07),
                                },
                            },
                        },
                        {
                            type: "div",
                            props: {
                                style: {
                                    position: "absolute",
                                    bottom: "48px",
                                    right: "88px",
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    backgroundColor: withAlpha(theme.accent, 0.6),
                                },
                            },
                        },
                        {
                            type: "div",
                            props: {
                                children: displayTitle,
                                style: {
                                    fontSize: "80px",
                                    fontWeight: 700,
                                    color: theme.foreground,
                                    letterSpacing: "-0.3px",
                                    lineHeight: "1.35",
                                },
                            },
                        },
                        {
                            type: "div",
                            props: {
                                style: {
                                    width: "100px",
                                    height: "4px",
                                    backgroundColor: theme.accent,
                                    marginTop: "28px",
                                    borderRadius: "2px",
                                },
                            },
                        },
                        {
                            type: "div",
                            props: {
                                children: displayDesc,
                                style: {
                                    fontSize: "24px",
                                    fontWeight: 400,
                                    color: muted,
                                    marginTop: "24px",
                                    lineHeight: "1.55",
                                },
                            },
                        },
                        { type: "div", props: { style: { flexGrow: 1 } } },
                        {
                            type: "div",
                            props: {
                                style: {
                                    borderTopWidth: "1px",
                                    borderTopStyle: "solid",
                                    borderTopColor: divider,
                                    paddingTop: "24px",
                                    display: "flex",
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                },
                                children: [
                                    {
                                        type: "div",
                                        props: {
                                            children: siteUrl,
                                            style: {
                                                fontSize: "18px",
                                                fontWeight: 400,
                                                color: subtle,
                                                letterSpacing: "0.2px",
                                            },
                                        },
                                    },
                                    {
                                        type: "div",
                                        props: {
                                            children: options.site.title,
                                            style: {
                                                fontSize: "18px",
                                                fontWeight: 400,
                                                color: subtle,
                                            },
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
            {
                width: 1200,
                height: 630,
                fonts: [
                    { name: FONT_FAMILY, data: regular, weight: 400 },
                    { name: FONT_FAMILY, data: bold, weight: 700 },
                ],
            },
        );

        const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

        return new Response(new Uint8Array(pngBuffer), {
            headers: {
                "Content-Type": "image/png",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    };
}
