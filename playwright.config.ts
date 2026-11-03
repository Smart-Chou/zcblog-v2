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
 *   Linux → e2e/__screenshots__/design-atoms-linux/ (maxDiffPixels 0, CI gate)
 *
 * The Linux set is generated inside `mcr.microsoft.com/playwright:v1.63.0-noble` — the
 * exact image `.github/workflows/ci.yml` (`visual` job) runs — so the gate is
 * deterministic instead of "close enough".
 */
const PLATFORM: "macos" | "linux" = (process.env.PLAYWRIGHT_BASELINE_PLATFORM ??
    (process.platform === "linux" ? "linux" : "macos")) as "macos" | "linux";

const BASELINE_PROJECTS = {
    macos: {
        name: "chromium",
        snapshotPathTemplate: "{testDir}/__screenshots__/design-atoms/{arg}{ext}",
        // M1-4 behaviour, unchanged: 1% of pixels may differ (font AA on macOS).
        expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" as const } },
    },
    linux: {
        name: "chromium-linux",
        snapshotPathTemplate: "{testDir}/__screenshots__/design-atoms-linux/{arg}{ext}",
        // Same machine, same image, same font packages → M1-4 measured 0 px drift on
        // re-render, so CI insists on an exact match. Never relax this to make a run pass.
        expect: { toHaveScreenshot: { maxDiffPixels: 0, animations: "disabled" as const } },
    },
} as const;

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: "html",
    timeout: 30000,

    // DESIGN.md §5.6: e2e/__screenshots__/design-atoms/<name>-<theme>-<width>.png
    // Playwright sanitises "/" inside {arg}, so the folder segment lives in the template.
    // No {projectName}/{snapshotSuffix} on purpose — the baseline names are fixed by the
    // design doc, and the platform split is expressed by the project below.
    snapshotPathTemplate: BASELINE_PROJECTS[PLATFORM].snapshotPathTemplate,

    expect: {
        toHaveScreenshot: {
            maxDiffPixelRatio: 0.01,
            animations: "disabled",
        },
    },

    use: {
        baseURL: "http://localhost:4321",
        trace: "on-first-retry",
    },

    projects: [
        {
            name: BASELINE_PROJECTS[PLATFORM].name,
            expect: BASELINE_PROJECTS[PLATFORM].expect,
            snapshotPathTemplate: BASELINE_PROJECTS[PLATFORM].snapshotPathTemplate,
            use: { ...devices["Desktop Chrome"] },
        },
    ],

    webServer: {
        // 用本地 bin 而不是 `pnpm exec`：webServer 由 /bin/sh 拉起，PATH 里不一定有 pnpm
        // （本机走 corepack、CI 走 corepack shim）。这条命令在 macOS 与 Linux 镜像里都能跑。
        // --force：.astro/preview.json 里可能残留上一次被 SIGKILL 的 pid（CI 步骤/容器
        // 被中断时会发生），没有这个标志 astro preview 会直接退出，门禁假红。
        command: "./node_modules/.bin/astro preview --port 4321 --force",
        url: "http://localhost:4321",
        reuseExistingServer: !process.env.CI,
    },
});
