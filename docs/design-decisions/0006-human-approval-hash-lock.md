# 0006 — Human approval with hash lock

**Status:** accepted
**Date:** 2026-11-10

## Context

The framework must not depend on LLM self-report. Approval must be attributable, scoped, and invalidated by content changes.

## Decision

Approved elements and evidence are hash-locked in `spec.lock`. Approval is a human-only command. Any content or evidence change invalidates the affected approval.

## Consequences

- Reviewers approve a precise state, not a moving document.
- Agents cannot approve or silently modify approved content.
- CI can detect unapproved changes.
- Releases can bind a signed git tag to the approved lock.
- Re-approval is required after changes; unchanged elements keep approval.

## Alternatives

- **PR review only:** no scoped content binding.
- **Status field only:** an agent can set it.
- **Signed PDF only:** hard to diff and link to elements.
- **Database approvals:** opaque and not Git-native.
