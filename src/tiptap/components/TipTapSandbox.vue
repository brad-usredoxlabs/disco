<template>
  <div class="sandbox">
    <header class="sandbox-header">
      <div>
        <p class="kicker">Developer utility</p>
        <h3>TapTab sandbox</h3>
      </div>
      <div class="sandbox-actions">
        <button
          type="button"
          class="secondary"
          :disabled="!isConnected || loading"
          @click="loadSandbox"
        >
          {{ loading ? 'Loading…' : 'Reload document' }}
        </button>
        <button
          type="button"
          class="primary"
          :disabled="!tiptapDoc || loading"
          @click="saveSandbox"
        >
          Save sandbox
        </button>
      </div>
    </header>

    <p class="sandbox-subtitle">
      This panel wires the TapTab editor to a disposable markdown file (<code>{{ SANDBOX_PATH }}</code>) so we can
      iterate before hooking it into the File Workbench.
    </p>
    <p v-if="!isConnected" class="sandbox-warning">
      Connect a repository to enable the sandbox.
    </p>

    <div v-if="tiptapDoc" class="sandbox-editor">
      <TipTapEditor v-model="tiptapDoc" />
    </div>
    <p v-else class="sandbox-placeholder">
      Select a repository and click “Reload document” to generate the sandbox file and TapTab sidecar.
    </p>

    <footer class="sandbox-footer">
      <span v-if="status" class="sandbox-status">{{ status }}</span>
      <span v-if="error" class="sandbox-error">{{ error }}</span>
    </footer>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import TipTapEditor from './TipTapEditor.vue'
import { useTipTapIO } from '../composables/useTipTapIO'

const SANDBOX_PATH = '/tmp/tiptap-sandbox.yaml'
const SIDECAR_NAME = 'sandbox.body.tiptap.json'

const props = defineProps({
  repo: {
    type: Object,
    required: true
  }
})

const { loadDocument, saveDocument, loading, error } = useTipTapIO(props.repo)
const tiptapDoc = ref(null)
const metadata = ref({})
const status = ref('')

const isConnected = computed(() => !!props.repo.directoryHandle?.value)

watch(
  () => props.repo.directoryHandle?.value,
  (handle) => {
    if (!handle) {
      tiptapDoc.value = null
      metadata.value = {}
      status.value = ''
      return
    }
    loadSandbox()
  },
  { immediate: true }
)

async function loadSandbox() {
  if (!isConnected.value) {
    status.value = 'Connect a repository to run the sandbox.'
    return
  }
  try {
    status.value = ''
    const payload = await loadDocument(SANDBOX_PATH, {
      ensureExists: true,
      sidecarName: SIDECAR_NAME,
      metadataTemplate: {
        recordType: 'protocol',
        title: 'TapTab sandbox protocol',
        id: 'SANDBOX-001',
        shortSlug: 'SANDBOX'
      }
    })
    metadata.value = payload.metadata
    tiptapDoc.value = payload.tiptapDoc
    status.value = 'Sandbox ready.'
  } catch (err) {
    status.value = err?.message || 'Failed to load sandbox.'
    console.error('[TipTapSandbox] load failed', err)
  }
}

async function saveSandbox() {
  if (!tiptapDoc.value) return
  try {
    status.value = ''
    await saveDocument({
      recordPath: SANDBOX_PATH,
      metadata: metadata.value,
      tiptapDoc: tiptapDoc.value,
      sidecarName: SIDECAR_NAME
    })
    status.value = 'Sandbox saved.'
  } catch (err) {
    status.value = err?.message || 'Failed to save sandbox.'
    console.error('[TipTapSandbox] save failed', err)
  }
}
</script>

<style scoped>
.sandbox {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sandbox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.kicker {
  margin: 0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9ca3af;
}

.sandbox-header h3 {
  margin: 0.15rem 0 0;
  font-size: 1.1rem;
}

.sandbox-actions {
  display: flex;
  gap: 0.5rem;
}

.sandbox-actions button {
  border-radius: 999px;
  padding: 0.45rem 0.9rem;
  font-size: 0.85rem;
  border: 1px solid transparent;
  cursor: pointer;
}

.sandbox-actions .primary {
  background: #2563eb;
  color: #fff;
  border-color: #1d4ed8;
}

.sandbox-actions .secondary {
  background: #fff;
  border-color: #d1d5db;
}

.sandbox-actions button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sandbox-subtitle {
  margin: 0;
  font-size: 0.9rem;
  color: #4b5563;
}

.sandbox-warning {
  margin: 0;
  color: #b45309;
  font-size: 0.85rem;
}

.sandbox-editor {
  border: 1px dashed #cbd5f5;
  border-radius: 8px;
  padding: 0.5rem;
  background: #f8fafc;
}

.sandbox-placeholder {
  margin: 0;
  font-size: 0.9rem;
  color: #6b7280;
  font-style: italic;
}

.sandbox-footer {
  display: flex;
  gap: 1rem;
  align-items: center;
  min-height: 1.5rem;
}

.sandbox-status {
  font-size: 0.85rem;
  color: #059669;
}

.sandbox-error {
  font-size: 0.85rem;
  color: #b91c1c;
}
</style>
