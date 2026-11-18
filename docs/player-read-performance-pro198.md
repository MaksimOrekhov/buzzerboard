# Player read performance (PRO-198)

## Finding and change

Before this change, every `GET /api/players` and `GET /api/players/:id` read the full 2027 snapshot from D1, parsed its JSON, and ran `isStoredPlayers` across the complete player list, all stored details, and game references. Profile lookup then linearly searched the 645-entry list. The measured local snapshot is 329,283 bytes, with 645 directory rows, 10 enriched profiles, and 330 players with game-reference collections.

The Worker now caches one validated snapshot per D1 binding in a `WeakMap`, along with a player-ID map. A request still reads the authoritative D1 row and validates its timestamp. Reuse only occurs when the database binding, season, and exact payload string all match. A changed payload is parsed and fully revalidated before it can serve data; malformed content remains an error. Database bindings are isolated from each other, the cache holds only one season per binding, and the cache does not change D1 or response cache headers. Catalog reads reuse the validated full directory; profile reads use an O(1) player lookup and only validate the selected profile response. Verified game-reference lookups and cache-only semantics are unchanged.

This is an opportunistic warm-isolate optimization: the first request in a fresh isolate or after a snapshot update still parses and validates the whole payload. D1 still returns the current snapshot row on each request. No schema or importer change was needed, so existing local and remote data remain readable and no migration or re-import is required.

## CPU comparison

The same benchmark harness ran against the existing local D1 snapshot on `origin/main` before the change and on the optimized code after it. It exercised the real Worker request path with the 645-player payload, used a local D1 stub returning that unchanged row, disabled all upstream fetches, warmed each route, and measured process CPU for five batches of 100 requests per route. The reported value is the median batch CPU time per request. For profile reads it selected a player with saved game references; the repository stub returned cache misses so no game data was fabricated.

| Request                | Before (CPU ms/request) | After (CPU ms/request) | CPU reduction |
| ---------------------- | ----------------------: | ---------------------: | ------------: |
| `GET /api/players`     |                   3.015 |                  0.809 |         73.2% |
| `GET /api/players/:id` |                   2.187 |                  0.058 |         97.3% |

The baseline run used a detached worktree at `origin/main` (`406d271`) and the optimized run used this branch; both used the same harness and local D1 file. The profile case selected a stored profile with one saved game reference and seven saved log rows. This demonstrates the repeated parse/validation cost removed for a warm isolate. It is not a Cloudflare production p95/p99 comparison: it does not include Cloudflare's D1 binding transport and does not predict isolate reuse. PRO-196 observed only 21 Worker requests over its 24-hour window, so there is not enough production traffic to derive reliable per-route percentiles. After this PR is reviewed and merged through the normal CI deployment, collect a small authorized read-only sample and compare Worker CPU/log outcomes for health, catalog, profile, games, game detail, and teams. Do not run load tests or bypass Access. The Free 10 ms CPU invocation limit remains the deployment budget; this local result does not certify cloud headroom.

## Reproduce locally

Use the already populated local player D1 file. The profiler opens SQLite read-only and prints only request timings, row count, and payload size:

```sh
node --experimental-strip-types scripts/pro198-player-profile.mjs \
  .wrangler/pro195/v3/d1/miniflare-D1DatabaseObject/888c21ab22d15eb302062d13e43b157caa8e041b5205f6d44b4a36930cdbc5a1.sqlite
```

The comparison's baseline is the `origin/main` implementation before the change; subsequent runs measure the current warm-isolate implementation. Do not direct the script at remote D1. It makes no network requests and does not change the supplied local database.
