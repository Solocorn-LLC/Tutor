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
- **Phase 3 — port agents.** Move tutor/grader/content-generator/pci-master to configs;
  point the existing routes at `runAgent` behind a flag; delete duplicate prompts.
- **Phase 4 — background worker.** Live-monitor / transcription / recording-artifacts on
  the same kit, in a small worker — **with the fallback + logging those paths lack today**
  (they currently fail silently — see the ADK-in-prod findings).
- **Phase 5 — retire ADK.** Remove `Solocorn-LLC/adk-service` once nothing calls it.

## Status
Phase 1 only. `runAgent` does a guardrailed single-shot generation; tool calls are
declared but not yet executed (Phase 2).
