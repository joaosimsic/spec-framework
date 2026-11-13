export { TypeScriptAdapter } from "./adapters/typescript"
export { TypeScriptAnalysisExecutor } from "./executor"
export { RepositoryScanner } from "./scanner"
export { IrIdentity, IR_VERSION } from "./ir"
export { IrValidator } from "./ir-validator"
export { SnapshotComparator, type SnapshotComparison, type SnapshotData } from "./comparison"
export type {
  DataChannel,
  IrCall,
  IrConfidence,
  IrDataAccess,
  IrElement,
  IrElementType,
  IrEntryPoint,
  IrEntryPointKind,
  IrFinding,
  IrFlow,
  IrFlowAccess,
  IrFlowStep,
  IrImport,
  IrInheritance,
  IrRelationship,
  IrRelationshipType,
  IrResolution,
  IrSnapshot,
  IrVisibility,
} from "./ir"
export type { ScannedFile, ScanResult, ScanWarning } from "./types"
