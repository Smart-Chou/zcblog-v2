/**
 * 金句卡 Canvas 渲染器（M7-3d-1）
 *
 * 目标：把一段「引文 + 文章标题 + 作者」在浏览器本地画成 1080×1440（3:4）的 PNG。
 * 不引第三方库、不加载任何新字体、不发任何网络请求 —— 画布上的每个像素都由这里的
 * 绘制指令算出来，颜色全部从 CSS token 里读（见 `readToken`），所以卡片随主题走。
 *
 * 与 `/poster/<slug>.png`（构建期 Satori，1200×1600）的关系：那套是**文章级**海报，
 * 内容由 frontmatter 决定、构建时就固定；本文件是**运行期**渲染器，输入是用户在页面上
 * 拿到的任意一段文字。两者共用同一套版式语言（左侧赤陶竖条、右上装饰圆、强调色分隔条、
 * 顶部站点标识 + 右上小标、底部 hairline + 落款），但**互不依赖**：这里不 import
 * `packages/og-image`，也不会被文章页加载（只有 `/design/components/quote-card/` 引它）。
 *
 * 排版原则（本卡验收第 1 条「不裁字、不溢出」的落点）：
 *   1. 断行按「最小排版单元」做，中文逐字可断、拉丁按词断；
 *   2. 标点不顶行（行首禁则）、开引号/开括号不落行尾（行尾禁则），这两条只做
 *      「退一个字」这一档，退完仍不合规时接受现状而不是把字挤出画布；
 *   3. 引文块高度不够时**先缩字号**（60→36，步长 2），缩到下限仍不够才截断并置
 *      `truncated: true`；无论哪条路径，`overflow` 都只在真正越界时为 true，
 *      而 metrics 里的 `maxLineWidth` 一定 ≤ 版心宽 —— 测试直接判这两个数。
 */

/* ───────────────────────── 常量 ───────────────────────── */

/** 卡片固有尺寸（CSS 像素 = 输出像素，1:1，不做 DPR 缩放）。 */
export const QUOTE_CARD_WIDTH = 1080;
export const QUOTE_CARD_HEIGHT = 1440;

/** 版心：左侧 12px 竖条之后开始，右侧留白比左侧少一点（视觉重心略靠右）。 */
const PAD = { top: 96, left: 108, right: 88, bottom: 84, bar: 12 } as const;
const CONTENT_LEFT = PAD.left;
const CONTENT_RIGHT = QUOTE_CARD_WIDTH - PAD.right;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

const RULE_TOP = 164; // 顶部 hairline
const QUOTE_TOP = 338; // 引文块第一行 top（下限位置：空引文也不会顶到 hairline）
/** 垂直居中的最大下移量：引文越短、这块越靠下，但不会撞到底部 hairline。 */
const QUOTE_SHIFT_MAX = 104;
const QUOTE_SIZE_MAX = 60;
const QUOTE_SIZE_MIN = 36;
const QUOTE_LINE_HEIGHT = 1.62;

const TITLE_SIZE = 32;
const TITLE_LINE_HEIGHT = 1.6;
const TITLE_MAX_LINES = 2;
const TITLE_MARGIN_TOP = 40;

const FOOTER_RULE_TOP = QUOTE_CARD_HEIGHT - PAD.bottom - 92;
const FOOTER_TEXT_TOP = FOOTER_RULE_TOP + 34;

/** 引文块下方要预留的高度：分隔条 + 标题块。 */
const BELOW_QUOTE =
    60 + 10 + TITLE_MARGIN_TOP + TITLE_SIZE * TITLE_LINE_HEIGHT * TITLE_MAX_LINES + 8;

const FONT_SANS =
    '"DM Sans", -apple-system, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
const FONT_SERIF =
    '"DM Serif Display", "Songti SC", "Songti TC", "Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif';

/** 行首禁则：这些字不能出现在一行开头。 */
const NO_LINE_START = "、。，．,.：:；;！!？?）)］]｝}」』〉》”’…—～%·";
/** 行尾禁则：这些字不能落在行末。 */
const NO_LINE_END = "（(［[｛{「『〈《“‘";

/* ───────────────────────── 类型 ───────────────────────── */

export interface QuoteCardInput {
    /** 引文正文（要放在卡片正中的那段话）。 */
    quote: string;
    /** 引文出处：文章标题。 */
    title: string;
    /** 作者署名。 */
    author: string;
    /** 右上角小标，默认「金句 · QUOTE」。 */
    kicker?: string;
    /** 顶部站点标识 / 底部右侧品牌，默认「marxchou.com」。 */
    site?: string;
}

export interface QuoteCardMetrics {
    width: number;
    height: number;
    theme: "light" | "dark";
    quote: {
        fontSize: number;
        lineHeight: number;
        lines: string[];
        /** 版心内每一行的实际宽度（px），测试据此判「不溢出」。 */
        lineWidths: number[];
        maxLineWidth: number;
        top: number;
        bottom: number;
    };
    title: { fontSize: number; lines: string[]; maxLineWidth: number };
    /** 引文有没有被截断（字号缩到下限仍放不下时才会 true）。 */
    truncated: boolean;
    /** 任何块越出卡片安全区时为 true —— 正常卡片恒为 false。 */
    overflow: boolean;
}

/* ───────────────────────── 颜色 ───────────────────────── */

/**
 * 读一个 CSS token 并规范成 canvas 认识的颜色。
 *
 * `getComputedStyle().getPropertyValue("--x")` 返回的是**代入 var() 之后**的字符串
 * （可能是 `#fdf9f2`，也可能是 `color-mix(...)`），后者只有浏览器自己解析得了，
 * 所以再挂一个探针元素让它算成 `rgb()/rgba()`；token 不存在时退回 fallback。
 */
function readToken(el: Element, name: string, fallback: string): string {
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    if (!raw) return fallback;
    const probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
        "position:absolute;inline-size:0;block-size:0;opacity:0;pointer-events:none";
    probe.style.color = raw;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return /^rgba?\(/.test(resolved) ? resolved : fallback;
}

interface Palette {
    paper: string;
    ink: string;
    muted: string;
    subtle: string;
    accent: string;
    theme: "light" | "dark";
}

function readPalette(el: Element): Palette {
    const theme =
        el.closest("[data-theme]")?.getAttribute("data-theme") === "dark" ? "dark" : "light";
    return {
        paper: readToken(
            el,
            "--color-bg-canvas",
            theme === "dark" ? "rgb(16, 17, 21)" : "rgb(253, 249, 242)",
        ),
        ink: readToken(
            el,
            "--color-fg-heading",
            theme === "dark" ? "rgb(255, 255, 255)" : "rgb(28, 25, 20)",
        ),
        muted: readToken(
            el,
            "--color-fg-muted",
            theme === "dark" ? "rgb(180, 180, 180)" : "rgb(110, 100, 88)",
        ),
        subtle: readToken(
            el,
            "--color-border-subtle",
            theme === "dark" ? "rgb(56, 60, 70)" : "rgb(235, 228, 216)",
        ),
        accent: readToken(el, "--color-accent-solid", "rgb(212, 160, 64)"),
        theme,
    };
}

/* ───────────────────────── 断行 ───────────────────────── */

const isWordChar = (ch: string): boolean => /[A-Za-z0-9'’\-_.@#$&*+/=]/.test(ch);

/** 切成「不可再分的排版单元」：拉丁词整块、空白一块、其它（CJK/标点）一字一块。 */
function tokenize(text: string): string[] {
    // 中文按「词」断行：Intl.Segmenter 能识别「文案」「博客」这类双字词，
    // 避免逐字断行把词拆到两行（纯字符 fallback 见下）。
    const SegmenterCtor = (
        Intl as unknown as {
            Segmenter?: new (
                locale: string,
                options: { granularity: "word" },
            ) => { segment: (value: string) => Iterable<{ segment: string }> };
        }
    ).Segmenter;
    if (SegmenterCtor) {
        const atoms: string[] = [];
        for (const part of new SegmenterCtor("zh", { granularity: "word" }).segment(text)) {
            const segment = part.segment;
            if (!segment) continue;
            if (/^\s+$/u.test(segment)) {
                atoms.push(" ");
            } else {
                atoms.push(segment);
            }
        }
        return atoms;
    }

    const atoms: string[] = [];
    let word = "";
    const flush = () => {
        if (word) {
            atoms.push(word);
            word = "";
        }
    };
    for (const ch of Array.from(text)) {
        if (isWordChar(ch)) {
            word += ch;
            continue;
        }
        flush();
        atoms.push(/\s/.test(ch) ? " " : ch);
    }
    flush();
    return atoms;
}

/**
 * 按宽度断行，带中文行首/行尾禁则。
 * 返回的每一行都保证 `measureText(line) <= maxWidth`（除非单个字/词本身就超宽，
 * 那种情况按字符硬切，因此仍然不越界）。
 */
function wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
): { lines: string[]; widths: number[] } {
    const atoms = tokenize(text);
    const measure = (s: string) => ctx.measureText(s).width;
    const lines: string[] = [];

    let cur: string[] = [];
    const commit = () => {
        const joined = cur.join("").replace(/\s+$/u, "");
        if (joined) lines.push(joined);
        cur = [];
    };

    for (const atom of atoms) {
        if (atom === " " && cur.length === 0) continue; // 行首不留空格

        const candidate = cur.join("") + atom;
        if (measure(candidate) <= maxWidth) {
            cur.push(atom);
            continue;
        }

        // 放不下：当前行非空 → 换行决策
        if (cur.length > 0) {
            const lastAtom = cur[cur.length - 1] ?? "";

            if (NO_LINE_START.includes(atom) && cur.length >= 2) {
                // 标点顶行：把当前行最后一个字带下去，让标点跟它作伴
                const pulled = cur.pop() as string;
                commit();
                cur = [pulled, atom];
                continue;
            }
            if (NO_LINE_END.includes(lastAtom) && cur.length >= 2) {
                // 开引号落行尾：把它带下去
                cur.pop();
                commit();
                cur = [lastAtom, atom];
                continue;
            }
            commit();
        }

        // 空行 + 单个单元仍然超宽 → 按字符硬切
        if (measure(atom) > maxWidth) {
            let chunk = "";
            for (const ch of Array.from(atom)) {
                if (measure(chunk + ch) <= maxWidth) {
                    chunk += ch;
                } else {
                    if (chunk) lines.push(chunk);
                    chunk = ch;
                }
            }
            cur = chunk ? [chunk] : [];
            continue;
        }
        cur = [atom];
    }
    commit();

    const result = lines.length > 0 ? lines : [""];
    return { lines: result, widths: result.map(measure) };
}

/* ───────────────────────── 绘制 ───────────────────────── */

function fontString(size: number, family: string, weight = 400): string {
    return `${weight} ${size}px ${family}`;
}

/** 装饰用：`globalAlpha` 包一层，省得为了半透明去解析颜色字符串。 */
function withAlpha(
    ctx: CanvasRenderingContext2D,
    alpha: number,
    paint: (ctx: CanvasRenderingContext2D) => void,
): void {
    const previous = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    paint(ctx);
    ctx.globalAlpha = previous;
}

/**
 * 画一张金句卡，返回这一版的实际度量（字号、行数、行宽、是否截断）。
 *
 * 同步函数：字体必须在调用前就绪（`await document.fonts.ready`），否则量出来的宽度
 * 与实际渲染的字形对不上 —— 这是 canvas 排版唯一容易踩的坑。
 */
export function renderQuoteCard(
    canvas: HTMLCanvasElement,
    input: QuoteCardInput,
    options: { scale?: number } = {},
): QuoteCardMetrics {
    const scale = options.scale ?? 1;
    canvas.width = QUOTE_CARD_WIDTH;
    canvas.height = QUOTE_CARD_HEIGHT;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("quote-card: 拿不到 2d 上下文");

    const palette = readPalette(canvas);
    const quote = input.quote.trim();
    const title = input.title.trim();
    const author = input.author.trim();
    const kicker = (input.kicker ?? "金句 · QUOTE").trim();
    const site = (input.site ?? "marxchou.com").trim();

    ctx.save();
    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, QUOTE_CARD_WIDTH, QUOTE_CARD_HEIGHT);

    /* 底：纸色 + 右上装饰圆 + 左侧强调竖条 */
    ctx.fillStyle = palette.paper;
    ctx.fillRect(0, 0, QUOTE_CARD_WIDTH, QUOTE_CARD_HEIGHT);

    withAlpha(ctx, 0.07, (c) => {
        c.fillStyle = palette.accent;
        c.beginPath();
        c.arc(QUOTE_CARD_WIDTH - 24, 96, 196, 0, Math.PI * 2);
        c.fill();
    });

    ctx.fillStyle = palette.accent;
    ctx.fillRect(0, 0, PAD.bar, QUOTE_CARD_HEIGHT);

    /* 顶栏：左站点标识 / 右小标 */
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = fontString(26, FONT_SANS, 700);
    ctx.letterSpacing = "1.6px";
    ctx.fillStyle = palette.accent;
    ctx.fillText(site, CONTENT_LEFT, PAD.top);

    ctx.textAlign = "right";
    ctx.font = fontString(20, FONT_SANS, 500);
    ctx.letterSpacing = "2.6px";
    ctx.fillStyle = palette.muted;
    ctx.fillText(kicker.toUpperCase(), CONTENT_RIGHT, PAD.top + 6);

    /* 顶栏 hairline */
    ctx.letterSpacing = "0px";
    ctx.fillStyle = palette.subtle;
    ctx.fillRect(CONTENT_LEFT, RULE_TOP, CONTENT_WIDTH, 1);

    /* 引文开引号（装饰，aria 上由 canvas 的 aria-label 承担语义） */
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    /* 引文：字号自适应的主体块 */
    const available = FOOTER_RULE_TOP - QUOTE_TOP - BELOW_QUOTE;
    let size = QUOTE_SIZE_MAX;
    let wrapped = { lines: [""], widths: [0] };
    for (; size >= QUOTE_SIZE_MIN; size -= 2) {
        ctx.font = fontString(size, FONT_SERIF, 400);
        wrapped = wrapText(ctx, quote, CONTENT_WIDTH);
        if (wrapped.lines.length * size * QUOTE_LINE_HEIGHT <= available) break;
    }
    if (size < QUOTE_SIZE_MIN) size = QUOTE_SIZE_MIN;

    ctx.font = fontString(size, FONT_SERIF, 400);
    wrapped = wrapText(ctx, quote, CONTENT_WIDTH);

    const lineHeight = size * QUOTE_LINE_HEIGHT;
    const maxLines = Math.max(1, Math.floor(available / lineHeight));
    let truncated = false;
    if (wrapped.lines.length > maxLines) {
        truncated = true;
        wrapped.lines = wrapped.lines.slice(0, maxLines);
        const last = wrapped.lines[wrapped.lines.length - 1] ?? "";
        wrapped.lines[wrapped.lines.length - 1] =
            `${last.replace(/[\s、。，．,.：:；;！!？?]*$/u, "")}…`;
        wrapped.widths = wrapped.lines.map((line) => ctx.measureText(line).width);
    }

    /**
     * 垂直居中：版心（顶部 hairline → 底部 hairline）里「引号 + 引文 + 分隔条 + 出处」
     * 这一整块居中，最多下移 `QUOTE_SHIFT_MAX` —— 字数少的引文不会在卡片下半截留一大块空。
     * 只往下推、不往上提：顶部 hairline 与引号之间那点空气是版式的一部分。
     */
    const blockHeight = wrapped.lines.length * lineHeight + BELOW_QUOTE - 60;
    const quoteTop =
        QUOTE_TOP +
        Math.min(
            QUOTE_SHIFT_MAX,
            Math.max(0, Math.round((FOOTER_RULE_TOP - 56 - (QUOTE_TOP + blockHeight)) / 2)),
        );

    withAlpha(ctx, 0.35, (c) => {
        c.fillStyle = palette.accent;
        c.font = fontString(132, FONT_SERIF, 400);
        c.fillText("“", CONTENT_LEFT - 6, quoteTop - 108);
    });

    // 引号是 132px、正文是 size —— withAlpha 里改过 font，这里必须显式写回来，
    // 否则正文会按引号的字号画出去（实测 150px 直接越过版心）。
    ctx.font = fontString(size, FONT_SERIF, 400);
    ctx.fillStyle = palette.ink;
    ctx.letterSpacing = "0px";
    wrapped.lines.forEach((line, index) => {
        ctx.fillText(line, CONTENT_LEFT, quoteTop + index * lineHeight);
    });

    const quoteBottom = quoteTop + wrapped.lines.length * lineHeight;

    /* 强调色分隔条 */
    const dividerTop = quoteBottom + 60;
    ctx.fillStyle = palette.accent;
    ctx.fillRect(CONTENT_LEFT, dividerTop, 108, 10);

    /* 出处（文章标题）：最多两行，超出用省略号 */
    ctx.font = fontString(TITLE_SIZE, FONT_SANS, 500);
    const titleWrapped = wrapText(ctx, `— 《${title}》`, CONTENT_WIDTH);
    let titleLines = titleWrapped.lines.slice(0, TITLE_MAX_LINES);
    if (titleWrapped.lines.length > TITLE_MAX_LINES) {
        const last = titleLines[titleLines.length - 1] ?? "";
        titleLines[titleLines.length - 1] = `${last.replace(/[\s、。，．,.：:；;！!？?]*$/u, "")}…`;
    }
    ctx.fillStyle = palette.muted;
    const titleTop = dividerTop + 10 + TITLE_MARGIN_TOP;
    titleLines.forEach((line, index) => {
        ctx.fillText(line, CONTENT_LEFT, titleTop + index * TITLE_SIZE * TITLE_LINE_HEIGHT);
    });

    /* 底栏：hairline + 左署名 / 右品牌 */
    ctx.fillStyle = palette.subtle;
    ctx.fillRect(CONTENT_LEFT, FOOTER_RULE_TOP, CONTENT_WIDTH, 1);

    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = fontString(26, FONT_SANS, 600);
    ctx.fillStyle = palette.ink;
    ctx.fillText(author || site, CONTENT_LEFT, FOOTER_TEXT_TOP);

    ctx.textAlign = "right";
    ctx.font = fontString(20, FONT_SANS, 500);
    ctx.letterSpacing = "2.2px";
    ctx.fillStyle = palette.muted;
    ctx.fillText("1080 × 1440 · 3:4", CONTENT_RIGHT, FOOTER_TEXT_TOP + 6);
    ctx.letterSpacing = "0px";

    /* 右下装饰点 —— 位置与海报一致（底部 hairline 上方） */
    withAlpha(ctx, 0.55, (c) => {
        c.fillStyle = palette.accent;
        c.beginPath();
        c.arc(CONTENT_RIGHT - 4, FOOTER_RULE_TOP - 34, 7, 0, Math.PI * 2);
        c.fill();
    });

    ctx.restore();

    const titleWidths = titleLines.map((line) => {
        ctx.save();
        ctx.font = fontString(TITLE_SIZE, FONT_SANS, 500);
        const width = ctx.measureText(line).width;
        ctx.restore();
        return width;
    });

    const maxLineWidth = Math.max(...wrapped.widths, 0);
    const bottom = Math.max(
        quoteBottom,
        titleTop + titleLines.length * TITLE_SIZE * TITLE_LINE_HEIGHT,
    );

    return {
        width: QUOTE_CARD_WIDTH,
        height: QUOTE_CARD_HEIGHT,
        theme: palette.theme,
        quote: {
            fontSize: size,
            lineHeight: lineHeight,
            lines: wrapped.lines,
            lineWidths: wrapped.widths,
            maxLineWidth: Math.round(maxLineWidth * 100) / 100,
            top: quoteTop,
            bottom: Math.round(quoteBottom),
        },
        title: {
            fontSize: TITLE_SIZE,
            lines: titleLines,
            maxLineWidth: Math.round(Math.max(...titleWidths, 0) * 100) / 100,
        },
        truncated,
        overflow: maxLineWidth > CONTENT_WIDTH + 1 || bottom > FOOTER_RULE_TOP - 8,
    };
}

/** canvas → PNG Blob。`toBlob` 是异步回调，包成 Promise；空 blob 视为失败。 */
export function quoteCardBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob && blob.type === "image/png" && blob.size > 0) resolve(blob);
            else reject(new Error("quote-card: toBlob 没有产出 PNG"));
        }, "image/png");
    });
}

/* ───────────────────────── 演示页挂载 ───────────────────────── */

export const QUOTE_CARD_DOWNLOAD_NAME = "quote-card-1080x1440.png";

interface MountOptions {
    /** 固定 fixture：演示页把文案写在 data-* 上，脚本只读不改。 */
    input?: QuoteCardInput;
}

/**
 * 给演示页接线：读 fixture → 画 canvas → 把 PNG 挂到下载链接 → 更新状态行。
 *
 * 只在有 `[data-quote-card-root]` 的页面上跑（目前只有 `/design/components/quote-card/`），
 * 其它页面 import 这段代码不会做任何事。
 */
export function mountQuoteCard(options: MountOptions = {}): void {
    const root = document.querySelector<HTMLElement>("[data-quote-card-root]");
    if (!root || root.dataset.quoteMounted === "true") return;

    const canvas = root.querySelector<HTMLCanvasElement>("[data-quote-card]");
    if (!canvas) return;

    const generateButton = root.querySelector<HTMLButtonElement>("[data-quote-generate]");
    const downloadLink = root.querySelector<HTMLAnchorElement>("[data-quote-download]");
    const status = root.querySelector<HTMLElement>("[data-quote-status]");

    const input: QuoteCardInput = options.input ?? {
        quote: root.dataset.quote ?? "",
        title: root.dataset.title ?? "",
        author: root.dataset.author ?? "",
        kicker: root.dataset.kicker,
        site: root.dataset.site,
    };

    root.dataset.quoteMounted = "true";

    let objectUrl: string | null = null;

    const announce = (text: string, tone: "ok" | "error" = "ok") => {
        if (!status) return;
        status.textContent = text;
        status.dataset.tone = tone;
    };

    const generate = async (): Promise<void> => {
        root.dataset.quoteState = "busy";
        if (generateButton) generateButton.disabled = true;
        try {
            // 字体没就绪时量出来的宽度是错的 —— 先等它，再量、再画。
            await document.fonts.ready;

            const metrics = renderQuoteCard(canvas, input);
            canvas.dataset.quoteMetrics = JSON.stringify(metrics);
            canvas.dataset.quoteOverflow = String(metrics.overflow);
            canvas.dataset.quoteTruncated = String(metrics.truncated);
            // 单调递增的渲染序号：e2e 用它判断「这一次」真的画完了（主题切换后重画尤其需要）
            canvas.dataset.quoteRender = String(Number(canvas.dataset.quoteRender ?? "0") + 1);
            canvas.setAttribute(
                "aria-label",
                `金句卡：${input.quote} —— 出自《${input.title}》，${input.author}。` +
                    `1080×1440，引文 ${metrics.quote.lines.length} 行。`,
            );

            const blob = await quoteCardBlob(canvas);
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            objectUrl = URL.createObjectURL(blob);

            if (downloadLink) {
                downloadLink.href = objectUrl;
                downloadLink.setAttribute("download", QUOTE_CARD_DOWNLOAD_NAME);
                downloadLink.removeAttribute("aria-disabled");
                downloadLink.dataset.quoteReady = "true";
            }

            root.dataset.quoteState = "ready";
            announce(
                `已生成 ${metrics.width} × ${metrics.height}（3:4）· 引文 ${metrics.quote.lines.length} 行 / ` +
                    `${metrics.quote.fontSize}px · ${(blob.size / 1024).toFixed(0)} KB PNG`,
            );
        } catch (error) {
            root.dataset.quoteState = "error";
            announce(error instanceof Error ? `生成失败：${error.message}` : "生成失败", "error");
            throw error;
        } finally {
            if (generateButton) generateButton.disabled = false;
        }
    };

    root.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-quote-generate]")) {
            event.preventDefault();
            void generate();
        }
    });

    // 进页面就先画一张 —— 演示页的第一屏就是成品，按钮只是让你重画
    void generate();
}
