# Content Studio — [implemented, PR-04 foundation]

Run `npm run studio` and open `http://127.0.0.1:5173/studio/`. The same dev server serves the
ordinary game at `/`. Use Node 22.13 or newer. The Studio and its file API are absent from the
production build and Pages deployment. `npm run dev` remains the ordinary game workflow. Startup prints the exact Studio URL, including custom ports.
A forbidden or non-JSON file API response prompts you to open that URL without a raw parse error.

The current browser is read-only: navigate by kind or area, search IDs/names/text, and inspect
canonical JSON including author comments. Area navigation includes the area definition, its
linked activities and global activities. Other kinds and singleton settings remain available
through kind navigation. Illustrations are listed with their encoding and hash.

Diagnostics use the shared content registry. Selecting a problem opens its file and shows the
field location above the JSON. Invalid JSON stays visible as raw text. Changes made on disk
refresh through Vite's watcher; returning to the window or choosing **Refresh from disk** also
reloads the inventory. File API failures appear with a retry action. The game opens in a second
tab through **Open game** and uses its ordinary save slots.

Forms, save/undo/create controls, reference-aware rename/delete, area workspace, graphs and the
embedded game preview remain planned. The authoritative scope and delivery order live in the
[implementation plan](CONTENT_STUDIO_IMPLEMENTATION_PLAN.md).

## Local file transport

The dev-only `tools/vite-content-api.ts` plugin binds to `127.0.0.1`. Every API request must have
`Host: 127.0.0.1:<actual-port>` or `Host: localhost:<actual-port>` and, when supplied,
exactly `Origin: http://<that-same-Host>`. Mixing the two local names is rejected. Forwarded headers do not establish trust. Responses are
JSON with `Cache-Control: no-store`; cross-origin access is disabled.

| Request | Input | Successful response |
| --- | --- | --- |
| `GET /__studio/files` | none | `{ files: [{ path, content, encoding, hash }] }` |
| `PUT /__studio/files/<path>` | `{ expectedHash, content, encoding }` | `{ changed: [path], hash }` |
| `DELETE /__studio/files/<path>` | `{ expectedHash }` | `{ changed: [path] }` |
| `POST /__studio/files/<path>/rename` | `{ expectedHash, path: destination }` | `{ changed: [oldPath, destination], hash }` |

Mutation bodies use `Content-Type: application/json` and are limited to 32 MiB. `content` is raw
UTF-8 text with `encoding: "utf8"` for JSON; images use canonical base64 with `encoding: "base64"`.
`hash` is SHA-256 of the actual file bytes. Creation requires `expectedHash: null`; all other
mutations require the hash returned by the latest read. A mismatch or existing rename destination
returns `409`. Invalid input returns `400`, forbidden paths/origins `403`, unsupported media types
`415`, and unknown routes/missing deletion targets `404`.

Paths are normalized relative paths under `content/` ending in `.json`, or images under
`public/illustrations/` (`png`, `jpg`, `jpeg`, `webp`, `gif`, `avif`, `svg`). Traversal, absolute paths,
backslashes, hidden components, remaining encoded escapes, and symlinks are rejected. Other file
types are omitted from listings. Symlinks are conservatively unsupported even within these roots.

PUT writes a temporary sibling and renames it atomically. Requests are serialized around hash
checks and mutations. Rename moves one file without overwriting another; it does not change IDs
or rewrite references. The API transports raw bytes, including invalid JSON; registry validation
belongs to the Studio. Higher-level multi-file editing and its per-file reporting arrive in later
PRs. Git remains the recovery mechanism. Do not expose this dev server through a public proxy.

## Validation and build boundaries

`ContentError.problems` and its error message preserve their existing string output;
`ContentError.diagnostics` adds `{ file, path, message }` locations. Paths use dotted fields and
array indices; some existing reference diagnostics identify the containing condition/effect.
Pack-wide errors without a source remain visible without an entity link. The public shared
content surface is `src/content/index.ts`; it re-exports definitions without loading a pack.

`npm run typecheck` runs the import-boundary lint. `npm run build` checks the produced game bundle
for Studio/React code. Unit tests exercise the actual production build in a temporary output
folder and inspect its module list as well. See [testing](TESTING.md) for commands and coverage.
