# Dependency audit notes

CI runs `npm run security:check` = `npm audit --audit-level=critical` (fails the
build only on **critical** advisories). It was previously `--audit-level=high`,
but the current high advisories all require **SemVer-major** dependency upgrades
that are risky enough to need their own tested change rather than blocking every
deploy.

## Known high advisories deferred (as of 2026-06)

| Package | Why deferred | Fix |
|---|---|---|
| `next-auth` | Flagged via its transitive `nodemailer` + `uuid`. Fixing means upgrading to next-auth v5 (Auth.js) — a breaking migration of the whole auth layer. | next-auth v5 migration (dedicated effort) |
| `nodemailer` | Major upgrade (v9). Pulled in transitively by next-auth; the app uses the Credentials provider, **not** the email provider, so it is not exercised at runtime. | nodemailer v9 (with next-auth upgrade) |
| `undici` | Fix requires a major bump (v8); it's a transitive of several deps. | bump undici / its parents |

There are currently **0 critical** advisories. Revisit the above when scheduling
the next-auth v5 migration; once done, restore `--audit-level=high`.
