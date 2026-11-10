# 0003 — StrictDoc for requirements and audit

**Status:** accepted
**Date:** 2026-11-10

## Context

The requirements layer must be readable, text-based, traceable, diffable, and exportable as an audit-grade PDF/HTML package. It must support custom fields for provenance, formalization, evidence, and approval.

## Decision

Use StrictDoc as the requirements and audit backbone.

## Consequences

- Requirements use SDoc or StrictDoc Markdown.
- Traceability, coverage, diff, and HTML/PDF export come from StrictDoc.
- Custom fields link to LikeC4, Quint, contracts, and evidence.
- The framework adds cross-layer checks that StrictDoc does not provide.
- StrictDoc provisioning is required for the full-stack profile.

## Alternatives

- **Doorstop:** simpler YAML and built-in review fingerprints, but weaker audit documents.
- **OpenFastTrace:** excellent requirement-to-code tracing, but not a full audit document tool.
- **Sphinx-Needs:** strong documentation integration, but more setup and less audit focus.
- **Custom Markdown:** would require rebuilding traceability, diff, and PDF export.
