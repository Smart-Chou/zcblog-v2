#!/bin/bash
# M4-8 只读探针：在 /tmp 副本里模拟「tokens+og-image 翻 private:false、ui 保持 private」
# 之后跑 preflight --mode=publish，看发布闸门是否会因为 ui 仍然 private 而硬失败。
# 不碰真仓库（真仓只读拷贝）。
set -euo pipefail
REPO=/Users/chowcong/Documents/WebSiteCode/zcblog-v2
TMP=/tmp/m4-8-preflight
rm -rf "$TMP"
mkdir -p "$TMP/scripts/release" "$TMP/.changeset" "$TMP/packages"
cp "$REPO"/scripts/release/*.mjs "$TMP/scripts/release/"
cp "$REPO"/package.json "$TMP/package.json"
cp "$REPO"/LICENSE "$REPO"/NOTICE "$TMP/" 2>/dev/null || true
cp "$REPO"/.changeset/config.json "$TMP/.changeset/config.json"
for p in tokens ui og-image; do
    mkdir -p "$TMP/packages/$p"
    cp "$REPO/packages/$p/package.json" "$TMP/packages/$p/package.json"
    cp "$REPO/packages/$p/LICENSE" "$TMP/packages/$p/LICENSE" 2>/dev/null || true
    cp "$REPO/packages/$p/NOTICE" "$TMP/packages/$p/NOTICE" 2>/dev/null || true
    cp "$REPO/packages/$p/README.md" "$TMP/packages/$p/README.md" 2>/dev/null || true
done

# 在副本里翻转 tokens 与 og-image 的 private（ui 保持 true —— 这正是本卡决策后的状态）
python3 - "$TMP" <<'PY'
import json, sys
tmp = sys.argv[1]
for pkg in ("tokens", "og-image"):
    p = f"{tmp}/packages/{pkg}/package.json"
    with open(p) as fh:
        data = json.load(fh)
    data.pop("private", None)
    with open(p, "w") as fh:
        json.dump(data, fh, indent=4, ensure_ascii=False)
        fh.write("\n")
print("flipped private=false:", "tokens", "og-image", "| kept private:true: ui")
PY

cd "$TMP"
echo "=== preflight --mode=publish（副本，tokens/og-image 已翻转、ui 仍 private）==="
node scripts/release/preflight.mjs --mode=publish 2>&1 | grep -E "P1|P5|RESULT|FAIL|PASS" | head -40 || true
