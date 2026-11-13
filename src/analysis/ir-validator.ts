import { fail, ok, type Result } from "../core/result"
import { IR_VERSION, type IrSnapshot } from "./ir"

const ELEMENT_TYPES = new Set([
  "module",
  "class",
  "interface",
  "function",
  "method",
  "property",
  "constant",
  "type_alias",
  "enum",
])

export class IrValidator {
  static validate(snapshot: IrSnapshot): Result<IrSnapshot, string> {
    if (snapshot.version !== IR_VERSION) return fail("unsupported IR version")
    const elementIds = new Set<string>()

    for (const element of snapshot.elements) {
      if (element.id === "") return fail("IR element id is empty")
      if (elementIds.has(element.id)) return fail(`duplicate IR element '${element.id}'`)
      if (!ELEMENT_TYPES.has(element.type)) return fail(`unknown IR element type '${element.type}'`)
      if (
        element.parentId !== null &&
        !snapshot.elements.some((item) => item.id === element.parentId)
      ) {
        return fail(`IR parent does not exist: ${element.parentId}`)
      }
      elementIds.add(element.id)
    }

    for (const relationship of snapshot.relationships) {
      if (!elementIds.has(relationship.sourceId)) {
        return fail(`relationship source does not exist: ${relationship.sourceId}`)
      }
      if (!elementIds.has(relationship.targetId)) {
        return fail(`relationship target does not exist: ${relationship.targetId}`)
      }
    }

    for (const entryPoint of snapshot.entryPoints) {
      if (!elementIds.has(entryPoint.nodeId)) {
        return fail(`entry point node does not exist: ${entryPoint.nodeId}`)
      }
    }

    return ok(snapshot)
  }
}
