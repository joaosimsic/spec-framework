import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ProposalGit } from "../src/change/change"
import type { Proposal } from "../src/change/types"
import { ok, type Result } from "../src/core/result"
import type { GitProposalState } from "../src/change/types"
import { runMapReview, type MapReviewReport } from "../src/core/map-review"
import type { MappingSnapshot } from "../src/discovery/curation-types"

const config = {
  version: 1,
  profile: "full",
  project: { name: "sample", adoption: "existing" },
  adapters: {},
  approval: { mode: "human", humanOnly: true },
}

class FakeProposalGit implements ProposalGit {
  readonly branches: string[] = []

  constructor(
    public state: GitProposalState = { branch: "main", commit: "base123", clean: true },
  ) {}

  async readState(target: string): Promise<Result<GitProposalState, string>> {
    void target
    return ok(this.state)
  }

  async branchExists(target: string, branch: string): Promise<Result<boolean, string>> {
    void target
    void branch
    return ok(false)
  }

  async createBranch(
    target: string,
    branch: string,
    baseCommit: string,
  ): Promise<Result<string, string>> {
    void target
    void baseCommit
    this.branches.push(branch)
    return ok(branch)
  }

  async resolveAuthor(target: string): Promise<Result<string, string>> {
    void target
    return ok("tester")
  }
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "map-curation-"))
  await mkdir(join(target, "spec"), { recursive: true })
  await writeFile(join(target, "spec", "config.json"), `${JSON.stringify(config, null, 2)}\n`)
  await writeFile(join(target, "package.json"), `${JSON.stringify({ name: "app" })}\n`)

  return target
}

function fixedNow(): Date {
  return new Date("2026-11-11T12:00:00.000Z")
}

async function openReview(target: string): Promise<FakeProposalGit> {
  const git = new FakeProposalGit()
  const run = await runMapReview(target, {
    author: "tester",
    gitRepository: git,
    now: fixedNow,
  })
  expect(run.code).toBe(0)
  git.state = { branch: "spec/review-sample-mapping", commit: "base123", clean: false }

  return git
}

async function readSnapshot(target: string): Promise<MappingSnapshot> {
  const text = await readFile(
    join(target, "spec", "proposals", "review-sample-mapping.mapping.json"),
    "utf8",
  )
  return JSON.parse(text) as MappingSnapshot
}

async function readProposal(target: string): Promise<Proposal> {
  const text = await readFile(
    join(target, "spec", "proposals", "review-sample-mapping.json"),
    "utf8",
  )
  return JSON.parse(text) as Proposal
}

describe("mapping curation", () => {
  test("applies named curation actions and resumes from the snapshot", async () => {
    const target = await createTarget()
    try {
      await mkdir(join(target, "spec", "architecture"), { recursive: true })
      await writeFile(join(target, "spec", "architecture", "model.c4"), "manual model")
      const git = await openReview(target)

      const first = await runMapReview(target, {
        actions: [
          { kind: "accept", target: "app" },
          { kind: "rename", target: "app", title: "Application" },
          { kind: "set-owner", target: "Application", owner: "platform" },
          {
            kind: "set-responsibility",
            target: "Application",
            responsibility: "Serves the product.",
          },
          {
            kind: "set-boundary",
            target: "Application",
            boundary: "In: runtime. Out: deployment.",
          },
          {
            kind: "open-question",
            target: "Application",
            question: "Who owns rollout?",
            blocking: true,
          },
        ],
        author: "tester",
        gitRepository: git,
        now: fixedNow,
      })

      expect(first.code).toBe(0)
      expect(first.output).toContain("curation:")
      expect(first.output).toContain("open questions:")
      expect(first.output).toContain("Who owns rollout?")
      expect(first.output).not.toMatch(/(?:REQ|AC|CMP|CAP|VOBJ|VER|PROP|CON|EVD|UNK|WVR|DEC|SYS)-/)

      const report = JSON.parse(
        (
          await runMapReview(target, {
            json: true,
            author: "tester",
            gitRepository: git,
            now: fixedNow,
          })
        ).output,
      ) as MapReviewReport

      expect(report.version).toBe(2)
      expect(report.review.state).toBe("curation in progress")
      expect(report.review.queue.some((item) => item.technical.id === "CMP-APP")).toBe(false)
      expect(report.curation.summary.accepted).toBe(1)
      expect(report.curation.summary.questions).toBe(1)
      expect(report.curation.areas).toContainEqual(
        expect.objectContaining({
          id: "CMP-APP",
          title: "Application",
          confidence: "observed",
          owner: "platform",
          responsibility: "Serves the product.",
          boundary: "In: runtime. Out: deployment.",
        }),
      )
      expect(report.curation.draftPath).toBe(join("spec", "generated", "draft.gen.c4"))

      const snapshot = await readSnapshot(target)
      expect(snapshot.decisions).toHaveLength(6)
      expect(await readFile(join(target, "spec", "architecture", "model.c4"), "utf8")).toBe(
        "manual model",
      )
      expect(await Bun.file(join(target, "spec", "spec.lock")).exists()).toBe(false)

      const draft = await readFile(join(target, "spec", "generated", "draft.gen.c4"), "utf8")
      expect(draft).toContain('owner="platform"')
      expect(draft).toContain("human:tester@2026-11-11")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("curates inferred relations without leaking identity", async () => {
    const target = await createTarget()
    try {
      await writeFile(
        join(target, "package.json"),
        `${JSON.stringify({ name: "app", dependencies: { sqlite3: "1" } })}\n`,
      )
      const git = await openReview(target)

      const initial = JSON.parse(
        (
          await runMapReview(target, {
            json: true,
            author: "tester",
            gitRepository: git,
            now: fixedNow,
          })
        ).output,
      ) as MapReviewReport
      const queued = initial.review.relationQueue.find(
        (item) => item.technical.source === "CMP-APP",
      )
      expect(queued).toBeDefined()
      expect(queued?.label).toBe("app -> sqlite3 (depends on)")
      expect(queued?.technical).toEqual(
        expect.objectContaining({
          target: "DAT-SQLITE3",
          type: "depends_on",
          provenance: "code:package.json#dependencies",
        }),
      )

      const accepted = JSON.parse(
        (
          await runMapReview(target, {
            actions: [
              { kind: "accept", target: "app" },
              { kind: "accept", target: "sample" },
              { kind: "accept", target: "sqlite3" },
              {
                kind: "accept-relation",
                source: "app",
                target: "sqlite3",
                type: "depends_on",
              },
            ],
            json: true,
            author: "tester",
            gitRepository: git,
            now: fixedNow,
          })
        ).output,
      ) as MapReviewReport

      expect(accepted.review.state).toBe("curation complete")
      expect(accepted.review.relationQueue).toHaveLength(0)
      expect(accepted.curation.summary.acceptedRelations).toBe(1)
      expect(
        accepted.curation.relations.find(
          (relation) => relation.sourceId === "CMP-APP" && relation.targetId === "DAT-SQLITE3",
        ),
      ).toEqual(
        expect.objectContaining({
          type: "depends_on",
          confidence: "observed",
          provenance: "human:tester@2026-11-11",
        }),
      )

      const rejected = JSON.parse(
        (
          await runMapReview(target, {
            actions: [{ kind: "reject-relation", source: "app", target: "sqlite3" }],
            json: true,
            author: "tester",
            gitRepository: git,
            now: fixedNow,
          })
        ).output,
      ) as MapReviewReport

      expect(rejected.curation.summary.rejectedRelations).toBe(1)
      expect(
        rejected.curation.relations.some(
          (relation) => relation.sourceId === "CMP-APP" && relation.targetId === "DAT-SQLITE3",
        ),
      ).toBe(false)

      const draft = await readFile(join(target, "spec", "generated", "draft.gen.c4"), "utf8")
      expect(draft).not.toContain("'depends_on'")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("marks the review complete when every area is resolved", async () => {
    const target = await createTarget()
    try {
      const git = await openReview(target)
      const run = await runMapReview(target, {
        actions: [
          { kind: "accept", target: "app" },
          { kind: "accept", target: "sample" },
        ],
        author: "tester",
        gitRepository: git,
        now: fixedNow,
        json: true,
      })

      expect(run.code).toBe(0)
      const report = JSON.parse(run.output) as MapReviewReport
      expect(report.review.state).toBe("curation complete")
      expect(report.review.queue).toHaveLength(0)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("merges and splits areas with deterministic curated identities", async () => {
    const target = await createTarget()
    try {
      await writeFile(
        join(target, "package.json"),
        `${JSON.stringify({ name: "app", workspaces: ["packages/*"] })}\n`,
      )
      await mkdir(join(target, "packages", "core"), { recursive: true })
      await writeFile(
        join(target, "packages", "core", "package.json"),
        `${JSON.stringify({ name: "core" })}\n`,
      )
      await mkdir(join(target, "packages", "util"), { recursive: true })
      await writeFile(
        join(target, "packages", "util", "package.json"),
        `${JSON.stringify({ name: "util" })}\n`,
      )
      const git = await openReview(target)

      const merged = await runMapReview(target, {
        actions: [{ kind: "merge", targets: ["core", "util"], title: "runtime" }],
        author: "tester",
        gitRepository: git,
        now: fixedNow,
        json: true,
      })
      expect(merged.code).toBe(0)
      const mergedReport = JSON.parse(merged.output) as MapReviewReport
      expect(mergedReport.curation.areas.some((area) => area.title === "runtime")).toBe(true)
      expect(mergedReport.curation.areas.some((area) => area.title === "core")).toBe(false)
      expect(mergedReport.curation.summary.merged).toBe(1)

      const split = await runMapReview(target, {
        actions: [{ kind: "split", target: "runtime", parts: ["engine", "tools"] }],
        author: "tester",
        gitRepository: git,
        now: fixedNow,
        json: true,
      })
      expect(split.code).toBe(0)
      const splitReport = JSON.parse(split.output) as MapReviewReport
      expect(splitReport.curation.areas.some((area) => area.title === "engine")).toBe(true)
      expect(splitReport.curation.areas.some((area) => area.title === "tools")).toBe(true)
      expect(splitReport.curation.areas.some((area) => area.title === "runtime")).toBe(false)
      expect(splitReport.curation.summary.split).toBe(1)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("fails closed without partial decisions", async () => {
    const target = await createTarget()
    try {
      const git = await openReview(target)
      const before = await readSnapshot(target)

      const run = await runMapReview(target, {
        actions: [
          { kind: "accept", target: "app" },
          { kind: "reject", target: "missing" },
        ],
        author: "tester",
        gitRepository: git,
        now: fixedNow,
      })

      expect(run.code).toBe(1)
      expect(run.output).toContain("unknown area 'missing'")
      expect((await readSnapshot(target)).decisions).toHaveLength(before.decisions.length)
      expect(await Bun.file(join(target, "spec", "generated", "draft.gen.c4")).exists()).toBe(false)

      const relationRun = await runMapReview(target, {
        actions: [{ kind: "accept-relation", source: "app", target: "missing" }],
        author: "tester",
        gitRepository: git,
        now: fixedNow,
      })

      expect(relationRun.code).toBe(1)
      expect(relationRun.output).toContain("unknown area 'missing'")
      expect((await readSnapshot(target)).decisions).toHaveLength(before.decisions.length)
      expect(await Bun.file(join(target, "spec", "generated", "draft.gen.c4")).exists()).toBe(false)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects ambiguous names and non-mapping proposals", async () => {
    const target = await createTarget()
    try {
      await mkdir(join(target, "packages", "first"), { recursive: true })
      await writeFile(
        join(target, "packages", "first", "package.json"),
        `${JSON.stringify({ name: "shared" })}\n`,
      )
      await mkdir(join(target, "packages", "second"), { recursive: true })
      await writeFile(
        join(target, "packages", "second", "package.json"),
        `${JSON.stringify({ name: "shared" })}\n`,
      )
      const git = await openReview(target)

      const ambiguous = await runMapReview(target, {
        actions: [{ kind: "accept", target: "shared" }],
        author: "tester",
        gitRepository: git,
        now: fixedNow,
      })
      expect(ambiguous.code).toBe(1)
      expect(ambiguous.output).toContain("ambiguous")

      const proposal = await readProposal(target)
      await writeFile(
        join(target, "spec", "proposals", "review-sample-mapping.json"),
        `${JSON.stringify({ ...proposal, mode: "refactor" }, null, 2)}\n`,
      )
      const wrongMode = await runMapReview(target, {
        author: "tester",
        gitRepository: git,
        now: fixedNow,
      })
      expect(wrongMode.code).toBe(1)
      expect(wrongMode.output).toContain("not a mapping review")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
