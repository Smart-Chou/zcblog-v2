/**
 * fetch-site-stats.mjs
 * 从 Umami 的公开 Share 链接抓取「全站累计」统计，生成 src/data/site-stats.json，
 * 供页脚 Umami 计数使用（构建期数字；前端脚本会在访问时实时追平）。
 *
 * 数据链路全部为公开信息，无需任何凭据：
 *   1) GET {UMAMI_API_URL}/api/share/{UMAMI_SHARE_SLUG} → { token, shareId }
 *   2) GET /api/websites/{UMAMI_WEBSITE_ID}/stats?startAt=0&endAt=now
 *      （携 x-umami-share-token / x-umami-share-context 头）
 *
 * 环境变量（未配置时静默跳过并保留旧数据）：
 *   UMAMI_API_URL        Umami 服务地址（如 https://umami.example.com）
 *   UMAMI_WEBSITE_ID     Umami 站点 ID
 *   UMAMI_SHARE_SLUG     网站公开 Share 链接的 slug（Umami 后台 → 网站 → Share URL）
 *
 * 用法: node scripts/fetch-site-stats.mjs
 */

import { writeFile } from "node:fs/promises";
import { loadEnvFile } from "./lib/env.mjs";
import { failFetch, okFetch, skipFetch } from "./lib/fetch-status.mjs";

const OUTPUT = "src/data/site-stats.json";
const REQUEST_TIMEOUT = 15000;

async function main() {
    loadEnvFile();

    const base = (process.env.UMAMI_API_URL ?? "").replace(/\/+$/, "");
    const websiteId = process.env.UMAMI_WEBSITE_ID ?? "";
    const shareSlug = process.env.UMAMI_SHARE_SLUG ?? "";

    if (!base || !websiteId || !shareSlug) {
        skipFetch(OUTPUT, "未配置 UMAMI_API_URL/UMAMI_WEBSITE_ID/UMAMI_SHARE_SLUG");
    }

    try {
        // 1) 公开 share 元信息（token + shareId）
        const shareRes = await fetch(`${base}/api/share/${shareSlug}`, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        });
        if (!shareRes.ok) throw new Error(`share 请求失败 HTTP ${shareRes.status}`);
        const share = await shareRes.json();
        if (!share?.token || !share?.shareId) throw new Error("share 响应缺少 token/shareId");

        // 2) 全时段聚合统计（startAt=0 表示自站点有数据以来）
        const url = new URL(`${base}/api/websites/${websiteId}/stats`);
        url.searchParams.set("startAt", "0");
        url.searchParams.set("endAt", String(Date.now()));

        const statsRes = await fetch(url, {
            headers: {
                "x-umami-share-token": share.token,
                "x-umami-share-context": share.shareId,
            },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        });
        if (!statsRes.ok) throw new Error(`stats 请求失败 HTTP ${statsRes.status}`);
        const stats = await statsRes.json();

        const pageviews = Number(stats?.pageviews);
        const visitors = Number(stats?.visitors);
        if (!Number.isFinite(pageviews) || pageviews < 0) throw new Error("stats 响应异常");

        await writeFile(
            OUTPUT,
            JSON.stringify(
                {
                    pageviews,
                    visitors: Number.isFinite(visitors) ? visitors : 0,
                    updatedAt: new Date().toISOString(),
                },
                null,
                4,
            ) + "\n",
        );
        okFetch(OUTPUT, `浏览 ${pageviews} / 访客 ${visitors}`);
        console.log(`✅ 全站统计已更新：浏览 ${pageviews} / 访客 ${visitors}`);
    } catch (err) {
        failFetch(OUTPUT, `全站统计抓取失败：${err.message}`);
    }
}

await main();
