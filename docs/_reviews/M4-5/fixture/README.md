# M4-5 复现夹具

这是第三方安装验收（`docs/_reviews/M4-5/report.md`）用到的**最小 Astro 项目**，原样拷贝自
`~/.hermes/profiles/blog-qa/cache/scratch/m4-5/consumer-run1/`。不是本仓的一部分，不会被站点构建读取。

## 复现

```bash
# 1. 打包（在本仓 HEAD 上）
for p in tokens ui og-image; do ( cd packages/$p && npm pack --pack-destination /tmp/dogeared-pack ); done

# 2. 空目录起项目
mkdir -p /tmp/m45-consumer && cd /tmp/m45-consumer && npm init -y
cp -R <本夹具>/src <本夹具>/astro.config.mjs .

# 3. 装依赖（把 package.json 里的 file: 路径换成上一步的真实 tgz 路径）
npm install astro@^7.3.6 /tmp/dogeared-pack/*.tgz
# package.json 的 "type" 必须是 "module"

# 4. 构建 + 裸 Node 入口探针
npm run build            # dist/index.html + dist/_astro/*.css + dist/og/hello.png
node probe-resolve.mjs
```

`package.json` 里的 `file:../../…/tmp/dogeared-pack/*.tgz` 是 npm 对 tarball 安装的记录方式，
换了目录会失效，照上面第 3 步重装即可。
