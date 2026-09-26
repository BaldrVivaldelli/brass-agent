# @brass/agent

A workspace agent that inspects a project, asks an LLM for a patch, and applies
or rolls it back under an explicit approval policy. Ships a CLI (`brass-agent`)
and a VS Code extension.

It is built on [`brass-runtime`](https://github.com/BaldrVivaldelli/brass-runtime),
which it declares as a peer dependency: every effect the agent runs is a
cancelable `Async` owned by a scope, so interrupting a run tears down its
child work and runs finalizers.

> **Status: alpha.** The CLI, approval model, and VS Code surfaces are still
> moving. Pin an exact version.

## Install

```bash
npm i @brass/agent brass-runtime
```

## Use

```bash
npx brass-agent --doctor   # check the workspace and model configuration
npx brass-agent --init     # write a starter config
npx brass-agent            # run against the current workspace
```

Configuration, approval policy, rollback behavior, and the VS Code surfaces are
documented under [`docs/`](./docs).

## Layout

| Path | What it holds |
| --- | --- |
| `src/agent/core` | Host, approval capability, planning, context discovery |
| `src/agent/cli` | `brass-agent` command line |
| `src/agent/vscode` | VS Code host bindings |
| `src/agent/llm` | Model adapters |
| `src/agent/native` | Protocol-v1 client for the Rust search service |
| `crates/brass-native-service` | Read-only Rust index/search service |
| `extensions/vscode-brass-agent` | Packaged VS Code extension |

## Develop

```bash
npm ci
npm run test:types
npm test
npm run build
```

The Rust service builds separately:

```bash
npm run native:build
npm run native:test
```

`crates/brass-native-service` depends on `brass-engine-core`, which lives in the
`brass-runtime` repository because the WASM engine shares it. The dependency is
declared as a git reference; pin it to a tag once `brass-runtime` publishes one.

## History

This package was extracted from the `brass-runtime` repository with its git
history intact. The runtime repository now owns only the effect runtime, HTTP,
schema, and observability products.

## License

MIT
