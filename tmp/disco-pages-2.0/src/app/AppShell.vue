<script setup>
import { computed, ref } from 'vue'
import AppPanel from '../ui/panels/AppPanel.vue'
import CollapsibleSection from '../ui/collapsible/CollapsibleSection.vue'
import FileTreeBrowser from '../ui/file-tree/FileTreeBrowser.vue'
import TipTapEditor from '../ui/tiptap/TipTapEditor.vue'
import BaseModal from '../ui/modal/BaseModal.vue'
import { useRepoAccess } from '../fs/useRepoAccess'

const { directoryHandle, error, isSupported, isRequesting, requestAccess } = useRepoAccess()

const showPrompt = ref(true)
const editorContent = ref(null)

const fileTreeDemo = ref([
  {
    id: 'records',
    name: 'records',
    type: 'directory',
    children: [
      {
        id: 'records/protocols',
        name: 'protocols',
        type: 'directory',
        children: [
          {
            id: 'records/protocols/dna-extraction',
            name: 'dna-extraction',
            type: 'directory',
            children: [
              { id: 'records/protocols/dna-extraction/record.yaml', name: 'record.yaml', type: 'file' },
              { id: 'records/protocols/dna-extraction/body.tiptap.json', name: 'body.tiptap.json', type: 'file' }
            ]
          },
          {
            id: 'records/protocols/qpcr-setup',
            name: 'qpcr-setup',
            type: 'directory',
            children: [
              { id: 'records/protocols/qpcr-setup/record.yaml', name: 'record.yaml', type: 'file' }
            ]
          }
        ]
      },
      {
        id: 'records/samples',
        name: 'samples',
        type: 'directory',
        children: [
          { id: 'records/samples/sample-a.md', name: 'sample-a.md', type: 'file' },
          { id: 'records/samples/sample-b.md', name: 'sample-b.md', type: 'file' }
        ]
      }
    ]
  },
  {
    id: 'schema',
    name: 'schema',
    type: 'directory',
    children: [
      { id: 'schema/experiment.schema.yaml', name: 'experiment.schema.yaml', type: 'file' },
      { id: 'schema/protocol.schema.yaml', name: 'protocol.schema.yaml', type: 'file' },
      { id: 'schema/workflows.yaml', name: 'workflows.yaml', type: 'file' }
    ]
  }
])

const connectionLabel = computed(() => {
  if (directoryHandle.value) {
    return `Connected: ${directoryHandle.value.name}`
  }
  return 'No repository selected'
})

const shouldShowModal = computed(() => showPrompt.value && !directoryHandle.value)

async function handleConnect() {
  if (!isSupported) return
  await requestAccess()
  if (directoryHandle.value) {
    showPrompt.value = false
  }
}

function closePrompt() {
  showPrompt.value = false
}

function reopenPrompt() {
  showPrompt.value = true
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div>
        <p class="app-kicker">Phase 1 · Bootstrap</p>
        <h1>DIsCo Pages 2.0</h1>
        <p class="app-subtitle">Schema-driven LIS/QMS shell powered by Vue + Vite</p>
      </div>
      <div class="connection-pill" :class="{ 'is-connected': directoryHandle }">
        <span>{{ connectionLabel }}</span>
        <button class="pill-button" type="button" @click="reopenPrompt">Choose folder</button>
      </div>
    </header>

    <main class="app-main">
      <AppPanel>
        <h2>Repository connection</h2>
        <p>
          The File System Access API stores a user-approved directory handle. All future schema loading,
          validation, and record workflows will use this handle as the repo root.
        </p>

        <div class="action-row">
          <button
            class="primary"
            type="button"
            :disabled="isRequesting || !isSupported"
            @click="handleConnect"
          >
            {{ directoryHandle ? 'Reconnect' : 'Select repository folder' }}
          </button>
          <button class="secondary" type="button" @click="reopenPrompt">
            Show prompt
          </button>
        </div>

        <p v-if="!isSupported" class="support-warning">
          This browser does not expose the File System Access API. Use a Chromium-based browser to continue.
        </p>
        <p v-else-if="error" class="status status-error">{{ error }}</p>
        <p v-else-if="directoryHandle" class="status status-ok">
          Ready to operate against <strong>{{ directoryHandle.name }}</strong>
        </p>
        <p v-else class="status status-muted">
          Waiting for a repository selection.
        </p>
      </AppPanel>

      <AppPanel>
        <CollapsibleSection title="File tree browser" badge="preview" storage-key="file-tree-demo">
          <FileTreeBrowser :nodes="fileTreeDemo" />
        </CollapsibleSection>

        <CollapsibleSection title="TipTap markdown editor" badge="preview" storage-key="tiptap-demo">
          <TipTapEditor v-model="editorContent" />
        </CollapsibleSection>
      </AppPanel>
    </main>

    <BaseModal v-if="shouldShowModal" title="Select your repository" @close="closePrompt">
      <p>
        Pick the root folder that contains <code>records/</code> and <code>schema/</code>. The browser will
        ask for read/write permission once and cache the decision for future sessions.
      </p>
      <template #footer>
        <button class="secondary" type="button" @click="closePrompt">Not now</button>
        <button
          class="primary"
          type="button"
          :disabled="isRequesting || !isSupported"
          @click="handleConnect"
        >
          {{ isRequesting ? 'Awaiting permission…' : 'Select folder' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.app-shell {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.app-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1.5rem;
}

.app-kicker {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 0.5rem;
}

.app-header h1 {
  margin: 0;
  font-size: 2.5rem;
}

.app-subtitle {
  margin: 0.2rem 0 0;
  color: #475569;
}

.connection-pill {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: #fff;
  min-width: 280px;
}

.connection-pill.is-connected {
  border-color: rgba(16, 185, 129, 0.4);
}

.app-main {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.75rem;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

code {
  background: #e2e8f0;
  border-radius: 6px;
  padding: 0.1rem 0.35rem;
}
</style>