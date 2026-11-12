import {
  formatChange,
  formatCheck,
  formatContext,
  formatDiff,
  formatImpact,
  formatNext,
  formatQuery,
  formatStatus,
  redactInternalIds,
  SpecPluginService,
  type PluginFailure,
  type PluginWorkbenchRegistry,
} from "@spec-framework/cli/plugin"
import { tool, type ToolDefinition } from "./compat"

export interface SpecToolDependencies {
  service(target: string): SpecPluginService
  workbench: PluginWorkbenchRegistry
}

export function specTools(dependencies: SpecToolDependencies): Record<string, ToolDefinition> {
  const service = (directory: string) => dependencies.service(directory)

  return {
    spec_status: tool({
      description:
        "Show the current specification mode, workspace state, active proposal, approved scope, blockers, and open questions by visible name.",
      args: {},
      async execute(_args, context) {
        const [view, error] = await service(context.directory).status()
        if (error !== null || view === null) return failure(error)
        return view.proposal === null
          ? { output: `${formatStatus(view)}\n\nNo proposal is open.` }
          : { output: formatStatus(view) }
      },
    }),

    spec_context: tool({
      description:
        "Return a scoped context pack. Accepts visible names, opaque refs, or technical IDs. Default output hides internal codes.",
      args: {
        names: tool.schema.array(tool.schema.string()).optional().describe("Visible names or refs"),
        technical: tool.schema.boolean().optional().describe("Reveal internal identity"),
      },
      async execute(args, context) {
        const [view, error] = await service(context.directory).context(args.names ?? [])
        if (error !== null || view === null) return failure(error)
        return { output: formatContext(view, args.technical ?? false) }
      },
    }),

    spec_query: tool({
      description:
        "Query the unified spec graph by name, ref, kind, or status. Default output uses visible names and plain-language state.",
      args: {
        name: tool.schema.string().optional().describe("Visible item name"),
        ref: tool.schema.string().optional().describe("Opaque ref"),
        kind: tool.schema.string().optional().describe("Element kind"),
        status: tool.schema.string().optional().describe("Element status"),
        technical: tool.schema.boolean().optional().describe("Reveal internal identity"),
      },
      async execute(args, context) {
        const [view, error] = await service(context.directory).query(args)
        if (error !== null || view === null) return failure(error)
        return {
          output: `${formatQuery(view.entries, args.technical ?? false)}\n\nworkspace: ${view.dirty ? "local changes present" : "clean"}`,
        }
      },
    }),

    spec_impact: tool({
      description:
        "Show named impact for the active proposal: changed and affected items, evidence to regenerate, approvals to renew, and open questions.",
      args: {},
      async execute(_args, context) {
        const [view, error] = await service(context.directory).impact()
        if (error !== null || view === null) return failure(error)
        return { output: formatImpact(view) }
      },
    }),

    spec_diff: tool({
      description: "Show the active proposal diff versus the baseline by visible name.",
      args: {},
      async execute(_args, context) {
        const [view, error] = await service(context.directory).diff()
        if (error !== null || view === null) return failure(error)
        return { output: formatDiff(view) }
      },
    }),

    spec_validate: tool({
      description: "Run specification validation and return findings by human consequence.",
      args: {
        structural: tool.schema.boolean().optional().describe("Structural checks only"),
        technical: tool.schema.boolean().optional().describe("Reveal diagnostic codes"),
      },
      async execute(args, context) {
        const [view, error] = await service(context.directory).validate(args.structural ?? false)
        if (error !== null || view === null) return failure(error)
        return { output: formatCheck(view, args.technical ?? false) }
      },
    }),

    spec_propose: tool({
      description:
        "Apply typed operations to the active proposal. Operations are a JSON array. The tool cannot approve or write spec/spec.lock.",
      args: {
        operations: tool.schema
          .string()
          .describe(
            "JSON array of typed operations: rename, deprecate, replace, split, merge, extract, move, change-contract, record-decision, record-open-question",
          ),
        simulate: tool.schema.boolean().optional().describe("Include before/after simulation"),
        proposalRef: tool.schema.string().optional().describe("Opaque proposal ref"),
      },
      async execute(args, context) {
        const plugin = service(context.directory)
        const [operations, parseError] = plugin.parseOperations(args.operations)
        if (parseError !== null || operations === null) return failure(parseError)
        const [view, error] = await plugin.propose(
          { operations, simulate: args.simulate ?? false },
          args.proposalRef,
        )
        if (error !== null || view === null) return failure(error)
        return { output: formatChange(view) }
      },
    }),

    spec_decide: tool({
      description:
        "Record a human-confirmed decision or open question in the active proposal. Never approves.",
      args: {
        kind: tool.schema.enum(["decision", "open-question"]).describe("Record kind"),
        text: tool.schema.string().describe("Decision or question text"),
        target: tool.schema.string().optional().describe("Visible name or ref for the subject"),
        owner: tool.schema.string().optional().describe("Decision owner"),
      },
      async execute(args, context) {
        const [view, error] = await service(context.directory).decide(args)
        if (error !== null || view === null) return failure(error)
        return { output: formatChange(view) }
      },
    }),

    spec_next: tool({
      description: "Show ready decisions, next actions, blockers, and open questions.",
      args: {},
      async execute(_args, context) {
        const [view, error] = await service(context.directory).next()
        if (error !== null || view === null) return failure(error)
        return { output: formatNext(view) }
      },
    }),

    spec_workbench: tool({
      description:
        "Start or open the local proposal workbench and return its URL. The workbench cannot approve.",
      args: {},
      async execute(_args, context) {
        const plugin = service(context.directory)
        const [status, statusError] = await plugin.status()
        if (statusError !== null || status === null) return failure(statusError)

        const [url, openError] = await dependencies.workbench.open(context.directory)
        if (openError !== null || url === null) {
          return { title: "Workbench unavailable", output: openError ?? "workbench did not start" }
        }

        return {
          title: "Workbench open",
          output: [
            `workbench: ${url}`,
            `mode: ${status.mode}`,
            `initial view: ${initialView(status.mode)}`,
          ].join("\n"),
        }
      },
    }),
  }
}

function initialView(mode: string): string {
  if (mode === "mapping") return "Map"
  if (mode === "scratch") return "Compose"
  if (mode === "refactor") return "Rework"

  return "Overview"
}

function failure(error: PluginFailure | null): {
  title: string
  output: string
  metadata: { code: string }
} {
  if (error === null) {
    return {
      title: "Spec request failed",
      output: "The request did not return a result.",
      metadata: { code: "SPEC-PLUGIN-UNKNOWN" },
    }
  }

  const choices = error.choices?.map((choice) => `- ${choice.label}: ${choice.context}`) ?? []

  return {
    title: "Spec request failed",
    output: [
      redactInternalIds(error.message),
      ...(choices.length === 0 ? [] : ["", ...choices]),
    ].join("\n"),
    metadata: { code: error.code },
  }
}
