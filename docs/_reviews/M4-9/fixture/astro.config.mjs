// M4-9 消费者 fixture：最小 Astro 项目，只挂一条 OG 预渲染路由。
// 三路径验证中的「Astro 预渲染」路径用它；其余两条路径（裸 Node / esbuild bundle）见
// 任务工作区 probe/render.mjs 与 probe/bundle-render.mjs。
import { defineConfig } from "astro/config";

export default defineConfig({
    site: "https://consumer.example.com",
    output: "static",
});
