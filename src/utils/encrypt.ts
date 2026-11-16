/**
 * Build-time content encryption using Node crypto.
 *
 * AES-256-GCM，PBKDF2-SHA256 派生密钥。
 * 输出：base64(salt[16] + iv[12] + authTag[16] + ciphertext)
 *
 * ── 2026-11-16 修复的四个缺陷 ──────────────────────────────
 *
 * 1. **IV 确定性 → nonce 重用（严重）**
 *    旧实现 `iv = HMAC(password, "iv:"+slug)[0..12]`，同一密码加密同一篇文章
 *    每次得到完全相同的 IV。AES-GCM 一旦在同一个 (key, nonce) 下加密两份明
 *    文，两份密文异或即得两份明文异或，攻击者可恢复明文并伪造认证标签。
 *    实测：同密码同文章两次加密，IV 字节完全相同。
 *    → 改为 `randomBytes(12)`。
 *
 * 2. **salt 由密码派生 → 彩虹表失效**
 *    旧 `salt = HMAC(password, "salt:"+slug)` 等于 salt 不提供任何随机性，
 *    同一密码在所有构建中派生同一密钥，可预计算。
 *    → 改为 `randomBytes(16)`，随密文公开（这不是秘密，作用是加随机性）。
 *
 * 3. **无 AAD → 密文可搬运**
 *    把免费文章 A 的密文贴到付费文章 B 的位置，旧实现会静默解出 A 的内容。
 *    → 用 slug 作为 AAD，搬运后 GCM 认证失败。
 *
 * 4. **迭代 100k 偏低**
 *    OWASP 对 PBKDF2-SHA256 的建议下限是 600k；同级参考 Shirone 用 310k。
 *    → 提到 310k。**这会使命中旧格式的内容失效**，见下方兼容分支。
 *
 * ── 向后兼容 ──────────────────────────────────────────────
 * 已发布的旧密文用 v1 格式（100k 迭代、确定性 IV、无 AAD），改动参数会让
 * 它们永久解不开。所以解密端读取 `data-version` 区分，v1 走旧路径、v2 走新
 * 路径。新内容一律产出 v2。旧内容在重新部署时自动升级为新格式。
 */

import { createCipheriv, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

const IV_LEN = 12;
const SALT_LEN = 16;
const TAG_LEN = 16;
const KEY_LEN = 32;

/** v1：历史参数，只用于解密旧内容，不可用于新内容。 */
const V1_ITERATIONS = 100_000;
/** v2：当前参数。改动必须与客户端 `rehype-encrypted` 里的常量同步。 */
export const ITERATIONS = 310_000;

export const VERSION_V1 = "1";
export const VERSION_V2 = "2";

function deriveBytes(key: string, context: string, length: number): Buffer {
    return createHmac("sha256", key).update(context).digest().subarray(0, length);
}

export type EncryptOptions = {
    /** 用于 AAD 的上下文标识（通常是 slug）。省略则不加 AAD，与 v1 行为一致。 */
    aad?: string;
};

/**
 * 加密。产出 v2 格式，随机 salt 与 IV。
 *
 * @param html   待加密的 HTML（构建期渲染产物）
 * @param password 作者设置的访问密码
 * @param slug   文章标识；既参与 v1 兼容派生，也作为 AAD 绑定
 */
export function encryptContent(
    html: string,
    password: string,
    slug: string,
    options: EncryptOptions = {},
): string {
    const salt = randomBytes(SALT_LEN);
    const iv = randomBytes(IV_LEN);
    const key = pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, "sha256");

    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const aad = options.aad ?? slug;
    if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
    const encrypted = Buffer.concat([cipher.update(html, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    if (authTag.length !== TAG_LEN) {
        throw new Error(`[encrypt] GCM tag 长度异常：${authTag.length}`);
    }
    return Buffer.concat([salt, iv, authTag, encrypted]).toString("base64");
}

/**
 * 用 v1 参数加密。**仅用于测试兼容性**，任何新内容都不得走这条路径。
 */
export function encryptContentLegacy(html: string, password: string, slug: string): string {
    const salt = deriveBytes(password, `salt:${slug}`, SALT_LEN);
    const iv = deriveBytes(password, `iv:${slug}`, IV_LEN);
    const key = pbkdf2Sync(password, salt, V1_ITERATIONS, KEY_LEN, "sha256");

    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(html, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([salt, iv, authTag, encrypted]).toString("base64");
}

/** 导出给客户端脚本嵌入用，避免两处硬编码漂移。 */
export { V1_ITERATIONS as LEGACY_ITERATIONS };
