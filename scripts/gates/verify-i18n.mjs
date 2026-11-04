#!/usr/bin/env node
/**
 * verify-i18n.mjs — i18n 注册表 / 回退链 / 路由能力的可执行判据（M2-11a）
 *
 * 为什么要跑真代码：注册表的语义（谁回退到谁、哪些语言已经被本次构建启用）
 * 是**行为**，不是文本。所以这里把 `src/utils/i18n.ts` 复制成一份临时模块
 * （只把 `~/data/...` 别名换成相对路径、给 JSON import 补上 Node 需要的
 * `with { type: "json" }`），直接 import 后调用真函数 —— 纯正则扫源码的写法
 * 会在「改了逻辑但文本长得一样」时假绿。
 *
 * 判据：
 *   I1  registry ↔ 词典文件双向一致（注册的都有 JSON，有 JSON 的都注册）
 *   I2  astro.config.mjs 的 i18n 段与 registry 一致（locales / fallback / default）
 *   I3  词典形状：键 ⊆ zh 基准集、叶子都是字符串、空串只允许出现在 zh 也空的键
 *   I4  路由关键键 100% 直译（nav/site/common/footer/article/blog/archives/tags/home/douban/bangumi）
 *   I5  回退链：任何键在任何语言下都能取到值（不返回 key 本身）；缺词必须回退到 zh 原文
 *   I6  覆盖率报数（棘轮下限 45%）
 *   I7  5 个 [locale] 模板路由存在、都用 templateLocales()；不得与静态语言目录撞名
 *   I8  I18N_LOCALES 开关语义（未设置 = zh,en；all = 6；清单 = 子集）
 *   I9  （可选，VERIFY_I18N_DIST=1）dist 产物断言：4 语言的 5 个路由都落了盘
 *
 * 退出码：0 全绿 / 1 有红。
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const I18N_TS = join(ROOT, "src/utils/i18n.ts");
const DATA_DIR = join(ROOT, "src/data/i18n");
const TEMPLATE_PAGES = [
    "src/pages/[locale]/index.astro",
    "src/pages/[locale]/archives.astro",
    "src/pages/[locale]/tags.astro",
    "src/pages/[locale]/culture.astro",
    "src/pages/[locale]/blog/[page].astro",
];
/** 这 4 个语言由 [locale] 模板接管；zh 无前缀，en 有手写路由 */
const TEMPLATE_LOCALES = ["zh-TW", "ja", "ko", "fr"];
/** 路由关键键的顶层分组：这 5 个路由页面 + 全局外壳（nav/footer）会用到的全部键 */
const CRITICAL_GROUPS = [
    "site",
    "nav",
    "common",
    "footer",
    "article",
    "blog",
    "archives",
    "tags",
    "home",
    "douban",
    "bangumi",
];
const MIN_COVERAGE = 0.45;

const results = [];
const record = (id, title, pass, detail = "") => {
    results.push({ id, title, pass, detail });
    const tag = pass ? "PASS" : "FAIL";
    console.log(`${id.padEnd(3)} ${title.padEnd(34)} ${tag}  ${detail}`);
};

/* ─────────────── 把 i18n.ts 变成可 import 的临时模块 ─────────────── */

function loadRegistry() {
    const raw = readFileSync(I18N_TS, "utf8");
    const patched = raw.replace(
        /from "~\/data\/i18n\/([^"]+\.json)"/g,
        'from "../data/i18n/$1" with { type: "json" }',
    );
    if (!patched.includes('with { type: "json" }')) {
        throw new Error("i18n.ts 里找不到 `~/data/i18n/*.json` 的 import，别名改写失败");
    }
    const tmp = join(ROOT, "src/utils/.gate-i18n.generated.mts");
    writeFileSync(tmp, patched);
    return {
        path: tmp,
        import: () => import(`${pathToFileURL(tmp).href}?t=${Date.now()}`),
        cleanup: () => rmSync(tmp, { force: true }),
    };
}

/* ─────────────── 主体 ─────────────── */

const shadow = loadRegistry();
let mod;
try {
    mod = await shadow.import();

    /* I1 —— registry ↔ 词典文件 */
    const locales = [...mod.locales];
    const files = readdirSync(DATA_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, ""));
    const missingFile = locales.filter((l) => !files.includes(l));
    const unregistered = files.filter((f) => !locales.includes(f));
    record(
        "I1",
        "registry ↔ 词典文件",
        missingFile.length === 0 && unregistered.length === 0 && mod.defaultLocale === "zh",
        `${locales.length} locale（${locales.join(", ")}）` +
            (missingFile.length ? ` · 缺文件 ${missingFile.join(",")}` : "") +
            (unregistered.length ? ` · 未注册 ${unregistered.join(",")}` : ""),
    );

    /* I2 —— astro.config.mjs 的 i18n 段 */
    const cfg = readFileSync(join(ROOT, "astro.config.mjs"), "utf8");
    const i18nStart = cfg.indexOf("i18n: {");
    const i18nBlock =
        i18nStart >= 0 ? cfg.slice(i18nStart, cfg.indexOf("markdown:", i18nStart)) : "";
    const cfgLocalesRaw = /locales:\s*\[([^\]]*)\]/.exec(i18nBlock)?.[1] ?? "";
    const cfgLocales = cfgLocalesRaw
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    const fallbackBlock = /fallback:\s*\{([\s\S]*?)\}/.exec(i18nBlock)?.[1] ?? "";
    const sameList =
        cfgLocales.length === locales.length && cfgLocales.every((l, i) => l === locales[i]);
    /**
     * `fallback:` 必须**缺席**：Astro 的 fallback 会给每个缺失页面生成副本，
     * 实测把中文站整站复制 4 份（474 页 → 2470 个 HTML）。回退由 registry 的
     * fallbackChain + contentLocaleOf 显式实现，路由集只由 getStaticPaths 定。
     */
    const fallbackAbsent = fallbackBlock.length === 0;
    record(
        "I2",
        "astro.config i18n 段 = registry",
        sameList && fallbackAbsent && /defaultLocale:\s*"zh"/.test(i18nBlock),
        `config [${cfgLocales.join(", ")}] · ` +
            (fallbackAbsent
                ? "无 fallback 声明（路由集只由 getStaticPaths 定）"
                : "❌ 出现 fallback（会整站复制）"),
    );

    /* I3 —— 词典形状 */
    const baseEmpty = new Set(
        mod.allKeys.filter((key) => mod.t("zh", key) === "" || mod.t("zh", key) === key),
    );
    const shapeProblems = [];
    for (const locale of locales) {
        const unknown = mod.unknownKeys(locale);
        if (unknown.length)
            shapeProblems.push(`${locale}: 多余键 ${unknown.slice(0, 3).join(",")}`);
        for (const key of mod.translatedKeys(locale)) {
            const value = mod.t(locale, key);
            if (typeof value !== "string") shapeProblems.push(`${locale}: ${key} 非字符串`);
            if (value === "" && !baseEmpty.has(key)) shapeProblems.push(`${locale}: ${key} 空串`);
        }
    }
    record(
        "I3",
        "词典形状（键/类型/空串）",
        shapeProblems.length === 0,
        shapeProblems.length
            ? shapeProblems.slice(0, 3).join(" · ")
            : `${mod.allKeys.length} 基准键`,
    );

    /* I4 —— 路由关键键 100% 直译 */
    const criticalKeys = mod.allKeys.filter((key) => CRITICAL_GROUPS.includes(key.split(".")[0]));
    const criticalGaps = [];
    for (const locale of TEMPLATE_LOCALES) {
        const own = new Set(mod.translatedKeys(locale));
        const missing = criticalKeys.filter((key) => !own.has(key));
        if (missing.length)
            criticalGaps.push(`${locale} 缺 ${missing.length}（${missing.slice(0, 3).join(",")}）`);
    }
    record(
        "I4",
        "路由关键键 100% 直译",
        criticalGaps.length === 0,
        criticalGaps.length ? criticalGaps.join(" · ") : `${criticalKeys.length} 键 × 4 语言`,
    );

    /* I5 —— 回退链真的接得住 */
    const fallbackProblems = [];
    for (const locale of locales) {
        for (const key of mod.allKeys) {
            const value = mod.t(locale, key);
            if (value === key) fallbackProblems.push(`${locale}:${key} 取不到`);
            const own = new Set(mod.translatedKeys(locale));
            if (!own.has(key) && value !== mod.t("zh", key)) {
                fallbackProblems.push(`${locale}:${key} 未回退到 zh`);
            }
        }
        if (mod.t(locale, "no.such.key") !== "no.such.key") {
            fallbackProblems.push(`${locale}: 未知键未按约定返回 key`);
        }
    }
    record(
        "I5",
        "回退链（缺词 → zh → key）",
        fallbackProblems.length === 0,
        fallbackProblems.length
            ? `${fallbackProblems.length} 处：${fallbackProblems.slice(0, 3).join(" · ")}`
            : `${locales.length} 语言 × ${mod.allKeys.length} 键`,
    );

    /* I6 —— 覆盖率报数（棘轮下限） */
    const covRows = locales.map((locale) => ({ locale, ...mod.coverage(locale) }));
    const belowFloor = covRows.filter(
        (row) => row.ratio < MIN_COVERAGE && !["zh", "en"].includes(row.locale),
    );
    console.log(
        "     覆盖率  " +
            covRows
                .map((r) => `${r.locale} ${r.translated}/${r.total} ${(r.ratio * 100).toFixed(1)}%`)
                .join(" | "),
    );
    record(
        "I6",
        `覆盖率 ≥ ${(MIN_COVERAGE * 100).toFixed(0)}%（棘轮）`,
        belowFloor.length === 0,
        belowFloor.length ? belowFloor.map((r) => r.locale).join(",") : "全部达标",
    );

    /* I7 —— 5 个模板路由与撞名检查 */
    const missingPages = TEMPLATE_PAGES.filter((p) => !existsSync(join(ROOT, p)));
    const noStaticPaths = TEMPLATE_PAGES.filter(
        (p) =>
            existsSync(join(ROOT, p)) &&
            !/getStaticPaths/.test(readFileSync(join(ROOT, p), "utf8")),
    );
    const collides = TEMPLATE_LOCALES.filter((l) => existsSync(join(ROOT, "src/pages", l)));
    record(
        "I7",
        "5 个 [locale] 模板路由 / 不撞名",
        missingPages.length === 0 && noStaticPaths.length === 0 && collides.length === 0,
        [
            missingPages.length ? `缺 ${missingPages.length} 个页面` : "5 个页面齐",
            noStaticPaths.length
                ? `无 getStaticPaths：${noStaticPaths.join(",")}`
                : "getStaticPaths 齐",
            collides.length ? `与静态目录撞名：${collides.join(",")}` : "无静态语言目录",
        ].join(" · "),
    );

    /* I8 —— I18N_LOCALES 开关语义 */
    const probe = (value) => {
        if (value === undefined) delete process.env.I18N_LOCALES;
        else process.env.I18N_LOCALES = value;
        return {
            enabled: mod.enabledLocales(),
            templates: mod.templateLocales(),
        };
    };
    const dflt = probe(undefined);
    const all = probe("all");
    const subset = probe("ja,fr");
    const junk = probe("de,xx");
    const switchOk =
        dflt.enabled.join(",") === "zh,en" &&
        dflt.templates.length === 0 &&
        all.enabled.length === locales.length &&
        all.templates.join(",") === TEMPLATE_LOCALES.join(",") &&
        subset.enabled.join(",") === "ja,fr" &&
        subset.templates.join(",") === "ja,fr" &&
        junk.enabled.join(",") === "zh,en";
    probe(undefined);
    record(
        "I8",
        "I18N_LOCALES 开关语义",
        switchOk,
        `默认 ${dflt.enabled.join("+")} · all→${all.templates.length} 模板语言 · 子集 ${subset.enabled.join("+")}`,
    );

    /* I9 —— dist 产物（可选）：路由集 + 页数 */
    if (process.env.VERIFY_I18N_DIST === "1") {
        const { readdirSync } = await import("node:fs");
        const distDir = join(ROOT, "dist");
        const walk = (dir) =>
            readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
                const full = join(dir, entry.name);
                return entry.isDirectory() ? walk(full) : entry.name === "index.html" ? [full] : [];
            });
        // 中文列表分页数 = 每门新语言应当生成的 blog 页数（只数数字目录，
        // dist/blog/index.html 是 `/blog` → `/blog/1/` 的跳转页，不算分页）
        const zhBlogPages = existsSync(join(distDir, "blog"))
            ? readdirSync(join(distDir, "blog")).filter(
                  (d) => /^\d+$/.test(d) && existsSync(join(distDir, "blog", d, "index.html")),
              ).length
            : 0;
        const expected = 4 + zhBlogPages; // index + archives + tags + culture + blog/N
        const problems = [];
        for (const locale of TEMPLATE_LOCALES) {
            const dir = join(distDir, locale);
            if (!existsSync(dir)) {
                problems.push(`${locale}: 未构建`);
                continue;
            }
            const pages = walk(dir);
            if (pages.length !== expected)
                problems.push(`${locale}: ${pages.length} 页 ≠ ${expected}`);
            // 整站复制回归护栏：模板路由之外的语言页一个都不许出现
            const strays = pages.filter((p) => {
                const rel = p.slice(dir.length + 1).replace(/index\.html$/, "");
                return !(
                    rel === "" ||
                    rel === "archives/" ||
                    rel === "tags/" ||
                    rel === "culture/" ||
                    /^blog\/\d+\/$/.test(rel)
                );
            });
            if (strays.length)
                problems.push(
                    `${locale}: 多出 ${strays.length} 页（${strays[0]?.slice(dir.length + 1)}）`,
                );
        }
        record(
            "I9",
            "dist：4 语言 × 5 路由 / 无整站复制",
            problems.length === 0,
            problems.length
                ? problems.slice(0, 3).join(" · ")
                : `${TEMPLATE_LOCALES.length} 语言 × ${expected} 页（含 ${zhBlogPages} 个分页）`,
        );
    }
} finally {
    shadow.cleanup();
}

const failed = results.filter((r) => !r.pass);
console.log(
    `\nRESULT ${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length}`,
);
process.exit(failed.length === 0 ? 0 : 1);
