/**
 * 站级播放器的**门控常量**。
 *
 * 单独一个文件，是为了让门控脚本只内联这几百字节，而不是把整份电台数据
 * （含两个 stream URL）塞进全站每一页的 HTML。
 * 门控预算见 `26-m8-4-player-spec.md` §6.3：≤0.5KB gz。
 */

/** `armed` = 只有按过播放才加载；`always` = 每页都渲染折叠 pill（会动全站基线）。 */
export const radioPersistMode: "armed" | "always" = "armed";

/** localStorage 里的 arm 标记；关闭播放器时清除。 */
export const radioArmedKey = "dogeared-radio-armed";

/** 首屏不主动请求音频。 */
export const radioPreload = "none";
