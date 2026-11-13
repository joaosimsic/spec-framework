# Architecture intelligence API

Status: implemented.

Base path: `/api/v1`.

The API is local-only by default. It follows the localhost, origin, and CSRF
rules for mutation endpoints. Analysis and query endpoints are read-only over
generated output.

## Projects

| Method | Endpoint                 | Purpose                     |
| ------ | ------------------------ | --------------------------- |
| POST   | `/projects`              | Register a local repository |
| GET    | `/projects`              | List registered projects    |
| GET    | `/projects/current`      | Current workbench project   |
| GET    | `/projects/:id`          | Project details             |
| DELETE | `/projects/:id`          | Remove a project            |
| POST   | `/projects/:id/analyze`  | Start analysis              |
| GET    | `/projects/:id/analysis` | Analysis history            |

Registration:

```json
{
  "name": "my-project",
  "repository_path": "/workspace/my-project",
  "analysis_options": {
    "static_analysis": true,
    "semantic_analysis": true,
    "flow_analysis": true
  }
}
```

Rules:

- `repository_path` must resolve inside a registered analysis root.
- Registration does not grant write access to source files.
- Analysis writes only snapshots and generated artifacts.

## Jobs

| Method | Endpoint           | Purpose      |
| ------ | ------------------ | ------------ |
| GET    | `/jobs/:id`        | Job status   |
| GET    | `/jobs/:id/events` | SSE progress |
| POST   | `/jobs/:id/cancel` | Cancel a job |

## Generated spec

| Method | Endpoint                               | Purpose                         |
| ------ | -------------------------------------- | ------------------------------- |
| GET    | `/projects/:id/spec`                   | Generated spec summary          |
| GET    | `/projects/:id/spec/sections/:section` | Generated section               |
| GET    | `/projects/:id/architecture`           | Generated architecture summary  |
| GET    | `/projects/:id/elements`               | List generated elements         |
| GET    | `/elements/:id`                        | Element details                 |
| GET    | `/elements/:id/children`               | Expand hierarchy                |
| GET    | `/elements/:id/relationships`          | Incoming and outgoing relations |
| GET    | `/elements/:id/implementation`         | Linked source artifacts         |
| GET    | `/projects/:id/graph`                  | Graph visualization data        |

Graph query:

```http
GET /projects/:id/graph?view=functional&depth=2&include_relationships=true
```

Rules:

- depth is bounded;
- pagination is required for large result sets;
- truncation is explicit;
- absolute paths are never returned;
- generated output is read-only.

## Flows

| Method | Endpoint                     | Purpose       |
| ------ | ---------------------------- | ------------- |
| GET    | `/projects/:id/flows`        | List flows    |
| GET    | `/flows/:id`                 | Flow details  |
| GET    | `/flows/:id/trace-to-origin` | Reverse trace |

## Findings

| Method | Endpoint                 | Purpose                     |
| ------ | ------------------------ | --------------------------- |
| GET    | `/projects/:id/findings` | List findings               |
| GET    | `/findings/:id`          | Finding detail and evidence |
| PATCH  | `/findings/:id`          | Local status and annotation |

Patch request:

```json
{
  "status": "needs_investigation",
  "annotation": "Static dispatch obscures the call target."
}
```

Patch writes local review metadata only. It never edits generated artifacts.

## Snapshots

| Method | Endpoint                          | Purpose               |
| ------ | --------------------------------- | --------------------- |
| GET    | `/projects/:id/snapshots`         | Snapshot history      |
| GET    | `/projects/:id/compare?from=&to=` | Compare two snapshots |
| GET    | `/snapshots/:id/compare/:other`   | Compare two snapshots |

## AI

| Method | Endpoint                                 | Purpose                      |
| ------ | ---------------------------------------- | ---------------------------- |
| POST   | `/projects/:id/ask`                      | Ask about generated evidence |
| POST   | `/projects/:id/analyze/responsibilities` | Responsibility hypotheses    |
| POST   | `/projects/:id/analyze/architecture`     | Architecture hypotheses      |

AI responses include explanation, element IDs, file references, evidence class,
confidence, and validation status. Invalid references fail the request.

## Retired endpoints

The legacy `/api/graph`, `/api/context`, `/api/change`, `/api/impact`,
`/api/diff`, `/api/mapping`, `/api/architecture-graph`, `/api/repo-graph`,
`/api/check`, and proposal operation routes are retired.

## Errors

```json
{
  "error": {
    "code": "ANALYSIS-NOT-FOUND",
    "message": "analysis snapshot unavailable",
    "details": {}
  }
}
```

No stack traces, secrets, or absolute paths.

## Security

- localhost-only default;
- explicit allowed origins for non-local access;
- CSRF for mutation endpoints;
- repository root allowlist;
- read-only analysis;
- no code execution;
- SSE scoped to the requesting session.
