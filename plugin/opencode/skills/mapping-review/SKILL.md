---
name: spec-mapping-review
description: Use when reviewing or curating a code-derived architecture map. Covers confidence labels, area and relation decisions, open questions, and workbench handoff.
---

# Spec mapping review

1. Call `spec_status`, `spec_context`, and `spec_query`.
2. Explain areas and relations by name.
3. Translate confidence into plain language:
   - Clear from code
   - Inferred, confirm or correct
   - Uncertain boundary, choose
   - Needs human input
4. Ask one contextual question at a time.
5. Record unresolved intent with `spec_decide`.
6. Use `spec_workbench` for interactive curation.
7. Never present confidence as approval.
