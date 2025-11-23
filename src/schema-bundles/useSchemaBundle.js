import { computed, ref, watch } from 'vue'
import YAML from 'yaml'
import { buildRelationshipIndex } from '../domain/schema/relationship-index'

function inferMetadataFields(schema) {
  if (!schema || typeof schema !== 'object') return []
  const props = schema.properties || {}
  return Object.keys(props)
}

function deriveRecordType(filename, suffix) {
  return filename.replace(new RegExp(`${suffix}$`), '')
}

export function useSchemaBundle(repoConnection) {
  const availableBundles = ref([])
  const selectedBundle = ref('')
  const schemaBundle = ref(null)
  const status = ref('idle')
  const error = ref('')
  const validationIssues = ref([])
  const lastLoadedAt = ref(null)

  async function readYaml(path) {
    const text = await repoConnection.readFile(path)
    return YAML.parse(text)
  }

  async function refreshAvailableBundles() {
    if (!repoConnection.directoryHandle.value) {
      availableBundles.value = []
      selectedBundle.value = ''
      return
    }

    try {
      status.value = 'scanning'
      error.value = ''
      const entries = await repoConnection.listDir('/schema')
      const bundles = entries.filter((entry) => entry.kind === 'directory').map((entry) => entry.name)
      availableBundles.value = bundles
      if (bundles.length && !bundles.includes(selectedBundle.value)) {
        selectedBundle.value = bundles[0]
      }
      status.value = 'idle'
    } catch (err) {
      console.error('[SchemaBundle] Failed to scan bundles', err)
      error.value = err?.message || 'Unable to list schema bundles.'
      availableBundles.value = []
      status.value = 'error'
    }
  }

  async function loadSelectedBundle() {
    if (!selectedBundle.value) {
      schemaBundle.value = null
      return
    }
    if (!repoConnection.directoryHandle.value) {
      error.value = 'Repository not connected.'
      status.value = 'error'
      return
    }

    const bundleName = selectedBundle.value
    validationIssues.value = []
    status.value = 'loading'
    error.value = ''

    try {
      const manifestPath = `/schema/${bundleName}/manifest.yaml`
      const manifest = await readYaml(manifestPath)

      if (!manifest?.recordSchemas?.length) {
        validationIssues.value.push('Manifest does not list any record schemas.')
      }

      const recordSchemas = {}
      for (const filename of manifest?.recordSchemas || []) {
        try {
          const recordType = deriveRecordType(filename, '.schema.yaml')
          recordSchemas[recordType] = await readYaml(`/schema/${bundleName}/${filename}`)
        } catch (err) {
          validationIssues.value.push(`Failed to load record schema ${filename}: ${err?.message}`)
        }
      }

      const uiConfigs = {}
      for (const filename of manifest?.uiConfigs || []) {
        try {
          const recordType = deriveRecordType(filename, '.ui.yaml')
          uiConfigs[recordType] = await readYaml(`/schema/${bundleName}/${filename}`)
        } catch (err) {
          validationIssues.value.push(`Failed to load UI config ${filename}: ${err?.message}`)
        }
      }

      let relationships = null
      try {
        relationships = await readYaml(`/schema/${bundleName}/relationships.yaml`)
      } catch (err) {
        validationIssues.value.push(`relationships.yaml missing or invalid: ${err?.message}`)
      }

      let naming = null
      try {
        naming = await readYaml(`/naming/${bundleName}.yaml`)
      } catch (err) {
        validationIssues.value.push(`naming/${bundleName}.yaml missing or invalid: ${err?.message}`)
      }

      let assistant = null
      if (manifest?.assistantConfig) {
        try {
          assistant = await readYaml(`/schema/${bundleName}/${manifest.assistantConfig}`)
        } catch (err) {
          validationIssues.value.push(`assistant config missing or invalid: ${err?.message}`)
        }
      }

      const vocabSchemas = {}
      for (const filename of manifest?.vocabSchemas || []) {
        try {
          const vocab = await readYaml(`/vocab/schema/${filename}`)
          const key = vocab?.name || filename.replace(/\.ya?ml$/i, '')
          vocabSchemas[key] = vocab
        } catch (err) {
          validationIssues.value.push(`Failed to load vocab schema ${filename}: ${err?.message}`)
        }
      }

      const relationshipIndex = relationships ? buildRelationshipIndex(relationships) : { all: [], byFromType: {}, byToType: {} }
      const metadataConfig = manifest?.metadataFields || {}
      const defaultMetadata = metadataConfig.default || inferMetadataFields(recordSchemas.common)
      const metadataFields = {}
      Object.keys(recordSchemas).forEach((recordType) => {
        const override = metadataConfig[recordType]
        metadataFields[recordType] = Array.from(
          new Set((override && override.length ? override : defaultMetadata) || [])
        )
      })

      schemaBundle.value = {
        schemaSet: bundleName,
        manifest,
        recordSchemas,
        uiConfigs,
        relationships,
        naming,
        assistant,
        vocabSchemas,
        relationshipIndex,
        metadataFields
      }

      status.value = validationIssues.value.length ? 'warning' : 'ready'
      lastLoadedAt.value = new Date()
    } catch (err) {
      console.error('[SchemaBundle] Failed to load bundle', err)
      error.value = err?.message || 'Failed to load schema bundle.'
      status.value = 'error'
      schemaBundle.value = null
    }
  }

  function reset() {
    availableBundles.value = []
    selectedBundle.value = ''
    schemaBundle.value = null
    status.value = 'idle'
    error.value = ''
    validationIssues.value = []
    lastLoadedAt.value = null
  }

  function selectBundle(name) {
    selectedBundle.value = name
  }

  function reload() {
    if (repoConnection.directoryHandle.value && selectedBundle.value) {
      loadSelectedBundle()
    }
  }

  const recordCount = computed(() => (schemaBundle.value ? Object.keys(schemaBundle.value.recordSchemas || {}).length : 0))
  const uiCount = computed(() => (schemaBundle.value ? Object.keys(schemaBundle.value.uiConfigs || {}).length : 0))

  watch(
    () => repoConnection.directoryHandle.value,
    async (handle) => {
      if (handle) {
        const previous = selectedBundle.value
        await refreshAvailableBundles()
        if (selectedBundle.value && selectedBundle.value === previous) {
          await loadSelectedBundle()
        }
      } else {
        reset()
      }
    }
  )

  watch(selectedBundle, (newBundle, oldBundle) => {
    if (!newBundle || newBundle === oldBundle || !repoConnection.directoryHandle.value) return
    loadSelectedBundle()
  })

  return {
    availableBundles,
    selectedBundle,
    schemaBundle,
    status,
    error,
    validationIssues,
    lastLoadedAt,
    recordCount,
    uiCount,
    refreshAvailableBundles,
    selectBundle,
    reload,
    loadSelectedBundle
  }
}
