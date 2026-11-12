import { defineConfig, devices } from "@playwright/test";

/**
 * Visual baselines are platform-specific: the specimen fixture ships no `@font-face`,
 * so glyph metrics come from the OS font stack (Georgia/-apple-system on macOS,
 * Liberation/FreeSans/Noto in the Playwright Linux image). Each platform therefore
 * owns its own snapshot directory *and* its own threshold, and exactly one project is
 * instantiated per run — comparing this machine's pixels against the other platform's
 * PNGs is meaningless, so we never run both projects at once.
 *
 *   macOS → e2e/__screenshots__/design-atoms/       (maxDiffPixelRatio 0.01, M1-4)
 *           e2e/__screenshots__/pages/              (maxDiffPixelRatio 0.01, M5-11)
 *   Linux → e2e/__screenshots__/design-atoms-linux/ (maxDiffPixels 0, CI gate)
 *           e2e/__screenshots__/pages-linux/        (maxDiffPixels 0, CI gate)
 *
 * The Linux sets are generated inside `mcr.microsoft.com/playwright:v1.63.0-noble` — the
 * exact image `.github/workflows/ci.yml` (`visual` job) runs — so the gate is
 * deterministic instead of "close enough".
 *
 * M5-11 adds a second suite (`e2e/pages.visual.spec.ts`): six real pages × 2 themes ×
 * 3 viewports = 36 page-level baselines per platform. Both suites share the platform
 * choice; they differ only in snapshot dir, so each project matches exactly one spec file.
 */
const PLATFORM: "macos" | "linux" = (process.env.PLAYWRIGHT_BASELINE_PLATFORM ??
    (process.platform === "linux" ? "linux" : "macos")) as "macos" | "linux";

const BASELINE_PROJECTS = {
    macos: [
        {
            name: "chromium",
            dir: "design-atoms",
            match: /design-atoms\.visual\.spec\.ts$/,
            // M1-4 behaviour, unchanged: 1% of pixels may differ (font AA on macOS).
            expect: {
                toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" as const },
            },
        },
        {
            name: "chromium-pages",
            dir: "pages",
            match: /pages\.visual\.spec\.ts$/,
            // Page shots are many times larger than atom specimens, so the same 1% ratio
            // would silently allow a whole card to move. 0.1% ≈ the macOS font-AA drift
            // measured on these pages while still red on any layout shift.
            expect: {
                toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: "disabled" as const },
            },
        },
        {
            name: "chromium-organism",
            dir: "design-organism",
            match: /pages-radio\.visual\.spec\.ts$/,
            // Element shots of the armed player (idle / expanded / error). The boxes are tiny
            // (280×46 … 336×108), so a ratio threshold would let a whole icon move: 0.1% of
            // 12,880 px is ~13 px, i.e. a 3×3 icon could vanish and still pass. macOS glyph
            // AA on this box measured 0 px drift, so the ratio only buys room for the slider
            // thumb's sub-pixel edge — same value as the page suite, different reason.
            expect: {
                toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: "disabled" as const },
            },
        },
    ],
    linux: [
        {
            name: "chromium-linux",
            dir: "design-atoms-linux",
            match: /design-atoms\.visual\.spec\.ts$/,
            // Same machine, same image, same font packages → M1-4 measured 0 px drift on
            // re-render, so CI insists on an exact match. Never relax this to make a run pass.
            expect: { toHaveScreenshot: { maxDiffPixels: 0, animations: "disabled" as const } },
        },
        {
            name: "chromium-linux-pages",
            dir: "pages-linux",
            match: /pages\.visual\.spec\.ts$/,
            // Same reasoning: generated in this image, on fixed fixture content, with
            // third-party traffic stubbed → pixel-exact. M5-11 verified 0 drift over 2 runs.
            expect: { toHaveScreenshot: { maxDiffPixels: 0, animations: "disabled" as const } },
        },
        {
            name: "chromium-linux-organism",
            dir: "design-organism-linux",
            match: /pages-radio\.visual\.spec\.ts$/,
            // Generated inside this same image from the same fixture build, so the set is
            // reproducible to the pixel; no threshold widening here either.
            expect: { toHaveScreenshot: { maxDiffPixels: 0, animations: "disabled" as const } },
        },
    ],
} as const;

const [ATOMS, PAGES, ORGANISM] = BASELINE_PROJECTS[PLATFORM];

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: "html",
    // Page-level shots are tall (the long-form article is ~19k CSS px) and each one waits
    // for fonts + images; 30s is not enough headroom on a cold runner.
    timeout: 120000,

    // DESIGN.md §5.6: e2e/__screenshots__/design-atoms/<name>-<theme>-<width>.png
    // Playwright sanitises "/" inside {arg}, so the folder segment lives in the template.
    // No {projectName}/{snapshotSuffix} on purpose — the baseline names are fixed by the
    // design doc, and the platform split is expressed by the project below.
    snapshotPathTemplate: `{testDir}/__screenshots__/${ATOMS.dir}/{arg}{ext}`,

    expect: {
        toHaveScreenshot: {
            maxDiffPixelRatio: 0.01,
            animations: "disabled",
        },
    },

    use: {
        baseURL: "http://127.0.0.1:4321",
        trace: "on-first-retry",
    },

    projects: [
        {
            name: ATOMS.name,
            // Atoms is the catch-all bucket: it must not swallow any page- or element-sized
            // suite (each owns its own snapshot dir and threshold).
            testIgnore: [PAGES.match, ORGANISM.match],
            expect: ATOMS.expect,
            snapshotPathTemplate: `{testDir}/__screenshots__/${ATOMS.dir}/{arg}{ext}`,
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: PAGES.name,
            testMatch: PAGES.match,
            expect: PAGES.expect,
            snapshotPathTemplate: `{testDir}/__screenshots__/${PAGES.dir}/{arg}{ext}`,
            use: { ...devices["Desktop Chrome"] },
        },
        {
            // Element-level shots of the armed player (§5.7.1). Same preview server as the
            // other two suites — the shapes are produced at runtime by localStorage + a route
            // abort, not by a separate build, so this project needs no fixture of its own.
            name: ORGANISM.name,
            testMatch: ORGANISM.match,
            expect: ORGANISM.expect,
            snapshotPathTemplate: `{testDir}/__screenshots__/${ORGANISM.dir}/{arg}{ext}`,
            use: { ...devices["Desktop Chrome"] },
        },
    ],

    webServer: {
        // 用本地 bin 而不是 `pnpm exec`：webServer 由 /bin/sh 拉起，PATH 里不一定有 pnpm
        // （本机走 corepack、CI 走 corepack shim）。这条命令在 macOS 与 Linux 镜像里都能跑。
        // --force：.astro/preview.json 里可能残留上一次被 SIGKILL 的 pid（CI 步骤/容器
        // 被中断时会发生），没有这个标志 astro preview 会直接退出，门禁假红。
        command: "./node_modules/.bin/astro preview --host 127.0.0.1 --port 4321 --force",
        url: "http://127.0.0.1:4321",
        reuseExistingServer: false, // 本机残留 preview 会被误复用；一律由本次 runner 起新 server
    },
});
