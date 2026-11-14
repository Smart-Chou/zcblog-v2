#!/usr/bin/env python3
"""A2b 判据：frontmatter 里的每个键，内容契约是否认识。

A2（check-legacy-keys.py）答的是「有没有**已知**的旧字段」——它手里是一份手抄的
LEGACY 清单，所以对「从没见过的新字段」天生失明。2026-11-10 起的定时部署连续失败
就是这么漏过去的：内容仓开始写 `series` / `seriesOrder`，生产 schema 是 `.strict()`，
astro 抛 `InvalidContentEntryDataError: Unrecognized keys`，A2 的清单里没有这两个词，
CI 一路绿灯，站点内容冻结（D-0166）。

所以这个门禁反过来算：**先算出现在认识的键，再看内容里有没有不认识的**。
认识的键 = content.config.ts 里 article schema 声明的键
         ∪ normalize-frontmatter.mjs 会吃掉的键
（后者在构建前就把六个 v1 布尔开关删了，那几个键根本进不了 astro，不该算未知。）

三条实现约束，都是实测踩出来的：

  1. 两份清单都必须**从源文件解析**，不能抄。抄的那份一定会忘更新，
     就变成下一颗雷 —— A2 的 LEGACY 就是这么过期的。
  2. 键不能靠「数花括号」或「找首个 z.object(」来认。实测这份 config：
     - 不按缩进过滤，外层对象会连带捞出 `image` 内层的 url/alt 和 regex 选项里的
       message，22 个键里有 4 个是假的（url、alt、message×2）；
     - `z.object(` 的字面量在 prettier 换行（`z` 换行 `.object(`）后全文只剩
       `pages` 那一处，落到它上面只能得到 title/description 两个键。
  3. 必须先剥 JS 注释再找键：块注释里被注释掉的字段行（每行不带 `*` 前缀时就是这样）
     长得和真键一模一样，不剥就等于门禁自己把放行名单放宽一格。
     实测这份 config 现在每行都有 `* ` 前缀，剥不剥都是 18 个键 —— 那是运气，不是保证。
     （「注释尾巴的 `/` 会顶在键前导致漏键」这个说法只对「按逗号切键」的写法成立，
     对本文按行首匹配的写法不成立：实测不剥注释也是 18 个键。）

提取算法：剥注释 → 空掉字符串内容（防止字符串里的 `{` 破坏配平）→
从 `export const article` 的 schema 里定位**外层** z.object 的开括号 →
花括号配平取出对象体 → 取第一个非结构性键（跳过 loader/schema）的缩进作基准 →
只收同级缩进的键，遇更小缩进即止。prettier 不会改变同级缩进，所以基准稳定；
嵌套的 image.url/alt、regex 选项里的 message 缩进更深，自然被排除。

用法: python3 scripts/gates/check-content-contract.py [内容目录]
      [--config PATH] [--normalizer PATH] [--show-keys] [--allow-empty]
      内容目录缺省为 <repo>/src/content/article。
退出码: 0 = 全部认识；1 = 有未知键（部署应中断）；2 = 门禁自身故障
        （前置文件缺失 / 解析失败 / 内容目录不存在）。分三档是为了让排查方向不跑偏：
        看见 2 先修门禁，看见 1 才去修内容。

只看顶层键，理由和 astro 一致：`.strict()` 只加在最外层 z.object 上，
`image` 内层是普通 z.object，多写的键被 zod 静默 strip，不会炸构建。
那种情况该拦，但不该由这个门禁拦（它拦了就是假红）。
"""
import argparse
import difflib
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content_inventory import parse_frontmatter  # noqa: E402

# scripts/gates/check-content-contract.py → 仓库根
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_CONFIG = os.path.join(REPO_ROOT, "src", "content.config.ts")
DEFAULT_NORMALIZER = os.path.join(REPO_ROOT, "scripts", "normalize-frontmatter.mjs")
DEFAULT_CONTENT = os.path.join(REPO_ROOT, "src", "content", "article")

# defineCollection 的参数，不是 frontmatter 字段
STRUCTURAL = {"loader", "schema"}

# 同级缩进上「键: ...」的行（字符串内容已被清空，所以只认裸标识符键）
KEY_LINE = re.compile(r"[ \t]*([A-Za-z_$][\w$]*)[ \t]*:")
# prettier 只出空格，但手写时可能有 tab；按 4 列展开后再比缩进
TAB = 4


class ContractError(Exception):
    """门禁自己读不懂前置文件 —— 这种失败必须报 2，不能伪装成绿或红。"""


def strip_comments(js):
    """把 // 与 /* */ 注释替换成等长空白（保留换行），其余原样。

    不能简单 re.sub(r"//.*", ...)：会把 `"https://..."` 里的 `//` 也当注释。
    所以按字符走一遍状态机，字符串/模板串/正则字面量里的斜杠不算注释开头。
    """
    out = list(js)
    n = len(js)
    i = 0
    prev = ""  # 上一个有效源码字符：用来判断 `/` 是正则开头还是除号
    last_word = ""  # 上一个标识符：`return /re/` 这类正则只在关键字之后出现
    word = ""
    while i < n:
        ch = js[i]
        nxt = js[i + 1] if i + 1 < n else ""
        if ch == "/" and nxt == "/":
            j = js.find("\n", i)
            j = n if j == -1 else j
            for k in range(i, j):
                out[k] = " "
            i = j
            word = ""
            continue
        if ch == "/" and nxt == "*":
            j = js.find("*/", i + 2)
            j = n if j == -1 else j + 2
            for k in range(i, j):
                if js[k] != "\n":
                    out[k] = " "
            i = j
            word = ""
            continue
        if ch in "\"'`":
            q = ch
            i += 1
            while i < n:
                if js[i] == "\\":
                    i += 2
                    continue
                if js[i] == q:
                    i += 1
                    break
                i += 1
            prev = q
            word = ""
            continue
        if ch == "/" and (prev == "" or prev in "(,=:[!&|?{};+-*%<>~^" or last_word in ("return", "case", "typeof")):
            i += 1
            while i < n:
                if js[i] == "\\":
                    i += 2
                    continue
                if js[i] == "[":
                    while i < n and js[i] != "]":
                        i += 2 if js[i] == "\\" else 1
                    i += 1
                    continue
                if js[i] == "/":
                    i += 1
                    break
                i += 1
            prev = "/"
            word = ""
            continue
        if not ch.isspace():
            prev = ch
        if ch.isalnum() or ch in "_$":
            word += ch
        elif word:
            last_word = word
            word = ""
        i += 1
    return "".join(out)


def blank_strings(js):
    """把字符串**内容**换成空格，保留引号与换行。

    这样字符串里的 `{` / `}` / `:` 不会干扰花括号配平和键匹配。
    代价：`"带引号的键": x` 这类 YAML 键识别不到 —— 但 content_inventory 的
    frontmatter 解析器同样只认裸标识符键，A2 与 A2b 保持同一个盲区，口径一致。
    """
    out = list(js)
    n = len(js)
    i = 0
    while i < n:
        if js[i] in "\"'`":
            q = js[i]
            i += 1
            while i < n:
                if js[i] == "\\":
                    out[i] = " "
                    i += 1
                    if i < n:
                        out[i] = " "
                        i += 1
                    continue
                if js[i] == q:
                    i += 1
                    break
                if js[i] != "\n":
                    out[i] = " "
                i += 1
            continue
        i += 1
    return "".join(out)


def match_brace(js, start, what):
    """返回从 js[start] 这个 '{' 开始，配平后的 '}' 下标。"""
    depth = 0
    for i in range(start, len(js)):
        if js[i] == "{":
            depth += 1
        elif js[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    line = js.count("\n", 0, start) + 1
    raise ContractError(f"花括号不配平：{what}（第 {line} 行起）")


def article_schema_body(js):
    """返回 article 集合里**外层** z.object 的对象体文本。

    不用「找首个 z.object(」：prettier 会把 `z` 和 `.object(` 拆成两行，
    全文的字面量 `z.object(` 只剩 pages 集合那一处（实测），落到那儿只有 2 个键。
    改成从 article 的 collection 体里找 `schema:` 之后的 `.object(`，再配平取体。
    """
    m = re.search(r"export\s+const\s+article\s*=\s*defineCollection\s*\(\s*\{", js)
    if not m:
        raise ContractError("content.config.ts 里找不到 `export const article = defineCollection({`")
    col_start = js.index("{", m.start())
    col_end = match_brace(js, col_start, "article collection")
    block = js[col_start:col_end]

    sm = re.search(r"\bschema\s*:", block)
    if not sm:
        raise ContractError("article collection 里没有 `schema:`")
    om = re.search(r"\.\s*object\s*\(\s*\{", block[sm.end():])
    if not om:
        raise ContractError("article 的 schema 里找不到 `z.object({`（契约写法变了？）")

    obj_start = col_start + sm.end() + om.end() - 1
    obj_end = match_brace(js, obj_start, "article schema 外层对象")
    return js[obj_start + 1:obj_end]


def keys_by_indent(body):
    """按缩进基准收键：只认同级缩进的键，遇更小缩进即止。

    为什么不能数花括号全收：`image: z.object({ url, alt })` 是嵌套对象，
    内层 url/alt 会被当成 frontmatter 键；regex 的 `{ message: "..." }` 选项
    同样会漏出一个 message。实测这样捞出 22 个键，其中 4 个是假的。
    """
    keys = []
    base = None
    for raw in body.split("\n"):
        line = raw.expandtabs(TAB)
        if not line.strip():
            continue  # 空行 / 被清空的注释行
        indent = len(line) - len(line.lstrip())
        m = KEY_LINE.match(line)
        if base is None:
            # 基准 = 第一个非结构性键（如 title）的缩进
            if m and m.group(1) not in STRUCTURAL:
                base = indent
                keys.append(m.group(1))
            continue
        if indent < base:
            break  # 退到外层对象了，schema 到头
        if indent > base:
            continue  # 嵌套对象 / 多行调用的续行，不是 frontmatter 键
        if m:
            keys.append(m.group(1))
    if not keys:
        raise ContractError("按缩进基准一个 schema 键也没提取到（契约写法变了？）")
    return keys


def schema_keys(js):
    return keys_by_indent(article_schema_body(blank_strings(strip_comments(js))))


def normalizer_keys(js):
    """normalize-frontmatter.mjs 会吃掉的键。

    两种写法都要认：
      - `const FEATURE_KEYS = [...]` 数组（六个 v1 布尔开关）
      - 行首键名分支 `/^category:/`、`/^features:/` 这类正则锚点
    """
    m = re.search(r"const\s+FEATURE_KEYS\s*=\s*\[([^\]]*)\]", js)
    if not m:
        raise ContractError("normalize-frontmatter.mjs 里找不到 `const FEATURE_KEYS = [...]`")
    keys = set(re.findall(r"""["']([A-Za-z][\w-]*)["']""", m.group(1)))
    if not keys:
        raise ContractError("normalize-frontmatter.mjs 的 FEATURE_KEYS 是空的")
    cleaned = blank_strings(strip_comments(js))
    # 只收 `/^某个字面键名:/`；`/^[A-Za-z0-9_-]+:/` 这种通用模式第一个字符是 `[`，不会命中
    keys |= set(re.findall(r"\^\s*([A-Za-z][\w]*)\s*:", cleaned))
    return keys


def read(path, what):
    if not os.path.isfile(path):
        raise ContractError(f"{what} 不存在：{path}")
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError as e:
        raise ContractError(f"读不了{what} {path}：{e}")


def load_allowed(config_path, normalizer_path):
    """返回 (允许键集合, 来源说明)。"""
    from_schema = schema_keys(read(config_path, "content.config.ts"))
    from_norm = normalizer_keys(read(normalizer_path, "normalize-frontmatter.mjs"))
    allowed = set(from_schema) | from_norm
    if not allowed:
        raise ContractError("允许键集合是空的")
    return allowed, (from_schema, sorted(from_norm - set(from_schema)))


def main():
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("content_dir", nargs="?", default=DEFAULT_CONTENT)
    ap.add_argument("--config", default=DEFAULT_CONFIG)
    ap.add_argument("--normalizer", default=DEFAULT_NORMALIZER)
    ap.add_argument("--show-keys", action="store_true", help="打印允许键及来源")
    ap.add_argument("--allow-empty", action="store_true", help="内容目录 0 篇也判绿")
    if "-h" in sys.argv or "--help" in sys.argv:
        print(__doc__)
        return 0
    try:
        args = ap.parse_args()
    except SystemExit:
        print(__doc__)
        return 2

    root = os.path.expanduser(args.content_dir)
    try:
        allowed, (from_schema, norm_only) = load_allowed(
            os.path.expanduser(args.config), os.path.expanduser(args.normalizer)
        )
    except ContractError as e:
        print(f"[A2b] 门禁故障：{e}", file=sys.stderr)
        return 2

    if not os.path.isdir(root):
        print(f"[A2b] 门禁故障：内容目录不存在 {root}", file=sys.stderr)
        return 2

    hits = []
    unknown = {}
    scanned = 0
    for dp, _dirs, ns in os.walk(root):
        if "/.git" in dp or "node_modules" in dp:
            continue
        for n in sorted(ns):
            if not n.endswith((".md", ".mdx")):
                continue
            p = os.path.join(dp, n)
            rel = os.path.relpath(p, root)
            with open(p, encoding="utf-8", errors="replace") as f:
                fm, _body = parse_frontmatter(f.read())
            if not fm:
                continue  # 无 frontmatter 的文件由别的门禁管（缺 title 会自己报错）
            scanned += 1
            bad = sorted(k for k in fm if k not in allowed)
            if bad:
                hits.append((rel, bad))
                for k in bad:
                    unknown[k] = unknown.get(k, 0) + 1

    if args.show_keys:
        print(f"schema 键({len(from_schema)}): {', '.join(from_schema)}")
        print(f"normalize 额外放行({len(norm_only)}): {', '.join(norm_only) or '(无)'}")
        print(f"允许键合计({len(allowed)}): {', '.join(sorted(allowed))}\n")

    for rel, bad in hits:
        print(f"{rel}\t{','.join(bad)}")
    print(f"\n扫描文章: {scanned} | 含未知键: {len(hits)}")

    if scanned == 0 and not args.allow_empty:
        # 内容同步断了也常表现为「0 篇」，这种假绿正是 D-0166 的同类坑
        print(f"[A2b] 门禁故障：{root} 下一篇文章都没扫到（内容没同步？）", file=sys.stderr)
        return 2

    if hits:
        print(f"允许键({len(allowed)}): {', '.join(sorted(allowed))}")
        for k in sorted(unknown):
            near = difflib.get_close_matches(k, sorted(allowed), n=2, cutoff=0.7)
            if near:
                print(f"  疑似拼写: {k} → {' / '.join(near)}")
        print("未知键会被 .strict() 的 zod schema 判为 Unrecognized keys，构建直接失败。")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
