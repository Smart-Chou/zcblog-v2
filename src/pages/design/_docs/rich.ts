/**
 * rich() — 把文档数据里的轻量标记渲染成安全的 HTML（M1-6）。
 *
 * 约定（与 DESIGN.md 一致）：
 *   `code`     → <code class="tok">（反引号内的内容原样保留，不再解析 token 名）
 *   裸 token   → <code class="tok">（反引号外的 token 名自动上代码样式）
 *   其它       → HTML 转义后原样输出
 *
 * 只用于本仓库自有的 JSON 数据，不接受用户输入；仍然先转义再拼标签，
 * 避免数据里的 `<button>` 之类被当成标签解析。
 */

const TOKEN_RE = /(--[a-z][a-z0-9-]*)/g;

export function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function rich(value: string): string {
    // split 后奇数下标 = 反引号内的内容
    return value
        .split("`")
        .map((part, index) => {
            if (index % 2 === 1) return `<code class="tok">${escapeHtml(part)}</code>`;
            return escapeHtml(part).replace(TOKEN_RE, '<code class="tok">$1</code>');
        })
        .join("");
}
