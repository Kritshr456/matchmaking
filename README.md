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
Players beyond the maximum window remain queued. Matchmaking runs when requested,
not on a timer. A player cannot queue while already in a pending match.

New players start at 1000. Ratings use Elo with K=32, rounded to integer points.
Changes are zero-sum and bounded so neither player goes below zero. Results,
statistics and queue removals use SQLite transactions. A second result submission
returns 409 instead of updating ratings twice. Only 1v1 is supported in v1.

## API

All `/api` requests require `Authorization: Bearer <API_TOKEN>`. Write requests
also require `Content-Type: application/json`. IDs are positive integers.

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
