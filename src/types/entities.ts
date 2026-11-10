/**
 * C 层实体契约（M2-7a；M2-7b 只追加 devices / games）
 * ------------------------------------------------------------------
 * 为什么单独一层类型：C 层展示页（项目 / 技能 / 设备 / 游戏 / 时间线 …）不走
 * content collection（`src/content.config.ts` 是文章契约，不许混），数据是手写
 * typed 文件（`src/data/entities/*.ts`）。于是「schema 在哪」必须有个明确答案：
 * 就在本文件——**类型 + 校验 + 归一化**三件事同源，页面与门禁都从这里取。
 *
 * 三态语义（沿用 M2-6a/M2-6b 的 adapter 约定）：
 *   ok    数据可用
 *   empty 文件在但没有条目（含站点显式关闭）→ 页面给空态，路由照常 200
 *   error 数据形状不合法（或全部条目被丢弃）→ 页面给错误态 + 原因代码
 * 归一化**永不抛异常**：坏条目被丢弃并计入 `dropped`，页面不会因为一条脏数据整页 500。
 * 门禁（`scripts/gates/verify-entities.mjs`）则相反——`dropped > 0` 即 FAIL。
 * 这条分界是本契约的核心：运行时宽容、CI 严格。
 *
 * 本文件不 import 任何模块：数据文件只 `import type` 它，门禁把两者转译成
 * ESM 后在 node 里直接跑，所以这里放的必须是纯函数。
 */

/**
 * 契约版本；schema 破坏性变更时 +1，门禁会打印出来。
 * v2（M8-1a）只做加法：Project / Device / Skill 17 个可选字段 + `EntityLink.kind?`，
 * 全部 present-only —— 缺省 = v1 行为，旧数据原样通过（`dropped = 0` 是硬断言）。
 * 两处减法：不加 `Device.yearPurchased`（`since` 现算年份）、`links` 不换形状。
 */
export const ENTITY_CONTRACT_VERSION = 2;

/** 数据新鲜度阈值（天）。超过只 warning，不 fail（14 §7 硬性规则 3）。 */
export const ENTITY_FRESHNESS_DAYS = 180;

/**
 * 实体数据的语言（`LocalizedText` 只有 zh / en 两份字段）。
 *
 * ⚠️ M2-11a：这里从 `"zh" | "en"` 放宽到**任意 UI 语言串**。原因：实体页的
 * `locale` 参数来自 `getLocale()`，注册表接入 zh-TW / ja / ko / fr 之后就是 6
 * 个值；M2-11b 收口 10 门（+ de / es / pt-BR / ru）后同理。而 `pick()` 与各
 * `*Label()` 的实现本来就是「非 en 一律按 zh」，
 * 放宽类型不改变任何渲染结果（zh/en 逐字节一致，新语言按既定口径吃中文兜底）。
 * 数据侧仍然只有 zh/en 双语字段 —— `LocalizedText` 与校验口径未动。
 */
export type EntityLocale =
    "zh" | "en" | "zh-TW" | "ja" | "ko" | "fr" | "de" | "es" | "pt-BR" | "ru";

/** 站点双语字段：两个语种都必填，缺一个门禁就红（避免 en 页面掉回中文）。 */
export interface LocalizedText {
    zh: string;
    en: string;
}

export type EntityKind =
    "projects" | "skills" | "devices" | "games" | "timeline" | "music" | "albums";

export type EntityStatus = "ok" | "empty" | "error";

export type EntityIssueCode =
    | "source-missing"
    | "source-empty"
    | "source-invalid"
    | "entry-dropped"
    | "forced-empty"
    | "forced-error";

export interface EntityIssue {
    code: EntityIssueCode;
    detail?: string;
}

/** 归一化产物：页面只读这个，不直接读数据文件。 */
export interface EntityCollection<T> {
    kind: EntityKind;
    status: EntityStatus;
    items: T[];
    /** 通过校验的条目数（= items.length，给页面 data-* 与门禁用）。 */
    total: number;
    /** 被丢弃的坏条目数；> 0 时门禁 FAIL。 */
    dropped: number;
    /** 丢弃原因（最多 8 条，给门禁打印用，不进页面）。 */
    problems: string[];
    /** 数据「最后更新」，取 meta.updated；缺失时退回各条目里最新的 updated。 */
    updated: string | null;
    /** 距今天数；无法解析为 null。 */
    ageDays: number | null;
    /** ageDays > ENTITY_FRESHNESS_DAYS（warning 口径，不阻断构建）。 */
    stale: boolean;
    issue?: EntityIssue;
}

/* ───────────────────────── 项目 ───────────────────────── */

export type ProjectStatus = "active" | "maintained" | "archived";

/** 链接语义标签（v2，可选）：只做视觉分组，缺省 = 普通外链。闭集故意小。 */
export type EntityLinkKind = "github" | "demo" | "docs" | "other";

export interface EntityLink {
    /** 链接文案；技术名/站点名不翻译，给什么显示什么。 */
    label: string;
    /** 只接受 http(s) 绝对地址；门禁会校验。 */
    href: string;
    /** v2 语义标签；缺省 = 普通外链。 */
    kind?: EntityLinkKind;
}

/** 项目 KPI（v2）：`value` 是已经成文的数字串，不在这里做单位换算。 */
export interface ProjectMetric {
    label: LocalizedText;
    /** 展示值，≤12 字符（`99.9` / `1.2k` / `40h`）。 */
    value: string;
    unit?: string;
}

export interface Project {
    /** 稳定键（slug 形状，小写连字符）；页面用它做锚点，不要随标题改。 */
    id: string;
    title: LocalizedText;
    summary: LocalizedText;
    status: ProjectStatus;
    /** 起始年月 `YYYY-MM`。 */
    started: string;
    /** 结束年月 `YYYY-MM`；`null` = 仍在做。 */
    ended?: string | null;
    role?: LocalizedText;
    /** 技术栈（不翻译）。 */
    stack: string[];
    highlights?: LocalizedText[];
    links?: EntityLink[];
    /** v2 内容分类：**开放集合**，只卡 kebab slug 形状（≤24）；缺省 = 不渲染分类 chip。 */
    category?: string;
    /** v2：首页/列表置顶；缺省 = false。 */
    featured?: boolean;
    /** v2：封面（站内 `/images/…` 或 https 绝对地址）；缺省 = v1 无封面版式。 */
    coverImage?: string;
    /** v2：KPI 块（≤6 条）；缺省 = 页面回落「状态 / 栈数 / 起始年」派生值。 */
    metrics?: ProjectMetric[];
    /** 条目最后更新 `YYYY-MM-DD`，新鲜度按它算。 */
    updated: string;
}

/* ───────────────────────── 技能 ───────────────────────── */

/** 四档闭集；不从 0 起算，避免「会一点」被当成技能。 */
export type SkillLevel = "exploring" | "working" | "solid" | "deep";

export interface Skill {
    name: string;
    level: SkillLevel;
    /** 起始年份（`YYYY`），可空。 */
    since?: string;
    note?: LocalizedText;
    /** v2 展示用百分比 0–100：**只是展示辅助，不替代 `level` 四档**。 */
    percent?: number;
    /** v2：年资 0–60；缺省时页面按 `since` 现算，不落字段。 */
    years?: number;
    /** v2：图标 sprite id（`collection:name`，如 `mingcute:code-line`）；命中检查在门禁。 */
    icon?: string;
    /** v2：高亮（技能页置顶/加粗）；缺省 = false。 */
    highlight?: boolean;
    /** v2：关联项目（元素必须是真实 `Project.id`）；悬空 id 由门禁 E10 判 FAIL。 */
    relatedProjects?: string[];
    /** v2：关联文章 slug；文章在私有内容仓，门禁只能 WARN，不能 FAIL。 */
    relatedArticles?: string[];
}

export interface SkillGroup {
    id: string;
    title: LocalizedText;
    summary?: LocalizedText;
    items: Skill[];
    updated: string;
}

/* ───────────────────────── 设备 ───────────────────────── */

/** 六类闭集；分组展示的顺序见 `DEVICE_CATEGORY_ORDER`。 */
export type DeviceCategory = "computer" | "display" | "audio" | "peripheral" | "network" | "other";

/** 三态里没有「坏了」——设备只有在用 / 备用 / 退役。 */
export type DeviceStatus = "in-use" | "backup" | "retired";

/** 设备规格对（v2）：`label` 是键（不翻译，如 `CPU`），`value` 是值。 */
export interface DeviceSpecPair {
    label: string;
    value: string;
}

export interface Device {
    /** 稳定键（slug 形状，小写连字符）。 */
    id: string;
    /** 型号或主机名；技术名不翻译（`Intel NUC9` 在两种语言里都这么写）。 */
    name: string;
    category: DeviceCategory;
    status: DeviceStatus;
    /** 规格短标签（不翻译）：CPU / GPU / 内存 / 系统。至少一项。 */
    specs: string[];
    /** 这台机器留着干什么、为什么换 —— 页面上唯一的人话。 */
    note: LocalizedText;
    /** 上手年月 `YYYY-MM`。 */
    since?: string;
    /** 退役年月 `YYYY-MM`；`null` / 缺省 = 仍在役。退役（retired）必须填。 */
    until?: string | null;
    links?: EntityLink[];
    /** v2：精确型号（≤48 字符）；缺省时页面显示 `name`。 */
    model?: string;
    /** v2：设备图（站内 `/images/…` 或 https 绝对地址）；缺省 = 无图版式。 */
    image?: string;
    /** v2：个人评分 1–5、0.5 步进；缺省 = 不显示评分（不是 0 分）。 */
    rating?: number;
    /** v2 推广/返利链接，**只收 https**；有它就必须有 `affiliateDisclosure`（合规）。 */
    affiliateLink?: string;
    /** v2：推广披露文案（双语，必填可见）；没有推广关系就别写这个字段。 */
    affiliateDisclosure?: LocalizedText;
    /** v2：键值型规格（≤8 条）；缺省 = 继续渲染 `specs[]`。 */
    specPairs?: DeviceSpecPair[];
    /** v2：置顶；缺省 = false。 */
    featured?: boolean;
    /** 条目最后更新 `YYYY-MM-DD`。 */
    updated: string;
}

/* ───────────────────────── 游戏 ───────────────────────── */

export type GamePlatform = "pc" | "switch" | "playstation" | "xbox" | "mobile" | "vr";

/** 四态；「弃坑」不单列，用 shelved + note 说清楚更诚实。 */
export type GameStatus = "playing" | "finished" | "shelved" | "backlog";

export interface Game {
    id: string;
    /** 双语标题：中文名与原名都可能在页面上出现，双语必填避免 en 页掉回中文。 */
    title: LocalizedText;
    /** 玩过的平台，至少一项。 */
    platforms: GamePlatform[];
    status: GameStatus;
    /** 开始/通关年份 `YYYY`；只到年，游戏没有「精确到日」的必要。 */
    year?: string;
    /** 累计小时（1–9999 的整数）；没统计就不写，不写 0。 */
    hours?: number;
    /** 1–5 的整数评分；不打分就不写（不是 0 分）。 */
    rating?: number;
    /** 一句评价（为什么通关 / 为什么搁置）。 */
    note: LocalizedText;
    updated: string;
}

/* ───────────────────────── 时间线 ───────────────────────── */

/**
 * 四类闭合标签；只做「这是哪一类事」的视觉徽标，不参与分组（分组按年份）。
 * 少一档比多一档稳：没有「其他」兜底桶，写不进去的就不该上时间线。
 */
export type TimelineKind = "build" | "site" | "infra" | "life";

export interface TimelineEvent {
    /** 稳定键（slug 形状，小写连字符）；页面锚点与排序兜底都靠它。 */
    id: string;
    /**
     * 事件日期：`YYYY-MM-DD`（知道哪一天）或 `YYYY-MM`（只知道哪个月）。
     * 两种精度都合法，是因为编年史里「某年某月立项」和「某日 00:04 切流」本来就不同粒度；
     * 不知道日期就写月份，不拿 1 号凑数（时间线最容易被编造的地方就是这里）。
     */
    date: string;
    title: LocalizedText;
    /** 一句话交代发生了什么；不写情绪，写事实。 */
    detail: LocalizedText;
    kind: TimelineKind;
    /** 技术名 / 版本 / 编号（不翻译），如 `Astro`、`D-0098`。 */
    tags?: string[];
    links?: EntityLink[];
    /** 条目最后核对日 `YYYY-MM-DD`。 */
    updated: string;
}

/* ───────────────────────── 音乐 ───────────────────────── */

/** 作品形态：专辑 / 单曲。EP、现场、合辑等先不收 —— 少一档比多一档稳。 */
export type MusicFormat = "album" | "single";

/**
 * 歌单条目（作品级，不是逐首歌）——
 * 一张专辑或一支单曲能被稳定追踪（发行年、豆瓣条目），逐首歌的时长/编曲信息抓不到就只能编。
 * 播放是**可选能力**：`audio` 写了才有试听源；没写就只有外链，页面也绝不会去加载音频。
 */
export interface MusicTrack {
    /** 稳定键（slug 形状，小写连字符）；锚点与 e2e 断言都用它。 */
    id: string;
    /** 作品名（中文名照写，不翻译 —— 歌名翻过去就不是它了）。 */
    title: string;
    /** 表演者（不翻译）；多人用 ` / ` 分隔。 */
    artist: string;
    format: MusicFormat;
    /** 发行年 `YYYY`；只知道年份就只写年份。 */
    year: string;
    /** 站点内封面路径（`/images/...`，构建期已存在的静态图）；缺省不渲染封面。 */
    cover?: string;
    /** 一句「为什么它在这张歌单里」。 */
    note: LocalizedText;
    /**
     * 可选试听源：**只接受 http(s) 绝对地址**。
     * 本站不自托管音频（M2 边界），所以缺省 = 这段关系只有外链；
     * 有没有这个字段直接决定页面上会不会出现 `<audio>` —— 关闭态 0 请求靠它。
     */
    audio?: string;
    links?: EntityLink[];
    /** 条目最后核对日 `YYYY-MM-DD`。 */
    updated: string;
}

/* ───────────────────────── 相册 ───────────────────────── */

/**
 * 地点键（闭集）：只收数据里真实出现过的城市，多一档就要有对应图片。
 * 展示名走 `ALBUM_PLACE_LABEL`，中文名照写、英文用通行拼写。
 */
export type AlbumPlace = "shenzhen" | "guangzhou" | "huizhou" | "wuhan" | "qingyuan";

/**
 * 相册条目 —— 一本相册 = 一次出行（或一次扫街）。
 *
 * 照片只存**图床相对路径**（不带扩展名、不带宽度）：缩略图与原图在页面里由
 * `getPicImageUrl(path, width)` 现算。数据里存下一个宽度，就等于把「缩略图地址」
 * 当原图存了下来 —— 那是假分离，不是真分离。
 */
export interface Album {
    /**
     * 稳定键：沿用既有 URL 里的相册 id（`shenzhen_feng-huang-shan`），
     * 因此本实体的 id 允许下划线 —— 改 slug 规则等于改线上 URL。
     */
    id: string;
    /** 相册名：中文照写，英文用通名翻译（凤凰山 → Fenghuang Mountain）。 */
    name: LocalizedText;
    place: AlbumPlace;
    /**
     * 图床路径清单（顺序 = 清单顺序 = 页面顺序）。封面 = `photos[0]`，
     * 张数 = `photos.length`，拍摄日 = 文件名时间戳，三者都不另存字段。
     */
    photos: string[];
    /** 条目最后核对日 `YYYY-MM-DD`。 */
    updated: string;
}

/* ───────────────────────── 集合元信息 ───────────────────────── */

/**
 * 每个数据文件导出且只导出一份 meta。
 * `owner` 是 14 §7 规则 4 的「归属到人」；`source` 说明数据怎么来（手写 / 导入 / 导入后手改）。
 */
export interface EntityMeta {
    /** `YYYY-MM-DD`；新鲜度门禁的锚点。 */
    updated: string;
    /**
     * **必填**（M2-7b 会签要求）：数据坏了要有一个能被 @ 的人。
     * 可选会让「两份数据写了、新数据漏了」永远只靠自觉，E2 现在直接判。
     */
    owner: string;
    source?: string;
}

/** meta 的必填字段；门禁 E8 逐字段删除自检与 `validateMeta` 必须同步。 */
export const META_REQUIRED_FIELDS = ["updated", "owner"] as const;

/* ───────────────────────── 校验器 ───────────────────────── */

const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const YEAR = /^\d{4}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTTP = /^https?:\/\/[^\s]+$/;
const HTTPS = /^https:\/\/[^\s]+$/;
/** 站点内静态图路径：构建期已在 public/ 下，带扩展名；用来挡住 `/assets/x.mp3` 式的糊写。 */
const SITE_IMAGE = /^\/[a-z0-9][a-z0-9/_.-]*\.(?:webp|avif|png|jpe?g|svg)$/i;
/** 图标 sprite id（`collection:name` 形状）；是否命中闭集由门禁查，契约零依赖。 */
const ICON_ID = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;

/** v2 展示上限；与 docs/28 §2.1 同源，改这里就要改文档（门禁报告逐字引用这些数）。 */
const CATEGORY_MAX = 24;
const METRIC_MAX = 6;
const METRIC_VALUE_MAX = 12;
const MODEL_MAX = 48;
const SPEC_PAIR_MAX = 8;
/**
 * 图床照片路径：以 `/` 开头、**不带扩展名**、不许出现 `..`（图床地址就是无扩展名的 key）。
 * 大写字母是真实存在的（相机导出的 `CRnall_` / `IMG_` / `MVIMG_`），不能按小写卡。
 */
const PIC_PATH =
    /^\/(?!.*\.\.)(?!.*\.(?:jpe?g|png|webp|avif|heic|gif)$)[A-Za-z0-9][A-Za-z0-9/_.-]*$/;
/** 相册 id：沿用既有 URL，允许下划线（slug 形状 + `_`）。 */
const ALBUM_ID = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

const PROJECT_STATUSES: readonly ProjectStatus[] = ["active", "maintained", "archived"];
const SKILL_LEVELS: readonly SkillLevel[] = ["exploring", "working", "solid", "deep"];
const DEVICE_CATEGORIES: readonly DeviceCategory[] = [
    "computer",
    "display",
    "audio",
    "peripheral",
    "network",
    "other",
];
const DEVICE_STATUSES: readonly DeviceStatus[] = ["in-use", "backup", "retired"];
const GAME_PLATFORMS: readonly GamePlatform[] = [
    "pc",
    "switch",
    "playstation",
    "xbox",
    "mobile",
    "vr",
];
const GAME_STATUSES: readonly GameStatus[] = ["playing", "finished", "shelved", "backlog"];
const TIMELINE_KINDS: readonly TimelineKind[] = ["build", "site", "infra", "life"];
const MUSIC_FORMATS: readonly MusicFormat[] = ["album", "single"];
const ALBUM_PLACES: readonly AlbumPlace[] = [
    "shenzhen",
    "guangzhou",
    "huizhou",
    "wuhan",
    "qingyuan",
];

export const PROJECT_REQUIRED_FIELDS = [
    "id",
    "title",
    "summary",
    "status",
    "started",
    "stack",
    "updated",
] as const;

export const SKILL_GROUP_REQUIRED_FIELDS = ["id", "title", "items", "updated"] as const;

export const DEVICE_REQUIRED_FIELDS = [
    "id",
    "name",
    "category",
    "status",
    "specs",
    "note",
    "updated",
] as const;

export const GAME_REQUIRED_FIELDS = [
    "id",
    "title",
    "platforms",
    "status",
    "note",
    "updated",
] as const;

export const TIMELINE_REQUIRED_FIELDS = [
    "id",
    "date",
    "title",
    "detail",
    "kind",
    "updated",
] as const;

export const MUSIC_REQUIRED_FIELDS = [
    "id",
    "title",
    "artist",
    "format",
    "year",
    "note",
    "updated",
] as const;

export const ALBUM_REQUIRED_FIELDS = ["id", "name", "place", "photos", "updated"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === "string" && value.trim() !== "";

export function isLocalizedText(value: unknown): value is LocalizedText {
    return isRecord(value) && isNonEmptyString(value.zh) && isNonEmptyString(value.en);
}

export function isIsoMonth(value: unknown): value is string {
    return typeof value === "string" && ISO_MONTH.test(value);
}

export function isIsoDay(value: unknown): value is string {
    // 只验格式不够：`2026-02-31` 能过正则，而 Date.parse 会静默归一成 2026-03-03，
    // 于是「显示的日期」和「算新鲜度用的日期」差几天且永不报错。round-trip 一次钉死。
    if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
    const time = Date.parse(`${value}T00:00:00Z`);
    return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function isHttpUrl(value: unknown): value is string {
    return typeof value === "string" && HTTP.test(value);
}

/** 站内静态图（`/images/…`）或 **https** 绝对地址；挡 `data:`、相对路径与 http 明文。 */
export function isImageRef(value: unknown): value is string {
    return typeof value === "string" && (SITE_IMAGE.test(value) || HTTPS.test(value));
}

/** 有限数值 + 闭区间；显式判掉 `NaN` / `Infinity`。 */
const isNumberIn = (value: unknown, min: number, max: number): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

/** 非空字符串且 ≤max 字符（v2 的 `model` / `category` 长度上限共用）。 */
const isBoundedString = (value: unknown, max: number): value is string =>
    isNonEmptyString(value) && value.length <= max;

/** 小写连字符 slug 且 ≤max 字符（`category` 这种开放集合只卡形状，不卡枚举）。 */
const isKebabSlug = (value: unknown, max: number): value is string =>
    isBoundedString(value, max) && SLUG.test(value);

/** 1–5、0.5 步进；`*2` 判整避开浮点 `% 0.5` 的噪声（`4.3 * 2 = 8.6` 立刻判红）。 */
const isRating = (value: unknown): value is number =>
    isNumberIn(value, 1, 5) && (value * 2) % 1 === 0;

/** 只收 https 绝对地址（返利链接；图片走 `isImageRef`）。 */
const isHttpsUrl = (value: unknown): value is string =>
    typeof value === "string" && HTTPS.test(value);

/** 字符串数组且元素是 slug（v2 的 `relatedProjects` / `relatedArticles` 共用）。 */
const isSlugArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => isNonEmptyString(item) && SLUG.test(item));

/** 链接语义标签闭集（v2）；只有这几个值能进 `EntityLink.kind`。 */
const LINK_KINDS: readonly EntityLinkKind[] = ["github", "demo", "docs", "other"];

/** `EntityLink` 的形状：label + http(s) href + 可选 kind（四处 `links` 校验共用一份）。 */
export function isEntityLink(value: unknown): value is EntityLink {
    if (!isRecord(value)) return false;
    if (!isNonEmptyString(value.label) || !isHttpUrl(value.href)) return false;
    return value.kind === undefined || LINK_KINDS.includes(value.kind as EntityLinkKind);
}

/** 单条项目的结构问题；返回空数组 = 合法。 */
export function validateProject(value: unknown): string[] {
    if (!isRecord(value)) return ["不是对象"];

    const problems: string[] = [];
    const at = (field: string) => `projects[${String(value.id ?? "?")}].${field}`;

    if (!isNonEmptyString(value.id) || !SLUG.test(value.id))
        problems.push(`${at("id")} 必须是小写连字符 slug`);
    if (!isLocalizedText(value.title)) problems.push(`${at("title")} 需要 zh + en 两个非空字符串`);
    if (!isLocalizedText(value.summary))
        problems.push(`${at("summary")} 需要 zh + en 两个非空字符串`);
    if (!PROJECT_STATUSES.includes(value.status as ProjectStatus))
        problems.push(`${at("status")} 必须是 ${PROJECT_STATUSES.join(" / ")}`);
    if (!isIsoMonth(value.started)) problems.push(`${at("started")} 必须是 YYYY-MM`);
    if (value.ended !== undefined && value.ended !== null && !isIsoMonth(value.ended))
        problems.push(`${at("ended")} 必须是 YYYY-MM 或 null`);
    if (value.role !== undefined && !isLocalizedText(value.role))
        problems.push(`${at("role")} 需要 zh + en 两个非空字符串`);
    if (
        !Array.isArray(value.stack) ||
        value.stack.length === 0 ||
        !value.stack.every(isNonEmptyString)
    )
        problems.push(`${at("stack")} 必须是非空字符串数组（至少一项）`);
    if (
        value.highlights !== undefined &&
        (!Array.isArray(value.highlights) || !value.highlights.every(isLocalizedText))
    )
        problems.push(`${at("highlights")} 必须是双语条目数组`);
    // ── v2 可选字段：present-only（缺省一律通过，有值才校验形状/范围） ──
    if (value.category !== undefined && !isKebabSlug(value.category, CATEGORY_MAX))
        problems.push(`${at("category")} 必须是小写连字符 slug（≤${CATEGORY_MAX} 字符）`);
    if (value.featured !== undefined && typeof value.featured !== "boolean")
        problems.push(`${at("featured")} 必须是 boolean（缺省 = false）`);
    if (value.coverImage !== undefined && !isImageRef(value.coverImage))
        problems.push(
            `${at("coverImage")} 必须是站内图片路径（以 / 开头、带扩展名）或 https 绝对地址`,
        );
    if (value.metrics !== undefined) {
        const ok =
            Array.isArray(value.metrics) &&
            value.metrics.length <= METRIC_MAX &&
            value.metrics.every(
                (metric) =>
                    isRecord(metric) &&
                    isLocalizedText(metric.label) &&
                    isNonEmptyString(metric.value) &&
                    metric.value.length <= METRIC_VALUE_MAX &&
                    (metric.unit === undefined || isNonEmptyString(metric.unit)),
            );
        if (!ok)
            problems.push(
                `${at("metrics")} 必须是 ≤${METRIC_MAX} 条 { label(zh+en), value(≤${METRIC_VALUE_MAX} 字符), unit? }`,
            );
    }
    if (value.links !== undefined) {
        const ok = Array.isArray(value.links) && value.links.every(isEntityLink);
        if (!ok) problems.push(`${at("links")} 每项需要 label 与非空 http(s) href`);
    }
    if (!isIsoDay(value.updated)) problems.push(`${at("updated")} 必须是 YYYY-MM-DD`);

    return problems;
}

/** 单组技能的结构问题；返回空数组 = 合法。 */
export function validateSkillGroup(value: unknown): string[] {
    if (!isRecord(value)) return ["不是对象"];

    const problems: string[] = [];
    const at = (field: string) => `skills[${String(value.id ?? "?")}].${field}`;

    if (!isNonEmptyString(value.id) || !SLUG.test(value.id))
        problems.push(`${at("id")} 必须是小写连字符 slug`);
    if (!isLocalizedText(value.title)) problems.push(`${at("title")} 需要 zh + en 两个非空字符串`);
    if (value.summary !== undefined && !isLocalizedText(value.summary))
        problems.push(`${at("summary")} 需要 zh + en 两个非空字符串`);
    if (!isIsoDay(value.updated)) problems.push(`${at("updated")} 必须是 YYYY-MM-DD`);

    if (!Array.isArray(value.items) || value.items.length === 0) {
        problems.push(`${at("items")} 必须是非空数组`);
        return problems;
    }
    value.items.forEach((item, index) => {
        const where = `${at("items")}[${index}]`;
        if (!isRecord(item)) {
            problems.push(`${where} 不是对象`);
            return;
        }
        if (!isNonEmptyString(item.name)) problems.push(`${where}.name 必须是非空字符串`);
        if (!SKILL_LEVELS.includes(item.level as SkillLevel))
            problems.push(`${where}.level 必须是 ${SKILL_LEVELS.join(" / ")}`);
        if (item.since !== undefined && !(typeof item.since === "string" && YEAR.test(item.since)))
            problems.push(`${where}.since 必须是 YYYY`);
        if (item.note !== undefined && !isLocalizedText(item.note))
            problems.push(`${where}.note 需要 zh + en 两个非空字符串`);
        // ── v2 可选字段：present-only（缺省一律通过，有值才校验） ──
        if (item.percent !== undefined && !isNumberIn(item.percent, 0, 100))
            problems.push(`${where}.percent 必须是 0–100 的数值（展示辅助，不替代 level）`);
        if (item.years !== undefined && !isNumberIn(item.years, 0, 60))
            problems.push(`${where}.years 必须是 0–60 的数值`);
        if (item.icon !== undefined && !(typeof item.icon === "string" && ICON_ID.test(item.icon)))
            problems.push(`${where}.icon 必须是 sprite id 形状（如 mingcute:code-line）`);
        if (item.highlight !== undefined && typeof item.highlight !== "boolean")
            problems.push(`${where}.highlight 必须是 boolean（缺省 = false）`);
        if (item.relatedProjects !== undefined && !isSlugArray(item.relatedProjects))
            problems.push(`${where}.relatedProjects 必须是项目 id 数组（小写连字符 slug）`);
        if (item.relatedArticles !== undefined && !isSlugArray(item.relatedArticles))
            problems.push(`${where}.relatedArticles 必须是文章 slug 数组（小写连字符）`);
    });

    return problems;
}

/** 单台设备的结构问题；返回空数组 = 合法。 */
export function validateDevice(value: unknown): string[] {
    if (!isRecord(value)) return ["不是对象"];

    const problems: string[] = [];
    const at = (field: string) => `devices[${String(value.id ?? "?")}].${field}`;

    if (!isNonEmptyString(value.id) || !SLUG.test(value.id))
        problems.push(`${at("id")} 必须是小写连字符 slug`);
    if (!isNonEmptyString(value.name)) problems.push(`${at("name")} 必须是非空字符串`);
    if (!DEVICE_CATEGORIES.includes(value.category as DeviceCategory))
        problems.push(`${at("category")} 必须是 ${DEVICE_CATEGORIES.join(" / ")}`);
    if (!DEVICE_STATUSES.includes(value.status as DeviceStatus))
        problems.push(`${at("status")} 必须是 ${DEVICE_STATUSES.join(" / ")}`);
    if (
        !Array.isArray(value.specs) ||
        value.specs.length === 0 ||
        !value.specs.every(isNonEmptyString)
    )
        problems.push(`${at("specs")} 必须是非空字符串数组（至少一项）`);
    if (!isLocalizedText(value.note)) problems.push(`${at("note")} 需要 zh + en 两个非空字符串`);
    if (value.since !== undefined && !isIsoMonth(value.since))
        problems.push(`${at("since")} 必须是 YYYY-MM`);
    if (value.until !== undefined && value.until !== null && !isIsoMonth(value.until))
        problems.push(`${at("until")} 必须是 YYYY-MM 或 null`);
    // 已退役却没有退役时间：页面上会显示「已退役 · 2024.05 — 至今」，自相矛盾。
    if (value.status === "retired" && !isIsoMonth(value.until))
        problems.push(`${at("until")} 状态为 retired 时必须填退役年月`);
    if (isIsoMonth(value.since) && isIsoMonth(value.until) && value.until < value.since)
        problems.push(`${at("until")} 不能早于 since（${value.until} < ${value.since}）`);
    // ── v2 可选字段：present-only（缺省一律通过，有值才校验形状/范围） ──
    if (value.model !== undefined && !isBoundedString(value.model, MODEL_MAX))
        problems.push(`${at("model")} 必须是非空字符串且 ≤${MODEL_MAX} 字符`);
    if (value.image !== undefined && !isImageRef(value.image))
        problems.push(`${at("image")} 必须是站内图片路径（以 / 开头、带扩展名）或 https 绝对地址`);
    // 0.5 步进见 `isRating`：`4.3 * 2 = 8.6` 不是整数 → 判红。
    if (value.rating !== undefined && !isRating(value.rating))
        problems.push(`${at("rating")} 必须是 1–5 且以 0.5 步进的数值（不打分就别写这个字段）`);
    if (value.affiliateLink !== undefined && !isHttpsUrl(value.affiliateLink))
        problems.push(`${at("affiliateLink")} 必须是 https 绝对地址（返利链接不走明文 http）`);
    if (value.affiliateDisclosure !== undefined && !isLocalizedText(value.affiliateDisclosure))
        problems.push(`${at("affiliateDisclosure")} 需要 zh + en 两个非空字符串`);
    // 合规硬约束：有推广链接就必须有披露文案（页面必须可见），缺一即判红。
    if (value.affiliateLink !== undefined && value.affiliateDisclosure === undefined)
        problems.push(`${at("affiliateDisclosure")} 有 affiliateLink 时必须同时给出披露文案`);
    if (value.specPairs !== undefined) {
        const ok =
            Array.isArray(value.specPairs) &&
            value.specPairs.length <= SPEC_PAIR_MAX &&
            value.specPairs.every(
                (pair) =>
                    isRecord(pair) && isNonEmptyString(pair.label) && isNonEmptyString(pair.value),
            );
        if (!ok)
            problems.push(
                `${at("specPairs")} 必须是 ≤${SPEC_PAIR_MAX} 条 { label, value } 的非空字符串对`,
            );
    }
    if (value.featured !== undefined && typeof value.featured !== "boolean")
        problems.push(`${at("featured")} 必须是 boolean（缺省 = false）`);
    if (value.links !== undefined) {
        const ok = Array.isArray(value.links) && value.links.every(isEntityLink);
        if (!ok) problems.push(`${at("links")} 每项需要 label 与非空 http(s) href`);
    }
    if (!isIsoDay(value.updated)) problems.push(`${at("updated")} 必须是 YYYY-MM-DD`);

    return problems;
}

/** 单条游戏记录的结构问题；返回空数组 = 合法。 */
export function validateGame(value: unknown): string[] {
    if (!isRecord(value)) return ["不是对象"];

    const problems: string[] = [];
    const at = (field: string) => `games[${String(value.id ?? "?")}].${field}`;

    if (!isNonEmptyString(value.id) || !SLUG.test(value.id))
        problems.push(`${at("id")} 必须是小写连字符 slug`);
    if (!isLocalizedText(value.title)) problems.push(`${at("title")} 需要 zh + en 两个非空字符串`);
    if (
        !Array.isArray(value.platforms) ||
        value.platforms.length === 0 ||
        !value.platforms.every((platform) => GAME_PLATFORMS.includes(platform as GamePlatform))
    )
        problems.push(`${at("platforms")} 必须是 ${GAME_PLATFORMS.join(" / ")} 的非空子集`);
    if (!GAME_STATUSES.includes(value.status as GameStatus))
        problems.push(`${at("status")} 必须是 ${GAME_STATUSES.join(" / ")}`);
    if (value.year !== undefined && !(typeof value.year === "string" && YEAR.test(value.year)))
        problems.push(`${at("year")} 必须是 YYYY`);
    if (
        value.hours !== undefined &&
        !(
            typeof value.hours === "number" &&
            Number.isInteger(value.hours) &&
            value.hours >= 1 &&
            value.hours <= 9999
        )
    )
        problems.push(`${at("hours")} 必须是 1–9999 的整数（没统计就别写这个字段）`);
    if (
        value.rating !== undefined &&
        !(
            typeof value.rating === "number" &&
            Number.isInteger(value.rating) &&
            value.rating >= 1 &&
            value.rating <= 5
        )
    )
        problems.push(`${at("rating")} 必须是 1–5 的整数（不打分就别写这个字段，别写 0）`);
    if (!isLocalizedText(value.note)) problems.push(`${at("note")} 需要 zh + en 两个非空字符串`);
    if (!isIsoDay(value.updated)) problems.push(`${at("updated")} 必须是 YYYY-MM-DD`);

    return problems;
}

/** `YYYY-MM` 或 `YYYY-MM-DD`；两种精度都合法（见 TimelineEvent.date）。 */
export function isTimelineDate(value: unknown): value is string {
    return isIsoMonth(value) || isIsoDay(value);
}

/** 单条时间线事件的结构问题；返回空数组 = 合法。 */
export function validateTimelineEvent(value: unknown): string[] {
    if (!isRecord(value)) return ["不是对象"];

    const problems: string[] = [];
    const at = (field: string) => `timeline[${String(value.id ?? "?")}].${field}`;

    if (!isNonEmptyString(value.id) || !SLUG.test(value.id))
        problems.push(`${at("id")} 必须是小写连字符 slug`);
    if (!isTimelineDate(value.date))
        problems.push(`${at("date")} 必须是 YYYY-MM 或 YYYY-MM-DD（不知道哪一天就只写月份）`);
    if (!isLocalizedText(value.title)) problems.push(`${at("title")} 需要 zh + en 两个非空字符串`);
    if (!isLocalizedText(value.detail))
        problems.push(`${at("detail")} 需要 zh + en 两个非空字符串`);
    if (!TIMELINE_KINDS.includes(value.kind as TimelineKind))
        problems.push(`${at("kind")} 必须是 ${TIMELINE_KINDS.join(" / ")}`);
    if (
        value.tags !== undefined &&
        (!Array.isArray(value.tags) ||
            value.tags.length === 0 ||
            !value.tags.every(isNonEmptyString))
    )
        problems.push(`${at("tags")} 必须是非空字符串数组（至少一项）`);
    if (value.links !== undefined) {
        const ok = Array.isArray(value.links) && value.links.every(isEntityLink);
        if (!ok) problems.push(`${at("links")} 每项需要 label 与非空 http(s) href`);
    }
    if (!isIsoDay(value.updated)) problems.push(`${at("updated")} 必须是 YYYY-MM-DD`);

    return problems;
}

/** 单条歌单作品的结构问题；返回空数组 = 合法。 */
export function validateMusicTrack(value: unknown): string[] {
    if (!isRecord(value)) return ["不是对象"];

    const problems: string[] = [];
    const at = (field: string) => `music[${String(value.id ?? "?")}].${field}`;

    if (!isNonEmptyString(value.id) || !SLUG.test(value.id))
        problems.push(`${at("id")} 必须是小写连字符 slug`);
    if (!isNonEmptyString(value.title)) problems.push(`${at("title")} 必须是非空字符串`);
    if (!isNonEmptyString(value.artist)) problems.push(`${at("artist")} 必须是非空字符串`);
    if (!MUSIC_FORMATS.includes(value.format as MusicFormat))
        problems.push(`${at("format")} 必须是 ${MUSIC_FORMATS.join(" / ")}`);
    if (!(typeof value.year === "string" && YEAR.test(value.year)))
        problems.push(`${at("year")} 必须是 YYYY（只知道年份就只写年份）`);
    if (value.cover !== undefined && !SITE_IMAGE.test(String(value.cover)))
        problems.push(
            `${at("cover")} 必须是站点内图片路径（以 / 开头、带扩展名），相对路径或外链一律不收`,
        );
    if (!isLocalizedText(value.note)) problems.push(`${at("note")} 需要 zh + en 两个非空字符串`);
    // 试听源只收 http(s)：相对路径会让 `<audio src>` 打到本站静态目录，
    // 等于偷偷变成「自托管音频」，与 M2 边界冲突。
    if (value.audio !== undefined && !isHttpUrl(value.audio))
        problems.push(`${at("audio")} 必须是 http(s) 绝对地址（本站不自托管音频；没有源就别写）`);
    if (value.links !== undefined) {
        const ok = Array.isArray(value.links) && value.links.every(isEntityLink);
        if (!ok) problems.push(`${at("links")} 每项需要 label 与非空 http(s) href`);
    }
    if (!isIsoDay(value.updated)) problems.push(`${at("updated")} 必须是 YYYY-MM-DD`);

    return problems;
}

/** 相册条目的结构问题；返回空数组 = 合法。 */
export function validateAlbum(value: unknown): string[] {
    if (!isRecord(value)) return ["不是对象"];

    const problems: string[] = [];
    const at = (field: string) => `albums[${String(value.id ?? "?")}].${field}`;

    // id 允许下划线：既有 URL 就是这个形状（`shenzhen_feng-huang-shan`），不改线上地址。
    if (!isNonEmptyString(value.id) || !ALBUM_ID.test(value.id))
        problems.push(`${at("id")} 必须是小写 slug（允许下划线，沿用既有 URL）`);
    if (!isLocalizedText(value.name)) problems.push(`${at("name")} 需要 zh + en 两个非空字符串`);
    if (!ALBUM_PLACES.includes(value.place as AlbumPlace))
        problems.push(`${at("place")} 必须是 ${ALBUM_PLACES.join(" / ")}`);
    if (!Array.isArray(value.photos) || value.photos.length === 0) {
        problems.push(`${at("photos")} 必须是非空数组（空相册就别建条目）`);
    } else {
        if (!value.photos.every((photo) => PIC_PATH.test(String(photo))))
            problems.push(
                `${at("photos")} 每项必须是以 / 开头的图床路径（不带扩展名、不带宽度、无 ..）`,
            );
        if (new Set(value.photos).size !== value.photos.length)
            problems.push(`${at("photos")} 有重复照片`);
    }
    if (!isIsoDay(value.updated)) problems.push(`${at("updated")} 必须是 YYYY-MM-DD`);

    return problems;
}

export function validateMeta(value: unknown): string[] {
    if (!isRecord(value)) return ["meta 不是对象"];
    const problems: string[] = [];
    if (!isIsoDay(value.updated)) problems.push("meta.updated 必须是 YYYY-MM-DD");
    // 归属到人（14 §7 规则 4）：M2-7b 起必填，不许靠「写了就好」。
    if (!isNonEmptyString(value.owner)) problems.push("meta.owner 必填（14 §7 规则 4：归属到人）");
    if (value.source !== undefined && !isNonEmptyString(value.source))
        problems.push("meta.source 必须是非空字符串");
    return problems;
}

/* ───────────────────────── 实体规格 ───────────────────────── */

/**
 * 可选字段声明（v2，门禁 E2b / E9 用），与 `requiredFields` 对称：契约只声明边界与坏值，
 * 门禁据此组装 fixture —— 必填「删掉必须红」，可选「缺省必须绿 + 有值必须校验」。 */
export interface OptionalField {
    /** 字段名（报告用）。 */
    name: string;
    /** 样例里的定位路径；缺省 = name（技能字段在 `items[0].` 下）。 */
    path?: string;
    /** 值级边界：回填后必须被判红（枚举越界 / 正则 / 数值越界）。 */
    invalid?: readonly unknown[];
    /** 条件必填 / 至少共存一：E9 据此生成跨字段矛盾样例。 */
    requires?: readonly string[];
    alternatives?: readonly string[];
}

export interface EntitySpec<T> {
    kind: EntityKind;
    /** 结构校验；空数组 = 通过。 */
    validate(value: unknown): string[];
    /** 条目级的最后更新日期（门禁按它逐条判新鲜度）。 */
    updatedOf(value: T): string | null;
    /** 定位一个条目（门禁打印与去重用）。 */
    keyOf(value: T): string;
    /**
     * 必填字段（门禁 E8 用）：**必须是 validate 真正拦的那几个**。
     * 门禁会逐字段删掉再校验，删掉能过 = 这份清单和校验器脱节。
     */
    requiredFields: readonly string[];
    /** v2 可选字段（E2b 缺省必绿 / E9 值级与跨字段必红）；没有可选字段的实体给 `[]`。 */
    optionalFields: readonly OptionalField[];
    /**
     * 一条最小合法样例（门禁 E8 的负向基准，不进页面）。
     * E8 不硬编码样例：加实体的人只在这里写一次，负向覆盖自动长出来。
     */
    sample(): Record<string, unknown>;
    /**
     * 值级坏样例（枚举越界 / 日期格式 / 嵌套字段缺失 / 交叉字段矛盾）。
     * 「必填字段被删」由门禁自动生成，不用在这里重复。
     */
    negatives(): ReadonlyArray<readonly [string, Record<string, unknown>]>;
}

/* ───────────────────────── 样例（门禁用） ───────────────────────── */

const projectMetricList = (count: number, value = "42"): Record<string, unknown>[] =>
    Array.from({ length: count }, (_, index) => ({
        label: { zh: `指标 ${index}`, en: `Metric ${index}` },
        value,
    }));

const projectSample = (): Record<string, unknown> => ({
    id: "demo",
    title: { zh: "示例", en: "Demo" },
    summary: { zh: "说明", en: "Summary" },
    status: "active",
    started: "2026-01",
    ended: null,
    stack: ["Astro"],
    // v2 可选字段也进样例：E8 会逐个删掉非必填字段要求仍然合法，正反两向自动覆盖。
    category: "site-infra",
    featured: true,
    coverImage: "/images/projects/demo.webp",
    metrics: [{ label: { zh: "页面", en: "Pages" }, value: "42", unit: "页" }],
    updated: "2026-01-01",
});

const skillGroupSample = (): Record<string, unknown> => ({
    id: "demo",
    title: { zh: "示例", en: "Demo" },
    items: [
        {
            name: "Astro",
            level: "solid",
            percent: 85,
            years: 3,
            icon: "mingcute:code-line",
            highlight: true,
            relatedProjects: ["demo"],
            relatedArticles: ["demo-post"],
        },
    ],
    updated: "2026-01-01",
});

const skillItem = (overrides: Record<string, unknown>): Record<string, unknown> => ({
    name: "Astro",
    level: "solid",
    ...overrides,
});

/** 技能的坏样例底座：只覆盖条目里要坏的那一个字段。 */
const skillNeg = (overrides: Record<string, unknown>): Record<string, unknown> => ({
    ...skillGroupSample(),
    items: [skillItem(overrides)],
});

/** 设备的坏样例底座。 */
const deviceNeg = (overrides: Record<string, unknown>): Record<string, unknown> => ({
    ...deviceSample(),
    ...overrides,
});

const nineSpecPairs = (): Record<string, unknown>[] =>
    Array.from({ length: SPEC_PAIR_MAX + 1 }, () => ({ label: "CPU", value: "Demo" }));

/** 推广披露文案（负向样例里的「合法一半」：链接错、披露对，才能证明是链接被判红）。 */
const DISCLOSURE: LocalizedText = {
    zh: "含推广链接，购买后我可能获得佣金",
    en: "Affiliate link — I may earn a commission",
};

const deviceSample = (): Record<string, unknown> => ({
    id: "demo-box",
    name: "Demo Box",
    category: "computer",
    status: "in-use",
    specs: ["Demo CPU", "16GB"],
    note: { zh: "示例设备", en: "Demo device" },
    since: "2024-01",
    // 条件必填对**成对**进样例：单缺 disclosure 会被 `requires` 判红，
    // 所以 E8 的「删非必填字段仍须合法」按 optionalFields.requires 豁免这两个字段（E2b/E9 正反两面验）。
    affiliateLink: "https://example.com/demo-box?tag=demo",
    affiliateDisclosure: DISCLOSURE,
    model: "Demo Box 1",
    image: "/images/devices/demo.webp",
    rating: 4.5,
    specPairs: [{ label: "CPU", value: "Demo CPU" }],
    featured: true,
    updated: "2026-01-01",
});

const gameSample = (): Record<string, unknown> => ({
    id: "demo-game",
    title: { zh: "示例游戏", en: "Demo Game" },
    platforms: ["pc"],
    status: "finished",
    year: "2025",
    hours: 30,
    rating: 4,
    note: { zh: "示例评价", en: "Demo note" },
    updated: "2026-01-01",
});

export const projectSpec: EntitySpec<Project> = {
    kind: "projects",
    validate: validateProject,
    updatedOf: (project) => (isIsoDay(project.updated) ? project.updated : null),
    keyOf: (project) => project.id,
    requiredFields: PROJECT_REQUIRED_FIELDS,
    optionalFields: [
        { name: "category", invalid: ["Site Infra", "a".repeat(25)] },
        { name: "featured", invalid: ["yes"] },
        { name: "coverImage", invalid: ["images/a.webp", "data:image/png;base64,AA"] },
        { name: "metrics", invalid: [projectMetricList(7), projectMetricList(1, "1".repeat(13))] },
    ],
    sample: projectSample,
    negatives: () => [
        ["en 为空串", { ...projectSample(), title: { zh: "示例", en: "" } }],
        ["status 越界", { ...projectSample(), status: "doing" }],
        ["started 不是 YYYY-MM", { ...projectSample(), started: "2026/01" }],
        ["ended 不是 YYYY-MM", { ...projectSample(), ended: "2026" }],
        ["stack 空数组", { ...projectSample(), stack: [] }],
        [
            "links 非 http",
            { ...projectSample(), links: [{ label: "x", href: "javascript:alert(1)" }] },
        ],
        ["id 不是 slug", { ...projectSample(), id: "Demo Project" }],
        // ── v2 可选字段：present-only 的值级坏样例（缺省方向由 E8 的「删字段仍合法」覆盖） ──
        ["category 不是 slug", { ...projectSample(), category: "Site Infra" }],
        ["category 超 24 字符", { ...projectSample(), category: "a".repeat(25) }],
        ["featured 非 boolean", { ...projectSample(), featured: "yes" }],
        ["coverImage 相对路径", { ...projectSample(), coverImage: "images/a.webp" }],
        ["coverImage 是 data:", { ...projectSample(), coverImage: "data:image/png;base64,AA" }],
        ["metrics 超 6 条", { ...projectSample(), metrics: projectMetricList(7) }],
        [
            "metric value 超 12 字符",
            { ...projectSample(), metrics: projectMetricList(1, "1".repeat(13)) },
        ],
        [
            "metrics label 缺 en",
            { ...projectSample(), metrics: [{ label: { zh: "页" }, value: "1" }] },
        ],
        // 正则能过、日历不存在：Date.parse 会静默归一成 03-03，必须判出
        ["updated 不是真实日历日", { ...projectSample(), updated: "2026-02-31" }],
    ],
};

export const skillGroupSpec: EntitySpec<SkillGroup> = {
    kind: "skills",
    validate: validateSkillGroup,
    updatedOf: (group) => (isIsoDay(group.updated) ? group.updated : null),
    keyOf: (group) => group.id,
    requiredFields: SKILL_GROUP_REQUIRED_FIELDS,
    optionalFields: [
        { name: "percent", path: "items[0].percent", invalid: [101, -1] },
        { name: "years", path: "items[0].years", invalid: [61, -1] },
        { name: "icon", path: "items[0].icon", invalid: ["code", "Mingcute:Code"] },
        { name: "highlight", path: "items[0].highlight", invalid: [1] },
        { name: "relatedProjects", path: "items[0].relatedProjects", invalid: [["Demo"], "demo"] },
        { name: "relatedArticles", path: "items[0].relatedArticles", invalid: [[" "]] },
    ],
    sample: skillGroupSample,
    negatives: () => [
        ["items 空数组", { ...skillGroupSample(), items: [] }],
        ["level 越界", { ...skillGroupSample(), items: [{ name: "Astro", level: "master" }] }],
        ["条目缺 name", { ...skillGroupSample(), items: [{ level: "solid" }] }],
        [
            "条目的 since 不是 YYYY",
            { ...skillGroupSample(), items: [{ name: "Astro", level: "solid", since: "26" }] },
        ],
        // ── v2 可选字段：present-only 的值级坏样例 ──
        ["percent 越界（101）", skillNeg({ percent: 101 })],
        ["years 越界（61）", skillNeg({ years: 61 })],
        ["icon 不是 sprite id", skillNeg({ icon: "code" })],
        ["highlight 非 boolean", skillNeg({ highlight: 1 })],
        ["relatedProjects 非 slug", skillNeg({ relatedProjects: ["Demo"] })],
        ["relatedArticles 空串", skillNeg({ relatedArticles: [" "] })],
    ],
};

export const deviceSpec: EntitySpec<Device> = {
    kind: "devices",
    validate: validateDevice,
    updatedOf: (device) => (isIsoDay(device.updated) ? device.updated : null),
    keyOf: (device) => device.id,
    requiredFields: DEVICE_REQUIRED_FIELDS,
    optionalFields: [
        { name: "model", invalid: ["M".repeat(49), "  "] },
        { name: "image", invalid: ["images/a.webp", "data:image/png;base64,AA"] },
        { name: "rating", invalid: [6, 4.3, 0] },
        // 合规对：有 affiliateLink 必须有披露；specPairs 与 specs 不能同时缺
        { name: "affiliateLink", invalid: ["http://a.co/buy"], requires: ["affiliateDisclosure"] },
        { name: "affiliateDisclosure", invalid: [{ zh: "披露" }] },
        { name: "specPairs", invalid: [nineSpecPairs()], alternatives: ["specs"] },
        { name: "featured", invalid: ["yes"] },
    ],
    sample: deviceSample,
    negatives: () => [
        ["category 越界", { ...deviceSample(), category: "tablet" }],
        ["status 越界", { ...deviceSample(), status: "dead" }],
        ["name 空串", { ...deviceSample(), name: "   " }],
        ["specs 空数组", { ...deviceSample(), specs: [] }],
        ["note 缺 en", { ...deviceSample(), note: { zh: "示例" } }],
        ["retired 但缺 until", { ...deviceSample(), status: "retired" }],
        ["until 早于 since", { ...deviceSample(), since: "2024-06", until: "2024-01" }],
        ["since 不是 YYYY-MM", { ...deviceSample(), since: "2024" }],
        // ── v2 可选字段：present-only 的值级坏样例（含跨字段矛盾） ──
        ["model 超 48 字符", deviceNeg({ model: "M".repeat(49) })],
        ["image 相对路径", deviceNeg({ image: "images/a.webp" })],
        ["rating 非 0.5 步进", deviceNeg({ rating: 4.3 })],
        ["rating 越界（6）", deviceNeg({ rating: 6 })],
        // 合规：有返利链接却没有披露文案，必须判红（样例里成对，故显式抹掉 disclosure）
        [
            "affiliateLink 无披露",
            deviceNeg({ affiliateLink: "https://a.co/buy", affiliateDisclosure: undefined }),
        ],
        [
            "affiliateLink 非 https",
            deviceNeg({ affiliateLink: "http://a.co/buy", affiliateDisclosure: DISCLOSURE }),
        ],
        ["affiliateDisclosure 缺 en", deviceNeg({ affiliateDisclosure: { zh: "披露" } })],
        ["specPairs 超 8 条", deviceNeg({ specPairs: nineSpecPairs() })],
        ["featured 非 boolean", deviceNeg({ featured: 1 })],
        [
            "links kind 越界",
            deviceNeg({ links: [{ label: "x", href: "https://a.co", kind: "repo" }] }),
        ],
        ["links 非 http", { ...deviceSample(), links: [{ label: "x", href: "/relative" }] }],
        ["updated 不是真实日历日", { ...deviceSample(), updated: "2026-02-31" }],
    ],
};

export const gameSpec: EntitySpec<Game> = {
    kind: "games",
    validate: validateGame,
    updatedOf: (game) => (isIsoDay(game.updated) ? game.updated : null),
    keyOf: (game) => game.id,
    requiredFields: GAME_REQUIRED_FIELDS,
    optionalFields: [],
    sample: gameSample,
    negatives: () => [
        ["platforms 空数组", { ...gameSample(), platforms: [] }],
        ["platform 越界", { ...gameSample(), platforms: ["pc", "dreamcast"] }],
        ["status 越界", { ...gameSample(), status: "dropped" }],
        ["hours = 0", { ...gameSample(), hours: 0 }],
        ["hours 非整数", { ...gameSample(), hours: 12.5 }],
        ["rating 越界（6）", { ...gameSample(), rating: 6 }],
        ["rating = 0", { ...gameSample(), rating: 0 }],
        ["year 不是 YYYY", { ...gameSample(), year: "2025-03" }],
        ["title en 为空串", { ...gameSample(), title: { zh: "示例", en: "" } }],
        ["updated 不是真实日历日", { ...gameSample(), updated: "2026-02-31" }],
    ],
};

const timelineSample = (): Record<string, unknown> => ({
    id: "demo-event",
    date: "2026-01-01",
    title: { zh: "示例事件", en: "Demo event" },
    detail: { zh: "示例说明", en: "Demo detail" },
    kind: "build",
    tags: ["Astro"],
    updated: "2026-01-01",
});

export const timelineSpec: EntitySpec<TimelineEvent> = {
    kind: "timeline",
    validate: validateTimelineEvent,
    updatedOf: (event) => (isIsoDay(event.updated) ? event.updated : null),
    keyOf: (event) => event.id,
    requiredFields: TIMELINE_REQUIRED_FIELDS,
    optionalFields: [],
    sample: timelineSample,
    negatives: () => [
        ["date 既不是月也不是日（斜杠）", { ...timelineSample(), date: "2026/01" }],
        // 正则能过、日历不存在：按月校验 `2026-02-31` 不匹配，按日校验 round-trip 失败
        ["date 不是真实日历日", { ...timelineSample(), date: "2026-02-31" }],
        ["kind 越界", { ...timelineSample(), kind: "release" }],
        ["title 缺 en", { ...timelineSample(), title: { zh: "示例事件" } }],
        ["detail 空串", { ...timelineSample(), detail: { zh: "", en: "" } }],
        ["tags 空数组", { ...timelineSample(), tags: [] }],
        ["tags 含空串", { ...timelineSample(), tags: ["Astro", " "] }],
        ["links 非 http", { ...timelineSample(), links: [{ label: "x", href: "/relative" }] }],
        ["id 不是 slug", { ...timelineSample(), id: "Demo Event" }],
        ["updated 不是真实日历日", { ...timelineSample(), updated: "2026-02-31" }],
    ],
};

const musicSample = (): Record<string, unknown> => ({
    id: "demo-track",
    title: "Demo Track",
    artist: "Demo Artist",
    format: "album",
    year: "2026",
    cover: "/images/demo/demo.webp",
    note: { zh: "示例说明", en: "Demo note" },
    audio: "https://example.com/demo.mp3",
    links: [{ label: "Douban", href: "https://music.douban.com/subject/1/" }],
    updated: "2026-01-01",
});

export const musicSpec: EntitySpec<MusicTrack> = {
    kind: "music",
    validate: validateMusicTrack,
    updatedOf: (track) => (isIsoDay(track.updated) ? track.updated : null),
    keyOf: (track) => track.id,
    requiredFields: MUSIC_REQUIRED_FIELDS,
    optionalFields: [],
    sample: musicSample,
    negatives: () => [
        ["format 越界（ep）", { ...musicSample(), format: "ep" }],
        ["year 写成 YYYY-MM", { ...musicSample(), year: "2026-01" }],
        ["title 空串", { ...musicSample(), title: "   " }],
        ["artist 缺字段", { ...musicSample(), artist: undefined }],
        ["note 缺 en", { ...musicSample(), note: { zh: "示例说明" } }],
        ["id 不是 slug", { ...musicSample(), id: "Demo Track" }],
        // 相对路径 = 偷偷自托管音频；本站边界是不托管，必须判红
        ["audio 是站内相对路径", { ...musicSample(), audio: "/assets/demo.mp3" }],
        ["audio 是 javascript: 伪协议", { ...musicSample(), audio: "javascript:alert(1)" }],
        ["cover 是相对路径", { ...musicSample(), cover: "images/demo/demo.webp" }],
        ["cover 没有扩展名", { ...musicSample(), cover: "/images/demo/demo" }],
        ["links 非 http", { ...musicSample(), links: [{ label: "x", href: "/relative" }] }],
        ["updated 不是真实日历日", { ...musicSample(), updated: "2026-02-31" }],
    ],
};

const albumSample = (): Record<string, unknown> => ({
    id: "demo_album",
    name: { zh: "示例相册", en: "Demo album" },
    place: "shenzhen",
    photos: [
        "/travel/demo/IMG_20260101_120000-abcdef12",
        "/travel/demo/IMG_20260101_120500-12345678",
    ],
    updated: "2026-01-01",
});

export const albumSpec: EntitySpec<Album> = {
    kind: "albums",
    validate: validateAlbum,
    updatedOf: (album) => (isIsoDay(album.updated) ? album.updated : null),
    keyOf: (album) => album.id,
    requiredFields: ALBUM_REQUIRED_FIELDS,
    optionalFields: [],
    sample: albumSample,
    negatives: () => [
        ["place 越界（beijing）", { ...albumSample(), place: "beijing" }],
        ["photos 空数组", { ...albumSample(), photos: [] }],
        [
            "photos 不是数组",
            { ...albumSample(), photos: "/travel/demo/IMG_20260101_120000-abcdef12" },
        ],
        // 相对路径 = 图床前缀拼错的典型形状
        [
            "photos 是相对路径",
            { ...albumSample(), photos: ["travel/demo/IMG_20260101_120000-abcdef12"] },
        ],
        // 带扩展名 = 把某个尺寸的成品图当成图床 key 存下来了
        ["photos 带扩展名", { ...albumSample(), photos: ["/travel/demo/IMG_20260101_120000.jpg"] }],
        ["photos 含 ..", { ...albumSample(), photos: ["/travel/../secret/IMG_20260101_120000"] }],
        ["photos 重复", { ...albumSample(), photos: ["/travel/demo/a-1", "/travel/demo/a-1"] }],
        ["name 缺 en", { ...albumSample(), name: { zh: "示例相册" } }],
        ["name 空串", { ...albumSample(), name: { zh: "  ", en: "Demo" } }],
        ["id 含大写", { ...albumSample(), id: "Demo_Album" }],
        ["id 含空格", { ...albumSample(), id: "demo album" }],
        ["updated 不是真实日历日", { ...albumSample(), updated: "2026-02-31" }],
    ],
};

/* ───────────────────────── 归一化 ───────────────────────── */

export interface NormalizeOptions {
    /**
     * 构建期强制状态（`PUBLIC_*_STATE`）。
     * 只用于验收/截图：`empty` / `error`。其它值忽略。
     */
    force?: string | null;
    /** 计时基准（`YYYY-MM-DD`）；缺省今天。测试用它钉住新鲜度。 */
    now?: string;
}

const MAX_PROBLEMS = 8;

/** `YYYY-MM-DD` → 毫秒；不合法返回 null（不用 Date.parse，它会接受 `2026-1-1`）。 */
function parseDay(value: string | null | undefined): number | null {
    if (typeof value !== "string" || !ISO_DAY.test(value)) return null;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isNaN(time) ? null : time;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 把原始数据归一化成页面可直接渲染的三态产物。
 *
 * - `raw` 不是数组 → `error / source-invalid`
 * - 数组为空 → `empty / source-empty`
 * - 有条目但全部被丢弃 → `error / source-invalid`
 * - 部分被丢弃 → `ok`，但带 `issue: entry-dropped`（门禁会 FAIL）
 */
export function normalizeCollection<T>(
    raw: unknown,
    meta: EntityMeta | undefined | null,
    spec: EntitySpec<T>,
    options: NormalizeOptions = {},
): EntityCollection<T> {
    const base: EntityCollection<T> = {
        kind: spec.kind,
        status: "empty",
        items: [],
        total: 0,
        dropped: 0,
        problems: [],
        updated: null,
        ageDays: null,
        stale: false,
    };

    const force = options.force ?? null;
    if (force === "empty") {
        return { ...base, issue: { code: "forced-empty" } };
    }
    if (force === "error") {
        return {
            ...base,
            status: "error",
            issue: { code: "forced-error", detail: "build-time override" },
        };
    }

    if (!Array.isArray(raw)) {
        return {
            ...base,
            status: "error",
            issue: { code: "source-invalid", detail: "导出值不是数组" },
        };
    }

    const items: T[] = [];
    const problems: string[] = [];
    for (const entry of raw) {
        const entryProblems = spec.validate(entry);
        if (entryProblems.length === 0) {
            items.push(entry as T);
            continue;
        }
        for (const problem of entryProblems) {
            if (problems.length < MAX_PROBLEMS) problems.push(problem);
        }
    }

    const dropped = raw.length - items.length;

    // 新鲜度：meta.updated 优先；没有就取条目里**最新**的 updated（页面只报数据文件整体的
    // 最后维护时间）。条目各自过期的口径在门禁 E7：逐条列 WARN，不在这里合并。
    const metaUpdated = meta && isIsoDay(meta.updated) ? meta.updated : null;
    const itemUpdated =
        items
            .map((item) => spec.updatedOf(item))
            .filter((value): value is string => typeof value === "string")
            .sort()
            .at(-1) ?? null;
    const updated = metaUpdated ?? itemUpdated;
    const updatedTime = parseDay(updated);
    const nowTime = parseDay(options.now ?? new Date().toISOString().slice(0, 10));
    const ageDays =
        updatedTime === null || nowTime === null
            ? null
            : Math.floor((nowTime - updatedTime) / DAY_MS);

    const collection: EntityCollection<T> = {
        ...base,
        items,
        total: items.length,
        dropped,
        problems,
        updated,
        ageDays,
        stale: ageDays !== null && ageDays > ENTITY_FRESHNESS_DAYS,
    };

    if (items.length === 0) {
        return raw.length === 0
            ? { ...collection, status: "empty", issue: { code: "source-empty" } }
            : {
                  ...collection,
                  status: "error",
                  issue: {
                      code: "source-invalid",
                      detail: `${dropped} 条全部不合格：${problems[0] ?? "未知原因"}`,
                  },
              };
    }

    if (dropped > 0) {
        return {
            ...collection,
            status: "ok",
            issue: {
                code: "entry-dropped",
                detail: `${dropped} 条被丢弃：${problems[0] ?? "未知原因"}`,
            },
        };
    }

    return { ...collection, status: "ok" };
}

/* ───────────────────────── 展示辅助 ───────────────────────── */

/** 按 locale 取双语字段；缺值退回另一语种，再缺退回空串（不抛）。 */
export function pick(text: LocalizedText | undefined | null, locale: EntityLocale): string {
    if (!text) return "";
    const primary = locale === "en" ? text.en : text.zh;
    if (typeof primary === "string" && primary.trim() !== "") return primary;
    const fallback = locale === "en" ? text.zh : text.en;
    return typeof fallback === "string" ? fallback : "";
}

/** `2025-10` + `null` → `2025.10 — 至今` / `2025.10 — Now`。 */
export function formatPeriod(project: Project, locale: EntityLocale): string {
    const from = project.started.replace("-", ".");
    if (!project.ended) return locale === "en" ? `${from} — now` : `${from} — 至今`;
    return `${from} — ${project.ended.replace("-", ".")}`;
}

const SKILL_LEVEL_LABEL: Record<SkillLevel, LocalizedText> = {
    exploring: { zh: "探索中", en: "Exploring" },
    working: { zh: "常用", en: "Working" },
    solid: { zh: "熟练", en: "Solid" },
    deep: { zh: "深耕", en: "Deep" },
};

/** 四档 → 1–4 段刻度（纯视觉，aria-hidden；语义由文字标签承担）。 */
export const SKILL_LEVEL_RANK: Record<SkillLevel, number> = {
    exploring: 1,
    working: 2,
    solid: 3,
    deep: 4,
};

export function skillLevelLabel(level: SkillLevel, locale: EntityLocale): string {
    return pick(SKILL_LEVEL_LABEL[level] ?? SKILL_LEVEL_LABEL.exploring, locale);
}

const PROJECT_STATUS_LABEL: Record<ProjectStatus, LocalizedText> = {
    active: { zh: "进行中", en: "Active" },
    maintained: { zh: "维护中", en: "Maintained" },
    archived: { zh: "已归档", en: "Archived" },
};

export function projectStatusLabel(status: ProjectStatus, locale: EntityLocale): string {
    return pick(PROJECT_STATUS_LABEL[status] ?? PROJECT_STATUS_LABEL.active, locale);
}

/** 数据新鲜度的可读口径：`2026-11-02 · 2 天前`。 */
export function formatUpdated(
    updated: string | null,
    ageDays: number | null,
    locale: EntityLocale,
): string {
    if (!updated) return "";
    if (ageDays === null) return updated;
    if (locale === "en") return `${updated} · ${ageDays} days ago`;
    return `${updated} · ${ageDays} 天前`;
}

/* ───────────────────────── 设备 / 游戏 展示辅助 ───────────────────────── */

/** `2024-05` + 空 → `2024.05 — 至今`；只有一端时只显示那一端（不编造另一半）。 */
export function formatSpan(
    start: string | null | undefined,
    end: string | null | undefined,
    locale: EntityLocale,
): string {
    const from = isIsoMonth(start) ? start.replace("-", ".") : "";
    const to = isIsoMonth(end) ? end.replace("-", ".") : "";
    if (!from && !to) return "";
    if (!to) return `${from} — ${locale === "en" ? "now" : "至今"}`;
    return from ? `${from} — ${to}` : to;
}

const DEVICE_CATEGORY_LABEL: Record<DeviceCategory, LocalizedText> = {
    computer: { zh: "计算机", en: "Computers" },
    display: { zh: "显示", en: "Displays" },
    audio: { zh: "音频", en: "Audio" },
    peripheral: { zh: "外设", en: "Peripherals" },
    network: { zh: "网络", en: "Network" },
    other: { zh: "其他", en: "Other" },
};

/** 页面分组顺序（固定，不随数据顺序变）：先计算机，网络其次。 */
export const DEVICE_CATEGORY_ORDER: readonly DeviceCategory[] = [
    "computer",
    "display",
    "network",
    "audio",
    "peripheral",
    "other",
];

export function deviceCategoryLabel(category: DeviceCategory, locale: EntityLocale): string {
    return pick(DEVICE_CATEGORY_LABEL[category] ?? DEVICE_CATEGORY_LABEL.other, locale);
}

const DEVICE_STATUS_LABEL: Record<DeviceStatus, LocalizedText> = {
    "in-use": { zh: "在用", en: "In use" },
    backup: { zh: "备用", en: "Backup" },
    retired: { zh: "已退役", en: "Retired" },
};

/** 排序权重：在用的排前面，退役的垫底。 */
export const DEVICE_STATUS_RANK: Record<DeviceStatus, number> = {
    "in-use": 0,
    backup: 1,
    retired: 2,
};

export function deviceStatusLabel(status: DeviceStatus, locale: EntityLocale): string {
    return pick(DEVICE_STATUS_LABEL[status] ?? DEVICE_STATUS_LABEL["in-use"], locale);
}

const GAME_STATUS_LABEL: Record<GameStatus, LocalizedText> = {
    playing: { zh: "在玩", en: "Playing" },
    finished: { zh: "已通关", en: "Finished" },
    shelved: { zh: "搁置", en: "Shelved" },
    backlog: { zh: "待玩", en: "Backlog" },
};

/** 页面分组顺序：在玩 → 已通关 → 待玩 → 搁置。 */
export const GAME_STATUS_ORDER: readonly GameStatus[] = [
    "playing",
    "finished",
    "backlog",
    "shelved",
];

export function gameStatusLabel(status: GameStatus, locale: EntityLocale): string {
    return pick(GAME_STATUS_LABEL[status] ?? GAME_STATUS_LABEL.playing, locale);
}

const GAME_PLATFORM_LABEL: Record<GamePlatform, LocalizedText> = {
    pc: { zh: "PC", en: "PC" },
    switch: { zh: "Switch", en: "Switch" },
    playstation: { zh: "PlayStation", en: "PlayStation" },
    xbox: { zh: "Xbox", en: "Xbox" },
    mobile: { zh: "手机", en: "Mobile" },
    vr: { zh: "VR", en: "VR" },
};

export function gamePlatformLabel(platform: GamePlatform, locale: EntityLocale): string {
    return pick(GAME_PLATFORM_LABEL[platform] ?? GAME_PLATFORM_LABEL.pc, locale);
}

/* ───────────────────────── 时间线 展示辅助 ───────────────────────── */

const TIMELINE_KIND_LABEL: Record<TimelineKind, LocalizedText> = {
    build: { zh: "工程", en: "Build" },
    site: { zh: "站点", en: "Site" },
    infra: { zh: "基建", en: "Infra" },
    life: { zh: "生活", en: "Life" },
};

export function timelineKindLabel(kind: TimelineKind, locale: EntityLocale): string {
    return pick(TIMELINE_KIND_LABEL[kind] ?? TIMELINE_KIND_LABEL.build, locale);
}

/** `YYYY-MM-DD` = 到日；`YYYY-MM` = 只到月。 */
export function timelinePrecision(date: string): "day" | "month" {
    return date.length === 7 ? "month" : "day";
}

/**
 * 排序键：`YYYY-MM` 补成 `YYYY-MM-00`。
 * 补 0 而不是补 1 号 —— 同一个月里「只知道月份」的事件排在具体日子之前，
 * 排序不会把「某月的某件事」排到假的 `-01` 上（补 1 号会谎报精度，也会和真实的 1 号撞车）。
 */
export function timelineSortKey(date: string): string {
    return timelinePrecision(date) === "month" ? `${date}-00` : date;
}

export interface TimelineGroup {
    /** 年份（`YYYY`），分组键。 */
    year: string;
    /** 组内条目：日期降序。 */
    items: TimelineEvent[];
}

/**
 * 按年分组、组内日期降序。
 *
 * - 年份组之间：新 → 旧（读者第一眼看到最近发生的事）。
 * - 组内：`timelineSortKey` 降序；**同一天**的条目按 id 升序兜底 ——
 *   排序必须唯一确定，否则相同日期的两条会在两次构建里换位，e2e 与截图都不可复现。
 * - 不修改入参；坏日期（校验不会放过）在这里也不会抛异常，只按字符串比较。
 */
export function groupTimeline(events: readonly TimelineEvent[]): TimelineGroup[] {
    const buckets = new Map<string, TimelineEvent[]>();
    for (const event of events) {
        const year = typeof event.date === "string" ? event.date.slice(0, 4) : "";
        const bucket = buckets.get(year);
        if (bucket) bucket.push(event);
        else buckets.set(year, [event]);
    }

    return [...buckets.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([year, items]) => ({
            year,
            items: [...items].sort((a, b) => {
                const byDate = timelineSortKey(b.date).localeCompare(timelineSortKey(a.date));
                return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
            }),
        }));
}

/** 左轨日期：`11.02`（到日）/ `11`（只到月；精度差异由组件补读屏文字说明）。 */
export function timelineRailLabel(date: string): string {
    const parts = date.split("-");
    if (parts.length === 3) return `${parts[1]}.${parts[2]}`;
    return parts[1] ?? date;
}

/** `<time datetime>` 与读屏用：`2026.11.02` / `2026.11`。 */
export function timelineDateLabel(date: string): string {
    return date.split("-").join(".");
}

/* ───────────────────────── 音乐 展示辅助 ───────────────────────── */

const MUSIC_FORMAT_LABEL: Record<MusicFormat, LocalizedText> = {
    album: { zh: "专辑", en: "Album" },
    single: { zh: "单曲", en: "Single" },
};

export function musicFormatLabel(format: MusicFormat, locale: EntityLocale): string {
    return pick(MUSIC_FORMAT_LABEL[format] ?? MUSIC_FORMAT_LABEL.album, locale);
}

/**
 * 作品年代跨度：`2009–2018`；只有一年就是那一年；没有条目返回空串。
 * 页面不自己 sort / 不去重 —— 这里算的只是页面头上一枚 chip，排序口径另说。
 */
export function musicYearSpan(tracks: readonly MusicTrack[]): string {
    const years = tracks
        .map((track) => track.year)
        .filter((year) => typeof year === "string" && YEAR.test(year))
        .sort();
    const first = years.at(0);
    const last = years.at(-1);
    if (!first || !last) return "";
    return first === last ? first : `${first}–${last}`;
}

/** 主艺人数量：`许嵩 / VAE` 与 `许嵩 / 何曼婷` 记作同一位（取 `/` 前那段）。 */
export function musicArtistCount(tracks: readonly MusicTrack[]): number {
    return new Set(
        tracks
            .map(
                (track) =>
                    String(track.artist ?? "")
                        .split("/")[0]
                        ?.trim() ?? "",
            )
            .filter((name) => name !== ""),
    ).size;
}

/* ───────────────────────── 相册 展示辅助 ───────────────────────── */

const ALBUM_PLACE_LABEL: Record<AlbumPlace, LocalizedText> = {
    shenzhen: { zh: "深圳", en: "Shenzhen" },
    guangzhou: { zh: "广州", en: "Guangzhou" },
    huizhou: { zh: "惠州", en: "Huizhou" },
    wuhan: { zh: "武汉", en: "Wuhan" },
    qingyuan: { zh: "清远", en: "Qingyuan" },
};

export function albumPlaceLabel(place: AlbumPlace, locale: EntityLocale): string {
    return pick(ALBUM_PLACE_LABEL[place] ?? ALBUM_PLACE_LABEL.shenzhen, locale);
}

/**
 * 从图床路径的文件名里取拍摄日 `YYYY-MM-DD`（相机导出名 `CRnall_20260124_161504998`
 * / `IMG_20260321_131257` / `MVIMG_20260418_153204` 都带同一段 `_YYYYMMDD_`）。
 * 取不到返回 null —— 页面据此不写日期，而不是编一个。
 */
export function albumPhotoTakenOn(photo: string): string | null {
    const match = /_(\d{4})(\d{2})(\d{2})_/.exec(photo);
    if (!match) return null;
    const date = `${match[1]}-${match[2]}-${match[3]}`;
    return isIsoDay(date) ? date : null;
}

/** 一本相册的拍摄日范围：单日返回那一天，跨日返回 `起 – 止`。 */
export function albumSpan(album: Album): string {
    const days = album.photos
        .map(albumPhotoTakenOn)
        .filter((day): day is string => typeof day === "string")
        .sort();
    const first = days.at(0);
    const last = days.at(-1);
    if (!first || !last) return "";
    return first === last ? first : `${first} – ${last}`;
}

/** 所有相册合计张数（页面 data-* 与 e2e 对账用）。 */
export function albumPhotoTotal(albums: readonly Album[]): number {
    return albums.reduce((sum, album) => sum + album.photos.length, 0);
}

/**
 * 照片的 alt / 灯箱说明：`凤凰山 · 2026-01-24`。
 * 由相册名 + 文件名时间戳拼出来，不另存一句人写的说明 —— 数据里没有的东西不编。
 */
export function albumPhotoAlt(album: Album, photo: string, locale: EntityLocale): string {
    const day = albumPhotoTakenOn(photo);
    const name = pick(album.name, locale);
    return day ? `${name} · ${day}` : name;
}
