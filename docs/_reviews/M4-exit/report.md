# M4 出口验收（Dogeared 2.1.0 / 2.1.1）

- 日期：2026-11-06
- 结论：**PASS（功能与发布链）**；`2.1.1` README-only patch 已关闭 registry 文档债
- 范围：`@marxchou/dogeared-tokens` + `@marxchou/dogeared-og-image` `2.1.0` 首发、`2.1.1` 文档补丁
- 不发布：`@marxchou/dogeared-ui`（保持 `private:true`，D-0120）
- 生产站：**不切换**（D-0125；`Smart-Chou/zcblog` `origin/main` = `1d6843b`）

## 1. 发布事实

| 项 | 结果 |
| --- | --- |
| 首发 release run | `42175493474`，`success`；提交 `5ccc00b` |
| 2.1.1 release run | `42189584179`，`success`；提交 `5191ccf`；tag `pkg-v2.1.1` |
| 发布方式 | `workflow_dispatch`：`dry_run=false` / `confirm_publish=PUBLISH` / `provenance=false` |
| tokens | `2.1.1`（当前 latest），npm access = `public` |
| og-image | `2.1.1`（当前 latest），npm access = `public` |
| ui | registry 查询 404，未发布 |
| GitHub secret | `npm-publish` environment 内有 `NPM_TOKEN`（值不记录） |

## 2. 门禁证据

- `pnpm gates:all` → `RESULT PASS classified=1108 unclassified=0`
- `verify-guards.mjs` → `15/15 PASS`（G4a/G4b 用临时 workspace；G4e 用 9.9.9 防“已发布版本”导致空 plan）
- `verify-workflow.mjs` → `25/25 PASS`
- `verify-changeset-loop.mjs` → `8/8 PASS`（L8：真仓库三包与 root 同为 `2.1.1`；ui 仍 private）
- `preflight.mjs --mode=publish` → `PASS 33 / FAIL 0 / WARN 0 / INFO 2`；publish-plan 只含
  tokens + og-image（2.1.1）
- `packages/og-image` 测试 → `10/10 pass`
- 最新文档提交 `b7c3a35`：CI / Perf / A11y PR smoke 均 `success`（A11y 首次 apt 卡住，取消重跑成功）

## 3. registry 消费验证

- 空目录安装（npm **10.9.8** 与 **11.15.0** 都验证）：
  `npm i @marxchou/dogeared-tokens@2.1.1 @marxchou/dogeared-og-image@2.1.1` → 成功
- `npm view …@2.1.1 readme` 已显示 `published` 与 `@marxchou` 安装说明（2.1.0 的旧占位已消失）
- `tokens.css` = **11,384 B**；`createOgImageRoute` 可 import
- 2.1.0 `npm pack` 产物：tokens **20,954 B / 8 files**；og-image **12,456 B / 13 files**
- 两个 tarball 均含 `LICENSE`、`NOTICE`、`README.md`；无本机绝对路径、无私钥/token 字面量
- consumer `npm audit` 仍有 **3 moderate**（satori → fflate），属 D-0121 A+ 的已知口径；
  `packages/og-image/README.md` 已提供 npm / pnpm / Yarn 作用域 override 配方

## 4. 残余风险与后续

1. **README 文档债已关闭**：`2.1.1`（run `42189584179`，commit `5191ccf`）已把 tokens /
   og-image 的 README 回填到 registry；`npm view …@2.1.1 readme` 显示 “published” 与
   `@marxchou` 安装说明。本报告主体仍记录 2.1.0 首发事实。
2. **24h 复查**：发布日已即时验证安装；24 小时后需再查一次 registry 可安装性与 404/权限。
3. **`0.0.0-stage` 占位**：npm staged publishing 产生的占位版本仍可查询；`npm stage list` 为空，
   `latest=2.1.1`，不影响安装。清理需要 `npm unpublish` + OTP/单独审批，本次未执行。
4. **provenance 缺失（历史）**：`2.1.0` / `2.1.1` 发布时 repository 为 private，显式关闭；
   2026-11-06 仓库已转 public，下一次发布可切回 `provenance=true`。
5. **token 生命周期**：`NPM_TOKEN` 为 granular token，`2027-02-04` 到期；npm 的 bypass-2FA
   直发限制在 `2027-01` 生效，需在此之前迁移 trusted publishing / staged publishing。
6. **environment 无保护规则（历史）**：private 时期 required reviewers / branch policy 失败；
   仓库已 public，可重试配置，当前仍未加；真发布闸门仍是 `confirm_publish=PUBLISH`。
7. **生产站不切换**：D-0125；本报告不包含生产合并、DNS 或 CF 缓存操作。

## 5. Exit checklist

- [x] 发布 workflow 真跑通过（非 dry-run）
- [x] 首发两包在 registry 可安装（npm 10 / 11）
- [x] 第三方干净安装 + 公开导出验证
- [x] tarball 含 LICENSE / NOTICE / README，文件白名单通过
- [x] 源码 README 已回填实际 scope 与发布状态
- [x] registry 页面 README 回填（`2.1.1` patch release）
- [x] ui 未发布且保持 private
- [x] 生产站未变（`1d6843b`）
- [ ] 发布后 24h registry 复查（发布后运维项，不阻塞本次发布日 PASS）
