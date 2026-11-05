// 网站基本信息配置（M3-6 示例 overlay：与主题 `src/config/site.ts` 同构，只换值）

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
    url: string; // 网站链接
    domains: string[]; // 网站域名列表，用于重定向白名单和统计
    startYear: string; // 网站开始年份
    beian: string; // 中国政策 / 萌 ICP
    beianURL: string; // ICP备案链接
    shortName?: string; // PWA 短名（可选，默认回退 title）
    pwaDescription?: string; // PWA 描述（可选，默认回退 description）
}

/**
 * 图床服务配置
 */
export interface ImageServiceConfig {
    baseUrl: string; // 图床基础URL
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
 */
export const site: SiteConfig = {
    title: "Dogeared Demo",
    subtitle: "示例站点：主题 + overlay 装配。",
    description:
        "Dogeared 主题的示例站点，由 scripts/create-site.mjs 把主题与 apps/demo overlay 装配而成，用于验证「可配置 / 可升级」。",
    keywords: "Dogeared, demo, Astro, blog, theme, 示例站",
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
    pwaDescription: "Demo site assembled from the Dogeared Astro theme",
};

/**
 * 图床服务
 */
export const imageService: ImageServiceConfig = {
    baseUrl: "",
    randomPath: "/api/random",
    picPath: "/api/pic",
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
