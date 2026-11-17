import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  formatDurationMs,
  isActiveStatus,
  isLogLink,
  isTerminalStatus,
  jobDurationMs,
  jobsQuery,
  linkRelLabel,
  nextSkip,
  normalizeStatus,
  resultsHref,
  statusColor
} from '../composables/utils/jobs'

describe('job status helpers', () => {
  it('normalises legacy spellings onto OGC API - Processes values', () => {
    expect(normalizeStatus('succeeded')).toBe('successful')
    expect(normalizeStatus('canceled')).toBe('dismissed')
    expect(normalizeStatus('Running')).toBe('running')
    expect(normalizeStatus(undefined)).toBe('')
  })

  it('knows which statuses are terminal or active', () => {
    expect(isTerminalStatus('successful')).toBe(true)
    expect(isTerminalStatus('failed')).toBe(true)
    expect(isTerminalStatus('dismissed')).toBe(true)
    expect(isTerminalStatus('running')).toBe(false)
    expect(isActiveStatus('accepted')).toBe(true)
    expect(isActiveStatus('successful')).toBe(false)
  })

  it('maps statuses to colours', () => {
    expect(statusColor('successful')).toBe('positive')
    expect(statusColor('failed')).toBe('negative')
    expect(statusColor('whatever')).toBe('grey')
  })
})

describe('durations', () => {
  it('formats milliseconds', () => {
    expect(formatDurationMs(500)).toBe('< 1 s')
    expect(formatDurationMs(42_000)).toBe('42 s')
    expect(formatDurationMs(69_000)).toBe('1 min 09 s')
    expect(formatDurationMs(3_725_000)).toBe('1 h 02 min')
    expect(formatDurationMs(null)).toBe('')
  })

  it('computes a job duration from started/finished, or from now when running', () => {
    const job = { started: '2026-11-05T13:00:24.856Z', finished: '2026-11-05T13:01:33.918Z', status: 'successful' }
    expect(formatDurationMs(jobDurationMs(job))).toBe('1 min 09 s')
    const running = { created: '2026-11-05T13:00:00.000Z', status: 'running' }
    const now = new Date('2026-11-05T13:00:30.000Z').getTime()
    expect(jobDurationMs(running, now)).toBe(30_000)
    expect(formatDuration('2026-11-05T13:00:00.000Z', '2026-11-05T13:00:05.000Z')).toBe('5 s')
  })
})

describe('links', () => {
  const job = {
    links: [
      { rel: 'monitor', type: 'application/json', href: 'http://x/jobs/1' },
      { rel: 'http://www.opengis.net/def/rel/ogc/1.0/results', type: 'application/json', href: 'http://x/jobs/1/results' },
      { rel: 'related', type: 'text/plain', href: 'http://x/temp/step.log' }
    ]
  }
  it('finds the results link and labels relations', () => {
    expect(resultsHref(job)).toBe('http://x/jobs/1/results')
    expect(linkRelLabel('http://www.opengis.net/def/rel/ogc/1.0/results')).toBe('results')
    expect(linkRelLabel('monitor')).toBe('monitor')
  })
  it('detects log links', () => {
    expect(isLogLink(job.links[2])).toBe(true)
    expect(isLogLink(job.links[0])).toBe(false)
  })
})

describe('jobs list query', () => {
  it('builds the ZOO-Project query parameters', () => {
    expect(jobsQuery({ limit: 20, skip: 40, status: ['running', 'failed'], processID: 'echo' })).toEqual({
      limit: 20,
      skip: 40,
      status: 'running,failed',
      processID: 'echo'
    })
    expect(jobsQuery({})).toEqual({})
  })
  it('reads the skip of the next link', () => {
    expect(nextSkip({ jobs: [], links: [{ rel: 'next', href: 'http://x/jobs?limit=2&skip=2' }] })).toBe(2)
    expect(nextSkip({ jobs: [], links: [] })).toBeNull()
  })
})
