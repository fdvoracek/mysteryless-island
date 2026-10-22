import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

export interface StudioFile { path: string; content: string; encoding: "utf8" | "base64"; hash: string }
const prefix = "/__studio/files";
const image = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
class FileError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

/** No URL normalization before checking segments: even encoded traversal must be rejected. */
export function allowedStudioPath(path: string): boolean {
  return !path.includes("\\") && !path.includes("%") && !path.includes("\0")
    && path.split("/").every((part) => part.length > 0 && !part.startsWith("."))
    && (/^content\/.+\.json$/.test(path) || (path.startsWith("public/illustrations/") && image.test(path)));
}

/** A dev-only file transport. Entity/reference editing belongs to the later Studio editor. */
export function contentApi(): Plugin {
  return {
    name: "textisland-studio-files", apply: "serve",
    config: () => ({ server: { host: "127.0.0.1", cors: false } }),
    configureServer(server) {
      const printUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        printUrls();
        const address = server.httpServer?.address();
        if (address && typeof address === "object") server.config.logger.info(`  Studio: http://127.0.0.1:${address.port}/studio/`);
      };
      const root = resolve(server.config.root);
      const notify = (_event: string, path: string) => {
        const local = relative(root, path).split(sep).join("/");
        if (allowedStudioPath(local)) server.ws.send({ type: "custom", event: "studio:files-changed", data: { path: local } });
      };
      server.watcher.on("all", notify);
      server.httpServer?.once("close", () => server.watcher.off("all", notify));
      // Serialize our hash checks and mutations, including competing requests from two tabs.
      let pending: Promise<unknown> = Promise.resolve();
      async function safePath(path: string) {
        if (!allowedStudioPath(path)) throw new FileError(403, "Path is outside the content/image allowlist");
        let current = root;
        const parts = path.split("/");
        for (const [index, part] of parts.entries()) {
          current = join(current, part);
          try {
            const stat = await lstat(current);
            if (stat.isSymbolicLink()) throw new FileError(403, "Symlinks are not supported");
            if (index < parts.length - 1 && !stat.isDirectory()) throw new FileError(400, "Parent is not a directory");
            if (index === parts.length - 1 && !stat.isFile()) throw new FileError(400, "Path is not a file");
          } catch (error) { if (!missing(error)) throw error; }
        }
        return current;
      }
      async function list(): Promise<StudioFile[]> {
        const files: StudioFile[] = [];
        async function walk(path: string) {
          let entries;
          try { entries = await readdir(join(root, path), { withFileTypes: true }); }
          catch (error) { if (missing(error)) return; throw error; }
          for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            const child = `${path}/${entry.name}`;
            if (entry.isSymbolicLink()) throw new FileError(403, "Symlinks are not supported");
            if (entry.isDirectory()) await walk(child);
            else if (allowedStudioPath(child)) {
              const bytes = await readFile(await safePath(child));
              const encoding = child.startsWith("content/") ? "utf8" : "base64";
              files.push({ path: child, content: bytes.toString(encoding), encoding, hash: hash(bytes) });
            }
          }
        }
        // Check the roots too: a symlinked allowlist directory must never be followed.
        for (const base of ["content", "public/illustrations"]) {
          let current = root;
          for (const part of base.split("/")) {
            current = join(current, part);
            try { if ((await lstat(current)).isSymbolicLink()) throw new FileError(403, "Symlinks are not supported"); }
            catch (error) { if (!missing(error)) throw error; }
          }
          await walk(base);
        }
        return files;
      }
      async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
        if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json") throw new FileError(415, "Expected application/json");
        const chunks: Buffer[] = []; let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 32 * 1024 * 1024) throw new FileError(413, "Request exceeds 32 MiB");
          chunks.push(Buffer.from(chunk));
        }
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
          return value;
        } catch { throw new FileError(400, "Expected a JSON object"); }
      }
      async function execute(req: IncomingMessage) {
        const raw = req.url!.split("?")[0];
        if (raw === prefix && req.method === "GET") return { files: await list() };
        if (!raw.startsWith(prefix + "/")) throw new FileError(404, "Unknown Studio route");
        const renaming = req.method === "POST" && raw.endsWith("/rename");
        if (!["PUT", "DELETE"].includes(req.method ?? "") && !renaming) throw new FileError(405, "Method not allowed");
        let path: string;
        try { path = decodeURIComponent(raw.slice(prefix.length + 1, renaming ? -7 : undefined)); }
        catch { throw new FileError(400, "Invalid URL encoding"); }
        const target = await safePath(path);
        const input = await body(req);
        if (!(typeof input.expectedHash === "string" || input.expectedHash === null)) throw new FileError(400, "expectedHash is required (null for creation)");
        let bytes: Buffer | undefined;
        try { bytes = await readFile(target); } catch (error) { if (!missing(error)) throw error; }
        if ((bytes ? hash(bytes) : null) !== input.expectedHash) throw new FileError(409, "File changed on disk");
        if (req.method === "PUT") {
          if (typeof input.content !== "string") throw new FileError(400, "content must be a string");
          const encoding = path.startsWith("content/") ? "utf8" : "base64";
          if (input.encoding !== encoding) throw new FileError(400, `encoding must be ${encoding}`);
          const next = Buffer.from(input.content, encoding);
          if (encoding === "base64" && next.toString("base64") !== input.content) throw new FileError(400, "Invalid base64 image");
          await mkdir(dirname(target), { recursive: true });
          const temporary = join(dirname(target), `.studio-${randomUUID()}.tmp`);
          try {
            await writeFile(temporary, next, { flag: "wx" });
            await rename(temporary, target);
          } finally { await unlink(temporary).catch((error) => { if (!missing(error)) throw error; }); }
          return { changed: [path], hash: hash(next) };
        }
        if (!bytes) throw new FileError(404, "File does not exist");
        if (renaming) {
          if (typeof input.path !== "string") throw new FileError(400, "Destination path is required");
          const destination = await safePath(input.path);
          // Renames never overwrite an existing file, even if its hash happens to match.
          try { await lstat(destination); throw new FileError(409, "Destination already exists"); }
          catch (error) { if (!missing(error)) throw error; }
          if (path.startsWith("content/") !== input.path.startsWith("content/")) throw new FileError(400, "Cannot rename across content and image roots");
          await mkdir(dirname(destination), { recursive: true });
          await rename(target, destination);
          return { changed: [path, input.path], hash: hash(bytes) };
        }
        await unlink(target);
        return { changed: [path] };
      }
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url?.startsWith("/__studio/")) return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        const address = server.httpServer?.address();
        const host = req.headers.host;
        const localHost = address && typeof address === "object"
          && (host === `127.0.0.1:${address.port}` || host === `localhost:${address.port}`);
        // Only these two literal Hosts at the actual listening port are trusted. Never read forwarded headers.
        if (!localHost || (req.headers.origin !== undefined && req.headers.origin !== `http://${host}`)) {
          res.statusCode = 403; res.end(JSON.stringify({ error: "Host/Origin must match this local server" })); return;
        }
        const operation = pending.then(() => execute(req));
        pending = operation.catch(() => undefined);
        void operation.then((result) => { res.end(JSON.stringify(result)); }, (error: unknown) => {
          res.statusCode = error instanceof FileError ? error.status : 500;
          res.end(JSON.stringify({ error: error instanceof FileError ? error.message : "File operation failed" }));
        });
      });
    },
  };
}
