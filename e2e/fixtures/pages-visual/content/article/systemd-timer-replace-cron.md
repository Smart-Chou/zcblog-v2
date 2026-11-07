---
title: 用 systemd timer 替掉一半 cron 任务
description: "cron 没错，但它不告诉你上次跑成没成。把定时任务迁到 systemd timer 之后，日志、失败重试和依赖关系都变成了原生能力。"
summary: "systemd timer 的迁移步骤、OnCalendar 语法、失败告警与持久化补跑，附一份常见 crontab 对照表。"
pubDate: 2026-04-11
upDate: 2026-04-11
tags:
  - systemd
  - Linux
  - 运维
waline: false
draft: false
---

## 迁移的最小单位

一条 crontab 对应一对 service + timer。service 只负责跑命令，timer 只负责什么时候跑。

```ini
# /etc/systemd/system/backup.service
[Unit]
Description=Nightly backup

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
```

```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Run backup at 03:20

[Timer]
OnCalendar=*-*-* 03:20:00
Persistent=true
RandomizedDelaySec=120

[Install]
WantedBy=timers.target
```

## 对比

| 能力 | cron | systemd timer |
| --- | --- | --- |
| 结构化日志 | 自己重定向 | journalctl 原生 |
| 错过补跑 | 无 | `Persistent=true` |
| 依赖顺序 | 靠 sleep | `After=` |
| 失败可见 | 无 | `systemctl --failed` |

## 检查

`systemctl list-timers --all` 一眼能看出下次触发时间和上次结果，这是 cron 给不了的。
