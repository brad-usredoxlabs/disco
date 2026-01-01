<script setup>
import AppPanel from '../../ui/panels/AppPanel.vue'
import RecordSearchPanel from '../RecordSearchPanel.vue'
import GraphTreePanel from '../GraphTreePanel.vue'
import GraphQueryPanel from '../GraphQueryPanel.vue'
import FileTreeBrowser from '../../ui/file-tree/FileTreeBrowser.vue'

const props = defineProps({
  graphTreeEnabled: { type: Boolean, default: false },
  graphQueryEnabled: { type: Boolean, default: false },
  isReady: { type: Boolean, default: false },
  selectedRootRecordType: { type: String, default: '' },
  topLevelRecordTypes: { type: Array, default: () => [] },
  protocolEnabled: { type: Boolean, default: false },
  recordGraph: { type: Object, required: true },
  schemaLoader: { type: Object, required: true },
  workflowLoader: { type: Object, required: true },
  defaultGraphRootType: { type: [String, Object], default: '' },
  defaultGraphRootLabel: { type: String, default: '' },
  activeRecordPath: { type: String, default: '' },
  tiptapSupportedTypes: { type: Array, default: () => [] },
  supportingDocumentEnabled: { type: Boolean, default: false },
  rootNodes: { type: Array, default: () => [] },
  isTreeBootstrapping: { type: Boolean, default: false },
  searchIndex: { type: Object, required: true }
})

const emit = defineEmits([
  'update:selectedRootRecordType',
  'select',
  'expand',
  'create-selected-record',
  'create-protocol',
  'open-promotion',
  'open-explorer',
  'open-run-editor',
  'open-assertion',
  'graph-create',
  'graph-open-tiptap',
  'graph-open-protocol',
  'graph-create-supporting-doc',
  'graph-use-as-source'
])

const handleSelectRootType = (event) => {
  emit('update:selectedRootRecordType', event?.target?.value || '')
}
</script>

<template>
  <section class="graph-stage">
    <AppPanel>
      <RecordSearchPanel :search="searchIndex" @open="emit('select', $event)" />
    </AppPanel>
    <AppPanel class="graph-panel">
      <div class="graph-panel__header">
        <div>
          <h2>{{ graphTreeEnabled ? 'Record graph' : 'Repository tree' }}</h2>
          <p v-if="graphTreeEnabled">Config-driven navigation sourced directly from relationships.yaml.</p>
          <p v-else>Fallback tree built from the repo handle while graph mode is disabled.</p>
        </div>
        <div v-if="graphTreeEnabled" class="graph-panel__actions">
          <label class="graph-panel__actions-label" for="graph-create-select">New</label>
          <select
            id="graph-create-select"
            :value="selectedRootRecordType"
            :disabled="!isReady || !topLevelRecordTypes.length"
            @change="handleSelectRootType"
          >
            <option v-for="type in topLevelRecordTypes" :key="type" :value="type">
              {{ type }}
            </option>
          </select>
          <button
            class="ghost-button"
            type="button"
            :disabled="!isReady || !selectedRootRecordType"
            @click="emit('create-selected-record')"
          >
            + Add record
          </button>
          <button
            v-if="protocolEnabled"
            class="ghost-button"
            type="button"
            :disabled="!isReady"
            @click="emit('create-protocol')"
          >
            + Add protocol
          </button>
          <button class="ghost-button" type="button" :disabled="!isReady" @click="emit('open-promotion')">
            Promote to protocol
          </button>
          <button class="ghost-button" type="button" :disabled="!isReady" @click="emit('open-explorer')">
            Open Explorer
          </button>
          <button class="ghost-button" type="button" :disabled="!isReady" @click="emit('open-run-editor')">
            Open Run Editor
          </button>
          <button class="ghost-button" type="button" :disabled="!isReady" @click="emit('open-assertion')">
            Add assertion
          </button>
        </div>
      </div>
      <GraphTreePanel
        v-if="graphTreeEnabled"
        :graph-state="recordGraph"
        :schema-loader="schemaLoader"
        :workflow-loader="workflowLoader"
        :default-root-type="defaultGraphRootType"
        :default-root-label="defaultGraphRootLabel"
        :active-path="activeRecordPath"
        :tiptap-record-types="tiptapSupportedTypes"
        :supporting-document-enabled="supportingDocumentEnabled"
        @select-record="emit('select', $event)"
        @create-child="emit('graph-create', $event)"
        @open-tiptap="emit('graph-open-tiptap', $event)"
        @open-protocol="emit('graph-open-protocol', $event)"
        @create-supporting-doc="emit('graph-create-supporting-doc', $event)"
        @use-as-source="emit('graph-use-as-source', $event)"
      />
      <FileTreeBrowser
        v-else
        :nodes="rootNodes"
        :is-loading="isTreeBootstrapping"
        title="repo root"
        @select="emit('select', $event)"
        @expand="emit('expand', $event)"
      />
    </AppPanel>
    <AppPanel v-if="graphQueryEnabled" class="graph-query-panel">
      <GraphQueryPanel :graph-state="recordGraph" :schema-loader="schemaLoader" :workflow-loader="workflowLoader" />
    </AppPanel>
  </section>
</template>

<style scoped>
.graph-stage {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.graph-panel__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

.graph-panel__header h2 {
  margin: 0;
}

.graph-panel__header p {
  margin: 0.25rem 0 0;
  color: #64748b;
}

.graph-panel__actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.graph-panel__actions-label {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.graph-panel__actions select {
  border-radius: 10px;
  border: 1px solid #cbd5f5;
  padding: 0.3rem 0.6rem;
  font-size: 0.9rem;
}

.ghost-button {
  border: 1px solid #cbd5f5;
  background: #fff;
  color: #0f172a;
  padding: 0.25rem 0.8rem;
  border-radius: 999px;
  font-size: 0.85rem;
  cursor: pointer;
}

.ghost-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
