import { computed, ref, watch } from 'vue'
import YAML from 'yaml'

const PRIMARY_CONFIG_PATH = '/config/system.yaml'
const FALLBACK_CONFIG_PATH = '/config/system.example.yaml'

function defaultConfig() {
  return {
    bioportal: {
      api_key: '',
      cache_duration: 30
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
      bioportal: {
        ...base.bioportal,
        ...(userConfig.bioportal || {})
      }
    }
  }

  function reset() {
    status.value = 'idle'
    error.value = ''
    config.value = defaultConfig()
    lastLoadedAt.value = null
  }

  const bioportalConfig = computed(() => {
    const source = config.value?.bioportal || {}
    return {
      apiKey: source.api_key || source.apiKey || '',
      cacheDuration: Number(source.cache_duration ?? source.cacheDuration ?? 30) || 30
    }
  })

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
    bioportalConfig,
    reload: loadConfig
  }
}
