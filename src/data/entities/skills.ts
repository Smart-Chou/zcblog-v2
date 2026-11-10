/**
 * 技能实体数据（M2-7a）
 * ------------------------------------------------------------------
 * 手写 typed 数据，schema 见 `src/types/entities.ts`（skillGroupSpec）。
 * 分档是闭集四档（探索中 / 常用 / 熟练 / 深耕），不写百分比——技能不是考试分数。
 * `updated` 是这一组技能的最后核对日；超过 180 天门禁只 warning 不拦。
 *
 * v2（M8-1c）回填口径：
 * - `icon` 只写 sprite 清单里真实存在的 id；语义对不上就留空，不硬凑图标。
 * - `highlight` 不按分档给，只给「当前工作的主线」，所以「深耕」档也可能没有。
 * - `relatedProjects` 只写这条技能真正参与过的项目 id；`relatedArticles` 只写本机内容仓里
 *   真实存在的文章 slug（门禁与 89 篇对账，悬空转 WARN）。
 * - `percent` / `years` 故意不回填：`level` 已表达档位、`since` 已能现算年资，
 *   再落一份百分比就是同一事实的第二个来源（必然漂移）。
 */
import type { EntityMeta, SkillGroup } from "~/types/entities";

export const skillsMeta: EntityMeta = {
    updated: "2026-11-01",
    owner: "MarxChou",
    source: "manual",
};

export const skills: SkillGroup[] = [
    {
        id: "frontend",
        title: { zh: "前端与设计系统", en: "Frontend & design systems" },
        summary: {
            zh: "把界面当产品做：先有 token 与原子组件，再谈页面。样式尽量留在样式表里，组件只管结构。",
            en: "Treating the interface as a product: tokens and atoms first, pages second. Styling stays in stylesheets; components only own structure.",
        },
        items: [
            {
                name: "Astro",
                level: "deep",
                since: "2023",
                note: {
                    zh: "静态优先、孤岛架构、内容集合",
                    en: "Static-first, islands, content collections",
                },
                highlight: true,
                relatedProjects: ["zcblog-2"],
                relatedArticles: ["blog-as-a-product"],
            },
            {
                name: "TypeScript",
                level: "solid",
                since: "2021",
                note: {
                    zh: "类型化数据契约与构建期校验",
                    en: "Typed data contracts and build-time validation",
                },
                relatedProjects: ["zcblog-2"],
                relatedArticles: ["typescript-modern-engineering-guide"],
            },
            {
                name: "CSS 设计系统",
                level: "deep",
                since: "2022",
                note: {
                    zh: "双层 token、原子组件、视觉回归",
                    en: "Two-layer tokens, atoms, visual regression",
                },
                highlight: true,
                relatedProjects: ["zcblog-2"],
                relatedArticles: ["css-override-techniques-guide"],
            },
            {
                name: "可访问性",
                level: "solid",
                since: "2024",
                note: {
                    zh: "axe 门禁、键盘与焦点、reduced-motion",
                    en: "axe gates, keyboard and focus, reduced-motion",
                },
                icon: "tabler:focus-centered",
                relatedProjects: ["zcblog-2"],
            },
            {
                name: "性能预算",
                level: "solid",
                since: "2025",
                note: { zh: "按页卡 HTML / JS 体积与 CLS", en: "Per-page HTML/JS weight and CLS" },
                icon: "tabler:gauge",
                relatedProjects: ["zcblog-2"],
            },
        ],
        updated: "2026-11-01",
    },
    {
        id: "automation",
        title: { zh: "自动化与后端", en: "Automation & backend" },
        summary: {
            zh: "重复三次以上的事就写脚本；脚本要能在没人看着的时候自己跑完，还要留下能复盘的日志。",
            en: "Anything done three times becomes a script — and the script must finish unattended, leaving a log worth reading.",
        },
        items: [
            {
                name: "Node.js",
                level: "solid",
                since: "2021",
                note: { zh: "脚本、门禁、数据抓取", en: "Scripts, gates, data fetching" },
                relatedProjects: ["hermes-agent-stack"],
                relatedArticles: ["waline-vercel-esm-saga"],
            },
            {
                name: "Python",
                level: "working",
                since: "2020",
                note: { zh: "单文件服务、数据处理", en: "Single-file services, data processing" },
                relatedProjects: ["workbench"],
            },
            {
                name: "SQLite",
                level: "working",
                since: "2023",
                note: { zh: "任务队列、状态库", en: "Task queues and state stores" },
                relatedProjects: ["hermes-agent-stack"],
            },
            {
                name: "MCP / Agent 工具链",
                level: "solid",
                since: "2025",
                note: {
                    zh: "工具路由、技能库、上下文预算",
                    en: "Tool routing, skill libraries, context budgets",
                },
                icon: "tabler:brain",
                highlight: true,
                relatedProjects: ["hermes-agent-stack"],
                relatedArticles: ["hermes-agent-memory-optimization"],
            },
            {
                name: "Docker Compose",
                level: "solid",
                since: "2022",
                note: { zh: "自托管编排与回滚", en: "Self-hosted orchestration and rollback" },
                icon: "tabler:stack-2",
                relatedProjects: ["selfhost-stack"],
                relatedArticles: ["docker-multi-server-management", "docker-proxy-migration"],
            },
        ],
        updated: "2026-10-28",
    },
    {
        id: "infrastructure",
        title: { zh: "基础设施", en: "Infrastructure" },
        summary: {
            zh: "自己的机器自己管：系统、网络、证书、备份都要能说清每一步为什么这么做。",
            en: "Running my own machines: system, network, certificates and backups, each step explainable.",
        },
        items: [
            {
                name: "Arch Linux",
                level: "solid",
                since: "2024",
                note: {
                    zh: "服务器基座、包管理与内核升级",
                    en: "Server base, package management, kernel upgrades",
                },
                icon: "tabler:server",
                relatedProjects: ["selfhost-stack", "arch-deploy-image"],
                relatedArticles: ["custom-arch-deploy-image", "migrate-arch-to-lightsail"],
            },
            {
                name: "Cloudflare",
                level: "working",
                since: "2024",
                note: {
                    zh: "DNS、缓存规则、Pages、Tunnel + Access",
                    en: "DNS, cache rules, Pages, Tunnel + Access",
                },
                icon: "tabler:world",
                relatedProjects: ["selfhost-stack"],
                relatedArticles: ["cloudflare-tunnel-self-hosted-guide"],
            },
            {
                name: "Nginx / 1Panel",
                level: "working",
                since: "2023",
                note: {
                    zh: "反向代理、证书、面板化运维",
                    en: "Reverse proxy, certificates, panel-based ops",
                },
                relatedProjects: ["selfhost-stack"],
                relatedArticles: ["frp-panel-deploy-guide"],
            },
            {
                name: "Tailscale",
                level: "working",
                since: "2025",
                note: { zh: "内网互通与移动端访问", en: "Private mesh and mobile access" },
                relatedProjects: ["selfhost-stack"],
            },
            {
                name: "监控与告警",
                level: "exploring",
                since: "2026",
                note: { zh: "Uptime Kuma / Beszel 自建", en: "Self-hosted Uptime Kuma / Beszel" },
                icon: "tabler:alert-triangle",
                relatedProjects: ["selfhost-stack"],
                relatedArticles: ["beszel-server-monitoring-guide", "drydock-deployment"],
            },
        ],
        updated: "2026-10-20",
    },
    {
        id: "workflow",
        title: { zh: "协作与流程", en: "Workflow & collaboration" },
        summary: {
            zh: "判断标准尽量机器化：能写成命令的就不靠记性，能写成门禁的就不靠自觉。",
            en: "Turn judgement into machines where possible: what can be a command should not rely on memory, what can be a gate should not rely on discipline.",
        },
        items: [
            {
                name: "Git",
                level: "solid",
                since: "2020",
                note: {
                    zh: "分支策略、worktree、WIP 提交纪律",
                    en: "Branching, worktrees, WIP commit discipline",
                },
                icon: "tabler:brand-github",
                relatedProjects: ["zcblog-2"],
                relatedArticles: ["chrome-zoom-bug-git-bisect"],
            },
            {
                name: "构建门禁",
                level: "solid",
                since: "2025",
                note: {
                    zh: "token / schema / 视觉 / 性能四类机器判据",
                    en: "Token, schema, visual and perf machine checks",
                },
                icon: "tabler:circle-check",
                relatedProjects: ["zcblog-2"],
            },
            {
                name: "技术写作",
                level: "solid",
                since: "2022",
                note: {
                    zh: "长文结构、去 AI 味、配图流水线",
                    en: "Long-form structure, human voice, image pipeline",
                },
                icon: "mingcute:book-3-line",
                relatedProjects: ["zcblog-2"],
                relatedArticles: ["blog-as-a-product"],
            },
            {
                name: "拆卡与验收",
                level: "working",
                since: "2025",
                note: {
                    zh: "预算、文件边界、可复跑的验收命令",
                    en: "Budgets, file boundaries, rerunnable acceptance commands",
                },
                icon: "tabler:check",
                relatedProjects: ["zcblog-2"],
                relatedArticles: ["blog-as-a-product"],
            },
        ],
        updated: "2026-10-30",
    },
];
