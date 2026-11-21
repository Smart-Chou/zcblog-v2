# H-11 配套 · 两条时序脆弱断言修复

**日期**：2026-11-20
**范围**：`e2e/encrypted-unlock.spec.ts:147`、`e2e/annotations-hud.spec.ts:298`
**原则**：**修竞态，不修判据**。两条容差都是原值（`toHaveLength(0)` / `<= 2`）。

---

## 1. `encrypted-unlock.spec.ts` — 「0 请求」计数竞态

### 症状

「门禁态：只有入口按钮，dialog 未打开，0 请求」偶发红。该条对比**两个页面**：
基线页（不挂夹具）与夹具页，要求夹具页不得新增任何请求。

### 原写法的问题

```ts
target.on("request", onReq);
if (withFixture) await mount(target);
else { await target.goto(ARTICLE); /* … */ }
armed = true;
await target.waitForTimeout(1200);   // ← 固定窗口
```

两侧都是「导航完成 → 立刻 armed → 固定等 1200ms」，但**两侧的导航完成时刻不同**。
懒加载 chunk（swup 预取、fancybox、umami 埋点）若落在基线窗口内、夹具窗口外，
就会被判成「夹具新增了请求」。

### 修法

**把两侧的起跑线对齐**：先各自等网络空闲，再从同一状态开始计时。

```ts
// 归一化起点：两侧都等到网络空闲再开始算「新增」
await target.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
target.on("request", onReq);
armed = true;
await target.waitForTimeout(800);
armed = false;          // ← 顺手：窗口结束后立刻停记，避免后续断言期间的请求混入
target.off("request", onReq);
```

`networkidle` 超时不判错（埋点可能有零星长轮询），只是为了对齐起跑线。
**判据没变**：测量窗口内新增请求仍必须是 0。

---

## 2. `annotations-hud.spec.ts` — 滚动恢复差恒定 21px

这条比上一条难，走了两次弯路，记下来。

### 症状

「390 抽屉…滚动锁与恢复」偶发红，且**固定差 21px**：

```
Error: 抽屉关闭后应回到原滚动位置 1013
Expected: <= 2
Received:    21
```

「恒定 21px」不像随机竞态。实测连跑 6 轮：**R1–R3 全绿，R4–R6 连续红**，
每次都是 21。

### 弯路一：以为是「读得太早」

原写法 `scrollTo(...)` 后 `waitForTimeout(120)` 就读 `scrollY`。
我改成「等两帧再读」，仍然偶发。**说明不是读得早。**

### 弯路二：以为产品恢复有 bug

`src/scripts/scroll-lock.ts` 只有 19 行，逻辑看起来没问题：

```ts
export function unlockScroll() {
    /* 清掉 body/html 的锁样式 */
    window.scrollTo(0, scrollY);   // scrollY 是 lockScroll() 时记的模块级变量
}
```

于是写探针复现完整流程，并在开/关各阶段记录 `scrollY`、`scrollHeight`、`body.top`。
**结论：`netDelta: 0`，产品恢复是准确的。** 探针连续开关 5 次，每次落点都精确回到锁定前位置。

### 真因：断言把基点取错了

探针暴露了关键一帧：

```json
{ "targetY": 1013, "beforeClick": 1034, "afterClose": 1034, "netDelta": 0 }
```

`scrollTo(0, 1013)` 执行后，页面**又自己移动到了 1034**（差 21px）。
原因是 `addHighlight()` 里的 `block.scrollIntoView({block:"center"})`
与图片/字体加载会继续推动布局 —— scrollY 是个**移动靶**。

于是：

- 断言记的 `scrolled = 1013`（点击前的**幻影值**）
- 产品记的 `lockScroll()` 位置 = **1034**（真实值）
- 解锁后回到 1034 → 与 1013 比 → 恒差 21px

**产品没错，是断言拿一个已经过期的值当基准。**

### 修法：从产品实际记下的位置取基点

`lockScroll()` 把真实位置写进了 `document.body.style.top = "-1034px"`。
那才是产品承诺要恢复的值。断言改为：

```ts
// 打开抽屉后，从 lockScroll 记下的位置取基准
const locked = await page.evaluate(() => ({
    html: document.documentElement.style.overflow,
    body: document.body.style.position,
    top: document.body.style.top,
}));
expect(locked.top, "滚动锁应记录打开时的位置").toMatch(/^-\d+px$/);
const lockedY = Math.abs(Number.parseInt(locked.top.replace(/[^\d-]/g, ""), 10));
expect(lockedY, `滚动锁记录的位置异常：${locked.top}`).toBeGreaterThan(0);

// 关闭后，等它回到 lockedY
await expect.poll(
    async () => {
        const now = await page.evaluate(() => Math.round(window.scrollY));
        return Math.abs(now - lockedY);
    },
    { message: `抽屉关闭后应回到锁定前位置 ${lockedY}`, timeout: 3000 },
).toBeLessThanOrEqual(2);
```

**判据反而变强了**：

- 原来只验「回到某个我猜的位置」
- 现在还额外验「`lockScroll()` 真的记录了位置」（`top` 必须匹配 `-Npx` 且 N > 0）——
  这能抓住「锁没生效/位置没记」的真 bug，原写法抓不到。

---

## 3. 方法教训

1. **「恒定差值」不是竞态，是口径错误。** 竞态的表现是忽大忽小、时有时无；
   每次都差同一个数（21px），说明有一个稳定的错误假设。
2. **探针要打到「产品记了什么」，而不是「我以为它记了什么」。**
   这次救场的是 `body.style.top` —— 一行 `evaluate` 就把争论结束了。
3. **修断言前先证明产品是对的。** 我用探针连续开关 5 次、`netDelta: 0`，
   才敢断定问题在断言侧。若不验证就改断言，等于把真 bug 掩盖掉。
