# Non-web projects

The generated spec does not assume HTTP.

## Observed boundary kinds

| Kind          | Examples                             | Evidence                            |
| ------------- | ------------------------------------ | ----------------------------------- |
| Library API   | TypeScript exports, package exports  | exported symbols and signatures     |
| CLI           | commands, flags, exit codes, streams | bin entries, shebangs, CLI dispatch |
| File format   | config, archive, data files          | file reads/writes, schemas          |
| IPC           | socket, queue, shared memory         | network/queue data access           |
| Wire protocol | TCP/UDP, RPC                         | network calls and message types     |
| Event         | domain event, telemetry              | queue and event calls               |
| Hardware      | registers, buses                     | configured external evidence        |

## Generated behavior

For a library + CLI + file format repository, the generated spec can show:

- CLI entry points;
- exported library functions and classes;
- file reads and writes;
- external dependencies;
- observed contracts from package exports and CLI metadata;
- flows from CLI or public functions to sources and sinks.

## Limits

- Static analysis cannot prove runtime behavior.
- Protocol semantics may require configured external checks.
- Hardware behavior may require manual inspection or simulation evidence.
- Unknown APIs remain unknown.

## Rule

Do not invent HTTP endpoints to fit an API-shaped tool. Record the observed
surface and its evidence.
