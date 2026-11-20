/**
 * copy-vendor-css.mjs
 *
 * 把 npm 包里的 CSS 拷到 `public/assets/vendor/`，让站点同源自托管。
 *
 * 为什么需要这一步（N-2b Twikoo）：
 *   `twikoo` 的 `package.json` 只有 `"exports": { ".": "./dist/twikoo.min.js" }`，
 *   **没有导出 CSS 子路径**。所以 `import css from "twikoo/dist/twikoo.css?url"`
 *   会在构建期报：
 *     `"./dist/twikoo.css" is not exported under the conditions [...]`
 *   （rolldown:vite-resolve 抛错，实测 2026-11-20）。
 *
 * 为什么不直接把 CSS 提交进仓库：
 *   那是 36 KB 的第三方生成物，跟着依赖版本漂移，提交后会与 `node_modules` 脱节
 *   （升级 twikoo 忘了重拷 → 样式静默变旧）。构建期拷贝的产物写进 `.gitignore`，
 *   永远与当前依赖一致。
 *
 * 为什么不改成从 CDN 加载 CSS：
 *   `style-src` 现在只有 `'self'` + `'unsafe-inline'` + bootcdn，从 jsdelivr 拉 CSS
 *   要么放宽 `style-src`（安全面代价），要么违反 H-12 的「不放宽」原则。
 *   同源自托管不需要任何 CSP 改动。
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 每项：npm 包内路径 → public 下目标路径 */
const VENDOR_CSS = [
    {
        from: "node_modules/twikoo/dist/twikoo.css",
        to: "public/assets/vendor/twikoo.css",
        // 只有启用 twikoo 时才需要；未装该包时静默跳过，避免 demo/装配站构建失败
        optional: true,
    },
];

let copied = 0;
for (const item of VENDOR_CSS) {
    const src = join(root, item.from);
    const dest = join(root, item.to);

    if (!existsSync(src)) {
        if (item.optional) {
            console.log(`  ⏭  跳过（未安装）：${item.from}`);
            continue;
        }
        console.error(`  ✗ 缺少必需文件：${item.from}`);
        process.exitCode = 1;
        continue;
    }

    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    console.log(`  ✓ ${item.from} → ${item.to}`);
    copied += 1;
}

console.log(`  vendor CSS 已拷贝 ${copied} 项`);
