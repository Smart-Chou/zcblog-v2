#!/usr/bin/env python3
"""M4-8 引用普查：@marxchou/dogeared-ui 的真实消费者统计。

只读：遍历文件做文本匹配，不写仓库（除同目录 evidence.json）。
分类口径见 CLASSIFY；site_runtime 是「真实站点运行期引用」唯一判据。
"""
import json
import os
import re
import subprocess
import sys

REPO = "/Users/chowcong/Documents/WebSiteCode/zcblog-v2"
OUT = os.path.join(REPO, "docs/_reviews/M4-8/evidence.json")

SKIP_DIRS = {".git", "node_modules", "dist", ".astro", "test-results",
             "playwright-report", ".vercel", ".wrangler", ".turbo"}
TEXT_EXT = {".json", ".md", ".astro", ".ts", ".tsx", ".js", ".jsx", ".mjs",
            ".cjs", ".css", ".yml", ".yaml", ".txt", ".patch"}

NAME = "@marxchou/dogeared-ui"
LEGACY = "zcblog-ui"          # 计划 §5 M4-6 里的旧包名口径
PRIM_RE = re.compile(r"components/UI/(Badge|Button)\.astro|packages/ui/src/(Badge|Button)\.astro")


def classify(rel):
    if rel.startswith("packages/ui/"):
        return "package_self"
    if rel.startswith("docs/_reviews/"):
        return "review_evidence"
    if rel.startswith(("scripts/", ".changeset/", ".github/")):
        return "release_infra"
    if rel.startswith(("src/", "apps/", "theme-template/", "public/")):
        return "site_runtime"
    if rel.startswith("docs/") or rel in ("README.md", "CHANGELOG.md", "CONTRIBUTING.md"):
        return "docs"
    return "other"


def walk(root, exclude_dirs=()):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and d not in exclude_dirs]
        for fn in filenames:
            ext = os.path.splitext(fn)[1].lower()
            if ext in TEXT_EXT:
                yield os.path.join(dirpath, fn)


def scan(root, patterns, exact_dir=None):
    """返回 [(rel, line_no, line)]，按 pattern 组匹配。"""
    hits = []
    for path in walk(root):
        rel = os.path.relpath(path, root)
        if exact_dir and not rel.startswith(exact_dir):
            continue
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                for i, line in enumerate(fh, 1):
                    if any(p in line for p in patterns):
                        hits.append((rel, i, line.rstrip()[:200]))
        except OSError:
            continue
    return hits


def main():
    name_hits = scan(REPO, [NAME])
    legacy_hits = scan(REPO, [LEGACY])
    prim_hits = scan(REPO, [], )  # placeholder, replaced below

    prim_hits = []
    for path in walk(REPO):
        rel = os.path.relpath(path, REPO)
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                for i, line in enumerate(fh, 1):
                    if PRIM_RE.search(line):
                        prim_hits.append((rel, i, line.rstrip()[:200]))
        except OSError:
            continue

    by_cat = {}
    for rel, ln, line in name_hits:
        by_cat.setdefault(classify(rel), []).append({"file": rel, "line": ln, "text": line})

    # 仓库外：同一台机器上其他 checkout 是否按包名引用（真实第二站点判据）
    sibling_root = os.path.dirname(REPO)
    external = []
    for entry in sorted(os.listdir(sibling_root)):
        if entry == os.path.basename(REPO):
            continue
        d = os.path.join(sibling_root, entry)
        if not os.path.isdir(d):
            continue
        ext_hits = scan(d, [NAME])
        if ext_hits:
            external.append({"repo": entry, "hits": len(ext_hits),
                             "sample": [f"{r}:{n}" for r, n, _ in ext_hits[:5]]})

    # registry 只读探测：包是否已存在（存在才可能有外部消费者）
    def npm_view(pkg):
        try:
            p = subprocess.run(["npm", "view", pkg, "version"],
                               capture_output=True, text=True, timeout=60)
            return {"exit": p.returncode, "out": (p.stdout or p.stderr).strip().splitlines()[-1:]}
        except Exception as exc:  # noqa: BLE001
            return {"error": str(exc)}

    site_consumers = [h for h in prim_hits if classify(h[0]) == "site_runtime"]
    doc_consumers = [h for h in prim_hits if classify(h[0]) in ("docs", "review_evidence")]

    evidence = {
        "task": "t_28292288 / M4-8",
        "repo": REPO,
        "head": subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO,
                               capture_output=True, text=True).stdout.strip(),
        "patterns": {"scoped_name": NAME, "legacy_name": LEGACY},
        "counts": {
            "scoped_name_total": len(name_hits),
            "scoped_name_by_category": {k: len(v) for k, v in sorted(by_cat.items())},
            "legacy_name_total": len(legacy_hits),
            "primitive_relative_refs_total": len(prim_hits),
            "primitive_relative_refs_site_runtime": len(site_consumers),
            "primitive_relative_refs_docs_reviews": len(doc_consumers),
            "external_repos_referencing_name": len(external),
            "site_runtime_name_refs": len(by_cat.get("site_runtime", [])),
        },
        "scoped_name_hits": {k: v for k, v in sorted(by_cat.items())},
        "legacy_name_hits": [{"file": r, "line": n, "text": t} for r, n, t in legacy_hits],
        "primitive_relative_refs": [{"file": r, "line": n, "text": t} for r, n, t in prim_hits],
        "external_repos": external,
        "registry": {NAME: npm_view(NAME), "@marxchou/dogeared-tokens": npm_view("@marxchou/dogeared-tokens")},
    }

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(evidence, fh, ensure_ascii=False, indent=4)
        fh.write("\n")

    print(f"HEAD {evidence['head']}")
    print(f"scoped name hits: {len(name_hits)} -> {evidence['counts']['scoped_name_by_category']}")
    print(f"legacy '{LEGACY}' hits: {len(legacy_hits)}")
    print(f"site_runtime (src/ apps/ theme-template/) scoped-name refs: {len(by_cat.get('site_runtime', []))}")
    print(f"primitive relative refs: {len(prim_hits)} (site_runtime={len(site_consumers)})")
    print(f"external repos referencing name: {len(external)}")
    print(f"registry probe: {evidence['registry'][NAME]}")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
