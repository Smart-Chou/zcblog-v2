#!/usr/bin/env python3
"""A6 / 性能预算的可执行判据（G3）——dist 层门禁。

读 `dist/` 的构建产物，按页面类型（article / list / page）统计 HTML / JS(gz) / CSS(gz)，
与预算表比对。不依赖网络、不依赖浏览器——LCP/CLS 这类现场指标按 D-0077 的机房口径
另测（见 docs/_reviews/M2-12/perf.md），不进这条门禁。

用法:
  python3 scripts/gates/perf-budget.py <dist> [--json out.json] [--summary out.md] [--scale 0.5]

CI（.github/workflows/perf.yml / ci.yml）:
  --summary <path>        或环境变量 GITHUB_STEP_SUMMARY → 追加 markdown 表到 job summary
  --scale <f>             或环境变量 PERF_BUDGET_SCALE    → 门禁阈值整体缩放（默认 1.0）
                          只为「负向验证」而存在：`PERF_BUDGET_SCALE=0.4` 必须红，不设即绿。
  stdout 最后一行 `SUMMARY {...}` → CI 可 grep 归档（与 verify-entities 同款约定）。

退出码: 0 = 全部页面在预算内；1 = 有超支；2 = 用法错误 / dist 不存在
"""
import json
import os
import re
import sys
import gzip

# 预算（KB, gz for js/css; raw for html）—— 见 docs/06-performance-budget.md
# 2026-10-30 修订（D-0051）：口径改为「跟随静态 import 链」，并分两级——
#   BUDGET = 门禁（CI 必红，取当前 p95 + 约 3~5%，防回归）
#   TARGET = 目标（不阻断，只报告差距；= 已签需求 A6 的 100KB）
# 2026-10-30 二次收紧（D-0052）：去掉 vendor 兜底后 JS 大降，门禁随之下调
# —— 预算是棘轮，只许往下调，不许往上抬。
BUDGET = {
    "article": {"html": 215, "js": 40, "css": 45},
    "list":    {"html": 105, "js": 28, "css": 40},
    "page":    {"html": 105, "js": 30, "css": 40},
}

TARGET = {"article": 100, "list": 100, "page": 100}

# D-0077 / A7 的固定 5 页（lab 层 LCP 门禁的测量集）。dist 层不测 LCP，但会核对这 5 个
# URL 是否还在产物里——路由改名/内容欠检时 lab 门禁会静默失去对象，这里提前报出来。
A7_PAGES = [
    "index.html",
    "article/self-hosted-git-platform-guide/index.html",
    "blog/2/index.html",
    "tags/DOCKER/index.html",
    "archives/index.html",
]

TIGHT_RATIO = 0.01  # 余量 < 1% 记「临界限」，只报告不判红

USAGE = "用法: python3 scripts/gates/perf-budget.py <dist> [--json out.json] [--summary out.md] [--scale 1.0]"


def gz(path):
    with open(path, "rb") as f:
        return len(gzip.compress(f.read(), 9))


def classify(rel):
    if rel.startswith("article/"):
        return "article"
    if re.match(r"^(index\.html|blog/|tags/|archives/)", rel):
        return "list"
    return "page"


def _static_imports(path):
    """只取静态 import（`from"./x.js"` / `import"./x.js"`）；`import("./x.js")` 是懒加载，不计入首屏。"""
    text = open(path, encoding="utf-8", errors="ignore").read()
    names = re.findall(r'from\s*"(\.[^"]+\.js)"', text)
    names += re.findall(r'\bimport\s*"(\.[^"]+\.js)"', text)
    return names


def js_total(dist, entry_urls, missing):
    """JS 按模块图汇总：entry + 静态 import 链去重。

    G4 修正（2026-10-30）：旧版只累加 HTML 里 <script src>，把 vendor chunk
    整块漏掉——实测文章页报 5.8KB 而真实首屏 JS 是 100KB+。预算必须跟着 import 走。
    """
    seen, stack, total = set(), list(entry_urls), 0
    while stack:
        u = stack.pop()
        if u in seen:
            continue
        seen.add(u)
        p = os.path.join(dist, u.lstrip("/"))
        if not os.path.exists(p):
            missing.append(u)
            continue
        total += gz(p)
        base = os.path.dirname(u)
        for rel in _static_imports(p):
            nxt = os.path.normpath(os.path.join(base, rel)).replace(os.sep, "/")
            stack.append("/" + nxt.lstrip("/"))
    return total


def stats(dist, page):
    html_path = os.path.join(dist, page)
    text = open(html_path, encoding="utf-8").read()
    js = [u for u in dict.fromkeys(re.findall(r'src="([^"]+\.js)"', text)) if not u.startswith("http")]
    css = [u for u in dict.fromkeys(re.findall(r'href="([^"]+\.css)"', text)) if not u.startswith("http")]
    missing = []

    def total(urls):
        b = 0
        for u in urls:
            p = os.path.join(dist, u.lstrip("/"))
            if os.path.exists(p):
                b += gz(p)
            else:
                missing.append(u)      # 引用缺失 = 失败，不是 0（红队 G3-round1 I-03）
        return b

    inline_js = sum(len(x) for x in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", text, re.S))
    html_bytes = os.path.getsize(html_path)
    return {
        "page": page,
        "kind": classify(page),
        "html_kb": round(html_bytes / 1024, 1),
        "js_kb": round(js_total(dist, js, missing) / 1024, 1),
        "css_kb": round(total(css) / 1024, 1),
        "inline_js_kb": round(inline_js / 1024, 1),
        "js_files": len(js),
        "html_bytes": html_bytes,
        "missing": missing,
    }


def parse_args(argv):
    opts = {"dist": "dist", "json": None, "summary": None, "scale": None}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ("-h", "--help"):
            print(USAGE)
            raise SystemExit(0)
        if a in ("--json", "--summary", "--scale"):
            if i + 1 >= len(argv):
                print(f"{a} 需要参数值\n{USAGE}", file=sys.stderr)
                raise SystemExit(2)
            opts[a.lstrip("-")] = argv[i + 1]
            i += 2
            continue
        if a.startswith("-"):
            print(f"未知参数 {a}\n{USAGE}", file=sys.stderr)
            raise SystemExit(2)
        opts["dist"] = a
        i += 1
    return opts


def resolve_scale(explicit):
    """--scale 优先，其次 PERF_BUDGET_SCALE，默认 1.0。缩放 = 负向验证的开关。"""
    raw = explicit if explicit is not None else os.environ.get("PERF_BUDGET_SCALE")
    if raw in (None, "", "1", "1.0"):
        return 1.0
    try:
        scale = float(raw)
    except ValueError:
        print(f"无法解析阈值缩放 {raw!r}（要正数）\n{USAGE}", file=sys.stderr)
        raise SystemExit(2)
    if scale <= 0:
        print(f"阈值缩放必须 > 0，收到 {scale}", file=sys.stderr)
        raise SystemExit(2)
    return scale


def scaled_budget(scale):
    if scale == 1.0:
        return {k: dict(v) for k, v in BUDGET.items()}
    return {k: {m: round(v * scale, 1) for m, v in b.items()} for k, b in BUDGET.items()}


def kind_rows(rows, kind):
    return [r for r in rows if r["kind"] == kind]


def p95(values):
    v = sorted(values)
    return v[min(len(v) - 1, int(round(0.95 * (len(v) - 1))))]


def tightest(dist_row, budget_row):
    """返回 (余量最小的指标, 余量 KB, 余量占预算比例)。正数 = 还有空间。"""
    worst = None
    for m in ("html", "js", "css"):
        head = round(budget_row[m] - dist_row[f"{m}_kb"], 1)
        ratio = head / budget_row[m] if budget_row[m] else float("inf")
        if worst is None or ratio < worst[2]:
            worst = (m, head, ratio)
    return worst


def build_summary(rows, over, budget, scale, a7_missing):
    total = len(rows)
    ok = not over
    out = []
    title = f"### 性能预算 (A6 / G3) · dist {total} 页 · 超预算 {len(over)} 页 {'✅' if ok else '❌'}"
    if scale != 1.0:
        title += f" · ⚠️ 阈值已缩放 ×{scale}（负向验证）"
    out.append(title)
    out.append("")
    out.append("| 页型 | 页数 | HTML p95 | JS p95 | CSS p95 | 门禁 html/js/css | 最紧余量 | 结果 |")
    out.append("|---|---|---|---|---|---|---|---|")
    for kind, b in budget.items():
        sub = kind_rows(rows, kind)
        if not sub:
            continue
        worst = min(sub, key=lambda r: tightest(r, b)[2])
        m, head, ratio = tightest(worst, b)
        state = "PASS" if all(not r["over"] for r in sub) else "FAIL"
        out.append(
            f"| {kind} | {len(sub)} | {p95([r['html_kb'] for r in sub]):.1f} | "
            f"{p95([r['js_kb'] for r in sub]):.1f} | {p95([r['css_kb'] for r in sub]):.1f} | "
            f"{b['html']}/{b['js']}/{b['css']} | {head:+.1f} KB ({ratio * 100:.1f}%) "
            f"{worst['page']} · {m} | {state} |"
        )
    out.append("")

    tight = sorted(
        (r for r in rows if tightest(r, budget[r["kind"]])[2] < TIGHT_RATIO),
        key=lambda r: tightest(r, budget[r["kind"]])[2],
    )
    if tight:
        out.append(f"<details><summary>临界限：余量 &lt; {TIGHT_RATIO * 100:.0f}% 的页面（{len(tight)}）——只报告不判红</summary>")
        out.append("")
        for r in tight[:10]:
            m, head, ratio = tightest(r, budget[r["kind"]])
            out.append(f"- `{r['page']}`（{r['kind']}）：{m} 余量 {head:+.1f} KB（{ratio * 100:.2f}%）")
        out.append("")
        out.append("</details>")
        out.append("")

    if over:
        out.append(f"**超支页面（前 10 / 共 {len(over)}）**")
        out.append("")
        out.append("| 页面 | 类型 | html | js | css | 超 |")
        out.append("|---|---|---|---|---|---|")
        for r in over[:10]:
            out.append(
                f"| `{r['page']}` | {r['kind']} | {r['html_kb']} | {r['js_kb']} | {r['css_kb']} | "
                f"{', '.join(str(x) for x in r['over'])} |"
            )
        out.append("")

    if a7_missing:
        out.append(f"**D-0077 / A7 固定 5 页缺失 {len(a7_missing)} 个**（lab 层 LCP 门禁会失去对象）：")
        out.append("")
        for p in a7_missing:
            out.append(f"- `{p}`")
    else:
        out.append("D-0077 / A7 固定 5 页全部存在于 dist（LCP 门禁的测量集完整）。")
    return "\n".join(out)


def main():
    opts = parse_args(sys.argv[1:])
    dist = os.path.expanduser(opts["dist"])
    if not os.path.isdir(dist):
        print(f"dist 不存在: {dist}", file=sys.stderr)
        return 2
    scale = resolve_scale(opts["scale"])
    budget = scaled_budget(scale)

    pages = []
    for root, _dirs, files in os.walk(dist):
        for f in files:
            if f == "index.html":
                rel = os.path.relpath(os.path.join(root, f), dist)
                pages.append(rel)
    pages.sort()
    if not pages:
        print(f"{dist} 里没有 index.html——构建没产物？", file=sys.stderr)
        return 2

    rows, over = [], []
    for rel in pages:
        s = stats(dist, rel)
        b = budget[s["kind"]]
        bad = [k for k in ("html", "js", "css") if s[f"{k}_kb"] > b[k]]
        if s["missing"]:
            bad.append(f"引用缺失({len(s['missing'])})")
        s["over"] = bad
        rows.append(s)
        if bad:
            over.append(s)

    a7_missing = [p for p in A7_PAGES if not os.path.exists(os.path.join(dist, p))]

    print(f"扫描 {len(rows)} 页 | 超预算 {len(over)} 页")
    print(f"{'类型':8} {'页数':>4} {'HTML p95':>9} {'JS p95':>7} {'CSS p95':>8} {'JS 最大':>8} {'门禁 h/j/c':>12} {'最紧余量':>10}")
    for kind, b in budget.items():
        sub = kind_rows(rows, kind)
        if not sub:
            continue
        js = [r["js_kb"] for r in sub]
        worst = min(sub, key=lambda r: tightest(r, b)[2])
        m, head, ratio = tightest(worst, b)
        print(
            f"{kind:8} {len(sub):>4} {p95([r['html_kb'] for r in sub]):>9.1f} "
            f"{p95(js):>7.1f} {p95([r['css_kb'] for r in sub]):>8.1f} {max(js):>8.1f} "
            f"{b['html']}/{b['js']}/{b['css']:>2} {head:>+7.1f} KB ({ratio * 100:.1f}%) {worst['page']}·{m}"
        )
    print("\n门禁:", json.dumps(budget, ensure_ascii=False), "| 目标(JS):", json.dumps(TARGET, ensure_ascii=False))
    if scale != 1.0:
        print(f"⚠️ 阈值缩放 PERF_BUDGET_SCALE=×{scale}（这是负向验证路径，不是真实门禁）")
    if a7_missing:
        print(f"⚠️ D-0077 / A7 固定 5 页缺失 {len(a7_missing)}：{', '.join(a7_missing)}")

    if over:
        print(f"\n超支页面（前 10 / 共 {len(over)}）：")
        for r in over[:10]:
            print(f"  {r['page']}: html={r['html_kb']} js={r['js_kb']} css={r['css_kb']} 超 {r['over']}")

    if opts["json"]:
        json.dump(
            {"budget": budget, "budget_base": BUDGET, "scale": scale, "pages": rows},
            open(opts["json"], "w", encoding="utf-8"),
            ensure_ascii=False,
            indent=1,
        )
        print(f"[saved] {opts['json']}")

    summary = build_summary(rows, over, budget, scale, a7_missing)
    summary_path = opts["summary"] or os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as f:
            f.write(summary.rstrip() + "\n")
        print(f"[summary] -> {summary_path}")

    print("SUMMARY " + json.dumps({
        "pages": len(rows),
        "over": len(over),
        "scale": scale,
        "p95": {
            kind: {
                "html_kb": p95([r["html_kb"] for r in kind_rows(rows, kind)]),
                "js_kb": p95([r["js_kb"] for r in kind_rows(rows, kind)]),
                "css_kb": p95([r["css_kb"] for r in kind_rows(rows, kind)]),
            }
            for kind in budget
            if kind_rows(rows, kind)
        },
        "a7_missing": a7_missing,
    }, ensure_ascii=False))
    return 1 if over else 0


if __name__ == "__main__":
    sys.exit(main())
