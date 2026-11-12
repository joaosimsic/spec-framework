import type { Config } from "./compat"

type Agents = NonNullable<Config["agent"]>

const safety = [
  "Use visible names and plain-language state.",
  "Never print internal IDs, hashes, proposal identifiers, or diagnostic codes unless the human asks for technical details.",
  "Never approve. Never edit spec/spec.lock.",
  "Route spec source changes through spec_propose.",
].join(" ")

export function pluginAgents(): Agents {
  return {
    "spec-architect": {
      description: "Drafts specification proposals and asks normative questions.",
      mode: "subagent",
      prompt: [
        "You are the spec architect for this repository.",
        "Build context with spec_status, spec_context, and spec_query. Draft changes with spec_propose. Record accepted decisions with spec_decide.",
        "Ask contextual questions when information is missing. Do not invent normative answers.",
        "Show named impact, invalidated evidence, and approvals to renew before recommending approval.",
        safety,
      ].join("\n\n"),
      tools: {
        read: true,
        grep: true,
        glob: true,
        bash: true,
        edit: false,
        spec_status: true,
        spec_context: true,
        spec_query: true,
        spec_impact: true,
        spec_diff: true,
        spec_propose: true,
        spec_validate: true,
        spec_decide: true,
        spec_next: true,
        spec_workbench: true,
      },
      permission: {
        bash: "allow",
        edit: "deny",
      },
    },
    "spec-critic": {
      description: "Read-only review of a specification proposal.",
      mode: "subagent",
      prompt: [
        "You are the spec critic for this repository.",
        "Stay read-only. Use spec_status, spec_context, spec_query, spec_diff, spec_impact, spec_validate, and spec_next.",
        "Report problems in plain language, name affected items, and distinguish blockers from open questions.",
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
        spec_impact: true,
        spec_diff: true,
        spec_propose: false,
        spec_validate: true,
        spec_decide: false,
        spec_next: true,
        spec_workbench: false,
      },
      permission: {
        bash: "deny",
        edit: "deny",
      },
    },
    "spec-mapper": {
      description: "Explains code structure and drives the mapping confidence queue.",
      mode: "subagent",
      prompt: [
        "You are the spec mapper for this repository.",
        "Use spec_status, spec_context, spec_query, spec_next, and spec_workbench to explain code-derived areas, relations, entry points, data stores, and tests.",
        "Label confidence in plain language. Code facts are not requirements or ownership claims without human confirmation.",
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
        spec_impact: false,
        spec_diff: false,
        spec_propose: false,
        spec_validate: true,
        spec_decide: false,
        spec_next: true,
        spec_workbench: true,
      },
      permission: {
        bash: "deny",
        edit: "deny",
      },
    },
  }
}
