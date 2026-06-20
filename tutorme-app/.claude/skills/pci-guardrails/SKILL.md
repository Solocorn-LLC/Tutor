---
name: pci-guardrails
description: Apply the Task PCI and Assessment PCI/DMI guardrails when working on any AI code that interprets tutor instructions, generates assessments/DMIs, evaluates student work, or serves assessment content. Use when touching api/ai/pci-master, api/ai/generate-dmi, src/lib/ai/guardrails, the assessment/task builder, or any student-facing assessment delivery.
---

# PCI & Assessment Guardrails

This project enforces two tutor-authored guardrail documents at runtime. When you write or change
code in this area, keep it compliant.

## Sources of truth

- `docs/guardrails/tasks-pci.md` — the 20 Task PCI Instruction Engine rules (`TASK-1..20`).
- `docs/guardrails/assessments.md` — the 15 Assessment PCI/DMI rules (`ASMT-1..15`) + state machine.
- `src/lib/ai/guardrails/` — the runtime implementation:
  - `task-pci.ts` — `TASK_PCI_GUARDRAILS`, `TASK_PCI_SYSTEM_PROMPT`
  - `assessment.ts` — `ASSESSMENT_GUARDRAILS`, `ASSESSMENT_SYSTEM_PROMPT`, `ASSESSMENT_STATES`, `canTransition`
  - `validate.ts` — `validateTaskPciOutput`, `validateAssessmentOutput` (warn-only)
  - `serialize.ts` — `stripEvaluationLayer`, `findEvaluationLeaks`
  - `index.ts` — `guardrailSystemPrompt`, `runTaskGuardrails`, `runAssessmentGuardrails`, `GUARDRAILED_TEMPERATURE`

If you change a rule, update **all three** (doc + module + validator) together.

## Rules for writing PCI/assessment code

1. **Any LLM call that interprets tutor task instructions** must inject `TASK_PCI_SYSTEM_PROMPT`
   (via `guardrailSystemPrompt('task')`) and run `runTaskGuardrails` on the output. Mark undefined
   policy fields `"unspecified"` — never fabricate retries/weights/strictness/partial-credit/
   reveal-timing/penalties.
2. **Any LLM call that builds an assessment/DMI** must inject the assessment guardrails, preserve
   question wording verbatim (ASMT-4), and run `runAssessmentGuardrails`.
3. **Any student-facing assessment payload** MUST pass through `stripEvaluationLayer()` before it
   leaves the server. Answers, rubrics, variants, scoring, and provenance are the hidden evaluation
   layer and must never reach a student (ASMT-10/13/15). Use `findEvaluationLeaks()` in tests.
4. **Any assessment state change** must go through `canTransition(from, to)`. Never allow
   `Edited → Final DMI Generated` without `Re-Verified` (ASMT-14).
5. **Confirmation is mandatory** before finalizing a PCI (TASK-5). Don't add code paths that
   silently finalize.
6. Use `GUARDRAILED_TEMPERATURE` (0.2) for guardrailed generation — the Consistency guardrail
   (TASK-8) wants stable behaviour.

## Enforcement posture

Currently **warn-only**: validators return `guardrailWarnings` (logged + returned to the client),
they do not block. `stripEvaluationLayer` and `canTransition` are the exceptions — those are
deterministic guarantees, not warnings. To promote a rule to blocking, raise its violation
`severity` to `error` and gate the call site on `runResult.hasBlocking`.

## Do not

- Do not paraphrase exam question wording.
- Do not invent evaluation policy a tutor didn't specify.
- Do not expose answers/rubrics to students, even in "draft" or "debug" responses.
- Do not bypass the state machine for assessment transitions.
