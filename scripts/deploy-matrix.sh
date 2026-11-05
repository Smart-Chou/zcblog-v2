#!/usr/bin/env bash
# M3-7 三部署矩阵：同一份源码 × 三套环境变量 × 三次构建 + 产物断言（**不部署**）
#
# 为什么要有这个脚本：三个目标跑的是同一条 `pnpm build:ci`，构建期唯一的差异是
# SITE_URL（canonical / og:url / sitemap 都从 `site` 派生）。三次构建各自断言产物，
# 才能证明「3/3」不是同一份产物被检查三遍。平台配置（_redirects / vercel.json /
# _headers）不在这里改，它们由各自的平台在部署时解释。
#
# 用法：
#   bash scripts/deploy-matrix.sh                  # 三个目标全跑，末尾打印 3/3 target PASS
#   bash scripts/deploy-matrix.sh --target vercel  # 只跑一个（CI matrix 每个 job 用这个）
#
# 环境变量：
#   GH_PAGES_HOST / CF_PAGES_HOST / VERCEL_HOST   规范域名（默认 example.* 占位）
#   MATRIX_OUT_DIR                                保留产物的目录（默认 $TMPDIR/zcblog-deploy-matrix）
#   NODE_OPTIONS                                  未设置时注入 --max-old-space-size=4096
#
# 退出码：0 = 所有目标构建 + 断言通过；1 = 任一目标失败（不影响其它目标继续跑完）

set -uo pipefail
cd "$(dirname "$0")/.."

TARGETS=(gh-pages cloudflare vercel)
ONLY=""
while [ $# -gt 0 ]; do
    case "$1" in
        --target)
            ONLY="${2:-}"
            shift 2
            ;;
        --target=*)
            ONLY="${1#*=}"
            shift
            ;;
        -h | --help)
            sed -n '2,22p' "$0"
            exit 0
            ;;
        *)
            echo "未知参数：$1（用法：bash scripts/deploy-matrix.sh [--target gh-pages|cloudflare|vercel]）" >&2
            exit 2
            ;;
    esac
done

if [ -n "$ONLY" ]; then
    case "$ONLY" in
        gh-pages | cloudflare | vercel) TARGETS=("$ONLY") ;;
        *)
            echo "未知目标：$ONLY（可选 gh-pages / cloudflare / vercel）" >&2
            exit 2
            ;;
    esac
fi

if command -v pnpm >/dev/null 2>&1; then
    PNPM=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
    PNPM=(corepack pnpm)
else
    echo "需要 pnpm（或 corepack）才能构建；两者都没找到" >&2
    exit 1
fi

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
OUT_ROOT="${MATRIX_OUT_DIR:-${TMPDIR:-/tmp}/zcblog-deploy-matrix}"

site_url_for() {
    case "$1" in
        gh-pages) printf 'https://%s' "${GH_PAGES_HOST:-example.github.io}" ;;
        cloudflare) printf 'https://%s' "${CF_PAGES_HOST:-example.pages.dev}" ;;
        vercel) printf 'https://%s' "${VERCEL_HOST:-example.vercel.app}" ;;
    esac
}

echo "部署矩阵：${#TARGETS[@]} 个目标 / NODE_OPTIONS=$NODE_OPTIONS / 产物保留于 $OUT_ROOT"

passed=()
failed=()
idx=0
for target in "${TARGETS[@]}"; do
    idx=$((idx + 1))
    site="$(site_url_for "$target")"
    started=$SECONDS
    echo ""
    echo "==== [$idx/${#TARGETS[@]}] target=$target site=$site ===="

    if ! SITE_URL="$site" "${PNPM[@]}" build:ci; then
        echo "✗ target=$target 构建失败（$((SECONDS - started))s）"
        failed+=("$target")
        continue
    fi

    if ! node scripts/gates/verify-deploy-artifacts.mjs dist --target "$target" --expect-site "$site"; then
        echo "✗ target=$target 产物断言失败"
        failed+=("$target")
        continue
    fi

    # 三个目标共用 dist，下一次构建会覆盖它 —— 断言证据必须留档
    rm -rf "${OUT_ROOT:?}/$target"
    mkdir -p "$OUT_ROOT/$target"
    cp -R dist "$OUT_ROOT/$target/dist" || {
        echo "✗ target=$target 产物留档失败"
        failed+=("$target")
        continue
    }
    echo "✓ target=$target 构建 + 断言通过（$((SECONDS - started))s），产物 → $OUT_ROOT/$target/dist"
    passed+=("$target")
done

echo ""
echo "==== 留档产物复检（对每个目标自己的 dist 再跑一次门禁） ===="
contains() {
    local needle="$1"
    shift
    local item
    for item in "$@"; do
        [ "$item" = "$needle" ] && return 0
    done
    return 1
}
for target in "${TARGETS[@]}"; do
    if ! contains "$target" ${passed[@]+"${passed[@]}"}; then
        echo "✗ target=$target 无留档产物（本目标此前已失败）"
        continue
    fi
    site="$(site_url_for "$target")"
    if node scripts/gates/verify-deploy-artifacts.mjs "$OUT_ROOT/$target/dist" --target "$target" --expect-site "$site" >/dev/null 2>&1; then
        echo "  PASS target=$target artifact=$OUT_ROOT/$target/dist"
    else
        echo "  FAIL target=$target artifact=$OUT_ROOT/$target/dist"
        failed+=("$target(recheck)")
    fi
done

total=${#TARGETS[@]}
okcount=${#passed[@]}
echo ""
if [ "$okcount" -eq "$total" ]; then
    echo "$okcount/$total target PASS"
    exit 0
fi
echo "FAIL：$okcount/$total target PASS（失败：${failed[*]-}）"
exit 1
