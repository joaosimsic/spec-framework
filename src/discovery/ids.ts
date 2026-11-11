export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug === "" ? "unknown" : slug
}

export function elementId(prefix: string, name: string): string {
  return `${prefix}-${slugify(name).toUpperCase()}`
}

export function uniqueElementId(prefix: string, name: string, used: Set<string>): string {
  const base = elementId(prefix, name)
  if (!used.has(base)) {
    used.add(base)
    return base
  }

  let suffix = 2
  while (used.has(`${base}-${suffix}`)) suffix += 1

  const id = `${base}-${suffix}`
  used.add(id)
  return id
}

export function likec4Alias(id: string): string {
  const parts = id.toLowerCase().split("-").filter(Boolean)
  const first = parts[0] ?? "element"
  const rest = parts.slice(1).map((part) => part.charAt(0).toUpperCase() + part.slice(1))

  return `${first}${rest.join("")}`
}
