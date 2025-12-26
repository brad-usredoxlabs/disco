import { computed, ref, watch } from 'vue'
import YAML from 'yaml'

const PRIMARY_CONFIG_PATH = '/config/system.yaml'
const FALLBACK_CONFIG_PATH = '/config/system.example.yaml'

function defaultConfig() {
  return {
    ontology: {
      cache_duration: 30
    },
    provenance: {
      local_namespace: ''
    },
    features: {
      graphTree: true,
      graphQueries: false
    }
  }
}

export function useSystemConfig(repoConnection) {
  const config = ref(defaultConfig())
  const status = ref('idle')
  const error = ref('')
  const lastLoadedAt = ref(null)

  async function readConfigFile(path) {
    try {
      const text = await repoConnection.readFile(path)
      return YAML.parse(text) || {}
    } catch (err) {
      return null
    }
  }

  async function loadConfig() {
    if (!repoConnection?.directoryHandle?.value) {
      reset()
      return
    }
    status.value = 'loading'
    error.value = ''
    try {
      const userConfig = (await readConfigFile(PRIMARY_CONFIG_PATH)) || (await readConfigFile(FALLBACK_CONFIG_PATH))
      config.value = mergeConfig(userConfig)
      lastLoadedAt.value = new Date()
      status.value = 'ready'
    } catch (err) {
      status.value = 'error'
      error.value = err?.message || 'Unable to load system config.'
      config.value = defaultConfig()
    }
  }

  function mergeConfig(userConfig = {}) {
    const base = defaultConfig()
    return {
      ...base,
      ...userConfig,
      ontology: {
        ...base.ontology,
        ...(userConfig.ontology || {})
      },
      features: {
        ...base.features,
        ...(userConfig.features || {})
      },
      provenance: {
        ...base.provenance,
        ...(userConfig.provenance || {})
      }
    }
  }

  function reset() {
    status.value = 'idle'
    error.value = ''
    config.value = defaultConfig()
    lastLoadedAt.value = null
  }

  const ontologyConfig = computed(() => {
    const source = config.value?.ontology || {}
    return {
      cacheDuration: Number(source.cache_duration ?? source.cacheDuration ?? 30) || 30
    }
  })

  const provenanceConfig = computed(() => {
    const source = config.value?.provenance || {}
    return {
      localNamespace: source.local_namespace || source.localNamespace || ''
    }
  })

  async function saveConfig(partial = {}) {
    if (!repoConnection?.directoryHandle?.value) {
      throw new Error('Connect a repository before saving settings.')
    }
    const merged = mergeConfig({
      ...config.value,
      ...partial,
      ontology: {
        ...(config.value?.ontology || {}),
        ...(partial.ontology || {})
      },
      provenance: {
        ...(config.value?.provenance || {}),
        ...(partial.provenance || {})
      }
    })
    const yamlText = YAML.stringify(merged)
    await repoConnection.writeFile(PRIMARY_CONFIG_PATH, yamlText)
    config.value = mergeConfig(merged)
    lastLoadedAt.value = new Date()
    status.value = 'ready'
  }

  watch(
    () => repoConnection?.directoryHandle?.value,
    (handle) => {
      if (handle) {
        loadConfig()
      } else {
        reset()
      }
    },
    { immediate: true }
  )

  return {
    config,
    status,
    error,
    lastLoadedAt,
    ontologyConfig,
    provenanceConfig,
    reload: loadConfig,
    save: saveConfig
  }
}
