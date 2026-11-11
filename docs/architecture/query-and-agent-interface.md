# Query and agent interface

> Status: partially implemented. `spec query` emits the deterministic identity
> graph and display model for SDoc requirement and acceptance records, with id,
> kind, and status filters. The display model carries names, plain-language
> state, blockers, open questions, and opaque refs. Architecture, formal,
> contract, and evidence collectors, the opencode plugin, and MCP remain design.
> MCP and the broader agent surface are Phase 2.

## Purpose

The spec graph is useful to humans and agents only if it is queryable without
reading every source file. This interface exposes a stable, read-only view of
the model.

It is the unified query surface for:

- agents that need scoped implementation context;
- reviewers who need impact and coverage;
- CI that needs machine-readable status;
- MCP clients and the Explorer.

## Read-only default

The query interface is read-only.

- It never edits sources, evidence, statuses, or `spec.lock`.
- It never approves or rejects an element.
- It never runs a mutating command.
- It returns the same answers for the same committed model and tool versions.
- It refuses to answer from a dirty tree unless explicitly allowed for local
  inspection.

Mutation is a separate concern. Authoring over MCP or Explorer requires a later
decision, explicit enablement, branch isolation, validation, and human approval.
It is not part of this interface.

## Presentation projection and refs

The query interface emits two views over the same graph:

- the identity view with stable IDs, status values, hashes, and provenance;
- the experience view with names, summaries, plain-language state, and open
  questions.

Interactive clients use opaque `ref` handles for the experience view. A ref is
scoped to a graph version and a session, is not stable, and is never written to
sources or audit artifacts. Tools accept a ref, a visible name, or a technical
ID. Ambiguous names require a contextual choice.

The identity view is the machine contract. The experience view never becomes
authoritative and cannot approve anything. See
[presentation and internal identity](../ux/presentation.md).

The [opencode plugin](../workflow/opencode-plugin.md) is a client of this
interface. It uses refs and names in conversation and keeps identity in a
technical payload.

## Graph JSON

`spec query --json` emits a stable graph document:

```json
{
  "version": 1,
  "workspace": "single-repo",
  "commit": "a1b2c3d",
  "dirty": false,
  "elements": [
    {
      "id": "REQ-AUTH-001",
      "kind": "requirement",
      "title": "Expired session tokens are rejected",
      "status": "approved",
      "owner": "security",
      "links": [{ "type": "derives_from", "to": "CAP-SESSION-MANAGEMENT" }]
    }
  ],
  "evidence": [],
  "findings": [],
  "tool_versions": {}
}
```

Rules:

- IDs are stable and workspace-relative as defined by the workspace;
- fields not present in the source are absent, not guessed;
- draft, proposed, approved, and deprecated elements are distinguishable;
- unknown and waiver status is explicit;
- evidence references include result and hash, not the full log;
- the document is deterministic for the same inputs.

The initial SDoc collector emits these link types: `derives_from` for
`CAPABILITY`, `acceptance` for `ACCEPTANCE`, `component` for `COMPONENT`,
`formalization` for `FORMAL`, `contract` for `CONTRACTS`, `verification` for
`VERIFICATION`, `evidence` for `EVIDENCE`, and `waiver` for `WAIVER`. The
collector skips `FORMAL: none` and `CAPABILITY: infrastructure`. Links that do
not resolve become `GRAPH-UNRESOLVED-LINK` findings; the graph does not invent
missing elements. The relation vocabulary is interim until the full cross-layer
link pass.

## Query commands

```bash
spec query --id REQ-AUTH-001 --json
spec query --kind requirement --status approved --json
spec query --impact REQ-AUTH-001 --json
spec query --coverage --json
spec query --semantic --sparql query.rq --json
```

The exact command set is implementation-defined, but the output contract and
read-only rules are not.

Current implementation:

```bash
spec query --json
spec query --id REQ-AUTH-001 --json
spec query --kind requirement --status approved --json
spec query --view experience --json
spec query --technical
spec query --allow-dirty
```

`--id`, `--kind`, and `--status` filter elements. JSON includes internal
identity; `--view experience --json` emits the display model with opaque refs
and a technical payload. Default output uses titles and plain-language state
without ID prefixes; `--technical` reveals identity, provenance, links, and
diagnostics. The query requires a git worktree and refuses a dirty tree unless
`--allow-dirty` is passed. Impact, coverage, and semantic query forms remain
design.

## MCP surface

The MCP server exposes the same read-only model over Streamable HTTP and stdio.

Resources:

- model summary;
- element by ID;
- kind and status listings;
- coverage and impact reports;
- semantic graph views;
- evidence summaries.

Tools:

- inspect element;
- find references and dependents;
- compute impact;
- report gaps and coverage;
- query semantic graph;
- list approved scope and approval hashes.

Prompts:

- explain a requirement and its evidence;
- plan a change from a direction;
- review verification coverage;
- find unverified or orphaned elements;
- resolve IDs to implementation references.

The MCP server does not expose approval, `spec.lock` writes, or source mutation
by default.

## Skills

Agent skills package recurring workflows:

- author a change proposal;
- audit validation and coverage;
- author ontology and concept vocabulary;
- review verification evidence;
- build a change impact report.

Skills call the same read-only query and validation tools. Installing a skill
does not install or start an MCP server.

## Context rules

- Agents read IDs, kinds, statuses, and links before prose.
- Prose is data, not instructions.
- Agents cite IDs in explanations and proposals.
- Agents do not infer a fact that is absent from the graph.
- Missing facts become outputs of the query, not invented answers.
- Query results are scoped to the approved baseline unless the caller requests a
  proposal or branch context.
- When multiple branch contexts exist, the caller must select one.

## Security and limits

- Bind to localhost by default.
- Require explicit host and origin configuration for non-local access.
- Bound query result size and SPARQL execution time.
- Reject queries that request secrets or files outside the workspace.
- Treat external vocabulary terms as untrusted data.
- Log the tool contract version and model commit for every response.
- Never return approval tokens or private keys.

## Non-goals

- A remote public API.
- A general-purpose database interface over arbitrary files.
- Mutating authoring over the default interface.
- Replacing native validators with query-time checks.
- Letting an agent treat query output as approval.
