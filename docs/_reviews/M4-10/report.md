# M4-10 · 发布闸门 P1 按「发布清单」收敛

- 任务：`t_49fc208e`（M4-10）
- 基线：`ca82d7e`（M4-9 收口后 HEAD）
- 结论：**P1 判定范围收窄到「发布清单」**。`packages/tokens` + `packages/og-image` 翻转 private 后 `preflight --mode=publish` **exit 0**，`packages/ui` 保持 `private:true` 只落 INFO（不再硬失败）；publish-plan 只含两包。`verify-guards` 15/15、`verify-workflow` 24/24、`gates:all` exit 0。
- 边界：未 publish、未创建 dist-tag、未碰 registry、未改 `packages/**`、未改 `.changeset/config.json`、未 commit/push。

---

## 1. 根因（复述实测，不猜）

修复前 `scripts/release/preflight.mjs` 的 P1 是「`loadPackages()` 出来的三包逐个判 private」：

```js
for (const p of packages) {
    if (p.private) {
        if (isPublish) c.fail("P1", `${p.name} 仍是 private:true，禁止发布`, ...);
        else c.info("P1", ...);
    } else c.pass("P1", `${p.name} private:false，可发布`);
}
```

`loadPackages()` 的口径来自 `PACKAGE_DIRS`（三包 lockstep），于是「ui 按 D-0120 永不发布」和「publish 模式禁止任何 private 包」互相打架：tokens/og-image 首发会在 preflight 就停住。

**关键点：这不是 changesets 的问题。** `@changesets/cli@3.0.3` 的 `getPublishPlan` 先 `filter(pkg => !pkg.packageJson.private)`，private 包根本不会进 publish-plan（本次正例实测复证，见 §4-02 的 `plan` 只有两包）。

## 2. 改动

### 2.1 `scripts/release/lib.mjs`：新增发布清单（唯一事实源）

两个常量语义不同，**不合并**：

| 常量 | 值 | 语义 |
| --- | --- | --- |
| `PACKAGE_DIRS`（未改） | tokens / ui / og-image | 三包 lockstep 版本、构建、pack 清单、LICENSE/NOTICE、P 系列检查的口径 |
| `PUBLISH_DIRS`（新增） | `packages/tokens`、`packages/og-image` | 本阶段真要进 registry 的包；只有清单内的包才必须 `private:false` |

同时导出 `isPublishTarget(dir)`，preflight 用它判范围（要改发布范围只改这一处）。

### 2.2 `scripts/release/preflight.mjs`：P1 四组合判定

| 在发布清单内 | `private` | 结果 | 文案 |
| --- | --- | --- | --- |
| 是 | `true` | **FAIL**（publish 模式）/ INFO（check 模式） | 保留原文案 `${name} 仍是 private:true，禁止发布` |
| 是 | `false` | PASS | `${name} private:false，可发布` |
| 否 | `true` | **INFO** | `${name} 不在发布清单内，按 D-0120 本阶段不发布，允许 private` |
| 否 | `false` | **WARN** | `${name} 不在发布清单内却是 private:false（疑似误翻转，请复核）` |

另加一条自洽校验：`PUBLISH_DIRS` 里出现不在 `PACKAGE_DIRS` 的目录 → FAIL（防止两份清单漂移）。
`RELEASE_SUMMARY` 新增两个字段便于 CI 归档：`publishSet`（发布清单）、`privatePackages`（当前 private 的包名）。P5 的空 plan 文案从「三包仍 private」改为「发布清单内的包仍 private」。

### 2.3 `scripts/release/verify-guards.mjs`：G4 断言按新语义重写

- `G4a` 真仓现状（发布清单内两包仍 private）→ publish 模式必拒，正则从 `/private/` 收紧成 `/仍是 private:true，禁止发布/`（不再被 INFO 行误命中）。
- `G4b` 空 plan 必拒（不变）。
- `G4c` check 模式放行 exit 0（不变）。
- **`G4d`（新增）** 临时 workspace 造发布态：`PUBLISH_DIRS` 内的包翻 `private:false`、`packages/ui` 留 `private:true`、放一条 pending changeset → P1 无 FAIL 且 ui 那行是 `[INFO]` 且含 `D-0120`。
- **`G4e`（新增）** 同一 workspace `preflight --mode=publish` → `exit 0`，且 `RELEASE_SUMMARY.publishPlan` 的包名集合**恰好等于** `PUBLISH_DIRS`（ui 不得出现）。
- **`G4f`（新增）** 清单外的包被翻成 `private:false` → 必出 `[WARN] ... 疑似误翻转`（防静默多发一个包）。
- workspace 复用真仓库 `node_modules` 软链，`npx changeset` 不联网装包；副本里跑副本自己的 `preflight.mjs`，真仓只读。

### 2.4 `docs/release.md` / `scripts/release/verify-changeset-loop.mjs`（文档）

- `docs/release.md`：状态段、发布前置条件、§4 步骤、已知阻断项表全部改成「发布清单内的包」口径；新增 §「发布清单（PUBLISH_DIRS）」对照表与四组合说明。
- `verify-changeset-loop.mjs`：只加 2 行注释，记录一个**本卡之前就存在**的红灯（见 §6），无行为改动。

### 2.5 完整 diff

`docs/_reviews/M4-10/diff.patch`（391 行，`git diff -- scripts/release docs/release.md`）。核心两处：

```diff
--- a/scripts/release/lib.mjs
+++ b/scripts/release/lib.mjs
@@ -19,6 +19,18 @@ export const REPO_ROOT = ...
 export const PACKAGE_DIRS = ["packages/tokens", "packages/ui", "packages/og-image"];
 
+// 发布清单（**发布范围的唯一事实源**）。语义与 PACKAGE_DIRS 不同，不要合并：
+//   - PACKAGE_DIRS 是「三包 lockstep / 构建 / pack 检查」的口径 —— 三个包都算；
+//   - PUBLISH_DIRS 是「本次/本阶段真的要进 registry 的包」—— 只有在这里的包才必须 private:false。
+export const PUBLISH_DIRS = ["packages/tokens", "packages/og-image"];
+
+export function isPublishTarget(dir) {
+    return PUBLISH_DIRS.includes(dir);
+}
```

```diff
--- a/scripts/release/preflight.mjs
+++ b/scripts/release/preflight.mjs
-for (const p of packages) {
-    if (p.private) {
-        if (isPublish) c.fail("P1", `${p.name} 仍是 private:true，禁止发布`, ...);
-        else c.info("P1", `${p.name} private:true（检查模式允许；发布前需翻转）`);
-    } else {
-        c.pass("P1", `${p.name} private:false，可发布`);
+for (const dir of PUBLISH_DIRS) {
+    if (!PACKAGE_DIRS.includes(dir))
+        c.fail("P1", `发布清单里的 ${dir} 不在 PACKAGE_DIRS 中（发布清单与三包口径不一致）`, ...);
+}
+for (const p of packages) {
+    if (isPublishTarget(p.dir)) {
+        if (p.private) {
+            if (isPublish) c.fail("P1", `${p.name} 仍是 private:true，禁止发布`, ...);
+            else c.info("P1", `${p.name} private:true（检查模式允许；发布前需翻转）`);
+        } else c.pass("P1", `${p.name} private:false，可发布`);
+    } else if (p.private) {
+        c.info("P1", `${p.name} 不在发布清单内，按 D-0120 本阶段不发布，允许 private`, ...);
+    } else {
+        c.warn("P1", `${p.name} 不在发布清单内却是 private:false（疑似误翻转，请复核）`, ...);
     }
 }
```

## 3. 复现脚本（本次新增，全部只读真仓）

| 脚本 | 作用 |
| --- | --- |
| `docs/_reviews/M4-10/probe-publish-set.sh` | `/tmp` 副本翻 tokens/og-image 两个 private + ui 留 private + 放 pending changeset → 跑副本 preflight |
| `docs/_reviews/M4-10/capture-evidence.sh` | 一次性跑完本报告 §4–§7 的全部命令，输出落 `logs/` |

`capture-evidence.sh` 生成的两份日志 `EXIT` 行即真实退出码。

## 4. 真实命令输出

### 4.1 负向 A：真仓现状（三包仍 private）→ 清单内两包 FAIL、ui INFO、exit 1

```console
$ node scripts/release/preflight.mjs --mode=publish --tag v2.1.0
[FAIL] P1         @marxchou/dogeared-tokens 仍是 private:true，禁止发布
[INFO] P1         @marxchou/dogeared-ui 不在发布清单内，按 D-0120 本阶段不发布，允许 private
[FAIL] P1         @marxchou/dogeared-og-image 仍是 private:true，禁止发布
RELEASE_SUMMARY {...,"ok":false,"counts":{"PASS":31,"FAIL":3,"WARN":0,"INFO":2,"SKIP":0},
  "mode":"publish","tag":"v2.1.0","version":"2.1.0","publishSet":["packages/tokens","packages/og-image"],
  "privatePackages":["@marxchou/dogeared-tokens","@marxchou/dogeared-ui","@marxchou/dogeared-og-image"],...}
01 exit=1
```

`FAIL=3` = P1×2 + P5（空 plan，因真仓没有 pending changeset），与 M4-9 记录一致、均预期。

### 4.2 正向：发布态（两包翻转 + ui private + 有 changeset）→ exit 0，plan 只含两包

```console
$ bash docs/_reviews/M4-10/probe-publish-set.sh
tokens/og-image -> private:false | ui private = True
[PASS] P1         @marxchou/dogeared-tokens private:false，可发布
[INFO] P1         @marxchou/dogeared-ui 不在发布清单内，按 D-0120 本阶段不发布，允许 private
[PASS] P1         @marxchou/dogeared-og-image private:false，可发布
[PASS] P5         publish-plan 有 1 项，发布不会空转
  {"version":1,"plan":[[{"kind":"publish","name":"@marxchou/dogeared-og-image","version":"2.1.0",...},
                        {"kind":"publish","name":"@marxchou/dogeared-tokens","version":"2.1.0",...}]]}
RELEASE_SUMMARY {...,"ok":true,"counts":{"PASS":33,"FAIL":0,"WARN":0,"INFO":2,"SKIP":1},"mode":"publish",
  "publishSet":["packages/tokens","packages/og-image"],"privatePackages":["@marxchou/dogeared-ui"],...}
EXIT=0
02 exit=0
```

要点：**`ok:true` + exit 0**；plan 里只有 `dogeared-og-image` / `dogeared-tokens`，**`@marxchou/dogeared-ui` 不在 plan 内**；`privatePackages` 只剩 ui。这就是验收第 2 条（含 ui 不得出现在 plan）的实测。

### 4.3 负向 B：清单外的 ui 被误翻成 private:false → WARN（不静默通过）

```console
$ node scripts/release/preflight.mjs --mode=publish        # /tmp 副本：三包全翻
[PASS] P1         @marxchou/dogeared-tokens private:false，可发布
[WARN] P1         @marxchou/dogeared-ui 不在发布清单内却是 private:false（疑似误翻转，请复核）
[PASS] P1         @marxchou/dogeared-og-image private:false，可发布
RELEASE_SUMMARY {...,"ok":true,"counts":{"PASS":33,"FAIL":0,"WARN":1,"INFO":1,"SKIP":1},...}
03 exit=0
```

注意这条的 plan 会**多出 ui**（changesets 见非 private 就发）——WARN 是唯一提示，按卡要求不升级为 FAIL（见 §8 残留风险）。

## 5. 闸门自测

```console
$ node scripts/release/verify-guards.mjs
[PASS] G4a  preflight --mode=publish（发布清单内的包仍 private） → exit 1（闸门生效）
[PASS] G4b  preflight --mode=publish（publish-plan 为空 → 静默空转） → exit 1（闸门生效）
[PASS] G4c  同一套判据在 check 模式下放行（exit 0），阻断项只报 WARN
[PASS] G4d  发布态（packages/tokens + packages/og-image 已翻转、ui 留 private）→ P1 全绿，ui 落 INFO（3 条 P1）
            [PASS] P1 @marxchou/dogeared-tokens private:false，可发布
            [INFO] P1 @marxchou/dogeared-ui 不在发布清单内，按 D-0120 本阶段不发布，允许 private
            [PASS] P1 @marxchou/dogeared-og-image private:false，可发布
[PASS] G4e  preflight --mode=publish exit 0，publish-plan 只含 2 包（不含 ui）
            plan=["@marxchou/dogeared-og-image","@marxchou/dogeared-tokens"]
[PASS] G4f  清单外的包被误翻成 private:false → WARN（[WARN] P1 @marxchou/dogeared-ui ... 疑似误翻转，请复核）
[PASS] G1..G3, G5a..G5e, G6 ...
RELEASE_SUMMARY {"title":"负向自检（闸门必须真的会红）","ok":true,"counts":{"PASS":15,"FAIL":0,...},"cases":15}
04 exit=0
```

```console
$ node scripts/release/verify-workflow.mjs
RELEASE_SUMMARY {"title":"release workflow 契约","ok":true,"counts":{"PASS":24,"FAIL":0,...},
 "publishCommand":"changeset publish --from-pack-dir","publishIf":"needs.preflight.outputs.dry_run == 'false'",...}
05 exit=0
```

`verify-workflow.mjs` 里没有任何 P1 计数/文案断言（`grep -n 'P1' scripts/release/verify-workflow.mjs` 无命中），故无需改动；实跑 24/24 仍绿。

## 6. 站点门禁

```console
$ corepack pnpm gates:all
RESULT PASS  classified=1095 unclassified=0 theme=714 overlay=299 exclude=82 plan_baseline=998 delta=+97
06 exit=0
```

（`classified` 从 M4-9 的 1084 涨到 1095，是本次新增的 `docs/_reviews/M4-10/**` 与 scripts 改动被分类器计入，无 unclassified。）

## 7. 顺带发现（不在本卡范围，已文档化）

`node scripts/release/verify-changeset-loop.mjs` 的 **L6（`changeset pack` 产出 3 个 tarball）是红的**，且与本次改动无关 —— 用 HEAD 的干净快照（`git archive HEAD`）复跑同样红：

```console
$ cd <HEAD-snapshot> && node scripts/release/verify-changeset-loop.mjs
[FAIL] L6         changeset pack 没产出三包 tarball
RELEASE_SUMMARY {"title":"changeset 闭环（临时 monorepo）","ok":false,"counts":{"PASS":7,"FAIL":1,...}}
BASELINE_LOOP_EXIT=1
```

根因：M4-6 给包加了 `prepack: node scripts/build.mjs`，而该脚本的临时 monorepo 只拷 metadata 不拷 `node_modules` → 只有 tokens（build 无外部依赖）出了 tarball，ui/og-image 的 prepack 起不来。它不在 `gates:all`、也不在 release workflow 里（CI 装过依赖，pack 正常），不影响 preflight 与首发闸门。已在脚本注释与 `docs/release.md` §8「已知限制」记明，留给单独一张卡修。

## 8. 残留风险与建议

1. **清单外误翻只 WARN、不阻断**：这是卡里指定的语义（WARN = 提示复核）。后果是若有人把 ui 的 private 误删，publish 模式仍会 exit 0，且 changesets 会把 ui 一起发。若 PM 认为该收紧，把 `c.warn` 改成 `isPublish ? c.fail : c.warn` 即可（一行，G4f 断言随之改）。
2. **发布清单是常量不是文件**：改发布范围要动 `lib.mjs`（需过 PR 评审，也算优点）。若将来清单变动频繁，可迁到 `scripts/release/release-set.json`，preflight 与 verify-guards 都从它读，本卡已把读取点收敛到 `PUBLISH_DIRS` / `isPublishTarget` 两处。
3. **P1 只覆盖 private**：publish 模式仍假设「发布清单 = 想发的全部」。若将来出现「清单内某包临时不想发」，应走 changeset 的 skip 或临时改清单，不要靠 private 绕过。

## 9. 产物清单

| 文件 | 说明 |
| --- | --- |
| `scripts/release/lib.mjs` | 新增 `PUBLISH_DIRS` + `isPublishTarget()` |
| `scripts/release/preflight.mjs` | P1 四组合判定 + 清单自洽校验 + SUMMARY 新字段 + P5 文案 |
| `scripts/release/verify-guards.mjs` | G4a 收紧、G4d/G4e/G4f 新增 |
| `scripts/release/verify-changeset-loop.mjs` | 仅注释（记录既有 L6 红灯） |
| `docs/release.md` | 口径与已知限制更新 |
| `docs/_reviews/M4-10/diff.patch` | 完整 diff（391 行） |
| `docs/_reviews/M4-10/probe-publish-set.sh` | 正向探针 |
| `docs/_reviews/M4-10/capture-evidence.sh` | 一条命令复跑全部验收 |
| `docs/_reviews/M4-10/logs/01..06-*.log` | 上文的原始输出 |
