/**
 * Pagefind 搜索结果 — 自定义模板 + 点击增强
 *
 * 模板走官方 buildTemplateData() 数据流（保证 meta/url 结构一致），
 * 同时兜底处理部分 fragment 缺少 meta.title 的情况。
 *
 * 点击：整行可点（包括空白区域），中键新标签页打开。
 */

function esc(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function createResultTemplate(r, resultsEl) {
    // 走官方 buildTemplateData 获取一致的数据结构 + 子结果过滤
    var opts = {
        showSubResults: !resultsEl.hideSubResults,
        maxSubResults: resultsEl.maxSubResults || 3,
        linkTarget: resultsEl.linkTarget,
        showImages: resultsEl.showImages,
    };
    var data = resultsEl.buildTemplateData
        ? resultsEl.buildTemplateData.call(resultsEl, r, opts)
        : null;

    var meta = (data && data.meta) || r.meta || {};
    // 部分 fragment meta 为空，兜底从 anchors[0].text 取标题
    var title = meta.title || (r.anchors && r.anchors[0] && r.anchors[0].text) || "";
    var url = (data && data.url) || r.url || meta.url || "";
    // 子结果：优先用官方过滤后的，回退到原始
    var subs = (data && data.sub_results) || (r.sub_results || []).slice(0, 6);

    // 按文档位置排序：thinSubResults 按 locations.length 排序对中文不稳定，
    // 改用 anchor 的 byte offset 保证子结果顺序与文章结构一致。
    if (subs.length > 1 && Array.isArray(r.anchors)) {
        var _anchorPos = {};
        for (var _ai = 0; _ai < r.anchors.length; _ai++) {
            var _a = r.anchors[_ai];
            _anchorPos[_a.id] = _a.location || _ai;
        }
        subs.sort(function (a, b) {
            function _id(u) {
                var h = u.lastIndexOf("#");
                return h >= 0 ? u.slice(h + 1) : "";
            }
            var aPos = _anchorPos[_id(a.url)] != null ? _anchorPos[_id(a.url)] : 1e9;
            var bPos = _anchorPos[_id(b.url)] != null ? _anchorPos[_id(b.url)] : 1e9;
            return aPos - bPos;
        });
    }

    var h = "";

    h += '<li class="custom-result-item" data-url="' + esc(url) + '">';

    // ── 主标题行：图标 + 链接 ──
    h += '<div class="custom-header">';
    h += '  <span class="custom-icon">';
    h +=
        '    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" opacity="0.85">';
    h += '      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>';
    h +=
        '      <path d="M14 2v6h6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
    h +=
        '      <path d="M16 13H8M16 17H8M10 9H8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>';
    h += "    </svg>";
    h += "  </span>";
    h += '  <a class="custom-link" href="' + esc(url) + '">' + esc(title) + "</a>";
    h += "</div>";

    // ── 主摘要 + 子结果树（wrapper 保证竖线不断）──
    var hasExcerpt = !!((data && data.excerpt) || r.excerpt);
    if (hasExcerpt || subs.length > 0) {
        h += '<div class="custom-tree-body">';

        // 主摘要
        if (hasExcerpt) {
            h += '<p class="custom-excerpt">' + ((data && data.excerpt) || r.excerpt) + "</p>";
        }

        // 子结果树
        if (subs.length > 0) {
            h += '<div class="custom-tree">';
            for (var i = 0; i < subs.length; i++) {
                var s = subs[i];
                h += '<div class="custom-sub" data-url="' + esc(s.url) + '">';
                h += '  <span class="custom-branch"></span>';
                h +=
                    '  <a class="custom-sub-link" href="' +
                    esc(s.url) +
                    '">' +
                    esc(s.title) +
                    "</a>";
                if (s.excerpt) {
                    h += '<p class="custom-sub-excerpt">' + s.excerpt + "</p>";
                }
                h += "</div>";
            }
            h += "</div>";
        }

        h += "</div>";
    }

    h += "</li>";
    return h;
}

/** 将模板应用到当前的 <pagefind-results> 元素 */
function applyResultTemplate() {
    var resultsEl = document.querySelector("pagefind-results");
    if (!resultsEl) return;
    resultsEl.resultTemplate = function (r) {
        return createResultTemplate(r, resultsEl);
    };
}

// 首次加载时应用
customElements.whenDefined("pagefind-modal").then(applyResultTemplate);

// ── 点击事件委托 ──

function handleResultClick(e) {
    if (e.target.closest("a")) return;

    var sub = e.target.closest(".custom-sub");
    if (sub) {
        var subUrl = sub.getAttribute("data-url");
        if (subUrl) window.location.href = subUrl;
        return;
    }

    var item = e.target.closest(".custom-result-item");
    if (!item) return;
    var url = item.getAttribute("data-url");
    if (url) window.location.href = url;
}

function handleResultAuxClick(e) {
    if (e.button !== 1) return;
    if (e.target.closest("a")) return;

    var sub = e.target.closest(".custom-sub");
    var item = e.target.closest(".custom-result-item");
    var url = (sub && sub.getAttribute("data-url")) || (item && item.getAttribute("data-url"));
    if (url) {
        e.preventDefault();
        window.open(url, "_blank");
    }
}

document.addEventListener("click", handleResultClick);
document.addEventListener("auxclick", handleResultAuxClick);

export { applyResultTemplate };
