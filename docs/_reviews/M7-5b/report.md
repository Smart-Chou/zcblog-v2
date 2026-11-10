# M7-5b · 加密文本解锁 modal 视觉 / a11y 收口

- 卡：`t_ab6f9fea`（blog2 板）
- 结论：**完成**；`encrypted-unlock.spec.ts` **10 passed / 0 failed**；type-check PASS，`gates:all` **8/8 PASS**，Perf **over=0**。

## 实现

- `src/remark-plugin/rehype-encrypted.ts`
  - 加密块渲染改为「门禁卡 + 原生 `<dialog>` + 解密落点 + 内联脚本」。
  - 语义：`role=dialog`、`aria-modal=true`、`aria-labelledby` / `aria-describedby`；
    关闭键用视觉隐藏文本「关闭」，避免 axe `label-content-name-mismatch`。
  - 状态：错误态 `role=alert` + `aria-invalid` + 焦点留在输入框；成功后关闭 dialog、
    门禁卡消失、焦点落到解密内容（`tabindex=-1`）。
  - Tab 在 dialog 内循环；Esc / 关闭键 / 点遮罩三种关法，焦点回触发按钮。
  - 不新增 AES、不改密钥格式；仍复用构建期 `encryptContent` 与既有 blob 格式。
- `src/styles/pages/encrypted.css`
  - 桌面居中 panel；≤640 贴底全宽 sheet；打开态滚动锁；reduced-motion 下 0 动画。
- `e2e/encrypted-unlock.spec.ts`
  - 用「生产同源标记 + CSS + 内联脚本」夹具挂进真实文章页，覆盖门禁态（0 请求）、
    打开/关闭、焦点陷阱、错误态、成功态、桌面/390 视觉、axe light/dark、不泄密、
    插件端到端。

## 验收

```text
encrypted-unlock.spec.ts   10 passed / 0 failed (21.6s)
type-check                 exit 0
gates:all                  8/8 PASS
perf-budget                扫描 751 页，over=0
                           article JS p95 39.6 / CSS p95 41.9
```

## 证据

- 截图：`docs/_reviews/M7-5b/screens/{unlock-desktop-light,unlock-desktop-dark,unlock-error-dark,unlock-mobile-390}.png`
- 说明：worker run 194 超时（1814s）后 operator 接手 WIP（`c63bfe3`）并补完验收。

## 边界

站点内容目前没有真实加密块；本卡用夹具验证生产同源输出，不引入演示用密文内容。
