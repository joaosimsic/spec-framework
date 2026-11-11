import { dirname, resolve } from "node:path"
import { attempt } from "../core/result"
import type { ProcessRunner, ToolLocator } from "../core/runner"
import { findFirstFile } from "./fs"
import { slugify, uniqueElementId } from "./ids"
import type { DiscoveryContribution, DiscoveryFinding, DraftElement } from "./types"

interface CargoDependency {
  name: string
  path: string | null
}

interface CargoPackage {
  name: string
  manifestPath: string
  dependencies: CargoDependency[]
}

export class RustDiscovery {
  constructor(
    private readonly processRunner: ProcessRunner,
    private readonly toolLocator: ToolLocator,
  ) {}

  async discover(target: string, systemId: string): Promise<DiscoveryContribution> {
    const manifestPath = await findFirstFile(target, "Cargo.toml")
    if (manifestPath === null) {
      return { elements: [], findings: [], externalDependencies: [] }
    }

    const cargo = await this.toolLocator.resolve("cargo")
    if (cargo === null) {
      return {
        elements: [],
        findings: [
          {
            level: "warning",
            code: "MAP-RUST-MISSING-TOOL",
            message: "cargo is not available; Rust discovery skipped and generic discovery used",
          },
        ],
        externalDependencies: [],
      }
    }

    const [result, error] = await this.processRunner.run({
      executable: cargo,
      arguments: [
        "metadata",
        "--no-deps",
        "--format-version",
        "1",
        "--manifest-path",
        manifestPath,
      ],
      workingDirectory: target,
      timeoutMs: 120_000,
    })
    if (error) {
      return this.failure(`${error.code}: ${error.message}`)
    }
    if (result === null) {
      return this.failure("cargo metadata produced no result")
    }
    if (result.exitCode !== 0) {
      return this.failure(
        `cargo metadata failed with exit code ${result.exitCode}: ${this.tail(result)}`,
      )
    }

    const [metadata, parseError] = attempt(() => JSON.parse(result.stdout) as unknown)
    if (parseError) {
      return this.failure(`cargo metadata returned invalid JSON: ${parseError}`)
    }

    const packages = this.readPackages(metadata)
    if (packages === null) {
      return this.failure("cargo metadata returned an unexpected shape")
    }
    if (packages.length === 0) {
      return {
        elements: [],
        findings: [
          {
            level: "warning",
            code: "MAP-RUST-NO-PACKAGES",
            message: "cargo metadata reported no workspace packages",
          },
        ],
        externalDependencies: [],
      }
    }

    return this.build(systemId, packages)
  }

  private readPackages(metadata: unknown): CargoPackage[] | null {
    if (!this.isRecord(metadata)) return null

    const workspaceMembers = Array.isArray(metadata.workspace_members)
      ? new Set(
          metadata.workspace_members.filter(
            (member): member is string => typeof member === "string",
          ),
        )
      : null
    if (!Array.isArray(metadata.packages)) return null

    const packages: CargoPackage[] = []
    for (const value of metadata.packages) {
      if (!this.isRecord(value)) continue
      if (typeof value.name !== "string" || value.name.trim() === "") continue
      if (typeof value.manifest_path !== "string" || value.manifest_path.trim() === "") continue
      if (workspaceMembers !== null) {
        if (typeof value.id !== "string" || !workspaceMembers.has(value.id)) continue
      }

      const dependencies: CargoDependency[] = []
      if (Array.isArray(value.dependencies)) {
        for (const dependencyValue of value.dependencies) {
          if (!this.isRecord(dependencyValue)) continue
          if (typeof dependencyValue.name !== "string" || dependencyValue.name.trim() === "") continue
          dependencies.push({
            name:
              typeof dependencyValue.rename === "string" && dependencyValue.rename.trim() !== ""
                ? dependencyValue.rename
                : dependencyValue.name,
            path:
              typeof dependencyValue.path === "string" && dependencyValue.path.trim() !== ""
                ? dependencyValue.path
                : null,
          })
        }
      }

      packages.push({
        name: value.name,
        manifestPath: value.manifest_path,
        dependencies: dependencies.sort((left, right) => left.name.localeCompare(right.name)),
      })
    }

    return packages.sort((left, right) => {
      const pathOrder = left.manifestPath.localeCompare(right.manifestPath)
      return pathOrder === 0 ? left.name.localeCompare(right.name) : pathOrder
    })
  }

  private build(systemId: string, packages: CargoPackage[]): DiscoveryContribution {
    const used = new Set<string>([systemId])
    const elements: DraftElement[] = []
    const byName = new Map<string, DraftElement>()
    const byDirectory = new Map<string, DraftElement>()
    const externalDependencies = new Set<string>()

    for (const cargoPackage of packages) {
      const element: DraftElement = {
        id: uniqueElementId("CMP", cargoPackage.name, used),
        kind: "component",
        title: cargoPackage.name,
        status: "draft",
        provenance: `code:cargo metadata#${cargoPackage.name}`,
        confidence: "observed",
        links: [
          {
            type: "part_of",
            to: systemId,
            confidence: "observed",
            provenance: `code:cargo metadata#${cargoPackage.name}`,
          },
        ],
      }
      elements.push(element)
      byName.set(slugify(cargoPackage.name), element)
      byDirectory.set(resolve(dirname(cargoPackage.manifestPath)), element)
    }

    for (const cargoPackage of packages) {
      const element = byDirectory.get(resolve(dirname(cargoPackage.manifestPath)))
      if (element === undefined) continue

      for (const dependency of cargoPackage.dependencies) {
        const local =
          (dependency.path === null ? undefined : byDirectory.get(this.resolveDependency(cargoPackage, dependency))) ??
          byName.get(slugify(dependency.name))
        if (local !== undefined && local.id !== element.id) {
          this.addLink(element, {
            type: "depends_on",
            to: local.id,
            confidence: "observed",
            provenance: `code:cargo metadata#${cargoPackage.name}`,
          })
          continue
        }
        if (local === undefined) {
          externalDependencies.add(`${element.id} -> ${dependency.name}`)
        }
      }
    }

    return {
      elements: elements.sort((left, right) => left.id.localeCompare(right.id)),
      findings: [],
      externalDependencies: [...externalDependencies].sort(),
    }
  }

  private resolveDependency(packageValue: CargoPackage, dependency: CargoDependency): string {
    if (dependency.path === null) return ""

    const base = dirname(packageValue.manifestPath)
    return resolve(base, dependency.path)
  }

  private addLink(element: DraftElement, link: DraftElement["links"][number]): void {
    const exists = element.links.some(
      (candidate) => candidate.type === link.type && candidate.to === link.to,
    )
    if (!exists) element.links.push(link)
  }

  private failure(message: string): DiscoveryContribution {
    const findings: DiscoveryFinding[] = [
      {
        level: "warning",
        code: "MAP-RUST-METADATA",
        message: `Rust discovery skipped: ${message}`,
      },
    ]

    return { elements: [], findings, externalDependencies: [] }
  }

  private tail(result: { stdout: string; stderr: string }): string {
    const text = `${result.stdout}\n${result.stderr}`.trim()
    return text === "" ? "no output" : text.slice(-500).trim()
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
