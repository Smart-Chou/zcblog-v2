#!/bin/bash
# M4-10 只读探针：在 /tmp 副本里造「M4 发布态」——
#   packages/tokens、packages/og-image 翻成 private:false，packages/ui 保持 private:true（D-0120），
#   再放一条 pending changeset —— 然后跑副本里的 preflight --mode=publish。
#
# 期望：exit 0；P1 三行 = PASS / INFO(ui, D-0120) / PASS；publish-plan 只含两包，不含 ui。
# 真仓库只读（脚本只 cp，不写回）。用法：bash docs/_reviews/M4-10/probe-publish-set.sh [目标目录]
set -uo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
TMP="${1:-/tmp/m4-10-publish-set}"
rm -rf "$TMP"; mkdir -p "$TMP/scripts"

cp -R "$REPO/scripts/release" "$TMP/scripts/release"
cp "$REPO/package.json" "$REPO/pnpm-workspace.yaml" "$TMP/"
cp "$REPO/LICENSE" "$REPO/NOTICE" "$TMP/" 2>/dev/null || true
mkdir -p "$TMP/.changeset"
cp "$REPO/.changeset/config.json" "$TMP/.changeset/config.json"
for p in tokens ui og-image; do
    mkdir -p "$TMP/packages/$p"
    ( cd "$REPO/packages/$p" && tar -cf - --exclude=node_modules . ) | ( cd "$TMP/packages/$p" && tar -xf - )
done
# 副本里 `npx changeset` 要解析到本仓已装的 CLI（不联网装包）
ln -s "$REPO/node_modules" "$TMP/node_modules"

python3 - "$TMP" <<'PY'
import json, sys
tmp = sys.argv[1]
for pkg in ("tokens", "og-image"):          # 发布清单内的两个包
    p = f"{tmp}/packages/{pkg}/package.json"
    d = json.load(open(p))
    d["private"] = False
    json.dump(d, open(p, "w"), indent=4, ensure_ascii=False)
    open(p, "a").write("\n")
ui = json.load(open(f"{tmp}/packages/ui/package.json"))
print("tokens/og-image -> private:false | ui private =", ui.get("private"))
PY

cat > "$TMP/.changeset/probe-pending.md" <<'MD'
---
"@marxchou/dogeared-tokens": patch
---

probe(m4-10): pending changeset so publish-plan is non-empty
MD

cd "$TMP" || exit 1
echo "=== workspace: $TMP ==="
node scripts/release/preflight.mjs --mode=publish
echo "EXIT=$?"
