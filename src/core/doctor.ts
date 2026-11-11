import type { Diagnostic } from "./types"

export interface ToolStatus {
  name: string
  command: string
  required: boolean
  present: boolean
  install: string
}

const TOOLS = [
  { name: "likec4", command: "likec4", required: true, install: "bun add -d likec4" },
  { name: "strictdoc", command: "strictdoc", required: true, install: "uvx strictdoc --version" },
  { name: "quint", command: "quint", required: true, install: "bun add -d @informalsystems/quint" },
  {
    name: "apalache",
    command: "apalache-mc",
    required: true,
    install: "install pinned Apalache release (requires Java 21+)",
  },
  { name: "java", command: "java", required: true, install: "install Java 21+" },
  { name: "bun", command: "bun", required: false, install: "install Bun" },
  { name: "uv", command: "uv", required: false, install: "install uv" },
  { name: "nix", command: "nix", required: false, install: "install Nix" },
  { name: "docker", command: "docker", required: false, install: "install Docker or Podman" },
  { name: "podman", command: "podman", required: false, install: "install Podman" },
]

export function getToolStatuses(): ToolStatus[] {
  return TOOLS.map((tool) => ({
    ...tool,
    present: Bun.which(tool.command) !== null,
  }))
}

export function missingRequiredDiagnostics(statuses: ToolStatus[]): Diagnostic[] {
  return statuses
    .filter((tool) => tool.required && !tool.present)
    .map((tool) => ({
      level: "error" as const,
      code: "TOOL-MISSING",
      message: `${tool.name} is required; ${tool.install}`,
    }))
}

export function formatStatuses(statuses: ToolStatus[]): string {
  const rows = statuses.map((tool) => {
    const state = tool.present ? "ok" : tool.required ? "missing" : "optional"
    const requirement = tool.required ? "required" : "optional"
    return `${tool.name.padEnd(12)} ${state.padEnd(10)} ${requirement.padEnd(9)} ${tool.install}`
  })
  return rows.join("\n")
}
