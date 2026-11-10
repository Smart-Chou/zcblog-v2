# M8-5c · 友链申请弹层（步骤 / 复制 / issue 模板）

## 结论

完成。`/friends/` 的「通过 GitHub 申请」链接升级为原生 `<dialog>` 弹层：
三步说明、四个字段逐项复制 + 一键复制全部、复制失败可见降级文案、Esc 关闭与焦点回填。
前端不持 token、不调 GitHub API、不代提交、不自动合并；CTA 只打开
`.github/ISSUE_TEMPLATE/friend-link.yml`。

## 实现

- `src/components/UI/FriendApply.astro`（新）：原生 `<dialog id="friend-apply" hidden>`；
  `aria-labelledby` 指向标题；中英双语文案；字段值来自 `site` / `author`，不写死。
- `src/scripts/overlay-sheets.ts`：把 `a.friends-gh` 升级为 `aria-haspopup="dialog"`；
  无 JS 时仍是直链，功能不降级。打开时 `showModal()`，关闭时 `close()` + `hidden`，
  焦点回到触发链接；`navigator.clipboard` 失败时选中文本并显示
  「Copy failed — … press ⌘/Ctrl + C」/中文对应文案，不静默失败。
- `src/styles/pages/friends.css`：桌面居中卡、≤640 贴底 sheet、`[hidden]` 显式
  `display:none`、暗色可读。
- 顺手修正：`a.friends-gh` 暗色下 `--color-fg-muted` 仅 3.49:1 → 改
  `--color-fg-default`（正文级对比度）。

## 验收

- `pages-friends-m85c.spec.ts`：**12 passed / 0 failed**
  （打开/关闭/Esc/焦点回填；复制成功与失败；1440 居中 + 390 sheet；
  0 横向溢出 375/768/1440 × 关/开；EN 页同套弹层；0 请求、链接只指向模板文件；
  axe 弹层与页面 light/dark 全部 serious=0）。
- 证据：`docs/_reviews/M8-5c/e2e.log`、`build.log`、`screens/` 5 张。
- `type-check` exit 0。

## 边界

没有新增第三方请求，没有改抓取 workflow，没有引入依赖。
`pages-friends-m85c.spec.ts` 的请求断言把「打开弹层」前后的 network 记录做了对比，
新增请求数 = 0。

## 备注

M8-5a/5b 的改动与 5c 同一批落在共享工作树；三张卡一起提交，避免 5c 单独提交时
依赖未提交的 adapter / 栅格。`/friends/` 的页面视觉基线需在 M8 批次末尾统一重刷。
