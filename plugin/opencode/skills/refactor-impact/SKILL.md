---
name: spec-refactor-impact
description: Use when planning a refactor against an approved baseline. Covers before-and-after simulation, named impact, invalidated evidence, and approvals to renew.
---

# Spec refactor impact

1. Call `spec_status` and `spec_context`.
2. If no approved baseline exists, say the refactor is draft-only.
3. Use `spec_propose` with typed operations.
4. Call `spec_diff` and `spec_impact`.
5. Name affected requirements, contracts, checks, evidence, and approvals.
6. Run `spec_validate`.
7. Stop before approval. The human approves the changed scope in the CLI.
