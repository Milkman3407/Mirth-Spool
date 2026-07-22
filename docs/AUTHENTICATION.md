# Authentication and account recovery

MirthSpool M03 uses database-backed, revocable sessions and email/password
credentials. Passwords are hashed with Argon2id (64 MiB memory, three passes,
one lane). Self-registration, password-reset email, OAuth, and API tokens are
not enabled.

## Initial setup

On an empty database, visit `/setup` or query `GET /api/setup/status`. The setup
mutation is same-origin JSON, Redis rate limited, and serialized in PostgreSQL.
Exactly one administrator can be created; after that, setup returns a closed
response and cannot be reopened through the application.

Set `MIRTHSPOOL_AUTH_SECRET` to an independently generated random value of at
least 32 characters. Changing it invalidates existing signed cookies. Set
`MIRTHSPOOL_PUBLIC_ORIGIN` to the one exact browser origin, including scheme and
non-default port. Production HTTPS causes cookies to be `Secure`; cookies are
always `HttpOnly` and `SameSite=Lax`.

## Reverse proxy

Terminate TLS at a trusted reverse proxy and overwrite, rather than append,
`Forwarded` or `X-Forwarded-For`. Leave `MIRTHSPOOL_TRUST_PROXY=false` unless
that invariant is enforced and the app is not directly reachable. This setting
only changes the address used for abuse controls; it does not relax origin or
CSRF validation.

The proxy must preserve the original `Host` and HTTPS scheme and should reject
oversized request bodies. Only the configured public origin is trusted.

## Browser security

The web app creates a fresh Content Security Policy nonce for every page request
and forwards that nonce to Next.js for framework and application scripts. The
production policy does not permit `unsafe-inline` scripts or `unsafe-eval`.
API and static asset requests bypass nonce generation but retain the remaining
configured security headers.

## Sessions and recovery

Users can inspect opaque session identifiers, revoke other sessions, and change
their password at `/account/security`. Password changes revoke every other
session. Session tokens and password hashes are never returned by these APIs.

There is intentionally no remote password-reset workflow in M03. If the sole
administrator loses access, use an audited, local database recovery procedure:
stop public access, create a replacement Argon2id hash with the shipped
application code, update the matching `CredentialAccount.passwordHash`, delete
that user's sessions, and restore access. Back up the database first and do not
place passwords or hashes in shell history, tickets, or logs.

## Public and protected routes

Public routes are limited to health checks, setup status/setup while open, and
the allowlisted login/logout/session endpoints. Feed, source, settings, status,
account pages, and their API placeholders require a valid server-side session.
Unsupported Better Auth routes, including sign-up, are denied.
