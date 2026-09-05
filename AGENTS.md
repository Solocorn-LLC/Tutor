# Solocorn / TutorMekimi — AI Coding Agent Guide

> **Last updated:** 2026-08-15
> **Repository root:** `C:\VSCODE\Tutor`
> **Language:** English (all code comments, docs, and identifiers are in English)

This is a polyglot monorepo with **no root `package.json`** — each sub-project manages its own dependencies and is run from its own directory. A duplicate of this `AGENTS.md` file sits one level above the repository root (`C:\VSCODE`) for agent discoverability; all code paths below are relative to `C:\VSCODE\Tutor`.

---

## Project Overview

**Solocorn** (marketed as **TutorMekimi** / **CogniClass**) is an AI-human hybrid tutoring platform. It provides 24/7 Socratic AI tutoring alongside live group clinics led by human tutors. The platform supports four user roles — **Student**, **Tutor**, **Parent**, and **Admin** — and is built for global deployment with particular focus on Chinese market adaptation.

### Core Capabilities

- AI tutors use the Socratic method (never give direct answers; guide students to discover).
- Live clinics: 1 tutor can manage up to 50 students with real-time AI monitoring.
- Video learning with inline quizzes and AI-generated assessments.
- Gamification: XP, missions, achievements, badges, and leaderboards.
- Multi-role dashboards with distinct feature sets per role.
- Real-time collaborative whiteboard, polling, chat, and presence via Socket.io.
- 1-on-1 tutoring booking and scheduling with calendar integration.
- Payment processing through Airwallex, Hitpay, and Chinese gateway helpers (WeChat Pay, Alipay).

### Key Metrics (measured from the repository)

| Metric | Value |
|--------|-------|
| Target tutor-to-student ratio | 1 : 50 |
| Configured locales | 10 (`en`, `zh-CN`, `es`, `fr`, `de`, `ja`, `ko`, `pt`, `ru`, `ar`) |
| Locale message files present | `messages/en.json`, `messages/zh-CN.json` only |
| Main app default port | `3003` |
| Landing page default port | `3000` |
| `route.ts` files under `src/app/api` | 277 |
| TypeScript/TSX files under `tutorme-app/src` | 1,118 |
| Unit/integration test files under `src` | 140 |
| Playwright E2E specs | 15 (plus accessibility tests via Playwright) |
| Drizzle SQL migrations | 79 in `drizzle/`, 22 in `drizzle/archive/` |
| Top-level domain directories under `src/lib` | 50 |

---

## Repository Layout

```
C:\VSCODE\Tutor/
│
├── tutorme-app/              # Main Next.js application (backend + primary frontend)
│   ├── src/
│   │   ├── app/              # Next.js App Router
│   │   │   ├── [locale]/     # i18n route segments (pages per role)
│   │   │   │   ├── student/  # Student dashboard & features
│   │   │   │   ├── tutor/    # Tutor dashboard & clinic management
│   │   │   │   ├── parent/   # Parent dashboard & family management
│   │   │   │   ├── admin/    # Admin dashboard & system management
│   │   │   │   ├── login/
│   │   │   │   ├── register/
│   │   │   │   ├── onboarding/
│   │   │   │   ├── payment/
│   │   │   │   ├── legal/
│   │   │   │   ├── forgot-password/
│   │   │   │   ├── api-docs/
│   │   │   │   ├── categories/
│   │   │   │   ├── session/
│   │   │   │   ├── tutors/
│   │   │   │   ├── call/
│   │   │   │   ├── pitch-deck/
│   │   │   │   └── u/
│   │   │   └── api/          # REST API endpoints (277 route.ts files)
│   │   ├── components/       # React components (feature-organized)
│   │   ├── lib/              # Business logic, utilities, AI, db, security, etc. (50 domains)
│   │   ├── hooks/            # Custom React hooks
│   │   ├── i18n/             # next-intl request config (re-exports from lib/i18n)
│   │   └── stores/           # Zustand client stores
│   ├── e2e/                  # Playwright E2E specs (15 .spec.ts files)
│   ├── drizzle/              # Drizzle migration files
│   ├── messages/             # next-intl JSON translations
│   ├── scripts/              # Build, deployment & utility scripts
│   ├── src/scripts/          # TypeScript runtime scripts (seed, verify, etc.)
│   ├── public/               # Static assets, PWA files, and landing-page output
│   ├── server.ts             # Custom Next.js HTTP server with Socket.io
│   ├── Dockerfile            # Full .next + custom server build
│   ├── Dockerfile.production   # Standalone-output build for GCP Cloud Run
│   ├── docker-compose.local.yml # Local db + redis + optional app container
│   ├── docker-compose.prod.yml  # Legacy compose (still references adk-service; see Runtime Architecture)
│   ├── next.config.mjs       # Next.js configuration (standalone, Sentry, intl, rewrites/redirects)
│   ├── tsconfig.json         # TypeScript strict config
│   ├── eslint.config.mjs     # ESLint flat config
│   ├── tailwind.config.ts    # Tailwind CSS v3 with extensive custom theme
│   ├── postcss.config.mjs    # PostCSS with Tailwind plugin
│   ├── drizzle.config.ts     # Drizzle Kit configuration
│   ├── vitest.config.ts      # Unit test configuration
│   ├── vitest.integration.config.ts # Integration test configuration
│   ├── playwright.config.ts  # E2E test configuration
│   └── package.json          # Node scripts & dependencies (package name `solocorn-app`)
│
├── landing-page/             # Vite 6 + React 19 + TypeScript marketing site
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── index.css
│   │   ├── vite-env.d.ts
│   │   └── components/       # Layout, Profile, Registration, ContactModal
│   ├── package.json          # Package name `react-example`
│   ├── vite.config.ts        # Static export to dist/ on port 3000
│   ├── tsconfig.json
│   ├── .env.example
│   └── README.md
│
├── design-system/            # Shared design tokens and guidelines
│   └── solocorn/
│       └── MASTER.md
│
├── Classroom/                # Tutor-facing documentation for live classes
│   ├── BUTTON_GUIDE.md
│   └── README.md
│
├── docs/                     # Project documentation (realtime-scaling.md, guardrails/)
│
├── scripts/                  # Root-level ops / utility scripts
│   ├── setup.sh              # Legacy scaffolding — DO NOT run on existing codebase
│   ├── setup.bat             # Legacy scaffolding — DO NOT run on existing codebase
│   ├── build-and-integrate-landing.sh
│   ├── deploy-to-ec2.sh      # Legacy EC2 deployment
│   ├── backup.ts             # Postgres → GCS backup
│   ├── restore.sh            # Restore backup into local Docker DB
│   ├── rotate-kimi-key.sh    # GCP Secret Manager key rotation
│   ├── auto-sync.sh          # Pull / commit / push helper
│   └── fix-course-builder.js # Hardcoded-path drizzle helper
│
├── .github/workflows/        # CI/CD (ci.yml, deploy-gcp.yml, secret-scan.yml, keep-alive.yml)
├── .devcontainer/            # VS Code dev container config
├── .vscode/                  # VS Code workspace settings
├── .cursor/                  # Cursor IDE configuration
├── .cursorrules              # Solocorn AI development workflow rules
├── .githooks/                # Pre-commit hook (auto-format staged files)
├── .prettierrc               # Shared Prettier config
├── .prettierignore
├── .gitignore
├── package-lock.json         # Legacy root lockfile (empty packages object — no root package.json)
├── README.md                 # Contains the Solocorn AI development rules (duplicates .cursorrules)
├── CLAUDE.md                 # Claude-specific project overview
├── GEMINI.md                 # Gemini-specific overview
├── QUICKSTART.md             # Legacy quick-start
└── KIMI_API_SETUP.md         # Kimi API key setup and rotation guide
```

---

## Technology Stack

| Layer | Technology | Version / Notes |
|-------|------------|-----------------|
| **Framework** | Next.js (App Router) | `^16.1.6`, `output: 'standalone'` |
| **Language** | TypeScript | `^5.9.3`, strict mode (`strict: true`) |
| **UI** | React | `^18` (main app); `^19` (landing page) |
| **Styling** | Tailwind CSS | `^3.4.1` (main app); `^4.1.14` (landing page) |
| **Components** | shadcn/ui + Radix UI | Headless primitives installed to `src/components/ui/` |
| **Animation** | framer-motion / motion | `^12.34.0` (main app); `^12.23.24` (landing page) |
| **State** | Zustand | `^5.0.11` |
| **Drag & Drop** | @dnd-kit | `^6.3.1` core, `^10.0.0` sortable |
| **ORM** | Drizzle ORM | `^0.45.2` (Prisma is **not** used) |
| **ORM Kit** | Drizzle Kit | `^0.31.10` |
| **DB Driver** | pg (node-postgres) | `^8.13.0`, connection pooling |
| **Database** | PostgreSQL | 16 (recommended) |
| **Cache / PubSub** | Redis | `^7` via `ioredis ^5.9.2` |
| **Real-time** | Socket.io | `^4.8.3` (server + client), Redis adapter |
| **Auth** | NextAuth.js | `^4.24.13`, JWT sessions, CredentialsProvider |
| **i18n** | next-intl | `^4.8.3`, 10 locales configured, RTL support for `ar` |
| **Validation** | Zod | `^4.3.6` (main app) |
| **Video** | Daily.co | `@daily-co/daily-js ^0.87.0` |
| **Whiteboard** | Custom Socket.io + Yjs | Real-time collaborative canvas |
| **AI Provider** | Kimi (Moonshot) | `src/lib/ai/kimi.ts`; direct path only |
| **Payments** | Airwallex, Hitpay, WeChat Pay, Alipay | Gateway abstraction in `lib/payments/` |
| **Monitoring** | Sentry | `@sentry/nextjs ^10.39.0` (optional, wrapped conditionally) |
| **Testing (unit)** | Vitest | `^4.1.0` with jsdom |
| **Testing (E2E)** | Playwright | `@playwright/test ^1.49.0` |
| **Load testing** | k6 | Scripts in `scripts/load/` |
| **Build tool** | esbuild | Service worker build, custom server compile |
| **Server runner** | tsx | `server.ts` in dev; compiled `server.js` in production |

### Notes on AI Architecture

- **Kimi is the only active AI provider.** Production deploys do not configure ADK; the app routes AI features through the direct Kimi path in `src/lib/ai/kimi.ts`.
- **ADK service is retired.** The deploy workflow explicitly disables ADK configuration. A legacy `src/lib/adk-client.ts` file still exists but is not used in production. `docker-compose.prod.yml` still references an `adk-service` but it is not part of the live deployment pipeline.
- **Landing page still lists `@google/genai`** as a dependency, but the main app does **not** use Google AI SDK.

---

## Key Configuration Files

| File | Project | Purpose |
|------|---------|---------|
| `tutorme-app/package.json` | Main app | Project name `solocorn-app`, Node 20, Next.js 16, React 18, all scripts/dependencies |
| `tutorme-app/next.config.mjs` | Main app | Next.js standalone output, image remote patterns, webpack aliases for jspdf/fflate, rewrites for `/tutor/classroom`, `serverExternalPackages` for pg/jspdf/mathjax, conditional Sentry wrapping, `proxyClientMaxBodySize: '25mb'` |
| `tutorme-app/tsconfig.json` | Main app | Strict TypeScript (`strict: true`), `target: ES2017`, `moduleResolution: bundler`, path alias `@/*` → `./src/*`, excludes `scripts` and test files from compilation |
| `tutorme-app/eslint.config.mjs` | Main app | Flat ESLint config extending `eslint-config-next/core-web-vitals`, `eslint-config-next/typescript`, and `prettier`. Custom security rules and the variant-family guard |
| `tutorme-app/tailwind.config.ts` | Main app | Tailwind CSS v3 with extensive custom design system: HSL color tokens, elevation shadows, animation keyframes, Chinese font stack, z-index scale |
| `tutorme-app/postcss.config.mjs` | Main app | PostCSS with Tailwind plugin |
| `tutorme-app/drizzle.config.ts` | Main app | Drizzle Kit pointing to `src/lib/db/schema/index.ts`, output to `./drizzle`, PostgreSQL dialect |
| `tutorme-app/vitest.config.ts` | Main app | Unit tests in jsdom, includes `src/**/*.test.{ts,tsx}`, mocks `@google/genai` |
| `tutorme-app/vitest.integration.config.ts` | Main app | Integration tests in node environment, includes `src/__tests__/integration/**/*.test.ts` |
| `tutorme-app/playwright.config.ts` | Main app | E2E matching `e2e/**/*.spec.ts` and `src/__tests__/accessibility/**/*.test.ts`, Chromium only, webServer command `npm run dev:next` |
| `tutorme-app/.env.local.example` | Main app | Minimal template for local environment overrides (KIMI_API_KEY, NEXTAUTH_URL, etc.) |
| `landing-page/package.json` | Landing page | Vite 6, React 19, Tailwind CSS v4. Package name `react-example` |
| `landing-page/vite.config.ts` | Landing page | Vite 6 with React plugin, Tailwind CSS v4 Vite plugin, static export to `dist/`, port 3000, HMR disabled when `DISABLE_HMR=true` |
| `.github/workflows/ci.yml` | Root | CI pipeline: typecheck, build (landing integrated), unit tests, lint, format, security, integration tests, advisory E2E |
| `.github/workflows/deploy-gcp.yml` | Root | GCP Cloud Run production deployment on push to `main` with canary → 100% traffic promotion |
| `.github/workflows/secret-scan.yml` | Root | Runs `gitleaks` CLI on every push/PR (commit-range only) |
| `.github/workflows/keep-alive.yml` | Root | Pings `SITE_URL/api/health` every 10 minutes and sweeps expired 1-on-1 holds |
| `.prettierrc` | Root | Shared Prettier config: no semis, single quotes, print width 100, Tailwind plugin |
| `.githooks/pre-commit` | Root | Auto-formats staged `tutorme-app` TS/JS files with Prettier before each commit |

---

## Runtime Architecture

The main app does **not** use the standard Next.js dev server. Instead, it runs a custom HTTP server defined in `server.ts`:

1. **Immediate port binding** — The HTTP server binds to `PORT` (default `3003`) on `0.0.0.0` immediately so the host considers the container healthy. Non-health requests are gated behind a readiness flag and receive `503 Retry-After: 2` until initialization completes.
2. **Environment loading** — `server.ts` loads `.env.local` first, then `.env`, so local overrides take precedence.
3. **Background initialization** — After binding, the server initializes in this order:
   - Environment validation (`src/lib/env.ts`)
   - Idempotent schema drift fixes (`applyStartupSchemaFixes`, safe to run on every boot)
   - Idempotent data cleanup (`applyStartupDataCleanup`, runs after schema fixes)
   - Next.js renderer preparation (`app.prepare()`)
   - Socket.io enhanced server initialization (`initEnhancedSocketServer`)
   - Session reminder scheduler startup (`startSessionReminderScheduler`)
4. **Health endpoint** — `/api/health` and `/health` return `200` only when `isReady === true`. Until then, they return `503` with `Retry-After: 2`. If Next.js prepared but Socket.io failed, status is `degraded`.
5. **Graceful degradation** — If Socket.io fails but Next.js prepares successfully, the server still serves UI traffic (real-time features are degraded).
6. **Memory monitoring** — A 15-second interval logs RSS and heap usage to help diagnose OOM kills.
7. **Request logging** — Set `DEBUG_SERVER=true` to log all incoming requests.

> **Important:** Always start the main app with `npm run dev` (which runs `NODE_ENV=production tsx server.ts`), not a bare Next.js server. Otherwise Socket.io and the health check will not be available.

### Production Build

`npm run build` performs the following steps:

1. `npm run build:sw` — Compiles `src/lib/pwa/service-worker.ts` → `public/sw.js` via esbuild with cache-busting.
2. `next build --webpack` — Builds the Next.js standalone output.
3. `node scripts/build-custom-server.js` (run inside `Dockerfile.production`) — Compiles `server.ts` → `server-production.js` via esbuild for production.

`Dockerfile.production` is a multi-stage build:

1. **base** — `node:20-slim` with LibreOffice installed (for document processing)
2. **deps** — `npm ci` with `--max-old-space-size=6144` (retries with cache clean on failure)
3. **builder** — Copies deps, installs Linux native bindings, runs `copy-pdf-worker.js`, writes dummy `.env.production`, runs `npm run build`, and compiles the custom server to `server-production.js`
4. **runner** — Minimal image with `nextjs` user, copies `.next/`, `public/`, `drizzle/`, `scripts/`, compiled `server.js`, and runs `node scripts/start-prod.js` on port `3003`

The production entry point (`scripts/start-prod.js`) runs database migrations first (via `scripts/run-migrations.js`), then starts the compiled custom server. If `server.js` exists it is used; otherwise falls back to `tsx server.ts`.

### Database Client

- `src/lib/db/drizzle.ts` — Primary Drizzle + `pg.Pool` singleton. Pool max size is 5 in development and 50 in production (override with `DB_POOL_MAX`). PgBouncer-aware via optional `DATABASE_POOL_URL` and `prepare: false`.
- `src/lib/db/index.ts` — Legacy caching wrapper (Redis → in-memory fallback). Most existing code imports `db` from here; **new code should import from `drizzle.ts`** (`drizzleDb`).

---

## Build, Dev & Deploy Commands

All primary commands run from **`tutorme-app/`** unless noted.

### Development

```bash
# Start the custom Next.js server with Socket.io (production mode locally)
npm run dev

# Bare Next.js dev server (no Socket.io, no health check)
npm run dev:next

# Landing page (from landing-page/ directory)
cd ../landing-page && npm run dev     # http://localhost:3000
```

> **Note:** `npm run dev` in `tutorme-app` sets `NODE_ENV=production`. This is intentional.
>
> `npm run dev:next` is an alias for `next dev --port 3003` and does **not** include Socket.io.
>
> `npm run dev:all` currently just invokes `npm run dev`; it does **not** start Docker services automatically.

For local Docker infrastructure:

```bash
# Postgres + Redis only (recommended for development)
docker compose -f docker-compose.local.yml up db redis

# Full stack including the app (not needed for active development)
docker compose -f docker-compose.local.yml --profile prod up --build
```

### Production Build

```bash
npm run build        # Builds service worker + Next.js standalone output
npm run build:sw     # Compiles src/lib/pwa/service-worker.ts → public/sw.js
npm run build:custom-server  # Compiles server.ts → server-production.js
npm run start        # Production Next.js start (used inside Docker standalone image)
```

### Database

```bash
npm run db:migrate           # Run pending Drizzle migrations (drizzle-kit migrate)
npm run db:migrate:deploy    # Deploy migrations via script (scripts/migrate.js)
npm run db:apply-schema      # Apply schema changes via script (scripts/apply-schema-changes.js)
npm run db:check-schema      # Check for schema drift (scripts/check-schema-drift.js)
npm run drizzle:generate     # Generate new migration SQL
npm run drizzle:studio       # Open Drizzle Studio
npm run drizzle:push         # Push schema changes (force)
npm run drizzle:pull         # Pull schema from database
npm run db:seed              # Seed sample data (tsx src/scripts/seed-db.ts)
npm run db:seed:admin        # Seed admin user and roles only
```

### Maintenance & Backfill Scripts

```bash
npm run backfill:group-course              # Backfill group-session course links
npm run backfill:published-course-categories  # Backfill published course categories
npm run audit:orphaned-courses           # Audit orphaned courses
npm run cleanup:orphaned-courses         # Clean up orphaned courses
npm run recover:protected-courses        # Recover protected courses
```

### Testing

```bash
npm run test                 # Vitest unit tests (jsdom)
npm run test:unit            # Alias for vitest run
npm run test:watch           # Vitest watch mode
npm run test:integration     # Integration tests (node env; needs Postgres)
npm run test:e2e             # Playwright E2E tests
npm run test:e2e:ui          # Playwright with interactive UI
npm run test:e2e:a11y        # Accessibility tests (Playwright)
npm run test:load            # k6 concurrent-users load test
npm run test:load:ai         # k6 AI stress load test
npm run test:load:ws         # k6 WebSocket load test (placeholder)
npm run test:load:scheduling # Node scheduling-conflicts load test
```

> **E2E requirements:** The app must be running (default `http://localhost:3003`). Some specs expect seeded test users (e.g., `tutor@example.com` / `Password1`).
> **Integration requirements:** Requires `DATABASE_URL` pointing to a test database (e.g., `tutorme_test`). The integration test job in CI (`ci.yml`) runs against an ephemeral Postgres 16 container.
> **Important:** The `playwright.config.ts` references `npm run dev:next` as the webServer command. Start the app manually with `npm run dev` before running E2E tests to ensure Socket.io is available.

### Code Quality

```bash
npm run lint                 # ESLint flat config (eslint.config.mjs)
npm run lint:check           # Alias for eslint .
npm run lint:ci              # ESLint with --max-warnings=2188
npm run lint:fix             # Auto-fix ESLint issues
npm run format               # Prettier format src/**/*.{ts,tsx}, scripts/**/*.js, **/*.js
npm run format:check         # Check formatting without writing
npm run typecheck            # tsc --noEmit
npm run type-check           # tsc --noEmit (alias)
npm run security:check       # npm audit --audit-level=critical
```

The CI lint job runs `npm run lint:ci`, which is `eslint . --max-warnings=2188`.

### Lint-staged / Pre-commit

`package.json` configures `lint-staged`:

- `*.{ts,tsx,js}` → `prettier --write`, `eslint --fix`
- `*.{json,md}` → `prettier --write`

The `prepare` script points Git hooks to `.githooks` at the repository root. The pre-commit hook (`./githooks/pre-commit`) auto-formats staged `tutorme-app` TS/JS files with Prettier before the commit is created. Bypass with `git commit --no-verify`.

---

## Environment Configuration

Copy `tutorme-app/.env.local.example` to `tutorme-app/.env.local` and configure.

The startup environment validator (`src/lib/env.ts`) **requires** `DATABASE_URL` and `NEXTAUTH_SECRET` (min 32 chars) and warns if `REDIS_URL`, `KIMI_API_KEY`, `DAILY_API_KEY`, `SERPER_API_KEY`, or Sentry DSNs are missing in production.

**Critical variables**

```bash
# Database (required)
DATABASE_URL="postgresql://tutorme:tutorme_password@localhost:5433/tutorme"
DIRECT_URL="postgresql://tutorme:tutorme_password@localhost:5433/tutorme"
# Optional PgBouncer-aware pool URL
DATABASE_POOL_URL="postgresql://tutorme:tutorme_password@localhost:5433/tutorme"
# Optional per-instance pool cap (default 50 prod / 5 dev)
DB_POOL_MAX=50

# Redis (required for cache + Socket.io adapter)
REDIS_URL="redis://localhost:6379"

# Auth (required)
NEXTAUTH_SECRET="min_32_chars_random"
NEXTAUTH_URL="http://localhost:3003"

# AI (required for AI features; Kimi only)
KIMI_API_KEY="your_kimi_api_key"
KIMI_BASE_URL="https://api.moonshot.ai/v1"   # or https://api.moonshot.cn/v1
KIMI_MODEL="kimi-k3"
KIMI_VISION_MODEL="kimi-k3"

# Video (required for live clinics)
DAILY_API_KEY="your_daily_api_key"

# Payments (required for checkout flows)
AIRWALLEX_CLIENT_ID=...
AIRWALLEX_API_KEY=...
HITPAY_API_KEY=...
HITPAY_SALT=...

# Chinese payment gateways (optional)
WECHAT_MCH_ID=...
WECHAT_PAY_PRIVATE_KEY="..."
WECHAT_PAY_API_V3_KEY="..."
ALIPAY_APP_ID=...
ALIPAY_PRIVATE_KEY="..."

# Sentry (optional)
SENTRY_DSN=...
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_ORG=...
SENTRY_PROJECT=...

# Admin auth (recommended in production; app warns if missing)
ADMIN_JWT_SECRET="dedicated_secret_at_least_32_chars"
# Legacy plaintext login fallback. Leave unset/false unless doing a one-time migration.
ALLOW_LEGACY_PLAINTEXT_LOGIN=false

# App
NEXT_PUBLIC_APP_URL="http://localhost:3003"
NODE_ENV="development"
SKIP_MIGRATIONS=false
MIGRATIONS_REQUIRED=true

# Security
SECURITY_COMPRESS=true
SECURITY_ENCRYPT=true
SECURITY_AUDIT=true
SECURITY_RATE_LIMIT=300
SECURITY_MAX_REQUESTS_PER_MINUTE=1000

# Google Cloud Storage (optional)
GCS_BUCKET=...
GCS_VIDEO_BUCKET=...
GCS_VIDEO_BUCKET_URL=...
GCP_PROJECT_ID=...
GCP_SA_KEY='...'

# Web Push (optional)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=...

# Cron / keep-alive (used by GitHub Actions keep-alive.yml)
SITE_URL="https://your-app-url"
CRON_SECRET="..."
```

There is **no root-level `middleware.ts`** in this project. Route guards, i18n routing, CSP, and rate-limiting are handled via:

- `next-intl` routing configuration (`src/lib/i18n/config.ts`)
- API route middleware utilities (`src/lib/api/middleware.ts`)
- Edge-oriented helpers (`src/lib/middleware-edge/`)

---

## Code Organization

### App Router (`src/app/`)

- `src/app/layout.tsx` — Root layout with metadata, PWA manifest, theme init script, service worker unregister script, Google Fonts, and top-level providers.
- `src/app/[locale]/layout.tsx` — Locale layout wrapping `ThemeProvider`, `NavigationOverlayProvider`, `FloatingVideoOverlay`, `PWAInstallPrompt`, `Toaster`, and `SessionLauncher`. Validates locale param against configured locales.
- `src/app/[locale]/` — All user-facing pages grouped by role (`student/`, `tutor/`, `parent/`, `admin/`) plus shared pages (`login/`, `register/`, `onboarding/`, `payment/`, `legal/`, `forgot-password/`, `api-docs/`, `categories/`, `session/`, `tutors/`, `call/`, `pitch-deck/`, `u/`).
- `src/app/api/` — REST API endpoints mirroring the UI structure. Each folder contains `route.ts` (or segment-specific route files). There are 277 `route.ts` files under `src/app/api/`.

**Role-specific layout behaviors:**

- **Student layout** (`[locale]/student/layout.tsx`): Collapsible sidebar, special handling for `/student/tutors` (no sidebar), `/student/feedback` (hides nav entirely), and live class routes.
- **Tutor layout** (`[locale]/tutor/layout.tsx`): Realm-session check, redirects non-tutors, skips sidebar for Course Builder, Course Publish, Insights, Account, and Reports pages.
- **Parent layout** (`[locale]/parent/layout.tsx`): Sidebar with sections (Overview, Learning, Financial, Communication, Settings), mobile slide-out menu via Sheet.
- **Admin layout** (`[locale]/admin/layout.tsx`): Separate auth system checks session via `fetch('/api/admin/auth/session')` and redirects unauthenticated users to `/[locale]/admin/login`.

### Components (`src/components/`)

Organized by feature domain:

- `ui/` — shadcn/ui primitives (Button, Card, Dialog, etc.)
- `ai-chat/`, `ai-tutor/` — AI interaction UIs
- `analytics/` — Analytics dashboards and charts
- `answer/`, `booking/`, `categories/`, `one-on-one/`, `task/` — Domain-specific UI modules
- `class/`, `classroom/` — Live classroom (whiteboard, polls, breakout rooms, engagement)
- `student/`, `tutor/`, `parent/`, `admin/` — Role-specific dashboards
- `video-player/`, `quiz/`, `polls/`, `whiteboard/`, `course-builder/`, `course/`, `spaced-repetition/` — Content & assessment UIs
- `assignments/`, `communications/`, `controls/`, `feedback/`, `link-preview/`, `mentions/`, `monitoring/`, `reports/`, `common/`, `legal/`, `navigation/`, `notifications/`, `pdf/`, `providers/`, `pwa/`, `support/` — Supporting UI domains

### Library (`src/lib/`)

Domain-organized business logic (50 top-level directories):

- `lib/db/` — Drizzle client (`drizzle.ts`), schema (`schema/`), and migrations
- `lib/ai/` — AI provider integrations (`kimi.ts`), prompts, teaching prompts, types, memory, usage tracking
- `lib/agents/` — Orchestrator, tutor agents, grading, live-monitor, content-generator, task-generator, tutor-chat-service
- `lib/payments/` — Payment gateway integrations (Airwallex, Hitpay, Chinese gateways)
- `lib/security/` — RBAC, rate limiting, CSRF, admin IP restrictions, suspicious-activity logging, client encryption, sanitization, audit, PIPL compliance
- `lib/socket/` & `lib/socket-server-enhanced.ts` — Socket.io server and realtime state
- `lib/cache-manager/` — Redis caching layer
- `lib/i18n/` — i18n config and helpers
- `lib/validation/` — Zod schemas
- `lib/api/middleware.ts` — Standardized API route middleware (auth, RBAC, rate limit, CSRF, validation, error handling, audit)
- Additional domain modules: `accessibility`, `admin`, `assessment`, `auth`, `chat`, `classroom`, `code-runner`, `compliance`, `course`, `courses`, `data`, `documents`, `email`, `env`, `extract-file-text`, `feedback`, `financial`, `format-class-time`, `format-currency`, `geo`, `grading`, `group-session`, `link-preview`, `live`, `math`, `mentions`, `messaging`, `middleware-edge`, `monitoring`, `notifications`, `one-on-one`, `performance`, `progress`, `push`, `pwa`, `registration`, `schedule`, `schedule-sessions`, `scroll-into-view`, `search`, `services`, `sessions`, `socket-auth`, `storage`, `student-availability`, `student-availability-defaults`, `tasks`, `time`, `tutoring`, `utils`, `video`, `whiteboard`

### Hooks (`src/hooks/`)

Custom React hooks:

- `use-socket.ts`, `use-simple-socket.ts` — Socket.io client hooks
- `use-daily-call.ts` — Daily.co video integration
- `use-realm-session.ts` — Multi-role session handling
- `useChat.ts` — General chat hook
- `useParent.ts`, `useParentFinancialCalculations.ts`, `useParentNotifications.ts`, `useParentRealTimeNotifications.ts` — Parent-specific hooks
- `use-auto-scroll-on-expand.ts`, `use-sliding-pill.ts` — UI behavior hooks
- `index.ts` — Re-exports

### Stores (`src/stores/`)

Zustand stores for client state:

- `communication-store.ts`
- `video-overlay-store.ts`

---

## Database Architecture

### ORM & Schema

- **Drizzle ORM** is the only ORM in use. No Prisma client is present.
- Schema source of truth: `src/lib/db/schema/`
  - `enums.ts` — PostgreSQL enums (Role, PollType, PaymentStatus, LiveSessionStatus, BuilderTaskType, etc.)
  - `tables/` — Table definitions (16 domain slices: auth, course, classroom, content, live, finance, collaboration, analytics, admin, calendar, family, builder, reschedule, assistant)
  - `relations.ts` — Drizzle relational definitions
  - `next-auth.ts` — NextAuth.js Drizzle adapter tables (`Session`, `VerificationToken`)
  - `compliance.ts` — GDPR / COPPA / FERPA compliance tables
  - `landing.ts` — Landing page inquiry/signup tables
- ~120 `pgTable` definitions across the schema.
- Migrations live in `drizzle/` (79 SQL files) and `drizzle/archive/` (22 SQL files), plus `meta/`.
- Runtime client: `src/lib/db/drizzle.ts` uses `pg.Pool` with singleton pooling (dev pool cached on `globalThis`).
- Legacy wrapper: `src/lib/db/index.ts` provides a query caching layer (Redis → in-memory fallback). Most app code imports `db` from here; **new code should import `drizzleDb` from `src/lib/db/drizzle.ts`**.

### Connection Strategy

- `DATABASE_URL` / `DIRECT_URL` — Standard connections.
- `DATABASE_POOL_URL` — Optional PgBouncer connection string for production.
- Pool sizes: 5 max in development, 50 max in production (override with `DB_POOL_MAX`).
- Redis is used for caching, session-like state, and the Socket.io Redis adapter.

### Key Tables

- **Auth/Users** (`tables/auth.ts`): `User`, `Account`, `Profile`, `TutorApplication`, `AvatarStorage`
- **Courses** (`tables/course.ts`): `Course`, `CourseLesson`, `CourseEnrollment`, `CourseProgress`, `CourseLessonProgress`, `LessonSession`, `StudentPerformance`, `TaskSubmission`, `FeedbackWorkflow`, `CourseVariant`, `CourseSchedule`
- **Live Sessions** (`tables/live.ts`): `LiveSession`, `SessionParticipant`, `Poll`, `PollOption`, `PollResponse`, `Message`, `Conversation`, `DirectMessage`, `Notification`, `DeployedMaterial`, `SessionReplayArtifact`
- **Payments** (`tables/finance.ts`): `Payment`, `Refund`, `WebhookEvent`, `Payout`, `PaymentOnPayout`, `PlatformRevenue`
- **Family/Parent** (`tables/family.ts`): `FamilyAccount`, `FamilyMember`, `FamilyBudget`, `FamilyPayment`, `BudgetAlert`, `ParentActivityLog`, `StudentProgressSnapshot`, `ParentSpendingLimit`
- **Content** (`tables/content.ts`): `ContentItem`, `VideoWatchEvent`, `ContentQuizCheckpoint`, `ContentProgress`, `ReviewSchedule`, `Note`, `Bookmark`
- **Calendar** (`tables/calendar.ts`): `CalendarConnection`, `CalendarEvent`, `CalendarAvailability`, `CalendarException`, `OneOnOneBookingRequest`
- **Admin** (`tables/admin.ts`): `AdminRole`, `AdminAssignment`, `FeatureFlag`, `LlmProvider`, `LlmModel`, `LlmRoutingRule`, `SystemSetting`, `AdminAuditLog`, `AdminSession`, `IpWhitelist`
- **Builder** (`tables/builder.ts`): `BuilderTask`, `BuilderTaskExtension`, `BuilderTaskFile`, `BuilderTaskVersion`, `BuilderTaskDmi`, `TaskDeployment`, `TutorAsset`
- **Classroom** (`tables/classroom.ts`): `StudentMemoryProfile`, `SessionEngagementSummary`, `StudentAgentSignal`, `StudentTaskReport`, `NotificationPreference`
- **Collaboration** (`tables/collaboration.ts`): `Whiteboard`, `WhiteboardOperation`
- **Assistant** (`tables/assistant.ts`): AI assistant-related tables
- **Reschedule** (`tables/reschedule.ts`): Reschedule-related tables
- **Compliance** (`schema/compliance.ts`): `consentLogs`, `deletionRequests`, `piiAccessLogs`, `thirdPartyAudits`, `dataExportRequests`, `ageVerifications`, `privacyPolicyVersions`
- **Landing** (`schema/landing.ts`): `LandingSignup`, `LandingMessage`

### Schema Patterns

- **Soft deletes:** Multiple tables support soft deletion via `deletedAt` timestamp (e.g., `Course`, `CourseLesson`, `BuilderTask`, `CalendarEvent`, `FeatureFlag`).
- **Heavy JSONB usage:** `builderData` (lessons), `availability` (profile), `metadata` (payments, tasks), `conceptMastery`, `answers`, `aiFeedback`, `schedule` (courses).
- **Indexes:** Almost every table has domain-relevant indexes on foreign keys, status columns, and composite unique indexes for junction tables. Recent migrations added performance indexes on `BuilderTask`, `FamilyMember`, `ContentProgress`, and `LiveSession`.
- **Primary keys:** Most tables use `text('id').primaryKey()` with app-generated CUID-style IDs; some use `uuid('id').defaultRandom()`.
- **Timestamps:** Standard pattern: `createdAt` (defaultNow) and `updatedAt` (defaultNow + $onUpdate).
- **Naming:** Main app tables use PascalCase table names and camelCase columns. Compliance and landing tables use snake_case table names and columns.

---

## Design System

The design system is documented in `design-system/solocorn/MASTER.md` and implemented in `tutorme-app/src/app/globals.css` and `tutorme-app/tailwind.config.ts`.

**Themes**

Three premium themes are defined in CSS:

- **Aura** (default) — warm neutrals, blue primary, warm accent
- **Nimbus** — cool slate, blue primary
- **Sahara** — warm sand, blue primary, amber secondary

Each theme provides light and dark variants via `data-theme` and `.light`/`.dark` classes. Theme switching is handled by `ThemeProvider` in `src/app/[locale]/layout.tsx`.

**Color System**

Colors are defined as HSL CSS variables and referenced in Tailwind via semantic tokens (`primary`, `secondary`, `accent`, `background`, `foreground`, `muted`, `border`, `destructive`, `ring`, etc.). See `globals.css` for exact values per theme.

**Typography**

- **Heading:** Fira Code (technical, precise feel)
- **Body:** Fira Sans (primary reading text)
- **Chinese:** system-ui, PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC fallback stack

**Elevation & Animation**

- Layered elevation shadows: `elevation-1` through `elevation-5`, plus soft, inner, hover, focus, and glow variants.
- Premium animations: fade, scale, slide, float, pulse, shimmer, spin. Custom cubic-bezier timing functions.
- `border-radius` scales with `--radius` per theme.

**Breakpoints**

Tailwind defaults plus `xs: 320px`. The global minimum width is 320px.

---

## Security & Compliance

### RBAC

Roles: `ADMIN`, `TUTOR`, `PARENT`, `STUDENT`. Permissions are granular strings like `admin:payments:read`, `tutor:clinics`, `parent:children:read`, `student:own:read`. The `hasPermission(role, permission)` utility lives in `src/lib/security/rbac.ts`.

### API Middleware

`src/lib/api/middleware.ts` provides standardized wrappers for route handlers:

- `withAuth` — Validates NextAuth JWT session
- `withRole(role)` — RBAC check after auth
- `withRateLimit` — Redis-backed rate limiting (default 100 req/min)
- `withCsrf` — CSRF token validation for state-changing requests
- `withValidation(schema)` — Zod body/query validation
- `withAudit` — Logs request to `AdminAuditLog`

These can be composed: `withAuth(withRole('ADMIN')(withRateLimit(handler)))`.

### CSRF & Rate Limiting

- State-changing API methods (`POST`, `PUT`, `PATCH`, `DELETE`) require a valid CSRF token unless the path is in the skip list (auth, webhooks, health, cron) or the request uses a Bearer API key.
- Rate-limit presets exist for `login`, `register`, `paymentCreate`, `enroll`, `booking`, `aiGenerate`, `contact`, and others.

### Client-Side Encryption

`src/lib/security/client-encryption.ts` provides AES-GCM encryption for sensitive form data before it reaches the server. Used for payment details and PII in certain flows.

### PIPL / GDPR / COPPA / FERPA

- `consentLogs` — Records user consent for data processing
- `deletionRequests` — Right-to-erasure workflow
- `piiAccessLogs` — Audit trail for PII access
- `dataExportRequests` — Data portability requests
- `privacyPolicyVersions` — Versioned privacy policy acceptance
- `ageVerifications` — Age verification with parental consent for < 14 years
- Separate PIPL consent flows and data-localization flags in `src/lib/compliance/pipl.ts`

### ESLint Security Guard

`eslint.config.mjs` includes a `no-restricted-syntax` rule that prevents filtering `courseEnrollment` by a session's `courseId` directly (which misses sibling course variants). The correct pattern is to use `expandToCourseFamily(...)` + `inArray(...)` from `variant-family.ts`.

### Security Hardening Notes

A recent hardening batch (`SECURITY_HARDENING.md`) landed the following production-relevant changes:

- Admin JWT secret must be dedicated (`ADMIN_JWT_SECRET`). App warns in production if it falls back to `NEXTAUTH_SECRET`.
- Legacy plaintext-password admin login is gated behind `ALLOW_LEGACY_PLAINTEXT_LOGIN` (default OFF).
- Contact form has an IP-based rate limit and HTML-escapes user input in email bodies.
- Postgres per-instance pool cap is overridable via `DB_POOL_MAX` to stay within managed Postgres limits (e.g., Neon ~100).

Several larger security/compliance gaps remain documented in `INVESTOR_RISK_ASSESSMENT.md` and are intentionally out of scope for code-only changes (age verification, moderation, revenue disbursement, AI token budgets, etc.).

---

## AI Integration

### Primary Provider: Kimi (Moonshot)

- **Model:** defaults to `kimi-k3` (configurable via `KIMI_MODEL`)
- **Vision:** defaults to `kimi-k3` (native visual understanding; configurable via `KIMI_VISION_MODEL`)
- **API:** OpenAI-compatible chat completions endpoint
- **Base URL:** defaults to `https://api.moonshot.cn/v1` (China); use `https://api.moonshot.ai/v1` for global
- **Required env:** `KIMI_API_KEY`
- **Implementation:** `src/lib/ai/kimi.ts` exposes `generateWithKimi`, `chatWithKimi`, `streamKimi`, and `generateWithKimiVision`

### AI Tutor Behavior

All AI tutoring follows the Socratic method:

- **Never** give direct answers to homework questions
- Ask guiding questions to help students discover solutions
- Provide hints, not solutions
- Validate understanding through follow-up questions
- Escalate to human tutor if the student is stuck for an extended period

### AI Features

- Live clinic monitoring — flags struggling students
- Content generation — quiz questions, explanations, hints
- Grading assistance — AI grades open-ended responses with rubric alignment
- Study recommendations — personalized spaced repetition schedules
- Chat tutoring — 1-on-1 Socratic dialogue via chat interface

---

## Payment Processing

### Supported Gateways

| Gateway | Notes |
|---------|-------|
| Airwallex | Multi-currency, global |
| Hitpay | SGD, USD, SE Asia |
| WeChat Pay | CNY, China (helper client in `lib/payments/wechat-pay-client.ts`) |
| Alipay | CNY, China (helper client in `lib/payments/alipay-client.ts`) |

The payment gateway enum currently stores `AIRWALLEX` and `HITPAY`; factory returns implementations for those two. WeChat/Alipay helpers exist for market-specific flows.

### Payment Flow

1. Client selects gateway via `PaymentGatewaySelector` component
2. Server creates payment intent via `lib/payments/{gateway}.ts`
3. Client completes payment on the gateway's hosted page/overlay
4. Webhook received at `/api/payments/webhooks/{gateway}`
5. Server verifies signature and updates `Payment` table status
6. Success/failure redirect to `/[locale]/payment/result`

### Refunds

Refunds are processed through the same gateway. The `Refund` table tracks refund status. Admin approval is required for large refunds.

---

## Real-Time Features (Socket.io)

### Connection

The Socket.io server is initialized in `server.ts` via `initEnhancedSocketServer` (`src/lib/socket-server-enhanced.ts`). Redis adapter is used for multi-instance scaling; if Redis is unavailable, the server falls back to in-memory mode.

### Key Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `join_class` / `leave_class` | C→S | Join/leave a live classroom |
| `chat_message` | C→S, S→C | Chat message (persisted to `message` table) |
| `poll:launch` / `poll:vote` / `poll:close` | C→S, S→C | Tutor launches ephemeral polls; students vote; tally broadcast |
| `whiteboard:op` / `whiteboard:delta` | C→S, S→C | Whiteboard drawing/sync operations |
| `task:deploy` / `task:complete` / `task:graded` | C→S, S→C | Live task deployment and submission |
| `session:ending-soon` / `session:ended` | S→C | Server-managed session lifecycle alerts |
| `presence:*` | C→S, S→C | Presence and typing indicators |

### Rate Limiting

Per-connection token-bucket rate limiting is enforced in the socket server. Whiteboard and chat events are throttled to prevent abuse and memory spikes.

### Memory Management

Active rooms, DM rooms, whiteboards, and rate-limit state are cleaned up on fixed intervals. Rooms older than 4 hours or inactive for 15 minutes are evicted. Whiteboards are capped at 5,000 items per type.

---

## Video (Daily.co)

### Integration

- `@daily-co/daily-js` on the client side
- `DAILY_API_KEY` required for room creation
- Without API key, mock URLs are generated for local testing

### Features

- 1-on-1 tutoring sessions
- Group clinics (up to 50 participants)
- Screen sharing
- Recording (stored to GCS when configured)
- Breakout rooms (managed via Socket.io signaling)

### Custom Server

`src/lib/video/daily-custom-server.ts` provides room creation with expiration, token generation for private rooms, recording management, and webhook handling for room events.

---

## Whiteboard

### Stack

- **Custom Socket.io + Yjs** — Real-time collaborative drawing layer
- Each whiteboard is a `Whiteboard` record in the database
- Operations are stored in `WhiteboardOperation` table
- Socket.io broadcasts deltas to all connected clients
- Offline support: operations queued and synced on reconnection

### Features

- Freehand strokes, shapes (rectangle, circle, line, triangle), text
- Laser pointer / cursor tracking with user names/colors
- Background color/style, per-room state
- Memory caps and automatic cleanup

---

## PWA & Service Worker

### Build

`npm run build:sw` compiles `src/lib/pwa/service-worker.ts` → `public/sw.js` via esbuild with:
- Cache-busting hash in filename
- Precache of static assets
- Runtime cache for API responses (TTL 5 min)
- Offline fallback page

### PDF.js Worker

`npm run copy-pdf-worker` (and `postinstall`) copies the PDF.js worker into `public/` so PDF rendering works in both dev and production.

### Features

- Install prompt (via `PWAInstallPrompt` component)
- Push notifications (via `src/lib/push/`)
- Background sync for form submissions
- Offline reading of cached content

---

## CI/CD

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push/PR to `main`/`develop` | Typecheck, build (landing integrated), unit tests, lint, format, security audit, integration tests, advisory E2E |
| `deploy-gcp.yml` | Push to `main` | Build Docker image, push to Artifact Registry, run migrations, deploy to Cloud Run with canary promotion |
| `secret-scan.yml` | Every push/PR | Run `gitleaks` CLI on the introduced commit range only |
| `keep-alive.yml` | Schedule (10 min) | Ping `SITE_URL/api/health` and sweep expired 1-on-1 holds via `/api/cron/expire-one-on-one` |

### CI Pipeline Details (`ci.yml`)

1. **Typecheck** — `npx drizzle-kit generate` then `npm run typecheck`
2. **Build** — Builds landing page, copies `dist/` into `public/`, installs Linux native bindings, `npx drizzle-kit generate`, `npm run build`
3. **Unit Tests** — `npm run test`
4. **Lint** — `npm run lint:ci`
5. **Format Check** — `prettier --check` (continue-on-error)
6. **Security Audit** — `npm audit --audit-level=critical`
7. **Integration Tests** — Starts ephemeral Postgres 16 container, pushes schema via `drizzle-kit push --force`, runs integration tests
8. **E2E Insights** — Builds app, pushes schema, seeds an E2E tutor, starts `server.ts`, runs two Playwright specs (`insights-tab-loop`, `tutor-builder-smoke`) — advisory, continue-on-error

### Deployment (`deploy-gcp.yml`)

- **GCP Cloud Run** — Primary production deployment (`asia-southeast1`)
- **Docker image** — Built via `Dockerfile.production`, pushed to Google Artifact Registry
- **Migrations** — Run inline in the built container before traffic is shifted
- **Canary** — New revision deployed with `--no-traffic --tag=canary`; smoke-tested via `/api/health`; promoted to 100% traffic only after passing
- **Environment** — Cloud Run env vars come from GitHub Secrets; `VAPID_PRIVATE_KEY` is mounted from Secret Manager
- **Database** — Cloud SQL PostgreSQL
- **Redis** — Memorystore Redis instance
- **ADK disabled** — `ADK_ENABLED` is not set; the app runs the direct Kimi path

### Landing Page Integration

CI automatically builds `landing-page/` and copies `dist/*` into `tutorme-app/public/` before the main build. The standalone script `scripts/build-and-integrate-landing.sh` is gated by `INTEGRATE_LEGACY_VITE_LANDING=true` and is not run by default locally.

---

## Dev Container

`.devcontainer/devcontainer.json` exists but is configured for a Python/Node hybrid image and forwards ports 8000/3000. It is largely legacy and not the primary development path. Local development is driven by `npm install` and `npm run dev` inside `tutorme-app/` with `docker compose -f docker-compose.local.yml up db redis` for local Postgres/Redis.

---

## Common Tasks

### Adding a New API Route

1. Create `src/app/api/{domain}/{action}/route.ts`
2. Use `src/lib/api/middleware.ts` wrappers for auth/rate limit/validation
3. Return `NextResponse.json()` with consistent error shape `{ error: string, errorId?: string }`
4. Add Zod schema to `src/lib/validation/` if needed
5. Add unit test in `src/lib/{domain}/{action}.test.ts` or adjacent

### Adding a New Database Table

1. Add table to appropriate domain file in `src/lib/db/schema/tables/`
2. Export from `src/lib/db/schema/tables/index.ts`
3. Add relations to `src/lib/db/schema/relations.ts` if needed
4. Generate migration: `npm run drizzle:generate`
5. Review generated SQL in `drizzle/`
6. Apply: `npm run db:migrate`
7. Add seed data in `src/scripts/seed-db.ts` if needed

### Adding a New Component

1. Place in appropriate domain directory under `src/components/`
2. Use shadcn/ui primitives from `src/components/ui/` where possible
3. Follow Tailwind design system tokens (colors, shadows, spacing)
4. Add `use client` directive if using hooks/browser APIs
5. Export from `src/components/{domain}/index.ts` if applicable

### Adding a New Locale

1. Add locale code to `LOCALES` array in `src/lib/i18n/config.ts`
2. Create `messages/{locale}.json` (copy from `en.json`)
3. Add RTL support if needed (`ar` is already handled)
4. Add locale-specific font config in `tailwind.config.ts` if CJK/Arabic
5. Test route: `http://localhost:3003/{locale}/`

### Running Migrations in Production

```bash
# Via Cloud Run job or local with production credentials
npm run db:migrate:deploy
# Or manually:
node scripts/run-migrations.js
```

---

## Troubleshooting

### Build fails with "out of memory"

Node heap is limited. Set:
```bash
export NODE_OPTIONS="--max-old-space-size=6144"
npm run build
```

### Socket.io not working in development

Ensure you're using `npm run dev` (runs `server.ts`), not `npm run dev:next` (bare Next.js). The latter does not initialize Socket.io.

### Database connection errors

Check `DATABASE_URL` format. Must be a full PostgreSQL connection string. For PgBouncer, use `DATABASE_POOL_URL` with `prepare: false` and set `DB_POOL_MAX` to keep instances × max under the managed Postgres limit.

### Redis connection errors

Redis is required for caching and the Socket.io adapter. If Redis is unavailable, the app falls back to in-memory caching (non-persistent, per-instance).

### TypeScript path alias not resolving

The `@/*` alias maps to `./src/*`. If imports fail, check `tsconfig.json` `paths` and `baseUrl` settings.

### ESLint warnings exceed limit

The CI allows 2188 warnings. If you exceed this, fix warnings or increase the limit in `package.json` `lint:ci` script. Prefer fixing.

### Daily.co video not working

Without `DAILY_API_KEY`, mock URLs are generated. For real video, set the API key. For local testing, mock mode is sufficient.

### AI features not responding

Check `KIMI_API_KEY`. The app uses Kimi exclusively; there is no Gemini fallback. If the key is missing, AI calls will throw.

### PDF viewer not rendering

Ensure `copy-pdf-worker.js` has run and `public/pdf.worker.min.mjs` exists. The `postinstall` script should handle this automatically.

---

## Important Notes for Agents

1. **No root package.json** — Always `cd tutorme-app/` before running npm commands. The root `package-lock.json` is a legacy artifact with an empty `packages` object.
2. **Production dev mode** — `npm run dev` sets `NODE_ENV=production`. This is intentional.
3. **Custom server required** — Never use `next start` or `next dev` directly for the main app. Always go through `server.ts`.
4. **Drizzle only** — Do not introduce Prisma. Use Drizzle ORM for all database work.
5. **English only** — All code comments, variable names, and documentation must be in English.
6. **Strict TypeScript** — `strict: true` is enabled. Avoid `any` without explicit justification.
7. **Feature batching** — Follow `.cursorrules` for feature batching and pre-flight checks.
8. **Security first** — All API routes must use middleware wrappers. Never expose raw database queries.
9. **Test coverage** — Add unit tests for new lib modules. E2E tests for critical user flows.
10. **Migration safety** — Always generate migrations via Drizzle Kit. Never hand-edit existing migration files.
11. **No semicolons** — Prettier config uses `semi: false`. Let Prettier handle formatting.
12. **Single quotes** — Prettier config uses `singleQuote: true`.
13. **Print width 100** — Prettier wraps at 100 characters.
14. **Legacy scripts** — Do not run `scripts/setup.sh` or `scripts/setup.bat` on the existing codebase.
15. **Kimi only** — Do not add new Gemini dependencies or assume a Google AI SDK is available in the main app.
16. **Variant-family guard** — When joining/filtering `courseEnrollment` by a session's course, use `expandToCourseFamily()` + `inArray()`; the ESLint `no-restricted-syntax` rule will block direct `eq(courseEnrollment.courseId, session.courseId)` patterns.
17. **ADK retired** — Do not add ADK service dependencies or assume `ADK_BASE_URL`/`ADK_AUTH_TOKEN` are functional. The ADK microservice is not used in this codebase; production deploys run the direct Kimi path.
18. **New DB code** — Prefer importing `drizzleDb` from `src/lib/db/drizzle.ts` instead of the legacy `db` export from `src/lib/db/index.ts`.
19. **Use tools for file changes** — When modifying files, always use `Read`, `Edit`, `Write`, or `Bash` as appropriate; never just describe code changes in text.
20. **Never commit secrets** — Do not commit `.env`, `.env.local`, or any credential files.
21. **Pre-commit formatting** — Staged TS/JS files in `tutorme-app/` are auto-formatted by the pre-commit hook. You can also run `npm run format` before committing.
22. **Environment precedence** — `server.ts` loads `.env.local` then `.env`. Local overrides should go in `.env.local`.
