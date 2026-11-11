# M8-6-4 · 赞助页视觉重做

- 卡：`t_b0c45ba9`（M8-6 批一 · 赞助）
- 规格：`docs/_reviews/M8-6/acceptance-standard.md` §2.4（P4-01…P4-06）+ §1 通用项 + §4 V-06
- 结论：**结构、五态、a11y、CLS 全部收口**；实现提交 `fdf10a7` + 两次溢出修复，operator 复核再补 3 处。

## 1. 实现

| 区块 | 结果 |
|---|---|
| 页头 | `PageHero`（kicker / h1 / lede / meta）；h1 保留 `.donations-title#donate-title` |
| 收款方式 | `SectionHead` + 3 列支付卡（wechat / alipay / paypal）；二维码真实资产，0 空 `src` |
| 年度账本 | 新增 `<table>` + `<caption>` + `th[scope]`；无真实结算数据时**不渲染金额/进度**，不写 0、不抄设计稿数字；375 下转卡片列表 |
| 芳名录 | `DonatorsList`（ok）/ `DataState`（empty / error）；`donators.json` 4 条占位人名已清空 |
| 赞助答疑 | 新增 3 条，文案取自 `donate_supporters_2/code.html` L521+ |
| 视觉收口 | `radius-xl → lg`；补 `prefers-reduced-motion`；支付栅格收敛到 1 列 ≤768 / 3 列 ≥1024 |

## 2. Operator 复核修正

完整 e2e（32 项）首轮暴露 3 个真问题，均已修：

1. **G-08 假红**：英文账本说明里出现字面量 `placeholder`，被“0 处占位假数据”断言命中。改为 `stand-in`，语义不变。
2. **axe light 对比度**：账本表头 `--color-fg-muted` 在 `--color-bg-muted` 上仅 **3.86:1**（12px），2 个 `th` 命中 serious；改 `--color-fg-heading`。
3. **CLS @390 = 0.2231**：二维码 `img` 未加载时 `block-size:auto` 让卡片高度从 272→325px 跳变；给 `QrCard` 的 frame 加 `aspect-ratio:1`、图片固定 `10rem × 10rem`，实测 `/donate/` @1440 与 @390 CLS 均为 **0.0000**。

另：`PageHero` 新增可选 `titleClass`（页面既有契约选择器需要），已补进 `DESIGN.md §5.6.13` 与 `pagehero.json`；`DESIGN.md` 快照与 blog2.0 真源、`DESIGN.vendor.json` 的 md5/bytes/lines 已同步。

## 3. 验证

| 项 | 结果 |
|---|---|
| `astro build` | **482 页 / Complete!** |
| `tsc --noEmit` | **0** |
| `gates:all` | **8/8 PASS** |
| `verify-atom-docs` | **8/8 PASS** |
| 完整 `pages-talks-donate.spec.ts` | **32 passed (11.2m)**，exit 0 |
| axe donate（light/dark） | serious = 0、incomplete = 0 |
| CLS | `/donate/` @1440 **0.0000**、@390 **0.0000** |
| 375 账本 | 卡片化、0 横向溢出、可点区 ≥44 |
| G-08 | 0 处占位人名 / 0 空 `src` |

## 4. 证据

`shots/`：`donate-light-1440.png`、`donate-dark-1440.png`、`donate-light-390.png`、`donate-375-light.png`。
