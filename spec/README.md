# Specification

This directory is managed by spec-framework.

Start with:

1. Start with `requirements/core.sdoc`.
2. Curate `architecture/model.c4`; `spec architecture generate` refreshes the code-derived draft under `generated/` without touching it.
3. Add formal modules under `formal/`.
4. Define contracts under `contracts/`.
5. Run `spec check --structural` for fast feedback.
6. Run `spec doctor --fix` to provision the full stack.
7. Run `spec check` before review.

Approved content is hash-locked in `spec.lock`.
