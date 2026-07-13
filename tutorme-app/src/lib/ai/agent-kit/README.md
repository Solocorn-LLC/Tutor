# agent-kit — lean, provider-agnostic agent foundation

Replaces the Google **ADK** service (Gemini-centric, currently broken in prod, and
duplicating prompts) with a thin, TypeScript-native structure: **agents are
configs; tools & skills are typed units; guardrails are applied uniformly by the
runner.** Built on the existing `generateWithFallback` provider (Kimi → OpenAI).

## Why

- ADK is optimized for Gemini; the app uses **Kimi + OpenAI** (Gemini was dropped).
- Prompts are **triplicated** today: `lib/ai/*`, `lib/agents/*/prompts/`, and the ADK
  repo's `agents/*/prompts.ts` — they drift.
- **Guardrails live only in the app** (`lib/ai/guardrails/`); ADK agents run without
  them. The runner makes guardrails un-bypassable.

## Shape

```
agent-kit/
  types.ts            # Tool / Skill / AgentDefinition / GenerateFn
  runner.ts           # runAgent(): compose prompt (+guardrails) → generate → post-validate
  provider-adapter.ts # defaultGenerate wraps generateWithFallback (system/user separation)
  registry.ts         # register/get agents + tools
  agents/             # each agent is a value of AgentDefinition (tutor.ts today)
  # skills/           # (Phase 2) progressive-disclosure bundles: SKILL.md + scripts
```

### Principles
1. **Agents are declarative configs**, not classes — trivial to test/version/diff.
2. **Guardrails uniform & un-bypassable** — set `guardrailDomain` and the runner
   prepends the canonical guardrail prompt *and* runs the post-response validator.
3. **Tools/skills are typed** (Zod I/O); a tool may wrap a deterministic **script**.
4. **Model layer injected** — runner reuses the existing provider; swappable per agent
   (Bedrock/Anthropic later) without touching agents.
5. **One home for prompts** — kills the app/ADK/route duplication.

## Phased migration (each phase a reviewable PR; ADK stays until the end)

- **Phase 1 (this PR) — foundation, ADDITIVE.** `types/runner/registry/adapter` + one
  example agent + tests. Nothing in prod calls it yet; zero risk.
- **Phase 2 — tool execution + skills.** A ReAct-style tool loop; skill loading
  (SKILL.md + scripts); structured assessment/DMI post-validation via
  `findEvaluationLeaks`.
- **Interim — restore or retire ADK (parallel track).** ADK is broken in prod (Kimi
  adapter hit the wrong Moonshot endpoint — fixed in `adk-service` PR #1). Either
  (a) merge that fix + set `KIMI_BASE_URL`/`KIMI_MODEL` + a valid key on adk-service +
  redeploy, or (b) delete `ADK_BASE_URL` on `tutorme-app` to disable ADK and rely on the
  direct/fallback path until Phase 4 rebuilds the live features. Not a blocker for the kit.
- **Phase 3 — port agents (one per PR).** Each agent's prompt lives in a *context-specific
  builder*, so port them individually, **delegating to the existing builder** (single
  source of truth): tutor → grader → content-generator → pci-master. Then point each route
  at `runAgent` behind a flag (default OFF); delete duplicates once the flag is proven.
- **Phase 4 — background worker.** Live-monitor / transcription / recording-artifacts on
  the same kit, in a small worker — **with the fallback + logging those paths lack today**
  (they currently fail silently — see the ADK-in-prod findings).
- **Phase 5 — retire ADK.** Remove `Solocorn-LLC/adk-service` once nothing calls it.

## Status
**Phases 1–2 landed.** `runAgent` does guardrailed generation *and* executes tools via a
provider-agnostic ReAct/JSON loop, with structured assessment/DMI post-validation.

**Phase 3 — pci-master cut over, and that's the right stopping point.** `pci-master` is fully on the
kit in prod (behind `AGENT_KIT_PCI_MASTER`, canary-validated, flag persisted in `deploy-gcp.yml`).
Getting there added the runner's **per-request guardrail domain** (its domain is `context.type`),
which is the kit's whole value proposition — uniform, un-bypassable guardrails on interactive
generation.

### Cutover decisions (why pci-master is the only cutover — read before porting more)
We assessed every candidate. The kit only *helps* an agent that is **interactive + guarded +
system/user-shaped**. Most aren't:

| Agent | Verdict | Why |
|-------|---------|-----|
| **pci-master** | ✅ **cut over** | interactive, per-request guardrail domain, system/user — exact fit |
| **tutor** | faithful config only, **not** cut over | `runTutorChat` is already clean; a single **baked prompt** (`buildCompletePrompt`→`withTaskPci`→`withAssessmentIntegrity`) doesn't map onto the runner's system/user split. NB the live prompt is `buildCompletePrompt`, **not** the older `buildSystemPrompt` — those conflicted; a test guards the ASMT-15 layer survives. |
| **grader** (`lib/agents/grading`) | **deleted** | dead legacy module — every fn threw "Legacy … removed", no live callers |
| grader (live `pci-grader`) | leave | already clean; **post-only** `runTaskGuardrails` and *must not* prepend the anti-leak prompt (the grader needs the rubric/answer). Doesn't fit the runner's PRE+POST coupling. |
| **content-generator** | leave | **unguarded** quiz/lesson generation — the runner's uniform-guardrail value adds nothing; porting is churn |

Force-porting the "leave" rows would be reshaping prompts for no benefit (and real regression risk).
Revisit only if one of them gains a genuine need for **tools/skills** or **provider-swap** — that's
when the kit earns its keep beyond guardrails.
