#!/usr/bin/env node
/**
 * 构建收尾：HTML 空白折叠（M2-11a）。
 *
 * ── 为什么需要它 ─────────────────────────────────────────────────────────────
 * `perf-budget.py` 的 list 桶对 `archives/index.html` 是 105KB（原始字节），
 * archives 页随文章数线性增长，本卡（i18n 切换器 +4 门语言）后 106.1~106.3KB 越线。
 *
 * 实测结论（先量后改，别信"缩进占 5KB"的直觉）：
 *   Astro 默认 `compressHTML: true`，`>\n\s+<` 这种缩进**在产物里一个都没有**，
 *   所以按字面做「折叠标签间空白」省 0 字节。真正的冗余是另外三类：
 *     ① HTML 注释（`<!-- Global Meta -->` 之类，每页 ~800B）；
 *     ② 属性值多余的引号（`class="foo"` → `class=foo`，每页 ~1.7KB）；
 *     ③ Astro 作用域标记 `data-astro-cid-xxx="true"` 里的 `="true"`
 *        （scoped CSS 用的是 `[data-astro-cid-xxx]` 存在性选择器，值无意义）。
 *
 * ── 安全边界（每一条都对应一个断言/测试）─────────────────────────────────────
 * 1. `script/style/pre/textarea/code` 内部**一个字节都不碰**；折叠前后会逐块比对，
 *    不一致直接 exit 1 且不写盘（JSON-LD、inline script 字节不变的机器保证）。
 * 2. 只折叠**整段都是空白**的文本节点，且折叠成单个空格（不是删掉）——
 *    这样即便两侧是 inline 元素，词间距也不变。混合文本节点内部不动。
 * 3. 引号只在「值只含保守字符集 + 不落在自闭合标签 + 不以 / 结尾」时去掉，
 *    避免 `<img src=x/>` 把 `/` 吞进值里（HTML5 无引号属性值的经典坑）。
 * 4. 条件注释（`<!--[if`）、`<!--<`、`<!--!`）保留；其余注释删除。
 * 5. 幂等：同一份产物跑第二次报告 0 字节变化（构建链里 integration 与
 *    package.json 各跑一次，不能互相打架）。
 *
 * 用法:
 *   node scripts/postbuild/collapse-html-whitespace.mjs [dist] [--dry-run] [--verbose]
 *   import { collapseDist } from "./collapse-html-whitespace.mjs";
 *   await collapseDist("dist", { logger });
 *
 * 退出码: 0 = 成功（或无需改动）；1 = 校验失败（受保护块被改动 / 文件变大）
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";

/** 内部字节必须原样保留的元素（白名单式：只有这些元素的内容按原文复制）。 */
const PROTECTED_ELEMENTS = new Set(["script", "style", "pre", "textarea", "code"]);

/** 允许去掉引号的属性值字符集：无空格/引号/反引号/尖括号/等号/&。 */
const UNQUOTABLE = /^[A-Za-z0-9._:\/#?~+@!$%-]+$/;

/** ` name = "value"` —— 只在标签内部匹配，值不含 `"`（HTML 不允许未转义引号）。 */
const ATTRIBUTE_RE = /\s([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*"([^"]*)"/g;

/** 保留的注释前缀（条件注释 / 压缩器约定）。 */
const KEEP_COMMENT = /^<!--(\[if|<!|!)/i;

/**
 * 从 `i`（指向 `<` 之后）找到标签结束的 `>`，跳过引号内的 `>`。
 * @returns {number} `>` 的下标；找不到时返回 -1
 */
function findTagEnd(html, i) {
    let quote = null;
    for (let j = i; j < html.length; j++) {
        const c = html[j];
        if (quote) {
            if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
            quote = c;
        } else if (c === ">") {
            return j;
        }
    }
    return -1;
}

/** 取 `</name ...>` 的结束位置（大小写不敏感），找不到返回 -1。 */
function findCloseTag(html, from, name) {
    const lower = html.toLowerCase();
    const needle = `</${name}`;
    let at = lower.indexOf(needle, from);
    while (at !== -1) {
        const after = html[at + needle.length];
        // `</script>` 之后必须是空白或 `>`，避免命中 `</scriptx>`
        if (after === undefined || after === ">" || /\s/.test(after)) {
            const end = findTagEnd(html, at + 2);
            return end === -1 ? -1 : end + 1;
        }
        at = lower.indexOf(needle, at + needle.length);
    }
    return -1;
}

/** 收集所有受保护块的原始字节（用于折叠前后比对）。 */
export function collectProtected(html) {
    const blocks = [];
    let i = 0;
    for (;;) {
        const lt = html.indexOf("<", i);
        if (lt === -1) break;
        if (html.startsWith("<!--", lt)) {
            const close = html.indexOf("-->", lt + 4);
            i = close === -1 ? html.length : close + 3;
            continue;
        }
        const end = findTagEnd(html, lt + 1);
        if (end === -1) break;
        const raw = html.slice(lt + 1, end);
        const m = /^\s*([A-Za-z][A-Za-z0-9:-]*)/.exec(raw);
        const name = m ? m[1].toLowerCase() : "";
        i = end + 1;
        if (!m || raw.startsWith("/") || !PROTECTED_ELEMENTS.has(name)) continue;
        const close = findCloseTag(html, i, name);
        const stop = close === -1 ? html.length : close;
        blocks.push(html.slice(lt, stop));
        i = stop;
    }
    return blocks;
}

/** 重写单个标签：去 `="true"`、去多余引号。非标签原样返回。 */
function rewriteTag(tag, stats) {
    if (tag.startsWith("</") || tag.startsWith("<!")) return tag;
    let out = tag.replace(/(\sdata-astro-cid-[A-Za-z0-9]+)="true"/g, (match, attr) => {
        stats.cidBytes += match.length - attr.length;
        stats.cidCount += 1;
        return attr;
    });
    // 自闭合标签里不能去引号：`<img src=x/>` 的 `/` 会被吞进属性值
    if (/\/\s*>$/.test(out)) return out;
    out = out.replace(ATTRIBUTE_RE, (match, name, value) => {
        if (!value || !UNQUOTABLE.test(value) || value.endsWith("/")) return match;
        stats.quoteBytes += 2;
        stats.quoteCount += 1;
        return ` ${name}=${value}`;
    });
    return out;
}

/**
 * 折叠一份 HTML 文档。
 * @param {string} html
 * @returns {{ html: string, stats: object }}
 */
export function collapseHtml(html) {
    const stats = {
        comments: 0,
        commentBytes: 0,
        cidCount: 0,
        cidBytes: 0,
        quoteCount: 0,
        quoteBytes: 0,
        wsCount: 0,
        wsBytes: 0,
    };
    const parts = [];
    let lastWasTag = false;
    let i = 0;

    while (i < html.length) {
        const lt = html.indexOf("<", i);

        // ── 标签之间的文本节点 ──────────────────────────────────────────────
        const text = lt === -1 ? html.slice(i) : html.slice(i, lt);
        if (text) {
            if (/^[ \t\r\n\f]+$/.test(text)) {
                // 整段空白：折叠成单个空格（保留 inline 词间距），文档首尾直接丢
                if (lastWasTag && lt !== -1) {
                    parts.push(" ");
                    stats.wsCount += 1;
                    stats.wsBytes += text.length - 1;
                } else {
                    stats.wsBytes += text.length;
                }
            } else {
                parts.push(text); // 混合文本节点内部一个字节都不动
            }
        }
        if (lt === -1) break;

        // ── 注释 ───────────────────────────────────────────────────────────
        if (html.startsWith("<!--", lt)) {
            const close = html.indexOf("-->", lt + 4);
            const end = close === -1 ? html.length : close + 3;
            const comment = html.slice(lt, end);
            if (KEEP_COMMENT.test(comment)) {
                parts.push(comment);
            } else {
                stats.comments += 1;
                stats.commentBytes += comment.length;
            }
            lastWasTag = true;
            i = end;
            continue;
        }

        // ── 声明 / CDATA / 处理指令：原样复制 ──────────────────────────────
        if (html.startsWith("<![CDATA[", lt)) {
            const close = html.indexOf("]]>", lt + 9);
            const end = close === -1 ? html.length : close + 3;
            parts.push(html.slice(lt, end));
            lastWasTag = true;
            i = end;
            continue;
        }
        if (html[lt + 1] === "!" || html[lt + 1] === "?") {
            const end = html.indexOf(">", lt + 2);
            const stop = end === -1 ? html.length : end + 1;
            parts.push(html.slice(lt, stop));
            lastWasTag = true;
            i = stop;
            continue;
        }

        // ── 普通标签 ───────────────────────────────────────────────────────
        const end = findTagEnd(html, lt + 1);
        if (end === -1) {
            parts.push(html.slice(lt)); // 残缺标签：原样保留，不猜
            break;
        }
        const tag = html.slice(lt, end + 1);
        i = end + 1;

        const inner = html.slice(lt + 1, end);
        const m = /^\s*([A-Za-z][A-Za-z0-9:-]*)/.exec(inner);
        const name = m ? m[1].toLowerCase() : "";

        // 受保护元素：从开标签到闭标签整段原样复制（内部不做任何处理）
        if (m && !inner.startsWith("/") && PROTECTED_ELEMENTS.has(name) && !/\/\s*$/.test(inner)) {
            const close = findCloseTag(html, i, name);
            const stop = close === -1 ? html.length : close;
            parts.push(html.slice(lt, stop));
            lastWasTag = true;
            i = stop;
            continue;
        }

        parts.push(rewriteTag(tag, stats));
        lastWasTag = true;
    }

    const out = parts.join("");
    return { html: out, stats };
}

/** 递归收集目录下的 .html 文件。 */
async function walk(dir, acc = []) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) await walk(p, acc);
        else if (entry.isFile() && entry.name.endsWith(".html")) acc.push(p);
    }
    return acc;
}

/**
 * 对构建产物目录执行折叠。
 * @param {string} dist 产物目录
 * @param {{ dryRun?: boolean, verbose?: boolean, logger?: Console }} [opts]
 */
export async function collapseDist(dist, opts = {}) {
    const { dryRun = false, verbose = false, logger = console } = opts;
    const dir = dist.replace(/\/+$/, "");
    if (!existsSync(dir)) throw new Error(`[collapse-html] 目录不存在: ${dir}`);

    const files = (await walk(dir)).sort();
    const total = {
        files: files.length,
        before: 0,
        after: 0,
        changed: 0,
        comments: 0,
        commentBytes: 0,
        cidCount: 0,
        cidBytes: 0,
        quoteCount: 0,
        quoteBytes: 0,
        wsCount: 0,
        wsBytes: 0,
    };
    const failures = [];

    for (const file of files) {
        const before = await readFile(file, "utf8");
        const sizeBefore = Buffer.byteLength(before);
        const { html: after, stats } = collapseHtml(before);
        const sizeAfter = Buffer.byteLength(after);

        // ① 受保护块必须逐字节不变
        const protectedBefore = collectProtected(before);
        const protectedAfter = collectProtected(after);
        if (
            protectedBefore.length !== protectedAfter.length ||
            protectedBefore.some((block, idx) => block !== protectedAfter[idx])
        ) {
            failures.push(
                `${relative(dir, file)}: 受保护块（script/style/pre/textarea/code）被改动`,
            );
            continue;
        }
        // ② 产物只许变小
        if (sizeAfter > sizeBefore) {
            failures.push(`${relative(dir, file)}: 折叠后变大 ${sizeBefore} → ${sizeAfter}`);
            continue;
        }

        total.before += sizeBefore;
        total.after += sizeAfter;
        for (const key of [
            "comments",
            "commentBytes",
            "cidCount",
            "cidBytes",
            "quoteCount",
            "quoteBytes",
            "wsCount",
            "wsBytes",
        ]) {
            total[key] += stats[key];
        }
        if (sizeAfter !== sizeBefore) {
            total.changed += 1;
            if (verbose)
                logger.log(
                    `  ${relative(dir, file).padEnd(46)} ${sizeBefore} → ${sizeAfter} (-${sizeBefore - sizeAfter})`,
                );
            if (!dryRun) await writeFile(file, after, "utf8");
        }
    }

    const saved = total.before - total.after;
    const pct = total.before ? ((saved / total.before) * 100).toFixed(2) : "0.00";
    logger.log(
        `[collapse-html] ${total.files} 页 · ${total.changed} 页有改动 · ${total.before} → ${total.after} B（-${saved} B / -${pct}%）` +
            ` | 注释 -${total.commentBytes}（${total.comments} 处）· 引号 -${total.quoteBytes}（${total.quoteCount} 处）` +
            ` · cid -${total.cidBytes}（${total.cidCount} 处）· 空白节点 -${total.wsBytes}（${total.wsCount} 处）`,
    );
    if (failures.length) {
        for (const f of failures) logger.error(`[collapse-html] ✗ ${f}`);
        throw new Error(`[collapse-html] ${failures.length} 个文件校验失败，未写入`);
    }
    return { ...total, saved, pct, dryRun };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
    const args = process.argv.slice(2);
    const target = args.find((a) => !a.startsWith("--")) ?? "dist";
    const dryRun = args.includes("--dry-run");
    const verbose = args.includes("--verbose");
    collapseDist(target, { dryRun, verbose })
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err.message);
            process.exit(1);
        });
}
