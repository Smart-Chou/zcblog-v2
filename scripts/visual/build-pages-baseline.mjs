#!/usr/bin/env node
/**
 * Build the preview output that page-level visual baselines are generated/verified from.
 *
 * Two things make the build deterministic, and both are set here so nobody has to remember
 * them when regenerating baselines:
 *
 *  1. `CONTENT_ARTICLE_BASE` → `e2e/fixtures/pages-visual/content/article`
 *     The real content lives in a private repo and grows; every new article changes `/`,
 *     `/archives/` and the popular list, which would fail the visual gate for reasons that
 *     have nothing to do with the theme.
 *  2. `ARTICLE_REPO_PATH` → a path that does not exist
 *     `src/utils/git-date.ts` would otherwise read `git log` from
 *     `~/Documents/WebSiteCode/zcblog-articles` on a developer machine and skip it in CI —
 *     i.e. the same source tree would render different dates on the two platforms. Every
 *     fixture article carries `upDate`, which wins over any date lookup, and this makes the
 *     fallback path identical everywhere.
 *
 * Usage:  node scripts/visual/build-pages-baseline.mjs
 *         (pnpm visual:build:pages)
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FIXTURE_DIR = "e2e/fixtures/pages-visual/content/article";
const fixturePath = path.join(ROOT, FIXTURE_DIR);

let files;
try {
    files = readdirSync(fixturePath).filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));
} catch {
    console.error(`✗ 缺少视觉基线固定内容目录：${FIXTURE_DIR}`);
    process.exit(1);
}

if (files.length === 0) {
    console.error(`✗ ${FIXTURE_DIR} 里没有文章，基线会渲染空页面`);
    process.exit(1);
}

// A fixture article without upDate makes the build fall back to `new Date()`:
// the baseline would then encode the generation date and drift on every rebuild.
const missingUpDate = files.filter((file) => {
    const head = readFileSync(path.join(fixturePath, file), "utf8").split("---")[1] ?? "";
    return !/^upDate:/m.test(head);
});
if (missingUpDate.length > 0) {
    console.error(
        `✗ 以下 fixture 文章缺 upDate（会让构建时间进入像素）：${missingUpDate.join(", ")}`,
    );
    process.exit(1);
}

const astroBin = path.join(ROOT, "node_modules", ".bin", "astro");
const freezeClock = path.join(ROOT, "scripts", "visual", "freeze-clock.cjs");
const nodeOptions = [process.env.NODE_OPTIONS, `--require=${freezeClock}`]
    .filter(Boolean)
    .join(" ");
console.log(`▶ 视觉基线构建：${files.length} 篇固定文章 → dist/（时钟冻结 ${freezeClock}）`);

const result = spawnSync(astroBin, ["build"], {
    cwd: ROOT,
    stdio: "inherit",
    env: {
        ...process.env,
        CONTENT_ARTICLE_BASE: FIXTURE_DIR,
        ARTICLE_REPO_PATH: path.join(ROOT, ".visual-baseline-no-content-repo"),
        // 视觉运行不碰第三方抓取；任何 fetch:* 都不在构建脚本里，这里只是显式表态。
        CI: process.env.CI ?? "",
        NODE_OPTIONS: nodeOptions,
    },
});

process.exit(result.status ?? 1);
