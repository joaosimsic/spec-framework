import type { SdocBlock } from "../core/types"
import type { GraphContribution, GraphElement, GraphLink, GraphStatus } from "./types"

const KIND_BY_PREFIX: Record<string, string> = {
  SYS: "system",
  CMP: "component",
  IFC: "interface",
  DAT: "data_entity",
  REQ: "requirement",
  CAP: "capability",
  AC: "acceptance_criterion",
  VOBJ: "verification_objective",
  VER: "verification_case",
  INV: "invariant",
  MOD: "formal_module",
  PROP: "formal_property",
  CON: "contract",
  ONTO: "ontology",
  VOC: "concept_scheme",
  CONCEPT: "concept",
  SCON: "semantic_contract",
  EVD: "evidence",
  UNK: "unknown",
  WVR: "waiver",
  DEC: "decision",
  TERM: "term",
}

const STATUSES = new Set<GraphStatus>(["draft", "proposed", "approved", "deprecated"])

const LINK_FIELDS = [
  { field: "CAPABILITY", type: "derives_from", skipped: ["infrastructure"] },
  { field: "ACCEPTANCE", type: "acceptance", skipped: [] },
  { field: "COMPONENT", type: "component", skipped: [] },
  { field: "FORMAL", type: "formalization", skipped: ["none"] },
  { field: "CONTRACTS", type: "contract", skipped: [] },
  { field: "VERIFICATION", type: "verification", skipped: [] },
  { field: "EVIDENCE", type: "evidence", skipped: [] },
  { field: "WAIVER", type: "waiver", skipped: [] },
] as const

export class RequirementsGraphSource {
  collect(blocks: SdocBlock[]): GraphContribution {
    return {
      elements: blocks
        .map((block) => this.element(block))
        .filter((element): element is GraphElement => element !== null),
      findings: [],
    }
  }

  private element(block: SdocBlock): GraphElement | null {
    const id = block.fields.UID
    if (id === undefined || id === "") return null

    return {
      id,
      kind: this.kind(id),
      ...this.optionalFields(block),
      links: this.links(block),
    }
  }

  private optionalFields(block: SdocBlock): Pick<
    GraphElement,
    "title" | "status" | "owner" | "provenance"
  > {
    const title = block.fields.TITLE
    const owner = block.fields.OWNER
    const provenance = block.fields.PROVENANCE

    return {
      ...(title === undefined ? {} : { title }),
      ...(block.fields.STATUS === undefined ? {} : { status: this.status(block.fields.STATUS) }),
      ...(owner === undefined ? {} : { owner }),
      ...(provenance === undefined ? {} : { provenance }),
    }
  }

  private kind(id: string): string {
    const prefix = id.split("-")[0] ?? ""
    return KIND_BY_PREFIX[prefix] ?? prefix.toLowerCase()
  }

  private status(value: string): GraphStatus {
    const normalized = value.toLowerCase() as GraphStatus
    return STATUSES.has(normalized) ? normalized : "unknown"
  }

  private links(block: SdocBlock): GraphLink[] {
    const byKey = new Map<string, GraphLink>()

    for (const linkField of LINK_FIELDS) {
      const value = block.fields[linkField.field]
      if (value === undefined) continue

      for (const target of this.splitList(value)) {
        if (linkField.skipped.some((skipped) => skipped === target)) continue
        byKey.set(`${linkField.type}\u0000${target}`, { type: linkField.type, to: target })
      }
    }

    return [...byKey.values()]
  }

  private splitList(value: string): string[] {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
}
