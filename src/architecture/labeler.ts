import type { GeneratedLabelRole } from "../spec"

export interface ConceptualLabel {
  role: GeneratedLabelRole
  anchor: string
  label: string
}

const ANCHOR_LIMIT = 120

export class ConceptualLabeler {
  static label(role: GeneratedLabelRole, anchor: string): ConceptualLabel {
    const value = this.anchor(anchor)
    return { role, anchor: value, label: `${role} ${value}` }
  }

  static anchor(value: string): string {
    const trimmed = value.trim().replace(/\s+/g, " ").slice(0, ANCHOR_LIMIT)
    return trimmed === "" ? "unknown" : trimmed
  }

  static routeGroup(route: string): string {
    const segments = route.split("/").filter((segment) => segment !== "")
    if (segments.length === 0) return "/"
    if (segments[0] === "api" && segments[1] !== undefined) {
      return `/${segments.slice(0, 2).join("/")}`
    }
    return `/${segments[0]}`
  }

  static routeAnchor(method: string, route: string): string {
    return `${method.toUpperCase()}_${route}`
  }

  static dataTarget(source: string): string {
    const value = source.split("(")[0]?.trim() ?? source
    return this.anchor(value === "" ? "data" : value)
  }

  static externalPackage(specifier: string): string | null {
    if (specifier.startsWith("node:") || specifier.startsWith("bun:")) return specifier
    if (specifier.startsWith(".") || specifier.startsWith("/")) return null
    if (specifier.startsWith("@")) {
      const segments = specifier.split("/")
      return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : specifier
    }
    return specifier.split("/")[0] ?? specifier
  }
}
