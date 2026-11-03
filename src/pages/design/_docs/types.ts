/**
 * Atom 文档页的类型定义（M1-6）。
 *
 * 数据放在 `_docs/data/<slug>.json`（12 份），页面在 `src/pages/design/atoms/<slug>.astro`。
 * 选择 JSON 而不是 TS 对象的原因：`scripts/gates/verify-atom-docs.mjs` 与 Astro 构建
 * 共用同一份数据，不需要再写一个 TS 解析器；字段齐全性由门禁脚本 + e2e 双重判定。
 *
 * 七个必填字段（对应 16-m1-brief §5 第 5 项与 DESIGN.md §5.6 的字段定义）：
 *   1. purpose / notFor   —— 用途 / 何时不用
 *   2. props              —— 名称 / 类型 / 默认 / 取值 / 说明
 *   3. slots              —— 名称 / 必需 / 说明
 *   4. states             —— 状态 / 触发 / 视觉 token / ARIA
 *   5. a11y               —— 语义元素、键盘、ARIA、对比度数字、焦点环、指针目标、reduced-motion
 *   6. tokens             —— 消费的 token 白名单（颜色 / 度量 / 其他）
 *   7. 示例               —— 页面里的真实组件实例（不是数据字段，由 <AtomDoc> 的 slot 承载）
 */

export interface PropRow {
    name: string;
    type: string;
    default: string;
    values: string;
    notes: string;
}

export interface SlotRow {
    name: string;
    required: string;
    notes: string;
}

export interface StateRow {
    state: string;
    trigger: string;
    visual: string;
    aria: string;
}

export interface ContrastRow {
    pair: string;
    light: string;
    dark: string;
    threshold: string;
}

export interface A11yDoc {
    semantics: string;
    keyboard: string;
    aria: string;
    contrast: ContrastRow[];
    focusRing: string;
    target: string;
    reducedMotion: string;
    notes?: string[];
}

export interface TokenDoc {
    color: string[];
    metric: string[];
    other?: string[];
    none?: string;
}

export interface SizeTable {
    title: string;
    columns: string[];
    rows: string[][];
}

export interface DocEntry {
    slug: string;
    name: string;
    cn: string;
    layer: "atom" | "molecule";
    spec: string;
    source: string;
    purpose: string;
    notFor: string[];
    props: PropRow[];
    slots: SlotRow[];
    states: StateRow[];
    a11y: A11yDoc;
    tokens: TokenDoc;
    sizes?: SizeTable;
    forbidden?: string[];
    related?: string[];
}
