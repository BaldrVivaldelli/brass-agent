# Security Policy

brass-agent (`@brass/agent`) is in alpha. The CLI, the VS Code extension, and
the native service are experimental; agent write workflows should be used on a
Git branch with patch review enabled.

## Supported versions

| Component | Status |
| --- | --- |
| `brass-agent` source on `main` | Supported for fixes and reports |
| Published releases | None yet: `@brass/agent` is not on npm and no VS Code extension build is published |
| Local builds from other branches | Not supported |

The native service (`brass-native-service`) is built together with the agent
CLI and the VS Code extension and follows their status.

## Reporting vulnerabilities

Please do **not** put secrets, API keys, tokens, private repository contents, or
exploit details in a public issue.

Report security issues privately through a GitHub security advisory:
<https://github.com/BaldrVivaldelli/brass-agent/security/advisories/new>

Include:

- affected component (`agent CLI`, `VS Code extension`, or `native service`),
- affected version or commit,
- reproduction steps,
- expected impact,
- relevant logs with secrets redacted.

## Secrets and model keys

- The VS Code extension stores model keys in VS Code Secret Storage.
- Project configuration should reference environment variable names, not raw
  secret values.
- The agent redacts likely secrets before building LLM prompts, but redaction is
  best effort: still review prompts, run artifacts, and patches before sharing
  them.
- Do not commit `.env` files or API keys, and do not paste them into issues or
  advisories.
