# Authentication and account recovery

Invitation-only member accounts, role authorization, deletion semantics, and
shared-device privacy are documented in
[Multi-user authorization and privacy](MULTIUSER_AUTHORIZATION_AND_PRIVACY.md).

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
least 32 characters. Changing it invalidates existing signed cookies. Generate
`MIRTHSPOOL_SETUP_TOKEN` from at least 32 random bytes and enter it only in the
one-time setup form. It is never accepted in a URL or returned to the browser;
after the first administrator exists, setup is permanently closed. Set
`MIRTHSPOOL_PUBLIC_ORIGIN` to the one exact browser origin, including scheme and
non-default port. Production HTTPS causes cookies to be `Secure`; cookies are
always `HttpOnly` and `SameSite=Lax`.

## Reverse proxy

Terminate TLS at a trusted reverse proxy and overwrite, rather than append,
`X-Forwarded-For`. List only its exact address in
`MIRTHSPOOL_TRUSTED_PROXY_IPS`, and have it overwrite
`X-MirthSpool-Forwarded-By` with that same address. The proxy must also set a
Unix timestamp in `X-MirthSpool-Forwarded-At` and a base64url HMAC-SHA256 in
`X-MirthSpool-Forwarded-Signature`. The signed bytes are
`client-ip + "\n" + proxy-ip + "\n" + timestamp`, keyed by the independent
`MIRTHSPOOL_TRUSTED_PROXY_SECRET`. Assertions older or newer than 60 seconds,
unsigned assertions, comma-separated client IPs, and unlisted proxy identities
are ignored. This setting only changes the address used for abuse controls; it
does not relax origin or CSRF validation.

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
