import { describe, expect, test } from "bun:test"
import { formatC4Annotation, parseC4, parseC4Annotation } from "../src/core/c4"

describe("C4 annotations", () => {
  test("parses quoted role metadata with spaces and code paths", () => {
    const annotation = parseC4Annotation(
      'approved observed human:tester@2026-11-12 description="Builds the validated graph." responsibility="Owns validation." boundary="In scope: checks." code="src/core,src/model"',
    )

    expect(annotation).toMatchObject({
      status: "approved",
      confidence: "observed",
      provenance: "human:tester@2026-11-12",
      metadata: {
        description: "Builds the validated graph.",
        responsibility: "Owns validation.",
        boundary: "In scope: checks.",
        code: "src/core,src/model",
      },
    })
  })

  test("keeps metadata when formatting an annotation", () => {
    const formatted = formatC4Annotation({
      status: "proposed",
      metadata: {
        description: "Builds the validated graph.",
        code: "src/core,src/model",
      },
    })
    const parsed = parseC4Annotation(formatted)

    expect(parsed.metadata).toEqual({
      description: "Builds the validated graph.",
      code: "src/core,src/model",
    })
  })

  test("attaches annotation metadata to the following element", () => {
    const parsed = parseC4(
      "/project/spec/architecture/model.c4",
      `// CMP-SAMPLE proposed observed human:tester@2026-11-12 description="Does a thing."
sample = component 'Sample'
`,
    )

    expect(parsed.elements[0]?.annotation.metadata["description"]).toBe("Does a thing.")
  })
})
