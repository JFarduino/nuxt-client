import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import defaultPolicyFile from '../config/csp.json'
import {
  buildCspHeader,
  CSP_HEADER,
  CSP_REPORT_ONLY_HEADER,
  cspVariables,
  parseCspPolicy,
  urlOrigin
} from '../server/utils/csp'
import { createCspPolicyLoader } from '../server/utils/cspConfig'

const silent = { info: () => {}, warn: () => {} }

describe('urlOrigin', () => {
  it('keeps the scheme, host and port only', () => {
    expect(urlOrigin('http://localhost:8080/ogc-api/')).toBe('http://localhost:8080')
    expect(urlOrigin('https://auth.example.org/realms/zoo')).toBe('https://auth.example.org')
  })
  it('turns http(s) into ws(s) for WebSocket URLs', () => {
    expect(urlOrigin('ws://localhost:8888', true)).toBe('ws://localhost:8888')
    expect(urlOrigin('https://ws.example.org/', true)).toBe('wss://ws.example.org')
    expect(urlOrigin('http://ws.example.org', true)).toBe('ws://ws.example.org')
  })
  it('returns an empty string for missing or invalid values', () => {
    expect(urlOrigin(undefined)).toBe('')
    expect(urlOrigin('  ')).toBe('')
    expect(urlOrigin('not a url')).toBe('')
    expect(urlOrigin('javascript:alert(1)')).toBe('')
  })
})

describe('parseCspPolicy', () => {
  it('reads directives given as lists, strings or flags', () => {
    const { policy, warnings } = parseCspPolicy({
      $comment: 'ignored',
      directives: { 'Connect-Src': ["'self'"], 'img-src': "'self' data:", 'upgrade-insecure-requests': true, 'frame-ancestors': false }
    })
    expect(warnings).toEqual([])
    expect(policy).toEqual({
      enabled: true,
      reportOnly: false,
      directives: { 'connect-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'upgrade-insecure-requests': true }
    })
  })
  it('rejects a wrong structure', () => {
    expect(() => parseCspPolicy([])).toThrow()
    expect(() => parseCspPolicy({ enabled: 'yes' })).toThrow()
    expect(() => parseCspPolicy({ directives: [] })).toThrow()
  })
  it('drops invalid directives with a warning', () => {
    const { policy, warnings } = parseCspPolicy({ other: 1, directives: { 'bad name': ["'self'"], 'img-src': [1] } })
    expect(policy.directives).toEqual({})
    expect(warnings).toHaveLength(3)
  })
})

describe('buildCspHeader', () => {
  const vars = { ZOO_API: 'http://localhost:8080', ZOO_WS: '', OIDC_ISSUER: 'https://auth.example.org' }

  it('replaces the placeholders and drops the empty ones', () => {
    const { policy } = parseCspPolicy({
      directives: { 'connect-src': ["'self'", '{ZOO_API}', '{ZOO_WS}', '{OIDC_ISSUER}', '{ZOO_API}'], 'object-src': ["'none'"] }
    })
    const { header, warnings } = buildCspHeader(policy, vars)
    expect(warnings).toEqual([])
    expect(header).toEqual({
      name: CSP_HEADER,
      value: "connect-src 'self' http://localhost:8080 https://auth.example.org; object-src 'none'"
    })
  })
  it('uses the report-only header when asked', () => {
    const { policy } = parseCspPolicy({ reportOnly: true, directives: { 'connect-src': ["'self'"] } })
    expect(buildCspHeader(policy).header?.name).toBe(CSP_REPORT_ONLY_HEADER)
  })
  it('sends nothing when disabled or empty', () => {
    expect(buildCspHeader(parseCspPolicy({ enabled: false, directives: { 'connect-src': ["'self'"] } }).policy).header).toBeNull()
    expect(buildCspHeader(parseCspPolicy({ directives: {} }).policy).header).toBeNull()
  })
  it('refuses sources that would inject directives and unknown placeholders', () => {
    const { policy } = parseCspPolicy({
      directives: { 'connect-src': ["'self'", "https://a.org; script-src *", '{NOPE}'], 'upgrade-insecure-requests': true }
    })
    const { header, warnings } = buildCspHeader(policy, vars)
    expect(header?.value).toBe("connect-src 'self'; upgrade-insecure-requests")
    expect(warnings).toHaveLength(2)
  })
  it("writes 'none' when no source is left", () => {
    const { policy } = parseCspPolicy({ directives: { 'connect-src': ['{ZOO_WS}'] } })
    expect(buildCspHeader(policy, vars).header?.value).toBe("connect-src 'none'")
  })
})

describe('default policy (config/csp.json)', () => {
  it('only lets the page connect to its own server, the ZOO API, websocketd and the identity provider', () => {
    const { policy, warnings } = parseCspPolicy(defaultPolicyFile)
    expect(warnings).toEqual([])
    const variables = cspVariables({
      NUXT_ZOO_BASEURL: 'http://localhost:8080',
      NUXT_WS_URL: 'ws://localhost:8888',
      NUXT_OIDC_ISSUER: 'https://auth.geolabs.fr/realms/zooproject'
    })
    const { header } = buildCspHeader(policy, variables)
    expect(header?.name).toBe(CSP_HEADER)
    expect(header?.value).toBe(
      "connect-src 'self' http://localhost:8080 ws://localhost:8888 https://auth.geolabs.fr https://epsg.io https://raw.githubusercontent.com; " +
        "object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
    )
  })
})

describe('createCspPolicyLoader', () => {
  let dir = ''
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = ''
  })
  const fallback = parseCspPolicy({ directives: { 'connect-src': ["'self'"] } }).policy

  it('uses the fallback while the file is missing, then the file once it appears', () => {
    dir = mkdtempSync(join(tmpdir(), 'csp-'))
    const file = join(dir, 'csp.json')
    let time = 0
    const loader = createCspPolicyLoader({ file, fallback, checkIntervalMs: 1000, now: () => time, logger: silent })
    expect(loader.current()).toBe(fallback)

    writeFileSync(file, JSON.stringify({ reportOnly: true, directives: { 'img-src': ["'self'"] } }))
    time = 500
    expect(loader.current()).toBe(fallback) // not checked again yet
    time = 1000
    expect(loader.current().reportOnly).toBe(true)
  })

  it('reloads a modified file and falls back when it becomes invalid', () => {
    dir = mkdtempSync(join(tmpdir(), 'csp-'))
    const file = join(dir, 'csp.json')
    writeFileSync(file, JSON.stringify({ directives: { 'img-src': ["'self'"] } }))
    let time = 0
    const loader = createCspPolicyLoader({ file, fallback, checkIntervalMs: 0, now: () => time, logger: silent })
    expect(Object.keys(loader.current().directives)).toEqual(['img-src'])

    writeFileSync(file, '{ not json')
    utimesSync(file, new Date(), new Date(Date.now() + 5000))
    time = 1
    expect(loader.current()).toBe(fallback)
  })
})
