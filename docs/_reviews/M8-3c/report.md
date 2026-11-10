# M8-3c · 相册灯箱大图 + 缩略条 + 键盘 / a11y

## 结论

完成。相册灯箱保留原有 `@fancyapps/ui` 6.1.15，一套卡片式大图 + 底部横向缩略条；
≤640 全屏 sheet；←/→/Esc、焦点、reduced-motion 与 axe 全部收口。文章灯箱零改动。

## 实现

- `src/scripts/fancybox-album.ts`：相册独立 bind（`mainClass: fancybox--album`），
  不再复用文章灯箱的 `initAlbumFancybox`；桌面 4vh/4vw 边距、移动全屏。
- `src/styles/fancybox-overrides.css`：底部缩略条（`type:"scrollable"` 改为横向原生滚动）、
  选中项居中滚动、移动 sheet、reduced-motion 动画归零；全部作用域 `.fancybox--album`。
- 键盘：`Escape/ArrowLeft/ArrowRight` 显式写死；打开后焦点移入容器（否则焦点留在
  触发 `<a>`，fancybox 的键盘表不生效）；关闭后焦点回当前 slide 的触发缩略图。
- a11y：容器补 `role="dialog"` / `aria-modal="true"` / `aria-label="相册名 · n/总数"`；
  slide 补 `role="group"`，消掉 fancybox 自带 `aria-labelledby` 的 `aria-prohibited-attr`。

## Operator 接手时修正的三处实现缺陷

1. **`closest("dialog")` 永远为 null**：fancybox 6 实际容器是
   `<div class="fancybox__container" tabindex="0">`（mainTpl 里的 `<dialog>` 是外层模板，
   运行时拿到的 container 不是它）。改为直接装饰 `api.getContainer()`。
2. **aria-label 被 fancybox 覆盖**：mainTpl 带 `aria-label="{{MODAL}}"`，ready 后会被落成空值；
   同步设置会丢。改为 `refresh()` + rAF + 0ms/120ms 两次重落。
3. **虚拟轮播只渲染 2 个 slide**：不能拿 `slides.length` 当总数，总数取
   `#fancybox-gallery a[href]` 的数量；序号取选中 slide 的 `index` 属性。
   另外 ready 时 `getCarousel()` 还没就绪，`change` 事件订阅不上；改用
   `MutationObserver` 监听 slide class 变化来刷新标题，覆盖键盘/点击/滑动三条路径。

## 验收

- `astro build`：479 页完成（视觉夹具/空数据构建另算）。
- 新增 `e2e/pages-albums-lightbox.spec.ts`：**13 passed / 0 failed**
  （1440 92% 居中、缩略条横滚、键盘切图 + 可读标题、Tab 焦点陷阱、390 全屏 sheet、
  真 CDP 触摸左滑、reduced-motion、axe light/dark、8 张证据截图）。
- `e2e/pages-albums.spec.ts`：**16 passed / 0 failed**（含原图/Esc/焦点、溢出、axe、
  空数据真实构建）。
- `type-check` exit 0；`gates:all` **8/8 PASS**；`perf-budget` **over=0**
  （751 页，article JS p95 39.5 / CSS 42.4，list JS 24.8 / page JS 24.8）。
- 证据截图 8 张由 `pages-albums-lightbox.spec.ts` 生成：`screens/lightbox-{light,dark}-{1440,390}.png`、
  `thumbs-{light,dark}-{1440,390}.png`。

## 性能收口

`BaseLayout.astro` 原先静态 `import "~/scripts/fancybox-album"`，把相册灯箱 200+ 行塞进
全站公共 chunk，article JS 从 39.6 抬到 41.2 KB（90 页超预算）。改为：「页面存在
`#fancybox-gallery` 才 `import("~/scripts/fancybox-album")`」，`astro:page-load` 再判一次；
CSS 与 l10n 也改成异步 import。最终 article JS p95 **39.5 KB / over=0**。

## 基线

`/albums/` 与相册详情页的页面级视觉基线像素必变（缩略条/大图版式），由 operator 在
M8-3 批次末尾统一重刷 Linux 基线；本卡不单独提交 `e2e/__screenshots__/pages-linux/`。
