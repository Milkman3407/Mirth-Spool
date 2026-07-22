# M00 — Repository Bootstrap

**Depends on:** None  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Create a clean, reproducible TypeScript monorepo that establishes coding, testing, configuration, and CI conventions before product code grows. This milestone should make later work predictable without prematurely implementing product features.

## Required deliverables

- A `pnpm` workspace with `apps/`, `packages/`, `tests/`, and `milestones/` structure.
- Strict TypeScript base configuration shared by all packages.
- Formatting, linting, unit-test, type-check, and build commands at the repository root.
- Validated server configuration package with a small initial schema.
- GitHub Actions workflow skeleton for static checks and unit tests.
- Repository metadata: `.gitignore`, `.editorconfig`, `.env.example`, contribution notes, and license placeholder/decision note.
- A minimal root README that links back to this build pack and records the project description.

## Implementation tasks

- Initialize a root `package.json` with package-manager pinning and workspace scripts.
- Create a lockfile and commit it.
- Configure TypeScript strict mode, modern module resolution, and consistent path aliases.
- Configure ESLint and Prettier without overlapping/conflicting formatting rules.
- Configure Vitest with at least one real test of the configuration package.
- Create `packages/config` with Zod-based environment parsing; expose typed server configuration and fail fast on invalid values.
- Add a script that prevents accidental import of server-only configuration into browser code, or establish an enforceable server/client module boundary.
- Create placeholder package manifests for `apps/web`, `apps/worker`, `packages/db`, `packages/connectors`, `packages/shared`, and `packages/ui` without implementing later features.
- Add CI caching for the package manager while keeping installs reproducible.
- Add a secret-scanning job or documented CI placeholder that is enabled no later than M16.
- Copy the milestone pack into the repository if it is not already present.

## Required behavior and contracts

- The root commands use one canonical implementation each; do not create multiple competing lint or test commands.
- No runtime code reads `process.env` outside `packages/config` except framework-required bootstrapping.
- Client-safe and server-only configuration must be separated explicitly.
- The repository must not contain credentials, generated `.env` files, or sample values that look usable in production.
- Package scripts must work from the repository root.

## Test requirements

- Run formatting, lint, type-check, unit-test, and build commands.
- Test that invalid/missing required environment variables produce a clear startup/configuration error.
- Test that known server-only variables are not exposed by a client-safe configuration export.
- Run CI locally where practical or validate the workflow syntax.

## Acceptance criteria

- [ ] `pnpm install --frozen-lockfile` succeeds after the lockfile exists.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` succeed.
- [ ] Strict TypeScript is enabled across workspace packages.
- [ ] Environment parsing is centralized and tested.
- [ ] CI runs static checks and unit tests on pull requests.
- [ ] No product feature beyond minimal scaffolding is implemented.
- [ ] The root README explains how to select and execute the next milestone.

## Out of scope

- Next.js pages or feed UI.
- Docker Compose runtime.
- Database schema.
- Authentication.
- Connector implementation.
- Deployment images.

## Governing documents to read

- [PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)
- [DELIVERY_WORKFLOW.md](../DELIVERY_WORKFLOW.md)

## Implementation notes

Prefer conventional, minimally customized tooling. The purpose of this milestone is reproducibility, not framework experimentation. When choosing exact package versions, use current stable mutually compatible releases, pin them through the lockfile, and record any material compatibility choice in the pull request.

## Codex handoff prompt

```text
Implement only M00 — Repository Bootstrap.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
