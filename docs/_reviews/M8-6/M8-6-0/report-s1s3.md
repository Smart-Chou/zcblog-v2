# M8-6-0 · s1 + s3 收口报告（文档三件套 + DESIGN.md 三节 + 分母 51）

> **状态**：完成（2026-11-11 第二轮 session，`blog-fe`）
> **卡**：`t_0744aa27` · 裁决依据：operator 11:34 comment（同意编号顺延 / s1+s3 一次提交）+ `D-0161`（total = **51**）
> **接续**：`report.md`（s0 组件骨架，commit `6c82f99`）

---

## 1. 本轮交付

| # | 文件 | 动作 | 说明 |
|---|---|---|---|
| 1 | `docs/DESIGN.md` | 改 | 新增 §5.6.13 PageHero / §5.6.14 SectionHead / §5.6.15 DataState；原「本节自检」→ **§5.6.16**（含 `-B/-C` 与全文 10 处 `§5.6.13` 引用）；§5.3 状态矩阵 +3 行；§4.5 层表 +3 行；§5.6.16-A 表 12→15 行；§5.6.16-B 表 +3 个色对；P1/P2 行补口径说明 |
| 2 | `src/pages/design/_docs/data/{pagehero,sectionhead,datastate}.json` | 新增 | 七项字段 + props/slots/states/a11y(contrast)/tokens/sizes/forbidden/related，范式同 `alert.json` |
| 3 | `src/pages/design/atoms/{pagehero,sectionhead,datastate}.astro` | 新增 | `<AtomDoc>` + `<DemoFrame>`：PageHero 3 形态、SectionHead 4 组合、DataState empty/error × 有/无 action |
| 4 | `src/pages/design/_docs/index.ts` | 改 | DOCS 12 → **15** 条（顺序置于 `skeleton` 之后，prev/next 不变） |
| 5 | `scripts/gates/verify-component-inventory.mjs` | 改 | `FROZEN_COUNTS` → atom 11 / molecule 4 / ui 24 / layout 1 / page-organism 11 / **total 51**；I1 12→15、I2 10+2→11+4、导入数与文案同步 |
| 6 | `scripts/gates/verify-atom-docs.mjs` | 改 | `SLUGS` +3、D1/D2/D3 计数 12→15 |
| 7 | `scripts/gates/verify-component-docs.mjs` | 改 | `ATOM_PAGES` +3、注释 35→38 份 |
| 8 | `docs/component-inventory.json` | 改（`--update`） | 新增 3 条 atom/molecule 记录 + usage 快照重写；`counts` 实测 = 冻结 = **51** |
| 9 | `docs/DESIGN.vendor.json` | 改 | md5 `e72af4cfc443…` / bytes 194536 / lines 2850 / syncedAt 2026-11-11（G-S6 指针） |

## 2. 验收 → 命令 → 输出

| 门禁 | 命令 | 结果 |
|---|---|---|
| 文档漂移 | `node scripts/gates/verify-doc-drift.mjs` | **PASS** `mismatch=0 文档=15 对比度行=61`（D1/D2/D3/D4 全 PASS，「只在正文」仍 4/4 未增长，决策号豁免 1 行） |
| 组件分母 | `node scripts/gates/verify-component-inventory.mjs` | **PASS** I1 `docs=15/15` · I2 `atom=11 molecule=4 总=15` · I6 `total=51` · I7a/I7b PASS · `RESULT PASS total=51` |
| DESIGN 自检 | `node scripts/gates/verify-atoms.mjs` | **PASS 18/18**（P1–P10 + A1–A8；扫描范围仍是 M1 的 12 个，见 §4） |
| Token 门禁 | `node scripts/gates/check-tokens.mjs` | **PASS 10/10 · 0 FAIL**（G-S6 指针已更新） |
| 类型 | `npx tsc --noEmit` | **0 error** |
| 文档页构建 | `npx astro build` + `node scripts/gates/verify-atom-docs.mjs` | 见 §5 实测行 |

## 3. 与 operator 口径的差异（必须记录）

- operator 11:34 comment 的 `FROZEN_COUNTS total 50` 与分项相加（11+4+24+1+11）**不自洽**；按 `D-0161` 采用 **51**。实测 `I6` 绿色，证明 51 才是当前基线 + 3 的结果。
- `docs/DESIGN.md` 是 `blog2.0/docs/DESIGN.md` 的逐字节快照；本轮只改仓库内快照（真源在仓库外、非 git 仓），`check-tokens` 只 WARN 真源 md5 不同。**真源需 operator 下次同步时 `cp` 过去**，否则下一个人重跑 resync 会把三节覆盖掉。

## 4. 已知覆盖缺口（不在本卡收口）

1. `verify-atoms.mjs` 的 `SPECS` 仍只枚举 M1 的 12 个：`§5.6.13–15` 不受 P1/P2/P5/P10 与 A1–A8 扫描。已在 §5.6.16-C 下加一条明文说明口径，扩到 15 需同步 `SPECS` + P10 白名单（新卡）。
2. `verify-component-docs.mjs` 的 `ATOM_PAGES` 已扩到 15（总数 23+15=38），但 dist 侧依赖构建产物；本卡只跑到 `astro build` 全量构建。
3. 视觉基线（1440/390 × light/dark 截图）留给 QA 批次，与 s0 结论一致。
