#!/usr/bin/env node
/**
 * verify-component-inventory.mjs — M2-1 组件清单门禁（P9 的分母）
 *
 * 判定 `blog2.0/docs/19-m2-plan.md` §3 M2-1 的前两件事：
 *   ① 从源码反推组件清单，冻结 P9 的分母：15 atoms（11 atom + 4 molecule）
 *      + 23 legacy UI + 11 page-organism 债（另有 1 个 layout 壳，见 I3）；
 *   ② `docs/component-inventory.json` 是唯一分母，清单与源码不一致即红。
 *
 * 判据
 *   I1 registry 可解析：`src/pages/design/_docs/index.ts` 的 DOCS 与 15 份 data/*.json 一一对应
 *   I2 atoms：清单里的 atom/molecule 记录 = registry 15 条；file 与 data.source 一致；
 *      doc_url = /design/atoms/<slug>/ 且页面存在
 *   I3 legacy UI：src/components/UI/*.astro 的每个文件都在清单里（23 个 ui + 1 个 layout 壳），
 *      ui 记录必须有 slug/file/layer/usage_count/doc_url/status，doc_url = /design/components/<slug>/
 *   I4 page-organism：src/components/Pages/*.astro 12 个全部登记（status=debt，不写文档）
 *   I5 slug：全局唯一；与 atom 同名的 legacy UI 必须加 `ui-` 前缀（ui-button / ui-card / ui-pagination）
 *   I6 counts：清单自报的计数 = 门禁冻结的分母 = 源码实测
 *   I7 usage：usage_count / usage_tags 是快照；0 引用且 status 不是 dead 即红
 *
 * 用法
 *   node scripts/gates/verify-component-inventory.mjs            # 校验
 *   node scripts/gates/verify-component-inventory.mjs --update   # 重算 usage 并重写清单
 *   node scripts/gates/verify-component-inventory.mjs --root <dir>  # 对临时副本跑（负向测试用）
 *
 * 退出码：0 = 全 PASS；1 = 有 FAIL
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ───────────────────────── 参数 ───────────────────────── */

const argv = process.argv.slice(2);
const argValue = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
};
const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(argValue("--root") ?? scriptRoot);
const update = argv.includes("--update");
const rel = (p) => path.relative(repoRoot, p);

const INVENTORY_REL = "docs/component-inventory.json";
const REGISTRY_REL = "src/pages/design/_docs/index.ts";
const DATA_DIR_REL = "src/pages/design/_docs/data";
const ATOM_PAGE_DIR_REL = "src/pages/design/atoms";
const UI_DIR_REL = "src/components/UI";
const PAGES_DIR_REL = "src/components/Pages";
const LEGACY_UI_SLUG_PREFIX = "ui-";

/** 冻结的分母：改这里 = 改 P9 的口径，必须走 decision-log。 */
/**
 * 2026-11-04 M2-2（D-0110）：`Pages/HomeContent.astro` 作为纯模板壳被消解进
 * `src/pages/index.astro` / `src/pages/en/index.astro` 并删除，page-organism 债
 * 12 → 11、total 48 → 47。这是**收紧**（分母只减不增），依据 `19-m2-plan.md`
 * §3 M2-2「消解进路由并在卡内删除该文件；§4.4 的 page-organism 债 -1」。
 */
const FROZEN_COUNTS = { atom: 11, molecule: 4, ui: 24, layout: 1, "page-organism": 11, total: 51 };

/** 唯一一个不进 UI 文档分母的 UI 文件：纯 slot 容器，无 props / 状态 / 样式。 */
const LAYOUT_SHELLS = {
    "src/components/UI/PostCardShell.astro":
        "纯 slot 容器（post-card 外壳），无 props / 状态 / 样式，不构成可文档化的 UI 组件（M2-1 记账）",
};

const SKIP_DIRS = new Set([
    "node_modules",
    "dist",
    ".git",
    ".astro",
    "test-results",
    "playwright-report",
    ".vite-cache",
    ".wrangler",
]);
const SOURCE_EXT = /\.(astro|ts|tsx|js|mjs)$/;

/* ───────────────────────── 工具 ───────────────────────── */

const problems = [];
const rows = [];
const addCheck = (id, title, ok, detail, detailProblems = []) => {
    rows.push({ id, title, ok, detail, problems: detailProblems });
    if (!ok) problems.push(...detailProblems.map((p) => `${id} ${p}`));
};

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

const toPosix = (p) => p.split(path.sep).join("/");

/** 生成物必须与 CI 的 `prettier --check .` 相容：写完就地格式化。 */
function formatWithPrettier(file) {
    const bin = path.join(repoRoot, "node_modules/.bin/prettier");
    if (!existsSync(bin)) return;
    const result = spawnSync(bin, ["--write", "--log-level", "warn", file], {
        cwd: repoRoot,
        stdio: "inherit",
    });
    if (result.status !== 0)
        console.error("prettier --write 失败：门禁值不受影响，但 CI 的 lint 会红");
}

/** 解析 registry：import 顺序 + DOCS 数组顺序 + 每份 data/*.json 的 slug。 */
function parseRegistry() {
    const file = path.join(repoRoot, REGISTRY_REL);
    if (!existsSync(file)) return { error: `${REGISTRY_REL} 不存在` };
    const source = readFileSync(file, "utf8");

    const imports = [
        ...source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+"\.\/data\/([a-z0-9-]+)\.json";/g),
    ].map((match) => ({ binding: match[1], slug: match[2] }));
    const docsBlock = source.match(
        /export const DOCS: DocEntry\[\] = \[([\s\S]*?)\] as unknown as DocEntry\[\];/,
    );
    if (!docsBlock)
        return {
            error: "index.ts 里找不到 `export const DOCS: DocEntry[] = [...] as unknown as DocEntry[];`",
        };
    const docOrder = docsBlock[1]
        .split("\n")
        .map((line) => line.trim().replace(/,$/, ""))
        .filter((line) => line.length > 0 && !line.startsWith("//"));

    const bindingToSlug = new Map(imports.map((item) => [item.binding, item.slug]));
    const order = docOrder.map((binding) => bindingToSlug.get(binding)).filter(Boolean);

    const slugProblems = [];
    if (imports.length !== 15)
        slugProblems.push(`data/*.json import ${imports.length} 个（应 15）`);
    if (order.length !== docOrder.length) {
        slugProblems.push(
            `DOCS 数组有 ${docOrder.length - order.length} 项没有对应的 data/*.json import`,
        );
    }
    const dup = order.filter((slug, index) => order.indexOf(slug) !== index);
    if (dup.length) slugProblems.push(`registry slug 重复：${[...new Set(dup)].join(", ")}`);

    const dataProblems = [];
    const docs = [];
    for (const slug of order) {
        const dataFile = path.join(repoRoot, DATA_DIR_REL, `${slug}.json`);
        if (!existsSync(dataFile)) {
            dataProblems.push(`缺数据文件 ${DATA_DIR_REL}/${slug}.json`);
            continue;
        }
        const data = JSON.parse(readFileSync(dataFile, "utf8"));
        if (data.slug !== slug) dataProblems.push(`${slug}.json 的 slug 是 "${data.slug}"`);
        docs.push({ slug, data, file: toPosix(path.relative(repoRoot, dataFile)) });
    }
    const extra = existsSync(path.join(repoRoot, DATA_DIR_REL))
        ? readdirSync(path.join(repoRoot, DATA_DIR_REL))
              .filter((name) => name.endsWith(".json"))
              .map((name) => name.replace(/\.json$/, ""))
              .filter((slug) => !order.includes(slug))
        : [];
    if (extra.length) dataProblems.push(`data/ 下有未注册的 JSON：${extra.join(", ")}`);

    return { source, order, docs, problems: [...slugProblems, ...dataProblems] };
}

/** import 说明符 → 仓库相对路径（只处理 ~/ 与相对路径）。 */
function resolveSpecifier(specifier, importerRel) {
    if (specifier.startsWith("~/"))
        return toPosix(path.posix.normalize(`src/${specifier.slice(2)}`));
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
        const base = path.posix.dirname(importerRel);
        return toPosix(path.posix.normalize(path.posix.join(base, specifier)));
    }
    return null;
}

/** 组件在 src/ 下的引用点：import 的文件数（usage_count）+ 标签出现次数（usage_tags）。 */
function buildUsageIndex() {
    const index = new Map(); // targetRel → { files: Set, tags: number }
    const files = walk(path.join(repoRoot, "src")).filter((file) => SOURCE_EXT.test(file));
    for (const file of files) {
        const importerRel = toPosix(path.relative(repoRoot, file));
        const source = readFileSync(file, "utf8");
        const imports = [
            ...source.matchAll(
                /import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s+["']([^"']+)["']/g,
            ),
        ];
        for (const [, binding, specifier] of imports) {
            const target = resolveSpecifier(specifier, importerRel);
            if (!target || target === importerRel) continue;
            const tags = (source.match(new RegExp(`<${binding}(?=[\\s/>])`, "g")) ?? []).length;
            const entry = index.get(target) ?? { files: new Set(), tags: 0 };
            entry.files.add(importerRel);
            entry.tags += tags;
            index.set(target, entry);
        }
    }
    return index;
}

const usageIndex = buildUsageIndex();
const usageOf = (fileRel) => {
    const entry = usageIndex.get(fileRel);
    return { usage_count: entry ? entry.files.size : 0, usage_tags: entry ? entry.tags : 0 };
};

const componentName = (fileRel) => path.posix.basename(fileRel, ".astro");
const slugFor = (name, atomSlugs) => {
    const base = name.toLowerCase();
    return atomSlugs.has(base) ? `${LEGACY_UI_SLUG_PREFIX}${base}` : base;
};

/* ───────────────────────── 生成清单 ───────────────────────── */

function buildInventory(registry) {
    const atomSlugs = new Set(registry.order);
    const components = [];

    for (const { slug, data } of registry.docs) {
        const file = data.source;
        components.push({
            slug,
            name: data.name,
            kind: data.layer,
            layer: data.layer,
            file,
            spec: data.spec,
            doc_url: `/design/atoms/${slug}/`,
            doc_page: `${ATOM_PAGE_DIR_REL}/${slug}.astro`,
            status: "documented",
            ...usageOf(file),
        });
    }

    const uiFiles = readdirSync(path.join(repoRoot, UI_DIR_REL))
        .filter((name) => name.endsWith(".astro"))
        .sort()
        .map((name) => `${UI_DIR_REL}/${name}`);

    for (const file of uiFiles) {
        if (LAYOUT_SHELLS[file]) continue;
        const name = componentName(file);
        const slug = slugFor(name, atomSlugs);
        components.push({
            slug,
            name,
            kind: "ui",
            layer: "ui",
            file,
            doc_url: `/design/components/${slug}/`,
            doc_page: null,
            status: "pending",
            ...usageOf(file),
        });
    }

    for (const file of Object.keys(LAYOUT_SHELLS).sort()) {
        const name = componentName(file);
        components.push({
            slug: slugFor(name, atomSlugs),
            name,
            kind: null,
            layer: "layout",
            file,
            doc_url: null,
            doc_page: null,
            status: "excluded",
            reason: LAYOUT_SHELLS[file],
            ...usageOf(file),
        });
    }

    const organismFiles = readdirSync(path.join(repoRoot, PAGES_DIR_REL))
        .filter((name) => name.endsWith(".astro"))
        .sort()
        .map((name) => `${PAGES_DIR_REL}/${name}`);

    for (const file of organismFiles) {
        const name = componentName(file);
        components.push({
            slug: slugFor(name, atomSlugs),
            name,
            kind: null,
            layer: "page-organism",
            file,
            doc_url: null,
            doc_page: null,
            status: "debt",
            ...usageOf(file),
        });
    }

    const counts = {};
    for (const component of components)
        counts[component.layer] = (counts[component.layer] ?? 0) + 1;
    counts.total = components.length;

    return {
        version: 1,
        generated_by: "node scripts/gates/verify-component-inventory.mjs --update",
        note: "P9 的唯一分母。组件集合、slug、doc_url 由 verify-component-inventory.mjs 冻结；usage_count/usage_tags 是快照，只允许 --update 重写。",
        counts,
        slug_rules: {
            atom: "atom/molecule 保持短名：button / card / pagination（15 条 = M1-6 的 12 条 + M8-6-0 的 3 条）",
            ui: "legacy UI 与 atom 同名时加 `ui-` 前缀：ui-button / ui-card / ui-pagination；其余同 atom 规则",
            layout: "UI/ 下无 props / 状态 / 样式的纯 slot 容器不进 UI 文档分母，status=excluded 并写 reason",
            doc_url: { atom: "/design/atoms/<slug>/", ui: "/design/components/<slug>/" },
        },
        components,
    };
}

/** 对比清单时忽略 usage 快照（它是会变的测量值）。 */
const withoutUsage = (inventory) => ({
    ...inventory,
    components: inventory.components.map(({ usage_count, usage_tags, ...rest }) => rest),
});

/* ───────────────────────── 读取 registry + 清单 ───────────────────────── */

const registry = parseRegistry();
if (registry.error) {
    console.error(`FATAL ${registry.error}`);
    process.exit(1);
}

const generated = buildInventory(registry);
const inventoryPath = path.join(repoRoot, INVENTORY_REL);

if (update) {
    writeFileSync(inventoryPath, `${JSON.stringify(generated, null, 4)}\n`, "utf8");
    formatWithPrettier(inventoryPath);
    console.log(`更新 ${INVENTORY_REL}：${generated.components.length} 个组件`);
    for (const [layer, count] of Object.entries(generated.counts))
        console.log(`  ${layer.padEnd(14)} ${count}`);
    process.exit(0);
}

if (!existsSync(inventoryPath)) {
    console.error(
        `FATAL 缺 ${INVENTORY_REL}；先跑 node scripts/gates/verify-component-inventory.mjs --update`,
    );
    process.exit(1);
}
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const components = Array.isArray(inventory.components) ? inventory.components : [];

/* ───────────────────────── I1 registry ───────────────────────── */

addCheck(
    "I1",
    "registry 15 条可解析（DOCS ↔ data/*.json）",
    registry.problems.length === 0 && registry.order.length === 15,
    `docs=${registry.order.length}/15`,
    registry.problems,
);

/* ───────────────────────── I2 atoms ───────────────────────── */

const atomProblems = [];
const atoms = components.filter(
    (component) => component.layer === "atom" || component.layer === "molecule",
);
for (const { slug, data } of registry.docs) {
    const entry = atoms.find((component) => component.slug === slug);
    if (!entry) {
        atomProblems.push(`清单缺 atom 记录：${slug}`);
        continue;
    }
    if (entry.kind !== data.layer)
        atomProblems.push(`${slug}: kind=${entry.kind}，data.layer=${data.layer}`);
    if (entry.file !== data.source)
        atomProblems.push(`${slug}: file=${entry.file}，data.source=${data.source}`);
    if (entry.doc_url !== `/design/atoms/${slug}/`)
        atomProblems.push(`${slug}: doc_url 应为 /design/atoms/${slug}/`);
    if (!existsSync(path.join(repoRoot, entry.doc_page ?? "")))
        atomProblems.push(`${slug}: 文档页不存在 ${entry.doc_page}`);
}
for (const entry of atoms) {
    if (!registry.order.includes(entry.slug))
        atomProblems.push(`清单多出 atom 记录：${entry.slug}`);
}
const atomCount = atoms.filter((component) => component.layer === "atom").length;
const moleculeCount = atoms.filter((component) => component.layer === "molecule").length;
addCheck(
    "I2",
    "atoms = registry 15（11 atom + 4 molecule），doc_url 与页面一致",
    atomProblems.length === 0 && atoms.length === 15 && atomCount === 11 && moleculeCount === 4,
    `atom=${atomCount} molecule=${moleculeCount} 总=${atoms.length}`,
    atomProblems,
);

/* ───────────────────────── I3 legacy UI + layout ───────────────────────── */

const uiProblems = [];
const uiFiles = readdirSync(path.join(repoRoot, UI_DIR_REL))
    .filter((name) => name.endsWith(".astro"))
    .map((name) => `${UI_DIR_REL}/${name}`)
    .sort();
const registeredUi = components.filter(
    (component) => component.layer === "ui" || component.layer === "layout",
);
const registeredUiFiles = new Set(registeredUi.map((component) => component.file));
for (const file of uiFiles) {
    if (!registeredUiFiles.has(file))
        uiProblems.push(`未登记的 UI 文件：${file}（新增组件必须进清单，P9 分母同步）`);
}
for (const component of registeredUi) {
    if (!uiFiles.includes(component.file))
        uiProblems.push(`清单里的文件已不存在：${component.file}`);
}
for (const component of registeredUi.filter((entry) => entry.layer === "ui")) {
    for (const key of ["slug", "file", "layer", "usage_count", "doc_url", "status"]) {
        if (component[key] === undefined || component[key] === null || component[key] === "") {
            uiProblems.push(`${component.slug ?? component.file}: 缺字段 ${key}`);
        }
    }
    if (component.doc_url !== `/design/components/${component.slug}/`) {
        uiProblems.push(`${component.slug}: doc_url 应为 /design/components/${component.slug}/`);
    }
    if (component.status !== "pending" && component.status !== "dead") {
        uiProblems.push(
            `${component.slug}: status 必须是 pending / dead，实际 "${component.status}"`,
        );
    }
}
for (const component of registeredUi.filter((entry) => entry.layer === "layout")) {
    if (!LAYOUT_SHELLS[component.file])
        uiProblems.push(`${component.file}: 不在 layout 壳白名单里，不能 layer=layout`);
    if (component.status !== "excluded" || !component.reason)
        uiProblems.push(`${component.file}: layout 必须 status=excluded 且有 reason`);
    if (component.doc_url !== null)
        uiProblems.push(`${component.file}: layout 不写文档，doc_url 必须为 null`);
}
const uiCount = registeredUi.filter((entry) => entry.layer === "ui").length;
const layoutCount = registeredUi.filter((entry) => entry.layer === "layout").length;
addCheck(
    "I3",
    "legacy UI 24 条 + layout 壳 1 条，UI/ 文件 100% 登记",
    uiProblems.length === 0 &&
        uiCount === 24 &&
        layoutCount === 1 &&
        registeredUiFiles.size === uiFiles.length,
    `ui=${uiCount} layout=${layoutCount} 文件=${uiFiles.length}`,
    uiProblems,
);

/* ───────────────────────── I4 page-organism ───────────────────────── */

const organismProblems = [];
const organismFiles = readdirSync(path.join(repoRoot, PAGES_DIR_REL))
    .filter((name) => name.endsWith(".astro"))
    .map((name) => `${PAGES_DIR_REL}/${name}`)
    .sort();
const organisms = components.filter((component) => component.layer === "page-organism");
const registeredOrganismFiles = new Set(organisms.map((component) => component.file));
for (const file of organismFiles) {
    if (!registeredOrganismFiles.has(file))
        organismProblems.push(`未登记的 page-organism：${file}`);
}
for (const component of organisms) {
    if (!organismFiles.includes(component.file))
        organismProblems.push(`清单里的文件已不存在：${component.file}`);
    if (component.status !== "debt")
        organismProblems.push(`${component.slug}: page-organism 的 status 必须是 debt`);
    if (component.doc_url !== null)
        organismProblems.push(`${component.slug}: page-organism 不写文档，doc_url 必须为 null`);
}
addCheck(
    "I4",
    "page-organism 债 11 条全部登记（只统计，不写文档）",
    organismProblems.length === 0 && organisms.length === 11,
    `page-organism=${organisms.length}`,
    organismProblems,
);

/* ───────────────────────── I5 slug 冲突规则 ───────────────────────── */

const slugProblems = [];
const seenSlugs = new Map();
for (const component of components) {
    if (seenSlugs.has(component.slug)) {
        slugProblems.push(
            `slug 重复：${component.slug}（${seenSlugs.get(component.slug)} / ${component.file}）`,
        );
    }
    seenSlugs.set(component.slug, component.file);
}
const atomSlugs = new Set(registry.order);
for (const component of components.filter((entry) => entry.layer === "ui")) {
    if (atomSlugs.has(component.name.toLowerCase())) {
        if (!component.slug.startsWith(LEGACY_UI_SLUG_PREFIX)) {
            slugProblems.push(
                `${component.name}: 与 atom 同名，legacy UI 必须加 ui- 前缀（实际 ${component.slug}）`,
            );
        }
    } else if (component.slug !== component.name.toLowerCase()) {
        slugProblems.push(
            `${component.name}: slug 应为 ${component.name.toLowerCase()}，实际 ${component.slug}`,
        );
    }
}
for (const slug of ["ui-button", "ui-card", "ui-pagination"]) {
    if (!components.some((component) => component.slug === slug))
        slugProblems.push(`缺冲突规则样例 ${slug}`);
}
for (const slug of ["button", "card", "pagination"]) {
    const entry = components.find((component) => component.slug === slug);
    if (!entry || !["atom", "molecule"].includes(entry.layer)) {
        slugProblems.push(
            `短名 ${slug} 必须留给 atom/molecule（实际 ${entry ? entry.layer : "缺失"}）`,
        );
    }
}
addCheck(
    "I5",
    "slug 唯一 + 同名冲突规则（ui-button / ui-card / ui-pagination）",
    slugProblems.length === 0,
    `slug 总数=${seenSlugs.size} 重复=${seenSlugs.size === components.length ? 0 : components.length - seenSlugs.size}`,
    slugProblems,
);

/* ───────────────────────── I6 counts ───────────────────────── */

const countProblems = [];
const measured = {};
for (const component of components)
    measured[component.layer] = (measured[component.layer] ?? 0) + 1;
measured.total = components.length;
for (const [layer, expected] of Object.entries(FROZEN_COUNTS)) {
    if (measured[layer] !== expected)
        countProblems.push(`${layer}: 实测 ${measured[layer] ?? 0}，冻结值 ${expected}`);
}
for (const [layer, expected] of Object.entries(inventory.counts ?? {})) {
    if (measured[layer] !== expected)
        countProblems.push(`清单自报 ${layer}=${expected}，实测 ${measured[layer] ?? 0}`);
}
const expectedDetail = Object.entries(FROZEN_COUNTS)
    .map(([layer, count]) => `${layer}=${count}`)
    .join(" ");
addCheck(
    "I6",
    "分母冻结（counts = 实测 = 清单）",
    countProblems.length === 0,
    expectedDetail,
    countProblems,
);

/* ───────────────────────── I7 清单新鲜度 + usage ───────────────────────── */

const freshnessProblems = [];
const expected = withoutUsage(generated);
const actual = withoutUsage(inventory);
if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    const expectedBySlug = new Map(
        expected.components.map((component) => [component.slug, component]),
    );
    const actualBySlug = new Map(actual.components.map((component) => [component.slug, component]));
    for (const slug of expectedBySlug.keys()) {
        if (!actualBySlug.has(slug)) freshnessProblems.push(`清单缺 ${slug}`);
        else if (
            JSON.stringify(expectedBySlug.get(slug)) !== JSON.stringify(actualBySlug.get(slug))
        ) {
            freshnessProblems.push(`${slug}: 清单与源码不一致（跑 --update 重算）`);
        }
    }
    for (const slug of actualBySlug.keys()) {
        if (!expectedBySlug.has(slug)) freshnessProblems.push(`清单多出 ${slug}`);
    }
    if (JSON.stringify(expected.slug_rules) !== JSON.stringify(actual.slug_rules)) {
        freshnessProblems.push("slug_rules 与脚本里的规则不一致");
    }
}
addCheck(
    "I7a",
    "清单与源码一致（组件集合 / slug / doc_url / status）",
    freshnessProblems.length === 0,
    `${components.length} 条`,
    freshnessProblems,
);

const usageProblems = [];
const staleUsage = [];
for (const component of generated.components) {
    const stored = components.find((entry) => entry.slug === component.slug);
    if (!stored) continue;
    if (
        stored.usage_count !== component.usage_count ||
        stored.usage_tags !== component.usage_tags
    ) {
        staleUsage.push(
            `${component.slug}: ${stored.usage_count}/${stored.usage_tags} → ${component.usage_count}/${component.usage_tags}`,
        );
    }
    // page-organism 是「债清单」不是使用率清单：I4 已要求 11 条全部登记，
    // 其中允许存在暂时未接线的壳（M2-11b 的 albumscontent 即此类）。
    // 0 引用只对 UI / layout 组件判红，否则 I4（必须 status=debt）与 I7b
    // （0 引用必须 status=dead）互相矛盾，门禁会永远红。
    if (component.layer === "page-organism") continue;
    if (component.usage_count === 0 && component.status !== "dead") {
        usageProblems.push(
            `${component.slug}: 0 引用（${component.file}）——删掉或把 status 标成 dead 再登记`,
        );
    }
}
addCheck(
    "I7b",
    "usage 快照（0 引用即红）",
    usageProblems.length === 0,
    `0 引用=${usageProblems.length} 快照过期=${staleUsage.length}${staleUsage.length ? "（跑 --update）" : ""}`,
    [...usageProblems, ...staleUsage.map((item) => `快照过期 ${item}`)],
);

/* ───────────────────────── 输出 ───────────────────────── */

const pad = (text, width) => {
    const visual = [...text].reduce((sum, char) => sum + (/[\u4e00-\u9fff]/.test(char) ? 2 : 1), 0);
    return text + " ".repeat(Math.max(0, width - visual));
};

console.log("M2-1 组件清单门禁（P9 分母）");
console.log(`root: ${repoRoot}`);
console.log("");
for (const row of rows) {
    console.log(
        `${row.id.padEnd(4)} ${pad(row.title, 46)} ${row.ok ? "PASS" : "FAIL"}  ${row.detail}`,
    );
    for (const problem of row.problems) console.log(`     - ${problem}`);
}
if (staleUsage.length) {
    console.log("");
    console.log("usage 快照更新（node scripts/gates/verify-component-inventory.mjs --update）：");
    for (const item of staleUsage) console.log(`  · ${item}`);
}

const failed = rows.filter((row) => !row.ok);
console.log("");
if (failed.length) {
    console.log(`RESULT FAIL  ${failed.length}/${rows.length} 项不通过`);
    process.exit(1);
}
console.log(
    `RESULT PASS  atoms=${atoms.length} ui=${uiCount} page-organisms=${organisms.length} layout=${layoutCount} dup=0 total=${components.length}`,
);
