# Upstream issue draft — vercel/satori: bump `fflate` from `0.7.3` to `^0.7.5`

- 目标仓库：<https://github.com/vercel/satori>
- 状态：**草稿，未提交**（PO 已同意写草稿；真正开 issue 前确认措辞/是否由本账号提交）
- 关联：`GHSA-px8p-9vwx-vf98` / `CVE-2026-45820`；M4-9、M4-10、A+ 决策

## Title

`Bump fflate to ^0.7.5 (GHSA-px8p-9vwx-vf98)`

## Body

Hi — every `satori` release I checked (0.33.5 through 0.63.2) pins `fflate` to exactly `0.7.3`:

```json
"fflate": "0.7.3"
```

`fflate <= 0.7.4` is affected by GHSA-px8p-9vwx-vf98 / CVE-2026-45820: `unzipSync()` can loop
forever on a malformed ZIP64 archive (`compressed_size = 0xFFFFFFFF` without the `0x0001` extra
field). The fixed release is `0.7.5`.

I understand satori only calls `inflateSync()` (WOFF-1 table decompression), not `unzipSync()`, so
the vulnerable function is not on satori's own path. The practical problem is downstream:
`npm audit` reports a moderate on **every clean install** of any package that depends on satori,
even when the consumer never touches ZIP parsing. Projects that gate CI on
`npm audit --audit-level=moderate` have to add a global `fflate` override just to install satori.

Would you accept a patch-level bump?

```diff
-  "fflate": "0.7.3",
+  "fflate": "^0.7.5",
```

I verified the override locally on satori `0.63.2`: same fonts, same fixtures, rendered PNGs are
byte-identical with `fflate@0.7.5` and with the pinned `0.7.3`. `inflateSync` behavior is unchanged
in the patch release.

If a bump is not possible, documenting the reason in the README would also help downstream users
decide whether to add the override themselves.

Thanks!

## 提交前检查

- [ ] 确认 `vercel/satori` 尚无相同 issue（搜索 `fflate` / `GHSA-px8p-9vwx-vf98`）
- [ ] PO 确认由哪个 GitHub 账号提交
- [ ] issue 建好后把 URL 回填到 `docs/_reviews/M4-9/report.md` §8 与 `docs/release.md`
- [ ] 上游发版后：移除本仓 `pnpm-workspace.yaml` 的 `fflate` override，重跑 `pnpm audit` + `gates:all` + OG golden，再更新 README
