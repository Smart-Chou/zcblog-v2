# M4-7 · `site.manifest.json` 分类补齐报告（NOTICE + 发布链 3 条路径）

- 卡片：`t_36fea29e`（parent `t_6f55211b` / M4-4）
- 基线：`HEAD = 10cf92b`，工作树含 M4-4 未提交产物（`.changeset/**`、`.github/workflows/release.yml`、`docs/release.md`、`scripts/release/**`）
- 结论：**O1 的既有红灯（`NOTICE` 未分类）已清；发布链 3 条路径在 commit 前后两种口径下都归好类**。真仓 `verify-overlay.mjs` `RESULT PASS classified=1046 unclassified=0`；真仓 `pnpm gates:all` **exit 0**（9/9），`verify-workflow.mjs` 24/24。
- 边界：只改 `site.manifest.json`、`docs/overlay-contract.md`，加 `docs/_reviews/M4-7/report.md`。**未 commit、未 push、未动 `packages/**`、未动 release workflow、未 publish。**

---

## 1. 验收对照

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| `verify-overlay.mjs` RESULT PASS，`unclassified=0` | ✅ | `RESULT PASS classified=1046 unclassified=0 theme=694 overlay=299 exclude=53 plan_baseline=998 delta=+48`（真仓，exit 0） |
| `pnpm gates:all` exit 0（9 个门禁全过） | ✅ | 真仓 `corepack pnpm gates:all` → **exit 0**，9 条全 PASS（`atoms 18/18`、`component-inventory total=47`、`doc-drift mismatch=0`、`check-tokens 10/10`、`surface-tokens`、`entities 9/9`、`boundary packages=3 violations=0`、`overlay classified=1046 unclassified=0`）；另在干净快照（HEAD + 本卡改动，排除并行卡在途文件）上复跑同样 9/9，见 §5.3 |
| `node scripts/release/verify-workflow.mjs` 仍 24/24 PASS | ✅ | `RELEASE_SUMMARY {"ok":true,"counts":{"PASS":24,"FAIL":0,"WARN":0,"INFO":0,"SKIP":0}}`，exit 0（release.yml 一个字节没动） |
| 报告 + 改造前后 `--report` 对比 | ✅ | 本文件 §4（三段实测输出）与 §5（负向自检） |

---

## 2. 改了什么

### 2.1 `site.manifest.json`（本卡唯一的功能改动，`git diff` 6 行）

```diff
                 "CONTRIBUTING.md",
-                "LICENSE"
+                "LICENSE",
+                "NOTICE"
             ],
-            "reserved": []
+            "reserved": [".changeset/**", "docs/release.md", ".github/workflows/release.yml"]
@@
         { "path": "astro.config.mjs", "class": "T" },
+        { "path": "NOTICE", "class": "T" },
         { "path": "package.json", "class": "T" },
```

- `NOTICE` 进 **T.rules**（有命中，属「活规则」）；
- 发布链 3 条进 **T.reserved**（当前 `git ls-files` 里 0 命中，写 `rules` 会让 O3 判死规则红）；
- `NOTICE` 加进 **anchors**（30 → 31 个），把这次判定钉成契约样本：以后再有人把 `NOTICE` 从清单里删掉，红的是 O4 而不只是 O1。

> 为什么 `reserved` 不是 `rules`：门禁的真值是 `git ls-files`。`.changeset/config.json`、`.changeset/README.md`、`docs/release.md`、`.github/workflows/release.yml` 是 M4-4 的**落盘但未 commit** 产物（用户的 git 边界：zcblog 仓只读），对门禁而言它们「还没出现」。契约 §5 第 3 条写的就是这个情形 → `reserved`。`reserved` 的规则**照样参与分类**（`compileManifest` 对 `rules`/`reserved` 一视同仁，只有 O3 的活性检查区分），所以 commit 之后分类结果与写在 `rules` 完全相同，不需要再改一次清单。

### 2.2 `docs/overlay-contract.md`（判据文档，+37/−10 行）

| 位置 | 改动 |
| --- | --- |
| 页头 | 加「修订（M4-7）」说明：只改清单与文档，**判据脚本未改一行** |
| §2 表 | 实测计数 1016（677/290/49）→ **1046（694/299/53）**，并把 `RESULT PASS` 那一行原样贴进去 |
| §2.2（新增） | 1016 → 1046 的 30 个新增按卡拆开（M3-6 8 / M3-7 5 / M3-8 4 / M4-1 11 / M4-2+4-3 2），并点明「29 个当时就归好了类，只有根 `NOTICE` 漏了」 |
| §4 表 | 新增 3 行判定（`NOTICE`、`.changeset/**`、`docs/release.md`）+ 补 1 行（`release.yml`）；`deploy-matrix.yml` 补进既有 workflow 行；`docs/_reviews` 计数 47 → 51 |
| §5 | 新增两条纪律：**「已落盘但还没 commit」= 将来才出现**（写 `rules` 会判死规则）；**会长文件的目录用通配不要逐文件列举**（`LICENSE` 写了 `NOTICE` 漏写就是这个错） |
| §6 | 「需要 PO 确认的 3 条判断」→ **5 条**，新增第 4（`NOTICE` 归 T）与第 5（发布链归 T），含「若改成另一边」的代价 |

---

## 3. 判定理由（可被追问「凭什么」）

### 3.1 根 `NOTICE` → **T**（不是 O）

1. **内容是主题的，不是站点的。** `NOTICE` 写的是「Dogeared（折角）— Astro 博客主题与配套包」的 MIT 许可、Shirone 的**机制借鉴声明**、`astro`/`satori`/`sharp` 三依赖的许可。全篇没有一个字提到 MarxChou 这个站点的文章、图片、字体归属——那部分反而被它明确排除在 MIT 之外（「站点文章、图片、字体等内容资产不在 MIT 范围内」）。
2. **它与包内副本逐字节相同，而包内副本已经是 T。**

   ```
   $ shasum -a 256 NOTICE packages/*/NOTICE
   9ad03bd5f8aa9190…  NOTICE
   9ad03bd5f8aa9190…  packages/og-image/NOTICE
   9ad03bd5f8aa9190…  packages/tokens/NOTICE
   9ad03bd5f8aa9190…  packages/ui/NOTICE
   ```

   三个包的 `files` 白名单都列了 `"NOTICE"`（M4-1 的产物），`scripts/release/preflight.mjs` 的 P2 闸门也把 `NOTICE` 与 `LICENSE` 并列为必需文件。若把根文件判 **O**，主题升级时包内三份副本随 T 更新、根文件不动 → 两份法务文本分叉，而发布出去的包和仓库根说的不是同一件事。
3. **它与 `LICENSE` 成对，而 `LICENSE` 早就是 T**（T.rules 里逐条列着）。同一类材料用两把尺子，正是这次红灯的成因。

反向代价：判 O 等于承认「站点可以改主题的第三方借鉴声明」——站点没有这个权利。

### 3.2 发布链 3 条路径（`.changeset/**`、`docs/release.md`、`.github/workflows/release.yml`）→ **T**

契约 §4.1 的原话是「`.github/workflows/**`（除站点专属）」，而唯一的「站点专属」是 `deploy.yml`——它写死了本仓发布到 CF Pages 项目 / GitHub Pages / `ARTICLES_PAT`。`release.yml` 正相反：

- 触发面只有 `push: tags: [v*]` 与 `workflow_dispatch`，默认 dry-run；
- 内容全是三包的版本一致性校验 → preflight → `changeset publish --from-pack-dir`；
- **没有一行站点身份**（无站点域名、无 CF 项目名、无 `ARTICLES_PAT`）。

换个站点用同一份主题，这个文件不需要改一个字。同理 `.changeset/config.json` 声明的是三包的 `fixed` lockstep 版本机制、`docs/release.md` 是三包发布的判据文档（与 `docs/package-boundary.md`、`docs/overlay-contract.md` 同类）。三条都是**主题工程**，不是某个站点的部署配置。

`.changeset/**` 用**目录通配**而不是列举 `config.json`+`README.md`：`pnpm changeset` 每写一条建议就新增一个 `.changeset/<name>.md`，逐文件列举会在下一条 changeset 出现时立刻漏判——这和 `LICENSE` 写了 `NOTICE` 漏写是同一类错误。探针实测：`.changeset/some-change.md` → `T`（§5.2）。

---

## 4. 改造前后 `--report` 实测

同一台机器同一次会话，Node v22.23.1。

### 4.1 改造前（= HEAD 的 `site.manifest.json`，tracked 1046）

```
O0  site.manifest.json 自洽 + 版本 lockstep      PASS  0 项
O1  tracked 文件全覆盖（unclassified=0）           FAIL  1 项
    - 未分类：NOTICE
O2  唯一归属（ambiguous=0）                        PASS  0 项
O3  规则活性（T/O 无死规则）                       PASS  0 项
O4  锚点分类符合声明（30 个）                      PASS  0 项
O5  theme-sync --list 与门禁同口径               PASS  0 项
O6  分类探针（含 override / 未分类）               PASS  0 项
O7  示例 overlay 字段完整（1 个）                  PASS  0 项

分类分布
  T    693   66.3%  theme
  O    299   28.6%  overlay
  X     53    5.1%  exclude
  计划基线 998（§4.1）· 实测 1045 · delta +47

RESULT FAIL  classified=1045 unclassified=1 violations=1
```

### 4.2 改造后（真仓，本卡改动已落地）

```
O0  site.manifest.json 自洽 + 版本 lockstep      PASS  0 项
O1  tracked 文件全覆盖（unclassified=0）           PASS  0 项
O2  唯一归属（ambiguous=0）                        PASS  0 项
O3  规则活性（T/O 无死规则）                       PASS  0 项
    · reserved 未命中：T .changeset/**
    · reserved 未命中：T docs/release.md
    · reserved 未命中：T .github/workflows/release.yml
    （以下为既有的 O/X reserved 未命中，略）
O4  锚点分类符合声明（31 个）                      PASS  0 项
O5  theme-sync --list 与门禁同口径               PASS  0 项
O6  分类探针（含 override / 未分类）               PASS  0 项
O7  示例 overlay 字段完整（1 个）                  PASS  0 项

分类分布
  T    694   66.3%  theme
  O    299   28.6%  overlay
  X     53    5.1%  exclude
  计划基线 998（§4.1）· 实测 1046 · delta +48

RESULT PASS  classified=1046 unclassified=0 theme=694 overlay=299 exclude=53 plan_baseline=998 delta=+48
```

delta 从 `+47` 到 `+48`，T 从 693 到 694：**唯一的变化就是 `NOTICE` 从「未分类」落进 T**，O/X 两侧一个数没动。O3 的三条 `reserved 未命中` 是预期（那三个路径还没被 commit），不是告警升级——`reserved` 0 命中只打 info，`rules` 才算死规则。

### 4.3 模拟「M4-4 的四个文件被 commit」之后（`git add` 后另一种口径）

真仓不能 commit（用户 git 边界），所以在临时快照里复现 commit 后的索引：tracked 文件 1046 + `.changeset/{config.json,README.md}` + `.github/workflows/release.yml` + `docs/release.md` + `scripts/release/*.mjs`（8）+ `docs/_reviews/M4-4/report.md` = **1059**。

```
O0 … O7 全部 PASS（O4 锚点 31 个）

分类分布
  T    706   66.7%  theme
  O    299   28.2%  overlay
  X     54    5.1%  exclude
  计划基线 998（§4.1）· 实测 1059 · delta +61

RESULT PASS  classified=1059 unclassified=0 theme=706 overlay=299 exclude=54 plan_baseline=998 delta=+61
```

T +12 = `scripts/release/**`（8）+ `release.yml`（1）+ `docs/release.md`（1）+ `.changeset/{config.json,README.md}`（2）；X +1 = M4-4 报告；O 不变。**这就是「commit 之后 `gates:all` 不会因此再红」的证据。**

---

## 5. 负向自检（证明绿灯不是空转）

### 5.1 必须红的时候真的红

| # | 手法 | 结果 |
| --- | --- | --- |
| N1 | 用 HEAD 的 `site.manifest.json` 跑（即改造前原状） | `O1 FAIL 1 项 - 未分类：NOTICE` → `RESULT FAIL classified=1045 unclassified=1 violations=1` |
| N2 | 在 1059 的快照里把 `T.reserved` 清空 | `O1 FAIL 4 项：.changeset/README.md、.changeset/config.json、.github/workflows/release.yml、docs/release.md` → `RESULT FAIL classified=1055 unclassified=4 violations=4` |

N2 说明那三条 `reserved` 是**承重的**：它们恰好兜住 4 个文件，一个不多一个不少。

### 5.2 分类探针（用门禁自己导出的分类器，不是手抄）

```
path                                   class tracked
NOTICE                                 T     yes
.changeset/config.json                 T     yes   ← commit 后
.changeset/README.md                   T     yes   ← commit 后
.changeset/some-change.md              T     no    ← 将来 pnpm changeset 写的词条
docs/release.md                        T     yes   ← commit 后
.github/workflows/release.yml          T     yes   ← commit 后
.github/workflows/deploy.yml           O     yes   ← 唯一的站点专属 workflow，没被误抓
scripts/release/preflight.mjs          T     yes   ← 已被 scripts/** 覆盖
packages/tokens/NOTICE                 T     yes   ← 包内副本，用于对照
LICENSE                                T     yes   ← 原有规则，未回归
```

### 5.3 `gates:all` 的 9 条命令（干净快照：HEAD 的 tracked 文件 + 本卡两个改动）

```
scripts/gates/verify-atoms.mjs                 exit=0  结果：18/18 PASS · 0 FAIL
scripts/gates/verify-atom-docs.mjs             exit=0
scripts/gates/verify-component-inventory.mjs   exit=0  RESULT PASS  atoms=12 ui=23 page-organisms=11 layout=1 dup=0 total=47
scripts/gates/verify-doc-drift.mjs             exit=0  RESULT PASS  mismatch=0  文档=12 对比度行=49
scripts/gates/check-tokens.mjs                 exit=0  结果：10/10 PASS · 0 FAIL
scripts/gates/verify-surface-tokens.mjs        exit=0  RESULT PASS  pages_hits=2(legacy frozen, new=0) new_hits=0 baseline=41/84
scripts/gates/verify-entities.mjs              exit=0  结果：9/9 PASS · 0 FAIL · 0 WARN
scripts/gates/verify-package-boundary.mjs      exit=0  RESULT PASS  packages=3 violations=0 theme_version=2.1.0
scripts/gates/verify-overlay.mjs               exit=0  RESULT PASS  classified=1046 unclassified=0 …
---
gates_failed=0 / 9
```

同一批命令在**真仓**上跑 `corepack pnpm gates:all`（`package.json` 的 `gates:all` 就是这 9 条按序 `&&`）→ **exit 0**，逐条汇总行：

```
结果：18/18 PASS · 0 FAIL                                     (verify-atoms)
RESULT PASS  atoms=12 ui=23 page-organisms=11 layout=1 dup=0 total=47   (component-inventory)
RESULT PASS  mismatch=0  文档=12 对比度行=49                    (doc-drift)
结果：10/10 PASS · 0 FAIL                                     (check-tokens)
RESULT PASS  pages_hits=2(legacy frozen, new=0) new_hits=0 baseline=41/84 (surface-tokens)
结果：9/9 PASS · 0 FAIL · 0 WARN                              (entities)
RESULT PASS  packages=3 violations=0 theme_version=2.1.0      (package-boundary)
RESULT PASS  classified=1046 unclassified=0 theme=694 overlay=299 exclude=53 plan_baseline=998 delta=+48  (overlay)
```

---

## 6. 中途与并行卡 M4-6 的撞车（已自行消解，留档）

收口过程中 `gates:all` 曾短暂 `exit 1`，红在 **B2 包内站点身份串**，而 `packages/**` 不在本卡边界内：

```
B2  包内站点身份串（marxchou/mcc.im/zcily/73b29141）= 0 FAIL  1 项
    - packages/og-image/test/smoke.test.mjs:5  [marxchou] *   pnpm --filter @marxchou/dogeared-og-image test
```

时序证据（同一工作树，两个 worker 并行）：

| 时间 | 事件 |
| --- | --- |
| 03:12 | 本卡第一次 `gates:all` → **exit 0**（9/9，那时 `packages/**` 还是 HEAD 状态） |
| 03:13 | `packages/og-image/test/smoke.test.mjs` 落盘（并行卡 M4-6 `t_20a7ac2a`，状态 `running`） |
| 03:14 | `gates:all` → exit 1：B2 报 1 项（该文件注释里的 `pnpm --filter @marxchou/… test`） |
| 03:17 | 再来一次 → B2 报 3 项（M4-6 又写了 tokens/ui 的 smoke 测试，注释里同样带 `@marxchou/`） |
| 03:21 | 本卡改用「干净快照」取证（§5.3），证明 overlay 这一维度与 `packages/**` 无关 |
| 03:24 | M4-6 自行清掉注释里的 scope 串 → 真仓 `gates:all` **exit 0**，B2 `PASS 0 项` |

结论：那条红是 M4-6 在途文件触发的（B2 只豁免 `package.json` 的 `"name"`），与 `site.manifest.json` 无关；本卡没有碰 `packages/**`，等它自己清完，整链自然转绿。留档的原因是——**两个卡片共用一个工作树时，`gates:all` 的绿/红是全仓信号，不是单卡信号**，取证要能区分这两件事。

---

## 7. 偏差与未做

| 项 | 状态 | 说明 |
| --- | --- | --- |
| commit / push | **未做** | 用户 git 边界：zcblog 仓只读。改动留工作树，由人工 commit |
| `packages/**` | 未动 | 边界 |
| `.github/workflows/release.yml` | 未动 | 边界；`verify-workflow.mjs` 24/24 复跑通过 |
| release.yml / docs/release.md 等 4 个路径留在 `reserved` | 有意为之 | commit 之后可以顺手提升到 `rules`（只影响 O3 活性告警，不影响分类结果；不提升也不会红）。已在契约 §5 写明 |
| 判据脚本 | 一行未改 | 本卡只动清单与文档；`scripts/gates/verify-overlay.mjs` 的 `git diff` 为空 |
| 契约 §4 里其它行的历史计数（`e2e/**` 168、`packages/**` 13 等） | 未批量刷新 | 那些是 M3-5 时代的数，与本卡判定无关；只刷新了本卡触及的 `docs/_reviews`（47→51）与 §2 总量，避免半刷新制造新的不一致 |

## 8. 回滚

```bash
cd ~/Documents/WebSiteCode/zcblog-v2
git checkout -- site.manifest.json docs/overlay-contract.md   # 丢弃本卡两处改动
# 报告归档（可选）
rm -r docs/_reviews/M4-7
```

回滚后 `verify-overlay.mjs` 会重新回到 `unclassified=1（NOTICE）` 的既有红灯状态——那正是本卡开工时的样子，没有副作用、无数据迁移。
