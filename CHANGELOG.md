# Changelog

## 1.2.0

- Replace the single-page desk with a responsive league console: overview, players, queue, matches and seasons.
- Add explicit outcome selection, match details, rating charts, read-only archived rosters and connection cleanup.
- Cover seven isolated browser flows, including season rollover, stale requests, pagination and mobile access.
- Back up before updating. The automatic migration preserves existing ratings and history; only explicit season rollover resets current standings.

- Add searchable, paginated season standings, filtered match history, player profiles and league overview metrics.
- Add transactional season rollover with archived standings, preserved player availability and stale-request protection.
- Automatically import existing leagues without resetting ratings or inventing a legacy start date.

## 1.1.2

- Reject oversized Content-Length headers before accepting uploads, and explicitly close connections after streaming-limit rejections.

## 1.1.1

- Select the closest compatible opponent without allocating and sorting a candidate list for each queued player.
- Preserve oldest-player priority, rating tolerance and queue-time/ID tie breaking.
- Add equal-gap tie and already-paired opponent regression coverage.

## 1.1.0

- Add real browser regression tests for pairing, availability and mobile access.
- Show pending actions and prevent overlapping dashboard submissions.
- Back up and restart after updating. Player availability is added automatically; no ratings or history are reset.

- Preview compatible pairings without changing the queue, using the same selection rules as match creation.
- Keep match-creation counts visible in dashboard status messages.

- Add player deactivation/restoration with queue cleanup, pending-match protection and preserved ratings/history.

## 1.0.2

- Reject coercible player and match IDs such as booleans, arrays and noncanonical numeric strings.
- Require the application/json media type while accepting case-insensitive names and charset parameters.
- Add regression tests for ID validation and JSON media types.
- Expand `npm run check` to syntax-check source, browser code, tests and scripts.

### Upgrade

Restart the service after updating. Existing SQLite data is preserved. Clients must send canonical IDs and use Content-Type: application/json.
