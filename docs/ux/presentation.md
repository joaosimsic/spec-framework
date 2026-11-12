# Presentation and internal identity

> Status: partially implemented. `spec query` default output uses titles,
> plain-language state, blockers, and open questions without internal ID
> prefixes. `--view experience --json` emits the display model with opaque refs
> and contextual name resolution; `--technical` reveals identity. Terminal
> mapping curation resolves visible names for areas and relations and hides
> identity by default. `spec approve --scope` resolves visible requirement
> titles to identity and expands acceptance criteria. The workbench uses the
> same projection and keeps identity in its technical-details view; chat views
> remain design.

## Purpose

The framework needs stable internal identifiers for traceability, hashing, and
approval. Those identifiers are not a user interface. A person deciding an
architecture should work with names, questions, and outcomes, not with `REQ-*`,
`AC-*`, `CAP-*`, `DEC-*`, or `UNK-*` codes.

This document separates the identity layer from the presentation layer.
Decision record [0011](../design-decisions/0011-interactive-use-case-modes.md)
records the choice.

## Two layers

| Layer      | Contents                                                                   | Audience                |
| ---------- | -------------------------------------------------------------------------- | ----------------------- |
| Identity   | Stable IDs, status values, provenance, confidence, hashes, diagnostics     | Tools, audit, scripting |
| Experience | Titles, summaries, grouped relations, plain-language state, open questions | Humans and chat agents  |

The identity layer remains the source of truth. The experience layer is a
deterministic projection over the validated graph, not a second model.

## Internal identity

Internal identity includes:

- element IDs such as `REQ-AUTH-001`, `CAP-SESSION-MANAGEMENT`, `UNK-AUTH-003`;
- status values such as `draft`, `proposed`, `approved`, `deprecated`;
- confidence values such as `observed`, `inferred`, `ambiguous`, `unknown`;
- diagnostic codes such as `SDOC-BAD-EARS`;
- proposal, evidence, and content hash identifiers.

These values stay in sources, `spec/spec.lock`, manifests, and the audit bundle.
They are never removed or renamed to make the interface friendlier.

## Hidden machinery

The experience layer also hides mechanics that are not identities:

- source file layout and formats;
- adapter, compiler, and tool names;
- proposal branch names and proposal identifiers;
- command syntax and flags;
- lockfile, manifest, and evidence file paths;
- internal state transitions and check identifiers;
- graph traversal details and context-pack assembly.

Default surfaces expose the consequence and the available action: “This
requirement has no acceptance criterion yet”, “Confirm this inferred component”,
“Approve this feature slice”. The CLI remains a technical surface for power
users and automation; chat, workbench, and approval flows translate intent into
the required machinery.

## Experience rules

1. **Names first.** The primary label is the element title or a human phrase,
   not the ID.
2. **Plain language for state.** Show “Waiting for your approval”, “Needs a
   decision”, “Verified by a model check”, not `proposed`, `UNK`, or `VER`.
3. **No codes by default.** Normal CLI, workbench, and chat output does not show
   internal ID prefixes or diagnostic codes.
4. **Progressive disclosure.** A “Technical details” surface reveals IDs,
   hashes, provenance, confidence, and diagnostic codes on demand.
5. **No ID required for action.** A human can rename, merge, split, approve, or
   reject by selecting a visible name. The tool resolves the identity.
6. **Contextual disambiguation.** When two items share a name, show the
   surrounding system, owner, or summary. Never ask the human to choose between
   suffixes.
7. **Translated errors.** Show the human consequence first and the technical
   code behind details. “This requirement is not in a supported sentence form”
   comes before `SDOC-BAD-EARS`.
8. **Audit exception.** The audit bundle always keeps full IDs and hashes. The
   bundle is the record of identity, not the daily experience.
9. **Chat must not leak.** Agent instructions forbid printing internal codes
   unless the human explicitly asks for technical details.
10. **Accessibility by name.** Labels, focus order, and status announcements use
    the human-facing name, not the internal ID.

## Display model

The experience layer consumes a `DisplayModel` derived from the validated
graph. Each entry provides:

| Field           | Purpose                                                          |
| --------------- | ---------------------------------------------------------------- |
| `ref`           | Opaque handle used by UI and tools                               |
| `label`         | Human title or short phrase                                      |
| `summary`       | One or two sentences of context                                  |
| `kindLabel`     | “Requirement”, “Component”, “Decision”, “Open question”, “Check” |
| `state`         | Plain-language state, with technical status in details           |
| `relationships` | Named relations grouped by meaning                               |
| `openQuestions` | Named questions that still need a human answer                   |
| `blockers`      | What currently prevents approval or implementation               |
| `technical`     | ID, status, confidence, provenance, hashes, diagnostics          |

`ref` handles are scoped to a graph version and a session. They are not stable
IDs and are never written into sources or audit artifacts. Tools accept a `ref`,
a visible name, or a technical ID. Names must resolve unambiguously; otherwise
the tool asks for a choice.

## Examples

| Avoid                                   | Prefer                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `REQ-AUTH-001 approved`                 | “Expired session tokens are rejected” is approved                        |
| `UNK-AUTH-003 blocking`                 | Open question: “What happens if the token store is down during refresh?” |
| `CAP-SESSION-MANAGEMENT → REQ-AUTH-004` | “Session management” needs “Refresh failure handling”                    |
| `confidence: inferred`                  | “Inferred from code — confirm or correct”                                |
| `SDOC-MISSING-AC`                       | “This requirement has no acceptance criterion yet”                       |
| `Spec approve REQ-AUTH-001 AC-AUTH-001` | Approve “Session expiry” including its acceptance criterion              |

## Surface rules

### CLI and terminal

- Human output by default.
- `--technical` shows identity, hashes, provenance, and diagnostic codes.
- `--json` is the machine contract and includes identity.
- Interactive approval selects named scope; `--id` remains for automation.

### Workbench

- Names, grouped views, and plain-language state by default.
- “Technical details” drawer for identity and hashes.
- No approval endpoint, no `spec.lock` write.
- Technical mode is a view, not a separate model.

### Chat and the opencode plugin

- Tools accept refs and names; results carry a hidden technical payload.
- The agent summarises by name and asks contextual questions.
- The agent never prints internal codes unless the human asks for technical
  details.
- Decisions are recorded as named decisions or open questions, not as codes in
  the conversation.

### Audit bundle

- Full IDs, hashes, provenance, and diagnostic codes remain visible.
- The bundle is reproducible and independent of the experience layer.
- Human-readable sections use names; traceability appendices keep identity.

## Non-goals

- Removing traceability or hashes from the audit record.
- Hiding blockers or open questions to make a view look complete.
- Preventing technical users from inspecting identity.
- Creating a second specification model for presentation.
- Making the experience layer authoritative.

## Acceptance criteria

- Default CLI, workbench, and chat output contains no internal ID prefix or
  diagnostic code.
- “Technical details” reveals the complete identity record.
- A human can complete the scratch, mapping, and refactor flows without typing
  or reading an internal ID.
- Approval is selected by named scope and resolved to identity by the tool.
- The audit bundle keeps full identity and remains reproducible.
- Regression tests check for accidental ID leakage in default output.
