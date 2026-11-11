# Explorer

> Status: Phase 2 design. The read-only Explorer is not implemented.

## Purpose

The Explorer is a local, read-only UI over the spec graph. It helps a human
navigate architecture, requirements, capabilities, formal models, contracts,
verification, evidence, and impact.

It is a review aid. It is not the source of truth, an editor, or an approval
record.

Phase 2 delivers a read-only Explorer. Editing and mutation are out of scope.

## Views

- overview: systems, capabilities, coverage, blockers;
- architecture: LikeC4 views and element catalog;
- requirements: EARS records, acceptance criteria, status, and links;
- capabilities: hierarchy and requirement derivation;
- semantic model: ontologies, concept schemes, concepts, and semantic contracts;
- formal: Quint modules, properties, results, and counterexamples;
- contracts: surfaces, compatibility policy, and evidence;
- verification: objectives, cases, methods, coverage, and waivers;
- traceability: requirement → capability → component → property → evidence;
- impact: changed elements, invalidated evidence, and approvals to renew;
- audit: bundle status, manifest, and approval page.

Every view resolves IDs to the same graph. No view owns a private truth.

## Source of truth

The Explorer reads the model produced by the CLI and native tools.

- It does not write sources.
- It does not compute a different graph.
- It does not mark elements approved.
- It does not replace the audit bundle.
- It shows the commit, dirty state, tool versions, and active branch context.

If the Explorer cannot load a valid model, it shows the failure. It does not
render a partial model as if it were complete.

## Approval display

The Explorer may display:

- approved IDs;
- content and evidence hashes;
- approver and timestamp;
- pending and invalidated scope;
- blocking unknowns and expired waivers.

It cannot create, change, or remove an approval. A human uses `spec approve` in
the CLI for that action.

## Scope and access

- local bind by default;
- explicit configuration for non-local access;
- no remote public deployment in Phase 2;
- no secrets or approval tokens in responses;
- bounded query and rendering work;
- no arbitrary filesystem reads outside the workspace.

## Rendering

- static export first: generated HTML from the validated model;
- live local server second: query-backed views over the same data;
- generated output is reproducible where the renderer permits;
- generated artifacts are ignored by default and never hand-edited.

## Failure behavior

- invalid model: show validation findings, not a blank success page;
- stale bundle: show the mismatch and the source commit;
- dirty tree: mark the view as local preview only;
- missing tool: show the affected layer as blocked;
- failed query: show the error without inventing an answer.

## Non-goals

- Editing specification sources.
- Approving or rejecting elements.
- A hosted service.
- Replacing LikeC4, StrictDoc, or the audit bundle.
- Becoming required for validation or approval.
- Hiding gaps behind visual polish.
