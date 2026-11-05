# Changesets

三个包（`@marxchou/dogeared-tokens` / `-ui` / `-og-image`）用 [Changesets](https://changesets.dev)
管理版本，`config.json` 里 `fixed` 把它们锁成一组：**任何一个包 bump，三个包一起 bump 到同一版本**
（M4-C 决策：2.x lockstep；独立版本以后再说）。

## 日常流程

```bash
# 1. 改完包代码，描述这次改动的语义（major / minor / patch）
pnpm changeset                    # 交互式；纯 lockstep 组，只需挑一个包 + 一个 bump 类型
# 或者在非交互环境里直接给：
npx changeset --patch @marxchou/dogeared-tokens -m "描述这次改动"

# 2. 跑发布前检查（版本 lockstep / pack 清单 / LICENSE-NOTICE / 已知阻断项）
pnpm preflight:release

# 3. 版本推进（写 package.json、CHANGELOG.md），提交后打 tag 触发 release workflow
pnpm version-packages
git add -A && git commit -m "chore(release): v2.1.1"
git tag v2.1.1 && git push origin main --tags
```

`pnpm release:packages` = `changeset publish`，**只在 release workflow 里跑**（本地跑需要 npm 登录态，
且会真的写 registry）。本地想验证发布命令用 `pnpm release:packages:dry`，见 `docs/release.md`。

## private 与发布闸门

三个包当前 `"private": true`。`config.json` 的 `privatePackages.version: true` 让 changesets
**仍然给 private 包装版本**（否则 lockstep 一解锁，`.changeset` 就报错），
`privatePackages.tag: false` 让 `changeset publish` **不发布 private 包**。

也就是说：private 状态下的 `changeset publish` 是静默空转。为了不让「静默空转」被当成「发布成功」，
`scripts/release/preflight.mjs --mode=publish` 会在 `private === true` 时**直接硬失败**，
release workflow 的 publish job 第一步就是它。翻转 `private` 是发布卡的事，不在本链路里自动做。

## 已知阻断项

发布前必须清零，否则 `--mode=publish` 会拒绝放行（条目见 `docs/release.md` §「发布前阻断项」）：

- `@marxchou/dogeared-og-image` 只发 TS 源码（`exports["."] → ./src/index.ts`），裸 Node 消费者无法 import。
- `@marxchou/dogeared-tokens` 的 `exports` 没有 `"."`，裸 import 会 `ERR_PACKAGE_PATH_NOT_EXPORTED`。
