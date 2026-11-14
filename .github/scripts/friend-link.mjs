/**
 * friend-link.mjs — 友链申请自动化（由 .github/workflows/friend-link.yml 调用）
 *
 *   validate : 检查申请（可达性 / 反链），回评结果
 *   merge    : 将审核通过的申请合并进 src/data/friends.json，回评并关闭 Issue
 *
 * 环境变量（由 workflow 注入）:
 *   GITHUB_TOKEN        ${{ github.token }}
 *   GITHUB_REPOSITORY   owner/repo（Actions 自动提供）
 *   ISSUE_NUMBER        申请 Issue 编号
 *   ISSUE_BODY          申请 Issue 正文（Issue 表单生成的 Markdown）
 *
 * 说明：本站域名从 src/config/site.ts 动态读取，主题快照可通用。
 */

import { readFileSync, writeFileSync } from "node:fs";

const MODE = process.argv[2];
const FRIENDS_FILE = "src/data/friends.json";
const SITE_CONFIG = "src/config/site.ts";

const TOKEN = process.env.GITHUB_TOKEN || "";
const REPO = process.env.GITHUB_REPOSITORY || "";
const ISSUE = process.env.ISSUE_NUMBER || "";
const BODY = process.env.ISSUE_BODY || "";

// ── 基础工具 ──

function fail(message) {
    console.error(`[friend-link] ${message}`);
    process.exit(1);
}

async function ghApi(method, path, body) {
    const res = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "friend-link-bot",
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`GitHub API ${method} ${path} -> ${res.status}`);
    return res.status === 204 ? null : res.json();
}

const comment = (body) => ghApi("POST", `/repos/${REPO}/issues/${ISSUE}/comments`, { body });

/** 解析 Issue 表单正文：按 "### 字段名" 分段 */
function parseIssueBody(body) {
    const fields = {};
    const sections = String(body || "").split(/^###\s+/m);
    for (const section of sections.slice(1)) {
        const nl = section.indexOf("\n");
        if (nl === -1) continue;
        const label = section.slice(0, nl).trim();
        const value = section.slice(nl + 1).trim();
        fields[label] = value;
    }
    return fields;
}

const LABELS = {
    name: "站点名称",
    url: "站点链接",
    description: "站点描述",
    avatar: "头像链接",
    confirm: "确认",
};

function readSubmission() {
    const fields = parseIssueBody(BODY);
    // GitHub 表单空字段会渲染为 "_No response_"，统一视作空值
    const firstLine = (v) => {
        const line = String(v || "")
            .split("\n")[0]
            .trim();
        return line === "_No response_" ? "" : line;
    };
    return {
        name: firstLine(fields[LABELS.name]),
        url: firstLine(fields[LABELS.url]),
        description: firstLine(fields[LABELS.description]),
        avatar: firstLine(fields[LABELS.avatar]),
        confirmed: /\[[xX]\]/.test(fields[LABELS.confirm] || ""),
        rawFields: fields,
    };
}

/** 从站点配置读取本站域名（反链检测用；读取失败则跳过检测） */
function readOwnDomains() {
    try {
        const text = readFileSync(SITE_CONFIG, "utf8");
        const list = text.match(/domains:\s*\[([^\]]*)\]/);
        if (list) {
            const domains = [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
            if (domains.length > 0) return domains;
        }
        const url = text.match(/url:\s*"https?:\/\/([^"/]+)"/);
        if (url) return [url[1]];
    } catch {
        /* 忽略，返回空数组 */
    }
    return [];
}

function validHttpUrl(value) {
    try {
        const u = new URL(value);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

function normalizeUrl(value) {
    return String(value || "")
        .trim()
        .replace(/\/+$/, "")
        .toLowerCase();
}

function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x) =>
        Math.round(255 * x)
            .toString(16)
            .padStart(2, "0");
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// ── validate ──

async function runValidate() {
    const sub = readSubmission();

    if (!sub.name || !validHttpUrl(sub.url)) {
        await comment(
            "🤖 申请信息似乎不完整：请检查 **站点名称** 与 **站点链接**（链接需以 http(s):// 开头）。修改后机器人会重新检查。",
        );
        return;
    }

    const probe = { reachable: false, status: null, html: "", note: "" };
    const fetchOptions = {
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; friend-link-bot/1.0)" },
    };
    try {
        const res = await fetch(sub.url, fetchOptions);
        probe.status = res.status;
        probe.reachable = res.status < 400;
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
            probe.html = (await res.text()).slice(0, 400000);
        }
    } catch (err) {
        probe.note = String(err?.message || err).slice(0, 120);
    }

    const domains = readOwnDomains();
    const lowerHtml = probe.html.toLowerCase();
    let backlink = null; // null = 无法判断
    if (probe.html && domains.length > 0) {
        backlink = domains.some((d) => lowerHtml.includes(d.toLowerCase()));
    }

    const reachableText = probe.reachable
        ? `✅ 可访问（HTTP ${probe.status}）`
        : `❌ 无法访问${probe.note ? `（${probe.note}）` : probe.status ? `（HTTP ${probe.status}）` : ""}`;
    const backlinkText =
        backlink === null
            ? "➖ 跳过（未能读取页面或未配置本站域名）"
            : backlink
              ? "✅ 首页找到本站链接"
              : "⚠️ 首页未检测到（如链接位于友链页等子页面，站长将人工复核）";

    console.log(`[friend-link] validate: reachable=${probe.reachable} backlink=${backlink}`);
    await comment(
        [
            "🤖 已收到友链申请，自动检查结果：",
            "",
            "| 检查项 | 结果 |",
            "| --- | --- |",
            `| 站点可达 | ${reachableText} |`,
            `| 反链检测 | ${backlinkText} |`,
            "",
            "站长将尽快人工审核。审核通过后会为本 Issue 打上 `approved` 标签，机器人将自动合并并重建站点。",
        ].join("\n"),
    );
}

// ── merge ──

async function runMerge() {
    const sub = readSubmission();
    if (!sub.name || !validHttpUrl(sub.url)) {
        await comment("🤖 无法自动合并：站点名称或站点链接缺失/不合法，请站长手动处理。");
        fail("invalid submission");
    }

    const raw = readFileSync(FRIENDS_FILE, "utf8");
    const list = JSON.parse(raw);

    const target = normalizeUrl(sub.url);
    if (list.some((item) => normalizeUrl(item.link) === target)) {
        await comment("🤖 该链接已存在于友链列表中，无需重复添加。");
        console.log("[friend-link] merge: duplicate, skipped");
        return;
    }

    const hue = [...sub.name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
    const entry = {
        id: sub.name.startsWith("@") ? sub.name : `@${sub.name}`,
        link: sub.url,
        avatar: sub.avatar || "",
        style: `color: #fff; background-color: ${hslToHex(hue, 45, 42)}`,
    };

    list.push(entry);
    writeFileSync(FRIENDS_FILE, `${JSON.stringify(list, null, 4)}\n`);

    // 注意：这里只是把改动写进工作区，真正的合并由 workflow 后续步骤开 PR、站长手动合并。
    // 因此措辞不能说「已添加」——PR 没合之前什么都不会上线。
    // issue 由 PR 正文的 `Closes #N` 在合并时自动关闭。
    await comment(
        [
            `✅ 已生成友链更新 **${entry.id}**，已提交为 PR，等待站长合并。`,
            "",
            "> 机器人由站长在 Issue 上打 `approved` 标签触发；如信息有误，请直接在此 Issue 下说明。",
        ].join("\n"),
    );
    console.log(`[friend-link] merge: staged ${entry.id}`);
}

// ── 入口 ──

if (!TOKEN || !REPO || !ISSUE) {
    fail("缺少 GITHUB_TOKEN / GITHUB_REPOSITORY / ISSUE_NUMBER 环境变量");
}

try {
    if (MODE === "validate") {
        await runValidate();
    } else if (MODE === "merge") {
        await runMerge();
    } else {
        fail(`未知模式: ${MODE}（应为 validate 或 merge）`);
    }
} catch (err) {
    console.error(`[friend-link] ${MODE} 执行失败: ${err.message}`);
    try {
        await comment(
            `🤖 自动处理失败：\`${String(err.message).slice(0, 200)}\`，请站长手动检查。`,
        );
    } catch {
        /* 回评也失败则忽略 */
    }
    process.exit(1);
}
