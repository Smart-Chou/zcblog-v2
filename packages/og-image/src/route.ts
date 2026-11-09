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

/* ───────────────────────── 版式 ───────────────────────── */

/**
 * 一套版式参数。`OG_LAYOUT` 与抽取前的字面量一一对应（逐像素基线），
 * `POSTER_LAYOUT` 是 M7-3b 的 3:4 变体：同一模板、同一棵树，只换尺寸/字号/间距
 * 并追加「顶部元信息行」与「tags 胶囊行」。默认分支不会渲染这两块。
 */
interface CardLayout {
    width: number;
    height: number;
    paddingTop: number;
    paddingX: number;
    paddingBottom: number;
    titleSize: number;
    titleLineHeight: number;
    /** 标题截断预算（字符数）：CJK 约 2x 拉丁宽度，分别给两档。 */
    titleMaxCjk: number;
    titleMaxLatin: number;
    dividerWidth: number;
    dividerHeight: number;
    dividerMarginTop: number;
    descSize: number;
    descLineHeight: number;
    descMarginTop: number;
    descMaxChars: number;
    /** 摘要是否包在色块里（海报用；OG 为 null = 裸文本，与抽取前一致）。 */
    descBox: {
        padding: string;
        radius: number;
        marginTop: number;
        alpha: number;
        /** 面板吃掉部分剩余纵向空间（文字在面板内垂直居中），让海报不留大片空底。 */
        grow: boolean;
        /** 面板高度上限：防止短摘要被拉成一大片空色块（null = 不限）。 */
        maxHeight: number | null;
    } | null;
    /** tags 胶囊行（海报用；OG 为 null = 不渲染）。 */
    tags: { size: number; padding: string; marginTop: number; gap: number; alpha: number } | null;
    /** 顶部元信息行：站点标识 + 日期（海报用）。 */
    meta: { size: number; letterSpacing: string; marginBottom: number } | null;
    decorCircle: { top: number; right: number; size: number };
    decorDot: { bottom: number; right: number; size: number };
    footerSize: number;
    footerPaddingTop: number;
}

const OG_LAYOUT: CardLayout = {
    width: 1200,
    height: 630,
    paddingTop: 72,
    paddingX: 88,
    paddingBottom: 56,
    titleSize: 80,
    titleLineHeight: 1.35,
    titleMaxCjk: 14,
    titleMaxLatin: 42,
    dividerWidth: 100,
    dividerHeight: 4,
    dividerMarginTop: 28,
    descSize: 24,
    descLineHeight: 1.55,
    descMarginTop: 24,
    descMaxChars: 100,
    descBox: null,
    tags: null,
    meta: null,
    decorCircle: { top: -60, right: -60, size: 280 },
    decorDot: { bottom: 48, right: 88, size: 8 },
    footerSize: 18,
    footerPaddingTop: 24,
};

/**
 * 1200×1600（3:4）海报。内容宽 = 1200 − 96×2 − 6（左侧竖条）= 1002px：
 * 标题 92px/行高 1.3 → 每行约 10 个 CJK 字，截断预算 38 字 ≈ 4 行（≤478px）；
 * 摘要 28px/行高 1.65、盒内宽 930px → 每行约 33 个 CJK 字，预算 220 字 ≈ 7 行（≤387px）。
 * 全部预算按「最坏情况」留白：垂直占用约 1175px < 可用 1432px，中间由 flexGrow 吸收。
 */
const POSTER_LAYOUT: CardLayout = {
    width: 1200,
    height: 1600,
    paddingTop: 88,
    paddingX: 96,
    paddingBottom: 80,
    titleSize: 92,
    titleLineHeight: 1.3,
    titleMaxCjk: 38,
    titleMaxLatin: 76,
    dividerWidth: 120,
    dividerHeight: 4,
    dividerMarginTop: 40,
    descSize: 28,
    descLineHeight: 1.65,
    descMarginTop: 0,
    descMaxChars: 220,
    descBox: {
        padding: "40px 48px",
        radius: 18,
        marginTop: 36,
        alpha: 0.07,
        grow: true,
        maxHeight: 640,
    },
    tags: { size: 22, padding: "10px 20px", marginTop: 40, gap: 12, alpha: 0.14 },
    meta: { size: 20, letterSpacing: "1.4px", marginBottom: 56 },
    decorCircle: { top: -80, right: -80, size: 360 },
    decorDot: { bottom: 72, right: 96, size: 8 },
    footerSize: 20,
    footerPaddingTop: 28,
};

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
    const layout = options.poster ? POSTER_LAYOUT : OG_LAYOUT;
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

        // CJK 字符约 2x 拉丁字符宽度：1200px 容器下 OG 的 80px 字号约放 12-14 个 CJK 字，
        // 海报的 92px 字号约放 10 个。截断预算跟着版式走（见 OG_LAYOUT / POSTER_LAYOUT），
        // 预算取值保证「最坏情况」也放得下，宁可截断也不让文字撞页脚或溢出画布。
        const isCJK = /[一-鿿㐀-䶿]/.test(title);
        const maxLen = isCJK ? layout.titleMaxCjk : layout.titleMaxLatin;
        const displayTitle = title.length > maxLen ? title.slice(0, maxLen) + "…" : title;
        const displayDesc =
            description.length > layout.descMaxChars
                ? description.slice(0, layout.descMaxChars) + "…"
                : description;

        // 海报顶部元信息行的日期（YYYY-MM-DD，不做 locale 猜测；非法日期留空）
        const metaDate =
            post.pubDate instanceof Date && !Number.isNaN(post.pubDate.getTime())
                ? post.pubDate.toISOString().slice(0, 10)
                : "";

        const tagsSpec = layout.tags;
        const chips =
            tagsSpec && Array.isArray(post.tags) && post.tags.length > 0 ? post.tags : null;

        const descNode = {
            type: "div",
            props: {
                children: displayDesc,
                style: {
                    fontSize: `${layout.descSize}px`,
                    fontWeight: 400,
                    color: muted,
                    marginTop: `${layout.descMarginTop}px`,
                    lineHeight: `${layout.descLineHeight}`,
                },
            },
        };

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
                        padding: `${layout.paddingTop}px ${layout.paddingX}px ${layout.paddingBottom}px`,
                        backgroundImage: background,
                        borderLeftWidth: "6px",
                        borderLeftStyle: "solid",
                        borderLeftColor: theme.accent,
                        position: "relative",
                    },
                    children: [
                        // 海报专属：顶部「站点标识 / 日期」元信息行。OG 分支（meta=null）不渲染。
                        ...(layout.meta
                            ? [
                                  {
                                      type: "div",
                                      props: {
                                          style: {
                                              display: "flex",
                                              flexDirection: "row",
                                              justifyContent: "space-between",
                                              alignItems: "center",
                                              marginBottom: `${layout.meta.marginBottom}px`,
                                          },
                                          children: [
                                              {
                                                  type: "div",
                                                  props: {
                                                      children: options.site.title,
                                                      style: {
                                                          fontSize: `${layout.meta.size}px`,
                                                          fontWeight: 700,
                                                          color: theme.accent,
                                                          letterSpacing: layout.meta.letterSpacing,
                                                      },
                                                  },
                                              },
                                              {
                                                  type: "div",
                                                  props: {
                                                      children: metaDate,
                                                      style: {
                                                          fontSize: `${layout.meta.size}px`,
                                                          fontWeight: 400,
                                                          color: subtle,
                                                          letterSpacing: layout.meta.letterSpacing,
                                                      },
                                                  },
                                              },
                                          ],
                                      },
                                  },
                              ]
                            : []),
                        {
                            type: "div",
                            props: {
                                style: {
                                    position: "absolute",
                                    top: `${layout.decorCircle.top}px`,
                                    right: `${layout.decorCircle.right}px`,
                                    width: `${layout.decorCircle.size}px`,
                                    height: `${layout.decorCircle.size}px`,
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
                                    bottom: `${layout.decorDot.bottom}px`,
                                    right: `${layout.decorDot.right}px`,
                                    width: `${layout.decorDot.size}px`,
                                    height: `${layout.decorDot.size}px`,
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
                                    fontSize: `${layout.titleSize}px`,
                                    fontWeight: 700,
                                    color: theme.foreground,
                                    letterSpacing: "-0.3px",
                                    lineHeight: `${layout.titleLineHeight}`,
                                },
                            },
                        },
                        {
                            type: "div",
                            props: {
                                style: {
                                    width: `${layout.dividerWidth}px`,
                                    height: `${layout.dividerHeight}px`,
                                    backgroundColor: theme.accent,
                                    marginTop: `${layout.dividerMarginTop}px`,
                                    borderRadius: "2px",
                                },
                            },
                        },
                        // 海报把摘要放进色块（descBox 存在且摘要有内容时）；OG 分支和空摘要
                        // 都走裸文本节点，与抽取前一致（空摘要仍占 marginTop，保持像素基线）。
                        ...(layout.descBox && displayDesc.length > 0
                            ? [
                                  {
                                      type: "div",
                                      props: {
                                          style: {
                                              display: "flex",
                                              ...(layout.descBox.grow
                                                  ? {
                                                        flexGrow: 1,
                                                        alignItems: "center",
                                                        ...(layout.descBox.maxHeight
                                                            ? {
                                                                  maxHeight: `${layout.descBox.maxHeight}px`,
                                                              }
                                                            : {}),
                                                    }
                                                  : {}),
                                              backgroundColor: withAlpha(
                                                  theme.accent,
                                                  layout.descBox.alpha,
                                              ),
                                              borderRadius: `${layout.descBox.radius}px`,
                                              padding: layout.descBox.padding,
                                              marginTop: `${layout.descBox.marginTop}px`,
                                          },
                                          children: [descNode],
                                      },
                                  },
                              ]
                            : [descNode]),
                        // OG 分支：弹性空档在摘要和页脚之间（与抽取前一致）；
                        // 海报分支把 tags 行拉到同一个空档之下，形成「内容块 + 底部轨道」。
                        // 有 tags 时不要再插弹性占位：否则 descBox 的 flexGrow 只分到
                        // 一半剩余高度，摘要与 tags 之间会留下无意义的大空档。
                        { type: "div", props: { style: { flexGrow: tagsSpec ? 0 : 1 } } },
                        // 海报专属：tags 胶囊行（OG 分支 tags=null 或文章无 tags 时不渲染）。
                        ...(tagsSpec && chips
                            ? [
                                  {
                                      type: "div",
                                      props: {
                                          style: {
                                              display: "flex",
                                              flexDirection: "row",
                                              flexWrap: "wrap",
                                              gap: `${tagsSpec.gap}px`,
                                              marginTop: `${tagsSpec.marginTop}px`,
                                          },
                                          children: chips.map((tag) => ({
                                              type: "div",
                                              props: {
                                                  children: `#${tag}`,
                                                  style: {
                                                      fontSize: `${tagsSpec.size}px`,
                                                      fontWeight: 400,
                                                      color: theme.foreground,
                                                      padding: tagsSpec.padding,
                                                      borderRadius: "999px",
                                                      backgroundColor: withAlpha(
                                                          theme.accent,
                                                          tagsSpec.alpha,
                                                      ),
                                                  },
                                              },
                                          })),
                                      },
                                  },
                              ]
                            : []),
                        {
                            type: "div",
                            props: {
                                style: {
                                    borderTopWidth: "1px",
                                    borderTopStyle: "solid",
                                    borderTopColor: divider,
                                    paddingTop: `${layout.footerPaddingTop}px`,
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
                                                fontSize: `${layout.footerSize}px`,
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
                                                fontSize: `${layout.footerSize}px`,
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
                width: layout.width,
                height: layout.height,
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
