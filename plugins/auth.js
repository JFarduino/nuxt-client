import { isSessionExpired, isTokenUsable, tokenRefreshDelayMs } from '~/composables/utils/auth'

/**
 * Hydrates the Pinia auth store from the nuxt-auth session and fetches the
 * OIDC tokens (server route /api/token) so that API calls can carry a bearer.
 * A session whose token expired and could not be refreshed is treated as
 * signed out (the header then offers to sign in again).
 *
 * The access token is short-lived: in the browser it is renewed shortly
 * before it expires, and on demand through `$refreshAuthToken` (called before
 * API requests), so that the UI keeps working without reloading the page.
 */
export default defineNuxtPlugin(async (nuxtApp) => {
  const headers = useRequestHeaders(['cookie'])
  const { status, data, getSession } = useAuth()
  const authStore = useAuthStore()

  /** Put a /api/token answer in the store. */
  const applyToken = (payload, user) => {
    if (payload && isTokenUsable(payload)) {
      authStore.setToken(payload)
      authStore.setUser(user || authStore.user)
    } else if (payload && isSessionExpired(payload)) {
      authStore.markExpired()
    } else if (user && payload?.access_token) {
      // no expiry information: trust the token
      authStore.setToken(payload)
      authStore.setUser(user)
    } else if (!payload) {
      authStore.clearAuth()
    }
  }

  let session = data.value
  // Client side: make sure the session is fresh (this also refreshes the
  // access token server side when it expired).
  if (import.meta.client) {
    try {
      session = await getSession()
    } catch (err) {
      console.debug('[auth-plugin] getSession failed', err)
    }
  }

  if (session?.user || status.value === 'authenticated' || authStore.user) {
    try {
      const { data: token } = await useFetch('/api/token', { headers })
      applyToken(token.value, session?.user || data.value?.user)
    } catch (error) {
      console.debug('[auth-plugin] session unavailable', error)
      authStore.clearAuth()
    }
  }

  let refreshing = null
  let timer = null

  const scheduleRefresh = () => {
    if (timer) clearTimeout(timer)
    timer = null
    const delay = authStore.isAuthenticated ? tokenRefreshDelayMs(authStore.token) : null
    if (delay !== null) timer = setTimeout(refreshAuthToken, delay)
  }

  /**
   * Fetch a fresh access token. Reading the session runs the server-side jwt
   * callback, which renews the token with the refresh token when it is about
   * to expire; /api/token then returns the renewed one. Resolves to true when
   * a usable token is available.
   */
  const refreshAuthToken = () => {
    if (!import.meta.client) return Promise.resolve(false)
    if (!refreshing) {
      refreshing = (async () => {
        try {
          const fresh = await getSession()
          applyToken(await $fetch('/api/token'), fresh?.user)
        } catch (err) {
          console.debug('[auth-plugin] token refresh failed', err)
        } finally {
          refreshing = null
          scheduleRefresh()
        }
        return isTokenUsable(authStore.token)
      })()
    }
    return refreshing
  }

  if (import.meta.client) {
    // After hydration, so that the page first renders the state rendered by
    // the server. The token handed to the server render may be stale (it
    // reads the cookie as it was before this load refreshed the session).
    nuxtApp.hook('app:mounted', () => {
      if (session?.user && !isTokenUsable(authStore.token)) refreshAuthToken()
      else scheduleRefresh()
    })
  }

  return { provide: { refreshAuthToken } }
})
