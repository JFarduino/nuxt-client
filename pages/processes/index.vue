<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from '#imports'
import { useI18n } from 'vue-i18n'
import { QCard, QCardSection, QInput, QBtn, QDialog, QForm, QUploader, QSpinnerGears, Notify } from 'quasar'
import HelpDialog from '../../components/help/HelpDialog.vue'
import processListHelp from '../../components/help/processListHelp.js'

import AppDialog from '~/components/modal/AppDialog.vue'
import CwlGraph from '~/components/common/CwlGraph.vue'
import ProcessPreview from '~/components/processes/ProcessPreview.vue'
import { cleanDescription, processDescription, uniqueProcesses } from '~/composables/utils/processMetadata'

import yaml from 'js-yaml'
import { nextTick, watch } from 'vue'
import { Dialog, useQuasar } from 'quasar'
import { summarizeCwl, validateCwlText } from '~/composables/utils/cwl'
import { errorSummary } from '~/composables/utils/ogcError'


const authStore = useAuthStore()
const { locale, t } = useI18n()
const { buildOgcApiUrl, getRequestHeaders, apiFetch } = useOgcApiServer()
const loadingBar = useGlobalLoading()
const $q = useQuasar()
const isDark = computed(() => $q.dark.isActive)

const data = ref<any>(null)
const filter = ref('')
const router = useRouter()
const modalContent = ref<string | null>(null)
const packageError = ref<string | null>(null)
const showModal = ref(false)
const selectedPackageProcessId = ref('')



const helpVisible = ref(false)
const helpContent = processListHelp


const loadingCwl = ref(false)
const cwlText = ref<string | null>(null)
const cwlError = ref<string | null>(null)
const selectedProcess = ref<Record<string, any> | null>(null)

const dialog = ref(false)
const processName = ref('')
const fileContent = ref('')
const file = ref<File | null>(null)
const deployMode = ref<'file' | 'paste' | 'url'>('file')
const packageUrl = ref('')
const replaceTarget = ref<string | null>(null)
const deploying = ref(false)
const uploader = ref<any>(null)

const cwlSummary = computed(() => (fileContent.value?.trim() ? summarizeCwl(fileContent.value) : null))
// The graph is redrawn from the pasted text, a little after the user stops typing.
const graphSource = ref('')
let graphTimer: ReturnType<typeof setTimeout> | null = null
watch(fileContent, (text) => {
  if (graphTimer) clearTimeout(graphTimer)
  graphTimer = setTimeout(() => {
    graphSource.value = text?.trim() ? text : ''
  }, 600)
}, { immediate: true })
const cwlValidation = computed(() => (fileContent.value?.trim() ? validateCwlText(fileContent.value) : null))

// Suggest the process identifier from the package itself.
watch(cwlSummary, (summary) => {
  if (!replaceTarget.value && summary?.id && !processName.value) {
    processName.value = summary.id
  }
})



//basic helpers 
function debug(msg: string) { console.log('[proc:index] ', msg) }

const viewProcess = (row: any) => {
  router.push(`/processes/${row.id}`)
}

// fetch package 
const packageProcess = async (row: any) => {
  selectedPackageProcessId.value = row.id //store Id for filename
  modalContent.value = null
  packageError.value = null
  try {
    const packageUrl = await buildOgcApiUrl(`/processes/${row.id}/package`, {
      acceptLanguage: locale.value
    })
    const response = await fetch(packageUrl, {
      method: 'GET',
      headers: {
        "Accept": "application/cwl+yaml",
        ...getRequestHeaders(locale.value)
      }
    })
    if (response.ok) {
      modalContent.value = await response.text()
    } else if (response.status === 404) {
      packageError.value = t(
        'Application package is not available. It may have been removed after a service restart.'
      )
    } else {
      packageError.value = t(
        'Failed to load application package.'
      )
    }

    showModal.value = true
  } catch (error) {
    console.error('Application Package request failed', error)
    packageError.value = t(
      'Unable to reach the server to retrieve the application package.'
    )
    showModal.value = true
  }
}

const downloadCWL = () => {
  if (!modalContent.value) return;

  // Create a blob from the modal content
  const blob = new Blob([modalContent.value], {
    type: "text/yaml"
  });

  // Create a temporary download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  // Use processId from packageProcess()
  const filename = `${selectedPackageProcessId.value || 'application-package'}.cwl`

  a.href = url;
  a.download = filename
  a.click();

  // Clean up
  URL.revokeObjectURL(url);
};

// Preview of a process, unfolded under its row: description, workflow graph of its
// application package (<CwlGraph>), actions, inputs, outputs and all its metadata
// (<ProcessPreview>). One row at a time; the open row is kept in the URL
// (?process=<id>) so the view can be shared or restored. A row that leaves the
// visible page (search, sorting, pagination, refresh) is closed.
const route = useRoute()
const tableRef = ref<any>(null)
const pagination = ref({ sortBy: null as string | null, descending: false, page: 1, rowsPerPage: 10 })
const expandedId = ref<string | null>(null)
const detailError = ref<string | null>(null)
let previewRequest = 0

const loadPreview = async (row: any) => {
  const request = ++previewRequest
  const current = () => request === previewRequest
  selectedProcess.value = null
  detailError.value = null
  cwlText.value = null
  cwlError.value = null
  loadingCwl.value = true
  try {
    const detail = await apiFetch<any>(`/processes/${encodeURIComponent(row.id)}`, { acceptLanguage: locale.value })
    if (!current()) return
    selectedProcess.value = detail
  } catch (err) {
    if (!current()) return
    // The list entry still gives the identifier, title, description and modes.
    selectedProcess.value = row
    detailError.value = errorSummary(err, t('The full description of the process could not be loaded: only the list entry is shown.'))
  }
  if (!row.mutable) {
    loadingCwl.value = false
    return
  }
  try {
    const text = await apiFetch<string>(`/processes/${encodeURIComponent(row.id)}/package`, {
      responseType: 'text',
      accept: 'application/cwl+yaml',
      acceptLanguage: locale.value
    })
    if (current()) cwlText.value = text
  } catch (err: any) {
    if (!current()) return
    if (err?.status === 406) {
      cwlError.value = t('The server does not provide the application package of this process (processes deployed without an account, known server issue).')
    } else if (err?.status === 404) {
      cwlError.value = t('Application package is not available. It may have been removed after a service restart.')
    } else {
      cwlError.value = errorSummary(err, t('Failed to load application package.'))
    }
  } finally {
    if (current()) loadingCwl.value = false
  }
}

const syncPreviewQuery = (id: string | null) => {
  if ((route.query.process || null) === id) return
  const query = { ...route.query }
  if (id) query.process = id
  else delete query.process
  router.replace({ query })
}

const collapsePreview = () => {
  previewRequest++
  expandedId.value = null
  selectedProcess.value = null
  detailError.value = null
  cwlText.value = null
  cwlError.value = null
  loadingCwl.value = false
  syncPreviewQuery(null)
}

const openPreview = (row: any) => {
  expandedId.value = row.id
  syncPreviewQuery(row.id)
  nextTick(() => {
    document.getElementById(`process-preview-${row.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
  loadPreview(row)
}

const togglePreview = (row: any) => {
  if (expandedId.value === row.id) collapsePreview()
  else openPreview(row)
}

// A click on the row toggles it, unless the user was selecting text.
const onRowClick = (row: any) => {
  if (window.getSelection()?.toString()) return
  togglePreview(row)
}

// The list has no metadata: once a row is open, its package description fills the gap.
const rowDescription = (row: any) =>
  cleanDescription(row.description) ||
  (expandedId.value === row.id && selectedProcess.value ? processDescription(selectedProcess.value) : '')

// Open the row named in ?process=, on its page of the table.
const openPreviewFromQuery = async () => {
  const id = String(route.query.process || '')
  if (!id || expandedId.value === id) return
  await nextTick()
  const ordered: any[] = tableRef.value?.filteredSortedRows || rows.value
  const index = ordered.findIndex((p: any) => p.id === id)
  if (index < 0) {
    syncPreviewQuery(expandedId.value)
    return
  }
  const perPage = pagination.value.rowsPerPage
  if (perPage > 0) pagination.value = { ...pagination.value, page: Math.floor(index / perPage) + 1 }
  openPreview(ordered[index])
}

// Back/forward or a link to /processes?process=<id> while the page is open.
watch(() => route.query.process, (id) => {
  if (id && id !== expandedId.value) openPreviewFromQuery()
  else if (!id && expandedId.value) collapsePreview()
})

// conformance check 
const isConformToCwl = ref(false)
const isCheckingConformance = ref(false)

const checkConformance = async () => {
  isCheckingConformance.value = true
  try {
    const conformanceUrl = await buildOgcApiUrl('/conformance', {
      acceptLanguage: locale.value
    })

    const response = await fetch(conformanceUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...getRequestHeaders(locale.value)
      }
    })

    if (response.ok) {
      const conformance = await response.json()

      // Does the API support CWL deployment (OGC API - Processes - Part 2)?
      const cwlConformanceUrl = 'http://www.opengis.net/spec/ogcapi-processes-2/1.0/conf/deploy-replace-undeploy'
      isConformToCwl.value = conformance.conformsTo?.includes(cwlConformanceUrl) || false
    } else {
      console.error('Error fetching conformance:', response.status)
      isConformToCwl.value = false
    }
  } catch (error) {
    console.error('Error fetching conformance', error)
    isConformToCwl.value = false
  } finally {
    isCheckingConformance.value = false
  }
}

// delete process
const deleteProcess = async (row: any) => {
  Dialog.create({
    title: t('Delete process'),
    message: `${t('Are you sure you want to delete the process')} "${row.id}"?`,
    cancel: true,
    persistent: true,
    ok: { label: t('Delete'), color: 'negative' }
  }).onOk(async () => {
    try {
      const processUrl = await buildOgcApiUrl(`/processes/${row.id}`, {
        acceptLanguage: locale.value
      })

      const response = await fetch(processUrl, {
        method: 'DELETE',
        headers: getRequestHeaders(locale.value)
      })
      if (response.ok) {
        Notify.create({ message: t('Process deleted successfully'), type: 'positive' })
        if (expandedId.value === row.id) collapsePreview()
        await fetchData()
      } else {
        const detail = await readErrorDetail(response)
        Notify.create({ message: `${t('Process deletion failed')}: ${detail}`, type: 'negative', timeout: 8000 })
      }
    } catch (e) {
      Notify.create({ message: errorSummary(e, t('Delete request failed')), color: 'negative', icon: 'error' })
      console.error(e)
    }
  })
}

// Extract the OGC exception detail from a failed fetch() response.
const readErrorDetail = async (response: Response) => {
  const text = await response.text().catch(() => '')
  try {
    const body = JSON.parse(text)
    return body?.detail || body?.title || body?.message || `HTTP ${response.status}`
  } catch {
    return text?.slice(0, 300) || `HTTP ${response.status}`
  }
}

// add / replace process dialog
const openDialog = () => {
  replaceTarget.value = null
  dialog.value = true
}

const openReplaceDialog = (row: any) => {
  replaceTarget.value = row.id
  processName.value = row.id
  dialog.value = true
}

const closeDialog = () => {
  dialog.value = false
  processName.value = ''
  fileContent.value = ''
  packageUrl.value = ''
  file.value = null
  replaceTarget.value = null
  deployMode.value = 'file'
  try {
    uploader.value?.reset?.()
  } catch {
    /* ignore */
  }
}

const onFileAdded = (files: File[]) => {
  if (files.length > 0) {
    file.value = files[0]
    const reader = new FileReader()
    reader.onload = (e) => (fileContent.value = e.target?.result as string)
    reader.readAsText(file.value)
  }
}

const onFileSelected = (selected: File | File[] | null) => {
  const picked = Array.isArray(selected) ? selected[0] : selected
  if (!picked) {
    file.value = null
    fileContent.value = ''
    return
  }
  onFileAdded([picked])
}

const loadPackageFromUrl = async () => {
  const url = packageUrl.value.trim()
  if (!url) return
  try {
    const res = await fetch(url, { headers: { Accept: 'application/cwl+yaml, text/yaml, application/json, */*' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    fileContent.value = await res.text()
    deployMode.value = 'paste'
    Notify.create({ type: 'positive', message: t('Package loaded, review it before deploying.') })
  } catch (err: any) {
    Notify.create({
      type: 'warning',
      timeout: 8000,
      message: t('Could not fetch the package in the browser (CORS, or an origin missing from the Content-Security-Policy). It will be fetched by the server instead.')
    })
  }
}

const submitForm = async () => {
  if (deploying.value) return
  const isUrlMode = deployMode.value === 'url'

  if (isUrlMode) {
    if (!packageUrl.value.trim()) {
      Notify.create({ type: 'negative', message: t('Please provide the URL of the application package.') })
      return
    }
  } else {
    const check = validateCwlText(fileContent.value)
    if (!check.ok) {
      Notify.create({ type: 'negative', message: check.error || t('Invalid application package') })
      return
    }
  }

  deploying.value = true
  loadingBar.start()
  const replacing = !!replaceTarget.value
  Notify.create({
    spinner: QSpinnerGears,
    message: replacing ? t('Replacing process...') : t('Deploying process...'),
    timeout: 2000
  })

  try {
    const name = processName.value.trim()
    const path = replacing
      ? `/processes/${encodeURIComponent(replaceTarget.value as string)}`
      : `/processes${name ? `?w=${encodeURIComponent(name)}` : ''}`
    const url = await buildOgcApiUrl(path, { acceptLanguage: locale.value })

    const response = isUrlMode
      ? await fetch(url, {
          method: replacing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/ogcapppkg+json', ...getRequestHeaders(locale.value) },
          body: JSON.stringify({
            executionUnit: { href: packageUrl.value.trim(), type: 'application/cwl+yaml' }
          })
        })
      : await fetch(url, {
          method: replacing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/cwl+yaml', ...getRequestHeaders(locale.value) },
          body: fileContent.value
        })

    if (response.ok) {
      let body: any = null
      try {
        body = await response.clone().json()
      } catch {
        /* non JSON body */
      }
      const newId = body?.id || replaceTarget.value || name || cwlSummary.value?.id
      Notify.create({
        message: replacing ? t('Process replaced successfully') : t('Process deployed successfully'),
        type: 'positive'
      })
      closeDialog()
      await fetchData()
      if (newId) router.push(`/processes/${newId}`)
    } else {
      const detail = await readErrorDetail(response)
      const hint = response.status === 409 ? ` ${t('A process with this identifier already exists: use Replace to update it.')}` : ''
      Notify.create({
        message: `${replacing ? t('Failed to replace process') : t('Failed to deploy process')}: ${detail}${hint}`,
        color: 'negative',
        icon: 'error',
        timeout: 10000
      })
    }
  } catch (error) {
    console.error('Request failed', error)
    Notify.create({ message: errorSummary(error, t('Request failed')), color: 'negative', icon: 'error' })
  } finally {
    deploying.value = false
    loadingBar.end()
  }
}

const listLoading = ref(false)
const fetchData = async () => {
  listLoading.value = true
  try {
    data.value = await apiFetch('/processes', { query: { f: 'json' }, acceptLanguage: locale.value })
    await openPreviewFromQuery()
  } catch (error) {
    console.error('Error fetching data:', error)
    Notify.create({ type: 'negative', message: errorSummary(error, t('Request failed')) })
  } finally {
    listLoading.value = false
  }
}

onMounted(() => {
  checkConformance()
  fetchData()
})

// table helpers and computed
const columns = computed(() => [
  { name: 'expand', label: '', field: 'id', align: 'left', sortable: false, style: 'width: 52px', headerStyle: 'width: 52px' },
  { name: 'id', label: t('Identifier'), field: 'id', align: 'left', sortable: true, style: 'width: 200px', headerStyle: 'width: 200px' },
  { name: 'title', label: t('Title'), field: 'title', align: 'left', sortable: true, style: 'width: 200px', headerStyle: 'width: 200px' },
  { name: 'description', label: t('Description'), field: 'description', align: 'left', sortable: false },
  { name: 'version', label: t('Version'), field: 'version', align: 'left', sortable: true, style: 'width: 110px', headerStyle: 'width: 110px' },
  { name: 'kind', label: t('Kind'), field: 'mutable', align: 'left', sortable: true, style: 'width: 120px', headerStyle: 'width: 120px' }
])

const goToJobs = (row: any) => router.push({ path: '/jobs', query: { processID: row.id } })

// The server can list a process twice (once per namespace it looks in): one row per identifier.
const rows = computed(() => {
  if (!data.value?.processes) return []
  const term = filter.value.toLowerCase()
  return uniqueProcesses<any>(data.value.processes).filter((p: any) => {
    if (!term) return true
    const haystack = [p.id, p.title, p.description, ...(p.keywords || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(term)
  })
})


// Close the preview when its row is no longer on the visible page.
watch(
  () => tableRef.value?.computedRows as any[] | undefined,
  (visible) => {
    if (expandedId.value && visible && !visible.some((p: any) => p.id === expandedId.value)) collapsePreview()
  }
)

// A new search starts on the first page.
watch(filter, () => {
  pagination.value = { ...pagination.value, page: 1 }
})

// Titles, descriptions and error messages come translated from the server.
watch(locale, async () => {
  const open = rows.value.find((p: any) => p.id === expandedId.value)
  await fetchData()
  if (open) loadPreview(rows.value.find((p: any) => p.id === open.id) || open)
})

const formattedData = computed(() => JSON.stringify(data.value, null, 2))

const onClearSearch = async () => {
  filter.value = ''
  await fetchData()
}
</script>


<template>
  <q-page class="q-pa-sm">
    <div class="row justify-center">
      <div class="col-12 q-pa-md" style="max-width: 1080px;">

        <p class="text-h4 q-mb-md text-weight-bold">{{ t('Processes List') }}</p>

        <!-- Buttons row -->
        <div class="row items-center q-mb-md">
          <!-- Help Button -->
          <q-btn
            flat
            icon="help_outline"
            color="primary"
            :label="t('Help')"
            @click="helpVisible = true"
          />

          <q-space />

          <!-- Add Process Button -->
          <q-btn
            v-if="isConformToCwl === true"
            color="primary"
            icon="add"
            :label="t('Add Process')"
            @click="openDialog"
            :loading="isCheckingConformance"
          />
          <q-btn flat dense icon="refresh" class="q-ml-sm" @click="fetchData">
            <q-tooltip>{{ t('Refresh') }}</q-tooltip>
          </q-btn>
        </div>

        <HelpDialog
          v-model="helpVisible"
          :title="t('Processes List Help')"
        >
          <div
            v-if="helpContent"
            v-html="helpContent"
          />
        </HelpDialog>
        <q-separator />

        <div class="q-mb-md">
          <q-input
            filled
            v-model="filter"
            :label="t('Search')"
            debounce="300"
            clearable
            prepend-icon="search"
            @clear="onClearSearch"
          />
        </div>


            <q-table
              ref="tableRef"
              v-model:pagination="pagination"
              :title="t('Processes List')"
              :rows="rows"
              :columns="columns"
              row-key="id"
              :dark="isDark"
              :loading="listLoading"
              wrap-cells
              table-layout="fixed"
              flat
              bordered
              :rows-per-page-options="[10, 25, 50, 0]"
              class="processes-table rounded-borders"
            >
              <template #body="props">
                <q-tr
                  :props="props"
                  class="process-row"
                  :class="{ 'process-row--open': expandedId === props.row.id }"
                  @click="onRowClick(props.row)"
                >
                  <q-td key="expand" :props="props" class="expand-td">
                    <q-btn
                      flat
                      round
                      dense
                      size="sm"
                      :icon="expandedId === props.row.id ? 'expand_more' : 'chevron_right'"
                      :aria-expanded="expandedId === props.row.id ? 'true' : 'false'"
                      :aria-controls="`process-preview-${props.row.id}`"
                      :aria-label="expandedId === props.row.id
                        ? t('Hide the preview of {id}', { id: props.row.id })
                        : t('Show the preview of {id}', { id: props.row.id })"
                      @click.stop="togglePreview(props.row)"
                    />
                  </q-td>
                  <q-td key="id" :props="props" class="id-td">
                    <NuxtLink :to="`/processes/${props.row.id}`" class="text-primary text-weight-bold" @click.stop>{{ props.row.id }}</NuxtLink>
                    <div v-if="props.row.keywords?.length" class="q-mt-xs">
                      <q-chip v-for="kw in props.row.keywords.slice(0, 4)" :key="kw" dense size="sm" color="grey-3" text-color="grey-9">{{ kw }}</q-chip>
                    </div>
                  </q-td>
                  <q-td key="title" :props="props" class="description-td">
                    <div class="description-cell">{{ cleanDescription(props.row.title) || '—' }}</div>
                  </q-td>
                  <q-td key="description" :props="props" class="description-td">
                    <div class="description-cell description-cell--clamp" :title="rowDescription(props.row)">{{ rowDescription(props.row) || '—' }}</div>
                  </q-td>
                  <q-td key="version" :props="props">{{ props.row.version || '—' }}</q-td>
                  <q-td key="kind" :props="props">
                    <q-badge :color="props.row.mutable ? 'primary' : 'grey-7'" :label="props.row.mutable ? t('Deployed') : t('Built-in')" />
                    <div class="q-mt-xs">
                      <q-icon v-if="(props.row.jobControlOptions || []).includes('async-execute')" name="schedule" size="xs" class="q-mr-xs">
                        <q-tooltip>{{ t('Asynchronous execution') }}</q-tooltip>
                      </q-icon>
                      <q-icon v-if="(props.row.jobControlOptions || []).includes('sync-execute')" name="bolt" size="xs" class="q-mr-xs">
                        <q-tooltip>{{ t('Synchronous execution') }}</q-tooltip>
                      </q-icon>
                      <q-icon v-if="(props.row.jobControlOptions || []).includes('dismiss')" name="cancel" size="xs">
                        <q-tooltip>{{ t('Jobs can be dismissed') }}</q-tooltip>
                      </q-icon>
                    </div>
                  </q-td>
                </q-tr>
                <q-tr
                  v-if="expandedId === props.row.id"
                  :id="`process-preview-${props.row.id}`"
                  :props="props"
                  class="process-preview-row"
                >
                  <q-td colspan="100%" class="process-preview-td">
                    <ProcessPreview
                      :process="props.row"
                      :detail="selectedProcess"
                      :detail-error="detailError"
                      :cwl-text="cwlText"
                      :cwl-error="cwlError"
                      :loading="loadingCwl"
                      @execute="viewProcess(props.row)"
                      @jobs="goToJobs(props.row)"
                      @package="packageProcess(props.row)"
                      @replace="openReplaceDialog(props.row)"
                      @delete="deleteProcess(props.row)"
                    />
                  </q-td>
                </q-tr>
              </template>
              <template #no-data>
                <div class="full-width row flex-center text-grey-7 q-py-lg">
                  <q-icon :name="listLoading ? 'hourglass_empty' : 'inbox'" size="md" class="q-mr-sm" />
                  {{ listLoading ? t('Loading...') : t('No process matches your search.') }}
                </div>
              </template>
            </q-table>


      </div>
    </div>

    <!-- Add / Replace Process Dialog -->
    <q-dialog v-model="dialog" persistent>
      <q-card style="width: 760px; max-width: 92vw;">
        <q-card-section class="row items-center">
          <q-icon :name="replaceTarget ? 'published_with_changes' : 'add_circle'" color="primary" size="sm" class="q-mr-sm" />
          <div class="text-h6">
            {{ replaceTarget ? t('Replace process "{id}"', { id: replaceTarget }) : t('Add a Process') }}
          </div>
          <q-space />
          <q-btn flat round dense icon="close" :disable="deploying" @click="closeDialog" />
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-tabs v-model="deployMode" dense align="left" class="text-grey-7" active-color="primary" indicator-color="primary" narrow-indicator>
            <q-tab name="file" icon="upload_file" :label="t('Upload a .cwl file')" />
            <q-tab name="paste" icon="content_paste" :label="t('Paste')" />
            <q-tab name="url" icon="link" :label="t('From a URL')" />
          </q-tabs>
          <q-separator class="q-mb-md" />

          <q-form @submit.prevent="submitForm">
            <q-input
              v-model="processName"
              :label="replaceTarget ? t('Process identifier') : t('Process Name')"
              :hint="replaceTarget ? '' : t('Optional: defaults to the identifier declared in the package')"
              :readonly="!!replaceTarget"
              dense
              filled
              class="q-mb-md"
            />

            <q-tab-panels v-model="deployMode" animated>
              <q-tab-panel name="file" class="q-pa-none">
                <q-file
                  v-model="file"
                  :label="t('Upload a .cwl file')"
                  accept=".cwl,.yaml,.yml,.json"
                  filled
                  clearable
                  @update:model-value="onFileSelected"
                >
                  <template #prepend><q-icon name="upload_file" /></template>
                </q-file>
              </q-tab-panel>
              <q-tab-panel name="paste" class="q-pa-none">
                <q-input
                  v-model="fileContent"
                  :label="t('File Content')"
                  type="textarea"
                  filled
                  autogrow
                  input-style="min-height: 180px; max-height: 45vh; font-family: ui-monospace, monospace; font-size: 12px"
                />
              </q-tab-panel>
              <q-tab-panel name="url" class="q-pa-none">
                <q-input v-model="packageUrl" :label="t('URL of the CWL application package')" filled dense type="url">
                  <template #append>
                    <q-btn flat dense icon="download" :label="t('Preview')" @click="loadPackageFromUrl">
                      <q-tooltip>{{ t('Fetch the package in the browser to review it before deploying') }}</q-tooltip>
                    </q-btn>
                  </template>
                </q-input>
                <div class="text-caption text-grey-7 q-mt-sm">
                  {{ t('The server downloads the package itself (application/ogcapppkg+json with an executionUnit href).') }}
                </div>
              </q-tab-panel>
            </q-tab-panels>

            <!-- package summary -->
            <div v-if="deployMode !== 'url' && cwlValidation" class="q-mt-md">
              <q-banner v-if="!cwlValidation.ok" dense rounded class="bg-red-1 text-negative">
                <template #avatar><q-icon name="error" color="negative" /></template>
                {{ cwlValidation.error }}
              </q-banner>
              <div v-else class="row items-center q-gutter-xs">
                <q-chip dense color="positive" text-color="white" icon="check">{{ t('Valid CWL') }}</q-chip>
                <q-chip v-if="cwlSummary?.id" dense outline color="primary">id: {{ cwlSummary.id }}</q-chip>
                <q-chip v-if="cwlSummary?.cwlClass" dense outline color="grey-8">{{ cwlSummary.cwlClass }}</q-chip>
                <q-chip v-if="cwlSummary?.cwlVersion" dense outline color="grey-8">{{ cwlSummary.cwlVersion }}</q-chip>
                <q-chip v-if="cwlSummary?.version" dense outline color="grey-8">v{{ cwlSummary.version }}</q-chip>
                <q-chip v-if="cwlSummary?.graphSize" dense outline color="grey-8">$graph: {{ cwlSummary.graphSize }}</q-chip>
              </div>
              <!-- Live graph of the package about to be deployed -->
              <div v-if="cwlValidation.ok && graphSource" class="q-mt-md">
                <div class="text-caption text-grey-7 q-mb-xs">{{ t('Workflow graph') }}</div>
                <CwlGraph :cwl="graphSource" height="300px" />
              </div>
            </div>

            <div class="row justify-end q-gutter-sm q-mt-md">
              <q-btn flat :label="t('Cancel')" color="grey-8" :disable="deploying" @click="closeDialog" />
              <q-btn
                type="submit"
                :label="replaceTarget ? t('Replace') : t('Deploy')"
                color="primary"
                :loading="deploying"
                :disable="deployMode !== 'url' && !!cwlValidation && !cwlValidation.ok"
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Package Modal -->
    <AppDialog
      v-model="showModal"
      :title="t('Application Package')"
    >
      <div v-if="modalContent">
        <pre class="dialog-pre">{{ modalContent }}</pre>
        </div>
          <!-- ERROR -->
          <div v-else-if="packageError" class="text-negative">
            <q-icon name="warning" size="18px" class="q-mr-sm" />
            {{ packageError }}
          </div>

          <!-- LOADING / EMPTY -->
          <div v-else class="text-grey-6">
            {{ t('Loading package information...') }}
          </div>
        <template #footer>
          <div class="row justify-end">
            <q-btn
              color="primary"
              :label="t('Download CWL')"
              @click="downloadCWL"
            />
          </div>
        </template>
      </AppDialog>

  </q-page>
</template>
<style>
.long-text {
  word-break: break-all;
  overflow-wrap: anywhere;
}

.description-cell {
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
/* Long descriptions stay on four lines in the list; the preview shows them in full. */
.description-cell--clamp {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dialog-pre {
  max-width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
}

.description-td,
.id-td {
  vertical-align: top;
}

.processes-table tbody tr.process-row {
  cursor: pointer;
}

.processes-table .expand-td {
  width: 52px;
}

.processes-table tr.process-row--open > td {
  background: rgba(242, 192, 55, 0.09);
  border-bottom-color: transparent;
}

.processes-table tr.process-preview-row > td {
  padding: 4px 16px 16px;
  background: rgba(242, 192, 55, 0.04);
  white-space: normal;
}

/* On narrow screens the table scrolls sideways: keep the preview within the visible width. */
.processes-table tr.process-preview-row > td > .process-preview {
  position: sticky;
  left: 16px;
  max-width: min(100%, calc(100vw - 80px));
}
</style>