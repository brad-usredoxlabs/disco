<script setup>
import { computed, reactive, watch } from 'vue'
import BaseModal from '../ui/modal/BaseModal.vue'
import { storagePlacement, prefillScope, normalizeAssertionId, mintAssertionId } from './assertionUtils'

const props = defineProps({
  open: { type: Boolean, default: false },
  invokedFrom: { type: String, default: '' }, // run_editor | experiment_editor | project_editor | global_assertions_browser | well_plate_editor | quick_add_command_palette
  context: { type: Object, default: () => ({}) }, // {study, experiment, run, plate, well, acquisition, channel}
  namespacingConfig: { type: Object, default: () => ({}) },
  initialAssertion: { type: Object, default: null }
})

const emit = defineEmits(['close', 'save'])

const form = reactive({
  '@id': '',
  kind: 'assertion',
  subject: { type: '', ref: '' },
  predicate: '',
  object: { type: '', ref: '', qualifiers: {} },
  qualifiers: { feature: '', target: '', direction: '', modality: '', notes: '' },
  scope: prefillScope(props.context),
  provenance: {
    asserted_by: '',
    asserted_at: '',
    confidence: undefined,
    epistemic_status: '',
    evidence: [],
    notes: ''
  }
})

const storageInfo = computed(() => storagePlacement(props.invokedFrom, form.scope))
const promoteAvailable = computed(() => storageInfo.value.mode !== 'standalone_record')

watch(
  () => props.context,
  (ctx) => {
    form.scope = prefillScope(ctx || {})
  },
  { deep: true }
)

watch(
  () => props.initialAssertion,
  (assertion) => {
    if (!assertion) return
    Object.assign(form, JSON.parse(JSON.stringify(assertion)))
  },
  { immediate: true, deep: true }
)

function ensureId() {
  try {
    if (form['@id']) {
      form['@id'] = normalizeAssertionId(form['@id'], props.namespacingConfig)
    } else {
      form['@id'] = mintAssertionId(props.namespacingConfig)
    }
  } catch (err) {
    return err?.message || 'Unable to mint assertion id.'
  }
  return ''
}

function handleSave() {
  const idErr = ensureId()
  if (idErr) {
    emit('save', { ok: false, error: idErr })
    return
  }
  emit('save', { ok: true, assertion: JSON.parse(JSON.stringify(form)), storage: storageInfo.value })
}

function handlePromote() {
  const idErr = ensureId()
  if (idErr) {
    emit('save', { ok: false, error: idErr })
    return
  }
  emit('save', {
    ok: true,
    assertion: JSON.parse(JSON.stringify(form)),
    storage: { mode: 'standalone_record', fieldName: 'assertions', embedRecommended: false },
    promote: true
  })
}
</script>

<template>
  <BaseModal v-if="open" title="Add assertion" :max-width="720" @close="$emit('close')">
    <div class="stack">
      <p class="status status-muted tiny">
        Storage is determined by context:
        <strong v-if="storageInfo.mode === 'standalone_record'">Standalone record under assertions/</strong>
        <strong v-else>Embedded in parent record ({{ storageInfo.mode.replace(/_/g, ' ') }})</strong>.
        <span v-if="storageInfo.embedRecommended">Well/run scope → embed to avoid file explosion.</span>
      </p>

      <div class="grid two">
        <label>
          Subject type
          <input v-model="form.subject.type" type="text" placeholder="run | experiment | study | well | material" />
        </label>
        <label>
          Subject ref
          <input v-model="form.subject.ref" type="text" placeholder="Record @id or well label" />
        </label>
      </div>

      <label>
        Predicate
        <input v-model="form.predicate" type="text" placeholder="e.g., increases, measures, is_control_for" />
      </label>

      <div class="grid two">
        <label>
          Object type
          <input v-model="form.object.type" type="text" placeholder="feature | target | role | phenomenon" />
        </label>
        <label>
          Object ref
          <input v-model="form.object.ref" type="text" placeholder="Term IRI/CURIE or free text" />
        </label>
      </div>

      <label>
        Object qualifiers
        <input v-model="form.object.qualifiers.notes" type="text" placeholder="Compartment, direction, etc." />
      </label>

      <details>
        <summary>Optional qualifiers</summary>
        <div class="grid two">
          <label>
            Feature
            <input v-model="form.qualifiers.feature" type="text" placeholder="Feature IRI/CURIE or free text" />
          </label>
          <label>
            Target
            <input v-model="form.qualifiers.target" type="text" placeholder="Target IRI/CURIE or free text" />
          </label>
          <label>
            Direction
            <input v-model="form.qualifiers.direction" type="text" placeholder="increase | decrease | no_change" />
          </label>
          <label>
            Modality
            <input v-model="form.qualifiers.modality" type="text" placeholder="CellROX, qPCR, ..." />
          </label>
        </div>
        <label>
          Notes
          <textarea v-model="form.qualifiers.notes" rows="2" />
        </label>
      </details>

      <details>
        <summary>Scope</summary>
        <div class="grid two">
          <label>
            Study
            <input v-model="form.scope.study" type="text" />
          </label>
          <label>
            Experiment
            <input v-model="form.scope.experiment" type="text" />
          </label>
          <label>
            Run
            <input v-model="form.scope.run" type="text" />
          </label>
          <label>
            Plate
            <input v-model="form.scope.plate" type="text" />
          </label>
          <label>
            Well
            <input v-model="form.scope.well" type="text" />
          </label>
          <label>
            Acquisition
            <input v-model="form.scope.acquisition" type="text" />
          </label>
          <label>
            Channel
            <input v-model="form.scope.channel" type="text" />
          </label>
        </div>
      </details>

      <details>
        <summary>Provenance & belief</summary>
        <div class="grid two">
          <label>
            Asserted by
            <input v-model="form.provenance.asserted_by" type="text" placeholder="user or agent id" />
          </label>
          <label>
            Asserted at
            <input v-model="form.provenance.asserted_at" type="datetime-local" />
          </label>
          <label>
            Confidence (0–1)
            <input v-model.number="form.provenance.confidence" type="number" min="0" max="1" step="0.01" />
          </label>
          <label>
            Epistemic status
            <input v-model="form.provenance.epistemic_status" type="text" placeholder="belief | hypothesis | observation | literature_claim" />
          </label>
        </div>
        <label>
          Evidence (free text or URI/DOI)
          <textarea
            v-model="form.provenance.notes"
            rows="2"
            placeholder="Brief evidence note or citation (formal evidence array can be added later)"
          />
        </label>
      </details>

      <div class="footer-actions" role="group">
        <button class="ghost-button" type="button" @click="$emit('close')">Cancel</button>
        <div class="footer-actions__right">
          <button
            v-if="promoteAvailable"
            class="ghost-button"
            type="button"
            @click="handlePromote"
          >
            Promote to global
          </button>
          <button class="primary" type="button" @click="handleSave">Save assertion</button>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.grid.two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.95rem;
}

input,
textarea {
  width: 100%;
}

.footer-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.footer-actions__right {
  display: flex;
  gap: 0.5rem;
}
</style>
