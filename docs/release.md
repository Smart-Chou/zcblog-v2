# 发布手册（@marxchou/dogeared-*）

三个包 —— `@marxchou/dogeared-tokens`、`@marxchou/dogeared-ui`、`@marxchou/dogeared-og-image` ——
用 Changesets 做 **2.x lockstep**（任何一个包 bump，三个一起 bump 到同一版本），
发布由 `.github/workflows/release.yml` 执行：**tag 推送或手动 dispatch 才会进发布链，普通 push 永远不进。**

> 当前状态（2026-11-07）：
>
> | 包 | 版本 | registry | private |
> | --- | --- | --- | --- |
> | `@marxchou/dogeared-tokens` | `2.1.2` | 已发布（`latest`，SLSA provenance） | `false` |
> | `@marxchou/dogeared-og-image` | `2.1.2` | 已发布（`latest`，SLSA provenance） | `false` |
> | `@marxchou/dogeared-ui` | `2.1.2` | 已发布（`latest`，token 首发，无 provenance） | `false`（M5-8 / D-0139 翻的） |
>
> `packages/ui` 已按 D-0139 从 `private: true` 翻成可发布（`publishConfig.access=public`），
> 首发范围仍只有 Badge / Button。2026-11-07 已按 PO 选择的路径 B 用账号 token 发出 `2.1.2`
> （无 provenance）；Trusted Publisher 尚未登记，`0.0.0-stage` 占位待清。**在 trust 登记完成前不要推
> `v2.1.2` tag**。细节见 `docs/_reviews/M5-8/report.md` §11。
>
> ⚠️ **2026-11-07 事故**：agent 误把 npm 恢复码当 OTP 使用，账号被判 recovery-code login，
> **2026-11-10 12:18 CST 前只读**：不能 publish / trust / unpublish / 改包设置。窗口内只做只读复查；
> 恢复后由 PO 本人在 npm UI 完成 ui 的 Trusted Publisher，再清 `0.0.0-stage`。见报告 §12。
>
> 仓库已于 2026-11-06 转为 **public**；标准 GitHub-hosted runner 不再消耗 Free 计划分钟数。
> 发布认证已切到 **npm Trusted Publishing（GitHub OIDC）**：publish job 不注入 `NPM_TOKEN`，
> 两个已存在包已在 npm package settings 登记 Trusted Publisher；`provenance` 默认开启。
> 新登记的 Trusted Publisher 必须在 48 小时内完成一次成功发布才算生效（见 §3.1）。

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
3. `npm-publish` environment 的人工批准（required reviewer `Smart-Chou`）；
4. OIDC gate 通过（`id-token: write` 生效 → `ACTIONS_ID_TOKEN_REQUEST_URL`+`..._TOKEN` 都在；
   两个包的 Trusted Publisher 已登记且未过期；publish 环境里没有任何长期 token）。

---

## 3. 凭据要求

| 凭据 / 设置 | 用途 | 要求 |
| ----------- | ---- | ---- |
| npm **Trusted Publisher** | OIDC 发布鉴权 | 两个包分别登记：GitHub / `Smart-Chou` / `zcblog-v2` / `release.yml` / `npm-publish`，并**勾上 Allow `npm publish`**；每包最多 10 个 trust 配置；新建配置必须在 48 小时内完成一次成功发布（见 §3.1） |
| `npm-publish` environment | 人工闸门 + 只允许 tag/审批部署 | 仓库 Settings → Environments：required reviewer `Smart-Chou`（`prevent_self_review=false`，`can_admins_bypass=false`）；**名字必须与 npm 侧填的 environment 完全一致** |
| `permissions: id-token: write` | GitHub OIDC token | 已在 workflow 的 publish job 里声明；OIDC gate 缺它直接失败 |
| npm CLI `>= 11.5.1` | Trusted Publishing 的硬下限 | publish job 的「Ensure npm CLI supports Trusted Publishing」会检查并用 `npm install -g npm@^11.5.1` 补足 |
| `secrets.NPM_TOKEN` | **已不再注入发布步骤，且 workflow 不引用** | 2026-11-06 实测：`grep -n "secrets\." .github/workflows/release.yml` **0 条**；值仍留在 `npm-publish` environment secret（granular、仅两包 read-write、2027-02-04 到期），只作为 §6.6 紧急回滚的备用凭据。**退役计划：2026-12-06 复审后删除**（M5-5 结论，操作单见 §12.5） |
| public 仓库 | provenance / OIDC | `Smart-Chou/zcblog-v2` 已 public（2026-11-06） |

本地凭据状态（2026-11-06 实测）：

- `npm whoami` = **mifsh**；账号 2FA 模式 `auth-and-writes`。
- `@marxchou` npm org 已创建（**Unlimited public packages** 免费计划）；`npm org ls marxchou`
  → `{"mifsh":"owner"}`。
- 本地 CLI token 只存在 `~/.npmrc`，**不进仓库、不写进文档**；它只用于本机命令，不参与 CI。
- GitHub `npm-publish` environment 已于 2026-11-06 创建并补 required reviewer
  `Smart-Chou`（`prevent_self_review=false`、`can_admins_bypass=false`）；真发布仍要
  `dry_run=false` + `confirm_publish=PUBLISH` 并等待该环境批准。
- 2026-11-06 已完成 public 仓库切换；下一次真发布默认 `provenance=true`。Trusted Publisher
  配置完成前，OIDC gate 会先失败，**不会回退到 NPM_TOKEN**。

硬规矩：

- **不要**把 `NPM_TOKEN` / `NODE_AUTH_TOKEN` 注入 publish 步骤；OIDC gate 会拒绝。
- token 只以 `${{ secrets.NPM_TOKEN }}` 形式存在时也不得被 workflow 读取；本地 token 不进仓库、日志或 npmrc 文件。
- 本地跑 `pnpm release:packages:dry` **不需要任何 npm 凭据**：`npm publish --dry-run` 不鉴权、不联网写。
- 不要把 token 贴进 issue / 聊天 / changeset 描述。

### 3.1 登记 Trusted Publisher 的操作单（发布当日做，需 2FA 在场）

npm 侧的登记**必须在同一次发布窗口内完成**，原因是一条硬规则：

> **新建的 trusted publisher 配置如果在 48 小时内没有完成一次成功发布，就会过期，而且过期后
> 不能编辑，只能删掉重建**（GitHub Changelog 2026-10-02 / docs.npmjs.com/trusted-publishers
> “Trusted publisher configuration expiry”）。首次成功发布会把配置绑定到仓库的不可变身份，
> 之后才豁免过期。

提前一天配好放着 = 第二天拿到一条过期、发不出去的配置。所以流程是：**先配，紧接着发**。

1. 打开包设置页（每个包各做一次）：
   - `https://www.npmjs.com/package/@marxchou/dogeared-tokens/access`
   - `https://www.npmjs.com/package/@marxchou/dogeared-og-image/access`
   （也可从 Packages → 包 → Settings → **Trusted publishing** 进入。）
2. 选 **GitHub Actions**，四个字段必须与仓库现状逐字一致：

   | 字段 | 值 |
   | ---- | -- |
   | Organization or user | `Smart-Chou` |
   | Repository | `zcblog-v2` |
   | Workflow filename | `release.yml`（只写文件名，必须带 `.yml`） |
   | Environment name | `npm-publish`（与 workflow 里的 environment 完全相同；填错 = OIDC 认不中） |

3. **Allowed actions 必须勾上 `Allow npm publish`**。2026-09-03 起新建配置默认只允许
   `npm stage publish`（走人工审批的 staged 流程）；我们的 `changeset publish` 走的是直接
   `npm publish`，不勾这一项会在发布时被拒（`npm dist-tag` 是另一个独立开关，本项目不用）。
4. 命令行等价物（需要账号 2FA 在场，实测会停在 WebAuthn，见下方「本机实测」）：

   ```bash
   # npm 11.12 的 npm trust 会 400；必须 11.15+ 且显式 --allow-publish（等价于网页上的 Allow npm publish）
   npx --yes npm@11.15.0 trust github @marxchou/dogeared-tokens \
     --file release.yml --repo Smart-Chou/zcblog-v2 --env npm-publish --allow-publish -y
   npx --yes npm@11.15.0 trust github @marxchou/dogeared-og-image \
     --file release.yml --repo Smart-Chou/zcblog-v2 --env npm-publish --allow-publish -y
   npx --yes npm@11.15.0 trust list @marxchou/dogeared-tokens   # 核对登记结果
   ```

   `--dry-run` 只打印将要提交的配置（`permissions: publish`），不写 registry、不要求 2FA，
   适合先确认四个字段没填错：

   ```bash
   npx --yes npm@11.15.0 trust github @marxchou/dogeared-tokens \
     --file release.yml --repo Smart-Chou/zcblog-v2 --env npm-publish --allow-publish --dry-run
   ```

   **本机实测（2026-11-06）**：`--dry-run` 通过并显示 `permissions: publish`；去掉 `--dry-run`
   后仍然 `EOTP` —— 本账号 2FA 是 **WebAuthn**，CLI 会把浏览器重定向到 `/escalate/webauthn`，
   必须由**用户本人在本机浏览器**完成安全密钥/指纹确认；自动化浏览器过不了 Cloudflare 与
   WebAuthn 手势，所以这一步只能人工做（或走同一浏览器的 npm 网页设置页）。
   这也意味着「登记 + 首发」必须由同一个人在同一个窗口内完成。

5. 立刻发同一个版本（见 §4），48 小时窗口以此关闭。发布后验证：

   ```bash
   npm view @marxchou/dogeared-tokens@<ver> version     # 上架
   npm view @marxchou/dogeared-tokens@<ver> dist.integrity
   # 消费者侧：npm audit signatures 应显示 "has a verified attestation"
   ```

   包页面出现 **Provenance** 徽章即表示 OIDC 发布 + attestation 同时成立（public 仓库 + public 包
   是自动生成 provenance 的前提，本仓两条都满足）。

其他约束（同样是踩过才有结论的那种）：

- OIDC 只支持 **GitHub-hosted runner**；self-hosted 不行。
- 触发事件白名单：`push` / `release` / `workflow_dispatch` 可以；`pull_request_target` 和
  `issue_comment` 被 npm 直接拒绝——本 workflow 只有 tag push 与 dispatch，命中白名单。
- npm 侧环境名一旦填写就与 workflow 绑死，改环境名 = 重建配置（配置创建后不可编辑）。

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
2. `publish` job（仅在真发布模式）：下载 artifact → 定位 pack dir → OIDC gate →
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

**状态变化（2026-11-06）**：npm provenance 要求包从 **public 仓库**构建
（docs.npmjs.com/generating-provenance-statements 的 prerequisites：`package.json` 的
`repository` 要指向一个 public 仓库且大小写一致）。本仓 `Smart-Chou/zcblog-v2` 已于
2026-11-06 转为 **public**；发布认证切到 **npm Trusted Publishing（GitHub OIDC）**，
`release.yml` 不再注入 `NPM_TOKEN`，`provenance` 默认开启。首次 Trusted Publisher 发布前
需在两个包的 npm package settings 里登记 `release.yml` + `npm-publish` environment（§3.1）；
`2.1.0` / `2.1.1` 两次首发是在 private 状态下用 `provenance=false` 发出的，不会追溯补 attestation。

Trusted Publishing 下 **provenance 是自动的**（npm 文档「Automatic provenance generation」：
不需要 `--provenance`）。workflow 仍然显式设 `NPM_CONFIG_PROVENANCE=true`，原因有二：
① changesets 是通过子进程调 `npm publish`，环境变量是最稳的传递方式；② 社区反馈（npm/cli#8730）
里有人首次发布不加 `--provenance` 会被拒，显式打开没有副作用。若 provenance 仍失败，先看
`repository` 字段与仓库是否逐字一致（三个包均已指向 `git+https://github.com/Smart-Chou/zcblog-v2.git`）。

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

### 6.6 认证回滚：临时退回 `NPM_TOKEN`（过渡方案）

Trusted Publishing 出问题（配置过期、environment 名填错、npm 侧 OIDC 故障）时，发布链可以
在**一个 revert 内**退回到旧的 token 认证——`NPM_TOKEN` 一直留在 `npm-publish` environment
secret 里（未删除，值为 granular token，仅两包 read-write，2027-02-04 到期）：

1. `git revert <M5-3 的 commit>`：把 `release.yml` 恢复成「注入 `secrets.NPM_TOKEN` + Credential gate」的版本。
   `verify-workflow` / `verify-guards` 的 W9/G5 断言会跟着 revert 一起回到旧口径，不需要手改。
2. npm 侧把包的 **Settings → Publishing access** 改回允许 token（若之前按 §3.1「推荐做法」
   设成了 *Require two-factor authentication and disallow tokens*，必须先改回来，否则 token 也发不出去）。
3. 发布完成后如果要再切回 OIDC：重新登记 Trusted Publisher，并在 **48 小时内**发一次版本。

注意这条回滚**只是临时**：npm 正在限制 bypass-2FA 的 granular token（账号级通知：
"npm tokens that bypass 2FA are being restricted for account changes and direct publishing"），
token 路线在 2027-01 之后会越来越难走，长期方案只能是 OIDC。退役时间表见 §12.5（2026-12-06 复审后撤销）。

---

## 7. 发布前阻断项（当前会让 `--mode=publish` 硬失败）

| 项 | 来源 | 现状 | 修法 |
| -- | ---- | ---- | ---- |
| `og-image` / `ui` 只发 TS 源码（`exports["."] → ./src/index.ts`，无 build 脚本） | M4-3 F1（P1） | 阻断 | 加 build 产出 `dist/*.js` + `d.ts`，exports 指 dist；或 README 明示「仅 bundler」 |
| `tokens` 的 `exports` 没有 `"."` | M4-2 F1 | 阻断 | 补最小 CSS/JSON 入口，或明确只支持子路径 |
| 发布清单内的包 `"private": true` | M4-1 / M4-10 | 阻断 | 发布卡翻转（M4 阶段 = tokens + og-image；ui 按 D-0120 保持 private，只报 INFO） |
| `publish-plan` 为空（等于这次发布什么都不发） | M4-4 | 闸门 | 见上两条：private 或没有待发布 changeset 都会导致空 plan |
| `engines` 为 `^22 \|\| ^24`，Node 26 报 EBADENGINE | M4-3 F2 / M4-2 F4 | WARN | 放宽为 `>=22` |
| `main`/`module` 指向 `.ts`；README `@<npm-scope>` 占位 | M4-3 F3/F4 | WARN | build 方案一起改；tokens/og-image 已在 `2.1.1` 回填 `@marxchou` 与安装说明；ui 仍占位 |

前两条与 private 的修复在包卡（M4-6），本链路只负责**发现并拦住**，不改 `packages/**`。

---

## 8. 本地复现（CI 跑的命令，本地一条不差）

```bash
pnpm install --frozen-lockfile
node scripts/release/verify-workflow.mjs      # release.yml 契约
node scripts/release/build-packages.mjs       # 包构建 + 入口存在性
pnpm gates:all                                # 契约门禁
node scripts/release/verify-versions.mjs      # 版本 lockstep
node scripts/release/verify-registry.mjs      # 发布后 registry 复查（只读；24h 点检加 --min-age-hours=24）
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
| `PUBLISH_DIRS` | tokens / ui / og-image | 本次/本阶段真要进 registry 的包：只有清单内的包才必须 `private: false`（M5-8 / D-0139 起三包齐） |

P1 的四种组合：清单内 + private → **FAIL**（publish 模式）/ INFO（check 模式）；清单内 + 非 private → PASS；
清单外 + private → **INFO**（按 D-0120 口径允许，但当前没有清单外的包）；清单外 + 非 private → **WARN**（疑似误翻转）。
当前清单是三包，仓库里已经没有「清单外」样本，所以后两种组合由 `verify-guards.mjs` 的
G4f / G4g 用「把副本的 `PUBLISH_DIRS` 缩回 M4 两包口径」的方式继续真跑，而不是留在代码里当死分支。
要改发布范围只改 `PUBLISH_DIRS` 一处（G4a–G4e 会跟着新清单重算期望值）。

---

## 9. 已知限制

- **已跑过两次真发布（2026-11-06）**：tokens / og-image `2.1.0` 首发，`2.1.1` 为
  README-only patch；`2.1.2` 为 OIDC 验证版（当前 `latest`）；ui 未发布（元数据已就绪，
  首发顺序与鸡生蛋问题见 §13）。
  `provenance` 在两次发布时因仓库 private 显式关闭；**仓库已于 2026-11-06 转 public**，
  发布认证已切到 **npm Trusted Publishing（OIDC）**，`release.yml` 不再读取 `NPM_TOKEN`；
  下一次发布默认 `provenance=true`。`npm-publish` environment 已在 2026-11-06 补 required
  reviewer `Smart-Chou`；真发布闸门是 `dry_run=false` + `confirm_publish=PUBLISH` + 环境批准。
  复现与证据见 §10。
- `npm publish --dry-run` 不会因为 `private: true` 报 `EPRIVATE`（npm 11.12.1 实测 exit 0），
  所以「private 挡误发」这件事**只能靠 preflight 显式检查**，不能靠 dry-run。
- `0.0.0-stage` 占位已于 **2026-11-06** 经 PO 批准删除；两个包现在只剩 `2.1.0 / 2.1.1 / 2.1.2`
  （删除记录见 §12.3）。
- `npm-publish` environment 里的 `NPM_TOKEN` 仍在（惰性，workflow 不引用），
  退役日期定在 2026-12-06 复审（见 §12.5）；在那之前它是 §6.6 回滚方案的唯一凭据。
- pack dir 通过 artifact 传递；artifact 对单个目录的落盘层级依赖 upload/download-artifact 行为，
  因此 publish job 用「找 `publish-plan.json`」定位目录而不是硬编码路径。
- `@marxchou/dogeared-og-image` 的 consumers 在**不加 override** 时会看到 1 条 moderate
  `GHSA-px8p-9vwx-vf98`（`fflate`，`unzipSync` + 畸形 ZIP64 无限循环）。satori 全系精确钉
  `fflate@0.7.3`，包侧无法改；satori 只调用 `inflateSync`，该路径不可达。已在包 README 给出
  npm/pnpm/yarn 三种 override 配方；本仓 `pnpm-workspace.yaml` 也已加 `satori>fflate: "^0.7.5"`。
  这条按 **A+ 决策**接受为已知、不可达告警，不作为发布阻断；等 satori 上游放宽依赖后再移除。
- `verify-changeset-loop.mjs` 的 L6 已修（2026-11-06）：临时副本先确保 `dist` 存在（缺了就跑
  `build-packages.mjs`），拷入后去掉 `prepack`，再让 `changeset pack` 打包已构建产物；L1–L8
  8/8 PASS。**不要**用「软链根 `node_modules`」的修法——`pnpm exec` 会把软链解析回真仓并
  purge 真实 `node_modules`；已踩过并恢复。
- `changeset publish` 是**逐包**发布：如果第三包失败，前两包已经在 registry 上了。
  lockstep 能保证版本一致，但不能保证原子性——失败后照 §6 处置。
- **npm 侧 Trusted Publisher 已登记**（2026-11-06）：`tokens` id `10c93ae3-08a7-4256-b945-8b70c8884f65`，
  `og-image` id `4436e077-22ce-409b-ac24-82fb15302eef`；均为 `Smart-Chou/zcblog-v2` /
  `release.yml` / `npm-publish` / `publish, stage publish`。`2.1.2` 已用 GitHub OIDC 真发布成功
  （run `42240709462`），两包 provenance 为 SLSA v1。
- OIDC 发布只支持 GitHub-hosted runner；自建 runner 走不通。
- npm 的触发白名单：`pull_request_target` / `issue_comment` 触发的 workflow 不能发布
  （2026-10-02 起）。本 workflow 只有 tag push + dispatch，不受影响。

---

## 10. 首发记录（2026-11-06）

- 触发：`workflow_dispatch`（`dry_run=false`、`confirm_publish=PUBLISH`、`provenance=false`）
- 提交：`5ccc00b`；run：<https://github.com/Smart-Chou/zcblog-v2/actions/runs/42175493474>
- 发布：`@marxchou/dogeared-tokens@2.1.0`、`@marxchou/dogeared-og-image@2.1.0`
- 未发布：`@marxchou/dogeared-ui`（保持 `private: true`，D-0120）
- 验证：
  - `npm view @marxchou/dogeared-tokens@2.1.0 version` → `2.1.0`
  - `npm view @marxchou/dogeared-og-image@2.1.0 version` → `2.1.0`
  - 在空目录用 npm 10.9.8 / 11.15.0 安装两包成功；`createOgImageRoute` 可 import，
    `tokens.css` 11,384 B
  - 两个包 `npm access get status` → `public`
- 已知现象：包首次出现过 npm staged publishing 的 `0.0.0-stage` 占位版本（stage list 已为空；
  `2.1.0` 首发时 `latest` 指向 `2.1.0`，`2.1.1` 发布后指向 `2.1.1`）；不影响安装。
  若后续确认需要清理，单独走 unpublish 审批。

### 2.1.1 · README-only patch

- 提交：`5191ccf`；run：<https://github.com/Smart-Chou/zcblog-v2/actions/runs/42189584179>；tag `pkg-v2.1.1`
- 发布：`@marxchou/dogeared-tokens@2.1.1`、`@marxchou/dogeared-og-image@2.1.1`（当前 `latest`）
- 未发布：ui `2.1.1` 仍 private（lockstep 升版但不发）
- 验证：`npm view …@2.1.1 readme` 已显示 “published” 与 `@marxchou` 安装说明；
  空目录 npm 11.15.0 安装成功，`tokens.css` 11,384 B，`createOgImageRoute` 可 import
- 2.1.0 的 README 文档债关闭；本版本不改代码，只回填包 README 与门禁适配

- 这次未生成 provenance（private repo 不生成）；等仓库转 public 后再切回 `provenance=true`。
- 发布 token 是 npm granular access token（bypass 2FA、仅两包 read-write、2027-02-04 到期），
  只存在 `npm-publish` environment secret，未写入仓库/文档。

---

## 11. M5-3 · 迁到 Trusted Publishing（2026-11-06，未发布）

本次**没有发布任何版本**，只把认证方式从长期 token 切到 GitHub OIDC，并把 npm 侧的操作单写成可执行步骤。

`release.yml`（publish job）的改动：

| 改动 | 之前 | 现在 |
| ---- | ---- | ---- |
| 认证 | `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` 注入三条 publish 步骤 | 全部移除；改为 OIDC，`id-token: write` 是唯一凭据 |
| 前置闸门 | Credential gate：没 `NPM_TOKEN` 就失败 | OIDC gate：`ACTIONS_ID_TOKEN_REQUEST_URL` **和** `..._TOKEN` 缺一即失败；出现 `NODE_AUTH_TOKEN`/`NPM_TOKEN` 环境变量即失败；`.npmrc` 里出现字面 `_authToken` 即失败（`${NODE_AUTH_TOKEN}` 占位放行） |
| npm CLI | 无要求 | 「Ensure npm CLI supports Trusted Publishing」：`< 11.5.1` 时自动 `npm install -g npm@^11.5.1` |
| `preflight --mode=publish` | 借 `NPM_CONFIG_USERCONFIG` 临时 .npmrc 传 token | 不再需要任何凭据 |
| provenance | 靠 `NPM_CONFIG_PROVENANCE` + token | `NPM_CONFIG_PROVENANCE=true` 保留（OIDC 下 provenance 本来自动；显式打开防首次被拒） |

门禁同步（不然改动只是「看起来对」）：

- `scripts/release/verify-workflow.mjs`：`W9a` 升级为要求 URL+TOKEN 双变量；新增 `W9d`
  （闸门必须扫 `.npmrc` 字面 token）、`W9e`（npm CLI 下限 11.5.1 必须被保证）。
- `scripts/release/verify-guards.mjs`：新增 `G5f`（删掉 `.npmrc` 扫描 → W9d 必须红）、
  `G5g`（把 npm 下限降到 11.0.0 → W9e 必须红）；`G5c`/`G5e` 的变异锚点跟着新步骤名调整。

没做的事（下次发布日补齐）：

1. 两个包的 Trusted Publisher 还没在 npm 上登记——需要 2FA 在场 + 48 小时内首发，见 §3.1。
2. 没有发新版本：本卡的验收只到「配置与 workflow 改动落盘 + 门禁全绿」。

证据与命令输出：`docs/_reviews/M5-3/report.md`。

---

## 12. 发布后运维清单（每次发布都跑，别让它变成暗债）

一次性把「发布完了」变成可复查的状态。命令只有一条，判据写在脚本里（`R1`–`R11`，见
`docs/_reviews/M5-5/report.md` §1.3），不靠人肉核对：

```bash
cd ~/Documents/WebSiteCode/zcblog-v2
pnpm verify:registry                       # T+0：刚发完立刻查一遍
pnpm verify:registry --min-age-hours=24    # T+24h：未到点 exit 3，到点才是真正的 24h 复查
```

退出码：`0` 通过 / `1` drift（下表的处置列） / `3` 距发布不足 24h（不是失败）。

### 12.1 时点与动作

| 时点 | 动作 | 通过标准 |
| ---- | ---- | -------- |
| T+0（发布后立刻） | `pnpm verify:registry` | `R1–R9` 全 PASS；`R10` 只允许 INFO |
| T+24h | `pnpm verify:registry --min-age-hours=24` | exit 0（不是 3），`R2/R3/R6` 无漂移 |
| T+72h | `0.0.0-stage` 占位决策窗口（单版本 unpublish 的宽限判断线） | **已于 2026-11-06 删除**，见 §12.3 |
| T+30d | `NPM_TOKEN` 退役复审 | 见 §12.5：删除 environment secret + 撤销 npm granular token |
| 每次发版前 | `pnpm preflight:release` + §8 全量 | 与本次发布同口径 |

### 12.2 drift 处置（`verify:registry` 红了怎么办）

| 红在哪 | 含义 | 处置 |
| ------ | ---- | ---- |
| `R2` version 不一致 | registry `latest` 与仓库 `package.json` 不同 | 本地产出没发 / 发了没回写版本 → 补一次发布或补版本提交，**不要改 registry** |
| `R3` 多出 dist-tag | 有人手工 `npm dist-tag add` | 确认来源；要回退 `latest` 走 §6.4 |
| `R4/R5` tarball 或 integrity | CDN 取不到 / 字节与 integrity 不符 | 先重试；持续不符按 §6 回滚（不要本地重算 integrity 去迁就） |
| `R6` provenance 缺失 | 那次发布没走 OIDC 或降级重发过 | 记录并前进版本；provenance 不可补写 |
| `R9` 清单外的包上架了 | `PUBLISH_DIRS` 与事实不符 | 要么更新 `PUBLISH_DIRS` + 文档，要么按 §6 回滚 |
| `R10` 占位被 tag 指向 | `latest` 或某个 tag 指到 `0.0.0-stage` | **立刻** `npm dist-tag add <pkg>@<真实版本> latest`（这是 blocker，不是噪音） |

### 12.3 `0.0.0-stage` 占位（2026-11-06 已删除）

- 原状：`tokens` / `og-image` 各挂 1 个（347 B / 349 B，2 个文件，发布于 `2026-11-06T06:37:40Z`），
  无 dist-tag 指向，`stage list` 为空（不是 staged 残留），0 下载。
- **PO 已批准删除，2026-11-06 执行完毕**；两个包现在只剩 `2.1.0 / 2.1.1 / 2.1.2`。
  单版本 unpublish 不可撤销，npm 每次操作都要求 WebAuthn：

  ```bash
  npx --yes npm@11.15.0 unpublish @marxchou/dogeared-tokens@0.0.0-stage
  npx --yes npm@11.15.0 unpublish @marxchou/dogeared-og-image@0.0.0-stage
  ```

  实操坑：npm 11.12 的旧 WebAuthn 回调会返回 `404 /-/v1/done?authId=…`；改用 npm 11.15 后正常。
- 复核：`node scripts/release/verify-registry.mjs --min-age-hours=0` **19 PASS / 0 FAIL**，
  `R10` 两包均为 `absent`。

### 12.4 认证面（发布后必须仍是这个形态）

| 事实 | 复查命令 | 期望 |
| ---- | -------- | ---- |
| workflow 不读任何 secret | `grep -n "secrets\." .github/workflows/release.yml` | 0 条 |
| 仓库 secrets 里没有 npm token | `gh secret list -R Smart-Chou/zcblog-v2` | 无 `NPM_TOKEN` / `NODE_AUTH_TOKEN` |
| environment 闸门还在 | `gh api repos/Smart-Chou/zcblog-v2/environments` | `npm-publish` 有 `required_reviewers`、`can_admins_bypass=false` |
| 两包 provenance 在场 | `pnpm verify:registry` | `R6` PASS（SLSA v1） |

### 12.5 `NPM_TOKEN` 退役操作单（2026-12-06 复审，本清单不自动执行）

M5-5 结论：**保留 30 天到 2026-12-06**，理由 = OIDC 只成功过 1 次（`2.1.2`），§6.6 的一键回滚还依赖它；
且它目前是惰性 secret（workflow 不引用）。到期无条件撤销：

```bash
# 1) 确认最近一次发布是 OIDC + provenance 在场
pnpm verify:registry                                  # R6 必须 PASS

# 2) 删 GitHub environment secret（等价网页：Settings → Environments → npm-publish → Secrets）
gh api -X DELETE repos/Smart-Chou/zcblog-v2/environments/npm-publish/secrets/NPM_TOKEN
gh api repos/Smart-Chou/zcblog-v2/environments/npm-publish/secrets       # 期望 total_count: 0

# 3) 撤销 npm 侧 granular token（网页，需 2FA）
#    https://www.npmjs.com/settings/mifsh/tokens → 「仅两包 read-write、2027-02-04 到期」那条 → Revoke

# 4) 复核发布链不受影响 + 回写文档
node scripts/release/verify-workflow.mjs               # W9 系列 PASS
node scripts/release/preflight.mjs                     # check 模式，无需凭据
```

删完之后 §6.6 的「1 个 revert 退回 token」方案随之失效：届时唯一回滚路径是 §6.2/§6.3
（deprecate 或前进版本），文档需同步改。

### 12.6 记录位置

每次 24h 复查把输出贴进当期的 `docs/_reviews/M5-*/report.md`，不新建散落文件：
`RELEASE_SUMMARY` 那行就是可 grep 的结论行。

---

## 13. 新包首发：Trusted Publisher 的鸡生蛋问题（M5-8 / D-0139）

`@marxchou/dogeared-ui` 是第一个**从零**上线的新包（`@marxchou/dogeared-tokens` 与
`-og-image` 在 M4 时代先用 token 发过 `2.1.0`，之后才登记 Trusted Publisher）。新包会撞上：

> npm 只允许给**已经存在于 registry 的包**登记 Trusted Publisher；而 OIDC 首发又必须先有
> Trusted Publisher。→ 首个版本无法用 OIDC 自动发布。

这不是本仓的配置问题，是 npm 侧的既定约束（`docs.npmjs.com/trusted-publishers`：
Trusted Publisher 配置挂在 package settings 下；GitHub 社区 discussion #176761 记录同一现象）。
另外，新登记的 Trusted Publisher **必须在 48 小时内完成一次成功发布**才生效，否则配置过期作废。

### 13.1 两条可行路径（都需要 PO 批准 + npm 登录态）

| 路径 | 步骤 | 首发版本有无 provenance | 代价 |
| ---- | ---- | --- | ---- |
| **A · 占位引导（推荐）** | ① 用短时 token 发 `0.0.0-stage`（`--tag stage`，**不动 `latest`**）→ ② 给包登记 Trusted Publisher（同 D-0131 的两包配方）→ ③ `release.yml` dispatch 走 OIDC 发 `2.1.2` → ④ 72h 内 unpublish 占位（同 D-0135 的流程） | **有**（SLSA v1） | 需要一次占位发布 + 一次清理；registry 上会短暂出现 `0.0.0-stage` |
| **B · 直接 token 首发** | ① 用短时 token 直接发 `2.1.2` → ② 再登记 Trusted Publisher（后续版本走 OIDC） | **无**（同 `2.1.0`/`2.1.1` 的历史状态） | 首发版本缺 provenance；无需清理 |

两条路径都**不能**在没登录态的情况下做：`npm trust` 与 token 首发分别需要
「账号 2FA 在场」的登录态。本地 `~/.npmrc` 里的 granular token 当前已失效
（`GET /-/whoami` → 401，M5-8 实测），所以这一步必须由 PO 重新登录（`npm login --auth-type=web`）
或换一条新的 granular token。

### 13.2 路径 A 的具体命令（照抄，第一条会真写 registry）

```bash
# 0) 前置：npm 登录态在（npm whoami 必须回 mifsh）；PO 已批准首发
npm whoami

# 1) 占位版本：只为「让包存在」，不进 latest
cd packages/ui
npm version 0.0.0-stage --no-git-tag-version --allow-same-version   # 注意：先备份 package.json
npm publish --tag stage --access public
git checkout -- package.json                                        # 立刻把版本改回 2.1.2

# 2) 登记 Trusted Publisher（npm >= 11.15.0 是硬要求，见 D-0131 的坑）
npx --yes npm@11.15.0 trust github @marxchou/dogeared-ui \
  --file release.yml --repo Smart-Chou/zcblog-v2 --env npm-publish --allow-publish --yes
npx --yes npm@11.15.0 trust list @marxchou/dogeared-ui     # 期望 publish, stage publish

# 3) 48h 内用 OIDC 发真实版本（release.yml：dry_run=false + confirm_publish=PUBLISH + 环境批准）
gh workflow run release.yml -f dry_run=false -f confirm_publish=PUBLISH

# 4) 发完 72h 内清掉占位（D-0135 的口径；先查有没有 tag 指向它）
npm dist-tag ls @marxchou/dogeared-ui
npm unpublish @marxchou/dogeared-ui@0.0.0-stage
```

### 13.3 现在的状态（2026-11-07，路径 B 已发布）

- `packages/ui` 已 `private: false` + `publishConfig.access=public`；`2.1.2` 已用账号 token 发布，
  `latest` 指向 `2.1.2`，干净安装通过。**没有 provenance**（PO 选择路径 B，明确接受）。
- Trusted Publisher **仍未登记**：`npm trust` 在 WebAuthn 后返回 `403 POST /-/package/@marxchou%2Fdogeared-ui/trust`；
  npm 账号 2FA 交互未完成，不是包权限问题。登记完成前 **不要**推 `v2.1.2` tag，也不要用
  `--mode=publish` 跑 release.yml（OIDC 首发会失败）。
- `0.0.0-stage` 占位由新包自动创建，`dist-tags` 不指向它，待在 72h 窗口内用有 2FA 的会话
  `npm unpublish @marxchou/dogeared-ui@0.0.0-stage` 清理。
- `verify-registry.mjs --min-age-hours=0` 当前：25 PASS / 1 FAIL / 1 INFO。FAIL 是 ui 的 `R6`
  （no provenance，路径 B 预期）；INFO 是 ui 的 `R10` 占位。tokens/og-image 仍全绿。
- 复现与证据：`docs/_reviews/M5-8/report.md` §11。


