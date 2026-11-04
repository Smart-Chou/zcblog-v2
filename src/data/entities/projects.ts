/**
 * 项目实体数据（M2-7a）
 * ------------------------------------------------------------------
 * 手写 typed 数据，schema 见 `src/types/entities.ts`（projectSpec）。
 * 新增一条 = 复制一个对象改字段；id 是稳定键，页面锚点与去重都靠它，不要随标题改。
 * `updated` 是这条事实的「最后核对日」，超过 180 天门禁只 warning 不拦。
 */
import type { EntityMeta, Project } from "~/types/entities";

export const projectsMeta: EntityMeta = {
    updated: "2026-11-02",
    owner: "MarxChou",
    source: "manual",
};

export const projects: Project[] = [
    {
        id: "zcblog-2",
        title: { zh: "个人博客 2.0", en: "Personal blog 2.0" },
        summary: {
            zh: "把写了三年的博客推倒重做：先定设计系统，再按卡施工。52 个语义色 token、12 个原子组件、七道构建门禁，任何一页超预算或 a11y 掉档都进不了主干。",
            en: "A from-scratch rebuild of a three-year-old blog: design system first, then work card by card. 52 semantic colour tokens, 12 atom components and seven build gates — no page ships over budget or below the a11y bar.",
        },
        status: "active",
        started: "2025-10",
        ended: null,
        role: { zh: "独立开发（设计 + 前端 + 部署）", en: "Solo build (design, frontend, deploy)" },
        stack: ["Astro", "TypeScript", "设计 Token", "Cloudflare Pages", "Playwright"],
        highlights: [
            {
                zh: "双层 token（调色板 → 语义）由脚本生成，手改产物即门禁红",
                en: "Two-layer tokens (palette → semantic) are generated; hand-editing the output fails the gate",
            },
            {
                zh: "性能预算按页卡口：HTML p95 105KB、JS 30KB、CLS ≤ 0.05",
                en: "Per-page budgets: HTML p95 105KB, JS 30KB, CLS ≤ 0.05",
            },
            {
                zh: "视觉回归与 axe 逐页扫描进 CI，深浅两套主题一起判",
                en: "Visual regression plus per-page axe scans run in CI across both themes",
            },
        ],
        links: [
            { label: "marxchou.com", href: "https://marxchou.com" },
            { label: "GitHub", href: "https://github.com/Smart-Chou/zcblog" },
        ],
        updated: "2026-11-02",
    },
    {
        id: "hermes-agent-stack",
        title: { zh: "Hermes Agent 自动化底座", en: "Hermes Agent automation stack" },
        summary: {
            zh: "把日程、笔记、服务器运维和写作流程收进一个可编排的 Agent：多 profile 隔离，技能按任务加载，定时任务与消息通道兜住「没人看着也得跑完」的那部分工作。",
            en: "One orchestratable agent for calendar, notes, server ops and writing: isolated profiles, skills loaded per task, scheduled jobs and a message channel for the work that must finish unattended.",
        },
        status: "active",
        started: "2025-09",
        ended: null,
        role: { zh: "自建自用", en: "Built for personal use" },
        stack: ["Hermes Agent", "Node.js", "SQLite", "MCP", "Cron"],
        highlights: [
            {
                zh: "技能库按需加载：只把当前任务相关的过程记忆放进上下文",
                en: "Skills load on demand — only the procedures relevant to the current task enter the context",
            },
            {
                zh: "MCP 接入 AFFiNE、Cloudflare 与自建 n8n，写操作都要能读回验证",
                en: "MCP wiring for AFFiNE, Cloudflare and self-hosted n8n, with read-back verification on writes",
            },
            {
                zh: "看门狗兜底：进程僵死、连接掉线由定时任务回收并留下日志",
                en: "Watchdog jobs recycle hung processes and dropped connections, leaving a log trail",
            },
        ],
        links: [],
        updated: "2026-10-30",
    },
    {
        id: "selfhost-stack",
        title: { zh: "自托管服务栈", en: "Self-hosted service stack" },
        summary: {
            zh: "一台 VPS 加一台家用 NAS，撑起笔记、自动化、密码与监控。能容器化的都容器化：升级是换镜像标签，下线是删目录，宿主系统保持干净。",
            en: "One VPS plus one home NAS running notes, automation, passwords and monitoring. Everything containerised: upgrades swap an image tag, removal deletes a directory, the host stays clean.",
        },
        status: "maintained",
        started: "2025-06",
        ended: null,
        role: { zh: "运维", en: "Operations" },
        stack: ["Arch Linux", "Docker Compose", "1Panel", "Cloudflare Tunnel", "Tailscale"],
        highlights: [
            {
                zh: "AFFiNE 升级到 0.27.4 新布局，保留旧目录可一键回滚",
                en: "AFFiNE upgraded to the 0.27.4 layout with the old directory kept for a one-step rollback",
            },
            {
                zh: "公网入口收在 Tunnel + Access 后面；手机端 App 走内网，不把面板直接暴露",
                en: "Public entry sits behind Tunnel and Access; mobile apps stay on the private network instead of exposing panels",
            },
            {
                zh: "每日快照加回滚脚本，升级前先留退路",
                en: "Daily snapshots and a rollback script — every upgrade leaves a way back",
            },
        ],
        links: [],
        updated: "2026-10-20",
    },
    {
        id: "workbench",
        title: { zh: "workbench 个人工作台", en: "workbench personal dashboard" },
        summary: {
            zh: "一个不依赖框架的单文件面板：日程、待办、笔记、自建服务入口聚在一屏，手机上也能编辑。只写标准库，部署就是拷一个文件。",
            en: "A single-file dashboard with no framework: agenda, todos, notes and service links on one screen, editable from a phone. Standard library only — deploying means copying one file.",
        },
        status: "active",
        started: "2026-09",
        ended: null,
        role: { zh: "独立开发", en: "Solo build" },
        stack: ["Python", "标准库", "PWA", "Hermes 插件"],
        highlights: [
            {
                zh: "单文件 + 0 依赖：先能跑起来，再谈换栈",
                en: "One file, zero dependencies: get it running before debating the stack",
            },
            {
                zh: "回环免 token、局域网要 token，面板不因为图省事而裸奔",
                en: "Loopback needs no token, LAN does — convenience never leaves the panel wide open",
            },
            {
                zh: "作为 Hermes 桌面插件挂在侧边栏，和新标签页二选一",
                en: "Ships as a Hermes desktop plugin in the sidebar, alongside the browser tab",
            },
        ],
        links: [],
        updated: "2026-10-12",
    },
    {
        id: "arch-deploy-image",
        title: { zh: "Arch 自部署镜像", en: "Arch deploy image" },
        summary: {
            zh: "把云主机从发行版默认系统迁到 Arch：整机镜像加组件向导，重装一台机器从半天压到十几分钟，配置不再靠回忆。",
            en: "Migrating cloud hosts to Arch: a machine image plus a component wizard cut a rebuild from half a day to fifteen minutes, with no configuration left to memory.",
        },
        status: "maintained",
        started: "2026-07",
        ended: null,
        role: { zh: "独立开发", en: "Solo build" },
        stack: ["Arch Linux", "Bash", "1Panel", "镜像打包"],
        highlights: [
            {
                zh: "组件向导按需装：面板、反代、监控各自可选，不装也干净",
                en: "The component wizard installs only what is picked — panel, reverse proxy and monitoring are optional",
            },
            {
                zh: "打包产物可复现，同一份镜像在 VPS 与 PVE 上跑同一套步骤",
                en: "Reproducible artefacts: the same image follows the same steps on a VPS and under PVE",
            },
        ],
        links: [],
        updated: "2026-08-18",
    },
];
