import { ref } from 'vue'

const STORAGE_KEY = 'disco-assistant-settings'

const apiKey = ref('')
const baseUrl = ref('https://api.openai.com/v1')
const modelName = ref('gpt-4o-mini')

function load() {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      apiKey.value = parsed.apiKey || ''
      baseUrl.value = parsed.baseUrl || 'https://api.openai.com/v1'
      modelName.value = parsed.modelName || 'gpt-4o-mini'
    }
  } catch (err) {
    console.warn('[assistant] failed to load settings', err)
  }
}

function persist() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        apiKey: apiKey.value,
        baseUrl: baseUrl.value,
        modelName: modelName.value
      })
    )
  } catch (err) {
    console.warn('[assistant] failed to persist settings', err)
  }
}

export function useAssistantSettings() {
  if (!apiKey.value && typeof window !== 'undefined') {
    load()
  }

  function setApiKey(key) {
    apiKey.value = key || ''
    persist()
  }

  function setBaseUrl(url) {
    baseUrl.value = url || 'https://api.openai.com/v1'
    persist()
  }

  function setModelName(name) {
    modelName.value = name || 'gpt-4o-mini'
    persist()
  }

  return {
    apiKey,
    setApiKey,
    baseUrl,
    setBaseUrl,
    modelName,
    setModelName
  }
}
