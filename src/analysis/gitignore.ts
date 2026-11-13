interface GitIgnoreRule {
  regex: RegExp
  negated: boolean
}

export class GitIgnoreMatcher {
  private readonly rules: GitIgnoreRule[]

  constructor(patterns: string[]) {
    this.rules = patterns.flatMap((pattern) => this.compile(pattern))
  }

  ignores(path: string): boolean {
    let ignored = false
    const normalized = path.replace(/^\/+/, "")

    for (const rule of this.rules) {
      if (!rule.regex.test(normalized)) continue
      ignored = !rule.negated
    }

    return ignored
  }

  private compile(pattern: string): GitIgnoreRule[] {
    const trimmed = pattern.trim()
    if (trimmed === "" || trimmed.startsWith("#")) return []

    const negated = trimmed.startsWith("!")
    const body = negated ? trimmed.slice(1) : trimmed
    if (body === "") return []

    const anchored = body.startsWith("/")
    const cleaned = body.replace(/^\/+/, "").replace(/\/+$/, "")
    if (cleaned === "") return []

    const source = this.globSource(cleaned, anchored)

    return [{ regex: new RegExp(`^${source}(?:/.*)?$`), negated }]
  }

  private globSource(pattern: string, anchored: boolean): string {
    const segments = pattern.split("/")
    const body = segments.map((segment) => this.segmentSource(segment)).join("/")
    if (anchored || pattern.includes("/")) return body

    return `(?:.*/)?${body}`
  }

  private segmentSource(segment: string): string {
    if (segment === "**") return ".*"

    let source = ""
    for (const character of segment) {
      if (character === "*") {
        source += "[^/]*"
        continue
      }
      if (character === "?") {
        source += "[^/]"
        continue
      }
      source += character.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    }

    return source
  }
}
