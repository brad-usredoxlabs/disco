<script setup>
import { computed, ref, watch } from 'vue'
import AppPanel from '../ui/panels/AppPanel.vue'
import FileTreeBrowser from '../ui/file-tree/FileTreeBrowser.vue'
import BaseModal from '../ui/modal/BaseModal.vue'
import FileWorkbench from './FileWorkbench.vue'
import { useRepoConnection } from '../fs/repoConnection'
import { useVirtualRepoTree } from '../fs/useVirtualRepoTree'

const repo = useRepoConnection()
const tree = useVirtualRepoTree(repo)
const rootNodes = tree.rootNodes
const isTreeBootstrapping = tree.isBootstrapping

const showPrompt = ref(true)
const selectedNode = ref(null)

const shouldShowModal = computed(() => showPrompt.value && !repo.directoryHandle.value && !repo.isRestoring.value)
const connectionLabel = computed(() => repo.statusLabel.value)
const isReady = computed(() => !!repo.directoryHandle.value)

watch(
  () => repo.directoryHandle.value,
  (handle) => {
    if (handle) {
      showPrompt.value = false
    } else {
      selectedNode.value = null
    }
  }
)

async function handleConnect() {
  if (repo.isRequesting.value) {
    return
  }
  if (!repo.isSupported) {
    repo.error.value = 'File System Access API not available in this browser.'
    return
  }

  let pickerPromise
  try {
    pickerPromise = window.showDirectoryPicker()
  } catch (err) {
    if (err?.name !== 'AbortError') {
      repo.error.value = err?.message || 'Unable to open directory picker.'
    }
    return
  }

  await repo.requestAccess(pickerPromise)
}

function reopenPrompt() {
  showPrompt.value = true
}

function closePrompt() {
  showPrompt.value = false
}

function handleSelect(node) {
  selectedNode.value = node
}

async function handleExpand(node) {
  await tree.loadChildrenForNode(node)
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div>
        <p class="app-kicker">Phase 2 · File I/O Layer</p>
        <h1>DIsCo Pages 2.0</h1>
        <p class="app-subtitle">Schema-driven LIS/QMS shell powered by Vue + Vite</p>
      </div>
      <div class="connection-pill" :class="{ 'is-connected': isReady }">
        <span>{{ connectionLabel }}</span>
        <button class="pill-button" type="button" @click="reopenPrompt">Choose folder</button>
      </div>
    </header>

    <main class="app-main-grid">
      <div class="column column-left">
        <AppPanel>
          <h2>Repository connection</h2>
          <p>
            The File System Access API stores a user-approved directory handle. All schema, workflow, and record
            operations run directly against this sandboxed repo root.
          </p>

          <div class="action-row">
            <button
              class="primary"
              type="button"
              :class="{ 'is-loading': repo.isRequesting }"
              :disabled="!repo.isSupported"
              @click="handleConnect"
            >
              <span v-if="repo.isRequesting">Awaiting permission…</span>
              <span v-else>{{ isReady ? 'Reconnect' : 'Select repository folder' }}</span>
            </button>
            <button class="secondary" type="button" @click="reopenPrompt">
              Show prompt
            </button>
          </div>

          <p v-if="!repo.isSupported" class="support-warning">
            This browser does not expose the File System Access API. Use a Chromium-based browser to continue.
          </p>
          <p v-else-if="repo.error" class="status status-error">{{ repo.error }}</p>
          <p v-else-if="repo.isRestoring" class="status status-muted">Restoring previous session…</p>
          <p v-else-if="isReady" class="status status-ok">
            Ready to operate against <strong>{{ repo.directoryHandle?.name }}</strong>
          </p>
          <p v-else class="status status-muted">
            Waiting for a repository selection.
          </p>
        </AppPanel>

        <AppPanel class="tree-panel">
          <div class="panel-heading">
            <div>
              <h2>Repository tree</h2>
              <p>Lazy-loaded virtual tree stitched from File System Access directory handles.</p>
            </div>
          </div>
          <FileTreeBrowser
            :nodes="rootNodes"
            :is-loading="isTreeBootstrapping"
            title="repo root"
            @select="handleSelect"
            @expand="handleExpand"
          />
        </AppPanel>
      </div>

      <div class="column column-right">
        <AppPanel class="workbench-panel">
          <FileWorkbench :repo="repo" :node="selectedNode" />
        </AppPanel>
      </div>
    </main>

    <BaseModal v-if="shouldShowModal" title="Select your repository" @close="closePrompt">
      <p>
        Pick the root folder that contains <code>records/</code> and <code>schema/</code>. The browser will request
        persistent read/write permission and cache the choice in IndexedDB.
      </p>
      <template #footer>
        <button class="secondary" type="button" @click="closePrompt">Not now</button>
        <button
          class="primary"
          type="button"
          :class="{ 'is-loading': repo.isRequesting }"
          :disabled="!repo.isSupported"
          @click="handleConnect"
        >
          {{ repo.isRequesting ? 'Awaiting permission…' : 'Select folder' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.app-shell {
  max-width: 1200px;
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

.app-main-grid {
  display: grid;
  grid-template-columns: minmax(320px, 360px) minmax(0, 1fr);
  gap: 1.5rem;
}

@media (max-width: 960px) {
  .app-main-grid {
    grid-template-columns: 1fr;
  }
}

.column {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.panel-heading p {
  margin: 0.2rem 0 1rem;
  color: #64748b;
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
