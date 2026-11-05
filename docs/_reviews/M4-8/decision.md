# M4-8 · `@marxchou/dogeared-ui` 是否在 M4 发布 —— 决策记录

- 卡：`t_28292288`（M4-8）· 决策编号 **D-0120** · 前置 M4-5 = `t_b89c4ce9`（第三方干净安装 PASS）
- 日期：2026-11-06 03:44 CST · 基线 commit `fd6d76e`（普查时 HEAD；期间有其他卡在途提交）
- 环境：macOS 15.7.7 · node `v26.0.0` · npm `11.12.1` · python3 3.14.9
- 计划依据：`blog2.0/docs/23-m4-plan.md` §1「不在本阶段发布 `ui`（除非出现第二个真实消费者）」、§3 M4-F、§5 M4-6

## 0. 结论（先行）

**M4 不发布 `@marxchou/dogeared-ui`。** `private: true` 保持不动，站内继续用 workspace 相对路径 / 符号链接引用；M4 首发只发 `tokens` + `og-image` 两包。

判据逐条对照（计划 M4-F「第二个真实站点引用 Badge/Button 后再发」）：

| 判据 | 实测 | 是否满足 |
| ---- | ---- | -------- |
| 仓内有真实站点按**包名**引用 | `src/**` / `apps/**` / `theme-template/**` 命中 **0** | ❌ |
| 仓外有第二个站点按**包名**引用 | 同机 15 个兄弟仓库命中 **0** | ❌ |
| 第二个站点以**副本**方式使用同一对原语 | 仅 `~/Documents/WebSiteCode/dogeared`（冻结的同主题快照，非独立站点，见 §3.2） | ❌ |
| demo 站跑通「包模式」 | `apps/demo` 是**无主题代码的 overlay**，不可能 import 原语包；以「装包」方式消费 = 0 | ❌ |
| 包已在 registry（外部才可能消费） | `npm view` 两包均 **404** | ❌ |

五条全不满足 → 按计划口径记录「M4 暂不发布 ui」，不开 M4-7 发布卡，不 publish。

> 目录口径说明：卡正文要求写 `docs/_reviews/M4-6/decision.md`，但 `docs/_reviews/M4-6/` 已被 `t_20a7ac2a`（包产物修复，report.md 22.7 kB）占用 —— 写进去会互相覆盖。本卡按卡片编号落在 `docs/_reviews/M4-8/`，卡号与目录名对齐。

## 1. 引用普查（可复跑）

普查脚本 `docs/_reviews/M4-8/census.py`（纯 stdlib，只读遍历；跳过 `node_modules`/`dist`/`.astro`/`test-results`/`.git`），产物 `evidence.json`。

### 1.1 包名口径 `@marxchou/dogeared-ui`

```console
$ python3 docs/_reviews/M4-8/census.py
HEAD fd6d76e
scoped name hits: 26 -> {'docs': 2, 'package_self': 1, 'release_infra': 5, 'review_evidence': 18}
legacy 'zcblog-ui' hits: 0
site_runtime (src/ apps/ theme-template/) scoped-name refs: 0
primitive relative refs: 18 (site_runtime=12)
external repos referencing name: 0
registry probe: {'exit': 1, ...}
wrote .../docs/_reviews/M4-8/evidence.json
```

26 条命中的分类（`evidence.json` → `scoped_name_hits`）：

| 类别 | 条数 | 文件 | 性质 |
| ---- | ---- | ---- | ---- |
| `package_self` | 1 | `packages/ui/package.json:2` | 包自我声明 `name` |
| `release_infra` | 5 | `.changeset/config.json`(fixed 组)、`scripts/gates/verify-package-boundary.mjs`×2、`scripts/release/verify-changeset-loop.mjs`×2 | 发布/门禁基础设施 |
| `docs` | 2 | `docs/package-boundary.md:12`、`docs/release.md:3` | 文档叙述 |
| `review_evidence` | 18 | `docs/_reviews/M4-1|M4-4|M4-5|M4-6/**` | 历史卡证据与 fixture（含 M4-5 的 tarball 安装试验） |
| **`site_runtime`** | **0** | — | **无任何站点代码按包名 import** |

补充：计划 §5 的旧验收命令用旧包名 `zcblog-ui`，同口径复跑 = **0 命中**（D-0119 改名后旧名已清干净）。

### 1.2 原语的真实引用（按文件路径，而非包名）

站点侧不是「装包」，而是 `src/components/UI/Badge.astro`、`Button.astro` 两条 **git 符号链接**指向 `packages/ui/src/`（`ls -la` 实测 → `../../../packages/ui/src/Badge.astro`），所以包名计数为 0，但原语确实在被用。18 条路径级命中：

| 文件 | 行 | 内容性质 |
| ---- | -- | -------- |
| `src/components/UI/ServiceCard.astro` | 3 | **真 import** `Badge from "../../../packages/ui/src/Badge.astro"` |
| `src/pages/500.astro` | 3 | **真 import** `Button from "../../packages/ui/src/Button.astro"` |
| `src/pages/design/components/badge.astro` | 13 | **真 import** `Badge from "~/components/UI/Badge.astro"`（文档站演示页） |
| `src/pages/design/components/ui-button.astro` | 13 | **真 import** `Button from "~/components/UI/Button.astro"`（文档站演示页） |
| `src/pages/design/_docs/data/components/{badge,ui-button}.json` | 7,8 ×2 | 文档数据里的 `spec`/`source` 字符串 |
| `src/pages/design/components/{badge,ui-button}.astro` | 5–7 ×2 | 注释说明「站点侧是符号链接」 |
| `CHANGELOG.md` / `site.manifest.json` / `docs/surface-token-baseline.json` / `docs/component-inventory.json` | — | 记录性元数据 |

即：**真实运行期 import 4 处，全部属于「本站」**（2 个产品页 + 2 个同仓文档页），没有第二个站点。

### 1.3 仓外与 registry

```console
$ grep -rn "dogeared-ui" --include="*.json" --include="*.md" --include="*.astro" --include="*.ts" \
    --include="*.mjs" --include="*.js" ~/Documents/WebSiteCode | grep -v "^.*/zcblog-v2/" | grep -v node_modules
(0 行)

$ npm view @marxchou/dogeared-ui version
npm error 404  The requested resource '@marxchou/dogeared-ui@*' could not be found or you do not have permission to access it.
$ npm view @marxchou/dogeared-tokens version
npm error 404  ...
```

同机 15 个兄弟仓库（`zcblog`、`zcblog-articles`、`zcblog-content-v2`、`dogeared`、`homepage`、`flare-stack-blog` …）**零处按包名引用**。registry 两包 404 → 外部谁也不可能已经消费（也就意味着「发布」不是解锁任何存量消费者的动作，而是纯新增一个没人装的产品）。

## 2. 三个「疑似第二消费者」逐个排除

### 2.1 `apps/demo` —— 示例 overlay，不是消费者

```
apps/demo/README.md
apps/demo/src/config/{site,feature,ui,services}.ts
apps/demo/src/content/article/hello-world.md
apps/demo/src/data/typewriter.json
```

7 个文件，**没有任何主题代码**（无 components/pages/layouts），装配方式是 `node scripts/create-site.mjs --overlay apps/demo --out /tmp/zcd --build`。它对 `@marxchou/dogeared-ui` 的引用数 = **0**：overlay 只是站点身份 + 内容 + 数据，原语由主题侧代码 import，装配出来的还是**同一个主题**。`13-package-boundaries.md` §12 说的「等 demo 站跑通包模式」在今天的事实上不成立 —— demo 站连包模式都没有入口。

### 2.2 `~/Documents/WebSiteCode/dogeared` —— 冻结的 vendored 副本，不是独立站点

这是同机上唯一「有完整主题代码 + 真的用 Badge/Button」的另一个目录，但：

| 事实 | 实测 |
| ---- | ---- |
| 身份 | `package.json`：`name=dogeared`, `version=1.0.0`, `private:true`；`src/config/site.ts` 标题仍是模板默认 `Dogeared` + url「部署后替换为真实域名」 |
| 版本控制 | **无 `.git`**、无 remote（`git remote -v` 空） |
| 冻结点 | `src/`、`dist/`、`node_modules/` 全部 mtime **2026-10-09 00:15–00:16**；`dist/` 是 10-09 的构建 |
| 消费方式 | 复制件：`src/components/UI/Badge.astro`、`Button.astro`（3 处 import：`ServiceCard`、`TagsIndexContent`、`500`），**按包名引用 0** |
| 与原语的一致性 | Badge `sha256 d828fa56…` **与 `packages/ui/src/Badge.astro` 逐字节相同**；Button `sha256 a7eb5405…` **≠** 包内 `a74ebfb5…` |

Button 的差异是 M2-13a 的可访问性修复（`color: #fff` → `var(--color-on-accent)`）。也就是说这份副本**已经领先落后于主线**：它是 M3 重构前的工作快照，不是活的第二个站点。它需要的是「合并回主题仓」，不是「装 npm 包」—— 发布 ui 对它一点帮助都没有。

### 2.3 同仓文档站 `/design/components/*` —— 文档引用

`badge.astro` / `ui-button.astro` 两个演示页 import 的是本站符号链接，性质同 §1.2，属「文档引用」。

## 3. ui 当前公共面是否足以独立发布

**机械门槛：已经够。** M4-5 已用 tarball 在空 Astro 项目里验证过：装得上（5,342 B / 15.2 kB 解包 / 11 文件）、`exports` 五个入口全部 resolve、Astro 页面渲染 Badge×3 + Button×2、裸 Node 不能 import（已在 README 与包内测试里钉成已知限制）。

**语义门槛：偏薄，现在发反而是负债。** 逐项：

| 维度 | 现状 | 影响 |
| ---- | ---- | ---- |
| 原语数量 | 2 个：`Badge`（6 variant × 3 size）、`Button`（2 variant，只出 `<a>`，没有 `<button>`/`type`/`disabled`） | 一个只含 2 个组件的包，语义版本号几乎没有演进空间；Button 的 API 缺口一旦有人用就得 breaking |
| 入口 | `.` barrel + `./Badge.astro` + `./Button.astro` + `./package.json`；`dist/index.js` 415 B，只做 re-export 且目标仍是 `.astro` | 只能在 Astro/Vite 里用（裸 Node 必失败，已文档化 + 测试钉死） |
| 包级 CHANGELOG | **无**（`packages/*/CHANGELOG.md` 全不存在，只有仓库根 `CHANGELOG.md`） | 公开包的消费者期望 per-package changelog |
| README 状态 | 头部自述 `Status: private, not published yet.`，安装示例用 `@<npm-scope>` 占位（B2 边界禁止把组织身份写进包文件） | 发布前必须回填 scope 并删掉「未发布」段 |
| 测试 | `packages/ui/test/smoke.test.mjs` 29 条 assert | 够用 |
| 依赖方向 | peer `astro` optional、零运行时依赖 | 健康 |

结论写成一句：**「可发，但不该现在发」** —— 机械链路在 M4-5 已经证明可行，缺的不是能力而是消费者；先发一个无人安装的 2 组件包，等于主动承诺支持矩阵（Astro 版本、semver、issue triage），收益为 0。

## 4. 决策的副作用（实测，必须写进后续卡）

「ui 保持 `private:true`」不是零成本状态。在 `/tmp` 副本里把 `tokens`、`og-image` 翻成 `private:false`、`ui` 保持不变，跑发布闸门：

```console
$ bash docs/_reviews/M4-8/probe-private-gate.sh
[PASS] P1         @marxchou/dogeared-tokens private:false，可发布
[FAIL] P1         @marxchou/dogeared-ui 仍是 private:true，禁止发布
[PASS] P1         @marxchou/dogeared-og-image private:false，可发布
[FAIL] P5         changeset publish-plan 为空 …
RELEASE_SUMMARY {...,"ok":false,"counts":{"PASS":32,"FAIL":2,...},"mode":"publish",...}
```

- **P1 是全局闸门，不是「本次发布清单」闸门**：`scripts/release/preflight.mjs` 对 `loadPackages()` 的三个包逐个判 `private`，publish 模式下一律硬失败。于是「只发两包、ui 留 private」这个决策在 **tokens/og-image 首发时会把 release workflow 卡在 preflight**（`release.yml` 的 preflight 非 0 即停）。
- P5 的 FAIL 是本探针的产物（副本里没带 changeset，plan 天然为空），**不作为本卡结论**；它只说明「空 plan 会硬失败」这条设计是生效的。
- **ui 留 private 不会污染发布计划**（源码级确认，不是靠文档）：`node_modules/.pnpm/@changesets+cli@3.0.3/.../getPublishPlan.mjs:606` 里 `packages.filter((pkg) => !pkg.packageJson.private && !shouldSkipPackage(pkg, options))` —— 私有包在取未发布列表时就被过滤掉；`@changesets/should-skip-package@1.0.0` 的 `shouldSkipPackage` 对 `private && !allowPrivatePackages` 直接 skip，而 `privatePackages.tag=false` 连 tag 都不打。所以「只发两包」在 changesets 侧本来就成立，**唯一卡住的是 preflight 的 P1**。
- 已开后续卡（见 §6）交 `blog-platform` 修闸门口径，**不在本卡改代码**。
- 另记两条不需要动手的既成事实：① `.changeset/config.json` 的 `fixed` 组包含 ui，且 `privatePackages.version=true` → ui 会跟着 lockstep 推进版本号但永不 publish（changesets 跳过 private），这是预期行为；② 因此 ui 将来首次发布时 registry 上会有「2.x 版本号跳空」的心理落差（仓库 2.1.0→2.3.0，registry 首次只有一个版本），发布卡里要写清楚，不是缺陷。

## 5. 什么条件下翻案（门槛写死）

出现**任一**条件才开 M4-7 发布卡（发布卡单独做 publish，不塞进本卡）：

1. 第二个独立 Astro 站点以包名安装（`npm i <tarball|registry>`）并构建通过 —— 需要 `package.json` 里出现真实依赖项 + 该站点产物里出现 Badge/Button 的 markup；
2. `apps/demo` 升级为「真装包」模式（`create-site.mjs --install` + overlay 里显式 `dependencies`），且装配后构建仍 PASS；
3. `~/Documents/WebSiteCode/dogeared` 类副本复活并改为包引用（而不是 vendored 复制）。

反例不算数：文档页演示、M4-x 的 fixture/探针、把 `packages/ui/src` 复制到别的目录。

## 6. 后续卡

| 卡 | 内容 | assignee |
| -- | ---- | -------- |
| `t_49fc208e`（M4-10） | `preflight --mode=publish` 的 P1 private 闸门按「发布清单」收敛：ui 留 private 时不得硬失败；同步 `verify-guards.mjs` G4 的负向断言；补一条「两包翻转 + ui private → P1 PASS / publish-plan 只含两包」的正向用例 | blog-platform |

## 7. 边界与未做

- **未 publish**：registry 全程只读（仅 `npm view` 探测，404）；未创建 dist-tag。
- **未改包代码**：`packages/**` 一个字节没动；`private:true` 保持。所有翻转实验都在 `/tmp/m4-8-preflight` 副本里做并已清理。
- **未 commit / 未 push**：仓库改动仅新增 `docs/_reviews/M4-8/`（`decision.md`、`evidence.json`、`census.py`、`probe-private-gate.sh`）。
- **未碰生产**、未碰 CI、未改 `site.manifest.json`。
- 未做：真实 registry 安装路径验证（不可能，包未发布）；跨机器/CI runner 上的复跑。

## 8. 复跑方式

```bash
cd /Users/chowcong/Documents/WebSiteCode/zcblog-v2
python3 docs/_reviews/M4-8/census.py        # 引用普查 → evidence.json
bash docs/_reviews/M4-8/probe-private-gate.sh   # 发布闸门副作用探针（只写 /tmp）
```
