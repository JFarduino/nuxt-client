/**
 * Helpers for the process preview of the processes list: a description that
 * survives the server's empty or untranslated values, the schema.org metadata
 * of an application package summarised as provenance (authors, organisations
 * merged when they repeat, identifier, dates, publisher), and a compact view of
 * the inputs and outputs.
 */

export type Person = { name: string; email?: string; url?: string }
export type Organization = { name: string; url?: string; country?: string; roles: string[] }
export type MetadataEntry = { label: string; value: string; href?: string }
export type Provenance = {
  authors: Person[]
  organizations: Organization[]
  identifier?: string
  dateCreated?: string
  datePublished?: string
  publisher?: Organization
  others: MetadataEntry[]
}
export type IoType = { label: string; link?: string }
export type IoEntry = { id: string; title?: string; description: string; required?: boolean; type: IoType }

// ZOO-Project translates the process description with gettext; an empty one
// comes back as the header of its message catalogue ("Project-Id-Version: ...").
const TRANSLATION_HEADER = /(^|\n)\s*Project-Id-Version:/

export function isTranslationHeader(text: unknown): boolean {
  return typeof text === 'string' && TRANSLATION_HEADER.test(text)
}

// Values the server writes for a missing title or description (Python's None).
const EMPTY_VALUES = new Set(['none', 'null', 'undefined'])

/** The text itself, or '' when it is empty, a placeholder like `None` or a message catalogue header. */
export function cleanDescription(text: unknown): string {
  if (typeof text !== 'string') return ''
  const value = text.trim()
  return !value || EMPTY_VALUES.has(value.toLowerCase()) || isTranslationHeader(value) ? '' : value
}

/** Last segment of a metadata role, e.g. `https://schema.org/author` -> `author`. */
export function metadataRole(entry: any): string {
  return String(entry?.role || '').split(/[/#]/).pop() || ''
}

/** Value of the first metadata entry with that role. */
export function metadataValue(metadata: unknown, role: string): unknown {
  if (!Array.isArray(metadata)) return undefined
  return metadata.find((entry) => metadataRole(entry) === role)?.value
}

/** Description of a process, falling back to the schema.org description of its package. */
export function processDescription(process: any): string {
  return cleanDescription(process?.description) || cleanDescription(metadataValue(process?.metadata, 'description'))
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const field = (value: any, key: string): unknown => value?.[key] ?? value?.[`s:${key}`] ?? value?.[`schema:${key}`]

function countryOf(address: any): string {
  if (!address || typeof address !== 'object') return ''
  return text(field(address, 'addressCountry'))
}

function toOrganization(value: any, role: string): Organization | null {
  if (typeof value === 'string') return value.trim() ? { name: value.trim(), roles: [role] } : null
  if (!value || typeof value !== 'object') return null
  const name = text(field(value, 'name'))
  if (!name) return null
  const url = text(field(value, 'url'))
  const country = countryOf(field(value, 'address'))
  return { name, ...(url ? { url } : {}), ...(country ? { country } : {}), roles: [role] }
}

function toPerson(value: any): Person | null {
  if (typeof value === 'string') return value.trim() ? { name: value.trim() } : null
  if (!value || typeof value !== 'object') return null
  const name = text(field(value, 'name')) || [text(field(value, 'givenName')), text(field(value, 'familyName'))].filter(Boolean).join(' ')
  if (!name) return null
  const email = text(field(value, 'email'))
  const url = text(field(value, 'url'))
  return { name, ...(email ? { email } : {}), ...(url ? { url } : {}) }
}

function displayValue(value: any): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    const name = text(field(value, 'name'))
    if (name) return name
    return Object.entries(value)
      .filter(([key]) => !['@context', '@type', 'class'].includes(key))
      .map(([key, v]) => `${key.replace(/^s:|^schema:/, '')}: ${displayValue(v)}`)
      .join(', ')
  }
  return ''
}

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value)

const PERSON_ROLES = ['author', 'contributor', 'creator', 'maintainer']
const ORGANIZATION_ROLES = ['producer', 'sourceOrganization', 'provider', 'publisher', 'funder', 'copyrightHolder']
// Shown elsewhere in the preview (title, description, version, keywords).
const SHOWN_ELSEWHERE = ['name', 'description', 'softwareVersion', 'version', 'keywords']

/** schema.org metadata of a process grouped for display; repeated organisations are merged. */
export function summarizeProvenance(metadata: unknown): Provenance {
  const provenance: Provenance = { authors: [], organizations: [], others: [] }
  if (!Array.isArray(metadata)) return provenance

  for (const entry of metadata) {
    const role = metadataRole(entry)
    const values = Array.isArray(entry?.value) ? entry.value : [entry?.value]

    if (PERSON_ROLES.includes(role)) {
      for (const value of values) {
        const person = toPerson(value)
        if (person && !provenance.authors.some((p) => p.name === person.name && p.email === person.email)) {
          provenance.authors.push(person)
        }
      }
    } else if (ORGANIZATION_ROLES.includes(role)) {
      for (const value of values) {
        const organization = toOrganization(value, role)
        if (!organization) continue
        const same = provenance.organizations.find((o) => o.name === organization.name && (o.url || '') === (organization.url || ''))
        if (same) {
          if (!same.roles.includes(role)) same.roles.push(role)
          if (!same.country && organization.country) same.country = organization.country
        } else {
          provenance.organizations.push(organization)
        }
      }
    } else if (role === 'sdPublisher') {
      provenance.publisher = toOrganization(values[0], 'sdPublisher') || provenance.publisher
    } else if (role === 'identifier') {
      provenance.identifier = displayValue(values[0]) || provenance.identifier
    } else if (role === 'dateCreated') {
      provenance.dateCreated = text(values[0]) || provenance.dateCreated
    } else if (role === 'datePublished') {
      provenance.datePublished = text(values[0]) || provenance.datePublished
    } else if (role === 'sdDatePublished') {
      provenance.datePublished = provenance.datePublished || text(values[0]) || undefined
    } else if (!SHOWN_ELSEWHERE.includes(role)) {
      const label = role || text(entry?.title)
      const value = displayValue(entry?.value) || (role ? text(entry?.title) : '')
      const href = text(entry?.href) || (isHttpUrl(value) ? value : '')
      if (label || value) provenance.others.push({ label: label || value, value, ...(href ? { href } : {}) })
    }
  }
  return provenance
}

/** True when there is anything to show in the provenance block. */
export function hasProvenance(provenance: Provenance): boolean {
  return Boolean(
    provenance.authors.length ||
      provenance.organizations.length ||
      provenance.identifier ||
      provenance.dateCreated ||
      provenance.datePublished ||
      provenance.publisher ||
      provenance.others.length
  )
}

/** Date of an ISO timestamp in the reader's locale (24/11/2025 in French), or the text itself. */
export function formatDate(value: string | undefined, locale = 'en'): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const tag = locale === 'fr' ? 'fr-FR' : locale === 'en' ? 'en-GB' : locale
  return date.toLocaleDateString(tag, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}

/** Short type of an input or output description, with the link of its schema when it has one. */
export function ioType(definition: any): IoType {
  const schema = definition?.['original-schema'] || definition?.schema || definition
  if (Array.isArray(schema?.allOf)) {
    const ref = schema.allOf.find((s: any) => s?.$ref)?.$ref
    const format = schema.allOf.find((s: any) => s?.format)?.format
    if (format && ref) return { label: format, link: ref }
  }
  if (Array.isArray(schema?.oneOf)) {
    const refs: string[] = schema.oneOf.map((s: any) => s?.$ref).filter(Boolean)
    if (refs.some((ref) => /stac/i.test(ref))) return { label: 'STAC', link: refs.find((ref) => /stac/i.test(ref)) }
    const types = [...new Set(schema.oneOf.map((s: any) => s?.format || s?.type).filter(Boolean))]
    if (types.length) return { label: types.join(' | ') }
  }
  if (schema?.type) return { label: Array.isArray(schema.type) ? schema.type.join(' | ') : String(schema.type) }
  return { label: 'object' }
}

/** Inputs or outputs of a process description as a list; inputs say whether they are required. */
export function ioEntries(map: unknown, kind: 'input' | 'output'): IoEntry[] {
  if (!map || typeof map !== 'object') return []
  return Object.entries(map as Record<string, any>).map(([id, definition]) => ({
    id,
    ...(cleanDescription(definition?.title) && cleanDescription(definition?.title) !== id ? { title: cleanDescription(definition.title) } : {}),
    description: cleanDescription(definition?.description),
    ...(kind === 'input' ? { required: Number(definition?.minOccurs ?? 1) > 0 } : {}),
    type: ioType(definition)
  }))
}
