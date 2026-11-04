/**
 * C 层实体契约（M2-7a；M2-7b 只追加 devices / games）
 * ------------------------------------------------------------------
 * 为什么单独一层类型：C 层展示页（项目 / 技能 / 设备 / 游戏 / 时间线 …）不走
 * content collection（`src/content.config.ts` 是文章契约，不许混），数据是手写
 * typed 文件（`src/data/entities/*.ts`）。于是「schema 在哪」必须有个明确答案：
 * 就在本文件——**类型 + 校验 + 归一化**三件事同源，页面与门禁都从这里取。
 *
 * 三态语义（沿用 M2-6a/M2-6b 的 adapter 约定）：
 *   ok    数据可用
 *   empty 文件在但没有条目（含站点显式关闭）→ 页面给空态，路由照常 200
 *   error 数据形状不合法（或全部条目被丢弃）→ 页面给错误态 + 原因代码
 * 归一化**永不抛异常**：坏条目被丢弃并计入 `dropped`，页面不会因为一条脏数据整页 500。
 * 门禁（`scripts/gates/verify-entities.mjs`）则相反——`dropped > 0` 即 FAIL。
 * 这条分界是本契约的核心：运行时宽容、CI 严格。
 *
 * 本文件不 import 任何模块：数据文件只 `import type` 它，门禁把两者转译成
 * ESM 后在 node 里直接跑，所以这里放的必须是纯函数。
 */

/** 契约版本；schema 破坏性变更时 +1，门禁会打印出来。 */
export const ENTITY_CONTRACT_VERSION = 1;

/** 数据新鲜度阈值（天）。超过只 warning，不 fail（14 §7 硬性规则 3）。 */
export const ENTITY_FRESHNESS_DAYS = 180;

export type EntityLocale = "zh" | "en";

/** 站点双语字段：两个语种都必填，缺一个门禁就红（避免 en 页面掉回中文）。 */
export interface LocalizedText {
    zh: string;
    en: string;
}

export type EntityKind = "projects" | "skills" | "devices" | "games";

export type EntityStatus = "ok" | "empty" | "error";

export type EntityIssueCode =
    | "source-missing"
    | "source-empty"
    | "source-invalid"
    | "entry-dropped"
    | "forced-empty"
    | "forced-error";

export interface EntityIssue {
    code: EntityIssueCode;
    detail?: string;
}

/** 归一化产物：页面只读这个，不直接读数据文件。 */
export interface EntityCollection<T> {
    kind: EntityKind;
    status: EntityStatus;
    items: T[];
    /** 通过校验的条目数（= items.length，给页面 data-* 与门禁用）。 */
    total: number;
    /** 被丢弃的坏条目数；> 0 时门禁 FAIL。 */
    dropped: number;
    /** 丢弃原因（最多 8 条，给门禁打印用，不进页面）。 */
    problems: string[];
    /** 数据「最后更新」，取 meta.updated；缺失时退回各条目里最新的 updated。 */
    updated: string | null;
    /** 距今天数；无法解析为 null。 */
    ageDays: number | null;
    /** ageDays > ENTITY_FRESHNESS_DAYS（warning 口径，不阻断构建）。 */
    stale: boolean;
    issue?: EntityIssue;
}

/* ───────────────────────── 项目 ───────────────────────── */

export type ProjectStatus = "active" | "maintained" | "archived";

export interface EntityLink {
    /** 链接文案；技术名/站点名不翻译，给什么显示什么。 */
    label: string;
    /** 只接受 http(s) 绝对地址；门禁会校验。 */
    href: string;
}

export interface Project {
    /** 稳定键（slug 形状，小写连字符）；页面用它做锚点，不要随标题改。 */
    id: string;
    title: LocalizedText;
    summary: LocalizedText;
    status: ProjectStatus;
    /** 起始年月 `YYYY-MM`。 */
    started: string;
    /** 结束年月 `YYYY-MM`；`null` = 仍在做。 */
    ended?: string | null;
    role?: LocalizedText;
    /** 技术栈（不翻译）。 */
    stack: string[];
    highlights?: LocalizedText[];
    links?: EntityLink[];
    /** 条目最后更新 `YYYY-MM-DD`，新鲜度按它算。 */
    updated: string;
}

/* ───────────────────────── 技能 ───────────────────────── */

/** 四档闭集；不从 0 起算，避免「会一点」被当成技能。 */
export type SkillLevel = "exploring" | "working" | "solid" | "deep";

export interface Skill {
    name: string;
    level: SkillLevel;
    /** 起始年份（`YYYY`），可空。 */
    since?: string;
    note?: LocalizedText;
}

export interface SkillGroup {
    id: string;
    title: LocalizedText;
    summary?: LocalizedText;
    items: Skill[];
    updated: string;
}

/* ───────────────────────── 集合元信息 ───────────────────────── */

/**
 * 每个数据文件导出且只导出一份 meta。
 * `owner` 是 14 §7 规则 4 的「归属到人」；`source` 说明数据怎么来（手写 / 导入）。
 */
export interface EntityMeta {
    /** `YYYY-MM-DD`；新鲜度门禁的锚点。 */
    updated: string;
    owner?: string;
    source?: string;
}

/* ───────────────────────── 校验器 ───────────────────────── */

const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const YEAR = /^\d{4}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTTP = /^https?:\/\/[^\s]+$/;

const PROJECT_STATUSES: readonly ProjectStatus[] = ["active", "maintained", "archived"];
const SKILL_LEVELS: readonly SkillLevel[] = ["exploring", "working", "solid", "deep"];

export const PROJECT_REQUIRED_FIELDS = [
    "id",
    "title",
    "summary",
    "status",
    "started",
    "stack",
    "updated",
] as const;

export const SKILL_GROUP_REQUIRED_FIELDS = ["id", "title", "items", "updated"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === "string" && value.trim() !== "";

export function isLocalizedText(value: unknown): value is LocalizedText {
    return isRecord(value) && isNonEmptyString(value.zh) && isNonEmptyString(value.en);
}

export function isIsoMonth(value: unknown): value is string {
    return typeof value === "string" && ISO_MONTH.test(value);
}

export function isIsoDay(value: unknown): value is string {
    return typeof value === "string" && ISO_DAY.test(value);
}

export function isHttpUrl(value: unknown): value is string {
    return typeof value === "string" && HTTP.test(value);
}

/** 单条项目的结构问题；返回空数组 = 合法。 */
export function validateProject(value: unknown): string[] {
    if (!isRecord(value)) return ["不是对象"];

    const problems: string[] = [];
    const at = (field: string) => `projects[${String(value.id ?? "?")}].${field}`;

    if (!isNonEmptyString(value.id) || !SLUG.test(value.id)) problems.push(`${at("id")} 必须是小写连字符 slug`);
    if (!isLocalizedText(value.title)) problems.push(`${at("title")} 需要 zh + en 两个非空字符串`);
    if (!isLocalizedText(value.summary)) problems.push(`${at("summary")} 需要 zh + en 两个非空字符串`);
    if (!PROJECT_STATUSES.includes(value.status as ProjectStatus))
        problems.push(`${at("status")} 必须是 ${PROJECT_STATUSES.join(" / ")}`);
    if (!isIsoMonth(value.started)) problems.push(`${at("started")} 必须是 YYYY-MM`);
    if (value.ended !== undefined && value.ended !== null && !isIsoMonth(value.ended))
        problems.push(`${at("ended")} 必须是 YYYY-MM 或 null`);
    if (value.role !== undefined && !isLocalizedText(value.role))
        problems.push(`${at("role")} 需要 zh + en 两个非空字符串`);
    if (!Array.isArray(value.stack) || value.stack.length === 0 || !value.stack.every(isNonEmptyString))
        problems.push(`${at("stack")} 必须是非空字符串数组（至少一项）`);
    if (
        value.highlights !== undefined &&
        (!Array.isArray(value.highlights) || !value.highlights.every(isLocalizedText))
    )
        problems.push(`${at("highlights")} 必须是双语条目数组`);
    if (value.links !== undefined) {
        const ok =
            Array.isArray(value.links) &&
            value.links.every((link) => isRecord(link) && isNonEmptyString(link.label) && isHttpUrl(link.href));
        if (!ok) problems.push(`${at("links")} 每项需要 label 与非空 http(s) href`);
    }
    if (!isIsoDay(value.updated)) problems.push(`${at("updated")} 必须是 YYYY-MM-DD`);

    return problems;
}

/** 单组技能的结构问题；返回空数组 = 合法。 */
export function validateSkillGroup(value: unknown): string[] {
    if (!isRecord(value)) return ["不是对象"];

    const problems: string[] = [];
    const at = (field: string) => `skills[${String(value.id ?? "?")}].${field}`;

    if (!isNonEmptyString(value.id) || !SLUG.test(value.id))
        problems.push(`${at("id")} 必须是小写连字符 slug`);
    if (!isLocalizedText(value.title)) problems.push(`${at("title")} 需要 zh + en 两个非空字符串`);
    if (value.summary !== undefined && !isLocalizedText(value.summary))
        problems.push(`${at("summary")} 需要 zh + en 两个非空字符串`);
    if (!isIsoDay(value.updated)) problems.push(`${at("updated")} 必须是 YYYY-MM-DD`);

    if (!Array.isArray(value.items) || value.items.length === 0) {
        problems.push(`${at("items")} 必须是非空数组`);
        return problems;
    }
    value.items.forEach((item, index) => {
        const where = `${at("items")}[${index}]`;
        if (!isRecord(item)) {
            problems.push(`${where} 不是对象`);
            return;
        }
        if (!isNonEmptyString(item.name)) problems.push(`${where}.name 必须是非空字符串`);
        if (!SKILL_LEVELS.includes(item.level as SkillLevel))
            problems.push(`${where}.level 必须是 ${SKILL_LEVELS.join(" / ")}`);
        if (item.since !== undefined && !(typeof item.since === "string" && YEAR.test(item.since)))
            problems.push(`${where}.since 必须是 YYYY`);
        if (item.note !== undefined && !isLocalizedText(item.note))
            problems.push(`${where}.note 需要 zh + en 两个非空字符串`);
    });

    return problems;
}

export function validateMeta(value: unknown): string[] {
    if (!isRecord(value)) return ["meta 不是对象"];
    const problems: string[] = [];
    if (!isIsoDay(value.updated)) problems.push("meta.updated 必须是 YYYY-MM-DD");
    if (value.owner !== undefined && !isNonEmptyString(value.owner)) problems.push("meta.owner 必须是非空字符串");
    if (value.source !== undefined && !isNonEmptyString(value.source)) problems.push("meta.source 必须是非空字符串");
    return problems;
}

/* ───────────────────────── 实体规格 ───────────────────────── */

export interface EntitySpec<T> {
    kind: EntityKind;
    /** 结构校验；空数组 = 通过。 */
    validate(value: unknown): string[];
    /** 条目级的最后更新日期（新鲜度按最旧的一条算）。 */
    updatedOf(value: T): string | null;
    /** 定位一个条目（门禁打印与去重用）。 */
    keyOf(value: T): string;
}

export const projectSpec: EntitySpec<Project> = {
    kind: "projects",
    validate: validateProject,
    updatedOf: (project) => (isIsoDay(project.updated) ? project.updated : null),
    keyOf: (project) => project.id,
};

export const skillGroupSpec: EntitySpec<SkillGroup> = {
    kind: "skills",
    validate: validateSkillGroup,
    updatedOf: (group) => (isIsoDay(group.updated) ? group.updated : null),
    keyOf: (group) => group.id,
};

/* ───────────────────────── 归一化 ───────────────────────── */

export interface NormalizeOptions {
    /**
     * 构建期强制状态（`PUBLIC_*_STATE`）。
     * 只用于验收/截图：`empty` / `error`。其它值忽略。
     */
    force?: string | null;
    /** 计时基准（`YYYY-MM-DD`）；缺省今天。测试用它钉住新鲜度。 */
    now?: string;
}

const MAX_PROBLEMS = 8;

/** `YYYY-MM-DD` → 毫秒；不合法返回 null（不用 Date.parse，它会接受 `2026-1-1`）。 */
function parseDay(value: string | null | undefined): number | null {
    if (typeof value !== "string" || !ISO_DAY.test(value)) return null;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isNaN(time) ? null : time;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 把原始数据归一化成页面可直接渲染的三态产物。
 *
 * - `raw` 不是数组 → `error / source-invalid`
 * - 数组为空 → `empty / source-empty`
 * - 有条目但全部被丢弃 → `error / source-invalid`
 * - 部分被丢弃 → `ok`，但带 `issue: entry-dropped`（门禁会 FAIL）
 */
export function normalizeCollection<T>(
    raw: unknown,
    meta: EntityMeta | undefined | null,
    spec: EntitySpec<T>,
    options: NormalizeOptions = {},
): EntityCollection<T> {
    const base: EntityCollection<T> = {
        kind: spec.kind,
        status: "empty",
        items: [],
        total: 0,
        dropped: 0,
        problems: [],
        updated: null,
        ageDays: null,
        stale: false,
    };

    const force = options.force ?? null;
    if (force === "empty") {
        return { ...base, issue: { code: "forced-empty" } };
    }
    if (force === "error") {
        return {
            ...base,
            status: "error",
            issue: { code: "forced-error", detail: "build-time override" },
        };
    }

    if (!Array.isArray(raw)) {
        return {
            ...base,
            status: "error",
            issue: { code: "source-invalid", detail: "导出值不是数组" },
        };
    }

    const items: T[] = [];
    const problems: string[] = [];
    for (const entry of raw) {
        const entryProblems = spec.validate(entry);
        if (entryProblems.length === 0) {
            items.push(entry as T);
            continue;
        }
        for (const problem of entryProblems) {
            if (problems.length < MAX_PROBLEMS) problems.push(problem);
        }
    }

    const dropped = raw.length - items.length;

    // 新鲜度：meta.updated 优先；没有就取条目里最新的 updated。
    // 「最旧的一条」不参与这里——条目各自的 updated 由门禁单独列 warning，
    // 页面只报数据文件整体的最后维护时间。
    const metaUpdated = meta && isIsoDay(meta.updated) ? meta.updated : null;
    const itemUpdated = items
        .map((item) => spec.updatedOf(item))
        .filter((value): value is string => typeof value === "string")
        .sort()
        .at(-1) ?? null;
    const updated = metaUpdated ?? itemUpdated;
    const updatedTime = parseDay(updated);
    const nowTime = parseDay(options.now ?? new Date().toISOString().slice(0, 10));
    const ageDays =
        updatedTime === null || nowTime === null ? null : Math.floor((nowTime - updatedTime) / DAY_MS);

    const collection: EntityCollection<T> = {
        ...base,
        items,
        total: items.length,
        dropped,
        problems,
        updated,
        ageDays,
        stale: ageDays !== null && ageDays > ENTITY_FRESHNESS_DAYS,
    };

    if (items.length === 0) {
        return raw.length === 0
            ? { ...collection, status: "empty", issue: { code: "source-empty" } }
            : {
                  ...collection,
                  status: "error",
                  issue: {
                      code: "source-invalid",
                      detail: `${dropped} 条全部不合格：${problems[0] ?? "未知原因"}`,
                  },
              };
    }

    if (dropped > 0) {
        return {
            ...collection,
            status: "ok",
            issue: { code: "entry-dropped", detail: `${dropped} 条被丢弃：${problems[0] ?? "未知原因"}` },
        };
    }

    return { ...collection, status: "ok" };
}

/* ───────────────────────── 展示辅助 ───────────────────────── */

/** 按 locale 取双语字段；缺值退回另一语种，再缺退回空串（不抛）。 */
export function pick(text: LocalizedText | undefined | null, locale: EntityLocale): string {
    if (!text) return "";
    const primary = locale === "en" ? text.en : text.zh;
    if (typeof primary === "string" && primary.trim() !== "") return primary;
    const fallback = locale === "en" ? text.zh : text.en;
    return typeof fallback === "string" ? fallback : "";
}

/** `2025-10` + `null` → `2025.10 — 至今` / `2025.10 — Now`。 */
export function formatPeriod(project: Project, locale: EntityLocale): string {
    const from = project.started.replace("-", ".");
    if (!project.ended) return locale === "en" ? `${from} — now` : `${from} — 至今`;
    return `${from} — ${project.ended.replace("-", ".")}`;
}

const SKILL_LEVEL_LABEL: Record<SkillLevel, LocalizedText> = {
    exploring: { zh: "探索中", en: "Exploring" },
    working: { zh: "常用", en: "Working" },
    solid: { zh: "熟练", en: "Solid" },
    deep: { zh: "深耕", en: "Deep" },
};

/** 四档 → 1–4 段刻度（纯视觉，aria-hidden；语义由文字标签承担）。 */
export const SKILL_LEVEL_RANK: Record<SkillLevel, number> = {
    exploring: 1,
    working: 2,
    solid: 3,
    deep: 4,
};

export function skillLevelLabel(level: SkillLevel, locale: EntityLocale): string {
    return pick(SKILL_LEVEL_LABEL[level] ?? SKILL_LEVEL_LABEL.exploring, locale);
}

const PROJECT_STATUS_LABEL: Record<ProjectStatus, LocalizedText> = {
    active: { zh: "进行中", en: "Active" },
    maintained: { zh: "维护中", en: "Maintained" },
    archived: { zh: "已归档", en: "Archived" },
};

export function projectStatusLabel(status: ProjectStatus, locale: EntityLocale): string {
    return pick(PROJECT_STATUS_LABEL[status] ?? PROJECT_STATUS_LABEL.active, locale);
}

/** 数据新鲜度的可读口径：`2026-11-02 · 2 天前`。 */
export function formatUpdated(updated: string | null, ageDays: number | null, locale: EntityLocale): string {
    if (!updated) return "";
    if (ageDays === null) return updated;
    if (locale === "en") return `${updated} · ${ageDays} days ago`;
    return `${updated} · ${ageDays} 天前`;
}
