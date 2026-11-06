# M5-3 · npm Trusted Publishing（OIDC）验收（2026-11-06）

## 结论

**PASS（配置 + workflow 收口；未发布新版本）**。两个发布包已登记 GitHub Trusted Publisher，
`release.yml` 已移除长期 `NPM_TOKEN` 注入，改用 GitHub OIDC；契约门禁全绿。

## npm Trusted Publisher

| 包 | trust id | 配置 |
|---|---|---|
| `@marxchou/dogeared-tokens` | `10c93ae3-08a7-4256-b945-8b70c8884f65` | `github` / `Smart-Chou/zcblog-v2` / `release.yml` / `npm-publish` |
| `@marxchou/dogeared-og-image` | `4436e077-22ce-409b-ac24-82fb15302eef` | 同上 |

CLI 返回的权限：`publish, stage publish`。`packages/ui` 仍按 D-0120 保持 private，不登记。

### 关键坑

- PATH 里的 `~/.local/bin/npm` 是 **10.9.8**，没有 `trust` 子命令。
- npm **11.12** 的 `npm trust` 因缺少 `--allow-publish` 返回 `400 Bad Request`。
- 成功命令必须使用 **npm >= 11.15.0**：

```bash
npx --yes npm@11.15.0 trust github <pkg> \
  --file release.yml \
  --repo Smart-Chou/zcblog-v2 \
  --env npm-publish \
  --allow-publish --yes
```

## Workflow 变更

`.github/workflows/release.yml`：

- publish job 不再引用 `secrets.NPM_TOKEN`，也不再注入 `NODE_AUTH_TOKEN`。
- 新增 OIDC gate：
  - 检查 `ACTIONS_ID_TOKEN_REQUEST_URL` 和 `ACTIONS_ID_TOKEN_REQUEST_TOKEN` 同时存在；
  - 拒绝 `NODE_AUTH_TOKEN` / `NPM_TOKEN` 环境变量；
  - 扫描 `$HOME/.npmrc`、workspace、runner temp 与 `NPM_CONFIG_USERCONFIG`，只放行 `${NODE_AUTH_TOKEN}` 占位，拦字面 `_authToken`。
- 确保 npm >= **11.15.0**（`--allow-publish` 的硬要求）。
- 保留 `provenance=true` 与失败显式降级路径。

## 门禁证据

```text
node scripts/release/verify-workflow.mjs
→ PASS 28 / FAIL 0

node scripts/release/verify-guards.mjs
→ PASS 17 / FAIL 0

corepack pnpm gates:all
→ RESULT PASS  unclassified=0
```

## 边界

- 未发布新 npm 版本；`latest` 仍是 `2.1.1`。
- `NPM_TOKEN` 仍可作为 environment secret 保留作紧急回滚，但当前 workflow **不读取**。
- 生产站 `marxchou.com` 未切换。
- 下一次真实发布才会实际走 OIDC；届时需要 `dry_run=false` + `confirm_publish=PUBLISH` + `npm-publish` 环境批准。
