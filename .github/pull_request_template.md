<!-- 提 PR 前请先读 CONTRIBUTING.md；一个 PR 只做一件事。 -->

## 改动类型

- [ ] Bug 修复（不破坏现有行为）
- [ ] 新功能（不破坏现有行为）
- [ ] 破坏性变更（改了组件 props / 内容契约 / token 名，需要同步改调用方）
- [ ] 文档（`README.md` / `AGENTS.md` / `rules/` / `docs/`）
- [ ] 其他（请说明）：

## 自查清单

- [ ] 我读过 `CONTRIBUTING.md`；新功能或设计改动已先开 issue 并得到维护者确认（错别字、文档修正不适用）。
- [ ] `pnpm lint` 通过（输出已贴在下方「怎么验证的」）。
- [ ] `pnpm type-check` 通过。
- [ ] `pnpm test:unit` 通过，贴的是 `Tests N passed (N)` 那一行。
- [ ] `pnpm gates:all` 通过；若有已知红项（如 `verify-overlay` 的 O1），已单独说明不是本次引入。
- [ ] `git diff --stat` 里的文件全部与本次目的相关，没有混入格式化改写或无关文件。
- [ ] 没有提交 `src/content/article/`、`dist/`、`packages/tokens/tokens.css`、`public/icons.svg` 等生成物。
- [ ] 没有在文档、断言或门禁里手抄第二份计数（组件数、用例数、截图数一律引用命令输出）。
- [ ] 改外观：附明/暗两主题截图，并说明是否重生基线、重出了哪几套。
- [ ] 改 token：说明 `pnpm gates:surfaces` 的棘轮计数变化（新增用法为什么不能复用现有语义 token）。
- [ ] 破坏性变更：在下方写了「迁移方法」。

## 关联 issue

<!-- 例：Closes #123。没有对应 issue 的 bug 修复可以写「无」。 -->

## 改了什么

<!-- 一句话说目的，再列关键改动。避免逐文件罗列 diff。 -->

## 怎么验证的

<!-- 贴命令与末尾汇总行，不要只写「本地跑通了」。例：
pnpm test:unit  → Tests 163 passed (163)
pnpm gates:all  → RESULT PASS
-->

```text
（粘贴命令与末尾几行输出）
```

## 截图（改外观时必填）

<!-- 明/暗主题各一张，before / after 并列。纯逻辑改动可删掉本节。 -->
