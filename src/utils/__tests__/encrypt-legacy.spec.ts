/**
 * encrypt.ts 的安全性质测试。
 *
 * 每条都对应 2026-11-16 修掉的一个真实缺陷。这些断言在修复前是**反面**的，
 * 所以它们同时充当回归保护：谁把 IV 改回确定性派生，这里立刻红。
 */
import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { encryptContent, encryptContentLegacy, ITERATIONS, LEGACY_ITERATIONS } from "../encrypt";

/** 与 rehype-encrypted 内联脚本一致的布局：salt[16] + iv[12] + tag[16] + ct */
function split(b64: string) {
    const raw = Buffer.from(b64, "base64");
    return {
        salt: raw.subarray(0, 16),
        iv: raw.subarray(16, 28),
        tag: raw.subarray(28, 44),
        ct: raw.subarray(44),
    };
}

/** 用 WebCrypto 解密，模拟浏览器端（含 v1/v2 两种参数）。 */
async function decryptWith(
    b64: string,
    password: string,
    opts: { iterations: number; aad?: string },
): Promise<string> {
    const { salt, iv, tag, ct } = split(b64);
    const km = await webcrypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveKey"],
    );
    const key = await webcrypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: opts.iterations, hash: "SHA-256" },
        km,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
    );
    const buf = new Uint8Array(ct.length + tag.length);
    buf.set(ct);
    buf.set(tag, ct.length);
    const params: AesGcmParams = { name: "AES-GCM", iv };
    if (opts.aad) params.additionalData = new TextEncoder().encode(opts.aad);
    const plain = await webcrypto.subtle.decrypt(params, key, buf);
    return new TextDecoder().decode(plain);
}

describe("encrypt.ts 安全性质", () => {
    it("① 同密码同文章两次加密，IV 必须不同（修复 nonce 重用）", () => {
        const a = split(encryptContent("<p>A</p>", "pw", "post-1"));
        const b = split(encryptContent("<p>B</p>", "pw", "post-1"));
        expect(a.iv.equals(b.iv)).toBe(false);
    });

    it("① 同上，salt 也必须不同（防彩虹表预计算）", () => {
        const a = split(encryptContent("<p>A</p>", "pw", "post-1"));
        const b = split(encryptContent("<p>B</p>", "pw", "post-1"));
        expect(a.salt.equals(b.salt)).toBe(false);
    });

    it("① 完全相同的输入也产出不同密文（随机性来自 IV/salt，不是内容）", () => {
        const a = encryptContent("<p>same</p>", "pw", "post-1");
        const b = encryptContent("<p>same</p>", "pw", "post-1");
        expect(a).not.toBe(b);
    });

    it("② v2 密文可被 WebCrypto 以 310k 迭代 + slug 作 AAD 解开", async () => {
        const html = "<p>受保护内容</p>";
        const enc = encryptContent(html, "pw", "my-post");
        expect(await decryptWith(enc, "pw", { iterations: ITERATIONS, aad: "my-post" })).toBe(html);
    });

    it("③ AAD 绑定：换 slug 解密必须失败（防密文搬运）", async () => {
        const enc = encryptContent("<p>属于 A 文章</p>", "pw", "article-a");
        await expect(
            decryptWith(enc, "pw", { iterations: ITERATIONS, aad: "article-b" }),
        ).rejects.toThrow();
    });

    it("③ 不给 AAD 也解不开（证明 AAD 真的生效，而非可选装饰）", async () => {
        const enc = encryptContent("<p>x</p>", "pw", "article-a");
        await expect(decryptWith(enc, "pw", { iterations: ITERATIONS })).rejects.toThrow();
    });

    it("④ 迭代次数是 310k，不是旧的 100k", () => {
        expect(ITERATIONS).toBe(310_000);
        expect(LEGACY_ITERATIONS).toBe(100_000);
        expect(ITERATIONS).toBeGreaterThan(LEGACY_ITERATIONS);
    });

    it("密码错误必须失败", async () => {
        const enc = encryptContent("<p>x</p>", "right", "s");
        await expect(
            decryptWith(enc, "wrong", { iterations: ITERATIONS, aad: "s" }),
        ).rejects.toThrow();
    });

    it("v1 旧密文仍可按历史参数解开（向后兼容）", async () => {
        const html = "<p>旧内容</p>";
        const legacy = encryptContentLegacy(html, "pw", "old-post");
        expect(await decryptWith(legacy, "pw", { iterations: LEGACY_ITERATIONS })).toBe(html);
    });

    it("v1 是确定性的（这正是不再使用它的原因）", () => {
        const a = encryptContentLegacy("<p>same</p>", "pw", "p");
        const b = encryptContentLegacy("<p>same</p>", "pw", "p");
        expect(a).toBe(b);
    });

    it("自定义 aad 会覆盖默认的 slug", async () => {
        const enc = encryptContent("<p>y</p>", "pw", "slug-x", { aad: "override" });
        expect(await decryptWith(enc, "pw", { iterations: ITERATIONS, aad: "override" })).toBe(
            "<p>y</p>",
        );
        await expect(
            decryptWith(enc, "pw", { iterations: ITERATIONS, aad: "slug-x" }),
        ).rejects.toThrow();
    });
});
