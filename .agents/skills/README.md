# zcblog-v2 · AI 任务技能（`.agents/skills/`）

本目录是按任务触发的技能包（`SKILL.md` + YAML frontmatter），支持 Agent Skills 标准的编码助手在 clone 本仓后会自动发现。**这里不是第二份规范**：正文只回答「做这类任务该读什么、守哪几条红线、跑哪些命令」，判据一律委托给仓内 `rules/`、`docs/` 与根 `AGENTS.md`。

## 三层分工

1. `AGENTS.md` — 总纲：必遵规则、必读文档清单、验证命令。
2. `rules/*.md` + `docs/*.md` — 硬性规则与契约正文（权威，冲突时以此为准）。
3. `.agents/skills/*` — 任务化入口，把「一次完整任务」收敛成有序步骤。

## 技能清单

| 技能 | 用在什么时候 |
|---|---|
| [zcblog-dev-workflow](zcblog-dev-workflow/SKILL.md) | 日常开发：改代码 → 跑门禁 → 提交；缓存清理与假红排查 |
| [zcblog-new-feature](zcblog-new-feature/SKILL.md) | 加功能 / 页面 / 组件：决策查重 → 读 DESIGN → 定卡粒度 → 门禁 → 视觉基线 → 决策记录 |
| [zcblog-content-ops](zcblog-content-ops/SKILL.md) | 内容运营：改文章走内容仓、frontmatter 契约、normalize、A2b、数据新鲜度 |

## 维护方式

- **命名**：目录名 = frontmatter `name`，统一 `zcblog-` 前缀，避免多仓库场景下与其他项目的技能重名。
- **语言**：`name` / `description` 用英文（description 参与触发匹配），正文中文。
- **命令必须真实存在**：写进正文前先在仓库根核对，例如 `python3 -c "import json;print(list(json.load(open('package.json'))['scripts']))"`。跑过的门禁把实测输出（通过数、用例数）写进正文，别写「应该能过」。
- **路径必须可解析**：仓内路径按仓库根写；仓外治理仓路径只出现在标明「仅本机有效」的小节里。
- **提交前先在 `site.manifest.json` 归类**：`.agents/**` 目前不在 T/O/X 任何一类里，而 `verify-overlay` 的 O1 只统计 `git ls-files`，未归类即 `unclassified=N` 红（D-0144 的同一类坑）。开发者向指令不进产物，建议归 **X**（与 `.claude/**` 同侧）；改清单要留一条 D-NNNN 记录。
- **改了门禁或脚本就同步这里**：`AGENTS.md` 的 Required documents 指向本页，读者会照此执行；文档漂移比没有文档更贵。
