# Security Hardening — batch 1

Tracks the code-level security fixes applied in `feat/security-hardening-batch` and the
operational follow-ups they require. Findings reference `INVESTOR_RISK_ASSESSMENT.md`.

## Shipped in this batch

| Finding | Fix | File |
|---------|-----|------|
| 7.1 Contact form: unauth + no rate limit + HTML-email injection | Added `contact` rate-limit preset (5 / 10 min / IP) and HTML-escape all user-supplied fields in every email body | `src/app/api/contact/route.ts`, `src/lib/security/rate-limit.ts` |
| 7.2 Admin JWT secret coupling / dev fallback in prod | `getJwtSecret()` now **fails closed** in production when no secret is set (was a `console.error` + `'dev-admin-secret'` fallback) and warns once when riding on `NEXTAUTH_SECRET` | `src/lib/admin/auth.ts` |
| 7.3 Legacy plaintext-password acceptance in admin login | Gated behind `ALLOW_LEGACY_PLAINTEXT_LOGIN` (**default OFF** = hole closed); logs loudly and upgrades the row to bcrypt when it fires | `src/app/api/admin/auth/login/route.ts` |
| 5.3 DB pool vs. managed-Postgres connection budget | Per-instance pool cap now overridable via `DB_POOL_MAX` (default unchanged: 50 prod / 5 dev) | `src/lib/db/drizzle.ts` |

## New / relevant environment variables

- **`ADMIN_JWT_SECRET`** — set a **dedicated** secret in production. Without it, admin sessions
  are signed with `NEXTAUTH_SECRET`, so a leak of one forges the other. App now warns until set.
  (Production still boots as long as `NEXTAUTH_SECRET` is present.)
- **`ALLOW_LEGACY_PLAINTEXT_LOGIN`** — leave unset/`false`. Only set to `true` for a one-time
  migration window if any admin/user accounts still have plaintext passwords stored; unset it
  again afterwards. Prefer forcing a password reset for those accounts instead.
- **`DB_POOL_MAX`** — optional per-instance Postgres pool cap. Keep `instances × DB_POOL_MAX`
  under the managed limit (Neon default ≈ 100).

## Verified as already-correct (no change needed — findings were overstated)

- **CSRF secret fallback (7.4):** `getCsrfSecret()` already throws in production when no secret
  is configured; the `'dev-csrf-secret'` fallback is dev-only. (`src/lib/security/csrf.ts`)
- **AI request rate limiting (part of 3.4):** student AI endpoints (`ask`, `task-chat`,
  `pci-master`) already apply the `aiGenerate` preset. Remaining gap is a per-user *token/spend
  budget*, which is a separate feature (see "Not addressed").

## Not addressed here (need product/legal/ops decisions or carry prod-breaking risk)

These are documented in `INVESTOR_RISK_ASSESSMENT.md` and are intentionally **out of scope** for a
safe code-only batch:

- **Child-safety / compliance (§1):** age verification, parental-consent flow, recording consent,
  chat/session moderation, Moonshot DPA + cross-border consent, privacy-policy/ToS rewrite. Require
  legal sign-off and product work.
- **Monetization (§2):** revenue recognition, payout disbursement — **money-movement code**;
  requires explicit authorization + sandbox verification before any change.
- **AI token/spend budget (§3.4)** and **guardrails warn→block (§3.5):** behavioural changes to
  grading/tutoring; need product review.
- **Migration journal unfreeze (§4.1):** high-risk DB change; must be done deliberately with a
  fresh-DB rebuild test, not folded into a hardening batch.
- **Real-time sticky sessions / Redis-always-on (§5.1):** infra change requiring load-balancer
  config, best validated under load.
- **Type-safety debt / lint cap / e2e-gating (§6):** large mechanical + CI-policy changes.
