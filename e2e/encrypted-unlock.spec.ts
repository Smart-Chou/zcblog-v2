import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildEncryptedFixture, rehypeEncrypted } from "../src/remark-plugin/rehype-encrypted";
import { encryptContent } from "../src/utils/encrypt";

/**
 * M7-5b · 加密文本解锁 modal（视觉 / a11y 收口）
 *
 * v2 的加密文本是**构建期**能力（`:::encrypted` → remark → rehype 加密成 blob），
 * 站点内容里目前没有加密块，所以本 spec 用「生产同一套标记 + CSS + 内联脚本」的
 * 夹具注入到真实文章页（拿到真 token / 真主题 / 真字体），再由夹具里的真脚本解密。
 *
 * 判据：
 *   A. 门禁态：只看到入口按钮，`<dialog>` 未打开，**0 请求**（900ms 静默窗口）；
 *   B. 打开态：`role=dialog` / `aria-modal=true` / `aria-labelledby` 指向标题 / 焦点进输入框；
 *      Esc、关闭键、点遮罩都能关，关后焦点回触发按钮；
 *   C. Tab 在 dialog 内循环（末位 → 首位，首位 Shift+Tab → 末位）；
 *   D. 错误态：可读文案 + `role=alert` + `aria-invalid`，焦点留在输入框；
 *   E. 成功态：解密内容出现、门禁卡消失、dialog 关闭、焦点落在解密内容上；
 *   F. 视觉：桌面居中、390 贴底；reduced-motion 下 0 动画；
 *   G. axe：打开态 + 错误态 serious/critical = 0（light/dark）；
 *   H. 不泄密：夹具标记里没有明文密码，控制台没有密码输出；测试只用假密码。
 */

const ARTICLE = "/article/blog-as-a-product/";
const PASSWORD = "fixture-pass"; // 假密码：只在本 spec 里用
const WRONG = "wrong-pass";
const HINT = "测试提示文案";
const CONTEXT = "ctx-fixture1";
const PLAIN = "<p id=\"fx-plain\">这是解密后的正文。</p>";

const BLOCK = "#encrypted-container-fx1";
const GATE = "#encrypted-gate-fx1";
const OPEN_BTN = "#encrypted-open-fx1";
const DIALOG = "#encrypted-dialog-fx1";
const CLOSE_BTN = "#encrypted-close-fx1";
const INPUT = "#password-input-fx1";
const ERROR = "#password-error-fx1";
const SUBMIT = `${DIALOG} button[type="submit"]`;
const OUTPUT = "#decrypted-content-fx1";

const AXE_SOURCE = readFileSync(path.join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SHOT_DIR = path.join(process.cwd(), "docs/_reviews/M7-5b/screens");
const SHOTS = process.env.ENCRYPTED_SHOTS === "1";

test.beforeAll(() => {
    if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
});

const fixture = buildEncryptedFixture({
    encryptedData: encryptContent(PLAIN, PASSWORD, CONTEXT),
    context: CONTEXT,
    hint: HINT,
});

async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
}

/** 把夹具（真标记 / 真 CSS / 真脚本）挂进真实文章页 */
async function mount(page: Page): Promise<void> {
    await page.goto(ARTICLE);
    await page.evaluate(
        ({ html, css, script, host }: { html: string; css: string; script: string; host: string }) => {
            const style = document.createElement("style");
            style.id = "enc-fixture-css";
            style.textContent = css;
            document.head.append(style);
            const box = document.createElement("div");
            box.id = host;
            box.innerHTML = html;
            document.body.append(box);
            const s = document.createElement("script");
            s.textContent = script;
            document.body.append(s);
        },
        { ...fixture, host: "enc-fixture-host" },
    );
    await expect(page.locator(OPEN_BTN)).toBeVisible();
}

async function axe(page: Page, selector: string) {
    await page.addScriptTag({ content: AXE_SOURCE });
    return page.evaluate(
        async ([sel, tags]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (window as any).axe.run(sel, {
                runOnly: { type: "tag", values: tags },
            });
            const hard = (list: { impact?: string }[]) =>
                list.filter((v) => v.impact === "serious" || v.impact === "critical");
            const bad = hard(result.violations);
            return {
                serious: bad.length,
                ids: (bad as { id: string; nodes: { target: string[] }[] }[]).map(
                    (v) => `${v.id}@${v.nodes.map((n) => n.target.join(" ")).join("|")}`,
                ),
            };
        },
        [selector, TAGS],
    );
}

const isOpen = (page: Page) =>
    page.evaluate((sel) => (document.querySelector(sel) as HTMLDialogElement | null)?.open === true, DIALOG);

test.describe("加密文本解锁 · a11y / 视觉", () => {
    test("A. 门禁态：只有入口按钮，dialog 未打开，0 请求", async ({ page }) => {
        const requests: string[] = [];
        let armed = false;
        page.on("request", (req) => {
            if (!armed) return;
            const url = req.url();
            if (url.startsWith("data:")) return;
            requests.push(url);
        });

        await mount(page);
        await setTheme(page, "dark");
        armed = true;

        await expect(page.locator(GATE)).toBeVisible();
        await expect(page.locator(OPEN_BTN)).toHaveText("输入密码解锁");
        await expect(page.locator(OUTPUT)).toBeHidden();
        expect(await isOpen(page)).toBe(false);

        // 静默窗口：门禁态不该再拉任何网络资源（含 fetch / XHR / chunk）
        await page.waitForTimeout(900);
        expect(requests, requests.join("\n")).toHaveLength(0);

        // 标记里没有任何明文密码 / 明文正文
        expect(fixture.html).not.toContain(PASSWORD);
        expect(fixture.html).not.toContain("这是解密后的正文");
    });

    test("B. 打开态语义 + Esc / 关闭键 / 遮罩三种关法 + 焦点回填", async ({ page }) => {
        await mount(page);
        await page.click(OPEN_BTN);

        const dialog = page.locator(DIALOG);
        await expect(dialog).toBeVisible();
        expect(await isOpen(page)).toBe(true);
        await expect(dialog).toHaveAttribute("role", "dialog");
        await expect(dialog).toHaveAttribute("aria-modal", "true");

        const labelledby = await dialog.getAttribute("aria-labelledby");
        expect(labelledby).toBeTruthy();
        await expect(page.locator(`#${labelledby}`)).toHaveText("解锁加密内容");
        await expect(page.locator(INPUT)).toBeFocused();

        // Esc
        await page.keyboard.press("Escape");
        expect(await isOpen(page)).toBe(false);
        await expect(page.locator(OPEN_BTN)).toBeFocused();

        // 关闭键
        await page.click(OPEN_BTN);
        await page.click(CLOSE_BTN);
        expect(await isOpen(page)).toBe(false);
        await expect(page.locator(OPEN_BTN)).toBeFocused();

        // 遮罩（点 dialog 自身的空白/backdrop 区域）
        await page.click(OPEN_BTN);
        await page.mouse.click(4, 4);
        expect(await isOpen(page)).toBe(false);
        await expect(page.locator(OPEN_BTN)).toBeFocused();
    });

    test("C. Tab 焦点陷阱在 dialog 内循环", async ({ page }) => {
        await mount(page);
        await page.click(OPEN_BTN);
        await expect(page.locator(INPUT)).toBeFocused();

        // 从最后一个可聚焦元素往后 → 回到第一个（关闭键）
        await page.locator(SUBMIT).focus();
        await page.keyboard.press("Tab");
        await expect(page.locator(CLOSE_BTN)).toBeFocused();

        // 第一个往前 → 回到最后一个
        await page.keyboard.press("Shift+Tab");
        await expect(page.locator(SUBMIT)).toBeFocused();
    });

    test("D. 错误态：可读文案 + alert + aria-invalid，焦点留在输入框", async ({ page }) => {
        await mount(page);
        await page.click(OPEN_BTN);
        await page.fill(INPUT, WRONG);
        await page.click(SUBMIT);

        await expect(page.locator(ERROR)).toBeVisible();
        await expect(page.locator(ERROR)).toHaveText("密码不对，请再试一次。");
        await expect(page.locator(ERROR)).toHaveAttribute("role", "alert");
        await expect(page.locator(INPUT)).toHaveAttribute("aria-invalid", "true");
        await expect(page.locator(INPUT)).toBeFocused();
        expect(await isOpen(page), "错误后 dialog 仍开着").toBe(true);
        await expect(page.locator(OUTPUT)).toBeHidden();

        // 重新输入即清错误态
        await page.fill(INPUT, "x");
        await expect(page.locator(ERROR)).toBeHidden();
        await expect(page.locator(INPUT)).not.toHaveAttribute("aria-invalid", "true");

        // 空提交有独立文案
        await page.fill(INPUT, "");
        await page.click(SUBMIT);
        await expect(page.locator(ERROR)).toHaveText("请输入密码");
    });

    test("E. 成功态：解密内容出现、dialog 关闭、焦点回到内容", async ({ page }) => {
        await mount(page);
        await page.click(OPEN_BTN);
        await page.fill(INPUT, PASSWORD);
        await page.click(SUBMIT);

        await expect(page.locator(OUTPUT)).toBeVisible();
        await expect(page.locator(OUTPUT)).toContainText("这是解密后的正文。");
        await expect(page.locator(GATE)).toBeHidden();
        expect(await isOpen(page)).toBe(false);
        expect(
            await page.evaluate((sel) => document.activeElement?.id === sel.replace("#", ""), OUTPUT),
        ).toBe(true);

        // 缓存通道：刷新后自动解锁（sessionStorage，tab 作用域）
        await page.reload();
        await mount(page);
        await expect(page.locator(OUTPUT)).toBeVisible({ timeout: 5000 });
    });

    test("F. 视觉：桌面居中 / 390 贴底 / reduced-motion 无动画", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await mount(page);
        await page.click(OPEN_BTN);
        await expect(page.locator(DIALOG)).toBeVisible();

        const desktop = await page.locator(DIALOG).boundingBox();
        const vw = await page.evaluate(() => window.innerWidth);
        const vh = await page.evaluate(() => window.innerHeight);
        expect(desktop).not.toBeNull();
        const cx = desktop!.x + desktop!.width / 2;
        expect(Math.abs(cx - vw / 2)).toBeLessThan(2);
        expect(Math.abs(desktop!.y + desktop!.height / 2 - vh / 2)).toBeLessThan(vh * 0.15);

        if (SHOTS) {
            await setTheme(page, "light");
            await page.screenshot({ path: path.join(SHOT_DIR, "unlock-desktop-light.png") });
            await setTheme(page, "dark");
            await page.screenshot({ path: path.join(SHOT_DIR, "unlock-desktop-dark.png") });
        }

        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.locator(DIALOG)).toBeVisible();
        const mobile = await page.locator(DIALOG).boundingBox();
        expect(mobile).not.toBeNull();
        expect(mobile!.width).toBeGreaterThan(380);
        const bottom = mobile!.y + mobile!.height;
        expect(Math.abs(bottom - 844)).toBeLessThan(2);

        if (SHOTS) {
            await page.screenshot({ path: path.join(SHOT_DIR, "unlock-mobile-390.png") });
        }

        // reduced motion：面板 0 动画
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.keyboard.press("Escape");
        await page.click(OPEN_BTN);
        const animations = await page.evaluate((sel) => {
            const panel = document.querySelector(`${sel} .enc-dialog__panel`) as HTMLElement | null;
            const dialog = document.querySelector(sel) as HTMLElement | null;
            return {
                panel: panel ? getComputedStyle(panel).animationName : "missing",
                dialog: dialog ? getComputedStyle(dialog).animationName : "missing",
            };
        }, DIALOG);
        expect(animations.panel).toBe("none");
        expect(animations.dialog).toBe("none");
    });

    test("G. axe：打开态 / 错误态 serious critical = 0（light + dark）", async ({ page }) => {
        await mount(page);
        for (const theme of ["light", "dark"] as const) {
            await setTheme(page, theme);
            await page.click(OPEN_BTN);
            const openState = await axe(page, DIALOG);
            expect(openState.serious, `${theme} open: ${openState.ids.join(",")}`).toBe(0);

            await page.fill(INPUT, WRONG);
            await page.click(SUBMIT);
            await expect(page.locator(ERROR)).toBeVisible();
            const errorState = await axe(page, BLOCK);
            expect(errorState.serious, `${theme} error: ${errorState.ids.join(",")}`).toBe(0);

            if (SHOTS && theme === "dark") {
                await page.screenshot({ path: path.join(SHOT_DIR, "unlock-error-dark.png") });
            }
            await page.keyboard.press("Escape");
        }
    });

    test("H. 不泄密：控制台无密码、页面源码无密码", async ({ page }) => {
        const logs: string[] = [];
        page.on("console", (msg) => logs.push(msg.text()));
        await mount(page);
        await page.click(OPEN_BTN);
        await page.fill(INPUT, PASSWORD);
        await page.click(SUBMIT);
        await expect(page.locator(OUTPUT)).toBeVisible();

        expect(logs.join("\n")).not.toContain(PASSWORD);
        const html = await page.content();
        expect(html).not.toContain(PASSWORD);
    });
});

test("M7-5b 夹具自检：插件仍能编译加密块（buildEncryptedFixture 与 rehype 插件同源）", () => {
    expect(typeof rehypeEncrypted).toBe("function");
    expect(fixture.css).toContain(".enc-dialog");
    expect(fixture.html).toContain('role="dialog"');
    expect(fixture.html).toContain('aria-modal="true"');
});
