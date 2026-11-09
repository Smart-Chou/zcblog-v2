import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * M7-3b-2 · 文章竖版海报是**构建期静态资产**（`/poster/<slug>.png`，3:4 / 1200×1600）。
 *
 * 这里判三件事，全部对着构建产物说：
 *   1. 产物确实落盘：`dist/poster/` 下每个 PNG 都是 1200×1600 且严格 3:4
 *      （不是"能渲染"而是"构建时真的生成了"）；
 *   2. preview server 按静态文件服务它：`<img src="/poster/…">` 这条路成立，
 *      不需要运行期渲染（分享弹层 M7-3c 直接吃这个 URL）；
 *   3. 默认 OG 分支没被带歪：同一 slug 的 `/og/<slug>.png` 仍是 1200×630。
 *
 * 只读 IHDR（8 字节签名 + 前 24 字节），不解码像素 —— 尺寸错了就已经是红。
 */

const FIXTURE = "blog-as-a-product";

/** PNG 尺寸：IHDR 宽高在签名后的 8..16 / 16..24 字节（大端）。 */
function pngSize(buffer: Buffer): { width: number; height: number } {
    expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const distDir = path.join(process.cwd(), "dist");

async function fetchPng(request: APIRequestContext, url: string): Promise<Buffer> {
    const res = await request.get(url);
    expect(res.status(), `${url} 应当 200`).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    return res.body();
}

test("dist/poster：每个产物都是 1200×1600 且严格 3:4", () => {
    const dir = path.join(distDir, "poster");
    expect(existsSync(dir), "缺少 dist/poster —— 先跑 pnpm run build:ci").toBe(true);

    const files = readdirSync(dir).filter((f) => f.endsWith(".png"));
    expect(files.length).toBeGreaterThan(0);

    const wrong: string[] = [];
    for (const file of files) {
        const { width, height } = pngSize(readFileSync(path.join(dir, file)));
        if (width !== 1200 || height !== 1600 || width * 4 !== height * 3) {
            wrong.push(`${file}: ${width}×${height}`);
        }
    }
    expect(wrong, `非 3:4 海报：${wrong.slice(0, 5).join(", ")}`).toHaveLength(0);
});

test("preview: /poster/<slug>.png 作为静态资产可访问（fixture 1200×1600）", async ({ request }) => {
    const body = await fetchPng(request, `/poster/${FIXTURE}.png`);
    const { width, height } = pngSize(body);
    expect({ width, height }).toEqual({ width: 1200, height: 1600 });
    expect(width * 4).toBe(height * 3);
    // sanity：不是空 PNG / 不是 1×1 占位
    expect(body.length).toBeGreaterThan(20_000);
});

test("回归: 同一 slug 的 /og/<slug>.png 仍是 1200×630", async ({ request }) => {
    const body = await fetchPng(request, `/og/${FIXTURE}.png`);
    expect(pngSize(body)).toEqual({ width: 1200, height: 630 });
});
