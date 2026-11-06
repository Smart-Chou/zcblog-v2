# M4 出口验收（Dogeared 2.1.0）

- 日期：2026-11-06
- 结论：**PASS（发布日验收）**
- 范围：`@marxchou/dogeared-tokens@2.1.0` + `@marxchou/dogeared-og-image@2.1.0`
- 不发布：`@marxchou/dogeared-ui@2.1.0`（D-0120，保持 `private:true`）
- 生产站：**不切换**（D-0125；`Smart-Chou/zcblog` `origin/main` = `1d6843b`）

## 1. 发布事实

| 项 | 结果 |
| --- | --- |
| release run | `42175493474`，`success` |
| 发布提交 | `5ccc00b` |
| 发布方式 | `workflow_dispatch`：`dry_run=false` / `confirm_publish=PUBLISH` / `provenance=false` |
| tokens | `2.1.0`，npm access = `public`，integrity `sha512-se9TRe+…` |
| og-image | `2.1.0`，npm access = `public`，integrity `sha512-Kjw4tduy…` |
| ui | registry 查询 404，未发布 |
| GitHub secret | `npm-publish` environment 内有 `NPM_TOKEN`（值不记录） |

## 2. 门禁证据

- `pnpm gates:all` → `RESULT PASS classified=1107 unclassified=0`
- `verify-guards.mjs` → `15/15 PASS`（G4a/G4b 已改为临时 workspace，发布后不再依赖真仓 `private` 状态）
- `verify-workflow.mjs` → `25/25 PASS`
- `verify-changeset-loop.mjs` → `8/8 PASS`（L8：真仓库仍 `2.1.0`；ui 仍 private）
- `preflight.mjs --tag ''`（check 模式）→ `PASS 32 / FAIL 0 / WARN 1 / INFO 2`；`publish-plan` 为空属预期（2.1.0 已上 registry）
- `packages/og-image` 测试 → `10/10 pass`
- 最新文档提交 `53014b5` 的 CI / Perf / A11y PR smoke 均 `success`

## 3. registry 消费验证

- 空目录安装（npm **10.9.8** 与 **11.15.0** 都验证）：
  `npm i @marxchou/dogeared-tokens@2.1.0 @marxchou/dogeared-og-image@2.1.0` → 成功
- `tokens.css` = **11,384 B**；`createOgImageRoute` 可 import
- `npm pack` 产物：tokens **20,954 B / 8 files**；og-image **12,456 B / 13 files**
- 两个 tarball 均含 `LICENSE`、`NOTICE`、`README.md`；无本机绝对路径、无私钥/token 字面量
- consumer `npm audit` 仍有 **3 moderate**（satori → fflate），属 D-0121 A+ 的已知口径；
  `packages/og-image/README.md` 已提供 npm / pnpm / Yarn 作用域 override 配方

## 4. 残余风险与后续

1. **24h 复查**：发布日已即时验证安装；24 小时后需再查一次 registry 可安装性与 404/权限。
2. **`0.0.0-stage` 占位**：npm staged publishing 产生的占位版本仍可查询；`npm stage list` 为空，
   `latest=2.1.0`，不影响安装。清理需要 `npm unpublish` + OTP/单独审批，本次未执行。
3. **provenance 缺失**：repository 为 private，发布时显式关闭；转 public 后可切回。
4. **token 生命周期**：`NPM_TOKEN` 为 granular token，`2027-02-04` 到期；npm 的 bypass-2FA
   直发限制在 `2027-01` 生效，需在此之前迁移 trusted publishing / staged publishing。
5. **environment 无保护规则**：仓库 private + GitHub Free，required reviewers / branch policy
   不可用；当前真发布闸门是 workflow input `confirm_publish=PUBLISH`。转 public 后应补审批。
6. **生产站不切换**：D-0125；本报告不包含生产合并、DNS 或 CF 缓存操作。

## 5. Exit checklist

- [x] 发布 workflow 真跑通过（非 dry-run）
- [x] 首发两包在 registry 可安装（npm 10 / 11）
- [x] 第三方干净安装 + 公开导出验证
- [x] LICENSE / NOTICE / README / 文件白名单通过
- [x] ui 未发布且保持 private
- [x] 生产站未变（`1d6843b`）
- [ ] 发布后 24h registry 复查（发布后运维项，不阻塞本次发布日 PASS）
