const SECRET_PATTERNS = [
  /(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s]+/gi,
  /\b(?:ghp|github_pat|xox[baprs]|sk)-[A-Za-z0-9_-]{12,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
]

export class SecretRedactor {
  static redact(value: string): string {
    return SECRET_PATTERNS.reduce(
      (current, pattern) => current.replace(pattern, "[REDACTED]"),
      value,
    )
  }

  static redactFile(path: string, content: string): string {
    const name = path.split("/").at(-1) ?? path
    if (/^(?:\.env|\.npmrc|\.netrc|credentials|secrets)/i.test(name)) return ""

    return this.redact(content)
  }
}
