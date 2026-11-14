/**
 * fetch-status.mjs
 * fetch 脚本 → 新鲜度报告的**最小上报通道**。
 *
 * 为什么需要它：`fetch-*.mjs` 在「缺环境变量 / 上游失败 / 解析为空」时都是
 * `process.exit(0)`，CI 因此永远绿灯，没人知道数据没更新。这里把「跳过」和
 * 「失败」的原因追加到一份 JSONL 状态日志（不改退出码），由
 * `scripts/report-data-freshness.mjs` 汇总成人话。
 *
 * 约定：
 *   - 日志路径：`$FETCH_STATUS_FILE`，默认 `.cache/data-fetch-status.jsonl`
 *   - 只写日志，不改变退出码（跳过/失败仍是 exit 0，构建不阻断）
 *   - 一律同步写入：调用点紧跟着 `process.exit(0)`，异步写的缓冲会丢
 *   - cwd 必须是仓库根（fetch 脚本都用相对路径写 src/data/*.json）
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const STATUS_FILE = process.env.FETCH_STATUS_FILE || ".cache/data-fetch-status.jsonl";

/** 当前脚本名（fetch-douban.mjs），只用于报告里标注是谁上报的 */
function currentScript() {
    const arg = process.argv[1] ?? "";
    return arg.split(/[\\/]/).pop() || "unknown";
}

function record(status, output, reason, extra = {}) {
    const entry = {
        ts: new Date().toISOString(),
        status,
        output,
        reason,
        script: currentScript(),
        pid: process.pid,
        ...extra,
    };
    try {
        mkdirSync(dirname(STATUS_FILE), { recursive: true });
        appendFileSync(STATUS_FILE, JSON.stringify(entry) + "\n", "utf-8");
    } catch {
        /* 上报失败不影响抓取本身 */
    }
    return entry;
}

/**
 * 在 CI 里额外打一条 GitHub annotation，让「跳过」出现在 Actions 的摘要里，
 * 而不是埋在几千行日志中间。本地运行不输出，避免污染终端。
 */
function annotate(level, output, message) {
    if (process.env.GITHUB_ACTIONS !== "true") return;
    const command = level === "failed" ? "warning" : "notice";
    const title = level === "failed" ? "数据抓取失败" : "数据抓取跳过";
    console.log(`::${command} title=${title}（${output}）::${message}`);
}

/**
 * 记录「成功刷新」。不需要额外打印——调用点本来就有一行 ✅ 日志。
 * @param {string} output 产物路径，如 "src/data/douban.json"
 * @param {string} [detail] 可读的统计信息，如 "书:10 影:20 音:3"
 */
export function okFetch(output, detail = "") {
    return record("ok", output, detail, { detail });
}

/**
 * 记录「跳过」：缺配置/缺输入，属于**预期内的静默跳过**，不是故障。
 * 打印 ⚠ 日志后立刻 `process.exit(0)`（保持原来的行为）。
 * @param {string} output 产物路径（报告用它跟文件对齐）
 * @param {string} reason 人话原因，如 "未设置 DOUBAN_USER_ID 环境变量"
 */
export function skipFetch(output, reason) {
    console.warn(`⚠ [fetch:skip] ${reason}（跳过抓取，保留旧数据: ${output}）`);
    record("skipped", output, reason);
    annotate("skipped", output, reason);
    process.exit(0);
}

/**
 * 记录「失败」：配置齐全但抓取/解析失败（上游挂了、字段改名、限流、RSS 404）。
 * 跟跳过分开记，是因为两者的修法完全不同。**不退出**，由调用点决定后续。
 * @param {string} output 产物路径
 * @param {string} reason 人话原因，如 "RSS 获取失败: HTTP 404"
 */
export function failFetch(output, reason) {
    console.warn(`⚠ [fetch:fail] ${reason}（未更新 ${output}，保留旧数据）`);
    record("failed", output, reason);
    annotate("failed", output, reason);
}
