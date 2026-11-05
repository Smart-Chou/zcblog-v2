# 发布手册（@marxchou/dogeared-*）

三个包 —— `@marxchou/dogeared-tokens`、`@marxchou/dogeared-ui`、`@marxchou/dogeared-og-image` ——
用 Changesets 做 **2.x lockstep**（任何一个包 bump，三个一起 bump 到同一版本），
发布由 `.github/workflows/release.yml` 执行：**tag 推送或手动 dispatch 才会进发布链，普通 push 永远不进。**

> 当前状态（M4-10 收口）：**发布范围收窄为 `tokens` + `og-image`**（M4-8 决策 D-0120），
> 两包仍是 `"private": true`，真发布前需要在**发布清单内的包**上翻掉 private；
> `packages/ui` 按 D-0120 保持 `private: true`（继续参与 lockstep 版本推进，但永不 publish）。
> preflight 的 P1 只对**发布清单内**的包判 private，清单外的包 private 只报 INFO —— 不会再卡住两包首发。
> 本手册描述的是「翻掉 private 之后该怎么发」，也是发布卡验收时要照做的清单。

---

## 1. 组件与职责

| 组件                             | 作用                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `.changeset/config.json`         | `fixed` 组锁定三包；`privatePackages.version=true` 让 private 包也参与 version      |
| `pnpm changeset`                 | 写一条 changeset（语义 + 影响包）                                                 |
| `pnpm version-packages`          | `changeset version`：写 package.json 版本 + CHANGELOG.md                          |
| `pnpm release:packages`          | `changeset publish`（本地真发用，需 npm 登录态；CI 里用 `--from-pack-dir` 变体）    |
| `pnpm release:packages:dry`               | `node scripts/release/publish-dry-run.mjs`：真打包 + `npm publish --dry-run`，不写 registry |
| `scripts/release/verify-versions.mjs` | 版本 lockstep、fixed 组覆盖、tag 与版本一致                                  |
| `scripts/release/build-packages.mjs`  | 包构建（有 build 脚本就跑）+ 声明入口在磁盘上是否存在                        |
| `scripts/release/preflight.mjs`       | 发布前总闸：版本 / private（按发布清单）/ pack 清单 / LICENSE-NOTICE / 已知阻断项 / publish-plan 空转 |
| `scripts/release/verify-workflow.mjs` | release.yml 契约（触发面、闸门、命令字面量一致性）——CI 第一步就跑            |
| `scripts/release/verify-guards.mjs`   | 负向自检：拿改坏的副本证明每个闸门真的会红                                    |
| `scripts/release/verify-changeset-loop.mjs` | 临时 monorepo 里跑完整 changeset 闭环（add → version → pack → publish-plan） |
| `.github/workflows/release.yml`  | 发布流水线（preflight / dry-run / publish 三个 job）                              |

站点版本（根 `package.json`）与三个 npm 包的版本是**两条线**：站点自版本沿用
`standard-version`（`pnpm release` / `pnpm release:dry`）。`v*` tag 的语义是「三包发布」，
所以三包与站点版本不一致时 `verify-versions` 只报 WARN（见 `V5`）。

---

## 2. 触发与模式矩阵

| 事件                                  | 会跑什么                                            | 会不会写 registry |
| ------------------------------------- | --------------------------------------------------- | ----------------- |
| push 到任意分支（含 `main`）           | **什么都不跑**（workflow 没有 branches 触发器）      | 不会              |
| push tag `v*`                         | preflight → publish（tag 必须与三包版本一致）        | 会（受闸门约束）  |
| `workflow_dispatch` 默认              | preflight → dry-run                                  | 不会              |
| `workflow_dispatch` + `dry_run=false` + `confirm_publish=PUBLISH` | preflight → publish | 会（受闸门约束）  |

真发布要同时满足：

1. `preflight` 通过（版本 lockstep、tag 一致、**发布清单内的包** `private !== true`、pack 清单完整、无 P1 阻断项、publish-plan 非空）；
2. `publish` job 的 `if` 命中（`needs.preflight.outputs.dry_run == 'false'`）；
3. `npm-publish` environment 的人工批准（仓库设置里给该 environment 配 required reviewers 才生效）；
4. `secrets.NPM_TOKEN` 存在（缺了会在「Credential gate」步骤直接失败）。

---

## 3. 凭据要求

| 凭据 / 设置 | 用途 | 要求 |
| ----------- | ---- | ---- |
| `secrets.NPM_TOKEN` | `npm publish` 鉴权 | npm **granular access token**，只对 `@marxchou/dogeared-tokens`、`-ui`、`-og-image` 三个包有 Read and write，建议开启 2FA bypass 或按需轮换 |
| `npm-publish` environment | 人工闸门 + 只允许 tag 部署 | 仓库 Settings → Environments：required reviewers + deployment branches 只放 tag |
| `permissions: id-token: write` | npm provenance（OIDC） | 已在 workflow 的 publish job 里声明 |
| GitHub App / OIDC | provenance 签名 | 需要 **public 仓库**（见 §5） |

硬规矩：

- token 只以 `${{ secrets.NPM_TOKEN }}` 形式进入步骤，**不进仓库、不进日志、不写进 npmrc 文件留存**（CI 里写到 `$RUNNER_TEMP/.npmrc`，随 runner 销毁）。
- 本地跑 `pnpm release:packages:dry` **不需要任何 npm 凭据**：`npm publish --dry-run` 不鉴权、不联网写。
- 不要把 token 贴进 issue / 聊天 / changeset 描述。

---

## 4. 一次发布的完整步骤

```bash
# 0) 前置：**发布清单内的包** private 已翻成 false（发布卡负责；本链路不自动翻）
#    发布清单 = scripts/release/lib.mjs 的 PUBLISH_DIRS（M4 阶段 = packages/tokens + packages/og-image）
#    packages/ui 按 D-0120 保持 private，不参与发布
#    检查当前状态：node scripts/release/preflight.mjs（P1 逐包报 private/可发布；清单外的包报 INFO）
pnpm preflight:release          # check 模式：先看还有哪些 WARN/阻断

# 1) 写 changeset（lockstep 组只需提一个包）
pnpm changeset
# 非交互：pnpm changeset --patch @marxchou/dogeared-tokens -m "fix: xxx"

# 2) 发布前检查（真空跑，不写 registry）
pnpm verify:versions
pnpm preflight:release
pnpm release:packages:dry       # 三个 tarball + npm publish --dry-run 证据

# 3) 版本推进 → 提交 → 打 tag
pnpm version-packages           # 三包一起到 2.1.1，各包生成 CHANGELOG.md
git add -A && git commit -m "chore(release): v2.1.1"
git tag v2.1.1
git push origin main --tags     # ← 这一步触发 release workflow 的真发布路径
```

CI 侧（`release.yml`）：

1. `preflight` job：`pnpm install --frozen-lockfile` → `verify-workflow.mjs` → `build-packages.mjs` →
   `pnpm gates:all` → `verify-versions.mjs --tag "$RELEASE_TAG"` → `preflight.mjs` → 判定发布模式 →
   `changeset pack --out-dir "$PACK_DIR"` → 上传 `changeset-pack` artifact（tarball + publish-plan.json）。
2. `publish` job（仅在真发布模式）：下载 artifact → 定位 pack dir → 凭据闸门 →
   `preflight.mjs --mode=publish`（硬闸）→ 带 provenance 发布 → 失败则显式记录 + 降级重发。

### 4.1 为什么是 `changeset publish`，不是 `npm publish --workspaces`

根 `package.json` **没有 `workspaces` 字段**（workspace 定义在 `pnpm-workspace.yaml`），
所以 `npm publish --workspaces` / `npm pack --workspace` 在这个仓库里不可用（M4-3 已实测）。
发布命令固定为：

```bash
changeset publish --from-pack-dir "$PACK_DIR" --no-git-tag
```

- `--from-pack-dir`：发布「preflight 阶段打过包的那批 tarball」，而不是重新在现场打包——
  发出去的文件 = 检查过的文件（publish-plan.json 里带每个 tarball 的 sha256 integrity）。
- `--no-git-tag`：CI 不创建 git tag；tag 由维护者本地 `git tag` 打，避免和触发用的 tag 冲突。
- artifact 模式下 changesets 不接受 `--tag`（dist-tag 由 config 的 `access` 与版本决定）。

发布命令的字面量由 `scripts/release/lib.mjs` 的 `PUBLISH_COMMAND` 单一来源提供，
`verify-workflow.mjs` 会断言 release.yml 里出现同一字面量——**本地 dry-run 验过的命令就是 CI 跑的**。

---

## 5. provenance（可选，失败不静默）

workflow 默认尝试带 attestation 发布（`inputs.provenance` 默认 `true`）：

- 成功：step summary 记 `provenance：成功`。
- 失败：该步骤 `continue-on-error`，下一条「Record provenance outcome」步骤打 `::warning::` +
  写进 step summary，然后「Publish without provenance (fallback)」用同一命令、同一 pack dir
  关掉 provenance 重发（`changeset publish` 幂等：已发布版本会被跳过）。
- 被显式关闭（`inputs.provenance=false`）：也会写一条 summary 记录，不算静默跳过。

**当前阻断事实**：npm provenance 要求包从 **public 仓库**构建（docs.npmjs.com/generating-provenance-statements
的 prerequisites：`package.json` 的 `repository` 要指向一个 public 仓库且大小写一致）。
本仓 `Smart-Chou/zcblog-v2` 目前是 **private**，因此第一次真发布会走「provenance 失败 → 显式降级」这条路径。
两个选择：发布前把仓库转 public，或在 dispatch 时显式 `provenance=false` 并接受 summary 里的记录。

---

## 6. 回滚

registry 是**不可变**的：已发布的 `name@version` 永远不能复用内容，即使 unpublish 了也不能用同一版本号
重新发（npm Unpublish Policy）。所以回滚分四层，按「先止血、再前进」的顺序用：

### 6.1 首 72 小时：unpublish（能删就删）

适用：刚发出去就发现有严重问题，且**还没有别的包依赖它**。

```bash
npm unpublish @marxchou/dogeared-og-image@2.1.1
# 整包（所有版本都可删时）：
npm unpublish @marxchou/dogeared-og-image --force
```

约束（npm 政策原文）：

- 新包在发布后 **72 小时内**、且 registry 上没有其他包依赖它时可 unpublish；
- 超过 72 小时也可以 unpublish，但必须同时满足：无依赖者、最近一周下载 < 300、只有一个 maintainer；
- unpublish **不可撤销**；整包删干净后 **24 小时内**不能再发同名包；
- 版本号永久作废：修好之后必须发**新版本号**（例如 2.1.2），不能重发 2.1.1。

lockstep 提醒：三包同版本，回滚要**三个一起处理**，否则会出现 2.1.1 只有两包存在的错位。

### 6.2 超过 72 小时 / 有依赖者：deprecate（推荐）

```bash
npm deprecate @marxchou/dogeared-og-image@2.1.1 "2.1.1 有已知问题（见 <issue>），请升级到 2.1.2"
npm deprecate @marxchou/dogeared-og-image "本包已迁移到 @marxchou/xxx"   # 整包
```

效果：包仍可安装，但安装时会打印你写的警告；整包 deprecate 会从搜索结果里去掉。

### 6.3 版本前进（最终修复路径）

问题能修就**发新版本**，这是唯一能改内容的方式：

```bash
pnpm changeset --patch @marxchou/dogeared-tokens -m "fix: 回滚 2.1.1 的回归"
pnpm version-packages     # 三包一起到 2.1.2
git tag v2.1.2 && git push origin main --tags
```

### 6.4 dist-tag 回退（让 `latest` 指回旧版本）

```bash
npm dist-tag add @marxchou/dogeared-tokens@2.1.0 latest
npm dist-tag ls @marxchou/dogeared-tokens
```

用途：新版本还没被广泛使用、想让 `npm i` 默认装回上一个稳定版。注意 `latest` 只是指针，
旧版本内容不会被改写；同时记得 deprecate 问题版本，否则用户仍可能锁到它。

### 6.5 发布链自身的回滚

- CI 侧改动（release.yml / scripts/release/**）回滚 = `git revert <commit>`，不影响已发布的 npm 内容。
- 如果 tag 打错了（tag 与版本不一致）：删 tag 重打，不要改版本号迁就 tag。
  `git tag -d v2.1.1 && git push origin :refs/tags/v2.1.1`（已发布版本除外——那种情况只能前进版本）。

---

## 7. 发布前阻断项（当前会让 `--mode=publish` 硬失败）

| 项 | 来源 | 现状 | 修法 |
| -- | ---- | ---- | ---- |
| `og-image` / `ui` 只发 TS 源码（`exports["."] → ./src/index.ts`，无 build 脚本） | M4-3 F1（P1） | 阻断 | 加 build 产出 `dist/*.js` + `d.ts`，exports 指 dist；或 README 明示「仅 bundler」 |
| `tokens` 的 `exports` 没有 `"."` | M4-2 F1 | 阻断 | 补最小 CSS/JSON 入口，或明确只支持子路径 |
| 发布清单内的包 `"private": true` | M4-1 / M4-10 | 阻断 | 发布卡翻转（M4 阶段 = tokens + og-image；ui 按 D-0120 保持 private，只报 INFO） |
| `publish-plan` 为空（等于这次发布什么都不发） | M4-4 | 闸门 | 见上两条：private 或没有待发布 changeset 都会导致空 plan |
| `engines` 为 `^22 \|\| ^24`，Node 26 报 EBADENGINE | M4-3 F2 / M4-2 F4 | WARN | 放宽为 `>=22` |
| `main`/`module` 指向 `.ts`；README `@<npm-scope>` 占位 | M4-3 F3/F4 | WARN | build 方案一起改；发布后回填 scope |

前两条与 private 的修复在包卡（M4-6），本链路只负责**发现并拦住**，不改 `packages/**`。

---

## 8. 本地复现（CI 跑的命令，本地一条不差）

```bash
pnpm install --frozen-lockfile
node scripts/release/verify-workflow.mjs      # release.yml 契约
node scripts/release/build-packages.mjs       # 包构建 + 入口存在性
pnpm gates:all                                # 契约门禁
node scripts/release/verify-versions.mjs      # 版本 lockstep
node scripts/release/preflight.mjs            # 发布前检查（check 模式）
node scripts/release/publish-dry-run.mjs      # ⚠ 只 dry-run，不写 registry
node scripts/release/verify-changeset-loop.mjs # 临时 monorepo 跑 changeset 闭环
node scripts/release/verify-guards.mjs        # 负向自检：闸门真的会红
```

每个脚本都以 `RELEASE_SUMMARY {...}` 一行 JSON 结尾（便于 CI grep 与归档）。

### 发布清单（PUBLISH_DIRS）

「谁必须非 private 才能发」与「谁是三包 lockstep 的一员」是两件事，分别由两个常量定义（都在
`scripts/release/lib.mjs`，**不要合并**）：

| 常量 | 当前值 | 用途 |
| ---- | ------ | ---- |
| `PACKAGE_DIRS` | tokens / ui / og-image | lockstep 版本、构建、pack 清单、LICENSE-NOTICE、P 系列检查的口径（三包全查） |
| `PUBLISH_DIRS` | tokens / og-image | 本次/本阶段真要进 registry 的包：只有清单内的包才必须 `private: false` |

P1 的四种组合：清单内 + private → **FAIL**（publish 模式）/ INFO（check 模式）；清单内 + 非 private → PASS；
清单外 + private → **INFO**（按 D-0120 本阶段不发布，允许 private）；清单外 + 非 private → **WARN**（疑似误翻转）。
要改发布范围只改 `PUBLISH_DIRS` 一处，`verify-guards.mjs` 的 G4d–G4f 会跟着新清单重算期望值。

---

## 9. 已知限制

- **没有跑过真发布**：本链路只做 dry-run；`changeset publish` 的 registry 写入、provenance 成功路径、
  environment 审批都只在真实 CI 上才第一次生效（`act` 未安装，本机也无 npm 登录态）。
- `npm publish --dry-run` 不会因为 `private: true` 报 `EPRIVATE`（npm 11.12.1 实测 exit 0），
  所以「private 挡误发」这件事**只能靠 preflight 显式检查**，不能靠 dry-run。
- pack dir 通过 artifact 传递；artifact 对单个目录的落盘层级依赖 upload/download-artifact 行为，
  因此 publish job 用「找 `publish-plan.json`」定位目录而不是硬编码路径。
- `verify-changeset-loop.mjs` 的 **L6（`changeset pack` 产出 3 个 tarball）当前是红的**（M4-6 给包加了
  `prepack: node scripts/build.mjs`，而该脚本的临时 monorepo 不带 `node_modules` → `ELIFECYCLE`）。
  这条不在 CI 的 release workflow 里（CI 有依赖，pack 正常），也不影响 preflight；待单独修。
- `changeset publish` 是**逐包**发布：如果第三包失败，前两包已经在 registry 上了。
  lockstep 能保证版本一致，但不能保证原子性——失败后照 §6 处置。
