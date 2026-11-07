#!/usr/bin/env python3
"""A2 判据：检查内容仓里是否还有「新 schema 不认的旧字段」。

为什么不用 grep：写进 Markdown 表格时 `|` 必须转义成 `\\|`，
直接复制命令会变成「搜字面量 sticky|mermaid」→ 命中 0 个文件 → 假绿。
（红队第三轮 R3-06 实测：转义原文跑出 0，正确模式跑出 78。）

用法: python3 scripts/check-legacy-keys.py <content-dir>
退出码: 0 = 干净；1 = 有遗留键
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content_inventory import parse_frontmatter  # noqa: E402

# 新 schema 里不存在的键。features 承载的是「值」，键名本身不该出现。
LEGACY = {
    # sticky 已收进 v2 的 content schema（置顶排序用），不再算遗留键
    # series 自 M5-12（D-0145）收进 schema，同样移出遗留键；`seriesOrder` 是它的配对字段
    "mermaid", "mathjax", "katex", "plantuml", "chart", "markmap",
    "tabs", "fancybox", "reveal", "category", "paid",
    "type", "palette", "rendering", "references",
}

KEY = re.compile(r"^([A-Za-z_][\w-]*):", re.M)


def main():
    root = os.path.expanduser(sys.argv[1])
    hits = []
    scanned = 0
    for dp, _dirs, ns in os.walk(root):
        if "/.git" in dp:
            continue
        for n in sorted(ns):
            if not n.endswith((".md", ".mdx")):
                continue
            p = os.path.join(dp, n)
            rel = os.path.relpath(p, root)
            fm, _body = parse_frontmatter(open(p, encoding="utf-8", errors="replace").read())
            if not fm or not fm.get("pubDate"):
                continue  # 只查真实文章，素材/空文件不算
            scanned += 1
            bad = sorted(k for k in fm if k in LEGACY)
            if bad:
                hits.append((rel, bad))

    for rel, bad in hits:
        print(f"{rel}\t{','.join(bad)}")
    print(f"\n扫描文章: {scanned} | 含遗留键: {len(hits)}")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
