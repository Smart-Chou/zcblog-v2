import { describe, it, expect } from "vitest";
import { encryptContent, encryptContentLegacy } from "../encrypt";

describe("encryptContent", () => {
    it("returns a base64 string", () => {
        const result = encryptContent("<p>hello</p>", "mypassword", "my-slug");
        expect(typeof result).toBe("string");
        expect(() => Buffer.from(result, "base64")).not.toThrow();
    });

    it("produces different output for different passwords", () => {
        const a = encryptContent("<p>hello</p>", "password1", "my-slug");
        const b = encryptContent("<p>hello</p>", "password2", "my-slug");
        expect(a).not.toBe(b);
    });

    it("produces different output for different slugs", () => {
        const a = encryptContent("<p>hello</p>", "password", "slug-a");
        const b = encryptContent("<p>hello</p>", "password", "slug-b");
        expect(a).not.toBe(b);
    });

    it("produces different output for same inputs", () => {
        /*
         * 这条原本断言 `a === b`（"确定性输出"），是 2026-11-16 之前的错误预期：
         * 确定性意味着同一 (password, slug) 永远用同一个 IV，即 AES-GCM 的
         * nonce 重用 —— 两份密文异或即可还原明文、并伪造认证标签。
         * 现在应当相反：随机 IV + 随机 salt，每次输出都不同。
         */
        const a = encryptContent("<p>hello</p>", "password", "my-slug");
        const b = encryptContent("<p>hello</p>", "password", "my-slug");
        expect(a).not.toBe(b);
    });

    it("handles empty content", () => {
        const result = encryptContent("", "password", "slug");
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
    });

    it("legacy path stays deterministic (that is exactly why it is retired)", () => {
        const a = encryptContentLegacy("<p>hello</p>", "password", "my-slug");
        const b = encryptContentLegacy("<p>hello</p>", "password", "my-slug");
        expect(a).toBe(b);
    });
});
