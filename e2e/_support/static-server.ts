/**
 * Minimal static file server for the state-level visual baselines (§7.2).
 *
 * The state builds live in `.visual-states/<state>/` (see
 * `scripts/visual/build-state-baseline.mjs`) and are *not* `dist/`, so `astro preview` cannot
 * serve them: it always serves the configured `outDir`. Serving them from inside the worker
 * process (instead of spawning one process per directory) keeps teardown synchronous — the
 * server closes when the file's tests finish, no orphan to leak into the next run and no lock
 * file to trip over.
 *
 * Deliberately dependency-free (stdlib only) and read-only: no caching headers, no ranges, no
 * directory listing, no writes. Directory URLs resolve to `index.html`, missing files are 404.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";

const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml",
    ".webmanifest": "application/manifest+json",
    ".pdf": "application/pdf",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".wasm": "application/wasm",
};

export type StaticServer = {
    origin: string;
    close: () => Promise<void>;
};

/**
 * Serve `root` on `port` (127.0.0.1 only) and resolve once the port is accepting connections.
 * Rejects when the port is taken, so a stale run surfaces as "port in use" instead of a spec
 * that silently screenshots somebody else's build.
 */
export async function startStaticServer(root: string, port: number): Promise<StaticServer> {
    const server: Server = createServer((request, response) => {
        void (async () => {
            try {
                const url = new URL(request.url ?? "/", "http://127.0.0.1");
                const decoded = decodeURIComponent(url.pathname);
                // Resolve inside root only: `path.join` alone would let `../` escape.
                let target = path.join(root, path.normalize(decoded));
                if (target !== root && !target.startsWith(root + path.sep)) {
                    response.writeHead(403).end("forbidden");
                    return;
                }

                let info = await stat(target).catch(() => null);
                if (info?.isDirectory()) {
                    target = path.join(target, "index.html");
                    info = await stat(target).catch(() => null);
                }
                if (!info?.isFile()) {
                    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
                    response.end(`404 ${decoded}`);
                    return;
                }

                response.writeHead(200, {
                    "content-type":
                        MIME[path.extname(target).toLowerCase()] ?? "application/octet-stream",
                    "content-length": info.size,
                    // No caching: each spec run must read the build on disk, not a previous one.
                    "cache-control": "no-store",
                });
                if (request.method === "HEAD") {
                    response.end();
                    return;
                }
                createReadStream(target).pipe(response);
            } catch (error) {
                response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
                response.end(String(error));
            }
        })();
    });

    await new Promise<void>((resolve, reject) => {
        server.once("error", (error: NodeJS.ErrnoException) => {
            reject(
                error.code === "EADDRINUSE"
                    ? new Error(`端口 ${port} 已被占用：上一次运行残留，或另一个 runner 正在跑`)
                    : error,
            );
        });
        server.listen(port, "127.0.0.1", () => resolve());
    });

    return {
        origin: `http://127.0.0.1:${port}`,
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.closeAllConnections?.();
                server.close((error) => (error ? reject(error) : resolve()));
            }),
    };
}
