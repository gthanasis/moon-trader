# Contributing

Thanks for your interest in improving `trader`. Contributions of all sizes are
welcome.

## Getting started

1. Fork and clone the repo.
2. Follow the setup steps in the [README](README.md#setup).
3. Create a branch for your change.

## Development workflow

Before opening a pull request, make sure these pass:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## Guidelines

- **Match the surrounding code.** Follow existing naming, structure, and
  comment style. Keep `core/` free of framework dependencies.
- **Cover behaviour with tests.** Money-handling and risk logic must have
  tests. The suite uses [vitest](https://vitest.dev).
- **Never commit secrets.** Do not commit `.env` or any real API keys. Do not
  commit screenshots of real-account dashboards or balances.
- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org)
  (e.g. `feat(core): ...`, `fix(llm): ...`).
- **Keep changes focused.** One logical change per pull request.

## Reporting bugs and requesting features

Open an issue using the provided templates. For security vulnerabilities, see
[SECURITY.md](SECURITY.md) — do **not** open a public issue.

## Code of Conduct

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).
