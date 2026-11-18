# Changelog

## Unreleased

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
