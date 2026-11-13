export { fail, ok, type Result } from "../core/result"
export {
  formatAnalyze,
  formatCheck,
  formatContext,
  formatContextBlock,
  formatQuery,
  formatStatus,
  redactInternalIds,
} from "./format"
export { guardCommand, guardWrite, isGeneratedWrite, isRetiredCommand, isSpecAgent } from "./guards"
export { SpecPluginService, type SpecPluginServiceOptions } from "./service"
export { PLUGIN_CONTRACT_VERSION } from "./types"
export type {
  PluginAnalyzeView,
  PluginCheckView,
  PluginContextView,
  PluginFailure,
  PluginFailureChoice,
  PluginQueryView,
  PluginStatusView,
  PluginWorkbenchView,
} from "./types"
export { PluginWorkbenchRegistry } from "./workbench"
