<template>
  <span v-if="kind === 'empty'" class="metadata-value__muted">—</span>
  <a v-else-if="kind === 'url'" :href="text" target="_blank" rel="noopener" class="text-primary metadata-value__break">{{ text }}</a>
  <a v-else-if="kind === 'email'" :href="`mailto:${text}`" class="text-primary metadata-value__break">{{ text }}</a>
  <span v-else-if="kind === 'date'" :title="text">{{ formatDateTime(text, locale) }}</span>
  <span v-else-if="kind === 'text'" class="metadata-value__break metadata-value__text">{{ text }}</span>
  <ul v-else-if="kind === 'list'" class="metadata-value__list">
    <li v-for="(item, index) in (value as unknown[])" :key="index">
      <MetadataValue :value="item" :field="field" />
    </li>
  </ul>
  <div v-else class="metadata-value__object">
    <a
      v-if="schemaType"
      :href="`https://schema.org/${schemaType}`"
      target="_blank"
      rel="noopener"
      class="metadata-value__type text-primary"
    >{{ schemaType }}</a>
    <dl class="metadata-value__dl">
      <template v-for="[key, item] in entries" :key="key">
        <dt>{{ termOf(key) }}</dt>
        <dd><MetadataValue :value="item" :field="termOf(key)" /></dd>
      </template>
    </dl>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDateTime, isIsoDate, termOf } from '~/composables/utils/processMetadata'

/**
 * A metadata value shown in full: text, links, e-mail addresses, dates (UTC,
 * the raw value as tooltip), lists, and objects with every field, their
 * schema.org type linked. Only the JSON-LD context and type keys are not
 * repeated as fields.
 */
defineOptions({ name: 'MetadataValue' })

const props = defineProps<{ value: unknown; field?: string }>()
const { locale } = useI18n()

const HIDDEN_KEYS = ['@context', '@type', 'class']
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i

const text = computed(() => (props.value === null || props.value === undefined ? '' : String(props.value).trim()))

const kind = computed(() => {
  const value = props.value
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return 'empty'
  if (Array.isArray(value)) return 'list'
  if (typeof value === 'object') return 'object'
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(text.value)) return 'url'
    if (props.field === 'email' || EMAIL.test(text.value)) return 'email'
    if (isIsoDate(text.value)) return 'date'
  }
  return 'text'
})

const schemaType = computed(() => {
  const value = props.value as Record<string, unknown>
  const type = value?.['@type'] ?? value?.class
  return typeof type === 'string' ? termOf(type) : ''
})

const entries = computed(() =>
  Object.entries((props.value as Record<string, unknown>) || {}).filter(([key]) => !HIDDEN_KEYS.includes(key))
)
</script>

<style scoped>
.metadata-value__break {
  overflow-wrap: anywhere;
}
.metadata-value__text {
  white-space: pre-line;
}
.metadata-value__muted {
  opacity: 0.6;
}
.metadata-value__list {
  margin: 0;
  padding-left: 18px;
}
.metadata-value__object {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.metadata-value__type {
  font-size: 12px;
  width: fit-content;
}
.metadata-value__dl {
  display: grid;
  grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
  gap: 4px 12px;
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid rgba(128, 128, 128, 0.25);
}
.metadata-value__dl dt {
  opacity: 0.7;
}
.metadata-value__dl dd {
  margin: 0;
  min-width: 0;
}
</style>
