---
title: 家庭内网 DNS 分层：AdGuard Home 与上游解析的取舍
description: "内网 DNS 该不该接管全部解析？记录一次 AdGuard Home + 上游 DoH 的分层实践，以及设备分区策略带来的实际收益。"
summary: "AdGuard Home 拦截、上游 DoH 解析、设备分组与故障回退的组合方案，包含实测的解析延迟对比。"
pubDate: 2026-05-02
upDate: 2026-05-09
tags:
  - DNS
  - 家庭网络
  - 自托管
waline: false
draft: false
---

## 分层而不是全接

把全屋 DNS 一股脑指向一个容器，容器一挂全家断网。分层之后：

1. 路由器 DHCP 下发两个 DNS：AdGuard 与路由器自身
2. AdGuard 的上游走 DoH，绕开运营商劫持
3. 关键设备（NAS、监控）直连上游，不受拦截规则影响

## 实测延迟

| 解析路径 | 平均延迟 |
| --- | --- |
| 运营商 DNS | 12 ms |
| AdGuard 本地缓存 | 1 ms |
| AdGuard → DoH 上游 | 48 ms |

缓存命中率上来以后，体感差异基本消失。

## 回退

```bash
# 容器挂了也能上网：DHCP 的第二 DNS 就是兜底
docker restart adguardhome
```

拦截规则宁少勿多，误杀一个支付域名，排查成本远大于广告收益。
