# matchmaking

An operator-run 1v1 ladder with a browser desk and JSON API. Players enter a queue,
get paired with a nearby rating, and build a persistent record of wins, losses,
draws and Elo changes. It works without a Discord server or external database.

## Run

Node.js 22.13+ is required; Node 24 is recommended.

```sh
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
# Put the generated value in .env as API_TOKEN
node --env-file=.env src/index.js
```

Open `http://127.0.0.1:3000` and enter the operator token. Register a few players,
queue their IDs, and click **Make compatible matches**. Record a winner's player
ID, or leave the winner blank for a draw. Statistics and rankings update together.
Cancelled matches do not change ratings and do not automatically requeue players.

The token stays in page memory; it is not saved in browser storage. This is a
trusted organizer's desk: anyone holding the token can manage every player and
result. It does not provide individual player accounts or self-service reporting.

## Pairing and ratings

The oldest queued player is considered first. Their initial rating window is
100 points; every 30 seconds it widens by 50, up to 600. The closest available
opponent inside that window is chosen, with queue time and ID breaking ties.
Opponent selection scans candidates in queue order, avoiding a separate sort per
player. Players beyond the maximum window remain queued. Matchmaking runs when requested,
not on a timer. A player cannot queue while already in a pending match.

New players start at 1000. Ratings use Elo with K=32, rounded to integer points.
Changes are zero-sum and bounded so neither player goes below zero. Results,
statistics and queue removals use SQLite transactions. A second result submission
returns 409 instead of updating ratings twice. Only 1v1 is supported in v1.

## API

All `/api` requests require `Authorization: Bearer <API_TOKEN>`. Write requests
also require `Content-Type: application/json`. IDs must be positive safe integers or canonical decimal strings (for example `1` or `"1"`). Booleans, arrays, whitespace and exponent-form strings are rejected.

| Method | Path | Body / behavior |
| --- | --- | --- |
| POST | /api/players | `{ "name": "Example" }` |
| GET | /api/players | Top 100 players with ratings and statistics |
| GET | /api/players/:id | Player statistics and last 50 matches |
| POST | /api/queue/join | `{ "playerId": 1 }` |
| POST | /api/queue/leave | `{ "playerId": 1 }` |
| GET | /api/queue | Current queue |
| POST | /api/matches/make | `{}`; creates all currently compatible pairs |
| GET | /api/matches | Last 100 matches |
| POST | /api/matches/:id/result | `{ "winnerId": 1 }` or `{ "winnerId": null }` |
| POST | /api/matches/:id/cancel | `{}` |
| GET | /health | Unauthenticated health check |

## Operations and checks

HOST defaults to loopback, PORT to 3000, DATABASE_PATH to `./data/app.sqlite`.
Keep the token and database private. Use HTTPS through a reverse proxy before
remote use. There are no cookies or CORS grants; API requests use bearer auth,
16 KB body limits and a per-address rate limit. Behind a proxy the rate limit
uses the proxy address, since forwarded IP headers are deliberately not trusted.
Run one process per database. Keep backups with SQLite backup tooling or stop
the service before copying the database and WAL files. No automatic retention,
result correction or season resets are provided in v1.

```sh
npm test
npm run check
npm audit --omit=dev
```

Tests cover matching and queue restrictions, tolerance growth, Elo, duplicate
results, validation, file persistence and a real HTTP registration-to-result flow.

HTTP security tests also exercise bearer authentication, JSON and content-type
validation, oversized request rejection, security headers and rate limits.

## Updating

Run `git pull --ff-only` and `npm ci`, then restart the service.
See [CHANGELOG.md](CHANGELOG.md) for the latest behavior changes. This update
does not require a database migration.

## Player availability

Operators can deactivate or restore a player from the dashboard, or POST
`/api/players/:id/status` with `{ "active": false }` / `{ "active": true }`.
Deactivation removes a queued entry atomically and hides the player from the
rankings. Pending matches must finish or be cancelled first. Inactive players
cannot queue. Ratings, statistics, names and match history are retained, and
restoring does not reset them or automatically requeue the player.
GET `/api/players/inactive` lists up to 100 inactive players; history remains
available through `/api/players/:id`. All endpoints require the operator token.
Back up before upgrading. Existing players are made active during the automatic
upgrade; restore the backup to roll back to a release without availability flags.

## Pairing preview

Click **Preview compatible pairs**, or GET `/api/matches/preview`, to inspect
compatible pairs without removing queue entries or creating matches. The response
contains `generatedAt` and `pairs`, with player IDs, ratings, rating gaps and wait
times. The same selection logic is used by match creation. Preview does not reserve
players: a later create request recalculates pairs against the current queue and
clock. Refreshing the dashboard clears old preview results.

## Browser regression checks

`npm run test:browser` drives the real dashboard, API and an isolated temporary
SQLite database. It covers preview-to-result, availability and pending-match
protection, preserved history, HTML-like names, authentication and a phone viewport.
Run `npx playwright install chromium` first, or set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing Chromium executable. The
test server uses loopback port 4187 (override BROWSER_TEST_PORT) and a public
test-only token. It never opens the production database. Browser artifacts are
ignored by Git. The dashboard disables action buttons while a request is pending.

Oversized declared request bodies are rejected from their headers before upload
bytes are accepted. Streaming bodies remain limited to 16 KB. A 413 response
explicitly closes the connection rather than advertising reuse for an unfinished upload.

## Seasons

GET `/api/seasons` returns the current season and season directory. POST
`/api/seasons` with `{ "name": "Summer ladder", "expectedSeasonId": 1 }` archives
the current standings and starts a new season. The queue must be empty and all
pending matches resolved. Ratings restart at 1000 and season W/L/D counters reset;
player IDs, inactive flags and all match history remain intact. Stale rollover
requests are rejected instead of opening a second empty season.

Back up before upgrading. Existing leagues are imported into Season 1 without
changing their ratings or results. Their original season start date is unknown
and is left unset. The schema migration is transactional. Restore a pre-upgrade
backup to run an older release against the same data.
