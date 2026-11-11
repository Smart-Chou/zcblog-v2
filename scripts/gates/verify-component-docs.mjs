#!/usr/bin/env node
/**
 * verify-component-docs.mjs — legacy UI 组件文档门禁（M2-10a）
 *
 * 判定 `blog2.0/docs/19-m2-plan.md` §3 M2-10 的文档条款在本卡范围内的那一半：
 * 23 个 legacy UI 组件（`src/components/UI/*.astro`）各一份七章节文档（M2-10a 12 个 +
 * M2-10b 11 个，判据不改）。
 *
 *   D0  registry 可解析：components.ts 的 import / COMPONENT_DOCS 顺序 / data 文件三者一致
 *   D1  23 份文档数据都在 `_docs/data/components/<slug>.json`
 *   D2  七项字段齐全且非空（用途/何时不用、Props、Slots、States、a11y、token 白名单、示例），
 *       且 `layer` 必须是 `ui`
 *   D3  23 个文档页都在 `src/pages/design/components/<slug>.astro`，都用 <ComponentDoc>、
 *       至少一个 <DemoFrame>、经 byComponentSlug("<slug>") 读数据，并 import 真实组件文件
 *   D4  token 名全部能在 tokens.json 解析（数据 + 页面 + 版式 + registry）
 *   D5  文档层不许自造视觉值：页面/版式里 hex / rgb() / hsl() = 0；**数据 JSON 里出现的
 *       字面色值与尺寸字面量必须能在对应组件的源码里逐字找到**——文档可以引用实现的
 *       硬编码值（这是本组组件的核心事实），但不许自己发明
 *   D6  没有 Tailwind / @apply / @theme
 *   D7  页面的 px 字面量只允许 0 / 1px / 2px（与 verify-surface-tokens 的 pages 规则同口径）
 *   D8  若存在 dist（或传 --dist）：每页 7 个 section、无空表、示例区有画框
 *   D9  与 `docs/component-inventory.json` 对账：slug 存在、layer=ui、doc_url 一致、
 *       doc_page 指向本页
 *
 * 用法
 *   node scripts/gates/verify-component-docs.mjs            # 源码门禁
 *   node scripts/gates/verify-component-docs.mjs --dist     # 额外校验构建产物
 *
 * 退出码：0 = 全 PASS；1 = 有 FAIL
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rel = (p) => path.relative(repoRoot, p);

const DATA_DIR = path.join(repoRoot, "src/pages/design/_docs/data/components");
const DOCS_DIR = path.join(repoRoot, "src/pages/design/components");
const REGISTRY = path.join(repoRoot, "src/pages/design/_docs/components.ts");
const LAYOUT_FILES = [
    "src/pages/design/_docs/ComponentDoc.astro",
    "src/pages/design/_docs/components.ts",
];
const TOKENS_REL = "src/styles/tokens/tokens.json";
const INVENTORY_REL = "docs/component-inventory.json";

/**
 * 本卡覆盖的 23 个（M2-10a 的 12 个 + M2-10b 的 11 个）。
 * 顺序 = 文档页 prev/next 顺序 = registry 顺序。
 * slug 规则见 `_docs/index.ts` 的 `legacyUiSlug()`：与 atom 同名才加 `ui-` 前缀。
 */
const LEGACY_SLUGS = [
    "badge",
    "ui-button",
    "ui-card",
    "ui-pagination",
    "archive",
    "pageheader",
    "typewritertext",
    "cardgrid",
    "qrcard",
    "friendpill",
    "donatorslist",
    "author",
    "notice",
    "watermark",
    "walinecomment",
    "search",
    "heatmap",
    "donate",
    "essayitem",
    "friendcard",
    "hitokoto",
    "servicecard",
    "emptystate",
];

/** M1-6 的 12 份 + M8-6-0 的 3 份 atom 文档页（dist 侧一起数，合计 38 份）。 */
const ATOM_PAGES = [
    "button",
    "link",
    "tag",
    "input",
    "card",
    "icon",
    "avatar",
    "divider",
    "breadcrumb",
    "pagination",
    "alert",
    "skeleton",
    "pagehero",
    "sectionhead",
    "datastate",
];

const SECTION_IDS = ["purpose", "props", "slots", "states", "a11y", "tokens", "example"];

const results = [];
const add = (id, title, ok, detail, problems = []) =>
    results.push({ id, title, ok, detail, problems });

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const rowsComplete = (rows, columns) =>
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every((row) => columns.every((column) => nonEmpty(row?.[column])));

/* ───────────────────────── token 集合（与 verify-atom-docs 同口径） ───────────────────────── */

const tokens = JSON.parse(readFileSync(path.join(repoRoot, TOKENS_REL), "utf8"));
const tokenKeys = new Set([
    ...Object.keys(tokens.semantic?.light ?? {}),
    ...Object.keys(tokens.semantic?.dark ?? {}),
    ...Object.keys(tokens.primitive ?? {}),
    ...Object.keys(tokens.responsive ?? {}),
]);

function extractTokens(text) {
    const out = new Set();
    for (const line of text.split(/\r?\n/)) {
        let rest = line;
        const compact = /(--[a-z][a-z0-9-]*?-)(\d+(?:\.\d+)?)((?:\s*\/\s*\d+(?:\.\d+)?)+)/g;
        let match;
        while ((match = compact.exec(line)) !== null) {
            const [, prefix, first, tail] = match;
            out.add(prefix + first);
            for (const num of tail
                .split("/")
                .map((s) => s.trim())
                .filter(Boolean)) {
                out.add(prefix + num);
            }
            rest = rest.replace(match[0], " ");
        }
        for (const token of rest.match(/(?<![\w-])--[a-z][a-z0-9-]*/g) ?? []) {
            if (token.endsWith("-")) continue;
            out.add(token);
        }
    }
    return out;
}

/* ───────────────────────── D0 registry ───────────────────────── */

const registryProblems = [];
const registrySource = existsSync(REGISTRY) ? readFileSync(REGISTRY, "utf8") : "";
if (!existsSync(REGISTRY)) {
    registryProblems.push(`缺 registry：${rel(REGISTRY)}`);
}

const imports = [
    ...registrySource.matchAll(
        /import\s+([A-Za-z_$][\w$]*)\s+from\s+"\.\/data\/components\/([a-z0-9-]+)\.json";/g,
    ),
].map((match) => ({ binding: match[1], slug: match[2] }));

const docsBlock = registrySource.match(
    /export const COMPONENT_DOCS: DocEntry\[\] = \[([\s\S]*?)\] as unknown as DocEntry\[\];/,
);
if (!docsBlock) {
    registryProblems.push(
        "components.ts 里找不到 `export const COMPONENT_DOCS: DocEntry[] = [...] as unknown as DocEntry[];`",
    );
}
const bindingToSlug = new Map(imports.map((item) => [item.binding, item.slug]));
const order = (docsBlock?.[1] ?? "")
    .split("\n")
    .map((line) => line.trim().replace(/,$/, ""))
    .filter((line) => line.length > 0 && !line.startsWith("//"))
    .map((binding) => bindingToSlug.get(binding))
    .filter(Boolean);

if (imports.length !== LEGACY_SLUGS.length) {
    registryProblems.push(
        `data/components/*.json import ${imports.length} 个（应 ${LEGACY_SLUGS.length}）`,
    );
}
if (order.length !== LEGACY_SLUGS.length) {
    registryProblems.push(`COMPONENT_DOCS 解析出 ${order.length} 条（应 ${LEGACY_SLUGS.length}）`);
}
if (JSON.stringify(order) !== JSON.stringify(LEGACY_SLUGS)) {
    const missing = LEGACY_SLUGS.filter((slug) => !order.includes(slug));
    const extra = order.filter((slug) => !LEGACY_SLUGS.includes(slug));
    registryProblems.push(
        `registry 顺序与门禁清单不一致：缺 ${missing.join(",") || "—"} · 多 ${extra.join(",") || "—"}`,
    );
}

add(
    "D0",
    `registry 可解析（${LEGACY_SLUGS.length} 条）`,
    registryProblems.length === 0,
    `import ${imports.length} · DOCS ${order.length}`,
    registryProblems,
);

/* ───────────────────────── D1 数据文件 ───────────────────────── */

const docs = [];
const dataProblems = [];

for (const slug of LEGACY_SLUGS) {
    const file = path.join(DATA_DIR, `${slug}.json`);
    if (!existsSync(file)) {
        dataProblems.push(`缺数据文件：${rel(file)}`);
        continue;
    }
    try {
        docs.push({ slug, file, data: JSON.parse(readFileSync(file, "utf8")) });
    } catch (error) {
        dataProblems.push(`${rel(file)} 不是合法 JSON：${error.message}`);
    }
}

const extraFiles = existsSync(DATA_DIR)
    ? readdirSync(DATA_DIR).filter(
          (name) => name.endsWith(".json") && !LEGACY_SLUGS.includes(name.replace(/\.json$/, "")),
      )
    : [];
if (extraFiles.length > 0) {
    dataProblems.push(`data/components/ 下有多余 JSON（未注册）：${extraFiles.join(", ")}`);
}

add(
    "D1",
    `${LEGACY_SLUGS.length} 份文档数据都在`,
    dataProblems.length === 0,
    `src/pages/design/_docs/data/components/*.json 找到 ${docs.length}/${LEGACY_SLUGS.length}`,
    dataProblems,
);

/* ───────────────────────── D2 字段齐全性 ───────────────────────── */

const fieldProblems = [];
const fieldRows = [];

for (const { slug, data } of docs) {
    const before = fieldProblems.length;

    if (data.slug !== slug)
        fieldProblems.push(`${slug}: slug 字段是 "${data.slug}"，应为 "${slug}"`);
    if (data.kind !== "ui") fieldProblems.push(`${slug}: kind 必须是 "ui"，实际 "${data.kind}"`);
    if (data.layer !== "ui") fieldProblems.push(`${slug}: layer 必须是 "ui"，实际 "${data.layer}"`);
    for (const key of ["name", "cn", "spec", "source", "purpose"]) {
        if (!nonEmpty(data[key])) fieldProblems.push(`${slug}: ${key} 为空`);
    }
    if (
        !rowsComplete(
            data.notFor?.map((item) => ({ item })),
            ["item"],
        )
    ) {
        fieldProblems.push(`${slug}: 用途/何时不用 至少 1 条`);
    }
    if (!rowsComplete(data.props, ["name", "type", "default", "values", "notes"])) {
        fieldProblems.push(`${slug}: Props 表为空或缺列（名称/类型/默认/取值/说明）`);
    }
    if (!rowsComplete(data.slots, ["name", "required", "notes"])) {
        fieldProblems.push(`${slug}: Slots 表为空或缺列（名称/必需/说明）`);
    }
    if (!rowsComplete(data.states, ["state", "trigger", "visual", "aria"])) {
        fieldProblems.push(`${slug}: States 表为空或缺列（状态/触发/视觉/ARIA）`);
    }
    const a11y = data.a11y ?? {};
    for (const key of ["semantics", "keyboard", "aria", "focusRing", "target", "reducedMotion"]) {
        if (!nonEmpty(a11y[key])) fieldProblems.push(`${slug}: a11y.${key} 为空`);
    }
    if (!rowsComplete(a11y.contrast, ["pair", "light", "dark", "threshold"])) {
        fieldProblems.push(`${slug}: 对比度表为空或缺列（色对/light/dark/门槛）`);
    }
    const tokenDoc = data.tokens ?? {};
    const hasColor = Array.isArray(tokenDoc.color) && tokenDoc.color.length > 0;
    if (!hasColor && !nonEmpty(tokenDoc.none)) {
        fieldProblems.push(`${slug}: token 颜色白名单为空且没有 tokens.none 说明`);
    }
    if (!Array.isArray(tokenDoc.metric)) {
        fieldProblems.push(`${slug}: token 度量白名单必须是数组（允许为空，但要在 none 里说清）`);
    }
    if (
        Array.isArray(tokenDoc.metric) &&
        tokenDoc.metric.length === 0 &&
        !hasColor &&
        !nonEmpty(tokenDoc.none)
    ) {
        fieldProblems.push(`${slug}: 颜色与度量都为空，必须在 tokens.none 里说明`);
    }
    if (data.forbidden && (!Array.isArray(data.forbidden) || data.forbidden.length === 0)) {
        fieldProblems.push(`${slug}: forbidden 存在但是空数组`);
    }
    if (!Array.isArray(data.forbidden) || data.forbidden.length === 0) {
        fieldProblems.push(`${slug}: 缺 forbidden（附录 B 是本组文档的必填项）`);
    }

    const metric = Array.isArray(tokenDoc.metric) ? tokenDoc.metric.length : 0;
    fieldRows.push(
        [
            slug.padEnd(14),
            `props=${data.props?.length ?? 0}`,
            `slots=${data.slots?.length ?? 0}`,
            `states=${data.states?.length ?? 0}`,
            `contrast=${a11y.contrast?.length ?? 0}`,
            `tokens=${tokenDoc.color?.length ?? 0}+${metric}`,
            before === fieldProblems.length ? "OK" : "FAIL",
        ].join(" "),
    );
}

add(
    "D2",
    "七项字段齐全且非空（layer=ui）",
    fieldProblems.length === 0 && docs.length === LEGACY_SLUGS.length,
    fieldRows.join(" | "),
    fieldProblems,
);

/* ───────────────────────── D3 文档页 ───────────────────────── */

const pageProblems = [];
const pageRows = [];

for (const { slug, data } of docs) {
    const file = path.join(DOCS_DIR, `${slug}.astro`);
    if (!existsSync(file)) {
        pageProblems.push(`缺文档页：${rel(file)}`);
        continue;
    }
    const source = readFileSync(file, "utf8");
    if (!source.includes("<ComponentDoc")) pageProblems.push(`${slug}: 没有用 <ComponentDoc> 版式`);
    if (!source.includes("<DemoFrame")) pageProblems.push(`${slug}: 没有 <DemoFrame> 示例区`);
    if (!source.includes(`byComponentSlug("${slug}")`)) {
        pageProblems.push(`${slug}: 没有通过 byComponentSlug("${slug}") 读取文档数据`);
    }
    const componentFile = data.source?.split("/").pop();
    if (
        !componentFile ||
        !source.includes(`~/components/UI/${componentFile.replace(/\.astro$/, "")}.astro`)
    ) {
        pageProblems.push(`${slug}: 示例没有 import 真实组件 ${data.source}`);
    }
    if (!existsSync(path.join(repoRoot, data.source ?? ""))) {
        pageProblems.push(`${slug}: data.source 指向的文件不存在 ${data.source}`);
    }
    pageRows.push(`${slug}: ${rel(file)}`);
}

add(
    "D3",
    `${LEGACY_SLUGS.length} 个文档页都在且引用真实组件`,
    pageProblems.length === 0 && pageRows.length === LEGACY_SLUGS.length,
    pageRows.join(" · "),
    pageProblems,
);

/* ───────────────────────── D4–D7 文本层扫描 ───────────────────────── */

const scanTargets = [
    ...docs.map(({ file }) => file),
    ...LAYOUT_FILES.map((file) => path.join(repoRoot, file)),
    ...LEGACY_SLUGS.map((slug) => path.join(DOCS_DIR, `${slug}.astro`)),
].filter((file) => existsSync(file));

const tokenProblems = [];
const colorProblems = [];
const tailwindProblems = [];
const sizeProblems = [];
const inventedProblems = [];
const tokenHits = new Set();

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
const DIMENSION_RE = /\d+(?:\.\d+)?(?:px|rem|em)\b/g;

/** 比较字面值前统一写法：去空白、去掉 0.5 的前导 0（源码写 `0.2`，文档常写 `.2`）。 */
const normalizeLiteral = (text) =>
    text
        .replace(/\s+/g, "")
        .replace(/0\.(\d)/g, ".$1")
        .toLowerCase();

for (const { slug, file, data } of docs) {
    const sourceFile = path.join(repoRoot, data.source ?? "");
    const sourceText = existsSync(sourceFile) ? readFileSync(sourceFile, "utf8") : "";
    // 有的组件把样式放在页面 CSS 里（Archive 在 archives.css、Author 在 article.css、
    // FriendCard 在 home.css + pages/home.css）。`styleSource` 可以是单个路径或路径数组，
    // 字面值在任意一处命中即算「来自实现」。
    const styleSources = Array.isArray(data.styleSource)
        ? data.styleSource
        : nonEmpty(data.styleSource)
          ? [data.styleSource]
          : [];
    const styleText = styleSources
        .map((styleRel) => {
            const styleFile = path.join(repoRoot, styleRel);
            if (!existsSync(styleFile)) {
                inventedProblems.push(`${slug}: data.styleSource 指向的文件不存在 ${styleRel}`);
                return "";
            }
            return readFileSync(styleFile, "utf8");
        })
        .join("\n");
    const haystack = `${sourceText}\n${styleText}`;
    const text = readFileSync(file, "utf8");
    if (!sourceText) {
        inventedProblems.push(`${slug}: 读不到实现 ${data.source}`);
        continue;
    }
    // ① 色值：文档里引用的每个字面色值都必须能在实现里找到（normalize 后比对）。
    const sourceColors = new Set(
        (haystack.match(COLOR_RE) ?? []).map((literal) => normalizeLiteral(literal)),
    );
    COLOR_RE.lastIndex = 0;
    for (const literal of text.match(COLOR_RE) ?? []) {
        const normalized = normalizeLiteral(literal);
        if (!sourceColors.has(normalized)) {
            inventedProblems.push(
                `${rel(file)}: ${literal} 不在 ${data.source} 里（文档自造色值）`,
            );
        }
    }
    COLOR_RE.lastIndex = 0;
    // ② 尺寸：只对「附表 A（sizes）」里的数字做同一条判据——那里写的是实现尺寸；
    //    a11y.target / Props 说明里的 px 可能是 WCAG 门槛或实测目标值，不是实现尺寸。
    const sourceDimensions = new Set(
        (haystack.match(DIMENSION_RE) ?? []).map((literal) => normalizeLiteral(literal)),
    );
    DIMENSION_RE.lastIndex = 0;
    const sizesText = JSON.stringify(data.sizes ?? {});
    for (const literal of sizesText.match(DIMENSION_RE) ?? []) {
        if (!sourceDimensions.has(normalizeLiteral(literal))) {
            inventedProblems.push(
                `${rel(file)}: sizes 里的 ${literal} 不在 ${data.source} 里（文档自造尺寸）`,
            );
        }
    }
    DIMENSION_RE.lastIndex = 0;
}

for (const file of scanTargets) {
    const text = readFileSync(file, "utf8");
    for (const token of extractTokens(text)) {
        tokenHits.add(token);
        if (!tokenKeys.has(token)) tokenProblems.push(`${rel(file)}: tokens.json 里没有 ${token}`);
    }
    text.split(/\r?\n/).forEach((line, i) => {
        if (/tailwind|@apply|@theme/.test(line)) {
            tailwindProblems.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
        }
    });
}

// 页面与版式：0 字面色值；px 只允许 0 / 1px / 2px（与 verify-surface-tokens 的 pages 规则一致）。
for (const file of [
    ...LEGACY_SLUGS.map((slug) => path.join(DOCS_DIR, `${slug}.astro`)),
    ...LAYOUT_FILES.map((file) => path.join(repoRoot, file)),
].filter((file) => existsSync(file))) {
    const text = readFileSync(file, "utf8");
    text.split(/\r?\n/).forEach((line, i) => {
        if (COLOR_RE.test(line)) {
            colorProblems.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
        }
        COLOR_RE.lastIndex = 0;
        for (const literal of line.match(/\d+(?:\.\d+)?px\b/g) ?? []) {
            if (!["0px", "1px", "2px"].includes(literal)) {
                sizeProblems.push(`${rel(file)}:${i + 1}: ${literal}`);
            }
        }
    });
}

add(
    "D4",
    "token 名都能在 tokens.json 解析",
    tokenProblems.length === 0,
    `扫描 ${scanTargets.length} 个文件 · 去重 token ${tokenHits.size} 个 · 未解析 ${tokenProblems.length}`,
    tokenProblems,
);
add(
    "D5",
    "页面/版式 0 字面色值；数据里的字面值必须逐字来自实现",
    colorProblems.length === 0 && inventedProblems.length === 0,
    `页面/版式命中 ${colorProblems.length} · 自造值 ${inventedProblems.length}`,
    [...colorProblems, ...inventedProblems],
);
add(
    "D6",
    "没有 Tailwind / @apply / @theme",
    tailwindProblems.length === 0,
    `语法命中 ${tailwindProblems.length}`,
    tailwindProblems,
);
add(
    "D7",
    "页面 px 字面量只剩 0 / 1px / 2px",
    sizeProblems.length === 0,
    `白名单外命中 ${sizeProblems.length}`,
    sizeProblems,
);

/* ───────────────────────── D9 与组件清单对账 ───────────────────────── */

const inventoryPath = path.join(repoRoot, INVENTORY_REL);
const inventoryProblems = [];
let inventoryDetail = "跳过（没有清单）";

if (existsSync(inventoryPath)) {
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    const components = Array.isArray(inventory.components) ? inventory.components : [];
    for (const slug of LEGACY_SLUGS) {
        const entry = components.find((component) => component.slug === slug);
        if (!entry) {
            inventoryProblems.push(
                `清单缺 ${slug}（先跑 verify-component-inventory.mjs --update）`,
            );
            continue;
        }
        if (entry.layer !== "ui")
            inventoryProblems.push(`${slug}: 清单 layer=${entry.layer}，应为 ui`);
        if (entry.doc_url !== `/design/components/${slug}/`) {
            inventoryProblems.push(
                `${slug}: 清单 doc_url=${entry.doc_url}，应为 /design/components/${slug}/`,
            );
        }
        const page = path.join(DOCS_DIR, `${slug}.astro`);
        if (!existsSync(page)) inventoryProblems.push(`${slug}: 文档页不存在 ${rel(page)}`);
    }
    inventoryDetail = `${LEGACY_SLUGS.length} 条对账 · 清单 ${components.length} 条`;
}

add(
    "D9",
    "与 docs/component-inventory.json 对账（slug / layer / doc_url）",
    inventoryProblems.length === 0,
    inventoryDetail,
    inventoryProblems,
);

/* ───────────────────────── D8 构建产物（可选） ───────────────────────── */

const distDir = path.join(repoRoot, "dist");
const wantDist = process.argv.includes("--dist") || existsSync(distDir);

if (wantDist && existsSync(distDir)) {
    const distProblems = [];
    const distRows = [];
    for (const slug of LEGACY_SLUGS) {
        const htmlFile = path.join(distDir, "design/components", slug, "index.html");
        if (!existsSync(htmlFile)) {
            distProblems.push(`缺构建产物：${rel(htmlFile)}`);
            continue;
        }
        const html = readFileSync(htmlFile, "utf8");
        const missing = SECTION_IDS.filter((id) => !html.includes(`id="${id}"`));
        if (missing.length > 0) distProblems.push(`${slug}: 缺 section ${missing.join(", ")}`);
        const tables = html.match(/<table\b[\s\S]*?<\/table>/g) ?? [];
        const empty = tables.filter((table) => (table.match(/<tr\b/g) ?? []).length < 2).length;
        if (empty > 0) distProblems.push(`${slug}: 有 ${empty} 个空表`);
        // 每页 5 张表：Props / Slots / States / 对比度 / 附录 A 尺寸（M2-10 的验收口径）
        if (tables.length < 5) {
            distProblems.push(
                `${slug}: 只有 ${tables.length} 张表（应 5：props/slots/states/对比度/尺寸）`,
            );
        }
        const example = html.slice(html.indexOf('id="example"'));
        if (!example.includes('class="frame')) distProblems.push(`${slug}: 示例区没有画框`);
        distRows.push(
            `${slug}(sections=${SECTION_IDS.length - missing.length}/7, tables=${tables.length})`,
        );
    }

    // 35 份 = 23 份 legacy UI + 12 份 M1-6 atom（atom 页不归本卡写，但要在总数里对得上）
    const missingAtoms = [];
    for (const slug of ATOM_PAGES) {
        const htmlFile = path.join(distDir, "design/atoms", slug, "index.html");
        if (!existsSync(htmlFile)) {
            missingAtoms.push(`design/atoms/${slug}`);
            continue;
        }
        const html = readFileSync(htmlFile, "utf8");
        const missing = SECTION_IDS.filter((id) => !html.includes(`id="${id}"`));
        const tables = (html.match(/<table\b[\s\S]*?<\/table>/g) ?? []).length;
        if (missing.length > 0) missingAtoms.push(`design/atoms/${slug} 缺 ${missing.join(",")}`);
        if (tables < 5) missingAtoms.push(`design/atoms/${slug} 只有 ${tables} 张表`);
    }
    if (missingAtoms.length > 0) {
        distProblems.push(`atom 文档页不齐或不完整：${missingAtoms.join(" · ")}`);
    }
    const totalDocs = LEGACY_SLUGS.length + ATOM_PAGES.length - missingAtoms.length;
    add(
        "D8",
        `构建产物：${LEGACY_SLUGS.length + ATOM_PAGES.length} 份文档 · 7 个 section · 5 张表 · 有示例画框`,
        distProblems.length === 0,
        `${totalDocs}/${LEGACY_SLUGS.length + ATOM_PAGES.length} 份（${LEGACY_SLUGS.length} UI + ${ATOM_PAGES.length} atom）· ${distRows.join(" ")}`,
        distProblems,
    );
} else {
    add("D8", "构建产物检查", true, "跳过（没有 dist；先 astro build 或传 --dist）", []);
}

/* ───────────────────────── 输出 ───────────────────────── */

let failed = 0;
console.log("\nLegacy UI 组件文档门禁（M2-10a · 19-m2-plan §3 M2-10）\n");
for (const result of results) {
    const mark = result.ok ? "PASS" : "FAIL";
    if (!result.ok) failed += 1;
    console.log(`${mark}  ${result.id}  ${result.title}`);
    console.log(`      ${result.detail}`);
    for (const problem of result.problems.slice(0, 20)) console.log(`      - ${problem}`);
    if (result.problems.length > 20) {
        console.log(`      … 另有 ${result.problems.length - 20} 条`);
    }
}
console.log(`\n${results.length - failed}/${results.length} PASS\n`);

process.exit(failed === 0 ? 0 : 1);
