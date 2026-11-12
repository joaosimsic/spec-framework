export const APPROVAL_COMMAND = /(?:^|[;&|]\s*|\s)spec\s+approve(?:\s|$)/i

const SPEC_SOURCE_ALLOWLIST = [
  "spec/proposals/",
  "spec/evidence/",
  "spec/audit/",
  "spec/README.md",
  "spec/toolchain.lock.json",
]

export function isApprovalCommand(command: string): boolean {
  return APPROVAL_COMMAND.test(command)
}

export function isLockWrite(path: string): boolean {
  return normalized(path).endsWith("spec/spec.lock")
}

export function isSpecSourceWrite(path: string): boolean {
  const value = normalized(path)
  const index = value.indexOf("spec/")
  if (index === -1) return false

  const relative = value.slice(index)
  if (SPEC_SOURCE_ALLOWLIST.some((allowed) => relative.startsWith(allowed))) return false

  return true
}

export function guardCommand(command: string): string | null {
  if (isApprovalCommand(command)) {
    return "Approval is a human-only CLI action. Ask the human to run spec approve."
  }

  return null
}

export function guardWrite(path: string, agent: string | undefined): string | null {
  if (isLockWrite(path)) {
    return "The approval lock is human-only and cannot be written by an agent."
  }

  if (isSpecAgent(agent) && isSpecSourceWrite(path)) {
    return "Spec source changes must go through spec_propose, not direct file writes."
  }

  return null
}

export function isSpecAgent(agent: string | undefined): boolean {
  return agent?.startsWith("spec-") === true
}

function normalized(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "")
}
