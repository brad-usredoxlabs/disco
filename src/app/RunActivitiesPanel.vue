<script setup>
import { computed } from 'vue'

const KIND_META = {
  protocol_segment: {
    label: 'Protocol segment',
    badge: 'SEG'
  },
  acquisition: {
    label: 'Acquisition',
    badge: 'ACQ'
  },
  sample_operation: {
    label: 'Sample operation',
    badge: 'SMP'
  }
}

const props = defineProps({
  activities: {
    type: Array,
    default: () => []
  },
  labwareBindings: {
    type: Object,
    default: () => ({})
  },
  parameters: {
    type: Object,
    default: () => ({})
  },
  readOnly: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:activities'])

const normalizedActivities = computed(() => (Array.isArray(props.activities) ? props.activities : []))
const hasLabwareBindings = computed(() => Object.keys(props.labwareBindings || {}).length > 0)
const hasParameters = computed(() => Object.keys(props.parameters || {}).length > 0)
const lastProtocolSegment = computed(() => {
  for (let index = normalizedActivities.value.length - 1; index >= 0; index -= 1) {
    const entry = normalizedActivities.value[index]
    if (entry?.kind === 'protocol_segment') {
      return entry
    }
  }
  return null
})
const hasProtocolSegment = computed(() => !!lastProtocolSegment.value)

let tempIdCounter = 0
const KIND_PREFIX = {
  protocol_segment: 'segment',
  acquisition: 'acq',
  sample_operation: 'sample'
}

function cloneActivity(activity = {}) {
  return JSON.parse(JSON.stringify(activity || {}))
}

function emitActivities(next) {
  emit('update:activities', next)
}

function buildActivityTemplate(kind = 'protocol_segment') {
  const prefix = KIND_PREFIX[kind] || 'activity'
  tempIdCounter += 1
  const id = `${prefix}-${tempIdCounter}`
  if (kind === 'acquisition') {
    return {
      id,
      kind,
      label: '',
      acquisition_type: '',
      modality: '',
      features_measured: [],
      materials_used: [],
      acquisitions: []
    }
  }
  if (kind === 'sample_operation') {
    return {
      id,
      kind,
      label: '',
      operation: '',
      produced_samples: []
    }
  }
  return {
    id,
    kind: 'protocol_segment',
    label: '',
    protocol: { '@id': '' },
    labware_bindings: {},
    parameters: {},
    plate_events: []
  }
}

function pushActivityPayload(payload) {
  if (props.readOnly) return
  const next = normalizedActivities.value.map((activity) => cloneActivity(activity))
  next.push(cloneActivity(payload))
  emitActivities(next)
}

function addActivity(kind) {
  pushActivityPayload(buildActivityTemplate(kind))
}

function removeActivity(index) {
  if (props.readOnly) return
  const next = normalizedActivities.value.map((activity) => cloneActivity(activity))
  next.splice(index, 1)
  emitActivities(next)
}

function moveActivity(index, offset) {
  if (props.readOnly) return
  const next = normalizedActivities.value.map((activity) => cloneActivity(activity))
  const target = index + offset
  if (target < 0 || target >= next.length) return
  const [entry] = next.splice(index, 1)
  next.splice(target, 0, entry)
  emitActivities(next)
}

function updateActivity(index, updater) {
  if (props.readOnly) return
  const next = normalizedActivities.value.map((activity) => cloneActivity(activity))
  if (!next[index]) return
  updater(next[index])
  emitActivities(next)
}

function updateActivityField(index, field, value) {
  updateActivity(index, (draft) => {
    if (value === '' || value === null || value === undefined) {
      delete draft[field]
      return
    }
    draft[field] = value
  })
}

function updateProtocolField(index, field, value) {
  updateActivity(index, (draft) => {
    if (!draft.protocol || typeof draft.protocol !== 'object') {
      draft.protocol = {}
    }
    if (value === '' || value === null || value === undefined) {
      delete draft.protocol[field]
      return
    }
    draft.protocol[field] = value
  })
}

function updateKind(index, nextKind) {
  if (!nextKind) return
  updateActivity(index, (draft) => {
    const preserved = {
      id: draft.id,
      label: draft.label,
      started_at: draft.started_at,
      ended_at: draft.ended_at,
      notes: draft.notes
    }
    Object.keys(draft).forEach((key) => {
      delete draft[key]
    })
    Object.assign(draft, buildActivityTemplate(nextKind), preserved, { kind: nextKind })
  })
}

function formatList(list = []) {
  if (!Array.isArray(list) || !list.length) return ''
  return list.join(', ')
}

function parseListInput(value) {
  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
}

function extractPlateEventIds(segment) {
  if (!segment || !Array.isArray(segment.plate_events)) return []
  return segment.plate_events
    .map((event, index) => event?.id || `${segment.id || 'segment'}-event-${index + 1}`)
    .filter(Boolean)
}

function addQuickAcquisition(preset) {
  const segment = lastProtocolSegment.value
  if (!segment) return
  const derived = extractPlateEventIds(segment)
  const payload = buildActivityTemplate('acquisition')
  payload.label = preset.label
  payload.acquisition_type = preset.acquisition_type
  if (preset.instrument) payload.instrument = preset.instrument
  if (preset.mode) payload.mode = preset.mode
  if (Array.isArray(preset.channels) && preset.channels.length) {
    payload.channels = [...preset.channels]
  }
  payload.notes = preset.notes || ''
  if (derived.length) {
    payload.derived_from_plate_events = derived
  }
  pushActivityPayload(payload)
}

const acquisitionPresets = [
  {
    id: 'imaging',
    buttonLabel: 'Add T=24 imaging',
    label: 'T=24 imaging snapshot',
    acquisition_type: 'imaging_cell_count',
    mode: 'brightfield',
    instrument: '',
    channels: ['phase'],
    notes: 'Cell count imaging for normalization'
  },
  {
    id: 'plate-read',
    buttonLabel: 'Add plate-reader read',
    label: 'Plate reader acquisition',
    acquisition_type: 'plate_reader_fluorescence',
    mode: 'fluorescence',
    channels: ['ROS', 'MMP'],
    notes: 'Reader run following latest protocol segment'
  }
]

function updateSampleSourceLabware(index, value) {
  updateActivity(index, (draft) => {
    if (!draft.from || typeof draft.from !== 'object') {
      draft.from = {}
    }
    if (!value) {
      if (draft.from.labware) {
        delete draft.from.labware
      }
      return
    }
    const nextLabware = typeof draft.from.labware === 'object' ? { ...draft.from.labware } : { kind: 'plate' }
    nextLabware['@id'] = value
    nextLabware.label = value
    draft.from.labware = nextLabware
  })
}

function updateSampleSourceWells(index, value) {
  updateActivity(index, (draft) => {
    if (!draft.from || typeof draft.from !== 'object') {
      draft.from = {}
    }
    const wells = parseListInput(value)
    if (wells.length) {
      draft.from.wells = wells
    } else {
      delete draft.from.wells
    }
  })
}

function updateSampleSourceDescription(index, value) {
  updateActivity(index, (draft) => {
    if (!draft.from || typeof draft.from !== 'object') {
      draft.from = {}
    }
    if (value) {
      draft.from.description = value
    } else {
      delete draft.from.description
    }
  })
}

function ensureSampleList(target, key) {
  if (!Array.isArray(target[key])) {
    target[key] = []
  } else {
    target[key] = target[key].map((entry) => (entry && typeof entry === 'object' ? { ...entry } : entry))
  }
  return target[key]
}

function addProducedSample(index) {
  updateActivity(index, (draft) => {
    const list = ensureSampleList(draft, 'produced_samples')
    list.push({ '@id': '', label: '' })
    draft.produced_samples = list
  })
}

function removeProducedSample(activityIndex, sampleIndex) {
  updateActivity(activityIndex, (draft) => {
    const list = ensureSampleList(draft, 'produced_samples')
    list.splice(sampleIndex, 1)
    draft.produced_samples = list
  })
}

function updateProducedSampleField(activityIndex, sampleIndex, field, value) {
  updateActivity(activityIndex, (draft) => {
    const list = ensureSampleList(draft, 'produced_samples')
    if (!list[sampleIndex] || typeof list[sampleIndex] !== 'object') {
      list[sampleIndex] = {}
    } else {
      list[sampleIndex] = { ...list[sampleIndex] }
    }
    const sample = list[sampleIndex]
    if (field.startsWith('material.')) {
      const key = field.split('.').slice(1).join('.')
      const nextMaterial = { ...(sample.material || {}) }
      if (value) {
        nextMaterial[key] = value
      } else {
        delete nextMaterial[key]
      }
      if (Object.keys(nextMaterial).length) {
        sample.material = nextMaterial
      } else {
        delete sample.material
      }
    } else if (value === '' || value === null || value === undefined) {
      delete sample[field]
    } else {
      sample[field] = value
    }
    list[sampleIndex] = sample
    draft.produced_samples = list
  })
}

function addSampleSplit(activityIndex) {
  updateActivity(activityIndex, (draft) => {
    const splits = ensureSampleList(draft, 'splits')
    splits.push({
      sample: { '@id': '', label: '' },
      fraction: ''
    })
    draft.splits = splits
  })
}

function removeSampleSplit(activityIndex, splitIndex) {
  updateActivity(activityIndex, (draft) => {
    const splits = ensureSampleList(draft, 'splits')
    splits.splice(splitIndex, 1)
    draft.splits = splits
  })
}

function updateSampleSplitField(activityIndex, splitIndex, field, value) {
  updateActivity(activityIndex, (draft) => {
    const splits = ensureSampleList(draft, 'splits')
    if (!splits[splitIndex] || typeof splits[splitIndex] !== 'object') {
      splits[splitIndex] = { sample: { '@id': '', label: '' }, fraction: '' }
    } else {
      splits[splitIndex] = { ...splits[splitIndex] }
    }
    const entry = splits[splitIndex]
    if (field === 'fraction') {
      entry.fraction = value || ''
    } else if (field === 'sample.@id') {
      entry.sample = { ...(entry.sample || {}) }
      entry.sample['@id'] = value || ''
    } else if (field === 'sample.label') {
      entry.sample = { ...(entry.sample || {}) }
      entry.sample.label = value || ''
    }
    splits[splitIndex] = entry
    draft.splits = splits
  })
}

function addSampleFile(activityIndex) {
  updateActivity(activityIndex, (draft) => {
    const files = ensureSampleList(draft, 'files')
    files.push({ label: '', uri: '' })
    draft.files = files
  })
}

function removeSampleFile(activityIndex, fileIndex) {
  updateActivity(activityIndex, (draft) => {
    const files = ensureSampleList(draft, 'files')
    files.splice(fileIndex, 1)
    draft.files = files
  })
}

function updateSampleFileField(activityIndex, fileIndex, field, value) {
  updateActivity(activityIndex, (draft) => {
    const files = ensureSampleList(draft, 'files')
    if (!files[fileIndex] || typeof files[fileIndex] !== 'object') {
      files[fileIndex] = {}
    } else {
      files[fileIndex] = { ...files[fileIndex] }
    }
    if (value === '' || value === null || value === undefined) {
      delete files[fileIndex][field]
    } else {
      files[fileIndex][field] = value
    }
    files[fileIndex] = files[fileIndex]
    draft.files = files
  })
}
</script>

<template>
  <section class="run-activities-panel">
    <header class="panel-header">
      <div>
        <p class="section-label">Run timeline</p>
        <h3>Activities ({{ normalizedActivities.length }})</h3>
      </div>
      <div class="panel-actions" v-if="!readOnly">
        <div class="panel-actions__group">
          <button type="button" class="secondary" @click="addActivity('protocol_segment')">Add protocol segment</button>
          <button type="button" class="secondary" @click="addActivity('acquisition')">Add acquisition</button>
          <button type="button" class="secondary" @click="addActivity('sample_operation')">Add sample op</button>
        </div>
        <div class="panel-actions__group">
          <button
            v-for="preset in acquisitionPresets"
            :key="preset.id"
            type="button"
            class="text-button"
            :disabled="!hasProtocolSegment"
            @click="addQuickAcquisition(preset)"
          >
            {{ preset.buttonLabel }}
          </button>
        </div>
      </div>
    </header>

    <div class="run-context" v-if="hasLabwareBindings || hasParameters">
      <div v-if="hasLabwareBindings">
        <h4>Run labware bindings</h4>
        <dl>
          <template v-for="(value, key) in labwareBindings" :key="`lab-${key}`">
            <dt>{{ key }}</dt>
            <dd>{{ value }}</dd>
          </template>
        </dl>
      </div>
      <div v-if="hasParameters">
        <h4>Run parameters</h4>
        <dl>
          <template v-for="(value, key) in parameters" :key="`param-${key}`">
            <dt>{{ key }}</dt>
            <dd>{{ value }}</dd>
          </template>
        </dl>
      </div>
    </div>

    <ol class="activities-list" v-if="normalizedActivities.length">
      <li v-for="(activity, index) in normalizedActivities" :key="activity.id || index" class="activity-card">
        <header class="activity-header">
          <div class="activity-heading">
            <span class="activity-badge" :class="`kind-${activity.kind}`">
              {{ KIND_META[activity.kind]?.badge || 'ACT' }}
            </span>
            <div>
              <strong>{{ activity.label || KIND_META[activity.kind]?.label || 'Untitled activity' }}</strong>
              <p class="activity-subtitle">
                {{ KIND_META[activity.kind]?.label || activity.kind || 'activity' }}
                <span v-if="activity.id">· {{ activity.id }}</span>
              </p>
            </div>
          </div>
          <div class="activity-controls" v-if="!readOnly">
            <button type="button" class="text-button" :disabled="index === 0" @click="moveActivity(index, -1)">Move up</button>
            <button type="button" class="text-button" :disabled="index === normalizedActivities.length - 1" @click="moveActivity(index, 1)">
              Move down
            </button>
            <button type="button" class="text-button" @click="removeActivity(index)">
              Remove
            </button>
          </div>
        </header>

        <div class="activity-grid">
          <label>
            <span>Activity kind</span>
            <select :value="activity.kind" :disabled="readOnly" @change="updateKind(index, $event.target.value)">
              <option value="protocol_segment">Protocol segment</option>
              <option value="acquisition">Acquisition</option>
              <option value="sample_operation">Sample operation</option>
            </select>
          </label>
          <label>
            <span>Activity ID</span>
            <input
              type="text"
              :value="activity.id || ''"
              :readonly="readOnly"
              @input="updateActivityField(index, 'id', $event.target.value.trim())"
            />
          </label>
          <label>
            <span>Label</span>
            <input
              type="text"
              :value="activity.label || ''"
              :readonly="readOnly"
              @input="updateActivityField(index, 'label', $event.target.value)"
            />
          </label>
          <label>
            <span>Started at</span>
            <input
              type="text"
              placeholder="ISO timestamp"
              :value="activity.started_at || ''"
              :readonly="readOnly"
              @input="updateActivityField(index, 'started_at', $event.target.value)"
            />
          </label>
          <label>
            <span>Ended at</span>
            <input
              type="text"
              placeholder="ISO timestamp"
              :value="activity.ended_at || ''"
              :readonly="readOnly"
              @input="updateActivityField(index, 'ended_at', $event.target.value)"
            />
          </label>
        </div>

        <div v-if="activity.kind === 'protocol_segment'" class="activity-subpanel">
          <h5>Protocol segment</h5>
          <div class="activity-grid">
            <label>
              <span>Protocol @id</span>
              <input
                type="text"
                :value="activity.protocol?.['@id'] || ''"
                :readonly="readOnly"
                @input="updateProtocolField(index, '@id', $event.target.value)"
              />
            </label>
            <label>
              <span>Protocol label</span>
              <input
                type="text"
                :value="activity.protocol?.label || ''"
                :readonly="readOnly"
                @input="updateProtocolField(index, 'label', $event.target.value)"
              />
            </label>
          </div>
          <p class="activity-meta" v-if="activity.plate_events?.length">
            {{ activity.plate_events.length }} plate events stored in this segment.
          </p>
        </div>

        <div v-else-if="activity.kind === 'acquisition'" class="activity-subpanel">
          <h5>Acquisition</h5>
          <div class="activity-grid">
            <label>
              <span>Acquisition type</span>
              <input
                type="text"
                :value="activity.acquisition_type || ''"
                :readonly="readOnly"
              @input="updateActivityField(index, 'acquisition_type', $event.target.value)"
            />
          </label>
          <label>
            <span>Modality</span>
            <select
              :value="activity.modality || ''"
              :readonly="readOnly"
              @change="updateActivityField(index, 'modality', $event.target.value)"
            >
              <option value="">Select modality…</option>
              <option value="fluorescence">Fluorescence</option>
              <option value="absorbance">Absorbance</option>
              <option value="luminescence">Luminescence</option>
              <option value="microscopy">Microscopy</option>
              <option value="ms">MS</option>
              <option value="qpcr">qPCR</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            <span>Instrument</span>
            <input
              type="text"
              :value="activity.instrument || ''"
                :readonly="readOnly"
                @input="updateActivityField(index, 'instrument', $event.target.value)"
              />
            </label>
            <label>
              <span>Mode</span>
              <input
                type="text"
                :value="activity.mode || ''"
                :readonly="readOnly"
              @input="updateActivityField(index, 'mode', $event.target.value)"
            />
          </label>
          <label>
            <span>Channels</span>
              <input
                type="text"
                placeholder="Comma-separated"
                :value="formatList(activity.channels)"
                :readonly="readOnly"
                @input="
                  updateActivity(index, (draft) => {
                    const tokens = $event.target.value
                      .split(',')
                      .map((token) => token.trim())
                      .filter(Boolean)
                    draft.channels = tokens.length ? tokens : undefined
                  })
                "
              />
            </label>
            <label>
              <span>Features measured (feature:*)</span>
              <input
                type="text"
                placeholder="feature:abc, feature:def"
                :value="formatList(activity.features_measured)"
                :readonly="readOnly"
                @input="
                  updateActivity(index, (draft) => {
                    const tokens = $event.target.value
                      .split(',')
                      .map((token) => token.trim())
                      .filter(Boolean)
                    draft.features_measured = tokens.length ? tokens : undefined
                  })
                "
              />
            </label>
            <label>
              <span>Materials used (material:*)</span>
              <input
                type="text"
                placeholder="material:dye_x, material:probe_y"
                :value="formatList(activity.materials_used)"
                :readonly="readOnly"
                @input="
                  updateActivity(index, (draft) => {
                    const tokens = $event.target.value
                      .split(',')
                      .map((token) => token.trim())
                      .filter(Boolean)
                    draft.materials_used = tokens.length ? tokens : undefined
                  })
                "
              />
            </label>
          </div>
          <p class="activity-meta" v-if="activity.acquisitions?.length">
            {{ activity.acquisitions.length }} timepoint slice{{ activity.acquisitions.length === 1 ? '' : 's' }} recorded.
          </p>
          <p class="activity-meta" v-if="activity.features_measured?.length">
            Features: {{ formatList(activity.features_measured) }}
          </p>
        </div>

        <div v-else-if="activity.kind === 'sample_operation'" class="activity-subpanel">
          <h5>Sample operation</h5>
          <div class="activity-grid">
            <label>
              <span>Operation</span>
              <input
                type="text"
                :value="activity.operation || ''"
                :readonly="readOnly"
                @input="updateActivityField(index, 'operation', $event.target.value)"
              />
            </label>
            <label>
              <span>Destination target</span>
              <input
                type="text"
                :value="activity.destination?.target || ''"
                :readonly="readOnly"
                @input="
                  updateActivity(index, (draft) => {
                    if (!draft.destination || typeof draft.destination !== 'object') {
                      draft.destination = {}
                    }
                    draft.destination.target = $event.target.value || undefined
                  })
                "
              />
            </label>
            <label>
              <span>Destination notes</span>
              <input
                type="text"
                :value="activity.destination?.notes || ''"
                :readonly="readOnly"
                @input="
                  updateActivity(index, (draft) => {
                    if (!draft.destination || typeof draft.destination !== 'object') {
                      draft.destination = {}
                    }
                    draft.destination.notes = $event.target.value || undefined
                  })
                "
              />
            </label>
          </div>

          <div class="subsection">
            <header class="subsection-header">
              <h6>Source material</h6>
            </header>
            <div class="activity-grid">
              <label>
                <span>Source labware @id</span>
                <input
                  type="text"
                  :value="activity.from?.labware?.['@id'] || ''"
                  :readonly="readOnly"
                  @input="updateSampleSourceLabware(index, $event.target.value)"
                />
              </label>
              <label>
                <span>Source wells</span>
                <input
                  type="text"
                  placeholder="A1,B1"
                  :value="formatList(activity.from?.wells)"
                  :readonly="readOnly"
                  @input="updateSampleSourceWells(index, $event.target.value)"
                />
              </label>
              <label>
                <span>Description</span>
                <input
                  type="text"
                  :value="activity.from?.description || ''"
                  :readonly="readOnly"
                  @input="updateSampleSourceDescription(index, $event.target.value)"
                />
              </label>
            </div>
          </div>

          <div class="subsection">
            <header class="subsection-header">
              <h6>Produced samples</h6>
              <button v-if="!readOnly" type="button" class="text-button" @click="addProducedSample(index)">Add sample</button>
            </header>
            <p v-if="!activity.produced_samples?.length" class="subsection-empty">No produced samples recorded.</p>
            <div v-else class="repeater-list">
              <article v-for="(sample, sampleIndex) in activity.produced_samples" :key="`sample-${sampleIndex}`" class="repeater-item">
                <div class="activity-grid">
                  <label>
                    <span>Sample @id</span>
                    <input
                      type="text"
                      :value="sample?.['@id'] || ''"
                      :readonly="readOnly"
                      @input="updateProducedSampleField(index, sampleIndex, '@id', $event.target.value)"
                    />
                  </label>
                  <label>
                    <span>Label</span>
                    <input
                      type="text"
                      :value="sample?.label || ''"
                      :readonly="readOnly"
                      @input="updateProducedSampleField(index, sampleIndex, 'label', $event.target.value)"
                    />
                  </label>
                  <label>
                    <span>Volume</span>
                    <input
                      type="text"
                      :value="sample?.volume || ''"
                      :readonly="readOnly"
                      @input="updateProducedSampleField(index, sampleIndex, 'volume', $event.target.value)"
                    />
                  </label>
                  <label>
                    <span>Record ref</span>
                    <input
                      type="text"
                      :value="sample?.record_ref || ''"
                      :readonly="readOnly"
                      @input="updateProducedSampleField(index, sampleIndex, 'record_ref', $event.target.value)"
                    />
                  </label>
                  <label>
                    <span>Material label</span>
                    <input
                      type="text"
                      :value="sample?.material?.label || ''"
                      :readonly="readOnly"
                      @input="updateProducedSampleField(index, sampleIndex, 'material.label', $event.target.value)"
                    />
                  </label>
                  <label>
                    <span>Material id</span>
                    <input
                      type="text"
                      :value="sample?.material?.id || ''"
                      :readonly="readOnly"
                      @input="updateProducedSampleField(index, sampleIndex, 'material.id', $event.target.value)"
                    />
                  </label>
                </div>
                <label>
                  <span>Notes</span>
                  <textarea
                    rows="2"
                    :value="sample?.notes || ''"
                    :readonly="readOnly"
                    @input="updateProducedSampleField(index, sampleIndex, 'notes', $event.target.value)"
                  ></textarea>
                </label>
                <button v-if="!readOnly" type="button" class="text-button danger" @click="removeProducedSample(index, sampleIndex)">
                  Remove sample
                </button>
              </article>
            </div>
          </div>

          <div class="subsection">
            <header class="subsection-header">
              <h6>Splits</h6>
              <button v-if="!readOnly" type="button" class="text-button" @click="addSampleSplit(index)">Add split</button>
            </header>
            <p v-if="!activity.splits?.length" class="subsection-empty">No splits recorded.</p>
            <div v-else class="repeater-list">
              <article v-for="(split, splitIndex) in activity.splits" :key="`split-${splitIndex}`" class="repeater-item">
                <div class="activity-grid">
                  <label>
                    <span>Sample @id</span>
                    <input
                      type="text"
                      :value="split?.sample?.['@id'] || ''"
                      :readonly="readOnly"
                      @input="updateSampleSplitField(index, splitIndex, 'sample.@id', $event.target.value)"
                    />
                  </label>
                  <label>
                    <span>Sample label</span>
                    <input
                      type="text"
                      :value="split?.sample?.label || ''"
                      :readonly="readOnly"
                      @input="updateSampleSplitField(index, splitIndex, 'sample.label', $event.target.value)"
                    />
                  </label>
                  <label>
                    <span>Fraction / volume</span>
                    <input
                      type="text"
                      :value="split?.fraction || ''"
                      :readonly="readOnly"
                      @input="updateSampleSplitField(index, splitIndex, 'fraction', $event.target.value)"
                    />
                  </label>
                </div>
                <button v-if="!readOnly" type="button" class="text-button danger" @click="removeSampleSplit(index, splitIndex)">
                  Remove split
                </button>
              </article>
            </div>
          </div>

          <div class="subsection">
            <header class="subsection-header">
              <h6>Files / attachments</h6>
              <button v-if="!readOnly" type="button" class="text-button" @click="addSampleFile(index)">Add file</button>
            </header>
            <p v-if="!activity.files?.length" class="subsection-empty">No files linked.</p>
            <div v-else class="repeater-list">
              <article v-for="(file, fileIndex) in activity.files" :key="`file-${fileIndex}`" class="repeater-item">
                <div class="activity-grid">
                  <label>
                    <span>Label</span>
                    <input
                      type="text"
                      :value="file?.label || ''"
                      :readonly="readOnly"
                      @input="updateSampleFileField(index, fileIndex, 'label', $event.target.value)"
                    />
                  </label>
                  <label>
                    <span>URI</span>
                    <input
                      type="text"
                      :value="file?.uri || ''"
                      :readonly="readOnly"
                      @input="updateSampleFileField(index, fileIndex, 'uri', $event.target.value)"
                    />
                  </label>
                </div>
                <button v-if="!readOnly" type="button" class="text-button danger" @click="removeSampleFile(index, fileIndex)">
                  Remove file
                </button>
              </article>
            </div>
          </div>
        </div>

        <label class="notes-field">
          <span>Notes</span>
          <textarea
            rows="2"
            :value="activity.notes || ''"
            :readonly="readOnly"
            @input="updateActivityField(index, 'notes', $event.target.value)"
          ></textarea>
        </label>
      </li>
    </ol>

    <p v-else class="activities-empty">No activities recorded yet.</p>
  </section>
</template>

<style scoped>
.run-activities-panel {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: flex-start;
}

.panel-actions__group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.run-context {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  background: #f8fafc;
  border-radius: 10px;
  padding: 0.75rem 1rem;
}

.run-context h4 {
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
  color: #0f172a;
}

.run-context dl {
  margin: 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 0.75rem;
  font-size: 0.9rem;
}

.run-context dt {
  color: #475569;
}

.run-context dd {
  margin: 0;
  color: #0f172a;
}

.activities-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.activity-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1rem;
  background: #fdfdfd;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.activity-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.activity-heading {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.activity-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: #e2e8f0;
  font-weight: 700;
  font-size: 0.85rem;
  color: #0f172a;
}

.activity-badge.kind-protocol_segment {
  background: #d9f99d;
}

.activity-badge.kind-acquisition {
  background: #bfdbfe;
}

.activity-badge.kind-sample_operation {
  background: #fecdd3;
}

.activity-subtitle {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
  color: #64748b;
}

.activity-controls {
  display: flex;
  gap: 0.75rem;
}

.activity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.activity-grid label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #475569;
}

.activity-grid input,
.activity-grid select,
.notes-field textarea {
  width: 100%;
  padding: 0.5rem;
  border-radius: 8px;
  border: 1px solid #cbd5f5;
  font-size: 0.9rem;
}

.activity-subpanel {
  border-top: 1px solid #e2e8f0;
  padding-top: 0.75rem;
}

.activity-subpanel h5 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
  color: #0f172a;
}

.activity-meta {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: #475569;
}

.notes-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: #475569;
}

.activities-empty {
  margin: 0;
  font-size: 0.9rem;
  color: #94a3b8;
}

.subsection {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.subsection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.subsection-header h6 {
  margin: 0;
  font-size: 0.85rem;
  color: #0f172a;
}

.subsection-empty {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.repeater-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.repeater-item {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.75rem;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.text-button.danger {
  color: #b91c1c;
}
</style>
