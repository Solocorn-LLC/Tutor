# Realtime horizontal-scaling — live-session cache coherency

**Status:** Design / proposal · **Owner:** backend · realtime · **Target:** 1,000+ concurrent users
**Scope:** `src/lib/socket-server-enhanced.ts`, `src/lib/socket/**` — the state layer only, not handler business logic.

---

## 1. Goal

At 1,000+ concurrent users the app runs on **multiple Cloud Run instances**. Live sessions
(Socket.io) must stay **correct across instances**: consistent rosters, chat, whiteboard, polls,
and membership checks regardless of which instance a given socket landed on.

This is a **platform-independent** requirement — it's the real unlock for the concurrency target,
and it is the same work whether we stay on Cloud Run (we are) or ever move.

## 2. What already works — do **not** rebuild

The realtime layer is more scaling-aware than a first read suggests. Already in place:

| Capability | Where | Effect |
|---|---|---|
| Socket.io **Redis adapter** | `socket-server-enhanced.ts:630` | `io.to(room).emit()` fans out across all instances |
| Room **snapshot persisted to Redis** | `persistRoomToRedis()` :418 → key `room:{id}`, TTL 86400 | a cold instance can rebuild a room |
| **Hydrate-on-join** | `join_class` :872 → `getRoomFromRedis()` :449 | joining instance loads the room from Redis on a local miss |
| Cross-instance **one-shot dedup** | session-alert `NX` claim :640 | only one instance fires end/start alerts |
| **Connection recovery** | `connectionStateRecovery` :612 | brief drops keep rooms + missed events |

Broadcast delivery is therefore **already correct across instances**. The gap is not delivery — it
is **shared mutable state**.

## 3. The problem — `activeRooms` is an unsynchronized cache

`const activeRooms = new Map<string, ClassRoom>()` (:296) is **per-instance in-memory** and is the
source of truth for server-side *decisions*: room membership, `tutorId`, presence counts, the chat
tail, whiteboard snapshot. Four concrete coherency gaps:

1. **Stale reads (no invalidation).** Once instance B hydrates a room, later mutations on instance A
   are never reflected on B — there is no state-change pub/sub. B keeps serving a stale roster.
2. **Whole-snapshot clobber.** `persistRoomToRedis` writes the **entire** room object
   (`students`, `chatHistory`, …). Two instances persisting concurrently is last-writer-wins: a
   student added on A can be erased by a near-simultaneous persist from B.
3. **Inconsistent persistence.** Only **12** `persistRoomToRedis` call sites against many more
   mutation sites — e.g. `chatHistory.push` (:834), `students.delete` (:2449), `students.set`
   (:2523) have **no adjacent persist**, so the Redis snapshot silently drifts from memory.
4. **Non-hydrating reads.** Several `activeRooms.get()` sites have **no Redis fallback** (unlike the
   join path), so a handler **silently no-ops** on an instance that never hydrated that room.

**Impact at scale:** students in one room split across instances → inconsistent rosters, late-joiners
on a "cold" instance miss chat/whiteboard, membership checks (both correctness *and* the new authz
checks) read stale state, presence counts flicker.

> ⚠️ Because of gap #2, **naively adding more `persistRoomToRedis` calls makes it worse** — more
> full-snapshot writes means more clobbering. The fix is atomic per-field ops, not more snapshots.

## 4. Design principles

- **Single source of truth for shared mutable state = Redis**, mutated with **atomic per-field ops**
  (HSET/HDEL/LPUSH), never whole-object read-modify-write.
- **Local memory becomes a read-through cache** with explicit invalidation — or is eliminated for the
  hot fields.
- **Prefer the adapter's own room membership** (`io.in(room).fetchSockets()`) over a parallel
  `students` map wherever "who is connected" is all we need.
- **Keep the hot path broadcast-only.** Whiteboard deltas already broadcast via the adapter and
  persist only compact snapshots — do **not** round-trip Redis per delta.

## 5. Options considered

**Option A — Redis-backed room state (atomic ops) + adapter-native membership. ✅ Recommended.**
Membership from the adapter; rich per-student state in a Redis hash `room:{id}:students` (HSET/HDEL);
chat tail as a capped list; meta as `room:{id}:meta` hash. Reads via pipelined Redis or a ≤1s local
cache invalidated by a `room:{id}:events` pub/sub. Correct, no clobber, minimal change to emits.
*Cost:* more Redis round-trips — mitigated by pipelining + a tiny TTL cache.

**Option B — Full externalization (every read/write → Redis).** Simplest to reason about, highest
latency/Redis load on hot paths. Rejected as the default for the whiteboard path.

**Option C — Room affinity (pin each room to one instance).** Consistent-hash routing by `roomId`.
Keeps the in-memory model. Rejected: Cloud Run LB affinity is per-client-cookie, not per-room; no HA
(instance death loses the room); hot-room imbalance.

## 6. Phased plan (each phase independently shippable + flag-gated)

**Phase 0 — Validation harness (no behavior change).**
Stand up local **2+ instances behind one Redis** (docker compose) and a socket load script
(k6/artillery) that drives N clients through shared rooms and **asserts roster/chat/whiteboard
consistency**. Add metrics: `activeRooms` size, Redis room-op counts, hydrate misses. *This harness is
the gate for every later phase.*

**Phase 1 — Consistent, non-clobbering persistence (foundational).**
Replace whole-snapshot persistence of mutable collections with **atomic ops**: students →
`HSET/HDEL room:{id}:students`, chat tail → capped list, meta → hash. Co-locate the Redis op with each
mutation (audit the sites in §7). Keep a periodic snapshot only for cold-start convenience.

**Phase 2 — Correct reads (hydrate + freshness).**
Every server-side decision reading membership/meta reads from Redis (pipelined) or a ≤1s local cache
invalidated by a `room:{id}:events` pub/sub. Replace the non-hydrating `activeRooms.get()` reads.
Use adapter room membership for "connected sockets."

**Phase 3 — Presence & lifecycle across instances.**
Global presence via Redis + pub/sub (join/leave from any instance updates the shared roster and
notifies the room). Handle instance death with TTLs + heartbeat so a crashed instance's sockets don't
linger in the roster.

**Phase 4 — Validate, roll out behind a flag, then remove it.**
Gate the new path on `REALTIME_SHARED_STATE=true`. Load-test to the 1,000-user target on **≥3
instances**, compare consistency vs the old path, progressive rollout, keep the old path one release
for rollback.

## 7. Exit criteria

- 1,000 concurrent sockets across a set of rooms on **≥3 instances**: roster, chat, whiteboard, and
  polls converge within a small bound; **no clobbered state**; membership/authz checks correct.
- No Redis hot-key (room state already sharded per `roomId`); Redis op latency within budget on the
  whiteboard path (kept broadcast-only).

## 8. Risks & mitigations

- **Redis becomes SPOF/bottleneck** → managed Redis (ElastiCache/Memorystore), pipelining, a healthy
  client pool, and the existing fail-soft in-memory fallback for a *degraded* single-instance mode.
- **Latency on the whiteboard hot path** → keep deltas broadcast-only; persist only compact snapshots
  (already the behavior at :422).
- **Scope creep in a 2,600-line file** → phases are independently shippable and flag-gated; state
  layer only, no handler logic changes.

## 9. Non-goals

- Not moving off Cloud Run (decided — no AWS driver).
- Not changing socket handler business logic — only the state layer beneath it.

## 10. Appendix — concrete inventory (as of this branch's base)

- **Redis keys today:** `room:{id}` (full snapshot, TTL 86400) · `notif:alert:{key}` (NX dedup).
- **`ClassRoom` shape:** `id`, `tutorId`, `students: Map`, `chatHistory`, `tasks` (intentionally not
  persisted), `whiteboardData`, `createdAt`, `lastActivity`.
- **`persistRoomToRedis` call sites (12):** 353, 1197, 1531, 1601, 1871, 2269, 2298, 2314, 2353, 2373,
  2403 (+ definition 418).
- **Mutation sites lacking an adjacent persist (examples):** `chatHistory.push` :834 ·
  `students.delete` :2449 · `students.set` :2523 · several `whiteboardData =` writes.
- **Adapter + Redis init:** `initRedis()` :522, adapter attach :630.
