# Contributing to MirthSpool

Follow [AGENTS.md](mirthspool-codex-plan/AGENTS.md) and the [delivery workflow](mirthspool-codex-plan/DELIVERY_WORKFLOW.md). Work on exactly one milestone per branch and pull request, and read every governing document named by that milestone before making changes.

## Development expectations

- Use pnpm through the version pinned in `package.json` and commit lockfile changes.
- Keep TypeScript strict and avoid `any`.
- Keep all runtime environment access in `packages/config` except framework-required bootstrap code.
- Never commit credentials, local `.env` files, private fixtures, or production-looking example secrets.
- Unit tests must be deterministic and make no external network calls.
- Do not add manual meme-upload functionality or undocumented provider scraping.
- Run the root quality commands before requesting review.

Contributions are accepted under the [Apache License 2.0](LICENSE).
