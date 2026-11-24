/**
 * Content-Security-Policy built from a JSON policy file (see config/csp.json and
 * docs/configuration.md). Pure functions only: the file is loaded by
 * server/utils/cspConfig.ts and the header is set by server/middleware/csp.ts.
 */

export type CspDirectiveValue = string[] | true

export type CspPolicy = {
  enabled: boolean
  reportOnly: boolean
  directives: Record<string, CspDirectiveValue>
}

/** Values substituted for the `{NAME}` placeholders of the policy. */
export type CspVariables = Record<string, string | undefined>

export type CspHeader = { name: string; value: string }

export const CSP_HEADER = 'Content-Security-Policy'
export const CSP_REPORT_ONLY_HEADER = 'Content-Security-Policy-Report-Only'

const DIRECTIVE_NAME = /^[a-z][a-z0-9-]*$/
const PLACEHOLDER = /^\{([A-Z][A-Z0-9_]*)\}$/
// A source expression never contains blanks, ';' or ',' (they would split or
// inject directives) nor control characters.
const FORBIDDEN_IN_SOURCE = /[\s;,\u0000-\u001f\u007f]/

/**
 * Origin (`scheme://host[:port]`) of a URL, or '' when the value is empty or
 * not a URL. With `websocket`, http(s) URLs are turned into ws(s) origins, as
 * the process page does with NUXT_WS_URL.
 */
export function urlOrigin(value?: string | null, websocket = false): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    let protocol = url.protocol
    if (websocket) {
      if (protocol === 'http:') protocol = 'ws:'
      else if (protocol === 'https:') protocol = 'wss:'
    }
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(protocol)) return ''
    return `${protocol}//${url.host}`
  } catch {
    return ''
  }
}

/** Placeholder values taken from the public runtime config of the UI. */
export function cspVariables(publicConfig: Record<string, any> = {}): CspVariables {
  return {
    ZOO_API: urlOrigin(publicConfig.NUXT_ZOO_BASEURL),
    ZOO_WS: urlOrigin(publicConfig.NUXT_WS_URL, true),
    OIDC_ISSUER: urlOrigin(publicConfig.NUXT_OIDC_ISSUER)
  }
}

/**
 * Validate a parsed policy file. Throws on a wrong structure (the caller then
 * keeps the built-in policy); drops and reports invalid directives.
 */
export function parseCspPolicy(raw: unknown): { policy: CspPolicy; warnings: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('the policy must be a JSON object')
  }
  const doc = raw as Record<string, unknown>
  const warnings: string[] = []

  for (const key of Object.keys(doc)) {
    if (!['enabled', 'reportOnly', 'directives'].includes(key) && !key.startsWith('$')) {
      warnings.push(`unknown key "${key}" ignored`)
    }
  }
  if (doc.enabled !== undefined && typeof doc.enabled !== 'boolean') {
    throw new Error('"enabled" must be true or false')
  }
  if (doc.reportOnly !== undefined && typeof doc.reportOnly !== 'boolean') {
    throw new Error('"reportOnly" must be true or false')
  }
  const rawDirectives = doc.directives ?? {}
  if (!rawDirectives || typeof rawDirectives !== 'object' || Array.isArray(rawDirectives)) {
    throw new Error('"directives" must be an object')
  }

  const directives: Record<string, CspDirectiveValue> = {}
  for (const [name, value] of Object.entries(rawDirectives as Record<string, unknown>)) {
    const key = name.trim().toLowerCase()
    if (!DIRECTIVE_NAME.test(key)) {
      warnings.push(`directive "${name}" ignored: invalid name`)
      continue
    }
    if (value === false || value === null) continue
    if (value === true) {
      directives[key] = true
      continue
    }
    const list = typeof value === 'string' ? value.trim().split(/\s+/).filter(Boolean) : value
    if (!Array.isArray(list) || list.some((item) => typeof item !== 'string')) {
      warnings.push(`directive "${name}" ignored: expected a list of sources, a string or true`)
      continue
    }
    directives[key] = list as string[]
  }

  return {
    policy: { enabled: doc.enabled !== false, reportOnly: doc.reportOnly === true, directives },
    warnings
  }
}

/**
 * Header for a policy, or null when the policy is disabled or empty.
 * Placeholders resolving to nothing (variable not set) are dropped; a fetch
 * directive left without any source becomes `'none'`.
 */
export function buildCspHeader(
  policy: CspPolicy,
  variables: CspVariables = {}
): { header: CspHeader | null; warnings: string[] } {
  const warnings: string[] = []
  if (!policy.enabled) return { header: null, warnings }

  const parts: string[] = []
  for (const [name, value] of Object.entries(policy.directives)) {
    if (value === true) {
      parts.push(name)
      continue
    }
    const sources: string[] = []
    for (const item of value) {
      let source = item.trim()
      const placeholder = PLACEHOLDER.exec(source)
      if (placeholder) {
        const key = placeholder[1]
        if (!(key in variables)) {
          warnings.push(`${name}: unknown placeholder ${source} ignored`)
          continue
        }
        source = String(variables[key] ?? '').trim()
        if (!source) continue
      }
      if (!source) continue
      if (FORBIDDEN_IN_SOURCE.test(source)) {
        warnings.push(`${name}: invalid source ${JSON.stringify(item)} ignored`)
        continue
      }
      if (!sources.includes(source)) sources.push(source)
    }
    parts.push(sources.length ? `${name} ${sources.join(' ')}` : `${name} 'none'`)
  }

  if (!parts.length) return { header: null, warnings }
  return {
    header: { name: policy.reportOnly ? CSP_REPORT_ONLY_HEADER : CSP_HEADER, value: parts.join('; ') },
    warnings
  }
}
