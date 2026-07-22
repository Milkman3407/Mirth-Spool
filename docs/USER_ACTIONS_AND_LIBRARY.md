# User actions and library operations

MirthSpool stores favorites, hidden items, and meaningful views as private
`UserAction` rows scoped to the authenticated user. The browser never sends a
user identifier: action routes derive it from the database-backed session,
require same-origin JSON mutations, accept only an empty JSON object, and reject
unknown fields.

## Actions

Authenticated clients can use these bounded, single-item operations:

- `PUT` or `DELETE /api/content/{contentId}/favorite`
- `PUT` or `DELETE /api/content/{contentId}/hide`
- `PUT /api/content/{contentId}/view`

Favorite, hide, and removal requests are idempotent. Concurrent first writes
recover from the unique-key race and resolve to the one stored action. Hidden
items are excluded from every normal feed mode by default; the hidden library
keeps them available for restoration. Favorited retained content remains
available from its detail page unless it has been suppressed.

The UI applies favorite and hide changes optimistically. A failed request
restores the previous button, feed, or library state and presents an accessible
error. Hiding from a feed also offers an undo action.

## Meaningful views and Unseen

A feed card becomes a meaningful view only after at least 50 percent of the card
has remained visible for 1.5 seconds. Opening a detail page is an explicit
meaningful view. The server is authoritative and coalesces revisits within a
15-minute window. Each view row retains the first view time, latest coalesced
view time, and a revisit count, so repeated visibility callbacks do not create
unbounded rows.

When history is enabled, Unseen excludes content with a meaningful view for the
current user. The `Keep detailed view history` setting is configurable at
`/settings`. Disabling it transactionally deletes that user's existing view
rows, prevents future view writes, makes the history endpoint unavailable with
`HISTORY_DISABLED`, and makes Unseen behave like the normal unhidden feed.
Re-enabling starts with an empty history.

## Libraries and pagination

The protected pages `/library/favorites`, `/library/hidden`, and
`/library/history` are backed by matching authenticated JSON endpoints. They use
keyset pagination with a maximum page size of 50 and an HMAC-signed cursor bound
to the library kind. Invalid, modified, or cross-library cursors are rejected.
Every query applies the configured content-rating ceiling and excludes
suppressed content.

Favorites and hidden items survive reloads because the database is the source
of truth. Removing a favorite or restoring a hidden item immediately removes it
from the corresponding management view; request failures restore the entry.

## Privacy and operational notes

- Action payloads, responses, and logs do not expose or accept client-selected
  identity.
- Personal content actions do not create audit events.
- There is no manual meme-upload route or UI.
- No action endpoint provides unbounded bulk mutation or export behavior.
- Schema changes are deployed by the
  `20260722160000_user_actions_library` migration. Its rollback notes explain
  the destructive loss of coalesced history metadata.
