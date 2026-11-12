---
name: spec-authoring
description: Use when drafting or revising a spec-framework proposal from a conversation. Covers context gathering, typed proposal operations, decision records, validation, and approval handoff.
---

# Spec authoring

1. Call `spec_status` and `spec_context`.
2. Resolve affected items by visible name with `spec_query`.
3. Draft changes only through `spec_propose` using typed operations.
4. Record every accepted decision or open question with `spec_decide`.
5. Run `spec_validate`.
6. Summarize named impact, invalidated evidence, and approvals to renew.
7. Ask the human to approve in the CLI. Never approve.
