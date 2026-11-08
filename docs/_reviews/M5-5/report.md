# M5-5 · 发布运维收口（24h registry / token / stage）报告

- 卡：`t_6f664809`（M5-5，依赖 M5-4）
- 执行：2026-11-06 23:23–23:40 HKT（= `2026-11-06T15:23Z`–`15:40Z`）
- 上游：M5-4 用 GitHub OIDC 发布 `tokens` / `og-image` `2.1.2`，run [42240709462](https://github.com/Smart-Chou/zcblog-v2/actions/runs/42240709462)（`conclusion=success`，15:11:28Z–15:13:01Z）
- 本轮性质：**只读核查**。没有执行任何 registry 写操作（无 publish / unpublish / deprecate / dist-tag add），也没有删除任何 GitHub secret。

## 0. 结论摘要

| 项 | 结论 |
| -- | ---- |
| registry 版本 / dist-tag / tarball / integrity / provenance / 归属 | **全部 PASS**（17 PASS / 0 FAIL / 0 WARN），命令 `node scripts/release/verify-registry.mjs` |
| 404 面 | `@marxchou/dogeared-ui` = 404（发布清单外，符合 D-0120）；不存在的版本 `2.1.3` = 404 |
| `0.0.0-stage` 占位 | 两个包各挂着 1 个，**无 dist-tag 指向、无 staged 残留、无下载量、无 dependents**；不影响安装。**建议删，但需 PO 单独批准**（本卡只核查） |
| `release.yml` 是否读 token | **不读**。文件里 `secrets.` 出现 0 次；OIDC gate 反过来把 `NPM_TOKEN` / 非占位 `NODE_AUTH_TOKEN` 当硬失败条件 |
| `NPM_TOKEN` 现状 | **仍在** `npm-publish` environment secret（2026-11-06T06:29Z 创建，granular、仅两包 read-write、2027-02-04 到期）；workflow 不引用它 |
| token 处置建议 | **保留 30 天到 2026-12-06 复审，到期无条件撤销**（理由与操作单见 §4） |
| 24h 点检 | **已完成（2026-11-08 15:37 HKT）**：`R11` 27.5h ≥ 24h；26 PASS / 1 FAIL（ui R6 无 provenance，路径 B 已知）/ 1 INFO（ui stage 占位待 M5-8a）；无 registry 写操作（§2） |

## 1. registry 24h 复查（本轮为 T+12min 基线）

### 1.1 为什么这轮不是「24h」

- `2.1.2` 真正进 registry 的时间（以 registry 的 `time` 字段为准）：
  - `@marxchou/dogeared-og-image` → `2026-11-06T15:15:33.555Z`
  - `@marxchou/dogeared-tokens` → `2026-11-06T15:16:33.075Z`
- 本卡启动 `2026-11-06T15:23Z`，第一次复查命令跑在 `15:28:26Z` → **T+12min**。
- `release.yml` 的 publish 步骤在 15:12:5x 结束，registry 落库时间比 run 晚约 2.5 分钟（registry 侧记录延迟，不是两次发布；两个包各只有一个 `2.1.2` 版本记录）。
- 24h 点检到点：**`2026-11-07T15:16:33Z`（= 2026-11-07 23:16 HKT）**，见 §2。

### 1.2 命令与输出（原样）

```console
$ cd ~/Documents/WebSiteCode/zcblog-v2
$ node scripts/release/verify-registry.mjs --out=…/registry-t0.json

== 发布后 registry 复查（只读） ==
[PASS] R1         @marxchou/dogeared-tokens registry 可达（HTTP 200）
[PASS] R2         @marxchou/dogeared-tokens latest = 2.1.2（与仓库 packages/tokens/package.json 一致）
[PASS] R3         @marxchou/dogeared-tokens dist-tags 只有 latest（无 next/beta/stage 流浪 tag）
[PASS] R4         @marxchou/dogeared-tokens@2.1.2 tarball 可下载（HTTP 200, 20748 B）
[PASS] R5         @marxchou/dogeared-tokens@2.1.2 integrity 实算一致（sha512-pmzNV9jDuZY8e0hsw…）
[PASS] R6         @marxchou/dogeared-tokens@2.1.2 provenance = SLSA v1（attestation bundle 可达）
[PASS] R7         @marxchou/dogeared-tokens@2.1.2 maintainers = mifsh，未 deprecated
[PASS] R8         @marxchou/dogeared-tokens@2.1.2 发布于 2026-11-06T15:16:33.075Z（距今 12min）
[PASS] R1         @marxchou/dogeared-og-image registry 可达（HTTP 200）
[PASS] R2         @marxchou/dogeared-og-image latest = 2.1.2（与仓库 packages/og-image/package.json 一致）
[PASS] R3         @marxchou/dogeared-og-image dist-tags 只有 latest（无 next/beta/stage 流浪 tag）
[PASS] R4         @marxchou/dogeared-og-image@2.1.2 tarball 可下载（HTTP 200, 12284 B）
[PASS] R5         @marxchou/dogeared-og-image@2.1.2 integrity 实算一致（sha512-2FPKklzJOSN1SylYr…）
[PASS] R6         @marxchou/dogeared-og-image@2.1.2 provenance = SLSA v1（attestation bundle 可达）
[PASS] R7         @marxchou/dogeared-og-image@2.1.2 maintainers = mifsh，未 deprecated
[PASS] R8         @marxchou/dogeared-og-image@2.1.2 发布于 2026-11-06T15:15:33.555Z（距今 13min）
[PASS] R9         @marxchou/dogeared-ui registry 404（发布清单外，符合预期）
[INFO] R10        @marxchou/dogeared-tokens 仍挂着 0.0.0-stage 占位（8.8h 前，无 tag 指向）
[INFO] R10        @marxchou/dogeared-og-image 仍挂着 0.0.0-stage 占位（8.8h 前，无 tag 指向）

RELEASE_SUMMARY {"title":"发布后 registry 复查（只读）","ok":true,"counts":{"PASS":17,"FAIL":0,"WARN":0,"INFO":2,"SKIP":0},"checkedAt":"2026-11-06T15:28:26.433Z","minAgeHours":0,"newestPublish":"@marxchou/dogeared-tokens@2.1.2 @ 2026-11-06T15:16:33.075Z (12min)","placeholder":{"@marxchou/dogeared-tokens":"present/window-open","@marxchou/dogeared-og-image":"present/window-open"}}
EXIT=0
```

独立佐证（与脚本不同路径，`npm` CLI + registry HTTP）：

```console
$ npm view @marxchou/dogeared-tokens dist-tags version --json
{ "dist-tags": { "latest": "2.1.2" }, "version": "2.1.2" }
$ npm view @marxchou/dogeared-og-image dist-tags version --json
{ "dist-tags": { "latest": "2.1.2" }, "version": "2.1.2" }

$ npm view @marxchou/dogeared-tokens@2.1.2 dist --json      # 摘录
{ "shasum": "fde587b6…668d3",
  "tarball": "https://registry.npmjs.org/@marxchou/dogeared-tokens/-/dogeared-tokens-2.1.2.tgz",
  "fileCount": 8, "unpackedSize": 68867,
  "integrity": "sha512-pmzNV9jDuZY8e0hswtOgtLh4UXGD1Dfcm6iZyOjqADPwZp7HJG+XvpxrsV1GE8LJ8o4BY9e2DtjJLYO928WfGg==",
  "attestations": { "url": "https://registry.npmjs.org/-/npm/v1/attestations/@marxchou%2fdogeared-tokens@2.1.2",
                    "provenance": { "predicateType": "https://slsa.dev/provenance/v1" } } }
$ npm view @marxchou/dogeared-og-image@2.1.2 dist --json    # 摘录
{ "tarball": "…/dogeared-og-image-2.1.2.tgz", "fileCount": 13, "unpackedSize": 49212,
  "attestations": { "provenance": { "predicateType": "https://slsa.dev/provenance/v1" } } }

$ curl -sS -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/@marxchou%2Fdogeared-tokens   # 200
$ curl -sS -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/@marxchou%2Fdogeared-og-image # 200
$ curl -sS -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/@marxchou%2Fdogeared-ui       # 404

$ npm view @marxchou/dogeared-tokens@2.1.3 version    # → npm error 404（不存在的版本确实 404）
$ npm view @marxchou/dogeared-ui version              # → npm error 404（ui 未发布）

$ npm access list packages @marxchou
@marxchou/dogeared-og-image: read-write
@marxchou/dogeared-tokens: read-write
$ npm whoami            # mifsh
$ npm view … maintainers # [ "mifsh <…>" ]（两包同）
```

### 1.3 判据（`scripts/release/verify-registry.mjs`，本卡新增）

| ID | 判据 | 级别 |
| -- | ---- | ---- |
| R1 | registry 元数据可达（HTTP 200） | FAIL |
| R2 | `dist-tags.latest` == 仓库 `packages/*/package.json` 版本（代码与 registry 不漂移） | FAIL |
| R3 | `dist-tags` 只有 `latest`（出现 next/beta/stage 等流浪 tag 说明有人手工改过） | WARN |
| R4 | 目标版本 tarball 可下载且非空 | FAIL |
| R5 | tarball 实算 `sha512-base64` == `dist.integrity` | FAIL |
| R6 | `dist.attestations.provenance.predicateType` == SLSA v1，且 attestation bundle 端点可达 | FAIL |
| R7 | maintainer 非空、版本未被 deprecated | WARN |
| R8 | 打印发布时间与距今时长（24h 时钟） | 记录 |
| R9 | 发布清单外（`ui`）必须仍是 404；已上架则 WARN（范围漂移） | WARN |
| R10 | `0.0.0-stage` 占位：存在但**不得**被任何 dist-tag 指向；报告 unpublish 窗口 | FAIL/INFO |
| R11 | `--min-age-hours=24` 时距发布不足则 **exit 3**（明确「还不是 24h 复查」，不谎报） | 退出码 |

负向自检（证明它真有牙）：

```console
$ node scripts/release/verify-registry.mjs --min-age-hours=24 --json
RELEASE_SUMMARY {… "ok":true,… "minAgeHours":24,"newestPublish":"…（12min）" …}
EXIT=3        # ← 未到 24h 就是 3，不是 0
```

脚本只读：不发任何带认证的请求（无 `_authToken` 读取、无 `npm publish/dist-tag/unpublish`），
`R5` 的 tarball 校验也会顺带证明 CDN 上的字节与 integrity 一致。

## 2. 24h 点检（2026-11-08 15:37 HKT 完成）

- 实际执行：`2026-11-08T07:37:11Z` = **2026-11-08 15:37 HKT**
- 最近发布：`ui@2.1.2` 于 `2026-11-07T04:05:20.598Z`（路径 B），距今 **27.5h**；`tokens` / `og-image` 距今 40.3/40.4h。24h 窗口已满足。
- 命令：`pnpm verify:registry --min-age-hours=24`
- 退出码：**1**。唯一 FAIL 是 `ui R6（无 provenance）`，这是 M5-8 路径 B 在发布时已明确接受的已知项，不是 24h 内的新漂移；其余 26 项 PASS，`R11` 明确「24h 窗口已满足」。无任何 registry 写操作。

```console
$ node scripts/release/verify-registry.mjs --min-age-hours=24

== 发布后 registry 复查（只读） ==
[PASS] R1         @marxchou/dogeared-tokens registry 可达（HTTP 200）
[PASS] R2         @marxchou/dogeared-tokens latest = 2.1.2（与仓库 packages/tokens/package.json 一致）
[PASS] R3         @marxchou/dogeared-tokens dist-tags 只有 latest（无 next/beta/stage 流浪 tag）
[PASS] R4         @marxchou/dogeared-tokens@2.1.2 tarball 可下载（HTTP 200, 20748 B）
[PASS] R5         @marxchou/dogeared-tokens@2.1.2 integrity 实算一致（sha512-pmzNV9jDuZY8e0hsw…）
[PASS] R6         @marxchou/dogeared-tokens@2.1.2 provenance = SLSA v1（attestation bundle 可达）
[PASS] R7         @marxchou/dogeared-tokens@2.1.2 maintainers = mifsh，未 deprecated
[PASS] R8         @marxchou/dogeared-tokens@2.1.2 发布于 2026-11-06T15:16:33.075Z（距今 40.3h）
[PASS] R1         @marxchou/dogeared-ui registry 可达（HTTP 200）
[PASS] R2         @marxchou/dogeared-ui latest = 2.1.2（与仓库 packages/ui/package.json 一致）
[PASS] R3         @marxchou/dogeared-ui dist-tags 只有 latest（无 next/beta/stage 流浪 tag）
[PASS] R4         @marxchou/dogeared-ui@2.1.2 tarball 可下载（HTTP 200, 6233 B）
[PASS] R5         @marxchou/dogeared-ui@2.1.2 integrity 实算一致（sha512-vsa6BZZok8gbKY5CZ…）
[FAIL] R6         @marxchou/dogeared-ui@2.1.2 没有 attestations（provenance 缺失）
           重发该版本或检查 publish 是否带 provenance
[PASS] R7         @marxchou/dogeared-ui@2.1.2 maintainers = mifsh，未 deprecated
[PASS] R8         @marxchou/dogeared-ui@2.1.2 发布于 2026-11-07T04:05:20.598Z（距今 27.5h）
[PASS] R1         @marxchou/dogeared-og-image registry 可达（HTTP 200）
[PASS] R2         @marxchou/dogeared-og-image latest = 2.1.2（与仓库 packages/og-image/package.json 一致）
[PASS] R3         @marxchou/dogeared-og-image dist-tags 只有 latest（无 next/beta/stage 流浪 tag）
[PASS] R4         @marxchou/dogeared-og-image@2.1.2 tarball 可下载（HTTP 200, 12284 B）
[PASS] R5         @marxchou/dogeared-og-image@2.1.2 integrity 实算一致（sha512-2FPKklzJOSN1SylYr…）
[PASS] R6         @marxchou/dogeared-og-image@2.1.2 provenance = SLSA v1（attestation bundle 可达）
[PASS] R7         @marxchou/dogeared-og-image@2.1.2 maintainers = mifsh，未 deprecated
[PASS] R8         @marxchou/dogeared-og-image@2.1.2 发布于 2026-11-06T15:15:33.555Z（距今 40.4h）
[PASS] R10        @marxchou/dogeared-tokens 没有 0.0.0-stage 占位
[INFO] R10        @marxchou/dogeared-ui 仍挂着 0.0.0-stage 占位（27.6h 前，无 tag 指向）
           unpublish 窗口：72h（发布后 27.6h → 仍可自助删除）
           删除需 PO 单独批准（M5-5 只核查，不执行）
[PASS] R10        @marxchou/dogeared-og-image 没有 0.0.0-stage 占位
[PASS] R11        距最近一次发布已 27.5h ≥ 24h（24h 窗口已满足）

RELEASE_SUMMARY {"title":"发布后 registry 复查（只读）","ok":false,"counts":{"PASS":26,"FAIL":1,"WARN":0,"INFO":1,"SKIP":0},"checkedAt":"2026-11-08T07:37:11.710Z","minAgeHours":24,"newestPublish":"@marxchou/dogeared-ui@2.1.2 @ 2026-11-07T04:05:20.598Z (27.5h)","placeholder":{"@marxchou/dogeared-tokens":"absent","@marxchou/dogeared-ui":"present/window-open","@marxchou/dogeared-og-image":"absent"}}
[ELIFECYCLE] Command failed with exit code 1.
```

判读：

- `tokens` / `og-image`：版本、dist-tag、tarball、integrity、provenance、maintainer 全部未漂移（R1–R8 PASS）。
- `ui`：版本 / tarball / integrity / dist-tag 正常；`R6` 无 attestations，按路径 B 接受，不重发。
- `R10`：tokens / og-image 的 `0.0.0-stage` 已 `absent`；ui 仍 `present/window-open`（27.6h，72h 窗口内），按 M5-8a 等 PO 封禁解除后处理，本卡未执行删除。
- 没有新增 CI 定时任务；任何新 workflow / cron 仍属基础设施变更，等 PO 批准。
- 本次只读，未产生 publish / unpublish / deprecate / dist-tag 写操作。

## 3. `0.0.0-stage` 占位：只读核查结论

### 3.1 事实

```console
$ npm view @marxchou/dogeared-tokens versions --json
[ "0.0.0-stage", "2.1.0", "2.1.1", "2.1.2" ]
$ npm view @marxchou/dogeared-og-image versions --json
[ "0.0.0-stage", "2.1.0", "2.1.1", "2.1.2" ]

$ npm view @marxchou/dogeared-tokens@0.0.0-stage dist --json
{ "shasum": "aac8d293…", "fileCount": 2, "unpackedSize": 347,
  "tarball": "…/dogeared-tokens-0.0.0-stage.tgz" }        # 347 B / 2 文件 = 纯占位
$ npm view @marxchou/dogeared-og-image@0.0.0-stage dist --json
{ "fileCount": 2, "unpackedSize": 349 }                   # 349 B / 2 文件

dist-tags（两包）: { "latest": "2.1.2" }   # 没有任何 tag 指向 0.0.0-stage
0.0.0-stage 发布时间: 2026-11-06T06:37:40Z（两包同秒，= 包首次创建时刻）

$ npx --yes npm@11.15.0 stage list @marxchou/dogeared-tokens
No staged versions of package name "@marxchou/dogeared-tokens".
$ npx --yes npm@11.15.0 stage list @marxchou/dogeared-og-image
No staged versions of package name "@marxchou/dogeared-og-image".

$ curl -sS "https://api.npmjs.org/downloads/point/last-week/@marxchou/dogeared-tokens"
{"error":"package @marxchou/dogeared-tokens not found"}   # 下载统计里没有这个包 = 0 下载
   （对照：同 URL 换成 @babel/core 返回正常数据，说明不是 API 用法问题）
```

### 3.2 结论

1. **不是 staged 残留**：`stage list` 两包皆空，staged publishing 没有待批版本。
2. **不参与解析**：`latest` 指向 `2.1.2`，没有任何 dist-tag 指向 `0.0.0-stage`；它是 `0.0.0` 的 prerelease，
   `^2` / `~2` / `2.x` / `*` 这类范围都命不中它（只有显式 `pkg@0.0.0-stage` 才会装到）。
3. **无人依赖**：下载量 0（stats API 无记录），发布清单外无消费者；它是占位 tar，2 个文件 347/349 B。
4. **唯一实际成本**：每次 registry 复查都要多看一眼；`npm search` / 包页版本列表里多一条噪音。
5. **删除可行**：单版本 unpublish 只能走 CLI（`npm unpublish <pkg>@<version>`），当前两包都满足
   「发布 <72h / 无 dependents / 周下载 <300 / 单一 maintainer」的条件，**窗口内、窗口外都能删**；
   注意删除后 `0.0.0-stage` 这个版本号永久不可复用（不影响 `2.x`），且整包 unpublish 才会触发 24h 冷却。

### 3.3 处置建议（需 PO 单独批准，本卡未执行）

推荐 **删**（一次性清掉噪音，避免它以后被误当「还有旧版本可装」）：

```bash
# 前置：账号 2FA（auth-and-writes），本机 npm whoami = mifsh
export BW_SESSION="$(cat ~/.bw_session)"   # 仅当需要现取 TOTP
npm unpublish @marxchou/dogeared-tokens@0.0.0-stage --otp=<6 位码>
npm unpublish @marxchou/dogeared-og-image@0.0.0-stage --otp=<6 位码>

# 删除后复核（应只剩 2.1.0/2.1.1/2.1.2，latest 仍是 2.1.2）
npm view @marxchou/dogeared-tokens versions --json
npm view @marxchou/dogeared-og-image versions --json
node scripts/release/verify-registry.mjs
```

若 PO 选择「留着」，则登记为已接受的已知限制（`docs/release.md` §9），不再重复讨论。

**风险提示**：unpublish 是**不可撤销**的 registry 写操作，且必须带 OTP。这两点是本卡不自行执行的原因。

## 4. token 退役核查

### 4.1 `release.yml` 不读取 token（证据）

```console
$ grep -n "secrets\." .github/workflows/release.yml
（无输出：整个 workflow 没有引用任何 secret）

$ grep -nE "NPM_TOKEN|NODE_AUTH_TOKEN|_authToken" .github/workflows/release.yml
5:# 发布认证：npm Trusted Publishing（GitHub OIDC），不再使用长期 NPM_TOKEN。
222:            id-token: write # provenance 需要 OIDC
280:  …缺 ACTIONS_ID_TOKEN_REQUEST_URL / ..._TOKEN）：…本轮不会回退到 NPM_TOKEN
283:  if [ -n "${NPM_TOKEN:-}" ]; then           → exit 1   # 出现就硬失败
289:  if [ -n "${NODE_AUTH_TOKEN:-}" ] && [ "${NODE_AUTH_TOKEN}" != "XXXXX-XXXXX-XXXXX-XXXXX" ]; then → exit 1
295-301:  扫 $HOME/.npmrc / $GITHUB_WORKSPACE/.npmrc / $RUNNER_TEMP/.npmrc / $NPM_CONFIG_USERCONFIG 里的字面 _authToken → exit 1
```

即：唯一凭据是 OIDC（`id-token: write`）；`NODE_AUTH_TOKEN` 只在「setup-node 的 `XXXXX-XXXXX-XXXXX-XXXXX` 占位符」这一种形态下放行；
`.npmrc` 里出现字面 token 直接失败。**没有任何注入 `secrets.NPM_TOKEN` 的步骤。**

### 4.2 现存 token 资产清点

| 位置 | 是否存在 | 内容 / 权限 | 谁会读到 |
| ---- | -------- | ----------- | -------- |
| 仓库 secrets（`gh secret list`） | **无** `NPM_TOKEN` / `NODE_AUTH_TOKEN` | 仅 `ARTICLES_PAT` / `CF_PAGES_TOKEN` / `CF_PURGE_TOKEN` / `CF_ZONE_ID` | — |
| `npm-publish` environment secret | **有** `NPM_TOKEN`（created `2026-11-06T06:29:28Z`） | granular token，仅两包 read-write，**2027-02-04 到期** | 只有走该 environment 的 job；而 workflow 不引用 → 目前**惰性** |
| 本机 `~/.npmrc` | 有 1 行 `_authToken`（值不记录、不进仓库/文档） | `npm whoami` = **mifsh**；对两包 `read-write` | 只影响本机命令，不参与 CI |
| npm 侧 Trusted Publisher | 两包已登记并已成功发布 1 次（`2.1.2`，SLSA v1） | 48h 过期条款已因首发成功解除 | — |

`npm-publish` environment 保护面（`gh api repos/.../environments`）：

```json
{"name":"npm-publish","can_admins_bypass":false,
 "protection_rules":[{"type":"required_reviewers","prevent_self_review":false,
                      "reviewers":[{"type":"User","reviewer":{"login":"Smart-Chou"}}]}]}
```

### 4.3 建议：**保留 30 天（到 2026-12-06 复审），到期无条件撤销**

不做「现在就删」，理由是三条实证：

1. **OIDC 只成功过 1 次**（`2.1.2`）。单次成功不足以证明长期稳定；
   `docs/release.md` §6.6 的紧急回滚（1 个 revert 退回 token）依赖这枚 secret 还在。
2. **删了不能「部分恢复」**：granular token 一旦撤销不可复原，只能新建；而新建 token 需要 2FA + 重新评估 scope。
   保留的成本只是「一个惰性 secret」，删除的收益是「少一处可被读到的凭据」——当前 workflow 根本不读它，
   实际攻击面已经收敛到「有 environment 审批权 + 有 workflow 写权」的人。
3. **30 天里有 2 次自然检验点**：下一次发布（M5-6 之后的版本）若 OIDC 再次成功，即可提前删；
   若失败，正好用这枚 token 回滚，而不是在事故中现造凭据。

**到期硬约束**：`2026-12-06` 复审；token 自身 `2027-02-04` 到期——复审日之后无论是否再发过版本，都删。

### 4.4 撤销操作单（30 天后 / 提前满足条件时执行，本卡未执行）

```bash
# 0) 前置确认：最近一次发布确为 OIDC 且 provenance 在场
node scripts/release/verify-registry.mjs        # R6 必须 PASS

# 1) 删 GitHub environment secret（等价网页：Settings → Environments → npm-publish → Secrets → 删除 NPM_TOKEN）
gh api -X DELETE repos/Smart-Chou/zcblog-v2/environments/npm-publish/secrets/NPM_TOKEN
gh api repos/Smart-Chou/zcblog-v2/environments/npm-publish/secrets   # 期望 total_count: 0

# 2) 撤销 npm 侧那枚 granular token（网页，需 2FA）
#    https://www.npmjs.com/settings/mifsh/tokens → 找到"仅两包 read-write、2027-02-04 到期"的那条 → Revoke

# 3) 复核：OIDC 发布链不受影响（workflow 本来就不读它）
node scripts/release/verify-workflow.mjs        # W9 系列仍 PASS
node scripts/release/preflight.mjs              # check 模式，不需要任何凭据

# 4) 同步文档：docs/release.md §3 表里的 NPM_TOKEN 行改「已删除」，§6.6 的回滚方案降级为「只能前进版本」
```

**本机 `~/.npmrc` 的处理**：保留。它只服务本机 read-only 查询（`npm view` / `access list` / `whoami`），
不进 CI；将来若要收紧，改成 `npm token` 级别的只读 token 即可，不与本次退役捆绑。

## 5. 本轮没有做的事（明确边界）

- 没有 publish / unpublish / deprecate / `dist-tag add`——registry 上零写入。证据：
  - 脚本里只有 `fetch(url)`（GET），没有任何 npm 认证写命令；本轮带认证的调用只有 `npm whoami` /
    `npm access list packages` / `npm stage list`，都是只读。
  - **`time.modified` 未被改动**（写操作必然推进该字段）：本卡运行期间
    `tokens` 恒为 `2026-11-06T15:16:33.464Z`、`og-image` 恒为 `2026-11-06T15:15:33.902Z`，
    而在 `2026-11-06T15:33:34Z` 复查时这两个值仍是原样。
- 没有删除「NPM_TOKEN environment secret」（写操作，需 PO）。
- 没有新增 CI 定时任务 / cron（基础设施变更，需 PO）。
- 没有把 24h 点检谎报成已完成（发布后 12 分钟，`--min-age-hours=24` 明确 exit 3）。

## 6. 验收对照

| 验收项 | 状态 | 证据 |
| ------ | ---- | ---- |
| 24h 复查有命令输出 | ✅（T+12min 基线 + 可复用命令） | §1.2 完整输出；§2 到点命令 `pnpm verify:registry --min-age-hours=24`（未到点 exit 3 已验证） |
| stage 结论明确 | ✅ | §3.2 四条结论 + §3.3 处置建议（推荐删，需 PO 批准） |
| token 退役建议有操作步骤 | ✅ | §4.3 保留 30 天理由 + §4.4 四步操作单（含复核命令与文档同步） |
| 不产生未授权 registry 写操作 | ✅ | §5；脚本仅 GET，`release.yml` 本轮未触发 |

## 7. 遗留 / 交接

1. **M5-5b（已建卡 `t_330526fe`，blocked 到 2026-11-07 23:16 HKT）**：到点后跑 `pnpm verify:registry --min-age-hours=24`，
   把输出追加到本报告 §2；`exit 3` 表示还没到点，不许改成 0 蒙过去。
2. **PO 决策 1**：`0.0.0-stage` 删 or 留（§3.3，两条命令 + OTP）。
3. **PO 决策 2**：`NPM_TOKEN` 是否接受「保留 30 天到 2026-12-06」（§4.3），以及是否批准加只读定时 workflow（§2）。
4. **文案级后续**：`docs/release.md` §3 的 NPM_TOKEN 行、§6.6 的回滚前提、§8 的本地复现清单已按本轮结论更新；§9 见「已知限制」。

## 7. PO 批准后的写操作（2026-11-06 23:48 HKT 追加）

PO 决定：**`0.0.0-stage` 删除；`NPM_TOKEN` 保留 30 天**。

- 已删除：
  - `@marxchou/dogeared-tokens@0.0.0-stage`
  - `@marxchou/dogeared-og-image@0.0.0-stage`
- 操作方式：`npx --yes npm@11.15.0 unpublish <pkg>@0.0.0-stage`，两次均需 WebAuthn；
  npm 11.12 的旧回调返回 `404 /-/v1/done?authId=…`，npm 11.15 正常。
- 复核（`node scripts/release/verify-registry.mjs --min-age-hours=0`）：
  **19 PASS / 0 FAIL / 0 WARN**，`R10` 两包均 `absent`；`latest` 均为 `2.1.2`，
  tarball 与 integrity、SLSA v1 provenance 全部 PASS。
- `NPM_TOKEN`：保留 30 天，退役复审 **2026-12-06**；操作单见 `docs/release.md` §12.5。
- 24h 点检仍由 M5-5b 在 **2026-11-07 23:16 HKT** 执行；本轮删除不影响该检查。

