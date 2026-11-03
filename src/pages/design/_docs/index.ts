/**
 * 12 份组件文档的注册表（M1-6）。
 *
 * 数据是 JSON（`./data/<slug>.json`），由 Astro 构建与 `scripts/gates/verify-atom-docs.mjs`
 * 共用同一份文件；顺序即文档页的 prev / next 顺序，也是 /design/atoms 的 specimen 顺序。
 */
import type { DocEntry } from "./types";

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
