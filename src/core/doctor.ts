import { existsSync } from "node:fs"
import { localToolCandidates } from "./runner"
import type { Diagnostic } from "./types"

export interface ToolStatus {
  name: string
  command: string
  required: boolean
  present: boolean
  install: string
}

const TOOLS = [
  { name: "likec4", command: "likec4", required: true, install: "run spec doctor --fix (bun)" },
  {
    name: "strictdoc",
    command: "strictdoc",
    required: true,
    install: "run spec doctor --fix (uv)",
  },
  { name: "quint", command: "quint", required: true, install: "run spec doctor --fix (bun)" },
  {
    name: "apalache",
    command: "apalache-mc",
    required: true,
    install: "install pinned Apalache release (requires Java 21+)",
  },
  { name: "java", command: "java", required: true, install: "install Java 21+" },
  { name: "cargo", command: "cargo", required: false, install: "install Rust with rustup" },
  { name: "rustup", command: "rustup", required: false, install: "install rustup" },
  {
    name: "cargo-public-api",
    command: "cargo-public-api",
    required: false,
    install: "cargo install cargo-public-api (requires nightly Rust)",
  },
  {
    name: "cargo-semver-checks",
    command: "cargo-semver-checks",
    required: false,
    install: "cargo install cargo-semver-checks",
  },
  { name: "bun", command: "bun", required: false, install: "install Bun" },
  { name: "uv", command: "uv", required: false, install: "install uv" },
  { name: "nix", command: "nix", required: false, install: "install Nix" },
  { name: "docker", command: "docker", required: false, install: "install Docker or Podman" },
  { name: "podman", command: "podman", required: false, install: "install Podman" },
]

export function getToolStatuses(target = process.cwd()): ToolStatus[] {
  return TOOLS.map((tool) => ({
    ...tool,
    present:
      localToolCandidates(target, tool.command).some((candidate) => existsSync(candidate)) ||
      Bun.which(tool.command) !== null,
  }))
}

export function missingRequiredDiagnostics(
  statuses: ToolStatus[],
  requiredNames?: string[],
): Diagnostic[] {
  const required = requiredNames === undefined ? null : new Set(requiredNames)

  return statuses
    .filter((tool) => {
      if (!tool.present) {
        if (required === null) return tool.required

        return required.has(tool.name)
      }

      return false
    })
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
