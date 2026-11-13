export const AI_SCHEMA_VERSION = 1

export const AI_ANSWER_SCHEMA = {
  version: AI_SCHEMA_VERSION,
  type: "object",
  required: ["explanation", "elements", "files", "confidence"],
  properties: {
    explanation: { type: "string", minLength: 1 },
    elements: { type: "array", items: { type: "string" } },
    files: { type: "array", items: { type: "string" } },
    evidence: { type: "array" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  additionalProperties: false,
} as const

export const RESPONSIBILITY_SCHEMA = {
  version: AI_SCHEMA_VERSION,
  type: "object",
  required: ["responsibility", "observedResponsibilities", "issues", "confidence"],
  properties: {
    responsibility: { type: "string" },
    observedResponsibilities: { type: "array", items: { type: "string" } },
    issues: { type: "array", items: { type: "string" } },
    evidence: { type: "array" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  additionalProperties: false,
} as const
