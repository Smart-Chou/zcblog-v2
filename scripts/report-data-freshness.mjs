#!/usr/bin/env node
/**
 * report-data-freshness.mjs
 * 构建期数据新鲜度报告 —— **只做可见性，永不阻断构建**。
 *
 * 背景：`src/data/*.json` 由一堆 fetch 脚本在构建期从外部源拉取。这些脚本在
 * 缺环境变量、上游挂了、字段改名、限流、RSS 404 时都走同一条静默路径
 * （`process.exit(0)`），于是 CI 永远绿灯，线上却可能挂着几个月前的旧数据。
 * 这个脚本把「哪个文件多旧了、为什么这次没更新」摆到明面上。
 *
 * 判定口径：
 *   - 时间基准**优先用 git 提交时间**（`git log -1 --format=%ct`）。用 mtime 会
 *     骗人：CI 每次 checkout 都会把所有文件的 mtime 刷成「刚刚」，这正是旧数据
 *     能长期藏住的原因。没有 git 记录（未入库的新文件）时才回退到 mtime。
 *   - 阈值：≤7 天 OK；8~30 天 WARN；>30 天 STALE。
 *   - 「本次构建」列来自 fetch 脚本的 `scripts/lib/fetch-status.mjs` 上报日志
 *     （`.cache/data-fetch-status.jsonl`），区分「跳过（缺配置）」与「失败（上游问题）」。
 *     没有日志时（本机直接跑）退化为按环境变量推断缺哪个配置。
 *
 * 用法：
 *   node scripts/report-data-freshness.mjs            # 人看的表格 + CI step summary
 *   node scripts/report-data-freshness.mjs --json     # 机器可读（给将来的门禁用）
 *   node scripts/report-data-freshness.mjs --dir src/data --status-file .cache/x.jsonl
 *
 * 退出码恒为 0（连自身异常也是 0）：可见性工具，不做门禁。是否升级为阻断由 PO 决定。
 */

import { execFile } from "node:child_process";
import { appendFile, readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

// ── 分级阈值（天） ──
const OK_MAX_DAYS = 7;
const WARN_MAX_DAYS = 30;

// ── CLI ──
const argv = process.argv.slice(2);
const argOf = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const AS_JSON = argv.includes("--json");
const DATA_DIR = argOf("--dir", process.env.FRESHNESS_DATA_DIR || "src/data");
const STATUS_FILE = argOf(
    "--status-file",
    process.env.FETCH_STATUS_FILE || ".cache/data-fetch-status.jsonl",
);

/**
 * 已知产出方：哪个脚本写哪个文件、依赖哪些环境变量。
 * 用来在「没有抓取日志」时也能说出「因为没配 X 所以这次跳过」。
 * 脚本/变量名如有变动，运行时会做一次源码比对并把漂移打出来（不会静默失准）。
 */
const PRODUCERS = [
    {
        output: "douban.json",
        script: "scripts/fetch-douban.mjs",
        requires: ["DOUBAN_USER_ID"],
    },
    {
        output: "bangumi.json",
        script: "scripts/fetch-bangumi.mjs",
        requires: ["BANGUMI_USER_ID"],
    },
    {
        output: "talks.json",
        script: "scripts/fetch-talks.mjs",
        requires: ["BLINKO_API_URL", "BLINKO_API_TOKEN"],
    },
    {
        output: "friends-articles.json",
        script: "scripts/fetch-friends.mjs",
        requires: [],
        optional: ["FOREVERBLOG_RSS_URL"],
    },
    {
        output: "popular.json",
        script: "scripts/fetch-popular.mjs",
        requires: ["UMAMI_API_URL", "UMAMI_WEBSITE_ID", "UMAMI_USERNAME", "UMAMI_PASSWORD"],
    },
    {
        output: "site-stats.json",
        script: "scripts/fetch-site-stats.mjs",
        requires: ["UMAMI_API_URL", "UMAMI_WEBSITE_ID", "UMAMI_SHARE_SLUG"],
    },
    { output: "friends.json", static: true, note: "友链列表（手工维护）" },
    { output: "albums.json", static: true, note: "相册（手工/外部流水线生成）" },
    { output: "donators.json", static: true, note: "捐赠名单（手工维护）" },
    { output: "typewriter.json", static: true, note: "打字机文案（手工维护）" },
];

const PRODUCER_BY_OUTPUT = new Map(PRODUCERS.map((p) => [p.output, p]));

// ── 小工具 ──

const DAY_MS = 86_400_000;

function pad(text, width) {
    const s = String(text);
    const w = displayWidth(s);
    return w >= width ? s : s + " ".repeat(width - w);
}

/** 终端显示宽度：CJK / emoji 占 2 列，否则按字符数算会错位 */
function displayWidth(text) {
    let width = 0;
    for (const ch of String(text)) {
        const cp = ch.codePointAt(0);
        const wide =
            (cp >= 0x1100 && cp <= 0x115f) ||
            (cp >= 0x2e80 && cp <= 0xa4cf) ||
            (cp >= 0xac00 && cp <= 0xd7a3) ||
            (cp >= 0xf900 && cp <= 0xfaff) ||
            (cp >= 0xfe30 && cp <= 0xfe6f) ||
            (cp >= 0xff00 && cp <= 0xff60) ||
            (cp >= 0xffe0 && cp <= 0xffe6) ||
            (cp >= 0x1f300 && cp <= 0x1f9ff);
        width += wide ? 2 : 1;
    }
    return width;
}

function fmtStamp(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 天数 → 「168.3 天」/「5.2 小时」（<1 天时用小时，避免满屏 0.x 天） */
function fmtSpan(ms) {
    const days = ms / DAY_MS;
    if (!Number.isFinite(days)) return "未知";
    if (days < 1) return `${(days * 24).toFixed(1)} 小时`;
    return `${days.toFixed(1)} 天`;
}

function gradeOf(ms) {
    const days = ms / DAY_MS;
    if (!Number.isFinite(days) || days < 0) return "STALE";
    if (days <= OK_MAX_DAYS) return "OK";
    if (days <= WARN_MAX_DAYS) return "WARN";
    return "STALE";
}

function truncate(text, max) {
    const s = String(text ?? "");
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** markdown 表格里不能直接出现 `|` */
const mdCell = (text) =>
    String(text ?? "")
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");

// ── 扫描 ──

/** 递归收集 .json；跳过 i18n/（那是词典，不是抓取数据） */
async function listJsonFiles(root) {
    const files = [];
    async function walk(dir) {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (entry.name === "i18n") continue;
                await walk(join(dir, entry.name));
            } else if (entry.isFile() && entry.name.endsWith(".json")) {
                files.push(join(dir, entry.name));
            }
        }
    }
    await walk(root);
    return files;
}

/** 该文件最后一次被提交的时间（毫秒）；未入库/非 git 仓库返回 null */
async function gitLastCommitMs(file) {
    try {
        const { stdout } = await run("git", ["log", "-1", "--format=%ct", "--", file], {
            cwd: process.cwd(),
        });
        const seconds = Number(stdout.trim());
        return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
    } catch {
        return null;
    }
}

/** 读上报日志，只留每个产物最后一次记录 */
async function readStatusRecords(file) {
    const latest = new Map();
    let raw;
    try {
        raw = await readFile(file, "utf-8");
    } catch {
        return latest;
    }
    for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        let rec;
        try {
            rec = JSON.parse(line);
        } catch {
            continue; // 坏行忽略，日志不该影响报告
        }
        if (!rec?.output || !rec?.status) continue;
        const key = basename(rec.output);
        const prev = latest.get(key);
        const ts = Date.parse(rec.ts) || 0;
        if (!prev || ts >= (Date.parse(prev.ts) || 0)) latest.set(key, rec);
    }
    return latest;
}

/** 工作区里真正被改过的文件（用 git 判断：checkout 也会刷新 mtime，不能靠 mtime 猜） */
async function gitDirtyFiles(root) {
    try {
        const { stdout } = await run(
            "git",
            ["status", "--porcelain", "--untracked-files=no", "--", root],
            {
                cwd: process.cwd(),
            },
        );
        return new Set(
            stdout
                .split("\n")
                .map((line) => line.slice(3).trim().replace(/^"|"$/g, ""))
                .filter(Boolean)
                .map((p) => basename(p)),
        );
    } catch {
        return new Set();
    }
}

/** 元数据自检：PRODUCERS 里写的脚本/变量名跟源码对不上时告警（防止清单悄悄过期） */
async function checkProducerDrift() {
    const warnings = [];
    for (const p of PRODUCERS) {
        if (!p.script) continue;
        let source;
        try {
            source = await readFile(p.script, "utf-8");
        } catch {
            warnings.push(`${p.script} 不存在（清单里登记为 ${p.output} 的产出方）`);
            continue;
        }
        if (!source.includes(p.output)) {
            warnings.push(`${p.script} 源码里找不到输出名 ${p.output}`);
        }
        for (const key of p.requires ?? []) {
            if (!source.includes(key)) {
                warnings.push(`${p.script} 源码里找不到环境变量 ${key}`);
            }
        }
    }
    return warnings;
}

// ── 主流程 ──

const now = Date.now();
const rows = [];
const missingEnvNotes = [];

const statusRecords = await readStatusRecords(STATUS_FILE);
const files = await listJsonFiles(DATA_DIR);
const dirtyFiles = await gitDirtyFiles(DATA_DIR);

for (const file of files) {
    const name = basename(file);
    const info = await stat(file);
    const gitMs = await gitLastCommitMs(file);
    const mtimeMs = info.mtimeMs;

    // 时间基准：git 优先；未入库才用 mtime
    const touchedMs = gitMs ?? mtimeMs;
    const timeSource = gitMs ? "git" : "mtime";
    // 工作区改过没提交：内容比提交时间新，提示一下（判定口径仍是提交时间）
    const dirty = dirtyFiles.has(name);

    const producer = PRODUCER_BY_OUTPUT.get(name);
    const record = statusRecords.get(name);
    let buildStatus;
    let buildKind;
    let buildReason = "";

    if (record) {
        const recAge = now - (Date.parse(record.ts) || now);
        const stale = recAge > 12 * 3_600_000 ? " · 旧记录" : "";
        if (record.status === "ok") {
            buildKind = "ok";
            const detail = record.detail || record.reason;
            buildStatus = `✅ 成功${detail ? `（${truncate(detail, 40)}）` : ""} · ${fmtSpan(recAge)}前${stale}`;
        } else if (record.status === "skipped") {
            buildKind = "skipped";
            buildReason = record.reason;
            buildStatus = `⏭ 跳过（${truncate(record.reason, 60)}）${stale}`;
        } else {
            buildKind = "failed";
            buildReason = record.reason;
            buildStatus = `❌ 失败（${truncate(record.reason, 60)}）${stale}`;
        }
    } else if (producer?.static) {
        buildKind = "static";
        buildStatus = `— 静态/手工维护${producer.note ? `：${producer.note}` : ""}`;
    } else if (producer?.requires?.length) {
        const missing = producer.requires.filter((key) => !process.env[key]);
        if (missing.length > 0) {
            buildKind = "skipped";
            buildReason = `未配置 ${missing.join("、")}`;
            buildStatus = `⏭ 推测跳过（未配置 ${missing.join("、")}）`;
            missingEnvNotes.push({ file: name, missing });
        } else {
            buildKind = "unknown";
            buildStatus = "? 无抓取记录（脚本未运行或未接入上报）";
        }
    } else {
        buildKind = "unknown";
        buildStatus = producer ? "? 无抓取记录" : "? 无抓取脚本登记";
    }

    rows.push({
        file: name,
        path: file,
        producer: producer?.script
            ? basename(producer.script)
            : producer?.static
              ? "(static)"
              : "—",
        static: Boolean(producer?.static),
        touchedAt: new Date(touchedMs).toISOString(),
        touchedMs: Math.round(touchedMs),
        timeSource,
        dirty,
        ageDays: Number(((now - touchedMs) / DAY_MS).toFixed(1)),
        ageText: fmtSpan(now - touchedMs),
        grade: gradeOf(now - touchedMs),
        buildKind,
        buildStatus,
        buildReason,
    });
}

// 最该看的排最前：STALE → WARN → OK，同级别按更旧优先
const GRADE_ORDER = { STALE: 0, WARN: 1, OK: 2 };
rows.sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] || b.ageDays - a.ageDays);

const counts = { STALE: 0, WARN: 0, OK: 0 };
for (const row of rows) counts[row.grade] += 1;
const staticCount = rows.filter((r) => r.static).length;
// 抓取状态是独立维度：D-0181 实测过「分级全 OK 但 3 个 fetch 正在失败」——
// CI 每次提交都会刷新 git 时间，所以失败也能显示成"刚刚"。新鲜度不能代表抓取健康。
const buildCounts = { ok: 0, skipped: 0, failed: 0, static: 0, unknown: 0 };
for (const row of rows) buildCounts[row.buildKind] = (buildCounts[row.buildKind] || 0) + 1;
const driftWarnings = await checkProducerDrift();

// ── 终端输出 ──

function renderText() {
    const lines = [];
    lines.push("");
    lines.push(`📊 数据新鲜度报告 · ${fmtStamp(now)}`);
    lines.push(
        `   目录: ${DATA_DIR}（跳过 i18n/） · 文件: ${rows.length} 个 · ` +
            `时间基准: git 提交时间（无记录时回退 mtime）`,
    );
    lines.push(
        `   阈值: ≤${OK_MAX_DAYS} 天 OK · ${OK_MAX_DAYS + 1}~${WARN_MAX_DAYS} 天 WARN · >${WARN_MAX_DAYS} 天 STALE`,
    );
    lines.push("");
    lines.push(
        `   ${pad("分级", 5)}  ${pad("文件", 22)} ${pad("最后更新", 19)} ${pad("距今", 9)} ${pad("抓取方", 24)} 本次构建`,
    );
    lines.push(
        `   ${"-".repeat(5)}  ${"-".repeat(22)} ${"-".repeat(19)} ${"-".repeat(9)} ${"-".repeat(24)} ${"-".repeat(40)}`,
    );
    for (const r of rows) {
        const stamp = `${fmtStamp(r.touchedMs)} ${r.timeSource === "git" ? "git" : "mt"}`;
        lines.push(
            `   ${pad(r.grade, 5)}  ${pad(r.file, 22)} ${pad(stamp, 19)} ${pad(r.ageText, 9)} ${pad(r.producer, 24)} ${r.buildStatus}`,
        );
    }
    lines.push("");
    lines.push(
        `   汇总: OK ${counts.OK} · WARN ${counts.WARN} · STALE ${counts.STALE}` +
            `（其中静态/手工维护 ${staticCount} 个）`,
    );
    lines.push(
        `   抓取: ✅ 成功 ${buildCounts.ok} · ⏭ 跳过 ${buildCounts.skipped} · ` +
            `❌ 失败 ${buildCounts.failed} · — 静态 ${buildCounts.static}` +
            (buildCounts.failed > 0 ? "  ← 失败需人工看" : ""),
    );

    const stale = rows.filter((r) => r.grade === "STALE" && !r.static);
    if (stale.length > 0) {
        lines.push("");
        lines.push(`   ⛔ 抓取数据陈旧 (>${WARN_MAX_DAYS} 天) —— 线上展示的就是这些旧数据:`);
        for (const r of stale)
            lines.push(`      · ${r.file}: ${r.ageText}未更新（${fmtStamp(r.touchedMs)}）`);
    }
    const skipped = rows.filter((r) => r.buildKind === "skipped");
    if (skipped.length > 0) {
        lines.push("");
        lines.push("   ⏭ 本次构建跳过（缺配置，预期内）:");
        for (const r of skipped)
            lines.push(`      · ${r.file}: ${r.buildReason || "缺配置，跳过抓取"}`);
    }
    const failed = rows.filter((r) => r.buildKind === "failed");
    if (failed.length > 0) {
        lines.push("");
        lines.push("   ❌ 本次构建抓取失败（配置齐全但上游/解析出问题，需要人看）:");
        for (const r of failed) lines.push(`      · ${r.file}: ${r.buildReason || "抓取失败"}`);
    }
    const dirty = rows.filter((r) => r.dirty);
    if (dirty.length > 0) {
        lines.push("");
        lines.push("   ✎ 工作区有未提交改动（mtime 比提交时间新，判定仍按提交时间）:");
        for (const r of dirty) lines.push(`      · ${r.file}`);
    }
    if (driftWarnings.length > 0) {
        lines.push("");
        lines.push("   ⚠ PRODUCERS 清单与源码不一致（清单可能过期）:");
        for (const w of driftWarnings) lines.push(`      · ${w}`);
    }
    lines.push("");
    lines.push("   （只读报告，不修改任何 json，也不会让构建失败）");
    lines.push("");
    return lines.join("\n");
}

// ── GitHub step summary ──

function renderMarkdown() {
    const lines = [];
    lines.push("## 📊 数据新鲜度报告");
    lines.push("");
    lines.push(
        `> 时间基准：**git 提交时间**（未入库文件回退 mtime）。阈值：≤${OK_MAX_DAYS} 天 OK · ` +
            `${OK_MAX_DAYS + 1}~${WARN_MAX_DAYS} 天 WARN · >${WARN_MAX_DAYS} 天 STALE。` +
            `扫描 \`${DATA_DIR}\`（跳过 \`i18n/\`），共 **${rows.length}** 个文件。`,
    );
    lines.push("");
    lines.push("| 分级 | 文件 | 最后更新 | 距今 | 抓取方 | 本次构建 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const r of rows) {
        const grade = r.grade === "STALE" ? "⛔ STALE" : r.grade === "WARN" ? "⚠️ WARN" : "✅ OK";
        const stamp = `${fmtStamp(r.touchedMs)}${r.timeSource === "git" ? "" : " (mtime)"}`;
        lines.push(
            `| ${grade} | \`${mdCell(r.file)}\` | ${stamp} | ${r.ageText} | ${mdCell(r.producer)} | ${mdCell(r.buildStatus)} |`,
        );
    }
    lines.push("");
    lines.push(
        `**汇总**：OK **${counts.OK}** · WARN **${counts.WARN}** · STALE **${counts.STALE}**` +
            ` （其中静态/手工维护 ${staticCount} 个）`,
    );
    lines.push(
        `**抓取**：✅ 成功 **${buildCounts.ok}** · ⏭ 跳过 **${buildCounts.skipped}** · ` +
            `❌ 失败 **${buildCounts.failed}** · — 静态 **${buildCounts.static}**` +
            (buildCounts.failed > 0 ? " ← 失败需人工看" : ""),
    );

    const stale = rows.filter((r) => r.grade === "STALE" && !r.static);
    if (stale.length > 0) {
        lines.push("");
        lines.push(`### ⛔ 抓取数据陈旧 (>${WARN_MAX_DAYS} 天)`);
        for (const r of stale) {
            lines.push(`- \`${r.file}\`：${r.ageText}未更新（最后 ${fmtStamp(r.touchedMs)}）`);
        }
    }
    const failed = rows.filter((r) => r.buildKind === "failed");
    if (failed.length > 0) {
        lines.push("");
        lines.push("### ❌ 本次构建抓取失败");
        for (const r of failed)
            lines.push(`- \`${r.file}\`：${mdCell(r.buildReason || "抓取失败")}`);
    }
    const skipped = rows.filter((r) => r.buildKind === "skipped");
    if (skipped.length > 0) {
        lines.push("");
        lines.push("<details><summary>⏭ 本次构建跳过（缺配置，预期内）</summary>");
        lines.push("");
        for (const r of skipped)
            lines.push(`- \`${r.file}\`：${mdCell(r.buildReason || "缺配置，跳过抓取")}`);
        lines.push("");
        lines.push("</details>");
    }
    if (driftWarnings.length > 0) {
        lines.push("");
        lines.push("### ⚠️ 清单与源码不一致");
        for (const w of driftWarnings) lines.push(`- ${mdCell(w)}`);
    }
    lines.push("");
    lines.push(
        "<sub>本报告只读、不阻断构建。数据源与配置见 `scripts/lib/fetch-status.mjs` 与 `scripts/verify-data.mjs`。</sub>",
    );
    lines.push("");
    return lines.join("\n");
}

async function main() {
    if (AS_JSON) {
        console.log(
            JSON.stringify(
                {
                    generatedAt: new Date(now).toISOString(),
                    dataDir: DATA_DIR,
                    thresholds: { okMaxDays: OK_MAX_DAYS, warnMaxDays: WARN_MAX_DAYS },
                    counts,
                    files: rows,
                    driftWarnings,
                },
                null,
                2,
            ),
        );
        return;
    }

    const text = renderText();
    console.log(text);

    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
        try {
            await appendFile(summaryPath, renderMarkdown(), "utf-8");
            console.log(`   → 已追加到 GITHUB_STEP_SUMMARY: ${summaryPath}`);
        } catch (err) {
            console.warn(`   ⚠ 写 step summary 失败（不影响构建）: ${err.message}`);
        }
    } else {
        console.log("   → 未检测到 GITHUB_STEP_SUMMARY（本地运行），仅输出到终端");
    }
    console.log("");
}

try {
    await main();
} catch (err) {
    // 可见性工具绝不能把构建带崩：出错就喊一声，退出码仍是 0
    console.warn(`⚠ [freshness] 报告生成失败（不阻断构建）: ${err?.stack ?? err}`);
}

process.exit(0);
