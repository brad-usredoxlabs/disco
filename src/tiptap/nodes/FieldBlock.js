import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import FieldBlockView from './FieldBlockView.vue'

export const FieldBlock = Node.create({
  name: 'fieldBlock',

  group: 'block',

  atom: true,

  selectable: false,

  draggable: false,

  addAttributes() {
    return {
      fieldKey: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-field-key') || '',
        renderHTML: (attributes) => ({
          'data-field-key': attributes.fieldKey
        })
      },
      dataType: {
        default: 'string',
        parseHTML: (element) => element.getAttribute('data-data-type') || 'string',
        renderHTML: (attributes) => ({
          'data-data-type': attributes.dataType
        })
      },
      value: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-value') || '',
        renderHTML: (attributes) => ({
          'data-value': attributes.value ?? ''
        })
      },
      placeholder: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-placeholder') || '',
        renderHTML: (attributes) => ({
          'data-placeholder': attributes.placeholder || ''
        })
      },
      section: {
        default: 'metadata',
        parseHTML: (element) => element.getAttribute('data-section') || 'metadata',
        renderHTML: (attributes) => ({
          'data-section': attributes.section || 'metadata'
        })
      },
      enumOptions: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-enum-options') || null,
        renderHTML: (attributes) => ({
          'data-enum-options': attributes.enumOptions
        })
      },
      errors: {
        default: [],
        parseHTML: (element) => {
          try {
            return JSON.parse(element.getAttribute('data-errors') || '[]')
          } catch {
            return []
          }
        },
        renderHTML: (attributes) => ({
          'data-errors': JSON.stringify(attributes.errors || [])
        })
      },
      fieldType: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-field-type') || null,
        renderHTML: (attributes) => ({
          'data-field-type': attributes.fieldType
        })
      },
      vocab: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-vocab') || null,
        renderHTML: (attributes) => ({
          'data-vocab': attributes.vocab
        })
      },
      columns: {
        default: [],
        parseHTML: (element) => {
          try {
            return JSON.parse(element.getAttribute('data-columns') || '[]')
          } catch {
            return []
          }
        },
        renderHTML: (attributes) => ({
          'data-columns': JSON.stringify(attributes.columns || [])
        })
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-field-block]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-field-block': '' }), 0]
  },

  addNodeView() {
    return VueNodeViewRenderer(FieldBlockView)
  }
})
