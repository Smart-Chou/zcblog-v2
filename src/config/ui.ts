// UI相关配置

/**
 * 主导航链接
 */
export interface NavLink {
    label: string;
    href: string;
}

/**
 * 导航栏配置项
 */
export interface CategoryItem {
    url: string; // 链接
    title: string; // 标题
    style?: string; // 颜色样式
    target: string; // 目标
    svg: string; // icon
}

/**
 * 社交链接配置项
 */
export interface SocialLinkItem {
    url: string; // 链接
    title: string; // 标题
    style: string; // 颜色样式
    svg: string; // icon
}

/**
 * 友链页面配置
 */
export interface FriendsPageConfig {
    title: string; // 标题
    note: string; // 描述
    friendLinkApplyUrl?: string; // 友链申请入口（如 GitHub Issue 表单链接；留空则不显示按钮）
    /**
     * 友链数据槽位（注入点，P-05）：站点把自己的友链 JSON 放在 `src/data/<dataFile>`。
     * - 留空串 = 不启用数据 → 页面走空态（构建照常通过）
     * - 文件缺失 = 空态；文件内容坏 = 错误态（见 src/data/adapters/friends.ts）
     * 这里只放「槽位指针」，不放任何友链内容本身。
     */
    dataFile?: string;
}

/**
 * 页脚配置项
 */
export interface FooterItem {
    title: string; // 标题
    text: string; // 描述
    color: string; // 背景颜色样式
    logo: string; // iconify-json icons 图标
    logoColor: string; // 图标颜色样式
    labelColor: string; // 标签背景颜色
    url: string; // 链接
}

/**
 * 主导航链接
 */
export const navLinks: NavLink[] = [
    { label: "首页", href: "/" },
    { label: "博客", href: "/blog/1/" },
    { label: "随笔", href: "/talks/" },
    { label: "相册", href: "/albums/" },
    { label: "番剧", href: "/bangumi/" },
    { label: "友人", href: "/friends/" },
    { label: "归档", href: "/archives/" },
    { label: "标签", href: "/tags/" },
    { label: "服务", href: "/services/" },
];

/**
 * 导航栏配置
 */
export const categories: CategoryItem[] = [
    {
        url: "//memos.marxchou.com",
        title: "🥳 Feed",
        style: "color: orange",
        target: "_blank",
        svg: "tabler:brain",
    },
    {
        url: "/albums/",
        title: "📷 Albums",
        style: "color: #3498db",
        target: "_self",
        svg: "tabler:photo",
    },
    {
        url: "/friends/",
        title: "🧑🏿‍🚒 Friends",
        style: "color: #06a878",
        target: "_self",
        svg: "tabler:message-chatbot-filled",
    },
    {
        url: "/archives/",
        title: "📂 Archives",
        style: "color: var(--color-text)",
        target: "_self",
        svg: "tabler:archive-filled",
    },
    {
        url: "/tags/",
        title: "🏷️ tags",
        style: undefined,
        target: "_self",
        svg: "tabler:tags",
    },
];

/**
 * 社交链接配置
 */
export const socialLinks: SocialLinkItem[] = [
    {
        url: "//mcc.im",
        title: "🚀 Portfolio",
        style: "color: var(--color-text)",
        svg: "mingcute:world-2-fill",
    },
    {
        url: "//x.com/MIFSH912",
        title: "🔗 @MIFSH912",
        style: "color: #1da1f2",
        svg: "logos:twitter",
    },
    {
        url: "//t.me/MarxChou",
        title: "🔗 @MarxChou",
        style: "color: #179cde",
        svg: "logos:telegram",
    },
    {
        url: "//github.com/Smart-Chou",
        title: "🔗 @Smart-Chou",
        style: "color: var(--color-text)",
        svg: "mingcute:github-line",
    },
];

/**
 * 友链页面配置
 */
export const friendsPage: FriendsPageConfig = {
    title: "Friends",
    note: "欢迎申请友链，在评论区留下你的博客信息即可。",
    friendLinkApplyUrl: "https://github.com/Smart-Chou/zcblog/issues/new?template=friend-link.yml",
    // 数据槽位指针：站点友链 JSON 的位置（src/data/friends.json）。内容不进配置。
    dataFile: "friends.json",
};

/**
 * 页脚配置
 */
export const footerList: FooterItem[] = [
    {
        title: "Astro",
        text: "Generator",
        color: "Lime",
        logo: "astro",
        logoColor: "red",
        labelColor: "pink",
        url: "//astro.build",
    },
    {
        title: "Vercel",
        text: "Deploy",
        color: "Lime",
        logo: "vercel",
        logoColor: "white",
        labelColor: "cyan",
        url: "//vercel.com",
    },
];

/**
 * 侧边栏导航配置项
 */
export interface SidebarItem {
    label: string;
    link?: string;
    slug?: string;
    badge?: string | { text: string; variant?: "note" | "tip" | "danger" | "success" };
    collapsed?: boolean;
    items?: SidebarItem[];
}

/**
 * 侧边栏导航配置
 */
export const sidebarConfig: SidebarItem[] = [
    {
        label: "导航",
        items: [
            { label: "首页", link: "/" },
            { label: "博客", slug: "blog/1" },
            { label: "归档", slug: "archives" },
            { label: "标签", slug: "tags" },
        ],
    },
    {
        label: "项目",
        items: [
            { label: "随笔", slug: "talks" },
            { label: "相册", slug: "albums" },
            { label: "番剧", slug: "bangumi" },
        ],
    },
    {
        label: "更多",
        items: [
            { label: "友人", slug: "friends" },
            { label: "服务", slug: "services" },
            { label: "豆瓣", slug: "douban" },
            { label: "捐赠", slug: "donate" },
        ],
    },
];
