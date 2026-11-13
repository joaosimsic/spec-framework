import { readdir } from "node:fs/promises"
import { basename, isAbsolute, join, relative } from "node:path"
import { attempt, attemptAsync, type Result, ok, fail } from "../core/result"
import { shouldIgnoreDirectory } from "./fs"
import { slugify, uniqueElementId } from "./ids"
import type {
  Confidence,
  DiscoveryContribution,
  DiscoveryFinding,
  DraftElement,
  DraftLink,
} from "./types"

const MANIFEST_ORDER = ["package.json", "Cargo.toml", "composer.json", "pyproject.toml", "go.mod"]

const MANIFESTS = new Set(MANIFEST_ORDER)

const DATA_STORE_PACKAGES = new Set([
  "asyncpg",
  "better-sqlite3",
  "diesel",
  "drizzle-orm",
  "ioredis",
  "knex",
  "mongodb",
  "mongoose",
  "mysql",
  "mysql2",
  "pg",
  "postgres",
  "postgresql",
  "prisma",
  "psycopg",
  "psycopg2",
  "redis",
  "redb",
  "rocksdb",
  "rusqlite",
  "sequelize",
  "sled",
  "sqlalchemy",
  "sqlite",
  "sqlite3",
  "sqlx",
  "typeorm",
])

interface ManifestRead {
  name: string | null
  dependencies: string[]
}

interface PackageBoundary {
  directory: string
  relativeDirectory: string
  name: string
  hasName: boolean
  primaryManifest: string
  dependencies: Array<{ name: string; manifest: string }>
  elementId: string | null
}

interface BoundaryCollection {
  boundaries: PackageBoundary[]
  findings: DiscoveryFinding[]
}

export class GenericDiscovery {
  async discover(target: string, systemId: string): Promise<DiscoveryContribution> {
    const collection = await this.collectBoundaries(target)
    if (collection.boundaries.length === 0) {
      return this.discoverDirectories(target, systemId, collection.findings)
    }

    const nonRootBoundaries = collection.boundaries.filter(
      (boundary) => boundary.directory !== target,
    )
    const hasSourceRoots = await this.hasSourceRoots(target)
    const visibleBoundaries =
      nonRootBoundaries.length > 0 ? nonRootBoundaries : hasSourceRoots ? [] : collection.boundaries

    if (visibleBoundaries.length === 0) {
      if (hasSourceRoots)
        return { elements: [], findings: collection.findings, externalDependencies: [] }

      return this.discoverDirectories(target, systemId, collection.findings)
    }

    return this.buildFromBoundaries(systemId, visibleBoundaries, collection.findings)
  }

  private async hasSourceRoots(target: string): Promise<boolean> {
    const entries = await readdir(target, { withFileTypes: true }).catch(() => [])

    return entries.some((entry) => entry.isDirectory() && ["src", "plugin"].includes(entry.name))
  }

  private async collectBoundaries(target: string): Promise<BoundaryCollection> {
    const findings: DiscoveryFinding[] = []
    const directories: Array<{ directory: string; manifests: string[] }> = []
    const pending: Array<{ directory: string; depth: number }> = [{ directory: target, depth: 0 }]

    for (let index = 0; index < pending.length; index++) {
      const current = pending[index]
      if (current === undefined) continue

      const entries = (
        await readdir(current.directory, { withFileTypes: true }).catch(() => [])
      ).sort((left, right) => left.name.localeCompare(right.name))

      const manifests = entries
        .filter((entry) => entry.isFile() && MANIFESTS.has(entry.name))
        .map((entry) => join(current.directory, entry.name))
      if (manifests.length > 0) directories.push({ directory: current.directory, manifests })

      if (current.depth >= 6) continue

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (shouldIgnoreDirectory(entry.name)) continue
        pending.push({ directory: join(current.directory, entry.name), depth: current.depth + 1 })
      }
    }

    const boundaries: PackageBoundary[] = []
    for (const directory of directories) {
      const boundary = await this.readBoundary(target, directory.directory, directory.manifests)
      if (boundary === null) {
        findings.push({
          level: "warning",
          code: "MAP-MANIFEST-UNREADABLE",
          message: `could not read package metadata in ${relative(target, directory.directory) || "."}`,
        })
        continue
      }
      boundaries.push(boundary)
    }

    boundaries.sort((left, right) => left.relativeDirectory.localeCompare(right.relativeDirectory))

    return { boundaries, findings }
  }

  private async readBoundary(
    target: string,
    directory: string,
    manifests: string[],
  ): Promise<PackageBoundary | null> {
    const reads = new Map<string, ManifestRead>()
    for (const manifest of manifests) {
      const [read, error] = await this.readManifest(manifest)
      if (error === null && read !== null) reads.set(basename(manifest), read)
    }

    const orderedReads = MANIFEST_ORDER.map((name) => ({ name, read: reads.get(name) }))
    const named = orderedReads.find((entry) => entry.read?.name)
    const primaryManifest =
      named?.name ??
      orderedReads.find((entry) => entry.read !== undefined)?.name ??
      basename(directory)
    const dependencies: Array<{ name: string; manifest: string }> = []

    for (const entry of orderedReads) {
      if (entry.read === undefined) continue
      for (const dependency of [...entry.read.dependencies].sort()) {
        dependencies.push({ name: dependency, manifest: entry.name })
      }
    }

    return {
      directory,
      relativeDirectory: relative(target, directory) || ".",
      name: named?.read?.name ?? basename(directory),
      hasName: named?.read?.name !== undefined && named?.read?.name !== null,
      primaryManifest,
      dependencies,
      elementId: null,
    }
  }

  private async readManifest(manifestPath: string): Promise<Result<ManifestRead, string>> {
    const [text, readError] = await attemptAsync(() => Bun.file(manifestPath).text())
    if (readError) return fail(readError)
    if (text === null) return fail("manifest is unreadable")

    const fileName = basename(manifestPath)
    if (fileName === "package.json" || fileName === "composer.json") {
      return this.readJsonManifest(fileName, text)
    }
    if (fileName === "Cargo.toml" || fileName === "pyproject.toml") {
      return this.readTomlManifest(fileName, text)
    }
    if (fileName === "go.mod") {
      return ok(this.readGoManifest(text))
    }

    return ok({ name: null, dependencies: [] })
  }

  private readJsonManifest(fileName: string, text: string): Result<ManifestRead, string> {
    const [value, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError) return fail(parseError)
    if (!this.isRecord(value)) return fail("manifest must be an object")

    const name = typeof value.name === "string" && value.name.trim() !== "" ? value.name : null
    if (fileName === "composer.json") {
      return ok({ name, dependencies: this.recordKeys(value.require) })
    }

    const dependencies = new Set<string>()
    for (const group of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      for (const dependency of this.recordKeys(value[group])) dependencies.add(dependency)
    }

    return ok({ name, dependencies: [...dependencies].sort() })
  }

  private readTomlManifest(fileName: string, text: string): Result<ManifestRead, string> {
    const [value, parseError] = attempt(() => Bun.TOML.parse(text) as unknown)
    if (parseError) return fail(parseError)
    if (!this.isRecord(value)) return fail("manifest must be an object")

    if (fileName === "Cargo.toml") {
      const packageValue = value.package
      const name =
        this.isRecord(packageValue) &&
        typeof packageValue.name === "string" &&
        packageValue.name.trim() !== ""
          ? packageValue.name
          : null

      return ok({ name, dependencies: this.recordKeys(value.dependencies) })
    }

    const project = value.project
    const projectName =
      this.isRecord(project) && typeof project.name === "string" && project.name.trim() !== ""
        ? project.name
        : null
    const poetry = value.tool
    const poetryProject =
      this.isRecord(poetry) && this.isRecord(poetry.poetry) ? poetry.poetry : null
    const poetryName =
      poetryProject !== null &&
      typeof poetryProject.name === "string" &&
      poetryProject.name.trim() !== ""
        ? poetryProject.name
        : null

    const dependencies = new Set<string>()
    if (this.isRecord(project) && Array.isArray(project.dependencies)) {
      for (const dependency of project.dependencies) {
        if (typeof dependency !== "string") continue
        const match = dependency.match(/^([A-Za-z0-9_.-]+)/)
        if (match?.[1]) dependencies.add(match[1])
      }
    }
    if (poetryProject !== null) {
      for (const dependency of this.recordKeys(poetryProject.dependencies)) {
        dependencies.add(dependency)
      }
    }

    return ok({ name: projectName ?? poetryName, dependencies: [...dependencies].sort() })
  }

  private readGoManifest(text: string): ManifestRead {
    let name: string | null = null
    let inRequireBlock = false
    const dependencies = new Set<string>()

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.split("//")[0]?.trim() ?? ""
      if (line === "") continue

      if (line.startsWith("module ")) {
        name = line.slice("module ".length).trim()
        continue
      }
      if (line === "require (") {
        inRequireBlock = true
        continue
      }
      if (inRequireBlock && line === ")") {
        inRequireBlock = false
        continue
      }
      if (inRequireBlock) {
        const dependency = line.split(/\s+/)[0]
        if (dependency) dependencies.add(dependency)
        continue
      }
      if (line.startsWith("require ")) {
        const dependency = line.slice("require ".length).trim().split(/\s+/)[0]
        if (dependency) dependencies.add(dependency)
      }
    }

    return { name, dependencies: [...dependencies].sort() }
  }

  private buildFromBoundaries(
    systemId: string,
    boundaries: PackageBoundary[],
    findings: DiscoveryFinding[],
  ): DiscoveryContribution {
    const used = new Set<string>([systemId])
    const elements = new Map<string, DraftElement>()
    const localByPackage = new Map<string, DraftElement>()

    for (const boundary of [...boundaries].sort((left, right) =>
      left.relativeDirectory.localeCompare(right.relativeDirectory),
    )) {
      const id = uniqueElementId(
        "CMP",
        boundary.relativeDirectory === "." ? boundary.name : boundary.relativeDirectory,
        used,
      )
      const confidence: Confidence = boundary.hasName ? "observed" : "ambiguous"
      const element: DraftElement = {
        id,
        kind: "component",
        title: boundary.name,
        status: "draft",
        provenance: `code:${boundary.primaryManifest}`,
        confidence,
        links: [],
      }
      boundary.elementId = id
      elements.set(id, element)
      localByPackage.set(slugify(boundary.name), element)
    }

    for (const boundary of boundaries) {
      if (boundary.elementId === null) continue
      const element = elements.get(boundary.elementId)
      if (element === undefined) continue

      const parent = boundaries
        .filter(
          (candidate) =>
            candidate.elementId !== null &&
            candidate !== boundary &&
            this.isAncestor(candidate.directory, boundary.directory),
        )
        .sort((left, right) => right.directory.length - left.directory.length)[0]

      this.addLink(element, {
        type: "part_of",
        to: parent?.elementId ?? systemId,
        confidence: element.confidence,
        provenance: element.provenance,
      })
    }

    const dataStores = new Map<string, DraftElement>()
    const externalDependencies = new Set<string>()

    for (const boundary of boundaries) {
      if (boundary.elementId === null) continue
      const element = elements.get(boundary.elementId)
      if (element === undefined) continue

      for (const dependency of boundary.dependencies) {
        const normalized = slugify(dependency.name)
        const local = localByPackage.get(normalized)
        const provenance = `code:${dependency.manifest}#dependencies`

        if (local !== undefined && local.id !== element.id) {
          this.addLink(element, {
            type: "depends_on",
            to: local.id,
            confidence: "observed",
            provenance,
          })
          continue
        }
        if (local !== undefined) continue

        if (this.isDataStore(normalized)) {
          let dataStore = dataStores.get(normalized)
          if (dataStore === undefined) {
            dataStore = {
              id: uniqueElementId("DAT", dependency.name, used),
              kind: "data_store",
              title: dependency.name,
              status: "draft",
              provenance,
              confidence: "inferred",
              links: [],
            }
            dataStores.set(normalized, dataStore)
            elements.set(dataStore.id, dataStore)
          }
          this.addLink(element, {
            type: "depends_on",
            to: dataStore.id,
            confidence: "inferred",
            provenance,
          })
          continue
        }

        externalDependencies.add(`${element.id} -> ${dependency.name}`)
      }
    }

    return {
      elements: this.sortElements([...elements.values()]),
      findings,
      externalDependencies: [...externalDependencies].sort(),
    }
  }

  private async discoverDirectories(
    target: string,
    systemId: string,
    findings: DiscoveryFinding[],
  ): Promise<DiscoveryContribution> {
    const entries = (await readdir(target, { withFileTypes: true }).catch(() => []))
      .filter((entry) => entry.isDirectory() && !shouldIgnoreDirectory(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name))

    const used = new Set<string>([systemId])
    const elements = entries.map((entry) => {
      const element: DraftElement = {
        id: uniqueElementId("CMP", entry.name, used),
        kind: "component",
        title: entry.name,
        status: "draft",
        provenance: `code:${entry.name}`,
        confidence: "ambiguous",
        links: [
          {
            type: "part_of",
            to: systemId,
            confidence: "ambiguous",
            provenance: `code:${entry.name}`,
          },
        ],
      }

      return element
    })

    return {
      elements: this.sortElements(elements),
      findings: [
        ...findings,
        {
          level: "info",
          code: "MAP-NO-MANIFESTS",
          message:
            entries.length === 0
              ? "no package manifests or directories found"
              : "no package manifests found; mapped top-level directories with ambiguous confidence",
        },
      ],
      externalDependencies: [],
    }
  }

  private addLink(element: DraftElement, link: DraftLink): void {
    const exists = element.links.some(
      (candidate) => candidate.type === link.type && candidate.to === link.to,
    )
    if (!exists) element.links.push(link)
  }

  private sortElements(elements: DraftElement[]): DraftElement[] {
    return elements
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((element) => ({
        ...element,
        links: [...element.links].sort((left, right) => {
          const typeOrder = left.type.localeCompare(right.type)
          return typeOrder === 0 ? left.to.localeCompare(right.to) : typeOrder
        }),
      }))
  }

  private isAncestor(parent: string, child: string): boolean {
    const path = relative(parent, child)
    return path !== "" && !path.startsWith("..") && !isAbsolute(path)
  }

  private isDataStore(normalized: string): boolean {
    if (DATA_STORE_PACKAGES.has(normalized)) return true

    return normalized.split("-").some((token) => DATA_STORE_PACKAGES.has(token))
  }

  private recordKeys(value: unknown): string[] {
    if (!this.isRecord(value)) return []
    return Object.keys(value).sort()
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
