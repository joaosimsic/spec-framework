# Presentation and internal identity

## Purpose

Generated identity is for traceability and evidence. Humans need labels,
confidence, source context, and unknowns.

## Two layers

| Layer      | Contents                                                       | Audience        |
| ---------- | -------------------------------------------------------------- | --------------- |
| Identity   | Generated IDs, provenance, confidence, hashes, diagnostics     | Tools and audit |
| Experience | Labels, paths, confidence phrases, relations, source locations | Humans          |

Identity remains the machine contract. Presentation is a deterministic
projection over generated output.

## Internal identity

Generated identity includes:

- element IDs such as `SYS-*`, `SUB-*`, `CMP-*`, `FILE-*`, `SYM-*`, `REQ-*`,
  `CON-*`, `VER-*`, `FIND-*`, and `EVD-*`;
- confidence values: observed, inferred, ambiguous, unknown;
- diagnostic codes such as `ARC-001`;
- snapshot, input, and output hashes.

These values remain in generated JSON, the snapshot database, and the audit
bundle.

## Display rules

1. Labels first.
2. Plain-language confidence: “Observed in source”, “Inferred — inspect”,
   “Ambiguous — multiple targets”, “Unknown”.
3. No internal ID prefixes by default.
4. Technical details reveal IDs, provenance, hashes, and diagnostics.
5. Generated output is never labeled approved.
6. Source paths and line numbers are always available.
7. Unknowns and limits are visible.
8. Accessibility uses human labels and stable focus order.

## Workbench

- System, Flows, Findings, Evolution, and generated documents.
- Technical details are on demand.
- No approval, proposal, or mapping curation controls.
- Finding annotations are local review metadata.

## Agent surfaces

- Query returns labels and confidence by default.
- `--json` returns generated identity.
- Agents cite generated IDs only when technical detail is requested.
- Agents never claim approval or verification beyond evidence.

## Audit exception

The audit bundle keeps full identity, hashes, provenance, and diagnostics. The
bundle is the technical record, not the default human interface.

## Acceptance criteria

- Default workbench and chat output contains no internal ID prefix or diagnostic
  code.
- Technical details reveal the complete generated identity record.
- Source locations are available for every generated element.
- No presentation surface claims approval.
- The audit bundle remains reproducible and complete.
