#!/usr/bin/env node
// M4-4 · 版本 lockstep + tag 一致性校验（只读）
//
// 用法：
//   node scripts/release/verify-versions.mjs                  # 三包同版本 + 配置交叉验证
//   node scripts/release/verify-versions.mjs --tag v2.1.0      # 外加 tag 与版本一致（CI 用）
//   node scripts/release/verify-versions.mjs --json
//
// 退出码：0 = 通过（WARN 不拦），1 = lockstep 破 / tag 不一致 / 配置错。
import { checkVersions, makeCollector, report } from "./lib.mjs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const tagArg = (() => {
    const inline = argv.find((a) => a.startsWith("--tag="));
    if (inline) return inline.slice("--tag=".length);
    const i = argv.indexOf("--tag");
    return i === -1 ? null : (argv[i + 1] ?? null);
})();

const c = makeCollector();
const { versions } = checkVersions(c, { tag: tagArg });

const ok = report("版本 lockstep / tag 一致性", c.results, {
    json,
    extra: { version: versions[0] ?? null, tag: tagArg },
});
process.exit(ok ? 0 : 1);
