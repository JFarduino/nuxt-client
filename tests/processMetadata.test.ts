import { describe, expect, it } from 'vitest'
import {
  cleanDescription,
  formatDate,
  formatUtcDateTime,
  isIsoDate,
  termOf,
  uniqueProcesses,
  ioEntries,
  ioType,
  isTranslationHeader,
  processDescription,
  summarizeProvenance
} from '../composables/utils/processMetadata'

// Metadata of the helloworld_pipeline application package as ZOO-Project returns it.
const org = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Example Lab',
  url: 'https://lab.example.org',
  address: { class: 's:PostalAddress', 's:addressCountry': 'PT' }
}
const metadata = [
  { role: 'https://schema.org/name', value: 'helloworld_pipeline' },
  { role: 'https://schema.org/description', value: 'This pipeline runs the helloworld tool and returns the result.\n' },
  { role: 'https://schema.org/softwareVersion', value: '0.4.0' },
  { role: 'https://schema.org/producer', value: org },
  { role: 'https://schema.org/sourceOrganization', value: org },
  { role: 'https://schema.org/author', value: { '@type': 'Person', name: 'Ada Author', email: 'ada@example.org' } },
  { role: 'https://schema.org/dateCreated', value: '2025-11-24T23:07:35Z' },
  { role: 'https://schema.org/identifier', value: 'urn:apkg:workflow:example:helloworld_pipeline:0.4.0' },
  { role: 'https://schema.org/sdDatePublished', value: '2025-11-24T23:11:32.936364Z' },
  { role: 'https://schema.org/sdPublisher', value: { '@type': 'Organization', name: 'Package Registry', url: 'https://registry.example.org' } },
  { role: 'https://schema.org/license', value: 'https://www.apache.org/licenses/LICENSE-2.0' }
]

describe('descriptions', () => {
  const header = 'Project-Id-Version: ZOO-Kernel Internationalization\nReport-Msgid-Bugs-To: \nLanguage: fr_FR'

  it('recognises the message catalogue header returned for empty descriptions', () => {
    expect(isTranslationHeader(header)).toBe(true)
    expect(isTranslationHeader('A real description')).toBe(false)
    expect(cleanDescription(header)).toBe('')
    expect(cleanDescription('  Echo input  ')).toBe('Echo input')
  })

  it('falls back to the description of the package', () => {
    expect(processDescription({ description: header, metadata })).toBe('This pipeline runs the helloworld tool and returns the result.')
    expect(processDescription({ description: '', metadata })).toBe('This pipeline runs the helloworld tool and returns the result.')
    expect(processDescription({ description: 'Own text', metadata })).toBe('Own text')
    expect(processDescription({ description: '' })).toBe('')
  })
})

describe('summarizeProvenance', () => {
  it('merges an organisation listed under several roles and keeps the other facts', () => {
    const p = summarizeProvenance(metadata)
    expect(p.organizations).toEqual([
      { name: 'Example Lab', url: 'https://lab.example.org', country: 'PT', roles: ['producer', 'sourceOrganization'] }
    ])
    expect(p.authors).toEqual([{ name: 'Ada Author', email: 'ada@example.org' }])
    expect(p.identifier).toBe('urn:apkg:workflow:example:helloworld_pipeline:0.4.0')
    expect(p.dateCreated).toBe('2025-11-24T23:07:35Z')
    expect(p.datePublished).toBe('2025-11-24T23:11:32.936364Z')
    expect(p.publisher).toEqual({ name: 'Package Registry', url: 'https://registry.example.org', roles: ['sdPublisher'] })
    expect(p.others).toEqual([
      { label: 'license', value: 'https://www.apache.org/licenses/LICENSE-2.0', href: 'https://www.apache.org/licenses/LICENSE-2.0' }
    ])
  })

  it('handles missing or odd metadata', () => {
    expect(summarizeProvenance(undefined)).toEqual({ authors: [], organizations: [], others: [] })
    const p = summarizeProvenance([
      { role: 'https://schema.org/author', value: ['Bob', { givenName: 'Cy', familyName: 'Dee' }, 'Bob'] },
      { title: 'Documentation', href: 'https://docs.example.org' },
      { role: 'https://schema.org/datePublished', value: '2024-01-02' },
      { role: 'https://schema.org/sdDatePublished', value: '2025-01-01' }
    ])
    expect(p.authors.map((a) => a.name)).toEqual(['Bob', 'Cy Dee'])
    expect(p.others).toEqual([{ label: 'Documentation', value: '', href: 'https://docs.example.org' }])
    expect(p.datePublished).toBe('2024-01-02')
  })
})

describe('formatDate', () => {
  it('formats dates for the reader', () => {
    expect(formatDate('2025-11-24T23:07:35Z', 'fr')).toBe('24/11/2025')
    expect(formatDate('2025-11-24T23:07:35Z', 'en')).toBe('24/11/2025')
    expect(formatDate('not a date', 'fr')).toBe('not a date')
    expect(formatDate(undefined, 'fr')).toBe('')
  })
})

describe('inputs and outputs', () => {
  it('reads types, links and required inputs', () => {
    expect(ioType({ schema: { type: 'integer' } })).toEqual({ label: 'integer' })
    expect(ioType({ 'original-schema': { allOf: [{ $ref: 'https://x/stac.json' }, { format: 'stac-collection' }] } })).toEqual({
      label: 'stac-collection',
      link: 'https://x/stac.json'
    })
    expect(
      ioType({ schema: { oneOf: [{ type: 'string', format: 'uri' }, { $ref: 'https://schemas.stacspec.org/v1.0.0/item-spec/json-schema/item.json' }] } })
    ).toEqual({ label: 'STAC', link: 'https://schemas.stacspec.org/v1.0.0/item-spec/json-schema/item.json' })
    expect(ioType({})).toEqual({ label: 'object' })

    const inputs = ioEntries(
      {
        seconds: { title: 'seconds', description: 'number of seconds', minOccurs: 0, schema: { type: 'integer' } },
        name: { description: 'Some keyword', schema: { type: 'string' } }
      },
      'input'
    )
    expect(inputs).toEqual([
      { id: 'seconds', description: 'number of seconds', required: false, formats: [], type: { label: 'integer' } },
      { id: 'name', description: 'Some keyword', required: true, formats: [], type: { label: 'string' } }
    ])
    expect(ioEntries({ out: { title: 'Result', schema: { type: 'string' } } }, 'output')).toEqual([
      { id: 'out', title: 'Result', description: '', formats: [], type: { label: 'string' } }
    ])
    expect(ioEntries(null, 'input')).toEqual([])
    // ZOO-Project writes Python's None for a missing title or description.
    expect(ioEntries({ wf_outputs: { title: 'None', description: 'None', schema: { type: 'string' } } }, 'output')).toEqual([
      { id: 'wf_outputs', description: '', formats: [], type: { label: 'string' } }
    ])
    expect(cleanDescription('None')).toBe('')
  })
})

describe('complete input and output descriptions', () => {
  it('keeps defaults, multiplicity, formats and array types', () => {
    const [bands] = ioEntries({ bands: { title: 'bands', maxOccurs: 999, schema: { type: 'array', items: { type: 'string' }, default: ['green', 'nir'] } } }, 'input')
    expect(bands).toEqual({ id: 'bands', required: true, multiple: '999', defaultValue: '["green","nir"]', description: '', formats: [], type: { label: 'string[]' } })
    const [b] = ioEntries({ b: { minOccurs: 0, schema: { oneOf: [{ type: 'string', contentMediaType: 'text/xml' }, { type: 'object' }] } } }, 'input')
    expect(b.formats).toEqual(['text/xml'])
    expect(b.type).toEqual({ label: 'string | object' })
    const [pause] = ioEntries({ pause: { minOccurs: 0, schema: { type: 'number', default: 10 } } }, 'input')
    expect(pause.defaultValue).toBe('10')
  })
})

describe('list and metadata helpers', () => {
  it('drops processes listed twice', () => {
    expect(uniqueProcesses([{ id: 'a', n: 1 }, { id: 'b' }, { id: 'a', n: 2 }])).toEqual([{ id: 'a', n: 1 }, { id: 'b' }])
  })
  it('names metadata terms and formats timestamps', () => {
    expect(termOf('https://schema.org/sourceOrganization')).toBe('sourceOrganization')
    expect(termOf('s:addressCountry')).toBe('addressCountry')
    expect(isIsoDate('2025-11-24T23:11:32.936364Z')).toBe(true)
    expect(isIsoDate('2024-01-02')).toBe(true)
    expect(isIsoDate('INESCTEC')).toBe(false)
    expect(formatUtcDateTime('2025-11-24T23:07:35Z', 'fr')).toBe('24/11/2025 23:07 UTC')
  })
})
