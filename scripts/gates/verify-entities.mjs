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
 *   E2 schema 通过（`src/types/entities.ts` 里该实体的 validate；meta 必填含 owner）
 *   E3 条目 id 唯一（页面锚点与去重的前提）
 *   E4 页面路由存在（zh + en 两份都要）
 *   E5 导航入口存在（`src/config/ui.ts` 的 navLinks）
 *   E6 空数据可构建：[] → empty 态、不抛异常
 *   E7 新鲜度 warning：meta 或任一条目超过 180 天 → WARN（**不 fail**，14 §7 规则 3）
 *   E8 负向自检（数据驱动）：从注册表 + 各 spec 的 `requiredFields` 自动生成「逐字段删除」样例，
 *      再叠加各 spec 自带的 `negatives()` 值级坏样例；旧数据必须判 stale 且不 fail
 *
 * E8 为什么改成数据驱动（M2-7a 会签）：旧版把坏样例硬编码在两个 validate 上，新增实体即使
 * 校验器形同虚设也照样 PASS。现在加一个实体 = 在 ENTITIES 加一条 + spec 里给出 requiredFields
 * 与 sample()，负向覆盖自动长出来，漏写就会红。
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

/** 实体注册表：新增实体只在这里加一条 + 在契约里给出对应 spec。 */
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
    {
        kind: "devices",
        label: "设备",
        file: "src/data/entities/devices.ts",
        dataExport: "devices",
        metaExport: "devicesMeta",
        specExport: "deviceSpec",
        pages: ["src/pages/devices/index.astro", "src/pages/en/devices/index.astro"],
        nav: "/devices/",
    },
    {
        kind: "games",
        label: "游戏",
        file: "src/data/entities/games.ts",
        dataExport: "games",
        metaExport: "gamesMeta",
        specExport: "gameSpec",
        pages: ["src/pages/games/index.astro", "src/pages/en/games/index.astro"],
        nav: "/games/",
    },
    {
        kind: "timeline",
        label: "时间线",
        file: "src/data/entities/timeline.ts",
        dataExport: "timeline",
        metaExport: "timelineMeta",
        specExport: "timelineSpec",
        pages: ["src/pages/timeline/index.astro", "src/pages/en/timeline/index.astro"],
        nav: "/timeline/",
    },
    {
        kind: "music",
        label: "音乐",
        file: "src/data/entities/music.ts",
        dataExport: "music",
        metaExport: "musicMeta",
        specExport: "musicSpec",
        pages: ["src/pages/music/index.astro", "src/pages/en/music/index.astro"],
        nav: "/music/",
    },
    {
        kind: "albums",
        label: "相册",
        file: "src/data/entities/albums.ts",
        dataExport: "albums",
        metaExport: "albumsMeta",
        specExport: "albumSpec",
        pages: ["src/pages/albums/index.astro", "src/pages/en/albums/index.astro"],
        nav: "/albums/",
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
    writeFileSync(
        path.join(TMP_DIR, "entities.mjs"),
        transpile(typesSource, "entities.ts"),
        "utf8",
    );

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
        problems.push(
            `归一化失败（${collection.issue?.code}）：${collection.issue?.detail ?? "未知"}`,
        );
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
        const age = Math.floor(
            (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${updated}T00:00:00Z`)) / 86400000,
        );
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
        id: `E1-${entity.kind}`,
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
            const empty = contract.normalizeCollection([], { updated: today }, spec, {
                now: today,
            });
            if (empty.status !== "empty")
                problems.push(`${entity.kind}: [] 的期望状态是 empty，实得 ${empty.status}`);
            if (empty.total !== 0)
                problems.push(`${entity.kind}: [] 的 total 应为 0，实得 ${empty.total}`);
            const missing = contract.normalizeCollection(undefined, null, spec, { now: today });
            if (missing.status !== "error")
                problems.push(
                    `${entity.kind}: undefined 的期望状态是 error，实得 ${missing.status}`,
                );
        } catch (error) {
            problems.push(
                `${entity.kind}: 空数据归一化抛异常（${error.message}）——空数据必须能构建`,
            );
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

/* ───────────────────────── E8 负向自检（数据驱动） ───────────────────────── */

/**
 * 负向样例不再硬编码：每个实体的坏样例由三部分构成
 *   ① `requiredFields` 里每个字段删掉一次（漏必填必须判出）
 *   ② 样例里**没**列进 `requiredFields` 的字段也删掉一次（删掉必须仍然合法）
 *      —— 反方向也查：事实必填却漏登记的字段会在这里红
 *   ③ 各 spec 的 `negatives()`：枚举越界、日期格式、交叉字段矛盾等值级坏样例
 * ② 是本次改数据驱动的关键：只查 ① 的话，`requiredFields` 少写一个字段永远不会被发现。
 */
function checkNegative(contract) {
    const problems = [];
    let generated = 0;

    for (const entity of ENTITIES) {
        const spec = contract[entity.specExport];
        if (!spec) {
            problems.push(`${entity.kind}: 契约里没有 ${entity.specExport}`);
            continue;
        }
        if (typeof spec.sample !== "function" || !Array.isArray(spec.requiredFields)) {
            problems.push(
                `${entity.kind}: ${entity.specExport} 缺 sample() 或 requiredFields（E8 无法生成负向样例）`,
            );
            continue;
        }

        const sample = spec.sample();
        const sampleProblems = spec.validate(sample);
        if (sampleProblems.length !== 0) {
            problems.push(`${entity.kind}: 合法样例被误杀 —— ${sampleProblems[0]}`);
            continue;
        }

        const required = [...spec.requiredFields];
        if (required.length === 0) problems.push(`${entity.kind}: requiredFields 为空`);

        for (const field of required) {
            const fixture = { ...sample };
            delete fixture[field];
            generated += 1;
            if (spec.validate(fixture).length === 0)
                problems.push(
                    `${entity.kind}: 删掉必填字段 ${field} 后仍通过校验（requiredFields 与 validate 脱节）`,
                );
        }

        for (const field of Object.keys(sample)) {
            if (required.includes(field)) continue;
            const fixture = { ...sample };
            delete fixture[field];
            generated += 1;
            if (spec.validate(fixture).length !== 0)
                problems.push(`${entity.kind}: 字段 ${field} 事实上必填，但 requiredFields 没登记`);
        }

        if (typeof spec.negatives !== "function") {
            problems.push(`${entity.kind}: ${entity.specExport} 缺 negatives()（值级坏样例）`);
            continue;
        }
        for (const [name, fixture] of spec.negatives()) {
            generated += 1;
            if (spec.validate(fixture).length === 0)
                problems.push(`${entity.kind}: 放过「${name}」`);
        }
    }

    // meta 必填（14 §7 规则 4：归属到人）
    const metaRequired = contract.META_REQUIRED_FIELDS ?? [];
    const validMeta = { updated: today, owner: "someone" };
    const metaProblems = contract.validateMeta(validMeta);
    if (metaProblems.length > 0) problems.push(`validateMeta 误杀合法 meta —— ${metaProblems[0]}`);
    if (!metaRequired.includes("owner"))
        problems.push("META_REQUIRED_FIELDS 必须包含 owner（14 §7 规则 4）");
    for (const field of metaRequired) {
        const fixture = { ...validMeta };
        delete fixture[field];
        generated += 1;
        if (contract.validateMeta(fixture).length === 0)
            problems.push(`meta 缺 ${field} 仍通过（META_REQUIRED_FIELDS 与 validateMeta 脱节）`);
    }

    // 旧数据必须判 stale，但状态仍是 ok（warning 不 fail）—— 四个实体逐个验
    for (const entity of ENTITIES) {
        const spec = contract[entity.specExport];
        if (!spec || typeof spec.sample !== "function") continue;
        const stale = contract.normalizeCollection(
            [spec.sample()],
            { updated: "2020-01-01", owner: "someone" },
            spec,
            {
                now: today,
            },
        );
        if (!stale.stale) problems.push(`${entity.kind}: 2020-01-01 的数据没有被判 stale`);
        if (stale.status !== "ok")
            problems.push(
                `${entity.kind}: stale 数据的状态应为 ok（warning 不 fail），实得 ${stale.status}`,
            );
    }

    if (contract.ENTITY_FRESHNESS_DAYS !== FRESHNESS_DAYS) {
        problems.push(
            `契约阈值 ${contract.ENTITY_FRESHNESS_DAYS} 与门禁阈值 ${FRESHNESS_DAYS} 不一致（两处必须同源）`,
        );
    }

    return {
        id: "E8",
        title: "负向自检（数据驱动）",
        ok: problems.length === 0,
        detail: `${ENTITIES.length} 实体 · ${generated} 个自动生成坏样例被判出 · meta 必填 ${metaRequired.join("+")} · stale 不 fail`,
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
    console.log(
        `  结果：${passed}/${results.length} PASS · ${failed} FAIL · ${warnings.length} WARN`,
    );
    console.log("  warning 不阻断构建（14 §7 规则 3）；FAIL 才是数据要修。");

    const summary = {
        today,
        contractVersion: contract.ENTITY_CONTRACT_VERSION,
        freshnessDays: FRESHNESS_DAYS,
        entities: results
            .filter((r) => r.kind)
            .map((r) => ({
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
