/**
 * Pure helpers about OIDC tokens kept in the session (no Nuxt imports).
 */
export interface SessionToken {
  access_token?: string | null
  /** Expiry of the access token, epoch seconds */
  access_token_expires_at?: number | string | null
  error?: string | null
  [key: string]: any
}

/** Seconds of safety margin: a token about to expire is not worth sending. */
export const TOKEN_MARGIN_SECONDS = 15

export function tokenExpiresAt(token?: SessionToken | null): number | null {
  const raw = token?.access_token_expires_at
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/** True when the token can still be sent to the API. */
export function isTokenUsable(token?: SessionToken | null, nowMs = Date.now()): boolean {
  if (!token?.access_token) return false
  if (token.error) return false
  const expiresAt = tokenExpiresAt(token)
  if (expiresAt === null) return true
  return nowMs / 1000 < expiresAt - TOKEN_MARGIN_SECONDS
}

/**
 * Renew the access token this long before it expires. It must stay above
 * TOKEN_MARGIN_SECONDS (the current token is still sent while it is renewed)
 * and below the 30 s margin of the jwt callback in server/api/auth/[...].ts
 * (otherwise the server hands back the same token).
 */
export const TOKEN_REFRESH_LEAD_SECONDS = 25

/** Shortest wait before a renewal, so that a failed one is not retried in a loop. */
export const TOKEN_REFRESH_MIN_DELAY_MS = 5000

/**
 * Milliseconds to wait before renewing the token, or null when there is
 * nothing to schedule (no token, no expiry, or already expired: an expired
 * token is renewed on demand before the next API call).
 */
export function tokenRefreshDelayMs(token?: SessionToken | null, nowMs = Date.now()): number | null {
  if (!token?.access_token || token.error) return null
  const expiresAt = tokenExpiresAt(token)
  if (expiresAt === null || nowMs / 1000 >= expiresAt) return null
  return Math.max((expiresAt - TOKEN_REFRESH_LEAD_SECONDS) * 1000 - nowMs, TOKEN_REFRESH_MIN_DELAY_MS)
}

/** True when the session carries a token that is dead for good (expired and not refreshable). */
export function isSessionExpired(token?: SessionToken | null, nowMs = Date.now()): boolean {
  if (!token) return false
  if (token.error) return true
  const expiresAt = tokenExpiresAt(token)
  return expiresAt !== null && nowMs / 1000 >= expiresAt
}
