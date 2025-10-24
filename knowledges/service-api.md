# MyZ Sync Service API

This document summarizes the HTTP API exposed by the service hosted in `service/`. All endpoints are served from the Next.js App Router under `/api`.

## Authentication & Accounts

### POST `/api/captcha/challenge`

Returns a short-lived captcha challenge.

```json
{
  "challenge": {
    "id": "uuid",
    "question": "What is 3 + 4?",
    "expiresAt": "2025-10-27T08:30:00.000Z"
  }
}
```

Use the `id` and the plain-text answer with any request that requires captcha validation.

### POST `/api/auth/register`

Registers or reactivates an email/password account.

```jsonc
{
  "email": "user@example.com",
  "password": "StrongPass123",
  "captchaId": "uuid",
  "captchaAnswer": "7"
}
```

Successful responses indicate email verification is required. In non-production environments the temporary verification token is returned for convenience.

```json
{
  "message": "Verification required",
  "requiresVerification": true,
  "verificationToken": "dev-only-token",
  "expiresAt": "2025-10-28T08:30:00.000Z"
}
```

### POST `/api/auth/verify-email`

Consumes an email verification token generated during registration.

```json
{
  "token": "dev-only-token"
}
```

Successful responses confirm the associated email address.

### POST `/api/auth/login`

Authenticates a verified user with email and password, issuing a bearer token and an HTTP-only cookie (`myz_session`).

```jsonc
{
  "email": "user@example.com",
  "password": "StrongPass123",
  "captchaId": "uuid",
  "captchaAnswer": "7"
}
```

Response shape:

```json
{
  "token": "session-token",
  "expiresAt": "2025-11-26T06:00:00.000Z",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "emailVerifiedAt": "2025-10-27T08:45:00.000Z"
  }
}
```

### POST `/api/auth/oauth`

Accepts an OAuth provider (`google` or `github`) plus a provider-issued access token and captcha answer. The server fetches the verified profile, links or creates the user, and returns the same session payload as `/api/auth/login`.

### POST `/api/auth/logout`

Revokes the bearer token associated with the current session and clears the session cookie.

## Synchronization

All sync endpoints require an `Authorization: Bearer <token>` header or the `myz_session` cookie from `/api/auth/login` or `/api/auth/oauth`. Unauthenticated requests receive HTTP `401`, and verified email is enforced with HTTP `403`.

### GET `/api/sync/pull?cursor=<number>`

Returns the current snapshot plus any change sets recorded after the supplied cursor. Omit `cursor` to fetch only the snapshot.

```json
{
  "cursor": 12,
  "snapshot": {
    "annotations": {
      "annotation-id": {
        "id": "annotation-id",
        "data": {
          "title": "Snippet headline",
          "tags": ["myz"]
        },
        "updatedAt": "2025-10-26T17:00:00.000Z"
      }
    }
  },
  "changes": [
    {
      "version": 12,
      "payload": [
        {
          "id": "annotation-id",
          "type": "update",
          "payload": {
            "title": "Snippet headline",
            "tags": ["myz", "logseq"]
          },
          "updatedAt": "2025-10-26T17:00:00.000Z"
        }
      ]
    }
  ]
}
```

### POST `/api/sync/push`

Uploads a batch of changes. The payload cursor must match the server cursor; otherwise the server responds with HTTP `409` and the latest cursor.

```jsonc
{
  "cursor": 12,
  "changes": [
    {
      "id": "annotation-id",
      "type": "update",
      "payload": {
        "title": "Snippet headline",
        "tags": ["myz", "logseq"]
      },
      "updatedAt": "2025-10-26T17:00:00.000Z"
    }
  ],
  "summary": "Extension push"
}
```

Successful responses include the new cursor, the updated snapshot, and a summary of the recorded sync history entry.

### GET `/api/sync/history`

Returns the most recent sync history entries (default 20) for the authenticated user.

```json
{
  "history": [
    {
      "id": "uuid",
      "version": 12,
      "status": "success",
      "summary": "Extension push",
      "syncedAt": "2025-10-26T17:00:01.000Z"
    }
  ]
}
```

## Storage Semantics

- Snapshots are stored on disk under `${STORAGE_ROOT}/{userId}/latest.json`.
- Incremental change sets are appended under `${STORAGE_ROOT}/{userId}/versions/{version}.json`.
- Sync history and metadata live in PostgreSQL (`sync_states`, `sync_records`, and related user tables).

Clients should favor incremental pushes/pulls to minimise payload size while keeping eventual consistency with the canonical snapshot.
