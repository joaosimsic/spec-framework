# Security

## Trust boundaries

The framework treats the specification as executable input to agents and CI. That makes spec integrity a security concern.

| Boundary         | Trusted                       | Untrusted                              |
| ---------------- | ----------------------------- | -------------------------------------- |
| Human direction  | Human decisions               | Pasted external text                   |
| Spec sources     | Approved, hash-locked content | Draft proposals                        |
| Build commands   | Reviewed `compile.json`       | Unreviewed commands from drafts        |
| Agent            | Draft generation              | Approval, verification verdicts        |
| Validators       | Deterministic tools           | LLM self-report                        |
| CI               | Pinned toolchain and evidence | Network-fetched mutable dependencies   |
| Semantic sources | Pinned local vocabularies     | Unpinned external RDF/OWL sources      |
| Query and MCP    | Read-only validated model     | Mutating or unauthenticated clients    |
| Explorer         | Local read-only review        | Remote exposure or editing             |
| Workbench        | Proposal branch               | Approved baseline, lock, remote access |
| opencode plugin  | Proposal writes via tools     | Approval, lock writes, untrusted text  |
| Workspace        | Pinned composition            | Mutable or unverified repository pins  |
| Audit bundle     | Generated, hashed artifact    | Hand-edited generated files            |

## Threats

### Prompt injection through spec content

A requirement or architecture description may contain instructions aimed at an agent.

Mitigations:

- treat spec content as data, not instructions;
- agent context marks spec text as untrusted;
- agent permissions prevent editing approved specs or approving changes;
- generated prompts do not interpolate free-form text into privileged instructions;
- code generation reads approved IDs and typed fields, not raw prose.

### Silent spec modification

An agent or compromised dependency edits approved content or evidence.

Mitigations:

- content hashes in `spec.lock`;
- approval invalidation on any change;
- generated artifacts carry source hashes;
- CI fails on unapproved changes;
- signed git tags or signed commits for release approvals.

### Evidence tampering

Verification logs are edited or replaced.

Mitigations:

- evidence files are hashed in the manifest;
- evidence is regenerated from source in a clean environment;
- the bundle records tool versions, command lines, and input hashes;
- CI rebuilds evidence rather than trusting checked-in logs.

### Malicious contracts or adapters

An adapter reports success without checking anything.

Mitigations:

- adapters are small, reviewable, and pinned;
- each adapter has a conformance test fixture;
- CI runs adapters against known-good and known-bad fixtures;
- the framework reports which adapter produced each piece of evidence.

### Malicious build commands

`spec/implementation/compile.json` names commands that `spec check` will execute. A malicious or compromised spec source could point them at destructive code.

Mitigations:

- treat `compile.json` as trusted build configuration, like `package.json` scripts;
- require explicit argument arrays and never invoke a shell;
- constrain the working directory to the project root;
- enforce a timeout per command;
- bound diagnostic output;
- review changes to `compile.json` with the same scrutiny as build scripts;
- leave host-level sandboxing to the execution environment.

### Malicious external vocabularies

An ontology imports an unpinned or compromised RDF/OWL source.

Mitigations:

- external sources are local files with recorded hashes;
- no mutable remote fetch at verification time;
- only the used external subset appears in exports;
- external terms are marked as external and cannot replace authored elements;
- source changes invalidate semantic evidence and approvals.

### Query and renderer abuse

SPARQL, MCP, or Explorer queries consume unbounded resources or expose files
outside the workspace.

Mitigations:

- local bind by default;
- explicit host and origin configuration for non-local access;
- query timeouts and result limits;
- workspace-relative path resolution only;
- no secrets or approval tokens in responses;
- query and rendering are read-only.

### Mutating agent interfaces

A query, MCP, Explorer, workbench, or chat client edits approved content or
approves a change.

Mitigations:

- query, MCP, and Explorer remain read-only by default;
- the workbench and opencode plugin write proposals only;
- every interactive write is a typed operation on a same-worktree proposal
  branch with a recorded base commit;
- no interactive surface exposes an approval endpoint or writes `spec.lock`;
- approval remains a CLI-only human action;
- all mutation attempts against the approved baseline are logged and rejected;
- mutation of approved content over MCP or Explorer still requires a separate
  decision.

### Workbench write abuse

A local or remotely reachable workbench mutates sources outside the workspace or
writes the approval lock.

Mitigations:

- localhost binding by default;
- explicit host and origin configuration for non-local access;
- same-origin and CSRF checks on every mutating request;
- workspace-relative path resolution only;
- no arbitrary filesystem access;
- no approval or `spec.lock` route;
- mutations require an active proposal context;
- log the commit, dirty state, tool versions, proposal ID, and agent role.

### Conversational agent and identity leakage

A chat agent exposes internal IDs, treats conversation as normative, or claims
verification without a checker.

Mitigations:

- tools accept opaque refs and names; internal identity stays in a technical
  payload;
- agent instructions forbid printing internal codes unless the human asks for
  technical details;
- accepted decisions must be recorded in the proposal before a turn ends;
- chat history is not an audit record;
- no verification claim without a checker result;
- spec text, comments, filenames, and imported docs remain untrusted data.

### Workspace composition tampering

A repository pin or manifest changes without review.

Mitigations:

- manifest and pins are committed and reviewed;
- verification uses recorded commits and never fetches;
- missing or mismatched pins fail admission;
- cross-repo impact requires an explicit baseline;
- publication order is component first, root composition second.

### Secrets in specs

Specs may reference credentials, internal hosts, or customer data.

Mitigations:

- no secrets in spec sources;
- environment and endpoints are represented as abstract contract parameters;
- gitleaks or equivalent runs on spec files;
- examples use synthetic identifiers.

### Supply chain

LikeC4, StrictDoc, Quint, Apalache, the semantic RDF/SHACL toolchain, the query
and MCP server, the Explorer and workbench front ends, the opencode plugin, and
the PDF toolchain are dependencies.

Mitigations:

- pinned versions in a lockfile or Nix flake;
- reproducible builds where possible;
- no dynamic plugin loading from untrusted paths;
- CI records exact tool versions in the audit manifest.

## Agent permissions

| Agent          | Read approved spec | Write approved spec |    Write proposals | Run validators | Approve |
| -------------- | -----------------: | ------------------: | -----------------: | -------------: | ------: |
| default build  |                yes |                  no | via `spec_propose` |            yes |      no |
| spec-architect |                yes |                  no |                yes |            yes |      no |
| spec-critic    |                yes |                  no |                 no |            yes |      no |
| human          |                yes |                 yes |                yes |            yes |     yes |

The default agent can implement approved specs but cannot change them. Architecture changes require explicit human direction and the proposal workflow. Query, MCP, and Explorer access is read-only and never substitutes for approval. The workbench and opencode plugin may edit proposals but cannot approve or write `spec.lock`.

## Non-goals

- Sandboxing arbitrary code execution by the agent. That is the host environment's responsibility.
- Protecting against a compromised human approver.
- Proving that a formal model matches reality. That is an elicitation and validation problem, not a security control.
