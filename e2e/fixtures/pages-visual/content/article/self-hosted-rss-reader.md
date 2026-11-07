---
title: 自托管 RSS 阅读器：把信息流收回自己手里
description: "用 FreshRSS + Docker 搭一套完全自控的 RSS 阅读器，配合 Fever API 在手机上同步，顺手解决订阅源过期与重复推荐的问题。"
summary: "FreshRSS 部署、反向代理、Fever API 与手机客户端配置的完整流程，附订阅源维护与 OPML 导入导出实践。"
pubDate: 2026-06-18
upDate: 2026-06-18
tags:
  - RSS
  - 自托管
  - Docker
waline: false
draft: false
---

## 为什么又回到 RSS

算法推荐把「读什么」交了出去。RSS 不聪明，但可控：订阅什么就看到什么，没有插队。

## 部署

```yaml
services:
  freshrss:
    image: freshrss/freshrss:latest
    ports:
      - "8080:80"
    volumes:
      - ./data:/var/www/FreshRSS/data
    environment:
      CRON_MIN: "*/30"
    restart: unless-stopped
```

## 几个坑

- Fever API 的路径是 `/api/fever.php`，少个斜杠就是 404
- 反向代理要放行 `Authorization` 头，否则手机端一直「密码错误」
- 订阅源 90 天不动就该删，沉默的源比没有更耗时间

> 阅读器的价值不在功能多，而在你每天真的会打开它。

## 维护节奏

| 周期 | 动作 |
| --- | --- |
| 每周 | 清理 0 阅读订阅源 |
| 每月 | 导出 OPML 备份 |
| 每季 | 检查抓取失败列表 |
