/**
 * SitePlayer（M8-4 站级悬浮播放器）· 运行时
 *
 * 契约见 `blog2.0/docs/26-m8-4-player-spec.md`。与规格的差异只有一处，且是数据决定的：
 * **两个源都是直播流**（`live: true`，无 duration 不可 seek），所以
 *  - 不渲染进度条（spec §4.3 的进度条契约对无限流不成立，画一条永远 0 的条是假状态）；
 *  - `ended` 子态（S3b）不会出现，但代码保留处理，换成点播源即生效。
 *
 * 三条硬要求（每条都有对应的踩坑史）：
 *  1. **单例落在 DOM / window 上**，不能只靠模块作用域 —— swup `reloadScripts: true`
 *     每次换页都会重跑模块，模块级 `let instance` 会被重置（spec §1.2）。
 *  2. **节点在 `main` 之外**，由本脚本创建；换页不销毁，播放不断。
 *  3. **关闭 = 停播 + 断流 + 卸载**（清 `src`、`load()`、摘节点），不是 CSS 隐藏。
 */
import { radioStations, radioDefaultStation } from "~/config/radio";
import { radioArmedKey as ARMED_KEY, radioPersistMode } from "~/config/radio-flags";

const STATION_KEY = "dogeared-radio-station";
const VOLUME_KEY = "dogeared-radio-volume";

type State = "idle" | "expanded" | "error";

interface Station {
    id: string;
    name: string;
    detail: string;
    url: string;
    home: string;
    live: boolean;
}

const COPY = {
    player: "电台播放器",
    play: "播放",
    pause: "暂停",
    mute: "静音",
    unmute: "取消静音",
    close: "关闭播放器",
    collapse: "收起播放器",
    expand: "展开播放器",
    volume: "音量",
    error: "电台暂时无法播放",
    playing: "正在播放",
    paused: "已暂停",
    ended: "播放结束",
} as const;

interface Player {
    root: HTMLElement;
    liveBadge: HTMLElement;
    audio: HTMLAudioElement;
    live: HTMLElement;
    playButton: HTMLButtonElement;
    toggleButton: HTMLButtonElement;
    muteButton: HTMLButtonElement;
    closeButton: HTMLButtonElement;
    volumeWrap: HTMLElement;
    volumeInput: HTMLInputElement | null;
    titleEl: HTMLElement;
    artistEl: HTMLElement;
    station: Station;
    state: State;
    playing: boolean;
    volumeWritable: boolean;
}

interface PlayerWindow extends Window {
    __sitePlayer?: Player;
}

const w = window as PlayerWindow;

const stationById = (id: string | null): Station =>
    radioStations.find((station) => station.id === id) ??
    radioStations.find((station) => station.id === radioDefaultStation) ??
    (radioStations[0] as Station);

function read(storageKey: string): string | null {
    try {
        return localStorage.getItem(storageKey);
    } catch {
        return null;
    }
}

function write(storageKey: string, value: string | null): void {
    try {
        if (value === null) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, value);
    } catch {
        /* 隐私模式：播放照常，只是不记忆 */
    }
}

/** 音量在 iOS 上是只读的 —— 用能力检测判断，不做 UA 嗅探（spec §2.3）。 */
function volumeIsWritable(audio: HTMLAudioElement): boolean {
    try {
        const probe = audio.volume;
        audio.volume = 0.5;
        const readBack = audio.volume;
        audio.volume = probe;
        return Math.abs(readBack - 0.5) < 0.01;
    } catch {
        return false;
    }
}

/**
 * 内联图标。返回真实 DOM 节点而不是 HTML 字符串 —— 这样调用点用
 * `replaceChildren()` 即可，整个文件不出现 `innerHTML`。
 */
function icon(path: string, size = 18): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shape.setAttribute("d", path);
    // 描边图标（关闭/音量）用 stroke，实心图标（播放/暂停）用 fill
    if (path.includes("M6.4") || path.includes("M4 9.5") || path.includes("M15.5")) {
        shape.setAttribute("fill", "none");
        shape.setAttribute("stroke", "currentColor");
        shape.setAttribute("stroke-width", "2");
        shape.setAttribute("stroke-linecap", "round");
    } else {
        shape.setAttribute("fill", "currentColor");
    }
    svg.append(shape);
    return svg;
}

const ICONS = {
    play: "M8 5.5v13l10-6.5-10-6.5Z",
    pause: "M8 5.5h3v13H8zM13 5.5h3v13h-3z",
    close: "M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6",
    volume: "M4 9.5h3L11 6v12L7 14.5H4zM15 9a4 4 0 0 1 0 6M17.8 6.2a8 8 0 0 1 0 11.6",
    mute: "M4 9.5h3L11 6v12L7 14.5H4zM15.5 9.5l5 5M20.5 9.5l-5 5",
} as const;

function build(station: Station, volumeWritable: boolean): Player {
    const root = document.createElement("aside");
    root.className = "site-player";
    root.dataset.state = "expanded";
    root.dataset.playing = "false";
    root.setAttribute("aria-label", COPY.player);

    const audio = document.createElement("audio");
    audio.preload = "none";
    audio.hidden = true;

    const row = document.createElement("div");
    row.className = "site-player__row";

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "site-player__play";
    playButton.dataset.playerPlay = "";
    // 首屏就要有名字：`setPlaying` 之前是一个只有 svg 的按钮，axe 会判 button-name 违规
    playButton.setAttribute("aria-label", `${COPY.play}：${station.name}`);
    playButton.replaceChildren(icon(ICONS.play));

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "site-player__toggle";
    toggleButton.dataset.playerToggle = "";
    toggleButton.setAttribute("aria-expanded", "false");
    toggleButton.setAttribute("aria-controls", "site-player-extras");

    const headline = document.createElement("span");
    headline.className = "site-player__headline";

    const titleEl = document.createElement("span");
    titleEl.className = "site-player__title";
    titleEl.dataset.playerTitle = "";

    const artistEl = document.createElement("span");
    artistEl.className = "site-player__artist";
    artistEl.dataset.playerArtist = "";

    // 直播标识：是**电台的属性**（24/7 实时流），不是播放器的状态，
    // 所以只随电台切换显隐，不随暂停变化（暂停的 LIVE 不等于停播）。
    // 放在标题行内联，避免与三个控件抢 280px 卡宽（否则标题会被无谓截断）。
    const liveBadge = document.createElement("span");
    liveBadge.className = "site-player__badge";
    liveBadge.dataset.playerBadge = "";
    liveBadge.textContent = "LIVE";

    headline.append(titleEl, liveBadge);
    toggleButton.append(headline, artistEl);

    const muteButton = document.createElement("button");
    muteButton.type = "button";
    muteButton.className = "site-player__icon-btn";
    muteButton.dataset.playerMute = "";
    muteButton.setAttribute("aria-pressed", "false");
    muteButton.replaceChildren(icon(ICONS.volume, 16));

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "site-player__icon-btn";
    closeButton.dataset.playerClose = "";
    closeButton.setAttribute("aria-label", COPY.close);
    closeButton.replaceChildren(icon(ICONS.close, 16));

    row.append(playButton, toggleButton, muteButton, closeButton);

    const extras = document.createElement("div");
    extras.className = "site-player__extras";
    extras.id = "site-player-extras";
    extras.dataset.playerExtras = "";
    extras.hidden = true;

    const volumeWrap = document.createElement("label");
    volumeWrap.className = "site-player__volume";
    volumeWrap.hidden = !volumeWritable;

    const volumeLabel = document.createElement("span");
    volumeLabel.textContent = COPY.volume;

    const volumeInput = document.createElement("input");
    volumeInput.type = "range";
    volumeInput.min = "0";
    volumeInput.max = "100";
    volumeInput.value = "72";
    volumeInput.dataset.playerVolume = "";
    volumeInput.setAttribute("aria-label", COPY.volume);

    volumeWrap.append(volumeLabel, volumeInput);
    extras.append(volumeWrap);

    const live = document.createElement("p");
    live.className = "site-player__live";
    live.dataset.playerLive = "";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.hidden = true;

    root.append(audio, row, extras, live);

    return {
        root,
        audio,
        live,
        playButton,
        toggleButton,
        muteButton,
        closeButton,
        volumeWrap,
        volumeInput: volumeWritable ? volumeInput : null,
        titleEl,
        artistEl,
        liveBadge,
        station,
        state: "idle",
        playing: false,
        volumeWritable,
    };
}

/** ResizeObserver 写真实高度，避免把 132 / 100 这类算式值硬编码进避让规则。 */
function trackHeight(player: Player): void {
    const apply = () => {
        document.body.style.setProperty(
            "--site-player-block-size",
            `${Math.round(player.root.getBoundingClientRect().height)}px`,
        );
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(player.root);
}

/**
 * 折叠按钮的可读名称来自可见文本（电台名 + 副标题），
 * 额外状态只进 `title`。这样 axe 的 `label-content-name-mismatch` 成立：
 * 名称必须包含可见文字，否则读屏与视觉说的不是同一件事。
 */
function syncToggleLabel(player: Player): void {
    const expanded = player.state === "expanded";
    player.toggleButton.title = expanded ? COPY.collapse : COPY.expand;
}

function mount(): void {
    if (w.__sitePlayer) return;

    const station = stationById(read(STATION_KEY));
    const probeAudio = document.createElement("audio");
    const volumeWritable = volumeIsWritable(probeAudio);

    const player = build(station, volumeWritable);
    w.__sitePlayer = player;

    // 挂在 #app 之外（main 之外），swup 换页不碰它
    const app = document.getElementById("app");
    if (app?.parentElement) app.parentElement.append(player.root);
    else document.body.append(player.root);

    bind(player);
    trackHeight(player);
    render(player);
}

function announce(player: Player, text: string): void {
    // R3/R4：只播报状态转移，且同文不重写（重复 play 事件会二次播报）
    if (player.live.textContent === text) return;
    player.live.textContent = text;
}

function setState(player: Player, state: State): void {
    player.state = state;
    player.root.dataset.state = state;
    const expanded = state === "expanded";
    player.toggleButton.setAttribute("aria-expanded", String(expanded));
    const extras = player.root.querySelector<HTMLElement>("[data-player-extras]");
    if (extras) extras.hidden = !expanded;
    // 折叠态不渲染音量滑杆（spec §2.3 的「不渲染」）
    if (player.volumeWrap) player.volumeWrap.hidden = !expanded || !player.volumeWritable;
    syncToggleLabel(player);
}

function render(player: Player): void {
    const { station } = player;
    player.titleEl.textContent = station.name;
    player.artistEl.textContent = station.detail;
    player.liveBadge.hidden = !station.live;
    player.audio.src = station.url;
}

function setPlaying(player: Player, playing: boolean): void {
    player.playing = playing;
    player.root.dataset.playing = String(playing);
    // §4.2：名称翻转，不用 aria-pressed
    player.playButton.removeAttribute("aria-pressed");
    player.playButton.setAttribute(
        "aria-label",
        `${playing ? COPY.pause : COPY.play}：${player.station.name}`,
    );
    player.playButton.replaceChildren(icon(playing ? ICONS.pause : ICONS.play));
    if (playing) setState(player, "expanded");
}

function setBusy(player: Player, busy: boolean): void {
    if (busy) player.playButton.setAttribute("aria-busy", "true");
    else player.playButton.removeAttribute("aria-busy");
}

function setError(player: Player): void {
    setBusy(player, false);
    setPlaying(player, false);
    setState(player, "error");
    player.titleEl.textContent = COPY.error;
    player.artistEl.textContent = player.station.name;
    player.toggleButton.setAttribute("aria-expanded", "false");
    player.muteButton.hidden = true;
    announce(player, `${COPY.error}：${player.station.name}`);
}

function arm(): void {
    if (radioPersistMode === "always") return;
    write(ARMED_KEY, "1");
}

function dispose(player: Player): void {
    player.audio.pause();
    player.audio.removeAttribute("src");
    player.audio.load();
    player.root.remove();
    document.body.style.removeProperty("--site-player-block-size");
    write(ARMED_KEY, null);
    w.__sitePlayer = undefined;
}

function bind(player: Player): void {
    const { audio } = player;

    const stored = Number(read(VOLUME_KEY));
    if (player.volumeWritable && Number.isFinite(stored) && stored >= 0 && stored <= 1) {
        audio.volume = stored;
        if (player.volumeInput) player.volumeInput.value = String(Math.round(stored * 100));
    }

    player.playButton.addEventListener("click", () => {
        if (player.state === "error") {
            // 重试：重新赋值 src 会重新走一次 load
            player.muteButton.hidden = false;
            render(player);
            setState(player, "idle");
        }
        if (player.playing) {
            audio.pause();
            return;
        }
        arm();
        setBusy(player, true);
        void audio.play().catch(() => setError(player));
    });

    player.toggleButton.addEventListener("click", () => {
        if (player.state === "error") return;
        setState(player, player.state === "expanded" ? "idle" : "expanded");
    });

    player.muteButton.addEventListener("click", () => {
        const muted = !audio.muted;
        audio.muted = muted;
        // spec §4.2 A4：静音键是真正的 toggle —— 名称恒定、aria-pressed 翻转。
        // 改名（静音 → 取消静音）会让读屏在「名称」与「按下状态」两处同时变化，
        // 也违反 A4 的「aria-label 相同」判据。
        player.muteButton.setAttribute("aria-pressed", String(muted));
        player.muteButton.title = muted ? COPY.unmute : COPY.mute;
        player.muteButton.replaceChildren(icon(muted ? ICONS.mute : ICONS.volume, 16));
    });
    player.muteButton.setAttribute("aria-label", COPY.mute);

    player.closeButton.addEventListener("click", () => dispose(player));

    player.volumeInput?.addEventListener("input", () => {
        const value = Number(player.volumeInput?.value ?? "72") / 100;
        audio.volume = value;
        write(VOLUME_KEY, String(value));
    });

    audio.addEventListener("playing", () => {
        setBusy(player, false);
        setPlaying(player, true);
        announce(player, `${COPY.playing}：${player.station.name}`);
    });
    audio.addEventListener("waiting", () => setBusy(player, true));
    audio.addEventListener("pause", () => {
        setBusy(player, false);
        if (!audio.ended) setPlaying(player, false);
    });
    audio.addEventListener("ended", () => {
        setBusy(player, false);
        setPlaying(player, false);
        announce(player, COPY.ended);
    });
    audio.addEventListener("error", () => setError(player));

    // 全站只有一路声音（spec §6.2 第 12 条：不允许与 /music/ 页内播放器同时出声）。
    // 页内播放器（`music-player.ts`）不在本组件控制范围内，所以这里监听**任意**其他
    // 媒体元素的 play 事件（capture，跨 shadow/子树都能收到），自己先停。
    document.addEventListener(
        "play",
        (event) => {
            const target = event.target;
            if (!(target instanceof HTMLMediaElement)) return;
            if (target === audio) return;
            if (!player.playing) return;
            audio.pause();
            announce(player, COPY.paused);
        },
        true,
    );

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (player.state !== "expanded") return;
        setState(player, "idle");
        player.toggleButton.focus({ preventScroll: true });
    });

    // `/radio/` 页的显式唤起与选台（页面与播放器解耦，靠事件通信）
    window.addEventListener("radio-open", () => {
        setState(player, "expanded");
        if (player.playing) return;
        arm();
        setBusy(player, true);
        void audio.play().catch(() => setError(player));
    });

    window.addEventListener("radio-station", (event) => {
        const id = (event as CustomEvent<string>).detail;
        const next = radioStations.find((entry) => entry.id === id);
        if (!next || next.id === player.station.id) return;
        const wasPlaying = player.playing;
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        player.station = next;
        player.muteButton.hidden = false;
        setState(player, "idle");
        render(player);
        setPlaying(player, false);
        write(STATION_KEY, next.id);
        if (!wasPlaying) return;
        arm();
        setBusy(player, true);
        void audio.play().catch(() => setError(player));
    });
}

/** 站级单例：脚本被 swup 重跑时，只要 DOM 里已有节点就直接复用。 */
function boot(): void {
    if (w.__sitePlayer) {
        // 换页后节点还在，但 `main` 换了 —— 没有需要同步的数据，直接返回
        document.body.style.setProperty(
            "--site-player-block-size",
            `${Math.round(w.__sitePlayer.root.getBoundingClientRect().height)}px`,
        );
        return;
    }
    if (document.querySelector(".site-player")) return;
    mount();
}

boot();
document.addEventListener("astro:page-load", boot);

export {};
