/**
 * Dogeared Radio · dock behaviour (`/radio/` prototype)
 *
 * Deliberately page-scoped: it does not try to survive swup navigation or become
 * a site-wide singleton. The final SitePlayer (M8-4) has different requirements.
 */
type StationId = "radioparadise" | "nightride";

interface Station {
    id: StationId;
    name: string;
    note: string;
    url: string;
    home: string;
}

const STATIONS: Record<StationId, Station> = {
    radioparadise: {
        id: "radioparadise",
        name: "Radio Paradise",
        note: "Eclectic rock, electronic and world music. No ads, listener-supported.",
        url: "https://stream.radioparadise.com/mp3-128",
        home: "https://radioparadise.com/music/what-is-playing",
    },
    nightride: {
        id: "nightride",
        name: "Nightride FM",
        note: "Synthwave and cyberpunk sub-channels, with live DJ shows and IRC.",
        url: "https://stream.nightride.fm/nightride.mp3",
        home: "https://nightride.fm/",
    },
};

const STORAGE_KEY = "dogeared-radio-station";
const VOLUME_KEY = "dogeared-radio-volume";

function isStationId(value: string | null | undefined): value is StationId {
    return value === "radioparadise" || value === "nightride";
}

function readStation(): StationId {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return isStationId(saved) ? saved : "radioparadise";
    } catch {
        return "radioparadise";
    }
}

function readVolume(): number {
    try {
        const raw = Number(localStorage.getItem(VOLUME_KEY));
        return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.72;
    } catch {
        return 0.72;
    }
}

function mount(root: HTMLElement) {
    if (root.dataset.bound === "true") return;
    root.dataset.bound = "true";

    const audio = root.querySelector<HTMLAudioElement>("[data-radio-audio]");
    const toggle = root.querySelector<HTMLButtonElement>("[data-radio-toggle]");
    const panel = root.querySelector<HTMLElement>("[data-radio-panel]");
    const playButton = root.querySelector<HTMLButtonElement>("[data-radio-play]");
    const name = root.querySelector<HTMLElement>("[data-radio-name]");
    const note = root.querySelector<HTMLElement>("[data-radio-note]");
    const live = root.querySelector<HTMLElement>("[data-radio-live]");
    const status = root.querySelector<HTMLElement>("[data-radio-status]");
    const home = root.querySelector<HTMLAnchorElement>("[data-radio-home]");
    const volume = root.querySelector<HTMLInputElement>("[data-radio-volume]");
    const stationButtons = Array.from(
        root.querySelectorAll<HTMLButtonElement>("[data-radio-station]"),
    );

    if (!audio || !toggle || !panel || !playButton || !name || !note || !live || !status) {
        return;
    }

    let current = readStation();
    let isLoaded = false;
    let isPlaying = false;

    const stationOf = (id: StationId): Station => STATIONS[id];

    const setStatus = (text: string) => {
        status.textContent = text;
    };

    const setPlaying = (playing: boolean) => {
        isPlaying = playing;
        root.dataset.playing = String(playing);
        playButton.setAttribute("aria-pressed", String(playing));
        playButton.setAttribute("aria-label", playing ? "暂停电台" : "播放电台");
        live.textContent = playing ? "LIVE" : "STANDBY";
        playButton
            .querySelector<HTMLElement>('[data-radio-icon="play"]')
            ?.toggleAttribute("hidden", playing);
        playButton
            .querySelector<HTMLElement>('[data-radio-icon="pause"]')
            ?.toggleAttribute("hidden", !playing);
    };

    const renderStation = (id: StationId) => {
        const station = stationOf(id);
        current = id;
        name.textContent = station.name;
        note.textContent = station.note;
        if (home) home.href = station.home;
        stationButtons.forEach((button) => {
            const selected = button.dataset.radioStation === id;
            button.setAttribute("aria-pressed", String(selected));
        });
        try {
            localStorage.setItem(STORAGE_KEY, id);
        } catch {
            /* private mode: the dock still works */
        }
    };

    const ensureSource = () => {
        if (isLoaded && audio.src) return;
        audio.src = stationOf(current).url;
        isLoaded = true;
        setStatus("Buffering · " + stationOf(current).name);
    };

    const play = async () => {
        ensureSource();
        try {
            await audio.play();
        } catch {
            setStatus("Stream unavailable · 请在官方站点收听");
            setPlaying(false);
        }
    };

    const pause = () => {
        audio.pause();
        setPlaying(false);
        setStatus("Paused · 随时继续");
    };

    const setExpanded = (expanded: boolean, moveFocus = true) => {
        panel.hidden = !expanded;
        toggle.setAttribute("aria-expanded", String(expanded));
        root.dataset.state = expanded ? "expanded" : "collapsed";
        if (expanded && moveFocus) {
            panel.querySelector<HTMLElement>("[data-radio-station]")?.focus({
                preventScroll: true,
            });
        }
    };

    audio.volume = readVolume();
    if (volume) volume.value = String(Math.round(audio.volume * 100));
    renderStation(current);
    setPlaying(false);
    setStatus("Ready · 选择一个电台");

    toggle.addEventListener("click", () => {
        setExpanded(!panel.hasAttribute("hidden"));
    });

    playButton.addEventListener("click", () => {
        if (isPlaying) {
            pause();
        } else {
            setExpanded(true, false);
            void play();
        }
    });

    stationButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const id = button.dataset.radioStation;
            if (!isStationId(id)) return;
            const wasPlaying = isPlaying;
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
            isLoaded = false;
            renderStation(id);
            setPlaying(false);
            setStatus("Ready · " + stationOf(id).name);
            if (wasPlaying) void play();
        });
    });

    if (volume) {
        volume.addEventListener("input", () => {
            audio.volume = Number(volume.value) / 100;
            try {
                localStorage.setItem(VOLUME_KEY, String(audio.volume));
            } catch {
                /* ignore */
            }
        });
    }

    audio.addEventListener("playing", () => {
        setPlaying(true);
        setStatus("Live · " + stationOf(current).name);
    });
    audio.addEventListener("waiting", () => {
        if (isPlaying) setStatus("Buffering · " + stationOf(current).name);
    });
    audio.addEventListener("pause", () => {
        if (!audio.ended) setPlaying(false);
    });
    audio.addEventListener("error", () => {
        setPlaying(false);
        setStatus("Stream unavailable · 请在官方站点收听");
    });

    window.addEventListener("radio-open", () => {
        setExpanded(true);
    });
}

const selector = "[data-radio-dock]";

function boot() {
    document.querySelectorAll<HTMLElement>(selector).forEach(mount);
    document.querySelectorAll<HTMLElement>("[data-radio-open]").forEach((button) => {
        if (button.dataset.radioOpenBound === "true") return;
        button.dataset.radioOpenBound = "true";
        button.addEventListener("click", () => {
            window.dispatchEvent(new Event("radio-open"));
        });
    });
}

boot();
document.addEventListener("astro:page-load", boot);

export {};
