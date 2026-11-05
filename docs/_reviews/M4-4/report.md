# M4-4 · Changesets + release workflow（dry-run）报告

- 卡片：`t_6f55211b`；基线 commit `52c12a3` 之后工作树状态（M4-3 的 `10cf92b` 已在 HEAD）
- 结论：**release 链搭成并全链本地实测通过；真发布被 preflight 故意拦住（三包仍 private + 两个 P1 包缺陷），未 publish、未改版本、未改 `packages/**`**
- changesets：`@changesets/cli 3.0.3`（v3，`pack` / `publish-plan` / `--from-pack-dir`）
- 新增 devDependencies：`@changesets/cli@3.0.3`、`yaml@2.9.1`（见 §8 偏差）

---

## 1. 验收对照

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| `.changeset/config.json` 与 release workflow 落盘 | ✅ | `.changeset/config.json`（fixed 组三包、`privatePackages.version=true/tag=false`）、`.github/workflows/release.yml`（15,004 B，preflight/dry-run/publish 三个 job） |
| `npx changeset status` 可运行 | ✅ | exit 0，输出 `Packages to be bumped:` + `RELEASE_SUMMARY`（`evidence/changeset-status.log`） |
| 版本 lockstep 脚本通过 | ✅ | `verify-versions.mjs` 9 PASS + 1 SKIP（无 tag）；带 `--tag v2.1.0` 时 10 PASS；锁步由 changeset loop 反证（ui 单包 patch → 三包一起到 2.1.1） |
| release workflow 的 publish 步骤有 dry-run/测试证据 | ✅ | `publish-dry-run.mjs` 9/9 PASS（三包 × in-dir/tarball 两种变体，`npm notice Publishing … (dry-run)`）；`verify-changeset-loop.mjs` 8/8 PASS；`verify-guards.mjs` 12/12（13 个负向用例） |
| 普通 push 不触发 publish | ✅ | 静态：`verify-workflow.mjs` W2/W3/W7d 断言 `on:` 只有 `push:tags:[v*]`（无 branches）+ `workflow_dispatch`，publish job `if: needs.preflight.outputs.dry_run == 'false'`；负向：给 `on.push` 加 `branches: [main]` 后 G5a 立刻红 |
| 文档含回滚与凭据要求 | ✅ | `docs/release.md`：§3 凭据（granular token / environment / id-token）、§6 回滚四层（72h unpublish 政策原文约束、deprecate、版本前进、dist-tag 回退、tag 重打）、§7 阻断项、§9 限制 |
| 不真 publish、不改生产 | ✅ | 全程 `--dry-run` / 临时 monorepo / 空 plan 短路；`npm whoami` 仍 `ENEEDAUTH`；未 commit、未 push、未改版本号、未改 `packages/**`、未碰站点 |

---

## 2. 落盘文件

| 文件 | 作用 |
| --- | --- |
| `.changeset/config.json` | `fixed` 组 = 三包 lockstep；`access: public`；`privatePackages: {version:true, tag:false}`；`format: prettier` |
| `.changeset/README.md` | 日常流程、private 语义、已知阻断项 |
| `.github/workflows/release.yml` | tag `v*` / dispatch（默认 dry-run）；preflight → dry-run 或 publish |
| `scripts/release/lib.mjs` | 共享：包加载、`runSync`、结果收集、`checkVersions`、`pnpmEnv`、`PUBLISH_COMMAND` |
| `scripts/release/verify-versions.mjs` | lockstep + tag 一致性 + fixed 组交叉验证 |
| `scripts/release/build-packages.mjs` | 包构建（有 build 脚本才跑）+ 声明入口存在性 |
| `scripts/release/preflight.mjs` | 发布前总闸（check / publish 两种模式） |
| `scripts/release/publish-dry-run.mjs` | 真打包 + `npm publish --dry-run`（不写 registry） |
| `scripts/release/verify-changeset-loop.mjs` | 临时 monorepo 跑完整 changeset 闭环 |
| `scripts/release/verify-workflow.mjs` | release.yml 契约（YAML 解析后断言） |
| `scripts/release/verify-guards.mjs` | 负向自检（13 个用例，拿改坏的副本喂进去） |
| `docs/release.md` | 发布手册 / 回滚 / 凭据 / 阻断项 |
| `package.json`（scripts） | 见 §3 |

`package.json` scripts 新增/改名：

```
"release": "changeset publish"                     ← 原 standard-version 的 release
"release:site": "standard-version"                 ← 站点版本（原语义保留，改名隔离）
"release:site:dry": "standard-version --dry-run"
"release:dry": "node scripts/release/publish-dry-run.mjs"
"changeset": "changeset"
"version-packages": "changeset version"
"verify:versions": "node scripts/release/verify-versions.mjs"
"preflight:release": "node scripts/release/preflight.mjs"
"release:selftest": "verify-workflow && verify-guards && verify-changeset-loop"
```

> 站点自版本仍是 standard-version（README §脚本表里 `pnpm release` 的旧说法已过时，属站点文档范围，本卡不改 README）。

---

## 3. 实测证据（本机，Node 26.0.0 / npm 11.12.1 / pnpm 12.10.1 via corepack）

| 命令 | 结果 | 关键数字 |
| --- | --- | --- |
| `node scripts/release/verify-workflow.mjs` | **24 PASS / 0 FAIL** | 触发面、闸门、命令字面量、continue-on-error 唯一性、无硬编码 token |
| `node scripts/release/verify-versions.mjs` | **9 PASS / 1 SKIP** | 三包 2.1.0 lockstep；fixed 组覆盖；站点版本同为 2.1.0 |
| `… --tag v2.1.0` | **10 PASS** | tag 与版本一致 |
| `… --tag v9.9.9`（负向） | exit 1 | `tag v9.9.9 与三包版本 2.1.0 不一致` |
| `node scripts/release/build-packages.mjs` | **3 PASS / 3 INFO** | 三包皆无 build 脚本（只发源码）；声明入口 5/4/2 个全部存在 |
| `node scripts/release/preflight.mjs`（check） | **24 PASS / 9 WARN / 6 INFO** | pack 清单 8/7/7 文件 |
| `… --mode=publish --tag v2.1.0` | **exit 1，7 FAIL** | private ×3、`exports` 无 `"."`（tokens）、TS-only 入口 ×2（ui/og-image）、publish-plan 为空 |
| `node scripts/release/publish-dry-run.mjs` | **9 PASS / 0 FAIL** | 见 §4 |
| `node scripts/release/verify-changeset-loop.mjs` | **8 PASS / 0 FAIL** | 2.1.0 → ui patch → **三包一起 2.1.1** + 3 份 CHANGELOG + 3 个 tarball + publish-plan 3 项 |
| `node scripts/release/verify-guards.mjs` | **12 PASS / 0 FAIL（13 用例）** | 每条闸门都被改坏的副本证伪一次 |
| `npx changeset status` | exit 0 | 当前无待发布 changeset（三包 private） |

### pack 清单（`npm pack --dry-run --json`）

| 包 | 文件数 | packed | unpacked | 内容 |
| --- | --- | --- | --- | --- |
| `@marxchou/dogeared-tokens` | 8 | 20,043 B | — | LICENSE/NOTICE/README/package.json/tokens.css/tokens.json/variables.css/scripts/build-tokens.mjs |
| `@marxchou/dogeared-ui` | 7 | 4,707 B | 10,059 B | + src/index.ts、src/Badge.astro、src/Button.astro |
| `@marxchou/dogeared-og-image` | 7 | 9,116 B | 25,675 B | + src/index.ts、src/route.ts、src/types.ts |

- 三包均 **无** node_modules/.env/测试/本机绝对路径（P3b/P3c PASS，文本级扫描 `/Users/…` 零命中）。
- LICENSE 1065 B / NOTICE 1788 B 三份齐全，无占位符。

---

## 4. publish 命令的 dry-run 证据（未写 registry）

`publish-dry-run.mjs` 对每个包先 `npm pack`（真 tarball），再跑**两种** `publish --dry-run` 变体：

| 包 | tarball | sha256（前 12） | in-dir | tarball 变体 |
| --- | --- | --- | --- | --- |
| tokens | marxchou-dogeared-tokens-2.1.0.tgz | `c22ae32f2b8c` | exit 0 | exit 0 |
| ui | marxchou-dogeared-ui-2.1.0.tgz | `1af00e9c1869` | exit 0 | exit 0 |
| og-image | marxchou-dogeared-og-image-2.1.0.tgz | `e041788e2663` | exit 0 | exit 0 |

两种变体都打印：

```
npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)
+ @marxchou/dogeared-tokens@2.1.0
```

**重要发现（沿用并确认 M4-3 的提醒）**：`npm publish --dry-run` 在 `private: true` 的包上 **exit 0 且不报 EPRIVATE**
（npm 11.12.1 实测，两种变体都是）。所以 dry-run 不能承担「private 挡误发」的职责——这条只能靠
`preflight.mjs --mode=publish` 的显式检查（P1）与 publish-plan 空转闸门（P5）。两者都已用负向用例证明会红（G4a/G4b）。

### `changeset publish --from-pack-dir` 的命令路径验证

pack dir 契约（读 `@changesets/cli@3.0.3` 源码 + 实跑）：`changeset pack --out-dir <dir>` 产出
`<dir>/packages/*.tgz` + `<dir>/publish-plan.json`（含每个 tarball 的 `sha256-…` integrity）；
`changeset publish --from-pack-dir <dir>` 只读 `<dir>/publish-plan.json`，artifact 模式下不接受 `--tag`。

实跑（空 plan 短路，不触 registry）：

```
$ changeset publish --from-pack-dir <emptypack> --no-git-tag
🦋 changeset v3.0.3
No unpublished projects to publish.      # exit 0
```

- 证明 `--from-pack-dir` + `--no-git-tag` 参数被正确解析、plan 从目录读取、无待发布项时不发任何请求。
- 缺 `publish-plan.json` 时会明确报 `ENOENT … open '<dir>/publish-plan.json'`（不是静默成功）——所以 workflow 里
  publish job 用「找 publish-plan.json」定位 pack dir（artifact 落盘层级不硬编码），找不到直接 `::error::` 退出。

---

## 5. workflow 契约（静态断言 24 项 + 负向 13 用例）

`verify-workflow.mjs` 用 YAML 解析（`yaml@2.9.1`）后断言，不是正则猜：

| 组 | 断言 |
| --- | --- |
| W2/W3 | `on:` 只有 `push` + `workflow_dispatch`；`push` 只有 `tags: [v*]`，**无 `branches`** |
| W4 | dispatch 的 `dry_run` 默认 true；`confirm_publish` / `provenance` 输入存在 |
| W6 | publish `needs: preflight`、`if: dry_run == 'false'`、`environment: npm-publish`、`id-token: write`；workflow 级 `contents: read` |
| W7 | publish 里 **2 处** `changeset publish --from-pack-dir`（provenance + 降级），与 `lib.mjs` 的 `PUBLISH_COMMAND` 同一字面量；dry-run job 里**没有任何** `changeset publish` |
| W8 | `continue-on-error` **只**出现在 provenance 步骤；provenance 失败有 `::warning::` + step summary + 显式降级重发步骤 |
| W9 | 凭据闸门（缺 `NPM_TOKEN` 直接 `exit 1`）；全文无 token 字面量 |
| W10 | preflight job 顺序：`--frozen-lockfile` → `verify-workflow` → `build-packages` → `gates:all` → `verify-versions` → `preflight` → `changeset pack` |

负向用例（`verify-guards.mjs`，改坏副本 → 必须 exit≠0）：

| 用例 | 变异 | 结果 |
| --- | --- | --- |
| G1 | tag v9.9.9 | exit 1 ✅ |
| G2 | 只有 ui 到 2.1.1 | exit 1 ✅（lockstep 破） |
| G3 | fixed 组清空 | exit 1 ✅ |
| G4a | publish 模式 + private | exit 1 ✅ |
| G4b | publish 模式 + 空 publish-plan | exit 1 ✅ |
| G4c | 同一判据 check 模式 | exit 0 ✅（不挡 PR） |
| G5a | `on.push` 加 `branches: [main]` | exit 1 ✅ |
| G5b | 发布命令换成 `npm publish` | exit 1 ✅ |
| G5c | 非 provenance 步骤加 `continue-on-error` | exit 1 ✅ |
| G5d | 去掉 `confirm_publish=PUBLISH` 判断 | exit 1 ✅ |
| G5e | workflow 里内联 token | exit 1 ✅ |
| G6 | dry-run 脚本里 publish 调用缺 `--dry-run` | 2/2 都带 ✅ |

> G5d 第一次跑是**假绿**（旧的 W6c 在 echo 文案里也能匹配到 `INPUT_CONFIRM`），已把判据收紧为「只看 `if/elif` 条件行」，重跑才真红——这条修正本身留在 `verify-workflow.mjs` 注释里。

---

## 6. 发布闸门实际拦住了什么（今天真发会怎样）

`preflight.mjs --mode=publish` 在三包现状下 **exit 1，7 FAIL**：

1. `P1` ×3：三包 `private: true`——`changeset publish` 会**静默空转**（实测 `changeset pack` 输出 `No packages to pack`、`publish-plan` 为 `{"version":1,"plan":[]}`、`publish-plan` 命令打印 `No projects to publish or tag`）。**这正是本卡要拦的场景**：dry-run/日志全是 exit 0，但什么都没发。
2. `P4a` tokens：`exports` 无 `"."`（M4-2 F1）→ 裸 import `ERR_PACKAGE_PATH_NOT_EXPORTED`。
3. `P4b` ×2：ui / og-image `exports["."] → ./src/index.ts` 且无 build 脚本（M4-3 F1）→ 裸 Node `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`。
4. `P5`：publish-plan 为空 → 这次发布不会有包进 registry。

修这些要改 `packages/**`（不在本卡边界）→ 已开 **M4-6 `t_20a7ac2a`**（blog-platform）。

WARN 级（不拦，但发布前应清零）：`engines ^22||^24` 在 Node 26 刷 EBADENGINE（tokens/ui/og-image 三处）、
`main`/`module` 指 `.ts`（M4-3 F3）、tokens 随包 bin 依赖仓内 `docs/DESIGN.md`（M4-2 F2）、peer astro 未标 optional（M4-3 F5）。

---

## 7. provenance 的真实前置（需要决策）

npm provenance 的前置（docs.npmjs.com/generating-provenance-statements）：包必须由**受支持的云 CI**（GitHub Actions / GitLab）
在**public 仓库**构建，且 `package.json` 的 `repository` 与之一致。

实测本仓可见性：`gh repo view Smart-Chou/zcblog-v2 --json visibility,isPrivate` → `{"isPrivate":true,"visibility":"PRIVATE"}`。

**结论：仓库还是 private，第一次真发布时 provenance 一定失败** → 会走 workflow 里那条「显式记录 + 降级重发」路径
（`::warning::` + step summary + 同命令关掉 provenance 重发）。两个选项（发布卡决策）：把仓库转 public，或 dispatch 时
显式 `provenance=false` 并留下记录。这条已写进 `docs/release.md §5`。

---

## 8. 偏差与边界

**边界内**：`.changeset/**`、`.github/workflows/release.yml`、`scripts/release/**`、`docs/release.md`、根 `package.json` scripts。
**边界外但必需（2 项 devDependencies）**：`@changesets/cli@3.0.3`、`yaml@2.9.1` —— 没有前者就没有 `changeset` 命令（CI `--frozen-lockfile` 也需要它在 lockfile 里）；
后者用于把 release.yml 当 YAML 解析后断言（替代正则猜结构）。两者只进根 `package.json` + `pnpm-lock.yaml`，不碰包与站点。
`standard-version` 的 `release` 脚本改名为 `release:site` 属同名冲突消解，站点发布语义未变。

**未改**：`packages/**`（一字节未动）、版本号（仍 2.1.0）、`private` 字段、站点代码、README、`site.manifest.json`。
**未做**：没 commit / 没 push / 没 publish（用户对 zcblog 仓库的 git 边界：只允许 Obsidian 仓库做 git 操作）。

---

## 9. 门禁现状：一个**既有红灯**，不是本卡引入的

`pnpm gates:all` 目前红在 `verify-overlay.mjs`：

```
O1  tracked 文件全覆盖（unclassified=0）  FAIL  1 项
    - 未分类：NOTICE
RESULT FAIL  classified=1045 unclassified=1 violations=1
```

- `NOTICE` 由 M4-1 的 `d2abf72` 加进仓库根（`git ls-files` 可见），`site.manifest.json` 的 T 规则逐条列了 `LICENSE` 却漏了 `NOTICE`。
- 与 M4-4 无关（本卡没碰 manifest；本卡新文件当时还是 untracked，门禁读 `git ls-files` 看不到），但 **release workflow 第一步门禁就是 `gates:all`**，
  所以这条不修，发布链在 CI 上会红在门禁而不是发布逻辑。
- 另外 manifest 的 T 规则是逐文件列举（没有 `docs/**` / `.github/workflows/**` / `.changeset/**` 通配），
  本卡新增的 `.changeset/config.json`、`.changeset/README.md`、`docs/release.md`、`.github/workflows/release.yml` **提交后同样会变成 unclassified**。
- 已开 **M4-7 `t_36fea29e`**（blog-platform）补齐分类，验收要求 `gates:all` exit 0。

其余 8 个门禁实测全绿：`verify-atoms`、`verify-atom-docs`、`verify-component-inventory`、`verify-doc-drift`、
`check-tokens`（10/10 PASS）、`verify-surface-tokens`、`verify-entities`、`verify-package-boundary`（packages=3 violations=0）均 exit 0。

---

## 10. 限制（未验证到的部分）

1. **没有 `act`**（本机未安装），workflow 没有在本地跑过真实 runner；验证方式是「解析 YAML 断言契约 + 本地跑同一条命令」，
   两者由 `PUBLISH_COMMAND` 单一字面量绑在一起。
2. **真 publish 路径未执行**：registry 写入、provenance 成功路径、environment 审批、artifact 上传/下载层级，
   都要等第一次真 CI 运行才第一次生效（artifact 布局已用「找 publish-plan.json」做了防御）。
3. `changeset publish` 是**逐包**发布，不原子：第三包失败时前两包已在 registry（`docs/release.md §9` 已写处置方式）。
4. `publish-plan` 会联网查 registry 判断「是否已发布」，离线环境会退化（本机 curl GitHub API 也 404，说明该链路受网络策略影响）。
