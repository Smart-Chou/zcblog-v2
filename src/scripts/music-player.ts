/**
 * 音乐页播放器（M2-8b）—— 按需加载的那一半
 * ------------------------------------------------------------------
 * 这个模块**不在首屏**：页面脚本只在第一次点「试听」时 `import("./music-player")`，
 * 所以打开 `/music/` 时既没有播放器代码，也没有 `<audio>`，更没有音频请求。
 *
 * 三条硬约束（对应 14 §6 的「关闭时零请求」）：
 *   1. 模块里的所有 DOM 都是点击之后才建的：关闭态页面上 `document.querySelector("audio")` = null；
 *   2. `<audio>` 只在条目**真的带 http(s) 源**时才创建，`preload="none"`，源一到就 `play()`
 *      —— 请求由用户手势触发，不由页面加载触发；
 *   3. 关闭时 `pause()` + 去掉 `src` + `load()`，把缓冲和后续请求一起断掉，然后移出 DOM。
 *
 * 文案不写死在这个模块里：语言由页面决定，模块从挂载点的 `data-copy-*` 上读
 * （关闭 / 正在播放 / 无试听源 / 加载失败 / 外链文案）。这样播放器本身与语种无关，
 * 也不用把一个 i18n 字典塞进懒加载 chunk。
 *
 * 无 JS 时页面照样可读：列表、外链、说明都是 SSR 出来的，播放器只是增强。
 */

export interface PlayerTrack {
    id: string;
    title: string;
    artist: string;
    /** http(s) 试听源；空串 = 这条没有源，面板只给说明 + 外链。 */
    audio: string;
    /** 外链（通常是豆瓣条目），没有就传空串。 */
    href: string;
}

interface PlayerCopy {
    close: string;
    now: string;
    noSource: string;
    error: string;
    external: string;
}

interface PlayerInstance {
    mount: HTMLElement;
    trigger: HTMLElement | null;
    body: HTMLElement;
    audio: HTMLAudioElement | null;
    audioWrap: HTMLElement | null;
    notice: HTMLParagraphElement;
    closeButton: HTMLButtonElement;
    close: () => void;
}

let instance: PlayerInstance | null = null;

/** 从挂载点的 data-copy-* 取文案；缺字段时退回英文，不抛。 */
function readCopy(mount: HTMLElement): PlayerCopy {
    const data = mount.dataset;
    return {
        close: data.copyClose || "Close player",
        now: data.copyNow || "Now playing",
        noSource: data.copyNoSource || "No preview source for this entry.",
        error: data.copyError || "The audio source failed to load.",
        external: data.copyExternal || "Open the release page",
    };
}

function buildBody(copy: PlayerCopy): {
    body: HTMLElement;
    title: HTMLElement;
    notice: HTMLParagraphElement;
    closeButton: HTMLButtonElement;
} {
    const body = document.createElement("div");
    body.className = "music-player__body";
    body.tabIndex = -1;

    const head = document.createElement("div");
    head.className = "music-player__head";

    const label = document.createElement("span");
    label.className = "music-player__label";
    label.textContent = copy.now;

    const title = document.createElement("strong");
    title.className = "music-player__title";
    title.dataset.musicNowTitle = "";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "music-player__close";
    closeButton.dataset.musicPlayerClose = "";
    closeButton.textContent = copy.close;
    closeButton.setAttribute("aria-label", copy.close);

    head.append(label, title, closeButton);

    const notice = document.createElement("p");
    notice.className = "music-player__notice";
    notice.dataset.musicPlayerNotice = "";
    notice.hidden = true;

    body.append(head, notice);
    return { body, title, notice, closeButton };
}

function teardownAudio(target: PlayerInstance): void {
    if (!target.audio) return;
    try {
        target.audio.pause();
        // 先断源再 load()：只 pause 的话浏览器可能继续把已排队的 range 请求发完，
        // 关闭态就不再是「0 请求」。
        target.audio.removeAttribute("src");
        target.audio.load();
    } catch {
        // 元素已从 DOM 摘掉时 load() 在个别浏览器会抛，忽略即可
    }
    target.audioWrap?.remove();
    target.audio = null;
    target.audioWrap = null;
}

function create(mount: HTMLElement, copy: PlayerCopy): PlayerInstance {
    const { body, title, notice, closeButton } = buildBody(copy);

    const self: PlayerInstance = {
        mount,
        trigger: null,
        body,
        audio: null,
        audioWrap: null,
        notice,
        closeButton,
        close: () => closePlayer(self, copy),
    };

    closeButton.addEventListener("click", () => self.close());
    body.addEventListener("keydown", (event) => {
        if ((event as KeyboardEvent).key === "Escape") {
            event.preventDefault();
            self.close();
        }
    });

    mount.append(body);
    title.dataset.musicNowTitle = "";
    return self;
}

/** 把「当前这一条」贴到面板上：有源才建 <audio>，无源只说明 + 外链。 */
function show(target: PlayerInstance, track: PlayerTrack, copy: PlayerCopy): void {
    const title = target.body.querySelector<HTMLElement>("[data-music-now-title]");
    if (title) title.textContent = track.artist ? `${track.title} · ${track.artist}` : track.title;

    target.mount.dataset.musicPlayerId = track.id;
    target.notice.hidden = true;
    target.notice.textContent = "";
    target.notice.removeAttribute("data-music-player-link");

    teardownAudio(target);

    if (!track.audio) {
        // 没有源：不建 <audio>、不发请求，只把「为什么放不了 + 去哪儿听」说清楚
        target.mount.dataset.musicPlayerState = "no-source";
        target.notice.hidden = false;
        target.notice.dataset.musicPlayerNotice = "no-source";
        target.notice.textContent = copy.noSource;
        if (track.href) {
            const link = document.createElement("a");
            link.className = "music-player__link";
            link.href = track.href;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = copy.external;
            target.notice.append(" ", link);
        }
        return;
    }

    const wrap = document.createElement("div");
    wrap.className = "music-player__audio";
    wrap.dataset.musicPlayerAudio = "";

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "none";
    audio.className = "music-player__element";
    audio.dataset.musicAudioElement = "";
    audio.setAttribute("aria-label", track.title);
    audio.addEventListener("error", () => {
        target.mount.dataset.musicPlayerState = "error";
        target.notice.hidden = false;
        target.notice.dataset.musicPlayerNotice = "error";
        target.notice.textContent = copy.error;
    });

    wrap.append(audio);
    target.body.append(wrap);
    target.audio = audio;
    target.audioWrap = wrap;

    target.mount.dataset.musicPlayerState = "open";
    audio.src = track.audio;
    // 点击就是手势：这里 play() 才算「用户要求播放」，页面加载时永远不会走到
    void audio.play().catch(() => {
        // 自动播放被策略拒绝 / 源不可解码：状态交给 error 事件，面板不假装在放
        if (target.mount.dataset.musicPlayerState === "open") {
            target.mount.dataset.musicPlayerState = "error";
            target.notice.hidden = false;
            target.notice.dataset.musicPlayerNotice = "error";
            target.notice.textContent = copy.error;
        }
    });
}

function closePlayer(target: PlayerInstance, _copy: PlayerCopy): void {
    teardownAudio(target);
    target.body.remove();

    const { mount } = target;
    mount.dataset.musicPlayerState = "closed";
    delete mount.dataset.musicPlayerId;
    const idle = mount.querySelector<HTMLElement>("[data-music-player-idle]");
    if (idle) idle.hidden = false;

    if (target.trigger && target.trigger.isConnected) target.trigger.focus();
    if (instance === target) instance = null;
}

/**
 * 页面脚本的入口：点某一条的「试听」时调用。
 *
 * 同一个挂载点复用同一个实例（换条目 = 换源，不重建面板），换页后旧挂载点已脱离文档
 * 则直接丢弃 —— swup 换页时模块不会重新执行，模块级单例必须自己判断存活。
 */
export function openTrack(mount: HTMLElement, trigger: HTMLElement, track: PlayerTrack): void {
    if (typeof document === "undefined" || !mount.isConnected) return;

    const copy = readCopy(mount);
    if (!instance || instance.mount !== mount || !instance.mount.isConnected) {
        instance?.close();
        instance = create(mount, copy);
    }

    instance.trigger = trigger;
    const idle = mount.querySelector<HTMLElement>("[data-music-player-idle]");
    if (idle) idle.hidden = true;

    show(instance, track, copy);
    instance.closeButton.focus();
}
