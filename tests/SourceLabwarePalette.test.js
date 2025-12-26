import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SourceLabwarePalette from '../src/run-editor/components/SourceLabwarePalette.vue'

describe('SourceLabwarePalette', () => {
  const sources = [
    { labwareId: 'labware:RES', label: 'Reservoir A', kind: 'reservoir', type: 'template' },
    { labwareId: 'plate/SRC', label: 'Source run plate', kind: 'plate', type: 'run-derived' }
  ]
  const statuses = {
    'plate/SRC': { loading: false, error: 'Replay failed' }
  }

  it('emits select when radio changes', async () => {
    const wrapper = mount(SourceLabwarePalette, {
      props: { sources, activeSourceId: 'labware:RES' }
    })
    const radios = wrapper.findAll('input[type="radio"]')
    await radios[1].setValue(true)
    expect(wrapper.emitted().select[0][0]).toBe('plate/SRC')
  })

  it('shows run-derived status messages', () => {
    const wrapper = mount(SourceLabwarePalette, {
      props: { sources, statuses, activeSourceId: 'labware:RES' }
    })
    expect(wrapper.text()).toContain('Replay failed')
  })
})
