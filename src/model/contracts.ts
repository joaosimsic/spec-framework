import { basename, join, relative } from "node:path"
import { readdir } from "node:fs/promises"
import { attempt, attemptAsync } from "../core/result"
import type { GraphContribution, GraphElement, GraphFinding } from "./types"

export interface ContractSourceRecord {
  path: string
  fields: Record<string, unknown>
}

export interface ContractSources {
  records: ContractSourceRecord[]
  findings: GraphFinding[]
}

export async function loadContractSources(target: string): Promise<ContractSources> {
  const files = await collectContractFiles(join(target, "spec", "contracts"))
  return loadContractFiles(target, files)
}

export class ContractsGraphSource {
  collect(sources: ContractSources, knownIds: ReadonlySet<string> = new Set()): GraphContribution {
    const byId = new Map<string, GraphElement>()
    const findings: GraphFinding[] = [...sources.findings]

    for (const record of sources.records) {
      const id = readString(record.fields["id"])
      if (id === null) {
        findings.push({
          level: "warning",
          code: "CONTRACT-SOURCE-ID",
          message: `${record.path} has no contract id`,
        })
        continue
      }
      if (knownIds.has(id)) continue
      if (byId.has(id)) {
        findings.push({
          level: "warning",
          code: "CONTRACT-DUPLICATE-ID",
          message: `duplicate contract '${id}'`,
          id,
        })
        continue
      }

      const owner = readString(record.fields["owner"])
      byId.set(id, {
        id,
        kind: "contract",
        title: contractTitle(record),
        ...(owner === null ? {} : { owner }),
        provenance: `doc:${record.path.replaceAll("\\", "/")}#${id}`,
        links: [],
      })
    }

    return {
      elements: [...byId.values()].sort((left, right) => left.id.localeCompare(right.id)),
      findings,
    }
  }
}

export async function collectContractFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const files: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectContractFiles(path)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".contract.json")) files.push(path)
  }

  return files.sort()
}

async function loadContractFiles(target: string, files: string[]): Promise<ContractSources> {
  const records: ContractSourceRecord[] = []
  const findings: GraphFinding[] = []

  for (const file of files) {
    const [text, readError] = await attemptAsync(() => Bun.file(file).text())
    if (readError !== null || text === null) {
      findings.push({
        level: "warning",
        code: "CONTRACT-SOURCE-READ",
        message: `cannot read contract source ${basename(file)}: ${readError ?? "unknown error"}`,
      })
      continue
    }

    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null || !isRecord(parsed)) {
      findings.push({
        level: "warning",
        code: "CONTRACT-SOURCE-JSON",
        message: `invalid contract source ${relative(target, file)}: ${parseError ?? "expected an object"}`,
      })
      continue
    }

    records.push({ path: relative(target, file), fields: parsed })
  }

  return { records, findings }
}

function contractTitle(record: ContractSourceRecord): string {
  const explicit = readString(record.fields["title"])
  if (explicit !== null) return explicit

  const name = record.path.split("/").pop() ?? record.path
  const stem = name.slice(0, -".contract.json".length)
  const words = stem.replace(/[^A-Za-z0-9]+/g, " ").trim()

  return words === "" ? stem : words.charAt(0).toUpperCase() + words.slice(1)
}

function readString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null
  return value.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
