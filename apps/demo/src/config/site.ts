// 网站基本信息配置（模板占位值——请全部替换为你自己的信息）

/**
 * 网站基本信息配置
 */
export interface SiteConfig {
    title: string; // 网站标题
    subtitle: string; // 网站副标题
    description: string; // 网站描述
    keywords: string; // 网站关键字
    favicon: string; // 网站图标URL
    logo: string; // 网站logo
    coverImage: string; // 网站封面
    coverImageAlt: string; // 网站封面Alt
    url: string; // 网站链接（部署后替换为真实域名）
    domains: string[]; // 网站域名列表，用于重定向白名单和统计
    startYear: string; // 网站开始年份
    beian: string; // 中国政策 / 萌 ICP（留空则不显示）
    beianURL: string; // ICP备案链接
    shortName?: string; // PWA 短名（可选，默认回退 title）
    pwaDescription?: string; // PWA 描述（可选，默认回退 description）
}

/**
 * 图床服务配置
 */
export interface ImageServiceConfig {
    baseUrl: string; // 图床基础URL（留空 = 封面使用本地占位图 /cover.png）
    randomPath: string; // 随机图片路径
    picPath: string; // 指定图片路径
    /** 可选：Cloudflare Image Transformations 边缘缩略图（需站点域名所在 zone 已开启该功能） */
    transform?: {
        enable: boolean; // 是否启用（关闭或 zone 未开启时保持原图）
        quality?: number; // 输出质量（1-100，默认 78）
    };
}

/**
 * 作者信息配置
 */
export interface AuthorConfig {
    type: string; // 个人资料中使用的名字
    url: string; // 作者个性独立页面,如果有的话
    motto: string; // 个人资料中使用的口头禅
    avatar: string; // 个人资料中使用的头像
}

/**
 * Meta Twitter配置
 */
export interface TwitterConfig {
    type: string; // twitter 账号
    link: string; // twitter 名称
}

/**
 * 页面配置
 */
export interface PageConfig {
    title: string; // 页面标题
    description: string; // 页面描述
}

/**
 * 网站基本信息
 *
 * M3-6 示例 overlay：4 个配置文件与 `theme-template/src/config/` 同构（export 集合一致），
 * 只换值不改 interface —— 这是 §4.2「覆盖而非 fork」的可运行样本。
 */
export const site: SiteConfig = {
    title: "Dogeared Demo",
    subtitle: "示例站点：主题 + overlay 装配。",
    description: "Dogeared 主题的示例站点，由 create-site.mjs 把主题与 apps/demo overlay 装配而成。",
    keywords: "Dogeared, demo, Astro, 博客, blog, theme",
    favicon: "favicon.svg",
    logo: "logo.webp",
    coverImage: "cover.png",
    coverImageAlt: "Dogeared Demo Cover",
    url: "https://demo.example.com",
    domains: ["demo.example.com"],
    startYear: "2026",
    beian: "",
    beianURL: "",
    shortName: "Dogeared Demo",
    pwaDescription: "Demo site assembled from the Dogeared Astro theme.",
};

/**
 * 图床服务
 */
export const imageService: ImageServiceConfig = {
    baseUrl: "", // 例如 "https://img.example.com"；留空 = 封面/相册使用本地占位
    randomPath: "/api/random",
    picPath: "/api/pic",
    // 可选：图床缩略图（Cloudflare Image Transformations；开启后按显示宽度套用 /cdn-cgi/image/）
    transform: {
        enable: false,
        quality: 78,
    },
};

/**
 * Meta Twitter配置
 */
export const twitter: TwitterConfig = {
    type: "@dogeared_demo",
    link: "@dogeared_demo",
};

/**
 * 作者信息
 */
export const author: AuthorConfig = {
    type: "Demo Author",
    url: "https://demo.example.com",
    motto: "写下你的想法，折起这一角。",
    avatar: "logo.webp",
};

/**
 * 404页面配置
 */
export const notFoundPage: PageConfig = {
    title: "404 - Page Not Found",
    description: "The page you are looking for does not exist.",
};

/**
 * 标签页面配置
 */
export const tagsPage: PageConfig = {
    title: "Tags",
    description: "All Tags",
};

/**
 * 归档页面配置
 */
export const archivesPage: PageConfig = {
    title: "Archives",
    description: "All Archives",
};

/**
 * 重定向页面配置
 */
export const redirectPage: PageConfig = {
    title: "Redirect",
    description: "Redirect Website",
};
