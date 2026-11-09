import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * 技能页 `/skills/` 验收（M8-2 视觉重做）
 *
 * 覆盖本卡（t_0edb8cfb）在规格 `26-m8-2-entities-design-spec.md` §4 / §6 / §8.2 里的判据：
 *  1. KPI 四块读的是真实数据（领域 / 技能 / 深耕 / 数据更新），且没有相对时间（决策 K1）；
 *  2. 筛选：领域单选、等级单选、跨组 AND、清除、无结果 —— 全部只切 `hidden`，不重排不发请求；
 *  3. 组头计数随筛选变化（`3 / 5 项`），整组被筛空时整组不渲染（B-3）；
 *  4. 键盘：Tab 得进筛选 chip，Enter 切换 `aria-pressed`，焦点环 ≥2px；
 *  5. 移动版 390：筛选折叠成 `<summary>`、触控目标 ≥44px、无横向滚动；
 *  6. 三态（loading / error）来自构建期 `PUBLIC_SKILLS_STATE`，空态由既有 C-1 用例覆盖；
 *  7. a11y：`<dl>` 读数、列表语义、刻度 `aria-hidden`。
 *
 * 状态用例会**真实构建**（`astro build`），因此单独设长超时并在最后恢复常规构建。
 */

const ROOT = process.cwd();
const URL = "/skills/";
const EN_URL = "/en/skills/";
const SHELL = ".entities--skills";

type Theme = "light" | "dark";

async function openSkills(page: Page, width = 1280, theme: Theme = "light"): Promise<void> {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto(URL, { waitUntil: "load" });
    expect(response?.status(), `GET ${URL}`).toBe(200);
    await page.evaluate((value) => {
        document.documentElement.setAttribute("data-theme", value);
        document.documentElement.classList.toggle("dark", value === "dark");
    }, theme);
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
    });
}

async function visibleItems(page: Page): Promise<number> {
    return page.evaluate(
        () => document.querySelectorAll("[data-entity-item]:not([hidden])").length,
    );
}

/* ───────────────────────── 1. KPI ───────────────────────── */

test("KPI：四块读数来自真实数据，日期是绝对值", async ({ page }) => {
    await openSkills(page);

    const tiles = page.locator(`${SHELL} .entity-kpi__item`);
    await expect(tiles).toHaveCount(4);

    const groups = Number(await page.locator(SHELL).getAttribute("data-skills-groups"));
    const total = Number(await page.locator(SHELL).getAttribute("data-skills-total"));
    const deep = await page.locator('[data-entity-item][data-level="deep"]').count();

    const values = await page.locator(`${SHELL} .entity-kpi__number`).allInnerTexts();
    expect(values.map((value) => value.trim())).toEqual([
        String(groups),
        String(total),
        String(deep),
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    ]);

    // 四块都带标签（dt）+ 单位（前两块是数字）
    const labels = await page.locator(`${SHELL} .entity-kpi__label`).allInnerTexts();
    expect(labels.map((label) => label.trim())).toEqual(["领域", "技能", "深耕", "数据更新"]);

    // 决策 K1：可见文案里不许有相对时间，否则视觉基线每天漂
    const text = (await page.locator(SHELL).innerText()).replace(/\s+/g, " ");
    expect(text).not.toMatch(/天前|小时前|刚刚|days? ago/);

    // KPI 是读数不是控件：不可聚焦、没有按钮
    await expect(page.locator(`${SHELL} .entity-kpi button, ${SHELL} .entity-kpi a`)).toHaveCount(
        0,
    );
    console.log(`[kpi] ${values.join(" · ")}`);
});

/* ───────────────────────── 2. 筛选 ───────────────────────── */

test("筛选：领域单选改可见条目与组头计数", async ({ page }) => {
    await openSkills(page);

    const total = await page.locator("[data-entity-item]").count();
    const chip = page.locator('[data-filter-value="frontend"]');
    const expected = Number((await chip.locator(".entity-filter__chip-count").innerText()).trim());

    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(await visibleItems(page)).toBe(expected);

    const countText = (await page.locator("[data-filter-result]").innerText()).trim();
    expect(countText).toBe(`${expected} / ${total} 项技能`);

    // 整组被筛空 → 整组不渲染（B-3）；留下来的组头计数是「本组还剩多少」
    const visiblePanels = await page.locator("[data-entity-group]:not([hidden])").count();
    expect(visiblePanels).toBe(1);
    await expect(page.locator("[data-entity-group]:not([hidden]) [data-group-count]")).toHaveText(
        new RegExp(`^${expected} / ${expected} 项$|^${expected} 项$`),
    );

    // 清除回到全量（面板里的那个；无结果空态里还有一个同名按钮）
    await page.locator(".entity-filter__panel .entity-filter__clear").click();
    expect(await visibleItems(page)).toBe(total);
    await expect(page.locator("[data-filter-result]")).toHaveText(`${total} 项技能`);
    await expect(page.locator(".entity-filter__panel .entity-filter__clear")).toBeDisabled();
    console.log(`[filter] 领域 ${expected} / ${total} 项`);
});

test("筛选：领域 + 等级跨组 AND，清除后恢复", async ({ page }) => {
    await openSkills(page);
    const total = await page.locator("[data-entity-item]").count();

    const discipline = "frontend";
    const levelChip = page.locator('[data-filter-value="solid"]');
    const expected = Number(
        (await levelChip.locator(".entity-filter__chip-count").innerText()).trim(),
    );
    const combo = await page.evaluate((d) => {
        return document.querySelectorAll(
            `[data-entity-item][data-group-id="${d}"][data-level="solid"]`,
        ).length;
    }, discipline);
    expect(combo, "frontend 组内应有 solid 条目").toBeGreaterThan(0);

    await page.locator(`[data-filter-value="${discipline}"]`).click();
    await page.locator('[data-filter-value="solid"]').click();
    await expect(page.locator('[data-filter-value="solid"]')).toHaveAttribute(
        "aria-pressed",
        "true",
    );

    expect(await visibleItems(page)).toBe(combo);
    await expect(page.locator("[data-filter-result]")).toHaveText(`${combo} / ${total} 项技能`);
    // 组头：本组还剩多少 / 本组原来多少
    await expect(
        page.locator(`[data-entity-group][data-group-id="${discipline}"] [data-group-count]`),
    ).toHaveText(new RegExp(`^${combo} / \\d+ 项$`));

    await page.locator(".entity-filter__panel .entity-filter__clear").click();
    expect(await visibleItems(page)).toBe(total);
    await expect(page.locator('[data-filter-value="solid"]')).toHaveAttribute(
        "aria-pressed",
        "false",
    );
    console.log(`[filter] 领域+等级 = ${combo} / ${total}`);
});

test("筛选无结果：空态可见、列表与末页标记隐藏、清除可恢复", async ({ page }) => {
    await openSkills(page);

    // 找一对必然为空的组合（真实数据里不一定存在，所以先探测）
    const pair = await page.evaluate(() => {
        const disciplines = [
            ...document.querySelectorAll<HTMLElement>(
                '[data-filter-group="discipline"] [data-filter-value]',
            ),
        ]
            .map((chip) => chip.dataset.filterValue)
            .filter((value): value is string => !!value && value !== "all");
        const levels = [
            ...document.querySelectorAll<HTMLElement>(
                '[data-filter-group="level"] [data-filter-value]',
            ),
        ]
            .map((chip) => chip.dataset.filterValue)
            .filter((value): value is string => !!value && value !== "all");

        for (const discipline of disciplines) {
            for (const level of levels) {
                const hits = document.querySelectorAll(
                    `[data-entity-item][data-group-id="${discipline}"][data-level="${level}"]`,
                ).length;
                // 该组合为空，但两个选项本身都非空（说明不是零计数选项被剪掉）
                const disciplineCount = document.querySelectorAll(
                    `[data-entity-item][data-group-id="${discipline}"]`,
                ).length;
                const levelCount = document.querySelectorAll(
                    `[data-entity-item][data-level="${level}"]`,
                ).length;
                if (hits === 0 && disciplineCount > 0 && levelCount > 0)
                    return { discipline, level };
            }
        }
        return null;
    });

    expect(pair, "真实数据里应存在一对交集为空的组合（否则本用例跳过）").not.toBeNull();
    const { discipline, level } = pair!;

    await page.locator(`[data-filter-value="${discipline}"]`).click();
    await page.locator(`[data-filter-value="${level}"]`).click();

    const empty = page.locator("[data-entity-filtered-empty]");
    await expect(empty).toBeVisible();
    await expect(page.locator('[data-empty="filtered"]')).toHaveCount(1);
    await expect(page.locator("[data-entity-list]")).toBeHidden();
    await expect(page.locator("[data-entity-end]")).toBeHidden();
    await expect(page.locator("[data-entity-item]:not([hidden])")).toHaveCount(0);
    // 文案必须与「数据本身为空」不同（§1.8.4 B-7）
    await expect(empty.locator(".entities-state__title")).not.toHaveText("还没有技能条目");

    await empty.locator("[data-filter-reset]").click();
    await expect(empty).toBeHidden();
    await expect(page.locator("[data-entity-item]:not([hidden])")).toHaveCount(
        await page.locator("[data-entity-item]").count(),
    );
    console.log(`[filter] 空结果组合 ${discipline} × ${level} 可复现且可清除`);
});

/* ───────────────────────── 3. 键盘 / a11y ───────────────────────── */

test("键盘：Tab 进 chip、Enter 切换选中、焦点环可见", async ({ page }) => {
    await openSkills(page);

    let reached = false;
    for (let i = 0; i < 40 && !reached; i += 1) {
        await page.keyboard.press("Tab");
        reached = await page.evaluate(
            () => document.activeElement?.matches("[data-filter-value]") ?? false,
        );
    }
    expect(reached, "Tab 40 次仍未进入筛选 chip").toBe(true);

    const outline = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const style = getComputedStyle(el);
        return {
            width: parseFloat(style.outlineWidth),
            kind: style.outlineStyle,
            color: style.outlineColor,
        };
    });
    expect(outline.kind).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);

    await page.keyboard.press("Enter");
    await expect(page.locator('[data-filter-value][aria-pressed="true"]')).toHaveCount(2);
    await page.keyboard.press("Tab");
    await expect(page.locator("[data-filter-value]:focus")).toHaveCount(1);
    console.log(`[keyboard] outline ${outline.width}px ${outline.kind} ${outline.color}`);
});

test("a11y：读数用 dl、列表用 ul、刻度 aria-hidden、单一 h1", async ({ page }) => {
    await openSkills(page);

    await expect(page.locator(`${SHELL} dl.entity-kpi`)).toHaveCount(1);
    await expect(page.locator(`${SHELL} h1`)).toHaveCount(1);
    await expect(page.locator(`${SHELL} ul.skill-panel__list`)).toHaveCount(4);

    const meters = page.locator(`${SHELL} .skill__meter`);
    await expect(meters.first()).toHaveAttribute("aria-hidden", "true");

    // 等级始终有文字（N5）
    const levels = await page.locator(`${SHELL} .skill__level`).allInnerTexts();
    expect(levels.length).toBeGreaterThan(0);
    for (const label of levels) expect(label.trim().length).toBeGreaterThan(0);
});

/* ───────────────────────── 4. 移动版 ───────────────────────── */

test("移动版 390：筛选折叠、触控目标 ≥44px、无横向溢出", async ({ page }) => {
    await openSkills(page, 390);

    const summary = page.locator(".entity-filter__summary");
    await expect(summary).toBeVisible();
    await expect(page.locator(".entity-filter__panel")).toBeHidden();

    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "390: 横向溢出").toBeLessThanOrEqual(1);

    await summary.click();
    await expect(page.locator(".entity-filter__panel")).toBeVisible();

    const sizes = await page
        .locator(".entity-filter__chip")
        .evaluateAll((nodes) =>
            nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
        );
    expect(Math.min(...sizes), "触控目标必须 ≥44px").toBeGreaterThanOrEqual(44);

    await page.locator('[data-filter-value="frontend"]').click();
    await expect(page.locator("[data-filter-badge]")).toBeVisible();
    await expect(page.locator("[data-filter-badge]")).toHaveText("(1)");

    const overflowAfter = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowAfter, "390 展开并筛选后: 横向溢出").toBeLessThanOrEqual(1);
    console.log(`[mobile] chip 高度 ${Math.min(...sizes)}px · overflow 0`);
});

/* ───────────────────────── 5. 状态（真实构建，独立 outDir） ───────────────────────── */

/**
 * 两态都来自**真实构建**：`PUBLIC_SKILLS_STATE` 是构建期预览值，不进数据归一化。
 * 构建产物写到临时 outDir 再直接断言 HTML —— 不去动 `dist/`：同仓库并行的页面卡都在
 * 构建同一个 `dist/`，谁先谁后都会把断言变成掷骰子；也省掉预览服务器（少一次 40s 等待）。
 */
test("状态：loading 骨架与 error 重试来自构建期预览值", () => {
    test.setTimeout(900_000);
    const astroBin = path.join(ROOT, "node_modules/.bin/astro");
    const outDirs: string[] = [];

    const build = (state: string): string => {
        const outDir = mkdtempSync(path.join(os.tmpdir(), `skills-${state}-`));
        outDirs.push(outDir);
        execFileSync(astroBin, ["build", "--outDir", outDir], {
            cwd: ROOT,
            env: state ? { ...process.env, PUBLIC_SKILLS_STATE: state } : process.env,
            stdio: "pipe",
        });
        return readFileSync(path.join(outDir, "skills", "index.html"), "utf8");
    };

    try {
        const loading = build("loading");
        expect(loading, "loading: 根元素状态").toMatch(/data-skills-status="?loading"?/);
        // Astro 的 compressHTML 会把可选属性的引号去掉，断言要能吃两种写法
        expect(loading, "loading: 骨架容器 aria-busy").toMatch(
            /entity-loading[^>]*aria-busy(?:="?true"?|=true)/,
        );
        // 4 KPI 块 + 2 面板块 + 1 段筛选文字 = 7 个 Skeleton
        expect((loading.match(/skeleton--block/g) ?? []).length, "loading: 块骨架 6 个").toBe(6);
        expect((loading.match(/skeleton--text/g) ?? []).length, "loading: 文字骨架 1 个").toBe(1);
        expect(loading).not.toContain("data-entity-item");
        expect(loading).not.toContain("entity-kpi__item");
        expect(loading).not.toContain("data-entity-filter");

        const error = build("error");
        expect(error, "error: 根元素状态").toMatch(/data-skills-status="?error"?/);
        expect(error, "error: 原因代码留在容器上").toMatch(/data-skills-error="?forced-error"?/);
        expect(error, "error: 用 Alert（role=alert）而不是空态").toMatch(/role="?alert"?/);
        expect(error, "error: 原因代码可见").toContain("forced-error");
        // 重试是一次导航，不是一个 JS 按钮
        expect(error, "error: 重试链接挂在 .entities-state__retry 上").toMatch(
            /class="?entities-state__retry"?/,
        );
        expect(error, "error: 重试链接指向本页").toMatch(/href="\/skills\/"/);
        expect(error).not.toContain("entity-kpi__item");
        expect(error).not.toContain("data-entity-filter");
        // 错误态保留页头，不许把整页变白
        expect(error).toMatch(/id="?skills-title"?/);

        console.log(`[states] loading 7 骨架 · error 带原因代码与重试链接（outDir 构建）`);
    } finally {
        for (const dir of outDirs) {
            try {
                rmSync(dir, { recursive: true, force: true });
            } catch {
                /* 临时目录清不掉不影响断言 */
            }
        }
    }
});

/* ───────────────────────── 6. 双语同源 ───────────────────────── */

test("英文路由同源：条数与状态一致", async ({ page }) => {
    const read = async (url: string) => {
        await page.goto(url, { waitUntil: "load" });
        const shell = page.locator(SHELL);
        return {
            status: await shell.getAttribute("data-skills-status"),
            groups: await shell.getAttribute("data-skills-groups"),
            total: await shell.getAttribute("data-skills-total"),
        };
    };
    const zh = await read(URL);
    const en = await read(EN_URL);
    expect(en).toEqual(zh);
    expect(zh.status).toBe("ok");
});
