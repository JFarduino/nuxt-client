<template>
  <div class="process-preview">
    <div class="row q-col-gutter-lg">
      <div v-if="hasPackage" class="col-12 col-md-7">
        <q-banner v-if="cwlError" dense rounded class="process-preview__notice">
          <template #avatar><q-icon name="info" color="warning" /></template>
          {{ cwlError }}
        </q-banner>
        <q-skeleton v-else-if="!cwlText" type="rect" height="300px" class="rounded-borders" />
        <CwlGraph v-else :cwl="cwlText" :name="process.id" height="300px" />
      </div>

      <div :class="hasPackage ? 'col-12 col-md-5' : 'col-12'">
        <div class="process-preview__side">
          <p v-if="description" class="process-preview__description">{{ description }}</p>

          <div class="process-preview__actions">
            <q-btn unelevated no-caps color="primary" icon="play_arrow" :label="t('Execute')" @click="emit('execute')" />
            <q-btn outline no-caps color="primary" :label="t('Jobs')" @click="emit('jobs')" />
            <q-btn
              v-if="process.mutable"
              outline
              no-caps
              color="primary"
              :label="t('CWL package')"
              @click="emit('package')"
            />
            <q-btn v-if="process.mutable" flat round dense icon="more_vert" :aria-label="t('More actions')">
              <q-tooltip>{{ t('More actions') }}</q-tooltip>
              <q-menu anchor="bottom right" self="top right">
                <q-list dense style="min-width: 180px">
                  <q-item v-close-popup clickable @click="emit('replace')">
                    <q-item-section avatar><q-icon name="published_with_changes" /></q-item-section>
                    <q-item-section>{{ t('Replace') }}</q-item-section>
                  </q-item>
                  <q-separator />
                  <q-item v-close-popup clickable @click="emit('delete')">
                    <q-item-section avatar><q-icon name="delete" color="negative" /></q-item-section>
                    <q-item-section class="text-negative">{{ t('Delete') }}</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
          </div>

          <div v-if="chips.length" class="process-preview__chips">
            <q-chip
              v-for="chip in chips"
              :key="chip.label"
              dense
              square
              :outline="chip.outline"
              :icon="chip.icon"
              class="q-ml-none"
            >
              {{ chip.label }}
            </q-chip>
          </div>

          <div v-if="loading && !detail" class="column q-gutter-sm">
            <q-skeleton type="text" width="40%" />
            <q-skeleton type="rect" height="120px" />
          </div>
          <div v-else class="process-preview__io">
            <section v-for="group in ioGroups" :key="group.kind" :aria-label="group.title" class="process-preview__group">
              <h4 class="process-preview__heading">{{ group.title }} · {{ group.items.length }}</h4>
              <p v-if="!group.items.length" class="process-preview__empty">{{ group.empty }}</p>
              <ul v-else class="process-preview__list">
                <li v-for="item in group.items" :key="item.id" class="process-preview__item">
                  <div class="process-preview__item-head">
                    <span class="process-preview__mono">{{ item.id }}</span>
                    <span v-if="item.title" class="process-preview__item-title">{{ item.title }}</span>
                    <a
                      v-if="item.type.link"
                      :href="item.type.link"
                      target="_blank"
                      rel="noopener"
                      class="process-preview__type process-preview__type--link"
                    >{{ item.type.label }}</a>
                    <span v-else class="process-preview__type">{{ item.type.label }}</span>
                    <span v-if="item.required === true" class="process-preview__badge process-preview__badge--required">{{ t('required') }}</span>
                    <span v-else-if="item.required === false" class="process-preview__badge">{{ t('optional') }}</span>
                  </div>
                  <div v-if="item.description" class="process-preview__item-desc">{{ item.description }}</div>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showProvenance" class="process-preview__provenance">
      <div class="process-preview__summary">
        <span class="process-preview__label">{{ t('Provenance') }}</span>
        <span v-for="(part, index) in summaryParts" :key="index" class="process-preview__part">{{ part }}</span>
        <q-space />
        <q-btn
          flat
          dense
          no-caps
          color="primary"
          :icon-right="detailsOpen ? 'expand_less' : 'expand_more'"
          :label="detailsOpen ? t('Hide details') : t('Details')"
          :aria-expanded="detailsOpen ? 'true' : 'false'"
          @click="detailsOpen = !detailsOpen"
        />
      </div>
      <q-slide-transition>
        <dl v-show="detailsOpen" class="process-preview__dl">
          <template v-if="provenance.authors.length">
            <dt>{{ provenance.authors.length > 1 ? t('Authors') : t('Author') }}</dt>
            <dd>
              <span v-for="person in provenance.authors" :key="person.name + (person.email || '')" class="process-preview__person">
                {{ person.name }}
                <a
                  v-if="person.email"
                  :href="`mailto:${person.email}`"
                  :aria-label="t('Write to {name}', { name: person.name })"
                  class="process-preview__icon-link text-primary"
                ><q-icon name="mail_outline" size="16px" /></a>
              </span>
            </dd>
          </template>
          <template v-if="provenance.organizations.length">
            <dt>{{ t('Organization') }}</dt>
            <dd>
              <div v-for="org in provenance.organizations" :key="org.name + (org.url || '')">
                <span>{{ org.name }}<template v-if="org.country"> · {{ org.country }}</template></span>
                <a v-if="org.url" :href="org.url" target="_blank" rel="noopener" class="q-ml-sm text-primary">{{ hostOf(org.url) }}</a>
                <div class="process-preview__muted">{{ rolesLabel(org.roles) }}</div>
              </div>
            </dd>
          </template>
          <template v-if="provenance.identifier">
            <dt>{{ t('Identifier') }}</dt>
            <dd class="process-preview__identifier">
              <code>{{ provenance.identifier }}</code>
              <CopyButton :text="provenance.identifier" :label="t('Copy the identifier')" size="sm" />
            </dd>
          </template>
          <template v-if="provenance.dateCreated">
            <dt>{{ t('Created on') }}</dt>
            <dd>{{ formatDate(provenance.dateCreated, locale) }}</dd>
          </template>
          <template v-if="provenance.datePublished || provenance.publisher">
            <dt>{{ t('Published') }}</dt>
            <dd>
              <span v-if="provenance.datePublished">{{ formatDate(provenance.datePublished, locale) }}</span>
              <template v-if="provenance.publisher">
                <span>{{ provenance.datePublished ? ', ' : '' }}{{ t('by {publisher}', { publisher: provenance.publisher.name }) }}</span>
                <a v-if="provenance.publisher.url" :href="provenance.publisher.url" target="_blank" rel="noopener" class="q-ml-sm text-primary">{{ hostOf(provenance.publisher.url) }}</a>
              </template>
            </dd>
          </template>
          <template v-for="entry in provenance.others" :key="entry.label + entry.value">
            <dt>{{ entry.label }}</dt>
            <dd>
              <a v-if="entry.href" :href="entry.href" target="_blank" rel="noopener" class="text-primary">{{ entry.value || entry.href }}</a>
              <span v-else>{{ entry.value }}</span>
            </dd>
          </template>
        </dl>
      </q-slide-transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import CwlGraph from '~/components/common/CwlGraph.vue'
import CopyButton from '~/components/common/CopyButton.vue'
import {
  formatDate,
  hasProvenance,
  ioEntries,
  processDescription,
  summarizeProvenance
} from '~/composables/utils/processMetadata'

/**
 * Preview of a process unfolded under its row in the processes list: workflow
 * graph of its application package, actions, inputs and outputs, and the
 * provenance of the package summarised on one line with its details on demand.
 */
const props = defineProps<{
  process: Record<string, any>
  detail?: Record<string, any> | null
  cwlText?: string | null
  cwlError?: string | null
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'execute'): void
  (e: 'jobs'): void
  (e: 'package'): void
  (e: 'replace'): void
  (e: 'delete'): void
}>()

const { t, locale } = useI18n()

// The full description once loaded, the list entry until then.
const source = computed<Record<string, any>>(() => props.detail || props.process || {})
const hasPackage = computed(() => Boolean(props.process?.mutable))
const description = computed(() => processDescription(source.value))
const provenance = computed(() => summarizeProvenance(source.value?.metadata))
const showProvenance = computed(() => hasProvenance(provenance.value))

const detailsOpen = ref(false)
watch(() => props.process?.id, () => {
  detailsOpen.value = false
})

const chips = computed(() => {
  const s = source.value
  const list: { label: string; icon?: string; outline?: boolean }[] = []
  if (s.version) list.push({ label: `v${s.version}` })
  const modes: string[] = s.jobControlOptions || []
  if (modes.includes('sync-execute')) list.push({ label: t('Synchronous'), icon: 'bolt' })
  if (modes.includes('async-execute')) list.push({ label: t('Asynchronous'), icon: 'schedule' })
  if (modes.includes('dismiss')) list.push({ label: t('Dismissible'), icon: 'cancel' })
  for (const keyword of (s.keywords || []).slice(0, 6)) list.push({ label: `#${keyword}`, outline: true })
  return list
})

const ioGroups = computed(() => [
  { kind: 'input', title: t('Inputs'), empty: t('No inputs'), items: ioEntries(source.value.inputs, 'input') },
  { kind: 'output', title: t('Outputs'), empty: t('No outputs'), items: ioEntries(source.value.outputs, 'output') }
])

const ROLE_LABELS: Record<string, string> = {
  producer: 'producer',
  sourceOrganization: 'source organization',
  provider: 'provider',
  publisher: 'publisher',
  funder: 'funder',
  copyrightHolder: 'copyright holder'
}
const rolesLabel = (roles: string[]) => roles.map((role) => t(ROLE_LABELS[role] || role)).join(', ')

const summaryParts = computed(() => {
  const p = provenance.value
  const parts: string[] = []
  if (p.authors.length) parts.push(p.authors.map((person) => person.name).join(', '))
  for (const org of p.organizations) parts.push(org.country ? `${org.name} · ${org.country}` : org.name)
  const date = formatDate(p.datePublished, locale.value)
  if (date && p.publisher) parts.push(t('published on {date} on {publisher}', { date, publisher: p.publisher.name }))
  else if (date) parts.push(t('published on {date}', { date }))
  else if (p.publisher) parts.push(t('by {publisher}', { publisher: p.publisher.name }))
  return parts
})

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
</script>

<style scoped>
.process-preview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 4px 4px;
  cursor: default;
}
.process-preview__side {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.process-preview__description {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.process-preview__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.process-preview__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.process-preview__io {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.process-preview__group {
  min-width: 0;
}
.process-preview__heading {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.75;
}
.process-preview__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.process-preview__item {
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-alt, #f2f2f2);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.process-preview__item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}
.process-preview__mono,
.process-preview__identifier code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.process-preview__item-title {
  font-size: 13px;
  opacity: 0.8;
}
.process-preview__type {
  font-size: 11px;
  line-height: 1.6;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(128, 128, 128, 0.18);
}
.process-preview__type--link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.process-preview__badge {
  font-size: 11px;
  line-height: 1.6;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid rgba(128, 128, 128, 0.45);
}
.process-preview__badge--required {
  border-color: transparent;
  background: rgba(242, 192, 55, 0.25);
}
.process-preview__item-desc {
  font-size: 13px;
  opacity: 0.85;
  overflow-wrap: anywhere;
}
.process-preview__empty {
  margin: 0;
  font-size: 13px;
  opacity: 0.7;
}
.process-preview__notice {
  background: var(--surface-alt, #f2f2f2);
}
.process-preview__provenance {
  padding: 4px 12px;
  border-radius: 8px;
  background: var(--surface-alt, #f2f2f2);
}
.process-preview__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  font-size: 13px;
}
.process-preview__label {
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.7;
}
.process-preview__dl {
  display: grid;
  grid-template-columns: minmax(0, 140px) minmax(0, 1fr);
  gap: 10px 16px;
  margin: 8px 0 10px;
  font-size: 14px;
}
.process-preview__dl dt {
  opacity: 0.7;
}
.process-preview__dl dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.process-preview__person + .process-preview__person::before {
  content: ', ';
}
.process-preview__icon-link {
  display: inline-flex;
  vertical-align: middle;
  margin-left: 4px;
  color: inherit;
}
.process-preview__identifier {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
.process-preview__muted {
  font-size: 12px;
  opacity: 0.7;
}
@media (max-width: 599px) {
  .process-preview__dl {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px 0;
  }
  .process-preview__dl dd {
    margin-bottom: 8px;
  }
}
</style>
