<script setup>
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { useFileValidation } from '../fs/useFileValidation'

const props = defineProps({
  repo: {
    type: Object,
    required: true
  },
  node: {
    type: Object,
    default: null
  }
})

const currentNode = toRef(props, 'node')
const fileContent = ref('')
const isLoading = ref(false)
const isSaving = ref(false)
const status = ref('')
const error = ref('')
const isDirty = ref(false)

const isFile = computed(() => currentNode.value?.kind === 'file')
const filePath = computed(() => (currentNode.value ? currentNode.value.path : ''))
const validator = useFileValidation(props.repo)
const validationStatus = validator.validationStatus
const validationMessage = validator.validationMessage

watch(
  () => currentNode.value,
  async (node) => {
    status.value = ''
    error.value = ''
    fileContent.value = ''
    isDirty.value = false

    if (node?.kind === 'file') {
      await loadFile(node)
    }
  },
  { immediate: true }
)

async function loadFile(node) {
  if (!node) return
  try {
    isLoading.value = true
    const content = await props.repo.readFile(node.path)
    fileContent.value = content
    status.value = `Loaded ${node.name}`
  } catch (err) {
    error.value = err?.message || 'Unable to load file.'
  } finally {
    isLoading.value = false
  }
}

async function saveFile() {
  if (!isFile.value) return
  try {
    isSaving.value = true
    await props.repo.writeFile(filePath.value, fileContent.value)
    status.value = 'Saved changes'
    isDirty.value = false
  } catch (err) {
    error.value = err?.message || 'Failed to save file.'
  } finally {
    isSaving.value = false
  }
}

function onInput(event) {
  fileContent.value = event.target.value
  isDirty.value = true
}

function revalidate() {
  if (!isFile.value) return
  validator.runValidation(filePath.value, fileContent.value)
}

onBeforeUnmount(() => {
  validator.dispose()
})
</script>

<template>
  <div class="workbench">
    <header class="workbench-header">
      <div>
        <p class="workbench-label">File Inspector</p>
        <h3 v-if="isFile">{{ filePath }}</h3>
        <p v-else>Select a file from the tree to load it here.</p>
      </div>
      <div class="workbench-actions">
        <button
          class="secondary"
          type="button"
        :disabled="!isFile || isLoading"
        @click="loadFile(currentNode)"
        >
          Reload
        </button>
        <button
          class="primary"
          type="button"
          :disabled="!isFile || !isDirty || isSaving"
          @click="saveFile"
        >
          {{ isSaving ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </header>

    <div v-if="error" class="workbench-alert error">{{ error }}</div>
    <div v-else-if="status" class="workbench-alert ok">{{ status }}</div>

    <div
      v-if="isFile"
      class="validation-banner"
      :class="{
        'is-ok': validationStatus === 'ok',
        'is-error': validationStatus === 'error',
        'is-pending': validationStatus === 'pending'
      }"
    >
      <div class="validation-copy">
        <strong>Validation</strong>
        <span>{{ validationMessage }}</span>
      </div>
      <button class="text-button" type="button" :disabled="validationStatus === 'pending'" @click="revalidate">
        {{ validationStatus === 'pending' ? 'Validating…' : 'Re-run validation' }}
      </button>
    </div>

    <textarea
      v-if="isFile"
      class="file-textarea"
      :value="fileContent"
      :disabled="isLoading"
      @input="onInput"
    ></textarea>
    <div v-else class="workbench-placeholder">
      <p>Use the repository tree to choose a Markdown, YAML, or JSON file.</p>
    </div>
  </div>
</template>

<style scoped>
.workbench-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.workbench-label {
  margin: 0;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  color: #94a3b8;
}

.workbench-header h3 {
  margin: 0.2rem 0 0;
  font-size: 1.1rem;
  color: #0f172a;
}

.workbench-actions {
  display: flex;
  gap: 0.5rem;
}

.workbench-alert {
  margin-top: 1rem;
  padding: 0.6rem 0.9rem;
  border-radius: 12px;
  font-size: 0.9rem;
}

.workbench-alert.ok {
  background: #ecfdf5;
  color: #047857;
}

.workbench-alert.error {
  background: #fef2f2;
  color: #b91c1c;
}

.validation-banner {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  font-size: 0.9rem;
  border: 1px solid transparent;
}

.validation-copy {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.validation-copy strong {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
}

.validation-banner.is-ok {
  background: #ecfdf5;
  border-color: rgba(16, 185, 129, 0.3);
  color: #047857;
}

.validation-banner.is-error {
  background: #fef2f2;
  border-color: rgba(239, 68, 68, 0.3);
  color: #b91c1c;
}

.validation-banner.is-pending {
  background: #fff7ed;
  border-color: rgba(251, 191, 36, 0.4);
  color: #c2410c;
}

.file-textarea {
  margin-top: 1rem;
  width: 100%;
  min-height: 360px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  padding: 1rem;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.95rem;
  background: #f8fafc;
  color: #0f172a;
  resize: vertical;
}

.workbench-placeholder {
  margin-top: 2rem;
  padding: 1.5rem;
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  text-align: center;
  color: #94a3b8;
}
</style>
