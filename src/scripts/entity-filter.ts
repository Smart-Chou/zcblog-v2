/**
 * 实体页筛选（项目 / 设备 / 技能三页共用一个模块，M8-2）
 * ------------------------------------------------------------------
 * 只做四件事：切 `aria-pressed`、切条目的 `hidden`、隐藏空分组、更新计数 / 清除按钮 / 收起徽标。
 *
 * 边界（`26-m8-2-entities-design-spec.md` §1.6.5）：
 * - 不发请求、不排序、不改 URL、不存 localStorage、不做动画。
 * - 过滤对象是**已经渲染出来的真实数据**（构建期产出），因此 0 JS 时列表仍完整可读；
 *   筛选区本身在 `<noscript>` 里被隐藏（`FilterBar` 输出的内联 style），不会出现「点了没反应」。
 *
 * 为什么是常驻模块而不是页面 `<script>`：D-0080 —— 页面级内联 module 在 swup 换页时
 * 既不会重新插入 head 也不会执行，筛选项在 SPA 导航后就成了死按钮。这里跟随 tab-nav
 * 的既有做法：BaseLayout 常驻导入 + `onPageReady`（首屏 DOMContentLoaded + 每次换页）。
 *
 * DOM 契约见规格 §1.6.4：
 *   [data-entity-filter][data-total][data-unit][data-label-none]
 *     [data-filter-group][data-filter-attr][data-filter-kind=single|multi]
 *       button[data-filter-value][aria-pressed]
 *     [data-filter-result]（aria-live）/ [data-filter-badge]
 *     [data-filter-clear] / [data-filter-reset]
 *   [data-entity-list] / [data-entity-item][data-<attr>] / [data-entity-filtered-empty]
 */
import { onPageReady } from "~/utils/page-lifecycle";

const FILTER = "[data-entity-filter]";
const GROUP = "[data-filter-group]";
const CHIP = "[data-filter-value]";
const ITEM = "[data-entity-item]";
const LIST = "[data-entity-list]";
const FILTERED_EMPTY = "[data-entity-filtered-empty]";

/** 单选组只有「命中的那一个」为 true；多选组各切各的，「全部」等于清空该组。 */
function pressChip(chip: HTMLButtonElement): void {
    const group = chip.closest<HTMLElement>(GROUP);
    if (!group) return;

    const kind = group.dataset.filterKind === "multi" ? "multi" : "single";
    const value = chip.dataset.filterValue ?? "all";
    const pressed = chip.getAttribute("aria-pressed") === "true";

    if (kind === "multi" && value !== "all") {
        chip.setAttribute("aria-pressed", String(!pressed));
        group.querySelectorAll<HTMLElement>('[data-filter-value="all"]').forEach((all) => {
            all.setAttribute("aria-pressed", "false");
        });
        return;
    }

    // 单选组：点谁谁是唯一 true；多选组点「全部」= 全部归零，只留「全部」。
    group.querySelectorAll<HTMLElement>(CHIP).forEach((other) => {
        other.setAttribute("aria-pressed", String(other === chip));
    });
}

/** 选中的组 → 匹配规则；`all` 不计入（等于该组不参与过滤）。 */
interface ActiveGroup {
    attr: string;
    kind: "single" | "multi";
    values: Set<string>;
}

function readActive(root: HTMLElement): ActiveGroup[] {
    const active: ActiveGroup[] = [];
    root.querySelectorAll<HTMLElement>(GROUP).forEach((group) => {
        const attr = group.dataset.filterAttr ?? "";
        if (attr === "") return;
        const values = new Set<string>();
        group.querySelectorAll<HTMLElement>(`${CHIP}[aria-pressed="true"]`).forEach((chip) => {
            const value = chip.dataset.filterValue ?? "all";
            if (value !== "all") values.add(value);
        });
        if (values.size === 0) return;
        active.push({
            attr,
            kind: group.dataset.filterKind === "multi" ? "multi" : "single",
            values,
        });
    });
    return active;
}

function matches(item: HTMLElement, active: ActiveGroup[]): boolean {
    return active.every((group) => {
        const raw = item.getAttribute(group.attr) ?? "";
        if (group.kind === "single") return group.values.has(raw);
        // 多选：`data-stack="Astro|TypeScript"` 与选中集合取交集非空即命中（OR）。
        return raw.split("|").some((part) => group.values.has(part));
    });
}

function apply(root: HTMLElement): void {
    const active = readActive(root);
    const total = Number(root.dataset.total ?? "0");
    const unit = root.dataset.unit ?? "";
    const noneLabel = root.dataset.labelNone ?? "";

    const items = Array.from(document.querySelectorAll<HTMLElement>(ITEM));
    let visible = 0;
    for (const item of items) {
        const hit = matches(item, active);
        item.hidden = !hit;
        if (hit) visible += 1;
    }

    const filtered = active.length > 0;
    const text =
        visible === 0 && filtered
            ? noneLabel
            : visible === total
              ? `${total} ${unit}`
              : `${visible} / ${total} ${unit}`;

    root.querySelectorAll<HTMLElement>("[data-filter-result]").forEach((node) => {
        node.textContent = text;
    });
    root.querySelectorAll<HTMLElement>("[data-filter-result-mirror]").forEach((node) => {
        node.textContent = text;
    });

    const badge = root.querySelector<HTMLElement>("[data-filter-badge]");
    if (badge) {
        badge.textContent = `(${active.length})`;
        badge.hidden = !filtered;
    }

    document
        .querySelectorAll<HTMLButtonElement>("[data-filter-clear], .entity-filter__clear")
        .forEach((button) => {
            button.disabled = !filtered;
        });

    root.dataset.filtered = String(active.length);
    root.dataset.visible = String(visible);

    const list = document.querySelector<HTMLElement>(LIST);
    const empty = document.querySelector<HTMLElement>(FILTERED_EMPTY);
    if (list) list.hidden = visible === 0;
    if (empty) empty.hidden = visible !== 0;

    // 组内条目为 0（筛选后）→ 整组不渲染：不出现只有标题的空区块（规格 §1.7.2 / B-3）。
    // 设备页「计算机 + 在用」把「网络」组整组拿掉就靠这一条。
    document.querySelectorAll<HTMLElement>("[data-entity-group]").forEach((group) => {
        group.hidden = group.querySelector<HTMLElement>(`${ITEM}:not([hidden])`) === null;

        // 技能页：组头是「本组还剩多少」（`3 / 5 项`），其余页面没有 [data-group-count] 就空转。
        const counter = group.querySelector<HTMLElement>("[data-group-count]");
        if (!counter) return;
        const rows = Array.from(group.querySelectorAll<HTMLElement>(ITEM));
        const shown = rows.filter((row) => !row.hidden).length;
        const groupTotal = Number(group.dataset.groupTotal ?? String(rows.length));
        const groupUnit = group.dataset.groupUnit ?? "";
        counter.textContent =
            shown === groupTotal
                ? `${groupTotal} ${groupUnit}`.trim()
                : `${shown} / ${groupTotal} ${groupUnit}`.trim();
    });

    // 末页标记只在「确实显示了条目」时才有意义；筛选无结果时由空态说话。
    const end = document.querySelector<HTMLElement>("[data-entity-end]");
    if (end) end.hidden = visible === 0;
}

function clearAll(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>(GROUP).forEach((group) => {
        group.querySelectorAll<HTMLElement>(CHIP).forEach((chip) => {
            chip.setAttribute("aria-pressed", String(chip.dataset.filterValue === "all"));
        });
    });
    apply(root);
}

function init(root: HTMLElement): void {
    // swup 会重复执行模块脚本；同一份 DOM 只挂一次监听。
    if (root.dataset.filterReady === "true") {
        apply(root);
        return;
    }
    root.dataset.filterReady = "true";

    // ≤768 折叠：默认展开的详情在窄屏收起一次（JS 必须关闭，否则首屏就是展开面板）。
    const details = root.querySelector<HTMLDetailsElement>("details");
    if (details) details.open = window.innerWidth >= 768;

    // 事件委托挂在 `document`：筛选无结果的空态（含「清除筛选」按钮）渲染在列表区，
    // 不在 `<details>` 里；挂 root 会让那个按钮变成死按钮。
    document.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;
        if (!target) return;

        if (
            target.closest(
                "[data-filter-clear], .entity-filter__clear, [data-filter-reset], .entity-filter__reset",
            )
        ) {
            event.preventDefault();
            clearAll(root);
            return;
        }

        const chip = target.closest<HTMLButtonElement>(CHIP);
        if (!chip || !root.contains(chip)) return;
        pressChip(chip);
        apply(root);
    });

    apply(root);
}

onPageReady(() => {
    document.querySelectorAll<HTMLElement>(FILTER).forEach(init);
});
