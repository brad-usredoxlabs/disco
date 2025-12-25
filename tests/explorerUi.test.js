import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ExplorerShell from '../src/explorer/ExplorerShell.vue'
import { resolveLayoutIndex } from '../src/plate-editor/utils/layoutResolver.js'

const layoutIndex = resolveLayoutIndex({ kind: 'plate96', wellKeying: 'A01' })

const events = [
  {
    id: 'evt-1',
    event_type: 'transfer',
    timestamp: '2025-01-01T00:00:00Z',
    run: 'run/RUN-TEST',
    labware: [{ '@id': 'plate/PLT-0001', kind: 'plate' }],
    details: {
      type: 'transfer',
      source: { labware: { '@id': 'plate/PLT-0001', kind: 'plate' }, wells: { SRC1: {} } },
      target: { labware: { '@id': 'plate/PLT-0001', kind: 'plate' }, wells: { A01: { well: 'A01' } } },
      mapping: [{ source_well: 'SRC1', target_well: 'A01', volume: '10 uL' }],
      volume: '10 uL',
      material: { id: 'material:a', stock_concentration: '10 mM' }
    }
  },
  {
    id: 'evt-2',
    event_type: 'transfer',
    timestamp: '2025-01-01T00:05:00Z',
    run: 'run/RUN-TEST',
    labware: [{ '@id': 'plate/PLT-0001', kind: 'plate' }],
    details: {
      type: 'transfer',
      source: { labware: { '@id': 'plate/PLT-0001', kind: 'plate' }, wells: { A01: {} } },
      target: { labware: { '@id': 'plate/PLT-0001', kind: 'plate' }, wells: { B01: { well: 'B01' } } },
      mapping: [{ source_well: 'A01', target_well: 'B01', volume: '5 uL' }],
      volume: '5 uL'
    }
  }
]

test('Explorer overlays render and mapping preview updates on event click', async () => {
  const wrapper = mount(ExplorerShell, {
    props: {
      events,
      layoutIndex,
      labwareId: 'plate/PLT-0001'
    }
  })
  await nextTick()
  expect(wrapper.find('.legend').exists()).toBe(true)
  const laneBtn = wrapper.find('.lane__event')
  expect(laneBtn.exists()).toBe(true)
  await laneBtn.trigger('click')
  await nextTick()
  expect(wrapper.find('.mapping-preview').text()).toContain('A01')
  expect(wrapper.find('.plate-grid').exists()).toBe(true)
})
