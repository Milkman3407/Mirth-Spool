# M03 — Authentication and Onboarding

**Depends on:** M02  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Add a secure first-run administrator flow, established session authentication, route protection, and basic account management. At the end of this milestone, all product data is private by default.

## Required deliverables

- Atomic first-run setup status and administrator creation.
- Login, logout, session retrieval, and session revocation.
- Protected application routes and APIs.
- Secure password hashing and session cookies.
- Rate limiting for setup and authentication.
- Basic account/security page.
- Authentication audit events and tests.

## Implementation tasks

- Select and integrate an established authentication library compatible with the chosen Next.js version.
- Use a credentials-based local account for the MVP and Argon2id password hashing.
- Implement `GET /api/setup/status` and `POST /api/setup` with an atomic no-user check.
- Prevent setup races with a database transaction/advisory lock or equivalent uniqueness guarantee.
- Close `/setup` after the first administrator exists.
- Implement login/logout and server-side session retrieval.
- Protect page routes with server-side checks; protect APIs independently.
- Add CSRF protection according to the authentication framework and API conventions.
- Add login/setup rate limiting backed by Redis with a safe behavior if Redis is unavailable.
- Set production cookie flags and document reverse-proxy requirements for secure cookies.
- Add session listing/revocation for the current administrator if supported cleanly.
- Record sanitized audit events for setup, login success, logout, session revocation, and repeated failures.
- Ensure sensitive authentication modules are server-only.

## Required behavior and contracts

- Public endpoints are limited to liveness, readiness, setup status, setup while open, and authentication endpoints required for login.
- No public registration route or UI exists.
- The API must not reveal whether an arbitrary account exists beyond what is necessary for login.
- Passwords, password hashes, cookies, and session tokens never appear in logs or responses.
- Setup is permanently closed after an administrator exists unless a documented recovery command is used from the server.
- Authentication state must be checked server-side for cached media and future admin routes.

## Test requirements

- Unit-test password policy, safe error mapping, and route-guard helpers.
- Integration-test concurrent first-admin creation; exactly one must succeed.
- Integration-test login, logout, expiry, and revocation.
- Test CSRF rejection for state-changing browser requests.
- Test authentication rate limiting.
- Test that feed/source/settings placeholders and their APIs reject unauthenticated access.
- Playwright-test setup, logout, failed login, successful login, and closed setup.

## Acceptance criteria

- [ ] Only one administrator can be created through first-run setup.
- [ ] Setup closes atomically and remains closed.
- [ ] All application pages and non-public APIs require authentication.
- [ ] Login/logout and session revocation work.
- [ ] Production cookie and CSRF controls are configured.
- [ ] Authentication attempts are rate-limited.
- [ ] No secrets or hashes are exposed to the client or logs.
- [ ] End-to-end authentication tests pass.

## Out of scope

- Public registration.
- Password reset by email.
- OAuth login with third-party identity providers.
- Multi-factor authentication.
- Invitation-only member accounts.
- Source credentials.

## Governing documents to read

- [PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md)
- [API_CONTRACT.md](../API_CONTRACT.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [DATA_MODEL.md](../DATA_MODEL.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)
- [DELIVERY_WORKFLOW.md](../DELIVERY_WORKFLOW.md)

## Implementation notes

Provide a documented server-side recovery command for resetting the administrator password only if it can be implemented without weakening normal authentication. The command must require shell/database access and must not create a remotely reachable bypass.

## Codex handoff prompt

```text
Implement only M03 — Authentication and Onboarding.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
