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
    vendors: [
      {
        name: 'Thermo Fisher',
        slug: 'thermo',
        product_url_template: 'https://www.thermofisher.com/search/results?query={catalog_number}',
        homepage_url: 'https://www.thermofisher.com'
      },
      {
        name: 'Sigma-Aldrich',
        slug: 'sigmaaldrich',
        product_url_template: 'https://www.sigmaaldrich.com/US/en/search/{catalog_number}',
        homepage_url: 'https://www.sigmaaldrich.com'
      },
      {
        name: 'Bio-Rad',
        slug: 'biorad',
        product_url_template: 'https://www.bio-rad.com/en-us/search?query={catalog_number}',
        homepage_url: 'https://www.bio-rad.com'
      },
      {
        name: 'Thomas',
        slug: 'thomas',
        product_url_template: '',
        homepage_url: ''
      },
      {
        name: 'Internal',
        slug: 'internal',
        product_url_template: '',
        homepage_url: ''
      },
      {
        name: 'Unknown',
        slug: 'unknown',
        product_url_template: '',
        homepage_url: ''
      }
    ],
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
      },
      vendors: Array.isArray(userConfig.vendors) ? userConfig.vendors : base.vendors
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
  const vendorConfig = computed(() => (Array.isArray(config.value?.vendors) ? config.value.vendors : []))

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
      },
      vendors: Array.isArray(partial.vendors) ? partial.vendors : config.value?.vendors
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
    vendorConfig,
    reload: loadConfig,
    save: saveConfig
  }
}
