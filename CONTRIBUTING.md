# Contributing

Thanks for your interest in improving `trader`. Contributions of all sizes are
welcome.

## Getting started

1. Fork and clone the repo.
2. Follow the setup steps in the [README](README.md#setup).

## Branching and pull requests

**All changes land through a pull request from a feature branch — never commit
directly to `main`.** This applies to everyone, including maintainers and
coding agents, and to changes of any size.

1. Branch from an up-to-date `main`:

   ```bash
   git checkout main && git pull
   git checkout -b <type>/<short-description>   # e.g. feat/partial-exits, fix/stop-loss-fill
   ```

2. Commit your work to that branch.
3. Push it and open a PR:

   ```bash
   git push -u origin <branch>
   gh pr create
   ```

4. Merge only after CI is green and the PR has been reviewed.

Do not push to `main` and do not force-push shared branches.

## Development workflow

Before opening a pull request, make sure these pass — CI runs all of them:

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
