# M5-2 · 外部消费者验收（2026-11-06）

## 结论

**PASS**。从公开仓库干净 clone，使用一个独立的 consumer overlay 装配、安装、构建并部署成功；
没有发现阻塞问题。唯一产品缺口是根 README 仍在讲旧站点，已在本卡修正。

## 环境

| 项 | 值 |
|---|---|
| 来源 | `https://github.com/Smart-Chou/zcblog-v2.git` |
| clone 方式 | `git clone --depth 1` |
| HEAD | `1db5693` |
| 工作目录 | `~/.hermes/cache/scratch/m5-2-clean-*/repo` |
| overlay | 复制 `apps/demo` 到仓库外，改成 `M5-2 Consumer` / 独立域名 |
| 预览 | <https://m5-2-consumer.zcblog-v2.pages.dev>（CF Pages 分支 `m5-2-consumer`） |

## 实际命令与结果

```text
node scripts/create-site.mjs --overlay ../consumer-site --out .../out --build --install
→ RESULT PASS  html=118 overlay=../consumer-site build=24.5s
  layers=theme:489/baseline:28/shim:13/overlay:9

node scripts/gates/verify-deploy-artifacts.mjs .../out/dist \
  --target cloudflare --expect-site https://m5-2-consumer.zcblog-v2.pages.dev
→ RESULT PASS target=cloudflare site=... stubs=3/3 fails=0
```

线上抽查：

| URL | HTTP | 结果 |
|---|---:|---|
| `/` | 200 | `<title>… - M5-2 Consumer</title>` |
| `/en/` | 200 | 英文标题正常 |
| `/projects/` | 200 | overlay 项目数据生效 |
| `/blog/1/` | 200 | 列表正常 |
| `/article/hello-world/` | 200 | baseline 示例文章正常 |
| `/design/` | 200 | 文档站正常 |

- canonical：`https://m5-2-consumer.zcblog-v2.pages.dev/`
- 带 hash 的 CSS：`cache-control: public, max-age=31536000, immutable`
- 产物身份串 `MIFSH|mcc.im|MarxChou`：**0**
- 部署：`0450acb4.zcblog-v2.pages.dev` → alias `m5-2-consumer.zcblog-v2.pages.dev`

## 发现

1. **公开仓不含作者文章内容**：干净 clone 的 `src/content/article` 不存在，构建使用
   `theme-template` 的 `hello-world` / `getting-started` 示例；没有把作者文章带给消费者。
2. **根 README 仍是旧站点叙事**：开头是 `Marx's Blog`，CSS 还写 Tailwind，消费者看不到
   Dogeared 的接入方式。本卡已把产品入口、`create-site` 命令和文档索引放到 README 顶部。
3. **`create-site --install` 在干净 clone 可用**：pnpm 正常解析，没有依赖本地未提交文件。
4. **overlay 身份必须自己改**：复制 `apps/demo` 后仍会带 `Dogeared Demo` 文案；这是示例
   overlay 的预期行为，README 已明确要求消费者复制并替换配置。

## 边界

- 未切换生产站，`marxchou.com` 与 `Smart-Chou/zcblog` 均未动。
- 未修改 `demo` alias；本卡使用独立分支 `m5-2-consumer`。
- 未发布 npm；这是主题源码/装配器的消费者验收，不是 registry 验收。

## 复现

```bash
git clone --depth 1 https://github.com/Smart-Chou/zcblog-v2.git /tmp/dogeared-consumer
cd /tmp/dogeared-consumer
pnpm install --frozen-lockfile
cp -R apps/demo ../consumer-site
# 改 ../consumer-site/src/config/site.ts 的 title/url/author
SITE_URL="https://your-preview.example.com" \
  node scripts/create-site.mjs --overlay ../consumer-site --out ../consumer-out --build --install
node scripts/gates/verify-deploy-artifacts.mjs ../consumer-out/dist \
  --target cloudflare --expect-site "https://your-preview.example.com"
```
