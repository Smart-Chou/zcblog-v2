/**
 * 12 份组件文档的注册表（M1-6）。
 *
 * 数据是 JSON（`./data/<slug>.json`），由 Astro 构建与 `scripts/gates/verify-atom-docs.mjs`
 * 共用同一份文件；顺序即文档页的 prev / next 顺序，也是 /design/atoms 的 specimen 顺序。
 */
import type { DocEntry, DocKind } from "./types";

import button from "./data/button.json";
import link from "./data/link.json";
import tag from "./data/tag.json";
import input from "./data/input.json";
import card from "./data/card.json";
import icon from "./data/icon.json";
import avatar from "./data/avatar.json";
import divider from "./data/divider.json";
import breadcrumb from "./data/breadcrumb.json";
import pagination from "./data/pagination.json";
import alert from "./data/alert.json";
import skeleton from "./data/skeleton.json";

// JSON 的字符串字面量被推断为 string，而 DocEntry 的 layer 是联合类型；
// 形状由 scripts/gates/verify-atom-docs.mjs 做字段级校验，这里只做一次类型收敛。
export const DOCS: DocEntry[] = [
    button,
    link,
    tag,
    input,
    card,
    icon,
    avatar,
    divider,
    breadcrumb,
    pagination,
    alert,
    skeleton,
] as unknown as DocEntry[];

export function bySlug(slug: string): DocEntry {
    const found = DOCS.find((entry) => entry.slug === slug);
    if (!found) throw new Error(`Unknown atom doc: ${slug}`);
    return found;
}

/* ───────────────────────── 种类与 slug 冲突规则（M2-1 / D-0108 §9.1-3） ───────────────────────── */

/**
 * legacy UI 组件与 atom/molecule 同名时的前缀。
 *
 * 规则：atom 保持短名（`button` / `card` / `pagination`），legacy UI 用 `ui-` 前缀
 * （`ui-button` / `ui-card` / `ui-pagination`）。路由分别是 `/design/atoms/<slug>/`
 * 与 `/design/components/<slug>/`，M3 合并后再加 301。
 * 门禁：`scripts/gates/verify-component-inventory.mjs` 按同一条规则核对清单。
 */
export const LEGACY_UI_SLUG_PREFIX = "ui-";

/** 12 份 atom/molecule 文档的 kind 由 layer 派生（数据文件不改）。 */
export function kindOf(entry: DocEntry): DocKind {
    return entry.kind ?? entry.layer;
}

/** atom/molecule 的 slug 集合（按 layer 过滤；M2-10 加入 legacy UI 后依然只含 12 条）；legacy UI 取名时用它判断是否要加 `ui-` 前缀。 */
export const ATOM_SLUGS: ReadonlySet<string> = new Set(
    DOCS.filter((entry) => entry.layer === "atom" || entry.layer === "molecule").map(
        (entry) => entry.slug,
    ),
);

/** 名字 → 文档 slug。与 atom 同名时加 `ui-` 前缀，其余原样小写。 */
export function legacyUiSlug(name: string): string {
    const base = name.trim().toLowerCase();
    return ATOM_SLUGS.has(base) ? `${LEGACY_UI_SLUG_PREFIX}${base}` : base;
}

/**
 * registry 自检（构建期执行；`verify-component-inventory.mjs` 的 I1/I5 是同一条判据）。
 *
 * 1. slug 唯一；
 * 2. slug = name 小写（legacy UI 允许且仅允许在 atom 同名时加 `ui-` 前缀）；
 * 3. atom/molecule 的 slug 保持短名、全小写（路由 `/design/atoms/<slug>/` 不被 legacy 抢走）。
 */
export function assertRegistry(): void {
    const seen = new Set<string>();
    for (const entry of DOCS) {
        const prefixed = entry.slug.startsWith(LEGACY_UI_SLUG_PREFIX);
        const base = prefixed ? entry.slug.slice(LEGACY_UI_SLUG_PREFIX.length) : entry.slug;
        if (base !== entry.name.toLowerCase()) {
            throw new Error(`Registry slug 与 name 不一致：${entry.slug} / ${entry.name}`);
        }
        if (prefixed && !ATOM_SLUGS.has(base)) {
            throw new Error(`只有与 atom 同名的 legacy UI 才加 ui- 前缀：${entry.slug}`);
        }
        if (seen.has(entry.slug)) throw new Error(`Registry slug 重复：${entry.slug}`);
        seen.add(entry.slug);
    }
    for (const slug of ATOM_SLUGS) {
        if (slug !== slug.toLowerCase()) throw new Error(`Atom slug 必须小写：${slug}`);
    }
}

assertRegistry();
