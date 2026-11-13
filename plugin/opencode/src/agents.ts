import type { Config } from "./compat"

type Agents = NonNullable<Config["agent"]>

const safety = [
  "Use generated evidence and confidence labels.",
  "Never claim approval, normative intent, or complete runtime behavior.",
  "Never edit spec/generated or .spec.",
  "Never pass or fail a check without a checker result.",
].join(" ")

export function pluginAgents(): Agents {
  return {
    "spec-reviewer": {
      description: "Read-only generated-spec review.",
      mode: "subagent",
      prompt: [
        "You review generated repository evidence.",
        "Use spec_status, spec_context, spec_query, spec_flows, spec_findings, and spec_validate.",
        "Report uncertainty and cite generated identities only when technical detail is requested.",
        safety,
      ].join("\n\n"),
      tools: {
        read: true,
        grep: true,
        glob: true,
        bash: false,
        edit: false,
        spec_status: true,
        spec_context: true,
        spec_query: true,
        spec_flows: true,
        spec_findings: true,
        spec_snapshots: true,
        spec_validate: true,
        spec_analyze: false,
        spec_workbench: false,
      },
      permission: { bash: "deny", edit: "deny" },
    },
  }
}
