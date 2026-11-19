# matchmaking

A small league application for running a 1v1 ladder. Register players, preview
rating-based pairings, report results, and keep standings across multiple seasons.
The browser console and JSON API share the same SQLite database. No Discord
server, external database, or hosted service is needed.

## Run

Use Node.js 22.13 or newer; Node 24 is recommended.

```sh
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
# Set API_TOKEN in .env to the generated value
node --env-file=.env src/index.js
```

Open `http://127.0.0.1:3000` and connect with your operator token. The token stays
in page memory and is cleared on disconnect. Anyone holding it can manage the
whole league; this application does not have individual player accounts.

## Using the console

- **Overview:** current-season totals, seven days of completed matches, queue
  waits, leading players, and recent matches.
- **Players:** registration, literal name search, paginated standings, inactive
  players, and player profiles. Profiles include lifetime W/L/D, season records,
  the last 30 current-season rating changes, and paginated match history.
- **Queue:** join or leave by player ID, preview compatible pairs, then create
  matches. Previews do not reserve players and are recalculated at creation.
- **Matches:** filter by season, status, or player. Open match details to inspect
  outcomes and rating changes. Select a pending match and explicitly choose its
  winner or a draw before saving. Cancelling does not affect ratings or requeue
  its players.
- **Seasons:** inspect archived standings or archive the current season and start
  another. Clear the queue and finish or cancel pending matches first.

Deactivating a player removes their queue entry and hides them from active
standings. A pending match must be resolved first. Restoring preserves their
ratings and history without automatically queueing them. Archived standings
retain the names and availability recorded when that season closed.

Season rollover snapshots all players, resets current ratings to 1000 and season
W/L/D to zero, and preserves IDs, availability, and every match. It asks for
confirmation and rejects stale requests from another organizer. There is no
undo button: take a backup before rollover if you may need to reverse it.

## Pairing and ratings

The oldest queued player is considered first. Their rating window starts at 100,
widens by 50 every 30 seconds, and stops at 600. The closest available opponent
inside that window is chosen; queue time and ID break ties. Players outside the
window remain queued. Matching runs when requested, rather than on a timer.
A player cannot queue while in a pending match.

Elo uses K=32 and integer points. Changes are zero-sum and bounded so ratings stay
nonnegative. Result recording and player statistics update in one transaction;
a repeated result returns 409 instead of changing ratings twice. This is a 1v1
ladder, with organizer-entered results rather than a dispute or verification flow.

## API

Every `/api` request requires `Authorization: Bearer <API_TOKEN>`. Writes also
require `Content-Type: application/json`. IDs must be positive safe integers or
canonical decimal strings, such as `1` or `"1"`.

| Method | Path | Body or behavior |
| --- | --- | --- |
| GET | `/api/console` | Overview, seasons, queue, and latest 20 pending matches |
| GET | `/api/overview` | Season metrics and seven-day activity |
| GET | `/api/standings` | `season=current\|<id>`, `q`, `inactive=true\|false`, `page` |
| GET | `/api/profiles/:id` | Current/lifetime stats, seasons, rating trail, history; `page` |
| GET | `/api/matches/history` | `season=current\|all\|<id>`, `status`, `player`, `page` |
| GET | `/api/matches/:id` | Match details and participant names |
| GET | `/api/seasons` | Current season and season directory |
| POST | `/api/seasons` | `{ "name": "Summer ladder", "expectedSeasonId": 1 }` |
| POST | `/api/players` | `{ "name": "Example" }` |
| GET | `/api/players` | Top 100 active players; legacy endpoint |
| GET | `/api/players/inactive` | Up to 100 inactive players |
| GET | `/api/players/:id` | Player and last 50 matches; legacy endpoint |
| POST | `/api/players/:id/status` | `{ "active": false }` or `{ "active": true }` |
| GET | `/api/queue` | Current queue |
| POST | `/api/queue/join` | `{ "playerId": 1 }` |
| POST | `/api/queue/leave` | `{ "playerId": 1 }` |
| GET | `/api/matches/preview` | Read-only pairing preview |
| POST | `/api/matches/make` | `{}`; create compatible pairs |
| GET | `/api/matches` | Last 100 matches; legacy endpoint |
| POST | `/api/matches/:id/result` | `{ "winnerId": 1 }` or `{ "winnerId": null }` for a draw |
| POST | `/api/matches/:id/cancel` | `{}` |
| GET | `/health` | Public health check |

Standings and history pages contain 20 rows. Search uses literal name fragments,
so `%` and `_` are not wildcards. Search preserves each player's overall rank.
Match status accepts `all`, `pending`, `completed`, or `cancelled`. Historical
standings come from immutable season snapshots; player profiles use current
names and retain all-time results. Existing API endpoints remain available.

## Operations and upgrades

`HOST` defaults to loopback, `PORT` to 3000, and `DATABASE_PATH` to
`./data/app.sqlite`. Keep the token and database private. For remote access, put
HTTPS and appropriate access controls in front of the server. Run one process
per database. There are no CORS grants or cookies. Requests have a 16 KB body
limit and a 120-per-minute, per-address rate limit. Forwarded IP headers are not
trusted, so users behind one proxy share its limit. Oversized uploads receive
413 and a closed connection.

Before upgrading, stop the service and back up the SQLite database, including any
WAL files, or use SQLite backup tooling. Then run `git pull --ff-only`, `npm ci`,
and restart. The transactional schema migration imports existing leagues into
Season 1 without changing ratings or results. A legacy season's unknown start
date stays unset. Restore a pre-upgrade backup to use an older binary; do not
point an older release at the migrated database.

This release has no result correction, automatic retention, teams, player login,
or multi-instance coordination. The rating chart shows recorded current-season
results, not inferred historical rating points.

## Checks

```sh
npm test
npm run check
npm audit
npx playwright install chromium
npm run test:browser
```

Alternatively, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chromium.
Browser tests run real HTTP servers on ephemeral loopback ports with a separate
temporary SQLite database per test. They never open your production database.
The test token is public fixture data; browser artifacts are ignored by Git.

The suites cover matching, Elo, persistence, validation, HTTP authentication and
limits, migration rollback, season archives, stale rollover requests, pagination,
literal search, and complete desktop/mobile console flows. See
[CHANGELOG.md](CHANGELOG.md) for release notes.
