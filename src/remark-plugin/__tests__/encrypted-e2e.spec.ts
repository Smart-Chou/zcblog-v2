/**
 * 端到端：真实构建产物里的密文，能否被页面内联脚本用正确密码解开。
 *
 * 这是唯一能证明「用户输密码就能读到内容」的测试。前面的单测只验证了
 * 算法互通，这里验证的是**接线**：data-version、data-slug、AAD、
 * 迭代次数四者必须与构建期完全对齐。
 */
import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const HTML_PATH = resolve(__dirname, "../../../dist/article/e2e-encrypted-check/index.html");
const PASSWORD = "test-pass-123";

/** 从产物 HTML 里抠出内联脚本实际读取的三个属性。 */
function readBlock(html: string) {
    const m = html.match(
        /<div[^>]*data-encrypted="([^"]+)"[^>]*data-slug=([^\s>"]+)[^>]*data-version=([^\s>"]+)/,
    );
    if (!m) return null;
    return { cipher: m[1], slug: m[2].replace(/^"|"$/g, ""), version: m[3] };
}

/** 复刻 rehype-encrypted 内联脚本的 dec()。 */
async function dec(b64: string, pwd: string, slug: string, version: string): Promise<string> {
    const bin = Buffer.from(b64, "base64");
    const salt = bin.subarray(0, 16);
    const iv = bin.subarray(16, 28);
    const tag = bin.subarray(28, 44);
    const ct = bin.subarray(44);

    const buf = new Uint8Array(ct.length + tag.length);
    buf.set(ct);
    buf.set(tag, ct.length);

    const iterations = version === "1" ? 100_000 : 310_000;
    const km = await webcrypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(pwd),
        "PBKDF2",
        false,
        ["deriveKey"],
    );
    const key = await webcrypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        km,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
    );
    const params: AesGcmParams = { name: "AES-GCM", iv };
    if (version !== "1") params.additionalData = new TextEncoder().encode(slug);
    const plain = await webcrypto.subtle.decrypt(params, key, buf);
    return new TextDecoder().decode(plain);
}

describe("真实产物端到端解密", () => {
    const has = existsSync(HTML_PATH);

    it.skipIf(!has)("产物里的密文能用正确密码解出正文", async () => {
        const html = readFileSync(HTML_PATH, "utf-8");
        const block = readBlock(html);
        expect(block, "产物里没找到加密块 —— 先跑一次 build:ci").not.toBeNull();

        const out = await dec(block!.cipher, PASSWORD, block!.slug, block!.version);
        expect(out).toContain("SECRET-MARKER-9f3a2b");
        expect(out).toContain("加密内容");
    });

    it.skipIf(!has)("错误密码解不开", async () => {
        const html = readFileSync(HTML_PATH, "utf-8");
        const block = readBlock(html)!;
        await expect(
            dec(block.cipher, "wrong-password", block.slug, block.version),
        ).rejects.toThrow();
    });

    it.skipIf(!has)("产物里不含明文密码与明文正文", () => {
        const html = readFileSync(HTML_PATH, "utf-8");
        expect(html).not.toContain(PASSWORD);
        expect(html).not.toContain("SECRET-MARKER-9f3a2b");
    });

    it.skipIf(!has)("产物声明 version=2（决定客户端用哪套参数）", () => {
        const html = readFileSync(HTML_PATH, "utf-8");
        expect(readBlock(html)?.version).toBe("2");
    });
});
