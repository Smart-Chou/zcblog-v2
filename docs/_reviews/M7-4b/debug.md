# M7-4b 只读诊断 · 点击 `mark` 的选区 / 事件时序

- 基线：`14f89b7`（wip(m7-4b): 选区高亮工具条，取消高亮状态机待修），工作树干净（`src/**`、`e2e/**` 零改动）
- 结论先行：**两条用例是同一个根因** —— `AnnotationLayer.astro` 内联 bootstrap 的 `selectionchange` 监听器每次都在调 `load()`，`initAnnotationLayer()` 于是再跑一遍 `render()`，`render()` 的 `unwrap()` 把承载当前选区的 `<mark>` 节点 `replaceWith` 掉了；选区不是被 API 清掉的，而是**节点被移出文档后自动塌缩**，随后的 rAF `update()` 读到空选区 → `hide()`。
- 诊断期间未改任何产品代码 / spec；只新增了本文件。`dist/` 被重建过（见 §0）。

---

## 0. 前置：`dist/` 原本是脏的（必须先重建）

第一次跑失败用例时 `dist/` 里的 chunk 与 `src/` **不是同一份代码**：

| | 旧 `dist/_astro/annotation-layer.0LA4OC4x.js`（12:31 构建） | `src/scripts/annotation-layer.ts`（14f89b7） |
| --- | --- | --- |
| `pointerup` 监听 | 有，且直接 `preventDefault` + `selectMark(mark)` | 只有 `holding = false` |
| `mouseup` 监听 | 有 | 无 |
| `selectMark()` 末尾 | 额外同步调 `update(ui)` | 无 |

→ 任何基于旧 `dist` 的时序都是假的。已在 12:54 用 `npx astro build`（仅 `astro build`，跳过 `fetch:*`）重建，**下列全部数据均取自 14f89b7 的新构建**（`dist/_astro/annotation-layer.N4tSuhGr.js`，12:54）。

重建后两条用例仍然失败（失败点与卡面一致）：

```
✘ e2e/annotations-article.spec.ts:277 › 再次选中高亮文字… (失败于 :295 TOOLBAR toBeVisible)
✘ e2e/annotations-article.spec.ts:307 › 点击已高亮的文字（不拖选）… (失败于 :315 TOOLBAR toBeVisible)
```

---

## 1. 原始事件序列

探针：Playwright Chromium（1280×900），在 `document` 上以 capture 相记录 `pointerdown / mousedown / pointerup / mouseup / click / selectionchange`，同时每帧记 `raf`；另外给 `Selection.prototype.*`、`Node.prototype.replaceWith/normalize`、`Range.prototype.insertNode`、`HTMLElement.prototype.hidden` 打了带栈的补丁（只在测试进程里，页面源码未动）。

字段说明：`collapsed/ranges/text` 来自 `document.getSelection()`；`tbHidden` = `[data-annotation-toolbar].hidden`；`qHidden` = `[data-quote-toolbar].hidden`（第二个工具条，金句卡）；`debug` = `[data-annotation-layer].dataset.annotationDebug`；`mode` = `[data-annotation-action="toggle"].dataset.annotationMode`。

### 1.1 `:307` 点击已高亮的文字（不拖选）

```
t(ms)  event                 target             collapsed ranges text          tbHidden qHidden debug            mode   marks
1581   pointerdown           mark.annotation-mark  True   0     ''            True     True    none             add    1
1582   mousedown             mark.annotation-mark  True   0     ''            True     True    none             add    1
1582   pointerup             mark.annotation-mark  True   1     ''            True     True    none             add    1
1583   mouseup               mark.annotation-mark  True   1     ''            True     True    none             add    1
1583   click                 mark.annotation-mark  True   1     ''            True     True    none             add    1
1583   sel.removeAllRanges   —                     True   1     ''            True     True    none             add    1   ← 栈: V(selectMark) ← Q(onClick)
1583   sel.addRange          —                     True   0→1   ''            True     True    none             add    1   ← 栈: V(selectMark) ← Q(onClick)
1583   selectionchange       #document             False  1     '这篇文章的起因…'  True  True  none           add    1   ← selectMark 补发的合成事件
1612   raf                   —                     False  1     '这篇文章的起因…'  True  True  none           add    1
1618   raf                   —                     False  1     '这篇文章的起因…'  False False 0:0-24:remove   remove 1   ← 工具条此刻出现
1618   selectionchange       #document             False  1     '这篇文章的起因…'  False False 0:0-24:remove   remove 1
1620   dom:normalize         —                     True   1     ''            False False 0:0-24:remove   remove 0   ← 栈: z(render.unwrap) ← O(render)
1622   dom:insertNode        —                     True   1     ''            False False 0:0-24:remove   remove 0   ← 栈: G(render.wrap)  ← O(render)
1623   dom:normalize         —                     True   1     ''            False False 0:0-24:remove   remove 0
1624   dom:insertNode        —                     True   1     ''            False False 0:0-24:remove   remove 0
…      raf (~1240)           —                     True   1     ''            False True  none             remove 1   ← quote-selection hideToolbar
…      raf                    —                     True   1     ''            True  True  none             remove 1   ← annotation hide()：debug 从 0:0-24:remove 变 none
```

要点：

1. `pointerdown` 到达时 `toolbar.hidden === true`，`annotation-layer` 的 `onPointerDown` 在**第一个守卫**就 `return` 了（`if (!ui || ui.toolbar.hidden) return;`），所以源码里那段「点 mark 时 `event.preventDefault()`，别让浏览器塌掉选区」的分支**根本没执行**（当前是死代码）。浏览器照常把光标落到 mark 里。
2. `click` 时选区已 collapsed，`onClick` 命中 `isCollapsed` 分支 → `preventDefault()` + `selectMark(mark)`，选区被正确重建（`selectionchange` 里 `collapsed=false`，文本就是整条 mark）。
3. **40 ms 后 mark 被 `render()` 重建**：`z`/`G`（`unwrap`/`wrap`）先 `replaceWith` 掉 `<mark>` 再 `insertNode` 新的 —— 选区指针指向的节点被移出文档 → 选区无 API 调用地塌缩（`collapsed=true` / `text=''`，`rangeCount` 仍为 1）。
4. 之后 `update()` 读到空选区 → `hide()`（`debug` 从 `0:0-24:remove` 变 `none`）。测试断言 `TOOLBAR` 可见 → 红。

### 1.2 `:277` 再次选中高亮文字（程序化 selectNodeContents）

```
t(ms)  event                 collapsed ranges text          tbHidden qHidden debug   mode marks  备注
1174   sel.removeAllRanges      True   0     ''
1174   sel.addRange             True   0     ''
1174   selectionchange          False  1     '这篇文章的起因…'  True  True  none  add  1    ← spec 里 dispatch 的合成事件
1175   selectionchange          False  1     '这篇文章的起因…'  True  True  none  add  1    ← 浏览器自己的原生事件
1175   dom:normalize            True   1     ''            True  True  none  add  0    ← z(render.unwrap) ← O(render)
1176   dom:insertNode           True   1     ''            True  True  none  add  0    ← G(render.wrap) ← O(render)
1176   dom:normalize            True   1     ''            True  True  none  add  0
1177   dom:insertNode           True   1     ''            True  True  none  add  0
1213   raf                      True   1     ''            True  True  none  add  1
1213   hidden=true:QUOTE_TOOLBAR     栈: s(quote-selection hideToolbar)
1214   hidden=true:ANNOTATION_TOOLBAR 栈: p(hide) ← Y(update)
```

这里更直接：**工具条一次都没出现过**（`tbHidden` 全程 `true`），因为 `render()` 塌缩选区发生在模块自己那次 rAF `update()` 之前。测试卡在 `:295 expect(TOOLBAR).toBeVisible()`。

补注：`spec` 的程序化选区 + 浏览器原生 `selectionchange` 一共触发两次事件；两次都非空且落在正文里，两次都会命中 bootstrap 的 `load()`。

### 1.3 两个工具条的 `hidden` 状态汇总

| 时刻 | `[data-annotation-toolbar].hidden` | `[data-quote-toolbar].hidden` |
| --- | --- | --- |
| 点击 mark 前 | `true` | `true` |
| `selectMark` 之后 1 帧（选区有效） | `false`（`mode=remove`） | `false`（金句卡也跟着弹，两者错位不重叠） |
| `render()` 之后（选区塌缩） | `true` | `true` |

两个工具条都不是被对方收掉的 —— 它们各自在自己的 rAF 里读到同一个已经塌缩的选区，各收各的。

---

## 2. 选区在哪一步被塌缩

**不是被 `removeAllRanges()` 清掉的，是被 DOM 重建冲掉的。**

塌缩点：`src/scripts/annotation-layer.ts` → `render()` → `unwrap(block)`

```ts
for (const mark of marks) mark.replaceWith(...Array.from(mark.childNodes));
block.normalize();
```

调用链（`selectionchange` 同步链路，不是 rAF）：

```
document 'selectionchange'(capture/passive)
  ├─ annotation-layer  onSelectionChange()  → rAF → update()      （读到塌缩后的选区 → hide）
  ├─ quote-selection   onSelectionChange()  → rAF → hideToolbar() （同上）
  └─ AnnotationLayer.astro 内联 bootstrap（同步！）
        load()                                   ← 没有 state.loaded 守卫
          import('~/scripts/annotation-layer')   ← 模块已缓存，但 .then 照样跑
            .then(() => initAnnotationLayer())
              render(ui)                          ← 无条件重画所有 mark
                unwrap()  mark.replaceWith(...)   ← ★ 选区所在的 mark 节点被移出文档
                wrap()    range.insertNode(mark)
```

证据（构建产物原文，`dist/_astro/AnnotationLayer.astro_astro_type_script_index_0_lang.CnqS4AuS.js`）：

```js
document.addEventListener("selectionchange", () => {
    const t = document.getSelection();
    if (!t || t.isCollapsed || !t.toString().trim()) return;
    const e = t.anchorNode;
    !e || !e.parentElement?.closest(d) || o();   // o() = load()，每次非空选区都调
}, { passive: true });
```

`load()` 第一行就把 `state.loaded` 置 `true`，但**没人读它**：`o()` 被无条件调用。所以「已经加载过」之后每一次正文选区（包括 `selectMark()` 自己补发的那次合成 `selectionchange`）都会重跑 `render()`。

源码侧 `initAnnotationLayer()` 也有同样的结构问题：`__annotationLayerBound` 只守住了 `addEventListener`，`render(ui)` 在函数尾部无条件执行 —— 于是「重新 init」=「破坏当前 DOM 选区」。`render()` 目前没有任何「选区落在我正在重建的 mark 里就先别动」的保护。

---

## 3. 最小修复建议（只给方案，未改任何文件）

### 3.1 根因修复（1 行，两条用例都靠它）

`src/components/Article/AnnotationLayer.astro` 内联 bootstrap 的 `selectionchange` 监听器开头加守卫：

```ts
document.addEventListener("selectionchange", () => {
    if (state.loaded) return;        // ← 新增：模块已经在跑，别再 import→init→render
    const selection = document.getSelection();
    …
});
```

语义与 `load()` 自身一致（`load()` 首行 `state.loaded = true`），`astro:page-load → hydrate()` 那条换页重画路径不经过 here，不受影响。

**已验证**：用等价的运行时补丁（把这条监听器包成「上下文首次触发生效」= `if (state.loaded) return`）跑两个场景，结果：

```
test1 → {"toolbarVisible":true,"collapsed":false,"selText":"这篇文章的起因很简单…","mode":"remove","marks":1,"debug":"0:0-24:remove"}
test2 → {"toolbarVisible":true,"collapsed":false,"selText":"这篇文章的起因很简单…","mode":"remove","marks":1,"debug":"0:0-24:remove"}
  after remove → {"toolbarVisible":false,"marks":0}      ← 点「取消高亮」整链仍然工作
```

补丁只加在测试进程里（`page.addInitScript` 包 `document.addEventListener`），仓库源码一行未动。

### 3.2 加固（建议同批做，避免下次换个入口复发）

1. **`initAnnotationLayer()` 不要无条件 `render()`**：只在「DOM 里一条 `mark.annotation-mark` 都没有」或「`data-annotation-count` / `data-annotation-painted` 与 store 不一致」时才重画。
2. **`render()` 保住选区**：重画前记下 `selection.getRangeAt(0)` 的端点（blockIndex + start/end），重画后按同一偏移重新 `addRange`；或者干脆重画时若选区与要重建的 mark 相交，就跳过这一条。
3. **`onPointerDown` 的 mark 分支目前是死代码**：`if (!ui || ui.toolbar.hidden) return;` 挡在前面，正常态（工具条未显示）点 mark 永远走不到 `preventDefault()`。把 mark 判定提到 `toolbar.hidden` 守卫之前（只做 `event.preventDefault()`，不要在里面改 `holding`），点 mark 时浏览器就不会先把选区塌成 caret，`selectMark()` 也不必兜底。这条是体验/健壮性修复，**不是**这两条用例失败的必要条件 —— 3.1 单独就能让它们变绿。

不要动的部分：`selectMark()` 里补发 `selectionchange` 的兜底、`holdUntil`/`holding` 的宽限逻辑本身没错，问题在于「重画」抢在它们前面。

---

## 4. 复现命令与耗时

### 4.1 复现（约 2 分钟，其中 1 分钟是构建）

```bash
cd ~/Documents/WebSiteCode/zcblog-v2
npx astro build                                   # ← 必做：dist 可能是别的 WIP 的产物
npx astro preview --host 127.0.0.1 --port 4321 --ignore-lock   # 后台；4321 现有一个在跑
npx playwright test e2e/annotations-article.spec.ts \
  --config playwright.m7-4b.config.ts \
  -g "再次选中高亮文字|点击已高亮的文字"
```

`playwright.m7-4b.config.ts` 是仓库里**未跟踪**的临时 runner（复用 4321 上的 preview，webServer 只起一个 `sleep` 占位），本次诊断沿用、未改动。

### 4.2 时序取证（探针在仓库外，可复跑）

```bash
cd ~/.hermes/profiles/blog-fe/cache/scratch
node m7-4b-probe2.cjs test1   # 事件时序 + 选区变更栈 → probe2-test1.json
node m7-4b-probe2.cjs test2   # → probe2-test2.json
node m7-4b-probe4.cjs         # 反证：等价修复后两个场景都绿
```

### 4.3 实测耗时

| 步骤 | 耗时 |
| --- | --- |
| `npx astro build`（479 页） | 1 min 7 s |
| 两条失败用例跑一遍（含 120 s 超时那条） | 2 min 30 s |
| 单场景探针（含浏览器启动 + 造高亮） | 6–9 s |
| 反证运行（两场景 + 取消高亮） | ~20 s |
| 排查到根因（含识别 `dist` 脏、重建、重测） | ~18 min |

### 4.4 现场遗留

- `127.0.0.1:4321` 上有一个本卡起的 `astro preview`（日志 `/tmp/m7-4b-preview.log`），下一位 worker 可直接 `--config playwright.m7-4b.config.ts` 复用；不需要时 `pkill -f "astro preview"`。
- `dist/` 已是 `14f89b7` 的干净构建（gitignored，无 diff）。
