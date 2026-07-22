# Delivery Workflow

## 1. One milestone per pull request

Use one branch and pull request for each milestone.

Suggested branch names:

```text
milestone/m00-repository-bootstrap
milestone/m01-local-runtime
...
```

Do not combine milestones to reduce review count. Later milestones assume earlier ones are merged and stable.

## 2. Start-of-milestone checklist

Before implementation:

- Confirm the active milestone and dependencies.
- Read referenced governing documents.
- Pull the latest default branch.
- Run existing quality gates.
- Inspect open TODOs and known limitations from the previous completion report.
- Identify schema, API, configuration, and security impact.
- Write a brief implementation plan.

If the baseline is already failing, record the failure before changing code. Fix only failures necessary for the milestone or open a separate issue.

## 3. Commit guidance

Prefer commits that are individually understandable:

1. Structural/configuration changes.
2. Domain or migration changes.
3. Implementation.
4. Tests.
5. Documentation.

Do not use vague messages such as `fix stuff`. Avoid formatting the whole repository during an unrelated milestone.

## 4. Pull-request body

Use:

```markdown
## Milestone
Mxx — Name

## Goal
...

## Changes
- ...

## Architecture/API/data impact
- ...

## Security and privacy impact
- ...

## Migration and rollback
- ...

## Test evidence
- `pnpm ...`

## Screenshots
Only when UI changed. Redact private source data.

## Acceptance criteria
- [x] ...

## Known limitations
- ...

## Follow-up
Stop after this milestone.
```

## 5. Database change workflow

- Generate a named Prisma migration.
- Inspect generated SQL.
- Test migration from the previous milestone's schema.
- Test on an empty database.
- Document lock/backfill implications.
- Never rewrite an applied migration.
- Include an operational rollback description even when the database rollback is restore-from-backup.

## 6. API change workflow

For a route or response change:

- Update [API_CONTRACT.md](API_CONTRACT.md).
- Add validation tests.
- Add authorization tests.
- Add client compatibility changes in the same milestone.
- Avoid leaking provider payloads directly.

## 7. Configuration change workflow

For every environment variable:

- Add it to validated server configuration.
- Add a documented placeholder to `.env.example`.
- State whether it is required, secret, restart-required, and safe default.
- Add startup tests for invalid/missing values.

For database-backed settings:

- Add schema validation.
- Add default migration/seed behavior.
- Add an authenticated UI/API.
- Audit sensitive changes.

## 8. Codex invocation template

Use this prompt with the active milestone:

```text
Implement only <milestone file> in the MirthSpool repository.

First read AGENTS.md and every governing document referenced by the milestone.
Inspect the existing code and migrations before editing.
Do not start later milestones and do not add manual upload functionality.
Use official APIs/feeds only and preserve all security/resource bounds.
Run the required quality gates.
At the end, provide the exact completion report required by AGENTS.md.
If a criterion cannot be completed, leave it unchecked and explain the blocker.
```

## 9. Review focus

Reviewers should inspect:

- Unauthenticated routes.
- Server/client boundary and secret exposure.
- SSRF and media-fetch paths.
- Idempotency and uniqueness constraints.
- Pagination correctness.
- Queue retry behavior.
- Transaction boundaries.
- Content-rating enforcement.
- Logs and error redaction.
- Resource limits.
- Test assertions, not only test presence.
- Documentation and upgrade impact.

## 10. Release discipline

- Use semantic versioning starting at `0.1.0`.
- Maintain a changelog.
- Publish immutable image tags plus a convenient version tag.
- Do not publish `latest` as the only deployable reference.
- Include migration and rollback notes.
- Build release artifacts from CI, not a developer workstation.
