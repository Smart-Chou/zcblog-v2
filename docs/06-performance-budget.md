# 性能预算（06 · performance-budget）

> 本文管：`BUDGET` / `TARGET` 两级的含义、阈值为什么是这些数、`--scale` 负向验证怎么用、以及「JS 必须跟静态 import 链算」这条最贵的教训。
> **必读时机**：动 `perf-budget.py` 的阈值、改首屏脚本、引入新依赖、加页面、或 `perf budget (dist)` 门禁红了。
> 与 `rules/ci-gates.md` §4 分工：那边说这门在 CI 里排第几，这边说判据本身怎么来的。
> 参数真源是 `scripts/gates/perf-budget.py` 顶部的 `BUDGET`；本文是它的解释，两边冲突以脚本为准。

---

## 1. 两级阈值：门禁会红，目标只报差距

| 级别 | 变量 | 作用 | 红了会怎样 |
|---|---|---|---|
| 门禁 | `BUDGET` | 防回归。取当前 p95 + 约 3~5% | **CI 必红** |
| 目标 | `TARGET` | 已签需求 A6 的 100KB | 只报告，不阻断 |

`TARGET = {"article": 100, "list": 100, "page": 100}`——三个页型都是 100KB，这是 A6 的验收数字，不是从当前产物反推的。<!-- perf-budget.py:37 -->

两级分开是因为一件事：**门禁守住「不许变坏」，目标说明「还差多远」**。如果把门禁直接钉在 100KB，那么现在就已经红着，红着的门禁等于没有门禁；反过来只留目标，就没有东西挡回归。

## 2. 实际的数（2026-10-30 两次修订后）

```python
BUDGET = {
    "article": {"html": 215, "js": 40, "css": 45},
    "list":    {"html": 105, "js": 28, "css": 40},
    "page":    {"html": 105, "js": 30, "css": 40},
}
```

单位：`js` / `css` 是 **gzip 后**，`html` 是 **原始字节**。<!-- perf-budget.py:31-35 -->

文章页 HTML 给到 215KB 而列表页只有 105KB，因为文章页含全文正文、目录、上下篇、相关推荐；列表页只有摘要卡。CSS 三档接近（40/45）是因为同一份 token + 全局样式，差异只来自文章专属的排版类。

**当前实测余量**（2026-11-14，`python3 scripts/gates/perf-budget.py dist`，765 页 / 0 超预算）：

| 页型 | 页数 | HTML p95 | JS p95 | CSS p95 | 门禁 h/j/c | 最紧余量 |
|---|---|---|---|---|---|---|
| article | 86 | 166.0 | 36.3 | 43.4 | 215/40/45 | +1.6 KB (3.6%) · css |
| list | 290 | 64.8 | 25.0 | 31.1 | 105/28/40 | +2.5 KB (2.4%) · html |
| page | 389 | 60.8 | 25.0 | 33.3 | 105/30/40 | +4.7 KB (4.5%) · html |

**article 的 css 只剩 3.6% 余量（1.6 KB）**——它是全仓最紧的一项，改文章页样式时最容易顶红。JS 三档都还有充足空间（article 36.3/40 = 9% 余量），说明当前的瓶颈在 CSS 不在脚本。

**页型判定**（`classify()`）：

- `article/` 开头 → article
- `index.html` / `blog/` / `tags/` / `archives/` → list
- 其余 → page

判定看的是 dist 里的相对路径，不是路由配置。<!-- perf-budget.py:59-64 -->

## 3. 预算只许往下调，不许往上抬

这是棘轮（ratchet）约定：<!-- perf-budget.py:29-30 -->

- 性能优化后产物变小 → **可以**在同一提交里下调 `BUDGET`，把收益锁死
- 产物变大且不是优化 → 先查根因，不要直接抬阈值
- 确实必须抬（例如官方库新增功能）→ 必须在 decision-log 里写 D-xxxx，说明为什么、影响多少 KB

**抬阈值是一次性的、留记录的、要说服人的动作；不是让 CI 变绿的手段。**

## 4. `--scale` 是负向验证开关，不是配置项

```bash
python3 scripts/gates/perf-budget.py dist                # 正常门禁
PERF_BUDGET_SCALE=0.4 python3 scripts/gates/perf-budget.py dist   # 必须红
```

`--scale <f>`（或环境变量 `PERF_BUDGET_SCALE`）把 `BUDGET` 整体乘 f，默认 1.0。<!-- perf-budget.py:13-14, 154-173 -->

**它存在的唯一目的，是证明门禁真的会红。** 一条永远绿的门禁和没有门禁无法区分，所以要有办法把它人为调紧、看到它报警。跑完之后不要设这个变量——CI 里不设，也就不会生效。

## 5. 最贵的教训：JS 必须跟静态 import 链算

旧版只累加 HTML 里 `<script src>` 指向的文件，把 vendor chunk 整块漏掉了——**实测文章页报 5.8KB，而真实首屏 JS 是 100KB+**，差了一个数量级。<!-- perf-budget.py:75-80 · G4 修正 2026-10-30 -->

现在的算法（`js_total()`）：

1. 从 HTML 里取所有本地 `<script src>` 作为 entry
2. 对每个 entry 读文件，用正则抽 `from "./x.js"` 和 `import "./x.js"`
3. 递归走完整条依赖链，用 `seen` 集合去重
4. **只算静态 import**——`import("./x.js")` 是懒加载，不进首屏

判据是「这个 JS 文件在首屏加载路径上吗」，不是「它出现在 HTML 里吗」。**改这段代码前先想清楚：你的改动会不会让懒加载的模块被误算进首屏，或者让 vendor 链再次漏掉。**

## 6. 引用缺失 = 失败，不是 0

```python
if os.path.exists(p):
    b += gz(p)
else:
    missing.append(u)      # 引用缺失 = 失败，不是 0
```

HTML 引用了不存在的 JS/CSS，按 0 字节累加会让门禁**看起来更绿**——典型的「产物坏了反而通过」。所以缺失进 `missing`，最终计入 `over`，判红。<!-- perf-budget.py:106-114 · 红队 G3-round1 I-03 -->

这条和 `rules/ci-gates.md` 里 A13 的「没抽到就判红」是同一个原则：**空转和通过必须能区分开。**

## 7. A7 固定五页：防「门禁失去对象」

```python
A7_PAGES = [
    "index.html",
    "article/self-hosted-git-platform-guide/index.html",
    "blog/2/index.html",
    "tags/DOCKER/index.html",
    "archives/index.html",
]
```

dist 层不测 LCP（现场指标按 D-0077 的机房口径另测），但会核对这 5 个 URL 是否还在产物里。<!-- perf-budget.py:39-47 -->

理由：lab 层 LCP 门禁测的是这 5 页。如果路由改名、内容欠检导致它们消失，LCP 门禁会**静默失去对象**——测 0 个页面也是「通过」。所以这里提前报出来。

## 8. 余量 < 1% 记「临界限」

`TIGHT_RATIO = 0.01`：预算余量不足 1% 的页面进「临界限」列表，**只报告不判红**。<!-- perf-budget.py:49, 222-234 -->

它挡不住什么，但给一个提前量：某个页面余量只剩 0.3% 时，下次无关的改动就可能把它顶红，此时应该先决定是优化它还是给它留空间。

## 9. 输出契约

- `--json out.json` → 机器可读的逐页明细（含 `budget_base` / `scale`，便于复现）
- `--summary <path>` 或 `GITHUB_STEP_SUMMARY` → markdown 表追加到 job summary
- stdout 最后一行 `SUMMARY {...}` → CI 可 grep 归档

退出码：`0` 全部在预算内 / `1` 有超支 / `2` 用法错误或 dist 不存在。<!-- perf-budget.py:17, 317-347 -->

**`SUMMARY` 那一行是与 `verify-entities` 相同的约定**，别改格式——CI 侧按这个前缀抓。

## 10. 红了先做什么

1. 看是哪个页、哪个指标超的：`超支页面` 表会列出 `html / js / css` 具体哪项
2. 先确认不是**引用缺失**伪装成超支（`missing` 非空会单独标 `引用缺失(N)`）
3. 判断是「这次改动引入的」还是「本来就在临界」——看 git 历史里该页上一版的数值
4. 是引入的 → 找回来；是临界的 → 决定优化还是给预算，给预算要写 D 编号

**不要做的**：直接抬 `BUDGET` 让它绿。那会让这门在之后所有提交里失效。
