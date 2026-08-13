# Load tests (k6)

Run load tests against a running Solocorn app.

## Prerequisites

- Install [k6](https://k6.io/docs/getting-started/installation/): e.g. `brew install k6` (macOS) or see k6 docs.
- App running at `BASE_URL` (default `http://localhost:3003`).

## Scripts

| Script                    | Purpose                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- |
| `concurrent-users.js`     | Many GETs to `/api/health` (no auth).                                        |
| `ai-stress.js`            | POSTs to `/api/ai-tutor/chat`; set `AUTH_TOKEN` for authenticated load.      |
| `websocket.js`            | (Optional) WebSocket connections; k6 supports `k6/ws`.                       |
| `scheduling-conflicts.js` | Node-based concurrent schedule creation + session overlap / capacity checks. |

## Examples

```bash
# Default: 10 VUs, 30s
k6 run scripts/load/concurrent-users.js

# Custom base URL and load
BASE_URL=http://localhost:3003 k6 run --vus 20 --duration 60s scripts/load/concurrent-users.js

# AI stress (get session token from browser or login API first)
k6 run -e AUTH_TOKEN=your_session_token scripts/load/ai-stress.js

# Scheduling conflicts (Node; set credentials)
TUTOR_EMAIL=tutor@example.com TUTOR_PASSWORD=Password1 \
STUDENT_EMAIL=student@example.com STUDENT_PASSWORD=Password1 \
VUS=20 DURATION_SECONDS=15 \
node scripts/load/scheduling-conflicts.js
```

## npm scripts

- `npm run test:load` – runs concurrent-users (requires k6 installed).
- `npm run test:load:ai` – runs ai-stress (optional AUTH_TOKEN).
- `npm run test:load:ws` – placeholder; add websocket.js when needed.
- `npm run test:load:scheduling` – runs scheduling-conflicts (requires app + seeded tutor/student).

## CI

For a quick smoke load in CI, run:  
`k6 run --vus 5 --duration 10s scripts/load/concurrent-users.js`
