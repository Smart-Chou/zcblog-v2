#!/usr/bin/env node
/**
 * verify-overlay.mjs — M3-5 overlay 契约门禁（判据 + 分类器）
 *
 * 把 `blog2.0/docs/21-m3-plan.md` §4.1 的三类路径（T / O / X）从文档变成可运行判据：
 * 站点清单 `site.manifest.json` 里的每条规则都必须落到真实文件上，任何一个 tracked 文件
 * 既不能被漏判（unclassified），也不能被两类同时认领（ambiguous）。
 *
 *   O0 清单自洽：`site.manifest.json` 可解析；manifestVersion / theme / classes / anchors 齐；
 *       theme.version 与根 `package.json` 的 version lockstep。
 *   O1 全覆盖：`git ls-files` 的每个文件恰好命中一类 → `classified=N unclassified=0`。
 *   O2 唯一归属：同一路径不得同时命中 T/O/X → `ambiguous=0`。
 *   O3 规则活性：T/O 的每条 `rules` 至少命中 1 个 tracked 文件（死规则 = 契约漂移，判红）；
 *       `reserved` 允许 0 命中（那是「将来会出现」的预留路径，只报 info）。
 *   O4 锚点：清单里的 `anchors` 逐个存在且分类符合声明（覆盖 T/O/X 三侧的代表路径）。
 *   O5 工具一致：`scripts/theme-sync.mjs --list theme|overlay` 与门禁计数完全一致
 *       （升级工具和门禁不许各拿一份真值）。
 *   O6 探针：7 个合成路径（T / O / override / X / 未分类 / 构建目录）必须落到预期类。
 *   O7 示例 overlay：`apps/<site>/` 每个 overlay 的字段完整性（配置 4 件套导出集合与
 *       `theme-template/src/config/*` 同构、≥1 篇 frontmatter v4 文章、≥1 个合法 JSON、
 *       不含主题代码路径）—— 判据与 `scripts/create-site.mjs` 共用本文件的 `validateOverlay()`（R-50）。
 *
 * 用法
 *   node scripts/gates/verify-overlay.mjs              # 跑 O0–O7
 *   node scripts/gates/verify-overlay.mjs --report     # 额外打印分类分布与计划基线差
 *   node scripts/gates/verify-overlay.mjs --root <dir> # 对临时副本跑（负向测试）
 *
 * 导出（`scripts/theme-sync.mjs` 复用同一份分类器，`scripts/create-site.mjs` 复用 overlay 校验）：
 *   loadManifest / compileManifest / classifyWith / readTrackedFiles / classifyTracked / validateOverlay
 *
 * 退出码：0 = 全 PASS；1 = 有违反。
 * 汇总行固定为 `RESULT PASS  classified=N unclassified=0`，供 CI / 卡验收直接 grep。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CLASSES = ["T", "O", "X"];
export const MANIFEST_FILE = "site.manifest.json";

/* ───────────────────────── glob → RegExp ───────────────────────── */

const escapeLiteral = (text) => text.replace(/[.+^${}()|[\]\\]/g, "\\$&");

/**
 * 支持 `**`（跨段）、`*`（段内任意，不含 `/`）、`?`（单字符）三种通配，
 * 一律从仓库根锚定：`src/*.ts` 不匹配 `src/a/b.ts`，`src/**` 匹配任意深度。
 */
export function globToRegExp(glob) {
    const segments = glob.split("/");
    let source = "^";
    segments.forEach((segment, index) => {
        const last = index === segments.length - 1;
        if (segment === "**") {
            source += last ? ".*" : "(?:[^/]+/)*";
            return;
        }
        source += escapeLiteral(segment).replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
        if (!last) source += "/";
    });
    return new RegExp(`${source}$`);
}

/* ───────────────────────── 清单 → 编译产物 ───────────────────────── */

export function loadManifest(root) {
    const file = path.join(root, MANIFEST_FILE);
    if (!existsSync(file)) return { ok: false, problems: [`${MANIFEST_FILE} 不存在`] };
    let manifest;
    try {
        manifest = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
        return { ok: false, problems: [`${MANIFEST_FILE} 不是合法 JSON：${error.message}`] };
    }
    const problems = [];
    if (manifest.manifestVersion !== 1)
        problems.push(`manifestVersion=${manifest.manifestVersion}，判据脚本只认 1`);
    for (const field of ["theme", "planBaseline", "classes", "overrides", "anchors"]) {
        if (!(field in manifest)) problems.push(`缺字段 ${field}`);
    }
    for (const cls of CLASSES) {
        if (!(cls in (manifest.classes ?? {}))) problems.push(`classes.${cls} 不存在`);
    }
    return { ok: problems.length === 0, problems, manifest, file };
}

export function compileManifest(manifest) {
    const rules = [];
    for (const cls of CLASSES) {
        const bucket = manifest.classes?.[cls] ?? {};
        for (const glob of bucket.rules ?? [])
            rules.push({ class: cls, glob, re: globToRegExp(glob), required: true });
        for (const glob of bucket.reserved ?? [])
            rules.push({ class: cls, glob, re: globToRegExp(glob), required: false });
    }
    const overrides = new Map();
    const overrideConflicts = [];
    for (const entry of manifest.overrides ?? []) {
        if (overrides.has(entry.path))
            overrideConflicts.push(`overrides 里 ${entry.path} 重复声明`);
        if (!CLASSES.includes(entry.class))
            overrideConflicts.push(`overrides ${entry.path} 的 class=${entry.class} 非法`);
        overrides.set(entry.path, entry.class);
    }
    return { rules, overrides, overrideConflicts };
}

/** 返回命中该路径的所有类（正常应恰好 1 个）。 */
export function classifyWith(compiled, filePath) {
    const normalized = filePath.replaceAll(path.sep, "/");
    if (compiled.overrides.has(normalized))
        return { classes: [compiled.overrides.get(normalized)], source: "override", matches: [] };
    const matchedClasses = new Set();
    const matches = [];
    for (const rule of compiled.rules) {
        if (!rule.re.test(normalized)) continue;
        matchedClasses.add(rule.class);
        matches.push(rule);
    }
    return { classes: [...matchedClasses], source: matches.length ? "rule" : "none", matches };
}

export function readTrackedFiles(root) {
    try {
        const out = execFileSync("git", ["ls-files", "-z"], {
            cwd: root,
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024,
        });
        return { ok: true, files: out.split("\0").filter(Boolean) };
    } catch (error) {
        return { ok: false, error: String(error.message ?? error) };
    }
}

/** 对 tracked 文件集跑分类；返回计数、漏判/歧义/死规则明细。 */
export function classifyTracked(root, manifest, compiled) {
    const tracked = readTrackedFiles(root);
    if (!tracked.ok) return { ok: false, error: tracked.error };
    const counts = { T: 0, O: 0, X: 0 };
    const unclassified = [];
    const ambiguous = [];
    const ruleHits = new Map(compiled.rules.map((rule) => [rule.glob, 0]));
    let overrideHits = 0;

    for (const file of tracked.files) {
        const result = classifyWith(compiled, file);
        if (result.source === "override") overrideHits += 1;
        for (const rule of result.matches)
            ruleHits.set(rule.glob, (ruleHits.get(rule.glob) ?? 0) + 1);
        if (result.classes.length === 0) {
            unclassified.push(file);
            continue;
        }
        if (result.classes.length > 1) {
            ambiguous.push({ file, classes: result.classes });
            continue;
        }
        counts[result.classes[0]] += 1;
    }

    const deadRules = compiled.rules
        .filter((rule) => rule.required && (ruleHits.get(rule.glob) ?? 0) === 0)
        .map((rule) => `${rule.class} ${rule.glob}`);
    const reservedUnused = compiled.rules
        .filter((rule) => !rule.required && (ruleHits.get(rule.glob) ?? 0) === 0)
        .map((rule) => `${rule.class} ${rule.glob}`);

    return {
        ok: true,
        tracked: tracked.files.length,
        counts,
        classified: counts.T + counts.O + counts.X,
        unclassified,
        ambiguous,
        deadRules,
        reservedUnused,
        overrideHits,
        files: tracked.files,
        manifest,
    };
}

/* ───────────────────────── overlay 字段完整性（O7 / create-site 共用）───────────────────────── */

/** 站点 overlay 必须自带的 4 个配置文件（§4.2：主题只读这 4 个对象的**值**）。 */
export const OVERLAY_CONFIGS = ["site.ts", "feature.ts", "ui.ts", "services.ts"];

/** overlay 里不许出现的主题代码路径（overlay 只放身份/内容/数据，不放实现）。 */
const OVERLAY_FORBIDDEN = [
    [/^src\/(?:components|layouts|pages|utils|scripts|integrations)\//, "主题实现目录"],
    [/^src\/(?:remark-plugin|rehype-plugin)\//, "主题 markdown 管线"],
    [/^src\/(?:schemas|types|data\/i18n)\//, "主题契约 / 词典"],
    [/^src\/content\.config\.ts$/, "内容模型契约"],
    [/^src\/config\/index\.ts$/, "配置聚合入口"],
    [/^packages\//, "主题包"],
];

/** frontmatter v4 必填项（`src/content.config.ts` 里 min(1) 的那三个）。 */
const ARTICLE_REQUIRED = ["title", "description", "pubDate"];

function walkAll(root, relBase = "") {
    const out = [];
    let entries;
    try {
        entries = readdirSync(path.join(root, relBase), { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
        if (entry.isDirectory()) out.push(...walkAll(root, rel));
        else if (entry.isFile()) out.push(rel);
    }
    return out;
}

const exportNames = (source) =>
    [...source.matchAll(/export\s+(?:const|interface|type|function|class)\s+([A-Za-z0-9_]+)/g)].map(
        (match) => match[1],
    );

/**
 * 校验一个 overlay 目录是否「字段完整」：4 配置同构、≥1 篇文章、≥1 个数据 JSON、不含主题代码。
 * 返回 { ok, problems, info, summary } —— problems 非空即不合格（退出码由调用方决定）。
 */
export function validateOverlay(root, overlayRel) {
    const overlayDir = path.join(root, overlayRel);
    const problems = [];
    const info = [];
    const summary = { configs: 0, articles: 0, data: 0, files: 0 };
    if (!existsSync(overlayDir)) {
        return { ok: false, problems: [`overlay 目录不存在：${overlayRel}`], info, summary };
    }
    const files = walkAll(overlayDir);
    summary.files = files.length;
    if (!files.length) problems.push("overlay 为空（至少要有 4 个配置文件）");

    /* ① 配置 4 件套 + 与基线同构（只换值，不改 interface / export 集合） */
    for (const name of OVERLAY_CONFIGS) {
        const rel = `src/config/${name}`;
        const abs = path.join(overlayDir, rel);
        if (!existsSync(abs)) {
            problems.push(`缺配置文件：${rel}`);
            continue;
        }
        summary.configs += 1;
        // 形状真值取主题当前版本（`src/config/<name>`，主题代码就是照它 import 的）；
        // `theme-template/` 是分发快照，可能比主题代码旧（R-50 的漂移源），只在根文件缺失时兜底。
        const baseline = [
            path.join(root, "src/config", name),
            path.join(root, "theme-template/src/config", name),
        ].find((candidate) => existsSync(candidate));
        if (!baseline) continue; // 主题侧也没有 = 不是 overlay 的错
        const want = exportNames(readFileSync(baseline, "utf8"));
        const got = new Set(exportNames(readFileSync(abs, "utf8")));
        const missing = want.filter((symbol) => !got.has(symbol));
        if (missing.length)
            problems.push(`${rel} 缺导出 ${missing.join(", ")}（主题仍会 import 它们）`);
    }

    /* ② site.ts 的身份值：标题非空、url 是绝对 http(s)、domains 非空 */
    const siteFile = path.join(overlayDir, "src/config/site.ts");
    if (existsSync(siteFile)) {
        const source = readFileSync(siteFile, "utf8");
        const title = source.match(/\btitle:\s*"([^"]*)"/)?.[1] ?? "";
        const url = source.match(/\burl:\s*"([^"]*)"/)?.[1] ?? "";
        const domains = source.match(/\bdomains:\s*\[([^\]]*)\]/)?.[1] ?? "";
        if (!title.trim()) problems.push("src/config/site.ts 的 site.title 为空");
        if (!/^https?:\/\/\S+$/.test(url))
            problems.push(`src/config/site.ts 的 site.url 不是绝对地址：${url || "（空）"}`);
        if (!domains.trim()) problems.push("src/config/site.ts 的 site.domains 为空");
        info.push(`site: title=「${title}」 url=${url}`);
    }

    /* ③ 文章：≥1 篇，且 frontmatter 有 v4 必填项 */
    const articles = files.filter((rel) => /^src\/content\/article\/.+\.mdx?$/.test(rel));
    summary.articles = articles.length;
    if (!articles.length) problems.push("src/content/article/ 下没有文章（示例站至少 1 篇）");
    for (const rel of articles) {
        const source = readFileSync(path.join(overlayDir, rel), "utf8");
        const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
        if (!frontmatter) {
            problems.push(`${rel} 没有 frontmatter 区块`);
            continue;
        }
        const missing = ARTICLE_REQUIRED.filter(
            (key) => !new RegExp(`^${key}:\\s*\\S`, "m").test(frontmatter),
        );
        if (missing.length) problems.push(`${rel} frontmatter 缺必填项：${missing.join(", ")}`);
    }

    /* ④ 数据：≥1 个 src/data/*.json，且必须是合法 JSON */
    const dataFiles = files.filter((rel) => /^src\/data\/[^/]+\.json$/.test(rel));
    summary.data = dataFiles.length;
    if (!dataFiles.length) problems.push("src/data/ 下没有 *.json（占位数据至少 1 个）");
    for (const rel of dataFiles) {
        try {
            JSON.parse(readFileSync(path.join(overlayDir, rel), "utf8"));
        } catch (error) {
            problems.push(`${rel} 不是合法 JSON：${error.message}`);
        }
    }

    /* ⑤ 不许把主题代码搬进 overlay（fork 而不是覆盖） */
    for (const rel of files) {
        for (const [re, why] of OVERLAY_FORBIDDEN) {
            if (re.test(rel)) problems.push(`${rel} 属于${why}，overlay 只能改值不能搬实现`);
        }
        if (rel.startsWith("src/styles/") && rel !== "src/styles/site.css")
            problems.push(`${rel}：overlay 只允许新增 src/styles/site.css（§4.2）`);
    }

    info.push(
        `files=${summary.files} configs=${summary.configs} articles=${summary.articles} data=${summary.data}`,
    );
    return { ok: problems.length === 0, problems, info, summary };
}

/* ───────────────────────── CLI ───────────────────────── */

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function pad(text, width) {
    const visual = [...text].reduce((sum, char) => sum + (/[\u4e00-\u9fff]/.test(char) ? 2 : 1), 0);
    return text + " ".repeat(Math.max(0, width - visual));
}

function main() {
    const argv = process.argv.slice(2);
    const argValue = (name) => {
        const index = argv.indexOf(name);
        return index >= 0 ? argv[index + 1] : undefined;
    };
    const repoRoot = path.resolve(argValue("--root") ?? scriptRoot);
    const report = argv.includes("--report");

    const checks = [];
    const addCheck = (id, title, problems, info = []) => checks.push({ id, title, problems, info });

    /* O0 清单自洽 */
    const loaded = loadManifest(repoRoot);
    const o0 = [...loaded.problems];
    let manifest = loaded.manifest ?? null;
    let compiled = null;
    if (manifest) {
        compiled = compileManifest(manifest);
        o0.push(...compiled.overrideConflicts);
        const pkgFile = path.join(repoRoot, "package.json");
        const pkg = existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, "utf8")) : null;
        if (!pkg) o0.push("根 package.json 不存在（版本 lockstep 无法判定）");
        else {
            if (!manifest.theme?.version) o0.push("theme.version 缺失");
            else if (manifest.theme.version !== pkg.version)
                o0.push(
                    `theme.version=${manifest.theme.version} ≠ 根 package.json version=${pkg.version}`,
                );
            if (manifest.theme?.package && manifest.theme.package !== pkg.name)
                o0.push(
                    `theme.package=${manifest.theme.package} ≠ 根 package.json name=${pkg.name}`,
                );
        }
        if (!manifest.theme?.ref) o0.push("theme.ref 缺失（theme-sync 的默认基线）");
    }
    addCheck("O0", `${MANIFEST_FILE} 自洽 + 版本 lockstep`, o0);

    /* O1 / O2 / O3 —— 依赖编译产物；清单坏掉时统一跳过（不隐藏 O0 的红） */
    let classification = null;
    if (compiled && manifest) {
        classification = classifyTracked(repoRoot, manifest, compiled);
        if (!classification.ok) {
            addCheck("O1", "tracked 文件全覆盖（unclassified=0）", [
                `git ls-files 失败：${classification.error}`,
            ]);
            addCheck("O2", "唯一归属（ambiguous=0）", ["跳过：分类失败"]);
            addCheck("O3", "规则活性（T/O 无死规则）", ["跳过：分类失败"]);
            classification = null;
        } else {
            addCheck(
                "O1",
                "tracked 文件全覆盖（unclassified=0）",
                classification.unclassified.map((file) => `未分类：${file}`),
            );
            addCheck(
                "O2",
                "唯一归属（ambiguous=0）",
                classification.ambiguous.map(
                    (item) => `歧义：${item.file} → ${item.classes.join("/")}`,
                ),
                classification.overrideHits
                    ? [`override 命中 ${classification.overrideHits} 个（合法）`]
                    : [],
            );
            addCheck(
                "O3",
                "规则活性（T/O 无死规则）",
                classification.deadRules.map((rule) => `死规则：${rule}`),
                classification.reservedUnused.map((rule) => `reserved 未命中：${rule}`),
            );
        }
    } else {
        for (const [id, title] of [
            ["O1", "tracked 文件全覆盖（unclassified=0）"],
            ["O2", "唯一归属（ambiguous=0）"],
            ["O3", "规则活性（T/O 无死规则）"],
        ])
            addCheck(id, title, ["跳过：清单不可用"]);
    }

    /* O4 锚点 */
    const o4 = [];
    let anchorsOk = 0;
    if (manifest) {
        for (const anchor of manifest.anchors ?? []) {
            if (!anchor.path || !anchor.class) {
                o4.push(`anchor 缺 path/class：${JSON.stringify(anchor)}`);
                continue;
            }
            if (!existsSync(path.join(repoRoot, anchor.path))) {
                o4.push(`anchor 路径不存在：${anchor.path}`);
                continue;
            }
            const result = classifyWith(compiled, anchor.path);
            if (result.classes.length !== 1) {
                o4.push(
                    `anchor ${anchor.path} 命中 ${result.classes.join("/") || "0"} 类，期望 ${anchor.class}`,
                );
                continue;
            }
            if (result.classes[0] !== anchor.class) {
                o4.push(
                    `anchor ${anchor.path} 分类=${result.classes[0]}，清单声明 ${anchor.class}`,
                );
                continue;
            }
            anchorsOk += 1;
        }
        if (!(manifest.anchors ?? []).length) o4.push("anchors 为空（契约没有代表性样本）");
        for (const cls of CLASSES) {
            if (!(manifest.anchors ?? []).some((anchor) => anchor.class === cls))
                o4.push(`anchors 未覆盖 ${cls} 类`);
        }
    } else o4.push("跳过：清单不可用");
    addCheck("O4", `锚点分类符合声明（${anchorsOk} 个）`, o4);

    /* O5 工具一致 */
    const o5 = [];
    const toolFile = path.join(repoRoot, "scripts/theme-sync.mjs");
    if (!existsSync(toolFile)) o5.push("scripts/theme-sync.mjs 不存在");
    else if (classification) {
        for (const [flag, cls] of [
            ["theme", "T"],
            ["overlay", "O"],
            ["exclude", "X"],
        ]) {
            try {
                const out = execFileSync(process.execPath, [toolFile, "--list", flag], {
                    cwd: repoRoot,
                    encoding: "utf8",
                    maxBuffer: 64 * 1024 * 1024,
                });
                const listed = out.split("\n").filter(Boolean).length;
                if (listed !== classification.counts[cls])
                    o5.push(
                        `--list ${flag} 输出 ${listed} 行，门禁 ${cls}=${classification.counts[cls]}`,
                    );
            } catch (error) {
                o5.push(
                    `--list ${flag} 执行失败：${String(error.message ?? error).split("\n")[0]}`,
                );
            }
        }
    } else o5.push("跳过：分类失败");
    addCheck("O5", "theme-sync --list 与门禁同口径", o5);

    /* O6 合成探针 */
    const o6 = [];
    if (compiled) {
        const probes = [
            ["src/components/Probe.astro", "T", "组件属主题"],
            ["src/pages/index.astro", "T", "路由属主题"],
            ["src/config/site.ts", "O", "站点身份属 overlay"],
            ["src/styles/site.css", "O", "override：站点唯一可新增样式"],
            ["docs/_reviews/probe.md", "X", "评审档案排除"],
            ["dist/probe.html", "X", "构建产物排除"],
            ["src/__probe__/unknown.ts", null, "未分类必须被识别"],
        ];
        for (const [probe, expected, why] of probes) {
            const result = classifyWith(compiled, probe);
            const actual =
                result.classes.length === 1 ? result.classes[0] : result.classes.join("/") || null;
            if (actual !== expected)
                o6.push(
                    `探针 ${probe} → ${actual ?? "未分类"}，期望 ${expected ?? "未分类"}（${why}）`,
                );
        }
    } else o6.push("跳过：清单不可用");
    addCheck("O6", "分类探针（含 override / 未分类）", o6);

    /* O7 示例 overlay 字段完整性（apps/<site>/） */
    const o7 = [];
    const o7info = [];
    let overlaysChecked = 0;
    const appsDir = path.join(repoRoot, "apps");
    if (existsSync(appsDir)) {
        for (const entry of [...readdirSync(appsDir, { withFileTypes: true })].sort((a, b) =>
            a.name.localeCompare(b.name),
        )) {
            if (!entry.isDirectory()) continue;
            const rel = `apps/${entry.name}`;
            if (!existsSync(path.join(repoRoot, rel, "src/config/site.ts"))) continue;
            const result = validateOverlay(repoRoot, rel);
            overlaysChecked += 1;
            for (const problem of result.problems) o7.push(`${rel}：${problem}`);
            o7info.push(
                `${rel} files=${result.summary.files} configs=${result.summary.configs} articles=${result.summary.articles} data=${result.summary.data} → ${result.ok ? "PASS" : "FAIL"}`,
            );
        }
        if (!overlaysChecked) o7info.push("apps/ 下没有 overlay 目录（跳过）");
    } else o7info.push("apps/ 不存在（M3-6 前无示例站）");
    addCheck("O7", `示例 overlay 字段完整（${overlaysChecked} 个）`, o7, o7info);

    /* 输出 */
    console.log("M3-5 overlay 契约门禁（T / O / X）");
    console.log(`root: ${repoRoot}`);
    console.log("");
    for (const check of checks) {
        const state = check.problems.length === 0 ? "PASS" : "FAIL";
        console.log(
            `${check.id.padEnd(3)} ${pad(check.title, 44)} ${state}  ${check.problems.length} 项`,
        );
        for (const problem of check.problems) console.log(`    - ${problem}`);
        for (const line of check.info) console.log(`    · ${line}`);
    }

    if (report && classification) {
        console.log("");
        console.log("分类分布");
        const total = classification.tracked || 1;
        for (const cls of CLASSES) {
            const count = classification.counts[cls];
            const pct = ((count / total) * 100).toFixed(1);
            console.log(
                `  ${cls}  ${String(count).padStart(5)}  ${pct.padStart(5)}%  ${manifest.classes[cls].label}`,
            );
        }
        const baseline = manifest.planBaseline?.files;
        const delta = baseline ? classification.classified - baseline : null;
        console.log(
            `  计划基线 ${baseline}（§4.1）· 实测 ${classification.classified} · delta ${delta >= 0 ? "+" : ""}${delta}`,
        );
        const groups = new Map();
        for (const file of classification.files) {
            const result = classifyWith(compiled, file);
            const cls = result.classes.length === 1 ? result.classes[0] : "?";
            const top = file.split("/").length > 1 ? file.split("/").slice(0, 2).join("/") : file;
            const key = `${cls} ${top}`;
            groups.set(key, (groups.get(key) ?? 0) + 1);
        }
        console.log("");
        console.log("按目录（前 24 行，降序）");
        for (const [key, count] of [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24))
            console.log(`  ${key.padEnd(46)} ${String(count).padStart(4)}`);
    }

    const violations = checks.reduce((sum, check) => sum + check.problems.length, 0);
    console.log("");
    if (!classification && violations === 0) {
        console.log("RESULT FAIL  classified=0 unclassified=0（清单不可用，拒绝空转通过）");
        process.exit(1);
    }
    if (violations > 0) {
        console.log(
            `RESULT FAIL  classified=${classification?.classified ?? 0} unclassified=${classification?.unclassified.length ?? "?"} violations=${violations}`,
        );
        process.exit(1);
    }
    const baseline = manifest.planBaseline?.files;
    const delta = baseline ? classification.classified - baseline : 0;
    console.log(
        `RESULT PASS  classified=${classification.classified} unclassified=0 theme=${classification.counts.T} overlay=${classification.counts.O} exclude=${classification.counts.X} plan_baseline=${baseline ?? "?"} delta=${delta >= 0 ? "+" : ""}${delta}`,
    );
    process.exit(0);
}

const invokedDirectly =
    process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
