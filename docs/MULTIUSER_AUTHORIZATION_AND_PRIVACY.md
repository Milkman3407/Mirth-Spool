# Multi-user authorization and privacy

MirthSpool remains a private, invitation-only instance. There is no registration
endpoint, account directory, public profile, social graph, or user upload path.
The first setup account remains an administrator; every accepted invitation
creates a member.

## Authorization matrix

| Capability or route family                   | Unauthenticated                   | Member                        | Administrator                 |
| -------------------------------------------- | --------------------------------- | ----------------------------- | ----------------------------- |
| `/api/health/live`, `/api/health/ready`      | Minimal response                  | Minimal response              | Minimal response              |
| `/api/setup`, `/setup`                       | Only while no user exists         | Closed                        | Closed                        |
| `/api/invitations/accept`, `/invite`         | Accept valid invite, rate-limited | Same                          | Same                          |
| `/api/auth/sign-in/email`                    | Login only; no sign-up            | Login                         | Login                         |
| Feed, content, search, libraries             | Denied                            | Shared content with own state | Shared content with own state |
| Cached media                                 | Denied                            | Own effective rating policy   | Own effective rating policy   |
| Own settings, password, sessions             | Denied                            | Own account only              | Own account only              |
| Sources, credentials, refresh, runs          | Denied                            | Denied                        | Allowed                       |
| Cache policy/eviction/purge                  | Denied                            | Denied                        | Allowed                       |
| Metrics, diagnostics, queue/operations       | Denied                            | Denied                        | Allowed                       |
| Duplicate administration and global settings | Denied                            | Denied                        | Allowed                       |
| Invitations and member administration        | Denied                            | Denied                        | Allowed                       |

Administrative routes use the administrator session guard before parsing or
acting on input. Every action, library, feed, search, preference, session, and
media-policy query receives the user identifier from the authenticated
server-side session; clients cannot select another user.

## Invitations

- Tokens contain 256 bits of randomness.
- Only an HMAC-SHA-256 digest is stored.
- Plaintext is returned once, when an administrator creates the invitation.
- Invitations are email-bound, expiring, revocable, and single-use.
- Acceptance is limited by client address and token digest. Errors do not reveal
  whether an email or token exists.
- Acceptance creates a `MEMBER`; it never enables Better Auth sign-up.

## Rating policy

`content.maximumRating` is the administrator-controlled instance ceiling. Each
user stores a personal maximum. Feed, content, search, libraries, and cached
media use the stricter value. A member cannot weaken the global ceiling.

## Disable, revocation, and deletion

Disabling a member immediately deletes all of that account's sessions and causes
stale cookies to fail server-side resolution. Administrators can also revoke all
member sessions without disabling the account.

Deleting a member deletes credentials, sessions, preferences, and `UserAction`
rows through database cascades. Audit records are retained for security history.
Their actor relationship is set to null; sanitized event type, target identifier,
and operational metadata remain. The UI states this before deletion.
Administrator accounts cannot be changed through member endpoints.

## Shared-device behavior

The service worker never caches HTML, API, feed, library, account, or media
responses. Login and logout clear Cache Storage, `sessionStorage`, and
`localStorage` before navigation, including saved feed scroll positions.

## Migration and rollback

Migration `20260723190000_multiuser_invitations` is additive. It creates
`Invitation` and `UserPreference` and inserts one preference row per existing
user. The bounded backfill copies the former global history setting and rating
ceiling, so the existing administrator's behavior does not change.

The migration does not rewrite actions, sessions, content, or credentials and
does not lock large content tables. Back up before upgrade. Rollback is
restore-first: use a pre-M18 database backup because dropping the new tables
would destroy invitation and preference data.
