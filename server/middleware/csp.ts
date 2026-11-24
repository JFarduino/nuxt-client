import { resolve } from 'node:path'
import { defineEventHandler, setResponseHeader } from 'h3'
import builtInPolicyFile from '../../config/csp.json'
import { buildCspHeader, cspVariables, parseCspPolicy, type CspHeader, type CspPolicy } from '../utils/csp'
import { createCspPolicyLoader } from '../utils/cspConfig'

// The policy shipped in the image (config/csp.json at build time) is also the
// fallback when the deployment's file is missing or invalid.
const builtInPolicy = parseCspPolicy(builtInPolicyFile).policy

const loader = createCspPolicyLoader({
  file: resolve(process.env.NUXT_CSP_CONFIG_FILE || 'config/csp.json'),
  fallback: builtInPolicy
})

let cached: { policy: CspPolicy; header: CspHeader | null } | null = null

/** Sends the Content-Security-Policy header with every response. */
export default defineEventHandler((event) => {
  const policy = loader.current()
  if (!cached || cached.policy !== policy) {
    const { header, warnings } = buildCspHeader(policy, cspVariables(useRuntimeConfig(event).public))
    for (const warning of warnings) console.warn(`[csp] ${warning}`)
    cached = { policy, header }
  }
  if (cached.header) {
    setResponseHeader(event, cached.header.name, cached.header.value)
  }
})
