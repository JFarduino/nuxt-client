import { readFileSync, statSync } from 'node:fs'
import { parseCspPolicy, type CspPolicy } from './csp'

type Logger = { info: (message: string) => void; warn: (message: string) => void }

export type CspPolicyLoaderOptions = {
  /** Policy file (JSON). It may be missing: the fallback policy then applies. */
  file: string
  /** Built-in policy, used when the file is missing or invalid. */
  fallback: CspPolicy
  /** How often the file is checked for changes (default 5 s). */
  checkIntervalMs?: number
  now?: () => number
  logger?: Logger
}

/**
 * Reads the CSP policy file and re-reads it when it changes (Kubernetes updates
 * a mounted ConfigMap in place), at most once per `checkIntervalMs`.
 */
export function createCspPolicyLoader(options: CspPolicyLoaderOptions) {
  const { file, fallback, checkIntervalMs = 5000, now = Date.now, logger = console } = options
  let policy = fallback
  let loadedVersion: string | undefined
  let checkedAt = Number.NEGATIVE_INFINITY

  const fileVersion = () => {
    try {
      const stats = statSync(file)
      return stats.isFile() ? `${stats.mtimeMs}:${stats.size}` : 'missing'
    } catch {
      return 'missing'
    }
  }

  const refresh = () => {
    const version = fileVersion()
    if (version === loadedVersion) return
    loadedVersion = version
    if (version === 'missing') {
      policy = fallback
      logger.info(`[csp] ${file} not found: using the built-in policy`)
      return
    }
    try {
      const { policy: parsed, warnings } = parseCspPolicy(JSON.parse(readFileSync(file, 'utf8')))
      for (const warning of warnings) logger.warn(`[csp] ${file}: ${warning}`)
      policy = parsed
      logger.info(`[csp] policy loaded from ${file}`)
    } catch (err: any) {
      policy = fallback
      logger.warn(`[csp] ${file} is invalid (${err?.message || err}): using the built-in policy`)
    }
  }

  return {
    current(): CspPolicy {
      const time = now()
      if (time - checkedAt >= checkIntervalMs) {
        checkedAt = time
        refresh()
      }
      return policy
    }
  }
}
