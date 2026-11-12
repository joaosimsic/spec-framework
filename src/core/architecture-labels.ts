import type { DraftElement } from "../discovery/types"

const SOURCE_ROOTS = new Set(["src", "lib", "plugin", "bin", "scripts"])
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/

export class ArchitectureDraftLabels {
  static title(element: DraftElement, modules: string[]): string {
    const title = element.title.trim()
    if (!this.isPathTitle(title)) return title
    if (this.isCliModule(modules)) return "CLI"

    return this.humanizePath(title)
  }

  static codePaths(element: DraftElement, modules: string[]): string[] {
    if (
      element.kind === "data_store" ||
      element.kind === "external_system" ||
      element.kind === "actor"
    ) {
      return []
    }
    const paths = new Set<string>()
    const provenancePath = this.provenancePath(element.provenance)
    if (provenancePath !== undefined) paths.add(provenancePath)
    for (const module of modules) paths.add(module)

    return [...paths].sort()
  }

  private static isPathTitle(title: string): boolean {
    if (title.startsWith("@")) return false
    if (title.includes("/")) return true
    if (SOURCE_FILE_PATTERN.test(title)) return true

    return SOURCE_ROOTS.has(title)
  }

  private static isCliModule(modules: string[]): boolean {
    if (modules.length !== 1) return false

    return /(?:^|\/)cli\.[^.]+$/.test(modules[0] ?? "")
  }

  private static humanizePath(path: string): string {
    const segments = path.split("/").filter(Boolean)
    const meaningful = segments.filter(
      (segment) => !SOURCE_ROOTS.has(segment) && !SOURCE_FILE_PATTERN.test(segment),
    )
    const selected = meaningful.at(-1) ?? segments.at(-1) ?? path
    const cleaned = selected.replace(SOURCE_FILE_PATTERN, "")

    return this.titleCase(cleaned)
  }

  private static titleCase(value: string): string {
    const words = value
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)

    if (words.length === 0) return "Source root"

    return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ")
  }

  private static provenancePath(provenance: string): string | undefined {
    if (!provenance.startsWith("code:")) return undefined
    const path = provenance.slice("code:".length).replace(/\/+$/, "")

    return path === "" ? undefined : path
  }
}
