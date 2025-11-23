import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import OntologyTermView from './views/OntologyTermView.vue'

export const OntologyTermReference = Node.create({
  name: 'ontologyTermReference',

  inline: true,

  group: 'inline',

  atom: true,

  selectable: true,

  addAttributes() {
    return {
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-label') || '',
        renderHTML: (attributes) => ({
          'data-label': attributes.label || ''
        })
      },
      identifier: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-identifier') || '',
        renderHTML: (attributes) => ({
          'data-identifier': attributes.identifier || ''
        })
      },
      ontology: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-ontology') || '',
        renderHTML: (attributes) => ({
          'data-ontology': attributes.ontology || ''
        })
      },
      display: {
        default: 'inline',
        parseHTML: (element) => element.getAttribute('data-display') || 'inline',
        renderHTML: (attributes) => ({
          'data-display': attributes.display || 'inline'
        })
      },
      url: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-url') || '',
        renderHTML: (attributes) => ({
          'data-url': attributes.url || ''
        })
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="ontology-term-reference"]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'ontology-term-reference' }), 0]
  },

  addNodeView() {
    return VueNodeViewRenderer(OntologyTermView)
  },

  addCommands() {
    return {
      insertOntologyTerm:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes
          })
    }
  }
})
