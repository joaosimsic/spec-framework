import { AI_DIAGNOSIS_RULES } from "./types"

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

export const ARCHITECTURE_DIAGNOSIS_SCHEMA = {
  version: AI_SCHEMA_VERSION,
  type: "object",
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        required: [
          "ruleId",
          "title",
          "explanation",
          "recommendation",
          "affectedElements",
          "evidence",
          "confidence",
        ],
        properties: {
          ruleId: { enum: AI_DIAGNOSIS_RULES },
          title: { type: "string", minLength: 1 },
          explanation: { type: "string", minLength: 1 },
          recommendation: { type: "string", minLength: 1 },
          affectedElements: { type: "array", minItems: 1, items: { type: "string" } },
          evidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["elementId", "filePath", "line"],
              properties: {
                elementId: { type: "string", minLength: 1 },
                filePath: { type: "string", minLength: 1 },
                line: { type: "integer", minimum: 1 },
              },
              additionalProperties: false,
            },
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const

export const INTERPRETATION_SCHEMA = {
  version: AI_SCHEMA_VERSION,
  type: "object",
  required: ["explanation", "evidence", "confidence"],
  properties: {
    explanation: { type: "string", minLength: 1 },
    evidence: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["filePath", "line", "reference"],
        properties: {
          filePath: { type: "string", minLength: 1 },
          line: { type: "integer", minimum: 1 },
          reference: { type: "string", minLength: 1 },
        },
        additionalProperties: false,
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  additionalProperties: false,
} as const
