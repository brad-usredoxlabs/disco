<script setup>
import { computed, ref, watch } from 'vue'
import YAML from 'yaml'
import { useAssistantClient } from '../assistant/useAssistantClient'

const props = defineProps({
  recordType: {
    type: String,
    default: ''
  },
  metadata: {
    type: Object,
    default: () => ({})
  },
  body: {
    type: String,
    default: ''
  },
  graphNode: {
    type: Object,
    default: null
  },
  assistantConfig: {
    type: Object,
    default: () => ({})
  }
})

const client = useAssistantClient()
const customPrompt = ref('')
const isRunning = ref(false)
const responseText = ref('')
const errorText = ref('')
const selectedAction = ref('')
const parsedMetadata = ref(null)
const parsedBody = ref('')
const parseMessage = ref('')

const actions = computed(() => props.assistantConfig?.actions || [])
const models = ref([])
const isLoadingModels = ref(false)
const modelsError = ref('')

const needsApiConfig = computed(() => !client.apiKey.value && !client.baseUrl.value)

watch(
  () => client.baseUrl.value,
  () => {
    fetchModels()
  },
  { immediate: true }
)

async function fetchModels() {
  if (!client.baseUrl.value) return
  isLoadingModels.value = true
  modelsError.value = ''
  try {
    const response = await fetch(`${client.baseUrl.value}/models`, {
      headers: {
        ...(client.apiKey.value ? { Authorization: `Bearer ${client.apiKey.value}` } : {})
      }
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch models (${response.status})`)
    }
    const data = await response.json()
    const list = data.data || data.models || []
    models.value = list.map((model) => (typeof model === 'string' ? model : model.id)).filter(Boolean)
  } catch (err) {
    modelsError.value = err?.message || 'Unable to load models.'
    models.value = []
  } finally {
    isLoadingModels.value = false
  }
}

function buildContext(include = []) {
  const sections = []
  if (!include.length || include.includes('self')) {
    sections.push(`# Current ${props.recordType}\n\n${JSON.stringify(props.metadata, null, 2)}\n\n${props.body}`)
  }
  if (include.includes('parents')) {
    (props.graphNode?.parents || []).forEach((edge) => {
      if (edge.targetNode) {
        sections.push(`## Parent ${edge.targetNode.recordType}\n${JSON.stringify(edge.targetNode.frontMatter, null, 2)}`)
      }
    })
  }
  if (include.includes('children')) {
    (props.graphNode?.children || []).forEach((edge) => {
      if (edge.targetNode) {
        sections.push(`## Child ${edge.targetNode.recordType}\n${JSON.stringify(edge.targetNode.frontMatter, null, 2)}`)
      }
    })
  }
  if (include.includes('related')) {
    (props.graphNode?.related || []).forEach((edge) => {
      if (edge.targetNode) {
        sections.push(`## Related ${edge.targetNode.recordType}\n${JSON.stringify(edge.targetNode.frontMatter, null, 2)}`)
      }
    })
  }
  return sections.join('\n\n')
}

async function runAction(action) {
  if (!action) return
  try {
    isRunning.value = true
    errorText.value = ''
    responseText.value = ''
    selectedAction.value = action.id

    const context = buildContext(action.include || ['self'])
    const userPrompt = `${action.userTemplate || ''}\n\n${customPrompt.value}`.trim()
    const guardrails =
      'You are an AI whose job is to fill out forms. Reply with valid YAML front matter followed by Markdown body content that passes schema validation. NEVER modify identifiers such as id, recordType, title, or shortSlug.'
    const messages = [
      { role: 'system', content: `${guardrails}\n\n${action.systemPrompt || 'You are a helpful assistant.'}`.trim() },
      { role: 'user', content: `${context}\n\n${userPrompt}`.trim() }
    ]

    responseText.value = await client.sendChat({ messages })
    const { metadata, body, message } = extractStructuredData(responseText.value)
    parsedMetadata.value = metadata
    parsedBody.value = body
    parseMessage.value = message
  } catch (err) {
    errorText.value = err?.message || 'Assistant request failed.'
    parsedMetadata.value = null
    parsedBody.value = ''
    parseMessage.value = ''
  } finally {
    isRunning.value = false
  }
}

async function runCustomPrompt() {
  await runAction({
    id: 'custom',
    systemPrompt: 'You are a helpful assistant that responds to the provided context.',
    userTemplate: '',
    include: ['self']
  })
}

function extractStructuredData(text) {
  if (!text) return { metadata: null, body: '', message: '' }
  const match = text.match(/```(\w+)?\s*([\s\S]*?)```/i)
  const lang = match?.[1]?.toLowerCase()
  const candidate = (match ? match[2] : text).trim()

  const tryJson = () => {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object') {
        parseMessage.value = 'Parsed JSON response.'
        return parsed
      }
    } catch (_) {}
    return null
  }

  const tryYaml = () => {
    try {
      const parsed = YAML.parse(candidate)
      if (parsed && typeof parsed === 'object') {
        parseMessage.value = 'Parsed YAML response.'
        return parsed
      }
    } catch (_) {}
    return null
  }

  let parsed = null
  if (!lang || lang === 'json') {
    parsed = tryJson()
    if (parsed) return parsed
    parsed = tryYaml()
  } else if (lang === 'yaml' || lang === 'yml') {
    parsed = tryYaml()
    if (parsed) return parsed
    parsed = tryJson()
  } else {
    parsed = tryJson() || tryYaml()
  }

  if (!parsed) {
    const jsonFallback = extractJsonSnippet(text)
    if (jsonFallback) {
      try {
        const parsedSnippet = JSON.parse(jsonFallback)
        if (parsedSnippet && typeof parsedSnippet === 'object') {
          parseMessage.value = 'Parsed JSON snippet.'
          parsed = parsedSnippet
        }
      } catch (_) {}
    }
  }

  if (!parsed) {
    const yamlBlock = extractYamlFrontMatter(text)
    if (yamlBlock) {
      try {
        const parsedYaml = YAML.parse(yamlBlock)
        if (parsedYaml && typeof parsedYaml === 'object') {
          parseMessage.value = 'Parsed YAML front matter.'
          parsed = parsedYaml
        }
      } catch (_) {}
    }
  }

  let bodyText = ''
  if (!parsed) {
    return { metadata: null, body: '', message: '' }
  }

  const extracted = extractMarkdownBody(text)
  if (extracted) {
    bodyText = extracted
  }

  return { metadata: parsed, body: bodyText, message: parseMessage.value }
}

function extractJsonSnippet(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1)
  }
  return null
}

function extractYamlFrontMatter(text) {
  const match = text.match(/---([\s\S]*?)---/)
  if (match && match[1]) {
    return match[1]
  }
  return null
}

function extractMarkdownBody(text) {
  const parts = text.split(/---[\s\S]*?---/)
  if (parts.length > 1) {
    return parts.pop().trim()
  }
  return ''
}

const emit = defineEmits(['apply', 'apply-body'])

function applyMetadata() {
  if (!parsedMetadata.value) return
  emit('apply', parsedMetadata.value)
}

function applyBody() {
  if (!parsedBody.value) return
  emit('apply-body', parsedBody.value)
}

function saveApiKey(event) {
  client.setApiKey(event.target.value)
}

function saveBaseUrl(event) {
  client.setBaseUrl(event.target.value)
}
</script>

<template>
  <section class="assistant-panel">
    <header class="record-section-header">
      <p class="section-label">Assistant</p>
    </header>

    <div class="assistant-settings">
      <label>Assistant API base URL</label>
      <input type="text" placeholder="https://api.openai.com/v1" :value="client.baseUrl.value" @input="saveBaseUrl" />

      <label>API key (optional)</label>
      <input type="password" placeholder="sk-..." :value="client.apiKey.value" @input="saveApiKey" />

      <label>Model name</label>
      <select v-if="models.length" :value="client.modelName.value" @change="(e) => client.setModelName(e.target.value)">
        <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
      </select>
      <input
        v-else
        type="text"
        placeholder="gpt-4o-mini"
        :value="client.modelName.value"
        @input="(e) => client.setModelName(e.target.value)"
      />
      <p v-if="isLoadingModels" class="status status-muted">Loading models…</p>
      <p v-else-if="modelsError" class="status status-error">{{ modelsError }}</p>
    </div>

    <div>
      <label>Custom prompt</label>
      <textarea rows="3" v-model="customPrompt"></textarea>

      <div class="assistant-actions">
        <button
          v-if="actions.length"
          v-for="action in actions"
          :key="action.id"
          class="secondary"
          type="button"
          :disabled="isRunning"
          @click="runAction(action)"
        >
          {{ action.label }}
        </button>
        <button class="primary" type="button" :disabled="isRunning" @click="runCustomPrompt">
          Submit prompt
        </button>
      </div>

      <p v-if="errorText" class="status status-error">{{ errorText }}</p>
      <p v-else-if="isRunning" class="status status-muted">Consulting assistant…</p>
      <div v-if="responseText" class="assistant-response">
        <pre>{{ responseText }}</pre>
        <p v-if="parseMessage" class="status status-muted">{{ parseMessage }}</p>
        <p v-else class="status status-muted">No structured metadata detected. Ask the assistant to respond with JSON or YAML.</p>
        <div class="assistant-actions">
          <button v-if="parsedMetadata" class="primary" type="button" @click="applyMetadata">Apply to metadata</button>
          <button v-if="parsedBody" class="secondary" type="button" @click="applyBody">Apply to body</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.assistant-panel {
  margin-top: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
  background: #fff;
}

.assistant-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.75rem 0;
}

textarea {
  width: 100%;
  border-radius: 10px;
  border: 1px solid #cbd5f5;
  padding: 0.5rem;
  font-size: 0.95rem;
}

.assistant-response {
  margin-top: 0.75rem;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  white-space: pre-wrap;
}
</style>
