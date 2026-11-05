/**
 * 包 `zcblog-og-image` 的公开类型。
 *
 * 接口按 `blog2.0/docs/21-m3-plan.md` §3.3 冻结：
 *
 * ```ts
 * createOgImageRoute(options: {
 *   posts: Array<{ slug: string; title: string; tags: string[]; pubDate: Date }>;
 *   site: { title: string; author: string; url: string };
 *   theme: { background: string; foreground: string; accent: string };
 *   fonts?: { regular: string; bold: string };
 * }): APIRoute
 * ```
 *
 * 冻结的四个键都是必填。冻结之外只允许**可选**字段（下方标 `可选扩展`），
 * 用于「抽取时不改图」——版式默认值与抽取前逐像素一致，站点想改才需要传。
 */

/** 单篇文章（OG 图渲染只需要 slug/title/可选 description；tags/pubDate 留给下游消费者）。 */
export interface OgImagePost {
    slug: string;
    title: string;
    tags: string[];
    pubDate: Date;
    /** 可选扩展：缺省时回退到 `site.description`。 */
    description?: string;
}

/** 站点身份。包内不读 `~/config`，全部由主题侧注入。 */
export interface OgImageSite {
    title: string;
    author: string;
    url: string;
    /** 可选扩展：文章没有 description 时的兜底文案。 */
    description?: string;
}

/**
 * 调色板。主题色不得从 tokens 包 import（§3.4 依赖方向），
 * 只能由主题侧以字面量传入。
 */
export interface OgImageTheme {
    /** 画布底色；未传 `gradient` 时用它生成 135° 渐变。 */
    background: string;
    /** 标题色。 */
    foreground: string;
    /** 强调色（左侧竖条、分隔线、右上装饰圆按 alpha 派生）。 */
    accent: string;
    /** 可选扩展：摘要文字色，默认 `#8b949e`。 */
    muted?: string;
    /** 可选扩展：页脚 url / 站点名色，默认 `#5c6370`。 */
    subtle?: string;
    /** 可选扩展：页脚分隔线色，默认 `rgba(255,255,255,0.08)`。 */
    divider?: string;
    /** 可选扩展：完整 CSS background-image；缺省 `linear-gradient(135deg, bg 0%, bg 40%, bg 100%)`。 */
    gradient?: string;
}

/**
 * 字体来源：`http(s)://` 走下载（缓存在 `fontCacheDir`），其余按本地文件路径读。
 * 下载/读取失败一律抛错并提示「可用 options.fonts 覆盖」，不静默降级。
 */
export interface OgImageFonts {
    regular: string;
    bold: string;
}

export interface OgImageOptions {
    posts: OgImagePost[];
    site: OgImageSite;
    theme: OgImageTheme;
    /** 可选扩展：缺省用 Noto Sans SC 的 CDN 地址（受限网络请传本地路径）。 */
    fonts?: OgImageFonts;
    /** 可选扩展：CDN 字体缓存目录，默认 `<cwd>/.astro/fonts`。 */
    fontCacheDir?: string;
}
