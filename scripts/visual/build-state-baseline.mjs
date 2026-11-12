#!/usr/bin/env node
/**
 * Build the state-level variants that `e2e/pages-states.visual.spec.ts` screenshots (§7.2).
 *
 * The three C-1 entity pages expose their empty / error branch through a build-time flag
 * (`PUBLIC_{PROJECTS,DEVICES,SKILLS}_STATE`). Those branches only exist in a build that was
 * made with the flag set, so a pixel gate needs one build per state — this script makes them
 * and nothing else.
 *
 * ## Layout
 *
 *   .visual-states/empty/     projects/index.html  devices/index.html  skills/index.html
 *   .visual-states/error/     …
 *
 * One build per **state** (all three pages inside it), not one per page×state: each page reads
 * only its own `PUBLIC_*_STATE`, so setting the three at once produces exactly the same HTML as
 * three separate builds would, at a third of the cost.
 *
 * The spec serves these directories itself (ports 4401+) — they are never copied into `dist/`,
 * and `astro preview` is not used, so a running preview cannot be disturbed.
 *
 * ## Why the build is reproducible
 *
 * Same three knobs as `build-pages-baseline.mjs`, and for the same reason: article content and
 * "today's date" must not reach the pixels. The footer prints the article count, so a build
 * against the private content repo would make these baselines drift with every new post.
 *
 *   CONTENT_ARTICLE_BASE → e2e/fixtures/pages-visual/content/article
 *   ARTICLE_REPO_PATH    → a path that does not exist (git-date fallback must be identical
 *                          on macOS and in the CI container)
 *   NODE_OPTIONS         → scripts/visual/freeze-clock.cjs (relative "N 天前" never enters pixels)
 *
 * ## Which states exist
 *
 * `EntityStatus` is `ok | empty | error` — there is no `loading` value in the contract, and the
 * three pages have no loading branch. §7.2 also lists `filtered-empty`, which needs the filter
 * UI; neither is buildable here. Both are tracked on the `m8-wip-20261110` branch (unmerged, see
 * decision-log D-0156「未决」). When it lands, add the state to STATES below and regenerate —
 * nothing else in this script changes.
 *
 * Usage:
 *   node scripts/visual/build-state-baseline.mjs            # every state in STATES
 *   node scripts/visual/build-state-baseline.mjs --only=error
 *
 *   (pnpm visual:build:states)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FIXTURE_DIR = "e2e/fixtures/pages-visual/content/article";
const OUT_ROOT = path.join(ROOT, ".visual-states");

/** One entry per page: the flag it reads, and where its HTML lands inside an outDir. */
const PAGES = [
    { name: "projects", flag: "PUBLIC_PROJECTS_STATE", html: "projects/index.html" },
    { name: "devices", flag: "PUBLIC_DEVICES_STATE", html: "devices/index.html" },
    { name: "skills", flag: "PUBLIC_SKILLS_STATE", html: "skills/index.html" },
];

/**
 * Only the states the entity contract actually defines (`EntityStatus = ok | empty | error`).
 * `loading` is a §7.2 spec-only preview value that never landed on `main`; adding it here
 * before the page templates grow that branch would just record the `ok` layout under a
 * misleading name — the marker assertion below is what refuses to let that happen.
 */
const STATES = ["empty", "error"];

const only = process.argv
    .find((arg) => arg.startsWith("--only="))
    ?.slice("--only=".length)
    ?.split(",")
    .filter(Boolean);
if (only && only.length > 0) {
    const unknown = only.filter((state) => !STATES.includes(state));
    if (unknown.length > 0) {
        console.error(`✗ 未知状态：${unknown.join(", ")}（可选 ${STATES.join(" / ")}）`);
        process.exit(1);
    }
}
const states = only && only.length > 0 ? only : STATES;

/* ── 1. 前置：固定内容必须存在且每篇都有 upDate（否则构建时间进入像素）────── */

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

/* ── 2. 逐状态构建 ─────────────────────────────────────────────────────── */

const astroBin = path.join(ROOT, "node_modules", ".bin", "astro");
const freezeClock = path.join(ROOT, "scripts", "visual", "freeze-clock.cjs");
const nodeOptions = [process.env.NODE_OPTIONS, `--require=${freezeClock}`]
    .filter(Boolean)
    .join(" ");
const started = Date.now();

for (const state of states) {
    const outDir = path.join(OUT_ROOT, state);
    const env = {
        ...process.env,
        CONTENT_ARTICLE_BASE: FIXTURE_DIR,
        ARTICLE_REPO_PATH: path.join(ROOT, ".visual-baseline-no-content-repo"),
        CI: process.env.CI ?? "",
        NODE_OPTIONS: nodeOptions,
    };
    for (const page of PAGES) env[page.flag] = state;

    console.log(
        `▶ ${state}：3 页（${PAGES.map((p) => p.name).join(" / ")}）→ ${path.relative(ROOT, outDir)}/`,
    );
    const result = spawnSync(astroBin, ["build", "--outDir", outDir], {
        cwd: ROOT,
        stdio: "inherit",
        env,
    });
    if (result.status !== 0) {
        console.error(`✗ ${state} 构建失败（exit ${result.status}）`);
        process.exit(result.status ?? 1);
    }

    // 三份 HTML 必须存在、而且真的带着这个状态。flag 拼错或页面改名时，截图会安静地变成 ok 态，
    // 基线里就录下一批「看起来不同其实一样」的假状态 —— 这里宁可构建失败。
    for (const page of PAGES) {
        const file = path.join(outDir, page.html);
        if (!existsSync(file) || statSync(file).size === 0) {
            console.error(`✗ ${state}：缺 ${page.html}（${page.flag}=${state} 未生效？）`);
            process.exit(1);
        }
        const html = readFileSync(file, "utf8");
        // The postbuild step collapses/minifies HTML, so the attribute may come back unquoted
        // (`data-projects-status=empty`); match both forms instead of a single literal.
        const marker = new RegExp(
            `data-${page.name}-status=(?:"${state}"|'${state}'|${state}(?=[\\s>]))`,
        );
        if (!marker.test(html)) {
            console.error(
                `✗ ${state}：${page.html} 里没有 data-${page.name}-status="${state}"` +
                    `——构建期开关没生效，拒绝把 ok 态录成状态基线`,
            );
            process.exit(1);
        }
    }
}

console.log(
    `✔ ${states.length} 个状态构建完成（${((Date.now() - started) / 1000).toFixed(1)}s）：` +
        `${states.map((s) => `.visual-states/${s}/`).join(" ")}`,
);
console.log(
    `  ${PAGES.length} 页 × ${states.length} 状态 × 2 主题 × 3 视口 = ${PAGES.length * states.length * 6} 张/平台`,
);
