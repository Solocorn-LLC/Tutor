# Privacy Policy & Terms of Service — DRAFT

> **STATUS: DRAFT — NOT LEGALLY REVIEWED. DO NOT PUBLISH AS-IS.**
>
> This document is an engineering-authored draft that maps the platform's *actual* data flows to
> the disclosures regulators (GDPR, UK-GDPR, PIPL, COPPA/CCPA) require. It exists so counsel can
> turn it into a finalized, jurisdiction-correct policy. It replaces nothing yet — the live signup
> notice (`src/components/legal/AgreementText.tsx`) should only be updated once legal signs off.
>
> Addresses finding **1.8** (and supports **1.1–1.6**) in `INVESTOR_RISK_ASSESSMENT.md`.
>
> **Every `⚠️ DECISION` below is a business/legal choice engineering cannot make alone.**

---

## Why the current live text is insufficient

The current notice (three short paragraphs) discloses none of the following, all of which are
legally required where the platform operates:

- The **third-party processors** that receive user data (AI, video, payments, email, hosting).
- That some processing happens **outside the user's country** (cross-border transfer).
- That live sessions may be **recorded**.
- The user's **data-subject rights** (access, deletion, portability, objection).
- **Data-retention** periods.
- Handling of **minors'** data and **parental consent**.

---

## A. Who we are / data controller

- **Controller:** Solocorn LLC (⚠️ DECISION: confirm legal entity, registered address, and the
  entity that is controller vs. processor for each user type).
- **Contact / DPO:** ⚠️ DECISION: designate a privacy contact and (for GDPR/PIPL) whether a Data
  Protection Officer / local representative is required.

## B. Data we collect

| Category | Examples | Source |
|---|---|---|
| Account & identity | name, email, password (hashed), role, avatar | user at signup |
| Profile | bio, date of birth, timezone, tutor qualifications | user |
| Family links | parent↔student relationships, emergency contacts | parent/user |
| Educational content | task submissions, answers, grades, performance analytics, chat | in-product activity |
| Live sessions | attendance, engagement snapshots, **session recordings (audio/video)** | video platform |
| Payments | amounts, currency, gateway references, payout details | payment processors |
| Technical | IP address, device/user-agent, security events, usage logs | automatic |

## C. Third-party processors (sub-processors) — **must be disclosed by name**

The product currently sends data to these external services. ⚠️ DECISION: legal must confirm a
signed **DPA / cross-border transfer mechanism** exists for each before launch; several do not yet.

| Processor | Purpose | Data shared | Location / transfer note |
|---|---|---|---|
| **Moonshot AI (Kimi)** | AI tutoring, grading, content generation | student questions, answers, submitted work, some profile context | **China** (`api.moonshot.cn`). ⚠️ No DPA in place today (finding 1.5). Cross-border transfer of (potentially minors') academic data — needs consent + safeguards or a switch to an in-region/OpenAI-compatible provider. |
| **Daily.co** | Live video sessions + **recording** | video/audio of participants, room metadata | ⚠️ Confirm processing region + DPA; recording of minors needs consent (finding 1.3). |
| **Airwallex / HitPay / WeChat Pay / Alipay** | Payment processing | payer identity, amount, payment tokens | Cross-border; each has its own privacy terms to link. |
| **Neon (PostgreSQL)** | Primary database hosting | all stored data | AWS ap-southeast-1 (Singapore) — note data-residency vs. PIPL/GDPR. |
| **Google Cloud (Cloud Run, GCS)** | App hosting + file storage | uploaded documents, app data | ⚠️ Confirm region. |
| **Sentry** | Error monitoring | error context (PII scrubbed) | Already scrubs password/token/PII. |
| **SMTP (PrivateEmail/Namecheap)** | Transactional + contact email | name, email, message | — |

> We do **not** sell personal data. ⚠️ DECISION: confirm this holds (esp. "sharing" under CCPA and
> any `no-training` clause with the AI vendor so student work is not used to train models).

## D. Cross-border transfers

The product transfers personal data across borders (notably to **Moonshot AI in China** and to
payment processors). ⚠️ DECISION + legal: for each transfer, document the lawful mechanism
(consent, SCCs/PIPL standard contract, adequacy) and disclose it here. **This is the highest-risk
gap.**

## E. Live-session recording

Sessions **may be recorded** (audio + video). Before launch the product must:
1. Capture **explicit consent** at/before joining a recorded session (finding 1.3 — not yet
   implemented). ⚠️ DECISION: consent model (per-session vs. account-level; opt-in vs. notice).
2. For minors, obtain **parental** consent to recording.
3. Honor deletion (see §H — 1-on-1 recording pointers are now purged on account deletion; the
   underlying video-vendor asset deletion is a tracked follow-up).

## F. Minors & parental consent

The platform serves **minors**. Current controls are insufficient (findings 1.1/1.2): age is
self-certified and no verifiable parental-consent flow exists. Before launch:
- ⚠️ DECISION: minimum age, and the age below which **verifiable parental consent** is required
  (PIPL: 14; GDPR: 13–16 by member state; COPPA: 13).
- Implement a parental-consent capture + record (the `ageVerification` / consent-log tables exist
  but are unused).
- Disclose here what data is collected from minors and how parents can review/delete it.

## G. Your rights

Depending on jurisdiction, users may request: access, correction, deletion ("right to be
forgotten"), portability, restriction, objection, and withdrawal of consent. ⚠️ DECISION: response
SLA (GDPR = 30 days) and verification method. A deletion endpoint exists
(`POST /api/user/gdpr/delete`); a self-serve **export/portability** flow is still ⚠️ TODO.

## H. Data retention & deletion

- ⚠️ DECISION: retention period per data category (accounts, recordings, payments — payments
  typically retained for tax/audit for a statutory period even after deletion).
- On account deletion the system anonymizes the user and their submissions, chat, activity logs,
  and security-event PII, and **purges recording pointers for private 1-on-1 sessions**. Shared
  group/course recordings are retained (other enrolled students have a right to them).
- **Known limitation (tracked):** permanent deletion of the underlying video-vendor recording
  asset is not yet automated because only the recording URL — not the vendor recording ID — is
  stored. Persist the recording ID to enable hard-deletion via the video provider's API.

## I. Security

Passwords are hashed (bcrypt); transport is TLS; error logs scrub sensitive fields; admin access is
IP-whitelistable and permission-scoped. ⚠️ DECISION/verify: encryption **at rest** for the database
(finding 1.9) and a documented breach-notification process.

## J. Code of conduct (Terms)

Retain and enforce the existing conduct rules (respect; academic integrity; no off-platform
personal-contact sharing; report suspicious behavior). ⚠️ Note: these are currently **UI-only** —
there is no content moderation/safeguarding enforcement in the backend (finding 1.4), which counsel
and trust-&-safety should treat as a launch blocker for a minors platform.

---

## Checklist for counsel before this goes live

- [ ] Confirm controller entity, DPO/representative, and governing law per market.
- [ ] Execute DPAs (esp. **Moonshot AI**) with `no-training` clauses; document transfer mechanisms.
- [ ] Finalize minor-age thresholds + verifiable parental-consent flow.
- [ ] Finalize recording-consent model.
- [ ] Set retention periods per data category.
- [ ] Link each processor's own privacy policy.
- [ ] Only then: replace `src/components/legal/AgreementText.tsx` with the approved text and
      version/date it, and record consent (version + timestamp) at signup.
