// 共享工具：给 scripts/release/*.mjs 用，纯 Node stdlib（不引第三方依赖）。
// 边界：只读仓库里的 package.json / 文件清单，绝不改包内容。
import {
    chmodSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// 三包 lockstep 的唯一事实源：config 里 fixed 组必须与这份清单一致（preflight 会交叉验证）。
export const PACKAGE_DIRS = ["packages/tokens", "packages/ui", "packages/og-image"];

// release workflow 真正执行发布的那条命令。scripts/release/verify-workflow.mjs 会断言
// release.yml 里出现这同一个字面量——保证「本地 dry-run 验过的命令」和「CI 里跑的命令」是同一条。
export const PUBLISH_COMMAND = "changeset publish --from-pack-dir";

export const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

export function readJson(p) {
    return JSON.parse(readFileSync(p, "utf8"));
}

export function loadPackages() {
    return PACKAGE_DIRS.map((dir) => {
        const pkgPath = path.join(REPO_ROOT, dir, "package.json");
        const pkg = readJson(pkgPath);
        return {
            dir,
            pkgPath,
            pkg,
            name: pkg.name,
            version: pkg.version,
            private: pkg.private === true,
        };
    });
}

export function runSync(cmd, args, { cwd = REPO_ROOT, env = {}, allowFail = false } = {}) {
    const r = spawnSync(cmd, args, {
        cwd,
        encoding: "utf8",
        env: { ...process.env, ...env },
        maxBuffer: 32 * 1024 * 1024,
    });
    const res = {
        code: r.status === null ? -1 : r.status,
        out: r.stdout ?? "",
        err: r.stderr ?? "",
        signal: r.signal ?? null,
    };
    res.combined = `${res.out}${res.err}`;
    if (r.error) {
        res.code = -1;
        res.err += `\n${r.error.message}`;
        res.combined = `${res.out}${res.err}`;
    }
    if (res.code !== 0 && !allowFail) {
        const e = new Error(
            `命令失败 (exit ${res.code}): ${cmd} ${args.join(" ")}\n${res.combined.slice(-2000)}`,
        );
        e.result = res;
        throw e;
    }
    return res;
}

// ---- 结果收集 ----
export function makeCollector() {
    const results = [];
    const push = (level, id, msg, detail) => {
        results.push({ level, id, msg, ...(detail === undefined ? {} : { detail }) });
        return level;
    };
    return {
        results,
        pass: (id, msg, detail) => push("PASS", id, msg, detail),
        info: (id, msg, detail) => push("INFO", id, msg, detail),
        warn: (id, msg, detail) => push("WARN", id, msg, detail),
        fail: (id, msg, detail) => push("FAIL", id, msg, detail),
        skip: (id, msg, detail) => push("SKIP", id, msg, detail),
    };
}

export function report(title, results, { json = false, extra = {} } = {}) {
    const counts = results.reduce((a, r) => ((a[r.level] = (a[r.level] ?? 0) + 1), a), {
        PASS: 0,
        FAIL: 0,
        WARN: 0,
        INFO: 0,
        SKIP: 0,
    });
    const ok = counts.FAIL === 0;
    if (!json) {
        console.log(`\n== ${title} ==`);
        for (const r of results) {
            console.log(`[${r.level}] ${r.id.padEnd(10)} ${r.msg}`);
            if (r.detail !== undefined && r.detail !== null) {
                const text = typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail);
                for (const line of text.split("\n").slice(0, 14)) console.log(`           ${line}`);
            }
        }
    }
    const summary = { title, ok, counts, ...extra };
    console.log(`\nRELEASE_SUMMARY ${JSON.stringify(summary)}`);
    return ok;
}

export function exists(p) {
    return existsSync(p);
}

export function fileSize(p) {
    return existsSync(p) ? statSync(p).size : -1;
}

export function parseTag(tag) {
    const m = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(String(tag).trim());
    return m ? m[1] : null;
}

// ---- 版本 lockstep / tag 一致性（verify-versions 与 preflight 共用同一套判据）----
export function checkVersions(c, { packages = loadPackages(), tag = null } = {}) {
    const versions = [...new Set(packages.map((p) => p.version))];

    if (versions.length === 1) c.pass("V1", `三包 lockstep 同版本 ${versions[0]}`);
    else
        c.fail(
            "V1",
            "三包版本不一致（lockstep 破了）",
            packages.map((p) => `${p.name}@${p.version}`).join("\n"),
        );

    for (const p of packages) {
        if (SEMVER.test(p.version)) c.pass(`V2:${p.name}`, `${p.version} 是合法 semver`);
        else c.fail(`V2:${p.name}`, `${p.version} 不是合法 semver`);
        if (/^@marxchou\/dogeared-/.test(p.name))
            c.pass(`V3:${p.dir}`, `名称 ${p.name} 在预期 scope`);
        else c.fail(`V3:${p.dir}`, `名称 ${p.name} 不在 @marxchou/dogeared-* scope 内`);
    }

    try {
        const cfg = readJson(path.join(REPO_ROOT, ".changeset", "config.json"));
        const groups = Array.isArray(cfg.fixed) ? cfg.fixed : [];
        const names = packages.map((p) => p.name);
        const hit = groups.find((g) => names.every((n) => g.includes(n)));
        if (hit) c.pass("V4", ".changeset/config.json fixed 组覆盖三包", hit.join(", "));
        else c.fail("V4", "fixed 组未覆盖三包（版本会各自漂移）", JSON.stringify(groups));
        if (cfg.privatePackages?.version !== true)
            c.warn("V4b", "privatePackages.version 非 true：private 包不会参与 version/lockstep");
    } catch (e) {
        c.fail("V4", `.changeset/config.json 读取失败：${e.message}`);
    }

    const rootPkg = readJson(path.join(REPO_ROOT, "package.json"));
    if (rootPkg.version === versions[0])
        c.pass("V5", `根 package.json（站点）版本同为 ${rootPkg.version}`);
    else
        c.warn(
            "V5",
            `站点版本 ${rootPkg.version} ≠ 三包版本 ${versions[0]}：v* tag 语义是「三包发布」，站点版本独立演进`,
        );

    if (!tag) {
        c.skip("V6", "未提供 tag，跳过 tag=version 一致性检查");
    } else {
        const fromTag = parseTag(tag);
        if (!fromTag) c.fail("V6", `tag「${tag}」不符合 v<semver> 形式`);
        else if (fromTag !== versions[0])
            c.fail("V6", `tag ${tag} 与三包版本 ${versions[0]} 不一致`, `期望 v${versions[0]}`);
        else c.pass("V6", `tag ${tag} 与三包版本一致`);
    }

    return { versions, rootPkg };
}

// ---- npm pack 清单（不写 registry，只让 npm 报 manifest）----
export function pnpmEnv() {
    const probe = spawnSync("pnpm", ["-v"], { encoding: "utf8" });
    if (probe.status === 0) return { env: {}, cleanup: () => {} };
    // 本机没装 pnpm 时用 corepack 垫一层 shim（只写临时目录，不动系统）
    const dir = path.join(tmpdir(), "dogeared-release-bin");
    mkdirSync(dir, { recursive: true });
    const shim = path.join(dir, "pnpm");
    writeFileSync(shim, '#!/bin/sh\nexec corepack pnpm "$@"\n');
    chmodSync(shim, 0o755);
    return {
        env: { PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}` },
        cleanup: () => rmSync(shim, { force: true }),
    };
}

export function npmPackDryRun(pkgDir) {
    const r = runSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
        cwd: path.join(REPO_ROOT, pkgDir),
        allowFail: true,
    });
    // npm 11 在 --json 时会混入 warn（Unknown project config），从第一个 [ 开始截取
    const start = r.out.indexOf("[");
    if (start === -1) return { ok: false, error: r.combined.slice(0, 1200), result: r };
    try {
        const arr = JSON.parse(r.out.slice(start));
        const meta = arr[0];
        return { ok: r.code === 0, meta, result: r };
    } catch (e) {
        return {
            ok: false,
            error: `JSON 解析失败：${e.message}`,
            raw: r.out.slice(0, 1200),
            result: r,
        };
    }
}
