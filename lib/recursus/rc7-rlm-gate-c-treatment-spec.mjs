import { assertRc7GateCNoEvaluatorOnlyMarkers } from "./rc7-rlm-gate-c-scorer.mjs";

const CHILD_QUESTION = "Extract every closed-contract evidence item supported by this exact registered record; distinguish supported, derived, and uncertain statements.";

export const RC7_GATE_C_TREATMENT_CHILD_SPECS = Object.freeze({
  "LAB-01": Object.freeze([
    Object.freeze({ child_question: CHILD_QUESTION, excerpt_locator: Object.freeze({ kind: "json_pointer", source_id: "LAB-SOURCE-OVERVIEW-01", pointer: "/sources/0/records/0" }) }),
    Object.freeze({ child_question: CHILD_QUESTION, excerpt_locator: Object.freeze({ kind: "json_pointer", source_id: "LAB-SOURCE-OVERVIEW-01", pointer: "/sources/0/records/1" }) }),
    Object.freeze({ child_question: CHILD_QUESTION, excerpt_locator: Object.freeze({ kind: "json_pointer", source_id: "LAB-SOURCE-OVERVIEW-01", pointer: "/sources/0/records/2" }) }),
    Object.freeze({ child_question: CHILD_QUESTION, excerpt_locator: Object.freeze({ kind: "json_pointer", source_id: "LAB-SOURCE-PROJECTS-01", pointer: "/sources/1/records/0" }) }),
  ]),
  "PAPER-01": Object.freeze([
    Object.freeze({ child_question: CHILD_QUESTION, excerpt_locator: Object.freeze({ kind: "json_pointer", source_id: "PAPER-SOURCE-BODY-01", pointer: "/sources/0/records/1" }) }),
    Object.freeze({ child_question: CHILD_QUESTION, excerpt_locator: Object.freeze({ kind: "json_pointer", source_id: "PAPER-SOURCE-BODY-01", pointer: "/sources/0/records/3" }) }),
    Object.freeze({ child_question: CHILD_QUESTION, excerpt_locator: Object.freeze({ kind: "json_pointer", source_id: "PAPER-SOURCE-BODY-01", pointer: "/sources/0/records/4" }) }),
    Object.freeze({ child_question: CHILD_QUESTION, excerpt_locator: Object.freeze({ kind: "json_pointer", source_id: "PAPER-SOURCE-BODY-01", pointer: "/sources/0/records/5" }) }),
  ]),
  "REPO-01": Object.freeze([
    Object.freeze({ child_question: CHILD_QUESTION, excerpt_locator: Object.freeze({ kind: "json_pointer", source_id: "REPO-SOURCE-CODE-01", pointer: "/sources/1/records/0" }) }),
    Object.freeze({ child_question: CHILD_QUESTION, excerpt_locator: Object.freeze({ kind: "json_pointer", source_id: "REPO-SOURCE-CODE-01", pointer: "/sources/1/records/2" }) }),
    Object.freeze({ child_question: CHILD_QUESTION, excerpt_locator: Object.freeze({ kind: "json_pointer", source_id: "REPO-SOURCE-CODE-01", pointer: "/sources/1/records/3" }) }),
    Object.freeze({ child_question: CHILD_QUESTION, excerpt_locator: Object.freeze({ kind: "json_pointer", source_id: "REPO-SOURCE-CODE-01", pointer: "/sources/1/records/4" }) }),
  ]),
});

export async function buildRc7GateCRlmChildSpecs(caseId) {
  const specs = RC7_GATE_C_TREATMENT_CHILD_SPECS[caseId];
  if (!specs || specs.length !== 4) {
    const error = new Error("Only the three registered eligible treatment cases have RLM child specifications");
    error.code = "RLM_CASE_NOT_ELIGIBLE";
    throw error;
  }
  await assertRc7GateCNoEvaluatorOnlyMarkers({ case_id: caseId, bytes: JSON.stringify(specs) });
  return structuredClone(specs);
}
