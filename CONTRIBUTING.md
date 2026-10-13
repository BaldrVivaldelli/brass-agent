# Contributing

Thanks for helping improve brass-agent. Before opening a pull request, run
the same checks CI runs.

## TypeScript

CI runs on Node 20, 22 and 24. Use any of those versions locally.

```bash
npm ci
npm run test:types
npm test
npm run build
```

## Rust

The native service lives in `crates/brass-native-service` and CI pins
Rust 1.94 with `rustfmt` and `clippy`.

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

The npm scripts wrap the common native tasks:

```bash
npm run native:build
npm run native:test
```

`brass-engine-core` is not part of this repository. Cargo fetches it from the
`brass-runtime` repository on GitHub (`main` branch), so building the Rust
workspace needs network access the first time. Changes to that crate belong
in `brass-runtime`.

## Pull requests

- Keep changes focused and include tests for new behavior.
- Make sure the TypeScript and Rust checks above pass before requesting review.
- Do not commit secrets, proprietary payloads or private traces.

## Bug reports

Bug reports should include a minimal reproduction, the Node version and the
command or editor host involved (CLI, VS Code extension or native service).
Never post API keys, tokens or private project content.

Security issues must not go in public issues; see `SECURITY.md`.
