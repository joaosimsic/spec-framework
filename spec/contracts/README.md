# Contracts

Contract definitions live here. Phase 1 supports JSON Schema, CLI snapshots, and
Rust public API adapters. Every contract declares an owner, consumers, and a
compatibility policy.

Adapters activate from their sources or language markers, or when listed
explicitly under `adapters.contracts` in `spec/config.json`. Rust contracts are
`rust/*.contract.json` sidecars; their public API baseline is stored at
`.baselines/<name>.rust-public-api.sha256`.
