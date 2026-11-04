/**
 * 23 份 legacy UI 组件文档的注册表（M2-10a 建 12 份，M2-10b 补齐 23 份）。
 *
 * 与 atom 的 `./index.ts` 同一套口径：数据是 JSON，Astro 构建与
 * `scripts/gates/verify-component-docs.mjs` 共用同一份文件；数组顺序即文档页的
 * prev / next 顺序，也是页脚索引与 `/design/components/` 的路由顺序。
 *
 * 目录选择：legacy UI 的 23 份 JSON 放在 `./data/components/` 子目录，而不是与
 * M1-6 的 12 份 atom JSON 平铺。原因是技术性的——`verify-atom-docs.mjs`、
 * `verify-doc-drift.mjs`、`verify-component-inventory.mjs` 都按「`data/*.json` =
 * 恰好 12 份 atom 文档」做全量断言（drift 还要求每份的 `spec` 能解析到 §5.6.N，
 * legacy UI 没有 §5.6 契约）。平铺会让这三道门禁同时变红，而它们不在本卡的文件边界内。
 *
 * slug 规则来自 M2-1 / D-0108（`index.ts` 的 `legacyUiSlug`）：与 atom 同名的 legacy UI
 * 加 `ui-` 前缀（`ui-button` / `ui-card` / `ui-pagination`），其余取组件名小写。
 * 这一组 slug 必须与 `docs/component-inventory.json` 的 ui 记录逐条一致。
 */
import type { DocEntry } from "./types";

import badge from "./data/components/badge.json";
import uiButton from "./data/components/ui-button.json";
import uiCard from "./data/components/ui-card.json";
import uiPagination from "./data/components/ui-pagination.json";
import archive from "./data/components/archive.json";
import pageHeader from "./data/components/pageheader.json";
import typewriterText from "./data/components/typewritertext.json";
import cardGrid from "./data/components/cardgrid.json";
import qrCard from "./data/components/qrcard.json";
import friendPill from "./data/components/friendpill.json";
import donatorsList from "./data/components/donatorslist.json";
import author from "./data/components/author.json";
import notice from "./data/components/notice.json";
import watermark from "./data/components/watermark.json";
import walineComment from "./data/components/walinecomment.json";
import search from "./data/components/search.json";
import heatmap from "./data/components/heatmap.json";
import donate from "./data/components/donate.json";
import essayItem from "./data/components/essayitem.json";
import friendCard from "./data/components/friendcard.json";
import hitokoto from "./data/components/hitokoto.json";
import serviceCard from "./data/components/servicecard.json";
import emptyState from "./data/components/emptystate.json";

// JSON 的字符串字面量被推断为 string，而 DocEntry 的 layer 是联合类型；
// 形状由 scripts/gates/verify-component-docs.mjs 做字段级校验，这里只做一次类型收敛。
export const COMPONENT_DOCS: DocEntry[] = [
    badge,
    uiButton,
    uiCard,
    uiPagination,
    archive,
    pageHeader,
    typewriterText,
    cardGrid,
    qrCard,
    friendPill,
    donatorsList,
    author,
    notice,
    watermark,
    walineComment,
    search,
    heatmap,
    donate,
    essayItem,
    friendCard,
    hitokoto,
    serviceCard,
    emptyState,
] as unknown as DocEntry[];

export function byComponentSlug(slug: string): DocEntry {
    const found = COMPONENT_DOCS.find((entry) => entry.slug === slug);
    if (!found) throw new Error(`Unknown component doc: ${slug}`);
    return found;
}

/** 页头 / 页脚的导航分区（AtomDoc 的 `section` prop）。 */
export const COMPONENT_SECTION = {
    base: "/design/components/",
    peers: COMPONENT_DOCS.map((entry) => ({ slug: entry.slug, name: entry.name })),
    backHref: "/design/atoms/",
    backLabel: "← atom 文档（M1-6）",
    indexTitle: "全部 23 个 legacy UI 组件文档",
    indexHint:
        "这一组是 `src/components/UI/*.astro` 的 23 个旧组件（M2-10a 12 个 + M2-10b 11 个）；契约以小节事实为准，与 `DESIGN.md §5.6` 的 12 个核心组件不是同一套。",
};
