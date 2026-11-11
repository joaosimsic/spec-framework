# Specification

This directory is managed by spec-framework.

Start with:

1. Start with `requirements/core.sdoc`.
2. Update `architecture/model.c4`.
3. Add formal modules under `formal/`.
4. Define contracts under `contracts/`.
5. Run `spec check --structural` for fast feedback.
6. Run `spec doctor --fix` to provision the full stack.
7. Run `spec check` before review.

Approved content is hash-locked in `spec.lock`.
