export function isRetiredCommand(command: string): boolean {
  return /\bspec\s+(?:approve|change|refactor|start|map|architecture|init|next)\b/i.test(command)
}

export function isGeneratedWrite(path: string): boolean {
  const value = normalized(path)
  return (
    value.startsWith("spec/") || value.startsWith(".spec/") || value.endsWith("spec-framework.json")
  )
}

export function guardCommand(command: string): string | null {
  if (!isRetiredCommand(command)) return null
  return "This command is retired in the generated spec product."
}

export function guardWrite(path: string): string | null {
  if (!isGeneratedWrite(path)) return null
  return "Generated spec output and configuration are read-only inside the agent."
}

export function isSpecAgent(agent: string | undefined): boolean {
  return agent?.startsWith("spec-") === true
}

function normalized(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "")
}
