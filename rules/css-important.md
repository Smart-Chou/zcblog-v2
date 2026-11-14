# `!important` 的所有权边界（css-important）

> 本文管：什么时候允许写 `!important`、五类合法场景的判据、以及「用 `html` 前缀补特异性而不是硬顶」这条本仓已有的成熟做法。
> **必读时机**：任何时候你想在 CSS 里敲 `!important`，或评审时看到别人加了一个。
> 与 `rules/component-api.md` §5 分工：那边管组件样式的**契约**（用什么 token、怎么暴露 variant），这边只管 `!important` 这一个声明的准入。
> 现状基线：`src/` 下**代码中实际声明 56 处**（2026-11-14 逐行解析实测；`grep` 报 57 是因为把注释里提到的 `!important` 也算进去了）。其中 13 处在 `@media (prefers-reduced-motion: reduce)` 块内、1 处在 `@media print` 块内，其余 42 处多为第三方库覆盖与布局兜底。

---

## 1. 默认答案是「不写」

`!important` 是一个**声明级别的强制覆盖**：它跳过整个层叠顺序，只在另一条 `!important` 之间比特异性。所以它一旦写上，后续所有普通声明都改不动它——包括未来的你自己。

写它的成本不是「这一行多了 11 个字符」，是**这条属性从此脱离层叠体系**。所以默认拒绝，只在下面五类场景里有条件放行。

## 2. 五类允许的场景

### 2.1 `@media print` 里的打印重置

打印样式必须压过屏幕样式，而屏幕样式通常特异性更高。这是最正统的用法。

```css
@media print {
    .nav-dropdown, .nav-menu-btn { display: none !important; }
    body { background: white !important; color: black !important; }
    *::before, *::after { box-shadow: none !important; text-shadow: none !important; }
    img { max-width: 100% !important; }
}
```

**边界**：只在 `@media print` 块内。往块外写「为了打印而加的」`!important` 一律打回。<!-- global.css:107-157 -->

### 2.2 `prefers-reduced-motion` 的降级

同一类道理：无障碍降级必须压过任何动效声明。

```css
@media (prefers-reduced-motion: reduce) {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
}
```

**用 `0.01ms` 而不是 `none`**：`none` 会让 `transitionend` 永不触发，某些按需初始化的逻辑（fancybox 的开合、懒加载的占位替换）就死了。`0.01ms` 保留了事件但视觉上等于无动画。<!-- fancybox-overrides.css:75-78 · rules/a11y.md §8 -->

**边界**：只在 `prefers-reduced-motion` 块内，且只作用于 `animation` / `transition` 相关属性。

### 2.3 覆盖第三方库的既有声明

这是本仓最大的一类。判据很简单：**那份 CSS 你改不了，而且它加载在你之后**。

典型案例是 fancybox：它的样式表在运行时按需 append 到 `<head>`（D-0057），**永远排在 `fancybox-overrides.css` 之后**，同特异性必输。<!-- fancybox-overrides.css:88-90 -->

但注意本仓的标准做法**不是**直接上 `!important`，而是先加前缀补特异性：

```css
/* 给「来源顺序」补一级特异性，不用 !important 硬顶 */
html .fancybox--album .f-thumbs__viewport { ... }
```

```css
/* 冲突到 0 的（基类把宽度钉死了）才用 !important */
html .fancybox--album .f-thumbs__viewport { max-width: none !important; }
```

**顺序是：先加 `html` 前缀 → 不够再加 `!important`**。直接上 `!important` 跳过第一步，是本仓明确反对的。

另一个例子是 CSS 变量被就近作用域压掉——Expressive Code 在 `.expressive-code` 上声明了同名变量，`:root` 的普通声明会被它盖住，只能 `!important`：<!-- global.css:23-27 -->

```css
:root {
    /* 必须 !important：EC 在 .expressive-code 上声明了同名变量 */
    --ec-lineNumbers-fg: #b0b4bb !important;
}
```

**边界**：必须能在注释里写清「哪个库、为什么普通声明压不住」。写不出来的，说明还没到需要 `!important` 的地步。

### 2.4 覆盖内联样式或运行时注入的样式

第三方组件用 `element.style` 写内联样式时，内联特异性永远赢。这种情况只能 `!important`——但要在注释里指出是哪个库、哪一行注入的。

### 2.5 与 framework 的 `is:inline` 脚本配合的极少数情形

只有当某个样式必须在脚本执行**之前**就已经生效、且被脚本管理的元素带内联样式时才用。

**这一类要单独评审**，因为它意味着你无法通过正常的层叠解决。

## 3. 严禁的场景

以下任一出现，评审直接打回，不需要讨论：

| 场景 | 为什么不行 |
|---|---|
| 为了让「自己写的两条规则」里后写的赢 | 改选择器特异性或调整文件顺序即可 |
| 因为不确定哪条规则生效，都加上 | 说明没定位到问题 |
| 在 atom / molecule 组件的 scoped style 里 | 组件必须靠 token 和 variant 表达，不许强制穿透 |
| 覆盖本项目自己的样式（非第三方） | 自己的代码改不动的只有设计问题 |
| 在 `@media` 查询外给打印/降级用途加 | 那是把 2.1 / 2.2 的边界打破了 |
| 连续两条同属性都带 `!important` | 后一条只是在跟自己的前一条打架 |

**特别提醒**：`src/components/` 下的 `.astro` 文件里出现 `!important`，一定是设计有问题。目前 `Header.astro` 和 `BaseHead.astro` 各有 2 处，属于历史遗留，**不要照抄**。<!-- 实测 grep src/components/*.astro -->

## 4. 与 `var(--token)` 的关系：优先级不用来掩盖 token 问题

本仓禁止 palette 直引（`--palette-*` 必须走语义 token，G-T4 硬拦）。有人会想用 `!important` 强行覆盖 token 效果——**那是双重错误**：既绕过了 token 体系，又用了强制覆盖。

如果 token 算出来的值不对，改 token，不改声明。

## 5. 写之前的三问

1. **这份 CSS 是我能改的吗？** 能改 → 改它，不写 `!important`
2. **加一级前缀（`html` / 父类 / `[data-theme]`）能赢吗？** 能 → 加前缀
3. **注释里能写清「哪个库/哪条内联样式，为什么压不住」吗？** 不能 → 不写

三问全是「否」才写，并且注释必须落在同一行上方。

## 6. 评审清单

看到一个 `!important` 时逐条核对：

- [ ] 是否在 `@media print` 或 `@media (prefers-reduced-motion: reduce)` 块内？→ 是则大概率合法（2.1 / 2.2）
- [ ] 是否覆盖第三方库？→ 注释里是否点名了库和原因（2.3）
- [ ] 是否覆盖内联样式？→ 注释里是否指出注入来源（2.4）
- [ ] 是否在 `src/components/**` 里？→ 打回，除非属于 2.3 且有注释
- [ ] 是否可以用 `html` 前缀替代？→ 能替代就必须替代
- [ ] 是否与另一条同属性 `!important` 冲突？→ 说明层叠已失控

## 7. 为什么不禁用

技术上可以用 stylelint 禁掉 `!important`。本仓**没有**这么做，原因是打印样式和第三方覆盖是真实需求，禁掉只会让人用 `// stylelint-disable` 绕过——那样比 `!important` 更隐蔽。

**规则的价值在于让人有条件地思考，不在于制造绕过的动机。**
