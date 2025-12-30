<script setup>
import BaseModal from '../../ui/modal/BaseModal.vue'
import RecordCreatorModal from '../RecordCreatorModal.vue'
import AssertionModal from '../../assertions/AssertionModal.vue'

defineProps({
  shouldShowModal: { type: Boolean, default: false },
  showSettingsModal: { type: Boolean, default: false },
  settingsForm: { type: Object, required: true },
  settingsError: { type: String, default: '' },
  settingsSaving: { type: Boolean, default: false },
  showPromotionModal: { type: Boolean, default: false },
  promotionForm: { type: Object, required: true },
  showExplorerModal: { type: Boolean, default: false },
  explorerFilePath: { type: String, default: '' },
  explorerLabwareId: { type: String, default: '' },
  showRunEditorModal: { type: Boolean, default: false },
  runEditorFilePath: { type: String, default: '' },
  showAssertionModal: { type: Boolean, default: false },
  assertionInvokedFrom: { type: String, default: '' },
  assertionContext: { type: Object, default: () => ({}) },
  namespacingConfig: { type: Object, default: () => ({}) },
  showCreator: { type: Boolean, default: false },
  creatorContext: { type: Object, default: null },
  repo: { type: Object, required: true },
  schemaLoader: { type: Object, required: true },
  workflowLoader: { type: Object, required: true },
  recordGraph: { type: Object, required: true }
})

const emit = defineEmits([
  'connect',
  'close-prompt',
  'close-settings',
  'save-settings',
  'close-promotion',
  'promote-run',
  'close-explorer',
  'open-explorer',
  'update:explorerFilePath',
  'update:explorerLabwareId',
  'close-run-editor',
  'open-run-editor',
  'update:runEditorFilePath',
  'close-assertion',
  'save-assertion',
  'close-creator',
  'record-created'
])
</script>

<template>
  <BaseModal v-if="shouldShowModal" title="Select your repository" @close="emit('close-prompt')">
    <p>
      Pick the root folder that contains <code>records/</code> and <code>schema/</code>. The browser will request
      persistent read/write permission and cache the choice in IndexedDB.
    </p>
    <template #footer>
      <button class="secondary" type="button" @click="emit('close-prompt')">Not now</button>
      <button
        class="primary"
        type="button"
        :class="{ 'is-loading': repo.isRequesting }"
        :disabled="!repo.isSupported"
        @click="emit('connect')"
      >
        {{ repo.isRequesting ? 'Awaiting permission…' : 'Select folder' }}
      </button>
    </template>
  </BaseModal>

  <BaseModal v-if="showSettingsModal" title="Settings" @close="emit('close-settings')">
    <template #body>
      <div class="modal-form">
        <label>
          Ontology cache duration (days)
          <input v-model.number="settingsForm.cacheDuration" type="number" min="1" />
        </label>
        <label>
          Namespace base IRI
          <input v-model="settingsForm.baseIri" type="text" placeholder="https://example.org/computable-lab" />
        </label>
        <label>
          CURIE prefix
          <input v-model="settingsForm.curiePrefix" type="text" placeholder="usrl" />
        </label>
        <label>
          Local namespace (provenance)
          <input
            v-model="settingsForm.localNamespace"
            type="text"
            placeholder="urn:local"
          />
        </label>
        <p v-if="settingsError" class="status status-error">{{ settingsError }}</p>
        <p class="status status-muted">
          Settings are saved to <code>config/system.yaml</code> in your connected repository.
        </p>
      </div>
    </template>
    <template #footer>
      <button class="ghost-button" type="button" @click="emit('close-settings')">Cancel</button>
      <button class="primary" type="button" :class="{ 'is-loading': settingsSaving }" @click="emit('save-settings')">
        {{ settingsSaving ? 'Saving…' : 'Save settings' }}
      </button>
    </template>
  </BaseModal>

  <BaseModal v-if="showPromotionModal" title="Promote run to protocol" @close="emit('close-promotion')">
    <template #body>
      <p>Convert a run’s PlateEvents into a protocol template.</p>
      <div class="modal-form">
        <label>
          Run path
          <input v-model="promotionForm.runPath" type="text" placeholder="08_RUNS/RUN-0001.md" />
        </label>
        <label>
          Protocol title
          <input v-model="promotionForm.title" type="text" placeholder="Promoted protocol" />
        </label>
        <label>
          Family
          <input v-model="promotionForm.family" type="text" placeholder="protocol family" />
        </label>
        <label>
          Version
          <input v-model="promotionForm.version" type="text" placeholder="0.1.0" />
        </label>
        <label>
          Volume param (optional)
          <input v-model="promotionForm.volumeParam" type="text" placeholder="transfer_volume" />
        </label>
        <div class="labware-rows">
          <label>Labware role bindings</label>
          <div
            v-for="(row, idx) in promotionForm.labwareRows"
            :key="idx"
            class="labware-row"
          >
            <input v-model="row.role" type="text" placeholder="source_role" />
            <input v-model="row.id" type="text" placeholder="labware:@id" />
            <button class="ghost-button tiny" type="button" @click="promotionForm.labwareRows.splice(idx, 1)">
              Remove
            </button>
          </div>
          <button class="ghost-button" type="button" @click="promotionForm.labwareRows.push({ role: '', id: '' })">
            + Add mapping
          </button>
        </div>
      </div>
    </template>
    <template #footer>
      <button class="ghost-button" type="button" @click="emit('close-promotion')">Cancel</button>
      <button class="primary" type="button" :disabled="!promotionForm.runPath" @click="emit('promote-run')">
        Promote
      </button>
    </template>
  </BaseModal>

  <BaseModal v-if="showExplorerModal" title="Open Lab Event Graph Explorer" @close="emit('close-explorer')">
    <template #body>
      <p>Select a Run file to explore PlateEvents.</p>
      <div class="modal-form">
        <label>
          Run path
          <input :value="explorerFilePath" type="text" placeholder="08_RUNS/RUN-0001.md" @input="emit('update:explorerFilePath', $event.target.value)" />
        </label>
        <label>
          Labware @id (optional)
          <input :value="explorerLabwareId" type="text" placeholder="plate/PLT-0001" @input="emit('update:explorerLabwareId', $event.target.value)" />
        </label>
      </div>
    </template>
    <template #footer>
      <button class="ghost-button" type="button" @click="emit('close-explorer')">Cancel</button>
      <button class="primary" type="button" :disabled="!explorerFilePath" @click="emit('open-explorer')">
        Open in Explorer
      </button>
    </template>
  </BaseModal>

  <BaseModal v-if="showRunEditorModal" title="Open Run Editor" @close="emit('close-run-editor')">
    <template #body>
      <p>Select a Run file to edit activities and PlateEvents.</p>
      <div class="modal-form">
        <label>
          Run path
          <input :value="runEditorFilePath" type="text" placeholder="08_RUNS/RUN-0001.md" @input="emit('update:runEditorFilePath', $event.target.value)" />
        </label>
      </div>
    </template>
    <template #footer>
      <button class="ghost-button" type="button" @click="emit('close-run-editor')">Cancel</button>
      <button class="primary" type="button" :disabled="!runEditorFilePath" @click="emit('open-run-editor')">
        Open Run Editor
      </button>
    </template>
  </BaseModal>

  <AssertionModal
    v-if="showAssertionModal"
    :open="showAssertionModal"
    :invoked-from="assertionInvokedFrom"
    :context="assertionContext"
    :namespacing-config="namespacingConfig"
    @close="emit('close-assertion')"
    @save="emit('save-assertion', $event)"
  />

  <component
    v-if="showCreator"
    :is="RecordCreatorModal"
    :open="showCreator"
    :repo="repo"
    :schema-loader="schemaLoader"
    :workflow-loader="workflowLoader"
    :record-graph="recordGraph"
    :on-created="(val) => emit('record-created', val)"
    :creation-context="creatorContext"
    @close="emit('close-creator')"
  />
</template>
