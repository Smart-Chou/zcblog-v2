/**
 * 设备实体数据（M2-7b）
 * ------------------------------------------------------------------
 * 手写 typed 数据，schema 见 `src/types/entities.ts`（deviceSpec）。
 * 规格只写对得上的事实（型号 / 核心件 / 系统），不堆参数。
 * `since` / `until` 故意留空：确切上手年月没核对过，宁可空着也不写一条假时间线；
 * 补上之后卡片会自动显示「2024.05 — 至今」，不用改组件。
 */
import type { Device, EntityMeta } from "~/types/entities";

export const devicesMeta: EntityMeta = {
    updated: "2026-11-04",
    owner: "MarxChou",
    source: "manual",
};

export const devices: Device[] = [
    {
        id: "nuc9",
        name: "Intel NUC9 幽灵峡谷",
        category: "computer",
        status: "in-use",
        specs: ["i9-9980HK · 8C16T", "Radeon RX 6600 · 7.8GB", "32GB DDR4", "fnOS", "NVMe"],
        note: {
            zh: "24×7 的服务节点：Docker、本地推理、监控和存储都在这台。整机满载不到 150W，放角落里不心疼电费。",
            en: "The 24×7 service node: Docker, local inference, monitoring and storage all live here. Under 150W at full load, so leaving it in a corner costs nothing.",
        },
        updated: "2026-11-04",
    },
    {
        id: "imac",
        name: "iMac",
        category: "computer",
        status: "in-use",
        specs: ["macOS", "键鼠宿主", "Deskflow Server"],
        note: {
            zh: "桌面的中枢：一套键鼠从这里漫游到 MacBook、Windows 笔记本和 Linux 主机，省掉硬件 KVM 切换器。",
            en: "The desk hub: one keyboard and mouse roam from here to the MacBook, the Windows laptop and the Linux box, with no hardware KVM in between.",
        },
        updated: "2026-11-04",
    },
    {
        id: "macbook",
        name: "MacBook",
        category: "computer",
        status: "in-use",
        specs: ["macOS 15", "移动办公", "Deskflow Client"],
        note: {
            zh: "移动工作台：写代码、跑 Agent、整理照片都在这台；出门就是它，回来接到同一套键鼠上。",
            en: "The portable workstation: code, agent runs and photo edits happen here. It leaves the desk and rejoins the same keyboard and mouse on return.",
        },
        updated: "2026-11-04",
    },
    {
        id: "windows-laptop",
        name: "Windows 笔记本",
        category: "computer",
        status: "in-use",
        specs: ["i5-9300H", "Sunshine 服务端", "千兆有线"],
        note: {
            zh: "串流的服务端：Sunshine 跑在这台，客厅电视和 iPad 用 Moonlight 连过来玩 PC 游戏。服务端坚持插网线，无线只做客户端。",
            en: "The streaming host: Sunshine runs here so the living-room TV and an iPad can play PC games over Moonlight. The host stays wired; only clients go wireless.",
        },
        updated: "2026-11-04",
    },
    {
        id: "openwrt-router",
        name: "OpenWrt 路由器",
        category: "network",
        status: "in-use",
        specs: ["代理与分流", "内网穿透", "流量统计"],
        note: {
            zh: "全家网络的入口：代理、分流和 frp 都在这里。曾被流量统计插件吃满内存导致 UDP 断流，现在监控盯着它。",
            en: "The network entry point: proxying, routing rules and FRP all run here. A traffic-stats plugin once ate its memory and broke UDP, so it is monitored now.",
        },
        updated: "2026-11-04",
    },
];
