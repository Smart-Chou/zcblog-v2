#!/usr/bin/env node
/**
 * 系列功能 e2e 的固定内容构建（M5-12 · D-0145）
 *
 * 为什么需要它：`/series/` 是**按内容生成**的路由 —— 生产内容仓当前 0 篇写 `series`
 * （回填属 M5-13），所以真实构建里根本没这个路由，e2e 断言永远无从下手。
 * 这和页面级视觉基线（`scripts/visual/build-pages-baseline.mjs`）是同一个问题、
 * 同一个解法：用 `e2e/fixtures/series/` 里的固定内容构建一份 dist，再让 Playwright
 * 对着 `astro preview` 跑。
 *
 * 两个环境变量都必须设，否则同一份源码会在不同机器上渲染出不同结果：
 *   · CONTENT_ARTICLE_BASE → 固定夹具（否则读到私有内容仓 89 篇）
 *   · ARTICLE_REPO_PATH    → 不存在的路径（否则 `git-date.ts` 在本机会去读内容仓 git log）
 *
 * 用法：node scripts/series/build-e2e-fixture.mjs
 *      （pnpm series:e2e 会先跑它，再跑 playwright）
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FIXTURE_DIR = "e2e/fixtures/series/content/article";
const fixturePath = path.join(ROOT, FIXTURE_DIR);

let files;
try {
    files = readdirSync(fixturePath).filter(
        (name) => name.endsWith(".md") || name.endsWith(".mdx"),
    );
} catch {
    console.error(`✗ 缺少系列夹具内容目录：${FIXTURE_DIR}`);
    process.exit(1);
}

if (files.length === 0) {
    console.error(`✗ ${FIXTURE_DIR} 里没有文章，系列路由不会被生成`);
    process.exit(1);
}

// 夹具必须自带 upDate：否则 modifiedTime 走 `new Date()`，两次构建的 DOM 就不一样了
const missingUpDate = files.filter((file) => {
    const head = readFileSync(path.join(fixturePath, file), "utf8").split("---")[1] ?? "";
    return !/^upDate:/m.test(head);
});
if (missingUpDate.length > 0) {
    console.error(`✗ 以下夹具文章缺 upDate：${missingUpDate.join(", ")}`);
    process.exit(1);
}

const withSeries = files.filter((file) => {
    const head = readFileSync(path.join(fixturePath, file), "utf8").split("---")[1] ?? "";
    return /^series:/m.test(head);
});
if (withSeries.length === 0) {
    console.error(`✗ 夹具里没有一篇带 series 的文章（e2e 无从断言）`);
    process.exit(1);
}

const astroBin = path.join(ROOT, "node_modules", ".bin", "astro");
console.log(`▶ 系列 e2e 构建：${files.length} 篇夹具（${withSeries.length} 篇带 series）→ dist/`);

const result = spawnSync(astroBin, ["build"], {
    cwd: ROOT,
    stdio: "inherit",
    env: {
        ...process.env,
        CONTENT_ARTICLE_BASE: FIXTURE_DIR,
        ARTICLE_REPO_PATH: path.join(ROOT, ".series-e2e-no-content-repo"),
        CI: process.env.CI ?? "",
    },
});

process.exit(result.status ?? 1);
