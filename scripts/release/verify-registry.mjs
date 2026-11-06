#!/usr/bin/env node
// M5-5 · 发布后 registry 复查（只读；不写 registry、不需要任何 npm 凭据）
//
// 用法：
//   node scripts/release/verify-registry.mjs                      # 立刻查（T+0 基线）
//   node scripts/release/verify-registry.mjs --min-age-hours=24    # 24h 复查：未到点 exit 3
//   node scripts/release/verify-registry.mjs --json                # 只打 RELEASE_SUMMARY
//   node scripts/release/verify-registry.mjs --out=registry.json   # 额外落盘结果
//
// 判什么：版本、dist-tag 是否流浪、tarball 可达性与 integrity 实算、provenance、
//         maintainer / deprecated、发布清单外的包是否仍是 404、0.0.0-stage 占位状态。
//
// 退出码：0 = 通过（WARN/INFO 不拦）；1 = drift；3 = 距最新发布不足 --min-age-hours（不是失败）
//
// 这是 M5-5 的 24h 复查命令：registry 上的一切都是事实源，本地不缓存、不猜。
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { loadPackages, makeCollector, PUBLISH_DIRS, report } from "./lib.mjs";

const REGISTRY = "https://registry.npmjs.org";
const EXPECTED_PROVENANCE = "https://slsa.dev/provenance/v1";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback = null) => {
    const inline = argv.find((a) => a.startsWith(`--${name}=`));
    if (inline) return inline.slice(name.length + 3);
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? fallback : (argv[i + 1] ?? fallback);
};

const json = flag("json");
const outPath = opt("out");
const minAgeHours = Number(opt("min-age-hours", "0"));

const c = makeCollector();
const facts = { packages: {}, nonPublish: {}, placeholder: {} };

// placeholder 版本名：首发前为了占住包名发的一次性版本（M4 阶段遗留）
const PLACEHOLDER = "0.0.0-stage";
const PLACEHOLDER_UNPUBLISH_WINDOW_H = 72;

const hoursBetween = (fromIso, toMs = Date.now()) => (toMs - Date.parse(fromIso)) / 3_600_000;

const fmtHours = (h) => (h >= 1 ? `${h.toFixed(1)}h` : `${(h * 60).toFixed(0)}min`);

async function getJson(url) {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const text = await res.text();
    let body = null;
    try {
        body = JSON.parse(text);
    } catch {
        body = null;
    }
    return { status: res.status, body, text };
}

async function sha512OfTarball(url) {
    const res = await fetch(url);
    if (!res.ok) return { status: res.status, integrity: null, bytes: 0 };
    const buf = Buffer.from(await res.arrayBuffer());
    return {
        status: res.status,
        integrity: `sha512-${createHash("sha512").update(buf).digest("base64")}`,
        bytes: buf.length,
    };
}

// ---- R1..R8：发布清单内每个包 ----
const packages = loadPackages();
const publishNames = new Set(
    packages.filter((p) => PUBLISH_DIRS.includes(p.dir)).map((p) => p.name),
);

const publishTimes = [];

for (const p of packages.filter((x) => publishNames.has(x.name))) {
    const meta = await getJson(`${REGISTRY}/${encodeURIComponent(p.name).replace("%40", "@")}`);
    const key = `${p.name}@${p.version}`;
    const f = (facts.packages[p.name] = {
        localVersion: p.version,
        httpStatus: meta.status,
        latest: null,
        versions: [],
        publishedAt: null,
        tarball: null,
        integrityOk: null,
        provenance: null,
        maintainers: [],
    });

    if (meta.status !== 200 || !meta.body) {
        c.fail("R1", `${p.name} registry 不可达（HTTP ${meta.status}）`);
        continue;
    }
    c.pass("R1", `${p.name} registry 可达（HTTP 200）`);

    const latest = meta.body["dist-tags"]?.latest ?? null;
    f.latest = latest;
    f.versions = Object.keys(meta.body.versions ?? {});
    f.publishedAt = meta.body.time?.[latest ?? ""] ?? null;
    f.maintainers = (meta.body.maintainers ?? []).map((m) => m.name ?? m);

    // R2 版本一致：registry latest == 仓库 package.json 版本
    if (latest === p.version)
        c.pass("R2", `${p.name} latest = ${latest}（与仓库 ${p.dir}/package.json 一致）`);
    else
        c.fail(
            "R2",
            `${p.name} latest=${latest} ≠ 仓库版本 ${p.version}`,
            "常见原因：本地产出未发布、或发布了但没回写 package.json / 没提交版本提交",
        );

    // R3 dist-tag 不流浪：只允许 latest
    const tags = Object.keys(meta.body["dist-tags"] ?? {});
    const strayTags = tags.filter((t) => t !== "latest");
    if (strayTags.length === 0)
        c.pass("R3", `${p.name} dist-tags 只有 latest（无 next/beta/stage 流浪 tag）`);
    else
        c.warn(
            "R3",
            `${p.name} 有额外 dist-tag`,
            strayTags.map((t) => `${t} -> ${meta.body["dist-tags"][t]}`).join("\n") +
                "\n（非 blocker；确认是否有人手工 npm dist-tag add）",
        );

    const version = meta.body.versions?.[latest];
    if (!version) {
        c.fail("R4", `${p.name}@${latest} 的版本元数据缺失`);
        continue;
    }

    // R4 tarball 可达 + R5 integrity 实算
    const tar = version.dist?.tarball ?? null;
    f.tarball = tar;
    if (!tar) {
        c.fail("R4", `${p.name}@${latest} 没有 dist.tarball`);
    } else {
        const dl = await sha512OfTarball(tar);
        if (dl.status === 200 && dl.bytes > 0) {
            c.pass("R4", `${p.name}@${latest} tarball 可下载（HTTP 200, ${dl.bytes} B）`);
            const declared = version.dist?.integrity ?? null;
            f.integrityOk = declared === dl.integrity;
            if (f.integrityOk)
                c.pass("R5", `${p.name}@${latest} integrity 实算一致（${declared.slice(0, 24)}…）`);
            else
                c.fail(
                    "R5",
                    `${p.name}@${latest} integrity 不一致`,
                    `声明 ${declared}\n实算 ${dl.integrity}`,
                );
        } else {
            c.fail("R4", `${p.name}@${latest} tarball 不可下载（HTTP ${dl.status}）`, tar);
        }
    }

    // R6 provenance（SLSA v1）+ attestation 端点可达
    const att = version.dist?.attestations;
    f.provenance = att?.provenance?.predicateType ?? null;
    if (!att?.url) {
        c.fail(
            "R6",
            `${p.name}@${latest} 没有 attestations（provenance 缺失）`,
            "重发该版本或检查 publish 是否带 provenance",
        );
    } else {
        const bundle = await getJson(att.url);
        const types = (bundle.body?.attestations ?? []).map((a) => a.predicateType);
        if (
            bundle.status === 200 &&
            f.provenance === EXPECTED_PROVENANCE &&
            types.includes(EXPECTED_PROVENANCE)
        ) {
            c.pass("R6", `${p.name}@${latest} provenance = SLSA v1（attestation bundle 可达）`);
        } else {
            c.fail(
                "R6",
                `${p.name}@${latest} provenance 不符`,
                `声明 ${f.provenance}\nattestation HTTP ${bundle.status}\npredicateTypes ${JSON.stringify(types)}`,
            );
        }
    }

    // R7 归属：maintainer + 未 deprecated
    const maint = f.maintainers.join(",");
    if (f.maintainers.length > 0 && !version.deprecated)
        c.pass("R7", `${p.name}@${latest} maintainers = ${maint}，未 deprecated`);
    else
        c.warn(
            "R7",
            `${p.name}@${latest} maintainer 为空或版本被 deprecated`,
            `maintainers=${maint} deprecated=${version.deprecated ?? "no"}`,
        );

    // R8 距发布时长（24h 复查的时钟）
    if (f.publishedAt) {
        const h = hoursBetween(f.publishedAt);
        publishTimes.push({ name: p.name, version: latest, at: f.publishedAt, hours: h });
        c.pass("R8", `${p.name}@${latest} 发布于 ${f.publishedAt}（距今 ${fmtHours(h)}）`);
    } else {
        c.warn("R8", `${p.name}@${latest} registry 上查不到发布时间`);
    }
}

// ---- R9：发布清单外的包必须仍是 404（ui 按 D-0120 不发布）----
for (const p of packages.filter((x) => !publishNames.has(x.name))) {
    const probe = await getJson(`${REGISTRY}/${encodeURIComponent(p.name).replace("%40", "@")}`);
    facts.nonPublish[p.name] = { httpStatus: probe.status, private: p.private };
    if (probe.status === 404) {
        c.pass("R9", `${p.name} registry 404（发布清单外，符合预期）`);
    } else if (probe.status === 200) {
        const l = probe.body?.["dist-tags"]?.latest ?? "?";
        c.warn(
            "R9",
            `${p.name} 已经在 registry 上（latest=${l}）`,
            "发布清单外的包被发布了：要么更新 PUBLISH_DIRS 与文档，要么按 §6 回滚",
        );
    } else {
        c.warn("R9", `${p.name} 探测返回 HTTP ${probe.status}（非 200/404）`);
    }
}

// ---- R10：0.0.0-stage 占位只读核查（本卡不删；unpublish 需 PO 批准）----
for (const name of publishNames) {
    const meta = await getJson(`${REGISTRY}/${encodeURIComponent(name).replace("%40", "@")}`);
    if (meta.status !== 200) continue;
    const exists = Boolean(meta.body.versions?.[PLACEHOLDER]);
    const at = meta.body.time?.[PLACEHOLDER] ?? null;
    const tagsOnIt = Object.entries(meta.body["dist-tags"] ?? {})
        .filter(([, v]) => v === PLACEHOLDER)
        .map(([t]) => t);
    const ageH = at ? hoursBetween(at) : null;
    facts.placeholder[name] = {
        exists,
        publishedAt: at,
        ageHours: ageH,
        unpublishWindowHours: PLACEHOLDER_UNPUBLISH_WINDOW_H,
        unpublishableSelfServe: ageH !== null && ageH <= PLACEHOLDER_UNPUBLISH_WINDOW_H,
        distTagsPointingToIt: tagsOnIt,
        unpackedSize: meta.body.versions?.[PLACEHOLDER]?.dist?.unpackedSize ?? null,
        fileCount: meta.body.versions?.[PLACEHOLDER]?.dist?.fileCount ?? null,
        dependents: null,
    };
    if (!exists) {
        c.pass("R10", `${name} 没有 ${PLACEHOLDER} 占位`);
    } else if (tagsOnIt.length > 0) {
        c.fail("R10", `${name} 的 ${PLACEHOLDER} 被 dist-tag 指向`, tagsOnIt.join(", "));
    } else {
        c.info(
            "R10",
            `${name} 仍挂着 ${PLACEHOLDER} 占位（${fmtHours(ageH ?? 0)} 前，无 tag 指向）`,
            `unpublish 窗口：${PLACEHOLDER_UNPUBLISH_WINDOW_H}h（发布后 ${fmtHours(ageH ?? 0)} → ${
                facts.placeholder[name].unpublishableSelfServe
                    ? "仍可自助删除"
                    : "已超窗口，只能 deprecate / 联系 npm support"
            }）\n删除需 PO 单独批准（M5-5 只核查，不执行）`,
        );
    }
}

// ---- R11：24h 时钟 ----
const newest = publishTimes.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
let tooEarly = false;
if (!newest) {
    c.warn("R11", "没有任何可用发布时间，无法判断 24h 窗口");
} else if (minAgeHours > 0) {
    if (newest.hours < minAgeHours) {
        tooEarly = true;
        c.info(
            "R11",
            `距最近一次发布只过了 ${fmtHours(newest.hours)} < ${minAgeHours}h，本轮不是 24h 复查`,
            `${newest.name}@${newest.version} 发布于 ${newest.at}\n24h 到点：${new Date(
                Date.parse(newest.at) + minAgeHours * 3_600_000,
            ).toISOString()}`,
        );
    } else {
        c.pass(
            "R11",
            `距最近一次发布已 ${fmtHours(newest.hours)} ≥ ${minAgeHours}h（24h 窗口已满足）`,
        );
    }
}

const output = {
    checkedAt: new Date().toISOString(),
    minAgeHours,
    newestPublish: newest,
    facts,
    results: c.results,
};
if (outPath) {
    try {
        writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
        if (!json) console.log(`\n结果已落盘：${outPath}`);
    } catch (e) {
        console.error(`写 ${outPath} 失败：${e.message}`);
    }
}

const ok = report("发布后 registry 复查（只读）", c.results, {
    json,
    extra: {
        checkedAt: output.checkedAt,
        minAgeHours,
        newestPublish: newest
            ? `${newest.name}@${newest.version} @ ${newest.at} (${fmtHours(newest.hours)})`
            : null,
        placeholder: Object.fromEntries(
            Object.entries(facts.placeholder).map(([k, v]) => [
                k,
                v.exists
                    ? v.unpublishableSelfServe
                        ? "present/window-open"
                        : "present/window-closed"
                    : "absent",
            ]),
        ),
    },
});

if (tooEarly) process.exit(3);
process.exit(ok ? 0 : 1);
