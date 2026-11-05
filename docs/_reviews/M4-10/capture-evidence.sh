#!/bin/bash
# M4-10 证据采集：把每条验收命令的真实输出落到 docs/_reviews/M4-10/logs/
# 只读真仓库（探针在 /tmp 副本里翻 private，不回流）。
set -uo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
OUT="$REPO/docs/_reviews/M4-10/logs"
mkdir -p "$OUT"
cd "$REPO" || exit 1

# 01 负向 A：真仓现状（三包 private，发布清单内两包应 FAIL、ui 应 INFO）
node scripts/release/preflight.mjs --mode=publish --tag v2.1.0 >"$OUT/01-neg-real-repo-publish.log" 2>&1
echo "01 exit=$?" >>"$OUT/01-neg-real-repo-publish.log"

# 02 正向：发布态（tokens/og-image private:false + ui private:true + 有 pending changeset）
bash docs/_reviews/M4-10/probe-publish-set.sh /tmp/m4-10-publish-set >"$OUT/02-pos-release-set-publish.log" 2>&1
echo "02 exit=$?" >>"$OUT/02-pos-release-set-publish.log"

# 03 负向 B：清单外的 ui 被误翻成 private:false → WARN
TMP=/tmp/m4-10-misflip
rm -rf "$TMP"; mkdir -p "$TMP/scripts"
cp -R "$REPO/scripts/release" "$TMP/scripts/release"
cp "$REPO/package.json" "$REPO/pnpm-workspace.yaml" "$REPO/LICENSE" "$REPO/NOTICE" "$TMP/" 2>/dev/null
mkdir -p "$TMP/.changeset"
cp "$REPO/.changeset/config.json" "$TMP/.changeset/config.json"
for p in tokens ui og-image; do
    mkdir -p "$TMP/packages/$p"
    ( cd "$REPO/packages/$p" && tar -cf - --exclude=node_modules . ) | ( cd "$TMP/packages/$p" && tar -xf - )
done
ln -s "$REPO/node_modules" "$TMP/node_modules"
python3 - "$TMP" <<'PY'
import json, sys
tmp = sys.argv[1]
for pkg in ("tokens", "og-image", "ui"):   # 三包全翻 → ui 属「清单外却非 private」
    p = f"{tmp}/packages/{pkg}/package.json"
    d = json.load(open(p)); d["private"] = False
    json.dump(d, open(p, "w"), indent=4, ensure_ascii=False); open(p, "a").write("\n")
PY
printf -- '---\n"@marxchou/dogeared-tokens": patch\n---\n\nmisflip probe\n' >"$TMP/.changeset/misflip.md"
( cd "$TMP" && node scripts/release/preflight.mjs --mode=publish ) >"$OUT/03-neg-ui-misflipped.log" 2>&1
echo "03 exit=$?" >>"$OUT/03-neg-ui-misflipped.log"

# 04 闸门自测
node scripts/release/verify-guards.mjs >"$OUT/04-verify-guards.log" 2>&1
echo "04 exit=$?" >>"$OUT/04-verify-guards.log"
node scripts/release/verify-workflow.mjs >"$OUT/05-verify-workflow.log" 2>&1
echo "05 exit=$?" >>"$OUT/05-verify-workflow.log"

# 06 站点门禁
corepack pnpm gates:all >"$OUT/06-gates-all.log" 2>&1
echo "06 exit=$?" >>"$OUT/06-gates-all.log"

echo "done -> $OUT"
