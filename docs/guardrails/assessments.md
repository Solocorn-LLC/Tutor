# Assessment Guardrails (Source of Truth)

The **Assessment** system converts an uploaded examination document (PDF/PPT) into two
components:

- **Assessment PCI** (Programmatic Curriculum Instruction Layer) — the canonical blueprint:
  question structure, evaluation logic, rubrics, and answer provenance.
- **DMI** (Deployable Marking Interface) — the graphical interface used for tutor verification
  and, after stripping, student delivery.

The system must preserve the integrity of the original assessment and ensure evaluation criteria
are fully defined before deployment. **Accuracy, structural fidelity, and evaluation validity
take priority over convenience or creative interpretation.**

Canonical machine-readable versions:
[`tutorme-app/src/lib/ai/guardrails/assessment.ts`](../../tutorme-app/src/lib/ai/guardrails/assessment.ts)
(`ASSESSMENT_GUARDRAILS`, `ASSESSMENT_SYSTEM_PROMPT`, `ASSESSMENT_STATES`, `canTransition`),
enforced (warn-only) by `validateAssessmentOutput` and `stripEvaluationLayer` in `validate.ts` /
`serialize.ts`.

## Enforcement model

| Layer                | Mechanism                                                                                                                                                       | Status                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Prompt               | `ASSESSMENT_SYSTEM_PROMPT` (full) / a condensed guardrail block injected into `api/ai/generate-dmi` for the tutor-facing Draft DMI; temperature lowered to 0.2. | **Active**             |
| Validator            | `validateAssessmentOutput` checks wording fidelity, provenance, rubric presence/sum, layer separation — returns `guardrailWarnings`.                            | **Active (warn-only)** |
| Code (deterministic) | `stripEvaluationLayer` removes answers/rubrics from any student-facing payload; `canTransition` enforces the state machine.                                     | **Active**             |

The single guarantee that is **not** warn-only is `stripEvaluationLayer` — student payloads must
always be run through it so the evaluation layer can never leak (ASMT-10/13/15).

## The 15 rules

1. **Ingestion & Parsing** — Analyze before generating logic. Extract title/subject/level/marks/sections/numbering/hierarchy/mark allocations/source materials/response types. Flag uncertainty, don't guess. No answers/criteria yet.
2. **Document Confidence Scoring** — Score High/Medium/Low. High → proceed. Medium → proceed but flag. **Low → pause and request tutor clarification.**
3. **Classification** — Provisional unless an official mark scheme or the tutor confirms.
4. **PCI Construction & Wording Fidelity** — Build canonical PCI with metadata + section + per-question fields. **Preserve question wording EXACTLY — never paraphrase.**
5. **Answer Scheme Provenance** — Record provenance per answer: `tutor_provided | answer_sheet_extracted | llm_inferred | tutor_edited`. Tutor-provided takes precedence.
6. **Draft DMI / Answer Visibility** — Draft DMI is tutor-facing; prepopulated answers are visible only to the tutor and must never appear in the student-facing assessment.
7. **Prepopulated Answer Logic** — Closed: correct answer + variants. Open: model answer / key points / rubric / sample / acceptable features. A model answer isn't the only acceptable response unless the tutor approves.
8. **Rubric Requirement** — Every open-ended question needs a rubric pathway before confirmation; **block confirmation until satisfied.**
9. **Rubric Construction** — Concept-based, allow equivalent reasoning / multiple expressions / partial credit. **Criteria must sum to the question's marks.** Model answers are examples.
10. **Layer Separation** — Delivery (student-visible) vs Evaluation (hidden: answers, variants, rubrics, scoring). **Evaluation layer never student-visible.**
11. **Edits Trigger Re-Verification** — Substantive edits (wording, marks, rubric, answer, question/input type, section) require re-verification. Cosmetic changes may bypass.
12. **Re-Verification Checks** — Section/numbering/mark/rubric/answer-mapping/layer alignment. Any inconsistency blocks final generation.
13. **Final Operational DMI** — Only after verification: student-visible content only, all answers/rubrics removed, verified structure preserved.
14. **State Machine** — `Parsed → PCI Drafted → Draft DMI Generated → Edited → Re-Verified → Final DMI Generated → Deployed`. **Never Edited → Final without Re-Verified.**
15. **Academic Integrity** — Never reveal answers/rubrics/evaluation logic to students during a live assessment; only procedural clarification; don't help solve questions.

## State machine

`canTransition(from, to)` is the authority. The `Edited → Final DMI Generated` jump is explicitly
illegal — it must pass through `Re-Verified`. Wire any code that advances assessment state through
`canTransition` so the rule is enforced deterministically rather than by prompt alone.

## What the validator currently checks (warn-only)

- **ASMT-2** — Full PCI produced on Low document confidence (should have paused).
- **ASMT-4** — Question wording not found verbatim in source (possible paraphrase).
- **ASMT-5** — Unrecognized answer provenance value.
- **ASMT-8** — Open-ended question with no rubric pathway.
- **ASMT-9** — Rubric criteria that don't sum to the question's marks.
- **ASMT-10 (error)** — Evaluation data (rubric/answer/provenance) present on a student-facing payload.

## Prompt variants (per-type steering)

The **PCI chat** tailors its marking-policy interview to what's being marked, by
appending a short addendum to `ASSESSMENT_SYSTEM_PROMPT`. This is **prompt-layer
steering only** — the addendum is added AFTER the full base prompt (which embeds
all 15 rules), so no guardrail is ever dropped or relaxed; the validators and
state machine are unchanged. Implementation: `src/lib/ai/guardrails/variants.ts`
(`resolvePciComposition`, `assessmentVariantAddendum`), selected in
`guardrailSystemPrompt('assessment', variant)`.

The variant is derived client-side from the DMI and passed as `context.variant`:

- **Composition** (from the DMI question mix; open = `short`/`long`):
  - `objective` — ≥ 80% closed → short interview: partial credit for
    multiple-response, negative marking, numeric/fill-in tolerance, blanks. No
    rubric walk-throughs for auto-graded questions.
  - `free_response` — ≥ 60% open → rubric-centric: method vs answer, partial-
    credit bands, equivalent reasoning, key points, feedback tone; enforce the
    ASMT-8 rubric pathway and ASMT-9 mark-sum.
  - `mixed` — otherwise → ask whether one policy covers all, or closed vs written
    parts differ, then branch.
- **Source** (`documentKind`): a `study_material` note tells the model the
  questions were generated (provenance `llm_inferred`) and to confirm coverage /
  difficulty before building the policy. `documentKind` is persisted with the DMI
  (survives reload); for DMIs generated before it was persisted,
  `inferDocumentKindFromProvenance` backfills it conservatively at load time
  (only all-`llm_inferred` answers → `study_material`; any answer-sheet/tutor
  source → left unset, so a real paper is never mislabelled).

Tasks use the same mechanism but only the **source** modifier: a `study_material`
note (composition does not apply — task answering is free-form chat). See
[`tasks-pci.md`](./tasks-pci.md) → "Prompt variants".
