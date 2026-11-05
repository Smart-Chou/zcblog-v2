# 包边界（`packages/*`）· 判据与用法

> M3-1 产物 · 依据 `blog2.0/docs/21-m3-plan.md` §3（D-0116 范围冻结）· 门禁 `node scripts/gates/verify-package-boundary.mjs`
>
> 这一页是 §3 的**可执行版本**：每条规则都对应一个判据，没有「文档写了但没人检查」的条目。反向也成立——脚本里出现的每条检查都在这里解释为什么存在。

## 1. 今天的结构

```
pnpm-workspace.yaml   packages: ["packages/*"]        ← M3-1 新增，此前无 packages: 字段（单包仓库）
packages/tokens/      @marxchou/zcblog-tokens@2.0.0   private · 空壳（M3-2 迁入 tokens.json / variables.css / tokens.css / build-tokens.mjs）
packages/ui/          @marxchou/zcblog-ui@2.0.0       private · 空壳（M3-3a Badge、M3-3b Button）
packages/og-image/    @marxchou/zcblog-og-image@2.0.0 private · 空壳（M3-4 route factory）
```

`pnpm ls -r --depth -1` 输出 4 个 workspace 项目（根 + 三包），证明 `packages:` 真被 pnpm 识别，而不是只写在文件里。

三包**均为空壳**：没有 `src/`、没有依赖、没有 `exports`。M3-1 只立 seam，不搬任何组件或样式。

## 2. 判据表

| # | 判据 | 命中后果 | 怎么改 |
|---|---|---|---|
| **W0** | `pnpm-workspace.yaml` 有块状 `packages:`；三个包都在成员里；每个 `package.json` 的 `name` 是约定值、`version` 与主题 lockstep、`private: true`、无 `publishConfig` | FAIL | 补/改 manifest；版本与根 `package.json` 一起 bump。新增第四个包必须先走 decision-log（W0 会把它判红） |
| **B1** | 包内不得出现 `~/` 别名 import；相对 import（`./`、`../`）不得解析到包目录之外 | FAIL | 需要站点数据时改由主题侧注入（props / options），或把纯函数搬进包里 |
| **B2** | 包内不得出现 `marxchou` / `mcc.im` / `zcily` / `73b29141`（不区分大小写） | FAIL | 站点身份留在 `src/config/*`（overlay 侧）；包里只允许占位值。**唯一豁免**：`package.json` 的 `"name"` 值——`@marxchou/` 是 npm scope，即包的身份，不是站点身份 |
| **B3** | 每个包的 `dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies` ⊆ 白名单；站内互相引用必须是 `workspace:*`；`og-image` 不得依赖 `tokens` / `ui` | FAIL | 白名单见 §3。要加依赖先改 §2 与脚本里的白名单，并在卡评论写理由（这是放宽边界，走 review） |
| **B4** | 包内任一文件的 sha256 不得等于站点私有文件的 sha256；包内不得出现 `src/data/`、`src/config/`、`public/assets/note/`、`src/assets/qr/` 路径 | FAIL | 数据留在站点侧。样本源：`src/data/**`（整目录）、`src/config/*.ts`（整目录）、`src/assets/qr/*`（整目录）、`public/assets/note/*`（按路径排序取前 10 个） |

汇总行固定为 `RESULT PASS  packages=N violations=0`（N 今天 = 3），FAIL 时为 `RESULT FAIL  packages=N violations=M`，退出码 1。

## 3. 依赖白名单（§3.4 的依赖方向）

| 包 | dependencies | peerDependencies | 理由 |
|---|---|---|---|
| `tokens` | 无 | 无 | 叶节点：只出 CSS/JSON + Node 脚本（`node:fs` 不算依赖） |
| `ui` | 无 | `astro` | 只有 `.astro` 组件，编译由消费者提供 |
| `og-image` | `satori`、`sharp` | `astro` | 出图需要；**不得**依赖 `tokens`/`ui`，主题色以 `options.theme` 传入 |

白名单是「允许集合」，不是「必须存在」：空壳三包今天声明 `{}` 就合法（⊆ 白名单）。`ui`/`og-image` 现在只声明 `astro` peer，与 §3.2「只依赖 astro 作为 peer」一致。

## 4. 跑法

```bash
node scripts/gates/verify-package-boundary.mjs              # 本地 / CI 同一条
node scripts/gates/verify-package-boundary.mjs --root /tmp/copy   # 对副本跑（负向测试用）
corepack pnpm gates:boundary                                # 同上，走 package.json 脚本
```

CI：`.github/workflows/ci.yml` 的 `contract` job（源码级契约，不读 `dist`、不需要构建），与 `check-tokens` / `surface-tokens` / `entities` 同源。

## 5. 已知边界（脚本**不**覆盖什么）

1. **不解析 AST**：按行正则匹配。注释、文档字符串里的 `~/xxx` 也会判红——宁可误报，不要漏报。
2. **只扫文本扩展名**（`.astro .ts .tsx .js .mjs .cjs .json .css .md .yaml .yml .txt`）。二进制文件只由 B4 的 sha256 覆盖，不做内容语义判断。
3. **不管 CSS `url("/...")` 指向站点资源**：token 包迁出后的样式正确性由 `check-tokens.mjs`（G-T1–G-T4，逐字节比对）与 M3-2 的构建产物断言负责。
4. **不检查「包有没有被站点引用」**：M3-2/M3-3a 起才存在消费者；引用有效性由 `astro check` + 构建负责。
5. **workspace 文件用手写解析**：只支持块状序列 + `<dir>/*` glob。写成行内数组（`packages: ["packages/*"]`）或 `packages/**` 会直接 FAIL 并说明原因，而不是静默不展开。
6. **B2 的 `name` 豁免是刻意留的口子**：如果将来包要发布到不带个人 scope 的 npm 组织，改 `name` 即可，不需要动 B2；但 `name` 之外任何位置（`description`、`author`、`repository`、代码注释）出现个人串都算泄漏。

## 6. 锁文件为什么没有变化

三包没有依赖，pnpm（12.10.1）不会为它们写 `importers` 条目——`pnpm install --lockfile-only` 后 `pnpm-lock.yaml` 逐字节不变，`pnpm install --frozen-lockfile` 仍通过（`Scope: all 4 workspace projects`）。M3-2 起包内出现真实依赖时，`importers` 才会多出 `packages/tokens:` 这类段落，届时锁文件必须一起提交。

## 7. 回滚

```bash
git checkout pnpm-workspace.yaml
rm -rf packages scripts/gates/verify-package-boundary.mjs docs/package-boundary.md
git checkout package.json .github/workflows/ci.yml
corepack pnpm install --lockfile-only   # 若锁文件有 diff 一并回滚
```

站点构建、`dist` 产物、门禁基线均不受影响：M3-1 没有改动 `src/**`、`public/**`、`astro.config.mjs`。
