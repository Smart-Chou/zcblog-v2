# M4-1 · 包元数据与法务（Dogeared）

- 卡：`t_e5056617` · M4-1（计划见 `blog2.0/docs/23-m4-plan.md` §4/§5）
- 日期：2026-11-06 02:30 CST · 基线 commit `888555d`（`main`）
- 结论：**三包已具备「可发布但尚未发布」的元数据与法务材料；本卡未执行任何 publish，`private` 仍为 `true`，版本仍为 `2.1.0`。**
- 发布凭据现状（只读核查，未打印任何 token）：`npm whoami` → `npm error need auth`（ENEEDAUTH），所以本卡也确实发不出去；scope 权限验证留给 M4-4。

## 1. 三包元数据

| 字段 | tokens | ui | og-image |
| --- | --- | --- | --- |
| `name` | `@marxchou/dogeared-tokens` | `@marxchou/dogeared-ui` | `@marxchou/dogeared-og-image` |
| `version` | `2.1.0`（未改） | `2.1.0`（未改） | `2.1.0`（未改） |
| `private` | `true`（未改） | `true`（未改） | `true`（未改） |
| `license` | MIT | MIT | MIT |
| `description` | 补写（英文，去内部文档引用） | 补写 | 补写 |
| `repository` | `Smart-Chou/zcblog-v2` + `directory: packages/tokens` | 同（`packages/ui`） | 同（`packages/og-image`） |
| `homepage` | `…/tree/main/packages/tokens#readme` | 同 ui | 同 og-image |
| `bugs` | `…/zcblog-v2/issues` | 同 | 同 |
| `files` | `tokens.json` `tokens.css` `variables.css` `scripts/build-tokens.mjs` `README.md` `LICENSE` `NOTICE` | `src` `README.md` `LICENSE` `NOTICE` | `src` `README.md` `LICENSE` `NOTICE` |
| `exports` | `./tokens.json` `./tokens.css` `./variables.css` `./scripts/build-tokens.mjs` `./package.json`（无 `.` 入口：本包无 JS 入口） | `.`（`types`/`import`/`default`）+ `./Badge.astro` + `./Button.astro` + `./package.json`（补 `Button` 条目） | `.`（`types`/`import`/`default`）+ `./package.json` |
| `main`/`module`/`types` | 不设（无 JS 入口，设了就是假入口） | 均 `./src/index.ts`（真实入口，Astro/Vite 解析 TS 与 `.astro`） | 均 `./src/index.ts` |
| `sideEffects` | `["**/*.css"]`（CSS 包，禁止被 tree-shake） | `false` | `false` |
| `engines.node` | `^22.0.0 \|\| ^24.0.0` | 同 | 同 |
| `bin` | `dogeared-tokens-build` → `./scripts/build-tokens.mjs`（由 `zcblog-tokens-build` 更名，仓库内无调用点） | — | — |
| `peerDependencies` | — | `astro ^7.3.6` | `astro ^7.3.6` |
| `dependencies` | — | — | `satori ^0.26.0`、`sharp ^0.35.5` |
| `publishConfig` | **未加** | **未加** | **未加** |

`engines` 依据仓库 CI：`ci.yml` / `deploy-matrix.yml` 用 Node 24，`deploy.yml` / a11y / perf 用 Node 22。

## 2. 打包清单（`npm pack --dry-run`）

> 根 `package.json` 没有 `workspaces` 字段（workspace 用 `pnpm-workspace.yaml`），npm 因此报
> `npm error No workspaces found: --workspace=@marxchou/dogeared-tokens`。
> 等价做法：在包目录内执行 `npm pack --dry-run --json`，tarball 内容与 `files` 语义完全一致。

| 包 | 文件数 | packed | unpacked | tarball |
| --- | --- | --- | --- | --- |
| tokens | 8 | 20,043 B（19.6 KB） | 68,511 B | `marxchou-dogeared-tokens-2.1.0.tgz` · `d46678808f56d86f39ac6fa60098ff1fdd849340` |
| ui | 7 | 4,707 B（4.6 KB） | 10,059 B | `marxchou-dogeared-ui-2.1.0.tgz` · `82594f57251a88347140d63634cc368095eb77ac` |
| og-image | 7 | 9,116 B（8.9 KB） | 25,675 B | `marxchou-dogeared-og-image-2.1.0.tgz` · `5e0e630ffa5f41987f1b4b9cd2cb89bc252a3275` |

### tokens（8）

| 文件 | 字节 |
| --- | --- |
| `LICENSE` | 1,065 |
| `NOTICE` | 1,788 |
| `README.md` | 2,422 |
| `package.json` | 1,310 |
| `scripts/build-tokens.mjs` | 25,526 |
| `tokens.css` | 11,384 |
| `tokens.json` | 18,214 |
| `variables.css` | 6,802 |

### ui（7）

| 文件 | 字节 |
| --- | --- |
| `LICENSE` | 1,065 |
| `NOTICE` | 1,788 |
| `README.md` | 2,425 |
| `package.json` | 1,205 |
| `src/Badge.astro` | 1,527 |
| `src/Button.astro` | 1,634 |
| `src/index.ts` | 415 |

### og-image（7）

| 文件 | 字节 |
| --- | --- |
| `LICENSE` | 1,065 |
| `NOTICE` | 1,788 |
| `README.md` | 2,962 |
| `package.json` | 1,312 |
| `src/index.ts` | 284 |
| `src/route.ts` | 15,534 |
| `src/types.ts` | 2,730 |

三份清单同一口径核查（`grep -nE 'node_modules|\.env|/Users|test|spec|\.map'`）：**0 命中** —— 无 `node_modules`、无测试、无源 map、无 `.env`、无本机路径。

## 3. 校验输出

```text
$ node scripts/gates/verify-package-boundary.mjs
W0  workspace 骨架（packages: / 三包 manifest / lockstep） PASS  0 项
B1  包内 `~/` 别名 import = 0、相对路径不越界              PASS  0 项
B2  包内站点身份串（marxchou/mcc.im/zcily/73b29141）= 0    PASS  0 项
B3  依赖 ⊆ 白名单 + 站内引用 workspace:*                   PASS  0 项
B4  站点私有数据不进包（sha256 51 个样本）                  PASS  0 项
RESULT PASS  packages=3 violations=0 theme_version=2.1.0

$ node scripts/gates/check-tokens.mjs
G-T1…G-S6 共 10 门 · 10/10 PASS · 0 FAIL

$ npm run gates:all
exit=0；9 条门禁链全 PASS（atoms 18/18、docs、inventory、drift、tokens 10/10、
surfaces、entities 9/9、package-boundary、overlay）——无一条因本卡改动转红。

$ ./node_modules/.bin/prettier --check --ignore-unknown packages/*/package.json packages/*/README.md NOTICE LICENSE
All matched files use Prettier code style!

$ ./node_modules/.bin/tsc --noEmit
exit=0

$ grep -rn "/Users/\|chowcong\|/home/" packages --exclude-dir=node_modules
0 命中
```

## 4. 决策与偏离（需审阅者知情）

1. **`files` 里保留 `scripts/build-tokens.mjs`**：卡面白名单写的是「dist/src 入口 + tokens 的 json/css + README/LICENSE/NOTICE」。编译器是本包唯一的可执行入口（`bin` 与 `./scripts/build-tokens.mjs` 导出），删掉会打断 `npx dogeared-tokens-build`。按「入口」处理，已在此说明。
2. **README 用 `@<npm-scope>` 占位而非写死 scope**：`verify-package-boundary.mjs` 的 B2 把包内任何含 `marxchou` 的文本判为站点身份泄漏（唯一豁免是 `package.json` 的 `name`）。README 是 `.md`（B2 扫描），写实 scope 会直接把门禁打红。故 README 统一写成 `@<npm-scope>/dogeared-*`，并在文中指向 `package.json` 的 `name` 说明如何替换。发布前若想把真实 scope 写进 README，需要同步放宽 B2（给包自身 scope 加豁免），那属于门禁改动，不在本卡边界内。
3. **每包复制 `LICENSE` + `NOTICE`**：实测 npm **不会**把仓库根的 LICENSE/NOTICE 带进 tarball（首次 `npm pack --dry-run` 只有 6 个文件，无 LICENSE）。MIT 要求副本随分发携带，故三包各放一份逐字节副本（sha256 与根文件一致，已核对）。**副作用**：根 LICENSE/NOTICE 将来改动需同步这三份副本；建议 M4-4 增加一条 sha256 一致性门禁（本卡不改 `scripts/`）。
4. **不写 `publishConfig`**：卡面允许写 `access: public`，但 `verify-package-boundary.mjs` 的 W0 明确「`publishConfig` 存在即 FAIL（M3 不发布）」。保持门禁绿优先，故不写；`--access public` 由 M4-4 在 publish 命令上显式传入，M4-4 落地时再决定是否放宽 W0。
5. **tokens 不设 `main`/`module`/`types`**：本包没有 JS 入口（只有 JSON/CSS 与编译器），设了就是假入口；`exports` 已把三份 style/json 与编译器显式暴露。
6. **`bin` 更名** `zcblog-tokens-build` → `dogeared-tokens-build`：与 D-0119 命名对齐；全仓无调用点（已 grep），属于发布前最后一次改名窗口。
7. **包内 `.astro`/`.ts` 作为发布入口**：ui / og-image 没有构建产物（`dist` 不存在），`main`/`types` 指向 `src/index.ts` 是事实入口，需由 Astro/Vite 消费。M4-2/M4-3 的干净消费者测试会验证这一点；若届时发现必须预编译，那是 M4-2/M4-3 的结论，不在本卡擅改。

## 5. 变更文件（14）

| 类型 | 文件 |
| --- | --- |
| 修改（3） | `packages/tokens/package.json`、`packages/ui/package.json`、`packages/og-image/package.json` |
| 新增 README（3） | `packages/{tokens,ui,og-image}/README.md` |
| 新增 LICENSE 副本（3） | `packages/{tokens,ui,og-image}/LICENSE`（= 根 LICENSE，sha256 一致） |
| 新增 NOTICE 副本（3） | `packages/{tokens,ui,og-image}/NOTICE`（= 根 NOTICE，sha256 一致） |
| 新增根 NOTICE（1） | `NOTICE`（Shirone 借鉴声明 + 第三方依赖许可表） |
| 本报告（1） | `docs/_reviews/M4-1/report.md` |

`git diff --stat`（仅跟踪文件）：`3 files changed, 77 insertions(+), 9 deletions(-)`；加上未跟踪的 11 个新文件共 **14**。
超 10 的口径说明：卡面允许「README/NOTICE 新增可适当超」，本卡超出部分为 **3 个 LICENSE 副本**（npm 不自动携带根 LICENSE 的硬约束，见 §4.3）。

## 6. 边界确认

- 只改 `packages/**`、根 `NOTICE`、`docs/_reviews/M4-1/**`；**未改**站点代码、`scripts/**`、根 `package.json`、版本号。
- **未执行** `npm publish`（含 `--dry-run`）、未改生产、未 commit、未 push。
- 三包 `private: true`、`version: 2.1.0` 原样保留。

## 7. 留给后续卡

- **M4-2**：`npm pack` + 干净消费者 install，验证 `tokens.css` 字节一致（本卡 tarball 已含 `tokens.css` 11,384 B）。
- **M4-4**：`--access public`、是否引入 `publishConfig`、scope 权限验证、LICENSE/NOTICE 副本同步门禁、README 是否写实 scope。
- **M4-5**：第三方安装后的 `/Users/...`、`zcblog-v2` 等本机字符串扫描（本卡只扫了包内源文件，0 命中）。
