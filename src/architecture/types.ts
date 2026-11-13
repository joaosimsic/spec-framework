import type { IrElement, IrEntryPoint, IrFlow, IrRelationship } from "../analysis/ir"
import type { GeneratedArchitecture, GeneratedImplementation, GeneratedMapping } from "../spec"

export interface ConceptualBuildInput {
  projectName: string
  root: string
  elements: IrElement[]
  relationships: IrRelationship[]
  entryPoints: IrEntryPoint[]
  flows: IrFlow[]
}

export interface ConceptualArchitecture {
  architecture: GeneratedArchitecture
  implementation: GeneratedImplementation
  mappings: GeneratedMapping[]
  component_by_entry: Record<string, string>
  component_by_implementation: Record<string, string>
}
