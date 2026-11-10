import { onPageReady } from "~/utils/page-lifecycle";

// 阈值走 data 属性：`define:vars` 会把脚本强制内联，而内联脚本拿不到 import，
// 之前 `onPageReady(...)` 在这里是 ReferenceError，整个返回顶部直接失效。
// 事件统一挂 document + AbortController：按钮可能常驻布局，也可能随 <main> 被替换，
// 每次换页先 abort 再重新绑定，既不会重复触发也不会绑在已销毁的元素上。
let controller: AbortController | null = null;

onPageReady(() => {
    controller?.abort();
    controller = new AbortController();

    const update = () => {
        const el = document.getElementById("back-to-top");
        if (!el) return;
        const threshold = Number(el.dataset.threshold ?? 300);
        el.classList.toggle("active", window.scrollY > threshold);
    };

    document.addEventListener("scroll", update, { passive: true, signal: controller.signal });
    document.addEventListener(
        "click",
        (event) => {
            const target = event.target as HTMLElement | null;
            if (!target?.closest("#back-to-top")) return;
            window.scrollTo({ top: 0, behavior: "smooth" });
        },
        { signal: controller.signal },
    );

    update();
});
