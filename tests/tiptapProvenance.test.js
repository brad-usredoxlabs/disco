import { describe, it, expect } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import TipTapRecordEditor from '../src/tiptap/components/TipTapRecordEditor.vue'

function buildBundle() {
  return {
    recordSchemas: {
      study: {
        allOf: [{ $ref: './common.schema.yaml#/$defs/FAIRCommon' }],
        properties: {}
      },
      common: {
        $defs: {
          FAIRCommon: {
            properties: {
              title: { type: 'string' },
              keywords: { type: 'array', items: { type: 'string' } },
              '@id': { type: 'string', readOnly: true }
            }
          }
        }
      }
    }
  }
}

const dummyRepo = {
  readFile: async () => '',
  writeFile: async () => {}
}

function mountEditor(options = {}) {
  return shallowMount(TipTapRecordEditor, {
    props: {
      repo: dummyRepo,
      recordPath: '/tmp/record.md',
      recordType: 'study',
      schema: {},
      uiConfig: {},
      namingRule: {},
      validateRecord: () => ({ ok: true }),
      schemaBundle: buildBundle(),
      ...options
    }
  })
}

describe('TipTapRecordEditor provenance enforcement', () => {
  it('filters protected fields from updates', async () => {
    const wrapper = mountEditor()
    const vm = wrapper.vm
    vm.metadata = {
      id: 'ID-1',
      '@id': 'IRI',
      createdAt: '2024-01-01',
      provenance: []
    }

    // simulate doc update that tries to change protected fields
    vm.metadata = vm.mergeMetadata(vm.metadata, {
      '@id': 'NEW',
      createdAt: 'bad',
      title: 'ok'
    }).data

    expect(vm.metadata['@id']).toBe('IRI')
    expect(vm.metadata.createdAt).toBe('2024-01-01')
    expect(vm.metadata.title).toBe('ok')
  })

  it('appends provenance instead of overwriting', async () => {
    const wrapper = mountEditor()
    const vm = wrapper.vm
    vm.metadata = {
      provenance: [{ kind: 'create', at: '2024-01-01T00:00:00Z', by: 'user' }]
    }

    vm.metadata = vm.mergeMetadata(vm.metadata, {
      provenance: [{ kind: 'update', by: 'user2' }]
    }).data

    expect(vm.metadata.provenance).toHaveLength(2)
    expect(vm.metadata.provenance[0]).toMatchObject({ kind: 'create' })
    expect(vm.metadata.provenance[1]).toMatchObject({ kind: 'update', by: 'user2' })
  })
})
