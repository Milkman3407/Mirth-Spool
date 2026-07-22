# M18 — Multi-user Invitations

> **Post-MVP optional milestone.** This is not required for v0.1.

**Depends on:** M17  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Extend the private instance to invitation-only member accounts with per-user actions, settings, feed state, and authorization boundaries while keeping source administration restricted to administrators.

## Required deliverables

- Invitation-only account lifecycle.
- Administrator and member roles.
- Per-user favorites, hides, history, rating preferences, and feed state.
- Session/account management for members.
- Authorization test matrix.
- Migration and privacy documentation.

## Implementation tasks

- Add invitation records with single-use, hashed, expiring tokens.
- Implement administrator create/revoke invitation UI and audit events.
- Implement invitation acceptance and account creation without enabling open registration.
- Enforce `ADMIN` and `MEMBER` roles server-side.
- Restrict source, credential, cache-policy, operations, metrics, and global-settings changes to administrators.
- Allow members to browse shared ingested content and maintain only their own actions/preferences.
- Audit and optimize every query that joins `UserAction` or settings so data is scoped to the session user.
- Add per-user content-rating preferences bounded by administrator global policy.
- Add account disable/session revoke/delete behavior.
- Define deletion/anonymization for user actions and audit references.
- Review service-worker/cache behavior for shared devices and logout.
- Add an authorization matrix to API documentation.
- Migrate existing administrator data without changing behavior.

## Required behavior and contracts

- No public registration or discoverable user directory.
- Invitation tokens are never stored plaintext and are shown only at creation.
- Members cannot read source credentials, raw provider payloads, diagnostics, queue details, or other users' actions.
- Global adult-content maximum policy can restrict but not be weakened by a member.
- Cached media authorization applies to the current user/content policy.
- Every user-scoped query derives user identity from the session.
- Account deletion is explicit about retained audit records.

## Test requirements

- Integration-test every route for unauthenticated, member, and administrator roles.
- Test invitation expiry, replay, revocation, brute-force rate limit, and token hashing.
- Test two users with conflicting favorite/hide/view/rating states.
- Test cached-media access under differing rating preferences.
- Test member inability to manage sources/settings/metrics/cache policy.
- Playwright-test invitation creation, acceptance, member feed, logout, and disabled account.
- Run regression tests for the original single-administrator migration.

## Acceptance criteria

- [ ] Administrators can create and revoke expiring invitations.
- [ ] Invitation acceptance creates a member without opening registration.
- [ ] Role authorization is enforced server-side across all routes.
- [ ] Actions, history, preferences, and feed state are user-scoped.
- [ ] Members cannot access secrets or administrator operations.
- [ ] Shared-device logout/cache privacy is tested.
- [ ] Existing administrator data migrates safely.
- [ ] Authorization matrix and account-deletion behavior are documented.

## Out of scope

- Public registration.
- Social graph, following, direct messages, or public profiles.
- User media uploads.
- User-created public comments.
- External identity-provider login unless separately approved.

## Governing documents to read

- [PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md)
- [API_CONTRACT.md](../API_CONTRACT.md)
- [DATA_MODEL.md](../DATA_MODEL.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)

## Implementation notes

This milestone changes the threat model significantly. Perform a route-by-route authorization review rather than assuming middleware alone is sufficient. Keep source ingestion shared at the instance level; personal source sets are a separate future design.

## Codex handoff prompt

```text
Implement only M18 — Multi-user Invitations.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
