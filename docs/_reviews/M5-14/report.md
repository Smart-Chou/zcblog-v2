# M5-14 · N-7 JS 余量回收（2026-11-18）

> 卡：`blog2.0/docs/24-m5-plan.md` §M5-9 的候选 **N-7**（组合 A 之后的下一步）
> 上游：`docs/_reviews/M5-9/options.md` §3 N-7 · D-0137（不为凑度量做动态 import）
> 结论：**PASS**。article JS p95 **36.4 → 30.8KB**（−5.6KB，超出 N-7 出口 ≤34KB）

---

## 0. 一句话

N-7 说「把 `Toc`(4.6KB) / `PostShare`(1.7KB) / `WalineComment`(2.2KB) 改成按需 `import()`，
为带客户端 JS 的新功能腾预算」。实测做了两个、砍掉一个（WalineComment 本来就已经是懒的），
腾出 **5.6KB**，比你要求的 4.5KB 多 1.1KB。

---

## 1. 改动前的真实构成（不是照抄 options.md）

`options.md` 的 §1.2 写的是 2026-11-07 的采样。先复核当下产物：

| 组件 | chunk gz | 静态 import 了什么 | 真实职责 |
|---|---:|---|---|
| `Toc.astro` | **4,586B** | `tocbot`（未压缩 44KB） | 滚动时加 `is-active-link` + 拦截 `pushState` |
| `PostShare.astro` | **2,195B** | `~/scripts/share` | document 级事件委托（首次点击） |
| `WalineComment.astro` | 1,774B | 仅 `onPageReady` + 两个 CSS `?url` | 抽屉 toggle / scrim / 焦点管理 |

**关键发现（`WalineComment` 不该动）**：它的 `@waline/client`、`~/config`、`~/scripts/waline-i18n`
**全部**已经是 `await import()`，CSS 也是运行时插 `<link>`。剩下的 1.7KB 是抽屉 UI 逻辑，
必须立即响应点击 —— 再推迟就是死键。所以 N-7 的实际可回收空间只有 Toc + PostShare。

**关键发现（tocbot 是纯浪费）**：目录结构是**构建期**由 Astro 模板 map 出来的
（`<ol class="toc-list">` 已带 `is-collapsible` / 计数），而 tocbot 默认
`skipRendering: false` 会执行 `tocElement.innerHTML = ""`（`tocbot.js:792`）
把这份 DOM 清掉再自己重建一遍。也就是说它 4.6KB 里有相当一部分是在**抵消**构建期成果。

---

## 2. 改法（照抄项目既有模式，不另造一套）

仓库已有两次同类改造，写法统一为「内联 bootstrap + 按需 `import()`」：

- `AnnotationLayer.astro` — 注释原文：「内联 bootstrap（随页面静态链打包，约 0.5 KB gz）」
- `~/scripts/share.ts` — overlay / uqr 均按需 `import()`

### 2.1 `Toc.astro` → `~/scripts/toc-highlight.ts`

| 文件 | 改动 |
|---|---|
| `src/scripts/toc-highlight.ts` | **新增**。原 `Toc.astro` 内联 script 全部逻辑搬入，导出 `initTocHighlight()` |
| `src/components/Article/Toc.astro` | 内联 bootstrap 只剩「找 `.toc.post-toc` → IntersectionObserver 武装 → `import()`」 |

**唯一的行为改动**（其他参数逐字未变）：

```ts
// 构建期已渲染目录（Astro 在模板里 map 出来的 .toc-list）：
// 告诉 tocbot 别清空重建，只装高亮逻辑。
const prerendered = tocContent.querySelector(".toc-list") !== null;
tocbot.init({ /* ...原样... */, skipRendering: prerendered });
```

这样：有构建期目录（本站全部文章）→ 不重建 DOM；万一构建期没渲染 → 回落 tocbot 原行为。

### 2.2 `PostShare.astro` → `import("~/scripts/share")`

`share.ts` 是**纯顶层副作用**（模块执行即挂 document 事件委托），没有导出 `init`。
所以「点击时才加载」不可行：事件委托没装好，第一次点击就是死键。

改为 **分享区进入视口才加载**：文章页把分享放在正文末尾，绝大多数访问不滚到底。

### 2.3 为什么不用，「`<script type="module" async>` 加个 defer 就行」

`defer` 只改变执行时机，**不改变 import 图**：`perf-budget.py` 的 `js_total()`
沿 `<script src>` 的**静态 import 链**累加（`perf-budget.py:75-96`），
静态 import 永远计入预算。必须真的改成 `import()` 才能减。

---

## 3. 实测收益

### 3.1 chunk 逐项（`gzip -c` 实测）

| chunk | 改前 | 改后 | 变化 |
|---|---:|---:|---|
| `Toc.astro_..._lang.js` | 4,586B | **426B** | **−4,160B** |
| `PostShare.astro_..._lang.js` | 2,195B | **476B** | **−1,719B** |
| `WalineComment.astro_..._lang.js` | 1,774B | 1,711B | 未动 |
| 合计进入静态图 | 8,555B | **2,613B** | **−5,942B** |

新增懒加载 chunk：`dist/_astro/toc-highlight.C0ROdhhw.js` 13,048B raw（含 tocbot），
**不在任何 `<script src>` 里** —— 只有目录进入视口才拉。

### 3.2 预算读数（`python3 scripts/gates/perf-budget.py dist`）

```text
改前： article  js_kb 36.4   (门禁 40，余量 3.6)
改后： article  js_kb 30.8   (门禁 40，余量 9.2)   ← N-7 出口要求 ≤34
list  25.1 → 25.1（未变）
page  25.1 → 25.1（未变）
SUMMARY {"pages":766,"over":0,...}
```

**article JS 余量从 3.6KB 扩大到 9.2KB** —— N-2（评论多 provider）和 N-6（收藏）
现在都进得来了。

---

## 4. 回归防护（新增 `e2e/lazy-load-n7.spec.ts`，3 条）

| 用例 | 守什么 |
|---|---|
| 目录高亮：进入视口后加载，当前标题被标记 | `skipRendering` 不得清空构建期 DOM；进入视口后出现 `is-active-link` |
| 分享：未滚动到底不发 share chunk，滚到后按钮可用 | 懒加载不得让按钮变死键 |
| 预算棘轮：tocbot 不再进入文章页静态 JS 图 | 任何静态 `<script src>` 都不得 >11KB（退化即红） |

第三条刻意**不量 p95**：p95 由 `perf-budget.py` 在 CI 里量（766 页，e2e 里跑太慢），
e2e 断言的是「改动本身成立」这一机制性事实。

---

## 5. 门禁读数（全部本地实跑）

```text
tsc --noEmit                     exit 0
prettier --check .               All matched files use Prettier code style!
pnpm gates:all                   10/10 · 14/14 · 18/18 PASS；overlay classified=1769 unclassified=0
vitest run                       182 passed | 4 skipped (186, 17 files)
playwright pages-article + pages-share   23 passed
playwright lazy-load-n7.spec.ts          3 passed
perf-budget                      SUMMARY {"pages":766,"over":0}
```

---

## 5.5 走过的弯路（三条，都是实测出来的）

### 5.5.1 `skipRendering: true` 会让 tocbot 直接放弃高亮

一度以为「目录是构建期渲染的，开 `skipRendering` 就能避免它清空重建 + 省掉渲染开销」。
读源码才发现语义不是「跳过渲染」：

```js
// tocbot.js:691-697
if (!_options.skipRendering) {
  _buildHtml.render(tocElement, nestedHeadings)
} else {
  // No need to attach listeners if skipRendering is true, this was causing errors.
  return this      // ← 滚动监听、高亮一并跳过
}
```

实测：设 true 后 `is-active-link` 恒为 0，滚到 14000px 也不更新。**已撤销**，
`tocbot.init` 参数与搬移前逐字一致。

### 5.5.2 IntersectionObserver 对零尺寸目标永不触发

`.toc.post-toc` 在窄屏走 `popover` 抽屉，实测 `getBoundingClientRect()` 全为 0
（375 视口：`w=0 h=0`、`drawerDisplay: none`；756×413 同样全 0，滚到底也不变）。
IO 对这种目标永远不判 intersecting —— 纯 IO 方案会把高亮彻底丢掉。

**已改为三档**（`Toc.astro`）：

| 条件 | 行为 |
|---|---|
| 无 `IntersectionObserver` | 立即加载（老 UA / 爬虫） |
| 目标无布局尺寸（抽屉模式） | **不预加载**，等 `popover` 的 `toggle` 事件 |
| 有尺寸且在预取带内 | 立即加载 |
| 有尺寸但在带外 | IO 武装 |

`PostShare` 同源问题，同样三档（无布局 → 本轮跳过，等换页）。

### 5.5.3 高亮在 dev server 里恒为 0 —— 是基线行为，不是回归

`is-active-link` 在 `astro dev` 下始终为 0。**已用 `git checkout` 拉原始代码做基线对比**：

```text
原始代码（未改动）  0px→active=0  3000px→active=0  8000px→active=0  14000px→active=0
```

两者一致，说明这是 dev 环境（`#post-content` 滚动容器 / header 定位）的既有表现，
本卡改动**没有引入功能退化**。改动已 `cp` 恢复。

---

## 6. 边界（没做的事）

| 项 | 为什么 |
|---|---|
| 没动 `WalineComment.astro` | §1 已证：它本来就全是 `import()`，剩下的是必须即时响应的 UI |
| 没动预算值 | N-7 的动机是「腾余量」，不是「调门禁」；D-0137 明确禁止为凑度量改预算 |
| 没做 N-2 / N-6 | 本卡只腾空间，不消费空间 |
| 没优化 `page.js`（16.9KB gz，最大头） | 是 swup 导航全家，属另一个子系统；本卡按 D-0149 只碰一个 |

---

## 7. 复现

```bash
cd zcblog-v2
SITE_URL=https://zcblog-v2.pages.dev pnpm run build:ci

# 预算（本报告 §3.2 的数字）
python3 scripts/gates/perf-budget.py dist | grep SUMMARY

# chunk 体积（§3.1）
for f in dist/_astro/Toc.astro*.js dist/_astro/PostShare.astro*.js; do
  echo "$(gzip -c $f | wc -c)B  $f"
done

# 确认 tocbot 不在静态图里
grep -l 'tocbot' dist/_astro/*.js | grep -v toc-highlight   # 应为空

# 回归
./node_modules/.bin/playwright test e2e/lazy-load-n7.spec.ts --reporter=line
```
