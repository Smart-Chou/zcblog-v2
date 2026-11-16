/**
 * rehype-encrypted 的匹配与加密行为。
 *
 * 回归背景：remark 阶段的 `h()` 把 class 写成字符串（`properties.class`），
 * 而 rehype 阶段曾只读 `properties.className`（数组），两边键名不一致导致
 * 匹配永远失败——加密静默跳过，**明文正文与密码一起进了产物**。
 * 这个测试锁住那个行为，谁改回去都会红。
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { rehypeEncrypted } from "../rehype-encrypted";

/** 构造 remark 阶段实际产出的节点形态：properties 里是 `class` 字符串。 */
function treeWithWrapper(password: string, innerText = "机密内容") {
    return {
        type: "root",
        children: [
            {
                type: "element",
                tagName: "div",
                properties: {
                    class: "encrypted-container-wrapper",
                    "data-password": password,
                    "data-hint": "提示",
                },
                children: [
                    {
                        type: "element",
                        tagName: "p",
                        properties: {},
                        children: [{ type: "text", value: innerText }],
                    },
                ],
            },
        ],
    };
}

function findAll(node: any, pred: (n: any) => boolean, out: any[] = []): any[] {
    if (pred(node)) out.push(node);
    for (const c of node.children || []) findAll(c, pred, out);
    return out;
}

describe("rehype-encrypted", () => {
    const original = process.env.ENCRYPTION_PASSWORD;
    beforeEach(() => {
        process.env.ENCRYPTION_PASSWORD = "env-password";
    });
    afterEach(() => {
        if (original === undefined) delete process.env.ENCRYPTION_PASSWORD;
        else process.env.ENCRYPTION_PASSWORD = original;
    });

    it("properties.class 是字符串时也能匹配（回归：曾只认 className）", () => {
        const tree: any = treeWithWrapper("pw");
        rehypeEncrypted()(tree);
        const blocks = findAll(tree, (n) => n.properties?.["data-encrypted"] !== undefined);
        expect(blocks.length).toBe(1);
    });

    it("className 是数组时同样能匹配", () => {
        const tree: any = treeWithWrapper("pw");
        const wrapper = tree.children[0];
        wrapper.properties = {
            className: ["encrypted-container-wrapper"],
            "data-password": "pw",
            "data-hint": "提示",
        };
        wrapper.children[0].children = [{ ...wrapper.children[0].children[0] }];
        rehypeEncrypted()(tree);
        const blocks = findAll(tree, (n) => n.properties?.["data-encrypted"] !== undefined);
        expect(blocks.length).toBe(1);
    });

    it("加密后明文必须从树里消失", () => {
        const secret = "不该出现在产物里的正文";
        const tree: any = treeWithWrapper("pw", secret);
        rehypeEncrypted()(tree);
        const json = JSON.stringify(tree);
        expect(json).not.toContain(secret);
    });

    it("加密后产物不含明文密码", () => {
        const pw = "my-secret-password";
        const tree: any = treeWithWrapper(pw);
        rehypeEncrypted()(tree);
        const json = JSON.stringify(tree);
        expect(json).not.toContain(pw);
        expect(json).not.toContain("data-password");
    });

    it("data-version 由加密端决定，当前为 2", () => {
        const tree: any = treeWithWrapper("pw");
        rehypeEncrypted()(tree);
        const block = findAll(tree, (n) => n.properties?.["data-encrypted"] !== undefined)[0];
        expect(String(block.properties["data-version"])).toBe("2");
    });

    it("未提供密码且无环境变量时抛错，不能产出未加密内容", () => {
        delete process.env.ENCRYPTION_PASSWORD;
        const tree: any = treeWithWrapper("");
        expect(() => rehypeEncrypted()(tree)).toThrow();
    });

    it("普通节点不受影响", () => {
        const tree: any = {
            type: "root",
            children: [
                {
                    type: "element",
                    tagName: "p",
                    properties: {},
                    children: [{ type: "text", value: "普通" }],
                },
            ],
        };
        const before = JSON.stringify(tree);
        rehypeEncrypted()(tree);
        expect(JSON.stringify(tree)).toBe(before);
    });
});
