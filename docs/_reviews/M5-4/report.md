# M5-4 · 真实 OIDC 发布验收（2026-11-06）

## 结论

**PASS**。`release.yml` 通过 GitHub OIDC 成功发布 `@marxchou/dogeared-tokens@2.1.2` 与
`@marxchou/dogeared-og-image@2.1.2`；workflow 未读取长期 `NPM_TOKEN`；registry 已显示
provenance（SLSA provenance v1）；干净目录安装通过。

## 事实

| 项 | 值 |
|---|---|
| 发布 run | `42240709462`（success） |
| 版本提交 | `d789581`（`chore(release): 2.1.2 OIDC 发布验收`） |
| workflow 修复 | `431a152`（兼容 setup-node 的 `NODE_AUTH_TOKEN` 占位符） |
| tokens | `2.1.2`，provenance `https://slsa.dev/provenance/v1` |
| og-image | `2.1.2`，provenance `https://slsa.dev/provenance/v1` |
| 干净安装 | `added 33 packages`；两个包均 `2.1.2`；`tokens.css` 存在 |

## 过程中的两个真问题

### 1. setup-node 注入虚假 `NODE_AUTH_TOKEN`

第一次 run `42240111199` 在 `OIDC gate` 失败。日志中的
`NODE_AUTH_TOKEN` 值是 `XXXXX-XXXXX-XXXXX-XXXXX`，不是 npm token，而是
`actions/setup-node` 在未传 token 时的占位符（actions/setup-node#1440）。

修复：

- publish job 移除 `registry-url`，避免 setup-node 再写入占位；
- OIDC gate 明确允许 `XXXXX-XXXXX-XXXXX-XXXXX`，其他任何非空 `NODE_AUTH_TOKEN` 仍然拒绝；
- `.npmrc` 扫描同样放行该占位符。

### 2. registry 传播延迟

发布成功后的最初约 3 分钟，`2.1.2` 的 tarball 仍返回 404，随后自动变为 200；
这不是 publish 失败，也不能用第一次 `npm view` 立即判红。验收应在 tarball 可下载后再下结论。

## 边界

- 未推 `v2.1.2` tag，避免 `push tag` 再次触发 release workflow。
- `npm-publish` environment 中的 `NPM_TOKEN` 仍保留作紧急回滚，但本次 workflow 没有读取。
- `0.0.0-stage` 是历史 staged publishing 占位，仍待 M5-5 只读核查。
- `ui` 未发布（M5-8 另行处理）。
