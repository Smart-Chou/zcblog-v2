# M4-9 · og-image satori 依赖告警清零（GHSA-wx4j-mvgx-mqwp）

- **结论：PASS（含 1 条 PO 决策点）** —— `satori` 从 `^0.26.0` 抬到 `^0.63.2` 后，M4-5 的 P2 告警（improper SVG escaping，作用于我们**真正执行**的渲染路径）已消除；但 `npm audit` **做不到 0 moderate**：satori 死钉 `fflate@0.7.3`，其 `GHSA-px8p-9vwx-vf98` 在整个 satori 历史版本里都不受影响区间之外，包侧无解。给出并实测了消费者侧一行 `overrides` 的解法（0 vulnerabilities、出图逐字节不变），是否接受「文档化 + 消费者覆写」需 PO 决策（§6）。
- 执行：blog-platform / 2026-11-06 03:40–04:10 (+08:00)
- 基线：仓库 HEAD `54a1d54`（M4-4 后），工作树**不干净**——`scripts/release/*`、`docs/release.md` 及 `docs/_reviews/M4-10/` 有其它任务的未提交改动（见 §7 边界）。本任务只改 `packages/og-image/**`、`docs/_reviews/M4-9/**`，并按要求把根 `package.json` 当 deviation 一并改（§5）。
- 未 publish、未改 `private`、未 commit/push、未部署。

---

## 1. 改了什么

| 文件 | 改动 | 说明 |
| --- | --- | --- |
| `packages/og-image/package.json` | `satori: "^0.26.0"` → `"^0.63.2"` | 0.x caret 只允许补丁位，**下限就是消费者拿到的版本**；`0.33.5` 是脱离 GHSA 区间的第一版，直接到最新 `0.63.2` |
| `packages/og-image/src/route.ts` | 根节点 `style` 增加 `boxSizing: "border-box"`（+ 4 行注释说明） | **升级引入的真实回归**：satori ≥0.27 把根盒模型改成 CSS 默认的 `content-box`，`width/height:100%` 把 1200×630 画布撑成 **1382×758**（1200+padding 176+border 6 / 630+padding 128），页脚行与右下装饰点被裁出画布（§3.2 实证）。显式 `border-box` 在 0.26 上是**空操作**（§4.1 逐字节证明） |
| `packages/og-image/test/smoke.test.mjs` | `GOLDEN` 重定标：`49,283 / 8e6c490e…` → `49,574 / 6b9d8762…`，测试名与失败文案去掉「与 M4-3 相同」的措辞，注释里写明换版本时该怎么量 | 升级必然改 PNG，golden 必须跟着重定标；同时把「不要只改数字」的要求写进注释 |
| `packages/og-image/README.md` | 新增 `## Dependency and audit notes` | 面向消费者：下限为什么是 0.63.2、box-sizing 行为差异、fflate 残余告警 + 一行 override 配方 |
| **deviation** 根 `package.json` | `satori: "^0.26.0"` → `"^0.63.2"` | 站点是同一暴露面（`src/integrations/og-image-route.ts` 直接 import `packages/og-image/src`，satori 由根 node_modules 解析）。不改根 → 站点留旧版、包要新版，pnpm 会装两份 satori |
| **deviation** `pnpm-lock.yaml` | 随根 `package.json` 重算（`pnpm install --lockfile-only`）：satori 0.26.0→0.63.2，+`fflate@0.7.3`、+`harfbuzzjs@0.10.0`，−`yoga-layout@3.2.1` | 只动了 19+/13- 行，无其它漂移；不更新会让 `--frozen-lockfile` 的 CI 直接红 |

`npm audit` 在干净消费者里**对有版本号的依赖面**的实测结果见 §5。

---

## 2. 版本选择：为什么不是 `^0.33.5`

| 候选 | 告警 | 版式 | 判定 |
| --- | --- | --- | --- |
| `^0.26.0`（现状） | GHSA-wx4j-mvgx-mqwp（0.0.27–0.33.4，**no fix available**） | 基准 | 告警落在我们**真实使用**的路径上（标题/摘要进 SVG 前转义），M4-5 判 P2 |
| `^0.33.5`（告警下限） | 该告警消失；fflate 告警接手 | 实测版式**与 0.26 完全一致**（§4.2 带宽全同、装饰点/分隔线俱在） | 作为「最小变动」可选，但 0.x caret 会把消费者永久钉在 0.33.x，且字体排版引擎/解析器落后 30 个小版本 |
| `^0.63.2`（registry latest） | 同上（fflate 残余） | 版式一致，但**默认盒模型已改**，需要 `boxSizing` 一行修复（§3.2） | **采用**：最新解析器 + 安全修复齐全；唯一行为差异已定位并修掉 |

satori `≥0.33.5` 的所有版本（0.33.5 / 0.34 / 0.40 / 0.45 / 0.50 / 0.55 / 0.58 / 0.60 / 0.61 / 0.62 / 0.63.0 / 0.63.2）依赖里 `fflate` 全部写死 `0.7.3`，`harfbuzzjs` 全部 `0.10.0`——即**没有任何 satori 版本能同时清净两条告警**。

---

## 3. 升级回归的定位过程（为什么必须加 boxSizing）

### 3.1 症状

直接把范围抬到 0.63.2（不动代码）后，同一 fixture 出图从 48,269 B 掉到 **42,289 B**，肉眼可见两个元素消失：

- 页脚整行（分隔线 + 域名 + 站点名）不见了；
- 右上 280 px 装饰圆不见了。

### 3.2 根因：根节点盒模型默认值变了

从出图 SVG 里读根矩形即可定性：

```console
# satori 0.63.2，box-sizing 未声明
<rect x="0" y="0" width="1376" height="758" ...>   ← 画布被撑成 1382×758
# 计算：1200 + (88+88) padding + 6 borderLeft = 1382 ；630 + (72+56) = 758

# satori 0.63.2 + boxSizing:"border-box"
<rect x="0" y="0" width="1194" height="630" ...>   ← 回到画布尺寸（1194 = 1200-6 border）
```

页脚靠 `flexGrow:1` 撑到底部，一旦容器变成 758 高，它就落到画布外被裁掉；装饰圆 `top:-60/right:-60` 同理。**不是** 绝对定位能力退化：`top/right/bottom/left` 四种写法在 0.26 与 0.63.2 下产出的 SVG 逐字符相同（`abs.mjs` 探针，5 个色点位置全同）。

### 3.3 附带影响

desc 从两行变一行，也是同一个根因：内容宽度从 1194 变 1206（1382-176），拉丁摘要刚好挤进一行。修复 box-sizing 后行数、带宽全部回到原值。

---

## 4. PNG 一致性结论（本次最关键的验收项）

方法：**同一份 fixture、同一份字体文件（仓库 `.astro/fonts` 的两张 Noto Sans SC）、同一个 sharp `0.35.5`**，只让 `satori` 版本不同。基线用「新代码 + satori 0.26.0」跑出，并先证明它等于 M4-5/M4-6 的旧 golden（`8e6c490e…` / `96e6b064…`），因此差异可以 100% 归因到 satori。

### 4.1 新代码在 0.26 上是空操作（回滚/共存安全）

| fixture | 旧代码 + 0.26.0（M4-5/M4-6 golden） | 新代码 + 0.26.0 | 结论 |
| --- | --- | --- | --- |
| 包测试固定输入（M4-3） | 49,283 B / `8e6c490e…` | 49,283 B / `8e6c490e…` | **逐字节相同** |
| hello（M4-5 fixture） | 48,269 B / `96e6b064…` | 48,269 B / `96e6b064…` | **逐字节相同** |

→ `boxSizing: "border-box"` 在 0.26 下不改变任何像素：站点即使在处理期间仍跑 0.26，也不会因为这次代码改动而变图。

### 4.2 三版 satori 横向对比（同 fixture）

| fixture | 0.26.0 | 0.33.5 | 0.63.2（终态） |
| --- | --- | --- | --- |
| hello | 48,269 / `96e6b064…` | 48,280 / `f280f3e7…` | **48,283 / `55867f8b…`** |
| cjk-long（18 字截断） | 49,910 / `e201004c…` | 49,924 / `ebe8e9c7…` | **50,293 / `b4aab448…`** |
| latin（97 字标题） | 59,723 / `c5472cc4…` | 59,643 / `06c8aa75…` | **59,869 / `09e87acc…`** |

**结论：PNG 不再逐字节一致**（M4-6 的「三路径同 sha256 8e6c490e…」对 0.63.2 已失效，包内 golden 已重定标为 `6b9d8762…` / 49,574 B）。差异性质如下（不是「只报仍然绿」）：

**① 版式零变化（结构性证据）**：逐行非底色像素带（忽略左侧 6 px 竖条）在三个 fixture 上**全部一致**：

```console
# 包测试固定输入
0.26.0 : [y0-219 px69365] [y244-270 px7872] [y523 px1018 分隔线] [y554-581 px2048 页脚]
0.63.2 : [y0-219 px69544] [y244-270 px7864] [y523 px1018 分隔线] [y554-581 px2066 页脚]
# hello fixture：两版完全相同 [y0-219 68945][y245-270 6941][y282-302 431][y523 1018][y554-581 ~2170/2200]
```

标题基线、强调下划线（y208-211 / x94-193，396 px）、分隔线（y523，1018 px 宽）、页脚基线（y554-581）、右下金色装饰点（y574-579 / x1104-1111，42 px）**位置与像素数全同**；换行位置、截断位置不变。

**② 差异只落在字形 advance 的亚像素漂移上**：

| fixture | 差异像素 | 占比 | 最大通道差 | 差异包围盒 |
| --- | --- | --- | --- | --- |
| hello | 10,125 | 1.34 % | 135 | x279-1111 / y245-573（摘要 + 页脚） |
| cjk-long | 4,200 | 0.56 % | 86 | x940-1111 / y96-573（装饰圆边缘 + 页脚） |
| latin | 35,951 | 4.76 % | 227 | x158-1111 / y97-573 |
| 包测试固定输入 | 5,591 | 0.74 % | 227 | x189-1110 / y124-573 |

可量的漂移：拉丁摘要行「宽」从 974 px 变 967 px（106 字符累计 −7 px ≈ −0.066 px/字符），拉丁长摘要 951→947 px；**起点不变**（x=94/96），换行不变。hello 的 CJK 标题区（y0-219）在两版下**像素完全相同**（69,945/68,945 计数一致），即中文字形本身没有重绘。

**③ CJK 无 tofu**：1200×630，视觉复核旧/新两版（`artifacts/og-*-satori-0.26.0.png` 与 `0.63.2.png`）——9 个中文字、全角冒号、拉丁、省略号全部完整成形，无方框、无缺笔、无字体回退。

**④ 站点真实调色板的 gradient 路径**（`linear-gradient(135deg,#0d1117 0%,#161b22 40%,#0f1419 100%)`）：5 个采样点（含 4 个背景点、1 个标题点）颜色**完全一致**（`#151a21`/`#11161c`/`#141920`/`#f0f0f0`）；全画布 51,347 px 有差异，但其中 45,816 px 只差 1–2 个色阶（渐变 dithering 重新分布），最大差 44（渐变带边界），平均差 2.65 —— 肉眼不可辨。**渐变没有被渲染成纯色或反向**。

**⑤ 三条出图路径仍然逐字节一致**（用终态 tarball 重测，见 §5.2）：裸 Node / Astro 预渲染 / esbuild bundle → 三个 fixture 全部同 sha。

---

## 5. 干净消费者验收（终态 tarball，`packages/og-image` 打完 README 后的产物）

环境：macOS 15.7.7 x86_64 · **node v26.0.0 / npm 11.12.1**（与 M4-5 同工具链）· registry `https://registry.npmjs.org/`

### 5.1 装完即体检

```console
$ mkdir consumer && cd $_ && npm init -y && npm i /…/pack-final/marxchou-dogeared-og-image-2.1.0.tgz
added 32 packages in 6s
$ npm ls satori sharp
consumer-cfinal@0.0.0
└─┬ @marxchou/dogeared-og-image@2.1.0
  ├── satori@0.63.2          ← 不再被 0.x caret 钉在 0.26.0
  └── sharp@0.35.5
```

### 5.2 `npm audit`：告警从「渲染路径上可利用」变成「不可达的传递依赖」

```console
$ npm audit
# npm audit report

fflate  0.7.0 - 0.7.4
Severity: moderate
fflate unzipSync can enter an infinite loop when parsing malformed ZIP64 archives
https://github.com/advisories/GHSA-px8p-9vwx-vf98
No fix available
node_modules/fflate
  satori  >=0.33.0
  Depends on vulnerable versions of fflate
    @marxchou/dogeared-og-image
    Depends on vulnerable versions of satori

3 moderate severity vulnerabilities
```

- **GHSA-wx4j-mvgx-mqwp 已消失**（`satori 0.0.27 - 0.33.4` 那条不再出现）。
- 剩下的 3 条 moderate 是**同一条 fflate 告警**在依赖链三级（fflate / satori / 本包）上被 npm 分别计数，不是三个不同问题。
- 可达性：satori 0.63.2 只从 fflate 引入 `inflateSync`（`import{inflateSync as wd}from"fflate"`，用于 WOFF-**1** 表的解压）；该告警针对的是 `unzipSync`（畸形 ZIP64）。我们的入口传的是 OTF/WOFF-2 字体，`unzipSync` 在整条渲染路径上**不可达**。
- 「No fix available」是上游造成的：satori 把 `fflate` 精确钉在 `0.7.3`，从 0.33.5 到 0.63.2 一路没动（§2），包侧无法通过抬范围解决。

### 5.3 一行 override → **0 vulnerabilities**，出图不变

```console
$ cat package.json
{ "overrides": { "fflate": "^0.7.5" } }
$ npm i /…/pack-final/marxchou-dogeared-og-image-2.1.0.tgz
$ npm ls satori fflate
└─┬ @marxchou/dogeared-og-image@2.1.0
  └─┬ satori@0.63.2
    ├─┬ @shuding/opentype.js@1.4.0-beta.0
    │ └── fflate@0.7.5 deduped
    └── fflate@0.7.5 overridden
$ npm audit
found 0 vulnerabilities
```

该消费者出图与未覆写时**逐字节相同**：`55867f8b…` / `b4aab448…` / `09e87acc…`（三个 fixture）。配方已写进包 README。

### 5.4 三条出图路径（终态 tarball，全部 satori 0.63.2）

| 路径 | hello | cjk-long | latin |
| --- | --- | --- | --- |
| 裸 Node（无 astro，`createOgImageRoute` 直调） | 200 / 48,283 B / `55867f8b…` | 200 / 50,293 / `b4aab448…` | 200 / 59,869 / `09e87acc…` |
| Astro 预渲染（`astro build` → `dist/og/*.png`，Astro 7.4.1，字体从 CDN 现下 16.8 MB） | 48,283 / `55867f8b…` | 50,293 / `b4aab448…` | 59,869 / `09e87acc…` |
| esbuild 单文件 bundle 后直调 | 48,283 / `55867f8b…` | 50,293 / `b4aab448…` | 59,869 / `09e87acc…` |

三条路径**逐字节相同**（`cmp`/sha 一致），且 PNG 均为 `1200 x 630, 8-bit/color RGBA`。
附带量到的事实：同一 bundle 在 satori 0.26 下 **907,684 B**、0.63.2 下 **2,239,330 B**（+1.33 MB，satori 新版把 layout WASM 以 base64 内联）。对 Astro 预渲染/Node SSR 无影响，但对「把 route 打进 Worker/单文件」的消费者是 1.3 MB 的增量，值得在 README 提醒（已记在 §6 待办）。

### 5.5 包内 smoke（`dist/` 产物，真实字体）

```console
$ node --test packages/og-image/test/smoke.test.mjs
✔ route: 1200x630 PNG，与固定输入 golden 逐字节相同（M4-9 重定标） (272 ms)
ℹ tests 10 · pass 10 · fail 0
```

---

## 6. 三包体积变化

同工具链（node v26.0.0 / npm 11.12.1，`npm pack`）对比 M4-5 基线 20,379 / 5,342 / 10,852 B：

| 包 | M4-5 基线 | 本次 | Δ | 说明 |
| --- | --- | --- | --- | --- |
| `@marxchou/dogeared-tokens` | 20,379 B | **20,379 B** | 0 | 未改（本次重打包验证同字节数） |
| `@marxchou/dogeared-ui` | 5,342 B | **5,342 B** | 0 | 未改 |
| `@marxchou/dogeared-og-image` | 10,852 B | **11,829 B** | **+977 B（+9.0 %）** | 文件数仍 13；解包 46.5 kB → 48.8 kB |

`og-image` 的 +977 B 全部可对账（解包后逐文件）：

```
./README.md        4135 →  5466   +1331   新增 Dependency and audit notes
./dist/route.js   13804 → 14290    +486    box-sizing 注释 + 一个属性
./src/route.ts    15537 → 16043    +506    同上（源码）
其它 10 个文件                         +0
```

**采集口径提醒**：npm 打包的 gzip 容器随 node/zlib 版本变化——同一份解包内容在 node 22.23.1 下打出来是 11,290 B、在 node 26.0.0（= M4-5 基线所用工具链）下是 **11,829 B**。所以体积对比必须同工具链，跨 node 版本比体积会得出「凭空少/多出约 150 B」的假象（本次已核对两包解包后 13 个文件 sha256 全同）。

---

## 7. 其它验证与边界

| 检查 | 结果 |
| --- | --- |
| 站点 `tsc --noEmit`（`pnpm type-check`，satori 已在根 node_modules 升到 0.63.2） | **exit 0** |
| 站点真实构建 `pnpm build:ci`（node v26.0.0） | **exit 0**，474 页 / 50.08 s；`dist/og/` **85 张 PNG，全部 `1200 x 630 RGBA`**；日志里 2 条 `astro-expressive-code` plantuml 高亮 WARN，与本次改动无关 |
| `pnpm gates:all` | **exit 0**，`RESULT PASS classified=1084 unclassified=0 theme=714 overlay=299 exclude=71 plan_baseline=998 delta=+86`（9/9） |
| `node scripts/release/preflight.mjs --mode=publish` | PASS 30 / FAIL 3 / WARN 0 / INFO 2 / SKIP 1 → FAIL 全是**预期**：`P1 tokens private:true`、`P1 og-image private:true`、`P5 publish-plan 为空`。**依赖层面没有新增 FAIL/WARN**（P3/P3b/P3c/P4b/P4c 全 PASS，pack 清单 13 文件 / 11,829 B） |
| `private` 位 | 三包仍 `private: true`（未翻转） |
| publish / dist-tag / 部署 | 未做；registry 全程只读 |
| git | 未 commit / 未 push |

**边界 deviation（已在上面逐条列出）**：根 `package.json`（站点依赖）与 `pnpm-lock.yaml`。后者不在卡片边界内，但不改会让 lockfile 与 `package.json` 不一致、CI `--frozen-lockfile` 直接失败，属于根 `package.json` 改动的必然连带，特此声明。

**工作树里的他人改动**：`scripts/release/{lib,preflight,verify-changeset-loop,verify-guards}.mjs`、`docs/release.md`、`docs/_reviews/M4-10/` 是并行任务（M4-10）的未提交改动，本次 preflight 跑在混合树上——因此 `publishSet` 只有 `tokens` + `og-image`（ui 被移出）这类数字以当时的工作树为准，不属于本任务的判据。

---

## 8. 待 PO 决策（不能静默放行的部分）

**问题**：卡片验收要求「干净消费者 `npm audit` 对本包 0 moderate」。在「`og-image` 必须依赖 satori」这一前提下，包侧**结构上无法达成**——satori 所有 ≥0.33.5 版本都精确钉 `fflate@0.7.3`，而 `GHSA-px8p-9vwx-vf98` 覆盖 `<0.7.5`。只能在下面两条里选：

| 选项 | 结果 | 代价 | 建议 |
| --- | --- | --- | --- |
| **A. 保留 `^0.63.2` + 文档化残余告警 + 消费者一行 `overrides`（本次实现）** | 自然安装：3 条 moderate（实为 1 条不可达的 fflate 告警）；加 override：**0 vulnerabilities**，出图逐字节不变 | 发布后首批消费者会看到 1 条 moderate，需要读 README 才知道怎么消；PO 需接受「提示存在但不可达」 | **推荐**：真实可利用的 GHSA-wx4j-mvgx-mqwp 已消除，残余告警的攻击面（`unzipSync` + 畸形 ZIP64）在我们路径上不可达 |
| B. 回退 `^0.26.0` 并文档化风险 | 消费者看到 2 条 moderate，其中一条落在**真实执行的转义路径**上，区间内无补丁 | 把可利用面留在发布物里，且与 M4-5 的 P2 判定冲突 | 不建议 |

若 PO 选 A，建议顺带决定两件小事（本次未擅自做，均在边界外）：

1. 仓内 `pnpm-workspace.yaml` 的 `overrides` 增加 `satori>fflate: "^0.7.5"`（已有 `yaml`/`source-map-js` 等同类条目），可让站点自身 `pnpm audit` 也清掉这条；
2. 在上游 satori 提 issue/PR 把 `fflate` 抬到 `^0.7.5`（唯一根治路径），并在 README 注明「依赖 satori 的 bundle 体积 +1.33 MB」。

---

## 9. 证据清单

`docs/_reviews/M4-9/artifacts/`

| 文件 | 内容 |
| --- | --- |
| `og-pinned-satori-0.26.0.png` | 包测试固定输入，旧版：49,283 B / `8e6c490e…`（= M4-3/M4-6 golden，可复现） |
| `og-pinned-satori-0.63.2.png` | 同一输入，新版：49,574 B / `6b9d8762…` |
| `og-pinned-diff-x4.png` | 两版差值 ×4 灰度图（差异集中在字形边缘，无版式位移） |
| `og-hello-satori-0.26.0.png` / `og-hello-satori-0.63.2.png` | M4-5 消费者 fixture 旧/新：48,269 vs 48,283 B，页脚/装饰圆/两行摘要全部在位 |
| `fixture/` | 三路径复用的最小 Astro 消费者（含 `README.md` 说明与 3 个 fixture slug） |
| `evidence.json` | 全部命令、sha256、带宽、audit 输出、体积对账的机器可读版本 |

复现要点：出图对比必须固定字体文件（仓库 `.astro/fonts` 的两张 Noto Sans SC）与 `sharp` 版本；只换 satori 版本才可归因。

---

## 10. PO 决策：A+（2026-11-06）

PO 选择 **A+**：保留 `satori@^0.63.2`，接受残余 fflate 告警为「已知、不可达」，并额外做三件事：

1. 仓内 `pnpm-workspace.yaml` 增加 `satori>fflate: "^0.7.5"`，让站点自身依赖图也清掉这条；
2. `packages/og-image/README.md` 补齐 npm / pnpm / Yarn 三种 override 配方与 CI 提示；
3. 起上游 `vercel/satori` issue 草稿，请求把 `fflate` 抬到 `^0.7.5`（草稿见
   `docs/_reviews/M4-9/upstream-satori-fflate-issue.md`，未提交）。

验收要求：仓内 `pnpm install --frozen-lockfile` 后 `pnpm audit` 不再报 fflate；三路径出图
golden 不变；`gates:all` 保持 PASS。真正的 `npm publish` 仍等 npm 登录/2FA。

实测结果（2026-11-06）：

- `pnpm why fflate` → satori 分支 `0.7.5`，`@iconify/tools` 分支仍 `0.8.3`（没有被全局降级）；
- `pnpm audit --json` 中 `fflate` 告警 **0** 条（仓内其它 29 条为既有依赖，不在本决策范围）；
- `@marxchou/dogeared-og-image` 10/10 tests PASS，golden `6b9d8762…` 不变；
- `build:ci` → 748 HTML；`verify-guards` 15/15；`gates:all` PASS（classified=1105，unclassified=0）；
- README 扩充后 tarball：**12,410 B / 49,732 B unpacked / 13 files**（README 6,369 B；+581 B vs 11,829 B）；
- 干净 npm 消费者实测：`"overrides": { "satori": { "fflate": "^0.7.5" } }` → `npm ls` 只有
  `fflate@0.7.5`，`npm audit` total 0。


