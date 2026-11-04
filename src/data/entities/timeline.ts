/**
 * 时间线实体数据（M2-8a）
 * -----------------------------------------------------------------
 * 手写 typed 数据，schema 见 `src/types/entities.ts`（timelineSpec）。
 *
 * 数据诚实性：每条都能追到仓库里的一个事实来源 —— 项目起点取
 * `src/data/entities/projects.ts` 的 `started`，节点事件取 `blog2.0` 决策日志的
 * 编号与日期（`docs/decision-log.md`）。**不知道哪一天就只写月份**，不拿 1 号凑数：
 * `date` 两种精度都合法，正是为了不在时间线上编造精度。
 *
 * 新增大事 = 追加一个对象；`id` 是稳定键（同日期的排序兜底也用它），不要随标题改。
 * `updated` 是这条事实的最后核对日，超过 180 天门禁只 warning 不拦。
 */
import type { EntityMeta, TimelineEvent } from "~/types/entities";

export const timelineMeta: EntityMeta = {
    updated: "2026-11-02",
    owner: "MarxChou",
    // 全部条目来自项目数据文件的 started 与 blog2.0 决策日志的编号/日期，非第三方导入。
    source: "manual · projects.started + blog2.0 decision-log",
};

export const timeline: TimelineEvent[] = [
    {
        id: "selfhost-stack",
        date: "2025-06",
        kind: "infra",
        title: { zh: "自托管服务栈起步", en: "Standing up the self-hosted stack" },
        detail: {
            zh: "一台 VPS 加一台家用 NAS，把笔记、自动化、密码和监控从第三方搬到自己的机器上。",
            en: "One VPS plus a home NAS: notes, automation, passwords and monitoring move off third-party services onto my own machines.",
        },
        tags: ["Arch Linux", "Docker Compose", "1Panel"],
        updated: "2026-11-02",
    },
    {
        id: "hermes-agent-stack",
        date: "2025-09",
        kind: "build",
        title: { zh: "Hermes Agent 底座", en: "Hermes Agent automation stack" },
        detail: {
            zh: "日程、笔记、服务器运维和写作收进一个可编排的 Agent：多 profile 隔离，技能按任务加载。",
            en: "Calendar, notes, server ops and writing folded into one orchestratable agent: isolated profiles, skills loaded per task.",
        },
        tags: ["Hermes Agent", "MCP", "SQLite"],
        updated: "2026-10-30",
    },
    {
        id: "blog2-start",
        date: "2025-10",
        kind: "site",
        title: { zh: "博客 2.0 动工", en: "Blog 2.0 starts" },
        detail: {
            zh: "线上旧站保持不动，另起一套代码并行重建：先定设计系统，再按卡施工。",
            en: "The live site stays untouched while a parallel rebuild starts from the design system, then proceeds card by card.",
        },
        tags: ["Astro", "TypeScript"],
        updated: "2026-11-02",
    },
    {
        id: "arch-deploy-image",
        date: "2026-07",
        kind: "infra",
        title: { zh: "Arch 自部署镜像", en: "Arch deploy image" },
        detail: {
            zh: "云主机从发行版默认系统迁到 Arch：整机镜像加组件向导，重装一台机器从半天压到十几分钟。",
            en: "Cloud hosts move to Arch: a machine image plus a component wizard cut a rebuild from half a day to fifteen minutes.",
        },
        tags: ["Arch Linux", "1Panel"],
        updated: "2026-08-18",
    },
    {
        id: "workbench",
        date: "2026-09",
        kind: "build",
        title: { zh: "workbench 个人工作台", en: "workbench dashboard" },
        detail: {
            zh: "单文件、零依赖的面板：日程、待办、笔记和服务入口聚在一屏，手机上也能编辑。",
            en: "A single-file, zero-dependency dashboard: agenda, todos, notes and service links on one screen, editable from a phone.",
        },
        tags: ["Python", "PWA"],
        updated: "2026-10-12",
    },
    {
        id: "gates-adopted",
        date: "2026-10-29",
        kind: "site",
        title: { zh: "七道门与角色分离立项", en: "Seven gates and role separation adopted" },
        detail: {
            zh: "重构按门禁推进：每个阶段的产出物落盘，评审角色与产出角色分离。",
            en: "The rebuild proceeds gate by gate: every stage leaves an artefact on disk, and the reviewer is not the author.",
        },
        tags: ["D-0001", "G0"],
        updated: "2026-11-02",
    },
    {
        id: "g3-architecture-pass",
        date: "2026-10-30",
        kind: "site",
        title: { zh: "G3 架构门 PASS", en: "G3 architecture gate passes" },
        detail: {
            zh: "三轮评审后架构门通过；同一天性能预算按移动端与桌面端分开立项。",
            en: "The architecture gate passes after three review rounds; the same day performance budgets split into mobile and desktop.",
        },
        tags: ["D-0040", "G3"],
        updated: "2026-11-02",
    },
    {
        id: "ci-first-green",
        date: "2026-11-01",
        kind: "site",
        title: { zh: "门禁跑进 CI，首次全绿", en: "Gates run in CI and go green" },
        detail: {
            zh: "token、surface、性能与 a11y 门禁接入 CI：gates 作业 3 分 0 秒跑完，test 作业 43 秒。",
            en: "Token, surface, performance and a11y gates join CI: the gates job finishes in 3m00s and tests in 43s.",
        },
        tags: ["D-0097", "CI"],
        updated: "2026-11-02",
    },
    {
        id: "prod-cutover",
        date: "2026-11-02",
        kind: "site",
        title: { zh: "生产切流完成", en: "Production cutover" },
        detail: {
            zh: "00:04 完成切流：v2 代码合并回主仓，生产域名指向新构建，旧站不再作为主力。",
            en: "Cutover completes at 00:04: v2 merges back into the main repo and the production domain points at the new build.",
        },
        tags: ["D-0098", "G5"],
        updated: "2026-11-02",
    },
    {
        id: "tailwind-removed",
        date: "2026-11-02",
        kind: "build",
        title: { zh: "移除 Tailwind，改原生 CSS", en: "Tailwind removed for plain CSS" },
        detail: {
            zh: "样式收敛到两层 token 加原生 CSS，产物里不再有工具类带来的额外体积。",
            en: "Styles collapse onto two-layer tokens and plain CSS; no utility-class weight is left in the output.",
        },
        tags: ["D-0100", "CSS"],
        updated: "2026-11-02",
    },
    {
        id: "m1-pass",
        date: "2026-11-03",
        kind: "site",
        title: { zh: "M1 整体 PASS（9/9）", en: "M1 passes in full (9/9)" },
        detail: {
            zh: "设计契约、原子组件、文档页与视觉门禁一并收口，M2 转入拆解。",
            en: "Design contract, atoms, documentation pages and visual gates all close together; M2 moves into planning.",
        },
        tags: ["D-0107", "M1"],
        updated: "2026-11-03",
    },
    {
        id: "m2-scope-frozen",
        date: "2026-11-04",
        kind: "site",
        title: { zh: "M2 范围冻结为 12 张卡", en: "M2 scope frozen at twelve cards" },
        detail: {
            zh: "12 张卡串行推进，C 层展示页按实体逐个产品化。",
            en: "Twelve serial cards; every C-layer page is productised entity by entity.",
        },
        tags: ["D-0108", "M2"],
        updated: "2026-11-04",
    },
];
