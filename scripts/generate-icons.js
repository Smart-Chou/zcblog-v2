/**
 * 图标预处理脚本
 * 在构建时自动扫描 Astro 组件中使用的图标，并生成内联 SVG 数据
 *
 * 使用方法：node scripts/generate-icons.js
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import path, { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { gzipSync } from "zlib";
import { getIconData, iconToSVG, iconToHTML, replaceIDs } from "@iconify/utils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const SRC_DIR = join(ROOT_DIR, "src");
const OUTPUT_FILE = join(SRC_DIR, "components", "Icons", "index.ts");
const SPRITE_FILE = join(ROOT_DIR, "public", "icons.svg");
const MANIFEST_FILE = join(SRC_DIR, "components", "Icons", "sprite.ts");

// 支持的图标集及其包名
const ICON_SETS = {
    tabler: "@iconify-json/tabler",
    logos: "@iconify-json/logos",
    mingcute: "@iconify-json/mingcute",
};

// 图标集数据缓存
const iconSetCache = new Map();

/**
 * 递归获取目录下所有文件
 */
function getAllFiles(dir, extensions = [".astro", ".ts", ".tsx"]) {
    const files = [];

    function walk(currentDir) {
        const items = readdirSync(currentDir);
        for (const item of items) {
            const fullPath = join(currentDir, item);
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
                // 跳过 node_modules 和隐藏目录
                if (!item.startsWith(".") && item !== "node_modules") {
                    walk(fullPath);
                }
            } else if (extensions.some((ext) => item.endsWith(ext))) {
                files.push(fullPath);
            }
        }
    }

    walk(dir);
    return files;
}

/**
 * 从文件内容中提取图标名称
 */
function extractIconNames(content) {
    const icons = new Set();

    // 匹配所有图标名称引用
    const patterns = [
        // <DynamicIcon name="xxx:yyy" />
        /DynamicIcon\s+name=["']([a-z0-9-]+:[a-z0-9-]+)["']/gi,
        // DynamicIcon name={`xxx:yyy`}
        /DynamicIcon\s+name=\{[`'"]([a-z0-9-]+:[a-z0-9-]+)[`'"]\}/gi,
        // <Icon name="xxx:yyy" /> / <Icon class="..." name="xxx:yyy" />（UI/atom/Icon 包装组件）
        /<Icon\s+[^>]*name=["']([a-z0-9-]+:[a-z0-9-]+)["']/gi,
        // getIconSvg("xxx:yyy") 或 getIconSvg('xxx:yyy')
        /getIconSvg\(["']([a-z0-9-]+:[a-z0-9-]+)["']\)/gi,
        // hasIcon("xxx:yyy")
        /hasIcon\(["']([a-z0-9-]+:[a-z0-9-]+)["']\)/gi,
        // iconName="xxx:yyy" / svg="xxx:yyy" (组件 props 传递的图标名称)
        /(?:iconName|svg)=["']([a-z0-9-]+:[a-z0-9-]+)["']/gi,
        // svg: "xxx:yyy" (TypeScript 配置中的图标引用)
        /svg:\s*["']([a-z0-9-]+:[a-z0-9-]+)["']/gi,
        // icon: "xxx:yyy" (TypeScript 配置中的图标引用),
        /icon:\s*["']([a-z0-9-]+:[a-z0-9-]+)["']/gi,
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            icons.add(match[1]);
        }
    }

    return icons;
}

/**
 * 加载图标集数据
 */
async function loadIconSet(prefix) {
    if (iconSetCache.has(prefix)) {
        return iconSetCache.get(prefix);
    }

    const packageName = ICON_SETS[prefix];
    if (!packageName) {
        console.warn(`⚠️  未知图标集: ${prefix}`);
        return null;
    }

    try {
        // 动态导入图标集 JSON
        const iconSetPath = join(ROOT_DIR, "node_modules", packageName, "icons.json");
        const data = JSON.parse(readFileSync(iconSetPath, "utf-8"));
        iconSetCache.set(prefix, data);
        return data;
    } catch (error) {
        console.warn(`⚠️  无法加载图标集 ${packageName}: ${error.message}`);
        return null;
    }
}

/**
 * 获取单个图标的 SVG
 */
async function getIconSvg(iconName) {
    const [prefix, name] = iconName.split(":");
    if (!prefix || !name) {
        console.warn(`⚠️  无效的图标名称: ${iconName}`);
        return null;
    }

    const iconSet = await loadIconSet(prefix);
    if (!iconSet) {
        return null;
    }

    const iconData = getIconData(iconSet, name);
    if (!iconData) {
        console.warn(`⚠️  图标未找到: ${iconName}`);
        return null;
    }

    // 转换为 SVG
    const renderData = iconToSVG(iconData, {
        height: "1em",
        width: "1em",
    });

    let svg = iconToHTML(replaceIDs(renderData.body), renderData.attributes);

    // 确保支持 currentColor
    if (!svg.includes("currentColor")) {
        svg = svg.replace("<svg", '<svg fill="currentColor"');
    }

    return svg;
}

/**
 * 生成图标 sprite（public/icons.svg）+ 清单（src/components/Icons/sprite.ts）
 *
 * 为什么是 `<g id>` 而不是 `<symbol viewBox>`：`<symbol>` 会给 `<use>` 引入一层
 * 嵌套 viewport，Chrome 在那一层做的 preserveAspectRatio 变换与「外层 <svg> 直接
 * 带 viewBox」不是逐像素一致的（实测 24 单位图标差 11~59 像素，256 单位图标更明显）。
 * 用 `<g id>` + 外层 `<svg viewBox>` 复刻原来的坐标系数，像素差 0（实测 0/2304）。
 *
 * 少数图标自身带 `id` 且内部用 `url(#id)` / `href="#id"` 互相引用（渐变、<use> 自引），
 * 跨文档 `<use>` 时这些引用在宿主文档里解析不到 —— 标记成 inlineOnly，由
 * icon-markup.ts 回退成内联 SVG（代价只有那几个图标）。
 */
function buildSprite(iconsMap) {
    const names = Array.from(iconsMap.keys()).sort((a, b) => a.localeCompare(b));
    const entries = [];
    const manifest = {};
    const inlineOnly = [];
    const seen = new Map();

    for (const name of names) {
        const svg = iconsMap.get(name);
        const match = svg.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/);
        if (!match) {
            console.warn(`⚠️  无法解析 SVG: ${name}`);
            continue;
        }
        const [, rawAttrs, body] = match;
        const viewBox = (rawAttrs.match(/viewBox="([^"]+)"/) || [])[1];
        if (!viewBox) {
            console.warn(`⚠️  图标缺少 viewBox，跳过 sprite: ${name}`);
            continue;
        }

        const id = name.replace(/[:/]/g, "-");
        if (seen.has(id)) {
            console.warn(`⚠️  sprite id 冲突: ${name} / ${seen.get(id)}`);
            continue;
        }
        seen.set(id, name);
        manifest[name] = viewBox;

        // 根元素上的表现属性（fill/stroke/…）搬到 <g>：子元素继承链不变
        const rest = rawAttrs
            .replace(/\s*(xmlns|width|height|viewBox|version)="[^"]*"/g, "")
            .replace(/\s+/g, " ")
            .trim();

        if (/\b(?:url\(#|href="#)/.test(body)) {
            inlineOnly.push(name);
            continue;
        }
        entries.push(`<g id="${id}"${rest ? " " + rest : ""}>${body}</g>`);
    }

    const sprite = `<svg xmlns="http://www.w3.org/2000/svg">${entries.join("")}</svg>\n`;
    return { sprite, manifest, inlineOnly };
}

/**
 * 生成 sprite 清单模块（构建期/服务端使用，不进客户端包）
 */
function generateSpriteManifest(manifest, version, inlineOnly) {
    const rows = Object.entries(manifest)
        .map(([name, viewBox]) => `\t"${name}": "${viewBox}",`)
        .join("\n");
    const inlineRows = inlineOnly.map((name) => `\t"${name}",`).join("\n");

    return `/**
 * 自动生成的图标 sprite 清单
 * 由 scripts/generate-icons.js 在构建时生成
 * 请勿手动编辑此文件
 *
 * SPRITE_VERSION = public/icons.svg 的内容哈希（前 8 位）。它拼进 <use> 的 href 查询串，
 * 让 _headers 里的 immutable 缓存不会把旧 sprite 钉在浏览器里。
 */

export const SPRITE_URL = "/icons.svg";

export const SPRITE_VERSION = "${version}";

/** 图标名 → viewBox；键集合同时是「这个图标存在」的闭集。 */
export const ICON_VIEWBOXES: Record<string, string> = {
${rows}
};

/**
 * 图标自带 url(#id) / href("#id") 内部引用，跨文档 <use> 在宿主文档里解析不到，
 * 因此这几个图标继续内联输出（见 icon-markup.ts）。
 */
export const ICON_INLINE_ONLY: string[] = [
${inlineRows}
];
`;
}

/**
 * 用项目自己的 prettier 配置格式化生成物（生成器产出的文件必须过 format:check）
 */
async function format(content, filepath) {
    writeFileSync(filepath, content, "utf-8");
    const { spawnSync } = await import("node:child_process");
    const res = spawnSync(
        join(ROOT_DIR, "node_modules", ".bin", "prettier"),
        ["--write", filepath],
        { encoding: "utf-8" },
    );
    if (res.status !== 0) console.warn(`⚠️  prettier 格式化失败: ${res.stderr || res.stdout}`);
    return readFileSync(filepath, "utf-8");
}

/**
 * 只格式化不落盘：给 --check 用。
 *
 * 为什么走 stdin 而不是写到临时文件：prettier 的 `--stdin-filepath` 会按该路径的
 * 配置与 parser 推断处理，输出与 `--write` 逐字节一致（已实测两个生成物均相同），
 * 且不产生临时文件。生成器的「写盘 + prettier --write + 读回」三步在这里等价于
 * 「管道过一遍 prettier」。
 */
async function formatInMemory(content, filepath) {
    const { spawnSync } = await import("node:child_process");
    const res = spawnSync(
        join(ROOT_DIR, "node_modules", ".bin", "prettier"),
        ["--stdin-filepath", filepath],
        { input: content, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
    );
    if (res.status !== 0) {
        throw new Error(`prettier --stdin-filepath 失败: ${res.stderr || res.stdout}`);
    }
    return res.stdout;
}

/**
 * 生成 icons.ts 文件
 */
function generateIconsFile(iconsMap) {
    const iconEntries = Array.from(iconsMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, svg]) => `\t"${name}":\n\t\t'${svg.replace(/'/g, "\\'")}'`)
        .join(",\n");

    const content = `/**
 * 自动生成的图标数据文件
 * 由 scripts/generate-icons.js 在构建时生成
 * 请勿手动编辑此文件
 */

const iconSvgData: Record<string, string> = {
${iconEntries}
};

/**
 * 根据 iconify 格式的图标名获取内联 SVG HTML
 * @param iconName 图标名称，如 "material-symbols:search"
 * @returns SVG HTML 字符串
 */
export function getIconSvg(iconName: string): string {
	return iconSvgData[iconName] || "";
}

export default iconSvgData;
`;

    return content;
}

/**
 * 主函数
 */
async function main() {
    const CHECK = process.argv.includes("--check");
    console.log("🔍 扫描源文件中的图标使用...\n");

    // 获取所有源文件
    const files = getAllFiles(SRC_DIR);
    console.log(`📁 找到 ${files.length} 个源文件\n`);

    // 收集所有使用的图标
    const allIcons = new Set();

    for (const file of files) {
        // 跳过 icons.ts 文件本身
        if (file.endsWith("icons.ts")) continue;

        const content = readFileSync(file, "utf-8");
        const icons = extractIconNames(content);

        for (const icon of icons) {
            allIcons.add(icon);
        }
    }

    console.log(`🎨 发现 ${allIcons.size} 个不同的图标:\n`);

    // 按图标集分组显示
    const iconsBySet = {};
    for (const icon of allIcons) {
        const [prefix] = icon.split(":");
        if (!iconsBySet[prefix]) {
            iconsBySet[prefix] = [];
        }
        iconsBySet[prefix].push(icon);
    }

    for (const [prefix, icons] of Object.entries(iconsBySet)) {
        console.log(`   ${prefix}: ${icons.length} 个图标`);
    }
    console.log("");

    // 获取所有图标的 SVG
    const iconsMap = new Map();
    let successCount = 0;
    let failCount = 0;

    for (const iconName of allIcons) {
        const svg = await getIconSvg(iconName);
        if (svg) {
            iconsMap.set(iconName, svg);
            successCount++;
        } else {
            failCount++;
        }
    }

    console.log(`✅ 成功加载 ${successCount} 个图标`);
    if (failCount > 0) {
        console.log(`❌ 失败 ${failCount} 个图标`);
    }

    // 生成输出文件（统一过一遍 prettier：CI 的 format:check 会逐字比对生成物）
    const iconsFileRaw = generateIconsFile(iconsMap);

    // 生成 sprite（public/icons.svg）+ 清单（sprite.ts）
    const { sprite, manifest, inlineOnly } = buildSprite(iconsMap);
    const version = createHash("sha256").update(sprite).digest("hex").slice(0, 8);
    const manifestRaw = generateSpriteManifest(manifest, version, inlineOnly);

    const targets = [
        { file: OUTPUT_FILE, raw: iconsFileRaw, prettier: true },
        { file: SPRITE_FILE, raw: sprite, prettier: false },
        { file: MANIFEST_FILE, raw: manifestRaw, prettier: true },
    ];

    /* ── --check：只比对，不写盘 ──────────────────────────────────────────
     *
     * 存在的理由：`--build-pages-baseline.mjs` 直接 spawn `astro build`，绕过
     * `pnpm build` 的 `fetch:all`，所以视觉门禁用的是**仓里已提交的**图标生成物。
     * 只升 `@iconify-json/*` 却没重跑生成器时，CI 与线上会静默分叉：
     * 门禁绿（比对的是旧图标的旧基线），线上却是新图标。
     *
     * 判据是「按当前 node_modules 里的 iconify 数据重新渲染一遍，逐字节等于磁盘上的」。
     * 任何不等都说明生成物过期，需要跑 `pnpm run icons`。
     */
    if (CHECK) {
        const stale = [];
        for (const t of targets) {
            const expected = t.prettier ? await formatInMemory(t.raw, t.file) : t.raw;
            const actual = existsSync(t.file) ? readFileSync(t.file, "utf-8") : null;
            if (actual === null) {
                stale.push({ file: t.file, reason: "文件缺失" });
            } else if (actual !== expected) {
                // 给一个能定位的摘要：首个差异位置的上下文 + 两边长度
                let i = 0;
                const min = Math.min(actual.length, expected.length);
                while (i < min && actual[i] === expected[i]) i++;
                stale.push({
                    file: t.file,
                    reason: `首个差异在第 ${i} 字符`,
                    actualLen: actual.length,
                    expectedLen: expected.length,
                    ctxActual: actual.slice(Math.max(0, i - 40), i + 40).replace(/\n/g, "⏎"),
                    ctxExpected: expected.slice(Math.max(0, i - 40), i + 40).replace(/\n/g, "⏎"),
                });
            }
        }

        const rel = (f) => path.relative(ROOT_DIR, f);
        if (stale.length === 0) {
            console.log(`PASS 图标生成物与 @iconify-json 数据一致（${targets.length} 个文件）`);
            console.log(`\n1/1 PASS ✅`);
            process.exitCode = 0;
        } else {
            console.log(
                `FAIL 图标生成物与 @iconify-json 数据不一致（${stale.length}/${targets.length} 个文件过期）`,
            );
            for (const s of stale) {
                console.log(`     ${rel(s.file)} — ${s.reason}`);
                if (s.actualLen !== undefined) {
                    console.log(`       磁盘 ${s.actualLen} 字符 / 重新生成 ${s.expectedLen} 字符`);
                    console.log(`       磁盘:     …${s.ctxActual}…`);
                    console.log(`       应生成:   …${s.ctxExpected}…`);
                }
            }
            console.log(`\n  修法: pnpm run icons`);
            console.log(`  原因: package.json 的 @iconify-json/* 版本变了，或生成器逻辑改了，`);
            console.log(`        但 public/icons.svg / Icons/index.ts / Icons/sprite.ts 没重跑。`);
            console.log(
                `        ci.yml 的 visual job 跑 build-pages-baseline.mjs 直调 astro build，`,
            );
            console.log(`        绕过 fetch:all，所以视觉基线比对的是**旧**图标 —— 不会变红。`);
            console.log(`\n0/1 PASS ❌`);
            process.exitCode = 1;
        }
        return;
    }

    const output = await format(iconsFileRaw, OUTPUT_FILE);
    writeFileSync(OUTPUT_FILE, output, "utf-8");

    console.log(`\n📝 已生成: ${OUTPUT_FILE}`);
    console.log(`📦 文件大小: ${(Buffer.byteLength(output, "utf-8") / 1024).toFixed(2)} KB\n`);

    writeFileSync(SPRITE_FILE, sprite, "utf-8");
    writeFileSync(MANIFEST_FILE, await format(manifestRaw, MANIFEST_FILE), "utf-8");

    console.log(
        `🧩 sprite: ${SPRITE_FILE}（${Object.keys(manifest).length} 个图标，v=${version}）`,
    );
    console.log(
        `   gzip 后 ${(gzipSync(Buffer.from(sprite, "utf-8"), { level: 9 }).length / 1024).toFixed(2)} KB`,
    );
    if (inlineOnly.length > 0) {
        console.log(
            `   ⚠️  保持内联（图标自带 url(#)/href(#) 引用，跨文档 <use> 解析不到）: ${inlineOnly.join(", ")}`,
        );
    }
    console.log(`📝 已生成: ${MANIFEST_FILE}\n`);
}

main().catch((err) => {
    // 不能只 console.error：那样未捕获异常会被吞掉，进程仍以 0 退出，
    // 门禁「报绿但没跑完」—— 这正是 D-0186 记过的那类失效。
    console.error(err);
    process.exitCode = 1;
});
