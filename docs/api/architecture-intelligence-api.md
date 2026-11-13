# Architecture intelligence API

Status: planned.

Base path: `/api/v1`.

The API is local-only by default. It follows the existing localhost binding,
origin, and CSRF rules for mutation endpoints. Analysis and query endpoints are
read-only.

## Projects

| Method | Endpoint                 | Purpose                     |
| ------ | ------------------------ | --------------------------- |
| POST   | `/projects`              | Register a local repository |
| GET    | `/projects`              | List registered projects    |
| GET    | `/projects/:id`          | Project details             |
| DELETE | `/projects/:id`          | Remove a project            |
| POST   | `/projects/:id/analyze`  | Start analysis              |
| GET    | `/projects/:id/analysis` | Analysis history            |

Registration request:

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

- `repository_path` must be absolute or resolvable relative to the registered
  root policy.
- The path must not escape allowed roots.
- Registration does not grant write access.

## Jobs

| Method | Endpoint           | Purpose      |
| ------ | ------------------ | ------------ |
| GET    | `/jobs/:id`        | Job status   |
| GET    | `/jobs/:id/events` | SSE progress |
| POST   | `/jobs/:id/cancel` | Cancel a job |

SSE events are described in
[Analysis jobs and snapshots](../workflow/analysis-jobs-and-snapshots.md).

## Architecture

| Method | Endpoint                       | Purpose                  |
| ------ | ------------------------------ | ------------------------ |
| GET    | `/projects/:id/architecture`   | Architecture overview    |
| GET    | `/projects/:id/elements`       | List elements            |
| GET    | `/elements/:id`                | Element details          |
| GET    | `/elements/:id/children`       | Expand hierarchy         |
| GET    | `/elements/:id/relationships`  | Incoming and outgoing    |
| GET    | `/elements/:id/implementation` | Linked code artifacts    |
| GET    | `/projects/:id/graph`          | Graph visualization data |

Graph query:

```http
GET /projects/:id/graph?view=functional&depth=2&include_relationships=true
```

Response:

```json
{
  "data": {
    "nodes": [
      {
        "id": "subsystem.orders",
        "type": "subsystem",
        "label": "Orders",
        "metadata": { "component_count": 8 }
      }
    ],
    "edges": [
      {
        "id": "rel-001",
        "source": "subsystem.orders",
        "target": "subsystem.inventory",
        "type": "depends_on"
      }
    ]
  },
  "meta": { "depth": 2, "truncated": false }
}
```

Rules:

- depth is bounded;
- pagination is required for large result sets;
- truncation is explicit;
- absolute paths are never returned.

## Flows

| Method | Endpoint                     | Purpose       |
| ------ | ---------------------------- | ------------- |
| GET    | `/projects/:id/flows`        | List flows    |
| GET    | `/flows/:id`                 | Flow details  |
| GET    | `/flows/:id/trace-to-origin` | Reverse trace |

## Findings

| Method | Endpoint                 | Purpose                      |
| ------ | ------------------------ | ---------------------------- |
| GET    | `/projects/:id/findings` | List findings                |
| GET    | `/findings/:id`          | Finding detail and evidence  |
| PATCH  | `/findings/:id`          | Confirm, reject, or annotate |

Patch request:

```json
{
  "status": "confirmed",
  "annotation": "This cycle is introduced by the adapter boundary."
}
```

## AI

| Method | Endpoint                                 | Purpose                   |
| ------ | ---------------------------------------- | ------------------------- |
| POST   | `/projects/:id/ask`                      | Ask about the repository  |
| POST   | `/projects/:id/analyze/responsibilities` | Responsibility hypotheses |
| POST   | `/projects/:id/analyze/architecture`     | Architecture hypotheses   |

AI responses must include:

- explanation;
- element IDs;
- file references;
- evidence class;
- confidence;
- validation status.

Invalid references fail the request or mark the output rejected. They are never
silently dropped.

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
