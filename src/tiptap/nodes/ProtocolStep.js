import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import ProtocolStepView from './ProtocolStepView.vue'

export const ProtocolStep = Node.create({
  name: 'protocolStep',

  group: 'block',

  atom: true,

  draggable: true,

  selectable: true,

  addAttributes() {
    return {
      stepNumber: {
        default: 1,
        parseHTML: (element) => parseInt(element.getAttribute('data-step-number'), 10) || 1,
        renderHTML: (attributes) => ({
          'data-step-number': attributes.stepNumber
        })
      },
      name: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-name') || '',
        renderHTML: (attributes) => ({
          'data-name': attributes.name || ''
        })
      },
      description: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-description') || '',
        renderHTML: (attributes) => ({
          'data-description': attributes.description || ''
        })
      },
      duration: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-duration') || '',
        renderHTML: (attributes) => ({
          'data-duration': attributes.duration || ''
        })
      },
      inputs: {
        default: [],
        parseHTML: (element) => {
          try {
            return JSON.parse(element.getAttribute('data-inputs') || '[]')
          } catch {
            return []
          }
        },
        renderHTML: (attributes) => ({
          'data-inputs': JSON.stringify(attributes.inputs || [])
        })
      },
      equipment: {
        default: [],
        parseHTML: (element) => {
          try {
            return JSON.parse(element.getAttribute('data-equipment') || '[]')
          } catch {
            return []
          }
        },
        renderHTML: (attributes) => ({
          'data-equipment': JSON.stringify(attributes.equipment || [])
        })
      },
      acceptanceCriteria: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-acceptance-criteria') || '',
        renderHTML: (attributes) => ({
          'data-acceptance-criteria': attributes.acceptanceCriteria || ''
        })
      },
      validationErrors: {
        default: [],
        parseHTML: (element) => {
          try {
            return JSON.parse(element.getAttribute('data-validation-errors') || '[]')
          } catch {
            return []
          }
        },
        renderHTML: (attributes) => ({
          'data-validation-errors': JSON.stringify(attributes.validationErrors || [])
        })
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="protocol-step"]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'protocol-step' })]
  },

  addNodeView() {
    return VueNodeViewRenderer(ProtocolStepView)
  },

  addCommands() {
    return {
      insertProtocolStep:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes
          })
    }
  }
})
