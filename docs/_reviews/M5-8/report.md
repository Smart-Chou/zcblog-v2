# M5-8 · `@marxchou/dogeared-ui` 发布准备（2026-11-07）

## 结论

**发布准备 PASS / 首发 BLOCKED（等 PO）**。

- 包元数据、`npm pack` 内容、发布链闸门、干净消费者渲染全部通过；`preflight --mode=publish`
  exit 0，plan 只有 `ui@2.1.2` 一项——「按一下就能发」的状态已经是实测的，不是推断的。
- **没有执行真 publish**（卡里的硬停点）：除此之外还撞到两个与卡内步骤顺序有关的事实，见 §5。
- 关键发现：**新包不能在首次发布前登记 Trusted Publisher**（npm 只允许给已存在的包配置），
  所以卡里「先登记 trust、再首发」的顺序在 npm 侧走不通，首发必须先用 token 引导一次
  （`docs/release.md` §13 已写成可执行流程）。

---

## 1. 包元数据（卡步骤 1、2）

`packages/ui/package.json`：

| 项 | 值 | 判据 |
| --- | --- | --- |
| `private` | `false`（原 `true`） | `smoke.test.mjs`「publish: private:false + publishConfig.access=public」 |
| `publishConfig.access` | `public`（新增） | 同上 |
| `files` | `dist` `src` `README.md` `CHANGELOG.md` `LICENSE` `NOTICE` | 「files 清单覆盖发布所需的全部文件」 |
| `exports` | `.`（types/import/default → `dist/`）+ `./Badge.astro` + `./Button.astro` + `./package.json` | 「入口全部指向 dist，没有一个指向 .ts」+ 包自引用解析测试 |
| `peerDependencies.astro` | `^7.3.6`（`peerDependenciesMeta.optional = true`） | 见下 |
| `dependencies` / `devDependencies` | 无 | 「零运行期依赖」 |
| `engines.node` | `>=22` | 覆盖本机 Node 26 |

**peer `astro` 与实际依赖收敛**：主题根 `package.json` 的 `dependencies.astro` 是 `^7.3.6`，
已装的 `node_modules/astro` 是 `7.3.6`，包 peer 也是 `^7.3.6`。新增断言把这条钉住——两处 range
必须逐字相等，且已安装版本不低于 range 下限（`packages/ui/test/smoke.test.mjs`）。

**`npm pack` 内容审计**（`logs/13-npm-pack-ui.json`，`npm pack --dry-run --json --ignore-scripts`）：

```
@marxchou/dogeared-ui@2.1.2 · packed 6,233 B · unpacked 17,243 B · entryCount 12
CHANGELOG.md 1,032 · LICENSE 1,065 · NOTICE 1,788 · README.md 4,221 · package.json 1,570
dist/{Badge.astro 1,527, Button.astro 1,634, index.js 415, index.d.ts 415}
src/{Badge.astro, Button.astro, index.ts}
```

没有 `test/`、`node_modules`、`.env`、`.tgz`、本机绝对路径；`CHANGELOG.md` 是本次新加进
`files` 的（npx 默认只带 README/LICENSE，CHANGELOG 不会自动进包）。

**README / CHANGELOG 重写**：README 去掉「private, not published yet」与 `@<npm-scope>` 占位
（B2 的身份串豁免本就允许三个包名，`docs/package-boundary.md` §2 B2 写明「出现在 README 安装
示例里是包身份」），补了真实安装/升级语义、tokens 依赖关系、版本口径；CHANGELOG 把 2.1.2 写成
首发版本，并说明 2.1.0/2.1.1 从未以本包名义发布。

---

## 2. 发布链接线（让「可以发」变成判据）

| 文件 | 改动 | 为什么 |
| --- | --- | --- |
| `scripts/release/lib.mjs` | `PUBLISH_DIRS` → 三包 | 发布范围的唯一事实源（D-0139） |
| `scripts/gates/verify-package-boundary.mjs` | `RELEASE_PACKAGES` → 三包 | 否则 W0 会继续要求 `ui` 必须 `private:true` 且**禁止** `publishConfig`，翻转后门禁必红 |
| `scripts/release/verify-guards.mjs` | G4d/G4e 改成「按发布清单重算」；G4f/G4g 用 `publishSet` 把副本清单缩回 M4 两包口径，继续真跑「清单外 private → INFO+D-0120」「清单外非 private → WARN 疑似误翻转」；G4b 造「空 plan」也用回退口径 | 三包都在清单里之后，仓库已不存在「清单外」样本。若不这么写，这两条 P1 分支会变成死代码 |
| `scripts/release/verify-changeset-loop.mjs` | L8 从「ui 仍 private」改成「private 状态与发布清单一致」 | 原来那条断言与 D-0139 直接冲突 |
| `scripts/release/publish-dry-run.mjs` | 「该版本已在 registry」判 **SKIP** 而不是 FAIL | 否则 `2.1.2` 发过之后，dry-run job 会因为 `tokens`/`og-image` 无法重发同版本而永久红——那是 registry 事实，不是包坏了 |

结果：`verify-guards` **18/18 PASS**（原 17，新增 G4g）、`verify-changeset-loop` **8/8 PASS**、
`verify-workflow` **28/28 PASS**、`verify-versions` **9 PASS / 1 SKIP**、`packages/ui` 自带测试
**12/12**。

---

## 3. 发布态实测（这是「上膛」的证据，不是承诺）

```
$ node scripts/release/preflight.mjs --mode=publish
RELEASE_SUMMARY {"ok":true,"counts":{"PASS":34,"FAIL":0,"WARN":0,"INFO":1,"SKIP":1},
  "mode":"publish","publishSet":["packages/tokens","packages/ui","packages/og-image"],
  "privatePackages":[],
  "publishPlan":{"version":1,"plan":[[{"kind":"publish","name":"@marxchou/dogeared-ui",
                                      "version":"2.1.2","access":"public","tag":"latest"}]]}}
```

- publish 模式 **exit 0**：三包都 `private:false`，`pack` 清单完整（tokens 8 / ui 12 / og-image 13 文件），
  `publish-plan` 非空。
- plan 里**只有 ui**：`tokens`/`og-image` 的 `2.1.2` 已在 registry，changesets 不会重发。
- `npm publish --dry-run` 两个变体（包目录 / tarball，带 `--access public --tag latest`）在 ui 上
  都是 exit 0，回执原文：`npm notice Publishing to https://registry.npmjs.org/ with tag latest and
  public access (dry-run)`（`logs/04-publish-dryrun.log`）。

---

## 4. 干净消费者安装 + 构建 + 渲染（卡步骤 4）

用 `npm pack` 出来的 **tarball**（不是 `file:` 目录）装进一个空目录，依赖只有
`astro ^7.3.6` + `@marxchou/dogeared-tokens@2.1.2`（registry 真实版本）+ 本包 tarball：

| 步骤 | 结果 | 日志 |
| --- | --- | --- |
| `npm install` | `added 195 packages in 17s` | `logs/01-consumer-install.log` |
| `astro build` | `2 page(s) built in 532ms`（3s 含启动） | `logs/02-consumer-build.log` |
| 断言 | **28/28 PASS** | `logs/03-consumer-verify.log` |

断言覆盖：

- 装进 `node_modules` 的那份确实是 tarball 内容：`version=2.1.2`、`private=false`、
  `publishConfig.access=public`、`dist/Badge.astro`/`Button.astro`/`index.js`/`LICENSE`/`NOTICE`/
  `CHANGELOG.md` 都在。
- **桶入口**页渲染出 6 个 variant × 3 个 size 的 Badge（`badge badge--tip badge--sm` 等）和两个
  Button（`btn btn-primary` / `btn btn-secondary`），`href`/`target` 正确透传到 `<a>`。
- **子路径导出**页（`@marxchou/dogeared-ui/Badge.astro`）同样渲染成功。
- 产物 CSS 里有 scoped 规则（`.badge[data-astro-cid-…]`、`.badge--tip`、`.btn-primary[data-astro-cid-…]`）
  以及 tokens 变量（`--radius-full`、`--color-accent`）——说明「组件 + tokens 层」这条组合真的能出产物。

消费者侧实际解析到的 `astro` 是 **7.4.7**（`^7.3.6` 范围里的最新），构建无 peer 警告。

> 复现脚本保存在 `docs/_reviews/M5-8/verify-consumer.mjs`（对已构建的消费者目录做断言）。若要把它
> 变成常设门禁，应该在 M5-9 之后挪进 `scripts/release/` 并接进 CI——那需要联网装 astro，属于另一张卡。

---

## 5. 卡步骤 3（登记 Trusted Publisher）为什么没完成

两件事叠加，都不是配置错误：

### 5.1 本地没有可用的 npm 登录态（401）

```
$ npm whoami                      → 401 Unauthorized
$ curl -H "Authorization: Bearer <~/.npmrc 里的 token>" /-/whoami → 401
$ npx npm@11.15.0 trust list @marxchou/dogeared-tokens            → 401
$ npx npm@11.15.0 trust github @marxchou/dogeared-ui … --allow-publish --yes
  → npm error 401 Unauthorized - POST …/@marxchou%2fdogeared-ui/trust
    {"success":false,"error":"You must be logged in to publish packages."}
```

`~/.npmrc` 里的 granular token（`npm_` + 36 位）长度正常但已失效；npm 现在还会打
「bypass 2FA 的 token 正在被限制」的告示。`npm trust` 需要**账号 2FA 在场**的登录态
（`npm login --auth-type=web`）或一条新的 granular token。证据：`logs/05-trust-attempt.log`。

### 5.2 新包首发有「鸡生蛋」顺序（更根本）

npm 的 Trusted Publisher 配置挂在 **package settings** 下，只能给**已经存在于 registry 的包**
登记；而 OIDC 首发又必须先有 Trusted Publisher。所以 `@marxchou/dogeared-ui`（registry 404）
无论如何都不能先登记再首发。社区同一现象：GitHub discussion #176761；npm 文档另有一条约束：
**新登记的 Trusted Publisher 必须在 48 小时内完成一次成功发布**，否则配置作废
（`docs.npmjs.com/trusted-publishers`）。

> M4 时代 `tokens`/`og-image` 之所以没撞上这个坑，是因为它们当年先用 token 发了 `2.1.0`
> （`0.0.0-stage` 占位 + granulated token），包存在之后才登记 OIDC（D-0131）。ui 是第一个
> **从零**上线的新包。

### 5.3 两条可行路径（已写进 `docs/release.md` §13）

| 路径 | 步骤 | 首发版本 provenance | 代价 |
| --- | --- | --- | --- |
| **A · 占位引导（推荐）** | token 发 `0.0.0-stage`（`--tag stage`，不动 `latest`）→ 登记 Trusted Publisher → `release.yml` 走 OIDC 发 `2.1.2` → 72h 内 unpublish 占位 | **有**（SLSA v1） | 一次占位发布 + 一次清理 |
| **B · 直接 token 首发** | token 直接发 `2.1.2` → 再登记 Trusted Publisher（后续走 OIDC） | 无（同 `2.1.0`/`2.1.1`） | 首发缺 provenance |

两条都需要 PO 批准 + PO 的一条 npm 登录态/token。**这一步我没有代做，也不该代做**。

---

## 6. 文档同步（卡步骤 5）

| 文件 | 改动 |
| --- | --- |
| `packages/ui/README.md` | 状态段改「publishable + 以 registry 为准」；真实安装/用法（桶入口 + 子路径）、tokens 关系、版本口径、peer 与主题收敛说明 |
| `packages/ui/CHANGELOG.md` | 2.1.2 = 首发版本（Badge/Button 两条 + 包形状）；说明 2.1.0/2.1.1 从未以本包名义发布 |
| `docs/npm-consumer.md` | 标题/页首状态改为三包；新增 **§3.5 接 ui**（安装、桶入口与子路径、只在 Astro/Vite 可用、CSS 变量、optional peer）；lockstep 从「两个包」改「三个包」；已知限制里的「ui 尚未发布」改成「以 `npm view` 为准」 |
| `docs/release.md` | 页首状态表（三包 × 版本 × registry × private）；`PUBLISH_DIRS` 表与四种组合；**新增 §13「新包首发：Trusted Publisher 的鸡生蛋问题」**（两条路径、照抄命令、当前上膛状态与禁止动作） |
| `docs/package-boundary.md` | W0 判据从「private: true、无 publishConfig」改为「按发布清单判定」；§1 加发布状态口径注 |
| `site.manifest.json` | `changeLog` 追加 D-0139 一条（清单变更留痕，形状由 O6/O0 校验） |

---

## 7. 门禁与契约证据

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| `gates:all`（9 个 gate 逐个跑） | 9/9 PASS | `logs/06-gates-all.log` |
| `verify-package-boundary`（W0/B1–B4） | `RESULT PASS packages=3 violations=0 theme_version=2.1.2` | 同上 |
| `verify-overlay` | `RESULT PASS classified=1157 unclassified=0 theme=723 overlay=302 exclude=132 plan_baseline=998 delta=+159` | 同上 |
| `preflight --mode=publish` | exit 0，34 PASS / 0 FAIL，plan = `[[ui@2.1.2]]` | `logs/07-preflight-publish-mode.log` |
| `verify-guards` | 18/18 PASS | `logs/08-verify-guards.log` |
| `verify-changeset-loop` | 8/8 PASS（L7 plan 三包齐、L8 private 与清单一致） | `logs/09-changeset-loop.log` |
| `verify-workflow` | 28/28 PASS（未改 release.yml） | `logs/10-verify-workflow.log` |
| `verify-versions` | 9 PASS / 1 SKIP（未给 tag） | `logs/11-verify-versions.log` |
| `packages/ui` 自带测试 | 12/12 PASS | `logs/12-ui-smoke-test.log` |
| `publish-dry-run` | `ok:true`，5 PASS / 4 SKIP（跳过的是两个已发布包） | `logs/04-publish-dryrun.log` |

计数口径说明：本卡**没有改动分类规则**，新增文件只有 `docs/_reviews/M5-8/**`（15 个：报告 + 消费者
断言脚本 + 13 份日志），全部落在 X 类（评审档案）——所以 `classified 1142 → 1157`、`exclude 117 → 132`、
`unclassified` 仍是 0。1142 是当前 HEAD 的读数（含 M5-9 在 `de4a795` 之后提交的
`docs/_reviews/M5-9/options.md`，也是 X）；`docs/_reviews/M5-7b/report.md` 记的 1141/116 是
`de4a795` 那一刻的读数。

`verify-registry` 本轮**没跑**：ui 上 registry 之前，`R1/R2` 必然红（404 / latest 不一致）。
这不是回归，是「还没发」的如实读数；发完之后应当 0 FAIL（`docs/release.md` §13.3 写明）。

---

## 8. 边界（没做的事）

- **没有 publish、没有推 `v*` tag、没有 dispatch release.yml**；本轮零 registry 写操作
  （`npm publish --dry-run` 不认证、不写盘；`npm pack` 只写本地 tarball）。
- 没改 `release.yml`：首发引导走「PO 手动/一次性 token」而不是给 workflow 加 token 分支——
  给 CI 加 token 通路会破坏 D-0131 的「workflow 不读 token」不变量，属于需要 PO 单独决定的改动。
- 没动 `src/**`、`packages/*/src/**`（组件本体零改动）、没动生产站（D-0125）、没扩原语
  （首发仍只有 Badge / Button）。
- 没改性能/视觉预算、没改 CI。

**上膛状态必须让下游知道**：`private:false` 之后，任何真实发布（tag push 或 dispatch +
`confirm_publish=PUBLISH`）都会把 `ui@2.1.2` 算进 publish-plan。在 §13.1 的引导流程走完之前，
OIDC 首发会因为「没有 Trusted Publisher」而失败——所以**先别推 `v2.1.2` tag**。

---

## 9. 复现命令

```bash
cd packages/ui && npm run build && npm test          # 12/12，含发布就绪断言
npm pack --dry-run --json --ignore-scripts          # 12 文件 / 17,243 B unpacked
node scripts/release/preflight.mjs --mode=publish   # exit 0，plan = ui@2.1.2
node scripts/release/publish-dry-run.mjs --out /tmp/dryrun
node scripts/release/verify-guards.mjs              # 18/18
node scripts/release/verify-changeset-loop.mjs      # 8/8
for g in verify-atoms verify-atom-docs verify-component-inventory verify-doc-drift \
         check-tokens verify-surface-tokens verify-entities verify-package-boundary \
         verify-overlay; do node "scripts/gates/$g.mjs"; done
```

消费者侧（本次实际用的步骤）：

```bash
mkdir -p /tmp/ui-consumer && cd /tmp/ui-consumer
npm init -y && npm i astro@^7.3.6 @marxchou/dogeared-tokens@2.1.2 \
  /path/to/marxchou-dogeared-ui-2.1.2.tgz
# src/pages/index.astro：import tokens CSS + { Badge, Button } from "@marxchou/dogeared-ui"
npx astro build
node docs/_reviews/M5-8/verify-consumer.mjs --root .
```

---

## 10. 附件

`logs/`：`01-consumer-install` · `02-consumer-build` · `03-consumer-verify` · `04-publish-dryrun` ·
`05-trust-attempt` · `06-gates-all` · `07-preflight-publish-mode` · `08-verify-guards` ·
`09-changeset-loop` · `10-verify-workflow` · `11-verify-versions` · `12-ui-smoke-test` ·
`13-npm-pack-ui.json`

`verify-consumer.mjs`：消费者产物断言脚本（28 条判据）。


---

## 11. 首发结果（2026-11-07，PO 选择路径 B）

PO 明确选择 **B**：不重新引入 placeholder/OIDC 引导，直接用账号登录态 token 发布 `2.1.2`，首发接受 no provenance。

### 11.1 写操作

```text
npm login --auth-type=web        -> mifsh，whoami 通过
cd packages/ui && npx npm@11.15.0 publish --access public
  -> + @marxchou/dogeared-ui@2.1.2
  -> registry published 2026-11-07T04:05:20.598Z
```

- `latest` = `2.1.2`；dist-tags 只有 `latest`。
- tarball `dogeared-ui-2.1.2.tgz` 6233 B，HTTP 200。
- 干净消费者：`npm i ... @marxchou/dogeared-ui@2.1.2` → `added 1 package`，读回版本 `2.1.2`。
- `packages/ui/package.json` 保持 `2.1.2`；为 B 尝试过的 `0.0.0-stage` 已用 `git checkout` 还原，没有进入提交。

### 11.2 两个未收口项

1. **Trusted Publisher 未登记**：`npm trust github @marxchou/dogeared-ui --file release.yml --repo Smart-Chou/zcblog-v2 --env npm-publish --allow-publish --allow-stage-publish --yes` 在 WebAuthn 后仍返回
   `403 Forbidden - POST https://registry.npmjs.org/-/package/@marxchou%2Fdogeared-ui/trust`。
   账号 2FA 为 WebAuthn；CLI 的 auth URL 多次过期/回调 404。**这是 npm 账号 2FA 交互未完成，不是包权限或 workflow 配置错误**：`npm access list packages @marxchou` 显示 ui 为 `read-write`。
2. **`0.0.0-stage` 占位**：新包由 registry 自动创建，`dist-tags` 不指向它；`verify-registry` R10 报 `present/window-open`。`unpublish` 同样需要 WebAuthn，本轮未执行。

### 11.3 门禁读数

`node scripts/release/verify-registry.mjs --min-age-hours=0`：

```text
PASS 25 / FAIL 1 / WARN 0 / INFO 1
FAIL R6 @marxchou/dogeared-ui@2.1.2 没有 attestations（provenance 缺失）
INFO R10 @marxchou/dogeared-ui 仍挂着 0.0.0-stage 占位
```

R6 是路径 B 的**预期结果**（PO 已接受 no provenance），不是发布失败；tokens/og-image 的 R6 仍为 SLSA v1。
R10 待有 2FA 的会话清理。

### 11.4 上膛状态

`private:false` 保持不变。**在 Trusted Publisher 登记完成前不要推 `v2.1.2` tag**：`release.yml` 的 OIDC 首发会把 ui 算进 plan，并因没有 trust 而失败。后续版本要么先在 npm UI 完成 trust，要么继续走一次性 token 发布。

### 11.5 下一步（需 PO 在场）

- 在 npmjs.com 包设置里完成 ui 的 Trusted Publisher（GitHub / `Smart-Chou/zcblog-v2` / `release.yml` / `npm-publish` / publish + stage publish），或
- 重新 `npm login --auth-type=web` 后立即完成 `npm trust` 的 WebAuthn，再 `unpublish @marxchou/dogeared-ui@0.0.0-stage`。
