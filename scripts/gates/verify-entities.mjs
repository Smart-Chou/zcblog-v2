#!/usr/bin/env node
/**
 * verify-entities.mjs — C 层实体契约门禁（M2-7a；M2-7b 扩到 devices / games）
 *
 * 用法
 *   node scripts/gates/verify-entities.mjs               # 校验
 *   node scripts/gates/verify-entities.mjs --json        # 附机器可读汇总（CI 归档用）
 *   VERIFY_ENTITIES_TODAY=2027-01-01 node …              # 钉住新鲜度基准（负向自测/演示用）
 *
 * 退出码：0 = 全 PASS（warning 不影响）；1 = 有 FAIL
 *
 * 门禁清单
 *   E1 数据文件存在且导出数组 + meta
 *   E2 schema 通过（`src/types/entities.ts` 的 validateProject / validateSkillGroup）
 *   E3 条目 id 唯一（页面锚点与去重的前提）
 *   E4 页面路由存在（zh + en 两份都要）
 *   E5 导航入口存在（`src/config/ui.ts` 的 navLinks）
 *   E6 空数据可构建：[] → empty 态、不抛异常
 *   E7 新鲜度 warning：meta 或任一条目超过 180 天 → WARN（**不 fail**，14 §7 规则 3）
 *   E8 负向自检：坏 schema 必须被判出、旧数据必须判 stale 且不 fail
 *
 * 设计取舍：运行时（页面）对坏条目宽容（丢弃 + 错误态），CI 对坏条目严格（dropped > 0 即红）。
 * 两者共用同一份校验器，避免「页面能跑、门禁说没事、数据其实烂了」。
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rel = (p) => path.relative(repoRoot, p);
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");

const TYPES_REL = "src/types/entities.ts";
const UI_CONFIG_REL = "src/config/ui.ts";
const FRESHNESS_DAYS = 180; // 与 src/types/entities.ts 的 ENTITY_FRESHNESS_DAYS 对齐（E8 会核对）

/** 实体注册表：M2-7b 追加 devices / games 时只在这里加两条。 */
const ENTITIES = [
    {
        kind: "projects",
        label: "项目",
        file: "src/data/entities/projects.ts",
        dataExport: "projects",
        metaExport: "projectsMeta",
        specExport: "projectSpec",
        pages: ["src/pages/projects/index.astro", "src/pages/en/projects/index.astro"],
        nav: "/projects/",
    },
    {
        kind: "skills",
        label: "技能",
        file: "src/data/entities/skills.ts",
        dataExport: "skills",
        metaExport: "skillsMeta",
        specExport: "skillGroupSpec",
        pages: ["src/pages/skills/index.astro", "src/pages/en/skills/index.astro"],
        nav: "/skills/",
    },
];

const results = [];
const warnings = [];
const add = (r) => results.push(r);
const today = process.env.VERIFY_ENTITIES_TODAY ?? new Date().toISOString().slice(0, 10);

/* ───────────────────────── TS → ESM（node 里直接跑数据文件） ───────────────────────── */

const TMP_DIR = path.join(repoRoot, ".astro", "verify-entities");

function transpile(source, fileName) {
    const { outputText } = ts.transpileModule(source, {
        fileName,
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            isolatedModules: true,
            verbatimModuleSyntax: false,
            removeComments: false,
        },
    });
    // 数据文件用 `~/types/entities` 取类型；转译后指到同目录的 entities.mjs。
    return outputText.replace(/["']~\/types\/entities["']/g, '"./entities.mjs"');
}

async function loadContract() {
    if (!existsSync(path.join(repoRoot, TYPES_REL))) {
        return { ok: false, error: `缺少 ${TYPES_REL}` };
    }
    rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });

    const typesSource = readFileSync(path.join(repoRoot, TYPES_REL), "utf8");
    writeFileSync(path.join(TMP_DIR, "entities.mjs"), transpile(typesSource, "entities.ts"), "utf8");

    const modules = new Map();
    try {
        const contract = await import(pathToFileURL(path.join(TMP_DIR, "entities.mjs")).href);
        modules.set("entities", contract);

        for (const entity of ENTITIES) {
            const file = path.join(repoRoot, entity.file);
            if (!existsSync(file)) continue;
            const out = path.join(TMP_DIR, `${entity.kind}.mjs`);
            writeFileSync(out, transpile(readFileSync(file, "utf8"), `${entity.kind}.ts`), "utf8");
            modules.set(entity.kind, await import(`${pathToFileURL(out).href}?v=${Date.now()}`));
        }
    } catch (error) {
        return { ok: false, error: `转译/加载失败：${error.message}`, modules };
    }
    return { ok: true, modules };
}

/* ───────────────────────── 逐实体校验 ───────────────────────── */

function checkEntity(entity, contract, module) {
    const problems = [];
    const stats = { kind: entity.kind, total: 0, dropped: 0, stale: false, ageDays: null };

    if (!module) {
        return { ...stats, id: `E1-${entity.kind}`, problems: [`缺少数据文件 ${entity.file}`] };
    }

    const raw = module[entity.dataExport];
    const meta = module[entity.metaExport];
    const spec = contract[entity.specExport];

    if (!spec) problems.push(`契约里没有 ${entity.specExport}`);
    if (!Array.isArray(raw)) problems.push(`${entity.dataExport} 不是数组`);
    if (!meta || typeof meta !== "object") problems.push(`${entity.metaExport} 缺失`);

    if (problems.length > 0) return { ...stats, id: `E1-${entity.kind}`, problems };

    const metaProblems = contract.validateMeta(meta);
    if (metaProblems.length > 0) problems.push(...metaProblems);

    const collection = contract.normalizeCollection(raw, meta, spec, { now: today });
    stats.total = collection.total;
    stats.dropped = collection.dropped;
    stats.stale = collection.stale;
    stats.ageDays = collection.ageDays;
    stats.status = collection.status;
    stats.updated = collection.updated;

    // E2 schema
    if (collection.status === "error") {
        problems.push(`归一化失败（${collection.issue?.code}）：${collection.issue?.detail ?? "未知"}`);
    }
    if (collection.dropped > 0) {
        problems.push(`dropped=${collection.dropped}；坏条目必须修数据，不许靠运行时丢弃`);
        problems.push(...collection.problems.slice(0, 6));
    }

    // E3 id 唯一
    const seen = new Map();
    for (const item of collection.items) {
        const key = spec.keyOf(item);
        seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, count] of seen) {
        if (count > 1) problems.push(`id 重复：${key}（${count} 次）`);
    }

    // E4 页面
    for (const page of entity.pages) {
        if (!existsSync(path.join(repoRoot, page))) problems.push(`缺少页面 ${page}`);
    }

    // E5 导航
    const uiConfig = existsSync(path.join(repoRoot, UI_CONFIG_REL))
        ? readFileSync(path.join(repoRoot, UI_CONFIG_REL), "utf8")
        : "";
    if (!uiConfig.includes(`href: "${entity.nav}"`)) {
        problems.push(`${UI_CONFIG_REL} 的 navLinks 里没有 ${entity.nav}`);
    }

    // E7 新鲜度（warning）
    const staleEntries = [];
    for (const item of collection.items) {
        const updated = spec.updatedOf(item);
        if (!updated) {
            warnings.push(`${entity.kind}[${spec.keyOf(item)}] 没有 updated 日期`);
            continue;
        }
        const age = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${updated}T00:00:00Z`)) / 86400000);
        if (age > FRESHNESS_DAYS) staleEntries.push(`${spec.keyOf(item)} ${updated}（${age} 天）`);
    }
    if (collection.stale) {
        warnings.push(
            `${entity.kind} 数据整体 ${collection.updated} 已 ${collection.ageDays} 天未更新（阈值 ${FRESHNESS_DAYS} 天）`,
        );
    }
    for (const entry of staleEntries) warnings.push(`${entity.kind} 条目过期：${entry}`);

    return {
        ...stats,
        id: `E1${entity.kind === "projects" ? "" : "b"}-${entity.kind}`,
        title: `${entity.label} schema`,
        problems,
        detail: `${stats.total} 条${stats.dropped ? ` · 丢弃 ${stats.dropped}` : ""} · updated ${collection.updated ?? "—"}${
            collection.ageDays === null ? "" : `（${collection.ageDays} 天）`
        }`,
    };
}

/* ───────────────────────── E6 空数据可构建 ───────────────────────── */

function checkEmptyBuild(contract) {
    const problems = [];
    for (const entity of ENTITIES) {
        const spec = contract[entity.specExport];
        if (!spec) continue;
        try {
            const empty = contract.normalizeCollection([], { updated: today }, spec, { now: today });
            if (empty.status !== "empty") problems.push(`${entity.kind}: [] 的期望状态是 empty，实得 ${empty.status}`);
            if (empty.total !== 0) problems.push(`${entity.kind}: [] 的 total 应为 0，实得 ${empty.total}`);
            const missing = contract.normalizeCollection(undefined, null, spec, { now: today });
            if (missing.status !== "error") problems.push(`${entity.kind}: undefined 的期望状态是 error，实得 ${missing.status}`);
        } catch (error) {
            problems.push(`${entity.kind}: 空数据归一化抛异常（${error.message}）——空数据必须能构建`);
        }
    }
    return {
        id: "E6",
        title: "空数据可构建",
        ok: problems.length === 0,
        detail: `${ENTITIES.length} 实体 · [] → empty · undefined → error（均不抛异常）`,
        problems,
    };
}

/* ───────────────────────── E8 负向自检 ───────────────────────── */

function checkNegative(contract) {
    const problems = [];

    const validProject = {
        id: "demo",
        title: { zh: "示例", en: "Demo" },
        summary: { zh: "说明", en: "Summary" },
        status: "active",
        started: "2026-01",
        ended: null,
        stack: ["Astro"],
        updated: "2026-01-01",
    };

    const cases = [
        ["缺 title", { ...validProject, title: undefined }],
        ["en 为空串", { ...validProject, title: { zh: "示例", en: "" } }],
        ["status 越界", { ...validProject, status: "doing" }],
        ["started 不是 YYYY-MM", { ...validProject, started: "2026/01" }],
        ["stack 空数组", { ...validProject, stack: [] }],
        ["links 非 http", { ...validProject, links: [{ label: "x", href: "javascript:alert(1)" }] }],
        ["id 不是 slug", { ...validProject, id: "Demo Project" }],
        // 正则能过、日历不存在：Date.parse 会静默归一成 03-03，必须判出
        ["updated 不是真实日历日", { ...validProject, updated: "2026-02-31" }],
    ];
    for (const [name, fixture] of cases) {
        if (contract.validateProject(fixture).length === 0) problems.push(`validateProject 放过了「${name}」`);
    }
    if (contract.validateProject(validProject).length !== 0) {
        problems.push("validateProject 误杀合法条目：合法样例被判不合格");
    }

    const validGroup = {
        id: "demo",
        title: { zh: "示例", en: "Demo" },
        items: [{ name: "Astro", level: "solid" }],
        updated: "2026-01-01",
    };
    const groupCases = [
        ["items 空数组", { ...validGroup, items: [] }],
        ["level 越界", { ...validGroup, items: [{ name: "Astro", level: "master" }] }],
        ["条目缺 name", { ...validGroup, items: [{ level: "solid" }] }],
    ];
    for (const [name, fixture] of groupCases) {
        if (contract.validateSkillGroup(fixture).length === 0) problems.push(`validateSkillGroup 放过了「${name}」`);
    }
    if (contract.validateSkillGroup(validGroup).length !== 0) {
        problems.push("validateSkillGroup 误杀合法条目：合法样例被判不合格");
    }

    // 旧数据必须判 stale，但状态仍是 ok（warning 不 fail）
    const stale = contract.normalizeCollection([validProject], { updated: "2020-01-01" }, contract.projectSpec, {
        now: today,
    });
    if (!stale.stale) problems.push("2020-01-01 的数据没有被判 stale");
    if (stale.status !== "ok") problems.push(`stale 数据的状态应为 ok（warning 不 fail），实得 ${stale.status}`);

    if (contract.ENTITY_FRESHNESS_DAYS !== FRESHNESS_DAYS) {
        problems.push(
            `契约阈值 ${contract.ENTITY_FRESHNESS_DAYS} 与门禁阈值 ${FRESHNESS_DAYS} 不一致（两处必须同源）`,
        );
    }

    return {
        id: "E8",
        title: "负向自检",
        ok: problems.length === 0,
        detail: `${cases.length + groupCases.length} 个坏样例被判出 · stale 不 fail · 阈值同源 ${FRESHNESS_DAYS} 天`,
        problems,
    };
}

/* ───────────────────────── 主流程 ───────────────────────── */

async function main() {
    console.log("zcblog-v2 · C 层实体门禁（M2-7a）");
    console.log(`  repo   ${repoRoot}`);
    console.log(`  基准日 ${today}（VERIFY_ENTITIES_TODAY 可覆盖）`);
    console.log("");

    const loaded = await loadContract();
    if (!loaded.ok) {
        console.log(`  FAIL  E0    契约加载  —  ${loaded.error}`);
        rmSync(TMP_DIR, { recursive: true, force: true });
        return 1;
    }
    const contract = loaded.modules.get("entities");
    console.log(`  契约版本 v${contract.ENTITY_CONTRACT_VERSION} · ${TYPES_REL}`);
    console.log("");

    for (const entity of ENTITIES) {
        const result = checkEntity(entity, contract, loaded.modules.get(entity.kind));
        add({ ...result, ok: result.problems.length === 0 });
    }
    add(checkEmptyBuild(contract));
    add(checkNegative(contract));

    for (const r of results) {
        const mark = r.ok ? "PASS" : "FAIL";
        console.log(`  ${mark}  ${r.id.padEnd(5)} ${r.title}  —  ${r.detail ?? ""}`);
        if (!r.ok) for (const p of r.problems.slice(0, 12)) console.log(`          · ${p}`);
    }

    if (warnings.length > 0) {
        console.log("");
        for (const w of warnings) console.log(`  WARN  ${w}`);
    }

    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    console.log("");
    console.log(`  结果：${passed}/${results.length} PASS · ${failed} FAIL · ${warnings.length} WARN`);
    console.log("  warning 不阻断构建（14 §7 规则 3）；FAIL 才是数据要修。");

    const summary = {
        today,
        contractVersion: contract.ENTITY_CONTRACT_VERSION,
        freshnessDays: FRESHNESS_DAYS,
        entities: results.filter((r) => r.kind).map((r) => ({
            kind: r.kind,
            total: r.total,
            dropped: r.dropped,
            updated: r.updated ?? null,
            ageDays: r.ageDays ?? null,
            stale: Boolean(r.stale),
            ok: r.ok,
        })),
        warnings,
        passed,
        failed,
    };
    if (asJson) console.log(`\nSUMMARY ${JSON.stringify(summary)}`);

    rmSync(TMP_DIR, { recursive: true, force: true });
    return failed > 0 ? 1 : 0;
}

process.exit(await main());
